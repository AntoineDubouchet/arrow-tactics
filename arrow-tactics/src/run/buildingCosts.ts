import type { ResourceKind } from '../config/resourceNodes';
import { getBuilding } from '../data/buildings';

/**
 * Cout en MATIERE (bois, pierre) d'un batiment achete en run
 * (BuildingDef.resourceCost ; l'or passe par getEffectiveBuildingCost,
 * run/buildingUpgradeEffects.ts). Fonctions pures, sans etat : main.ts
 * (menu Construire, requestPlaceBuilding, confirmBuildingPlacement) les
 * appelle avec `RunState.resources`. Testees par tests/sim/couts.mts.
 *
 * 2026-11-05 (G45) : les couts sont recales autour d'un cargo Villageois de
 * 10 (un trajet = 10 bois ou 10 pierre) ; les valeurs vivent dans
 * data/buildings.ts, jamais ici.
 */
export type MaterialCost = Record<ResourceKind, number>;

/** Bois et pierre que coute `buildingId`, `times` fois (0 pour une
 *  ressource absente du cout). */
export function buildingMaterialCost(buildingId: string, times = 1): MaterialCost {
  const cost = getBuilding(buildingId).resourceCost ?? {};
  return { wood: (cost.wood ?? 0) * times, stone: (cost.stone ?? 0) * times };
}

/** Vrai si le stock depose couvre la matiere de `buildingId` (`times`
 *  fois). L'or est verifie a part. */
export function canAffordMaterials(resources: Readonly<Record<ResourceKind, number>>, buildingId: string, times = 1): boolean {
  const cost = buildingMaterialCost(buildingId, times);
  return resources.wood >= cost.wood && resources.stone >= cost.stone;
}

/** Debite EXACTEMENT la matiere de `buildingId` (`times` fois) du stock,
 *  jamais sous zero. A appeler apres canAffordMaterials. */
export function payMaterials(resources: Record<ResourceKind, number>, buildingId: string, times = 1): void {
  const cost = buildingMaterialCost(buildingId, times);
  resources.wood = Math.max(0, resources.wood - cost.wood);
  resources.stone = Math.max(0, resources.stone - cost.stone);
}
