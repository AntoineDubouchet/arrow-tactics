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

/** Sources de ressources du monde (« harvest nodes », 2026-11-02) : arbres
 *  (bois) et gros gisements (pierre), meme logique pour les deux — quantite
 *  finie decomptee a chaque unite recoltee (World.resourceNodeAmounts),
 *  batiment TERMINE qui en debloque l'exploitation (BuildingDef.unlocksHarvest :
 *  Scierie, Camp de mineur), geste du Heros, nom affiche. A 0 : source
 *  retiree (World.depleteResourceNode). PROVISOIRE. */
export interface HarvestNodeKind {
  /** Nom affiche a la selection (« Arbre — 20 bois »). */
  name: string;
  /** Quantite totale d'une source. */
  amount: number;
  /** Droit de recolte requis (BuildingDef.unlocksHarvest). */
  unlock: 'trees' | 'deposits';
  /** Geste du Heros au contact (HeroState.working). */
  working: 'chop' | 'mine';
}

export const HARVEST_NODE_KINDS: Readonly<Record<'wood' | 'stone', HarvestNodeKind>> = {
  wood: { name: 'Arbre', amount: 20, unlock: 'trees', working: 'chop' },
  stone: { name: 'Gisement de pierre', amount: 40, unlock: 'deposits', working: 'mine' },
};

/** Bois total d'un arbre (arbre isole ou bosquet). PROVISOIRE. */
export const TREE_WOOD_AMOUNT = HARVEST_NODE_KINDS.wood.amount;
/** Pierre totale d'un gros gisement (2026-11-02 ; inepuisable avant). PROVISOIRE. */
export const STONE_DEPOSIT_AMOUNT = HARVEST_NODE_KINDS.stone.amount;

/** Vrai si les droits de recolte resolus (World.harvestPermissions) ouvrent
 *  la source de ressource `resource` : regle unique (simulation, clics). */
export function canHarvestResource(permissions: { canHarvestTrees: boolean; canMineDeposits: boolean }, resource: 'wood' | 'stone'): boolean {
  return HARVEST_NODE_KINDS[resource].unlock === 'trees' ? permissions.canHarvestTrees : permissions.canMineDeposits;
}

/** Ordre de depot (une unite toutes les DEPOSIT_SECONDS_PER_ITEM s). */
export const CARRIED_RESOURCES: readonly CarriedResource[] = ['wood', 'stone', 'gold'];
