import { BootstrapService } from './bootstrap.service';

function make(existing: number) {
  const tx: any = { $executeRaw: jest.fn(), user: { count: jest.fn().mockResolvedValue(existing), create: jest.fn().mockResolvedValue({ id: 'u1' }) }, accountHierarchy: { create: jest.fn() } };
  const prisma: any = { user: { count: jest.fn().mockResolvedValue(existing) }, $transaction: jest.fn((fn: any) => fn(tx)) };
  return { svc: new BootstrapService(prisma, { log: jest.fn() } as any), tx };
}
const env = { BOOTSTRAP_ADMIN_USERNAME: 'boss', BOOTSTRAP_ADMIN_EMAIL: 'b@x.io', BOOTSTRAP_ADMIN_PASSWORD: 'a-long-password-1' } as any;

describe('BootstrapService', () => {
  it('does nothing when the variables are not set', async () => { const { svc, tx } = make(0); expect(await svc.run({} as any)).toBe('skipped'); expect(tx.user.create).not.toHaveBeenCalled(); });
  it('creates the first admin with a forced password change', async () => {
    const { svc, tx } = make(0); expect(await svc.run(env)).toBe('created');
    expect(tx.user.create.mock.calls[0][0].data).toMatchObject({ username: 'boss', role: 'SUPER_ADMIN', mustChangePassword: true });
    expect(tx.user.create.mock.calls[0][0].data.passwordHash).not.toContain('a-long-password');
  });
  it('never creates another admin when one already exists', async () => { const { svc, tx } = make(1); expect(await svc.run(env)).toBe('exists'); expect(tx.user.create).not.toHaveBeenCalled(); });
  it('rejects partial or weak settings', async () => {
    const { svc, tx } = make(0);
    expect(await svc.run({ BOOTSTRAP_ADMIN_USERNAME: 'boss' } as any)).toBe('incomplete');
    expect(await svc.run({ ...env, BOOTSTRAP_ADMIN_PASSWORD: 'short' })).toBe('invalid');
    expect(tx.user.create).not.toHaveBeenCalled();
  });
});
