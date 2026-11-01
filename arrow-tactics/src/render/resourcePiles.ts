import * as THREE from 'three';
import type { ResourceKind } from '../config/resourceNodes';
import { surfaceY } from './terrainSurface';

/**
 * Petits tas de ressources au sol (2026-11-01, Hero RTS) : fagot de planches
 * (bois) ou petit cairn de cailloux (pierre), ramasses par le Heros. Rendu
 * seulement : la simulation tient les quantites (World.resourcePiles), cette
 * vue suit. Geometrie procedurale low-poly, dans la veine des debris de bois
 * du plateau, mais plus grosse et plus lisible (objet cliquable). Formes
 * stables par tas (graine = identifiant), sans Math.random.
 */
const WOOD_COLORS = [0x9a6a3c, 0x7c5230, 0xb07d4a];
const STONE_COLORS = [0x8d8a84, 0x77746f, 0xa09d97];

const plankGeometry = new THREE.BoxGeometry(1, 1, 1);
const stoneGeometry = new THREE.IcosahedronGeometry(1, 0);
const materials = new Map<number, THREE.MeshStandardMaterial>();

function material(color: number): THREE.MeshStandardMaterial {
  let m = materials.get(color);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: 0.9, metalness: 0, flatShading: true });
    materials.set(color, m);
  }
  return m;
}

/** Suite pseudo-aleatoire stable (mulberry32). */
function seeded(seed: number): () => number {
  let s = (seed * 2654435761) >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Modele d'un tas : `pieces` planches croisees ou cailloux empiles. */
export function buildResourcePileModel(resource: ResourceKind, pieces: number, seed: number): THREE.Group {
  const rand = seeded(seed);
  const group = new THREE.Group();
  if (resource === 'wood') {
    for (let i = 0; i < pieces; i++) {
      const plank = new THREE.Mesh(plankGeometry, material(WOOD_COLORS[i % WOOD_COLORS.length]!));
      const layer = Math.floor(i / 2);
      plank.scale.set(0.62 + rand() * 0.14, 0.05, 0.11);
      plank.position.set((i % 2 === 0 ? -0.07 : 0.07) + (rand() - 0.5) * 0.04, 0.03 + layer * 0.055, (rand() - 0.5) * 0.08);
      plank.rotation.y = (layer % 2 === 0 ? 0.35 : -0.55) + (rand() - 0.5) * 0.3;
      plank.castShadow = true;
      group.add(plank);
    }
  } else {
    for (let i = 0; i < pieces; i++) {
      const stone = new THREE.Mesh(stoneGeometry, material(STONE_COLORS[i % STONE_COLORS.length]!));
      const r = 0.09 + rand() * 0.06;
      const a = (i / pieces) * Math.PI * 2 + rand();
      const ring = i === 0 ? 0 : 0.13;
      stone.scale.set(r * 1.2, r * 0.8, r);
      stone.position.set(Math.cos(a) * ring, r * 0.6 + (i === 0 ? 0.04 : 0), Math.sin(a) * ring);
      stone.rotation.set(rand() * 3, rand() * 3, rand() * 3);
      stone.castShadow = true;
      group.add(stone);
    }
  }
  return group;
}

/** Nombre de pieces affichees pour une quantite (lisibilite, borne). */
function piecesFor(resource: ResourceKind, amount: number): number {
  return Math.min(resource === 'wood' ? 6 : 5, 2 + amount);
}

interface PileSource {
  id: number;
  x: number;
  z: number;
  resource: ResourceKind;
  amount: number;
}

/** Vues des tas d'une carte : creees a la demande, retirees quand le tas est
 *  vide ou absent de la liste (autre carte : « Tester le scenario ») ;
 *  `visibleAt` (brouillard) masque un tas jamais explore. */
export class ResourcePileViews {
  readonly group = new THREE.Group();
  private readonly views = new Map<number, { object: THREE.Group; pieces: number; x: number; z: number }>();

  sync(piles: readonly PileSource[], visibleAt: (x: number, z: number) => boolean = () => true): void {
    const present = new Set<number>();
    for (const pile of piles) {
      present.add(pile.id);
      let view = this.views.get(pile.id);
      if (pile.amount <= 0) {
        if (view) {
          this.group.remove(view.object);
          this.views.delete(pile.id);
        }
        continue;
      }
      const pieces = piecesFor(pile.resource, pile.amount);
      if (!view || view.pieces !== pieces || view.x !== pile.x || view.z !== pile.z) {
        if (view) this.group.remove(view.object);
        const object = buildResourcePileModel(pile.resource, pieces, pile.id + 1);
        object.position.set(pile.x, surfaceY(pile.x, pile.z), pile.z);
        object.userData['resourcePileId'] = pile.id;
        this.group.add(object);
        view = { object, pieces, x: pile.x, z: pile.z };
        this.views.set(pile.id, view);
      }
      view.object.visible = visibleAt(pile.x, pile.z);
    }
    for (const [id, view] of this.views) {
      if (present.has(id)) continue;
      this.group.remove(view.object);
      this.views.delete(id);
    }
  }

  clear(): void {
    this.group.clear();
    this.views.clear();
  }
}

/** Ballot porte par le Heros (sac non vide) : quelques planches et cailloux
 *  sur le dos, rendu seulement. Ajoute / mis a jour sur la vue du Heros. */
export function updateCarryBundle(view: THREE.Object3D, carry: { wood: number; stone: number } | undefined): void {
  let bundle = view.userData['carryBundle'] as THREE.Group | undefined;
  const wood = carry?.wood ?? 0;
  const stone = carry?.stone ?? 0;
  const key = `${Math.min(wood, 3)},${Math.min(stone, 3)}`;
  if (bundle && bundle.userData['key'] === key) return;
  if (bundle) view.remove(bundle);
  view.userData['carryBundle'] = undefined;
  if (wood + stone === 0) return;
  bundle = new THREE.Group();
  bundle.userData['key'] = key;
  if (wood > 0) {
    const planks = buildResourcePileModel('wood', Math.min(wood, 3) + 1, 7);
    planks.scale.setScalar(0.55);
    planks.rotation.z = Math.PI / 2.4;
    planks.position.set(0, 0.95, 0.28);
    bundle.add(planks);
  }
  if (stone > 0) {
    const stones = buildResourcePileModel('stone', Math.min(stone, 3) + 1, 11);
    stones.scale.setScalar(0.6);
    stones.position.set(0, 0.8, 0.3);
    bundle.add(stones);
  }
  view.add(bundle);
  view.userData['carryBundle'] = bundle;
}
