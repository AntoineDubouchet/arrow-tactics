import * as THREE from 'three';
import { GROUND_TEXTURES, type GroundTextureId } from '../config/groundSurfaces';
import type { TerrainType } from '../config/mapDef';
import { createDirtTexture, createGrassTexture, loadGroundVariantTexture } from './textures';

/**
 * SURFACES VISUELLES du sol : l'apparence du DESSUS d'une case (herbe et ses
 * variantes, terre) et des FLANCS, independante de leur FORME (relief : plat,
 * pente, coin, falaise, voir config/terrainElevation.ts) et de tout gameplay —
 * une surface ne bloque rien, ne change ni trajet, ni hauteur, ni territoire,
 * et la simulation ne la lit jamais. Une meme surface habille toutes les
 * formes : ses UV sont projetees en coordonnees monde (render/terrainCells.ts),
 * continues d'une case a l'autre, pentes et coins compris.
 *
 * Une PALETTE (setGroundPalette) choisit, pour chaque case, la surface du
 * dessus selon son type de terrain et sa position — choix deterministe (bruit
 * de valeur sur x, z, groundNoise ; jamais Math.random) : la meme carte
 * rechargee a exactement le meme sol — et la surface commune des flancs.
 *
 * PRIORITE : une surface PEINTE dans la carte (MapDef.surfaceCells, outil
 * Surface de l'editeur ; identifiants, libelles et fichiers dans
 * config/groundSurfaces.ts) l'emporte toujours ; la palette (`?sol=`, debug)
 * ne decide que des cases non peintes. La peinture n'habille que le dessus :
 * les flancs gardent la surface de flanc de la palette.
 *
 * Rendu : un materiau (donc un draw call) par surface REELLEMENT presente sur
 * la carte, jamais par case.
 */

/** `grass` / `dirt` : les PNG d'origine du dessus ; `flank` : la terre
 *  d'origine assombrie des flancs ; les autres : le lot de textures
 *  (config/groundSurfaces.ts, GROUND_TEXTURES). */
export type GroundSurfaceId = 'grass' | 'dirt' | 'flank' | GroundTextureId;

interface GroundSurfaceDef {
  texture: () => THREE.Texture;
  /** Multiplicateur de la texture (lineaire). */
  color: readonly [number, number, number];
  /** Cases couvertes par un cycle de texture. */
  tiles: number;
}

export const GROUND_SURFACES: Readonly<Record<GroundSurfaceId, GroundSurfaceDef>> = {
  grass: { texture: createGrassTexture, color: [1, 1, 1], tiles: 1 },
  dirt: { texture: createDirtTexture, color: [1, 1, 1], tiles: 1 },
  // Nettement plus sombre que le dessus : une falaise se lit comme une rupture.
  flank: { texture: createDirtTexture, color: [1, 0.9, 0.8], tiles: 1 },
  ...textureSurfaces(),
};

function textureSurfaces(): Record<GroundTextureId, GroundSurfaceDef> {
  const out = {} as Record<GroundTextureId, GroundSurfaceDef>;
  for (const v of GROUND_TEXTURES) {
    const nearest = 'nearest' in v && v.nearest;
    out[v.id] = { texture: () => loadGroundVariantTexture(v.file, nearest), color: [1, 1, 1], tiles: v.tiles };
  }
  return out;
}

interface GroundPaletteDef {
  grass: (x: number, z: number) => GroundSurfaceId;
  dirt: (x: number, z: number) => GroundSurfaceId;
  flank: GroundSurfaceId;
}

/** Palettes nommees. `classique` (defaut) : le sol d'avant, a l'identique.
 *  `variee` : herbes classique, prairie et dense en plaques, quelques taches
 *  de terre. `stylisee`, `pixel` : une direction chacune. `catalogue` : les
 *  10 textures du lot en bandes de 2 cases (x), pour les comparer cote a cote.
 *  Toute texture du lot est aussi une palette a elle seule (son identifiant). */
const NAMED_PALETTES = {
  classique: { grass: () => 'grass', dirt: () => 'dirt', flank: 'flank' },
  variee: {
    grass: (x, z) => {
      if (groundNoise(x + 101, z - 37) > 0.7) return 'mixte-taches';
      const n = groundNoise(x, z);
      return n < 0.36 ? 'herbe-dense' : n > 0.64 ? 'herbe-prairie' : 'herbe-classique';
    },
    dirt: () => 'terre-battue',
    flank: 'terre-strates',
  },
  stylisee: { grass: () => 'herbe-stylisee', dirt: () => 'terre-battue', flank: 'terre-strates' },
  pixel: { grass: (x, z) => (groundNoise(x, z) < 0.5 ? 'herbe-pixel-net' : 'herbe-pixel-touffes'), dirt: () => 'terre-battue', flank: 'terre-strates' },
  catalogue: { grass: catalogueBand, dirt: catalogueBand, flank: 'terre-strates' },
} satisfies Record<string, GroundPaletteDef>;

export type GroundPalette = keyof typeof NAMED_PALETTES | GroundTextureId;

/** Noms acceptes par setGroundPalette (main.ts : `?sol=`). */
export const GROUND_PALETTES: readonly GroundPalette[] = [...(Object.keys(NAMED_PALETTES) as (keyof typeof NAMED_PALETTES)[]), ...GROUND_TEXTURES.map((v) => v.id)];

function paletteDef(name: GroundPalette): GroundPaletteDef {
  if (name in NAMED_PALETTES) return NAMED_PALETTES[name as keyof typeof NAMED_PALETTES];
  // Une seule texture partout ; flancs : elle-meme si c'est une terre.
  const variant = GROUND_TEXTURES.find((v) => v.id === name)!;
  return { grass: () => variant.id, dirt: () => variant.id, flank: variant.id.startsWith('terre-') ? variant.id : 'terre-strates' };
}

let palette: GroundPaletteDef = NAMED_PALETTES.classique;

/** Palette appliquee aux plateaux construits ensuite. */
export function setGroundPalette(next: GroundPalette): void {
  palette = paletteDef(next);
}

/** Surface du dessus de la case (x, z) de terrain `terrain` : `painted`
 *  (MapDef.surfaceCells) si la case est peinte, sinon le choix de la
 *  palette. */
export function groundSurfaceAt(terrain: TerrainType, x: number, z: number, painted?: GroundTextureId): GroundSurfaceId {
  if (painted) return painted;
  return terrain === 'dirt' ? palette.dirt(x, z) : palette.grass(x, z);
}

/** Surface commune des flancs (falaises, bord de carte, trous). */
export function groundFlankSurface(): GroundSurfaceId {
  return palette.flank;
}

/** Bandes du catalogue, dans l'ordre historique du lot (classique, prairie,
 *  dense, stylisee, pixel net, pixel touffes, battue, strates, taches,
 *  usee). */
const CATALOGUE_ORDER: readonly GroundTextureId[] = ['herbe-classique', 'herbe-prairie', 'herbe-dense', 'herbe-stylisee', 'herbe-pixel-net', 'herbe-pixel-touffes', 'terre-battue', 'terre-strates', 'mixte-taches', 'mixte-usee'];

function catalogueBand(x: number): GroundSurfaceId {
  const n = CATALOGUE_ORDER.length;
  return CATALOGUE_ORDER[((Math.floor(x / 2) % n) + n) % n]!;
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
