import type { ResourceKind } from '../config/resourceNodes';
import { HP_PER_PIP } from '../config/constants';

/**
 * Familles de murs V2 (2026-11-02) : une ligne posee de A a B (core/wallLine.ts),
 * decoupee en segments internes ; chaque segment ou porte est un batiment
 * (data/buildings.ts, BuildingDef.wallPiece). Ce fichier porte ce qui depend
 * de la LONGUEUR : epaisseur, decoupage, PV, cout, duree de construction.
 *
 * Seule famille aujourd'hui : la Palissade en bois. Mur de pierre, mur
 * fortifie... viendront comme d'autres entrees de WALL_TYPES (aucun code
 * propre a la palissade ailleurs que son rendu, render/palisade.ts).
 * Valeurs PROVISOIRES.
 */
export interface WallTypeDef {
  id: string;
  displayName: string;
  /** Batiments des pieces (data/buildings.ts). */
  segmentBuildingId: string;
  gateBuildingId: string;
  /** Demi-epaisseur de la capsule de collision (cases). */
  halfWidth: number;
  /** Longueur nominale d'un segment interne (cases) : un segment detruit
   *  ouvre une breche d'au moins cette longueur moins l'epaisseur. */
  segmentLength: number;
  minLength: number;
  maxLength: number;
  /** PV internes par case de longueur (segment, porte). */
  hpPerTile: number;
  gateHpPerTile: number;
  /** Cout par case de longueur (stock depose), arrondi au superieur sur la
   *  ligne entiere ; porte : cout fixe. */
  costPerTile: Partial<Record<ResourceKind, number>>;
  gateCost: Partial<Record<ResourceKind, number>>;
  /** Duree de construction par case (segment) ; porte : duree fixe. */
  buildSecondsPerTile: number;
  gateBuildSeconds: number;
  /** Ecart minimal (cases) entre la capsule et l'emprise d'un batiment. */
  buildingClearance: number;
}

export const WALL_TYPES: Readonly<Record<string, WallTypeDef>> = {
  // Palissade en bois : fragile (c'est du bois), bon marche, rapide a monter.
  // Segment nominal de 2 cases : une breche laisse passer un Cavalier
  // (rayon 0,7). 0,5 bois par case, 15 PV par case (30 PV le segment
  // nominal), 1,5 s par case. Porte : 20 PV par case, 4 bois, 4 s.
  palisade: {
    id: 'palisade',
    displayName: 'Palissade',
    segmentBuildingId: 'palisade',
    gateBuildingId: 'palisade_gate',
    halfWidth: 0.15,
    segmentLength: 2,
    minLength: 1,
    maxLength: 30,
    hpPerTile: 15 * HP_PER_PIP,
    gateHpPerTile: 20 * HP_PER_PIP,
    costPerTile: { wood: 0.5 },
    gateCost: { wood: 4 },
    buildSecondsPerTile: 1.5,
    gateBuildSeconds: 4,
    buildingClearance: 0.15,
  },
};

export const DEFAULT_WALL_TYPE = 'palisade';

/** Portes automatiques (2026-11-06, sim/systems/doors.ts), distances a la porte en
 *  cases, PROVISOIRES : un allie qui approche l'ouvre, un hostile proche la ferme. */
export const DOOR_ALLY_OPEN_RANGE = 2.5;
export const DOOR_ENEMY_CLOSE_RANGE = 5;

export function getWallType(id: string): WallTypeDef {
  const def = WALL_TYPES[id];
  if (!def) throw new Error(`Mur inconnu : ${id}`);
  return def;
}

/** Cout d'une ligne de `length` cases : longueur au dixieme (celle que
 *  l'apercu affiche), puis arrondi au superieur par ressource. */
export function wallLineCost(type: WallTypeDef, length: number): Record<ResourceKind, number> {
  const shown = Math.round(length * 10) / 10;
  return { wood: Math.ceil((type.costPerTile.wood ?? 0) * shown - 1e-9), stone: Math.ceil((type.costPerTile.stone ?? 0) * shown - 1e-9) };
}

/** Cout d'une porte. */
export function wallGateCost(type: WallTypeDef): Record<ResourceKind, number> {
  return { wood: type.gateCost.wood ?? 0, stone: type.gateCost.stone ?? 0 };
}

/** PV max (internes) d'une piece de `length` cases. */
export function wallPieceMaxHp(type: WallTypeDef, role: 'segment' | 'gate', length: number): number {
  return Math.max(HP_PER_PIP, Math.round((role === 'gate' ? type.gateHpPerTile : type.hpPerTile) * length));
}

/** Duree de construction (s) d'une piece de `length` cases. */
export function wallPieceBuildTime(type: WallTypeDef, role: 'segment' | 'gate', length: number): number {
  return role === 'gate' ? type.gateBuildSeconds : Math.max(0.5, type.buildSecondsPerTile * length);
}
