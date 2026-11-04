import { newReferralCode } from './accounts.service';
describe('newReferralCode', () => {
  it('is 8 characters from the unambiguous alphabet', () => { for (let i = 0; i < 200; i++) expect(newReferralCode()).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/); });
  it('does not repeat in a reasonable sample', () => expect(new Set(Array.from({ length: 2000 }, newReferralCode)).size).toBe(2000));
});
