import { BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, Injectable, Module, NotFoundException, Param, ParseUUIDPipe, Post, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import * as bcrypt from 'bcryptjs';
import { Prisma, Role } from '@prisma/client';
import { IsEmail, IsString, Length, Matches, MinLength } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuthUser, CurrentUser, RequirePermissions } from '../common/decorators';

export class CreateAdminDto {
  @Matches(/^[a-zA-Z0-9_.-]{3,32}$/) username: string;
  @IsEmail() email: string;
  @IsString() @Length(1, 120) fullName: string;
  /** Temporary password; the new admin must change it before doing anything else. */
  @IsString() @MinLength(12) temporaryPassword: string;
  /** The acting admin's own password: re-authentication for a sensitive action. */
  @IsString() @MinLength(1) currentPassword: string;
}
export class AdminActionDto {
  @IsString() @Length(5, 500) reason: string;
  @IsString() @MinLength(1) currentPassword: string;
}

const SELECT = { id: true, username: true, email: true, fullName: true, status: true, totpEnabled: true, mustChangePassword: true, lastLogin: true, createdAt: true, suspensionReason: true, suspendedAt: true } satisfies Prisma.UserSelect;

@Injectable()
export class AdminsService {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  list() { return this.prisma.user.findMany({ where: { role: Role.SUPER_ADMIN }, select: SELECT, orderBy: { createdAt: 'asc' } }); }

  private async reauth(actor: AuthUser, password: string) {
    const me = await this.prisma.user.findUniqueOrThrow({ where: { id: actor.id } });
    if (!(await bcrypt.compare(password, me.passwordHash))) throw new ForbiddenException({ code: 'REAUTH_FAILED', message: 'Your password is incorrect' }); // 403, not 401: the session itself is still valid
  }

  async create(actor: AuthUser, d: CreateAdminDto, ip?: string) {
    await this.reauth(actor, d.currentPassword);
    const passwordHash = await bcrypt.hash(d.temporaryPassword, 12);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const u = await tx.user.create({ data: { username: d.username, email: d.email.toLowerCase(), fullName: d.fullName, passwordHash, role: Role.SUPER_ADMIN, mustChangePassword: true }, select: SELECT });
        await tx.accountHierarchy.create({ data: { ancestorId: u.id, descendantId: u.id, depth: 0 } });
        await this.audit.log({ actorId: actor.id, action: 'ADMIN_CREATED', entityType: 'user', entityId: u.id, metadata: { username: d.username }, ip }, tx);
        return u;
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ConflictException('Username or email already in use');
      throw e;
    }
  }

  async suspend(actor: AuthUser, id: string, d: AdminActionDto, ip?: string) {
    await this.reauth(actor, d.currentPassword);
    if (id === actor.id) throw new ForbiddenException('You cannot suspend your own account');
    return this.prisma.$transaction(async (tx) => {
      // Serialise admin changes so two admins cannot suspend each other at the same moment and leave nobody.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(727002)`;
      const t = await tx.user.findFirst({ where: { id, role: Role.SUPER_ADMIN } });
      if (!t) throw new NotFoundException('Administrator not found');
      if (t.status === 'SUSPENDED') throw new ConflictException('Already suspended');
      const others = await tx.user.count({ where: { role: Role.SUPER_ADMIN, status: 'ACTIVE', id: { not: id } } });
      if (others < 1) throw new ConflictException('Cannot suspend the last active administrator');
      const u = await tx.user.update({ where: { id }, data: { status: 'SUSPENDED', suspendedAt: new Date(), suspensionReason: d.reason, suspendedById: actor.id }, select: SELECT });
      const revoked = await tx.userSession.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date(), revokeReason: 'ACCOUNT_SUSPENDED' } });
      await tx.accountStatusHistory.create({ data: { userId: id, fromStatus: 'ACTIVE', toStatus: 'SUSPENDED', reason: d.reason, changedById: actor.id, affectedCount: 0 } });
      await this.audit.log({ actorId: actor.id, action: 'ADMIN_SUSPENDED', entityType: 'user', entityId: id, metadata: { reason: d.reason, sessionsRevoked: revoked.count }, ip }, tx);
      return u;
    });
  }

  async reactivate(actor: AuthUser, id: string, d: AdminActionDto, ip?: string) {
    await this.reauth(actor, d.currentPassword);
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(727002)`;
      const t = await tx.user.findFirst({ where: { id, role: Role.SUPER_ADMIN } });
      if (!t) throw new NotFoundException('Administrator not found');
      if (t.status !== 'SUSPENDED') throw new ConflictException('Not suspended');
      const u = await tx.user.update({ where: { id }, data: { status: 'ACTIVE', suspendedAt: null, suspensionReason: null, suspendedById: null }, select: SELECT });
      await tx.accountStatusHistory.create({ data: { userId: id, fromStatus: 'SUSPENDED', toStatus: 'ACTIVE', reason: d.reason, changedById: actor.id, affectedCount: 0 } });
      await this.audit.log({ actorId: actor.id, action: 'ADMIN_REACTIVATED', entityType: 'user', entityId: id, metadata: { reason: d.reason }, ip }, tx);
      return u;
    });
  }
}

@Controller('admins')
export class AdminsController {
  constructor(private readonly svc: AdminsService) {}
  @Get() @RequirePermissions('admins:manage') list() { return this.svc.list(); }
  @Post() @RequirePermissions('admins:manage') @Throttle({ default: { limit: Number(process.env.ADMIN_RATE_LIMIT ?? 5), ttl: 60_000 } })
  create(@CurrentUser() u: AuthUser, @Body() d: CreateAdminDto, @Req() req: any) { return this.svc.create(u, d, req.ip); }
  @Post(':id/suspend') @RequirePermissions('admins:manage') @Throttle({ default: { limit: Number(process.env.ADMIN_RATE_LIMIT ?? 10), ttl: 60_000 } })
  suspend(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() d: AdminActionDto, @Req() req: any) { return this.svc.suspend(u, id, d, req.ip); }
  @Post(':id/reactivate') @RequirePermissions('admins:manage') @Throttle({ default: { limit: Number(process.env.ADMIN_RATE_LIMIT ?? 10), ttl: 60_000 } })
  reactivate(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() d: AdminActionDto, @Req() req: any) { return this.svc.reactivate(u, id, d, req.ip); }
}

@Module({ providers: [AdminsService], controllers: [AdminsController] })
export class AdminsModule {}
