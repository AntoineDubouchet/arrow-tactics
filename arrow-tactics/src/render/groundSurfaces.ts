import * as THREE from 'three';
import type { TerrainType } from '../config/mapDef';
import { createDirtTexture, createGrassTexture, createPixelGrassTexture, PIXEL_GRASS_TILES } from './textures';

/**
 * SURFACES VISUELLES du sol : l'apparence du DESSUS d'une case (herbe et ses
 * variantes, terre), independante de sa FORME (relief : plat, pente, coin,
 * voir config/terrainElevation.ts) et de tout gameplay — une surface ne
 * bloque rien, ne change ni trajet, ni hauteur, ni territoire. Une meme
 * surface habille toutes les formes : ses UV sont projetees a plat (x, z
 * monde), continues d'une case a l'autre, pentes et coins compris.
 *
 * Choix automatique, deterministe : la PALETTE active (setGroundPalette)
 * decide, pour chaque case d'herbe, d'une surface d'apres un bruit de
 * valeur sur (x, z) (groundNoise) — jamais Math.random, la meme carte
 * rechargee a exactement le meme sol, rien n'est sauvegarde. Plus tard, une
 * peinture manuelle (donnee optionnelle et clairsemee dans MapDef) pourra
 * imposer une surface a une case avant ce choix automatique.
 *
 * Rendu : un materiau (donc un draw call) par surface REELLEMENT presente
 * sur la carte, jamais par case (render/terrainCells.ts).
 */
export type GroundSurfaceId = 'grass' | 'grass-light' | 'grass-dense' | 'grass-pixel-a' | 'grass-pixel-b' | 'dirt';

interface GroundSurfaceDef {
  texture: () => THREE.Texture;
  /** Multiplicateur de la texture (lineaire) : variantes claire / dense de
   *  l'herbe classique sans texture supplementaire. */
  color: readonly [number, number, number];
  /** Cases couvertes par un cycle de texture. */
  tiles: number;
}

export const GROUND_SURFACES: Readonly<Record<GroundSurfaceId, GroundSurfaceDef>> = {
  grass: { texture: createGrassTexture, color: [1, 1, 1], tiles: 1 },
  'grass-light': { texture: createGrassTexture, color: [1.1, 1.1, 0.96], tiles: 1 },
  'grass-dense': { texture: createGrassTexture, color: [0.84, 0.9, 0.86], tiles: 1 },
  'grass-pixel-a': { texture: () => createPixelGrassTexture('a'), color: [1, 1, 1], tiles: PIXEL_GRASS_TILES },
  'grass-pixel-b': { texture: () => createPixelGrassTexture('b'), color: [1, 1, 1], tiles: PIXEL_GRASS_TILES },
  dirt: { texture: createDirtTexture, color: [1, 1, 1], tiles: 1 },
};

/** Palettes de surfaces pour l'herbe. `classique` (defaut) : l'herbe d'avant,
 *  partout. `variee` : herbe classique avec des plaques claires et denses.
 *  `pixel` : herbes pixelisees A et B en plaques. */
export type GroundPalette = 'classique' | 'variee' | 'pixel';
export const GROUND_PALETTES: readonly GroundPalette[] = ['classique', 'variee', 'pixel'];

let palette: GroundPalette = 'classique';

/** Palette appliquee aux plateaux construits ensuite (main.ts : `?sol=`). */
export function setGroundPalette(next: GroundPalette): void {
  palette = next;
}

/** Surface du dessus de la case (x, z) de terrain `terrain`. */
export function groundSurfaceAt(terrain: TerrainType, x: number, z: number): GroundSurfaceId {
  if (terrain === 'dirt') return 'dirt';
  if (palette === 'classique') return 'grass';
  const n = groundNoise(x, z);
  if (palette === 'pixel') return n < 0.5 ? 'grass-pixel-a' : 'grass-pixel-b';
  return n < 0.33 ? 'grass-dense' : n > 0.67 ? 'grass-light' : 'grass';
}

/** Taille (cases) des plaques du bruit : des groupes de cases plutot qu'un
 *  damier case par case, qui ferait ressortir la grille. */
const NOISE_CELL = 4;
const NOISE_SEED = 0x5bd1e995;

function hash2(i: number, j: number): number {
  let h = Math.imul(i, 0x27d4eb2d) ^ Math.imul(j, 0x165667b1) ^ NOISE_SEED;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Bruit de valeur deterministe dans [0, 1) au centre de la case (x, z) :
 *  valeurs aleatoires (hash) aux noeuds d'une grille de NOISE_CELL cases,
 *  interpolees en douceur. */
export function groundNoise(x: number, z: number): number {
  const fx = (x + 0.5) / NOISE_CELL;
  const fz = (z + 0.5) / NOISE_CELL;
  const i = Math.floor(fx);
  const j = Math.floor(fz);
  const smooth = (t: number) => t * t * (3 - 2 * t);
  const tx = smooth(fx - i);
  const tz = smooth(fz - j);
  const a = hash2(i, j) + (hash2(i + 1, j) - hash2(i, j)) * tx;
  const b = hash2(i, j + 1) + (hash2(i + 1, j + 1) - hash2(i, j + 1)) * tx;
  return a + (b - a) * tz;
}
