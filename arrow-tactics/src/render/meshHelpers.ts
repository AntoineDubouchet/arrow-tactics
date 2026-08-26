import * as THREE from 'three';

/**
 * Petits constructeurs de mesh partages par render/board.ts : une seule cache
 * de materiaux unis, une seule facon de fabriquer une boite (decor simple,
 * type buisson ou caillou) ou une boite texturee (sol), pour ne jamais
 * dupliquer cette logique. Rochers et arbres ne sont plus generes ici : ce
 * sont de vrais modeles .glb clones (voir render/assetLibrary.ts).
 */

const materials = new Map<number, THREE.Material>();

export function boardMat(color: number): THREE.Material {
  let m = materials.get(color);
  if (!m) {
    m = new THREE.MeshLambertMaterial({ color });
    materials.set(color, m);
  }
  return m;
}

export function box(w: number, h: number, d: number, color: number, x: number, y: number, z: number): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), boardMat(color));
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/** Clone une texture de grain (pierre, ecorce ; couleur ou normal map) avec
 *  un repeat cale sur la taille REELLE de ce bloc precis : chaque
 *  rocher/tronc a sa propre taille, un repeat partage figerait le grain a
 *  une echelle absolue incoherente entre un gros bloc et un petit eclat. Le
 *  clone reutilise la meme image canvas (pas de nouveau dessin), seul le
 *  wrapping change. */
export function grainTexture(base: THREE.Texture, w: number, d: number, grainScale: number): THREE.Texture {
  const t = base.clone();
  t.repeat.set(Math.max(1, w / grainScale), Math.max(1, d / grainScale));
  t.needsUpdate = true;
  return t;
}

