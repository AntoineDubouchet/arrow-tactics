import { roundGold, spendGold, type OwnedBuilding, type RunState } from './runState';

/**
 * Ameliorations PAR BATIMENT : chaque Mine et chaque Caserne a son propre
 * niveau (OwnedBuilding.level, interne, 0 = aucune amelioration), achete
 * depuis la fiche de CE batiment pendant la preparation. Ce n'est plus une
 * amelioration globale de la Forge : deux Mines peuvent avoir des niveaux
 * differents. Effets : run/mineUpgradeEffects.ts, run/barracksUpgradeEffects.ts.
 */

const UPGRADABLE_BUILDING_IDS: ReadonlySet<string> = new Set(['mine', 'barracks']);

/** Prix du premier niveau et croissance, repris de l'ancienne amelioration
 *  globale de la Forge (25, 50, 100... or), compte desormais par batiment. */
const BUILDING_UPGRADE_GOLD_COST_BASE = 25;
const BUILDING_UPGRADE_GOLD_COST_GROWTH = 2;

export function isUpgradableBuilding(buildingId: string): boolean {
  return UPGRADABLE_BUILDING_IDS.has(buildingId);
}

/** Niveau interne d'un batiment possede (absent = 0). */
export function ownedBuildingLevel(owned: Pick<OwnedBuilding, 'level'>): number {
  return owned.level ?? 0;
}

/** Prix de la prochaine amelioration d'un batiment de niveau `level`. */
export function buildingUpgradeGoldCost(level: number): number {
  return roundGold(BUILDING_UPGRADE_GOLD_COST_BASE * BUILDING_UPGRADE_GOLD_COST_GROWTH ** level);
}

export function canUpgradeOwnedBuilding(run: RunState, index: number): boolean {
  const owned = run.buildings[index];
  if (!owned || !isUpgradableBuilding(owned.buildingId)) return false;
  return run.gold >= buildingUpgradeGoldCost(ownedBuildingLevel(owned));
}

/** Achete un niveau pour le batiment `index` de la run : debite l'or et
 *  n'augmente que CE batiment. Faux si impossible (rien n'est modifie). */
export function upgradeOwnedBuilding(run: RunState, index: number): boolean {
  if (!canUpgradeOwnedBuilding(run, index)) return false;
  const owned = run.buildings[index]!;
  const level = ownedBuildingLevel(owned);
  if (!spendGold(run, buildingUpgradeGoldCost(level))) return false;
  owned.level = level + 1;
  return true;
}
