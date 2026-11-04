import { Role } from '@prisma/client';

/** Required parent role for each role. SUPER_ADMIN is the root. */
export const PARENT_ROLE: Record<Role, Role | null> = {
  SUPER_ADMIN: null,
  AGENCY: Role.SUPER_ADMIN,
  AGENT: Role.AGENCY,
  STAFF: Role.AGENT,
  USER: Role.STAFF,
};

export const ROLE_RANK: Record<Role, number> = {
  SUPER_ADMIN: 0,
  AGENCY: 1,
  AGENT: 2,
  STAFF: 3,
  USER: 4,
};

/** Roles an actor may create (SUPER_ADMIN may create any non-root level). */
export function creatableRoles(actor: Role): Role[] {
  switch (actor) {
    case Role.SUPER_ADMIN: return [Role.AGENCY, Role.AGENT, Role.STAFF, Role.USER];
    case Role.AGENCY: return [Role.AGENT];
    case Role.AGENT: return [Role.STAFF];
    case Role.STAFF: return [Role.USER];
    default: return [];
  }
}

export interface ChainNode {
  id: string;
  role: Role;
  agencyId: string | null;
  agentId: string | null;
  staffId: string | null;
}

/** Denormalised ancestor ids for a new child of `parent`. */
export function deriveChain(parent: ChainNode) {
  return {
    agencyId: parent.role === Role.AGENCY ? parent.id : parent.agencyId,
    agentId: parent.role === Role.AGENT ? parent.id : parent.agentId,
    staffId: parent.role === Role.STAFF ? parent.id : parent.staffId,
  };
}

/** True when `parentRole` is the exact required parent of `childRole`. */
export function isValidParent(childRole: Role, parentRole: Role): boolean {
  return PARENT_ROLE[childRole] === parentRole;
}

/**
 * Rules for changing an account's level and/or parent (admin action).
 * Returns an error message, or null when allowed. `descendants` = accounts below the target.
 */
export function validateRoleChange(target: { id: string; role: Role }, newRole: Role, newParent: { id: string; role: Role } | null, descendants: number): string | null {
  if (target.role === Role.SUPER_ADMIN) return 'Administrators cannot be moved or changed here';
  if (newRole === Role.SUPER_ADMIN) return 'Cannot promote an account to Super Admin here; create an administrator instead';
  if (!newParent) return 'A new parent account is required';
  if (newParent.id === target.id) return 'An account cannot be its own parent';
  if (!isValidParent(newRole, newParent.role)) return `A ${newRole} must belong to a ${PARENT_ROLE[newRole]}`;
  if (descendants > 0) return `This account has ${descendants} account(s) below it. Move or remove them first`;
  return null;
}
