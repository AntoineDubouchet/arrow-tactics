import { obstacleBounds, type ObstacleDef } from '../config/constants';
import { BUILD_REACH } from '../data/hero';
import { distanceToOrientedBox, makeOrientedBox, type OrientedBox } from '../core/orientedBox';
import { distanceToSegment } from '../core/wallLine';
import type { Entity } from './entity';
import { findBlockingObstacle, getObstacleBoundsList } from './geometry';
import { isTileBlockedAt, nearestFreeTileAt, tileAt, tileToWorldX, tileToWorldZ, walkDistances, type PathGrid } from './pathfinding';

/**
 * Point de travail d'un chantier (2026-11-06, passe corrective G49) : meme
 * principe que le point de travail d'une source (harvestStand). Avant, le point
 * vise autour d'un segment de palissade etait recalcule a chaque sous-pas depuis
 * la position de l'unite, et son cote pouvait basculer : l'unite hesitait entre
 * deux routes sans jamais arriver. Desormais : les points possibles autour de la
 * cible, le plus proche A PIED parmi ceux ou un corps tient et qu'une case reliee
 * rejoint en ligne droite, choisi UNE fois et garde pour l'ordre
 * (sim/systems/movement.ts).
 */
export interface WorkStand {
  /** Point de travail, contre la cible. */
  x: number;
  z: number;
  /** Centre de la case libre reliee d'ou il se rejoint en ligne droite : but
   *  d'A* (la case du point lui-meme est souvent bloquee par la cible). */
  routeX: number;
  routeZ: number;
}

/** Ecarts (cases) entre le corps et la cible, au point de travail : au contact,
 *  sinon un peu plus loin, encore a portee de travail (BUILD_REACH 0,8), quand un
 *  obstacle colle a la cible. */
const STAND_GAPS: readonly number[] = [0.1, 0.6];
/** Pas (cases) du controle du corps entre la case de route et le point. */
const BODY_PATH_STEP = 0.2;
/** Positions le long d'un segment, milieu d'abord. */
const WALL_STAND_POSITIONS: readonly number[] = [0.5, 0.25, 0.75, 0.05, 0.95];
/** Positions le long d'un cote de batiment (fraction de sa demi-longueur). */
const SIDE_STAND_POSITIONS: readonly number[] = [0, 0.6, -0.6];
/** Tolerance d'un corps qui frole un obstacle. */
const BODY_FIT_SLACK = 0.02;
/** Rayon (anneaux de cases) autour du point pour trouver sa case de route. */
const ROUTE_TILE_RINGS = 2;
/** Rayon (anneaux) pour sortir d'une case bloquee au depart. */
const FREE_START_RINGS = 3;
/** Un point a moins de cette distance d'un point deja en echec est ecarte. */
const AVOID_RADIUS = 0.3;

/** Case libre de depart d'une unite en (x, z) : sa case, sinon la plus proche
 *  rejointe en ligne droite (une unite collee a une palissade peut se tenir sur
 *  une case que sa ligne bloque, et ne doit pas en sortir du mauvais cote). */
export function freeTileNear(grid: PathGrid, obstacles: ObstacleDef[], x: number, z: number): { x: number; z: number } | null {
  if (!isTileBlockedAt(grid, x, z)) return { x, z };
  const t = tileAt(grid, x, z);
  let best: { x: number; z: number } | null = null;
  let bestD = Infinity;
  for (let ring = 1; ring <= FREE_START_RINGS && !best; ring++) {
    for (let dz = -ring; dz <= ring; dz++) {
      for (let dx = -ring; dx <= ring; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== ring) continue;
        const tx = t.x + dx;
        const tz = t.z + dz;
        if (tx < 0 || tz < 0 || tx >= grid.width || tz >= grid.height) continue;
        const cx = tileToWorldX(grid, tx);
        const cz = tileToWorldZ(grid, tz);
        if (isTileBlockedAt(grid, cx, cz) || findBlockingObstacle(x, z, cx, cz, obstacles) !== null) continue;
        const d = Math.hypot(cx - x, cz - z);
        if (d < bestD) {
          bestD = d;
          best = { x: cx, z: cz };
        }
      }
    }
  }
  return best;
}

/** Vrai si un corps de rayon `r` va en ligne droite de A a B sans rien toucher. */
function bodyPathClear(ax: number, az: number, bx: number, bz: number, r: number, obstacles: ObstacleDef[]): boolean {
  const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / BODY_PATH_STEP));
  for (let i = 0; i <= steps; i++) {
    if (!bodyFitsAt(ax + ((bx - ax) * i) / steps, az + ((bz - az) * i) / steps, r, obstacles)) return false;
  }
  return true;
}

/** Vrai si un corps de rayon `r` tient en (x, z) sans toucher d'obstacle. */
export function bodyFitsAt(x: number, z: number, r: number, obstacles: ObstacleDef[]): boolean {
  const reach = r - BODY_FIT_SLACK;
  const bounds = getObstacleBoundsList(obstacles);
  for (let i = 0; i < bounds.length; i++) {
    const b = bounds[i]!;
    if (x < b.minX - reach || x > b.maxX + reach || z < b.minZ - reach || z > b.maxZ + reach) continue;
    const o = obstacles[i]!;
    if (o.line) {
      if (distanceToSegment(x, z, o.line) < o.line.halfWidth + reach) return false;
    } else if (o.footprint) {
      if (distanceToOrientedBox(o.footprint, x, z) < reach) return false;
    } else if (Math.hypot(Math.max(b.minX - x, 0, x - b.maxX), Math.max(b.minZ - z, 0, z - b.maxZ)) < reach) {
      return false;
    }
  }
  return true;
}

/** Distance de (x, z) a l'emprise d'une cible (0 a l'interieur). Piece de mur V2 :
 *  jusqu'a sa capsule. Empreinte continue : jusqu'au rectangle oriente. Sans emprise :
 *  jusqu'a son centre, rayon deduit. */
export function distanceToSite(e: { x: number; z: number }, site: Entity): number {
  const f = site.footprintObstacle;
  if (f?.line) return Math.max(0, distanceToSegment(e.x, e.z, f.line) - f.line.halfWidth);
  if (f?.footprint) return distanceToOrientedBox(f.footprint, e.x, e.z);
  if (!f) return Math.max(0, Math.hypot(site.x - e.x, site.z - e.z) - site.stats.radius);
  const halfX = f.tilesX / 2;
  const halfZ = f.tilesZ / 2;
  return Math.hypot(Math.max(site.x - halfX - e.x, 0, e.x - site.x - halfX), Math.max(site.z - halfZ - e.z, 0, e.z - site.z - halfZ));
}

/** Marge sous la portee de travail, pour une case retenue comme point de travail. */
const REACH_MARGIN = 0.05;

/** Points de travail possibles autour de la cible : des deux cotes d'un segment
 *  (et au-dela de ses bouts), sur les quatre cotes d'un batiment. */
function standCandidates(site: Entity, radius: number): { x: number; z: number }[] {
  const f = site.footprintObstacle;
  const out: { x: number; z: number }[] = [];
  if (f?.line) {
    const { ax, az, bx, bz, halfWidth } = f.line;
    const len = Math.hypot(bx - ax, bz - az) || 1;
    const ux = (bx - ax) / len;
    const uz = (bz - az) / len;
    for (const gap of STAND_GAPS) {
      const off = halfWidth + radius + gap;
      for (const t of WALL_STAND_POSITIONS) {
        for (const side of [1, -1]) out.push({ x: ax + (bx - ax) * t - uz * side * off, z: az + (bz - az) * t + ux * side * off });
      }
      out.push({ x: ax - ux * off, z: az - uz * off }, { x: bx + ux * off, z: bz + uz * off });
    }
    return out;
  }
  const box: OrientedBox = f?.footprint ?? (f ? makeOrientedBox(site.x, site.z, f.tilesX, f.tilesZ, 0) : makeOrientedBox(site.x, site.z, site.stats.radius * 2, site.stats.radius * 2, 0));
  const world = (lx: number, lz: number) => ({ x: box.x + lx * box.cos + lz * box.sin, z: box.z - lx * box.sin + lz * box.cos });
  for (const gap of STAND_GAPS) {
    for (const k of SIDE_STAND_POSITIONS) {
      for (const side of [1, -1]) {
        out.push(world(k * box.halfW, side * (box.halfD + radius + gap)), world(side * (box.halfW + radius + gap), k * box.halfD));
      }
    }
  }
  return out;
}

/**
 * Point de travail de `unit` pour la cible `site`, ou null si aucun n'est
 * atteignable. Le plus proche a pied (une seule inondation de la grille, aucun
 * A*) ; egalite : l'ordre des candidats. Une ligne de vue ne suffit pas : le corps
 * doit passer de la case de route jusqu'au point (sinon il frotte contre un coin
 * sans jamais arriver). `avoid` : points qui ont deja echoue pour cet ordre, ecartes
 * s'il en reste d'autres. Deterministe.
 */
export function chooseWorkStand(unit: Pick<Entity, 'x' | 'z'> & { stats: { radius: number } }, site: Entity, obstacles: ObstacleDef[], grid: PathGrid, avoid: readonly { x: number; z: number }[] = []): WorkStand | null {
  // Unite poussee dans un obstacle : la case libre la plus proche, quoi qu'il
  // arrive (la collision l'en ressort).
  const start = freeTileNear(grid, obstacles, unit.x, unit.z) ?? nearestFreeTileAt(grid, unit.x, unit.z);
  if (!start) return null;
  const from = tileAt(grid, start.x, start.z);
  const dist = walkDistances(grid, from.x, from.z);
  const r = unit.stats.radius;
  let best: WorkStand | null = null;
  let bestCost = Infinity;
  for (const c of standCandidates(site, r)) {
    if (avoid.some((a) => Math.hypot(a.x - c.x, a.z - c.z) < AVOID_RADIUS)) continue;
    if (Math.abs(c.x) > grid.halfW - r || Math.abs(c.z) > grid.halfH - r || !bodyFitsAt(c.x, c.z, r, obstacles)) continue;
    const t = tileAt(grid, c.x, c.z);
    for (let dz = -ROUTE_TILE_RINGS; dz <= ROUTE_TILE_RINGS; dz++) {
      for (let dx = -ROUTE_TILE_RINGS; dx <= ROUTE_TILE_RINGS; dx++) {
        const tx = t.x + dx;
        const tz = t.z + dz;
        if (tx < 0 || tz < 0 || tx >= grid.width || tz >= grid.height) continue;
        const walked = dist[tz * grid.width + tx]!;
        if (walked < 0) continue;
        const cx = tileToWorldX(grid, tx);
        const cz = tileToWorldZ(grid, tz);
        const cost = walked + Math.hypot(cx - c.x, cz - c.z);
        // La ligne droite ne traverse rien, la cible comprise : le point reste
        // du cote de cette case ; et le corps y passe.
        if (cost >= bestCost - 1e-9 || findBlockingObstacle(cx, cz, c.x, c.z, obstacles) !== null || !bodyPathClear(cx, cz, c.x, c.z, r, obstacles)) continue;
        bestCost = cost;
        best = { x: c.x, z: c.z, routeX: cx, routeZ: cz };
      }
    }
  }
  // Toute case reliee a portee de travail convient aussi : un chantier n'est jamais
  // declare inaccessible a tort parce qu'aucun point de contact n'etait libre.
  const reach = r + BUILD_REACH - REACH_MARGIN;
  const f = site.footprintObstacle;
  const b = f ? obstacleBounds(f) : { minX: site.x - site.stats.radius, maxX: site.x + site.stats.radius, minZ: site.z - site.stats.radius, maxZ: site.z + site.stats.radius };
  const near = tileAt(grid, b.minX - reach, b.minZ - reach);
  const far = tileAt(grid, b.maxX + reach, b.maxZ + reach);
  for (let tz = near.z; tz <= far.z; tz++) {
    for (let tx = near.x; tx <= far.x; tx++) {
      const walked = dist[tz * grid.width + tx]!;
      if (walked < 0 || walked >= bestCost - 1e-9) continue;
      const cx = tileToWorldX(grid, tx);
      const cz = tileToWorldZ(grid, tz);
      if (avoid.some((a) => Math.hypot(a.x - cx, a.z - cz) < AVOID_RADIUS)) continue;
      if (distanceToSite({ x: cx, z: cz }, site) > reach || !bodyFitsAt(cx, cz, r, obstacles)) continue;
      bestCost = walked;
      best = { x: cx, z: cz, routeX: cx, routeZ: cz };
    }
  }
  return best ?? (avoid.length > 0 ? chooseWorkStand(unit, site, obstacles, grid) : null);
}
