import { buildingUpgradeScope, getBuilding } from '../data/buildings';
import { grantRunUpgradeLevel, runUpgradeLevel, type RunUpgradeLevels } from './runUpgrades';
import { roundGold, type OwnedBuilding } from './runState';

/**
 * Ameliorations de BATIMENT (niveau affiche « Niv. 2 »...), commandees
 * depuis la fiche d'un batiment TERMINE en jeu et passees par sa file temps
 * reel (data/production.ts BUILDING_UPGRADE_SECONDS, payees a la commande,
 * run/productionOrders.ts). Deux portees (BuildingDef.upgradeScope,
 * 2026-11-05, Pass 2) :
 *  - 'instance' : niveau propre a l'exemplaire (OwnedBuilding.level) — Mine
 *    (production d'or), Tour (PV, degats) ; deux Mines peuvent
 *    avoir des niveaux differents ;
 *  - 'run' : niveau du TYPE de batiment, global a la run
 *    (RunState.upgrades[buildingId]) — producteurs : Caserne (Niv. 2 debloque
 *    l'Homme d'armes), Camp d'archerie, Sanctuaire, Ecurie (bonus de leur
 *    roster, BuildingDef.rosterBonusPerLevel, retroactif) ; une seule
 *    amelioration en file a la fois pour le type, tous les exemplaires en
 *    profitent.
 * Prix : BuildingDef.upgradeGoldCostBase x 2^niveau. Effets :
 * run/buildingUpgradeEffects.ts (PV, degats), run/mineUpgradeEffects.ts,
 * data/production.ts (unites debloquees), run/playerUnitStats.ts (roster).
 */

/** Croissance du prix : x2 a chaque niveau. Le prix du premier niveau est
 *  propre a chaque batiment (BuildingDef.upgradeGoldCostBase : Mine 25,
 *  Caserne 20, Camp d'archerie 20, Sanctuaire 15, Ecurie 20, Tour 5 ;
 *  l'Eglise n'est plus ameliorable depuis le 2026-11-05). */
const BUILDING_UPGRADE_GOLD_COST_GROWTH = 2;

export function isUpgradableBuilding(buildingId: string): boolean {
  return getBuilding(buildingId).upgradeGoldCostBase !== undefined;
}

/** Vrai quand le batiment a atteint BuildingDef.maxUpgradeLevel (Caserne,
 *  Camp d'archerie, Sanctuaire, Ecurie : Niv. 2) ; jamais pour un batiment
 *  sans plafond. */
export function isBuildingAtMaxLevel(buildingId: string, level: number): boolean {
  const max = getBuilding(buildingId).maxUpgradeLevel;
  return max !== undefined && level >= max;
}

/** Niveau interne d'un batiment possede (absent = 0), portee 'instance'. */
export function ownedBuildingLevel(owned: Pick<OwnedBuilding, 'level'>): number {
  return owned.level ?? 0;
}

/** Niveau EFFECTIF d'un batiment possede : celui de la run pour un type a
 *  portee 'run', celui de l'exemplaire sinon. */
export function buildingLevelOf(levels: Readonly<RunUpgradeLevels>, owned: Pick<OwnedBuilding, 'buildingId' | 'level'>): number {
  return buildingUpgradeScope(owned.buildingId) === 'run' ? runUpgradeLevel(levels, owned.buildingId) : ownedBuildingLevel(owned);
}

/** Prix de la prochaine amelioration d'un batiment `buildingId` de niveau
 *  `level` : base x 2^niveau (Tour : 5, 10, 20, 40...). */
export function buildingUpgradeGoldCost(buildingId: string, level: number): number {
  return roundGold((getBuilding(buildingId).upgradeGoldCostBase ?? 0) * BUILDING_UPGRADE_GOLD_COST_GROWTH ** level);
}

/** Vrai si une amelioration peut etre COMMANDEE pour `buildingId` au niveau
 *  `level` avec `gold` or : batiment ameliorable, plafond non atteint, or
 *  suffisant. La file (une seule amelioration a la fois pour ce
 *  batiment ou ce type) est verifiee par l'orchestration. */
export function canAffordBuildingUpgrade(buildingId: string, level: number, gold: number): boolean {
  if (!isUpgradableBuilding(buildingId) || isBuildingAtMaxLevel(buildingId, level)) return false;
  return gold >= buildingUpgradeGoldCost(buildingId, level);
}

/** Niveau suivant, deja paye a la commande, a la fin de sa duree :
 *  - portee 'run' : RunState.upgrades[buildingId] + 1 (tous les exemplaires) ;
 *  - portee 'instance' : OwnedBuilding.level + 1 et, si le niveau augmente
 *    les PV max (BuildingDef.hpPerLevel), les PV actuels du meme ecart (les
 *    PV manquants restent les memes).
 *  Renvoie le nouveau niveau, ou null si le plafond etait deja atteint
 *  (rien n'est modifie). */
export function applyBuildingUpgrade(levels: RunUpgradeLevels, owned: OwnedBuilding | null, buildingId: string): number | null {
  if (buildingUpgradeScope(buildingId) === 'run') {
    if (isBuildingAtMaxLevel(buildingId, runUpgradeLevel(levels, buildingId))) return null;
    return grantRunUpgradeLevel(levels, buildingId);
  }
  if (!owned) return null;
  const level = ownedBuildingLevel(owned);
  if (isBuildingAtMaxLevel(buildingId, level)) return null;
  owned.level = level + 1;
  owned.hp += getBuilding(buildingId).hpPerLevel ?? 0;
  return owned.level;
}
