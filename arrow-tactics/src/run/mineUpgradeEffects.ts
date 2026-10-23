import { MINE_PRODUCTION } from '../data/mineUpgrade';

/**
 * Production EFFECTIVE d'une Mine selon son niveau propre (voir
 * data/mineUpgrade.ts) — ce module sait ce qu'est un niveau, main.ts ne
 * recoit que des nombres deja calcules.
 */

/** Tranche d'or (bornes incluses) produite a chaque production par une Mine
 *  de niveau interne `level` (0 = aucune amelioration). */
export function mineGoldRange(level: number): { min: number; max: number } {
  const step = level * MINE_PRODUCTION.rangeStepPerLevel;
  return { min: MINE_PRODUCTION.baseMinGold + step, max: MINE_PRODUCTION.baseMaxGold + step };
}

/** Montant d'une production, tire uniformement dans la tranche du niveau
 *  avec `random` (dans [0, 1[, RNG a graine fournie par l'appelant). */
export function rollMineGold(level: number, random: () => number): number {
  const { min, max } = mineGoldRange(level);
  return min + Math.floor(random() * (max - min + 1));
}

/** Secondes de bataille entre deux productions. */
export function mineProductionIntervalSeconds(): number {
  return MINE_PRODUCTION.intervalSeconds;
}

/** Productions au plus par Mine et par manche. */
export function mineMaxProductionsPerWave(): number {
  return MINE_PRODUCTION.maxProductionsPerWave;
}
