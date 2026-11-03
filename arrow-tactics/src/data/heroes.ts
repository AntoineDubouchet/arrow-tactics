import { HERO_UNIT_ID } from './hero';
import { getSpell, type SpellDef, type SpellId } from './spells';

/**
 * Heros jouables (2026-11-02, ecran « Choisir votre Heros ») : donnees pures.
 * Un seul aujourd'hui, le Paladin (le Heros existant). Chaque entree decrit
 * ce qui distinguera les futurs heros : unite de simulation (stats de base,
 * niveaux de data/hero.ts), modele et portrait, mana, sorts, equipement de
 * depart. Valeurs PROVISOIRES.
 */
export interface HeroManaDef {
  max: number;
  initial: number;
  /** Mana rendu par seconde de simulation (fige en pause). */
  regenPerSecond: number;
}

export interface HeroDef {
  id: string;
  name: string;
  /** Une ou deux phrases, ecran de choix. */
  description: string;
  /** Unite de simulation (data/units.ts) : stats de base et progression. */
  unitId: string;
  /** Modele Toon RTS (render/toonUnitRig.ts) et teinte du portrait, en
   *  identifiants simples : la couche donnees ne depend pas du rendu. */
  model: { kind: string; palette: string };
  mana: HeroManaDef;
  spells: readonly SpellId[];
  /** Objets de depart (data/items.ts), aucun pour l'instant. */
  startingEquipment: readonly string[];
}

export const HEROES: readonly HeroDef[] = [
  {
    id: 'paladin',
    name: 'Paladin',
    description: 'Combattant robuste au marteau, il récolte, construit et soigne ses alliés.',
    unitId: HERO_UNIT_ID,
    model: { kind: 'hero', palette: 'blue' },
    // Niveau 1 : 20 (2026-11-02, demande d'Antoine ; 100 avant). Les niveaux
    // suivants ne changent pas encore le mana (decision ouverte).
    mana: { max: 20, initial: 20, regenPerSecond: 2 },
    // Tourbillon (2026-11-03) : deuxieme case de la barre des sorts.
    spells: ['heal', 'whirlwind'],
    startingEquipment: [],
  },
];

export const DEFAULT_HERO_ID = 'paladin';

export function getHero(id: string): HeroDef {
  return HEROES.find((h) => h.id === id) ?? HEROES[0]!;
}

/** Parametres resolus copies sur le Heros a son apparition (World.spawnHero) :
 *  la simulation ne relit jamais HEROES ni SPELLS. */
export interface HeroKit {
  heroId: string;
  maxMana: number;
  manaRegen: number;
  spells: readonly SpellDef[];
}

export function heroKit(id: string): HeroKit {
  const def = getHero(id);
  return { heroId: def.id, maxMana: def.mana.max, manaRegen: def.mana.regenPerSecond, spells: def.spells.map(getSpell) };
}
