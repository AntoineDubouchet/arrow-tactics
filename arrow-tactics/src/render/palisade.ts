import * as THREE from 'three';
import type { WallSegment } from '../core/wallLine';
import { surfaceY } from './terrainSurface';
import { applyContactShading } from './contactMap';
import { buildTorch } from './fireProps';

/**
 * Rendu PROCEDURAL de la Palissade V2 (2026-11-02) : aucun asset adapte dans
 * le depot (les murs KayKit sont des remparts de pierre a 120°), donc un
 * module simple, stylise et repetable, genere a la volee :
 *
 * - segment : rangee de pieux tailles en pointe (hauteurs legerement
 *   variees, deterministes), deux traverses cote interieur, un poteau plus
 *   massif a chaque extremite ;
 * - porte (refaite le 2026-11-05, demande d'Antoine) : deux montants un peu
 *   plus hauts, DESSUS OUVERT (ni linteau ni arche), deux vrais vantaux
 *   gauche / droite de pieux pointus plus courts, deux traverses et une
 *   echarpe cote interieur, chacun construit dans son propre sens (aucune
 *   face miroir, volumes reels corrects de l'interieur, de l'exterieur et de
 *   cote) ; noeuds `palisade_door_left` / `palisade_door_right`, pivots
 *   sur les gonds, animes par BuildingView.setDoorOpenness. Meme famille
 *   visuelle que les segments voisins : une ouverture fonctionnelle dans la
 *   palissade.
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
/** Porte nettement plus haute que le mur (2026-11-06, demande d'Antoine : on ne la
 *  distinguait pas ; 1,42 et 0,95 avant). Rendu seulement. */
const GATE_POST_HEIGHT = 2.2;
/** Torches des montants de porte (2026-11-08, render/fireProps.ts, EN COURS DE VALIDATION) : base du
 *  manche a TORCH_HEIGHT sur la face INTERIEURE du montant (-Z local, le cote defendu : celui des
 *  traverses, pour toute porte, camp de depart ou construite), inclinee de TORCH_TILT vers
 *  l'interieur ; sommet des flammes ~2,05, sous le haut du montant. Rendu seulement. Les lumieres,
 *  elles, sont un reservoir partage (render/warmLights.ts). */
const TORCH_HEIGHT = 1.0;
const TORCH_TILT = 0.3;
/** Vantail : pieux un peu plus fins que ceux du mur. */
const LEAF_STAKE_RADIUS = 0.07;
const LEAF_STAKE_HEIGHT = 1.6;
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
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0, flatShading: true });
  // Ombre de contact et voile de brume (render/contactMap.ts, rendu officiel 2026-11-07).
  applyContactShading(material);
  return material;
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

/** Vantail de porte : rangee de pieux pointus (volumes reels, corrects des
 *  deux cotes), deux traverses et une echarpe cote interieur (-Z local,
 *  comme les traverses des segments) ; pivot sur le gond (x = 0), s'etend
 *  dans le sens `dir` (+1 : vers +X, vantail gauche ; -1 : vers -X, vantail
 *  droit) sur `width` — deux vrais vantaux, aucune face miroir. */
function buildDoorLeaf(width: number, name: string, dir: 1 | -1): THREE.Group {
  const out = new MergedGeometry();
  const count = Math.max(2, Math.round(width / STAKE_SPACING));
  const step = width / count;
  for (let i = 0; i < count; i++) {
    const x = dir * (step * (i + 0.5));
    const h = LEAF_STAKE_HEIGHT * (0.94 + 0.1 * ((i * 5) % 4) / 4);
    const tint = WOOD.clone().lerp(WOOD_DARK, 0.1 + 0.25 * ((i * 7) % 3) / 3);
    addStake(out, x, 0, 0, LEAF_STAKE_RADIUS, h, tint, WOOD_TIP);
  }
  const inner = -LEAF_STAKE_RADIUS - 0.03;
  for (const y of [0.295, 0.675]) addRail(out, dir * 0.03, y * LEAF_STAKE_HEIGHT, dir * (width - 0.03), y * LEAF_STAKE_HEIGHT, inner, 0.065, WOOD_DARK);
  addRail(out, dir * 0.06, 0.23 * LEAF_STAKE_HEIGHT, dir * (width - 0.06), 0.76 * LEAF_STAKE_HEIGHT, inner - 0.005, 0.055, WOOD_DARK);
  const mesh = new THREE.Mesh(out.build(), woodMaterial());
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  const leaf = new THREE.Group();
  leaf.name = name;
  leaf.add(mesh);
  return leaf;
}

/** Porte de palissade occupant le segment A -> B : deux montants, dessus
 *  ouvert, deux vantaux (fermes ; BuildingView.setDoorOpenness les fait
 *  pivoter sur leur gond, chacun dans son sens). */
export function buildPalisadeGate(s: WallSegment): THREE.Group {
  const { group, length, groundAt } = segmentFrame(s);
  const half = length / 2;
  const frame = new MergedGeometry();
  addPost(frame, -half, groundAt(0), s.ax, s.az, GATE_POST_HEIGHT);
  addPost(frame, half, groundAt(1), s.bx, s.bz, GATE_POST_HEIGHT);
  const frameMesh = new THREE.Mesh(frame.build(), woodMaterial());
  frameMesh.castShadow = true;
  frameMesh.receiveShadow = true;
  group.add(frameMesh);
  const ground = Math.min(groundAt(0), groundAt(1));
  const leafWidth = Math.max(0.2, half - POST_RADIUS - 0.03);
  const left = buildDoorLeaf(leafWidth, 'palisade_door_left', 1);
  left.position.set(-half + POST_RADIUS + 0.01, ground - 0.03, 0);
  const right = buildDoorLeaf(leafWidth, 'palisade_door_right', -1);
  right.position.set(half - POST_RADIUS - 0.01, ground - 0.03, 0);
  group.add(left, right);
  // Torches : une par montant, dans un sous-groupe (pas un mesh direct du cadre : BuildingView et
  // porte-jeu.cjs comptent le cadre), fixees a la face interieure du poteau (-Z local, cote des
  // traverses), inclinees vers l'interieur du camp.
  const torches = new THREE.Group();
  torches.name = 'palisade_torches';
  for (const [x, g] of [[-half, groundAt(0)], [half, groundAt(1)]] as const) {
    const torch = buildTorch().group;
    torch.position.set(x, g + TORCH_HEIGHT, -(POST_RADIUS + 0.01));
    torch.rotation.x = -TORCH_TILT;
    torches.add(torch);
  }
  group.add(torches);
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
    // Torches : materiaux partages par tous les feux (render/fireProps.ts), jamais liberes ici.
    if (mesh.userData['sharedMaterial']) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const m of mats) m.dispose();
  });
}
