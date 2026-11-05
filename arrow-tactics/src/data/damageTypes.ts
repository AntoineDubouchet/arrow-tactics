/**
 * Types et ecoles de degats (2026-11-05, G46 puis G47) : donnees pures,
 * partagees par la simulation (sim/damage.ts), les items (data/equipment.ts)
 * et l'interface.
 *
 * Deux familles (`DamageType`) : `physical` (melee, armes, projectiles
 * d'Archer et de Baliste, Charge, Tourbillon) et `magic` (Boule de feu,
 * effets d'arme elementaires, futurs sorts).
 *
 * Six ecoles (`DamageSchool`), sous-classification des degats MAGIQUES
 * seulement : un degat physique n'a jamais d'ecole. Elles ne changent aucun
 * montant aujourd'hui et n'ont aucun effet de statut (le givre ne ralentit
 * pas) : le type et l'ecole sont portes par les evenements, prets pour les
 * resistances, l'equipement et l'interface. PROVISOIRE.
 */
export type DamageType = 'physical' | 'magic';

export type DamageSchool = 'fire' | 'frost' | 'arcane' | 'nature' | 'holy' | 'shadow';

export interface DamageSchoolDef {
  id: DamageSchool;
  /** Nom affiche, apres « dégâts de » (« feu », « givre »...). */
  label: string;
  /** Pictogramme du texte flottant de degats. */
  glyph: string;
}

export const DAMAGE_SCHOOLS: Readonly<Record<DamageSchool, DamageSchoolDef>> = {
  fire: { id: 'fire', label: 'feu', glyph: '🔥' },
  frost: { id: 'frost', label: 'givre', glyph: '❄' },
  arcane: { id: 'arcane', label: 'arcane', glyph: '✦' },
  nature: { id: 'nature', label: 'nature', glyph: '❧' },
  holy: { id: 'holy', label: 'sacré', glyph: '✚' },
  shadow: { id: 'shadow', label: 'ombre', glyph: '☾' },
};

export const DAMAGE_SCHOOL_ORDER: readonly DamageSchool[] = ['fire', 'frost', 'arcane', 'nature', 'holy', 'shadow'];
