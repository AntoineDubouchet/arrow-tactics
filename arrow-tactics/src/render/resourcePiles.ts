import * as THREE from 'three';
import type { PileResource, ResourceCargo } from '../data/resources';
import { surfaceY } from './terrainSurface';
import { loadVfxTexture } from './vfxTextures';
import { applyContactShading } from './contactMap';
import { markGameplayOverlay } from './fogOfWar';

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
    // Ombre de contact et voile de brume (render/contactMap.ts, rendu officiel 2026-11-07).
    applyContactShading(m);
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

const coinGeometry = new THREE.CylinderGeometry(0.075, 0.075, 0.025, 12);
const goldMaterial = new THREE.MeshStandardMaterial({ color: 0xf2c94c, metalness: 0.7, roughness: 0.3, emissive: 0x4a3200, flatShading: true });
applyContactShading(goldMaterial);

/** Modele d'un tas : `pieces` planches croisees, cailloux empiles ou pieces d'or. */
export function buildResourcePileModel(resource: PileResource, pieces: number, seed: number): THREE.Group {
  const rand = seeded(seed);
  const group = new THREE.Group();
  if (resource === 'gold') {
    // Or (2026-11-02) : petites piles de pieces dorees.
    for (let i = 0; i < pieces; i++) {
      const coin = new THREE.Mesh(coinGeometry, goldMaterial);
      const a = (i / pieces) * Math.PI * 2 + rand();
      const ring = i === 0 ? 0 : 0.1 + rand() * 0.04;
      coin.position.set(Math.cos(a) * ring, 0.02 + (i === 0 ? 0.03 : 0) + rand() * 0.02, Math.sin(a) * ring);
      coin.rotation.set((rand() - 0.5) * 0.5, rand() * 3, (rand() - 0.5) * 0.5);
      coin.castShadow = true;
      group.add(coin);
    }
    return group;
  }
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
function piecesFor(resource: PileResource, amount: number): number {
  return Math.min(resource === 'stone' ? 5 : 6, 2 + amount);
}

interface PileSource {
  id: number;
  x: number;
  z: number;
  resource: PileResource;
  amount: number;
}

/** Taille AFFICHEE des tas au sol (2026-11-02, demande d'Antoine) : bois
 *  +40 %, pierre +60 %. Visuel seulement : quantite, case, ramassage et
 *  collision inchanges ; le contenu du sac du Heros garde sa taille. */
const PILE_SCALE: Readonly<Record<PileResource, number>> = { wood: 1.4, stone: 1.6, gold: 1.5 };

/** Eclats d'un tas (2026-11-02, refaits puis renforces a la demande
 *  d'Antoine) : toutes les 0,9 a 2,2 s (tirage cosmetique), 2 ou 3 etoiles
 *  apparaissent vite a des ENDROITS DIFFERENTS du tas (repartis autour de
 *  son centre, hauteurs variees), grossissent, derivent un peu vers le haut
 *  en tournant, puis s'eteignent. Etoile blanche en melange normal (lisible
 *  sur l'herbe claire), halo additif chaud dessous. Jamais hors de la vision
 *  actuelle ; jamais intercepte par les clics. */
const GLINT_LIFE = 0.55;
const GLINT_FADE_IN = 0.09;
const GLINT_DELAY_MIN = 0.9;
const GLINT_DELAY_MAX = 2.2;
const GLINT_HALO: Readonly<Record<PileResource, number>> = { wood: 0xffc65a, stone: 0xcfe8ff, gold: 0xffe27a };
/** Texture d'etoile en niveaux de gris : teinte au-dela de 1 pour un blanc
 *  franc (plafonne a l'affichage). */
const GLINT_STAR = new THREE.Color(1.7, 1.65, 1.4);

/** Anneau JAUNE d'un tas selectionne ou vise par un ordre de ramassage ;
 *  bref pulse a l'ordre (pas de clignotement permanent). Meme anneau sur le
 *  depot vise par un ordre de depot (DepotTargetRing). */
const RING_COLOR = 0xffd23f;
const RING_OPACITY = 0.85;
const PULSE_SECONDS = 0.45;
const ringGeometry = new THREE.RingGeometry(0.56, 0.68, 40);
ringGeometry.rotateX(-Math.PI / 2);

interface Glint {
  star: THREE.Sprite;
  halo: THREE.Sprite;
  /** Age (s) ; negatif = depart differe. */
  age: number;
  x: number;
  y: number;
  z: number;
  spin: number;
}

function glintSprite(texture: THREE.Texture, color: THREE.ColorRepresentation, additive: boolean): THREE.Sprite {
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, color, transparent: true, opacity: 0, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending }));
  sprite.raycast = () => {};
  sprite.visible = false;
  return sprite;
}

interface PileView {
  object: THREE.Group;
  resource: PileResource;
  pieces: number;
  x: number;
  z: number;
  /** Eclats (3 au plus) et prochain declenchement (temps de la vue). */
  sparkles: THREE.Group;
  glints: Glint[];
  nextGlint: number;
  ring: THREE.Mesh;
  /** Temps restant du pulse de l'anneau. */
  pulse: number;
}

/** Vues des tas d'une carte : creees a la demande, retirees quand le tas est
 *  vide ou absent de la liste (autre carte : « Tester le scenario »).
 *  Brouillard : `exploredAt` masque un tas jamais explore ; `visibleAt`
 *  (vision actuelle) n'autorise ses eclats que sous les yeux du joueur. Un
 *  tas selectionne ou vise par un ordre de ramassage porte un anneau jaune. */
export class ResourcePileViews {
  readonly group = new THREE.Group();
  private readonly views = new Map<number, PileView>();
  private targets: ReadonlySet<number> = new Set();
  private selected: number | null = null;
  private time = 0;

  sync(piles: readonly PileSource[], exploredAt: (x: number, z: number) => boolean = () => true, visibleAt: (x: number, z: number) => boolean = () => true): void {
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
        const object = new THREE.Group();
        object.position.set(pile.x, surfaceY(pile.x, pile.z), pile.z);
        object.userData['resourcePileId'] = pile.id;
        const model = buildResourcePileModel(pile.resource, pieces, pile.id + 1);
        model.scale.setScalar(PILE_SCALE[pile.resource]);
        const sparkles = new THREE.Group();
        const glints = [0, 1, 2].map(() => {
          const halo = glintSprite(loadVfxTexture('light_01.png'), GLINT_HALO[pile.resource], true);
          const star = glintSprite(loadVfxTexture('star_04.png'), GLINT_STAR, false);
          sparkles.add(halo, star);
          return { star, halo, age: GLINT_LIFE, x: 0, y: 0, z: 0, spin: 0 };
        });
        const ring = new THREE.Mesh(ringGeometry, new THREE.MeshBasicMaterial({ color: RING_COLOR, transparent: true, opacity: RING_OPACITY, depthWrite: false, side: THREE.DoubleSide }));
        ring.position.y = 0.03;
        ring.raycast = () => {};
        object.add(model, sparkles, ring);
        this.group.add(object);
        view = { object, resource: pile.resource, pieces, x: pile.x, z: pile.z, sparkles, glints, nextGlint: this.time + 0.3 + Math.random() * GLINT_DELAY_MAX, ring, pulse: view?.pulse ?? 0 };
        this.views.set(pile.id, view);
      }
      view.object.visible = exploredAt(pile.x, pile.z);
      view.sparkles.visible = view.object.visible && visibleAt(pile.x, pile.z);
      view.ring.visible = this.selected === pile.id || this.targets.has(pile.id) || view.pulse > 0;
    }
    for (const [id, view] of this.views) {
      if (present.has(id)) continue;
      this.group.remove(view.object);
      this.views.delete(id);
    }
  }

  /** Tas vises par un ordre de ramassage du Heros (anneau jusqu'au
   *  changement d'ordre ou au ramassage). */
  setTargets(pileIds: ReadonlySet<number>): void {
    this.targets = pileIds;
  }

  /** Tas selectionne (clic gauche), null sinon. */
  setSelected(pileId: number | null): void {
    this.selected = pileId;
  }

  /** Bref pulse de l'anneau jaune (ordre de ramassage accepte). */
  pulse(pileId: number): void {
    const view = this.views.get(pileId);
    if (view) {
      view.pulse = PULSE_SECONDS;
      view.ring.visible = true;
    }
  }

  /** Animation (temps reel du rendu) : eclats, pulse de l'anneau. */
  animate(realDt: number): void {
    this.time += realDt;
    for (const view of this.views.values()) {
      if (view.pulse > 0) {
        view.pulse = Math.max(0, view.pulse - realDt);
        const u = 1 - view.pulse / PULSE_SECONDS;
        const bump = Math.sin(u * Math.PI);
        view.ring.scale.setScalar(1 + 0.4 * bump);
        (view.ring.material as THREE.MeshBasicMaterial).opacity = Math.min(1, RING_OPACITY + 0.15 * bump);
      } else if (view.ring.scale.x !== 1) {
        view.ring.scale.setScalar(1);
        (view.ring.material as THREE.MeshBasicMaterial).opacity = RING_OPACITY;
      }
      if (!view.sparkles.visible) continue;
      if (this.time >= view.nextGlint) {
        view.nextGlint = this.time + GLINT_DELAY_MIN + Math.random() * (GLINT_DELAY_MAX - GLINT_DELAY_MIN);
        const count = 2 + Math.floor(Math.random() * 2);
        const scale = PILE_SCALE[view.resource];
        // Endroits repartis : un secteur d'angle par etoile, distance variee.
        const turn = Math.random() * Math.PI * 2;
        for (let k = 0; k < count; k++) {
          const g = view.glints[k]!;
          const a = turn + (k / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.9;
          const r = (0.12 + Math.random() * 0.2) * scale;
          g.age = -k * (0.07 + Math.random() * 0.12);
          g.x = Math.cos(a) * r;
          g.z = Math.sin(a) * r;
          g.y = (view.resource === 'wood' ? 0.16 : 0.2) * scale + Math.random() * 0.12;
          g.spin = Math.random() * Math.PI;
        }
      }
      for (const g of view.glints) {
        if (g.age >= GLINT_LIFE) continue;
        g.age += realDt;
        const live = g.age >= 0 && g.age < GLINT_LIFE;
        g.star.visible = g.halo.visible = live;
        if (!live) continue;
        const fade = g.age < GLINT_FADE_IN ? g.age / GLINT_FADE_IN : 1 - (g.age - GLINT_FADE_IN) / (GLINT_LIFE - GLINT_FADE_IN);
        const size = 0.3 + 0.32 * Math.sin(Math.min(1, g.age / GLINT_LIFE) * Math.PI);
        const rise = 0.1 * (g.age / GLINT_LIFE);
        g.star.position.set(g.x, g.y + rise, g.z);
        g.halo.position.copy(g.star.position);
        g.star.scale.setScalar(size);
        g.halo.scale.setScalar(size * 1.8);
        g.star.material.opacity = Math.max(0, fade);
        g.halo.material.opacity = 0.45 * Math.max(0, fade);
        g.star.material.rotation = g.spin + g.age * 2.2;
      }
    }
  }

  clear(): void {
    this.group.clear();
    this.views.clear();
    this.selected = null;
  }
}

/** Depot vise (centre au sol, rayon de l'anneau). */
export interface DepotRingTarget {
  x: number;
  z: number;
  radius: number;
}

/** Anneau JAUNE du depot (Baliste) vise par un ordre de depot du Heros
 *  (2026-11-02, demande d'Antoine) : meme couleur et meme bref pulse que
 *  l'anneau d'un tas, a la taille de l'emprise ; fixe tant que l'ordre dure.
 *  Le pulse reste visible meme si le depot se fait aussitot (Heros deja au
 *  contact). */
export class DepotTargetRing {
  readonly mesh: THREE.Mesh;
  private ordered: DepotRingTarget | null = null;
  private pulsed: DepotRingTarget | null = null;
  private pulseLeft = 0;

  constructor() {
    const geometry = new THREE.RingGeometry(0.88, 1, 48);
    geometry.rotateX(-Math.PI / 2);
    this.mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: RING_COLOR, transparent: true, opacity: RING_OPACITY, depthWrite: false, side: THREE.DoubleSide }));
    this.mesh.raycast = () => {};
    this.mesh.visible = false;
    // Repere prioritaire : rendu apres brouillard et nappes, profondeur de la scene relue
    // (render/fogOfWar.ts).
    markGameplayOverlay(this.mesh);
  }

  /** Depot vise par un ordre en cours, null sinon. */
  setTarget(target: DepotRingTarget | null): void {
    this.ordered = target;
  }

  /** Bref pulse (ordre de depot accepte). */
  pulse(target: DepotRingTarget): void {
    this.pulsed = target;
    this.pulseLeft = PULSE_SECONDS;
  }

  animate(realDt: number): void {
    if (this.pulseLeft > 0) this.pulseLeft = Math.max(0, this.pulseLeft - realDt);
    const target = this.pulseLeft > 0 ? this.pulsed : this.ordered;
    this.mesh.visible = target !== null;
    if (!target) return;
    const bump = this.pulseLeft > 0 ? Math.sin((1 - this.pulseLeft / PULSE_SECONDS) * Math.PI) : 0;
    this.mesh.position.set(target.x, 0.04 + surfaceY(target.x, target.z), target.z);
    this.mesh.scale.setScalar(target.radius * (1 + 0.4 * bump));
    (this.mesh.material as THREE.MeshBasicMaterial).opacity = Math.min(1, RING_OPACITY + 0.15 * bump);
  }
}

/**
 * Sac du Heros (2026-11-02, remplace le ballot pose sur la racine de la vue,
 * qui flottait derriere lui) : sac de toile ATTACHE a l'os du dos du modele
 * riggé, donc entraine par toutes les animations (repos, course, attaque,
 * travail, mort) ; planches et cailloux depassent de son ouverture selon le
 * contenu ; le sac grossit un peu avec la charge. Masque quand le sac est
 * vide. Place une fois, dans l'espace du modele au repos (dos = -Z glTF,
 * convention des modeles Toon), puis rigide sur l'os. Rendu seulement.
 */
const BAG_BONES = ['Bip001_Spine2', 'Bip001_Spine1', 'Bip001_Spine', 'mixamorigSpine2', 'mixamorigSpine1', 'mixamorigSpine'];
const BAG_COLOR = 0x8a6a45;
/** Sac porte (non vide) : 25 % plus gros que la taille de 2026-11-02 matin. */
const BAG_CARRY_SCALE = 1.25;
const BAG_TIE_COLOR = 0x5b4128;
const bagGeometry = new THREE.IcosahedronGeometry(1, 1);
const tieGeometry = new THREE.CylinderGeometry(0.42, 0.55, 0.35, 7);

interface HeroBag {
  /** Rigide sur l'os (matrice locale fixe), mis a l'echelle de la charge. */
  root: THREE.Group;
  sack: THREE.Group;
  contents: THREE.Group;
  /** Taille du sac vide (proportionnelle au personnage). */
  base: number;
  key: string;
}

/** Os du dos et matrice locale qui pose le sac au repos (null : modele sans
 *  squelette connu, le sac reste alors sur la racine de la vue). */
function bagMount(view: THREE.Object3D): { bone: THREE.Object3D; local: THREE.Matrix4; size: number } | null {
  let skinned: THREE.SkinnedMesh | null = null;
  view.traverse((o) => {
    if (!skinned && (o as THREE.SkinnedMesh).isSkinnedMesh) skinned = o as THREE.SkinnedMesh;
  });
  const mesh = skinned as THREE.SkinnedMesh | null;
  if (!mesh) return null;
  const index = BAG_BONES.map((name) => mesh.skeleton.bones.findIndex((b) => b.name === name)).find((i) => i >= 0);
  if (index === undefined) return null;
  const bone = mesh.skeleton.bones[index]!;
  // Espace du modele (geometrie) : position de l'os au repos, taille du personnage.
  const toGeometry = mesh.bindMatrix.clone().invert();
  const restBone = mesh.skeleton.boneInverses[index]!.clone().invert();
  const spine = new THREE.Vector3().setFromMatrixPosition(restBone).applyMatrix4(toGeometry);
  mesh.geometry.computeBoundingBox();
  const height = mesh.geometry.boundingBox!.max.y - mesh.geometry.boundingBox!.min.y;
  // Sac plus gros et plus franchement pose sur le dos (2026-11-02, Heros a
  // l'echelle 1,4) : taille relative au personnage, colle a l'os du dos.
  const size = height * 0.12;
  const place = new THREE.Matrix4().makeTranslation(spine.x, spine.y + size * 0.25, spine.z - height * 0.125);
  const local = mesh.skeleton.boneInverses[index]!.clone().multiply(mesh.bindMatrix).multiply(place);
  return { bone, local, size };
}

function buildHeroBag(view: THREE.Object3D): HeroBag {
  const mount = bagMount(view);
  const size = mount?.size ?? 0.17;
  const root = new THREE.Group();
  if (mount) {
    root.matrixAutoUpdate = false;
    root.matrix.copy(mount.local);
    mount.bone.add(root);
  } else {
    root.position.set(0, 0.85, -0.25);
    view.add(root);
  }
  const sack = new THREE.Group();
  sack.scale.setScalar(size);
  const body = new THREE.Mesh(bagGeometry, material(BAG_COLOR));
  body.scale.set(1, 1.15, 0.72);
  body.castShadow = true;
  const tie = new THREE.Mesh(tieGeometry, material(BAG_TIE_COLOR));
  tie.position.y = 1.12;
  const contents = new THREE.Group();
  contents.position.y = 1.2;
  sack.add(body, tie, contents);
  root.add(sack);
  root.visible = false;
  return { root, sack, contents, base: size, key: '' };
}

/** Sac d'une unite selon son cargo economique (Entity.cargo, 2026-11-03 :
 *  bois, pierre, or extrait) ; l'inventaire RPG n'y apparait jamais. */
export function updateCarryBundle(view: THREE.Object3D, cargo: ResourceCargo | undefined): void {
  let bag = view.userData['heroBag'] as HeroBag | undefined;
  const wood = cargo?.wood ?? 0;
  const stone = (cargo?.stone ?? 0) + (cargo?.minedGold ?? 0);
  if (wood + stone === 0) {
    if (bag) bag.root.visible = false;
    return;
  }
  if (!bag) {
    bag = buildHeroBag(view);
    view.userData['heroBag'] = bag;
  }
  bag.root.visible = true;
  const key = `${Math.min(wood, 3)},${Math.min(stone, 3)}`;
  if (bag.key === key) return;
  bag.key = key;
  // Plus le sac est plein, plus il est gros (capacite 6) ; +25 % des qu'il
  // porte quelque chose (2026-11-02, demande d'Antoine : BAG_CARRY_SCALE).
  bag.sack.scale.setScalar(bag.base * BAG_CARRY_SCALE * (0.85 + 0.05 * Math.min(6, wood + stone)));
  bag.contents.clear();
  if (wood > 0) {
    const planks = buildResourcePileModel('wood', Math.min(wood, 3) + 1, 7);
    planks.scale.setScalar(1.9);
    planks.rotation.set(0.25, 0.4, Math.PI / 2.3);
    planks.position.set(-0.2, 0.2, 0);
    bag.contents.add(planks);
  }
  if (stone > 0) {
    const stones = buildResourcePileModel('stone', Math.min(stone, 3) + 1, 11);
    stones.scale.setScalar(1.6);
    stones.position.set(0.25, -0.05, 0);
    bag.contents.add(stones);
  }
}
