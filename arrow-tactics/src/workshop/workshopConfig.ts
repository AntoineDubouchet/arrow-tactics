/**
 * Atelier de personnage (2026-11-01, outil INTERNE de conception, jamais
 * dans une partie) : configuration d'une unite Toon RTS composee piece par
 * piece, catalogue des pieces produit par le pipeline (tools/toon-units,
 * `--atelier`), presets lus dans units.json, export / reimport.
 *
 * Le format exporte est une ENTREE de tools/toon-units/units.json (meme
 * schema, constructible telle quelle : `pieces.hands` et les pieces
 * `{"piece", "source", "scale"}` sont compris par le pipeline), plus un bloc
 * `atelier` (teinte, echelle, animation de l'apercu) que le pipeline ignore.
 */

/** Emplacements de corps (une piece ou aucune). Casque et cape : aucune piece
 *  separee dans les packs actuels (le casque fait partie de la tete) ; les
 *  emplacements existent pour les futurs packs et l'equipement du Heros. */
export const BODY_SLOTS = ['head', 'body', 'arms', 'legs', 'shoulderpads', 'helmet', 'cape'] as const;
export type BodySlot = (typeof BODY_SLOTS)[number];
export const BODY_SLOT_LABELS: Readonly<Record<BodySlot, string>> = {
  head: 'Tête',
  body: 'Corps',
  arms: 'Bras',
  legs: 'Jambes',
  shoulderpads: 'Épaulières',
  helmet: 'Casque',
  cape: 'Cape',
};
export type Hand = 'right' | 'left';

/** Piece du catalogue (`<source>_atelier.json`). */
export interface CataloguePiece {
  name: string;
  /** Emplacement : corps, `hand` (objet tenu) ou `extra` (sac, carquois...). */
  slot: string;
  /** Os porteur dans le FBX (objets tenus, extras), null pour le corps. */
  carrier: string | null;
  /** Main d'origine d'un objet tenu. */
  side: Hand | null;
  sommets: number;
  triangles: number;
}

export interface CatalogueClip {
  name: string;
  folder: string;
  duree_s: number;
  boucle: boolean;
}

/** Bloc `atelier` d'une entree exportee (ignore par le pipeline). */
export type WorkshopLookEntry = WorkshopLook & { toutes_sources?: boolean };

/** Entree de tools/toon-units/units.json (schema du pipeline). */
export interface UnitsJsonEntry {
  source: string;
  pieces: Record<string, unknown>;
  animations?: string;
  extra_animations?: unknown;
  atelier?: WorkshopLookEntry;
}

export interface WorkshopCatalogue {
  source: string;
  textures: string;
  os: number;
  pieces: CataloguePiece[];
  clips: CatalogueClip[];
  presets: Record<string, UnitsJsonEntry>;
}

/** Piece choisie : nom, source d'ORIGINE (une unite peut melanger les packs :
 *  meme squelette Biped) et echelle propre (pieces skinnees : autour des
 *  articulations qui la portent, voir `scaledSkinnedGeometry`). */
export interface PieceRef {
  piece: string;
  source: string;
  scale: number;
}

/** Objet tenu : piece (n'importe quel objet tenu des packs, des deux mains),
 *  sa source, et ajustement autour de la prise, dans le repere du modele
 *  (X droite, Y haut, Z avant ; degres ; unites du modele). */
export interface HandConfig {
  piece: string | null;
  source: string;
  scale: number;
  rotation: [number, number, number];
  offset: [number, number, number];
}

/** Apercu seulement (aucune incidence de jeu) : teinte, echelle, animation. */
export interface WorkshopLook {
  /** Palette du jeu (TOON_PALETTES) ou `custom`. */
  palette: string;
  /** Couleur effective de la zone d'equipe (sRGB, #rrggbb). */
  couleur: string;
  /** Melange : seconde couleur et part (0 = couleur seule). */
  couleurB: string;
  melange: number;
  /** Intensite de la teinte dans le masque (0 = atlas neutre, 1 = jeu). */
  intensite: number;
  echelle: number;
  animation: string;
}

export interface WorkshopConfig {
  name: string;
  /** Source de base : squelette, clips, provenance par defaut des pieces. */
  source: string;
  /** Selecteur « All » : listes de pieces de toutes les sources. */
  allSources: boolean;
  body: Record<BodySlot, PieceRef | null>;
  extras: PieceRef[];
  hands: Record<Hand, HandConfig>;
  look: WorkshopLook;
}

export const emptyHand = (source: string): HandConfig => ({ piece: null, source, scale: 1, rotation: [0, 0, 0], offset: [0, 0, 0] });

export function defaultLook(): WorkshopLook {
  return { palette: 'blue', couleur: '#4a90d9', couleurB: '#ffffff', melange: 0, intensite: 1, echelle: 1, animation: 'Infantry_idle' };
}

/** Piece de units.json : nom (source de l'unite) ou `{piece, source, scale}`. */
function pieceRefOf(value: unknown, source: string): PieceRef | null {
  if (typeof value === 'string') return { piece: value, source, scale: 1 };
  const v = value as { piece?: unknown; source?: unknown; scale?: unknown } | null;
  if (!v || typeof v.piece !== 'string') return null;
  return { piece: v.piece, source: typeof v.source === 'string' ? v.source : source, scale: typeof v.scale === 'number' ? v.scale : 1 };
}

/** Sources utilisees par une configuration (base d'abord). */
export function configSources(config: WorkshopConfig): string[] {
  const refs = [...Object.values(config.body), ...config.extras].filter((r): r is PieceRef => !!r);
  const hands = (['right', 'left'] as const).map((h) => config.hands[h]).filter((h) => h.piece);
  return [...new Set([config.source, ...refs.map((r) => r.source), ...hands.map((h) => h.source)])];
}

/** Configuration d'apres une entree de units.json (preset) : emplacements,
 *  extras, mains (`hands` ; sinon `weapon` -> droite, `offhand` -> gauche,
 *  `offhand_weapon` -> gauche en miroir, outils du Heros -> marteau a droite
 *  avec `tool_scale`). */
export function configFromEntry(name: string, entry: UnitsJsonEntry, look: Partial<WorkshopLook> = {}): WorkshopConfig {
  const p = entry.pieces as Record<string, any>;
  const body = Object.fromEntries(BODY_SLOTS.map((slot) => [slot, pieceRefOf(p[slot], entry.source)])) as Record<BodySlot, PieceRef | null>;
  const hands: Record<Hand, HandConfig> = { right: emptyHand(entry.source), left: emptyHand(entry.source) };
  const fromHands = p['hands'] as Partial<Record<Hand, Partial<HandConfig>>> | undefined;
  if (fromHands) {
    for (const hand of ['right', 'left'] as const) {
      const h = fromHands[hand];
      if (h?.piece) hands[hand] = { ...emptyHand(entry.source), ...h, piece: h.piece, source: h.source ?? entry.source } as HandConfig;
    }
  } else {
    if (typeof p['weapon'] === 'string') hands.right.piece = p['weapon'];
    if (typeof p['offhand'] === 'string') hands.left.piece = p['offhand'];
    if (typeof p['offhand_weapon'] === 'string') hands.left.piece = p['offhand_weapon'];
    // Outil : nom (source de l'unite) ou {piece, source} (piece d'une autre source).
    const tools = p['tools'] as Record<string, unknown> | undefined;
    const tool = tools ? pieceRefOf(Object.values(tools)[0], entry.source) : null;
    if (tools && tool && !hands.right.piece) {
      const first = Object.keys(tools)[0]!;
      hands.right.piece = tool.piece;
      hands.right.source = tool.source;
      hands.right.scale = (p['tool_scale'] as Record<string, number> | undefined)?.[first] ?? 1;
    }
  }
  const folder = (entry.animations ?? 'animation/Infantry').split('/').pop()!;
  const { toutes_sources: all, ...atelier } = entry.atelier ?? ({} as Partial<WorkshopLookEntry>);
  const config: WorkshopConfig = {
    name,
    source: entry.source,
    allSources: all === true,
    body,
    extras: Array.isArray(p['extras']) ? (p['extras'] as unknown[]).map((x) => pieceRefOf(x, entry.source)).filter((r): r is PieceRef => !!r) : [],
    hands,
    look: { ...defaultLook(), animation: `${folder}_idle`, ...atelier, ...look },
  };
  if (configSources(config).length > 1) config.allSources = true;
  return config;
}

export const round = (v: number): number => Math.round(v * 1000) / 1000;

/** Entree units.json de la configuration (exportee, constructible par le
 *  pipeline) : une piece de la source de base a l'echelle 1 reste un nom
 *  (format historique) ; sinon `{piece, source?, scale?}`. Le dossier
 *  d'animations est celui du clip d'apercu. */
export function entryFromConfig(config: WorkshopConfig): UnitsJsonEntry {
  const out = (ref: PieceRef | null): unknown => {
    if (!ref) return null;
    if (ref.source === config.source && ref.scale === 1) return ref.piece;
    return { piece: ref.piece, ...(ref.source !== config.source ? { source: ref.source } : {}), ...(ref.scale !== 1 ? { scale: round(ref.scale) } : {}) };
  };
  const pieces: Record<string, unknown> = {};
  for (const slot of BODY_SLOTS) if (slot !== 'helmet' && slot !== 'cape') pieces[slot] = out(config.body[slot]);
  for (const slot of ['helmet', 'cape'] as const) if (config.body[slot]) pieces[slot] = out(config.body[slot]);
  pieces['weapon'] = null;
  pieces['offhand'] = null;
  pieces['extras'] = config.extras.map(out);
  const hands: Record<string, unknown> = {};
  for (const hand of ['right', 'left'] as const) {
    const h = config.hands[hand];
    if (!h.piece) continue;
    hands[hand] = { piece: h.piece, ...(h.source !== config.source ? { source: h.source } : {}), scale: round(h.scale), rotation: h.rotation.map(round), offset: h.offset.map(round) };
  }
  pieces['hands'] = hands;
  const folder = config.look.animation.includes('_') ? config.look.animation.split('_')[0] : 'Infantry';
  const atelier: WorkshopLookEntry = { ...config.look, echelle: round(config.look.echelle), intensite: round(config.look.intensite), melange: round(config.look.melange) };
  if (config.allSources) atelier.toutes_sources = true;
  return { source: config.source, pieces, animations: `animation/${folder}`, atelier };
}

/** Texte exporte : `{ "<nom>": <entree> }`, pret a coller dans units.json. */
export function exportConfigText(config: WorkshopConfig): string {
  return JSON.stringify({ [config.name || 'atelier_unite']: entryFromConfig(config) }, null, 2);
}

/** Relit un texte exporte (`{ nom: entree }` ou une entree seule). */
export function importConfigText(text: string): WorkshopConfig {
  const data = JSON.parse(text) as Record<string, unknown>;
  if (typeof data['source'] === 'string') return configFromEntry('atelier_unite', data as unknown as UnitsJsonEntry);
  const [name, entry] = Object.entries(data)[0] ?? [];
  if (!name || !entry || typeof (entry as UnitsJsonEntry).source !== 'string') throw new Error('Config non reconnue : une entree units.json est attendue.');
  return configFromEntry(name, entry as UnitsJsonEntry);
}
