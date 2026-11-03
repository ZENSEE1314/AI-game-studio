export const MIN_NUMBER = 1, MAX_NUMBER = 27, MAX_STAKE = 1_000_000_000;
export interface Pick { number: number; stake: number }

/** Validates a player's full set of picks for one round. Throws Error(message). */
export function validatePicks(picks: Pick[], minStake: number): Pick[] {
  if (!Array.isArray(picks)) throw new Error('picks must be a list');
  const seen = new Set<number>();
  for (const p of picks) {
    if (!Number.isInteger(p.number) || p.number < MIN_NUMBER || p.number > MAX_NUMBER) throw new Error(`Number must be a whole number from ${MIN_NUMBER} to ${MAX_NUMBER}`);
    if (seen.has(p.number)) throw new Error(`Number ${p.number} was selected twice`);
    seen.add(p.number);
    if (!Number.isSafeInteger(p.stake) || p.stake < minStake) throw new Error(`Each selected number needs at least ${minStake} credits`);
    if (p.stake > MAX_STAKE) throw new Error(`Maximum is ${MAX_STAKE} credits per number`);
  }
  return picks;
}
export const totalStake = (picks: Pick[]) => picks.reduce((a, p) => a + p.stake, 0);
