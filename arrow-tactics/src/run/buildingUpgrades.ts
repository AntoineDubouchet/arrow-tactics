import { getBuilding } from '../data/buildings';
import { isBuildingBuilt, roundGold, spendGold, type OwnedBuilding, type RunState } from './runState';

/**
 * Ameliorations PAR BATIMENT : chaque Mine, Caserne, Tour, Eglise,
 * Sanctuaire et Ecurie a son propre niveau (OwnedBuilding.level, interne,
 * 0 = aucune amelioration), achete depuis la fiche de CE batiment en jeu
 * (producteurs : par la file de production, avec une duree ; les autres :
 * tout de suite). Ce n'est pas une amelioration globale de la Forge : deux
 * Mines peuvent avoir des niveaux differents. Effets :
 * run/mineUpgradeEffects.ts, run/buildingUpgradeEffects.ts (PV et degats de
 * la Tour), data/buildings.ts (RecruitmentUnlockConfig.minLevels : l'Homme
 * d'armes a la Caserne Niv. 2). Independant du prix des ameliorations
 * d'unites a la Forge. Le Camp d'archerie n'est plus ameliorable (2026-11-04,
 * son Niv. 2 n'avait plus d'effet ; a redefinir en Pass 2).
 */

/** Croissance du prix : x2 a chaque niveau. Le prix du premier niveau est
 *  propre a chaque batiment (BuildingDef.upgradeGoldCostBase : Mine 25,
 *  Caserne 20, Tour 5). */
const BUILDING_UPGRADE_GOLD_COST_GROWTH = 2;

export function isUpgradableBuilding(buildingId: string): boolean {
  return getBuilding(buildingId).upgradeGoldCostBase !== undefined;
}

/** Vrai quand le batiment a atteint BuildingDef.maxUpgradeLevel (Caserne,
 *  Sanctuaire, Ecurie : Niv. 2) ; jamais pour un batiment sans plafond. */
export function isBuildingAtMaxLevel(buildingId: string, level: number): boolean {
  const max = getBuilding(buildingId).maxUpgradeLevel;
  return max !== undefined && level >= max;
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
  // Un chantier (pas encore bati par le Heros) ne s'ameliore pas.
  if (!owned || !isUpgradableBuilding(owned.buildingId) || !isBuildingBuilt(owned)) return false;
  if (isBuildingAtMaxLevel(owned.buildingId, ownedBuildingLevel(owned))) return false;
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
  applyOwnedBuildingUpgrade(run, index);
  return true;
}

/** Niveau suivant du batiment `index`, deja paye (amelioration terminee dans
 *  la file de production temps reel, 2026-11-02) : memes effets que
 *  upgradeOwnedBuilding, sans debit. Faux si le batiment est absent ou deja au
 *  niveau maximum. */
export function applyOwnedBuildingUpgrade(run: RunState, index: number): boolean {
  const owned = run.buildings[index];
  if (!owned) return false;
  const level = ownedBuildingLevel(owned);
  if (isBuildingAtMaxLevel(owned.buildingId, level)) return false;
  owned.level = level + 1;
  owned.hp += getBuilding(owned.buildingId).hpPerLevel ?? 0;
  return true;
}
