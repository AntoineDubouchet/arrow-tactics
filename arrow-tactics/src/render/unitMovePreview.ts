import * as THREE from 'three';
import type { Team } from '../sim/entity';
import { buildUnit } from './unitMesh';
import { surfaceY } from './terrainSurface';

/**
 * Apercu d'un deplacement d'unites sur la grille (editeur et preparation) :
 * pour chaque unite, une empreinte au sol (vert = destination valide, rouge
 * = invalide) et une silhouette translucide du vrai modele a sa
 * destination. Le vert et le rouge disent la validite, jamais le camp : le
 * camp reste porte par l'anneau de selection des vraies unites.
 *
 * Les silhouettes sont gardees en reserve par classe et par camp, reutilisees
 * d'un mouvement de souris a l'autre et simplement masquees quand elles ne
 * servent pas : aucun modele n'est reconstruit pendant le survol.
 */

export const PLACEMENT_VALID_COLOR = 0x4ade80;
export const PLACEMENT_INVALID_COLOR = 0xef4444;

const GHOST_OPACITY = 0.5;
const INVALID_GHOST_OPACITY = 0.4;
/** Part de rouge melangee a la couleur d'une silhouette invalide. */
const INVALID_GHOST_TINT = 0.65;
const FOOTPRINT_SIZE = 0.92;
const FOOTPRINT_HEIGHT = 0.025;

export interface UnitMovePreviewItem {
  unitId: string;
  team: Team;
  x: number;
  z: number;
  valid: boolean;
  /** Cases occupees a destination ; par defaut la seule case (x, z). */
  footprint?: { x: number; z: number }[];
}

interface Ghost {
  root: THREE.Object3D;
  meshes: THREE.Mesh[];
  validMaterials: (THREE.Material | THREE.Material[])[];
  invalidMaterials: (THREE.Material | THREE.Material[])[];
  valid: boolean;
}

const footprintGeometry = new THREE.PlaneGeometry(FOOTPRINT_SIZE, FOOTPRINT_SIZE);
footprintGeometry.rotateX(-Math.PI / 2);
const footprintMaterial = (color: number) =>
  new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide });
/** Deux materiaux partages, jamais modifies apres creation. */
const validFootprintMaterial = footprintMaterial(PLACEMENT_VALID_COLOR);
const invalidFootprintMaterial = footprintMaterial(PLACEMENT_INVALID_COLOR);
const invalidTint = new THREE.Color(PLACEMENT_INVALID_COLOR);

/** Copie translucide d'un materiau : le materiau d'origine (partage avec les
 *  vraies unites) n'est jamais modifie. */
function translucentClone(material: THREE.Material, opacity: number, tinted: boolean): THREE.Material {
  const clone = material.clone();
  clone.transparent = true;
  clone.opacity = opacity;
  clone.depthWrite = false;
  const colored = clone as THREE.Material & { color?: THREE.Color };
  if (tinted && colored.color) colored.color.lerp(invalidTint, INVALID_GHOST_TINT);
  return clone;
}

function buildGhost(unitId: string, team: Team): Ghost {
  // Nouveau modele (meme fabrique que les vraies unites, clonage sur des
  // rigs compris) : ses materiaux sont remplaces par des copies, jamais
  // modifies en place.
  const root = buildUnit(unitId, team);
  // Meme orientation que les unites de l'editeur : le camp ennemi fait face
  // au camp joueur.
  if (team === 'enemy') root.rotation.y = Math.PI;
  const meshes: THREE.Mesh[] = [];
  const validMaterials: (THREE.Material | THREE.Material[])[] = [];
  const invalidMaterials: (THREE.Material | THREE.Material[])[] = [];
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.raycast = () => {};
    const original = mesh.material;
    const list = Array.isArray(original) ? original : [original];
    const valid = list.map((m) => translucentClone(m, GHOST_OPACITY, false));
    const invalid = list.map((m) => translucentClone(m, INVALID_GHOST_OPACITY, true));
    meshes.push(mesh);
    validMaterials.push(Array.isArray(original) ? valid : valid[0]!);
    invalidMaterials.push(Array.isArray(original) ? invalid : invalid[0]!);
    mesh.material = validMaterials[validMaterials.length - 1]!;
  });
  return { root, meshes, validMaterials, invalidMaterials, valid: true };
}

function setGhostValid(ghost: Ghost, valid: boolean): void {
  if (ghost.valid === valid) return;
  ghost.valid = valid;
  const set = valid ? ghost.validMaterials : ghost.invalidMaterials;
  ghost.meshes.forEach((mesh, i) => {
    mesh.material = set[i]!;
  });
}

export class UnitMovePreview {
  /** A ajouter a la scene par l'appelant. */
  readonly group = new THREE.Group();
  private readonly ghosts = new Map<string, Ghost[]>();
  private readonly footprints: THREE.Mesh[] = [];
  private shown = false;

  constructor() {
    this.group.visible = false;
  }

  get visible(): boolean {
    return this.shown;
  }

  show(items: readonly UnitMovePreviewItem[]): void {
    if (items.length === 0) {
      this.hide();
      return;
    }
    const used = new Map<string, number>();
    let usedFootprints = 0;
    for (const item of items) {
      const key = `${item.unitId}|${item.team}`;
      const index = used.get(key) ?? 0;
      used.set(key, index + 1);
      const ghost = this.ghostAt(key, item.unitId, item.team, index);
      ghost.root.position.set(item.x, 0 + surfaceY(item.x, item.z), item.z);
      setGhostValid(ghost, item.valid);
      ghost.root.visible = true;

      for (const cell of item.footprint ?? [{ x: item.x, z: item.z }]) {
        const tile = this.footprintAt(usedFootprints++);
        tile.position.set(cell.x, FOOTPRINT_HEIGHT + surfaceY(cell.x, cell.z), cell.z);
        tile.material = item.valid ? validFootprintMaterial : invalidFootprintMaterial;
        tile.visible = true;
      }
    }
    for (const [key, pool] of this.ghosts) {
      for (let i = used.get(key) ?? 0; i < pool.length; i++) pool[i]!.root.visible = false;
    }
    for (let i = usedFootprints; i < this.footprints.length; i++) this.footprints[i]!.visible = false;
    this.group.visible = true;
    this.shown = true;
  }

  hide(): void {
    if (!this.shown) return;
    this.group.visible = false;
    this.shown = false;
  }

  private ghostAt(key: string, unitId: string, team: Team, index: number): Ghost {
    let pool = this.ghosts.get(key);
    if (!pool) {
      pool = [];
      this.ghosts.set(key, pool);
    }
    while (pool.length <= index) {
      const ghost = buildGhost(unitId, team);
      this.group.add(ghost.root);
      pool.push(ghost);
    }
    return pool[index]!;
  }

  private footprintAt(index: number): THREE.Mesh {
    while (this.footprints.length <= index) {
      const tile = new THREE.Mesh(footprintGeometry, validFootprintMaterial);
      tile.raycast = () => {};
      this.group.add(tile);
      this.footprints.push(tile);
    }
    return this.footprints[index]!;
  }
}
