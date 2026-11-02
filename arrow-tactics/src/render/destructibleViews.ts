import * as THREE from 'three';
import type { Entity } from '../sim/entity';
import { cloneScaledTo, type EnvironmentAssets } from './assetLibrary';
import { surfaceY } from './terrainSurface';

/**
 * Objets neutres destructibles (2026-11-02 : barils), rendu : modele du
 * decor (KayKit `barrel`), petit tremblement a chaque coup recu, eclats de
 * bois a la destruction puis disparition. Rendu seulement (Entity.destructible
 * dans la simulation). Brouillard : visible une fois sa case exploree, comme
 * le decor. Hasard purement cosmetique (Math.random permis cote rendu).
 */
interface DestructibleView {
  root: THREE.Group;
  model: THREE.Object3D;
  shake: number;
}

interface Debris {
  mesh: THREE.Mesh;
  vx: number;
  vy: number;
  vz: number;
  spin: number;
  life: number;
}

const SHAKE_SECONDS = 0.3;
const DEBRIS_SECONDS = 0.9;
const debrisGeometry = new THREE.BoxGeometry(0.22, 0.05, 0.08);
const debrisMaterial = new THREE.MeshStandardMaterial({ color: 0x8a5a2b, roughness: 0.9, flatShading: true });
const fallbackGeometry = new THREE.CylinderGeometry(0.28, 0.3, 0.62, 10);
fallbackGeometry.translate(0, 0.31, 0);

export class DestructibleViews {
  readonly group = new THREE.Group();
  private readonly views = new Map<number, DestructibleView>();
  private readonly debris: Debris[] = [];
  private time = 0;

  constructor(private readonly assets: () => EnvironmentAssets | null) {}

  /** Objets vivants affiches (une fois explores) ; un objet detruit
   *  disparait en eclats (s'il etait affiche). */
  sync(entities: readonly Entity[], exploredAt: (x: number, z: number) => boolean = () => true): void {
    for (const e of entities) {
      if (e.destructible === null) continue;
      let view = this.views.get(e.id);
      if (!e.alive) {
        if (view) {
          if (view.root.visible) this.burst(view.root.position);
          this.group.remove(view.root);
          this.views.delete(e.id);
        }
        continue;
      }
      if (!view) view = this.create(e);
      view.root.visible = exploredAt(e.x, e.z);
    }
  }

  /** Un coup recu : bref tremblement. */
  hit(entityId: number): void {
    const view = this.views.get(entityId);
    if (view) view.shake = SHAKE_SECONDS;
  }

  animate(realDt: number): void {
    this.time += realDt;
    for (const view of this.views.values()) {
      if (view.shake <= 0) continue;
      view.shake = Math.max(0, view.shake - realDt);
      const k = view.shake / SHAKE_SECONDS;
      view.model.position.x = Math.sin(this.time * 70) * 0.06 * k;
      view.model.rotation.z = Math.sin(this.time * 55) * 0.12 * k;
    }
    for (let i = this.debris.length - 1; i >= 0; i--) {
      const d = this.debris[i]!;
      d.life -= realDt;
      d.vy -= 9 * realDt;
      d.mesh.position.x += d.vx * realDt;
      d.mesh.position.y = Math.max(d.mesh.position.y + d.vy * realDt, 0.03);
      d.mesh.position.z += d.vz * realDt;
      d.mesh.rotation.x += d.spin * realDt;
      (d.mesh.material as THREE.MeshStandardMaterial).opacity = Math.min(1, d.life / 0.3);
      if (d.life <= 0) {
        this.group.remove(d.mesh);
        (d.mesh.material as THREE.Material).dispose();
        this.debris.splice(i, 1);
      }
    }
  }

  clear(): void {
    this.group.clear();
    this.views.clear();
    this.debris.length = 0;
  }

  private create(e: Entity): DestructibleView {
    const root = new THREE.Group();
    root.position.set(e.x, surfaceY(e.x, e.z), e.z);
    root.userData['destructibleId'] = e.id;
    const prototype = this.assets()?.propsByName['kaykit_barrel'];
    const model: THREE.Object3D = prototype ? cloneScaledTo(prototype, 0.62, 'width') : new THREE.Mesh(fallbackGeometry, debrisMaterial);
    model.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) o.castShadow = true;
    });
    root.add(model);
    this.group.add(root);
    const view = { root, model, shake: 0 };
    this.views.set(e.id, view);
    return view;
  }

  private burst(at: THREE.Vector3): void {
    for (let i = 0; i < 7; i++) {
      const mesh = new THREE.Mesh(debrisGeometry, debrisMaterial.clone());
      (mesh.material as THREE.MeshStandardMaterial).transparent = true;
      mesh.position.set(at.x, at.y + 0.3, at.z);
      const a = (i / 7) * Math.PI * 2 + Math.random() * 0.6;
      const speed = 1.2 + Math.random() * 1.2;
      this.group.add(mesh);
      this.debris.push({ mesh, vx: Math.cos(a) * speed, vy: 2.2 + Math.random() * 1.5, vz: Math.sin(a) * speed, spin: (Math.random() - 0.5) * 14, life: DEBRIS_SECONDS });
    }
  }
}
