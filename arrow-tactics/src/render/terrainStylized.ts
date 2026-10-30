import * as THREE from 'three';
import { cellKey, type TerrainCellDef } from '../config/mapDef';
import { cellTriangles, EDGE_CORNERS, OPPOSITE_SLOPE_DIRECTION, SLOPE_DIRECTIONS, SLOPE_DIRECTION_VECTORS, TERRAIN_ELEVATION_STEP, type SlopeDirection } from '../config/terrainElevation';
import { GROUND_SURFACES, groundFlankSurface, type GroundSurfaceId } from './groundSurfaces';
import { groundMacro, groundRenderSurface, groundStates, groundSurfaceDef } from './groundLook';
import { CELL_THICKNESS, FLANK_FOOT_SHADE, groundMaterial, layerMesh, newBuffers, RELIEF_TINT_PER_LEVEL, SLOPE_NORMAL_Y, SLOPE_SHADE, type LayerBuffers, type TerrainContext } from './terrainCells';

/**
 * Rendu facette du terrain (`faceted-plus`, rendu par defaut depuis le
 * 2026-10-29 ; temoins `faceted` et `faceted-plus-shadow`) : meme grille
 * tactique, silhouette moins carree. Seul le mesh affiche change ;
 * la surface logique (TerrainHeightField.heightAt), le pointage, la pose, la
 * simulation et la carte ne sont jamais touches.
 *
 * - Dessus : celui du rendu `grid` (memes triangles, memes UV). (La piste
 *   `organic`, qui deplacait les sommets interieurs des plats, a ete retiree :
 *   gain invisible a la camera de jeu, sol visible decale.)
 * - Bords libres (bord de carte, trou) : une BANDE irreguliere prolonge le
 *   dessus vers le vide (quelques sommets par arete, decalage deterministe),
 *   puis une falaise facettee (ligne haute = la bande, ligne(s)
 *   intermediaire(s), ligne basse) descend jusqu'a -CELL_THICKNESS. La bande
 *   ne fait qu'AJOUTER de la surface hors de la case : une case jouable n'est
 *   jamais rognee, rien de pose ne deborde dans le vide.
 * - Falaises interieures (deux cases existantes a hauteurs differentes) :
 *   meme arete, mais subdivisee, la ligne intermediaire bombee de quelques
 *   centimetres vers la case basse.
 * - `faceted-plus` : une vraie rupture de niveau (arete horizontale des deux
 *   cotes, au moins un niveau d'ecart) recoit une JUPE, comme un bord libre
 *   mais plus discrete : le dessus haut deborde de quelques centimetres
 *   au-dessus de la case basse (jamais vers l'interieur : le plateau n'est
 *   pas rogne), la paroi facettee descend jusqu'au sol de la case basse,
 *   legerement enfoncee (aucune fente). Coins saillants, rentrants et formes
 *   en L partagent leurs sommets decales ; un sommet ou se rejoignent plus
 *   de deux hauteurs reste en colonne verticale. Les pentes praticables et
 *   le flanc d'une rampe ne sont jamais deformes.
 * - `faceted-plus-shadow` : meme geometrie, terrain qui projette ses
 *   ombres (castShadow), lumieres inchangees.
 *
 * Deterministe (hash de x, z, orientation, indice ; jamais Math.random).
 * Chaque element (dessus, arete, sommet decale) est calcule depuis la carte
 * entiere (TerrainContext) et emis par sa case : un morceau du sol
 * (render/terrainChunks.ts) a exactement les sommets du plateau d'un seul
 * tenant.
 * Continuite : chaque sommet de bord est calcule une seule fois et partage
 * par les aretes qui s'y rejoignent ; les bandes et les falaises se
 * raccordent en zigzag (aucun T de jonction sur les aretes de la grille).
 * Normales par triangle (rendu facette, comme `grid`).
 */

interface StyleParams {
  /** Segments visuels par arete libre. */
  edgeSegments: number;
  /** Decalage vers le vide des points intermediaires d'une arete libre (cases). */
  edgeOffset: readonly [number, number];
  /** Decalage du sommet d'un coin saillant (une seule case autour), en diagonale. */
  convexCorner: readonly [number, number];
  /** Decalage du sommet d'un coin rentrant (trois cases autour), vers le vide :
   *  comble la marche d'escalier. */
  concaveCorner: readonly [number, number];
  /** Decalage d'un sommet de bord rectiligne. */
  straightVertex: readonly [number, number];
  /** Variation de la position des points intermediaires le long de l'arete (fraction de segment). */
  alongJitter: number;
  /** Lignes intermediaires des falaises de bord. */
  cliffRows: number;
  /** Decalage horizontal (vers le vide) des lignes intermediaires. */
  cliffRowJitter: number;
  /** Evasement au pied des falaises de bord (decalage de la ligne basse). */
  cliffFlare: number;
  /** Falaises interieures : segments et bombement max vers la case basse. */
  innerCliffSegments: number;
  innerCliffBulge: number;
  /** Jupe des ruptures de niveau interieures (faceted-plus), ou null. */
  innerSkirt: InnerSkirtParams | null;
}

/** Jupe d'une rupture de niveau interieure : decalages (cases) vers la case basse. */
interface InnerSkirtParams {
  segments: number;
  edgeOffset: readonly [number, number];
  convexCorner: readonly [number, number];
  concaveCorner: readonly [number, number];
  straightVertex: readonly [number, number];
  /** Decalage de la ligne intermediaire et du pied de la paroi. */
  rowJitter: number;
  foot: readonly [number, number];
  /** Enfoncement du pied sous le sol de la case basse (aucune fente visible). */
  embed: number;
}

/** Vide d'une seule case de large (trou d'une case, crevasse) : debord vers
 *  le vide reduit a cette fraction, pour que le trou reste lisible (une case
 *  infranchissable ne doit pas sembler refermee). */
const NARROW_VOID_SCALE = 0.35;

export type TerrainStyle = 'faceted' | 'faceted-plus';

const FACETED_BASE: StyleParams = {
  edgeSegments: 3,
  edgeOffset: [0.06, 0.18],
  convexCorner: [0.02, 0.07],
  concaveCorner: [0.26, 0.36],
  straightVertex: [0.05, 0.14],
  alongJitter: 0.25,
  cliffRows: 1,
  cliffRowJitter: 0.07,
  cliffFlare: 0,
  innerCliffSegments: 3,
  innerCliffBulge: 0.05,
  innerSkirt: null,
};

/** Reglages des directions experimentales (valeurs en cases). `faceted-plus` =
 *  `faceted` (bords libres identiques) + jupe des ruptures interieures. */
export const TERRAIN_STYLE_PARAMS: Readonly<Record<TerrainStyle, StyleParams>> = {
  faceted: FACETED_BASE,
  'faceted-plus': {
    ...FACETED_BASE,
    innerSkirt: {
      segments: 3,
      edgeOffset: [0.03, 0.1],
      convexCorner: [0.01, 0.04],
      concaveCorner: [0.1, 0.18],
      straightVertex: [0.02, 0.07],
      rowJitter: 0.04,
      foot: [0, 0.03],
      embed: 0.02,
    },
  },
};

const SEED = 0x2f6b9d1;
/** Hash deterministe dans [0, 1). */
function hash(a: number, b: number, c: number, d = 0): number {
  let h = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1) ^ Math.imul(c | 0, 0x1b873593) ^ Math.imul(d | 0, 0x85ebca77) ^ SEED;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
const pick = (r: readonly [number, number], u: number) => r[0] + (r[1] - r[0]) * u;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Etiquettes de hash : sommet, arete horizontale (le long de x), arete verticale. */
const TAG_VERTEX = 1;
const TAG_EDGE_X = 2;
const TAG_EDGE_Z = 3;
const TAG_SKIRT_VERTEX = 6;

/** Bandes du dessus qui debordent d'une case (bord libre, jupe), par case
 * (cle cellKey) : prolongees par les transitions (render/surfaceBlend.ts). */
export type TerrainLips = Map<string, THREE.Vector3[][]>;

export function buildStylizedTerrain(cells: readonly TerrainCellDef[], ctx: TerrainContext, style: TerrainStyle, castShadow = false): { group: THREE.Group; lips: TerrainLips } {
  const P = TERRAIN_STYLE_PARAMS[style];
  const group = new THREE.Group();
  const { field, has } = ctx;
  const lips: TerrainLips = new Map();
  const lip = (cell: TerrainCellDef, p: THREE.Vector3[]) => { const key = cellKey(cell.x, cell.z); let l = lips.get(key); if (!l) lips.set(key, (l = [])); l.push(p); };
  const tops = new Map<GroundSurfaceId, LayerBuffers>();
  const topOf = (id: GroundSurfaceId) => { let b = tops.get(id); if (!b) tops.set(id, (b = newBuffers())); return b; };
  const flanks = newBuffers();
  const flankSurface = groundFlankSurface();
  const flankTiles = GROUND_SURFACES[flankSurface].tiles;

  const n = new THREE.Vector3();
  const ab = new THREE.Vector3();
  const ac = new THREE.Vector3();
  // `surface` (dessus et levres seulement) : variation `?groundLook=` au point monde ;
  // `cell` : case qui emet le triangle (etats de l'herbe, `living`).
  const states = groundStates(ctx);
  const push = (out: LayerBuffers, p: THREE.Vector3[], uv: [number, number][], outward: THREE.Vector3, shade: (y: number, normal: THREE.Vector3) => number, surface?: GroundSurfaceId, cell?: TerrainCellDef) => {
    ab.subVectors(p[1]!, p[0]!);
    ac.subVectors(p[2]!, p[0]!);
    n.crossVectors(ab, ac);
    if (n.lengthSq() < 1e-12) return;
    const order = n.dot(outward) >= 0 ? [0, 1, 2] : [0, 2, 1];
    n.normalize();
    if (n.dot(outward) < 0) n.negate();
    for (const i of order) {
      out.positions.push(p[i]!.x, p[i]!.y, p[i]!.z);
      const s = shade(p[i]!.y, n);
      const m = surface ? groundMacro(surface, p[i]!.x, p[i]!.z) : null;
      if (m) out.colors.push(s * m[0], s * m[1], s * m[2]);
      else out.colors.push(s, s, s);
      const st = surface && cell && states ? states.at(surface, p[i]!.x, p[i]!.z, cell.x, cell.z) : null;
      if (st) out.states.push(st[0], st[1], st[2]);
      out.normals.push(n.x, n.y, n.z);
      out.uvs.push(uv[i]![0], uv[i]![1]);
    }
  };
  const up = new THREE.Vector3(0, 1, 0);
  const topShade = (y: number, normal: THREE.Vector3) => {
    const tilt = Math.min(1, Math.max(0, (1 - normal.y) / (1 - SLOPE_NORMAL_Y)));
    return (1 + RELIEF_TINT_PER_LEVEL * (Math.max(0, y) / TERRAIN_ELEVATION_STEP)) * (1 - SLOPE_SHADE * tilt);
  };
  // Triangle de dessus de la case `cell` (UV monde / cycle de la surface).
  const topTri = (surface: GroundSurfaceId, p: THREE.Vector3[], cell: TerrainCellDef) => {
    const t = groundSurfaceDef(surface).tiles;
    push(topOf(surface), p, p.map((q) => [q.x / t, -q.z / t] as [number, number]), up, topShade, surface, cell);
  };
  // Zigzag entre une ligne de 2 points (a, b) et une polyligne O[0..S] (O[0] cote a) : aucun T de jonction sur [a, b].
  const zipper = (a: THREE.Vector3, b: THREE.Vector3, O: THREE.Vector3[], emit: (p: THREE.Vector3[]) => void) => {
    const S = O.length - 1;
    const m = Math.floor(S / 2);
    for (let k = 0; k < m; k++) emit([a, O[k]!, O[k + 1]!]);
    emit([a, O[m]!, b]);
    for (let k = m; k < S; k++) emit([b, O[k]!, O[k + 1]!]);
  };
  // Grille de quads entre deux polylignes de meme longueur.
  const ladder = (A: THREE.Vector3[], B: THREE.Vector3[], emit: (p: THREE.Vector3[]) => void) => {
    for (let k = 0; k + 1 < A.length; k++) { emit([A[k]!, B[k]!, A[k + 1]!]); emit([A[k + 1]!, B[k]!, B[k + 1]!]); }
  };

  // ---------- Dessus des cases ----------
  for (const cell of cells) {
    const h = field.cornerHeights(cell.x, cell.z);
    const surface = groundRenderSurface(ctx.surfaceAt(cell.x, cell.z)!);
    const slope = field.slopeAt(cell.x, cell.z);
    const corner = (i: number): THREE.Vector3 => new THREE.Vector3(cell.x + (i % 2), h[i]!, cell.z + (i < 2 ? 0 : 1));
    for (const tri of cellTriangles(slope)) topTri(surface, tri.map(corner), cell);
  }

  // ---------- Bords libres : sommets decales (calcules une fois, partages) ----------
  // Case absente (cx, cz) prise entre deux cases existantes opposees : vide d'une case de large.
  const narrowVoid = (cx: number, cz: number) => (has(cx - 1, cz) && has(cx + 1, cz)) || (has(cx, cz - 1) && has(cx, cz + 1));
  const vertexDisp = new Map<string, { x: number; z: number; dir: { x: number; z: number } | null; concave: boolean; narrow: boolean }>();
  const dispAt = (vx: number, vz: number) => {
    const key = cellKey(vx, vz);
    const cached = vertexDisp.get(key);
    if (cached) return cached;
    const nw = has(vx - 1, vz - 1), ne = has(vx, vz - 1), sw = has(vx - 1, vz), se = has(vx, vz);
    const count = +nw + +ne + +sw + +se;
    let dir: { x: number; z: number } | null = null;
    let d = 0;
    const u = hash(TAG_VERTEX, vx, vz);
    if (count === 1) {
      // Coin saillant : vers l'exterieur, en diagonale, a l'oppose de la seule case.
      const cx = nw || sw ? -1 : 1, cz = nw || ne ? -1 : 1;
      dir = { x: -cx * Math.SQRT1_2, z: -cz * Math.SQRT1_2 };
      d = pick(P.convexCorner, u);
    } else if (count === 3) {
      // Coin rentrant : vers la case absente (comble la marche).
      const ax = !nw || !sw ? -1 : 1, az = !nw || !ne ? -1 : 1;
      dir = { x: ax * Math.SQRT1_2, z: az * Math.SQRT1_2 };
      d = pick(P.concaveCorner, u) * (narrowVoid(vx + (ax - 1) / 2, vz + (az - 1) / 2) ? NARROW_VOID_SCALE : 1);
    } else if (count === 2 && !((nw && se) || (ne && sw))) {
      dir = nw && ne ? { x: 0, z: 1 } : sw && se ? { x: 0, z: -1 } : nw && sw ? { x: 1, z: 0 } : { x: -1, z: 0 };
      // Les deux cases absentes du cote du vide.
      const absent = [[vx - 1, vz - 1], [vx, vz - 1], [vx - 1, vz], [vx, vz]].filter(([cx, cz]) => !has(cx!, cz!));
      d = pick(P.straightVertex, u) * (absent.some(([cx, cz]) => narrowVoid(cx!, cz!)) ? NARROW_VOID_SCALE : 1);
    }
    const absentAround = [[vx - 1, vz - 1], [vx, vz - 1], [vx - 1, vz], [vx, vz]].filter(([cx, cz]) => !has(cx!, cz!));
    const r = { x: dir ? dir.x * d : 0, z: dir ? dir.z * d : 0, dir, concave: count === 3, narrow: absentAround.some(([cx, cz]) => narrowVoid(cx!, cz!)) };
    vertexDisp.set(key, r);
    return r;
  };

  // ---------- Aretes libres ----------
  interface FreeEdge { cell: TerrainCellDef; key: [number, number, number]; a: THREE.Vector3; b: THREE.Vector3; n: { x: number; z: number }; axis: 'x' | 'z'; surface: GroundSurfaceId; va: [number, number]; vb: [number, number]; narrow: boolean }
  const freeEdges: FreeEdge[] = [];
  for (const cell of cells) {
    const h = field.cornerHeights(cell.x, cell.z);
    const surface = groundRenderSurface(ctx.surfaceAt(cell.x, cell.z)!);
    for (const dir of SLOPE_DIRECTIONS) {
      const v = SLOPE_DIRECTION_VECTORS[dir];
      if (has(cell.x + v.dx, cell.z + v.dz)) continue;
      const [i0, i1] = EDGE_CORNERS[dir];
      const va: [number, number] = [cell.x + (i0 % 2), cell.z + (i0 < 2 ? 0 : 1)];
      const vb: [number, number] = [cell.x + (i1 % 2), cell.z + (i1 < 2 ? 0 : 1)];
      const key: [number, number, number] = dir === 'N' ? [TAG_EDGE_X, cell.x, cell.z] : dir === 'S' ? [TAG_EDGE_X, cell.x, cell.z + 1] : dir === 'W' ? [TAG_EDGE_Z, cell.x, cell.z] : [TAG_EDGE_Z, cell.x + 1, cell.z];
      freeEdges.push({ cell, key, a: new THREE.Vector3(va[0], h[i0]!, va[1]), b: new THREE.Vector3(vb[0], h[i1]!, vb[1]), n: { x: v.dx, z: v.dz }, axis: v.dx === 0 ? 'x' : 'z', surface, va, vb, narrow: narrowVoid(cell.x + v.dx, cell.z + v.dz) });
    }
  }
  // Hauteurs, au sommet (vx, vz), des aretes libres des (jusqu'a 4) cases qui l'entourent.
  const heightsMemo = new Map<string, number[]>();
  const heightsAt = (vx: number, vz: number) => {
    const key = cellKey(vx, vz);
    let hs = heightsMemo.get(key);
    if (hs) return hs;
    hs = [];
    for (const [cx, cz, i] of [[vx - 1, vz - 1, 3], [vx, vz - 1, 2], [vx - 1, vz, 1], [vx, vz, 0]] as const) {
      if (!has(cx, cz)) continue;
      for (const dir of SLOPE_DIRECTIONS) {
        const v = SLOPE_DIRECTION_VECTORS[dir];
        if (EDGE_CORNERS[dir].includes(i) && !has(cx + v.dx, cz + v.dz)) hs.push(field.cornerHeights(cx, cz)[i]!);
      }
    }
    heightsMemo.set(key, hs);
    return hs;
  };
  // Sommet « verrouille » : aretes libres a des hauteurs differentes (marche le long du bord) -> colonne verticale.
  const locked = (vx: number, vz: number) => { const hs = heightsAt(vx, vz); return hs.some((y) => Math.abs(y - hs[0]!) > 1e-6); };
  const bottom = -CELL_THICKNESS;
  const rows = P.cliffRows + 1;
  for (const e of freeEdges) {
    const S = P.edgeSegments;
    const [tag, kx, kz] = e.key;
    // Polyligne exterieure (ligne haute de la falaise) : O[0] = sommet a decale, O[S] = sommet b decale.
    const da = dispAt(...e.va), db = dispAt(...e.vb);
    // Points intermediaires repartis entre les positions REELLES (le long de l'arete) des deux sommets decales : un
    // coin rentrant recule son sommet le long de l'arete ; la polyligne reste monotone, aucune facette repliee.
    const ux = e.b.x - e.a.x, uz = e.b.z - e.a.z;
    const s0 = da.x * ux + da.z * uz, s1 = 1 + db.x * ux + db.z * uz;
    const ts: number[] = [0];
    for (let k = 1; k < S; k++) ts.push(s0 + (s1 - s0) * (k / S + (hash(tag, kx, kz, 10 + k) - 0.5) * P.alongJitter / S));
    ts.push(1);
    const O = ts.map((t, k) => {
      const y = lerp(e.a.y, e.b.y, Math.min(1, Math.max(0, t)));
      if (k === 0) return new THREE.Vector3(e.a.x + da.x, y, e.a.z + da.z);
      if (k === S) return new THREE.Vector3(e.b.x + db.x, y, e.b.z + db.z);
      const off = Math.min(pick(P.edgeOffset, hash(tag, kx, kz, 20 + k)) * (e.narrow ? NARROW_VOID_SCALE : 1), 0.85 * Math.min(t, 1 - t));
      return new THREE.Vector3(lerp(e.a.x, e.b.x, t) + e.n.x * off, y, lerp(e.a.z, e.b.z, t) + e.n.z * off);
    });
    // Bande de dessus, de l'arete logique a la polyligne.
    zipper(e.a, e.b, O, (p) => { topTri(e.surface, p, e.cell); lip(e.cell, p); });
    // Falaise facettee : colonnes (direction de decalage par sommet / normale de l'arete), lignes jusqu'au pied.
    // Colonne verticale a un sommet verrouille ou a un coin rentrant (son evasement reculerait sous la colonne voisine).
    const colDir = (k: number): { x: number; z: number } | null => {
      if (k === 0) return locked(...e.va) || da.concave ? null : (da.dir ?? e.n);
      if (k === S) return locked(...e.vb) || db.concave ? null : (db.dir ?? e.n);
      return e.n;
    };
    // Vide etroit : evasement et decalages des lignes reduits comme la bande (le trou reste ouvert jusqu'au pied).
    const colScale = (k: number) => ((k === 0 ? da.narrow : k === S ? db.narrow : e.narrow) ? NARROW_VOID_SCALE : 1);
    const colHash = (k: number, r: number) => (k === 0 ? hash(TAG_VERTEX, e.va[0], e.va[1], 30 + r) : k === S ? hash(TAG_VERTEX, e.vb[0], e.vb[1], 30 + r) : hash(tag, kx, kz, 30 + 10 * k + r));
    const lines: THREE.Vector3[][] = [O];
    for (let r = 1; r <= rows; r++) {
      lines.push(O.map((o, k) => {
        const f = r / rows;
        const d = colDir(k);
        const jitter = r < rows ? P.cliffRowJitter * colHash(k, r) : 0.6 * P.cliffRowJitter * colHash(k, r);
        const off = d ? (P.cliffFlare * f + jitter) * colScale(k) : 0;
        return new THREE.Vector3(o.x + (d?.x ?? 0) * off, lerp(o.y, bottom, f), o.z + (d?.z ?? 0) * off);
      }));
    }
    const outward = new THREE.Vector3(e.n.x, 0, e.n.z);
    const maxY = Math.max(e.a.y, e.b.y);
    const shade = (y: number) => FLANK_FOOT_SHADE + (1 - FLANK_FOOT_SHADE) * ((y - bottom) / (maxY - bottom || 1));
    const flankTri = (p: THREE.Vector3[]) => push(flanks, p, p.map((q) => [(e.axis === 'x' ? q.x : q.z) / flankTiles, q.y / flankTiles] as [number, number]), outward, shade);
    for (let r = 0; r < rows; r++) ladder(lines[r]!, lines[r + 1]!, flankTri);
    // Marche le long du bord (sommet verrouille) : face verticale entre le sommet logique et son decalage.
    for (const [vv, p0, o] of [[e.va, e.a, O[0]!], [e.vb, e.b, O[S]!]] as const) {
      if (!locked(vv[0], vv[1]) || p0.distanceToSquared(o) < 1e-12) continue;
      const others = heightsAt(vv[0], vv[1]).filter((y) => y < p0.y - 1e-6);
      if (others.length === 0) continue;
      const low = Math.max(...others);
      const away = new THREE.Vector3(-(o.z - p0.z), 0, o.x - p0.x);
      const far = p0 === e.a ? e.b : e.a;
      if (away.x * (far.x - p0.x) + away.z * (far.z - p0.z) > 0) away.negate();
      const capTri = (p: THREE.Vector3[]) => push(flanks, p, p.map((q) => [(e.axis === 'x' ? q.z : q.x) / flankTiles, q.y / flankTiles] as [number, number]), away, shade);
      const pl = new THREE.Vector3(p0.x, low, p0.z), ol = new THREE.Vector3(o.x, low, o.z);
      capTri([p0, o, pl]); capTri([o, ol, pl]);
    }
  }

  // ---------- Falaises interieures (deux cases existantes a hauteurs differentes) ----------
  const opposite: Record<string, readonly [number, number]> = { N: EDGE_CORNERS.S, S: EDGE_CORNERS.N, E: EDGE_CORNERS.W, W: EDGE_CORNERS.E };
  const edgeKey = (x: number, z: number, dir: string): [number, number, number] => (dir === 'N' ? [TAG_EDGE_X, x, z] : dir === 'S' ? [TAG_EDGE_X, x, z + 1] : dir === 'W' ? [TAG_EDGE_Z, x, z] : [TAG_EDGE_Z, x + 1, z]);
  // Ruptures eligibles a la jupe (faceted-plus) : arete horizontale des deux cotes, au moins un niveau d'ecart.
  // Le flanc d'une rampe (ecart variable le long de l'arete) garde la falaise subdivisee de \`faceted\`.
  // Arete physique (etiquette, x, z) : cases de part et d'autre (nord / ouest, puis sud / est).
  const Q = P.innerSkirt;
  const skirtAt = (tag: number, x: number, z: number) => {
    const [ax, az, dir]: [number, number, SlopeDirection] = tag === TAG_EDGE_X ? [x, z - 1, 'S'] : [x - 1, z, 'E'];
    const bx = ax + SLOPE_DIRECTION_VECTORS[dir].dx, bz = az + SLOPE_DIRECTION_VECTORS[dir].dz;
    if (!has(ax, az) || !has(bx, bz)) return false;
    const ha = field.cornerHeights(ax, az), hb = field.cornerHeights(bx, bz);
    const [i0, i1] = EDGE_CORNERS[dir];
    const [j0, j1] = EDGE_CORNERS[OPPOSITE_SLOPE_DIRECTION[dir]];
    return ha[i0] === ha[i1] && hb[j0] === hb[j1] && Math.abs(ha[i0]! - hb[j0]!) >= TERRAIN_ELEVATION_STEP - 1e-6;
  };
  // Sommet d'une rupture interieure : decale vers le bas (vers la case basse) seulement si les 4 cases existent,
  // sont plates, ne prennent que deux hauteurs a ce sommet, et si toutes les ruptures qui y arrivent ont une jupe.
  const innerDisp = new Map<string, { x: number; z: number; dir: { x: number; z: number } | null; concave: boolean }>();
  const higherThan = (x: number, z: number, than: number) => has(x, z) && Math.min(...field.cornerHeights(x, z)) > than + 1e-6;
  const lowNarrow = (x: number, z: number) => { const m = Math.max(...field.cornerHeights(x, z)); return (higherThan(x - 1, z, m) && higherThan(x + 1, z, m)) || (higherThan(x, z - 1, m) && higherThan(x, z + 1, m)); };
  const innerDispAt = (vx: number, vz: number) => {
    const key = cellKey(vx, vz);
    const cached = innerDisp.get(key);
    if (cached) return cached;
    let r: { x: number; z: number; dir: { x: number; z: number } | null; concave: boolean } = { x: 0, z: 0, dir: null, concave: false };
    const around = [[vx - 1, vz - 1, 3], [vx, vz - 1, 2], [vx - 1, vz, 1], [vx, vz, 0]] as const;
    if (Q && around.every(([cx, cz]) => has(cx, cz) && !field.slopeAt(cx, cz))) {
      const hv = around.map(([cx, cz, i]) => field.cornerHeights(cx, cz)[i]!);
      const hi = Math.max(...hv), lo = Math.min(...hv);
      const incident = [[TAG_EDGE_Z, vx, vz - 1, 0, 1], [TAG_EDGE_Z, vx, vz, 2, 3], [TAG_EDGE_X, vx - 1, vz, 0, 2], [TAG_EDGE_X, vx, vz, 1, 3]] as const;
      const allSkirted = incident.every(([tag, x, z, p, q]) => Math.abs(hv[p]! - hv[q]!) < 1e-6 || skirtAt(tag, x, z));
      if (hv.every((y) => Math.abs(y - hi) < 1e-6 || Math.abs(y - lo) < 1e-6) && hi - lo >= TERRAIN_ELEVATION_STEP - 1e-6 && allSkirted) {
        const high = hv.map((y) => Math.abs(y - hi) < 1e-6);
        const count = high.filter(Boolean).length;
        const [nw, ne, sw, se] = high;
        const u = hash(TAG_SKIRT_VERTEX, vx, vz);
        let dir: { x: number; z: number } | null = null;
        let d = 0;
        let lowCell: [number, number] | null = null;
        if (count === 1) {
          const cx = nw || sw ? -1 : 1, cz = nw || ne ? -1 : 1;
          dir = { x: -cx * Math.SQRT1_2, z: -cz * Math.SQRT1_2 };
          d = pick(Q.convexCorner, u);
        } else if (count === 3) {
          const ax = !nw || !sw ? -1 : 1, az = !nw || !ne ? -1 : 1;
          dir = { x: ax * Math.SQRT1_2, z: az * Math.SQRT1_2 };
          lowCell = [vx + (ax - 1) / 2, vz + (az - 1) / 2];
          d = pick(Q.concaveCorner, u);
        } else if (count === 2 && !((nw && se) || (ne && sw))) {
          dir = nw && ne ? { x: 0, z: 1 } : sw && se ? { x: 0, z: -1 } : nw && sw ? { x: 1, z: 0 } : { x: -1, z: 0 };
          d = pick(Q.straightVertex, u);
        }
        const narrow = lowCell ? lowNarrow(...lowCell) : around.some(([cx, cz], i) => !high[i] && lowNarrow(cx, cz));
        if (narrow) d *= NARROW_VOID_SCALE;
        r = { x: dir ? dir.x * d : 0, z: dir ? dir.z * d : 0, dir: d > 0 ? dir : null, concave: count === 3 };
      }
    }
    innerDisp.set(key, r);
    return r;
  };
  // Jupe d'une rupture (case haute `cell`, cote `dir`, de hauteur `hi` a `lo`) : bande du dessus haut debordant
  // au-dessus de la case basse, paroi facettee (ligne haute, intermediaire, pied enfonce dans le sol bas).
  const emitSkirt = (cell: TerrainCellDef, dir: SlopeDirection, ax: number, az: number, bx: number, bz: number, hi: number, lo: number, key: [number, number, number], Q: InnerSkirtParams) => {
    const v = SLOPE_DIRECTION_VECTORS[dir];
    const surface = groundRenderSurface(ctx.surfaceAt(cell.x, cell.z)!);
    const a = new THREE.Vector3(ax, hi, az), b = new THREE.Vector3(bx, hi, bz);
    const da = innerDispAt(ax, az), db = innerDispAt(bx, bz);
    const S = Q.segments;
    const [tag, kx, kz] = key;
    const s0 = da.x * (bx - ax) + da.z * (bz - az), s1 = 1 + db.x * (bx - ax) + db.z * (bz - az);
    const ts: number[] = [0];
    for (let k = 1; k < S; k++) ts.push(s0 + (s1 - s0) * (k / S + (hash(tag, kx, kz, 60 + k) - 0.5) * P.alongJitter / S));
    ts.push(1);
    const narrow = lowNarrow(cell.x + v.dx, cell.z + v.dz) ? NARROW_VOID_SCALE : 1;
    const O = ts.map((t, k) => {
      if (k === 0) return new THREE.Vector3(ax + da.x, hi, az + da.z);
      if (k === S) return new THREE.Vector3(bx + db.x, hi, bz + db.z);
      const off = Math.min(pick(Q.edgeOffset, hash(tag, kx, kz, 70 + k)) * narrow, 0.85 * Math.min(t, 1 - t));
      return new THREE.Vector3(lerp(ax, bx, t) + v.dx * off, hi, lerp(az, bz, t) + v.dz * off);
    });
    zipper(a, b, O, (p) => { topTri(surface, p, cell); lip(cell, p); });
    // Colonnes : verticales a un sommet non decale ou a un coin rentrant (aucune facette repliee).
    const colDir = (k: number) => (k === 0 ? (da.concave ? null : da.dir) : k === S ? (db.concave ? null : db.dir) : { x: v.dx, z: v.dz });
    const colHash = (k: number, r: number) => (k === 0 ? hash(TAG_SKIRT_VERTEX, ax, az, 80 + r) : k === S ? hash(TAG_SKIRT_VERTEX, bx, bz, 80 + r) : hash(tag, kx, kz, 90 + 10 * k + r));
    const shifted = (o: THREE.Vector3, k: number, off: number) => { const d = colDir(k); return { x: o.x + (d?.x ?? 0) * off, z: o.z + (d?.z ?? 0) * off }; };
    const mid = O.map((o, k) => { const p = shifted(o, k, Q.rowJitter * colHash(k, 1) * narrow); return new THREE.Vector3(p.x, (hi + lo) / 2, p.z); });
    const foot = O.map((o, k) => {
      const p = shifted(o, k, pick(Q.foot, colHash(k, 2)) * narrow);
      // Au-dessus de la case basse : son sol reel ; sur l'arete logique : la hauteur basse.
      const inside = (p.x - ax) * v.dx + (p.z - az) * v.dz > 1e-6;
      return new THREE.Vector3(p.x, (inside ? field.heightAt(p.x, p.z) : lo) - Q.embed, p.z);
    });
    const outward = new THREE.Vector3(v.dx, 0, v.dz);
    const shade = (y: number) => FLANK_FOOT_SHADE + (1 - FLANK_FOOT_SHADE) * Math.max(0, (y - lo) / (hi - lo));
    const flankTri = (p: THREE.Vector3[]) => push(flanks, p, p.map((q) => [(v.dx === 0 ? q.x : q.z) / flankTiles, q.y / flankTiles] as [number, number]), outward, shade);
    ladder(O, mid, flankTri);
    ladder(mid, foot, flankTri);
  };
  for (const cell of cells) {
    const h = field.cornerHeights(cell.x, cell.z);
    for (const dir of SLOPE_DIRECTIONS) {
      const v = SLOPE_DIRECTION_VECTORS[dir];
      if (!has(cell.x + v.dx, cell.z + v.dz)) continue;
      const [i0, i1] = EDGE_CORNERS[dir];
      const other = field.cornerHeights(cell.x + v.dx, cell.z + v.dz);
      const [j0, j1] = opposite[dir]!;
      const top0 = h[i0]!, top1 = h[i1]!;
      const bot0 = Math.min(top0, other[j0]!), bot1 = Math.min(top1, other[j1]!);
      if (bot0 >= top0 && bot1 >= top1) continue;
      const ax = cell.x + (i0 % 2), az = cell.z + (i0 < 2 ? 0 : 1);
      const bx = cell.x + (i1 % 2), bz = cell.z + (i1 < 2 ? 0 : 1);
      const key = edgeKey(cell.x, cell.z, dir);
      if (Q && skirtAt(...key)) {
        emitSkirt(cell, dir, ax, az, bx, bz, top0, other[j0]!, key, Q);
        continue;
      }
      const S = P.innerCliffSegments;
      const ts: number[] = [0];
      for (let k = 1; k < S; k++) ts.push(k / S + (hash(key[0]!, key[1]!, key[2]!, 40 + k) - 0.5) * P.alongJitter / S);
      ts.push(1);
      const R = P.cliffRows;
      const mid: THREE.Vector3[][] = [];
      for (let r = 1; r <= R; r++) {
        mid.push(ts.map((t, k) => {
          const top = lerp(top0, top1, t), bot = lerp(bot0, bot1, t);
          const depth = Math.min(1, Math.max(0, (top - bot) / TERRAIN_ELEVATION_STEP));
          const off = k === 0 || k === S ? 0 : P.innerCliffBulge * depth * hash(key[0]!, key[1]!, key[2]!, 50 + 10 * k + r);
          return new THREE.Vector3(lerp(ax, bx, t) + v.dx * off, lerp(top, bot, r / (R + 1)), lerp(az, bz, t) + v.dz * off);
        }));
      }
      const outward = new THREE.Vector3(v.dx, 0, v.dz);
      const minY = Math.min(bot0, bot1);
      const span = Math.max(top0, top1) - minY || 1;
      const shade = (y: number) => FLANK_FOOT_SHADE + (1 - FLANK_FOOT_SHADE) * ((y - minY) / span);
      const along = v.dx === 0 ? (q: THREE.Vector3) => q.x : (q: THREE.Vector3) => q.z;
      const flankTri = (p: THREE.Vector3[]) => push(flanks, p, p.map((q) => [along(q) / flankTiles, q.y / flankTiles] as [number, number]), outward, shade);
      zipper(new THREE.Vector3(ax, top0, az), new THREE.Vector3(bx, top1, bz), mid[0]!, flankTri);
      for (let r = 0; r + 1 < mid.length; r++) ladder(mid[r]!, mid[r + 1]!, flankTri);
      zipper(new THREE.Vector3(ax, bot0, az), new THREE.Vector3(bx, bot1, bz), mid[mid.length - 1]!, flankTri);
    }
  }

  for (const id of Object.keys(GROUND_SURFACES) as GroundSurfaceId[]) {
    const top = tops.get(id);
    if (top) group.add(layerMesh(top, groundMaterial(ctx.materials, `top:${id}`, id)));
  }
  if (flanks.positions.length > 0) group.add(layerMesh(flanks, groundMaterial(ctx.materials, 'flank', flankSurface)));
  if (castShadow) for (const m of group.children) m.castShadow = true;
  return { group, lips };
}
