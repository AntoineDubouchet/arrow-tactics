import * as THREE from 'three';
import { getEquipment, RARITIES } from '../data/equipment';
import type { ItemDrop } from '../sim/systems/hero';
import { surfaceY } from './terrainSurface';
import { cataloguePieceMesh, loadToonCatalogue } from './toonCatalogue';
import { createToonUnitMaterial } from './toonUnitRig';

/**
 * Items au sol (butin, 2026-11-02) : la piece de l'item (catalogue Toon RTS,
 * couche a plat, qui tourne doucement), un anneau et une colonne de lumiere a
 * la couleur de sa rarete, visibles de loin. Rendu seulement : la simulation
 * tient World.itemDrops. Un item jamais explore n'est pas affiche.
 */
interface DropView {
  root: THREE.Group;
  holder: THREE.Group;
  ring: THREE.Mesh;
  beam: THREE.Mesh;
}

const ringGeometry = new THREE.RingGeometry(0.34, 0.44, 32);
ringGeometry.rotateX(-Math.PI / 2);
const beamGeometry = new THREE.CylinderGeometry(0.05, 0.12, 1.8, 10, 1, true);
beamGeometry.translate(0, 0.9, 0);

export class ItemDropViews {
  readonly group = new THREE.Group();
  private readonly views = new Map<number, DropView>();
  private time = 0;

  sync(drops: readonly ItemDrop[], exploredAt: (x: number, z: number) => boolean = () => true): void {
    for (const drop of drops) {
      let view = this.views.get(drop.id);
      if (drop.taken) {
        if (view) {
          this.group.remove(view.root);
          this.views.delete(drop.id);
        }
        continue;
      }
      if (!view) view = this.create(drop);
      view.root.visible = exploredAt(drop.x, drop.z);
    }
    for (const [id, view] of this.views) {
      if (drops[id]) continue;
      this.group.remove(view.root);
      this.views.delete(id);
    }
  }

  animate(realDt: number): void {
    this.time += realDt;
    for (const view of this.views.values()) {
      view.holder.rotation.y = this.time * 0.8;
      view.holder.position.y = 0.25 + 0.06 * Math.sin(this.time * 2.2);
      (view.beam.material as THREE.MeshBasicMaterial).opacity = 0.18 + 0.07 * Math.sin(this.time * 3);
    }
  }

  clear(): void {
    this.group.clear();
    this.views.clear();
  }

  private create(drop: ItemDrop): DropView {
    const def = getEquipment(drop.itemId);
    const color = new THREE.Color(RARITIES[def.rarity].color);
    const root = new THREE.Group();
    root.position.set(drop.x, surfaceY(drop.x, drop.z), drop.z);
    root.userData['itemDropId'] = drop.id;
    const ring = new THREE.Mesh(ringGeometry, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide }));
    ring.position.y = 0.03;
    const beam = new THREE.Mesh(beamGeometry, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.2, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
    const holder = new THREE.Group();
    root.add(ring, beam, holder);
    this.group.add(root);
    const view = { root, holder, ring, beam };
    this.views.set(drop.id, view);
    const visual = def.visual;
    if (visual) {
      void loadToonCatalogue(visual.source)
        .then(({ catalogue, gltf }) => {
          const source = cataloguePieceMesh(gltf, visual.piece);
          if (!source || !this.views.has(drop.id)) return;
          // Piece a sa place de liaison, recentree, couchee a plat.
          const mesh = new THREE.Mesh(source.geometry, createToonUnitMaterial(catalogue.textures, 'neutral'));
          mesh.matrixAutoUpdate = false;
          mesh.matrix.copy(source.bindMatrix);
          mesh.castShadow = true;
          const box = new THREE.Box3().setFromBufferAttribute(source.geometry.getAttribute('position') as THREE.BufferAttribute).applyMatrix4(source.bindMatrix);
          const center = box.getCenter(new THREE.Vector3());
          const size = box.getSize(new THREE.Vector3());
          const pivot = new THREE.Group();
          pivot.add(mesh);
          pivot.position.copy(center).multiplyScalar(-1);
          const flat = new THREE.Group();
          flat.add(pivot);
          flat.rotation.x = Math.PI / 2;
          flat.scale.setScalar(Math.min(1.1, 0.9 / Math.max(size.x, size.y, size.z, 1e-3)) * visual.scale);
          holder.add(flat);
        })
        .catch((error: unknown) => console.warn('Butin : visuel indisponible.', error));
    }
    return view;
  }
}
