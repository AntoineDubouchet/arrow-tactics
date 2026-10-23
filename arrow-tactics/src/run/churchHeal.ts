import { HP_PER_PIP } from '../config/constants';
import { getBuilding } from '../data/buildings';
import { ownedBuildingLevel } from './buildingUpgrades';
import { roundGold, spendGold, type RunState } from './runState';
import { playerUnitMaxHp } from './unitUpgradeEffects';

/**
 * Soin de l'armee a l'Eglise (BuildingDef.armyHeal), en preparation : rend
 * a TOUTES les unites possedees du joueur (RunState.army, toutes vivantes
 * hors bataille) leurs PV manquants, jusqu'au maximum propre a chaque unite
 * (playerUnitMaxHp, niveau de production compris). Jamais les batiments, la
 * Baliste ni les ennemis.
 *
 * Cout : ceil(PV manquants / efficacite), l'efficacite (PV par or) etant
 * celle de l'Eglise utilisee, a son niveau propre. Tout ou rien : pas de
 * soin partiel si l'or manque, rien de depense si personne n'est blesse.
 */

/** PV AFFICHES rendus par or par l'Eglise `buildingId` a son niveau `level`
 *  (5, 7, 9, 11... ; 0 pour un batiment sans soin). */
export function churchHealHpPerGold(buildingId: string, level: number): number {
  const heal = getBuilding(buildingId).armyHeal;
  return heal ? heal.hpPerGold + level * heal.hpPerGoldPerLevel : 0;
}

/** PV manquants de toute l'armee possedee, echelle INTERNE (x10). */
export function armyMissingHp(run: Pick<RunState, 'army'>): number {
  let missing = 0;
  for (const unit of run.army) missing += Math.max(0, playerUnitMaxHp(unit.unitId, unit.productionLevel) - unit.hp);
  return missing;
}

/** Cout en or pour rendre `missingHp` (interne) a l'efficacite `hpPerGold`
 *  (PV affiches par or) : ceil(PV manquants / efficacite), 0 si rien a
 *  soigner. Le petit epsilon absorbe les residus de virgule flottante. */
export function churchHealCost(missingHp: number, hpPerGold: number): number {
  if (missingHp <= 0 || hpPerGold <= 0) return 0;
  return Math.ceil(missingHp / (hpPerGold * HP_PER_PIP) - 1e-9);
}

export interface ArmyHealResult {
  cost: number;
  /** PV rendus, echelle interne. */
  healedHp: number;
}

/** Soigne toute l'armee avec l'Eglise `buildingIndex` de la run. null (rien
 *  n'est modifie) si ce n'est pas une Eglise, si personne n'est blesse ou si
 *  l'or ne couvre pas le cout total. */
export function healArmyAtChurch(run: RunState, buildingIndex: number): ArmyHealResult | null {
  const owned = run.buildings[buildingIndex];
  if (!owned || !getBuilding(owned.buildingId).armyHeal) return null;
  const missing = armyMissingHp(run);
  const cost = churchHealCost(missing, churchHealHpPerGold(owned.buildingId, ownedBuildingLevel(owned)));
  if (cost <= 0 || run.gold < cost) return null;
  if (!spendGold(run, roundGold(cost))) return null;
  for (const unit of run.army) unit.hp = Math.max(unit.hp, playerUnitMaxHp(unit.unitId, unit.productionLevel));
  return { cost, healedHp: missing };
}
