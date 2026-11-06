import { getBuilding } from '../data/buildings';
import { getWallType, wallGateCost, wallLineCost } from '../data/walls';

/**
 * Reparation payante des batiments (2026-11-02) : formule PROVISOIRE.
 * Reparer de 0 a 100 % des PV coute REPAIR_COST_FRACTION (50 %) du cout de
 * construction de base (or, bois, pierre), proportionnellement aux PV
 * manquants : reparer 20 % des PV coute 10 % du prix. Or arrondi au demi
 * superieur, bois et pierre a l'unite la plus proche. Paye d'avance sur le
 * stock ; la partie non utilisee est rendue (repairRefund). La Baliste et
 * l'Hotel de ville, jamais construits, ont un cout de base propre.
 */
export const REPAIR_COST_FRACTION = 0.5;
/** Cout de base des batiments preconstruits pour la reparation (PROVISOIRE). */
const PRECONSTRUCTED_REPAIR_BASE: Readonly<Record<string, RepairCost>> = {
  ballista: { gold: 30, wood: 10, stone: 10 },
  townhall: { gold: 30, wood: 20, stone: 20 },
};

export interface RepairCost {
  gold: number;
  wood: number;
  stone: number;
}

export function repairBaseCost(buildingId: string, wallLengthTiles?: number): RepairCost {
  const preconstructed = PRECONSTRUCTED_REPAIR_BASE[buildingId];
  if (preconstructed) return { ...preconstructed };
  const def = getBuilding(buildingId);
  // Piece de mur V2 : son prix reel (longueur du segment, ou porte).
  if (def.wallPiece) {
    const type = getWallType(def.wallPiece.wallType);
    const cost = def.wallPiece.role === 'gate' ? wallGateCost(type) : wallLineCost(type, wallLengthTiles ?? type.segmentLength);
    return { gold: 0, wood: cost.wood, stone: cost.stone };
  }
  return { gold: def.cost ?? 0, wood: def.resourceCost?.wood ?? 0, stone: def.resourceCost?.stone ?? 0 };
}

/** Cout pour reparer `missingFraction` (0..1) des PV max. */
export function repairCost(buildingId: string, missingFraction: number, wallLengthTiles?: number): RepairCost {
  const base = repairBaseCost(buildingId, wallLengthTiles);
  const k = REPAIR_COST_FRACTION * Math.min(1, Math.max(0, missingFraction));
  return { gold: Math.ceil(base.gold * k * 2) / 2, wood: Math.round(base.wood * k), stone: Math.round(base.stone * k) };
}

/** Remboursement de la part non utilisee (`unusedFraction` du budget) :
 *  or au dixieme inferieur, bois et pierre a l'unite inferieure. */
export function repairRefund(paid: RepairCost, unusedFraction: number): RepairCost {
  const u = Math.min(1, Math.max(0, unusedFraction));
  return { gold: Math.floor(paid.gold * u * 10 + 1e-9) / 10, wood: Math.floor(paid.wood * u + 1e-9), stone: Math.floor(paid.stone * u + 1e-9) };
}

/** Libelle « 3 or, 2 bois » (vide : gratuit). */
export function formatRepairCost(cost: RepairCost): string {
  const parts = [cost.gold > 0 ? `${String(cost.gold).replace('.', ',')} or` : '', cost.wood > 0 ? `${cost.wood} bois` : '', cost.stone > 0 ? `${cost.stone} pierre` : ''].filter(Boolean);
  return parts.length > 0 ? parts.join(', ') : 'gratuit';
}
