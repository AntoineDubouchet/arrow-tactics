/**
 * Ressources (2026-11-02, cargo economique du 2026-11-03) : deux categories.
 *
 * - Ressources TRANSPORTEES (bois, pierre, or extrait d'un gisement) : dans
 *   le cargo d'une unite economique (ResourceCargo, jamais une case de
 *   l'inventaire RPG), deposees a un point de collecte : alors seulement
 *   elles entrent dans le stock de la run (seul utilisable pour payer).
 * - MONNAIE (or de butin) : appartient directement au joueur (RunState.gold)
 *   des qu'il est ramasse. Tas d'or au sol, Mine : credit immediat.
 *
 * Valeurs PROVISOIRES.
 */

/** Ce qu'un tas au sol peut contenir : une ressource physique (prise dans
 *  le cargo) ou de l'or de butin (monnaie directe au ramassage). */
export type PileResource = 'wood' | 'stone' | 'gold';

/** Outils de recolte (2026-11-02 ; regle du 2026-11-05, G37 tranchee) : la
 *  hache (bois) et la pioche (pierre ET or des gisements) sont des OUTILS DE
 *  DEPART, a tout le camp des le debut, sans batiment
 *  (STARTING_HARVEST_TOOLS). Aucun batiment ne debloque plus d'outil (l'ancienne
 *  pioche de prospecteur de la Forge a ete retiree) ; World.harvestPermissions
 *  reste le point generique ou un futur outil se brancherait. */
export type HarvestTool = 'axe' | 'pickaxe';

export const HARVEST_TOOLS: Readonly<Record<HarvestTool, { name: string }>> = {
  axe: { name: 'Hache de bûcheron' },
  pickaxe: { name: 'Pioche de mineur' },
};

/** Outils que tout camp possede des le debut d'une partie : bois, pierre et
 *  or recoltables sans aucun batiment. */
export const STARTING_HARVEST_TOOLS: readonly HarvestTool[] = ['axe', 'pickaxe'];

/** Ressource d'une source du monde (arbre, gisement). */
export type HarvestResource = 'wood' | 'stone' | 'gold';

/** Sources de ressources du monde (« harvest nodes ») : arbres (bois), gros
 *  gisements de pierre et d'or, meme logique — quantite finie decomptee a
 *  chaque unite (World.resourceNodeAmounts), outil requis, geste, nom
 *  affiche ; a 0 : source retiree, cases liberees (World.depleteResourceNode).
 *  Toute unite extraite va dans le cargo (cargoResourceOf). PROVISOIRE. */
export interface HarvestNodeKind {
  /** Nom affiche a la selection (« Arbre — 75 bois »). */
  name: string;
  /** Unite affichee (« bois », « pierre », « or »). */
  unit: string;
  /** Quantite totale d'une source. */
  amount: number;
  /** Secondes par unite extraite par un Villageois au contact (le Heros :
   *  x HERO_HARVEST_FACTOR, data/hero.ts). Rythme visuel : voir
   *  HARVEST_STROKES_PER_UNIT. 2026-11-05, PROVISOIRE. */
  seconds: number;
  /** Outil requis (HARVEST_TOOLS, tous de depart). */
  tool: HarvestTool;
  /** Geste au contact (HeroState.working). */
  working: 'chop' | 'mine';
}

// Quantites (2026-11-05, decision d'Antoine, valeurs PROVISOIRES de
// confort : 75 / 250 / 250, contre 20 / 40 / 25 avant) : SEULE source de
// verite pour les sources persistantes (arbres, gros gisements), lue par la
// simulation (World.setMap), le generateur, le camp de depart et l'editeur ;
// les petits tas au sol (MapDef.resourcePiles) ont leurs propres quantites.
// Temps par unite (2026-11-05, passe economie, PROVISOIRE ; 1,5 s pour tout
// avant) : bois 2 s, pierre 2,5 s, or 3 s (le minage est plus lent que la
// coupe, l'or un peu plus que la pierre sans gonfler les reserves) ; avec
// un cargo de 10, un Villageois reste 20 s a un arbre, 25 s a la pierre et
// 30 s a l'or avant de rentrer. La cadence de la pioche suit la ressource
// travaillee (rendu, HARVEST_STROKES_PER_UNIT).
export const HARVEST_NODE_KINDS: Readonly<Record<HarvestResource, HarvestNodeKind>> = {
  wood: { name: 'Arbre', unit: 'bois', amount: 75, seconds: 2, tool: 'axe', working: 'chop' },
  stone: { name: 'Gisement de pierre', unit: 'pierre', amount: 250, seconds: 2.5, tool: 'pickaxe', working: 'mine' },
  // Or (2026-11-02) : transporte comme le reste (minedGold) depuis le
  // 2026-11-03. Pioche ordinaire depuis le 2026-11-05 (plus de Forge requise).
  gold: { name: 'Gisement d’or', unit: 'or', amount: 250, seconds: 3, tool: 'pickaxe', working: 'mine' },
};

/** Secondes par unite pour un geste de travail quand la ressource n'est pas
 *  connue (rendu, repli) : hache = bois, pioche = pierre ; avec la source de
 *  l'ordre, le rendu prend HARVEST_NODE_KINDS[resource].seconds. */
export function harvestSecondsOfWork(working: 'chop' | 'mine'): number {
  return working === 'chop' ? HARVEST_NODE_KINDS.wood.seconds : HARVEST_NODE_KINDS.stone.seconds;
}
/** Coups d'outil joues par unite extraite (rendu) : deux coups de la duree
 *  naturelle du clip par unite, plutot qu'un seul coup au ralenti. */
export const HARVEST_STROKES_PER_UNIT = 2;

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

/** Permissions d'un camp sans aucun batiment : les outils de depart. Valeur
 *  par defaut de World.harvestPermissions (essais, outils internes). */
export const STARTING_HARVEST_PERMISSIONS: HarvestPermissions = { tools: STARTING_HARVEST_TOOLS };

/** Vrai si les outils disponibles permettent d'exploiter la source
 *  `resource` : regle unique (simulation, clics, Heros, Villageois). */
export function canHarvestResource(permissions: HarvestPermissions, resource: HarvestResource): boolean {
  return permissions.tools.includes(HARVEST_NODE_KINDS[resource].tool);
}

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
// Cargo (2026-11-05, passe economie, PROVISOIRE ; Villageois 5 avant) : 10
// pour les deux, un Villageois rentre toutes les 20 a 25 s de travail au
// lieu de 7,5 s (mesure : trajets divises par deux, rendement conserve).
export const CARGO_CAPACITY = { hero: 10, villageois: 10 } as const;

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
