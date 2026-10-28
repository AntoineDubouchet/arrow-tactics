import { TILE, type ObstacleDef } from './constants';
import { cellKey } from './mapDef';

/**
 * Relief 2.5D du terrain (2026-10-28) : une ALTITUDE par case, jamais
 * d'empilement. Module pur (aucune dependance a Three.js ni au DOM) partage
 * par la simulation (falaises, voir computeCliffObstacles), le rendu
 * (hauteur de surface, faces de falaise, raycast) et l'editeur (pinceaux
 * Surelever / Abaisser, outils Pente et Coin, regles de pose).
 *
 * Une case est soit PLATE au niveau `level` (0..TERRAIN_LEVEL_MAX), soit une
 * PENTE qui monte de `level` (bord bas) a `level + 1` (bord haut, du cote
 * `slope`). Deux cases voisines communiquent si leur arete commune a la meme
 * hauteur aux deux extremites ; sinon l'arete est une FALAISE,
 * infranchissable a pied (la ligne de tir, elle, reste 2D : voir
 * computeCliffObstacles).
 */

/** Hauteur monde d'un niveau de relief. */
export const TERRAIN_ELEVATION_STEP = TILE * 0.5;
export const TERRAIN_LEVEL_MIN = 0;
export const TERRAIN_LEVEL_MAX = 2;

/** Direction de MONTEE d'une pente. N = -Z (haut de l'ecran en vue de jeu),
 *  S = +Z, E = +X, W = -X. */
export type SlopeDirection = 'N' | 'E' | 'S' | 'W';

/** Ordre de rotation (touche R de l'outil Pente) : sens horaire vu du
 *  dessus. */
export const SLOPE_DIRECTIONS: readonly SlopeDirection[] = ['N', 'E', 'S', 'W'];

export const SLOPE_DIRECTION_VECTORS: Readonly<Record<SlopeDirection, { dx: number; dz: number }>> = {
  N: { dx: 0, dz: -1 },
  E: { dx: 1, dz: 0 },
  S: { dx: 0, dz: 1 },
  W: { dx: -1, dz: 0 },
};

export const OPPOSITE_SLOPE_DIRECTION: Readonly<Record<SlopeDirection, SlopeDirection>> = { N: 'S', E: 'W', S: 'N', W: 'E' };

/** Pente de COIN : un seul coin de la case est haut (niveau + 1), les trois
 *  autres bas. 'SE' = coin haut au sud-est, etc. Raccorde deux pentes
 *  cardinales perpendiculaires (coin d'un plateau). */
export type CornerSlopeDirection = 'NE' | 'NW' | 'SE' | 'SW';
export const CORNER_SLOPE_DIRECTIONS: readonly CornerSlopeDirection[] = ['NE', 'SE', 'SW', 'NW'];

/** Pente de coin INTERIEURE (angle concave d'un plateau) : trois coins
 *  hauts, un seul coin BAS, qui donne son nom ('SEi' = coin sud-est bas).
 *  Produite par la sculpture (sculptRelief) au creux d'une forme en L : sans elle, la case
 *  a 3 coins hauts n'aurait aucune forme sans falaise. */
export type ConcaveCornerSlopeDirection = 'NEi' | 'NWi' | 'SEi' | 'SWi';
export const CONCAVE_CORNER_SLOPE_DIRECTIONS: readonly ConcaveCornerSlopeDirection[] = ['NEi', 'SEi', 'SWi', 'NWi'];

/** Forme d'une case inclinee : pente cardinale, pente de coin (un coin haut)
 *  ou pente de coin interieure (un coin bas). */
export type SlopeShape = SlopeDirection | CornerSlopeDirection | ConcaveCornerSlopeDirection;
export const SLOPE_SHAPES: readonly SlopeShape[] = [...SLOPE_DIRECTIONS, ...CORNER_SLOPE_DIRECTIONS, ...CONCAVE_CORNER_SLOPE_DIRECTIONS];

/** Pente de coin, exterieure (un coin haut) ou interieure (un coin bas) :
 *  les variantes de l'outil manuel Coin de pente. */
export type CornerShape = CornerSlopeDirection | ConcaveCornerSlopeDirection;

export function isCornerSlope(shape: SlopeShape | null | undefined): shape is CornerSlopeDirection {
  return shape === 'NE' || shape === 'NW' || shape === 'SE' || shape === 'SW';
}

export function isConcaveCornerSlope(shape: SlopeShape | null | undefined): shape is ConcaveCornerSlopeDirection {
  return shape === 'NEi' || shape === 'NWi' || shape === 'SEi' || shape === 'SWi';
}

/** Coin « different » d'une pente de coin (seul haut, ou seul bas) : 'NE'
 *  pour NE comme pour NEi. */
export function cornerOfShape(shape: CornerShape): CornerSlopeDirection {
  return shape.slice(0, 2) as CornerSlopeDirection;
}

/** Altitude d'une case dans MapDef.elevationCells. Sparse : une case absente
 *  est plate au niveau 0 ; une entree plate de niveau 0 n'est jamais
 *  ecrite. */
export interface TerrainElevationCellDef {
  x: number;
  z: number;
  /** Niveau plat, ou niveau du bord BAS d'une pente. */
  level: number;
  /** Present = pente montant de `level` a `level + 1` : cardinale (vers
   *  cette direction) ou de coin (seul ce coin est haut). */
  slope?: SlopeShape;
}

/** Hauteurs (monde) des 4 coins d'une case, dans l'ordre (x0,z0), (x1,z0),
 *  (x0,z1), (x1,z1) — x0 = x, x1 = x + 1 — soit NW, NE, SW, SE (N = -Z).
 *  SOURCE DE VERITE geometrique de toute case. */
export type CellCornerHeights = readonly [number, number, number, number];

const FLAT_ZERO: CellCornerHeights = [0, 0, 0, 0];

/** Hauteurs des coins (NW, NE, SW, SE) d'une case de niveau `level`,
 *  plate, en pente cardinale ou en pente de coin. */
export function cornerHeightsOf(level: number, slope: SlopeShape | null | undefined): CellCornerHeights {
  const low = level * TERRAIN_ELEVATION_STEP;
  const high = (level + 1) * TERRAIN_ELEVATION_STEP;
  switch (slope) {
    case 'E':
      return [low, high, low, high];
    case 'W':
      return [high, low, high, low];
    case 'S':
      return [low, low, high, high];
    case 'N':
      return [high, high, low, low];
    case 'NW':
      return [high, low, low, low];
    case 'NE':
      return [low, high, low, low];
    case 'SW':
      return [low, low, high, low];
    case 'SE':
      return [low, low, low, high];
    case 'NWi':
      return [low, high, high, high];
    case 'NEi':
      return [high, low, high, high];
    case 'SWi':
      return [high, high, low, high];
    case 'SEi':
      return [high, high, high, low];
    default:
      return [low, low, low, low];
  }
}

/** Diagonale NW ↔ SE : case dont le coin « different » (seul haut ou seul
 *  bas) est NW ou SE ; toutes les autres formes utilisent NE ↔ SW. */
function usesNwSeDiagonal(slope: SlopeShape | null | undefined): boolean {
  return slope === 'NW' || slope === 'SE' || slope === 'NWi' || slope === 'SEi';
}

const CORNER_NAMES = ['NW', 'NE', 'SW', 'SE'] as const;

/**
 * Forme d'une case d'apres les NIVEAUX de ses 4 coins (NW, NE, SW, SE) :
 * plate, pente cardinale (deux coins hauts voisins), pente de coin (un coin
 * haut), pente de coin interieure (un coin bas). 'saddle' : deux coins hauts
 * en diagonale (aucune forme). null : ecart de plus d'un niveau. PRIMITIVE
 * UNIQUE de la sculpture de relief (sculptRelief) ; inverse de cornerHeightsOf.
 */
export function classifyCellFromCornerLevels(levels: readonly [number, number, number, number]): { level: number; slope?: SlopeShape } | 'saddle' | null {
  const min = Math.min(...levels);
  const max = Math.max(...levels);
  if (max === min) return { level: min };
  if (max - min > 1) return null;
  const high = levels.map((l, i) => (l === max ? i : -1)).filter((i) => i >= 0);
  if (high.length === 1) return { level: min, slope: CORNER_NAMES[high[0]!] as CornerSlopeDirection };
  if (high.length === 3) {
    const low = [0, 1, 2, 3].find((i) => levels[i] === min)!;
    return { level: min, slope: `${CORNER_NAMES[low]}i` as ConcaveCornerSlopeDirection };
  }
  const key = high.join('');
  const cardinal: Record<string, SlopeDirection> = { '01': 'N', '23': 'S', '02': 'W', '13': 'E' };
  return cardinal[key] ? { level: min, slope: cardinal[key] } : 'saddle';
}

/** Deux triangles d'une case, en indices de coins (0 NW, 1 NE, 2 SW, 3 SE).
 *  Diagonale NE ↔ SW par defaut ; NW ↔ SE pour une pente de coin dont le
 *  coin haut est NW ou SE, pour que la diagonale relie toujours le coin
 *  exterieur bas au coin interieur haut (les deux triangles portent la
 *  pente). Une case plate ou en pente cardinale est plane : la diagonale n'y
 *  change rien. SOURCE UNIQUE du mesh (render/terrainCells.ts, overlays) ET
 *  de la hauteur gameplay (heightAt) : la surface jouee est exactement la
 *  surface rendue. */
export type CellTriangles = readonly [readonly [number, number, number], readonly [number, number, number]];
const TRIANGLES_NE_SW: CellTriangles = [[0, 2, 1], [1, 2, 3]];
const TRIANGLES_NW_SE: CellTriangles = [[0, 2, 3], [0, 3, 1]];

export function cellTriangles(slope: SlopeShape | null | undefined): CellTriangles {
  return usesNwSeDiagonal(slope) ? TRIANGLES_NW_SE : TRIANGLES_NE_SW;
}

/** Hauteur au point (fx, fz) ∈ [0, 1]² d'une case aux coins `h`, sur SA
 *  triangulation (cellTriangles) : interpolation lineaire dans le triangle
 *  qui contient le point, jamais bilineaire. */
export function surfaceHeightInCell(h: CellCornerHeights, slope: SlopeShape | null | undefined, fx: number, fz: number): number {
  if (usesNwSeDiagonal(slope)) {
    // Diagonale NW (0,0) ↔ SE (1,1).
    return fz >= fx ? h[0] + (h[3] - h[2]) * fx + (h[2] - h[0]) * fz : h[0] + (h[1] - h[0]) * fx + (h[3] - h[1]) * fz;
  }
  // Diagonale NE (1,0) ↔ SW (0,1).
  return fx + fz <= 1 ? h[0] + (h[1] - h[0]) * fx + (h[2] - h[0]) * fz : h[3] + (h[2] - h[3]) * (1 - fx) + (h[1] - h[3]) * (1 - fz);
}

/** Indices (dans CellCornerHeights) des deux coins de l'arete d'une case du
 *  cote `dir`, ordonnes par coordonnee croissante le long de l'arete — la
 *  meme paire de coins physiques que l'arete opposee de la case voisine. */
export const EDGE_CORNERS: Readonly<Record<SlopeDirection, readonly [number, number]>> = {
  N: [0, 1],
  S: [2, 3],
  W: [0, 2],
  E: [1, 3],
};

/**
 * Champ de hauteur resolu d'une carte : lookup O(1) par case. Construit une
 * fois par carte (voir resolveMapHeightField) ; une carte sans relief donne
 * un champ vide dont toutes les requetes valent 0, au cout d'un test.
 */
export class TerrainHeightField {
  private readonly cells = new Map<string, TerrainElevationCellDef>();

  constructor(entries: readonly TerrainElevationCellDef[] | undefined) {
    for (const e of entries ?? []) {
      if (e.level === 0 && !e.slope) continue;
      this.cells.set(cellKey(e.x, e.z), e);
    }
  }

  /** Aucun relief : toutes les hauteurs valent 0. */
  get isFlat(): boolean {
    return this.cells.size === 0;
  }

  entryAt(cx: number, cz: number): TerrainElevationCellDef | undefined {
    return this.cells.get(cellKey(cx, cz));
  }

  /** Niveau de la case (bord bas pour une pente). */
  levelAt(cx: number, cz: number): number {
    return this.entryAt(cx, cz)?.level ?? 0;
  }

  slopeAt(cx: number, cz: number): SlopeShape | null {
    return this.entryAt(cx, cz)?.slope ?? null;
  }

  cornerHeights(cx: number, cz: number): CellCornerHeights {
    const e = this.entryAt(cx, cz);
    return e ? cornerHeightsOf(e.level, e.slope) : FLAT_ZERO;
  }

  /** Hauteur de la surface au point (x, z), exactement celle du mesh :
   *  meme triangulation (surfaceHeightInCell). Constante sur une case
   *  plate, lineaire sur une pente cardinale, sur deux plans pour une pente
   *  de coin. Case absente (trou) : 0. */
  heightAt(x: number, z: number): number {
    if (this.cells.size === 0) return 0;
    const cx = Math.floor(x);
    const cz = Math.floor(z);
    const e = this.entryAt(cx, cz);
    if (!e) return 0;
    if (!e.slope) return e.level * TERRAIN_ELEVATION_STEP;
    return surfaceHeightInCell(cornerHeightsOf(e.level, e.slope), e.slope, x - cx, z - cz);
  }

  /** Profil de l'arete commune entre la case (cx, cz) et sa voisine du cote
   *  `dir` : hauteurs de CETTE case puis de la voisine aux deux extremites
   *  de l'arete, ordonnees par coordonnee croissante le long de l'arete.
   *  SOURCE UNIQUE de la continuite du terrain (rendu des flancs,
   *  falaises de la simulation, pathfinding, regles de l'editeur) : aucun
   *  cas particulier « cote de pente », tout decoule des coins. */
  edgeProfile(cx: number, cz: number, dir: SlopeDirection): { own: [number, number]; other: [number, number] } {
    const v = SLOPE_DIRECTION_VECTORS[dir];
    const own = this.cornerHeights(cx, cz);
    const other = this.cornerHeights(cx + v.dx, cz + v.dz);
    const [a0, a1] = EDGE_CORNERS[dir];
    const [b0, b1] = EDGE_CORNERS[OPPOSITE_SLOPE_DIRECTION[dir]];
    return { own: [own[a0]!, own[a1]!], other: [other[b0]!, other[b1]!] };
  }

  /** Vrai si l'arete commune entre la case (cx, cz) et sa voisine du cote
   *  `dir` a la meme hauteur aux deux extremites (passage a pied) : plat ↔
   *  plat au meme niveau, haut / bas d'une pente ↔ plateau, deux pentes
   *  paralleles cote a cote… */
  edgeMatches(cx: number, cz: number, dir: SlopeDirection): boolean {
    const { own, other } = this.edgeProfile(cx, cz, dir);
    return own[0] === other[0] && own[1] === other[1];
  }

  /** Niveau commun si TOUTES les cases couvertes par le rectangle sont
   *  plates au meme niveau (emprise d'un batiment), sinon null. */
  flatLevelOver(minX: number, maxX: number, minZ: number, maxZ: number): number | null {
    let level: number | null = null;
    for (let cz = Math.floor(minZ); cz < maxZ; cz++) {
      for (let cx = Math.floor(minX); cx < maxX; cx++) {
        const e = this.entryAt(cx, cz);
        if (e?.slope) return null;
        const l = e?.level ?? 0;
        if (level === null) level = l;
        else if (level !== l) return null;
      }
    }
    return level ?? 0;
  }
}

export const FLAT_TERRAIN = new TerrainHeightField(undefined);

const fieldCache = new WeakMap<readonly TerrainElevationCellDef[], TerrainHeightField>();

/** Champ de hauteur d'une carte, mis en cache par reference du tableau
 *  `elevationCells` (une carte sans relief rend FLAT_TERRAIN). */
export function resolveMapHeightField(map: { elevationCells?: readonly TerrainElevationCellDef[] }): TerrainHeightField {
  const entries = map.elevationCells;
  if (!entries || entries.length === 0) return FLAT_TERRAIN;
  let field = fieldCache.get(entries);
  if (!field) {
    field = new TerrainHeightField(entries);
    fieldCache.set(entries, field);
  }
  return field;
}

/** Tailles des pinceaux de relief : 1×1 (une case logique) ou 4×4 (coeur
 *  logique 2×2 et couronne de transitions). */
export type ReliefBrushSize = 1 | 4;
export const RELIEF_BRUSH_SIZES: readonly ReliefBrushSize[] = [1, 4];

/** Cote du coeur LOGIQUE d'un pinceau (cases dont la hauteur voulue
 *  change) : 1 pour le 1×1, 2 pour le 4×4. */
export function reliefBrushCoreSide(size: ReliefBrushSize): number {
  return size === 1 ? 1 : size - 2;
}

/** Case nord-ouest du coeur d'un pinceau pose pres de (x, z) : coeur pair
 *  centre sur l'intersection de grille la plus proche, coeur impair sur la
 *  case sous le curseur. */
export function reliefBrushOrigin(size: ReliefBrushSize, x: number, z: number): { x: number; z: number } {
  const side = reliefBrushCoreSide(size);
  if (side % 2 === 0) return { x: Math.round(x) - side / 2, z: Math.round(z) - side / 2 };
  return { x: Math.floor(x) - (side - 1) / 2, z: Math.floor(z) - (side - 1) / 2 };
}

/** Cases (cle "x,z") du coeur logique d'un pinceau dont la case nord-ouest
 *  est (originX, originZ). */
export function reliefBrushCore(size: ReliefBrushSize, originX: number, originZ: number): string[] {
  const side = reliefBrushCoreSide(size);
  const keys: string[] = [];
  for (let j = 0; j < side; j++) for (let i = 0; i < side; i++) keys.push(cellKey(originX + i, originZ + j));
  return keys;
}

/** Sens d'une sculpture de relief : +1 (Surelever) ou -1 (Abaisser). */
export type ReliefDelta = 1 | -1;

/**
 * Hauteurs LOGIQUES des cases (pinceaux Surelever / Abaisser), en niveaux,
 * cle "x,z" de la case ; case absente = 0. SOURCE DE VERITE de la
 * sculpture : le designer ajoute ou retire des couches a des cases, le rendu
 * canonique (renderReliefLogic) en deduit plateaux, pentes et coins.
 */
export type ReliefLogic = ReadonlyMap<string, number>;

/** Sommets (dx, dz) d'une case dans l'ordre des coins NW, NE, SW, SE. */
const CORNER_VERTEX_OFFSETS = [[0, 0], [1, 0], [0, 1], [1, 1]] as const;
const NEIGHBOR_OFFSETS = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;

const parseKey = (key: string): [number, number] => key.split(',').map(Number) as [number, number];
const byZThenX = (a: string, b: string): number => { const [ax, az] = parseKey(a); const [bx, bz] = parseKey(b); return az - bz || ax - bx; };
const cornerLevelsOf = (field: TerrainHeightField, cx: number, cz: number): number[] => field.cornerHeights(cx, cz).map((h) => Math.round(h / TERRAIN_ELEVATION_STEP));

/** Hauteur logique deduite d'un relief existant (carte sans donnee
 *  logique, ou case sans entree enregistree) : le niveau d'une case plate,
 *  le bas d'une pente (une transition appartient d'abord a la region basse,
 *  comme au pied d'une butte). Un relief produit par la sculpture se redonne
 *  ainsi lui-meme, sauf exceptions enregistrees (MapDef.reliefLogic). */
export function deriveReliefLogic(field: TerrainHeightField, cells: readonly { x: number; z: number }[]): Map<string, number> {
  const logic = new Map<string, number>();
  if (field.isFlat) return logic;
  for (const c of cells) {
    const level = Math.min(...cornerLevelsOf(field, c.x, c.z));
    if (level > 0) logic.set(cellKey(c.x, c.z), level);
  }
  return logic;
}

/** Surface canonique d'un champ logique (voir renderReliefLogic). */
export interface RenderedRelief {
  /** Hauteur reelle (niveaux) du sommet (vx, vz). */
  vertexLevel(vx: number, vz: number): number;
  /** Cases (cles) dont une liaison diagonale (selle) a ete comblee. */
  saddles: ReadonlySet<string>;
}

/**
 * RENDU CANONIQUE de la sculpture : surface ne dependant QUE des hauteurs
 * logiques des cases `logic` et des cases existantes `cells` (jamais de
 * l'historique des traits).
 *
 * 1. Regions : cases voisines (4-connexite) de meme hauteur logique. Une
 *    region qui touche le vide (bord de carte, trou) est de profondeur 0 ;
 *    une region enclavee a la profondeur de sa voisine la plus proche du
 *    vide, plus un. Priorite d'une region : profondeur, puis hauteur.
 * 2. Chaque sommet prend la hauteur de la case la plus prioritaire qui le
 *    touche : une region enclavee garde son plat jusqu'a son bord, les
 *    transitions vont dans la region qui l'entoure — une butte dans la
 *    plaine (pentes au pied), un creux dans un plateau (pentes sur le
 *    pourtour) ; a egalite (deux regions qui touchent le bord), la plus
 *    haute garde son plat.
 * 3. Une case a plus d'un niveau d'ecart rapproche ses sommets les moins
 *    prioritaires du sommet le plus prioritaire (deux anneaux autour d'un
 *    sommet 2 pose sur du 0, ou d'un creux de deux niveaux) ; une selle
 *    (deux coins opposes de meme hauteur, l'autre paire differente) aligne
 *    la paire la moins prioritaire sur l'autre : liaison diagonale comblee,
 *    entre buttes comme entre creux.
 *
 * Le vide n'impose rien : un plateau colle au bord se termine par la face
 * verticale du bord. Pur et deterministe (ordre trie).
 */
export function renderReliefLogic(logic: ReliefLogic, cells: readonly { x: number; z: number }[]): RenderedRelief {
  const present = new Set(cells.map((c) => cellKey(c.x, c.z)));
  const levelOf = (key: string): number => logic.get(key) ?? 0;
  const sorted = [...cells].sort((a, b) => a.z - b.z || a.x - b.x);
  // 1. Regions (4-connexite, meme hauteur) et profondeur depuis le vide.
  const region = new Map<string, number>();
  const regionTouchesVoid: boolean[] = [];
  const regionNeighbors: Set<number>[] = [];
  for (const c of sorted) {
    const start = cellKey(c.x, c.z);
    if (region.has(start)) continue;
    const id = regionTouchesVoid.length;
    regionTouchesVoid.push(false);
    regionNeighbors.push(new Set());
    const level = levelOf(start);
    const stack = [start];
    region.set(start, id);
    while (stack.length > 0) {
      const [x, z] = parseKey(stack.pop()!);
      for (const [dx, dz] of NEIGHBOR_OFFSETS) {
        const key = cellKey(x + dx, z + dz);
        if (!present.has(key)) { regionTouchesVoid[id] = true; continue; }
        if (region.has(key) || levelOf(key) !== level) continue;
        region.set(key, id);
        stack.push(key);
      }
    }
  }
  for (const c of sorted) {
    const id = region.get(cellKey(c.x, c.z))!;
    for (const [dx, dz] of NEIGHBOR_OFFSETS) {
      const other = region.get(cellKey(c.x + dx, c.z + dz));
      if (other !== undefined && other !== id) regionNeighbors[id]!.add(other);
    }
  }
  const depth: number[] = regionTouchesVoid.map((v) => (v ? 0 : Infinity));
  const queue = depth.map((d, i) => (d === 0 ? i : -1)).filter((i) => i >= 0);
  for (let q = 0; q < queue.length; q++) {
    const id = queue[q]!;
    for (const n of [...regionNeighbors[id]!].sort((a, b) => a - b)) {
      if (depth[n] !== Infinity) continue;
      depth[n] = depth[id]! + 1;
      queue.push(n);
    }
  }
  const rankOf = (key: string): number => {
    const d = depth[region.get(key)!]!;
    return (d === Infinity ? 0 : d) * (TERRAIN_LEVEL_MAX + 1) + levelOf(key);
  };
  // 2. Hauteur de chaque sommet : la case la plus prioritaire qui le touche.
  const vertexLevel = new Map<string, number>();
  const vertexRank = new Map<string, number>();
  for (const c of sorted) {
    const key = cellKey(c.x, c.z);
    const rank = rankOf(key);
    for (const [dx, dz] of CORNER_VERTEX_OFFSETS) {
      const v = cellKey(c.x + dx, c.z + dz);
      if ((vertexRank.get(v) ?? -1) >= rank) continue;
      vertexRank.set(v, rank);
      vertexLevel.set(v, levelOf(key));
    }
  }
  // 3. Ecarts de plus d'un niveau et selles, jusqu'a stabilite.
  const saddles = new Set<string>();
  const set = (v: string, level: number, rank: number): boolean => {
    if (vertexLevel.get(v) === level) return false;
    vertexLevel.set(v, level);
    vertexRank.set(v, rank);
    return true;
  };
  for (let pass = 0; pass < 64; pass++) {
    let changed = false;
    for (const c of sorted) {
      const vs = CORNER_VERTEX_OFFSETS.map(([dx, dz]) => cellKey(c.x + dx, c.z + dz));
      const h = vs.map((v) => vertexLevel.get(v) ?? 0);
      const r = vs.map((v) => vertexRank.get(v) ?? 0);
      const min = Math.min(...h);
      const max = Math.max(...h);
      const top = Math.max(...r);
      const anchor = h[r.indexOf(top)]!;
      if (max - min > 1) {
        // Sommets moins prioritaires ramenes a un niveau de l'ancre ; si
        // cela ne suffit pas (ancres en conflit), les plus bas remontent.
        let moved = false;
        vs.forEach((v, i) => {
          if (r[i]! >= top) return;
          const next = Math.min(anchor + 1, Math.max(anchor - 1, h[i]!));
          if (next !== h[i]) moved = set(v, next, top - 0.5) || moved;
        });
        if (!moved) vs.forEach((v, i) => { if (h[i]! < max - 1) moved = set(v, max - 1, r[i]!) || moved; });
        changed = moved || changed;
        continue;
      }
      if (classifyCellFromCornerLevels(h as [number, number, number, number]) !== 'saddle') continue;
      // Selle : paires diagonales NW-SE (0, 3) et NE-SW (1, 2).
      const rankA = Math.max(r[0]!, r[3]!);
      const rankB = Math.max(r[1]!, r[2]!);
      const [winners, losers] = rankA > rankB ? [[0, 3], [1, 2]] : rankB > rankA ? [[1, 2], [0, 3]] : h[0]! > h[1]! ? [[0, 3], [1, 2]] : [[1, 2], [0, 3]];
      const level = h[winners[0]!]!;
      const rank = Math.max(r[winners[0]!]!, r[winners[1]!]!) - 0.5;
      for (const i of losers) changed = set(vs[i]!, level, rank) || changed;
      saddles.add(cellKey(c.x, c.z));
    }
    if (!changed) break;
  }
  return { vertexLevel: (vx, vz) => vertexLevel.get(cellKey(vx, vz)) ?? 0, saddles };
}

/** Resultat d'une sculpture (voir sculptRelief). */
export interface ReliefSculpt {
  /** Champ logique apres le trait. */
  logic: Map<string, number>;
  /** Vrai si le champ logique change (faux : tout le coeur est a la limite). */
  logicChanged: boolean;
  /** Nouvelle definition de chaque case dont la surface change, triees par
   *  z puis x. */
  cells: TerrainElevationCellDef[];
  /** Cases (cles "x,z") de `cells` comblees par une liaison diagonale. */
  bridged: string[];
  /** Premiere case qui devrait changer mais ne le peut pas (case
   *  verrouillee), ou null. Le vide (hors carte, trou) n'est jamais une
   *  contrainte. */
  blocked: { x: number; z: number; reason: 'locked' } | null;
}

/** Ce que la sculpture lit de la carte. */
export interface ReliefSculptContext {
  /** Champ logique et surface canonique au DEBUT du trait. */
  logic: ReliefLogic;
  rendered: RenderedRelief;
  /** Relief enregistre au debut du trait. */
  field: TerrainHeightField;
  /** Cases existantes de la carte. */
  cells: readonly { x: number; z: number }[];
  hasCell: (cx: number, cz: number) => boolean;
  isLocked: (cx: number, cz: number) => boolean;
}

/**
 * SCULPTURE (pinceaux Surelever +1 / Abaisser -1, 1×1 et 4×4) : un seul
 * moteur. Chaque case `painted` (cles "x,z" ; seules les cases existantes
 * comptent, le vide est ignore) gagne ou perd UNE couche logique par rapport au debut du trait
 * (borne TERRAIN_LEVEL_MIN..MAX) ; la surface est le rendu canonique du
 * nouveau champ (renderReliefLogic). Seules les cases dont ce rendu change
 * sont recalculees (une falaise ancienne a distance n'est jamais touchee) ;
 * chacune doit etre libre (`isLocked` faux). Le vide (hors carte, trou)
 * n'impose rien : un relief s'y arrete par une face verticale, sans
 * transition ni donnee dans le vide. Reversible : le
 * trait inverse sur les memes cases redonne le meme champ logique, donc le
 * meme terrain.
 */
export function sculptRelief(ctx: ReliefSculptContext, painted: ReadonlySet<string>, delta: ReliefDelta): ReliefSculpt {
  const logic = new Map(ctx.logic);
  let logicChanged = false;
  for (const key of [...painted].sort(byZThenX)) {
    const [cx, cz] = parseKey(key);
    if (!ctx.hasCell(cx, cz)) continue;
    const before = ctx.logic.get(key) ?? 0;
    const after = Math.min(TERRAIN_LEVEL_MAX, Math.max(TERRAIN_LEVEL_MIN, before + delta));
    if (after === before) continue;
    logicChanged = true;
    if (after === 0) logic.delete(key);
    else logic.set(key, after);
  }
  if (!logicChanged) return { logic, logicChanged, cells: [], bridged: [], blocked: null };
  const rendered = renderReliefLogic(logic, ctx.cells);
  const cells: TerrainElevationCellDef[] = [];
  let blocked: ReliefSculpt['blocked'] = null;
  for (const c of [...ctx.cells].sort((a, b) => a.z - b.z || a.x - b.x)) {
    const corners = CORNER_VERTEX_OFFSETS.map(([dx, dz]) => rendered.vertexLevel(c.x + dx, c.z + dz));
    const previous = CORNER_VERTEX_OFFSETS.map(([dx, dz]) => ctx.rendered.vertexLevel(c.x + dx, c.z + dz));
    if (corners.every((l, i) => l === previous[i])) continue;
    const shape = classifyCellFromCornerLevels(corners as [number, number, number, number]);
    if (!shape || shape === 'saddle') continue;
    const stored = ctx.field.entryAt(c.x, c.z);
    if ((stored?.level ?? 0) === shape.level && (stored?.slope ?? undefined) === shape.slope) continue;
    if (ctx.isLocked(c.x, c.z)) blocked ??= { x: c.x, z: c.z, reason: 'locked' };
    cells.push({ x: c.x, z: c.z, ...shape });
  }
  const output = new Set(cells.map((c) => cellKey(c.x, c.z)));
  return { logic, logicChanged, cells, bridged: [...rendered.saddles].filter((key) => output.has(key)).sort(byZThenX), blocked };
}

/** Seuil de blocage d'un flanc, en FRACTION DE NIVEAU (valide
 *  provisoirement par Antoine) : deux profils d'arete incompatibles ne
 *  bloquent la COLLISION que la ou leur ecart de hauteur atteint un quart
 *  de niveau. Le long du flanc d'une pente posee contre un plat, l'ecart
 *  croit de 0 (pied) a un niveau (sommet) : la falaise de collision commence
 *  au quart de l'arete, aucun mur invisible au coin d'entree de la rampe.
 *  Le pathfinding, lui, bloque toujours l'arete entiere. */
export const SLOPE_SIDE_BLOCK_THRESHOLD = 0.25;

/** SLOPE_SIDE_BLOCK_THRESHOLD en hauteur monde. */
export const CLIFF_GAP_TOLERANCE = TERRAIN_ELEVATION_STEP * SLOPE_SIDE_BLOCK_THRESHOLD;

/** Demi-epaisseur (cases) d'un obstacle de falaise, centre sur l'arete :
 *  NULLE, la falaise est un segment. Une pente d'une case de large garde
 *  ainsi toute sa largeur (1 case) — exactement le diametre d'un Fantassin
 *  (rayon 0,5) ; la moindre epaisseur le bloquait a l'entree. La collision
 *  cercle / segment reste exacte (resolveObstacleCollisions). */
export const CLIFF_HALF_THICKNESS = 0;

/**
 * Falaises de la carte, en obstacles synthetiques SANS EPAISSEUR sur chaque
 * arete dont les profils ne se raccordent pas (edgeMatches faux) entre deux
 * cases EXISTANTES (une case absente est deja un obstacle de vide, voir
 * World.setMap). Le segment couvre la partie de l'arete ou l'ecart de
 * hauteur atteint CLIFF_GAP_TOLERANCE (l'ecart est lineaire le long de
 * l'arete : rien a retirer entre deux plats, le quart bas retire au pied
 * d'un flanc de pente). Les segments alignes et contigus sont fusionnes.
 * `terrainCliff` : la grille A* les lit comme des aretes bloquees, pas comme
 * des cases (voir sim/pathfinding.ts) ; `blocksShots: false` : la ligne de
 * tir reste 2D. Ordre deterministe (lignes et segments tries).
 */
export function computeCliffObstacles(field: TerrainHeightField, hasCell: (cx: number, cz: number) => boolean, cells: readonly { x: number; z: number }[]): ObstacleDef[] {
  if (field.isFlat) return [];
  // Aretes verticales (ligne x = cx + 1, entre (cx, cz) et (cx + 1, cz)) et
  // horizontales (ligne z = cz + 1), regroupees par ligne en intervalles
  // [debut, fin] le long de la ligne.
  const vertical = new Map<number, [number, number][]>();
  const horizontal = new Map<number, [number, number][]>();
  const add = (lines: Map<number, [number, number][]>, line: number, start: number, profile: { own: [number, number]; other: [number, number] }) => {
    for (const [t0, t1] of cliffSpans(profile.own[0] - profile.other[0], profile.own[1] - profile.other[1])) {
      lines.set(line, [...(lines.get(line) ?? []), [start + t0, start + t1]]);
    }
  };
  for (const c of cells) {
    if (hasCell(c.x + 1, c.z) && !field.edgeMatches(c.x, c.z, 'E')) add(vertical, c.x + 1, c.z, field.edgeProfile(c.x, c.z, 'E'));
    if (hasCell(c.x, c.z + 1) && !field.edgeMatches(c.x, c.z, 'S')) add(horizontal, c.z + 1, c.x, field.edgeProfile(c.x, c.z, 'S'));
  }
  const obstacles: ObstacleDef[] = [];
  const thickness = CLIFF_HALF_THICKNESS * 2;
  const runs = (spans: [number, number][]): [number, number][] => {
    const sorted = [...spans].sort((a, b) => a[0] - b[0]);
    const out: [number, number][] = [];
    for (const [from, to] of sorted) {
      const last = out[out.length - 1];
      if (last && last[1] === from) last[1] = to;
      else out.push([from, to]);
    }
    return out;
  };
  for (const line of [...vertical.keys()].sort((a, b) => a - b)) {
    for (const [from, to] of runs(vertical.get(line)!)) {
      obstacles.push({ kind: 'rock', terrainCliff: true, blocksShots: false, x: line, z: (from + to) / 2, tilesX: thickness, tilesZ: to - from });
    }
  }
  for (const line of [...horizontal.keys()].sort((a, b) => a - b)) {
    for (const [from, to] of runs(horizontal.get(line)!)) {
      obstacles.push({ kind: 'rock', terrainCliff: true, blocksShots: false, x: (from + to) / 2, z: line, tilesX: to - from, tilesZ: thickness });
    }
  }
  return obstacles;
}

/** Parties [t0, t1] de [0, 1] le long d'une arete ou l'ecart de hauteur,
 *  lineaire de d0 (debut) a d1 (fin), vaut au moins CLIFF_GAP_TOLERANCE en
 *  valeur absolue (au plus deux parties, si l'ecart change de signe). */
function cliffSpans(d0: number, d1: number): [number, number][] {
  const spans: [number, number][] = [];
  for (const sign of [1, -1]) {
    const a = sign * d0 - CLIFF_GAP_TOLERANCE;
    const b = sign * d1 - CLIFF_GAP_TOLERANCE;
    if (a < 0 && b < 0) continue;
    if (a >= 0 && b >= 0) spans.push([0, 1]);
    else if (a >= 0) spans.push([0, a / (a - b)]);
    else spans.push([a / (a - b), 1]);
  }
  return spans.filter(([t0, t1]) => t1 - t0 > 1e-9).sort((x, y) => x[0] - y[0]);
}

/**
 * Validation d'une pente de coin manuelle sur la case (cx, cz), exterieure
 * (`dir` = coin haut) ou interieure (`dir` = 'NEi'… : coin bas) : son niveau
 * est celui pour lequel CHAQUE voisine existante a, sur l'arete commune,
 * exactement le meme profil (aucune falaise involontaire) ; les deux
 * voisines qui touchent le coin « different » (les deux pentes a raccorder)
 * doivent exister. Memes donnees et meme geometrie que les coins de
 * la sculpture (sculptRelief).
 */
export function evaluateCornerSlope(
  field: TerrainHeightField,
  hasCell: (cx: number, cz: number) => boolean,
  cx: number,
  cz: number,
  dir: CornerShape,
): { ok: true; level: number } | { ok: false; reason: string } {
  if (!hasCell(cx, cz)) return { ok: false, reason: 'aucune case' };
  const sideNames: Record<SlopeDirection, string> = { N: 'nord', E: 'est', S: 'sud', W: 'ouest' };
  // Aretes inclinees, qui touchent le coin different : vers les deux pentes
  // a raccorder.
  const highSides: SlopeDirection[] = [dir[0] as SlopeDirection, dir[1] as SlopeDirection];
  for (const side of highSides) {
    const v = SLOPE_DIRECTION_VECTORS[side];
    if (!hasCell(cx + v.dx, cz + v.dz)) return { ok: false, reason: `vide ou trou côté ${sideNames[side]}` };
  }
  let best: { level: number; firstMismatch: SlopeDirection | null; matches: number } | null = null;
  for (let level = TERRAIN_LEVEL_MIN; level <= TERRAIN_LEVEL_MAX - 1; level++) {
    const own = cornerHeightsOf(level, dir);
    let matches = 0;
    let firstMismatch: SlopeDirection | null = null;
    for (const side of SLOPE_DIRECTIONS) {
      const v = SLOPE_DIRECTION_VECTORS[side];
      if (!hasCell(cx + v.dx, cz + v.dz)) continue;
      const other = field.cornerHeights(cx + v.dx, cz + v.dz);
      const [a0, a1] = EDGE_CORNERS[side];
      const [b0, b1] = EDGE_CORNERS[OPPOSITE_SLOPE_DIRECTION[side]];
      if (own[a0] === other[b0] && own[a1] === other[b1]) matches++;
      else firstMismatch ??= side;
    }
    if (firstMismatch === null) return { ok: true, level };
    if (!best || matches > best.matches) best = { level, firstMismatch, matches };
  }
  return { ok: false, reason: `falaise côté ${sideNames[best!.firstMismatch!]}` };
}

/**
 * Validation d'une pente posee sur la case (cx, cz), montant vers `dir` :
 * la case basse (cote oppose) et la case haute (cote `dir`) doivent exister,
 * et leurs aretes tournees vers la pente doivent etre horizontales aux
 * hauteurs N et N + 1. Renvoie le niveau N de la pente, ou la raison du
 * refus. Partagee par l'outil Pente de l'editeur et son apercu.
 */
export function evaluateSlope(
  field: TerrainHeightField,
  hasCell: (cx: number, cz: number) => boolean,
  cx: number,
  cz: number,
  dir: SlopeDirection,
): { ok: true; level: number } | { ok: false; reason: string } {
  if (!hasCell(cx, cz)) return { ok: false, reason: 'aucune case' };
  const v = SLOPE_DIRECTION_VECTORS[dir];
  const lowX = cx - v.dx;
  const lowZ = cz - v.dz;
  const highX = cx + v.dx;
  const highZ = cz + v.dz;
  if (!hasCell(lowX, lowZ) || !hasCell(highX, highZ)) return { ok: false, reason: 'vide ou trou au pied ou au sommet' };
  const edgeHeight = (x: number, z: number, side: SlopeDirection): number | null => {
    const h = field.cornerHeights(x, z);
    const [a, b] = EDGE_CORNERS[side];
    return h[a] === h[b] ? h[a]! : null;
  };
  const low = edgeHeight(lowX, lowZ, dir);
  const high = edgeHeight(highX, highZ, OPPOSITE_SLOPE_DIRECTION[dir]);
  if (low === null || high === null) return { ok: false, reason: 'bord voisin incliné' };
  const step = Math.round((high - low) / TERRAIN_ELEVATION_STEP);
  if (step === 0) return { ok: false, reason: 'même niveau des deux côtés' };
  if (step !== 1) return { ok: false, reason: step < 0 ? 'le sommet est plus bas que le pied (tourner : R)' : 'différence de deux niveaux' };
  return { ok: true, level: Math.round(low / TERRAIN_ELEVATION_STEP) };
}
