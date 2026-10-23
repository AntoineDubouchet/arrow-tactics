import { getBuilding } from '../data/buildings';

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
 * Les niveaux d'amelioration ne modifient plus ce cout (refonte economique :
 * une Mine amelioree ne rend pas la Mine suivante plus chere) : c'est
 * aujourd'hui `def.cost ?? 0` (0 pour la Baliste, jamais achetable), point
 * d'entree garde pour tout futur modificateur de prix.
 */
export function getEffectiveBuildingCost(buildingId: string): number {
  return getBuilding(buildingId).cost ?? 0;
}

/** PV max d'un batiment possede a son niveau PROPRE (interne x10) : base +
 *  niveau x BuildingDef.hpPerLevel (Tour : 15, 20, 25... PV). Egal a la base
 *  pour un batiment sans gain de PV par niveau. */
export function effectiveBuildingMaxHp(buildingId: string, level: number): number {
  const def = getBuilding(buildingId);
  return def.maxHp + level * (def.hpPerLevel ?? 0);
}

/** Degats par tir d'un batiment defensif a son niveau PROPRE (interne x10) :
 *  base + niveau x gain (Tour : 4, 6, 8... points). 0 sans attaque. */
export function effectiveBuildingAttackDamage(buildingId: string, level: number): number {
  const attack = getBuilding(buildingId).attack;
  return attack ? attack.damage + level * attack.damagePerLevel : 0;
}
