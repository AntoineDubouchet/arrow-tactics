import { Rng } from '../../core/rng';
import type { ObstacleDef } from '../constants';
import type { SurfaceCellDef } from '../groundSurfaces';
import type { MapCampDef, MapDef, TerrainCellDef } from '../mapDef';
import type { ResourcePileDef } from '../resourceNodes';
import type { SlopeDirection, SlopeShape, TerrainElevationCellDef } from '../terrainElevation';
import type { TerritoryCell } from '../territory';

/**
 * Carte de Survie PROCEDURALE (2026-11-01, direction Hero RTS) : disque de
 * 96 x 96 cases, Heros et Baliste au centre, plaine centrale plate et seche,
 * monde de plus en plus sauvage en s'eloignant (forets, collines a rampe,
 * mares, rochers, petits tas de bois et de pierre a ramasser). Deterministe :
 * une meme graine donne exactement la meme carte (aucun Math.random).
 * 2026-11-02 : arbres BLOQUANTS (massifs separes par des sentiers, toute
 * zone praticable reliee au camp) et tas de ressources trois fois plus rares.
 *
 * Valeurs PROVISOIRES (rayons, densites, nombres), voir
 * docs/DESIGN_DECISIONS.md G6. 2026-11-02 : camp neutre (placeCamps,
 * data/camps.ts), hors de la zone exploree au depart.
 */
export const PROCEDURAL_MAP_SIZE = 96;

/** Rayon (cases) du disque de la carte, depuis le centre de la Baliste. */
const MAP_RADIUS = 46.5;
/** Plaine centrale garantie : sans relief, eau, arbre ni rocher. */
const CLEAR_RADIUS = 11;
/** Territoire du joueur (pose des batiments et de l'armee). */
const TERRITORY_RADIUS = 8;
/** Anneau des apparitions ennemies (main.ts, computeEnemyWavePlan) : sans
 *  colline ni eau, pour qu'un groupe trouve toujours ses cases. */
export const ENEMY_SPAWN_RING_RADIUS = 22;
const SPAWN_RING_CLEARANCE = 4;
/** Poche praticable isolee par les arbres : comblee en dessous de cette
 *  taille (cases), reliee au camp par un couloir au-dela. */
const POCKET_FILL = 8;
/** Rampe d'une colline (2026-11-02, KI-39) : RAMP_WIDTH cases de pente
 *  cote a cote (le plus gros corps terrestre, rayon 0,7, y passe a l'aise,
 *  plusieurs unites aussi), bords evases par une pente de coin quand la
 *  colline s'y prete. */
const RAMP_WIDTH = 3;

/** Secteurs d'apparition d'une vague sur l'anneau (choix d'Antoine,
 *  2026-11-01 : direction qui tourne a chaque vague, angle d'or) : celui de
 *  la vague d'abord, puis 11 secteurs de repli de plus en plus eloignes
 *  (2026-11-02 : la simulation garde le premier qui a assez de cases reliees
 *  au camp, sim/systems/enemyReinforcements.ts). Zones de 9 x 9 cases. */
export function ringSpawnSectors(waveNumber: number, center: { x: number; z: number }): { x: number; z: number; zone: { minX: number; maxX: number; minZ: number; maxZ: number } }[] {
  const base = (waveNumber - 1) * 2.399963 - Math.PI / 2;
  return [0, 1, -1, 2, -2, 3, -3, 4, -4, 5, -5, 6].map((k) => {
    const angle = base + (k * Math.PI * 2) / 12;
    const x = Math.floor(center.x + Math.cos(angle) * ENEMY_SPAWN_RING_RADIUS) + 0.5;
    const z = Math.floor(center.z + Math.sin(angle) * ENEMY_SPAWN_RING_RADIUS) + 0.5;
    return { x, z, zone: { minX: x - 4.5, maxX: x + 4.5, minZ: z - 4.5, maxZ: z + 4.5 } };
  });
}

/** Arbres Kenney (meme melange que le pinceau Foret « Mixte » de l'editeur). */
const TREE_MODELS = ['tree_default', 'tree_oak', 'tree_detailed', 'tree_fat', 'tree_pineDefaultA', 'tree_pineRoundA', 'tree_pineTallA', 'tree_cone'];
/** Petits decors (echelles de l'arene officielle). */
const PROPS: readonly { model: string; scale: number }[] = [
  { model: 'plant_bush', scale: 0.4 },
  { model: 'plant_bushDetailed', scale: 0.6 },
  { model: 'plant_flatShort', scale: 0.28 },
  { model: 'flower_purpleA', scale: 0.18 },
  { model: 'flower_yellowA', scale: 0.18 },
  { model: 'stump_round', scale: 0.37 },
];

/** Bruit de valeur lisse, deterministe (graine, coordonnees continues). */
function hash2(seed: number, x: number, z: number): number {
  let h = (seed ^ Math.imul(x | 0, 374761393) ^ Math.imul(z | 0, 668265263)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function valueNoise(seed: number, x: number, z: number): number {
  const x0 = Math.floor(x), z0 = Math.floor(z);
  const fx = x - x0, fz = z - z0;
  const sx = fx * fx * (3 - 2 * fx), sz = fz * fz * (3 - 2 * fz);
  const a = hash2(seed, x0, z0), b = hash2(seed, x0 + 1, z0), c = hash2(seed, x0, z0 + 1), d = hash2(seed, x0 + 1, z0 + 1);
  return a + (b - a) * sx + (c - a) * sz + (a - b - c + d) * sx * sz;
}

function fbm(seed: number, x: number, z: number): number {
  return 0.65 * valueNoise(seed, x, z) + 0.35 * valueNoise(seed + 101, x * 2.1, z * 2.1);
}

/** Distance (cases) du centre de la case (x, z) au centre de la Baliste. */
function centerDistance(x: number, z: number): number {
  return Math.hypot(x, z);
}

/** Cases d'une carte en cours de generation (cles `x,z`). */
interface NavCells {
  inMap: ReadonlySet<string>;
  water: ReadonlySet<string>;
  hill: ReadonlySet<string>;
  ramps: ReadonlySet<string>;
  /** Sens de montee des rampes droites (les pentes de coin des bords
   *  evases sont des cases basses ordinaires pour la navigation). */
  rampSlopes: ReadonlyMap<string, SlopeDirection>;
  trees: ReadonlySet<string>;
}

/** Pas d'une case vers sa voisine dans le sens de montee d'une pente. */
const SLOPE_STEP: Readonly<Record<SlopeDirection, [number, number]>> = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] };
/** Pentes de coin des bords evases d'une rampe, par sens de montee : la case
 *  au bout « gauche » (cote -perpendiculaire) et « droit » ; leur arete
 *  commune avec la rampe a les memes hauteurs (aucune falaise). */
const RAMP_FLARES: Readonly<Record<SlopeDirection, { minus: SlopeShape; plus: SlopeShape }>> = {
  N: { minus: 'NE', plus: 'NW' },
  S: { minus: 'SE', plus: 'SW' },
  E: { minus: 'SE', plus: 'NE' },
  W: { minus: 'SW', plus: 'NW' },
};

/**
 * Rampe de RAMP_WIDTH cases d'une colline (2026-11-02, KI-39), sur le cote
 * tourne vers le camp : cases de pente au pied de la rangee extreme de la
 * colline dans cette direction, plateau complete au-dessus si besoin, bords
 * evases par une pente de coin (si la colline les borde), abords degages
 * (une rangee devant, le plateau au-dessus). Null si la place manque.
 */
function placeRamp(
  h: { x: number; z: number; r: number },
  free: (x: number, z: number) => boolean,
  isHill: (x: number, z: number) => boolean,
): { cells: { x: number; z: number; slope: SlopeShape; straight: boolean }[]; plateau: { x: number; z: number }[]; clear: { x: number; z: number }[] } | null {
  // Direction cardinale vers le camp (centre de la carte) ; la pente monte a l'oppose.
  const toCenter: [number, number] = Math.abs(h.x) >= Math.abs(h.z) ? [h.x > 0 ? -1 : 1, 0] : [0, h.z > 0 ? -1 : 1];
  const slope = (Object.keys(SLOPE_STEP) as SlopeDirection[]).find((s) => SLOPE_STEP[s][0] === -toCenter[0] && SLOPE_STEP[s][1] === -toCenter[1])!;
  const [ux, uz] = SLOPE_STEP[slope];
  const [px, pz] = [Math.abs(uz), Math.abs(ux)];
  const cx = Math.round(h.x), cz = Math.round(h.z);
  // Pied de la rangee extreme de la colline vers le camp, sur l'axe du centre.
  let k = 0;
  while (isHill(cx - ux * (k + 1), cz - uz * (k + 1))) k++;
  if (k === 0 && !isHill(cx, cz)) return null;
  const half = (RAMP_WIDTH - 1) / 2;
  const cells: { x: number; z: number; slope: SlopeShape; straight: boolean }[] = [];
  const plateau: { x: number; z: number }[] = [];
  const clear: { x: number; z: number }[] = [];
  for (let i = -half; i <= half; i++) {
    const rx = cx - ux * (k + 1) + px * i, rz = cz - uz * (k + 1) + pz * i;
    if (!free(rx, rz) || isHill(rx, rz) || !free(rx - ux, rz - uz) || isHill(rx - ux, rz - uz)) return null;
    cells.push({ x: rx, z: rz, slope, straight: true });
    // Plateau au-dessus de la rampe (et la rangee suivante) : colline.
    for (const step of [1, 2]) {
      const tx = rx + ux * step, tz = rz + uz * step;
      if (!free(tx, tz)) return null;
      if (!isHill(tx, tz)) plateau.push({ x: tx, z: tz });
    }
    clear.push({ x: rx, z: rz }, { x: rx - ux, z: rz - uz }, { x: rx + ux, z: rz + uz }, { x: rx + ux * 2, z: rz + uz * 2 });
  }
  // Bords evases : pente de coin au bout de la rampe si la colline la borde.
  for (const [side, shape] of [[-1, RAMP_FLARES[slope].minus], [1, RAMP_FLARES[slope].plus]] as const) {
    const fx = cx - ux * (k + 1) + px * side * (half + 1), fz = cz - uz * (k + 1) + pz * side * (half + 1);
    if (!free(fx, fz) || isHill(fx, fz)) continue;
    const above = isHill(fx + ux, fz + uz) || plateau.some((c) => c.x === fx + ux && c.z === fz + uz);
    if (!above || !free(fx - ux, fz - uz) || isHill(fx - ux, fz - uz)) continue;
    cells.push({ x: fx, z: fz, slope: shape, straight: false });
    clear.push({ x: fx, z: fz }, { x: fx - ux, z: fz - uz });
  }
  return { cells, plateau, clear };
}

/** Meme carte en grille (index (z + demi-cote) x cote + (x + demi-cote)),
 *  pour les passes de mise en forme des forets. `rampUp` : case haute d'une
 *  rampe (la colline voisine), -1 ailleurs. */
interface NavGrid {
  size: number;
  half: number;
  inMap: Uint8Array;
  water: Uint8Array;
  hill: Uint8Array;
  rampUp: Int32Array;
  tree: Uint8Array;
}

function toNavGrid(n: NavCells): NavGrid {
  const size = PROCEDURAL_MAP_SIZE, half = size / 2;
  const g: NavGrid = { size, half, inMap: new Uint8Array(size * size), water: new Uint8Array(size * size), hill: new Uint8Array(size * size), rampUp: new Int32Array(size * size).fill(-1), tree: new Uint8Array(size * size) };
  const index = (k: string) => {
    const [x, z] = k.split(',').map(Number) as [number, number];
    return (z + half) * size + (x + half);
  };
  for (const k of n.inMap) g.inMap[index(k)] = 1;
  for (const k of n.water) g.water[index(k)] = 1;
  for (const k of n.hill) g.hill[index(k)] = 1;
  for (const k of n.trees) g.tree[index(k)] = 1;
  for (const [k, slope] of n.rampSlopes) {
    const [dx, dz] = SLOPE_STEP[slope];
    g.rampUp[index(k)] = index(k) + dz * size + dx;
  }
  return g;
}

/** Les quatre voisins d'une case (bord de grille : -1). */
function neighbors(g: NavGrid, i: number): [number, number, number, number] {
  const x = i % g.size;
  return [x + 1 < g.size ? i + 1 : -1, x > 0 ? i - 1 : -1, i + g.size < g.size * g.size ? i + g.size : -1, i >= g.size ? i - g.size : -1];
}

/** Pas a pied de la case `a` vers sa voisine `b`, arbres ignores : sur la
 *  carte, sans eau, au meme niveau, ou par une rampe (sa case haute dans le
 *  sens de la pente, sa case basse a l'oppose ; flancs = falaises, comme
 *  config/terrainElevation.ts pour les collines de ce generateur). */
function stepAllowed(g: NavGrid, a: number, b: number): boolean {
  if (b < 0 || !g.inMap[b] || g.water[b]) return false;
  const ra = g.rampUp[a]!, rb = g.rampUp[b]!;
  if (ra >= 0) return b === ra || (b === 2 * a - ra && !g.hill[b]);
  if (rb >= 0) return a === rb || (a === 2 * b - rb && !g.hill[a]);
  return g.hill[a] === g.hill[b];
}

/** Cases praticables (sans arbre) reliees a la case du camp (0, 0). */
function reachableGrid(g: NavGrid): Uint8Array {
  const seen = new Uint8Array(g.size * g.size);
  const start = g.half * g.size + g.half;
  const queue = [start];
  seen[start] = 1;
  for (let head = 0; head < queue.length; head++) {
    const i = queue[head]!;
    for (const j of neighbors(g, i)) {
      if (j < 0 || seen[j] || g.tree[j] || !stepAllowed(g, i, j)) continue;
      seen[j] = 1;
      queue.push(j);
    }
  }
  return seen;
}

/** Cases praticables reliees au camp (cles `x,z`). */
function reachableCells(n: NavCells): Set<string> {
  const g = toNavGrid(n);
  const seen = reachableGrid(g);
  const out = new Set<string>();
  for (let i = 0; i < seen.length; i++) if (seen[i]) out.add(`${(i % g.size) - g.half},${Math.floor(i / g.size) - g.half}`);
  return out;
}

/**
 * Mise en forme des forets (arbres bloquants, 2026-11-02), en place sur
 * `trees` et `keepClear`, deterministe :
 *  1. goulets d'une case : entre deux cases praticables voisines, un mur de
 *     chaque cote (arbre, eau, hors carte ou autre niveau) laisse moins de
 *     deux cases a un corps large. Dans une foret, les deux cases sont
 *     comblees (massif plein) ; ailleurs, sur un sentier ou un couloir
 *     (`keepClear`), un arbre voisin est retire ;
 *  2. connexite : une poche praticable non reliee au camp est comblee si elle
 *     est petite, sinon reliee par un couloir de deux cases (arbres retires
 *     le long du plus court chemin a travers la foret).
 * Repete jusqu'a stabilite (bornee).
 */
function shapeForests(n: NavCells & { seed: number; trees: Set<string>; forestArea: ReadonlySet<string>; keepClear: Set<string> }): void {
  const g = toNavGrid(n);
  const size = g.size, half = g.half;
  const forest = new Uint8Array(size * size);
  const clear = new Uint8Array(size * size);
  const index = (k: string) => {
    const [x, z] = k.split(',').map(Number) as [number, number];
    return (z + half) * size + (x + half);
  };
  for (const k of n.forestArea) forest[index(k)] = 1;
  for (const k of n.keepClear) clear[index(k)] = 1;
  const cellsInMap: number[] = [];
  for (let i = 0; i < g.inMap.length; i++) if (g.inMap[i]) cellsInMap.push(i);
  const free = (i: number) => i >= 0 && g.inMap[i] === 1 && g.water[i] === 0 && g.tree[i] === 0;
  const hashOf = (i: number) => hash2(n.seed + 131, (i % size) - half, Math.floor(i / size) - half);

  for (let round = 0; round < 8; round++) {
    let changed = false;
    // 1. Goulets.
    for (let pass = 0; pass < 12; pass++) {
      let passChanged = false;
      for (const a of cellsInMap) {
        if (!free(a) || g.rampUp[a]! >= 0) continue;
        const [east, , south] = neighbors(g, a);
        for (const [b, perp] of [[east, size], [south, 1]] as const) {
          if (!free(b) || g.rampUp[b]! >= 0 || !stepAllowed(g, a, b)) continue;
          // Cotes du passage entre a et b (perpendiculaires au pas).
          const wall = (i: number) => !free(i) || g.hill[i] !== g.hill[a];
          const sides = [a - perp, b - perp, a + perp, b + perp];
          if (!(wall(sides[0]!) || wall(sides[1]!)) || !(wall(sides[2]!) || wall(sides[3]!))) continue;
          if (!clear[a] && !clear[b] && forest[a] && forest[b]) {
            g.tree[a] = 1;
            g.tree[b] = 1;
            passChanged = true;
            break;
          }
          // Elargir : retirer un arbre des cotes (ordre fixe, departage par hachage).
          const candidates = sides.filter((i) => i >= 0 && g.tree[i] === 1).sort((p, q) => hashOf(q) - hashOf(p));
          if (candidates.length === 0) continue;
          g.tree[candidates[0]!] = 0;
          passChanged = true;
        }
      }
      if (!passChanged) break;
      changed = true;
    }
    // 2. Connexite : poches praticables non reliees au camp.
    const reached = reachableGrid(g);
    const seen = Uint8Array.from(reached);
    for (const start of cellsInMap) {
      if (seen[start] || !free(start)) continue;
      const pocket = [start];
      seen[start] = 1;
      for (let head = 0; head < pocket.length; head++) {
        const i = pocket[head]!;
        for (const j of neighbors(g, i)) {
          if (j < 0 || seen[j] || !free(j) || !stepAllowed(g, i, j)) continue;
          seen[j] = 1;
          pocket.push(j);
        }
      }
      if (pocket.length < POCKET_FILL && !pocket.some((i) => clear[i] || g.rampUp[i]! >= 0)) {
        for (const i of pocket) g.tree[i] = 1;
        changed = true;
      } else if (carveCorridor(g, pocket, reached, clear)) changed = true;
    }
    if (!changed) break;
  }

  n.trees.clear();
  for (let i = 0; i < g.tree.length; i++) {
    const k = `${(i % size) - half},${Math.floor(i / size) - half}`;
    if (g.tree[i]) n.trees.add(k);
    if (clear[i]) n.keepClear.add(k);
  }
}

/** Couloir de deux cases d'une poche vers les cases reliees au camp : plus
 *  court chemin a travers les arbres (une case d'arbre coute 1, Dijkstra a
 *  seaux), puis arbres retires sur le chemin et sur une case voisine,
 *  perpendiculaire a chaque pas ; cases du couloir gardees degagees. */
function carveCorridor(g: NavGrid, pocket: readonly number[], reached: Uint8Array, clear: Uint8Array): boolean {
  const cost = new Int32Array(g.size * g.size).fill(-1);
  const from = new Int32Array(g.size * g.size).fill(-1);
  for (const i of pocket) cost[i] = 0;
  let goal = -1;
  const buckets: number[][] = [[...pocket]];
  for (let d = 0; d < buckets.length && goal < 0; d++) {
    const bucket = buckets[d];
    if (!bucket) continue;
    for (let n = 0; n < bucket.length; n++) {
      const i = bucket[n]!;
      if (cost[i]! < d) continue;
      if (reached[i]) {
        goal = i;
        break;
      }
      for (const j of neighbors(g, i)) {
        if (j < 0 || !stepAllowed(g, i, j)) continue;
        const nd = d + g.tree[j]!;
        if (cost[j]! >= 0 && nd >= cost[j]!) continue;
        cost[j] = nd;
        from[j] = i;
        (buckets[nd] ??= []).push(j);
      }
    }
  }
  if (goal < 0) return false;
  let carved = false;
  for (let i = goal; i >= 0; i = from[i]!) {
    const prev = from[i]!;
    const widen = prev >= 0 && Math.abs(prev - i) === 1 ? i + g.size : i + 1;
    for (const c of [i, widen]) {
      if (c < 0 || c >= g.tree.length || !g.inMap[c]) continue;
      if (g.tree[c]) {
        g.tree[c] = 0;
        carved = true;
      }
      clear[c] = 1;
    }
  }
  return carved;
}

export function generateSurvivalMap(seed: number): MapDef {
  const rng = new Rng(seed);
  const half = PROCEDURAL_MAP_SIZE / 2;
  const key = (x: number, z: number) => `${x},${z}`;

  // ---- Forme : disque de cases.
  const cells: TerrainCellDef[] = [];
  const inMap = new Set<string>();
  for (let z = -half; z < half; z++) {
    for (let x = -half; x < half; x++) {
      const d = centerDistance(x, z);
      if (d > MAP_RADIUS) continue;
      // Terre battue par plaques, seulement dans le monde exterieur.
      const dirt = d > CLEAR_RADIUS + 3 && fbm(seed + 7, x / 7, z / 7) > 0.72;
      cells.push({ x, z, terrain: dirt ? 'dirt' : 'grass' });
      inMap.add(key(x, z));
    }
  }
  const free = (x: number, z: number) => inMap.has(key(x, z));
  const inSpawnRing = (d: number) => Math.abs(d - ENEMY_SPAWN_RING_RADIUS) < SPAWN_RING_CLEARANCE;

  // ---- Collines (niveau 1) avec une rampe tournee vers le centre.
  const hill = new Set<string>();
  const elevationCells: TerrainElevationCellDef[] = [];
  const rampCells: { x: number; z: number; slope: SlopeShape; straight: boolean }[] = [];
  /** Abords des rampes : ni arbre ni eau (passage large garanti). */
  const rampClear = new Set<string>();
  const hillCenters: { x: number; z: number; r: number }[] = [];
  for (let attempt = 0; attempt < 200 && hillCenters.length < 10; attempt++) {
    const a = rng.next() * Math.PI * 2;
    const d = 16 + rng.next() * 26;
    const r = 2 + rng.next() * 1.8;
    const cx = Math.round(Math.cos(a) * d), cz = Math.round(Math.sin(a) * d);
    if (Math.abs(d - ENEMY_SPAWN_RING_RADIUS) < SPAWN_RING_CLEARANCE + r) continue;
    if (d + r > MAP_RADIUS - 2 || d - r < CLEAR_RADIUS + 3) continue;
    if (hillCenters.some((h) => Math.hypot(h.x - cx, h.z - cz) < h.r + r + 5)) continue;
    hillCenters.push({ x: cx, z: cz, r });
  }
  for (const h of hillCenters) {
    const own: { x: number; z: number }[] = [];
    for (let z = Math.floor(h.z - h.r); z <= Math.ceil(h.z + h.r); z++) {
      for (let x = Math.floor(h.x - h.r); x <= Math.ceil(h.x + h.r); x++) {
        if (free(x, z) && Math.hypot(x - h.x, z - h.z) <= h.r) own.push({ x, z });
      }
    }
    for (const c of own) hill.add(key(c.x, c.z));
    // Rampe de RAMP_WIDTH cases (2026-11-02, KI-39 : une rampe d'une case ne
    // laissait passer que les corps de rayon 0,5) : sur le cote de la
    // colline tourne vers le camp, au pied de sa rangee extreme ; le plateau
    // est complete au-dessus de la rampe si sa bordure y est plus etroite.
    // Sans place pour une rampe, la colline est retiree : jamais de colline
    // inaccessible.
    const ramp = placeRamp(h, free, (x, z) => hill.has(key(x, z)));
    if (!ramp) {
      for (const c of own) hill.delete(key(c.x, c.z));
      continue;
    }
    for (const c of ramp.plateau) hill.add(key(c.x, c.z));
    rampCells.push(...ramp.cells);
    for (const c of ramp.clear) rampClear.add(key(c.x, c.z));
  }
  for (const k of hill) {
    const [x, z] = k.split(',').map(Number) as [number, number];
    elevationCells.push({ x, z, level: 1 });
  }
  for (const c of rampCells) elevationCells.push({ x: c.x, z: c.z, level: 0, slope: c.slope });
  const ramps = new Set(rampCells.map((c) => key(c.x, c.z)));
  const rampSlopes = new Map(rampCells.filter((c) => c.straight).map((c) => [key(c.x, c.z), c.slope as SlopeDirection]));

  // ---- Mares (eau infranchissable), loin du camp et des collines.
  const water = new Set<string>();
  const ponds: { x: number; z: number; r: number }[] = [];
  for (let attempt = 0; attempt < 200 && ponds.length < 6; attempt++) {
    const a = rng.next() * Math.PI * 2;
    const d = 18 + rng.next() * 25;
    const r = 1.4 + rng.next() * 1.6;
    const cx = Math.round(Math.cos(a) * d), cz = Math.round(Math.sin(a) * d);
    if (Math.abs(d - ENEMY_SPAWN_RING_RADIUS) < SPAWN_RING_CLEARANCE + r) continue;
    if (d + r > MAP_RADIUS - 2) continue;
    if (hillCenters.some((h) => Math.hypot(h.x - cx, h.z - cz) < h.r + r + 3)) continue;
    if (ponds.some((p) => Math.hypot(p.x - cx, p.z - cz) < p.r + r + 8)) continue;
    ponds.push({ x: cx, z: cz, r });
  }
  for (const p of ponds) {
    for (let z = Math.floor(p.z - p.r); z <= Math.ceil(p.z + p.r); z++) {
      for (let x = Math.floor(p.x - p.r); x <= Math.ceil(p.x + p.r); x++) {
        const k = key(x, z);
        if (free(x, z) && !hill.has(k) && !ramps.has(k) && !rampClear.has(k) && Math.hypot(x - p.x, z - p.z) <= p.r) water.add(k);
      }
    }
  }
  const surfaceCells: SurfaceCellDef[] = [...water].map((k) => {
    const [x, z] = k.split(',').map(Number) as [number, number];
    return { x, z, surface: 'eau' };
  });

  // ---- Arbres BLOQUANTS (2026-11-02, demande d'Antoine : la case d'un
  // arbre bloque les unites terrestres). Forets par plaques, plus denses en
  // s'eloignant, mais :
  //  - des SENTIERS naturels (bandes de niveau de deux bruits lisses) restent
  //    sans arbre, et l'anneau d'apparition des vagues est plus clair ;
  //  - un GOULET d'une case (un corps large n'y passe pas) est comble dans
  //    une foret (massifs pleins) et elargi ailleurs (un arbre retire) ;
  //  - une poche praticable isolee est comblee (moins de POCKET_FILL cases)
  //    ou reliee au camp par un COULOIR de deux cases : jamais de mur
  //    infranchissable accidentel (eau, relief et arbres pris en compte).
  const obstacles: ObstacleDef[] = [];
  const occupied = new Set<string>();
  const blockedForDecor = (x: number, z: number) => water.has(key(x, z)) || ramps.has(key(x, z));
  const trees = new Set<string>();
  const forestArea = new Set<string>();
  const keepClear = new Set<string>();
  const isTrail = (x: number, z: number) => Math.abs(fbm(seed + 97, x / 13, z / 13) - 0.5) < 0.03 || Math.abs(fbm(seed + 113, x / 17, z / 17) - 0.5) < 0.022;
  for (const c of cells) {
    const d = centerDistance(c.x, c.z);
    if (d <= CLEAR_RADIUS || blockedForDecor(c.x, c.z)) continue;
    const k = key(c.x, c.z);
    const wild = Math.min(1, (d - CLEAR_RADIUS) / 28);
    const forest = fbm(seed + 31, c.x / 9, c.z / 9);
    const inForest = forest > 0.66 - 0.16 * wild;
    if (inForest) forestArea.add(k);
    if (isTrail(c.x, c.z) || rampClear.has(k)) {
      keepClear.add(k);
      continue;
    }
    const p = (inForest ? 0.28 + 0.3 * wild : 0.025 * wild) * (inSpawnRing(d) ? 0.35 : 1);
    if (hash2(seed + 41, c.x, c.z) < p) trees.add(k);
  }
  shapeForests({ seed, inMap, water, hill, ramps, rampSlopes, trees, forestArea, keepClear });
  for (const c of cells) {
    if (!trees.has(key(c.x, c.z))) continue;
    const a = hash2(seed + 43, c.x, c.z) * Math.PI * 2;
    const r = 0.15 + hash2(seed + 47, c.x, c.z) * 0.2;
    obstacles.push({
      kind: 'tree',
      tilesX: 1,
      tilesZ: 1,
      treeModel: TREE_MODELS[Math.floor(hash2(seed + 53, c.x, c.z) * TREE_MODELS.length)]!,
      x: c.x + 0.5 + Math.cos(a) * r,
      z: c.z + 0.5 + Math.sin(a) * r,
      rotationY: hash2(seed + 59, c.x, c.z) * Math.PI * 2,
      scale: 0.9 + hash2(seed + 61, c.x, c.z) * 0.25,
    });
    occupied.add(key(c.x, c.z));
  }
  // Cases praticables reliees au camp (tas de ressources).
  const reached = reachableCells({ inMap, water, hill, ramps, rampSlopes, trees });
  // Gros gisements 2 x 2 (2026-11-02 : BLOQUANTS, comme les arbres) : jamais
  // dans un goulet — leurs 12 cases voisines doivent etre libres (on peut
  // toujours en faire le tour, aucune zone n'est coupee). Pierre (26), puis
  // or (6, plus loin du camp ; GOLD_DEPOSIT_AMOUNT). Valeurs PROVISOIRES.
  const freeForDeposit = (k: string) => inMap.has(k) && !water.has(k) && !ramps.has(k) && !hill.has(k) && !occupied.has(k);
  const placeDeposit = (dMin: number, dMax: number, ore?: 'gold'): boolean => {
    const a = rng.next() * Math.PI * 2;
    const d = dMin + rng.next() * (dMax - dMin);
    const x = Math.round(Math.cos(a) * d), z = Math.round(Math.sin(a) * d);
    if (inSpawnRing(d)) return false;
    const around: string[] = [];
    for (let dz = -1; dz <= 2; dz++) for (let dx = -1; dx <= 2; dx++) around.push(key(x + dx, z + dz));
    if (!around.every(freeForDeposit)) return false;
    obstacles.push({ kind: 'rock', tilesX: 2, tilesZ: 2, cornerX: x, cornerZ: z, ...(ore ? { ore } : {}) });
    for (const k of [key(x, z), key(x + 1, z), key(x, z + 1), key(x + 1, z + 1)]) occupied.add(k);
    return true;
  };
  let rocks = 0;
  for (let attempt = 0; attempt < 500 && rocks < 26; attempt++) if (placeDeposit(CLEAR_RADIUS + 5, MAP_RADIUS - 3)) rocks++;
  let golds = 0;
  for (let attempt = 0; attempt < 400 && golds < 6; attempt++) if (placeDeposit(CLEAR_RADIUS + 14, MAP_RADIUS - 4, 'gold')) golds++;
  for (const c of cells) {
    const d = centerDistance(c.x, c.z);
    if (d <= 3 || blockedForDecor(c.x, c.z) || occupied.has(key(c.x, c.z))) continue;
    if (hash2(seed + 71, c.x, c.z) >= 0.035) continue;
    const prop = PROPS[Math.floor(hash2(seed + 73, c.x, c.z) * PROPS.length)]!;
    obstacles.push({ kind: 'prop', tilesX: 1, tilesZ: 1, propModel: prop.model, scale: prop.scale, x: c.x + 0.3 + hash2(seed + 79, c.x, c.z) * 0.4, z: c.z + 0.3 + hash2(seed + 83, c.x, c.z) * 0.4 });
  }

  // ---- Petits tas de bois et de pierre (finis, ramasses par le Heros),
  // trois fois plus rares (2026-11-02, demande d'Antoine : il faut explorer),
  // toujours sur une case RELIEE au camp. Garantie de depart : des tas
  // proches (9 a 18 cases, hors de la plaine du camp) jusqu'a au moins
  // NEAR_WOOD bois et NEAR_STONE pierre (Mine, Caserne, Forge) ; le reste
  // disperse, un peu plus fourni au loin. Valeurs PROVISOIRES.
  const resourcePiles: ResourcePileDef[] = [];
  const pileCells = new Set<string>();
  const placePile = (resource: ResourcePileDef['resource'], dMin: number, dMax: number, minAmount?: number): number => {
    for (let attempt = 0; attempt < 80; attempt++) {
      const a = rng.next() * Math.PI * 2;
      const d = dMin + rng.next() * (dMax - dMin);
      const x = Math.floor(Math.cos(a) * d), z = Math.floor(Math.sin(a) * d);
      const k = key(x, z);
      if (!reached.has(k) || ramps.has(k) || hill.has(k) || occupied.has(k) || pileCells.has(k)) continue;
      const far = d > 24;
      const amount = minAmount !== undefined ? minAmount + Math.floor(rng.next() * 2) : (far ? 2 : 1) + Math.floor(rng.next() * 3);
      resourcePiles.push({ x: x + 0.3 + rng.next() * 0.4, z: z + 0.3 + rng.next() * 0.4, resource, amount });
      pileCells.add(k);
      return amount;
    }
    return 0;
  };
  const NEAR_WOOD = 10;
  const NEAR_STONE = 6;
  for (let wood = 0, i = 0; wood < NEAR_WOOD && i < 8; i++) wood += placePile('wood', 9, 18, 3);
  for (let stone = 0, i = 0; stone < NEAR_STONE && i < 8; i++) stone += placePile('stone', 9, 18, 3);
  // ~35 tas en tout (111 avant le 2026-11-02 : au moins trois fois plus rares).
  for (let i = 0; i < 16; i++) placePile('wood', 12, MAP_RADIUS - 1.5);
  for (let i = 0; i < 13; i++) placePile('stone', 12, MAP_RADIUS - 1.5);

  // ---- Camps neutres (2026-11-02) : apres tout le reste, sans tirer dans
  // `rng` (le terrain d'une graine existante ne bouge pas hors des camps).
  const destructibles: { kind: string; x: number; z: number }[] = [];
  const camps = placeCamps(seed, { inMap, water, hill, ramps, rampClear, trees, occupied, pileCells, reached }, obstacles, resourcePiles, destructibles);

  // ---- Territoire du joueur : disque central.
  const territory: TerritoryCell[] = cells.filter((c) => centerDistance(c.x, c.z) <= TERRITORY_RADIUS).map((c) => ({ x: c.x, z: c.z, team: 'player' }));

  return {
    name: `Survie procédurale (graine ${seed})`,
    version: 1,
    width: PROCEDURAL_MAP_SIZE,
    height: PROCEDURAL_MAP_SIZE,
    cells,
    obstacles,
    playerUnits: [],
    enemyUnits: [],
    ballista: { x: 0.5, z: 0.5 },
    territory,
    elevationCells,
    surfaceCells,
    resourcePiles,
    camps,
    destructibles,
    generator: { kind: 'survival-procedural', seed },
    survivalRules: 'hero-rts',
  };
}

/** Camps a placer, dans l'ordre (type de camp data/camps.ts, anneau de
 *  distance au centre en cases). Au-dela de la zone exploree au depart
 *  (INITIAL_EXPLORED_RADIUS 22) et de l'anneau des vagues, loin du bord ;
 *  `large` : decor plus fourni. PROVISOIRE : un petit camp, un grand camp. */
const CAMP_SITES: readonly { kind: string; dMin: number; dMax: number; large?: boolean; level: number }[] = [
  { kind: 'raiders_small', dMin: 31, dMax: 38, level: 1 },
  { kind: 'raiders_large', dMin: 33, dMax: 38, large: true, level: 1 },
];

/** Niveau d'unite des gardes d'un camp genere (2026-11-02), ecrit dans la
 *  carte (MapCampDef.level, meme format qu'une carte dessinee). Point
 *  d'entree de la future difficulte procedurale (tier, distance, type de
 *  zone) ; PROVISOIRE : niveau fixe du site, 1 partout (carte et equilibrage
 *  inchanges). Aucune formule definitive. */
function generatedCampLevel(site: (typeof CAMP_SITES)[number]): number {
  return site.level;
}
/** Rayon de la clairiere d'un camp (cases), et ecart minimal entre camps. */
const CAMP_RADIUS = 3.5;
const CAMP_SPACING = 20;

interface CampGrid {
  inMap: ReadonlySet<string>;
  water: ReadonlySet<string>;
  hill: ReadonlySet<string>;
  ramps: ReadonlySet<string>;
  rampClear: ReadonlySet<string>;
  trees: Set<string>;
  occupied: ReadonlySet<string>;
  pileCells: Set<string>;
  reached: ReadonlySet<string>;
}

/**
 * Camps neutres (2026-11-02) : pour chaque type de CAMP_SITES, la meilleure
 * clairiere d'un anneau (48 directions, depart tourne par la graine, sans
 * tirer dans la RNG de la carte) : cases dans la carte, sans eau, relief,
 * rampe, abords de rampe, rocher ni tas ; au plus 4 arbres (retires) ; abords
 * ouverts et relies a pied a la Baliste (pas coince dans une foret). Decor en
 * props traversables (feu, tente, banniere, caisses, tonneau, bois), coffre a
 * l'abri de la tente, postes de garde autour du feu, deux petits tas a cote.
 */
function placeCamps(seed: number, g: CampGrid, obstacles: ObstacleDef[], piles: ResourcePileDef[], destructibles: { kind: string; x: number; z: number }[]): MapCampDef[] {
  const key = (x: number, z: number) => `${x},${z}`;
  const camps: MapCampDef[] = [];
  const disc = (cx: number, cz: number, rMin: number, rMax: number): string[] => {
    const out: string[] = [];
    for (let z = Math.floor(cz - rMax); z <= Math.ceil(cz + rMax); z++) {
      for (let x = Math.floor(cx - rMax); x <= Math.ceil(cx + rMax); x++) {
        const d = Math.hypot(x - cx, z - cz);
        if (d > rMin && d <= rMax) out.push(key(x, z));
      }
    }
    return out;
  };
  for (const site of CAMP_SITES) {
    let best: { cx: number; cz: number } | null = null;
    let bestScore = Infinity;
    const turn = hash2(seed + 131, 0, 0) * Math.PI * 2;
    for (let i = 0; i < 48; i++) {
      const a = turn + (i / 48) * Math.PI * 2;
      for (let d = site.dMin; d <= site.dMax; d += 1.5) {
        const cx = Math.round(Math.cos(a) * d), cz = Math.round(Math.sin(a) * d);
        if (camps.some((c) => Math.hypot(c.x - cx, c.z - cz) < CAMP_SPACING)) continue;
        let treesIn = 0;
        let ok = true;
        for (const k of disc(cx, cz, -1, CAMP_RADIUS)) {
          if (!g.inMap.has(k) || g.water.has(k) || g.hill.has(k) || g.ramps.has(k) || g.rampClear.has(k) || g.pileCells.has(k) || (g.occupied.has(k) && !g.trees.has(k))) {
            ok = false;
            break;
          }
          if (g.trees.has(k)) treesIn++;
        }
        if (!ok || treesIn > 4) continue;
        let open = 0;
        let ringTrees = 0;
        for (const k of disc(cx, cz, CAMP_RADIUS, CAMP_RADIUS + 2)) {
          if (g.trees.has(k)) ringTrees++;
          if (g.reached.has(k)) open++;
        }
        if (open < 12) continue;
        const score = treesIn * 4 + ringTrees + Math.abs(d - (site.dMin + site.dMax) / 2) * 0.3 + hash2(seed + 137, cx, cz) * 0.5;
        if (score < bestScore) {
          bestScore = score;
          best = { cx, cz };
        }
      }
    }
    if (!best) continue;
    const { cx, cz } = best;
    const cell = new Set(disc(cx, cz, -1, CAMP_RADIUS));
    const C = { x: cx + 0.5, z: cz + 0.5 };
    // Clairiere : arbres retires, petits decors aleatoires retires.
    for (let i = obstacles.length - 1; i >= 0; i--) {
      const o = obstacles[i]!;
      const ox = o.x ?? 0, oz = o.z ?? 0;
      if ((o.kind === 'tree' && cell.has(key(Math.floor(ox), Math.floor(oz)))) || (o.kind === 'prop' && Math.hypot(ox - C.x, oz - C.z) <= CAMP_RADIUS + 1)) obstacles.splice(i, 1);
    }
    for (const k of cell) g.trees.delete(k);
    // Repere du camp : `b` vers l'exterieur de la carte (le dos du camp), `p`
    // perpendiculaire ; on arrive par l'avant (cote Baliste).
    const len = Math.hypot(C.x, C.z) || 1;
    const b = { x: C.x / len, z: C.z / len };
    const p = { x: -b.z, z: b.x };
    const at = (back: number, side: number) => ({ x: C.x + b.x * back + p.x * side, z: C.z + b.z * back + p.z * side });
    const facing = (from: { x: number; z: number }) => Math.atan2(C.x - from.x, C.z - from.z);
    const prop = (model: string, pos: { x: number; z: number }, tiles: number, scale: number, rotationY: number) => obstacles.push({ kind: 'prop', tilesX: tiles, tilesZ: tiles, propModel: model, x: pos.x, z: pos.z, scale, rotationY });
    const tent = at(2.5, 0);
    prop('campfire_stones', C, 1, 1, hash2(seed + 139, cx, cz) * Math.PI * 2);
    prop('tent_detailedOpen', tent, 2, 1.1, facing(tent));
    prop('kaykit_flag_red', at(1.7, -2.3), 1, 1.3, facing(at(1.7, -2.3)));
    prop('kaykit_crate_A_big', at(1.6, 2.3), 1, 0.9, 0.3);
    prop('kaykit_crate_B_small', at(0.8, 2.9), 1, 0.7, 1.1);
    prop('log_stack', at(0.2, -2.7), 1, 0.9, facing(at(0.2, -2.7)) + Math.PI / 2);
    prop('kaykit_weaponrack', at(-0.6, -2.8), 1, 0.9, facing(at(-0.6, -2.8)));
    if (site.large) {
      // Grand camp : seconde tente et seconde banniere, sur les cotes.
      prop('tent_smallClosed', at(1.2, -3.0), 1, 1.2, facing(at(1.2, -3.0)));
      prop('kaykit_flag_red', at(1.9, 2.9), 1, 1.3, facing(at(1.9, 2.9)));
    }
    const chest = at(1.3, 1.2);
    // Barils destructibles (2026-11-02, PROVISOIRE : 2 au petit camp, 3 au
    // grand) : sur des cases du camp libres de coffre et de poste de garde.
    const taken = new Set([chest, at(-1.5, 0.9), at(-1.5, -0.9), at(0.2, -1.7), at(0.2, 1.8), at(-0.5, 2.6), at(-0.5, -2.6)].map((q) => key(Math.floor(q.x), Math.floor(q.z))));
    for (const spot of (site.large ? [at(2.7, 1.7), at(-2.0, 2.2), at(-2.1, -2.0)] : [at(2.7, 1.7), at(-2.0, 2.2)])) {
      const k = key(Math.floor(spot.x), Math.floor(spot.z));
      if (taken.has(k)) continue;
      taken.add(k);
      destructibles.push({ kind: 'barrel', x: spot.x, z: spot.z });
    }
    camps.push({
      kind: site.kind,
      x: C.x,
      z: C.z,
      radius: CAMP_RADIUS,
      chest: { ...chest, rotationY: facing(chest) },
      guardPosts: [at(-1.5, 0.9), at(-1.5, -0.9), at(0.2, -1.7), at(0.2, 1.8), at(-0.5, 2.6), at(-0.5, -2.6)],
      level: generatedCampLevel(site),
    });
    // Un peu de bois et de pierre a cote (PROVISOIRE) : cases reliees, libres.
    const ring = disc(cx, cz, CAMP_RADIUS + 0.5, CAMP_RADIUS + 3)
      .filter((k) => g.reached.has(k) && !g.occupied.has(k) && !g.pileCells.has(k) && !g.ramps.has(k) && !g.hill.has(k))
      .sort((u, v) => hash2(seed + 149, ...(u.split(',').map(Number) as [number, number])) - hash2(seed + 149, ...(v.split(',').map(Number) as [number, number])));
    for (const [resource, amount] of [['wood', 3], ['stone', 2]] as const) {
      const k = ring.shift();
      if (!k) break;
      const [x, z] = k.split(',').map(Number) as [number, number];
      piles.push({ x: x + 0.5, z: z + 0.5, resource, amount });
      g.pileCells.add(k);
    }
  }
  return camps;
}
