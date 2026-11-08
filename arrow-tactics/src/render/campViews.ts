import * as THREE from 'three';
import type { Chest } from '../sim/systems/camps';
import { surfaceY } from './terrainSurface';
import { applyContactShading } from './contactMap';
import type { MistLightSource } from './groundMist';

/**
 * Camps neutres, rendu (2026-11-02) : flammes et petite lumiere du feu de
 * camp, coffres. Le decor fixe (pierres du feu, tente, banniere, caisses) est
 * fait de props de la carte (MapDef.obstacles), traversables. Rendu seulement :
 * la simulation tient World.camps / World.chests.
 *
 * Brouillard : un camp jamais explore n'affiche ni flammes ni coffre et sa
 * lumiere reste eteinte (sa lueur trahirait le camp a travers le noir) ; une
 * fois explore, il reste memorise comme le terrain.
 *
 * Coffre : bois et ferrures low-poly ; verrouille (camp defendu) ferme et
 * terne ; ouvrable (camp nettoye) anneau dore qui pulse ; ouvert, couvercle
 * releve. Une seule lumiere ponctuelle par camp (intensite nulle tant qu'il
 * n'est pas decouvert : pas de recompilation des materiaux a la decouverte).
 */
interface FireView {
  root: THREE.Group;
  flames: THREE.Mesh[];
  light: THREE.PointLight;
  lightHolder: THREE.Group;
  x: number;
  z: number;
}

interface ChestView {
  root: THREE.Group;
  lid: THREE.Group;
  ring: THREE.Mesh;
  /** Ouverture du couvercle (0..1), animee. */
  open: number;
  state: 'locked' | 'ready' | 'opened';
}

/** Lumiere du feu de camp : valeurs du 2026-11-02, inchangees par le Graphic Lab 2026-11-07 (le
 *  reglage `lights` du lab, intensite 12 / portee 9 / decroissance 2 / 0xffa040, n'a ete ni retenu
 *  ni ecarte : DESIGN_DECISIONS.md A5, ROADMAP.md §7). */
const FIRE_LIGHT_INTENSITY = 7;
const FIRE_LIGHT_DISTANCE = 7;
const FIRE_LIGHT_DECAY = 1.6;
const FIRE_LIGHT_COLOR = 0xff8a3d;
/** Rayon (monde) de la brume eclairee par un feu (render/groundMist.ts, setMistLights). */
const FIRE_MIST_RADIUS = 6;

const woodMaterial = new THREE.MeshStandardMaterial({ color: 0x7a4a26, roughness: 0.85, flatShading: true });
const ironMaterial = new THREE.MeshStandardMaterial({ color: 0x3a3a42, roughness: 0.5, metalness: 0.4, flatShading: true });
const goldMaterial = new THREE.MeshStandardMaterial({ color: 0xd9b24a, roughness: 0.4, metalness: 0.6, emissive: 0x3a2a05, flatShading: true });
const innerMaterial = new THREE.MeshStandardMaterial({ color: 0x1c120a, roughness: 1 });
// Ombre de contact et voile de brume (render/contactMap.ts) : coffres ancres et voiles comme le decor.
for (const m of [woodMaterial, ironMaterial, goldMaterial, innerMaterial]) applyContactShading(m);
const flameGeometry = new THREE.ConeGeometry(0.16, 0.55, 7, 1, true);
flameGeometry.translate(0, 0.27, 0);
const ringGeometry = new THREE.RingGeometry(0.55, 0.68, 32);
ringGeometry.rotateX(-Math.PI / 2);

export class CampViews {
  readonly group = new THREE.Group();
  private fires: FireView[] = [];
  private readonly chests = new Map<number, ChestView>();
  private time = 0;

  /** Feux des camps de la carte (centres). A appeler a chaque nouvelle carte. */
  setCamps(camps: readonly { x: number; z: number }[]): void {
    for (const fire of this.fires) this.group.remove(fire.root, fire.lightHolder);
    this.fires = camps.map((c) => this.createFire(c.x, c.z));
  }

  /** Etat des coffres et visibilite (brouillard) ; `locked` : camp defendu. */
  sync(chests: readonly Chest[], locked: (chest: Chest) => boolean, exploredAt: (x: number, z: number) => boolean = () => true): void {
    for (const fire of this.fires) {
      const seen = exploredAt(fire.x, fire.z);
      fire.root.visible = seen;
      fire.light.userData['on'] = seen;
    }
    for (const chest of chests) {
      const view = this.chests.get(chest.id) ?? this.createChest(chest);
      view.root.visible = exploredAt(chest.x, chest.z);
      view.state = chest.opened ? 'opened' : locked(chest) ? 'locked' : 'ready';
      view.ring.visible = view.state === 'ready';
    }
    for (const [id, view] of this.chests) {
      if (chests[id]) continue;
      this.group.remove(view.root);
      this.chests.delete(id);
    }
  }

  animate(realDt: number): void {
    this.time += realDt;
    for (const fire of this.fires) {
      // Scintillement cosmetique (Math.random permis cote rendu).
      fire.flames.forEach((flame, i) => {
        const s = 0.85 + 0.2 * Math.sin(this.time * (9 + i * 2.3) + i) + Math.random() * 0.08;
        flame.scale.set(1, s, 1);
        flame.rotation.y += realDt * (0.6 + i * 0.3);
      });
      fire.light.intensity = fire.light.userData['on'] ? FIRE_LIGHT_INTENSITY * (0.85 + 0.12 * Math.sin(this.time * 11) + Math.random() * 0.06) : 0;
    }
    for (const view of this.chests.values()) {
      const target = view.state === 'opened' ? 1 : 0;
      view.open += Math.sign(target - view.open) * Math.min(Math.abs(target - view.open), realDt * 2.5);
      view.lid.rotation.x = -1.9 * view.open;
      if (view.ring.visible) {
        const pulse = 0.5 + 0.5 * Math.sin(this.time * 4);
        (view.ring.material as THREE.MeshBasicMaterial).opacity = 0.35 + 0.5 * pulse;
        view.ring.scale.setScalar(1 + 0.12 * pulse);
      }
    }
  }

  /** Feux comme sources pour la brume (render/groundMist.ts, setMistLights) : niveau = intensite
   *  du moment rapportee au maximum (0 si le camp n'est pas explore). */
  fireLights(): MistLightSource[] {
    return this.fires.map((fire) => ({ x: fire.x, y: fire.root.position.y + 0.5, z: fire.z, radius: FIRE_MIST_RADIUS, color: fire.light.color, level: fire.light.intensity / FIRE_LIGHT_INTENSITY }));
  }

  clear(): void {
    this.group.clear();
    this.fires = [];
    this.chests.clear();
  }

  private createFire(x: number, z: number): FireView {
    const root = new THREE.Group();
    root.position.set(x, surfaceY(x, z), z);
    const flames = [0xff5a1a, 0xff9a2e, 0xffd25a].map((color, i) => {
      const flame = new THREE.Mesh(flameGeometry, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.75 - i * 0.12, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
      flame.position.set(Math.cos(i * 2.1) * 0.07, 0.08, Math.sin(i * 2.1) * 0.07);
      flame.scale.setScalar(1 - i * 0.22);
      root.add(flame);
      return flame;
    });
    const light = new THREE.PointLight(FIRE_LIGHT_COLOR, 0, FIRE_LIGHT_DISTANCE, FIRE_LIGHT_DECAY);
    light.position.y = 0.7;
    light.castShadow = false;
    // La lumiere reste dans la scene meme cachee (intensite nulle) : son
    // groupe ne doit jamais etre masque, sinon les materiaux recompilent.
    const lightHolder = new THREE.Group();
    lightHolder.position.copy(root.position);
    lightHolder.add(light);
    this.group.add(root, lightHolder);
    return { root, flames, light, lightHolder, x, z };
  }

  private createChest(chest: Chest): ChestView {
    const root = new THREE.Group();
    root.position.set(chest.x, surfaceY(chest.x, chest.z), chest.z);
    root.rotation.y = chest.rotationY;
    root.userData['chestId'] = chest.id;
    const W = 0.66, D = 0.44, H = 0.34, LID = 0.14;
    const box = (w: number, h: number, d: number, material: THREE.Material, x: number, y: number, z: number) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      return mesh;
    };
    root.add(box(W, H, D, woodMaterial, 0, H / 2, 0));
    root.add(box(W * 0.94, 0.02, D * 0.9, innerMaterial, 0, H + 0.001, 0));
    for (const x of [-W * 0.32, W * 0.32]) root.add(box(0.06, H + 0.01, D + 0.02, ironMaterial, x, H / 2, 0));
    // Couvercle articule sur l'arete arriere (-z local), serrure devant (+z).
    const lid = new THREE.Group();
    lid.position.set(0, H, -D / 2);
    const lidBox = box(W + 0.02, LID, D + 0.02, woodMaterial, 0, LID / 2, D / 2);
    lid.add(lidBox);
    for (const x of [-W * 0.32, W * 0.32]) lid.add(box(0.065, LID + 0.012, D + 0.035, ironMaterial, x, LID / 2, D / 2));
    lid.add(box(0.12, 0.13, 0.04, goldMaterial, 0, 0.0, D + 0.02));
    root.add(lid);
    const ring = new THREE.Mesh(ringGeometry, new THREE.MeshBasicMaterial({ color: 0xffd25a, transparent: true, opacity: 0.6, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
    ring.position.y = 0.03;
    root.add(ring);
    this.group.add(root);
    const view: ChestView = { root, lid, ring, open: chest.opened ? 1 : 0, state: 'locked' };
    this.chests.set(chest.id, view);
    return view;
  }
}
