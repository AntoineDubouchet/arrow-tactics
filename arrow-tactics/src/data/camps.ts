/**
 * Camps neutres (2026-11-02, premiere boucle d'exploration) : types de camp,
 * donnees pures. La carte place des camps (MapDef.camps, emplacement, decor,
 * coffre, postes de garde) ; ce fichier dit qui les garde, comment ils
 * reagissent et ce qu'ils rapportent. Valeurs PROVISOIRES.
 *
 * Un camp est distinct des vagues : ses gardes restent lies a lui (zone de
 * detection, laisse, retour), ne comptent pas pour la fin d'une vague et ne
 * marchent jamais vers la Baliste.
 */
export interface CampKindDef {
  id: string;
  /** Nom affiche (« Camp de pillards »). */
  name: string;
  /** Nom court du catalogue de l'editeur (« Petit camp »). */
  shortName: string;
  /** Gabarit du decor derive (data/campLayout.ts) : le grand camp a une
   *  seconde tente, une seconde banniere et un baril de plus. */
  layout: 'small' | 'large';
  /** Gardes (UNITS), un par poste de garde du camp, dans l'ordre des postes. */
  guards: readonly string[];
  /** Zone de detection (cases, depuis le centre du camp) : un adversaire qui
   *  y entre reveille tout le camp. */
  detectRadius: number;
  /** Laisse (cases, depuis le centre) : une fois le camp en alerte, ses
   *  gardes poursuivent un adversaire tant qu'il reste dans ce rayon, puis
   *  rentrent a leur poste. */
  leashRadius: number;
  /** Fraction des PV max rendue par seconde aux gardes revenus a leur poste,
   *  camp au calme (pas d'usure par allers-retours). */
  regenPerSecond: number;
  /** Table de butin du coffre (data/loot.ts). */
  chestLootTable: string;
  /** Or verse au nettoyage complet du camp. */
  clearGold: number;
}

export const CAMP_KINDS: Readonly<Record<string, CampKindDef>> = {
  raiders_small: {
    id: 'raiders_small',
    name: 'Camp de pillards',
    shortName: 'Petit camp',
    layout: 'small',
    guards: ['maraudeur', 'maraudeur', 'traqueur', 'feticheur'],
    detectRadius: 6,
    leashRadius: 11,
    regenPerSecond: 0.1,
    chestLootTable: 'camp_chest_small',
    clearGold: 8,
  },
  /** Grand camp : trop dur pour un Paladin niveau 1 (il y meurt), gagnable au
   *  niveau 2 avec un premier item ; meilleur butin. */
  raiders_large: {
    id: 'raiders_large',
    name: 'Grand camp de pillards',
    shortName: 'Grand camp',
    layout: 'large',
    guards: ['maraudeur', 'maraudeur', 'ravageur', 'traqueur', 'traqueur', 'feticheur'],
    detectRadius: 6.5,
    leashRadius: 12,
    regenPerSecond: 0.1,
    chestLootTable: 'camp_chest_large',
    clearGold: 15,
  },
};

export function getCampKind(id: string): CampKindDef {
  const kind = CAMP_KINDS[id];
  if (!kind) throw new Error(`Camp inconnu : ${id}`);
  return kind;
}
