import { PLAYER_BASE_POPULATION } from '../config/constants';
import { BUILDINGS } from './buildings';
import { getUnit } from './units';

/**
 * Population du joueur : chaque unite occupe `UnitDef.populationCost`
 * places ; le maximum vaut PLAYER_BASE_POPULATION plus le `populationBonus`
 * de chaque batiment existant (Maison). Fonctions pures, partagees par la
 * preparation (armee et batiments de la run, voir run/population.ts) et par
 * la simulation (entites vivantes, voir sim/systems/barracksSystem.ts) : une
 * seule regle de calcul, quelle que soit la source.
 *
 * Seul le camp du joueur a une population : les ennemis et les batiments
 * n'en consomment jamais.
 */
export interface PopulationState {
  used: number;
  max: number;
}

/** Places occupees par une unite (voir UnitDef.populationCost). */
export function unitPopulationCost(unitId: string): number {
  return getUnit(unitId).populationCost;
}

/** Population maximale ajoutee par un batiment (0 s'il n'en apporte pas). */
export function buildingPopulationBonus(buildingId: string): number {
  return BUILDINGS[buildingId]?.populationBonus ?? 0;
}

export function populationUsed(unitIds: Iterable<string>): number {
  let used = 0;
  for (const unitId of unitIds) used += unitPopulationCost(unitId);
  return used;
}

export function populationMax(buildingIds: Iterable<string>): number {
  let max = PLAYER_BASE_POPULATION;
  for (const buildingId of buildingIds) max += buildingPopulationBonus(buildingId);
  return max;
}

/** Vrai si une unite de plus tient dans la population. Une population deja
 *  au-dessus du maximum (Maison detruite) bloque toute nouvelle unite sans
 *  jamais retirer les unites existantes. */
export function canAddUnitToPopulation(state: PopulationState, unitId: string): boolean {
  return state.used + unitPopulationCost(unitId) <= state.max;
}

/** Entites d'une bataille : unites vivantes et batiments vivants du joueur. */
export function populationOfEntities(entities: Iterable<{ team: string; alive: boolean; isBuilding: boolean; unitId: string }>): PopulationState {
  let used = 0;
  let max = PLAYER_BASE_POPULATION;
  for (const e of entities) {
    if (e.team !== 'player' || !e.alive) continue;
    if (e.isBuilding) max += buildingPopulationBonus(e.unitId);
    else used += unitPopulationCost(e.unitId);
  }
  return { used, max };
}
