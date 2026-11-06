import type { ObstacleBounds, ObstacleDef } from '../config/constants';
import { HARVEST_REDIRECT_MAX_WALK, HARVEST_REDIRECT_RANGE, HARVEST_STAND_GAP } from '../data/hero';
import type { Entity } from './entity';
import { isTileBlockedAt, nearestFreeTileAt, tileAt, walkDistances, type PathGrid } from './pathfinding';
import { bodyFitsAt, freeTileNear, type WorkStand } from './workStand';
import type { HeroWorkContext } from './systems/hero';

/**
 * Emplacements de travail d'une source bloquante (2026-11-06, G50, decision
 * d'Antoine) : plusieurs Villageois ne se disputent plus un meme point autour
 * d'un arbre. Chaque case de chaque cote de l'emprise donne un emplacement au
 * milieu de la case voisine, au contact : arbre 1 x 1, les 4 positions cardinales ;
 * gisement 2 x 2, 8 positions sur ses 4 cotes. Jamais un coin ni le centre.
 *
 * Une unite RESERVE un emplacement precis en arrivant pres de la source
 * (HARVEST_RESERVE_RANGE), et travaille la, ancree : la separation ne la deplace
 * plus. La reservation disparait avec l'ordre (annule, depart au depot, autre
 * source), la source ou l'unite (syncHarvestReservations, a chaque pas) : un
 * Villageois qui revient du depot en reprend une, pas forcement la meme. Plus de
 * place : un ordre manuel se reporte aussitot sur une source voisine du meme type
 * (findRedirectHarvestSource), sinon il s'arrete ; aucune attente.
 * Etat par unite, hors simulation sauvegardee, comme NavState (sim/systems/movement.ts).
 */
export interface HarvestWorkStand {
  /** Rang stable de l'emplacement autour de cette source. */
  slot: number;
  x: number;
  z: number;
}

/** Reservation d'un emplacement. */
export interface HarvestReservation extends HarvestWorkStand {
  entityId: number;
  resourceNodeId: number;
  /** Rayon du corps qui l'occupe : un voisin trop proche compte comme occupe. */
  radius: number;
}

/** Point de travail choisi, avec son rang. */
export type ChosenHarvestStand = WorkStand & { slot: number };

/** Un emplacement a moins de cette distance d'un point en echec est ecarte. */
const AVOID_RADIUS = 0.3;
/** Unite ancree : deja a son emplacement. */
const ANCHOR_DISTANCE = 0.03;

const reservations = new WeakMap<Entity, HarvestReservation>();

/** Emplacements autour de l'emprise, pour un corps de rayon `radius`. Ordre stable :
 *  nord, sud par case, puis ouest, est par case. Les rangs ne dependent pas du rayon :
 *  le Heros et un Villageois parlent du meme emplacement. */
export function harvestStandSlots(box: ObstacleBounds, radius: number): HarvestWorkStand[] {
  const standoff = radius + HARVEST_STAND_GAP;
  const out: HarvestWorkStand[] = [];
  const push = (x: number, z: number): void => {
    out.push({ slot: out.length, x, z });
  };
  for (let cx = Math.floor(box.minX) + 0.5; cx < box.maxX; cx += 1) {
    push(cx, box.minZ - standoff);
    push(cx, box.maxZ + standoff);
  }
  for (let cz = Math.floor(box.minZ) + 0.5; cz < box.maxZ; cz += 1) {
    push(box.minX - standoff, cz);
    push(box.maxX + standoff, cz);
  }
  return out;
}

/** Emplacements de cette source ou un corps de ce rayon peut vraiment se tenir. */
function usableStands(box: ObstacleBounds, radius: number, obstacles: ObstacleDef[], grid: PathGrid): HarvestWorkStand[] {
  return harvestStandSlots(box, radius).filter((s) => !isTileBlockedAt(grid, s.x, s.z) && bodyFitsAt(s.x, s.z, radius, obstacles));
}

/** Combien d'unites de ce rayon cette source peut faire travailler a la fois. */
export function harvestStandCapacity(box: ObstacleBounds, radius: number, obstacles: ObstacleDef[], grid: PathGrid): number {
  return usableStands(box, radius, obstacles, grid).length;
}

export function harvestReservationOf(e: Entity): HarvestReservation | null {
  return reservations.get(e) ?? null;
}

export function releaseHarvestStand(e: Entity): void {
  reservations.delete(e);
}

/** Vrai si l'unite est deja a son emplacement : elle y reste, la separation ne la
 *  pousse plus et les autres contournent (pas d'alternance autour du tronc). */
export function isHarvestAnchored(e: Entity): boolean {
  const r = reservations.get(e);
  return r !== undefined && Math.hypot(r.x - e.x, r.z - e.z) <= ANCHOR_DISTANCE;
}

/** Reservations qui n'ont plus lieu d'etre : unite morte, autre ordre (annulation,
 *  depart au depot, autre source), Provocation, source epuisee ou disparue. Rien a
 *  liberer a la main ailleurs : une fois par pas, deterministe. */
export function syncHarvestReservations(entities: readonly Entity[], work: Pick<HeroWorkContext, 'nodes' | 'nodeAmounts'>): void {
  for (const e of entities) {
    const r = reservations.get(e);
    if (!r) continue;
    const order = e.order;
    const stillWanted = e.alive && order.type === 'harvest' && order.nodeId === r.resourceNodeId && e.tauntSourceId === null;
    if (!stillWanted || !work.nodes.has(r.resourceNodeId) || (work.nodeAmounts.get(r.resourceNodeId) ?? 1) <= 0) reservations.delete(e);
  }
}

/** Emplacements libres d'une source pour `e` : ni pris par une autre unite, ni trop
 *  pres d'un emplacement pris (selon les rayons, sources voisines comprises : deux arbres
 *  colles peuvent partager un point), corps qui y tient. */
function freeStands(e: Entity, box: ObstacleBounds, entities: readonly Entity[], obstacles: ObstacleDef[], grid: PathGrid, avoid: readonly { x: number; z: number }[] = []): HarvestWorkStand[] {
  const r = e.stats.radius;
  const taken: HarvestReservation[] = [];
  for (const o of entities) {
    const t = reservations.get(o);
    if (t && o !== e && o.alive) taken.push(t);
  }
  return usableStands(box, r, obstacles, grid).filter((s) => !taken.some((t) => Math.hypot(t.x - s.x, t.z - s.z) < t.radius + r) && !avoid.some((a) => Math.hypot(a.x - s.x, a.z - s.z) < AVOID_RADIUS));
}

/**
 * Source de remplacement d'un ordre manuel dont la source n'a plus de place
 * (2026-11-06, decision d'Antoine) : meme type (jamais du bois vers de la pierre),
 * encore exploitable, visible, a HARVEST_REDIRECT_RANGE de la source visee par le
 * joueur (`from`), non saturee, avec un emplacement libre relie a l'unite a
 * HARVEST_REDIRECT_MAX_WALK a pied. La plus proche a pied ; egalite : l'id le plus bas.
 * Une seule inondation de la grille, aucun A*, seulement si un candidat existe. Deterministe.
 */
export function findRedirectHarvestSource(e: Entity, nodeId: number, from: { x: number; z: number }, entities: readonly Entity[], work: Pick<HeroWorkContext, 'nodes' | 'nodeAmounts' | 'canHarvest' | 'isVisible' | 'harvestStandCapacity'>, obstacles: ObstacleDef[], grid: PathGrid): number | null {
  const current = work.nodes.get(nodeId);
  const start = freeTileNear(grid, obstacles, e.x, e.z) ?? nearestFreeTileAt(grid, e.x, e.z);
  if (!current || !start) return null;
  let dist: Int32Array | null = null;
  let bestId: number | null = null;
  let bestWalk = Infinity;
  for (const n of work.nodes.values()) {
    if (n.id === nodeId || n.resource !== current.resource || !n.block || (work.nodeAmounts.get(n.id) ?? 1) <= 0) continue;
    if (Math.hypot(n.x - from.x, n.z - from.z) > HARVEST_REDIRECT_RANGE || !work.canHarvest(n.resource) || !work.isVisible(n.x, n.z)) continue;
    if (harvestSourceSaturated(e, n.id, entities, work)) continue;
    for (const s of freeStands(e, n.block, entities, obstacles, grid)) {
      if (!dist) {
        const t = tileAt(grid, start.x, start.z);
        dist = walkDistances(grid, t.x, t.z);
      }
      const tile = tileAt(grid, s.x, s.z);
      const walked = dist[tile.z * grid.width + tile.x]!;
      if (walked < 0 || walked > HARVEST_REDIRECT_MAX_WALK) continue;
      if (walked < bestWalk || (walked === bestWalk && bestId !== null && n.id < bestId)) {
        bestWalk = walked;
        bestId = n.id;
      }
    }
  }
  return bestId;
}

/**
 * Reserve pour `e` l'emplacement libre le plus proche a pied : ni pris par une
 * autre unite, ni trop pres d'un emplacement pris (selon les rayons), corps qui y
 * tient, relie a l'unite (une inondation de la grille, aucun A* ; seulement s'il
 * reste un emplacement libre). Egalite : a vol d'oiseau, puis le rang. null : rien
 * de libre ou de joignable. Deterministe.
 */
export function reserveHarvestStand(e: Entity, nodeId: number, box: ObstacleBounds, entities: readonly Entity[], obstacles: ObstacleDef[], grid: PathGrid, avoid: readonly { x: number; z: number }[] = []): ChosenHarvestStand | null {
  const r = e.stats.radius;
  const free = freeStands(e, box, entities, obstacles, grid, avoid);
  if (free.length === 0) return null;
  const start = freeTileNear(grid, obstacles, e.x, e.z) ?? nearestFreeTileAt(grid, e.x, e.z);
  if (!start) return null;
  const from = tileAt(grid, start.x, start.z);
  const dist = walkDistances(grid, from.x, from.z);
  let best: HarvestWorkStand | null = null;
  let bestWalk = Infinity;
  let bestLine = Infinity;
  for (const s of free) {
    const t = tileAt(grid, s.x, s.z);
    const walked = dist[t.z * grid.width + t.x]!;
    if (walked < 0) continue;
    const line = Math.hypot(s.x - e.x, s.z - e.z);
    if (walked < bestWalk || (walked === bestWalk && line < bestLine - 1e-9)) {
      best = s;
      bestWalk = walked;
      bestLine = line;
    }
  }
  if (!best) return null;
  reservations.set(e, { entityId: e.id, resourceNodeId: nodeId, slot: best.slot, x: best.x, z: best.z, radius: r });
  return { slot: best.slot, x: best.x, z: best.z, routeX: best.x, routeZ: best.z };
}

/**
 * Vrai si la source a autant d'unites engagees que d'emplacements : elle n'est pas
 * proposee a un choix automatique (sim/systems/workers.ts, source voisine de
 * sim/systems/cargo.ts). Comptees : recolte de cette source, depot avec retour vers
 * elle (Villageois), emplacement reserve (Heros compris). `e` ne se compte pas.
 */
export function harvestSourceSaturated(e: Entity, nodeId: number, entities: readonly Entity[], work: Pick<HeroWorkContext, 'harvestStandCapacity'>): boolean {
  let engaged = 0;
  for (const o of entities) {
    if (o === e || !o.alive) continue;
    const order = o.order;
    const back = o.cargo?.returnTo ?? null;
    if (reservations.get(o)?.resourceNodeId === nodeId || (o.worker !== null && ((order.type === 'harvest' && order.nodeId === nodeId) || (order.type === 'deposit' && back?.kind === 'node' && back.nodeId === nodeId)))) engaged++;
  }
  // Rien d'engage : pas de calcul (le test sert des dizaines d'arbres non travailles).
  return engaged > 0 && engaged >= work.harvestStandCapacity(e, nodeId);
}
