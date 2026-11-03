import { Role } from '@prisma/client';

export type PermissionCode =
  | 'accounts:read' | 'accounts:create' | 'accounts:suspend'
  | 'accounting:read' | 'accounting:write' | 'accounting:approve' | 'game:play' | 'game:manage' | 'wallet:read' | 'wallet:grant' | 'audit:read' | 'system:read' | 'system:manage' | 'users:assist';

const ALL: PermissionCode[] = [
  'accounts:read', 'accounts:create', 'accounts:suspend',
  'accounting:read', 'accounting:write', 'accounting:approve', 'game:manage', 'wallet:grant', 'audit:read', 'system:read', 'system:manage', 'users:assist',
];

/** Source of truth; seeded into roles/permissions/role_permissions. */
export const ROLE_PERMISSIONS: Record<Role, PermissionCode[]> = {
  SUPER_ADMIN: ALL,
  AGENCY: ['accounts:read', 'accounts:create', 'system:read', 'game:play', 'wallet:read'],
  AGENT: ['accounts:read', 'accounts:create', 'system:read', 'game:play', 'wallet:read'],
  STAFF: ['accounts:read', 'accounts:create', 'users:assist', 'system:read', 'game:play', 'wallet:read'],
  USER: ['system:read', 'game:play', 'wallet:read'],
};

export const ALL_PERMISSIONS: PermissionCode[] = Array.from(new Set([...ALL, ...Object.values(ROLE_PERMISSIONS).flat()]));
