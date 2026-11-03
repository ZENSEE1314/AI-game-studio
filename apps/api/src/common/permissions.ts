import { Role } from '@prisma/client';

export type PermissionCode =
  | 'accounts:read' | 'accounts:create' | 'accounts:suspend'
  | 'accounting:read' | 'accounting:write' | 'accounting:approve' | 'audit:read' | 'system:read' | 'system:manage' | 'users:assist';

const ALL: PermissionCode[] = [
  'accounts:read', 'accounts:create', 'accounts:suspend',
  'accounting:read', 'accounting:write', 'accounting:approve', 'audit:read', 'system:read', 'system:manage', 'users:assist',
];

/** Source of truth; seeded into roles/permissions/role_permissions. */
export const ROLE_PERMISSIONS: Record<Role, PermissionCode[]> = {
  SUPER_ADMIN: ALL,
  AGENCY: ['accounts:read', 'accounts:create', 'system:read'],
  AGENT: ['accounts:read', 'accounts:create', 'system:read'],
  STAFF: ['accounts:read', 'accounts:create', 'users:assist', 'system:read'],
  USER: ['system:read'],
};

export const ALL_PERMISSIONS = ALL;
