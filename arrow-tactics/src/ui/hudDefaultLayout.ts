/**
 * Disposition OFFICIELLE du HUD (2026-11-02, direction validee par Antoine),
 * dans le MEME format que « Copier la disposition du HUD » (Parametres >
 * HUD) : un export colle ici (champ `blocks`) devient le nouveau layout par
 * defaut, sans autre code. Appliquee a tout bloc sans reglage local ;
 * « Reinitialiser la disposition du HUD » y revient (ui/hudLayout.ts).
 *
 * Ancrage par axe + decalage en px (marges identiques a toute resolution) ;
 * `x` / `y` : repli en fraction de la place libre. Blocs absents d'ici :
 * position CSS (ui/style.css) — Heros en bas a gauche, barre d'XP en bas
 * presque pleine largeur (niveau a gauche, progression a droite), Vague en
 * haut au centre, Economie (bois, pierre, or, population) en haut a droite.
 *
 * Bas : Inventaire, barre des 6 sorts, Construire, a 12 px les uns des
 * autres, boutons centres verticalement sur les sorts ; barre d'action
 * (action chronometree seulement) juste au-dessus des sorts, meme largeur.
 * Rangee du bas a 54 px du bord (au-dessus de la barre d'XP).
 * Valeurs PROVISOIRES (mesurees a 1600 x 900 et 1024 x 640).
 */

/** Ecran large : sorts centres, Inventaire a leur gauche, Construire a leur
 *  droite. */
export const HUD_DEFAULT_LAYOUT = {
  version: 1,
  viewport: { w: 1600, h: 900 },
  blocks: {
    spells: { anchor: 'bottom-center', ox: 0, oy: 54, x: 0.5, y: 0.9356, scale: 1 },
    inventory: { anchor: 'bottom-center', ox: -251, oy: 66, x: 0.3274, y: 0.9235, scale: 1 },
    build: { anchor: 'bottom-center', ox: 238, oy: 66, x: 0.6608, y: 0.9235, scale: 1 },
    action: { anchor: 'bottom-center', ox: 0, oy: 124, x: 0.5, y: 0.86, scale: 1, width: 332, height: 14 },
  },
} as const;

/** En dessous de cette largeur, le groupe centre toucherait l'encart du
 *  Heros (il lui faut ~1160 px) : variante compacte. PROVISOIRE. */
export const HUD_COMPACT_BELOW = 1200;

/** Ecran etroit : meme ordre et memes ecarts, aligne a 12 px apres l'encart
 *  du Heros au lieu d'etre centre. */
export const HUD_COMPACT_LAYOUT = {
  version: 1,
  viewport: { w: 1024, h: 640 },
  blocks: {
    inventory: { anchor: 'bottom-left', ox: 256, oy: 66, x: 0.2916, y: 0.8905, scale: 1 },
    spells: { anchor: 'bottom-left', ox: 414, oy: 54, x: 0.5983, y: 0.9066, scale: 1 },
    build: { anchor: 'bottom-left', ox: 758, oy: 66, x: 0.8385, y: 0.8905, scale: 1 },
    action: { anchor: 'bottom-left', ox: 414, oy: 124, x: 0.5983, y: 0.8019, scale: 1, width: 332, height: 14 },
  },
} as const;

/** Layout officiel pour une largeur d'ecran (px). */
export function officialHudLayout(viewportWidth: number): typeof HUD_DEFAULT_LAYOUT | typeof HUD_COMPACT_LAYOUT {
  return viewportWidth < HUD_COMPACT_BELOW ? HUD_COMPACT_LAYOUT : HUD_DEFAULT_LAYOUT;
}
