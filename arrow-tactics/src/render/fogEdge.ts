import * as THREE from 'three';

/**
 * LISIERE DU BROUILLARD DE GUERRE (2026-11-09, forme et degrades VALIDES par Antoine ; durees du
 * mouvement VALIDEES en jeu, voir FOG_EDGE_TIMING et docs/DESIGN_DECISIONS.md A6). Partage entre la composition du brouillard (render/fogOfWar.ts : assombrissement
 * et noir) et les Mist Clouds (render/mistClouds.ts : densite des nappes).
 *
 * Probleme : la grille du brouillard est une texture par case ; lue en bilineaire, sa frontiere
 * visible / exploree (et exploree / inexploree) dessine une rampe d'une case qui suit les bords des
 * cases : un escalier, que les nappes reprenaient (echantillons a une case d'ecart, bruit de +-0,1).
 *
 * Solution : la grille porte en plus, par case, la DISTANCE SIGNEE a chaque lisiere (canal G :
 * lisiere du visible, canal B : lisiere de l'explore ; positive a l'interieur, en cases, calculee
 * par FogOfWar a chaque mise a jour, transformee de distance). Interpolee, cette distance donne un
 * champ continu ; le shader la deplace par un bruit en ESPACE MONDE (ancre au terrain, graine de la
 * carte) : la lisiere visuelle devient irreguliere, avancees et creux, et le motif ne bouge pas
 * quand seule la camera bouge. Le deplacement est BIAISE VERS L'INTERIEUR (fogEdgeShift <= 0) : la
 * brume et l'assombrissement debordent sur le terrain reellement visible, jamais l'inverse (aucun
 * terrain hors vision eclairci, aucun terrain inexplore devoile).
 *
 * La GRILLE reste seule juge de la visibilite gameplay (affichage des ennemis, selection, aggro,
 * Baliste AUTO : FogOfWar.isVisible) : un ennemi qui entre dans sa premiere case visible est
 * affiche ET encore enveloppe par les nappes (densite visible atteinte seulement a uFogEdge.w cases
 * a l'interieur de la lisiere deplacee) ; en avancant il se precise, en reculant il se perd dans la
 * nappe avant de disparaitre.
 */

/** Reglages : x amplitude du bruit de lisiere (cases, crete a creux), y biais vers
 *  l'interieur (cases ; >= x / 2 pour ne jamais sortir de la zone visible), z demi-largeur du fondu
 *  du noir (lisiere de l'explore, cases), w largeur sur laquelle les nappes passent de la densite
 *  exploree a la densite visible, a l'interieur de la lisiere deplacee (cases).
 *  Forme de la lisiere et degrades VALIDES par Antoine le 2026-11-09. */
export const FOG_EDGE = { amplitude: 3.0, inward: 1.6, darkHalfWidth: 0.6, mistWidth: 3.5 };

/** Fondu de l'ASSOMBRISSEMENT a la lisiere du visible (cases, de part et d'autre de la lisiere
 *  deplacee) : `out` vers l'exterieur (inchange : la brume ne s'avance pas plus loin vers la
 *  palissade), `in` vers l'interieur. Retouche du 2026-11-09, validee : le fondu etait
 *  symetrique (+-0,6 case) et tombait la ou les nappes sont encore a leur densite exploree, d'ou un
 *  trait net entre la nappe assombrie et la nappe claire ; etire vers l'interieur, il se repartit
 *  dans la bande ou la densite des nappes decroit (mistWidth), et l'herbe se perd progressivement. */
export const FOG_EDGE_DARK_FADE = { out: 0.6, in: 2.4 };

/** Fondu du NOIR a la lisiere de l'explore (cases, de part et d'autre de la lisiere deplacee) et
 *  courbe. `out` vers l'inexplore (inchange : rien de l'inconnu ne devient perceptible), `in` vers
 *  le terrain deja explore ; `curve` : exposant applique au fondu lineaire (smoothstep) AVANT le
 *  melange, qui se fait en lumiere lineaire : un melange lineaire vers le noir concentre tout le
 *  changement percu pres du noir (la clarte percue croit comme la racine de la luminance), d'ou une
 *  ligne nette meme avec un fondu large ; l'exposant 2 repartit la variation percue sur toute la
 *  largeur, le terrain se perd dans l'obscurite au lieu d'y tomber. Retouche du 2026-11-09,
 *  validee (reglage C ; etait +-0,6 case, lineaire : pente maximale 18 points de luminance par quart de
 *  case sur le troncon de reference ; 2,4 / courbe 2,5 : 12,7 ; 3,0 / courbe 3 : 9,3 mais un halo
 *  sombre qui mange presque toute la bande grise du depart). */
export const FOG_EDGE_BLACK_FADE = { out: 0.6, in: 2.4, curve: 2.5 };

/** Mouvement du brouillard (secondes, reglables separement ; durees VALIDEES en jeu par Antoine le
 *  2026-11-09, docs/DESIGN_DECISIONS.md A6) : `open` la
 *  brume se retire d'une case nouvellement vue ; `hold` delai pendant lequel une case quittee reste
 *  affichee telle quelle ; `close` retour progressif a la brume grise apres ce delai. Rendu
 *  seulement : la visibilite de jeu (FogOfWar.state) change instantanement. */
export const FOG_EDGE_TIMING = { open: 0.5, hold: 2.0, close: 1.5 };

/** Bande (cases) ou la distance a une lisiere change l'image, compte tenu du deplacement par le bruit
 *  (de -(amplitude / 2 + biais) a amplitude / 2 - biais) : les rampes s'y deroulent en entier, sinon
 *  une grande partie de leur duree se perdrait hors de ce que l'oeil voit. */
export const FOG_EDGE_ANIM_BAND = {
  lo: -1 - (FOG_EDGE.amplitude / 2 - FOG_EDGE.inward),
  hi: Math.max(FOG_EDGE.mistWidth, FOG_EDGE_DARK_FADE.in, FOG_EDGE_BLACK_FADE.in) + FOG_EDGE.amplitude / 2 + FOG_EDGE.inward,
};

/** Encodage de la distance signee dans un octet : 128 + d * FOG_EDGE_SCALE, d borne a
 *  +-FOG_EDGE_RANGE cases. */
export const FOG_EDGE_SCALE = 15;
export const FOG_EDGE_RANGE = 8;

export const fogEdgeUniforms = {
  uFogEdgeSeed: { value: new THREE.Vector2() },
  uFogEdge: { value: new THREE.Vector4(FOG_EDGE.amplitude, FOG_EDGE.inward, FOG_EDGE.darkHalfWidth, FOG_EDGE.mistWidth) },
  /** Fondu de l'assombrissement a la lisiere du visible : (x) vers l'exterieur, (y) vers l'interieur. */
  uFogEdgeFade: { value: new THREE.Vector2(FOG_EDGE_DARK_FADE.out, FOG_EDGE_DARK_FADE.in) },
  /** Fondu du noir a la lisiere de l'explore : (x) vers l'inexplore, (y) vers l'explore, (z) courbe. */
  uFogEdgeBlack: { value: new THREE.Vector3(FOG_EDGE_BLACK_FADE.out, FOG_EDGE_BLACK_FADE.in, FOG_EDGE_BLACK_FADE.curve) },
};

/** Graine de la carte (decalage du bruit de lisiere) ; appelee avec setMistCloudsScene. */
export function setFogEdgeSeed(seed: number): void {
  const s = seed >>> 0;
  fogEdgeUniforms.uFogEdgeSeed.value.set((s % 769) * 1.37, ((s >>> 7) % 821) * 1.91);
}

/** Declarations et fonctions GLSL. A inclure AVANT MIST_CLOUDS_GLSL (qui s'en sert) et dans la
 *  composition du brouillard. */
export const FOG_EDGE_GLSL = /* glsl */ `
uniform vec2 uFogEdgeSeed;
uniform vec4 uFogEdge;
uniform vec2 uFogEdgeFade;
uniform vec3 uFogEdgeBlack;
float fogEdgeHash(vec2 p) {
  p = fract(p * vec2(127.1, 311.7));
  p += dot(p, p + 19.19);
  return fract(p.x * p.y);
}
float fogEdgeNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(fogEdgeHash(i), fogEdgeHash(i + vec2(1.0, 0.0)), f.x), mix(fogEdgeHash(i + vec2(0.0, 1.0)), fogEdgeHash(i + vec2(1.0, 1.0)), f.x), f.y);
}
// Deplacement de la lisiere (cases) au point monde xz : grande forme (environ 9 cases) et forme
// moyenne (environ 4 cases), centre, amplitude uFogEdge.x, puis biais vers l'interieur uFogEdge.y.
// Toujours <= 0 quand uFogEdge.y >= uFogEdge.x / 2 : la lisiere visuelle ne sort jamais de la zone
// reellement visible (ou exploree).
float fogEdgeShift(vec2 xz) {
  float n = fogEdgeNoise(xz * 0.11 + uFogEdgeSeed) * 0.65 + fogEdgeNoise(xz * 0.27 + uFogEdgeSeed + vec2(7.3, 2.9)) * 0.35;
  return (n - 0.5) * uFogEdge.x - uFogEdge.y;
}
// Distances signees (cases) aux lisieres, lues dans un texel de la grille (FogOfWar.texture :
// g = lisiere du visible, b = lisiere de l'explore ; positives a l'interieur).
vec2 fogEdgeDistances(vec4 fogTexel) {
  return (fogTexel.gb * 255.0 - 128.0) / ${FOG_EDGE_SCALE.toFixed(1)};
}`;
