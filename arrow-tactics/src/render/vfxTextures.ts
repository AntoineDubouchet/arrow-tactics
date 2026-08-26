import * as THREE from 'three';

/**
 * Chargement/cache PARTAGE des textures VFX (Kenney "Particle Pack", CC0 —
 * voir healVfx.ts pour le detail de licence) — extrait le 2026-08-14 en
 * preparant la texturisation du Blizzard, qui reutilise certaines des memes
 * textures que le parchemin de soin (star_01/star_04). Sans cache partage,
 * deux fichiers de rendu chargeant le meme nom auraient cree deux
 * THREE.Texture (donc deux uploads GPU) distincts pour la MEME image.
 */

const TEX_DIR = '/textures/vfx';
const cache = new Map<string, THREE.Texture>();

export function loadVfxTexture(name: string): THREE.Texture {
  let texture = cache.get(name);
  if (!texture) {
    texture = new THREE.TextureLoader().load(`${TEX_DIR}/${name}`);
    texture.colorSpace = THREE.SRGBColorSpace;
    cache.set(name, texture);
  }
  return texture;
}
