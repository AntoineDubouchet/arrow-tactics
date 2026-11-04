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
export type SpellTargeting = 'self-or-ally' | 'self';

/** Tourbillon (2026-11-03) : effet canalise SUR le Heros, sans incantation ;
 *  une frappe de zone toutes les `pulseSeconds` pendant `durationSeconds`
 *  (premiere a `pulseSeconds`, jamais a t = 0, derniere a la fin : 10
 *  frappes pour 5 s / 0,5 s depuis le 2026-11-05), `damageRatio` des degats
 *  d'attaque du Heros FIGES au lancement, sur les hostiles a `radiusTiles`
 *  (bord du corps). Lance SANS interrompre l'ordre en cours : un Heros en
 *  deplacement continue vers sa destination (2026-11-05) ; ni attaque de
 *  base, ni autre sort, ni travail pendant l'effet. */
export interface WhirlwindEffect {
  durationSeconds: number;
  pulseSeconds: number;
  radiusTiles: number;
  damageRatio: number;
}

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
  /** Tourbillon : effet canalise (WhirlwindEffect) au lieu d'un soin. */
  whirlwind?: WhirlwindEffect;
  /** Temps de recharge (s de simulation), lance a la FIN de l'effet
   *  (terminee ou Heros mort). Absent : aucun. */
  cooldownSeconds?: number;
  /** Icone de la barre d'action (identifiant de ui/itemIcons.ts). */
  icon?: string;
}

export const SPELLS = {
  /** Soin du Paladin : 15 PV apres 2 s (5 PV avant le 2026-11-02, demande
   *  d'Antoine), 12 mana (20 avant le 2026-11-02), a 5 cases. PROVISOIRE. */
  heal: {
    id: 'heal',
    name: 'Soin',
    description: 'Rend 15 PV au Héros ou à un allié proche après 2 s d’incantation.',
    manaCost: 12,
    castSeconds: 2,
    healAmount: 15 * HP_PER_PIP,
    rangeTiles: 5,
    endRangeMarginTiles: 1,
    targeting: 'self-or-ally',
    // Icone propre au Soin du Paladin (ui/itemIcons.ts, SVG).
    icon: 'paladin_heal',
  },
  // Tourbillon (2026-11-03, demande d'Antoine) : prototype ; recharge de 15 s
  // a partir de la fin de l'effet. 2026-11-05 : 10 frappes de 35 % (350 %
  // sur 5 s, contre 5 x 75 % avant). Valeurs PROVISOIRES.
  whirlwind: {
    id: 'whirlwind',
    name: 'Tourbillon',
    description: 'Tournoie 5 s sans s’arrêter : une frappe toutes les 0,5 s sur les ennemis à 2,25 cases (35 % des dégâts d’attaque figés au lancement). Déplacement libre ; ni attaque ni autre sort pendant l’effet.',
    manaCost: 15,
    castSeconds: 0,
    healAmount: 0,
    rangeTiles: 0,
    endRangeMarginTiles: 0,
    targeting: 'self',
    icon: 'paladin_whirlwind',
    whirlwind: { durationSeconds: 5, pulseSeconds: 0.5, radiusTiles: 2.25, damageRatio: 0.35 },
    cooldownSeconds: 15,
  },
} as const satisfies Record<string, SpellDef>;

export type SpellId = keyof typeof SPELLS;

export function getSpell(id: string): SpellDef {
  const spell = (SPELLS as Record<string, SpellDef>)[id];
  if (!spell) throw new Error(`Sort inconnu : ${id}`);
  return spell;
}
