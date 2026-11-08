import * as THREE from 'three';
import { isWaterSurface, WATER_SURFACE_IDS } from '../config/groundSurfaces';
import { cellKey, type TerrainCellDef } from '../config/mapDef';
import { cellTriangles, TERRAIN_ELEVATION_STEP, type SlopeDirection } from '../config/terrainElevation';
import type { GroundSurfaceId } from './groundSurfaces';
import { hillHeightInCell } from './hillShape';
import { applyGroundLayer, groundLookTint, groundMacro, groundRenderSurface, groundStates, groundSurfaceDef } from './groundLook';
import type { ReliefShading } from './reliefLook';
import { newBuffers, RELIEF_TINT_PER_LEVEL, SLOPE_NORMAL_Y, SLOPE_SHADE, type LayerBuffers, type TerrainContext } from './terrainCells';
import type { TerrainLips } from './terrainStylized';
import { applyContactShading } from './contactMap';

/**
 * TRANSITIONS entre surfaces du dessus (`?surfaceBlend=`), purement visuelles :
 * jamais lues par le jeu, le relief, le pointage ni la carte (surfaceCells
 * inchangees). `irregular` (defaut, direction retenue le 2026-10-29) : bord
 * net, polygonal, de largeur variable ; `hard` (temoin) : frontiere case par
 * case, aucun mesh ajoute.
 *
 * Methode (masque alpha sur grille fine) : la surface PRIORITAIRE d'une
 * frontiere est redessinee par-dessus sa voisine, dans la bande qui borde
 * ses cases, sur une sous-grille de `subdivisions` x `subdivisions` de chaque
 * case touchee. La sous-grille suit la triangulation de la case (memes
 * diagonales) : chaque sous-triangle est exactement sur le sol logique,
 * plat, pente ou coin. L'alpha est porte par les sommets (distance aux
 * cases de la surface prioritaire, bruit deterministe), coupe net a 0,5
 * (alphaTest, aucune transparence) ; la texture et l'ombrage sont ceux de la
 * surface (UV monde : continuite avec ses cases). Un coin RENTRANT (deux
 * cotes de la case bordes par la meme surface prioritaire) est arrondi :
 * un chemin en escalier ou un virage ne garde pas sa marche. Un mesh et un
 * materiau par surface qui deborde, jamais par case ; decalage de profondeur
 * (polygonOffset) croissant avec la priorite.
 *
 * Bord de carte et trous (rendu facette) : la bande du dessus qui deborde
 * d'une case (ses LEVRES, render/terrainStylized.ts) recoit la transition
 * de son bord, prolongee tout droit : une surface peinte jusqu'au bord
 * continue sur la levre, la falaise dessous garde le materiau de flanc.
 *
 * Le debord ne traverse qu'un raccord continu (arete ou coin a la meme
 * hauteur) : jamais par-dessus une falaise ; il ne sort jamais du sol
 * dessine (rien dans le vide ni au-dessus d'un trou). Tout se deduit des
 * surfaces de la carte et de positions monde : meme carte, meme rendu, quel
 * que soit l'ordre de la peinture ou le decoupage en morceaux.
 *
 * `lisiere` (2026-10-31, en comparaison) : frontiere ORGANIQUE dans les DEUX
 * sens, toujours nette (meme alphaTest, aucune transparence). Chaque surface
 * du voisinage 3 × 3 recoit un score au point : sa part des cases apres un
 * flou gaussien leger (une case pleine convoluee), plus son debord
 * (`spread`, un chemin 1 × 1 garde environ 1,2 case) et un bruit propre
 * (`wobble`). Direction low-poly (2026-10-31, consolidation) : un coin ou
 * une surface n'a qu'une case sur quatre est BISEAUTE (coupe a 45 degres,
 * pas arrondi : un angle reste un angle, une case isolee devient un
 * octogone, un escalier une bande droite) ; deux cases d'une surface qui ne
 * se touchent que par un coin sont reliees par un PONT le long de leur
 * diagonale (un chemin en diagonale reste un trace continu, sans col). La surface au plus
 * haut score l'emporte : elle est redessinee par-dessus sa voisine, que
 * celle-ci soit prioritaire ou non. Une LISIERE (teinte de bord, selon la
 * surface et sa voisine : herbe plus seche le long d'un chemin, plus grasse
 * au bord de l'eau, roussie pres de la lave ; terre tassee, bordure de
 * paves, sable mouille, ecume, croute refroidie) est portee par la couleur
 * des sommets, du cote de la surface a qui elle appartient (sur sa propre
 * case, un debord d'elle-meme limite a la bande). `melange` : `lisiere`, plus
 * un bruit fin pres de la frontiere (ilots epars des deux surfaces, zone de
 * melange), sur une sous-grille plus fine.
 *
 * `organic` (2026-10-31, en comparaison avec `lisiere`) : la meme frontiere
 * (memes formes, au sommet pres), mais la lisiere devient une ZONE DE
 * TRANSITION choisie par COUPLE de matieres (SURFACE_ORGANIC_EDGES) : herbe
 * plus terne et terreuse le long d'un chemin, chemin plus tasse a son bord,
 * paves salis de terre, herbe poussiereuse pres du sable, berge humide et
 * eau plus claire, sol brule autour de la lave. Teinte douce (couleur des
 * sommets) en deux parts : un CONTACT etroit colle a la frontiere visible
 * (marge de score) et une ZONE plus large, pleine puis fondue sur une
 * profondeur propre au couple, mesuree depuis les cases de la voisine
 * (distance octogonale : angles coupes, comme les biseaux), irreguliere
 * (profondeur et force bruitees en coordonnees monde) ; jamais plus d'une
 * case. Jamais de contour sombre ni de trait.
 */
export type SurfaceBlendMode = 'hard' | 'irregular' | 'lisiere' | 'melange' | 'organic';
export const SURFACE_BLEND_MODES: readonly SurfaceBlendMode[] = ['hard', 'irregular', 'lisiere', 'melange', 'organic'];
let blendMode: SurfaceBlendMode = 'irregular';

/** Mode applique aux plateaux construits ensuite (main.ts : `?surfaceBlend=`). */
export function setSurfaceBlendMode(mode: SurfaceBlendMode): void {
  blendMode = mode;
}

export function surfaceBlendMode(): SurfaceBlendMode {
  return blendMode;
}

/** Cote de la sous-grille des transitions d'une case dans le mode courant :
 *  aussi celle des pentes arrondies (`?hills=organic`, render/hillShape.ts),
 *  pour que leurs triangles coincident exactement. */
export function surfaceBlendSubdivisions(): number {
  if (blendMode === 'melange') return SURFACE_LISIERE_PARAMS.melangeSubdivisions;
  if (blendMode === 'lisiere' || blendMode === 'organic') return SURFACE_LISIERE_PARAMS.subdivisions;
  return SURFACE_BLEND_PARAMS.subdivisions;
}

/** Rayon (cases) des surfaces lues par les transitions d'une case (render/terrainChunks.ts) : 1, mais 2 en `lisiere`,
 *  `melange` et `organic` (ponts et biseaux lus aux sommets d'une fenetre de 4 x 4 sommets). */
export function surfaceBlendReach(): number {
  return blendMode === 'lisiere' || blendMode === 'melange' || blendMode === 'organic' ? 2 : 1;
}

/** PRIORITE VISUELLE (rendu seulement, aucune regle de jeu) : a une
 *  frontiere, la surface de rang le plus eleve deborde sur l'autre. Terre
 *  au-dessus des herbes, herbes travaillees au-dessus de l'herbe par
 *  defaut ; liquides sous tout (la berge deborde sur l'eau), matieres
 *  construites ou rocheuses au-dessus des terres. A rang egal, l'ordre de
 *  cette liste departage. `lisiere` et `melange` : ordre de dessin seulement
 *  (et graine du bruit de chaque surface). */
const BLEND_PRIORITY: readonly GroundSurfaceId[] = [
  ...WATER_SURFACE_IDS,
  'lave',
  'grass',
  'herbe-classique',
  'herbe-prairie',
  'herbe-dense',
  'herbe-stylisee',
  'herbe-pixel-net',
  'herbe-pixel-touffes',
  'mixte-taches',
  'mixte-usee',
  'sable',
  'dirt',
  'terre-battue',
  'terre-strates',
  'sol-volcanique',
  'roche-sol',
  'paves-gris',
];
const rankOf = (id: GroundSurfaceId) => BLEND_PRIORITY.indexOf(id);

/** Reglages (en cases), lus a chaque construction. Un chemin 1x1 paraît
 *  large de 1 + 2 x (width +- variation) : 1,08 a 1,32 case. */
export const SURFACE_BLEND_PARAMS = {
  /** Sous-grille par case (et par levre). */
  subdivisions: 6,
  /** Debord moyen de la surface prioritaire, et sa variation (bruit). */
  width: 0.1,
  variation: 0.06,
  /** Pente de l'alpha autour du bord (net apres alphaTest). */
  softness: 0.35,
  /** Maille du bruit de largeur. */
  noiseCell: 0.5,
  /** Rayon de l'arrondi d'un coin rentrant. */
  cornerRadius: 0.45,
};
const SEED = 0x51f15e;

function hash2(i: number, j: number): number {
  let h = Math.imul(i, 0x27d4eb2d) ^ Math.imul(j, 0x165667b1) ^ SEED;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Bruit de valeur deterministe dans [0, 1) au point monde (x, z). */
function noise(x: number, z: number): number {
  const fx = x / SURFACE_BLEND_PARAMS.noiseCell, fz = z / SURFACE_BLEND_PARAMS.noiseCell;
  const i = Math.floor(fx), j = Math.floor(fz);
  const s = (t: number) => t * t * (3 - 2 * t);
  const tx = s(fx - i), tz = s(fz - j);
  const a = hash2(i, j) + (hash2(i + 1, j) - hash2(i, j)) * tx;
  const b = hash2(i, j + 1) + (hash2(i + 1, j + 1) - hash2(i, j + 1)) * tx;
  return a + (b - a) * tz;
}

type Rgb = readonly [number, number, number];

/** `lisiere`, `melange` : reglages communs (en cases). */
export const SURFACE_LISIERE_PARAMS = {
  /** Sous-grille par case (et par levre) ; plus fine en `melange` (ilots). */
  subdivisions: 6,
  melangeSubdivisions: 8,
  /** Ecart-type du flou des cases (arrondi des coins, lissage des escaliers). */
  sigma: 0.22,
  /** `melange` : bruit fin (amplitude, maille), seulement pres de la frontiere
   *  (part de la surface a moins de `near` de 1/2). */
  speckle: 0.5,
  speckleCell: 0.3,
  near: 0.3,
  /** Pont d'un coin : deux cases d'une surface qui ne se touchent que par un
   *  coin (chemin en diagonale) restent reliees par une bande d'une case de
   *  large le long de leur diagonale (score ajoute autour du segment qui
   *  joint leurs centres ; rayon en cases). */
  bridge: 0.6,
  bridgeRadius: 0.36,
  /** Demi-longueur du segment du pont (par axe, depuis le sommet ; 0,5 = jusqu'aux centres des cases). */
  bridgeHalf: 0.5,
  /** Biseau (direction low-poly) : a un sommet ou une surface n'a qu'une case sur quatre (son coin saillant, ou le
   *  coin rentrant de sa voisine), son score baisse en losange autour du sommet (force, taille en distance de
   *  Manhattan) : coin coupe a 45 degres plutot qu'arrondi. 0 : aucun biseau. */
  chamfer: 1,
  chamferSize: 0.8,
};

/** Familles de bord (`lisiere`, `melange`) : style d'une surface et, pour sa
 *  lisiere, de sa voisine. */
type EdgeFamily = 'herbe' | 'terre' | 'paves' | 'sable' | 'roche' | 'volcan' | 'eau' | 'lave';

interface EdgeStyle {
  /** Debord (part du champ flou) : un chemin 1 × 1 a debord 0,26 face a
   *  l'herbe garde environ 1,2 case, une mare a debord negatif retrecit. */
  spread: number;
  /** Bruit propre de la frontiere : amplitude (part du champ) et maille (cases). */
  wobble: number;
  cell: number;
  /** Lisiere du cote de cette surface : teinte (multiplicateur lineaire) et
   *  largeur (en marge de score, environ 2,7 par case) ; `rimBy` : teinte
   *  selon la famille de la voisine. */
  rim: Rgb;
  rimWidth: number;
  rimBy?: Partial<Record<EdgeFamily, Rgb>>;
  /** Forme du bord propre a la matiere : flou de ses cases (a la place de
   *  `sigma`) et part du biseau (1 : biseau entier ; pour un coin, la plus
   *  petite des matieres en presence). Rivages arrondis pour l'eau et la
   *  lave, angles nets pour les chemins et la pierre. */
  sigma?: number;
  chamferScale?: number;
}

export const SURFACE_EDGE_STYLES: Readonly<Record<EdgeFamily, EdgeStyle>> = {
  herbe: {
    spread: 0,
    wobble: 0.32,
    cell: 0.9,
    rim: [1, 1, 1],
    rimWidth: 0.3,
    rimBy: { terre: [1.1, 1.05, 0.82], sable: [1.12, 1.08, 0.84], paves: [0.9, 0.93, 0.84], roche: [0.9, 0.93, 0.84], eau: [0.8, 0.9, 0.74], lave: [0.8, 0.66, 0.5], volcan: [0.86, 0.78, 0.64] },
  },
  terre: { spread: 0.26, wobble: 0.3, cell: 0.8, rim: [0.86, 0.82, 0.8], rimWidth: 0.22 },
  paves: { spread: 0.2, wobble: 0.18, cell: 1.2, rim: [0.8, 0.79, 0.78], rimWidth: 0.2 },
  sable: { spread: 0.2, wobble: 0.28, cell: 1.4, rim: [0.95, 0.93, 0.9], rimWidth: 0.15, rimBy: { eau: [0.8, 0.78, 0.76] }, sigma: 0.27, chamferScale: 0.6 },
  roche: { spread: 0.22, wobble: 0.4, cell: 0.6, rim: [0.84, 0.84, 0.86], rimWidth: 0.16 },
  volcan: { spread: 0.2, wobble: 0.3, cell: 0.8, rim: [0.9, 0.88, 0.88], rimWidth: 0.15, rimBy: { lave: [1.25, 0.9, 0.75] } },
  eau: { spread: -0.1, wobble: 0.3, cell: 1.3, rim: [1.2, 1.15, 1.05], rimWidth: 0.5, sigma: 0.36, chamferScale: 0.15 },
  lave: { spread: -0.1, wobble: 0.3, cell: 1, rim: [0.55, 0.5, 0.5], rimWidth: 0.35, sigma: 0.32, chamferScale: 0.3 },
};

/** `organic` : transition d'une surface face a une voisine, en deux teintes (multiplicateurs lineaires de la couleur)
 *  qui se cumulent : CONTACT, bande etroite collee a la frontiere visible (marge de score, `contactWidth`) ; ZONE, plus
 *  large, pleine jusqu'a `hold` puis fondue jusqu'a `hold + fade` (cases, depuis les cases de la voisine), irreguliere
 *  (profondeur et force bruitees). */
interface EdgeBlend {
  contact?: Rgb;
  zone?: Rgb;
  hold: number;
  fade: number;
}

/** `organic`, BORDURE DE CONTACT (`?surfaceBorder=`, 2026-10-31, en comparaison ; `off` par defaut) : une bande douce,
 *  mesuree en vraie distance (cases) depuis la frontiere visible de la surface, pleine au bord, fondue vers
 *  l'interieur ; le centre des surfaces est inchange. Herbe plus sombre pres de toute autre matiere, sable plus chaud,
 *  liseré clair de l'eau, croute plus sombre de la lave. Frontiere : contour de la marge (alpha 0,5) sur la sous-grille
 *  de la case prolongee de `ceil(width x subdivisions)` points (voisinage deja lu : localite des morceaux inchangee). */
export type SurfaceBorder = 'off' | 'subtile' | 'marquee';
export const SURFACE_BORDERS: readonly SurfaceBorder[] = ['off', 'subtile', 'marquee'];
let borderLevel: SurfaceBorder = 'off';

/** Bordure appliquee aux plateaux construits ensuite, en `organic` seulement (main.ts : `?surfaceBorder=`). */
export function setSurfaceBorder(level: SurfaceBorder): void {
  borderLevel = level;
}

export function surfaceBorder(): SurfaceBorder {
  return borderLevel;
}

/** Teinte de la bordure par matiere (pleine a la frontiere visible, face a toute matiere d'une autre famille ; aucune
 *  entree : pas de bordure). Une teinte par matiere, pas par couple : deux cases voisines qui ne voient pas les memes
 *  matieres (voisinage 3 x 3) donnent la meme teinte au meme point. Herbe plus sombre (assied le chemin, la roche, la
 *  berge) ; sable plus chaud ; roche a peine ; eau : liseré clair ; lave : croute plus sombre. */
export const SURFACE_BORDER_TINTS: Readonly<Partial<Record<EdgeFamily, Rgb>>> = {
  herbe: [0.7, 0.72, 0.66],
  sable: [0.94, 0.86, 0.72],
  roche: [0.93, 0.93, 0.91],
  eau: [1.3, 1.3, 1.24],
  lave: [0.55, 0.48, 0.45],
};

/** Largeur (cases, au plus 1/3 : la sous-grille prolongee de 2 points) et force (part de l'ecart de teinte). */
export const SURFACE_BORDER_PARAMS: Record<Exclude<SurfaceBorder, 'off'>, { width: number; strength: number }> = {
  subtile: { width: 0.2, strength: 0.6 },
  marquee: { width: 0.32, strength: 1 },
};

/** `organic` : reglages communs. */
export const SURFACE_ORGANIC_PARAMS = {
  /** Largeur du contact (marge de score : environ 0,1 case, un peu plus pour l'eau et la lave, plus floues). */
  contactWidth: 0.35,
  /** Profondeur de la zone irreguliere : variation de `fade` (part) et maille du bruit (cases). */
  widthNoise: 0.45,
  widthCell: 1.7,
  /** Force de la zone par endroits (salie par taches) : baisse maximale (part) et maille (cases). */
  patchNoise: 0.7,
  patchCell: 0.9,
  /** Profondeur maximale (cases) : une case a plus d'une case de toute voisine n'est jamais redessinee. */
  reach: 0.95,
  /** Ecart de teinte (lineaire) en dessous duquel un sommet reste neutre. */
  neutral: 0.02,
};

/** `organic` : transition par couple (surface, puis voisine ; `*` : toute autre voisine). Aucune entree : pas de teinte
 *  de ce cote. */
export const SURFACE_ORGANIC_EDGES: Readonly<Record<EdgeFamily, Partial<Record<EdgeFamily | '*', EdgeBlend>>>> = {
  herbe: {
    // Le long d'un chemin : herbe moins verte, plus terreuse au contact, plus seche par endroits ; paves : de meme, moins.
    terre: { contact: [1.21, 0.93, 0.82], zone: [1.13, 0.97, 0.82], hold: 0.2, fade: 0.25 },
    paves: { contact: [1.13, 0.95, 0.84], zone: [1.08, 0.97, 0.87], hold: 0.12, fade: 0.2 },
    // Sable : poussiereuse, ocre, sans s'eclaircir (sinon halo jaune) ; roche : plus sombre au pied ; eau : plus
    // grasse ; lave et sol volcanique : brulee.
    sable: { contact: [1.16, 1.0, 0.84], zone: [1.12, 1.0, 0.84], hold: 0.2, fade: 0.3 },
    roche: { contact: [0.84, 0.9, 0.82], zone: [0.91, 0.95, 0.9], hold: 0.12, fade: 0.2 },
    eau: { contact: [0.74, 0.87, 0.71], zone: [0.87, 0.95, 0.84], hold: 0.1, fade: 0.2 },
    lave: { contact: [0.55, 0.47, 0.36], zone: [0.8, 0.7, 0.55], hold: 0.2, fade: 0.25 },
    volcan: { contact: [0.84, 0.77, 0.61], zone: [0.9, 0.83, 0.69], hold: 0.12, fade: 0.25 },
  },
  terre: {
    // Bord du chemin plus tasse, plus sombre ; boue au bord de l'eau.
    herbe: { contact: [0.79, 0.74, 0.71], zone: [0.94, 0.91, 0.9], hold: 0.1, fade: 0.15 },
    paves: { contact: [0.84, 0.82, 0.8], hold: 0, fade: 0 },
    roche: { contact: [0.9, 0.9, 0.94], hold: 0, fade: 0 },
    eau: { contact: [0.66, 0.63, 0.66], zone: [0.82, 0.8, 0.82], hold: 0.1, fade: 0.15 },
    lave: { contact: [0.55, 0.46, 0.42], zone: [0.82, 0.74, 0.68], hold: 0.18, fade: 0.25 },
  },
  paves: {
    // Salis de terre au bord : ancres dans le sol, pas poses comme un autocollant.
    herbe: { contact: [0.9, 0.84, 0.69], zone: [0.95, 0.92, 0.82], hold: 0.12, fade: 0.2 },
    terre: { contact: [0.92, 0.79, 0.61], zone: [0.97, 0.9, 0.77], hold: 0.15, fade: 0.25 },
    sable: { contact: [1.05, 0.97, 0.82], zone: [1.03, 0.99, 0.91], hold: 0.1, fade: 0.2 },
    eau: { contact: [0.71, 0.71, 0.74], hold: 0, fade: 0 },
    lave: { contact: [0.55, 0.48, 0.45], zone: [0.82, 0.76, 0.72], hold: 0.15, fade: 0.2 },
  },
  sable: {
    // Un peu plus sombre, plus vert face a l'herbe : la plaque se fond dans le pre ; sable mouille au bord de l'eau.
    herbe: { contact: [0.93, 0.95, 0.82], zone: [0.96, 0.96, 0.87], hold: 0.12, fade: 0.2 },
    terre: { contact: [0.93, 0.87, 0.82], hold: 0, fade: 0 },
    eau: { contact: [0.64, 0.6, 0.58], zone: [0.82, 0.79, 0.77], hold: 0.12, fade: 0.2 },
    lave: { contact: [0.6, 0.5, 0.45], zone: [0.84, 0.76, 0.7], hold: 0.15, fade: 0.2 },
  },
  roche: {
    // Un peu de mousse face a l'herbe, poussiere de terre face au chemin.
    herbe: { contact: [0.92, 1.0, 0.84], zone: [0.96, 1.0, 0.91], hold: 0.1, fade: 0.15 },
    terre: { contact: [1.05, 0.96, 0.84], hold: 0, fade: 0 },
    eau: { contact: [0.71, 0.71, 0.74], hold: 0, fade: 0 },
    lave: { contact: [0.55, 0.48, 0.45], zone: [0.82, 0.76, 0.72], hold: 0.15, fade: 0.2 },
  },
  volcan: {
    // Croute chaude au bord de la lave.
    lave: { contact: [1.39, 0.84, 0.64], zone: [1.16, 0.94, 0.84], hold: 0.12, fade: 0.2 },
  },
  // Eau : bord plus clair (berge, avec l'ecume du shader) ; lave : croute refroidie, plus sombre.
  eau: { '*': { contact: [1.39, 1.34, 1.18], zone: [1.13, 1.13, 1.07], hold: 0.25, fade: 0.2 } },
  lave: { '*': { contact: [0.62, 0.55, 0.52], zone: [0.85, 0.8, 0.78], hold: 0.25, fade: 0.2 } },
};

function edgeFamily(id: GroundSurfaceId): EdgeFamily {
  if (id === 'paves-gris') return 'paves';
  if (id === 'sable') return 'sable';
  if (id === 'roche-sol') return 'roche';
  if (id === 'sol-volcanique') return 'volcan';
  if (isWaterSurface(id)) return 'eau';
  if (id === 'lave') return 'lave';
  if (id === 'dirt' || id.startsWith('terre-')) return 'terre';
  return 'herbe';
}

/** Fonction de repartition de la loi normale (Abramowitz et Stegun 7.1.26). */
function normalCdf(t: number): number {
  const x = Math.abs(t) / Math.SQRT2;
  const k = 1 / (1 + 0.3275911 * x);
  const erf = 1 - ((((1.061405429 * k - 1.453152027) * k + 1.421413741) * k - 0.284496736) * k + 0.254829592) * k * Math.exp(-x * x);
  return t >= 0 ? 0.5 * (1 + erf) : 0.5 * (1 - erf);
}

function hash3(i: number, j: number, salt: number): number {
  return hash2(i ^ Math.imul(salt, 0x9e3779b1), j + Math.imul(salt, 0x7f4a7c15));
}

/** Bruit de valeur deterministe dans [-1, 1] au point monde (x, z), maille `cell`, graine `salt`. */
function edgeNoise(x: number, z: number, cell: number, salt: number): number {
  const fx = x / cell + salt * 0.137, fz = z / cell + salt * 0.291;
  const i = Math.floor(fx), j = Math.floor(fz);
  const s = (t: number) => t * t * (3 - 2 * t);
  const tx = s(fx - i), tz = s(fz - j);
  const a = hash3(i, j, salt) + (hash3(i + 1, j, salt) - hash3(i, j, salt)) * tx;
  const b = hash3(i, j + 1, salt) + (hash3(i + 1, j + 1, salt) - hash3(i, j + 1, salt)) * tx;
  return (a + (b - a) * tz) * 2 - 1;
}

const NEIGHBORS: readonly { dx: number; dz: number; dir?: SlopeDirection; corner?: [number, number] }[] = [
  { dx: 0, dz: -1, dir: 'N' }, { dx: 1, dz: 0, dir: 'E' }, { dx: 0, dz: 1, dir: 'S' }, { dx: -1, dz: 0, dir: 'W' },
  // Diagonales : coin partage (indice du coin dans la case, puis dans la voisine).
  { dx: -1, dz: -1, corner: [0, 3] }, { dx: 1, dz: -1, corner: [1, 2] }, { dx: -1, dz: 1, corner: [2, 1] }, { dx: 1, dz: 1, corner: [3, 0] },
];
/** Coins rentrants : deux cotes voisins de la case, et leur coin commun (decalage depuis le coin nord-ouest). */
const INNER_CORNERS: readonly { a: SlopeDirection; b: SlopeDirection; x: number; z: number }[] = [
  { a: 'N', b: 'E', x: 1, z: 0 }, { a: 'E', b: 'S', x: 1, z: 1 }, { a: 'S', b: 'W', x: 0, z: 1 }, { a: 'W', b: 'N', x: 0, z: 0 },
];

/** Ajoute a `group` les meshes de transition des cases `cells` (un par
 *  surface qui deborde) ; `ctx` donne les voisines, meme hors de `cells`.
 *  `lips` : levres du rendu facette ; `shading` : ombrage du relief des dessus
 *  (`?relief=`, render/reliefLook.ts), applique a l'identique. Sans effet en
 *  `hard`. */
export function appendSurfaceBlend(group: THREE.Group, cells: readonly TerrainCellDef[], ctx: TerrainContext, lips?: TerrainLips, shading?: ReliefShading | null): void {
  if (blendMode === 'hard') return;
  const P = SURFACE_BLEND_PARAMS;
  const N = P.subdivisions;
  const R = P.cornerRadius;
  const { field } = ctx;
  const buffers = new Map<GroundSurfaceId, LayerBuffers>();
  const ab = new THREE.Vector3(), ac = new THREE.Vector3(), nrm = new THREE.Vector3(), sm = new THREE.Vector3(), vn = new THREE.Vector3();
  // Etats `living` (render/groundLook.ts), lus dans la case en cours (cellX, cellZ).
  const states = groundStates(ctx);
  let cellX = 0, cellZ = 0;
  // Triangle (indices dans des positions xyz a plat et leurs alphas) : emis s'il a un sommet visible, normale vers le haut.
  // Cycle de texture et variation `?groundLook=` (point monde) : ceux de la surface qui deborde. `mul` (`lisiere`,
  // `melange`) : teinte de lisiere par sommet (3 valeurs par indice) ; `cache` : valeurs par point de la zone,
  // calculees une fois pour tous les triangles qui le partagent (memes valeurs, au bit pres).
  const tri = (b: LayerBuffers, surface: GroundSurfaceId, p: readonly number[], as: readonly number[], i0: number, i1: number, i2: number, mul?: readonly number[], cache?: PointCache) => {
    if (as[i0]! < 0.5 && as[i1]! < 0.5 && as[i2]! < 0.5) return;
    const pc = cache ? pointCacheOf(cache, surface) : null;
    const tiles = groundSurfaceDef(surface).tiles;
    const a = 3 * i0, bb = 3 * i1, cc = 3 * i2;
    ab.set(p[bb]! - p[a]!, p[bb + 1]! - p[a + 1]!, p[bb + 2]! - p[a + 2]!);
    ac.set(p[cc]! - p[a]!, p[cc + 1]! - p[a + 1]!, p[cc + 2]! - p[a + 2]!);
    nrm.crossVectors(ab, ac);
    if (nrm.lengthSq() < 1e-12) return;
    nrm.normalize();
    const flip = nrm.y < 0;
    if (flip) nrm.negate();
    const tilt = Math.min(1, Math.max(0, (1 - nrm.y) / (1 - SLOPE_NORMAL_Y)));
    for (const k of flip ? [i0, i2, i1] : [i0, i1, i2]) {
      const x = p[3 * k]!, y = p[3 * k + 1]!, z = p[3 * k + 2]!;
      let shade = (1 + RELIEF_TINT_PER_LEVEL * (Math.max(0, y) / TERRAIN_ELEVATION_STEP)) * (1 - SLOPE_SHADE * tilt);
      b.positions.push(x, y, z);
      if (shading) {
        // Meme ombrage que le dessus au meme point (render/terrainStylized.ts, reliefLit).
        let factor: number, veil: number;
        if (cache) {
          const o = 5 * k, R = cache.relief;
          if (!cache.reliefSet[k]) {
            const r = shading.at(cellX, cellZ, x, z, sm);
            R[o] = r.factor; R[o + 1] = r.veil; R[o + 2] = sm.x; R[o + 3] = sm.y; R[o + 4] = sm.z;
            cache.reliefSet[k] = 1;
          } else sm.set(R[o + 2]!, R[o + 3]!, R[o + 4]!);
          factor = R[o]!; veil = R[o + 1]!;
        } else {
          const r = shading.at(cellX, cellZ, x, z, sm);
          factor = r.factor; veil = r.veil;
        }
        if (shading.smooth > 0) vn.copy(nrm).lerp(sm, shading.smooth).normalize();
        else vn.copy(nrm);
        shade = (1 + RELIEF_TINT_PER_LEVEL * (Math.max(0, y) / TERRAIN_ELEVATION_STEP)) * (shading.smooth > 0 ? veil : 1 - SLOPE_SHADE * tilt) * factor;
        b.normals.push(vn.x, vn.y, vn.z);
      } else b.normals.push(nrm.x, nrm.y, nrm.z);
      b.uvs.push(x / tiles, -z / tiles);
      if (pc) {
        const o = 3 * k;
        if (!pc.set[k]) {
          const mm = groundMacro(surface, x, z);
          pc.macro[o] = mm[0]; pc.macro[o + 1] = mm[1]; pc.macro[o + 2] = mm[2];
          const ss = states?.at(surface, x, z, cellX, cellZ);
          if (ss) { pc.state[o] = ss[0]; pc.state[o + 1] = ss[1]; pc.state[o + 2] = ss[2]; pc.set[k] = 2; } else pc.set[k] = 1;
        }
        const M = pc.macro;
        if (mul) b.colors.push(shade * M[o]! * mul[o]!, shade * M[o + 1]! * mul[o + 1]!, shade * M[o + 2]! * mul[o + 2]!, as[k]!);
        else b.colors.push(shade * M[o]!, shade * M[o + 1]!, shade * M[o + 2]!, as[k]!);
        if (pc.set[k] === 2) b.states.push(pc.state[o]!, pc.state[o + 1]!, pc.state[o + 2]!);
        continue;
      }
      const m = groundMacro(surface, x, z);
      if (mul) b.colors.push(shade * m[0] * mul[3 * k]!, shade * m[1] * mul[3 * k + 1]!, shade * m[2] * mul[3 * k + 2]!, as[k]!);
      else b.colors.push(shade * m[0], shade * m[1], shade * m[2], as[k]!);
      const st = states?.at(surface, x, z, cellX, cellZ);
      if (st) b.states.push(st[0], st[1], st[2]);
    }
  };
  // Surfaces DESSINEES (`living` : une herbe, une terre ; aucune transition entre deux etats d'une meme matiere).
  const drawnAt = (x: number, z: number) => {
    const s = ctx.surfaceAt(x, z);
    return s && groundRenderSurface(s);
  };
  if (blendMode === 'lisiere' || blendMode === 'melange' || blendMode === 'organic') appendLisiere(cells, ctx, lips, drawnAt, buffers, tri, (x, z) => { cellX = x; cellZ = z; });
  else for (const c of cells) {
    cellX = c.x;
    cellZ = c.z;
    const own = drawnAt(c.x, c.z)!;
    const h = field.cornerHeights(c.x, c.z);
    // Surfaces prioritaires voisines par un raccord continu : cases sources et cotes bordes.
    const sources = new Map<GroundSurfaceId, { squares: [number, number][]; sides: SlopeDirection[] }>();
    for (const nb of NEIGHBORS) {
      const nx = c.x + nb.dx, nz = c.z + nb.dz;
      const s = drawnAt(nx, nz);
      if (!s || rankOf(s) <= rankOf(own)) continue;
      const continuous = nb.dir ? field.edgeMatches(c.x, c.z, nb.dir) : Math.abs(h[nb.corner![0]]! - field.cornerHeights(nx, nz)[nb.corner![1]]!) < 1e-6;
      if (!continuous) continue;
      let src = sources.get(s);
      if (!src) sources.set(s, (src = { squares: [], sides: [] }));
      src.squares.push([nx, nz]);
      if (nb.dir) src.sides.push(nb.dir);
    }
    if (sources.size === 0) continue;
    const slope = field.slopeAt(c.x, c.z);
    const nwSe = cellTriangles(slope)[0]!.includes(3);
    // Sommets de la sous-grille : position exacte sur le sol de la case.
    const grid: number[] = [];
    for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) grid.push(c.x + i / N, hillHeightInCell(field, c.x, c.z, i / N, j / N), c.z + j / N);
    const cellLips = lips?.get(cellKey(c.x, c.z)) ?? [];
    // Surfaces prioritaires dans l'ordre croissant (la plus prioritaire dessinee en dernier).
    for (const [surface, { squares, sides }] of [...sources].sort((a, b) => rankOf(a[0]) - rankOf(b[0]))) {
      const corners = INNER_CORNERS.filter((k) => sides.includes(k.a) && sides.includes(k.b)).map((k) => [c.x + k.x, c.z + k.z] as const);
      // Alpha au point (x, z), ramene dans la case : une levre prolonge son bord tout droit.
      const alphaAt = (x: number, z: number) => {
        const qx = Math.min(c.x + 1, Math.max(c.x, x)), qz = Math.min(c.z + 1, Math.max(c.z, z));
        let d = Infinity;
        for (const [sx, sz] of squares) d = Math.min(d, Math.hypot(Math.max(sx - qx, 0, qx - (sx + 1)), Math.max(sz - qz, 0, qz - (sz + 1))));
        for (const [fx, fz] of corners) {
          const u = Math.abs(qx - fx), v = Math.abs(qz - fz);
          if (u < R && v < R) d = Math.min(d, Math.max(0, R - Math.hypot(R - u, R - v)));
        }
        const w = P.width + P.variation * (noise(qx, qz) - 0.5) * 2;
        return Math.min(1, Math.max(0, 0.5 + (w - d) / P.softness));
      };
      let b = buffers.get(surface);
      if (!b) buffers.set(surface, (b = newBuffers()));
      // Dessus de la case : meme diagonale que la case, aucun sous-triangle ne la traverse (sol exact).
      const alpha: number[] = [];
      for (let k = 0; k < grid.length; k += 3) alpha.push(alphaAt(grid[k]!, grid[k + 2]!));
      const v = (i: number, j: number) => j * (N + 1) + i;
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
        if (nwSe) { tri(b, surface, grid, alpha, v(i, j), v(i, j + 1), v(i + 1, j + 1)); tri(b, surface, grid, alpha, v(i, j), v(i + 1, j + 1), v(i + 1, j)); }
        else { tri(b, surface, grid, alpha, v(i, j), v(i, j + 1), v(i + 1, j)); tri(b, surface, grid, alpha, v(i + 1, j), v(i, j + 1), v(i + 1, j + 1)); }
      }
      // Levres : chaque triangle subdivise (barycentrique), dans son plan.
      for (const [p0, p1, p2] of cellLips) {
        const pts: number[] = [], al: number[] = [];
        const idx = (i: number, j: number) => j * (N + 1) - (j * (j - 1)) / 2 + i;
        for (let j = 0; j <= N; j++) for (let i = 0; i + j <= N; i++) {
          const u = i / N, w = j / N;
          const x = p0!.x + (p1!.x - p0!.x) * u + (p2!.x - p0!.x) * w;
          const y = p0!.y + (p1!.y - p0!.y) * u + (p2!.y - p0!.y) * w;
          const z = p0!.z + (p1!.z - p0!.z) * u + (p2!.z - p0!.z) * w;
          pts.push(x, y, z);
          al.push(alphaAt(x, z));
        }
        if (al.every((a) => a < 0.5)) continue;
        for (let j = 0; j < N; j++) for (let i = 0; i + j < N; i++) {
          tri(b, surface, pts, al, idx(i, j), idx(i + 1, j), idx(i, j + 1));
          if (i + j < N - 1) tri(b, surface, pts, al, idx(i + 1, j), idx(i + 1, j + 1), idx(i, j + 1));
        }
      }
    }
  }
  for (const id of BLEND_PRIORITY) {
    const b = buffers.get(id);
    if (!b || b.positions.length === 0) continue;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(b.positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(b.normals, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(b.uvs, 2));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(b.colors, 4));
    if (b.states.length > 0) geometry.setAttribute('groundState', new THREE.Float32BufferAttribute(b.states, 3));
    const rank = rankOf(id);
    const material = ctx.materials.get(`blend:${id}`, () => {
      // Meme matiere et meme teinte (`?groundLook=`, render/groundLook.ts ;
      // preset `?look=`, render/look.ts) que le dessus de la surface.
      const def = groundSurfaceDef(id);
      const tint = groundLookTint(id);
      const m = new THREE.MeshLambertMaterial({
        map: def.texture(),
        vertexColors: true,
        alphaTest: 0.5,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -4 - 4 * rank,
      });
      m.color.setRGB(def.color[0] * tint[0], def.color[1] * tint[1], def.color[2] * tint[2], THREE.LinearSRGBColorSpace);
      applyGroundLayer(m, id);
      // Ombre de contact et voile de brume (render/contactMap.ts, rendu officiel 2026-11-07).
      applyContactShading(m);
      return m;
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.receiveShadow = true;
    mesh.renderOrder = 1 + rank;
    mesh.userData['surfaceBlend'] = id;
    group.add(mesh);
  }
}

type BlendTri = (b: LayerBuffers, surface: GroundSurfaceId, p: readonly number[], as: readonly number[], i0: number, i1: number, i2: number, mul?: readonly number[], cache?: PointCache) => void;

/** Valeurs par point d'une zone (sous-grille ou levre) : ombrage du relief (facteur, voile, normale lissee), puis,
 *  par surface, variation macro et etats. Un point est partage par jusqu'a six triangles. */
interface PointCache {
  relief: Float64Array;
  reliefSet: Uint8Array;
  n: number;
  bySurface: Map<GroundSurfaceId, { macro: Float64Array; state: Float64Array; set: Uint8Array }>;
}

const newPointCache = (n: number): PointCache => ({ relief: new Float64Array(5 * n), reliefSet: new Uint8Array(n), n, bySurface: new Map() });

function pointCacheOf(cache: PointCache, surface: GroundSurfaceId): { macro: Float64Array; state: Float64Array; set: Uint8Array } {
  let pc = cache.bySurface.get(surface);
  if (!pc) cache.bySurface.set(surface, (pc = { macro: new Float64Array(3 * cache.n), state: new Float64Array(3 * cache.n), set: new Uint8Array(cache.n) }));
  return pc;
}

/** `lisiere`, `melange`, `organic` (voir le commentaire du module) : pour chaque
 *  case dont le voisinage continu porte au moins deux surfaces, chaque surface y
 *  est redessinee la ou elle l'emporte (alpha = 0,5 + marge de score) ; la
 *  surface de la case ne l'est que dans sa bande de lisiere (`organic` : sa
 *  zone de transition). */
function appendLisiere(cells: readonly TerrainCellDef[], ctx: TerrainContext, lips: TerrainLips | undefined, drawnAt: (x: number, z: number) => GroundSurfaceId | undefined, buffers: Map<GroundSurfaceId, LayerBuffers>, tri: BlendTri, setCell: (x: number, z: number) => void): void {
  const LP = SURFACE_LISIERE_PARAMS;
  const OP = SURFACE_ORGANIC_PARAMS;
  const melange = blendMode === 'melange';
  const organic = blendMode === 'organic';
  const N = melange ? LP.melangeSubdivisions : LP.subdivisions;
  const { field } = ctx;
  const smooth01 = (t: number) => {
    const u = Math.min(1, Math.max(0, t));
    return u * u * (3 - 2 * u);
  };
  // Triangles d'une case (dans `buffers`).
  const emit = (c: TerrainCellDef) => {
    const base = drawnAt(c.x, c.z)!;
    const h = field.cornerHeights(c.x, c.z);
    // Voisinage 3 × 3 relie par un raccord continu, la case comprise : une case derriere une falaise ne compte pas.
    const near: { x: number; z: number; s: GroundSurfaceId }[] = [{ x: c.x, z: c.z, s: base }];
    for (const nb of NEIGHBORS) {
      const nx = c.x + nb.dx, nz = c.z + nb.dz;
      const s = drawnAt(nx, nz);
      if (!s) continue;
      const continuous = nb.dir ? field.edgeMatches(c.x, c.z, nb.dir) : Math.abs(h[nb.corner![0]]! - field.cornerHeights(nx, nz)[nb.corner![1]]!) < 1e-6;
      if (continuous) near.push({ x: nx, z: nz, s });
    }
    const kinds = [...new Set(near.map((n) => n.s))].sort((a, b) => rankOf(a) - rankOf(b));
    if (kinds.length < 2) return;
    const families = kinds.map(edgeFamily);
    const styles = families.map((f) => SURFACE_EDGE_STYLES[f]);
    const kindOf = near.map((n) => kinds.indexOf(n.s));
    const parts = new Array<number>(kinds.length);
    const scores = new Array<number>(kinds.length);
    // Ponts : a un sommet dont les quatre cases existent au meme niveau, deux cases en diagonale d'une meme surface
    // et les deux autres d'une autre. Propriete du sommet seul (la meme vue de toutes les cases) ; une case lit les
    // sommets assez proches pour que leur pont l'atteigne. Segment le long de la diagonale, centre sur le sommet.
    const bridges: { x0: number; z0: number; x1: number; z1: number; kind: number }[] = [];
    const half = LP.bridgeHalf;
    // Biseaux : sommet et surface qui n'y a qu'une case sur quatre.
    const cuts: { x: number; z: number; kind: number; scale: number }[] = [];
    const chamferScaleOf = (id: GroundSurfaceId) => SURFACE_EDGE_STYLES[edgeFamily(id)].chamferScale ?? 1;
    for (let vz = c.z - 1; vz <= c.z + 2; vz++) for (let vx = c.x - 1; vx <= c.x + 2; vx++) {
      const a = drawnAt(vx - 1, vz - 1), b = drawnAt(vx, vz - 1), cc = drawnAt(vx - 1, vz), d = drawnAt(vx, vz);
      if (!a || !b || !cc || !d) continue;
      const y = field.cornerHeights(vx, vz)[0]!;
      if (field.cornerHeights(vx - 1, vz - 1)[3] !== y || field.cornerHeights(vx, vz - 1)[2] !== y || field.cornerHeights(vx - 1, vz)[1] !== y) continue;
      if (LP.chamfer > 0) for (const one of [a, b, cc, d]) {
        if ((one === a ? 1 : 0) + (one === b ? 1 : 0) + (one === cc ? 1 : 0) + (one === d ? 1 : 0) !== 1) continue;
        const kind = kinds.indexOf(one);
        // Biseau de la paire : le plus doux des deux matieres (un rivage reste arrondi des deux cotes).
        const scale = Math.min(chamferScaleOf(one), ...[a, b, cc, d].filter((o) => o !== one).map(chamferScaleOf));
        if (kind >= 0) cuts.push({ x: vx, z: vz, kind, scale });
      }
      const first = a === d && b !== a && cc !== a ? a : null;
      const second = b === cc && a !== b && d !== b ? b : null;
      // Damier (les deux diagonales) : le pont revient a la surface prioritaire (le chemin plutot que l'herbe).
      const surface = first && second ? (rankOf(first) > rankOf(second) ? first : second) : first ?? second;
      const kind = surface ? kinds.indexOf(surface) : -1;
      if (kind < 0) continue;
      if (surface === first) bridges.push({ x0: vx - half, z0: vz - half, x1: vx + half, z1: vz + half, kind });
      else bridges.push({ x0: vx + half, z0: vz - half, x1: vx - half, z1: vz + half, kind });
    }
    // Marge de chaque surface (son score moins le meilleur des autres) et la plus forte des autres, au point
    // ramene dans la case (une levre prolonge son bord tout droit).
    // Poids d'une case au point : case pleine floutee (gaussienne d'ecart-type sigma), separable ; repartition aux
    // quatre limites de cases du voisinage, par axe.
    // Flou de chaque surface (celui de sa matiere, sinon `sigma`) ; un tableau par flou distinct.
    const sigmas = [...new Set(styles.map((st) => st.sigma ?? LP.sigma))];
    const sigmaOf = kinds.map((_, i) => sigmas.indexOf(styles[i]!.sigma ?? LP.sigma));
    const fx = sigmas.map(() => [0, 0, 0, 0]), fz = sigmas.map(() => [0, 0, 0, 0]);
    // `clamp` faux : point lu tel quel (sous-grille prolongee de la bordure, organic), sinon ramene dans la case.
    const sample = (x: number, z: number, margins: number[][], rivals: number[][], clamp = true) => {
      const qx = clamp ? Math.min(c.x + 1, Math.max(c.x, x)) : x, qz = clamp ? Math.min(c.z + 1, Math.max(c.z, z)) : z;
      sigmas.forEach((sg, j) => {
        for (let k = 0; k < 4; k++) {
          fx[j]![k] = normalCdf((qx - (c.x - 1 + k)) / sg);
          fz[j]![k] = normalCdf((qz - (c.z - 1 + k)) / sg);
        }
      });
      parts.fill(0);
      let total = 0;
      near.forEach((n, i) => {
        const ix = n.x - c.x + 1, iz = n.z - c.z + 1;
        const X = fx[sigmaOf[kindOf[i]!]!]!, Z = fz[sigmaOf[kindOf[i]!]!]!;
        const w = (X[ix]! - X[ix + 1]!) * (Z[iz]! - Z[iz + 1]!);
        parts[kindOf[i]!] = parts[kindOf[i]!]! + w;
        total += w;
      });
      // Ponts : poids au point (le melange s'efface pres d'un pont, qui reste continu).
      let bridged = 0;
      // Distance au carre du point au segment du pont.
      const segment2 = (br: (typeof bridges)[number]) => {
        const dx = br.x1 - br.x0, dz = br.z1 - br.z0;
        const t = Math.min(1, Math.max(0, ((qx - br.x0) * dx + (qz - br.z0) * dz) / (dx * dx + dz * dz)));
        return (qx - br.x0 - t * dx) ** 2 + (qz - br.z0 - t * dz) ** 2;
      };
      for (const br of bridges) bridged = Math.max(bridged, Math.exp(-segment2(br) / (2 * LP.bridgeRadius ** 2)));
      kinds.forEach((k, i) => {
        const g = parts[i]! / total;
        let s = g + styles[i]!.spread + styles[i]!.wobble * edgeNoise(qx, qz, styles[i]!.cell, rankOf(k) + 1);
        if (melange) s += LP.speckle * Math.max(0, 1 - Math.abs(g - 0.5) / LP.near) * Math.max(0, 1 - 1.5 * bridged) * edgeNoise(qx, qz, LP.speckleCell, rankOf(k) + 41);
        scores[i] = s;
      });
      for (const br of bridges) scores[br.kind] = scores[br.kind]! + LP.bridge * Math.exp(-segment2(br) / (2 * LP.bridgeRadius ** 2));
      for (const cut of cuts) {
        const d = Math.abs(qx - cut.x) + Math.abs(qz - cut.z);
        if (d < LP.chamferSize) scores[cut.kind] = scores[cut.kind]! - LP.chamfer * cut.scale * (1 - d / LP.chamferSize);
      }
      kinds.forEach((_, i) => {
        let best = -Infinity, who = 0;
        kinds.forEach((_, j) => {
          if (j !== i && scores[j]! > best) {
            best = scores[j]!;
            who = j;
          }
        });
        margins[i]!.push(scores[i]! - best);
        rivals[i]!.push(who);
      });
    };
    // Zones a dessiner : la sous-grille du dessus (meme diagonale que la case), puis celles des levres (barycentriques).
    const slope = field.slopeAt(c.x, c.z);
    const nwSe = cellTriangles(slope)[0]!.includes(3);
    const areas: { pts: number[]; tris: [number, number, number][] }[] = [];
    const grid: number[] = [];
    for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) grid.push(c.x + i / N, hillHeightInCell(field, c.x, c.z, i / N, j / N), c.z + j / N);
    const gridTris: [number, number, number][] = [];
    const v = (i: number, j: number) => j * (N + 1) + i;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      if (nwSe) gridTris.push([v(i, j), v(i, j + 1), v(i + 1, j + 1)], [v(i, j), v(i + 1, j + 1), v(i + 1, j)]);
      else gridTris.push([v(i, j), v(i, j + 1), v(i + 1, j)], [v(i + 1, j), v(i, j + 1), v(i + 1, j + 1)]);
    }
    areas.push({ pts: grid, tris: gridTris });
    for (const [p0, p1, p2] of lips?.get(cellKey(c.x, c.z)) ?? []) {
      const pts: number[] = [];
      const tris: [number, number, number][] = [];
      const idx = (i: number, j: number) => j * (N + 1) - (j * (j - 1)) / 2 + i;
      for (let j = 0; j <= N; j++) for (let i = 0; i + j <= N; i++) {
        const u = i / N, w = j / N;
        pts.push(p0!.x + (p1!.x - p0!.x) * u + (p2!.x - p0!.x) * w, p0!.y + (p1!.y - p0!.y) * u + (p2!.y - p0!.y) * w, p0!.z + (p1!.z - p0!.z) * u + (p2!.z - p0!.z) * w);
      }
      for (let j = 0; j < N; j++) for (let i = 0; i + j < N; i++) {
        tris.push([idx(i, j), idx(i + 1, j), idx(i, j + 1)]);
        if (i + j < N - 1) tris.push([idx(i + 1, j), idx(i + 1, j + 1), idx(i, j + 1)]);
      }
      areas.push({ pts, tris });
    }
    // `organic` : zone de transition de chaque surface face a chacune des autres (SURFACE_ORGANIC_EDGES).
    const blends = organic ? kinds.map((_, i) => kinds.map((_, j) => (j === i ? undefined : SURFACE_ORGANIC_EDGES[families[i]!][families[j]!] ?? SURFACE_ORGANIC_EDGES[families[i]!]['*']))) : [];
    const K = kinds.length;
    // Zones : distance octogonale de chaque point d'une zone a dessiner (ramene dans la case) aux cases de chaque surface
    // du voisinage (0 dans les siennes), `K` valeurs par point (organicDists).
    let dists = new Float64Array(0);
    const organicDists = (pts: readonly number[]) => {
      dists = new Float64Array((pts.length / 3) * K).fill(Infinity);
      for (let k = 0; k < pts.length / 3; k++) {
        const qx = Math.min(c.x + 1, Math.max(c.x, pts[3 * k]!)), qz = Math.min(c.z + 1, Math.max(c.z, pts[3 * k + 2]!));
        near.forEach((n, i) => {
          const dx = Math.max(n.x - qx, 0, qx - n.x - 1), dz = Math.max(n.z - qz, 0, qz - n.z - 1);
          const d = Math.max(dx, dz, (dx + dz) * Math.SQRT1_2);
          const o = k * K + kindOf[i]!;
          if (d < dists[o]!) dists[o] = d;
        });
      }
    };
    // Bordure de contact (`?surfaceBorder=`) : contour de la marge (alpha 0,5) de chaque surface bordee, en segments
    // (carres de la sous-grille, points de passage interpoles), sur la sous-grille de la case prolongee de `ring` points ;
    // seuls comptent les points des cases du voisinage continu (rien derriere une falaise ni dans le vide). Puis distance
    // de chaque point d'une zone (ramene dans la case, comme sa marge) a ce contour : positive du cote ou la surface
    // l'emporte, negative sous sa voisine (borderDists).
    const BP = organic && borderLevel !== 'off' ? SURFACE_BORDER_PARAMS[borderLevel] : null;
    const bordered = BP ? families.map((f) => !!SURFACE_BORDER_TINTS[f]) : [];
    const ring = BP && bordered.some(Boolean) ? Math.ceil(BP.width * N - 1e-9) : -1;
    const W = N + 1 + 2 * ring;
    const latM = kinds.map(() => [] as number[]), latR = kinds.map(() => [] as number[]);
    const contours = kinds.map(() => [] as number[]);
    if (ring >= 0) {
      const ok: boolean[] = [];
      for (let j = -ring; j <= N + ring; j++) for (let i = -ring; i <= N + ring; i++) {
        const x = c.x + i / N, z = c.z + j / N;
        const inside = near.some((n) => x >= n.x && x <= n.x + 1 && z >= n.z && z <= n.z + 1);
        ok.push(inside);
        if (inside) sample(x, z, latM, latR, false);
        else for (let s = 0; s < K; s++) { latM[s]!.push(NaN); latR[s]!.push(0); }
      }
      const X = (i: number) => c.x + (i - ring) / N, Z = (j: number) => c.z + (j - ring) / N;
      const xs = new Array<number>(8);
      const cross = (e: number, x0: number, z0: number, m0: number, x1: number, z1: number, m1: number) => {
        const t = (m0 > 0) !== (m1 > 0) ? m0 / (m0 - m1) : NaN;
        xs[2 * e] = x0 + (x1 - x0) * t;
        xs[2 * e + 1] = z0 + (z1 - z0) * t;
      };
      for (let s = 0; s < K; s++) {
        if (!bordered[s]) continue;
        const m = latM[s]!, out = contours[s]!;
        const seg = (e0: number, e1: number) => out.push(xs[2 * e0]!, xs[2 * e0 + 1]!, xs[2 * e1]!, xs[2 * e1 + 1]!);
        for (let j = 0; j < W - 1; j++) for (let i = 0; i < W - 1; i++) {
          const a = j * W + i, b = a + 1, cc = a + W, d = cc + 1;
          if (!ok[a] || !ok[b] || !ok[cc] || !ok[d]) continue;
          const ma = m[a]!, mb = m[b]!, mc = m[cc]!, md = m[d]!;
          const pa = ma > 0;
          if (pa === (mb > 0) && pa === (mc > 0) && pa === (md > 0)) continue;
          // Cotes dans l'ordre du tour a, b, d, c : 0 = ab, 1 = bd, 2 = dc, 3 = ca.
          cross(0, X(i), Z(j), ma, X(i + 1), Z(j), mb);
          cross(1, X(i + 1), Z(j), mb, X(i + 1), Z(j + 1), md);
          cross(2, X(i + 1), Z(j + 1), md, X(i), Z(j + 1), mc);
          cross(3, X(i), Z(j + 1), mc, X(i), Z(j), ma);
          const es = [0, 1, 2, 3].filter((e) => !Number.isNaN(xs[2 * e]!));
          if (es.length === 2) seg(es[0]!, es[1]!);
          // Col (deux coins opposes de chaque cote) : le centre decide quels coins sont isoles.
          else if ((ma + mb + mc + md > 0) === pa) { seg(0, 1); seg(2, 3); }
          else { seg(3, 0); seg(1, 2); }
        }
      }
    }
    let bdist = new Float64Array(0);
    const borderDists = (pts: readonly number[], margins: readonly number[][]) => {
      bdist = new Float64Array((pts.length / 3) * K).fill(Infinity);
      for (let k = 0; k < pts.length / 3; k++) {
        const qx = Math.min(c.x + 1, Math.max(c.x, pts[3 * k]!)), qz = Math.min(c.z + 1, Math.max(c.z, pts[3 * k + 2]!));
        for (let s = 0; s < K; s++) {
          if (!bordered[s]) continue;
          const seg = contours[s]!;
          let d2 = Infinity;
          for (let q = 0; q < seg.length; q += 4) {
            const ax = seg[q]!, az = seg[q + 1]!, dx = seg[q + 2]! - ax, dz = seg[q + 3]! - az;
            const l2 = dx * dx + dz * dz;
            const t = l2 > 0 ? Math.min(1, Math.max(0, ((qx - ax) * dx + (qz - az) * dz) / l2)) : 0;
            d2 = Math.min(d2, (qx - ax - t * dx) ** 2 + (qz - az - t * dz) ** 2);
          }
          bdist[k * K + s] = margins[s]![k]! > 0 ? Math.sqrt(d2) : -Math.sqrt(d2);
        }
      }
    };
    // Teinte de la surface `si` au point `k` (x, z ; `m` : sa marge, `rival` : la plus forte des autres), ajoutee a
    // `mul` ; vrai si elle n'est pas neutre. Profondeur d'une zone : distance aux cases de la voisine moins distance aux
    // siennes (negative la ou la surface deborde sur la voisine). Bruits calcules seulement a portee d'une zone.
    // Bordure : pleine jusqu'a la frontiere visible, fondue jusqu'a `width` (cases).
    const organicMul = (si: number, k: number, x: number, z: number, m: number, rival: number, mul: number[]) => {
      let r = 1, g = 1, bl = 1;
      const apply = (t: Rgb, w: number) => {
        r *= 1 + (t[0] - 1) * w;
        g *= 1 + (t[1] - 1) * w;
        bl *= 1 + (t[2] - 1) * w;
      };
      const contact = blends[si]![rival]?.contact;
      if (contact && m < OP.contactWidth) apply(contact, 1 - smooth01(m / OP.contactWidth));
      const border = BP && families[rival] !== families[si] ? SURFACE_BORDER_TINTS[families[si]!] : undefined;
      if (border && bdist[k * K + si]! < BP!.width) apply(border, BP!.strength * (1 - smooth01(bdist[k * K + si]! / BP!.width)));
      let n1 = NaN, patch = 1;
      blends[si]!.forEach((eb, j) => {
        if (!eb?.zone) return;
        const d = dists[k * K + j]! - dists[k * K + si]!;
        if (d >= Math.min(OP.reach, eb.hold + eb.fade * (1 + OP.widthNoise))) return;
        if (Number.isNaN(n1)) {
          const qx = Math.min(c.x + 1, Math.max(c.x, x)), qz = Math.min(c.z + 1, Math.max(c.z, z));
          const salt = rankOf(kinds[si]!) + 1;
          n1 = edgeNoise(qx, qz, OP.widthCell, 101 + salt);
          patch = 1 - OP.patchNoise * (0.5 + 0.5 * edgeNoise(qx, qz, OP.patchCell, 131 + salt));
        }
        const end = Math.min(OP.reach, eb.hold + eb.fade * (1 + OP.widthNoise * n1));
        if (d >= end) return;
        apply(eb.zone, patch * (d <= eb.hold ? 1 : 1 - smooth01((d - eb.hold) / (end - eb.hold))));
      });
      // Teinte imperceptible (moins de OP.neutral d'ecart) : neutre, exactement (aucun triangle redessine pour elle,
      // aucune couture avec le dessus de la case).
      if (Math.max(Math.abs(r - 1), Math.abs(g - 1), Math.abs(bl - 1)) < OP.neutral) {
        mul.push(1, 1, 1);
        return false;
      }
      mul.push(r, g, bl);
      return true;
    };
    for (const [ai, area] of areas.entries()) {
      const cache = newPointCache(area.pts.length / 3);
      const margins = kinds.map(() => [] as number[]);
      const rivals = kinds.map(() => [] as number[]);
      // Bordure : la sous-grille du dessus est deja lue (memes points, memes valeurs) dans la sous-grille prolongee.
      if (ai === 0 && ring >= 0) {
        for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) {
          const o = (j + ring) * W + i + ring;
          for (let s = 0; s < K; s++) { margins[s]!.push(latM[s]![o]!); rivals[s]!.push(latR[s]![o]!); }
        }
      } else for (let k = 0; k < area.pts.length; k += 3) sample(area.pts[k]!, area.pts[k + 2]!, margins, rivals);
      if (organic) organicDists(area.pts);
      if (ring >= 0) borderDists(area.pts, margins);
      kinds.forEach((surface, si) => {
        const st = styles[si]!;
        const m = margins[si]!;
        const own = surface === base;
        // Lisiere : teinte par sommet selon la plus forte des voisines, nette au bord, fondue vers l'interieur.
        const mul: number[] = [];
        let tinted = false;
        // `organic` : sommets sans teinte (un triangle de la surface de la case qui n'a que ceux-la n'est pas redessine).
        const plain: boolean[] = [];
        for (let k = 0; k < m.length; k++) {
          if (organic) {
            const t = organicMul(si, k, area.pts[3 * k]!, area.pts[3 * k + 2]!, m[k]!, rivals[si]![k]!, mul);
            plain.push(!t);
            if (t && m[k]! > 0) tinted = true;
            continue;
          }
          const rim = st.rimBy?.[families[rivals[si]![k]!]!] ?? st.rim;
          const w = 1 - smooth01(m[k]! / st.rimWidth);
          mul.push(1 + (rim[0] - 1) * w, 1 + (rim[1] - 1) * w, 1 + (rim[2] - 1) * w);
          if (w > 0 && m[k]! > -st.rimWidth && (rim[0] !== 1 || rim[1] !== 1 || rim[2] !== 1)) tinted = true;
        }
        // La surface de la case n'est redessinee que pour sa lisiere.
        if (own && !tinted) return;
        const alpha = m.map((x) => 0.5 + x);
        let b = buffers.get(surface);
        if (!b) buffers.set(surface, (b = newBuffers()));
        for (const [i0, i1, i2] of area.tris) {
          if (own && (organic ? plain[i0] && plain[i1] && plain[i2] : m[i0]! >= st.rimWidth && m[i1]! >= st.rimWidth && m[i2]! >= st.rimWidth)) continue;
          tri(b, surface, area.pts, alpha, i0, i1, i2, mul, cache);
        }
      });
    }
  };
  // Morceaux de l'editeur (`ctx.reuseCells`) : une case dont les surfaces a 2 cases ou moins n'ont pas change
  // (ce que lisent ses transitions et les etats de l'herbe ; relief et levres fixes pour un meme contexte) rejoue ses
  // triangles deja calcules, a l'identique.
  const memo = ctx.reuseCells ? cellMemoOf(ctx) : null;
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  if (memo) for (const c of cells) { x0 = Math.min(x0, c.x - 2); z0 = Math.min(z0, c.z - 2); x1 = Math.max(x1, c.x + 2); z1 = Math.max(z1, c.z + 2); }
  const span = x1 - x0 + 1;
  const around: string[] = [];
  if (memo) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) around.push(ctx.surfaceAt(x, z) ?? '-');
  for (const c of cells) {
    setCell(c.x, c.z);
    if (!memo) {
      emit(c);
      continue;
    }
    let sig = '';
    for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) sig += around[(c.z + dz - z0) * span + (c.x + dx - x0)] + ';';
    const key = cellKey(c.x, c.z);
    const known = memo.get(key);
    if (known && known.sig === sig) {
      for (const seg of known.segs) {
        let b = buffers.get(seg.surface);
        if (!b) buffers.set(seg.surface, (b = newBuffers()));
        // Copie groupee (quelques milliers de valeurs au plus par case : sous la limite des arguments).
        for (const k of ['positions', 'normals', 'uvs', 'colors', 'states'] as const) b[k].push(...seg[k]);
      }
      continue;
    }
    const before = new Map([...buffers].map(([surface, b]) => [surface, [b.positions.length, b.normals.length, b.uvs.length, b.colors.length, b.states.length] as const]));
    emit(c);
    const segs: CellSegment[] = [];
    for (const [surface, b] of buffers) {
      const [p0, n0, u0, c0, s0] = before.get(surface) ?? [0, 0, 0, 0, 0];
      if (b.positions.length > p0) segs.push({ surface, positions: b.positions.slice(p0), normals: b.normals.slice(n0), uvs: b.uvs.slice(u0), colors: b.colors.slice(c0), states: b.states.slice(s0) });
    }
    memo.set(key, { sig, segs });
  }
}

/** Triangles de transition d'une case, par surface (memo des morceaux de l'editeur). */
interface CellSegment {
  surface: GroundSurfaceId;
  positions: number[];
  normals: number[];
  uvs: number[];
  colors: number[];
  states: number[];
}

/** Memo par contexte (une carte, un relief) : cle de case -> surfaces lues (signature) et triangles. Mode de
 *  transition et matiere du sol fixes pendant la vie d'un contexte. */
const cellMemos = new WeakMap<TerrainContext, Map<string, { sig: string; segs: CellSegment[] }>>();
function cellMemoOf(ctx: TerrainContext): Map<string, { sig: string; segs: CellSegment[] }> {
  let memo = cellMemos.get(ctx);
  if (!memo) cellMemos.set(ctx, (memo = new Map()));
  return memo;
}
