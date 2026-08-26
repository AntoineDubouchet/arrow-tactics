import * as THREE from 'three';
import { loadVfxTexture } from '../vfxTextures';

/**
 * Petite bibliothèque VFX partagée (2026-08-16, demande d'Antoine : "je ne
 * veux plus de VFX bricolés individuellement dans main.ts... utilise des
 * abstractions raisonnables et simples") — ce fichier centralise la seule
 * vraie duplication qui existait entre `fireballView.ts`/`shadowProjectileView.ts`/
 * `iceNova.ts`/`healVfx.ts` avant cette passe : un GABARIT de matériau
 * (texture + couleur + blending + opacité) construit UNE SEULE FOIS, puis
 * CLONÉ par instance d'effet (jamais par frame) pour permettre une
 * animation indépendante (opacité/scale) sans jamais recréer de texture ni
 * recompiler un matériau.
 *
 * `blending: 'additive'` pour tout ce qui doit se lire comme de la lumière
 * (flammes, halos, flashs) — `'normal'` pour tout ce qui doit rester
 * "discret"/opaque sur un fond déjà lumineux (fumée, décalque de brûlure,
 * icônes pleines) : leçon déjà établie dans ce projet (voir healVfx.ts,
 * "un fondu additif ne peut pas rendre une teinte discrète").
 */

export type VfxBlending = 'additive' | 'normal';

export interface VfxMaterialSpec {
  /** Nom de fichier AVEC extension, dans public/textures/vfx/ (voir
   *  vfxTextures.ts) — jamais un chemin inventé. */
  texture: string;
  color: number;
  blending: VfxBlending;
  opacity: number;
}

function specKey(spec: VfxMaterialSpec): string {
  return `${spec.texture}|${spec.color}|${spec.blending}|${spec.opacity}`;
}

function toBlending(b: VfxBlending): THREE.Blending {
  return b === 'additive' ? THREE.AdditiveBlending : THREE.NormalBlending;
}

const spriteTemplates = new Map<string, THREE.SpriteMaterial>();

function getSpriteMaterialTemplate(spec: VfxMaterialSpec): THREE.SpriteMaterial {
  const k = specKey(spec);
  let mat = spriteTemplates.get(k);
  if (!mat) {
    mat = new THREE.SpriteMaterial({
      map: loadVfxTexture(spec.texture),
      color: spec.color,
      transparent: true,
      opacity: spec.opacity,
      blending: toBlending(spec.blending),
      depthWrite: false,
    });
    spriteTemplates.set(k, mat);
  }
  return mat;
}

/** Nouveau `THREE.Sprite` (toujours face caméra) prêt à l'emploi — matériau
 *  CLONÉ du gabarit partagé (jamais le gabarit lui-même), pour que cette
 *  instance puisse ensuite animer sa propre opacité/couleur sans affecter
 *  les autres sprites utilisant la même texture/teinte. À appeler à la
 *  CONSTRUCTION d'un effet (bornée par le nombre de projectiles/impacts
 *  simultanés), jamais à l'intérieur d'une boucle par frame. */
export function createVfxSprite(spec: VfxMaterialSpec): THREE.Sprite {
  return new THREE.Sprite(getSpriteMaterialTemplate(spec).clone());
}

const planeGeometry = new THREE.PlaneGeometry(1, 1);
const decalTemplates = new Map<string, THREE.MeshBasicMaterial>();

function getDecalMaterialTemplate(spec: VfxMaterialSpec): THREE.MeshBasicMaterial {
  const k = specKey(spec);
  let mat = decalTemplates.get(k);
  if (!mat) {
    mat = new THREE.MeshBasicMaterial({
      map: loadVfxTexture(spec.texture),
      color: spec.color,
      transparent: true,
      opacity: spec.opacity,
      blending: toBlending(spec.blending),
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    decalTemplates.set(k, mat);
  }
  return mat;
}

/** Décalque au sol (`PlaneGeometry` PARTAGÉE, jamais reconstruite — seul le
 *  matériau est cloné par instance) — pour les anneaux/marques de brûlure/
 *  teintes de zone posés à plat, jamais face caméra contrairement à un
 *  Sprite. Pivoté à plat (`rotation.x = -PI/2`) et mis à l'échelle par
 *  l'appelant. */
export function createVfxGroundDecal(spec: VfxMaterialSpec): THREE.Mesh {
  const mesh = new THREE.Mesh(planeGeometry, getDecalMaterialTemplate(spec).clone());
  mesh.rotation.x = -Math.PI / 2;
  return mesh;
}

const coreTemplates = new Map<number, THREE.MeshBasicMaterial>();

/** Matériau de noyau SANS texture (couleur plate) — SHARED directement,
 *  jamais cloné : dans les effets actuels du projet, un noyau ne change
 *  jamais de couleur par instance (pas de fondu/flash individuel à gérer
 *  ici, contrairement aux unités), donc le partage direct est sans risque. */
export function getVfxCoreMaterial(color: number): THREE.MeshBasicMaterial {
  let mat = coreTemplates.get(color);
  if (!mat) {
    mat = new THREE.MeshBasicMaterial({ color });
    coreTemplates.set(color, mat);
  }
  return mat;
}
