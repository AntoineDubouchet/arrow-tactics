import { MEADOW_ATMOSPHERE, type AtmosphereSettings } from './look';

/**
 * PRESETS VISUELS (Graphic Lab V2, 2026-11-06, CLOS). DECIDE (Antoine) : `atmospheric` est le rendu
 * OFFICIEL d'Arrow Tactics, sans parametre d'URL ; `?visualPreset=clear` et `?visualPreset=moody`
 * (main.ts) restent des variantes de developpement et de comparaison, jamais le rendu officiel
 * (`moody` pourrait servir plus tard de base a un biome, un evenement ou une variante de carte ;
 * aucune mecanique n'en depend). Un preset ne regle que des PARAMETRES de rendu : couleurs et
 * intensites des trois lumieres de la scene (render/renderer.ts), brume atmospherique et fond
 * (render/look.ts), multiplicateurs de teinte du sol (render/groundLook.ts) et des touffes
 * (render/grassTufts.ts). Rien d'autre ne change : geometrie, densite des touffes, camera, brouillard
 * de guerre, interface, materiaux des batiments (reflet corrige dans render/assetLibrary.ts).
 * Purement visuel, jamais enregistre. L'editeur garde les lumieres d'`atmospheric` (main.ts).
 *
 * - `clear` (CLEAR FANTASY) : lisible, colore, lumineux ; brume presque imperceptible, fond clair.
 * - `atmospheric` (OFFICIEL) : le rendu `meadow` du 2026-11-06 (lumieres de `?look=stylized`,
 *   brume MEADOW_ATMOSPHERE volontairement subtile, teintes neutres).
 * - `moody` (MOODY SURVIVAL) : plus sombre, plus froid, moins sature ; brume plus presente ;
 *   soleil un peu moins fort et ambiance plus faible (ombres plus marquees, sans toucher aux
 *   shadow maps) ; fond sombre et froid.
 *
 * Les intensites sont celles d'avant Renderer.LIGHT_LEVEL (comme render/look.ts).
 */
export type VisualPreset = 'clear' | 'atmospheric' | 'moody';
export const VISUAL_PRESETS: readonly VisualPreset[] = ['clear', 'atmospheric', 'moody'];

type Rgb = readonly [number, number, number];

export interface VisualPresetSettings {
  /** Lumiere d'ambiance : ciel, sol, intensite. */
  hemisphere: { sky: number; ground: number; intensity: number };
  /** Soleil (ombres) et remplissage (sans ombre). */
  sun: { color: number; intensity: number };
  fill: { color: number; intensity: number };
  /** Brume et fond (fond : la couleur de la brume si absent). `?atmosphere=clear` la retire. */
  atmosphere: AtmosphereSettings;
  /** Multiplicateurs (lineaires) : toutes les surfaces du sol, l'herbe en plus, les touffes. */
  groundTint: Rgb;
  grassTint: Rgb;
  tuftTint: Rgb;
}

export const VISUAL_PRESET_SETTINGS: Readonly<Record<VisualPreset, VisualPresetSettings>> = {
  // Plus lumineux (ambiance 0,6 -> 0,7, soleil 2,1 -> 2,3, remplissage 0,45 -> 0,5), sol et touffes
  // un peu plus clairs et un peu plus satures ; brume gris-vert claire, environ 9 % en haut de
  // l'ecran a zoom 28, nulle jusqu'au mur du fond du camp ; fond clair et neutre.
  clear: {
    hemisphere: { sky: 0xc4d8ff, ground: 0x55603a, intensity: 0.7 },
    sun: { color: 0xfff4de, intensity: 2.3 },
    fill: { color: 0xbcd4ff, intensity: 0.5 },
    atmosphere: { color: 0xb6c4ba, near: 14, far: 96, background: 0xaebcb2 },
    groundTint: [1.06, 1.05, 1.0],
    grassTint: [1.08, 1.06, 0.97],
    tuftTint: [1.1, 1.08, 0.98],
  },
  // Rendu OFFICIEL : lumieres du constructeur de Renderer et de `stylized`, brume de `meadow`.
  atmospheric: {
    hemisphere: { sky: 0xbcd4ff, ground: 0x4a5236, intensity: 0.6 },
    sun: { color: 0xfff2d6, intensity: 2.1 },
    fill: { color: 0xbcd4ff, intensity: 0.45 },
    atmosphere: MEADOW_ATMOSPHERE,
    groundTint: [1, 1, 1],
    grassTint: [1, 1, 1],
    tuftTint: [1, 1, 1],
  },
  // Ambiance plus froide et plus faible (0,5), soleil moins chaud et moins fort (1,8),
  // remplissage 0,36 : faces a l'ombre plus sombres, jamais noires. Sol et touffes plus sombres,
  // plus froids, moins satures. Brume gris-bleu sombre, environ 11 % au mur du fond du camp et 55 %
  // en haut de l'ecran a zoom 28 ; fond plus sombre que la brume.
  moody: {
    hemisphere: { sky: 0x9fb6dc, ground: 0x36402f, intensity: 0.5 },
    sun: { color: 0xf0e8d6, intensity: 1.8 },
    fill: { color: 0xa2b8d6, intensity: 0.36 },
    atmosphere: { color: 0x66797a, near: 2, far: 52, background: 0x55656a },
    groundTint: [0.86, 0.87, 0.96],
    grassTint: [0.9, 0.88, 1.0],
    tuftTint: [0.84, 0.86, 1.0],
  },
};
