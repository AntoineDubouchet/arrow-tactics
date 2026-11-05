import { obstacleBounds, TILE, type ObstacleDef } from '../config/constants';
import { orientedBoxBounds, orientedBoxOverlapsRect } from '../core/orientedBox';
import { wallLineCells } from '../core/wallLine';

/**
 * Pathfinding en grille (2026-08-10, voir CLAUDE.md, "Correctif de
 * contournement d'obstacles denses") : remplace l'evitement reactif
 * coin-par-coin (sim/systems/movement.ts, findSteeringPoint) pour la
 * poursuite d'une cible verrouillee, quand le chemin direct est bloque.
 * L'evitement reactif restait correct pour un decor CLAIRSEME (obstacles
 * isoles, comme le decor d'origine du jeu) mais butait sur des bosquets
 * DENSES (plusieurs arbres 1x1 quasi adjacents, voir la carte "vague1-20") :
 * choisir "le meilleur coin" localement, sans vue d'ensemble, peut mener
 * dans une impasse au milieu d'un bosquet — un vrai calcul de trajectoire
 * sur toute la carte ne peut pas se tromper de cette facon.
 *
 * Grille alignee sur les cases du plateau (TILE = 1, voir CLAUDE.md "Unite
 * de mesure : la case") : une case est bloquee si un obstacle quelconque la
 * recouvre, exactement la meme regle que la collision physique
 * (resolveObstacleCollisions) — pas de marge d'evitement ici, volontairement :
 * la grille sert a trouver une route GROSSIERE qui evite les vrais murs, la
 * precision fine (separation, marge d'evitement) reste geree par le mouvement
 * local existant une fois la case cible du prochain pas de cheminement visee.
 *
 * Batiments poses librement (2026-11-06, G48) : la pose est continue, la
 * navigation reste en grille. L'empreinte + navigationPadding est rasterisee :
 * toute case qu'elle touche est bloquee. Le centre d'une case libre est donc a
 * au moins 0,5 + marge d'un batiment : un passage trop etroit pour un corps se
 * ferme de lui-meme, sans test de connectivite. Prudence assumee : un passage
 * physiquement suffisant mais mal cale sur la grille peut etre ferme pour A*.
 */

export interface PathGrid {
  width: number;
  height: number;
  halfW: number;
  halfH: number;
  /** true = case occupee par un obstacle, jamais traversable. */
  blocked: Uint8Array;
  /** Aretes bloquees par case (falaises du relief, ObstacleDef.terrainCliff) :
   *  bits EDGE_EAST / EDGE_WEST / EDGE_SOUTH / EDGE_NORTH. Toujours a 0 sur
   *  une carte plate. */
  edges: Uint8Array;
}

const EDGE_EAST = 1;
const EDGE_WEST = 2;
const EDGE_SOUTH = 4;
const EDGE_NORTH = 8;

/** Reconstruite a chaque appel de movementSystem (voir son commentaire) :
 *  O(obstacles), largement assez rapide vu leur nombre (quelques dizaines a
 *  quelques centaines) compare a la frequence d'appel (30 Hz). */
export function buildPathGrid(obstacles: ObstacleDef[], boardWidth: number, boardHeight: number): PathGrid {
  const halfW = (boardWidth * TILE) / 2;
  const halfH = (boardHeight * TILE) / 2;
  const blocked = new Uint8Array(boardWidth * boardHeight);
  const edges = new Uint8Array(boardWidth * boardHeight);

  for (const obstacle of obstacles) {
    // Piece de mur V2 : cases couvertes par sa ligne et son epaisseur
    // (core/wallLine.ts, wallLineCells) — une diagonale ne bloque pas tout son
    // rectangle, la chaine de cases reste etanche pour un A* sans coupe de
    // coin, et un couloir rogne par le mur n'est pas propose.
    if (obstacle.line) {
      for (const c of wallLineCells(obstacle.line, obstacle.line.halfWidth)) {
        const tx = Math.floor(c.x + halfW);
        const tz = Math.floor(c.z + halfH);
        if (tx >= 0 && tx < boardWidth && tz >= 0 && tz < boardHeight) blocked[tz * boardWidth + tx] = 1;
      }
      continue;
    }
    if (obstacle.footprint) {
      rasterizeFootprint(blocked, obstacle.footprint, boardWidth, boardHeight, halfW, halfH);
      continue;
    }
    const b = obstacleBounds(obstacle);
    if (obstacle.terrainCliff) {
      blockCliffEdges(edges, b, boardWidth, boardHeight, halfW, halfH);
      continue;
    }
    const minTx = Math.max(0, Math.floor(b.minX + halfW));
    const maxTx = Math.min(boardWidth - 1, Math.ceil(b.maxX + halfW) - 1);
    const minTz = Math.max(0, Math.floor(b.minZ + halfH));
    const maxTz = Math.min(boardHeight - 1, Math.ceil(b.maxZ + halfH) - 1);
    for (let tz = minTz; tz <= maxTz; tz++) {
      for (let tx = minTx; tx <= maxTx; tx++) {
        blocked[tz * boardWidth + tx] = 1;
      }
    }
  }

  return { width: boardWidth, height: boardHeight, halfW, halfH, blocked, edges };
}

/** Grilles en cache par REFERENCE de tableau d'obstacles (2026-11-02) :
 *  World.obstacles n'est jamais modifie sur place, toujours remplace (meme
 *  motif que sim/geometry.ts) ; avec les forets bloquantes, la reconstruire a
 *  chaque pas devenait inutilement couteux. */
const gridCache = new WeakMap<ObstacleDef[], PathGrid>();

export function cachedPathGrid(obstacles: ObstacleDef[], boardWidth: number, boardHeight: number): PathGrid {
  let grid = gridCache.get(obstacles);
  if (!grid || grid.width !== boardWidth || grid.height !== boardHeight) {
    grid = buildPathGrid(obstacles, boardWidth, boardHeight);
    gridCache.set(obstacles, grid);
  }
  return grid;
}

/** Bloque les cases touchees par l'empreinte elargie de sa marge de navigation. */
function rasterizeFootprint(blocked: Uint8Array, f: NonNullable<ObstacleDef['footprint']>, width: number, height: number, halfW: number, halfH: number): void {
  const pad = f.navigationPadding;
  const b = orientedBoxBounds(f, pad);
  const minTx = Math.max(0, Math.floor(b.minX + halfW));
  const maxTx = Math.min(width - 1, Math.ceil(b.maxX + halfW) - 1);
  const minTz = Math.max(0, Math.floor(b.minZ + halfH));
  const maxTz = Math.min(height - 1, Math.ceil(b.maxZ + halfH) - 1);
  for (let tz = minTz; tz <= maxTz; tz++) {
    for (let tx = minTx; tx <= maxTx; tx++) {
      const cell = { minX: tx - halfW, maxX: tx + 1 - halfW, minZ: tz - halfH, maxZ: tz + 1 - halfH };
      if (orientedBoxOverlapsRect(f, cell, pad)) blocked[tz * width + tx] = 1;
    }
  }
}

/** Falaise (segment sur une ligne de la grille, voir computeCliffObstacles) :
 *  bloque l'arete ENTIERE de chaque case qu'elle touche — meme quand le
 *  segment de collision est raccourci au pied d'une pente — sans bloquer
 *  les cases elles-memes. */
function blockCliffEdges(edges: Uint8Array, b: { minX: number; maxX: number; minZ: number; maxZ: number }, width: number, height: number, halfW: number, halfH: number): void {
  const mark = (tx: number, tz: number, bit: number) => {
    if (tx >= 0 && tx < width && tz >= 0 && tz < height) edges[tz * width + tx]! |= bit;
  };
  if (b.maxX - b.minX < b.maxZ - b.minZ) {
    const line = Math.round((b.minX + b.maxX) / 2 + halfW);
    for (let tz = Math.floor(b.minZ + halfH + 1e-6); tz < Math.ceil(b.maxZ + halfH - 1e-6); tz++) {
      mark(line - 1, tz, EDGE_EAST);
      mark(line, tz, EDGE_WEST);
    }
  } else {
    const line = Math.round((b.minZ + b.maxZ) / 2 + halfH);
    for (let tx = Math.floor(b.minX + halfW + 1e-6); tx < Math.ceil(b.maxX + halfW - 1e-6); tx++) {
      mark(tx, line - 1, EDGE_SOUTH);
      mark(tx, line, EDGE_NORTH);
    }
  }
}

/** Vrai si un pas orthogonal (dx, dz) depuis la case (tx, tz) franchit une
 *  falaise. */
function edgeBlocked(grid: PathGrid, tx: number, tz: number, dx: number, dz: number): boolean {
  if (tx < 0 || tx >= grid.width || tz < 0 || tz >= grid.height) return false;
  const bits = grid.edges[tz * grid.width + tx]!;
  if (dx === 1) return (bits & EDGE_EAST) !== 0;
  if (dx === -1) return (bits & EDGE_WEST) !== 0;
  if (dz === 1) return (bits & EDGE_SOUTH) !== 0;
  return (bits & EDGE_NORTH) !== 0;
}

/** Pas (orthogonal ou diagonal) sans traverser de falaise : une diagonale
 *  exige les quatre aretes autour du coin franchi libres (aucune coupe de
 *  coin le long d'une falaise). */
function stepCrossesCliff(grid: PathGrid, x: number, z: number, dx: number, dz: number): boolean {
  if (dx === 0 || dz === 0) return edgeBlocked(grid, x, z, dx, dz);
  return (
    edgeBlocked(grid, x, z, dx, 0) ||
    edgeBlocked(grid, x, z, 0, dz) ||
    edgeBlocked(grid, x + dx, z, 0, dz) ||
    edgeBlocked(grid, x, z + dz, dx, 0)
  );
}

function worldToTileX(grid: PathGrid, x: number): number {
  return Math.min(grid.width - 1, Math.max(0, Math.floor(x + grid.halfW)));
}
function worldToTileZ(grid: PathGrid, z: number): number {
  return Math.min(grid.height - 1, Math.max(0, Math.floor(z + grid.halfH)));
}

export function tileToWorldX(grid: PathGrid, tx: number): number {
  return tx - grid.halfW + 0.5;
}
export function tileToWorldZ(grid: PathGrid, tz: number): number {
  return tz - grid.halfH + 0.5;
}

function isBlocked(grid: PathGrid, tx: number, tz: number): boolean {
  if (tx < 0 || tx >= grid.width || tz < 0 || tz >= grid.height) return true;
  return grid.blocked[tz * grid.width + tx] === 1;
}

/** Case libre la plus proche de (tx, tz) par recherche en anneaux
 *  concentriques — sert de but de repli quand la case de la cible EST elle
 *  meme bloquee (ex. cible collee contre un arbre) : chercher un chemin
 *  vers une case impraticable echouerait toujours autrement. */
function nearestFreeTile(grid: PathGrid, tx: number, tz: number): { x: number; z: number } | null {
  if (!isBlocked(grid, tx, tz)) return { x: tx, z: tz };
  const maxRadius = Math.max(grid.width, grid.height);
  for (let r = 1; r <= maxRadius; r++) {
    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        const x = tx + dx;
        const z = tz + dz;
        if (!isBlocked(grid, x, z)) return { x, z };
      }
    }
  }
  return null;
}

const NEIGHBORS: readonly [number, number, number][] = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, Math.SQRT2],
  [1, -1, Math.SQRT2],
  [-1, 1, Math.SQRT2],
  [-1, -1, Math.SQRT2],
];

/**
 * A* case par case (8 directions, cout euclidien) de (fromX, fromZ) vers
 * (toX, toZ) — renvoie une liste de POINTS MONDE (centres de case), du
 * premier pas apres le depart jusqu'a la case d'arrivee (sans inclure la
 * case de depart elle-meme), ou null si aucune route n'existe. Une diagonale
 * n'est autorisee que si les DEUX cases orthogonales adjacentes sont
 * libres — sans ce garde-fou, la trajectoire "coupe le coin" et traverse
 * visuellement l'angle d'un obstacle.
 */
export function findPath(grid: PathGrid, fromX: number, fromZ: number, toX: number, toZ: number): { x: number; z: number }[] | null {
  const startX = worldToTileX(grid, fromX);
  const startZ = worldToTileZ(grid, fromZ);
  let goalX = worldToTileX(grid, toX);
  let goalZ = worldToTileZ(grid, toZ);

  if (isBlocked(grid, goalX, goalZ)) {
    const free = nearestFreeTile(grid, goalX, goalZ);
    if (!free) return null;
    goalX = free.x;
    goalZ = free.z;
  }
  if (startX === goalX && startZ === goalZ) return [];

  const width = grid.width;
  const key = (x: number, z: number) => z * width + x;
  const cells = width * grid.height;
  const gScore = new Float64Array(cells).fill(Infinity);
  const cameFrom = new Int32Array(cells).fill(-1);
  const startKey = key(startX, startZ);
  gScore[startKey] = 0;

  const heuristic = (x: number, z: number) => Math.hypot(x - goalX, z - goalZ);

  // File de priorite : tas binaire (2026-11-02, cartes de 96 x 96 avec forets
  // bloquantes : l'ancien tableau trie a chaque pas devenait quadratique).
  // Ordre IDENTIQUE a l'ancien tri stable : plus petit f, puis premier insere.
  const open = new OpenHeap();
  open.push({ k: startKey, x: startX, z: startZ, f: heuristic(startX, startZ), seq: 0 });
  let seq = 1;
  const closed = new Uint8Array(cells);

  while (open.size > 0) {
    const current = open.pop();
    if (current.x === goalX && current.z === goalZ) {
      const path: { x: number; z: number }[] = [];
      let k = current.k;
      while (k !== startKey) {
        const cx = k % width;
        const cz = Math.floor(k / width);
        path.push({ x: tileToWorldX(grid, cx), z: tileToWorldZ(grid, cz) });
        k = cameFrom[k]!;
      }
      path.reverse();
      return path;
    }
    if (closed[current.k]) continue;
    closed[current.k] = 1;

    for (const [dx, dz, cost] of NEIGHBORS) {
      const nx = current.x + dx;
      const nz = current.z + dz;
      if (isBlocked(grid, nx, nz)) continue;
      // Anti-coupe-de-coin : une diagonale exige que les deux cases
      // orthogonales adjacentes soient libres aussi.
      if (dx !== 0 && dz !== 0 && (isBlocked(grid, current.x + dx, current.z) || isBlocked(grid, current.x, current.z + dz))) continue;
      // Relief : jamais a travers une falaise (une pente n'a aucune arete
      // bloquee dans le sens de la montee).
      if (stepCrossesCliff(grid, current.x, current.z, dx, dz)) continue;

      const nk = key(nx, nz);
      if (closed[nk]) continue;
      const tentativeG = gScore[current.k]! + cost;
      if (tentativeG < gScore[nk]!) {
        gScore[nk] = tentativeG;
        cameFrom[nk] = current.k;
        open.push({ k: nk, x: nx, z: nz, f: tentativeG + heuristic(nx, nz), seq: seq++ });
      }
    }
  }

  return null;
}

interface OpenNode {
  k: number;
  x: number;
  z: number;
  f: number;
  /** Rang d'insertion : departage les f egaux (premier insere d'abord). */
  seq: number;
}

/** Tas binaire minimal de findPath, ordonne par (f, seq). */
class OpenHeap {
  private readonly items: OpenNode[] = [];

  get size(): number {
    return this.items.length;
  }

  private static before(a: OpenNode, b: OpenNode): boolean {
    return a.f < b.f || (a.f === b.f && a.seq < b.seq);
  }

  push(node: OpenNode): void {
    const items = this.items;
    items.push(node);
    let i = items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (!OpenHeap.before(items[i]!, items[parent]!)) break;
      [items[i], items[parent]] = [items[parent]!, items[i]!];
      i = parent;
    }
  }

  pop(): OpenNode {
    const items = this.items;
    const top = items[0]!;
    const last = items.pop()!;
    if (items.length > 0) {
      items[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let best = i;
        if (l < items.length && OpenHeap.before(items[l]!, items[best]!)) best = l;
        if (r < items.length && OpenHeap.before(items[r]!, items[best]!)) best = r;
        if (best === i) break;
        [items[i], items[best]] = [items[best]!, items[i]!];
        i = best;
      }
    }
    return top;
  }
}

/**
 * Cases atteignables a pied depuis (fromX, fromZ) (2026-11-02, apparitions
 * des vagues) : meme regles que findPath (cases bloquees, falaises ; une
 * diagonale n'ouvrant jamais un passage que deux pas orthogonaux n'ouvrent
 * pas, la connexite se calcule en 4 directions). Depart sur une case bloquee
 * (emprise de la Baliste...) : depuis la case libre la plus proche.
 * Renvoie 1 par case atteignable (index z * width + x), ou null.
 */
export function reachableTiles(grid: PathGrid, fromX: number, fromZ: number): Uint8Array | null {
  const start = nearestFreeTile(grid, worldToTileX(grid, fromX), worldToTileZ(grid, fromZ));
  if (!start) return null;
  const seen = new Uint8Array(grid.width * grid.height);
  const queue: number[] = [start.z * grid.width + start.x];
  seen[queue[0]!] = 1;
  for (let head = 0; head < queue.length; head++) {
    const k = queue[head]!;
    const x = k % grid.width;
    const z = Math.floor(k / grid.width);
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = x + dx;
      const nz = z + dz;
      if (isBlocked(grid, nx, nz) || edgeBlocked(grid, x, z, dx, dz)) continue;
      const nk = nz * grid.width + nx;
      if (seen[nk]) continue;
      seen[nk] = 1;
      queue.push(nk);
    }
  }
  return seen;
}

/** Case libre RELIEE a (fromX, fromZ) la plus proche de (toX, toZ), au centre de
 *  case (2026-11-06, G48) : pres d'un batiment pose librement, la case libre la
 *  plus proche peut etre une poche fermee par ses voisins. Null : aucune a moins
 *  de `maxRadius` cases. */
export function nearestReachableTile(grid: PathGrid, fromX: number, fromZ: number, toX: number, toZ: number, maxRadius: number): { x: number; z: number } | null {
  const reach = reachableTiles(grid, fromX, fromZ);
  if (!reach) return null;
  const gx = worldToTileX(grid, toX);
  const gz = worldToTileZ(grid, toZ);
  for (let r = 0; r <= maxRadius; r++) {
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        const x = gx + dx;
        const z = gz + dz;
        if (x >= 0 && x < grid.width && z >= 0 && z < grid.height && reach[z * grid.width + x] === 1) return { x: tileToWorldX(grid, x), z: tileToWorldZ(grid, z) };
      }
    }
  }
  return null;
}

/** Vrai si la case du point monde (x, z) est marquee dans `reach`. */
export function isReachable(grid: PathGrid, reach: Uint8Array, x: number, z: number): boolean {
  const tx = Math.floor(x + grid.halfW);
  const tz = Math.floor(z + grid.halfH);
  if (tx < 0 || tx >= grid.width || tz < 0 || tz >= grid.height) return false;
  return reach[tz * grid.width + tx] === 1;
}

/** Vrai si la case du point monde (x, z) est bloquee (obstacle). */
export function isTileBlockedAt(grid: PathGrid, x: number, z: number): boolean {
  return isBlocked(grid, Math.floor(x + grid.halfW), Math.floor(z + grid.halfH));
}
