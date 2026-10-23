import { getBuilding } from '../data/buildings';
import { roundGold, spendGold, type OwnedBuilding, type RunState } from './runState';

/**
 * Ameliorations PAR BATIMENT : chaque Mine, Caserne et Tour a son propre
 * niveau (OwnedBuilding.level, interne, 0 = aucune amelioration), achete
 * depuis la fiche de CE batiment pendant la preparation. Ce n'est plus une
 * amelioration globale de la Forge : deux Mines peuvent avoir des niveaux
 * differents. Effets : run/mineUpgradeEffects.ts, run/barracksUpgradeEffects.ts,
 * run/buildingUpgradeEffects.ts (PV et degats de la Tour). Independant du
 * prix des ameliorations d'unites a la Forge.
 */

/** Croissance du prix : x2 a chaque niveau. Le prix du premier niveau est
 *  propre a chaque batiment (BuildingDef.upgradeGoldCostBase : Mine et
 *  Caserne 25, Tour 5). */
const BUILDING_UPGRADE_GOLD_COST_GROWTH = 2;

export function isUpgradableBuilding(buildingId: string): boolean {
  return getBuilding(buildingId).upgradeGoldCostBase !== undefined;
}

/** Niveau interne d'un batiment possede (absent = 0). */
export function ownedBuildingLevel(owned: Pick<OwnedBuilding, 'level'>): number {
  return owned.level ?? 0;
}

/** Prix de la prochaine amelioration d'un batiment `buildingId` de niveau
 *  `level` : base x 2^niveau (Tour : 5, 10, 20, 40...). */
export function buildingUpgradeGoldCost(buildingId: string, level: number): number {
  return roundGold((getBuilding(buildingId).upgradeGoldCostBase ?? 0) * BUILDING_UPGRADE_GOLD_COST_GROWTH ** level);
}

export function canUpgradeOwnedBuilding(run: RunState, index: number): boolean {
  const owned = run.buildings[index];
  if (!owned || !isUpgradableBuilding(owned.buildingId)) return false;
  return run.gold >= buildingUpgradeGoldCost(owned.buildingId, ownedBuildingLevel(owned));
}

/** Achete un niveau pour le batiment `index` de la run : debite l'or et
 *  n'augmente que CE batiment. Faux si impossible (rien n'est modifie). Un
 *  niveau qui augmente les PV max (BuildingDef.hpPerLevel, Tour) augmente
 *  aussi les PV actuels du meme ecart : les PV manquants restent les memes
 *  (convention deja appliquee aux PV max achetes a la Forge). */
export function upgradeOwnedBuilding(run: RunState, index: number): boolean {
  if (!canUpgradeOwnedBuilding(run, index)) return false;
  const owned = run.buildings[index]!;
  const level = ownedBuildingLevel(owned);
  if (!spendGold(run, buildingUpgradeGoldCost(owned.buildingId, level))) return false;
  owned.level = level + 1;
  owned.hp += getBuilding(owned.buildingId).hpPerLevel ?? 0;
  return true;
}
