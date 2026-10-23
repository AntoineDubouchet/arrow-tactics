import { recruitmentBuildingFor } from '../data/buildings';
import type { RunState } from './runState';

/**
 * Batiment requis pour recruter une unite en boutique (Caserne ->
 * Fantassin, Camp d'archerie -> Archer, Eglise -> Mage, voir
 * BuildingDef.recruitmentUnlock). Seule source de cette regle, lue par la
 * boutique (ui/screens.ts) et par l'achat (main.ts, buyUnit). Lu sur les
 * batiments possedes de la run : un
 * batiment detruit en bataille disparait de RunState.buildings a la fin de
 * celle-ci, un batiment achete y entre aussitot. Les unites deja possedees
 * (dont l'armee de depart) ne sont jamais retirees.
 */

/** Raison du refus quand le batiment requis manque, null si `unitId` est
 *  recrutable de ce point de vue (batiment present, ou aucun requis :
 *  Sentinelle). */
export function missingRecruitmentBuildingHint(run: Pick<RunState, 'buildings'>, unitId: string): string | null {
  const required = recruitmentBuildingFor(unitId);
  if (!required) return null;
  if (run.buildings.some((owned) => owned.buildingId === required.id)) return null;
  return required.recruitmentUnlock?.missingBuildingHint ?? null;
}

export function hasRecruitmentBuilding(run: Pick<RunState, 'buildings'>, unitId: string): boolean {
  return missingRecruitmentBuildingHint(run, unitId) === null;
}
