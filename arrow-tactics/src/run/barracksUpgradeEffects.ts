import { BARRACKS_UPGRADE } from '../data/barracksUpgrade';
import { getBuilding } from '../data/buildings';
import { runUpgradeLevel, type RunUpgradeLevels } from './runUpgrades';

/**
 * Amelioration permanente de la CASERNE (2026-08-17, voir
 * data/barracksUpgrade.ts) — meme principe que run/ballistaUpgradeEffects.ts/
 * run/mineUpgradeEffects.ts : ce module sait ce qu'est un niveau
 * d'amelioration, main.ts ne recoit que des nombres deja calcules. Stockee
 * dans la MEME MetaProgress.unitUpgrades que les autres ameliorations (cle
 * BARRACKS_UPGRADE.id = 'barracks').
 */

export function barracksUpgradeLevel(levels: RunUpgradeLevels): number {
  return runUpgradeLevel(levels, BARRACKS_UPGRADE.id);
}

/** Nombre de Fantassins produits PAR PRODUCTION — base 1 + `level *
 *  countPerLevel` (voir data/barracksUpgrade.ts). Jamais plafonne : chaque
 *  achat reste utile, meme une fois le plancher d'intervalle atteint
 *  (voir effectiveBarracksSpawnInterval ci-dessous). */
export function effectiveBarracksSpawnCount(levels: RunUpgradeLevels): number {
  const level = barracksUpgradeLevel(levels);
  return 1 + level * BARRACKS_UPGRADE.countPerLevel;
}

/**
 * Intervalle de production EFFECTIF (secondes) — base
 * (BuildingDef.spawner.baseIntervalSeconds, 5s) moins UN PALIER de
 * reduction TOUS LES `intervalEveryLevels` achats (3, pas a chaque achat —
 * voir data/barracksUpgrade.ts), jamais en dessous de
 * `BuildingDef.spawner.minIntervalSeconds` (1s) — demande explicite
 * d'Antoine, 2026-08-17 (refonte le meme jour que l'introduction du bonus
 * de nombre ci-dessus) : "toutes les 3 amélioration réduit le délai
 * d'invocation de 1sec (ne peut pas descendre en dessous de 1 seconde)".
 * Leve si la Caserne n'a pas (encore) de configuration `spawner` — ne
 * devrait jamais arriver (garde-fou plutot qu'un repli silencieux sur une
 * valeur arbitraire).
 */
export function effectiveBarracksSpawnInterval(levels: RunUpgradeLevels): number {
  const spawner = getBuilding('barracks').spawner;
  if (!spawner) throw new Error('La Caserne doit avoir une configuration spawner.');
  const level = barracksUpgradeLevel(levels);
  const milestones = Math.floor(level / BARRACKS_UPGRADE.intervalEveryLevels);
  const reduced = spawner.baseIntervalSeconds - milestones * BARRACKS_UPGRADE.intervalReductionPerMilestone;
  return Math.max(spawner.minIntervalSeconds, reduced);
}

/** Achats restants avant le PROCHAIN palier de reduction d'intervalle —
 *  couvre nativement le cas `level % N === 0` -> N (meme formule deja
 *  etablie par run/unitUpgradeEffects.ts, upgradeRemainingUntilAttackBonus). */
export function barracksRemainingUntilIntervalMilestone(level: number): number {
  return BARRACKS_UPGRADE.intervalEveryLevels - (level % BARRACKS_UPGRADE.intervalEveryLevels);
}

/** Vrai si le TOUT PROCHAIN achat (level + 1) declenche un palier de
 *  reduction d'intervalle — sert a l'UI pour mettre en avant un achat
 *  "important" (meme convention que Baliste/Nova de glace/Sentinelle). */
export function barracksNextPurchaseGrantsIntervalMilestone(level: number): boolean {
  return (level + 1) % BARRACKS_UPGRADE.intervalEveryLevels === 0;
}

/** Cout Gold EFFECTIF d'achat EN PARTIE (boutique de run) — base
 *  (`getBuilding('barracks').cost`, 50) + niveau d'amelioration permanente x
 *  `goldCostPerLevel` (5) — 2026-08-18, demande explicite d'Antoine, meme
 *  motif exact que run/sentinelUpgradeEffects.ts, effectiveSentinelGoldCost/
 *  run/mineUpgradeEffects.ts, effectiveMineGoldCost. SOURCE UNIQUE : appelee
 *  a la fois par l'affichage boutique (ui/screens.ts) et la transaction
 *  reelle (main.ts, requestPlaceBuilding). */
export function effectiveBarracksGoldCost(levels: RunUpgradeLevels): number {
  const base = getBuilding('barracks').cost ?? 0;
  return base + barracksUpgradeLevel(levels) * BARRACKS_UPGRADE.goldCostPerLevel;
}
