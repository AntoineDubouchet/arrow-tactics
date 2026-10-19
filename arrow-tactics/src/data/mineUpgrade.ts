/**
 * Production de la MINE. Chaque Mine produit de l'or a intervalle fixe
 * pendant une vraie bataille, un montant tire dans une tranche qui depend
 * de SON niveau : l'amelioration est propre a chaque Mine (voir
 * OwnedBuilding.level et run/buildingUpgrades.ts), elle n'est plus une
 * amelioration globale de la Forge.
 *
 * Niveau affiche 1 (interne 0) : 3 a 7 or ; chaque amelioration decale la
 * tranche de +2 / +2 (niveau 2 : 5 a 9, niveau 3 : 7 a 11...).
 */
export interface MineProductionDef {
  /** Secondes de bataille entre deux productions d'une meme Mine. */
  intervalSeconds: number;
  /** Bornes (incluses) de la tranche au niveau interne 0. */
  baseMinGold: number;
  baseMaxGold: number;
  /** Decalage des deux bornes par amelioration. */
  rangeStepPerLevel: number;
}

export const MINE_PRODUCTION: MineProductionDef = {
  intervalSeconds: 5,
  baseMinGold: 3,
  baseMaxGold: 7,
  rangeStepPerLevel: 2,
};
