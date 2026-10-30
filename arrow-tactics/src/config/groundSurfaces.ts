import { cellKey } from './mapDef';

/**
 * Surfaces de sol PEIGNABLES (outil Surface de l'editeur, 2026-10-29) :
 * SOURCE UNIQUE de leurs identifiants, libelles (`label` complet, `short`
 * dans la liste de l'editeur, sous le nom de sa section), familles et
 * textures, lue par l'editeur (liste, vignettes), la sauvegarde (validation
 * des identifiants) et le rendu (render/groundSurfaces.ts). Purement visuel :
 * une surface n'habille que le DESSUS d'une case existante — jamais sa
 * hauteur, sa pente, ses trajets, son territoire ni ses regles de pose — et
 * la simulation ne la lit jamais.
 *
 * Textures : PNG generes par tools/ground-textures/generate.mjs dans
 * public/textures/ground/variants/.
 */
export const GROUND_TEXTURES = [
  { id: 'herbe-classique', label: 'Herbe classique', short: 'Classique', category: 'herbe', file: 'herbe-classique.png', tiles: 2 },
  { id: 'herbe-prairie', label: 'Herbe prairie', short: 'Prairie', category: 'herbe', file: 'herbe-prairie.png', tiles: 2 },
  { id: 'herbe-dense', label: 'Herbe dense', short: 'Dense', category: 'herbe', file: 'herbe-dense.png', tiles: 2 },
  { id: 'herbe-stylisee', label: 'Herbe stylisée', short: 'Stylisée', category: 'herbe', file: 'herbe-stylisee.png', tiles: 2 },
  { id: 'herbe-pixel-touffes', label: 'Herbe pixel touffes', short: 'Pixel touffes', category: 'herbe', file: 'herbe-pixel-touffes.png', tiles: 2, nearest: true },
  { id: 'herbe-pixel-net', label: 'Herbe pixel nette', short: 'Pixel nette', category: 'herbe', file: 'herbe-pixel-net.png', tiles: 2, nearest: true },
  { id: 'terre-battue', label: 'Terre battue', short: 'Terre battue', category: 'terre', file: 'terre-battue.png', tiles: 2 },
  { id: 'mixte-taches', label: 'Mixte taches', short: 'Taches', category: 'mixte', file: 'mixte-taches.png', tiles: 4 },
  { id: 'mixte-usee', label: 'Mixte usée', short: 'Usée', category: 'mixte', file: 'mixte-usee.png', tiles: 4 },
  // Dessinee pour les FLANCS (strates horizontales le long d'une falaise) :
  // sur un dessus de case, elle donne des rayures. Peignable seulement dans
  // la section Experimental de l'editeur.
  { id: 'terre-strates', label: 'Terre strates', short: 'Terre strates', category: 'experimental', file: 'terre-strates.png', tiles: 2 },
] as const;

/** Identifiant STABLE d'une surface : seule valeur ecrite dans une carte
 *  (MapDef.surfaceCells), jamais le libelle. */
export type GroundTextureId = (typeof GROUND_TEXTURES)[number]['id'];

export type GroundTextureCategory = (typeof GROUND_TEXTURES)[number]['category'];

/** Sections de la liste de l'editeur, dans l'ordre d'affichage. */
export const GROUND_TEXTURE_CATEGORIES: readonly { id: GroundTextureCategory; label: string }[] = [
  { id: 'herbe', label: 'Herbe' },
  { id: 'terre', label: 'Terre' },
  { id: 'mixte', label: 'Mixte' },
  { id: 'experimental', label: 'Expérimental' },
];

/** Palette SIMPLIFIEE de l'outil Surface (rendu `?groundLook=living`,
 *  render/groundLook.ts, 2026-10-30) : une herbe et deux de ses etats, une
 *  terre, dans l'ordre d'affichage. Les autres identifiants (herbes
 *  stylisee et pixel, mixtes, terre en strates, reservee aux flancs)
 *  restent valides : une carte qui les contient se charge, se rend et
 *  s'enregistre telle quelle ; ils ne sont seulement plus proposes. */
export const GROUND_SURFACE_PALETTE: readonly { id: GroundTextureId; label: string; hint: string }[] = [
  { id: 'herbe-classique', label: 'Herbe', hint: 'Herbe : la matière de base du sol' },
  { id: 'herbe-dense', label: 'Herbe dense', hint: 'La même herbe, plus sombre et plus riche (sous-bois, zones grasses)' },
  { id: 'herbe-prairie', label: 'Prairie claire', hint: 'La même herbe, plus claire et plus sèche (zones exposées, abords usés)' },
  { id: 'terre-battue', label: 'Terre battue', hint: 'Chemins, cours, abords des bâtiments' },
];

const TEXTURE_IDS: ReadonlySet<string> = new Set(GROUND_TEXTURES.map((t) => t.id));

export function isGroundTextureId(value: unknown): value is GroundTextureId {
  return typeof value === 'string' && TEXTURE_IDS.has(value);
}

/** Case peinte d'une surface explicite (MapDef.surfaceCells), memes
 *  coordonnees que MapDef.cells. */
export interface SurfaceCellDef {
  x: number;
  z: number;
  surface: GroundTextureId;
}

/** Surface peinte par case (cle cellKey), pour le rendu. */
export function buildSurfaceIndex(cells: readonly SurfaceCellDef[] | undefined): Map<string, GroundTextureId> {
  return new Map((cells ?? []).map((c) => [cellKey(c.x, c.z), c.surface]));
}

/** Taille (cote, en cases) du pinceau Surface. */
export type SurfaceBrushSize = 1 | 4;

/** Case nord-ouest du carre `size × size` d'un pinceau Surface pose pres de
 *  (x, z) : carre pair centre sur l'intersection de grille la plus proche,
 *  carre impair sur la case sous le curseur (meme regle que reliefBrushOrigin). */
export function surfaceBrushOrigin(size: SurfaceBrushSize, x: number, z: number): { x: number; z: number } {
  if (size % 2 === 0) return { x: Math.round(x) - size / 2, z: Math.round(z) - size / 2 };
  return { x: Math.floor(x) - (size - 1) / 2, z: Math.floor(z) - (size - 1) / 2 };
}
