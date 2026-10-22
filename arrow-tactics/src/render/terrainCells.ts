import * as THREE from 'three';
import { TILE } from '../config/constants';
import type { TerrainCellDef, TerrainType } from '../config/mapDef';
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
 * Un `THREE.InstancedMesh` PAR TYPE DE TERRAIN (herbe/terre) — un draw call
 * par type quel que soit le nombre de cellules, y compris sur une grande
 * carte éparse (des centaines de cellules restent triviales pour un GPU
 * moderne en instancing).
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
 *  buildInstancedLayer) : seule sa face inferieure descend, la surface
 *  jouee (unites, decors, grille, zones) ne bouge pas. Purement visuel,
 *  jamais lu par la simulation. */
const CELL_THICKNESS = 0.45;

export interface TerrainCellsView {
  group: THREE.Group;
}

export function buildTerrainCellsView(cells: TerrainCellDef[]): TerrainCellsView {
  const group = new THREE.Group();

  const byType = new Map<TerrainType, TerrainCellDef[]>();
  for (const cell of cells) {
    const list = byType.get(cell.terrain);
    if (list) list.push(cell);
    else byType.set(cell.terrain, [cell]);
  }

  const grassCells = byType.get('grass');
  if (grassCells && grassCells.length > 0) group.add(buildInstancedLayer(grassCells, createGrassTexture()));

  const dirtCells = byType.get('dirt');
  if (dirtCells && dirtCells.length > 0) group.add(buildInstancedLayer(dirtCells, createDirtTexture()));

  return { group };
}

function buildInstancedLayer(cells: TerrainCellDef[], texture: THREE.Texture): THREE.InstancedMesh {
  // Un seul cycle de texture par cellule (pas un motif continu repete sur
  // toute la carte comme l'ancien sol) — coherent avec une instance = une
  // dalle independante.
  texture.repeat.set(1, 1);
  const geometry = new THREE.BoxGeometry(TILE, CELL_THICKNESS, TILE);
  const material = new THREE.MeshLambertMaterial({ map: texture });
  const mesh = new THREE.InstancedMesh(geometry, material, cells.length);
  mesh.receiveShadow = true;

  const matrix = new THREE.Matrix4();
  cells.forEach((cell, i) => {
    matrix.makeTranslation(cell.x + TILE / 2, -CELL_THICKNESS / 2, cell.z + TILE / 2);
    mesh.setMatrixAt(i, matrix);
  });
  mesh.instanceMatrix.needsUpdate = true;

  return mesh;
}

/** Lignes de grille — UNIQUEMENT sur le pourtour des cellules RÉELLEMENT
 *  présentes (Part AI : "la grille doit seulement apparaître sur les
 *  cellules existantes"). Dessine les 4 arêtes de CHAQUE cellule sans
 *  déduplication (une arête interne partagée par deux cellules adjacentes
 *  est tracée deux fois, superposée — visuellement identique à une seule
 *  ligne, coût négligeable à cette échelle) : pour un rectangle plein
 *  classique, produit un quadrillage visuellement identique à l'ancien
 *  (`createGridLines(MapSize)`, retiré) — zéro changement pour les maps
 *  existantes.
 *
 *  `withSideEdges` (plateau du jeu) : ajoute les aretes verticales entre
 *  dalles sur les flancs exposes (bord du plateau, pourtour des trous) —
 *  un trait par coin d'une face laterale visible, sur toute l'epaisseur de
 *  la dalle, legerement decale vers l'exterieur pour ne pas se melanger a
 *  la face. Un seul LineSegments enfant de la grille (il suit donc sa
 *  visibilite), avec une teinte plus claire : la teinte de la grille,
 *  sombre, disparait sur les flancs deja a l'ombre.
 */
export function buildCellGridLines(cells: TerrainCellDef[], color: number, withSideEdges = false): THREE.LineSegments {
  const points: number[] = [];
  for (const c of cells) {
    const x0 = c.x;
    const x1 = c.x + TILE;
    const z0 = c.z;
    const z1 = c.z + TILE;
    points.push(x0, 0, z0, x1, 0, z0);
    points.push(x0, 0, z1, x1, 0, z1);
    points.push(x0, 0, z0, x0, 0, z1);
    points.push(x1, 0, z0, x1, 0, z1);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  const lines = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.5 }));
  lines.position.y = GRID_LIFT;
  if (withSideEdges) {
    const sideGeometry = new THREE.BufferGeometry();
    sideGeometry.setAttribute('position', new THREE.Float32BufferAttribute(sideEdgePoints(cells), 3));
    lines.add(new THREE.LineSegments(sideGeometry, new THREE.LineBasicMaterial({ color: SIDE_EDGE_COLOR, transparent: true, opacity: SIDE_EDGE_OPACITY })));
  }
  return lines;
}

/** Aretes laterales : teinte et opacite (voir buildCellGridLines). */
const SIDE_EDGE_COLOR = 0x6f8a52;
const SIDE_EDGE_OPACITY = 0.45;

/** Hauteur de la grille au-dessus du sol (evite le scintillement avec la dalle). */
const GRID_LIFT = 0.012;
/** Decalage des aretes laterales hors de la face de la dalle. */
const SIDE_EDGE_OUTSET = 0.006;

/** Segments verticaux (repere de la grille, donc corriges de GRID_LIFT) aux
 *  deux coins de chaque face laterale exposee, sans doublon. */
function sideEdgePoints(cells: TerrainCellDef[]): number[] {
  const present = new Set(cells.map((c) => `${c.x},${c.z}`));
  const top = -GRID_LIFT;
  const bottom = -GRID_LIFT - CELL_THICKNESS;
  const seen = new Set<string>();
  const points: number[] = [];
  const add = (x: number, z: number): void => {
    const key = `${x.toFixed(3)},${z.toFixed(3)}`;
    if (seen.has(key)) return;
    seen.add(key);
    points.push(x, top, z, x, bottom, z);
  };
  const o = SIDE_EDGE_OUTSET;
  for (const c of cells) {
    const x0 = c.x;
    const x1 = c.x + TILE;
    const z0 = c.z;
    const z1 = c.z + TILE;
    // Face exposee (case voisine absente) : un trait a chacun de ses deux coins.
    if (!present.has(`${c.x - TILE},${c.z}`)) { add(x0 - o, z0); add(x0 - o, z1); }
    if (!present.has(`${c.x + TILE},${c.z}`)) { add(x1 + o, z0); add(x1 + o, z1); }
    if (!present.has(`${c.x},${c.z - TILE}`)) { add(x0, z0 - o); add(x1, z0 - o); }
    if (!present.has(`${c.x},${c.z + TILE}`)) { add(x0, z1 + o); add(x1, z1 + o); }
  }
  return points;
}
