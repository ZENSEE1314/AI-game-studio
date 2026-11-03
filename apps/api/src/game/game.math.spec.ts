import { totalStake, validatePicks } from './game.math';

describe('validatePicks', () => {
  const ok = [{ number: 1, stake: 10000 }, { number: 27, stake: 25000 }];
  it('accepts valid picks and totals them', () => { expect(validatePicks(ok, 10000)).toHaveLength(2); expect(totalStake(ok)).toBe(35000); });
  it('accepts an empty set (clears picks)', () => expect(validatePicks([], 10000)).toEqual([]));
  it('rejects numbers outside 1-27', () => { for (const n of [0, 28, -1, 1.5, NaN]) expect(() => validatePicks([{ number: n, stake: 10000 }], 10000)).toThrow(/1 to 27/); });
  it('rejects duplicates', () => expect(() => validatePicks([{ number: 5, stake: 10000 }, { number: 5, stake: 10000 }], 10000)).toThrow(/twice/));
  it('enforces the minimum per number', () => expect(() => validatePicks([{ number: 5, stake: 9999 }], 10000)).toThrow(/at least 10000/));
  it('rejects fractional and unsafe stakes', () => {
    expect(() => validatePicks([{ number: 5, stake: 10000.5 }], 10000)).toThrow();
    expect(() => validatePicks([{ number: 5, stake: 2e9 }], 10000)).toThrow(/Maximum/);
  });
});
