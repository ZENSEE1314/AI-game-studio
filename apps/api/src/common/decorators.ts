import { SetMetadata, createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PermissionCode } from './permissions';

export const IS_PUBLIC = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC, true);
/** Route stays reachable during MAINTENANCE for all roles (login, status, health). */
export const ALLOW_IN_MAINTENANCE = 'allowInMaintenance';
export const AllowInMaintenance = () => SetMetadata(ALLOW_IN_MAINTENANCE, true);
export const PERMISSIONS = 'permissions';
export const RequirePermissions = (...p: PermissionCode[]) => SetMetadata(PERMISSIONS, p);

export interface AuthUser {
  id: string;
  username: string;
  role: Role;
  sessionId: string;
}
export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): AuthUser => ctx.switchToHttp().getRequest().user,
);
