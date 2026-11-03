import { BadRequestException, ConflictException, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'crypto';
import { authenticator } from 'otplib';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { SystemService, SystemStatus } from '../system/system.module';
import { AccountsService } from '../accounts/accounts.service';

const REFRESH_TTL_MS = 30 * 24 * 3600 * 1000;
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
// Fixed hash so unknown usernames cost the same as wrong passwords (no user enumeration by timing).
const DUMMY_HASH = bcrypt.hashSync('dummy-password', 12);

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService, private jwt: JwtService, private audit: AuditService,
    private system: SystemService, private accounts: AccountsService,
  ) {}

  async register(dto: { username: string; email: string; password: string; fullName: string; phone?: string; staffUsername: string }, ip?: string) {
    const { status } = await this.system.getStatus();
    if (status !== SystemStatus.ACTIVE) throw new ForbiddenException('Registration unavailable');
    const staff = await this.prisma.user.findUnique({ where: { username: dto.staffUsername } });
    if (!staff || staff.role !== Role.STAFF) throw new BadRequestException('Invalid staff referral');
    const user = await this.accounts.createInternal(
      { id: staff.id, role: staff.role, username: staff.username, sessionId: '' },
      { role: Role.USER, parentId: staff.id, ...dto }, ip, 'USER_SELF_REGISTERED',
    );
    return user;
  }

  async login(dto: { username: string; password: string; totp?: string }, meta: { ip?: string; userAgent?: string }) {
    const user = await this.prisma.user.findUnique({ where: { username: dto.username } });
    const ok = await bcrypt.compare(dto.password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !ok) {
      await this.audit.log({ action: 'LOGIN_FAILED', entityType: 'user', entityId: user?.id, metadata: { username: dto.username }, ip: meta.ip });
      throw new UnauthorizedException('Invalid credentials');
    }
    const blocked = await this.prisma.accountHierarchy.count({
      where: { descendantId: user.id, ancestor: { status: 'SUSPENDED' } },
    });
    if (blocked > 0) throw new ForbiddenException('Account suspended');

    if (user.role !== Role.SUPER_ADMIN) {
      const { status, message } = await this.system.getStatus();
      if (status !== SystemStatus.ACTIVE) {
        throw new ForbiddenException({ code: `APP_${status}`, message: message ?? 'Application is unavailable' });
      }
    }
    if (user.totpEnabled) {
      if (!dto.totp || !authenticator.verify({ token: dto.totp, secret: user.totpSecret! })) {
        throw new UnauthorizedException('Two-factor code required or invalid');
      }
    }
    const tokens = await this.issue(user.id, user.role, meta);
    await this.prisma.user.update({ where: { id: user.id }, data: { lastLogin: new Date() } });
    await this.audit.log({ actorId: user.id, action: 'LOGIN', entityType: 'user', entityId: user.id, ip: meta.ip });
    return {
      ...tokens,
      twoFactorSetupRequired: user.role === Role.SUPER_ADMIN && !user.totpEnabled,
      user: { id: user.id, username: user.username, role: user.role, fullName: user.fullName },
    };
  }

  private async issue(userId: string, role: Role, meta: { ip?: string; userAgent?: string }, sessionId?: string) {
    const refreshToken = randomBytes(48).toString('base64url');
    const expiresAt = new Date(Date.now() + REFRESH_TTL_MS);
    const data = { refreshHash: sha(refreshToken), expiresAt, ip: meta.ip, userAgent: meta.userAgent?.slice(0, 255) };
    const session = sessionId
      ? await this.prisma.userSession.update({ where: { id: sessionId }, data })
      : await this.prisma.userSession.create({ data: { userId, ...data } });
    const accessToken = await this.jwt.signAsync({ sub: userId, sid: session.id, role });
    return { accessToken, refreshToken };
  }

  /** Rotating refresh. Reusing an old token (theft signal) finds no match and fails. */
  async refresh(refreshToken: string, meta: { ip?: string; userAgent?: string }) {
    const s = await this.prisma.userSession.findUnique({ where: { refreshHash: sha(refreshToken) }, include: { user: true } });
    if (!s || s.revokedAt || s.expiresAt < new Date()) throw new UnauthorizedException();
    const blocked = await this.prisma.accountHierarchy.count({
      where: { descendantId: s.userId, ancestor: { status: 'SUSPENDED' } },
    });
    if (blocked > 0) throw new ForbiddenException('Account suspended');
    return this.issue(s.userId, s.user.role, meta, s.id);
  }

  async profile(userId: string) {
    return this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { id: true, username: true, email: true, phone: true, fullName: true, role: true, status: true, lastLogin: true, createdAt: true, totpEnabled: true },
    });
  }

  async changePassword(userId: string, sessionId: string, current: string, next: string, ip?: string) {
    const u = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!(await bcrypt.compare(current, u.passwordHash))) throw new UnauthorizedException('Current password is incorrect');
    if (current === next) throw new BadRequestException('New password must differ from the current one');
    const passwordHash = await bcrypt.hash(next, 12);
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: userId }, data: { passwordHash } });
      // Every other device is signed out; this session continues.
      await tx.userSession.updateMany({ where: { userId, revokedAt: null, id: { not: sessionId } }, data: { revokedAt: new Date(), revokeReason: 'PASSWORD_CHANGED' } });
      await this.audit.log({ actorId: userId, action: 'PASSWORD_CHANGED', entityType: 'user', entityId: userId, ip }, tx);
    });
    return { changed: true };
  }

  async logout(sessionId: string) {
    await this.prisma.userSession.update({ where: { id: sessionId }, data: { revokedAt: new Date(), revokeReason: 'LOGOUT' } });
  }

  async twoFactorSetup(userId: string) {
    const u = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (u.role !== Role.SUPER_ADMIN) throw new ForbiddenException();
    if (u.totpEnabled) throw new ConflictException('Already enabled');
    const secret = authenticator.generateSecret();
    await this.prisma.user.update({ where: { id: userId }, data: { totpSecret: secret } });
    return { secret, otpauthUrl: authenticator.keyuri(u.username, 'MultiLevelPlatform', secret) };
  }

  async twoFactorEnable(userId: string, code: string) {
    const u = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!u.totpSecret || !authenticator.verify({ token: code, secret: u.totpSecret })) throw new BadRequestException('Invalid code');
    await this.prisma.user.update({ where: { id: userId }, data: { totpEnabled: true } });
    await this.audit.log({ actorId: userId, action: 'TWO_FACTOR_ENABLED', entityType: 'user', entityId: userId });
    return { enabled: true };
  }
}
