import type { RuneCostDef } from './unitUpgrades';

/**
 * Amelioration permanente de la CASERNE (2026-08-17, demande d'Antoine) —
 * meme famille de systeme que data/ballistaUpgrade.ts/data/mineUpgrade.ts
 * (RuneCostDef, premier achat -> prix double a chaque achat suivant).
 *
 * REFONTE le meme jour (retour d'Antoine apres un premier test) : deux
 * effets desormais combines par niveau, plutot qu'un seul levier
 * "intervalle" —
 *  - `countPerLevel` : CHAQUE achat ajoute ce nombre de Fantassins produits
 *    PAR PRODUCTION (base 1 Fantassin -> 2 au niveau 1, 3 au niveau 2...).
 *  - `intervalReductionPerMilestone`/`intervalEveryLevels` : TOUS LES
 *    `intervalEveryLevels` achats (pas chaque achat), l'intervalle diminue
 *    de ce nombre de secondes, jamais sous `BuildingDef.spawner.minIntervalSeconds`
 *    (1s, voir data/buildings.ts) — meme principe de "palier" deja utilise
 *    par Baliste (degats)/Nova de glace/Sentinelle (bouclier), applique ici
 *    a l'intervalle plutot qu'a une seconde stat.
 *
 * PAS de `maxLevel` (contrairement a l'ancienne version) : le bonus de
 * NOMBRE de Fantassins reste utile a tout niveau, meme une fois le plancher
 * d'intervalle atteint — l'ancien plafond (8) n'avait de sens que quand
 * l'intervalle etait le SEUL levier d'amelioration.
 */
export interface BarracksUpgradeDef extends RuneCostDef {
  id: 'barracks';
  /** +N Fantassin(s) produits PAR ACHAT, ADDITIF depuis la base (1) —
   *  s'applique a CHAQUE niveau, voir run/barracksUpgradeEffects.ts,
   *  effectiveBarracksSpawnCount. */
  countPerLevel: number;
  /** -N secondes d'intervalle, appliquees seulement TOUS LES
   *  `intervalEveryLevels` achats (pas a chaque achat, contrairement a
   *  countPerLevel) — voir effectiveBarracksSpawnInterval. */
  intervalReductionPerMilestone: number;
  intervalEveryLevels: number;
}

export const BARRACKS_UPGRADE: BarracksUpgradeDef = {
  id: 'barracks',
  // Meme point de depart que toutes les autres ameliorations permanentes de
  // ce jeu (10 runes, regle permanente confirmee par Antoine le 2026-08-14 :
  // "de toute manière quand tu ajoutes un truc dans la boutique
  // d'amélioration, fais-le commencer à 10").
  baseRuneCost: 10,
  costMultiplier: 2,
  countPerLevel: 1,
  intervalReductionPerMilestone: 1,
  intervalEveryLevels: 3,
};
