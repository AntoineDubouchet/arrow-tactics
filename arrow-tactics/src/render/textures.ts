import * as THREE from 'three';
import { Rng } from '../core/rng';

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
  const texture = new THREE.TextureLoader().load(`${TEX_DIR}/${name}`);
  groundTextures.set(name, texture);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function createGrassTexture(): THREE.Texture {
  return loadGroundTexture('ground_grass.png');
}

export function createDirtTexture(): THREE.Texture {
  return loadGroundTexture('ground_dirt.png');
}

/** Cote (texels) des textures d'herbe pixelisees : un cycle couvre 2 × 2
 *  cases (PIXEL_GRASS_TILES), soit 16 texels par case. */
const PIXEL_GRASS_SIZE = 32;
export const PIXEL_GRASS_TILES = 2;

/** Teintes des herbes pixelisees (sRGB), centrees sur la couleur moyenne de
 *  ground_grass.png (67, 115, 52) : meme ton general que l'herbe classique,
 *  ecarts faibles (motif discret). Du plus sombre au plus clair. */
const PIXEL_GRASS_SHADES: readonly (readonly [number, number, number])[] = [
  [57, 100, 44],
  [62, 108, 48],
  [68, 117, 52],
  [74, 125, 55],
  [81, 134, 59],
];

const pixelGrassTextures = new Map<'a' | 'b', THREE.Texture>();

/**
 * Herbe pixelisee (variante A : plaques de blocs 2 × 2 texels ; B : aplat a
 * grandes plaques et petites touffes), generee une fois a partir d'une
 * graine FIXE (Rng, jamais Math.random) : la meme a chaque chargement.
 * Periodique (bruit de valeur sur une grille qui boucle), donc sans couture
 * entre deux cycles. Agrandissement en NearestFilter (pixels nets) ;
 * mipmaps seulement quand une case fait moins de 16 pixels a l'ecran, pour
 * eviter le scintillement. Partagee, jamais liberee (comme les PNG).
 */
export function createPixelGrassTexture(variant: 'a' | 'b'): THREE.Texture {
  const cached = pixelGrassTextures.get(variant);
  if (cached) return cached;
  const size = PIXEL_GRASS_SIZE;
  const rng = new Rng(variant === 'a' ? 0x2545f491 : 0x9e3779b9);
  const shade = new Uint8Array(size * size);
  // Bruit de valeur periodique : `cells` × `cells` valeurs aleatoires,
  // interpolees en douceur, la grille boucle sur elle-meme.
  const valueNoise = (cells: number): ((x: number, y: number) => number) => {
    const lattice = Array.from({ length: cells * cells }, () => rng.next());
    const at = (i: number, j: number) => lattice[((j + cells) % cells) * cells + ((i + cells) % cells)]!;
    const smooth = (t: number) => t * t * (3 - 2 * t);
    return (x, y) => {
      const fx = (x / size) * cells;
      const fy = (y / size) * cells;
      const i = Math.floor(fx);
      const j = Math.floor(fy);
      const tx = smooth(fx - i);
      const ty = smooth(fy - j);
      const top = at(i, j) + (at(i + 1, j) - at(i, j)) * tx;
      const bottom = at(i, j + 1) + (at(i + 1, j + 1) - at(i, j + 1)) * tx;
      return top + (bottom - top) * ty;
    };
  };
  if (variant === 'a') {
    // Plaques de petits blocs : bruit a l'echelle d'un bloc 2 × 2, plus un
    // leger alea par bloc, quantifie sur les cinq teintes.
    const noise = valueNoise(4);
    const blocks = size / 2;
    const jitter = Array.from({ length: blocks * blocks }, () => rng.next() - 0.5);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const b = Math.floor(y / 2) * blocks + Math.floor(x / 2);
        const v = noise(Math.floor(x / 2) * 2 + 1, Math.floor(y / 2) * 2 + 1) + jitter[b]! * 0.35;
        shade[y * size + x] = v < 0.22 ? 0 : v < 0.4 ? 1 : v < 0.62 ? 2 : v < 0.8 ? 3 : 4;
      }
    }
  } else {
    // Aplat a grandes plaques (trois teintes centrales), puis touffes : un
    // brin clair au-dessus d'un pixel d'ombre.
    const noise = valueNoise(2);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const v = noise(x, y);
        shade[y * size + x] = v < 0.38 ? 1 : v < 0.66 ? 2 : 3;
      }
    }
    const put = (x: number, y: number, s: number) => { shade[((y + size) % size) * size + ((x + size) % size)] = s; };
    for (let k = 0; k < 14; k++) {
      const x = Math.floor(rng.next() * size);
      const y = Math.floor(rng.next() * size);
      put(x, y, 1);
      put(x, y + 1, 4);
      if (rng.next() < 0.5) put(x + 1, y + 1, 3);
    }
  }
  const data = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    const [r, g, b] = PIXEL_GRASS_SHADES[shade[i]!]!;
    data.set([r, g, b, 255], i * 4);
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  pixelGrassTextures.set(variant, texture);
  return texture;
}
