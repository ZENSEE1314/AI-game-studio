import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SystemService, SystemStatus } from '../system/system.module';
import { ALLOW_IN_MAINTENANCE, IS_PUBLIC, PERMISSIONS } from '../common/decorators';
import { PermissionCode, ROLE_PERMISSIONS } from '../common/permissions';

/** Authenticates the bearer token and re-validates session + hierarchy status on EVERY request. */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private reflector: Reflector, private jwt: JwtService, private prisma: PrismaService) {}

  async canActivate(ctx: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [ctx.getHandler(), ctx.getClass()]);
    const req = ctx.switchToHttp().getRequest();
    const header: string | undefined = req.headers['authorization'];
    const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
    if (!token) {
      if (isPublic) return true;
      throw new UnauthorizedException();
    }
    let payload: { sub: string; sid: string };
    try { payload = await this.jwt.verifyAsync(token); }
    catch { if (isPublic) return true; throw new UnauthorizedException(); }

    const session = await this.prisma.userSession.findUnique({ where: { id: payload.sid } });
    if (!session || session.revokedAt || session.expiresAt < new Date() || session.userId !== payload.sub) {
      if (isPublic) return true;
      throw new UnauthorizedException('Session revoked');
    }
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub }, select: { id: true, username: true, role: true, mustChangePassword: true, totpEnabled: true },
    });
    // Counts self (depth 0) and every ancestor: any suspended node blocks access.
    const blocked = await this.prisma.accountHierarchy.count({
      where: { descendantId: payload.sub, ancestor: { status: 'SUSPENDED' } },
    });
    if (!user || blocked > 0) {
      if (isPublic) return true;
      throw new ForbiddenException('Account suspended');
    }
    req.user = { id: user.id, username: user.username, role: user.role, sessionId: payload.sid };
    // Until these are resolved, only /auth/* (change password, 2FA setup, me, logout) works. Enforced here, not in the UI.
    const onAuthRoute = /^\/api\/v1\/auth\//.test(req.path ?? req.url ?? '');
    if (!onAuthRoute) {
      if (user.mustChangePassword) throw new ForbiddenException({ code: 'PASSWORD_CHANGE_REQUIRED', message: 'You must change your temporary password first' });
      if (user.role === 'SUPER_ADMIN' && process.env.REQUIRE_ADMIN_2FA === 'true' && !user.totpEnabled) {
        throw new ForbiddenException({ code: 'TWO_FACTOR_REQUIRED', message: 'Two-factor authentication must be enabled for administrators' });
      }
    }
    return true;
  }
}

/** Application-wide maintenance: only SUPER_ADMIN keeps access; separate from account suspension. */
@Injectable()
export class MaintenanceGuard implements CanActivate {
  constructor(private reflector: Reflector, private system: SystemService) {}

  async canActivate(ctx: ExecutionContext) {
    if (this.reflector.getAllAndOverride<boolean>(ALLOW_IN_MAINTENANCE, [ctx.getHandler(), ctx.getClass()])) return true;
    const user = ctx.switchToHttp().getRequest().user;
    if (user?.role === Role.SUPER_ADMIN) return true;
    const { status, message } = await this.system.getStatus();
    if (status !== SystemStatus.ACTIVE) {
      throw new ForbiddenException({ code: `APP_${status}`, message: message ?? 'Application is unavailable' });
    }
    return true;
  }
}

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(ctx: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [ctx.getHandler(), ctx.getClass()]);
    const required = this.reflector.getAllAndOverride<PermissionCode[]>(PERMISSIONS, [ctx.getHandler(), ctx.getClass()]);
    const user = ctx.switchToHttp().getRequest().user;
    if (!user && isPublic) return true;
    if (!user) throw new UnauthorizedException();
    if (!required?.length) return true;
    const granted = ROLE_PERMISSIONS[user.role as Role];
    if (!required.every((p) => granted.includes(p))) throw new ForbiddenException('Insufficient permissions');
    return true;
  }
}
