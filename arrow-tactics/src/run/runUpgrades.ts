import { BALLISTA_UPGRADE } from '../data/ballistaUpgrade';
import { HEAL_SCROLL_UPGRADE } from '../data/healScrollUpgrade';
import { ICE_NOVA_UPGRADE } from '../data/iceNovaUpgrade';
import { SHADOW_UPGRADE } from '../data/shadowUpgrade';
import { UNIT_UPGRADES, type UpgradeDefBase } from '../data/unitUpgrades';
import type { MetaProgress } from './metaProgress';
import { roundGold, spendGold, type RunState } from './runState';

/**
 * Niveaux d'amelioration de la RUN en cours : id d'amelioration (memes cles
 * que les definitions de data/ : 'fantassin', 'archer', 'mage', 'sentinel',
 * 'ballista', 'mine', 'heal_scroll_minor', 'ice_nova',
 * 'soins_excedentaires') -> niveau achete. Portes par RunState.upgrades :
 * jamais sauvegardes, ils disparaissent avec la run. Seule source des
 * niveaux lue par les formules d'effet (run/*UpgradeEffects.ts) pendant une
 * run.
 */
export type RunUpgradeLevels = Record<string, number>;

/** Niveau AFFICHE au joueur (fiches, Forge) : le niveau interne compte les
 *  ameliorations achetees depuis 0, l'affichage commence a 1. */
export function displayedUpgradeLevel(level: number): number {
  return level + 1;
}

/** Niveau d'une amelioration, 0 si elle n'a jamais ete achetee. */
export function runUpgradeLevel(levels: Readonly<RunUpgradeLevels>, id: string): number {
  return Object.prototype.hasOwnProperty.call(levels, id) ? (levels[id] ?? 0) : 0;
}

/** Amelioration de Forge propre a une entite du joueur, par id de
 *  definition (batiment de data/buildings.ts). Absente = entite sans
 *  amelioration de Forge commune : Forge ; Mine et Caserne, dont le niveau
 *  est propre a chaque batiment (run/buildingUpgrades.ts) ; unites, qui
 *  portent chacune leur niveau de production (OwnedUnit.productionLevel). */
const ENTITY_UPGRADE_IDS: Readonly<Record<string, string>> = {
  ballista: BALLISTA_UPGRADE.id,
};

/** Niveau de run de l'amelioration d'une entite du joueur (le meme pour
 *  toutes les entites d'un type), ou null si aucune amelioration de Forge ne
 *  la concerne. */
export function entityRunUpgradeLevel(levels: Readonly<RunUpgradeLevels>, definitionId: string): number | null {
  if (!Object.prototype.hasOwnProperty.call(ENTITY_UPGRADE_IDS, definitionId)) return null;
  const id = ENTITY_UPGRADE_IDS[definitionId];
  return id === undefined ? null : runUpgradeLevel(levels, id);
}

/**
 * Sources de la progression du joueur pour les statistiques effectives :
 * - `talents` : progression PERMANENTE (talents debloques) ;
 * - `upgrades` : niveaux d'amelioration de la RUN.
 * Construite par main.ts (playerProgression), jamais stockee.
 */
export interface PlayerProgression {
  talents: MetaProgress;
  upgrades: RunUpgradeLevels;
}

// --- Achat d'ameliorations de run en Or (boutique de la Forge) ----------
//
// Ne lit et n'ecrit que RunState.gold et RunState.upgrades. Aucun talent n'en
// modifie le cout.

/** Ameliorations achetables, par id (memes cles que RunState.upgrades). */
const RUN_UPGRADE_DEFS: Readonly<Record<string, UpgradeDefBase>> = {
  ...UNIT_UPGRADES,
  [BALLISTA_UPGRADE.id]: BALLISTA_UPGRADE,
  [HEAL_SCROLL_UPGRADE.id]: HEAL_SCROLL_UPGRADE,
  [ICE_NOVA_UPGRADE.id]: ICE_NOVA_UPGRADE,
  [SHADOW_UPGRADE.id]: SHADOW_UPGRADE,
};

/** Batiment qui donne acces a une amelioration de run : la Forge (production
 *  des unites, Baliste) ou l'Eglise (parchemins de soin et de Nova de glace,
 *  Soins excedentaires). Simple point d'acces : le niveau reste celui de la
 *  run, partage par toutes les Forges ou Eglises possedees. */
export type RunUpgradeSite = 'forge' | 'church';

const CHURCH_UPGRADE_IDS: ReadonlySet<string> = new Set([HEAL_SCROLL_UPGRADE.id, ICE_NOVA_UPGRADE.id, SHADOW_UPGRADE.id]);

export function runUpgradeSite(id: string): RunUpgradeSite {
  return CHURCH_UPGRADE_IDS.has(id) ? 'church' : 'forge';
}

/** Vrai si `id` designe une amelioration achetable. */
export function isRunUpgradeId(id: string): boolean {
  return Object.prototype.hasOwnProperty.call(RUN_UPGRADE_DEFS, id);
}

/** Bareme PROVISOIRE, seul endroit a modifier pour le reequilibrer : cout
 *  du niveau 0 -> 1 (RUN_UPGRADE_GOLD_COST_BASE), puis
 *  x RUN_UPGRADE_GOLD_COST_GROWTH a chaque niveau : 1, 2, 4, 8, 16... Les
 *  niveaux de production d'unite (data/unitUpgrades.ts) partent de
 *  UNIT_UPGRADE_GOLD_COST_BASE : 7, 14, 28, 56... (un niveau regroupe trois
 *  anciens achats, 1 + 2 + 4). Mine et Caserne ont leur propre bareme par
 *  batiment (run/buildingUpgrades.ts). */
export const RUN_UPGRADE_GOLD_COST_BASE = 1;
export const UNIT_UPGRADE_GOLD_COST_BASE = 7;
export const RUN_UPGRADE_GOLD_COST_GROWTH = 2;

/** Cout en Or du niveau suivant de l'amelioration `id`, depuis le niveau
 *  `level` deja atteint. */
export function runUpgradeGoldCost(id: string, level: number): number {
  const base = Object.prototype.hasOwnProperty.call(UNIT_UPGRADES, id) ? UNIT_UPGRADE_GOLD_COST_BASE : RUN_UPGRADE_GOLD_COST_BASE;
  return roundGold(base * RUN_UPGRADE_GOLD_COST_GROWTH ** level);
}

/** Vrai si l'amelioration `id` peut etre achetee maintenant : id connu,
 *  maximum non atteint, Or suffisant pour le niveau suivant. */
export function canPurchaseRunUpgrade(run: RunState, id: string): boolean {
  if (!isRunUpgradeId(id)) return false;
  const level = runUpgradeLevel(run.upgrades, id);
  const maxLevel = RUN_UPGRADE_DEFS[id]!.maxLevel;
  if (maxLevel !== undefined && level >= maxLevel) return false;
  return run.gold >= runUpgradeGoldCost(id, level);
}

/** Achete un niveau de l'amelioration `id` avec l'Or de la run : debite le
 *  cout (spendGold) puis augmente le niveau de 1. Tout ou rien : en cas de
 *  refus, ni l'Or ni le niveau ne changent. */
export function purchaseRunUpgrade(run: RunState, id: string): boolean {
  if (!canPurchaseRunUpgrade(run, id)) return false;
  const level = runUpgradeLevel(run.upgrades, id);
  if (!spendGold(run, runUpgradeGoldCost(id, level))) return false;
  run.upgrades[id] = level + 1;
  return true;
}
