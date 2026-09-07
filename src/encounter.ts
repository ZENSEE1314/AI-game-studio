import type { Monster } from "./data";
export type Battle = {
  hp: number;
  energy: number;
  turn: number;
  running: boolean;
  message: string;
};
export function beginEncounter(monster: Monster): Battle {
  return {
    hp: monster.hp,
    energy: 100,
    turn: 0,
    running: true,
    message: monster.name + " appears. Earn its trust.",
  };
}
export function resolveTurn(battle: Battle, monster: Monster): Battle {
  if (!battle.running || battle.hp <= 0 || battle.energy <= 0) return battle;
  const hp = Math.max(0, battle.hp - 22);
  const energy =
    hp === 0 ? battle.energy : Math.max(0, battle.energy - monster.attack);
  return {
    hp,
    energy,
    turn: battle.turn + 1,
    running: hp > 0 && energy > 0,
    message:
      hp === 0
        ? monster.name + " trusts you! Added to your collection."
        : energy === 0
          ? "Your energy ran out. Rest and try again."
          : `You dealt 22 damage. ${monster.name} dealt ${monster.attack}.`,
  };
}
export function awardCompanion(collection: string[], id: string): string[] {
  return [...new Set([...collection, id])];
}
