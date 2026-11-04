import { HP_PER_PIP } from '../config/constants';
import { getBuilding } from '../data/buildings';

/**
 * Soin de l'armee a l'Eglise (BuildingDef.armyHeal), depuis la fiche de
 * l'Eglise en jeu (main.ts, realtimeBuildingAction 'healArmy') : rend a
 * TOUTES les unites vivantes du joueur leurs PV manquants, d'un coup. Jamais
 * les batiments, la Baliste ni les ennemis.
 *
 * Cout : ceil(PV manquants / efficacite), l'efficacite (PV par or) etant
 * celle de l'Eglise utilisee, a son niveau propre. Tout ou rien : pas de
 * soin partiel si l'or manque, rien de depense si personne n'est blesse.
 * Ce module ne calcule que l'efficacite et le cout ; les PV manquants sont
 * lus sur les entites par l'orchestration (realtimeArmyMissingHp).
 */

/** PV AFFICHES rendus par or par l'Eglise `buildingId` a son niveau `level`
 *  (5, 7, 9, 11... ; 0 pour un batiment sans soin). */
export function churchHealHpPerGold(buildingId: string, level: number): number {
  const heal = getBuilding(buildingId).armyHeal;
  return heal ? heal.hpPerGold + level * heal.hpPerGoldPerLevel : 0;
}

/** Cout en or pour rendre `missingHp` (interne) a l'efficacite `hpPerGold`
 *  (PV affiches par or) : ceil(PV manquants / efficacite), 0 si rien a
 *  soigner. Le petit epsilon absorbe les residus de virgule flottante. */
export function churchHealCost(missingHp: number, hpPerGold: number): number {
  if (missingHp <= 0 || hpPerGold <= 0) return 0;
  return Math.ceil(missingHp / (hpPerGold * HP_PER_PIP) - 1e-9);
}
