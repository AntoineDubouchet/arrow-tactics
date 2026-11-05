import { Rng } from '../../core/rng';
import type { ObstacleDef } from '../constants';
import type { SurfaceCellDef } from '../groundSurfaces';
import { CAMP_CLEAR_RADIUS, type MapCampDef, type MapDef, type TerrainCellDef } from '../mapDef';
import { DEFAULT_STARTING_BASE_PRESET, getStartingBasePreset, reservedContainsCell, startingBaseReservedAt, startingBaseRotationFor } from '../startingBase';
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
/** Inchange au 2026-11-05 malgre l'enceinte de rayon 15 (zone reservee 17) :
 *  les vagues apparaissent a ~7 cases des murs (11,5 avant) ; a revoir avec
 *  les Vagues V2 (un anneau a 26 deplacait collines et mares de 3 graines
 *  sur 12 et cassait leurs garanties d'acces). */
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
          // Cotes du passage entre a et b (perpendiculaires au pas). Un mur
          // est toute case ou l'on ne peut pas poser le pied depuis le
          // passage : arbre, eau, bord, autre niveau, et (2026-11-04, KI-65)
          // flanc d'une rampe, qui laissait un passage d'une case contre un
          // arbre (la grille A* ne connait pas le rayon des corps).
          const wall = (i: number, from: number) => !free(i) || g.hill[i] !== g.hill[from] || !stepAllowed(g, from, i);
          const sides = [a - perp, b - perp, a + perp, b + perp];
          if (!(wall(sides[0]!, a) || wall(sides[1]!, b)) || !(wall(sides[2]!, a) || wall(sides[3]!, b))) continue;
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
  // Camp de depart (2026-11-04, config/startingBase.ts) : son emprise
  // complete (disque : enceinte + marge, meme pour toute rotation) reste
  // degagee : ni colline, ni mare, ni arbre, ni gisement, ni tas, ni decor.
  const startOrigin = { x: 0.5, z: 0.5 };
  const startZone = startingBaseReservedAt(startOrigin, DEFAULT_STARTING_BASE_PRESET);
  const inStartZone = (x: number, z: number) => reservedContainsCell(startZone, x, z);
  /** Rayon a garder sans relief ni eau autour du centre (zone reservee + 1). */
  const START_CLEAR = startZone.radius + 1;
  /** Arbres, decors et petits tas : une case et demie de marge en plus (les
   *  gisements gardent leurs places d'avant),
   *  pour que l'editeur puisse deplacer le Depart d'une ou deux cases sans
   *  que son emprise ne touche la foret (2026-11-05, G46). */
  const startZoneWide = { ...startZone, radius: startZone.radius + 1.5 };
  const nearStartZone = (x: number, z: number) => reservedContainsCell(startZoneWide, x, z);

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
  // Camp de depart agrandi (2026-11-05, G46) : une colline qui mordrait sur sa
  // zone reservee est abandonnee APRES le tirage (hillCenters garde son role
  // d'espacement : les autres collines, mares et gisements des graines
  // existantes ne bougent pas).
  const keptHills = hillCenters.filter((h) => Math.hypot(h.x, h.z) - h.r >= START_CLEAR);
  for (const h of keptHills) {
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
  // Meme regle que les collines : une mare qui mordrait sur la zone reservee
  // du camp est abandonnee apres le tirage.
  for (const p of ponds.filter((q) => Math.hypot(q.x, q.z) - q.r >= START_CLEAR)) {
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
    if (nearStartZone(c.x, c.z)) {
      keepClear.add(k);
      continue;
    }
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
  // Gros gisements 2 x 2 (2026-11-02 : BLOQUANTS, comme les arbres).
  // KI-65 (corrige le 2026-11-04) : la grille A* ne connait pas le rayon des
  // corps. Un gisement pose avec une case libre autour pouvait laisser, contre
  // un arbre, un passage d'une case (trop etroit pour le Heros, rayon 0,6)
  // qu'A* croyait praticable : le Heros oscillait sans jamais passer. Desormais
  // les gisements sont places AVANT la mise en forme finale des forets, qui
  // les voit comme des obstacles fixes (seconde passe de shapeForests :
  // goulets elargis en retirant des arbres, poches reliees) :
  //  - une case libre tout autour (gardee degagee : on atteint toujours le
  //    gisement) ;
  //  - deux cases sans eau, relief, rampe, bord de carte ni autre gisement
  //    (ce qu'un retrait d'arbre ne peut pas elargir) ;
  //  - jamais sur un sentier, un couloir, les abords d'une rampe
  //    (keepClear) ni dans la zone du camp de depart.
  // Un candidat refuse est deplace localement (spirale deterministe jusqu'a
  // 4 cases) avant d'etre abandonne : meme densite. Pierre (26), puis or (6,
  // plus loin du camp ; GOLD_DEPOSIT_AMOUNT). Valeurs PROVISOIRES.
  const depositCells = new Set<string>();
  const hardFree = (k: string) => inMap.has(k) && !water.has(k) && !ramps.has(k) && !hill.has(k) && !depositCells.has(k);
  const depositFits = (x: number, z: number, dMin: number, dMax: number): boolean => {
    const d = Math.hypot(x + 1, z + 1);
    if (d < dMin || d > dMax || inSpawnRing(d)) return false;
    const own = [key(x, z), key(x + 1, z), key(x, z + 1), key(x + 1, z + 1)];
    if (own.some((k) => keepClear.has(k)) || [[x, z], [x + 1, z + 1]].some(([cx, cz]) => inStartZone(cx!, cz!))) return false;
    for (let dz = -2; dz <= 3; dz++) {
      for (let dx = -2; dx <= 3; dx++) {
        const k = key(x + dx, z + dz);
        if (!hardFree(k)) return false;
        if (dx >= -1 && dx <= 2 && dz >= -1 && dz <= 2 && trees.has(k)) return false;
      }
    }
    return true;
  };
  const NEAR_OFFSETS: [number, number][] = [];
  for (let r = 1; r <= 4; r++) for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) if (Math.max(Math.abs(dx), Math.abs(dz)) === r) NEAR_OFFSETS.push([dx, dz]);
  const rockDefs: ObstacleDef[] = [];
  const placeDeposit = (dMin: number, dMax: number, ore?: 'gold'): boolean => {
    const a = rng.next() * Math.PI * 2;
    const d = dMin + rng.next() * (dMax - dMin);
    const x0 = Math.round(Math.cos(a) * d), z0 = Math.round(Math.sin(a) * d);
    const spot = [[0, 0] as [number, number], ...NEAR_OFFSETS].map(([dx, dz]) => ({ x: x0 + dx, z: z0 + dz })).find((p) => depositFits(p.x, p.z, dMin, dMax));
    if (!spot) return false;
    const { x, z } = spot;
    rockDefs.push({ kind: 'rock', tilesX: 2, tilesZ: 2, cornerX: x, cornerZ: z, ...(ore ? { ore } : {}) });
    for (const k of [key(x, z), key(x + 1, z), key(x, z + 1), key(x + 1, z + 1)]) depositCells.add(k);
    // Anneau d'une case : jamais comble par la passe suivante.
    for (let dz = -1; dz <= 2; dz++) for (let dx = -1; dx <= 2; dx++) if (!depositCells.has(key(x + dx, z + dz))) keepClear.add(key(x + dx, z + dz));
    return true;
  };
  let rocks = 0;
  for (let attempt = 0; attempt < 800 && rocks < 26; attempt++) if (placeDeposit(CLEAR_RADIUS + 5, MAP_RADIUS - 3)) rocks++;
  let golds = 0;
  for (let attempt = 0; attempt < 800 && golds < 6; attempt++) if (placeDeposit(CLEAR_RADIUS + 14, MAP_RADIUS - 4, 'gold')) golds++;
  // Seconde passe : gisements = obstacles fixes (comme l'eau : jamais
  // retires, jamais traverses par un couloir).
  shapeForests({ seed, inMap, water: new Set([...water, ...depositCells]), hill, ramps, rampSlopes, trees, forestArea, keepClear });
  // Zigzags d'une case (2026-11-05, G46) : un pas orthogonal entre deux cases
  // libres dont aucun cote n'est libre sur les deux cases (arbres en
  // quinconce) ne laisse passer qu'un corps de rayon <= 0,5 : le Heros (0,6)
  // s'y coince entre les deux arbres (graine 2). Un arbre d'un des cotes est
  // retire, trois passes.
  {
    const freeCell = (x: number, z: number): boolean => { const k = key(x, z); return inMap.has(k) && !water.has(k) && !hill.has(k) && !trees.has(k) && !depositCells.has(k); };
    for (let pass = 0; pass < 3; pass++) {
      let widened = 0;
      for (const c of cells) {
        if (!freeCell(c.x, c.z)) continue;
        for (const [dx, dz] of [[1, 0], [0, 1]] as const) {
          if (!freeCell(c.x + dx, c.z + dz)) continue;
          const sx = dz, sz = dx;
          const sides = [[c.x - sx, c.z - sz], [c.x + dx - sx, c.z + dz - sz], [c.x + sx, c.z + sz], [c.x + dx + sx, c.z + dz + sz]] as const;
          const leftFree = freeCell(sides[0][0], sides[0][1]) && freeCell(sides[1][0], sides[1][1]);
          const rightFree = freeCell(sides[2][0], sides[2][1]) && freeCell(sides[3][0], sides[3][1]);
          if (leftFree || rightFree) continue;
          const tree = sides.map(([x, z]) => key(x, z)).find((k) => trees.has(k));
          if (!tree) continue;
          trees.delete(tree);
          keepClear.add(tree);
          widened++;
        }
      }
      if (widened === 0) break;
    }
  }
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
  obstacles.push(...rockDefs);
  for (const k of depositCells) occupied.add(k);
  // Cases praticables reliees au camp, calculees sur la carte telle qu'elle
  // sera jouee (2026-11-04 : arbres ET gisements bloquants ; avant : avant
  // les gisements) : tas de ressources, abords des camps neutres.
  let reached = reachableCells({ inMap, water, hill, ramps, rampSlopes, trees: new Set([...trees, ...depositCells]) });
  // Gisements injoignables (2026-11-05, G46) : un gisement dont aucune case
  // de l'anneau n'est reliee au camp (enferme par une mare, une colline ou
  // la foret) est retire et repose ailleurs, jusqu'a trois passes ; la
  // carte jouee garantit l'acces a chaque gisement.
  const ringCells = (r: ObstacleDef): string[] => { const out: string[] = []; for (let dz = -1; dz <= 2; dz++) for (let dx = -1; dx <= 2; dx++) if (dx === -1 || dx === 2 || dz === -1 || dz === 2) out.push(key(r.cornerX! + dx, r.cornerZ! + dz)); return out; };
  for (let pass = 0; pass < 3; pass++) {
    const stuck = rockDefs.filter((r) => !ringCells(r).some((k) => reached.has(k)));
    if (stuck.length === 0) break;
    for (const r of stuck) {
      rockDefs.splice(rockDefs.indexOf(r), 1);
      obstacles.splice(obstacles.indexOf(r), 1);
      for (let dz = 0; dz <= 1; dz++) for (let dx = 0; dx <= 1; dx++) { const k = key(r.cornerX! + dx, r.cornerZ! + dz); depositCells.delete(k); occupied.delete(k); }
    }
    for (const r of stuck) {
      const before = rockDefs.length;
      for (let attempt = 0; attempt < 200 && rockDefs.length === before; attempt++) placeDeposit(r.ore ? CLEAR_RADIUS + 14 : CLEAR_RADIUS + 5, MAP_RADIUS - (r.ore ? 4 : 3), r.ore);
      if (rockDefs.length > before) { const n = rockDefs[rockDefs.length - 1]!; obstacles.push(n); for (let dz = 0; dz <= 1; dz++) for (let dx = 0; dx <= 1; dx++) occupied.add(key(n.cornerX! + dx, n.cornerZ! + dz)); }
    }
    reached = reachableCells({ inMap, water, hill, ramps, rampSlopes, trees: new Set([...trees, ...depositCells]) });
  }
  for (const c of cells) {
    const d = centerDistance(c.x, c.z);
    if (d <= 3 || blockedForDecor(c.x, c.z) || occupied.has(key(c.x, c.z)) || nearStartZone(c.x, c.z)) continue;
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
      if (!reached.has(k) || ramps.has(k) || hill.has(k) || occupied.has(k) || pileCells.has(k) || nearStartZone(x, z)) continue;
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
  // Objets semantiques (2026-11-03) : leur decor et leurs barils ne sont
  // pas ecrits ici, ils se derivent du camp (data/campLayout.ts).
  const camps = placeCamps(seed, { inMap, water, hill, ramps, rampClear, trees, occupied, pileCells, reached }, obstacles, resourcePiles);

  // ---- Camp de depart : porte tournee vers le cote le plus degage (cases
  // dans la carte, sans eau, relief, arbre ni gisement), apres tout le reste.
  const startRotation = startingBaseRotationFor(startOrigin, DEFAULT_STARTING_BASE_PRESET, (x, z) => {
    const k = key(x, z);
    return inMap.has(k) && !water.has(k) && !hill.has(k) && !ramps.has(k) && !occupied.has(k) && !trees.has(k);
  });

  // ---- Or proche garanti (2026-11-05, G46, config/startingBase.ts
  // nearbyGold) : un second gisement d'or, hors de l'enceinte mais dans la
  // vision initiale de la Baliste, hors de l'axe de la porte (+- 60°), sur
  // 4 x 4 cases libres (gisement 2 x 2 + anneau d'une case : jamais un
  // passage d'une case, KI-65), hors eau, relief, rampe, tas, arbre et
  // decor. Angle de depart tire de la graine, puis balayage par pas de 10° ;
  // si aucune place n'est libre, les arbres du meilleur emplacement sont
  // retires. Aucun doublon avec les gisements generes (plus loin).
  {
    const preset = getStartingBasePreset(DEFAULT_STARTING_BASE_PRESET);
    const D = preset.nearbyGold.distance;
    const gate = [{ x: 0, z: 1 }, { x: -1, z: 0 }, { x: 0, z: -1 }, { x: 1, z: 0 }][((startRotation % 4) + 4) % 4]!;
    const baseAngle = hash2(seed + 131, 0, 0) * Math.PI * 2;
    const corner = (a: number) => ({ x: Math.round(Math.cos(a) * D + startOrigin.x) - 1, z: Math.round(Math.sin(a) * D + startOrigin.z) - 1 });
    const cellsOf = (x: number, z: number, ring: number) => { const out: string[] = []; for (let dz = -ring; dz <= 1 + ring; dz++) for (let dx = -ring; dx <= 1 + ring; dx++) out.push(key(x + dx, z + dz)); return out; };
    const ground = (k: string) => inMap.has(k) && !water.has(k) && !hill.has(k) && !ramps.has(k) && !pileCells.has(k) && !depositCells.has(k) && (!occupied.has(k) || trees.has(k));
    // Un emplacement ne doit couper aucun chemin (camps, gisements, tas
    // restent relies) : cases reliees recomptees avec le gisement pose et
    // ses arbres retires ; perte toleree = ses 4 cases.
    const keeps = (x: number, z: number): boolean => {
      const own = new Set(cellsOf(x, z, 0));
      const next = new Set([...trees].filter((k) => !cellsOf(x, z, 1).includes(k)));
      for (const k of depositCells) next.add(k);
      for (const k of own) next.add(k);
      const r2 = reachableCells({ inMap, water, hill, ramps, rampSlopes, trees: next });
      return r2.size >= reached.size - own.size && cellsOf(x, z, 1).some((k) => !own.has(k) && r2.has(k));
    };
    let best: { x: number; z: number; trees: number } | null = null;
    for (let i = 0; i < 36; i++) {
      const a = baseAngle + (i * Math.PI) / 18;
      if (Math.cos(a) * gate.x + Math.sin(a) * gate.z > 0.5) continue; // +- 60° autour de la porte
      const { x, z } = corner(a);
      const block = cellsOf(x, z, 1);
      if (!block.every(ground)) continue;
      const inWoods = block.filter((k) => trees.has(k)).length;
      if (best && inWoods >= best.trees) continue;
      if (!keeps(x, z)) continue;
      best = { x, z, trees: inWoods };
      if (inWoods === 0) break;
    }
    if (best) {
      const { x, z } = best;
      for (const k of cellsOf(x, z, 1)) {
        if (trees.has(k)) { trees.delete(k); const i = obstacles.findIndex((o) => o.kind === 'tree' && Math.floor(o.x!) === Number(k.split(',')[0]) && Math.floor(o.z!) === Number(k.split(',')[1])); if (i >= 0) obstacles.splice(i, 1); }
        if (!depositCells.has(k)) keepClear.add(k);
      }
      obstacles.push({ kind: 'rock', tilesX: 2, tilesZ: 2, cornerX: x, cornerZ: z, ore: 'gold' });
      for (const k of cellsOf(x, z, 0)) { depositCells.add(k); occupied.add(k); }
    }
  }

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
    ballista: { ...startOrigin },
    startingBase: { preset: DEFAULT_STARTING_BASE_PRESET, rotation: startRotation },
    territory,
    elevationCells,
    surfaceCells,
    resourcePiles,
    camps,
    generator: { kind: 'survival-procedural', seed },
    survivalRules: 'hero-rts',
  };
}

/** Camps a placer, dans l'ordre (type de camp data/camps.ts, anneau de
 *  distance au centre en cases). Au-dela de la zone exploree au depart
 *  (INITIAL_EXPLORED_RADIUS 22) et de l'anneau des vagues, loin du bord ;
 *  PROVISOIRE : un petit camp, un grand camp. */
const CAMP_SITES: readonly { kind: string; dMin: number; dMax: number; level: number }[] = [
  { kind: 'raiders_small', dMin: 31, dMax: 38, level: 1 },
  { kind: 'raiders_large', dMin: 33, dMax: 38, level: 1 },
];

/** Niveau d'unite des gardes d'un camp genere (2026-11-02), ecrit dans la
 *  carte (MapCampDef.level, meme format qu'une carte dessinee). Point
 *  d'entree de la future difficulte procedurale (tier, distance, type de
 *  zone) ; PROVISOIRE : niveau fixe du site, 1 partout (carte et equilibrage
 *  inchanges). Aucune formule definitive. */
function generatedCampLevel(site: (typeof CAMP_SITES)[number]): number {
  return site.level;
}
/** Rayon de la clairiere d'un camp (cases, config/mapDef.ts), et ecart
 *  minimal entre camps generes. */
const CAMP_RADIUS = CAMP_CLEAR_RADIUS;
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
 * ouverts et relies a pied a la Baliste (pas coince dans une foret). Le camp
 * est ecrit comme un objet semantique (type, centre, niveau, dos tourne vers
 * l'exterieur de la carte) : decor, coffre, postes et barils en derivent
 * (data/campLayout.ts) ; deux petits tas independants a cote.
 */
function placeCamps(seed: number, g: CampGrid, obstacles: ObstacleDef[], piles: ResourcePileDef[]): MapCampDef[] {
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
  /** Meilleure clairiere de l'anneau [dMin ; dMax]. `strict` (2026-11-04,
   *  KI-65) : abords sans eau, colline, rampe ni bord de carte a 2,5 cases
   *  de la clairiere (un baril du camp, bloquant, n'y laisse jamais un
   *  passage d'une case contre une falaise) ; sans site strict, recherche plus
   *  fine (`dirs` directions, pas de `step` cases) sur l'anneau elargi vers
   *  l'exterieur seulement (jamais dans la zone exploree au depart, jamais a
   *  moins de 4 cases du bord), puis la regle d'avant sert de repli (meme
   *  nombre de camps). */
  const search = (site: (typeof CAMP_SITES)[number], dMin: number, dMax: number, strict: boolean, dirs = 48, step = 1.5): { cx: number; cz: number } | null => {
    let best: { cx: number; cz: number } | null = null;
    let bestScore = Infinity;
    const turn = hash2(seed + 131, 0, 0) * Math.PI * 2;
    for (let i = 0; i < dirs; i++) {
      const a = turn + (i / dirs) * Math.PI * 2;
      for (let d = dMin; d <= dMax; d += step) {
        const cx = Math.round(Math.cos(a) * d), cz = Math.round(Math.sin(a) * d);
        // Centres de case des deux cotes (2026-11-04 : la comparaison coin / centre
        // laissait deux camps a 19,6 cases).
        if (camps.some((c) => Math.hypot(c.x - (cx + 0.5), c.z - (cz + 0.5)) < CAMP_SPACING)) continue;
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
        // Abords (2026-11-04, KI-65) : ni eau, ni colline, ni rampe a moins de
        // 2,5 cases de la clairiere ; un baril du camp (bloquant) y laisserait
        // un passage d'une case contre une falaise.
        // 2026-11-05 (G46) : site strict sans gisement ni tas non plus a moins
        // de 2,5 cases de la clairiere (un rocher 2 x 2 contre la clairiere et
        // un baril du camp laissent un passage d'une case) ; le Heros, plus
        // large qu'une case, evite de toute facon ces passages (A* large).
        if (strict && disc(cx, cz, CAMP_RADIUS, CAMP_RADIUS + 2.5).some((k) => !g.inMap.has(k) || g.water.has(k) || g.hill.has(k) || g.ramps.has(k) || g.rampClear.has(k) || g.pileCells.has(k) || (g.occupied.has(k) && !g.trees.has(k)))) continue;
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
    return best;
  };
  for (const site of CAMP_SITES) {
    const best = search(site, site.dMin, site.dMax, true) ?? search(site, site.dMin, Math.min(site.dMax + 3, MAP_RADIUS - CAMP_RADIUS - 5), true, 96, 0.75) ?? search(site, site.dMin, site.dMax, false);
    if (!best) continue;
    const { cx, cz } = best;
    const C = { x: cx + 0.5, z: cz + 0.5 };
    // Clairiere : arbres retires, petits decors aleatoires retires.
    for (let i = obstacles.length - 1; i >= 0; i--) {
      const o = obstacles[i]!;
      const ox = o.x ?? 0, oz = o.z ?? 0;
      // Arbres retires jusqu'a 2 cases au-dela de la clairiere (2026-11-04,
      // KI-65) : jamais un passage d'une case entre un baril et un arbre.
      if ((o.kind === 'tree' && Math.hypot(Math.floor(ox) + 0.5 - C.x, Math.floor(oz) + 0.5 - C.z) <= CAMP_RADIUS + 2) || (o.kind === 'prop' && Math.hypot(ox - C.x, oz - C.z) <= CAMP_RADIUS + 1)) obstacles.splice(i, 1);
    }
    for (const k of disc(cx, cz, -1, CAMP_RADIUS + 2)) g.trees.delete(k);
    // Dos du camp vers l'exterieur de la carte (on arrive par l'avant, cote
    // Baliste) : meme repere que le decor derive (data/campLayout.ts).
    camps.push({
      kind: site.kind,
      x: C.x,
      z: C.z,
      level: generatedCampLevel(site),
      facing: Math.atan2(C.z, C.x),
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
