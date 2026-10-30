import * as THREE from 'three';
import { cellKey, type TerrainCellDef } from '../config/mapDef';
import { cellTriangles, surfaceHeightInCell, TERRAIN_ELEVATION_STEP, type SlopeDirection } from '../config/terrainElevation';
import type { GroundSurfaceId } from './groundSurfaces';
import { applyGroundLayer, groundLookTint, groundMacro, groundRenderSurface, groundStates, groundSurfaceDef } from './groundLook';
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
 */
export type SurfaceBlendMode = 'hard' | 'irregular';
export const SURFACE_BLEND_MODES: readonly SurfaceBlendMode[] = ['hard', 'irregular'];
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
 *  defaut. A rang egal, l'ordre de cette liste departage. */
const BLEND_PRIORITY: readonly GroundSurfaceId[] = [
  'grass',
  'herbe-classique',
  'herbe-prairie',
  'herbe-dense',
  'herbe-stylisee',
  'herbe-pixel-net',
  'herbe-pixel-touffes',
  'mixte-taches',
  'mixte-usee',
  'dirt',
  'terre-battue',
  'terre-strates',
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
 *  `lips` : levres du rendu facette. Sans effet en `hard`. */
export function appendSurfaceBlend(group: THREE.Group, cells: readonly TerrainCellDef[], ctx: TerrainContext, lips?: TerrainLips): void {
  if (blendMode === 'hard') return;
  const P = SURFACE_BLEND_PARAMS;
  const N = P.subdivisions;
  const R = P.cornerRadius;
  const { field } = ctx;
  const buffers = new Map<GroundSurfaceId, LayerBuffers>();
  const ab = new THREE.Vector3(), ac = new THREE.Vector3(), nrm = new THREE.Vector3();
  // Etats `living` (render/groundLook.ts), lus dans la case en cours (cellX, cellZ).
  const states = groundStates(ctx);
  let cellX = 0, cellZ = 0;
  // Triangle (indices dans des positions xyz a plat et leurs alphas) : emis s'il a un sommet visible, normale vers le haut.
  // Cycle de texture et variation `?groundLook=` (point monde) : ceux de la surface qui deborde.
  const tri = (b: LayerBuffers, surface: GroundSurfaceId, p: readonly number[], as: readonly number[], i0: number, i1: number, i2: number) => {
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
      const shade = (1 + RELIEF_TINT_PER_LEVEL * (Math.max(0, y) / TERRAIN_ELEVATION_STEP)) * (1 - SLOPE_SHADE * tilt);
      b.positions.push(x, y, z);
      b.normals.push(nrm.x, nrm.y, nrm.z);
      b.uvs.push(x / tiles, -z / tiles);
      const m = groundMacro(surface, x, z);
      b.colors.push(shade * m[0], shade * m[1], shade * m[2], as[k]!);
      const st = states?.at(surface, x, z, cellX, cellZ);
      if (st) b.states.push(st[0], st[1], st[2]);
    }
  };
  // Surfaces DESSINEES (`living` : une herbe, une terre ; aucune transition entre deux etats d'une meme matiere).
  const drawnAt = (x: number, z: number) => {
    const s = ctx.surfaceAt(x, z);
    return s && groundRenderSurface(s);
  };
  for (const c of cells) {
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
