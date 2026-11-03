/**
 * Ressources (2026-11-02) : deux categories.
 *
 * - Ressources PHYSIQUES transportees (bois, pierre, futurs materiaux) :
 *   objets empilables du sac du Heros (ou charge d'un Villageois), ramasses
 *   dans le monde, portes, deposes : alors seulement elles entrent dans le
 *   stock de la run (seul utilisable pour payer).
 * - MONNAIE (or) : appartient directement au joueur (RunState.gold), jamais
 *   dans un sac. Tas d'or au sol, gisement d'or, Mine : credit immediat.
 *
 * Valeurs PROVISOIRES.
 */
export type CarriedResource = 'wood' | 'stone';

/** Ce qu'un tas au sol peut contenir : une ressource physique ou de l'or
 *  (monnaie, ramasse d'un clic, World.collectGoldPile). */
export type PileResource = CarriedResource | 'gold';

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
};

/** Outils de recolte (2026-11-02) : debloques pour tout le camp par un
 *  batiment TERMINE qui les porte (BuildingDef.unlocksTools : la Forge). */
export type HarvestTool = 'axe' | 'pickaxe';

export const HARVEST_TOOLS: Readonly<Record<HarvestTool, { name: string }>> = {
  axe: { name: 'Hache de bûcheron' },
  pickaxe: { name: 'Pioche de mineur' },
};

/** Ressource d'une source du monde (arbre, gisement). */
export type HarvestResource = 'wood' | 'stone' | 'gold';

/** Sources de ressources du monde (« harvest nodes ») : arbres (bois), gros
 *  gisements de pierre et d'or, meme logique — quantite finie decomptee a
 *  chaque unite (World.resourceNodeAmounts), outil requis, geste, nom
 *  affiche ; a 0 : source retiree, cases liberees (World.depleteResourceNode).
 *  `currency` : chaque unite extraite credite directement l'or du joueur
 *  (jamais le sac). PROVISOIRE. */
export interface HarvestNodeKind {
  /** Nom affiche a la selection (« Arbre — 20 bois »). */
  name: string;
  /** Unite affichee (« bois », « pierre », « or »). */
  unit: string;
  /** Quantite totale d'une source. */
  amount: number;
  /** Outil requis (HARVEST_TOOLS, debloque par la Forge). */
  tool: HarvestTool;
  /** Geste au contact (HeroState.working). */
  working: 'chop' | 'mine';
  /** Vrai : monnaie creditee a chaque unite (or), pas de transport. */
  currency: boolean;
}

export const HARVEST_NODE_KINDS: Readonly<Record<HarvestResource, HarvestNodeKind>> = {
  wood: { name: 'Arbre', unit: 'bois', amount: 20, tool: 'axe', working: 'chop', currency: false },
  stone: { name: 'Gisement de pierre', unit: 'pierre', amount: 40, tool: 'pickaxe', working: 'mine', currency: false },
  // Or (2026-11-02) : plus rare que la pierre, credite directement (25 or).
  gold: { name: 'Gisement d’or', unit: 'or', amount: 25, tool: 'pickaxe', working: 'mine', currency: true },
};

/** Bois total d'un arbre (arbre isole ou bosquet). PROVISOIRE. */
export const TREE_WOOD_AMOUNT = HARVEST_NODE_KINDS.wood.amount;
/** Pierre totale d'un gros gisement. PROVISOIRE. */
export const STONE_DEPOSIT_AMOUNT = HARVEST_NODE_KINDS.stone.amount;
/** Or total d'un gisement d'or. PROVISOIRE. */
export const GOLD_DEPOSIT_AMOUNT = HARVEST_NODE_KINDS.gold.amount;

/** Outils disponibles pour un camp (World.harvestPermissions). */
export interface HarvestPermissions {
  tools: readonly HarvestTool[];
}

export const NO_HARVEST_TOOLS: HarvestPermissions = { tools: [] };

/** Vrai si les outils disponibles permettent d'exploiter la source
 *  `resource` : regle unique (simulation, clics, Heros, Villageois). */
export function canHarvestResource(permissions: HarvestPermissions, resource: HarvestResource): boolean {
  return permissions.tools.includes(HARVEST_NODE_KINDS[resource].tool);
}

/** Ordre de depot (une unite toutes les DEPOSIT_SECONDS_PER_ITEM s). */
export const CARRIED_RESOURCES: readonly CarriedResource[] = ['wood', 'stone'];

// --- Cargo economique (2026-11-03) -------------------------------------------

/** Ressources TRANSPORTEES (jamais dans l'inventaire RPG) : bois, pierre et
 *  or EXTRAIT d'un gisement (`minedGold`). L'or de butin (monstres, coffres,
 *  barils, recompenses) n'en fait pas partie : monnaie directe. */
export type CargoResource = 'wood' | 'stone' | 'minedGold';
export const CARGO_RESOURCES: readonly CargoResource[] = ['wood', 'stone', 'minedGold'];

/** Sac de ressources d'une unite economique (Heros, Villageois) : compteurs
 *  et capacite TOTALE (toutes ressources confondues). Aucun InventorySlot. */
export interface ResourceCargo {
  wood: number;
  stone: number;
  minedGold: number;
  capacity: number;
}

/** Capacites PROVISOIRES, centralisees. */
export const CARGO_CAPACITY = { hero: 10, villageois: 5 } as const;

export function createCargo(capacity: number): ResourceCargo {
  return { wood: 0, stone: 0, minedGold: 0, capacity };
}

export function cargoTotal(c: Pick<ResourceCargo, 'wood' | 'stone' | 'minedGold'>): number {
  return c.wood + c.stone + c.minedGold;
}

export function cargoRoom(c: ResourceCargo): number {
  return Math.max(0, c.capacity - cargoTotal(c));
}

/** Ressource de cargo produite par une source ou un tas (or de gisement ->
 *  or extrait ; l'or de butin au sol n'est PAS une ressource de cargo). */
export function cargoResourceOf(resource: HarvestResource): CargoResource {
  return resource === 'gold' ? 'minedGold' : resource;
}

/** Noms affiches des ressources de cargo (fiches). */
export const CARGO_LABELS: Readonly<Record<CargoResource, string>> = { wood: 'Bois', stone: 'Pierre', minedGold: 'Or' };
