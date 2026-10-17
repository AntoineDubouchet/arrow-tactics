import { MINE_BASE_GOLD_PER_SECOND } from '../config/constants';
import { getBuilding } from '../data/buildings';
import { MINE_UPGRADE } from '../data/mineUpgrade';
import { runUpgradeLevel, type RunUpgradeLevels } from './runUpgrades';

/**
 * Amelioration permanente de la MINE (2026-08-14, voir data/mineUpgrade.ts)
 * — meme principe que run/ballistaUpgradeEffects.ts : ce module sait ce
 * qu'est un niveau d'amelioration, main.ts ne recoit que des nombres deja
 * calcules. Stockee dans la MEME MetaProgress.unitUpgrades que les autres
 * ameliorations (cle MINE_UPGRADE.id = 'mine'). Formule PUREMENT LINEAIRE,
 * sans palier (revu le 2026-08-14, voir data/mineUpgrade.ts).
 */

export function mineUpgradeLevel(levels: RunUpgradeLevels): number {
  return runUpgradeLevel(levels, MINE_UPGRADE.id);
}

/** Bonus d'or/seconde — ADDITIF depuis la base (level * goldPerSecondPerLevel),
 *  sans palier. */
export function mineGoldPerSecondBonus(level: number): number {
  return level * MINE_UPGRADE.goldPerSecondPerLevel;
}

/** Or/seconde EFFECTIF genere par la mine — base
 *  (MINE_BASE_GOLD_PER_SECOND) + bonus permanent. Utilisee UNIQUEMENT si le
 *  talent "Le temps, c'est de l'argent" est deverrouille (voir main.ts) —
 *  ce module ne sait pas ce qu'est un talent, il calcule juste le montant. */
export function effectiveMineGoldPerSecond(levels: RunUpgradeLevels): number {
  return MINE_BASE_GOLD_PER_SECOND + mineGoldPerSecondBonus(mineUpgradeLevel(levels));
}

/** Cout Gold EFFECTIF d'achat EN PARTIE (boutique de run) — base
 *  (`getBuilding('mine').cost`, 25) + niveau d'amelioration permanente x
 *  `goldCostPerLevel` (5) — 2026-08-18, demande explicite d'Antoine, meme
 *  motif exact que run/sentinelUpgradeEffects.ts, effectiveSentinelGoldCost.
 *  SOURCE UNIQUE : appelee a la fois par l'affichage boutique (ui/screens.ts)
 *  et la transaction reelle (main.ts, requestPlaceBuilding). */
export function effectiveMineGoldCost(levels: RunUpgradeLevels): number {
  const base = getBuilding('mine').cost ?? 0;
  return base + mineUpgradeLevel(levels) * MINE_UPGRADE.goldCostPerLevel;
}
