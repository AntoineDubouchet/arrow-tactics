import { getBuilding } from './buildings';

/**
 * Production d'unites en TEMPS REEL (2026-11-01, Hero RTS continu) : un
 * batiment bati recoit des commandes en FILE (2026-11-02 : unites et
 * amelioration du batiment, dans l'ordre des clics, PRODUCTION_QUEUE_MAX au
 * plus), chacune sortant a la fin de sa duree, l'une apres l'autre. Seule
 * regle de production du jeu depuis le 2026-11-04 (l'ancien quota gratuit
 * de debut de manche a ete retire). Durees PROVISOIRES, aucun
 * reequilibrage : le prix reste celui de l'unite (or).
 */
const UNIT_PRODUCTION_SECONDS: Readonly<Record<string, number>> = {
  piquier: 6,
  fantassin: 8,
  archer: 9,
  mage: 14,
  oracle: 14,
  vengeur: 16,
  cavalier: 12,
  villageois: 8,
};
const DEFAULT_PRODUCTION_SECONDS = 10;

/** Commandes au plus dans la file d'un batiment (2026-11-02). PROVISOIRE. */
export const PRODUCTION_QUEUE_MAX = 5;

/** Duree de l'amelioration d'un batiment producteur passee par sa file
 *  (2026-11-02 ; avant : immediate). PROVISOIRE. */
export const BUILDING_UPGRADE_SECONDS = 20;

export function unitProductionSeconds(unitId: string): number {
  return UNIT_PRODUCTION_SECONDS[unitId] ?? DEFAULT_PRODUCTION_SECONDS;
}

/** Raccourcis de production (2026-11-06, G50, decision d'Antoine) : rang de l'unite
 *  dans la liste du producteur (BuildingDef.recruitmentUnlock) -> touche. Aucune
 *  regle par batiment : un producteur ou une unite de plus suit tout seul. */
export const PRODUCTION_HOTKEYS: readonly string[] = ['A', 'Z', 'E', 'R'];

/** Touche de l'unite `unitId` chez `buildingId`, null s'il n'y en a pas. Rang dans
 *  la liste complete : une unite garde sa touche quand une autre se debloque. */
export function productionHotkey(buildingId: string, unitId: string): string | null {
  const index = getBuilding(buildingId).recruitmentUnlock?.unitIds.indexOf(unitId) ?? -1;
  return PRODUCTION_HOTKEYS[index] ?? null;
}

/** Unites que le batiment `buildingId` produit a son niveau interne `level` :
 *  celles qu'il debloque au recrutement (BuildingDef.recruitmentUnlock,
 *  niveaux minimaux compris). */
export function producibleUnits(buildingId: string, level: number): string[] {
  const unlock = getBuilding(buildingId).recruitmentUnlock;
  if (!unlock) return [];
  return unlock.unitIds.filter((unitId) => level >= (unlock.minLevels?.[unitId] ?? 0));
}
