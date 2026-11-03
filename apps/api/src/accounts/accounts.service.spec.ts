import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AccountsService } from './accounts.service';

const admin = { id: 'sa', role: Role.SUPER_ADMIN, username: 'sa', sessionId: 's' };
const agency = { id: 'ag', role: Role.AGENCY, username: 'ag', sessionId: 's' };

function setup(overrides: any = {}) {
  const tx: any = {
    accountHierarchy: { count: jest.fn().mockResolvedValue(3) },
    user: { update: jest.fn().mockResolvedValue({ id: 't', status: 'SUSPENDED' }) },
    userSession: { updateMany: jest.fn().mockResolvedValue({ count: 4 }) },
    accountStatusHistory: { create: jest.fn() },
  };
  const prisma: any = {
    user: { findFirst: jest.fn().mockResolvedValue({ id: 't', role: Role.AGENT, status: 'ACTIVE' }), ...overrides.user },
    accountHierarchy: { findFirst: jest.fn().mockResolvedValue(null), ...overrides.hier },
    $transaction: jest.fn((fn: any) => fn(tx)),
  };
  const audit: any = { log: jest.fn() };
  return { svc: new AccountsService(prisma, audit), prisma, tx, audit };
}

describe('AccountsService', () => {
  it('hides out-of-scope accounts as not found and scopes non-admin queries by ancestry', async () => {
    const { svc, prisma } = setup({ user: { findFirst: jest.fn().mockResolvedValue(null) } });
    await expect(svc.get(agency, 'x')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.user.findFirst.mock.calls[0][0].where).toMatchObject({
      descendantOf: { some: { ancestorId: 'ag', depth: { gt: 0 } } },
    });
  });

  it('super admin is unscoped', async () => {
    const { svc, prisma } = setup();
    await svc.get(admin, 't');
    expect(prisma.user.findFirst.mock.calls[0][0].where).toEqual({ id: 't' });
  });

  it('suspends, revokes subtree sessions, records history and audit atomically', async () => {
    const { svc, tx, audit } = setup();
    const r = await svc.suspend(admin, 't', 'policy violation');
    expect(r).toMatchObject({ affectedDescendants: 3, sessionsRevoked: 4 });
    expect(tx.userSession.updateMany.mock.calls[0][0].where.user.descendantOf.some).toEqual({ ancestorId: 't' });
    expect(tx.accountStatusHistory.create).toHaveBeenCalled();
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'ACCOUNT_SUSPENDED' }), tx);
  });

  it('refuses to suspend self or a super admin', async () => {
    const { svc } = setup({ user: { findFirst: jest.fn().mockResolvedValue({ id: 'sa', role: Role.SUPER_ADMIN, status: 'ACTIVE' }) } });
    await expect(svc.suspend(admin, 'sa', 'reasons')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('blocks reactivation while an ancestor is still suspended', async () => {
    const { svc, tx } = setup({
      user: { findFirst: jest.fn().mockResolvedValue({ id: 't', role: Role.USER, status: 'SUSPENDED' }) },
      hier: { findFirst: jest.fn().mockResolvedValue({ ancestor: { id: 'p', username: 'parent', role: Role.AGENCY } }) },
    });
    await expect(svc.reactivate(admin, 't', 'appeal ok')).rejects.toBeInstanceOf(ConflictException);
    expect(tx.user.update).not.toHaveBeenCalled();
  });

  it('reactivates when no ancestor is suspended', async () => {
    const { svc, tx } = setup({ user: { findFirst: jest.fn().mockResolvedValue({ id: 't', role: Role.USER, status: 'SUSPENDED' }) } });
    await svc.reactivate(admin, 't', 'appeal ok');
    expect(tx.user.update.mock.calls[0][0].data.status).toBe('ACTIVE');
  });
});
