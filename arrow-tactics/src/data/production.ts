import { getBuilding } from './buildings';

/**
 * Production d'unites en TEMPS REEL (2026-11-01, Hero RTS continu) : un
 * batiment bati recoit une commande (une unite a la fois), qui sort a la fin
 * de sa duree. Remplace, dans la Survie, la production automatique de debut
 * de manche (BuildingDef.production, legacy). Durees PROVISOIRES, aucun
 * reequilibrage : le prix reste celui de l'unite (or).
 */
const UNIT_PRODUCTION_SECONDS: Readonly<Record<string, number>> = {
  piquier: 6,
  fantassin: 8,
  archer: 9,
  mage: 14,
  oracle: 14,
  vengeur: 16,
};
const DEFAULT_PRODUCTION_SECONDS = 10;

export function unitProductionSeconds(unitId: string): number {
  return UNIT_PRODUCTION_SECONDS[unitId] ?? DEFAULT_PRODUCTION_SECONDS;
}

/** Unites que le batiment `buildingId` produit a son niveau interne `level` :
 *  celles qu'il debloque au recrutement (BuildingDef.recruitmentUnlock,
 *  niveaux minimaux compris). */
export function producibleUnits(buildingId: string, level: number): string[] {
  const unlock = getBuilding(buildingId).recruitmentUnlock;
  if (!unlock) return [];
  return unlock.unitIds.filter((unitId) => level >= (unlock.minLevels?.[unitId] ?? 0));
}
