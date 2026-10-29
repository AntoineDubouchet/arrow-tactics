import * as THREE from 'three';
import { TILE } from '../config/constants';
import type { GroundTextureId } from '../config/groundSurfaces';
import { cellKey, type TerrainCellDef } from '../config/mapDef';
import { cellTriangles, EDGE_CORNERS, FLAT_TERRAIN, TERRAIN_ELEVATION_STEP, OPPOSITE_SLOPE_DIRECTION, SLOPE_DIRECTIONS, SLOPE_DIRECTION_VECTORS, type TerrainHeightField } from '../config/terrainElevation';
import { GROUND_SURFACES, groundFlankSurface, groundSurfaceAt, type GroundSurfaceId } from './groundSurfaces';

/**
 * Rendu des cellules de terrain RÉELLEMENT présentes (2026-08-16, chantier
 * map irrégulière, voir CLAUDE.md) — remplace l'ancien bloc de sol unique
 * (une seule grande boîte texturée sur toute la carte, voir board.ts,
 * createGroundBlock, retiré) : une petite dalle PAR CELLULE existante,
 * jamais dessinée là où aucune cellule n'existe (Part AC : "case absente =
 * vide"). Partagé par le jeu réel (board.ts) ET l'éditeur (main.ts,
 * rebuildEditorBoard) — même fonction, jamais deux façons de dessiner une
 * cellule.
 *
 * FORME et APPARENCE séparées. Forme : relief 2.5D (2026-10-28,
 * config/terrainElevation.ts) — chaque case n'a que son DESSUS (plat, en
 * pente ou en pente de coin) et les faces latérales qui se voient — vers une
 * case voisine plus basse (falaise, entre les deux hauteurs) ou vers une case
 * absente (bord du plateau, trou : jusqu'à -CELL_THICKNESS). Aucune face
 * cachée entre deux cases au même niveau, aucune dalle superposée (pas de
 * z-fighting). Apparence : le dessus prend la SURFACE VISUELLE de la case
 * (render/groundSurfaces.ts : la surface PEINTE de la case si elle en a une,
 * MapDef.surfaceCells, sinon celle de la palette), les flancs la surface
 * de flanc de la palette (par défaut une terre plus sombre), commune à toutes
 * les cases : une falaise se lit
 * comme une rupture verticale, sans contour. Une géométrie fusionnée par
 * surface présente plus une pour tous les flancs : un draw call par surface
 * utilisée sur la carte (plus un), quel que soit le nombre de cases.
 *
 * UV projetées en coordonnées monde : dessus en (x, z) — continu d'une case
 * à l'autre, pente et coin compris (une pente étire la texture de 12 % dans
 * le sens de la montée, rien d'absurde sur un coin) — et flancs en (position
 * le long du bord, y), sans compression verticale quelle que soit leur
 * hauteur. Une texture d'un cycle par case (herbe classique) donne
 * exactement le placage d'avant.
 *
 * Compromis assumé : UNE SEULE épaisseur par cellule plutôt que les strates
 * de l'ancien sol (herbe/topsoil/subsoil empilés) ; la terre des flancs en
 * reprend l'idée.
 */

/** Epaisseur visuelle d'une dalle de terrain (0,3 avant, x1,5 pour un
 *  plateau plus massif vu de cote). La dalle est posee SOUS y = 0 (voir
 *  buildTerrainCellsView) : seuls les flancs de bord descendent, la surface
 *  jouee (unites, decors, grille, zones) ne bouge pas. Purement visuel,
 *  jamais lu par la simulation. */
export const CELL_THICKNESS = 0.45;

/** Eclaircissement du dessus par niveau de relief, pour lire les plateaux
 *  vus de dessus meme quand leurs falaises sont cachees. */
const RELIEF_TINT_PER_LEVEL = 0.15;

/** Assombrissement d'une pente (normale inclinee d'un niveau par case) : la
 *  lumiere reelle marque deja son orientation, ce leger voile la distingue
 *  d'un plat meme face au soleil. Proportionnel a l'inclinaison reelle. */
const SLOPE_SHADE = 0.18;
/** Composante verticale de la normale d'une pente cardinale (un niveau par
 *  case : pente 1/2). */
const SLOPE_NORMAL_Y = 1 / Math.hypot(1, TERRAIN_ELEVATION_STEP / TILE);

/** Assombrissement au pied d'un flanc (haut du flanc : 1) : ombre de contact
 *  qui ancre la falaise dans le sol. */
const FLANK_FOOT_SHADE = 0.65;

export interface TerrainCellsView {
  group: THREE.Group;
}

interface LayerBuffers {
  positions: number[];
  normals: number[];
  uvs: number[];
  colors: number[];
}

const newBuffers = (): LayerBuffers => ({ positions: [], normals: [], uvs: [], colors: [] });

/** `painted` : surface peinte du dessus par case (cle cellKey, voir
 *  config/groundSurfaces.ts buildSurfaceIndex) ; une case absente garde la
 *  surface de la palette. */
export function buildTerrainCellsView(cells: TerrainCellDef[], field: TerrainHeightField = FLAT_TERRAIN, painted: ReadonlyMap<string, GroundTextureId> = new Map()): TerrainCellsView {
  const group = new THREE.Group();
  const present = new Set(cells.map((c) => cellKey(c.x, c.z)));
  const hasCell = (x: number, z: number) => present.has(cellKey(x, z));

  const tops = new Map<GroundSurfaceId, LayerBuffers>();
  const flanks = newBuffers();
  const flankSurface = groundFlankSurface();
  const flankTiles = GROUND_SURFACES[flankSurface].tiles;
  const n = new THREE.Vector3();
  const ab = new THREE.Vector3();
  const ac = new THREE.Vector3();
  // Triangle oriente pour que sa normale geometrique pointe du cote de
  // `outward` (face avant visible, materiau FrontSide) ; `shade` : couleur
  // de sommet (multiplie la texture) selon sa hauteur et la normale.
  const pushTriangle = (out: LayerBuffers, p: THREE.Vector3[], uv: [number, number][], outward: THREE.Vector3, shade: (y: number, normal: THREE.Vector3) => number) => {
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
      out.colors.push(s, s, s);
      out.normals.push(n.x, n.y, n.z);
      out.uvs.push(uv[i]![0], uv[i]![1]);
    }
  };
  // Dessus : eclairci par niveau (rien sous y = 0 : carte plate inchangee),
  // pentes legerement voilees.
  const topShade = (y: number, normal: THREE.Vector3) => {
    const tilt = Math.min(1, Math.max(0, (1 - normal.y) / (1 - SLOPE_NORMAL_Y)));
    return (1 + RELIEF_TINT_PER_LEVEL * (Math.max(0, y) / TERRAIN_ELEVATION_STEP)) * (1 - SLOPE_SHADE * tilt);
  };
  const up = new THREE.Vector3(0, 1, 0);
  for (const cell of cells) {
    const h = field.cornerHeights(cell.x, cell.z);
    const x0 = cell.x;
    const x1 = cell.x + TILE;
    const z0 = cell.z;
    const z1 = cell.z + TILE;
    // Dessus : les deux triangles de la case (cellTriangles, meme diagonale
    // que la hauteur gameplay heightAt), plats, en pente ou en pente de coin.
    const surface = groundSurfaceAt(cell.terrain, cell.x, cell.z, painted.get(cellKey(cell.x, cell.z)));
    let top = tops.get(surface);
    if (!top) tops.set(surface, (top = newBuffers()));
    const tiles = GROUND_SURFACES[surface].tiles;
    const point = (i: number) => new THREE.Vector3(i % 2 === 0 ? x0 : x1, h[i]!, i < 2 ? z0 : z1);
    const uvOf = (i: number): [number, number] => [(i % 2 === 0 ? x0 : x1) / tiles, -(i < 2 ? z0 : z1) / tiles];
    for (const tri of cellTriangles(field.slopeAt(cell.x, cell.z))) {
      pushTriangle(top, tri.map(point), tri.map(uvOf), up, topShade);
    }
    // Flancs visibles.
    const corner = (i: number): [number, number] => [i % 2 === 0 ? x0 : x1, i < 2 ? z0 : z1];
    for (const dir of SLOPE_DIRECTIONS) {
      const v = SLOPE_DIRECTION_VECTORS[dir];
      const [i0, i1] = EDGE_CORNERS[dir];
      const top0 = h[i0]!;
      const top1 = h[i1]!;
      let bottom0 = -CELL_THICKNESS;
      let bottom1 = -CELL_THICKNESS;
      if (hasCell(cell.x + v.dx, cell.z + v.dz)) {
        const other = field.cornerHeights(cell.x + v.dx, cell.z + v.dz);
        const [j0, j1] = EDGE_CORNERS[OPPOSITE_SLOPE_DIRECTION[dir]];
        bottom0 = Math.min(top0, other[j0]!);
        bottom1 = Math.min(top1, other[j1]!);
        if (bottom0 >= top0 && bottom1 >= top1) continue;
      }
      const [ax, az] = corner(i0);
      const [bx, bz] = corner(i1);
      const outward = new THREE.Vector3(v.dx, 0, v.dz);
      const minY = Math.min(bottom0, bottom1);
      const span = Math.max(top0, top1) - minY || 1;
      const flankShade = (y: number) => FLANK_FOOT_SHADE + (1 - FLANK_FOOT_SHADE) * ((y - minY) / span);
      // u : position le long du bord (monde), v : hauteur (monde), divises
      // par le cycle de la surface des flancs.
      const along = v.dx === 0 ? (x: number) => x : (_x: number, z: number) => z;
      const u0 = along(ax, az) / flankTiles;
      const u1 = along(bx, bz) / flankTiles;
      const t = flankTiles;
      const pTop0 = new THREE.Vector3(ax, top0, az);
      const pTop1 = new THREE.Vector3(bx, top1, bz);
      const pBot0 = new THREE.Vector3(ax, bottom0, az);
      const pBot1 = new THREE.Vector3(bx, bottom1, bz);
      pushTriangle(flanks, [pTop0, pBot0, pTop1], [[u0, top0 / t], [u0, bottom0 / t], [u1, top1 / t]], outward, flankShade);
      pushTriangle(flanks, [pTop1, pBot0, pBot1], [[u1, top1 / t], [u0, bottom0 / t], [u1, bottom1 / t]], outward, flankShade);
    }
  }
  // Ordre stable des meshes (ordre des surfaces du catalogue), flancs en
  // dernier.
  for (const id of Object.keys(GROUND_SURFACES) as GroundSurfaceId[]) {
    const top = tops.get(id);
    if (!top) continue;
    const def = GROUND_SURFACES[id];
    const material = new THREE.MeshLambertMaterial({ map: def.texture(), vertexColors: true });
    material.color.setRGB(def.color[0], def.color[1], def.color[2], THREE.LinearSRGBColorSpace);
    group.add(layerMesh(top, material));
  }
  if (flanks.positions.length > 0) {
    const def = GROUND_SURFACES[flankSurface];
    const material = new THREE.MeshLambertMaterial({ map: def.texture(), vertexColors: true });
    material.color.setRGB(def.color[0], def.color[1], def.color[2], THREE.LinearSRGBColorSpace);
    group.add(layerMesh(flanks, material));
  }
  return { group };
}

function layerMesh(buffers: LayerBuffers, material: THREE.Material): THREE.Mesh {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(buffers.positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(buffers.normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(buffers.uvs, 2));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(buffers.colors, 3));
  const mesh = new THREE.Mesh(geometry, material);
  mesh.receiveShadow = true;
  return mesh;
}

/** Lignes de grille sur les cases donnees : les 4 aretes de CHAQUE case,
 *  sans deduplication (une arete partagee par deux cases adjacentes est
 *  tracee deux fois, superposee — visuellement identique a une seule ligne,
 *  cout negligeable a cette echelle). L'editeur passe toutes les cellules de
 *  terrain ; le plateau de jeu, seulement les cases de territoire colorees
 *  (voir board.ts). */
export function buildCellGridLines(cells: readonly { x: number; z: number }[], color: number, field: TerrainHeightField = FLAT_TERRAIN): THREE.LineSegments {
  const points: number[] = [];
  for (const c of cells) {
    const x0 = c.x;
    const x1 = c.x + TILE;
    const z0 = c.z;
    const z1 = c.z + TILE;
    // Relief : chaque case trace ses aretes a SA hauteur (pente comprise).
    const [h00, h10, h01, h11] = field.cornerHeights(c.x, c.z);
    points.push(x0, h00, z0, x1, h10, z0);
    points.push(x0, h01, z1, x1, h11, z1);
    points.push(x0, h00, z0, x0, h01, z1);
    points.push(x1, h10, z0, x1, h11, z1);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  const lines = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.5 }));
  lines.position.y = 0.012;
  return lines;
}
