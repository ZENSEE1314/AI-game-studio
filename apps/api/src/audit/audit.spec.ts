import { computeAuditHash } from './audit.service';

describe('audit hash chain', () => {
  const e = { action: 'X', entityType: 'user', actorId: 'a' };
  it('is deterministic and depends on the previous hash', () => {
    const at = '2026-01-01T00:00:00.000Z';
    expect(computeAuditHash(null, e, at)).toBe(computeAuditHash(null, e, at));
    expect(computeAuditHash('p1', e, at)).not.toBe(computeAuditHash('p2', e, at));
  });
  it('detects tampering with entry content', () => {
    const at = '2026-01-01T00:00:00.000Z';
    expect(computeAuditHash('p', e, at)).not.toBe(computeAuditHash('p', { ...e, action: 'Y' }, at));
  });
});
