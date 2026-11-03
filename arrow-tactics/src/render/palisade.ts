import * as THREE from 'three';
import type { WallSegment } from '../core/wallLine';
import { surfaceY } from './terrainSurface';

/**
 * Rendu PROCEDURAL de la Palissade V2 (2026-11-02) : aucun asset adapte dans
 * le depot (les murs KayKit sont des remparts de pierre a 120°), donc un
 * module simple, stylise et repetable, genere a la volee :
 *
 * - segment : rangee de pieux tailles en pointe (hauteurs legerement
 *   variees, deterministes), deux traverses cote interieur, un poteau plus
 *   massif a chaque extremite ;
 * - porte : deux poteaux plus hauts, un linteau, deux battants de planches
 *   (noeuds `palisade_door_left` / `palisade_door_right`, pivots sur les
 *   gonds : animes par BuildingView.setDoorOpenness).
 *
 * Un segment = un seul mesh (geometrie fusionnee, couleurs par sommet) : un
 * appel de dessin par segment, une porte = trois. Les pieux suivent le
 * relief (chaque pieu pose a la hauteur du sol sous lui). Deux segments
 * voisins partagent leur poteau d'extremite (meme position, meme hauteur :
 * superposition exacte, jonction propre sans piece de coin).
 *
 * Remplacable : seul ce fichier connait l'apparence ; la simulation et
 * l'orchestration ne voient que des segments A -> B.
 */

const STAKE_RADIUS = 0.085;
const STAKE_SPACING = 0.17;
const STAKE_HEIGHT = 1.05;
const POST_RADIUS = 0.13;
const POST_HEIGHT = 1.3;
const GATE_POST_HEIGHT = 1.6;
const WOOD = new THREE.Color(0x9a6a3a);
const WOOD_DARK = new THREE.Color(0x6e4826);
const WOOD_TIP = new THREE.Color(0xc89a62);
const WOOD_POST = new THREE.Color(0x7d5530);

/** Petit hachage deterministe d'une position (variations de hauteur). */
function hash01(x: number, z: number): number {
  let h = Math.imul(Math.round(x * 97) ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(Math.round(z * 89), 0xc2b2ae35);
  h ^= h >>> 15;
  h = Math.imul(h, 0x27d4eb2f);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

/** Accumulateur de primitives fusionnees en une geometrie a couleurs par sommet. */
class MergedGeometry {
  private readonly positions: number[] = [];
  private readonly normals: number[] = [];
  private readonly colors: number[] = [];

  add(geometry: THREE.BufferGeometry, matrix: THREE.Matrix4, color: THREE.Color): void {
    const g = (geometry.index ? geometry.toNonIndexed() : geometry).applyMatrix4(matrix);
    const p = g.getAttribute('position');
    const n = g.getAttribute('normal');
    for (let i = 0; i < p.count; i++) {
      this.positions.push(p.getX(i), p.getY(i), p.getZ(i));
      this.normals.push(n.getX(i), n.getY(i), n.getZ(i));
      this.colors.push(color.r, color.g, color.b);
    }
    g.dispose();
    geometry.dispose();
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.normals, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.colors, 3));
    return g;
  }
}

function woodMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0, flatShading: true });
}

const m4 = new THREE.Matrix4();
const q = new THREE.Quaternion();

/** Pieu pointu debout en (x, y, z) local, de hauteur `h`. */
function addStake(out: MergedGeometry, x: number, y: number, z: number, radius: number, h: number, color: THREE.Color, tip: THREE.Color): void {
  const tipH = radius * 2.2;
  out.add(new THREE.CylinderGeometry(radius, radius * 1.05, h - tipH, 7), m4.compose(new THREE.Vector3(x, y + (h - tipH) / 2, z), q.identity(), new THREE.Vector3(1, 1, 1)), color);
  out.add(new THREE.ConeGeometry(radius, tipH, 7), m4.compose(new THREE.Vector3(x, y + h - tipH / 2, z), q.identity(), new THREE.Vector3(1, 1, 1)), tip);
}

/** Traverse horizontale (boite) de x0 a x1, a la hauteur y, decalee en z. */
function addRail(out: MergedGeometry, x0: number, y0: number, x1: number, y1: number, z: number, thickness: number, color: THREE.Color): void {
  const len = Math.hypot(x1 - x0, y1 - y0);
  const angle = Math.atan2(y1 - y0, x1 - x0);
  out.add(new THREE.BoxGeometry(len, thickness, thickness * 0.8), m4.compose(new THREE.Vector3((x0 + x1) / 2, (y0 + y1) / 2, z), q.setFromAxisAngle(new THREE.Vector3(0, 0, 1), angle), new THREE.Vector3(1, 1, 1)), color);
}

/** Repere d'un segment : groupe pose au milieu, axe X local de A vers B,
 *  hauteur du sol au milieu ; `groundAt(t)` = hauteur locale du sol au
 *  point de parametre t (0 en A, 1 en B). */
function segmentFrame(s: WallSegment): { group: THREE.Group; length: number; groundAt: (t: number) => number } {
  const length = Math.hypot(s.bx - s.ax, s.bz - s.az);
  const mx = (s.ax + s.bx) / 2;
  const mz = (s.az + s.bz) / 2;
  const baseY = surfaceY(mx, mz);
  const group = new THREE.Group();
  group.position.set(mx, baseY, mz);
  group.rotation.y = -Math.atan2(s.bz - s.az, s.bx - s.ax);
  return { group, length, groundAt: (t) => surfaceY(s.ax + (s.bx - s.ax) * t, s.az + (s.bz - s.az) * t) - baseY };
}

/** Poteau d'extremite (meme position et meme hauteur pour les deux segments
 *  qui partagent ce point). */
function addPost(out: MergedGeometry, localX: number, ground: number, worldX: number, worldZ: number, height: number): void {
  const h = height * (0.96 + 0.08 * hash01(worldX, worldZ));
  addStake(out, localX, ground - 0.05, 0, POST_RADIUS, h + 0.05, WOOD_POST, WOOD_TIP);
}

/** Segment de palissade de A a B (rendu complet). */
export function buildPalisadeSegment(s: WallSegment): THREE.Group {
  const { group, length, groundAt } = segmentFrame(s);
  const out = new MergedGeometry();
  const half = length / 2;
  const inner = Math.max(0, length - 2 * POST_RADIUS);
  const count = Math.max(1, Math.round(inner / STAKE_SPACING));
  for (let i = 0; i < count; i++) {
    const t = (POST_RADIUS + (inner * (i + 0.5)) / count) / length;
    const x = -half + t * length;
    const wx = s.ax + (s.bx - s.ax) * t;
    const wz = s.az + (s.bz - s.az) * t;
    const h = STAKE_HEIGHT * (0.9 + 0.18 * hash01(wx, wz));
    const tint = WOOD.clone().lerp(WOOD_DARK, 0.35 * hash01(wz, wx));
    addStake(out, x, groundAt(t) - 0.05, 0, STAKE_RADIUS, h + 0.05, tint, WOOD_TIP);
  }
  // Traverses cote interieur (-Z local), suivent le sol d'un bout a l'autre.
  for (const y of [0.32, 0.72]) addRail(out, -half, groundAt(0) + y, half, groundAt(1) + y, -STAKE_RADIUS - 0.03, 0.07, WOOD_DARK);
  addPost(out, -half, groundAt(0), s.ax, s.az, POST_HEIGHT);
  addPost(out, half, groundAt(1), s.bx, s.bz, POST_HEIGHT);
  const mesh = new THREE.Mesh(out.build(), woodMaterial());
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return group;
}

/** Battant de porte : planches verticales, deux traverses et une echarpe,
 *  pivot sur le gond (x = 0), s'etend vers +X sur `width`. */
function buildDoorLeaf(width: number, height: number, name: string): THREE.Group {
  const out = new MergedGeometry();
  const planks = Math.max(2, Math.round(width / 0.2));
  const plankW = width / planks;
  for (let i = 0; i < planks; i++) {
    const x = plankW * (i + 0.5);
    const tint = WOOD.clone().lerp(WOOD_DARK, 0.15 + 0.2 * ((i * 7) % 3) / 3);
    out.add(new THREE.BoxGeometry(plankW * 0.92, height, 0.07), m4.compose(new THREE.Vector3(x, height / 2, 0), q.identity(), new THREE.Vector3(1, 1, 1)), tint);
  }
  for (const y of [0.25, height - 0.25]) addRail(out, 0.02, y, width - 0.02, y, -0.06, 0.08, WOOD_DARK);
  addRail(out, 0.05, 0.3, width - 0.05, height - 0.3, -0.07, 0.07, WOOD_DARK);
  const mesh = new THREE.Mesh(out.build(), woodMaterial());
  mesh.castShadow = true;
  const leaf = new THREE.Group();
  leaf.name = name;
  leaf.add(mesh);
  return leaf;
}

/** Porte de palissade occupant le segment A -> B : poteaux, linteau, deux
 *  battants (fermes ; BuildingView.setDoorOpenness les ouvre vers +Z local). */
export function buildPalisadeGate(s: WallSegment): THREE.Group {
  const { group, length, groundAt } = segmentFrame(s);
  const half = length / 2;
  const frame = new MergedGeometry();
  addPost(frame, -half, groundAt(0), s.ax, s.az, GATE_POST_HEIGHT);
  addPost(frame, half, groundAt(1), s.bx, s.bz, GATE_POST_HEIGHT);
  const top = Math.max(groundAt(0), groundAt(1)) + GATE_POST_HEIGHT - 0.12;
  addRail(frame, -half, top, half, top, 0, 0.12, WOOD_POST);
  const frameMesh = new THREE.Mesh(frame.build(), woodMaterial());
  frameMesh.castShadow = true;
  group.add(frameMesh);
  const ground = Math.min(groundAt(0), groundAt(1));
  const leafWidth = Math.max(0.2, half - POST_RADIUS - 0.02);
  const leafHeight = Math.max(0.6, top - ground - 0.2);
  const left = buildDoorLeaf(leafWidth, leafHeight, 'palisade_door_left');
  left.position.set(-half + POST_RADIUS, ground + 0.04, 0);
  const right = buildDoorLeaf(leafWidth, leafHeight, 'palisade_door_right');
  right.position.set(half - POST_RADIUS, ground + 0.04, 0);
  right.rotation.y = Math.PI;
  group.add(left, right);
  return group;
}

/** Piece d'un mur (segment ou porte) : rendu de jeu, editeur et apercu. */
export function buildWallPieceView(s: WallSegment, gate: boolean): THREE.Group {
  return gate ? buildPalisadeGate(s) : buildPalisadeSegment(s);
}

/** Apercu de pose : memes pieces, teintees vert (valide) ou rouge
 *  (invalide), translucides. */
export function tintWallGhost(view: THREE.Object3D, valid: boolean): void {
  const color = new THREE.Color(valid ? 0x7ee08a : 0xff6b6b);
  view.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.5, depthWrite: false });
    mesh.material = mat;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
  });
}

/** Libere ce qu'une vue de mur possede en propre (geometries et materiaux
 *  generes ; rien n'est partage avec un cache d'assets). */
export function disposeWallPieceView(view: THREE.Object3D): void {
  view.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry.dispose();
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const m of mats) m.dispose();
  });
}
