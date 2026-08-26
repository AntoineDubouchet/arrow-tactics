import { getBuilding } from '../data/buildings';
import type { MetaProgress } from './metaProgress';
import { effectiveBarracksGoldCost } from './barracksUpgradeEffects';
import { effectiveMineGoldCost } from './mineUpgradeEffects';

/**
 * Cout Gold EFFECTIF d'achat EN PARTIE d'un bâtiment achetable (Mine,
 * Caserne — 2026-08-18, demande explicite d'Antoine : "je ne veux pas un
 * cout affiche different du cout reellement retire... utilise une fonction
 * centrale du type getEffectiveBuildingCost(buildingId)") — SOURCE UNIQUE,
 * dispatch generique par id vers le module d'effets dedie de chaque
 * bâtiment (meme patron que run/unitUpgradeEffects.ts, effectivePlayerUnitCost,
 * qui dispatch de la meme facon pour les unites). Utilisee A LA FOIS par
 * l'affichage boutique (ui/screens.ts, refreshShop/describeBuildingShopItem)
 * ET la transaction reelle (main.ts, requestPlaceBuilding/confirmBuildingPlacement) —
 * jamais un cout recalcule separement a deux endroits.
 *
 * Un bâtiment sans amelioration de cout dediee (la Baliste — jamais
 * achetable via ce systeme, voir data/buildings.ts, `cost` absent) retombe
 * simplement sur `def.cost ?? 0`.
 */
export function getEffectiveBuildingCost(buildingId: string, progress: MetaProgress): number {
  if (buildingId === 'mine') return effectiveMineGoldCost(progress);
  if (buildingId === 'barracks') return effectiveBarracksGoldCost(progress);
  return getBuilding(buildingId).cost ?? 0;
}
