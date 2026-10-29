import * as THREE from 'three';

/**
 * Textures du sol (herbe du dessus, terre des strates sous la surface) —
 * de vraies images PNG fournies par Antoine (2026-08-14 :
 * "C:\...\texturesol, deux textures à utiliser pour remplacer l'herbe et la
 * terre sous le plateau"), remplacent les anciennes textures generees par
 * canvas (bruit procedural : traits verts aleatoires, speckles bruns —
 * jugees stylisees plutot que photo, voir l'historique dans CLAUDE.md,
 * "Objectif de style pour ces textures"). Meme statut d'exception que les
 * rochers/arbres/props/baliste/fond de ciel/VFX deja documentes dans
 * CLAUDE.md (Stack) — la regle "aucun asset graphique" ne s'appliquait de
 * toute facon deja plus a ces elements-la.
 *
 * Une SEULE instance par texture, chargee au premier appel puis partagee
 * par tous les plateaux (jeu, editeur, test) — jamais un clone : cloner une
 * THREE.Texture chargee par reseau AVANT la fin de son chargement ne
 * propage pas l'image une fois arrivee (piege connu de Three.js). Partager
 * la meme instance n'a pas ce probleme : l'image arrivee profite a tous les
 * materiaux. Un nouveau chargement a chaque appel rendait le sol NOIR le
 * temps du decodage de l'image (flash a chaque ajout/suppression de case
 * dans l'editeur, qui reconstruit le terrain). Ne jamais liberer ces
 * textures (dispose) : elles sont partagees.
 */

const TEX_DIR = '/textures/ground';

const groundTextures = new Map<string, THREE.Texture>();

function loadGroundTexture(name: string): THREE.Texture {
  const cached = groundTextures.get(name);
  if (cached) return cached;
  const texture = new THREE.TextureLoader().load(groundTextureUrl(name));
  groundTextures.set(name, texture);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** URL publique d'un PNG du sol (vignettes de l'editeur), `variants/…` pour
 *  le lot de textures. */
export function groundTextureUrl(name: string): string {
  return `${TEX_DIR}/${name}`;
}

export function createGrassTexture(): THREE.Texture {
  return loadGroundTexture('ground_grass.png');
}

export function createDirtTexture(): THREE.Texture {
  return loadGroundTexture('ground_dirt.png');
}

/**
 * Texture du lot exploratoire (public/textures/ground/variants/, generee par
 * tools/ground-textures/generate.mjs), meme cache partage que les PNG
 * d'origine. `nearest` : textures pixelisees, agrandies au plus proche
 * (pixels nets) ; mipmaps seulement quand une case fait moins de pixels a
 * l'ecran que la texture n'a de texels, contre le scintillement.
 */
export function loadGroundVariantTexture(file: string, nearest = false): THREE.Texture {
  const texture = loadGroundTexture(`variants/${file}`);
  if (nearest) texture.magFilter = THREE.NearestFilter;
  return texture;
}
