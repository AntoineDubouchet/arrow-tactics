import { cellKey } from '../config/mapDef';
import type { GroundTextureId } from '../config/groundSurfaces';

/**
 * Sol du village (2026-11-02, demande d'Antoine) : a la pose d'un batiment du
 * joueur, le sol est repeint en terre battue sous son emprise et sur un
 * anneau d'une case autour (coins arrondis) ; un chemin de terre battue d'une
 * case de large relie chaque nouveau batiment au plus proche des batiments
 * deja poses, s'il est a SETTLEMENT_PATH_MAX_TILES cases ou moins.
 *
 * Purement visuel : jamais lu par la simulation, le pathfinding ni la carte
 * (MapDef reste intacte, l'orchestration repeint le sol du plateau,
 * Board.terrain). Calcul pur et deterministe : memes batiments dans le meme
 * ordre -> memes cases. Valeurs PROVISOIRES.
 */

export const SETTLEMENT_SURFACE: GroundTextureId = 'terre-battue';
/** Anneau autour de l'emprise (cases). */
export const SETTLEMENT_RING_TILES = 1;
/** Distance maximale (cases, centre a centre) pour tracer un chemin. */
export const SETTLEMENT_PATH_MAX_TILES = 20;

/** Emprise d'un batiment pose (bornes monde). */
export interface SettlementSite {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/** Murailles et portes : ni terre battue ni chemin (une ligne de remparts
 *  tracerait une toile de chemins). Les autres batiments du joueur, Baliste
 *  comprise, en laissent. */
export function leavesSettlementGround(buildingId: string): boolean {
  return !buildingId.startsWith('wall');
}

/**
 * Cases de terre battue pour des batiments donnes dans leur ordre de pose.
 * `canPaint` : case repeignable (dans la carte, pas de l'eau) ; une case
 * refusee est simplement sautee (un chemin traverse une riviere sans la
 * peindre).
 */
export function settlementGroundCells(sites: readonly SettlementSite[], canPaint: (x: number, z: number) => boolean): Set<string> {
  const out = new Set<string>();
  const add = (x: number, z: number): void => {
    if (canPaint(x, z)) out.add(cellKey(x, z));
  };
  const center = (s: SettlementSite) => ({ x: (s.minX + s.maxX) / 2, z: (s.minZ + s.maxZ) / 2 });
  sites.forEach((site, i) => {
    // Cases dont le centre est sous l'emprise (emprise hors grille comprise).
    const x0 = Math.ceil(site.minX - 0.5);
    const x1 = Math.ceil(site.maxX - 0.5) - 1;
    const z0 = Math.ceil(site.minZ - 0.5);
    const z1 = Math.ceil(site.maxZ - 0.5) - 1;
    const r = SETTLEMENT_RING_TILES;
    for (let z = z0 - r; z <= z1 + r; z++) {
      for (let x = x0 - r; x <= x1 + r; x++) {
        const outX = x < x0 ? x0 - x : x > x1 ? x - x1 : 0;
        const outZ = z < z0 ? z0 - z : z > z1 ? z - z1 : 0;
        // Coins de l'anneau retires : contour arrondi.
        if (outX > 0 && outZ > 0) continue;
        add(x, z);
      }
    }
    // Chemin vers le plus proche des batiments deja poses.
    const c = center(site);
    let target: { x: number; z: number } | null = null;
    let best = Infinity;
    for (let j = 0; j < i; j++) {
      const o = center(sites[j]!);
      const d = Math.hypot(o.x - c.x, o.z - c.z);
      if (d <= SETTLEMENT_PATH_MAX_TILES && d < best) {
        best = d;
        target = o;
      }
    }
    if (target) for (const [x, z] of gridLine(Math.floor(c.x), Math.floor(c.z), Math.floor(target.x), Math.floor(target.z))) add(x, z);
  });
  return out;
}

/** Cases d'une ligne de (ax, az) a (bx, bz), reliees par un cote (jamais
 *  par un coin seul) : chemin continu d'une case de large. */
function gridLine(ax: number, az: number, bx: number, bz: number): [number, number][] {
  const dx = Math.abs(bx - ax);
  const dz = Math.abs(bz - az);
  const sx = Math.sign(bx - ax);
  const sz = Math.sign(bz - az);
  let x = ax;
  let z = az;
  let ix = 0;
  let iz = 0;
  const out: [number, number][] = [[x, z]];
  while (ix < dx || iz < dz) {
    if ((0.5 + ix) * dz < (0.5 + iz) * dx) {
      x += sx;
      ix++;
    } else {
      z += sz;
      iz++;
    }
    out.push([x, z]);
  }
  return out;
}
