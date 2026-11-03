import { Role } from '@prisma/client';
import { creatableRoles, deriveChain, isValidParent, PARENT_ROLE } from './hierarchy';
import { ROLE_PERMISSIONS } from './permissions';

describe('hierarchy', () => {
  it('enforces the five-level parent chain', () => {
    expect(isValidParent(Role.AGENCY, Role.SUPER_ADMIN)).toBe(true);
    expect(isValidParent(Role.AGENT, Role.AGENCY)).toBe(true);
    expect(isValidParent(Role.STAFF, Role.AGENT)).toBe(true);
    expect(isValidParent(Role.USER, Role.STAFF)).toBe(true);
    expect(isValidParent(Role.USER, Role.AGENT)).toBe(false);
    expect(isValidParent(Role.AGENT, Role.SUPER_ADMIN)).toBe(false);
    expect(PARENT_ROLE.SUPER_ADMIN).toBeNull();
  });
  it('limits what each role can create', () => {
    expect(creatableRoles(Role.AGENCY)).toEqual([Role.AGENT]);
    expect(creatableRoles(Role.AGENT)).toEqual([Role.STAFF]);
    expect(creatableRoles(Role.USER)).toEqual([]);
    expect(creatableRoles(Role.SUPER_ADMIN)).not.toContain(Role.SUPER_ADMIN);
  });
  it('derives denormalised ancestors', () => {
    const staff = { id: 's', role: Role.STAFF, agencyId: 'a1', agentId: 'g1', staffId: null };
    expect(deriveChain(staff)).toEqual({ agencyId: 'a1', agentId: 'g1', staffId: 's' });
    const agency = { id: 'a', role: Role.AGENCY, agencyId: null, agentId: null, staffId: null };
    expect(deriveChain(agency)).toEqual({ agencyId: 'a', agentId: null, staffId: null });
  });
  it('only SUPER_ADMIN can suspend, manage system or read audit', () => {
    for (const r of [Role.AGENCY, Role.AGENT, Role.STAFF, Role.USER]) {
      expect(ROLE_PERMISSIONS[r]).not.toContain('accounts:suspend');
      expect(ROLE_PERMISSIONS[r]).not.toContain('system:manage');
      expect(ROLE_PERMISSIONS[r]).not.toContain('audit:read');
    }
    expect(ROLE_PERMISSIONS.USER).not.toContain('accounts:read');
  });
});

import { validateRoleChange } from './hierarchy';
describe('validateRoleChange', () => {
  const user = { id: 'u', role: Role.USER };
  it('allows moving a leaf under a valid parent', () => expect(validateRoleChange(user, Role.USER, { id: 's2', role: Role.STAFF }, 0)).toBeNull());
  it('allows promoting a leaf to the next level under the right parent', () => expect(validateRoleChange(user, Role.STAFF, { id: 'a', role: Role.AGENT }, 0)).toBeNull());
  it('rejects a parent of the wrong level', () => expect(validateRoleChange(user, Role.STAFF, { id: 's', role: Role.STAFF }, 0)).toMatch(/must belong to a AGENT/));
  it('rejects accounts that still have accounts below them', () => expect(validateRoleChange({ id: 's', role: Role.STAFF }, Role.USER, { id: 's2', role: Role.STAFF }, 3)).toMatch(/3 account/));
  it('never touches or creates administrators', () => {
    expect(validateRoleChange({ id: 'x', role: Role.SUPER_ADMIN }, Role.USER, { id: 's', role: Role.STAFF }, 0)).toMatch(/Administrators/);
    expect(validateRoleChange(user, Role.SUPER_ADMIN, { id: 's', role: Role.STAFF }, 0)).toMatch(/Super Admin/);
  });
  it('requires a parent and forbids self-parenting', () => {
    expect(validateRoleChange(user, Role.USER, null, 0)).toMatch(/required/);
    expect(validateRoleChange(user, Role.USER, { id: 'u', role: Role.STAFF }, 0)).toMatch(/own parent/);
  });
});
