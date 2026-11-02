/**
 * Ressources transportees (2026-11-02, inventaire unique du Heros) : bois,
 * pierre et or deviennent des objets empilables du sac. Ramasses dans le
 * monde, portes, deposes a la Baliste : alors seulement ils entrent dans le
 * stock de la run (seul utilisable pour payer). L'or produit par une
 * infrastructure (Mine) va directement au stock. Valeurs PROVISOIRES.
 */
export type CarriedResource = 'wood' | 'stone' | 'gold';

export interface ResourceItemDef {
  id: CarriedResource;
  name: string;
  /** Taille maximale d'une pile dans une case du sac. */
  maxStack: number;
  /** Couleur de l'icone et du cadre (#rrggbb). */
  color: string;
}

export const RESOURCE_ITEMS: Readonly<Record<CarriedResource, ResourceItemDef>> = {
  wood: { id: 'wood', name: 'Bois', maxStack: 5, color: '#b07a45' },
  stone: { id: 'stone', name: 'Pierre', maxStack: 5, color: '#9aa3ad' },
  gold: { id: 'gold', name: 'Or', maxStack: 5, color: '#f2c94c' },
};

/** Ordre de depot (une unite toutes les DEPOSIT_SECONDS_PER_ITEM s). */
export const CARRIED_RESOURCES: readonly CarriedResource[] = ['wood', 'stone', 'gold'];
