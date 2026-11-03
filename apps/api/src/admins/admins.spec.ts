import { ConflictException, ForbiddenException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { AdminsService } from './admins.module';

function setup(otherActiveAdmins: number) {
  const hash = bcrypt.hashSync('actor-password', 4);
  const tx: any = {
    $executeRaw: jest.fn(), user: { findFirst: jest.fn().mockResolvedValue({ id: 't', status: 'ACTIVE' }), count: jest.fn().mockResolvedValue(otherActiveAdmins), update: jest.fn().mockResolvedValue({ id: 't' }) },
    userSession: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) }, accountStatusHistory: { create: jest.fn() },
  };
  const prisma: any = { user: { findUniqueOrThrow: jest.fn().mockResolvedValue({ passwordHash: hash }) }, $transaction: jest.fn((fn: any) => fn(tx)) };
  return { svc: new AdminsService(prisma, { log: jest.fn() } as any), tx };
}
const actor = { id: 'a', role: 'SUPER_ADMIN' as any, username: 'a', sessionId: 's' };
const dto = { reason: 'security review', currentPassword: 'actor-password' };

describe('AdminsService.suspend', () => {
  it('refuses to suspend the last active administrator', async () => {
    const { svc, tx } = setup(0);
    await expect(svc.suspend(actor, 't', dto)).rejects.toBeInstanceOf(ConflictException);
    expect(tx.user.update).not.toHaveBeenCalled();
  });
  it('refuses self-suspension', async () => {
    const { svc } = setup(3);
    await expect(svc.suspend(actor, 'a', dto)).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('requires the acting admin password', async () => {
    const { svc } = setup(3);
    await expect(svc.suspend(actor, 't', { ...dto, currentPassword: 'wrong' })).rejects.toThrow(/password is incorrect/);
  });
  it('suspends, revokes sessions and records history when another admin remains', async () => {
    const { svc, tx } = setup(1);
    await svc.suspend(actor, 't', dto);
    expect(tx.user.update).toHaveBeenCalled();
    expect(tx.userSession.updateMany).toHaveBeenCalled();
    expect(tx.accountStatusHistory.create).toHaveBeenCalled();
  });
});
