import * as THREE from 'three';
import type { Entity } from '../sim/entity';
import { surfaceY } from './terrainSurface';

/**
 * Points de ralliement des batiments producteurs (2026-11-02), rendu : petit
 * drapeau au sol ; batiment selectionne : marqueur net et ligne pointillee
 * depuis le batiment ; sinon marqueur tres discret. Rendu seulement
 * (Entity.rally dans la simulation). Aucune recherche : un marqueur par
 * batiment qui a un point, mis a jour a chaque image.
 */
interface Marker {
  root: THREE.Group;
  ring: THREE.Mesh;
  flag: THREE.Mesh;
  line: THREE.Line;
}

const ringGeometry = new THREE.RingGeometry(0.22, 0.32, 24);
ringGeometry.rotateX(-Math.PI / 2);
const poleGeometry = new THREE.CylinderGeometry(0.025, 0.025, 0.8, 6);
poleGeometry.translate(0, 0.4, 0);
const flagGeometry = new THREE.PlaneGeometry(0.32, 0.2);
flagGeometry.translate(0.16, 0.68, 0);

export class RallyMarkers {
  readonly group = new THREE.Group();
  private readonly markers = new Map<number, Marker>();

  sync(entities: readonly Entity[], selectedIds: ReadonlySet<number>, visible: boolean): void {
    this.group.visible = visible;
    const seen = new Set<number>();
    for (const b of entities) {
      if (!b.alive || !b.isBuilding || b.team !== 'player' || !b.rally) continue;
      seen.add(b.id);
      const m = this.markers.get(b.id) ?? this.create(b.id);
      const y = surfaceY(b.rally.x, b.rally.z);
      m.root.position.set(b.rally.x, y, b.rally.z);
      const selected = selectedIds.has(b.id);
      (m.ring.material as THREE.MeshBasicMaterial).opacity = selected ? 0.85 : 0.25;
      (m.flag.material as THREE.MeshBasicMaterial).opacity = selected ? 0.95 : 0.3;
      m.line.visible = selected;
      if (selected) {
        const pos = m.line.geometry.getAttribute('position') as THREE.BufferAttribute;
        pos.setXYZ(0, b.x - b.rally.x, surfaceY(b.x, b.z) - y + 0.15, b.z - b.rally.z);
        pos.setXYZ(1, 0, 0.15, 0);
        pos.needsUpdate = true;
        m.line.computeLineDistances();
      }
    }
    for (const [id, m] of this.markers) {
      if (seen.has(id)) continue;
      this.group.remove(m.root);
      this.markers.delete(id);
    }
  }

  private create(id: number): Marker {
    const root = new THREE.Group();
    const ring = new THREE.Mesh(ringGeometry, new THREE.MeshBasicMaterial({ color: 0x8fd3ff, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
    ring.position.y = 0.03;
    const pole = new THREE.Mesh(poleGeometry, new THREE.MeshBasicMaterial({ color: 0xd8d8d8, transparent: true, opacity: 0.6 }));
    const flag = new THREE.Mesh(flagGeometry, new THREE.MeshBasicMaterial({ color: 0x4f8dff, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
    const lineGeometry = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const line = new THREE.Line(lineGeometry, new THREE.LineDashedMaterial({ color: 0x8fd3ff, dashSize: 0.3, gapSize: 0.2, transparent: true, opacity: 0.8 }));
    root.add(ring, pole, flag, line);
    this.group.add(root);
    const marker = { root, ring, flag, line };
    this.markers.set(id, marker);
    return marker;
  }
}
