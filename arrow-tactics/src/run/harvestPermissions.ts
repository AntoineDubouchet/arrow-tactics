import { getBuilding } from '../data/buildings';
import { isBuildingBuilt, type RunState } from './runState';

/**
 * Droits de recolte avancee de la run (2026-11-01, Hero RTS) : couper les
 * vrais arbres, exploiter les gros gisements de pierre. Sans eux, le Heros
 * ne ramasse que les petits tas au sol. Un batiment BATI dont la fiche porte
 * `unlocksHarvest` les ouvre (future Scierie : `trees`, futur Camp de
 * mineur : `deposits`) : debloquer = une entree de data/buildings.ts, sans
 * toucher a la simulation, qui recoit seulement le resultat
 * (World.harvestPermissions, resolu au debut de chaque bataille).
 */
export interface HarvestPermissions {
  canHarvestTrees: boolean;
  canMineDeposits: boolean;
}

export function harvestPermissionsOf(run: Pick<RunState, 'buildings'>): HarvestPermissions {
  const unlocked = new Set(run.buildings.filter(isBuildingBuilt).map((b) => getBuilding(b.buildingId).unlocksHarvest));
  return { canHarvestTrees: unlocked.has('trees'), canMineDeposits: unlocked.has('deposits') };
}
