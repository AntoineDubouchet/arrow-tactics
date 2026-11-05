import { obstacleBounds, type ObstacleBounds, type ObstacleDef } from '../config/constants';
import { makeOrientedBox, distanceToOrientedBox, orientedBoxBounds, orientedBoxesOverlap, orientedBoxOverlapsRect, segmentInBoxFrame, type OrientedBox } from '../core/orientedBox';
import { segmentBoxDistance } from '../core/wallLine';
import { buildingFootprint } from '../data/buildings';

/**
 * Validation de la pose libre d'un batiment (2026-11-06, G48, decision
 * d'Antoine : la grille reste technique, elle ne contraint plus la pose du
 * joueur). Pure, sans carte ni monde : l'orchestration (main.ts) fournit ce qui
 * occupe le terrain ; une seule regle pour le Heros et le Villageois.
 *
 * Geometrie continue : l'empreinte reelle (rectangle oriente), elargie de
 * placementPadding contre tout ce qui occupe le terrain. Seuls le terrain et
 * l'eau se lisent par case, puisque ce sont des donnees par case : on regarde
 * les cases que l'empreinte touche vraiment.
 */
export interface BuildingPlacementWorld {
  /** Case (coordonnees entieres) existante de la carte et hors eau. */
  isBuildableCell(cellX: number, cellZ: number): boolean;
  /** Niveau commun du rectangle, null s'il n'est pas plat. */
  flatLevelOver(minX: number, maxX: number, minZ: number, maxZ: number): number | null;
  /** Batiments, chantiers, structures bloquantes, destructibles. */
  blockers: readonly ObstacleDef[];
  /** Sources de ressources debout (rectangles). */
  sources: readonly ObstacleBounds[];
  /** Pieces de mur et portes : ligne et distance minimale a garder. */
  walls: readonly { segment: { ax: number; az: number; bx: number; bz: number }; clearance: number }[];
  /** Unites vivantes. */
  bodies: readonly { x: number; z: number; radius: number }[];
}

export type BuildingPlacementIssue = 'terrain' | 'slope' | 'building' | 'source' | 'wall' | 'unit';

/** Empreinte reelle d'un batiment pose en (x, z), tourne de `rotationY`. */
export function buildingPlacementBox(buildingId: string, x: number, z: number, rotationY: number): OrientedBox {
  const f = buildingFootprint(buildingId);
  return makeOrientedBox(x, z, f.width, f.depth, rotationY);
}

/** Raison du refus de la pose, ou null si elle est valide. */
export function checkBuildingPlacement(buildingId: string, x: number, z: number, rotationY: number, world: BuildingPlacementWorld): BuildingPlacementIssue | null {
  const box = buildingPlacementBox(buildingId, x, z, rotationY);
  const padding = buildingFootprint(buildingId).placementPadding;
  const bounds = orientedBoxBounds(box);

  for (let cz = Math.floor(bounds.minZ); cz < bounds.maxZ; cz++) {
    for (let cx = Math.floor(bounds.minX); cx < bounds.maxX; cx++) {
      if (orientedBoxOverlapsRect(box, { minX: cx, maxX: cx + 1, minZ: cz, maxZ: cz + 1 }) && !world.isBuildableCell(cx, cz)) return 'terrain';
    }
  }
  if (world.flatLevelOver(bounds.minX, bounds.maxX, bounds.minZ, bounds.maxZ) === null) return 'slope';

  const near = orientedBoxBounds(box, padding);
  const close = (r: ObstacleBounds): boolean => r.minX < near.maxX && r.maxX > near.minX && r.minZ < near.maxZ && r.maxZ > near.minZ;
  for (const o of world.blockers) {
    const r = obstacleBounds(o);
    if (close(r) && (o.footprint ? orientedBoxesOverlap(box, o.footprint, padding) : orientedBoxOverlapsRect(box, r, padding))) return 'building';
  }
  for (const r of world.sources) if (close(r) && orientedBoxOverlapsRect(box, r, padding)) return 'source';
  for (const w of world.walls) {
    const { segment, rect } = segmentInBoxFrame(box, w.segment);
    if (segmentBoxDistance(segment, rect) < w.clearance) return 'wall';
  }
  // Jamais sur une unite vivante (elle serait enfermee).
  for (const b of world.bodies) if (distanceToOrientedBox(box, b.x, b.z) < b.radius) return 'unit';
  return null;
}
