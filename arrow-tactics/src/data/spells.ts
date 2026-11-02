import { HP_PER_PIP } from '../config/constants';

/**
 * Sorts des Heros (2026-11-02, passe Hero RTS « mana ») : donnees pures, lues
 * par l'interface et copiees sur le Heros a son apparition (Entity.hero.spells,
 * voir data/heroes.ts heroKit) ; la simulation n'en lit que cette copie.
 *
 * Regle commune : le cout en mana est RETENU au debut de l'incantation et
 * RENDU si elle est annulee avant son effet (nouvel ordre, mort, Provocation,
 * cible perdue). Valeurs PROVISOIRES.
 */
export type SpellTargeting = 'self-or-ally';

export interface SpellDef {
  id: string;
  name: string;
  /** Une ligne, pour la fiche et l'ecran de choix du Heros. */
  description: string;
  manaCost: number;
  /** Duree d'incantation (s de simulation) ; le Heros reste sur place. */
  castSeconds: number;
  /** PV rendus a la cible, en unites INTERNES (HP_PER_PIP par PV affiche). */
  healAmount: number;
  /** Portee (cases, centre a centre) pour commencer l'incantation : au-dela,
   *  le Heros s'approche d'abord de sa cible. */
  rangeTiles: number;
  /** Tolerance en fin d'incantation : la cible doit etre encore a
   *  rangeTiles + endRangeMarginTiles, sinon le soin est perdu (mana rendu). */
  endRangeMarginTiles: number;
  /** `self-or-ally` : le lanceur ou une unite alliee vivante (jamais un
   *  batiment). */
  targeting: SpellTargeting;
  /** Icone de la barre d'action (identifiant de ui/itemIcons.ts). */
  icon?: string;
}

export const SPELLS = {
  /** Soin du Paladin : 5 PV apres 2 s, 12 mana (20 avant le 2026-11-02),
   *  a 5 cases. PROVISOIRE. */
  heal: {
    id: 'heal',
    name: 'Soin',
    description: 'Rend 5 PV au Héros ou à un allié proche après 2 s d’incantation.',
    manaCost: 12,
    castSeconds: 2,
    healAmount: 5 * HP_PER_PIP,
    rangeTiles: 5,
    endRangeMarginTiles: 1,
    targeting: 'self-or-ally',
    // Icone propre au Soin du Paladin (ui/itemIcons.ts, SVG).
    icon: 'paladin_heal',
  },
} as const satisfies Record<string, SpellDef>;

export type SpellId = keyof typeof SPELLS;

export function getSpell(id: string): SpellDef {
  const spell = (SPELLS as Record<string, SpellDef>)[id];
  if (!spell) throw new Error(`Sort inconnu : ${id}`);
  return spell;
}
