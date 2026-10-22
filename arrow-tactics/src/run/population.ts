import { canAddUnitToPopulation, populationMax, populationUsed, type PopulationState } from '../data/population';
import type { RunState } from './runState';

/**
 * Population de la run hors bataille (preparation) : l'armee possedee et les
 * batiments possedes. En bataille, la population se lit sur les entites
 * vivantes (populationOfEntities, data/population.ts).
 */
export function runPopulation(run: Pick<RunState, 'army' | 'buildings'>): PopulationState {
  return {
    used: populationUsed(run.army.map((unit) => unit.unitId)),
    max: populationMax(run.buildings.map((building) => building.buildingId)),
  };
}

/** Vrai si le joueur peut recruter `unitId` sans depasser sa population. */
export function canRecruitWithinPopulation(run: Pick<RunState, 'army' | 'buildings'>, unitId: string): boolean {
  return canAddUnitToPopulation(runPopulation(run), unitId);
}
