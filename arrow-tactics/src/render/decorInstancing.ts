import * as THREE from 'three';

/**
 * Decors INSTANCIES (2026-11-01, KI-34) : sur une grande carte, chaque arbre,
 * rocher ou petit decor etait un clone de modele, soit des milliers d'appels
 * de dessin. Les clones d'un meme modele partagent geometrie et materiau :
 * ils deviennent des InstancedMesh, un par (geometrie, materiau, morceau de
 * CHUNK cases), avec frustum culling par morceau. Rendu seulement.
 *
 * Brouillard : une instance reste invisible (matrice nulle) tant que la case
 * de son decor n'a pas ete exploree (`reveal`) — plus de silhouettes noires
 * de decors jamais vus (KI-35). Un decor peut aussi etre retire plus tard
 * (`hide`), sans reconstruire le morceau.
 */
const CHUNK = 32;
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

interface Slot {
  mesh: THREE.InstancedMesh;
  index: number;
  matrix: THREE.Matrix4;
}

interface DecorEntry {
  x: number;
  z: number;
  slots: Slot[];
  /** Objets non instancies (Sprite, maillage skinne...) : visibles avec le decor. */
  objects: THREE.Object3D[];
  revealed: boolean;
  removed: boolean;
}

export class InstancedDecor {
  readonly group = new THREE.Group();
  private readonly entries: DecorEntry[] = [];
  private readonly dirty = new Set<THREE.InstancedMesh>();
  /** Nombre de maillages sources et d'InstancedMesh produits (mesures). */
  readonly stats = { sourceMeshes: 0, instancedMeshes: 0 };

  /** `source` : groupe dont chaque enfant est UN decor pose (position x/z =
   *  sa case). Vide `source` : ses decors passent dans `group`. */
  constructor(source: THREE.Group, hiddenUntilRevealed: boolean) {
    source.updateMatrixWorld(true);
    const inverseRoot = source.matrixWorld.clone().invert();
    const buckets = new Map<string, { geometry: THREE.BufferGeometry; material: THREE.Material | THREE.Material[]; castShadow: boolean; receiveShadow: boolean; items: { entry: DecorEntry; matrix: THREE.Matrix4 }[] }>();
    for (const decor of [...source.children]) {
      const entry: DecorEntry = { x: decor.position.x, z: decor.position.z, slots: [], objects: [], revealed: !hiddenUntilRevealed, removed: false };
      const chunk = `${Math.floor(entry.x / CHUNK)},${Math.floor(entry.z / CHUNK)}`;
      decor.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (!mesh.isMesh) return;
        this.stats.sourceMeshes++;
        if ((mesh as THREE.SkinnedMesh).isSkinnedMesh || (mesh as THREE.InstancedMesh).isInstancedMesh) {
          entry.objects.push(decor);
          return;
        }
        const materialKey = Array.isArray(mesh.material) ? mesh.material.map((m) => m.uuid).join('+') : mesh.material.uuid;
        const key = `${mesh.geometry.uuid}|${materialKey}|${mesh.castShadow}|${mesh.receiveShadow}|${chunk}`;
        let bucket = buckets.get(key);
        if (!bucket) {
          bucket = { geometry: mesh.geometry, material: mesh.material, castShadow: mesh.castShadow, receiveShadow: mesh.receiveShadow, items: [] };
          buckets.set(key, bucket);
        }
        bucket.items.push({ entry, matrix: inverseRoot.clone().multiply(mesh.matrixWorld) });
      });
      // Decor sans maillage instanciable : garde tel quel.
      if (entry.objects.length > 0) {
        source.remove(decor);
        this.group.add(decor);
        decor.visible = entry.revealed;
      }
      this.entries.push(entry);
    }
    for (const bucket of buckets.values()) {
      const mesh = new THREE.InstancedMesh(bucket.geometry, bucket.material, bucket.items.length);
      mesh.castShadow = bucket.castShadow;
      mesh.receiveShadow = bucket.receiveShadow;
      bucket.items.forEach((item, index) => {
        mesh.setMatrixAt(index, item.entry.revealed ? item.matrix : ZERO);
        item.entry.slots.push({ mesh, index, matrix: item.matrix });
      });
      mesh.instanceMatrix.needsUpdate = true;
      // Boite de tout le morceau (instances masquees comprises) : culling stable.
      bucket.items.forEach((item, index) => mesh.setMatrixAt(index, item.matrix));
      mesh.computeBoundingSphere();
      mesh.computeBoundingBox();
      bucket.items.forEach((item, index) => mesh.setMatrixAt(index, item.entry.revealed ? item.matrix : ZERO));
      this.group.add(mesh);
      this.stats.instancedMeshes++;
    }
    source.clear();
  }

  /** Decors des cases nouvellement explorees rendus visibles (exploration
   *  croissante : un decor revele le reste). */
  reveal(isExplored: (x: number, z: number) => boolean): void {
    for (const entry of this.entries) {
      if (entry.revealed || entry.removed || !isExplored(entry.x, entry.z)) continue;
      entry.revealed = true;
      for (const slot of entry.slots) {
        slot.mesh.setMatrixAt(slot.index, slot.matrix);
        this.dirty.add(slot.mesh);
      }
      for (const obj of entry.objects) obj.visible = true;
    }
    this.flush();
  }

  /** Retire le decor le plus proche de (x, z) a moins de `radius` cases
   *  (ressource epuisee, edition locale). Vrai si un decor a ete retire. */
  hide(x: number, z: number, radius = 0.6): boolean {
    let best: DecorEntry | null = null;
    let bestD = radius;
    for (const entry of this.entries) {
      const d = Math.hypot(entry.x - x, entry.z - z);
      if (!entry.removed && d <= bestD) {
        best = entry;
        bestD = d;
      }
    }
    if (!best) return false;
    best.removed = true;
    for (const slot of best.slots) {
      slot.mesh.setMatrixAt(slot.index, ZERO);
      this.dirty.add(slot.mesh);
    }
    for (const obj of best.objects) obj.visible = false;
    this.flush();
    return true;
  }

  private flush(): void {
    for (const mesh of this.dirty) mesh.instanceMatrix.needsUpdate = true;
    this.dirty.clear();
  }
}
