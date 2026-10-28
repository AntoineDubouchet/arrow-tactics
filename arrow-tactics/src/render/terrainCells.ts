import * as THREE from 'three';
import { TILE } from '../config/constants';
import { cellKey, type TerrainCellDef, type TerrainType } from '../config/mapDef';
import { cellTriangles, EDGE_CORNERS, FLAT_TERRAIN, TERRAIN_ELEVATION_STEP, OPPOSITE_SLOPE_DIRECTION, SLOPE_DIRECTIONS, SLOPE_DIRECTION_VECTORS, type TerrainHeightField } from '../config/terrainElevation';
import { createDirtTexture, createGrassTexture } from './textures';

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
 * Une géométrie FUSIONNÉE PAR TYPE DE TERRAIN (herbe/terre) — un draw call
 * par type quel que soit le nombre de cellules. Relief 2.5D (2026-10-28,
 * config/terrainElevation.ts) : chaque case n'a que son DESSUS (plat ou en
 * pente) et les faces latérales qui se voient — vers une case voisine plus
 * basse (falaise, entre les deux hauteurs) ou vers une case absente (bord du
 * plateau, trou : jusqu'à -CELL_THICKNESS). Aucune face cachée entre deux
 * cases au même niveau, aucune dalle superposée (pas de z-fighting). Carte
 * plate : même rendu que les anciennes dalles instanciées (dessus à y = 0,
 * flancs jusqu'à -CELL_THICKNESS au bord et autour des trous).
 *
 * Compromis assumé (documenté explicitement, pas un oubli) : remplace le
 * relief en STRATES de l'ancien sol (herbe/topsoil/subsoil empilés) par UNE
 * SEULE épaisseur par cellule — empiler 3 strates PAR CELLULE aurait
 * triplé le nombre d'instances pour un gain visuel marginal une fois la
 * carte vue depuis la caméra de jeu inclinée. Chaque cellule affiche aussi
 * la MÊME texture (pas de variation par instance, InstancedMesh ne permet
 * pas facilement une UV différente par instance sans shader dédié) — un
 * détail visuel à revoir plus tard si Antoine le juge trop répétitif une
 * fois vu en jeu.
 */

/** Epaisseur visuelle d'une dalle de terrain (0,3 avant, x1,5 pour un
 *  plateau plus massif vu de cote). La dalle est posee SOUS y = 0 (voir
 *  buildTerrainLayer) : seuls les flancs de bord descendent, la surface
 *  jouee (unites, decors, grille, zones) ne bouge pas. Purement visuel,
 *  jamais lu par la simulation. */
const CELL_THICKNESS = 0.45;

/** Eclaircissement de la texture par niveau de relief (+15 %), pour lire les
 *  plateaux vus de dessus meme quand leurs falaises sont cachees. */
const RELIEF_TINT_PER_LEVEL = 0.15;

export interface TerrainCellsView {
  group: THREE.Group;
}

export function buildTerrainCellsView(cells: TerrainCellDef[], field: TerrainHeightField = FLAT_TERRAIN): TerrainCellsView {
  const group = new THREE.Group();
  const present = new Set(cells.map((c) => cellKey(c.x, c.z)));
  const hasCell = (x: number, z: number) => present.has(cellKey(x, z));

  const byType = new Map<TerrainType, TerrainCellDef[]>();
  for (const cell of cells) {
    const list = byType.get(cell.terrain);
    if (list) list.push(cell);
    else byType.set(cell.terrain, [cell]);
  }

  const grassCells = byType.get('grass');
  if (grassCells && grassCells.length > 0) group.add(buildTerrainLayer(grassCells, field, hasCell, createGrassTexture()));

  const dirtCells = byType.get('dirt');
  if (dirtCells && dirtCells.length > 0) group.add(buildTerrainLayer(dirtCells, field, hasCell, createDirtTexture()));

  return { group };
}

function buildTerrainLayer(cells: TerrainCellDef[], field: TerrainHeightField, hasCell: (x: number, z: number) => boolean, texture: THREE.Texture): THREE.Mesh {
  // Un seul cycle de texture par face (dessus ou flanc), comme les faces des
  // anciennes dalles : pas de motif continu sur toute la carte.
  texture.repeat.set(1, 1);
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const colors: number[] = [];
  const n = new THREE.Vector3();
  const ab = new THREE.Vector3();
  const ac = new THREE.Vector3();
  // Triangle oriente pour que sa normale geometrique pointe du cote de
  // `outward` (face avant visible, materiau FrontSide).
  const pushTriangle = (p: THREE.Vector3[], uv: [number, number][], outward: THREE.Vector3) => {
    ab.subVectors(p[1]!, p[0]!);
    ac.subVectors(p[2]!, p[0]!);
    n.crossVectors(ab, ac);
    if (n.lengthSq() < 1e-12) return;
    const order = n.dot(outward) >= 0 ? [0, 1, 2] : [0, 2, 1];
    n.normalize();
    if (n.dot(outward) < 0) n.negate();
    for (const i of order) {
      positions.push(p[i]!.x, p[i]!.y, p[i]!.z);
      // Lisibilite du relief : chaque niveau eclaircit legerement la texture
      // (rien sous y = 0 : carte plate inchangee).
      const tint = 1 + RELIEF_TINT_PER_LEVEL * (Math.max(0, p[i]!.y) / TERRAIN_ELEVATION_STEP);
      colors.push(tint, tint, tint);
      normals.push(n.x, n.y, n.z);
      uvs.push(uv[i]![0], uv[i]![1]);
    }
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
    const point = (i: number) => new THREE.Vector3(i % 2 === 0 ? x0 : x1, h[i]!, i < 2 ? z0 : z1);
    const uvOf = (i: number): [number, number] => [i % 2, i < 2 ? 1 : 0];
    for (const tri of cellTriangles(field.slopeAt(cell.x, cell.z))) {
      pushTriangle(tri.map(point), tri.map(uvOf), up);
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
      const vOf = (y: number) => (y - minY) / span;
      const pTop0 = new THREE.Vector3(ax, top0, az);
      const pTop1 = new THREE.Vector3(bx, top1, bz);
      const pBot0 = new THREE.Vector3(ax, bottom0, az);
      const pBot1 = new THREE.Vector3(bx, bottom1, bz);
      pushTriangle([pTop0, pBot0, pTop1], [[0, vOf(top0)], [0, vOf(bottom0)], [1, vOf(top1)]], outward);
      pushTriangle([pTop1, pBot0, pBot1], [[1, vOf(top1)], [0, vOf(bottom0)], [1, vOf(bottom1)]], outward);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const mesh = new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({ map: texture, vertexColors: true }));
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
