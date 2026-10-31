import * as THREE from 'three';
import { cellKey, type TerrainCellDef } from '../config/mapDef';
import { cellTriangles, surfaceHeightInCell, TERRAIN_ELEVATION_STEP, type SlopeDirection } from '../config/terrainElevation';
import type { GroundSurfaceId } from './groundSurfaces';
import { applyGroundLayer, groundLookTint, groundMacro, groundRenderSurface, groundStates, groundSurfaceDef } from './groundLook';
import type { ReliefShading } from './reliefLook';
import { newBuffers, RELIEF_TINT_PER_LEVEL, SLOPE_NORMAL_Y, SLOPE_SHADE, type LayerBuffers, type TerrainContext } from './terrainCells';
import type { TerrainLips } from './terrainStylized';

/**
 * TRANSITIONS entre surfaces du dessus (`?surfaceBlend=`), purement visuelles :
 * jamais lues par le jeu, le relief, le pointage ni la carte (surfaceCells
 * inchangees). `irregular` (defaut, direction retenue le 2026-10-29) : bord
 * net, polygonal, de largeur variable ; `hard` (temoin) : frontiere case par
 * case, aucun mesh ajoute.
 *
 * Methode (masque alpha sur grille fine) : la surface PRIORITAIRE d'une
 * frontiere est redessinee par-dessus sa voisine, dans la bande qui borde
 * ses cases, sur une sous-grille de `subdivisions` x `subdivisions` de chaque
 * case touchee. La sous-grille suit la triangulation de la case (memes
 * diagonales) : chaque sous-triangle est exactement sur le sol logique,
 * plat, pente ou coin. L'alpha est porte par les sommets (distance aux
 * cases de la surface prioritaire, bruit deterministe), coupe net a 0,5
 * (alphaTest, aucune transparence) ; la texture et l'ombrage sont ceux de la
 * surface (UV monde : continuite avec ses cases). Un coin RENTRANT (deux
 * cotes de la case bordes par la meme surface prioritaire) est arrondi :
 * un chemin en escalier ou un virage ne garde pas sa marche. Un mesh et un
 * materiau par surface qui deborde, jamais par case ; decalage de profondeur
 * (polygonOffset) croissant avec la priorite.
 *
 * Bord de carte et trous (rendu facette) : la bande du dessus qui deborde
 * d'une case (ses LEVRES, render/terrainStylized.ts) recoit la transition
 * de son bord, prolongee tout droit : une surface peinte jusqu'au bord
 * continue sur la levre, la falaise dessous garde le materiau de flanc.
 *
 * Le debord ne traverse qu'un raccord continu (arete ou coin a la meme
 * hauteur) : jamais par-dessus une falaise ; il ne sort jamais du sol
 * dessine (rien dans le vide ni au-dessus d'un trou). Tout se deduit des
 * surfaces de la carte et de positions monde : meme carte, meme rendu, quel
 * que soit l'ordre de la peinture ou le decoupage en morceaux.
 *
 * `lisiere` (2026-10-31, en comparaison) : frontiere ORGANIQUE dans les DEUX
 * sens, toujours nette (meme alphaTest, aucune transparence). Chaque surface
 * du voisinage 3 × 3 recoit un score au point : sa part des cases apres un
 * flou gaussien (une case pleine convoluee : coins saillants et rentrants
 * arrondis, escaliers lisses), plus son debord (`spread`, un chemin 1 × 1
 * garde environ 1,2 case) et un bruit propre (`wobble`). La surface au plus
 * haut score l'emporte : elle est redessinee par-dessus sa voisine, que
 * celle-ci soit prioritaire ou non. Une LISIERE (teinte de bord, selon la
 * surface et sa voisine : herbe plus seche le long d'un chemin, plus grasse
 * au bord de l'eau, roussie pres de la lave ; terre tassee, bordure de
 * paves, sable mouille, ecume, croute refroidie) est portee par la couleur
 * des sommets, du cote de la surface a qui elle appartient (sur sa propre
 * case, un debord d'elle-meme limite a la bande). `melange` : `lisiere`, plus
 * un bruit fin pres de la frontiere (ilots epars des deux surfaces, zone de
 * melange), sur une sous-grille plus fine.
 */
export type SurfaceBlendMode = 'hard' | 'irregular' | 'lisiere' | 'melange';
export const SURFACE_BLEND_MODES: readonly SurfaceBlendMode[] = ['hard', 'irregular', 'lisiere', 'melange'];
let blendMode: SurfaceBlendMode = 'irregular';

/** Mode applique aux plateaux construits ensuite (main.ts : `?surfaceBlend=`). */
export function setSurfaceBlendMode(mode: SurfaceBlendMode): void {
  blendMode = mode;
}

export function surfaceBlendMode(): SurfaceBlendMode {
  return blendMode;
}

/** PRIORITE VISUELLE (rendu seulement, aucune regle de jeu) : a une
 *  frontiere, la surface de rang le plus eleve deborde sur l'autre. Terre
 *  au-dessus des herbes, herbes travaillees au-dessus de l'herbe par
 *  defaut ; liquides sous tout (la berge deborde sur l'eau), matieres
 *  construites ou rocheuses au-dessus des terres. A rang egal, l'ordre de
 *  cette liste departage. `lisiere` et `melange` : ordre de dessin seulement
 *  (et graine du bruit de chaque surface). */
const BLEND_PRIORITY: readonly GroundSurfaceId[] = [
  'eau',
  'lave',
  'grass',
  'herbe-classique',
  'herbe-prairie',
  'herbe-dense',
  'herbe-stylisee',
  'herbe-pixel-net',
  'herbe-pixel-touffes',
  'mixte-taches',
  'mixte-usee',
  'sable',
  'dirt',
  'terre-battue',
  'terre-strates',
  'sol-volcanique',
  'roche-sol',
  'paves-gris',
];
const rankOf = (id: GroundSurfaceId) => BLEND_PRIORITY.indexOf(id);

/** Reglages (en cases), lus a chaque construction. Un chemin 1x1 paraît
 *  large de 1 + 2 x (width +- variation) : 1,08 a 1,32 case. */
export const SURFACE_BLEND_PARAMS = {
  /** Sous-grille par case (et par levre). */
  subdivisions: 6,
  /** Debord moyen de la surface prioritaire, et sa variation (bruit). */
  width: 0.1,
  variation: 0.06,
  /** Pente de l'alpha autour du bord (net apres alphaTest). */
  softness: 0.35,
  /** Maille du bruit de largeur. */
  noiseCell: 0.5,
  /** Rayon de l'arrondi d'un coin rentrant. */
  cornerRadius: 0.45,
};
const SEED = 0x51f15e;

function hash2(i: number, j: number): number {
  let h = Math.imul(i, 0x27d4eb2d) ^ Math.imul(j, 0x165667b1) ^ SEED;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Bruit de valeur deterministe dans [0, 1) au point monde (x, z). */
function noise(x: number, z: number): number {
  const fx = x / SURFACE_BLEND_PARAMS.noiseCell, fz = z / SURFACE_BLEND_PARAMS.noiseCell;
  const i = Math.floor(fx), j = Math.floor(fz);
  const s = (t: number) => t * t * (3 - 2 * t);
  const tx = s(fx - i), tz = s(fz - j);
  const a = hash2(i, j) + (hash2(i + 1, j) - hash2(i, j)) * tx;
  const b = hash2(i, j + 1) + (hash2(i + 1, j + 1) - hash2(i, j + 1)) * tx;
  return a + (b - a) * tz;
}

type Rgb = readonly [number, number, number];

/** `lisiere`, `melange` : reglages communs (en cases). */
export const SURFACE_LISIERE_PARAMS = {
  /** Sous-grille par case (et par levre) ; plus fine en `melange` (ilots). */
  subdivisions: 6,
  melangeSubdivisions: 8,
  /** Ecart-type du flou des cases (arrondi des coins, lissage des escaliers). */
  sigma: 0.3,
  /** `melange` : bruit fin (amplitude, maille), seulement pres de la frontiere
   *  (part de la surface a moins de `near` de 1/2). */
  speckle: 0.5,
  speckleCell: 0.3,
  near: 0.3,
  /** Pont d'un coin : deux cases d'une surface qui ne se touchent que par un
   *  coin (chemin en diagonale) restent reliees (score ajoute au coin, rayon
   *  en cases). */
  bridge: 0.6,
  bridgeRadius: 0.4,
};

/** Familles de bord (`lisiere`, `melange`) : style d'une surface et, pour sa
 *  lisiere, de sa voisine. */
type EdgeFamily = 'herbe' | 'terre' | 'paves' | 'sable' | 'roche' | 'volcan' | 'eau' | 'lave';

interface EdgeStyle {
  /** Debord (part du champ flou) : un chemin 1 × 1 a debord 0,26 face a
   *  l'herbe garde environ 1,2 case, une mare a debord negatif retrecit. */
  spread: number;
  /** Bruit propre de la frontiere : amplitude (part du champ) et maille (cases). */
  wobble: number;
  cell: number;
  /** Lisiere du cote de cette surface : teinte (multiplicateur lineaire) et
   *  largeur (en marge de score, environ 2,7 par case) ; `rimBy` : teinte
   *  selon la famille de la voisine. */
  rim: Rgb;
  rimWidth: number;
  rimBy?: Partial<Record<EdgeFamily, Rgb>>;
}

export const SURFACE_EDGE_STYLES: Readonly<Record<EdgeFamily, EdgeStyle>> = {
  herbe: {
    spread: 0,
    wobble: 0.32,
    cell: 0.9,
    rim: [1, 1, 1],
    rimWidth: 0.3,
    rimBy: { terre: [1.1, 1.05, 0.82], sable: [1.12, 1.08, 0.84], paves: [0.9, 0.93, 0.84], roche: [0.9, 0.93, 0.84], eau: [0.8, 0.9, 0.74], lave: [0.8, 0.66, 0.5], volcan: [0.86, 0.78, 0.64] },
  },
  terre: { spread: 0.26, wobble: 0.3, cell: 0.8, rim: [0.86, 0.82, 0.8], rimWidth: 0.22 },
  paves: { spread: 0.2, wobble: 0.18, cell: 1.2, rim: [0.8, 0.79, 0.78], rimWidth: 0.2 },
  sable: { spread: 0.2, wobble: 0.28, cell: 1.4, rim: [0.95, 0.93, 0.9], rimWidth: 0.15, rimBy: { eau: [0.8, 0.78, 0.76] } },
  roche: { spread: 0.22, wobble: 0.4, cell: 0.6, rim: [0.84, 0.84, 0.86], rimWidth: 0.16 },
  volcan: { spread: 0.2, wobble: 0.3, cell: 0.8, rim: [0.9, 0.88, 0.88], rimWidth: 0.15, rimBy: { lave: [1.25, 0.9, 0.75] } },
  eau: { spread: -0.1, wobble: 0.22, cell: 1.6, rim: [1.2, 1.15, 1.05], rimWidth: 0.5 },
  lave: { spread: -0.1, wobble: 0.28, cell: 1, rim: [0.55, 0.5, 0.5], rimWidth: 0.35 },
};

function edgeFamily(id: GroundSurfaceId): EdgeFamily {
  if (id === 'paves-gris') return 'paves';
  if (id === 'sable') return 'sable';
  if (id === 'roche-sol') return 'roche';
  if (id === 'sol-volcanique') return 'volcan';
  if (id === 'eau' || id === 'lave') return id;
  if (id === 'dirt' || id.startsWith('terre-')) return 'terre';
  return 'herbe';
}

/** Fonction de repartition de la loi normale (Abramowitz et Stegun 7.1.26). */
function normalCdf(t: number): number {
  const x = Math.abs(t) / Math.SQRT2;
  const k = 1 / (1 + 0.3275911 * x);
  const erf = 1 - ((((1.061405429 * k - 1.453152027) * k + 1.421413741) * k - 0.284496736) * k + 0.254829592) * k * Math.exp(-x * x);
  return t >= 0 ? 0.5 * (1 + erf) : 0.5 * (1 - erf);
}

function hash3(i: number, j: number, salt: number): number {
  return hash2(i ^ Math.imul(salt, 0x9e3779b1), j + Math.imul(salt, 0x7f4a7c15));
}

/** Bruit de valeur deterministe dans [-1, 1] au point monde (x, z), maille `cell`, graine `salt`. */
function edgeNoise(x: number, z: number, cell: number, salt: number): number {
  const fx = x / cell + salt * 0.137, fz = z / cell + salt * 0.291;
  const i = Math.floor(fx), j = Math.floor(fz);
  const s = (t: number) => t * t * (3 - 2 * t);
  const tx = s(fx - i), tz = s(fz - j);
  const a = hash3(i, j, salt) + (hash3(i + 1, j, salt) - hash3(i, j, salt)) * tx;
  const b = hash3(i, j + 1, salt) + (hash3(i + 1, j + 1, salt) - hash3(i, j + 1, salt)) * tx;
  return (a + (b - a) * tz) * 2 - 1;
}

const NEIGHBORS: readonly { dx: number; dz: number; dir?: SlopeDirection; corner?: [number, number] }[] = [
  { dx: 0, dz: -1, dir: 'N' }, { dx: 1, dz: 0, dir: 'E' }, { dx: 0, dz: 1, dir: 'S' }, { dx: -1, dz: 0, dir: 'W' },
  // Diagonales : coin partage (indice du coin dans la case, puis dans la voisine).
  { dx: -1, dz: -1, corner: [0, 3] }, { dx: 1, dz: -1, corner: [1, 2] }, { dx: -1, dz: 1, corner: [2, 1] }, { dx: 1, dz: 1, corner: [3, 0] },
];
/** Coins rentrants : deux cotes voisins de la case, et leur coin commun (decalage depuis le coin nord-ouest). */
const INNER_CORNERS: readonly { a: SlopeDirection; b: SlopeDirection; x: number; z: number }[] = [
  { a: 'N', b: 'E', x: 1, z: 0 }, { a: 'E', b: 'S', x: 1, z: 1 }, { a: 'S', b: 'W', x: 0, z: 1 }, { a: 'W', b: 'N', x: 0, z: 0 },
];

/** Ajoute a `group` les meshes de transition des cases `cells` (un par
 *  surface qui deborde) ; `ctx` donne les voisines, meme hors de `cells`.
 *  `lips` : levres du rendu facette ; `shading` : ombrage du relief des dessus
 *  (`?relief=`, render/reliefLook.ts), applique a l'identique. Sans effet en
 *  `hard`. */
export function appendSurfaceBlend(group: THREE.Group, cells: readonly TerrainCellDef[], ctx: TerrainContext, lips?: TerrainLips, shading?: ReliefShading | null): void {
  if (blendMode === 'hard') return;
  const P = SURFACE_BLEND_PARAMS;
  const N = P.subdivisions;
  const R = P.cornerRadius;
  const { field } = ctx;
  const buffers = new Map<GroundSurfaceId, LayerBuffers>();
  const ab = new THREE.Vector3(), ac = new THREE.Vector3(), nrm = new THREE.Vector3(), sm = new THREE.Vector3(), vn = new THREE.Vector3();
  // Etats `living` (render/groundLook.ts), lus dans la case en cours (cellX, cellZ).
  const states = groundStates(ctx);
  let cellX = 0, cellZ = 0;
  // Triangle (indices dans des positions xyz a plat et leurs alphas) : emis s'il a un sommet visible, normale vers le haut.
  // Cycle de texture et variation `?groundLook=` (point monde) : ceux de la surface qui deborde. `mul` (`lisiere`,
  // `melange`) : teinte de lisiere par sommet (3 valeurs par indice).
  const tri = (b: LayerBuffers, surface: GroundSurfaceId, p: readonly number[], as: readonly number[], i0: number, i1: number, i2: number, mul?: readonly number[]) => {
    if (as[i0]! < 0.5 && as[i1]! < 0.5 && as[i2]! < 0.5) return;
    const tiles = groundSurfaceDef(surface).tiles;
    const a = 3 * i0, bb = 3 * i1, cc = 3 * i2;
    ab.set(p[bb]! - p[a]!, p[bb + 1]! - p[a + 1]!, p[bb + 2]! - p[a + 2]!);
    ac.set(p[cc]! - p[a]!, p[cc + 1]! - p[a + 1]!, p[cc + 2]! - p[a + 2]!);
    nrm.crossVectors(ab, ac);
    if (nrm.lengthSq() < 1e-12) return;
    nrm.normalize();
    const flip = nrm.y < 0;
    if (flip) nrm.negate();
    const tilt = Math.min(1, Math.max(0, (1 - nrm.y) / (1 - SLOPE_NORMAL_Y)));
    for (const k of flip ? [i0, i2, i1] : [i0, i1, i2]) {
      const x = p[3 * k]!, y = p[3 * k + 1]!, z = p[3 * k + 2]!;
      let shade = (1 + RELIEF_TINT_PER_LEVEL * (Math.max(0, y) / TERRAIN_ELEVATION_STEP)) * (1 - SLOPE_SHADE * tilt);
      b.positions.push(x, y, z);
      if (shading) {
        // Meme ombrage que le dessus au meme point (render/terrainStylized.ts, reliefLit).
        const r = shading.at(cellX, cellZ, x, z, sm);
        if (shading.smooth > 0) vn.copy(nrm).lerp(sm, shading.smooth).normalize();
        else vn.copy(nrm);
        shade = (1 + RELIEF_TINT_PER_LEVEL * (Math.max(0, y) / TERRAIN_ELEVATION_STEP)) * (shading.smooth > 0 ? r.veil : 1 - SLOPE_SHADE * tilt) * r.factor;
        b.normals.push(vn.x, vn.y, vn.z);
      } else b.normals.push(nrm.x, nrm.y, nrm.z);
      b.uvs.push(x / tiles, -z / tiles);
      const m = groundMacro(surface, x, z);
      if (mul) b.colors.push(shade * m[0] * mul[3 * k]!, shade * m[1] * mul[3 * k + 1]!, shade * m[2] * mul[3 * k + 2]!, as[k]!);
      else b.colors.push(shade * m[0], shade * m[1], shade * m[2], as[k]!);
      const st = states?.at(surface, x, z, cellX, cellZ);
      if (st) b.states.push(st[0], st[1], st[2]);
    }
  };
  // Surfaces DESSINEES (`living` : une herbe, une terre ; aucune transition entre deux etats d'une meme matiere).
  const drawnAt = (x: number, z: number) => {
    const s = ctx.surfaceAt(x, z);
    return s && groundRenderSurface(s);
  };
  if (blendMode === 'lisiere' || blendMode === 'melange') appendLisiere(cells, ctx, lips, drawnAt, buffers, tri, (x, z) => { cellX = x; cellZ = z; });
  else for (const c of cells) {
    cellX = c.x;
    cellZ = c.z;
    const own = drawnAt(c.x, c.z)!;
    const h = field.cornerHeights(c.x, c.z);
    // Surfaces prioritaires voisines par un raccord continu : cases sources et cotes bordes.
    const sources = new Map<GroundSurfaceId, { squares: [number, number][]; sides: SlopeDirection[] }>();
    for (const nb of NEIGHBORS) {
      const nx = c.x + nb.dx, nz = c.z + nb.dz;
      const s = drawnAt(nx, nz);
      if (!s || rankOf(s) <= rankOf(own)) continue;
      const continuous = nb.dir ? field.edgeMatches(c.x, c.z, nb.dir) : Math.abs(h[nb.corner![0]]! - field.cornerHeights(nx, nz)[nb.corner![1]]!) < 1e-6;
      if (!continuous) continue;
      let src = sources.get(s);
      if (!src) sources.set(s, (src = { squares: [], sides: [] }));
      src.squares.push([nx, nz]);
      if (nb.dir) src.sides.push(nb.dir);
    }
    if (sources.size === 0) continue;
    const slope = field.slopeAt(c.x, c.z);
    const nwSe = cellTriangles(slope)[0]!.includes(3);
    // Sommets de la sous-grille : position exacte sur le sol de la case.
    const grid: number[] = [];
    for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) grid.push(c.x + i / N, surfaceHeightInCell(h, slope, i / N, j / N), c.z + j / N);
    const cellLips = lips?.get(cellKey(c.x, c.z)) ?? [];
    // Surfaces prioritaires dans l'ordre croissant (la plus prioritaire dessinee en dernier).
    for (const [surface, { squares, sides }] of [...sources].sort((a, b) => rankOf(a[0]) - rankOf(b[0]))) {
      const corners = INNER_CORNERS.filter((k) => sides.includes(k.a) && sides.includes(k.b)).map((k) => [c.x + k.x, c.z + k.z] as const);
      // Alpha au point (x, z), ramene dans la case : une levre prolonge son bord tout droit.
      const alphaAt = (x: number, z: number) => {
        const qx = Math.min(c.x + 1, Math.max(c.x, x)), qz = Math.min(c.z + 1, Math.max(c.z, z));
        let d = Infinity;
        for (const [sx, sz] of squares) d = Math.min(d, Math.hypot(Math.max(sx - qx, 0, qx - (sx + 1)), Math.max(sz - qz, 0, qz - (sz + 1))));
        for (const [fx, fz] of corners) {
          const u = Math.abs(qx - fx), v = Math.abs(qz - fz);
          if (u < R && v < R) d = Math.min(d, Math.max(0, R - Math.hypot(R - u, R - v)));
        }
        const w = P.width + P.variation * (noise(qx, qz) - 0.5) * 2;
        return Math.min(1, Math.max(0, 0.5 + (w - d) / P.softness));
      };
      let b = buffers.get(surface);
      if (!b) buffers.set(surface, (b = newBuffers()));
      // Dessus de la case : meme diagonale que la case, aucun sous-triangle ne la traverse (sol exact).
      const alpha: number[] = [];
      for (let k = 0; k < grid.length; k += 3) alpha.push(alphaAt(grid[k]!, grid[k + 2]!));
      const v = (i: number, j: number) => j * (N + 1) + i;
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
        if (nwSe) { tri(b, surface, grid, alpha, v(i, j), v(i, j + 1), v(i + 1, j + 1)); tri(b, surface, grid, alpha, v(i, j), v(i + 1, j + 1), v(i + 1, j)); }
        else { tri(b, surface, grid, alpha, v(i, j), v(i, j + 1), v(i + 1, j)); tri(b, surface, grid, alpha, v(i + 1, j), v(i, j + 1), v(i + 1, j + 1)); }
      }
      // Levres : chaque triangle subdivise (barycentrique), dans son plan.
      for (const [p0, p1, p2] of cellLips) {
        const pts: number[] = [], al: number[] = [];
        const idx = (i: number, j: number) => j * (N + 1) - (j * (j - 1)) / 2 + i;
        for (let j = 0; j <= N; j++) for (let i = 0; i + j <= N; i++) {
          const u = i / N, w = j / N;
          const x = p0!.x + (p1!.x - p0!.x) * u + (p2!.x - p0!.x) * w;
          const y = p0!.y + (p1!.y - p0!.y) * u + (p2!.y - p0!.y) * w;
          const z = p0!.z + (p1!.z - p0!.z) * u + (p2!.z - p0!.z) * w;
          pts.push(x, y, z);
          al.push(alphaAt(x, z));
        }
        if (al.every((a) => a < 0.5)) continue;
        for (let j = 0; j < N; j++) for (let i = 0; i + j < N; i++) {
          tri(b, surface, pts, al, idx(i, j), idx(i + 1, j), idx(i, j + 1));
          if (i + j < N - 1) tri(b, surface, pts, al, idx(i + 1, j), idx(i + 1, j + 1), idx(i, j + 1));
        }
      }
    }
  }
  for (const id of BLEND_PRIORITY) {
    const b = buffers.get(id);
    if (!b || b.positions.length === 0) continue;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(b.positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(b.normals, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(b.uvs, 2));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(b.colors, 4));
    if (b.states.length > 0) geometry.setAttribute('groundState', new THREE.Float32BufferAttribute(b.states, 3));
    const rank = rankOf(id);
    const material = ctx.materials.get(`blend:${id}`, () => {
      // Meme matiere et meme teinte (`?groundLook=`, render/groundLook.ts ;
      // preset `?look=`, render/look.ts) que le dessus de la surface.
      const def = groundSurfaceDef(id);
      const tint = groundLookTint(id);
      const m = new THREE.MeshLambertMaterial({
        map: def.texture(),
        vertexColors: true,
        alphaTest: 0.5,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -4 - 4 * rank,
      });
      m.color.setRGB(def.color[0] * tint[0], def.color[1] * tint[1], def.color[2] * tint[2], THREE.LinearSRGBColorSpace);
      applyGroundLayer(m, id);
      return m;
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.receiveShadow = true;
    mesh.renderOrder = 1 + rank;
    mesh.userData['surfaceBlend'] = id;
    group.add(mesh);
  }
}

type BlendTri = (b: LayerBuffers, surface: GroundSurfaceId, p: readonly number[], as: readonly number[], i0: number, i1: number, i2: number, mul?: readonly number[]) => void;

/** `lisiere`, `melange` (voir le commentaire du module) : pour chaque case dont
 *  le voisinage continu porte au moins deux surfaces, chaque surface y est
 *  redessinee la ou elle l'emporte (alpha = 0,5 + marge de score) ; la
 *  surface de la case ne l'est que dans sa bande de lisiere. */
function appendLisiere(cells: readonly TerrainCellDef[], ctx: TerrainContext, lips: TerrainLips | undefined, drawnAt: (x: number, z: number) => GroundSurfaceId | undefined, buffers: Map<GroundSurfaceId, LayerBuffers>, tri: BlendTri, setCell: (x: number, z: number) => void): void {
  const LP = SURFACE_LISIERE_PARAMS;
  const melange = blendMode === 'melange';
  const N = melange ? LP.melangeSubdivisions : LP.subdivisions;
  const { field } = ctx;
  const smooth01 = (t: number) => {
    const u = Math.min(1, Math.max(0, t));
    return u * u * (3 - 2 * u);
  };
  for (const c of cells) {
    setCell(c.x, c.z);
    const base = drawnAt(c.x, c.z)!;
    const h = field.cornerHeights(c.x, c.z);
    // Voisinage 3 × 3 relie par un raccord continu, la case comprise : une case derriere une falaise ne compte pas.
    const near: { x: number; z: number; s: GroundSurfaceId }[] = [{ x: c.x, z: c.z, s: base }];
    for (const nb of NEIGHBORS) {
      const nx = c.x + nb.dx, nz = c.z + nb.dz;
      const s = drawnAt(nx, nz);
      if (!s) continue;
      const continuous = nb.dir ? field.edgeMatches(c.x, c.z, nb.dir) : Math.abs(h[nb.corner![0]]! - field.cornerHeights(nx, nz)[nb.corner![1]]!) < 1e-6;
      if (continuous) near.push({ x: nx, z: nz, s });
    }
    const kinds = [...new Set(near.map((n) => n.s))].sort((a, b) => rankOf(a) - rankOf(b));
    if (kinds.length < 2) continue;
    const families = kinds.map(edgeFamily);
    const styles = families.map((f) => SURFACE_EDGE_STYLES[f]);
    const kindOf = near.map((n) => kinds.indexOf(n.s));
    const parts = new Array<number>(kinds.length);
    const scores = new Array<number>(kinds.length);
    // Ponts aux coins de la case : les quatre cases autour du coin (toutes reliees), deux en diagonale de la meme
    // surface et les deux autres d'une autre. Memes ponts vus depuis chacune des quatre cases.
    const nearAt = new Map(near.map((n, i) => [cellKey(n.x, n.z), i]));
    const bridges: { x: number; z: number; kind: number }[] = [];
    for (const [ox, oz] of [[0, 0], [1, 0], [0, 1], [1, 1]] as const) {
      const vx = c.x + ox, vz = c.z + oz;
      const around = [[vx - 1, vz - 1], [vx, vz - 1], [vx - 1, vz], [vx, vz]].map(([x, z]) => nearAt.get(cellKey(x!, z!)));
      if (around.some((i) => i === undefined)) continue;
      const [a, b, cc, d] = around.map((i) => kindOf[i!]!) as [number, number, number, number];
      const first = a === d && b !== a && cc !== a ? a : -1;
      const second = b === cc && a !== b && d !== b ? b : -1;
      // Damier (les deux diagonales) : le pont revient a la surface prioritaire (le chemin plutot que l'herbe).
      const kind = Math.max(first, second);
      if (kind >= 0) bridges.push({ x: vx, z: vz, kind });
    }
    // Marge de chaque surface (son score moins le meilleur des autres) et la plus forte des autres, au point
    // ramene dans la case (une levre prolonge son bord tout droit).
    // Poids d'une case au point : case pleine floutee (gaussienne d'ecart-type sigma), separable ; repartition aux
    // quatre limites de cases du voisinage, par axe.
    const fx = [0, 0, 0, 0], fz = [0, 0, 0, 0];
    const sample = (x: number, z: number, margins: number[][], rivals: number[][]) => {
      const qx = Math.min(c.x + 1, Math.max(c.x, x)), qz = Math.min(c.z + 1, Math.max(c.z, z));
      for (let k = 0; k < 4; k++) {
        fx[k] = normalCdf((qx - (c.x - 1 + k)) / LP.sigma);
        fz[k] = normalCdf((qz - (c.z - 1 + k)) / LP.sigma);
      }
      parts.fill(0);
      let total = 0;
      near.forEach((n, i) => {
        const ix = n.x - c.x + 1, iz = n.z - c.z + 1;
        const w = (fx[ix]! - fx[ix + 1]!) * (fz[iz]! - fz[iz + 1]!);
        parts[kindOf[i]!] = parts[kindOf[i]!]! + w;
        total += w;
      });
      // Ponts : poids au point (le melange s'efface pres d'un pont, qui reste continu).
      let bridged = 0;
      for (const br of bridges) bridged = Math.max(bridged, Math.exp(-((qx - br.x) ** 2 + (qz - br.z) ** 2) / (2 * LP.bridgeRadius ** 2)));
      kinds.forEach((k, i) => {
        const g = parts[i]! / total;
        let s = g + styles[i]!.spread + styles[i]!.wobble * edgeNoise(qx, qz, styles[i]!.cell, rankOf(k) + 1);
        if (melange) s += LP.speckle * Math.max(0, 1 - Math.abs(g - 0.5) / LP.near) * Math.max(0, 1 - 1.5 * bridged) * edgeNoise(qx, qz, LP.speckleCell, rankOf(k) + 41);
        scores[i] = s;
      });
      for (const br of bridges) {
        const d2 = (qx - br.x) ** 2 + (qz - br.z) ** 2;
        scores[br.kind] = scores[br.kind]! + LP.bridge * Math.exp(-d2 / (2 * LP.bridgeRadius ** 2));
      }
      kinds.forEach((_, i) => {
        let best = -Infinity, who = 0;
        kinds.forEach((_, j) => {
          if (j !== i && scores[j]! > best) {
            best = scores[j]!;
            who = j;
          }
        });
        margins[i]!.push(scores[i]! - best);
        rivals[i]!.push(who);
      });
    };
    // Zones a dessiner : la sous-grille du dessus (meme diagonale que la case), puis celles des levres (barycentriques).
    const slope = field.slopeAt(c.x, c.z);
    const nwSe = cellTriangles(slope)[0]!.includes(3);
    const areas: { pts: number[]; tris: [number, number, number][] }[] = [];
    const grid: number[] = [];
    for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) grid.push(c.x + i / N, surfaceHeightInCell(h, slope, i / N, j / N), c.z + j / N);
    const gridTris: [number, number, number][] = [];
    const v = (i: number, j: number) => j * (N + 1) + i;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      if (nwSe) gridTris.push([v(i, j), v(i, j + 1), v(i + 1, j + 1)], [v(i, j), v(i + 1, j + 1), v(i + 1, j)]);
      else gridTris.push([v(i, j), v(i, j + 1), v(i + 1, j)], [v(i + 1, j), v(i, j + 1), v(i + 1, j + 1)]);
    }
    areas.push({ pts: grid, tris: gridTris });
    for (const [p0, p1, p2] of lips?.get(cellKey(c.x, c.z)) ?? []) {
      const pts: number[] = [];
      const tris: [number, number, number][] = [];
      const idx = (i: number, j: number) => j * (N + 1) - (j * (j - 1)) / 2 + i;
      for (let j = 0; j <= N; j++) for (let i = 0; i + j <= N; i++) {
        const u = i / N, w = j / N;
        pts.push(p0!.x + (p1!.x - p0!.x) * u + (p2!.x - p0!.x) * w, p0!.y + (p1!.y - p0!.y) * u + (p2!.y - p0!.y) * w, p0!.z + (p1!.z - p0!.z) * u + (p2!.z - p0!.z) * w);
      }
      for (let j = 0; j < N; j++) for (let i = 0; i + j < N; i++) {
        tris.push([idx(i, j), idx(i + 1, j), idx(i, j + 1)]);
        if (i + j < N - 1) tris.push([idx(i + 1, j), idx(i + 1, j + 1), idx(i, j + 1)]);
      }
      areas.push({ pts, tris });
    }
    for (const area of areas) {
      const margins = kinds.map(() => [] as number[]);
      const rivals = kinds.map(() => [] as number[]);
      for (let k = 0; k < area.pts.length; k += 3) sample(area.pts[k]!, area.pts[k + 2]!, margins, rivals);
      kinds.forEach((surface, si) => {
        const st = styles[si]!;
        const m = margins[si]!;
        const own = surface === base;
        // Lisiere : teinte par sommet selon la plus forte des voisines, nette au bord, fondue vers l'interieur.
        const mul: number[] = [];
        let tinted = false;
        for (let k = 0; k < m.length; k++) {
          const rim = st.rimBy?.[families[rivals[si]![k]!]!] ?? st.rim;
          const w = 1 - smooth01(m[k]! / st.rimWidth);
          mul.push(1 + (rim[0] - 1) * w, 1 + (rim[1] - 1) * w, 1 + (rim[2] - 1) * w);
          if (w > 0 && m[k]! > -st.rimWidth && (rim[0] !== 1 || rim[1] !== 1 || rim[2] !== 1)) tinted = true;
        }
        // La surface de la case n'est redessinee que pour sa lisiere.
        if (own && !tinted) return;
        const alpha = m.map((x) => 0.5 + x);
        let b = buffers.get(surface);
        if (!b) buffers.set(surface, (b = newBuffers()));
        for (const [i0, i1, i2] of area.tris) {
          if (own && m[i0]! >= st.rimWidth && m[i1]! >= st.rimWidth && m[i2]! >= st.rimWidth) continue;
          tri(b, surface, area.pts, alpha, i0, i1, i2, mul);
        }
      });
    }
  }
}
