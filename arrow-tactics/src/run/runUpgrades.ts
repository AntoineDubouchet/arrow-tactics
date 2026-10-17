import { BALLISTA_UPGRADE } from '../data/ballistaUpgrade';
import { BARRACKS_UPGRADE } from '../data/barracksUpgrade';
import { HEAL_SCROLL_UPGRADE } from '../data/healScrollUpgrade';
import { ICE_NOVA_UPGRADE } from '../data/iceNovaUpgrade';
import { MINE_UPGRADE } from '../data/mineUpgrade';
import { SENTINEL_UPGRADE } from '../data/sentinelUpgrade';
import { SHADOW_UPGRADE } from '../data/shadowUpgrade';
import { UNIT_UPGRADES } from '../data/unitUpgrades';
import type { MetaProgress } from './metaProgress';
import { roundGold, spendGold, type RunState } from './runState';

/**
 * Niveaux d'amelioration de la RUN en cours : id d'amelioration (memes cles
 * que les definitions de data/ : 'fantassin', 'archer', 'mage', 'sentinel',
 * 'ballista', 'mine', 'barracks', 'heal_scroll_minor', 'ice_nova',
 * 'soins_excedentaires') -> niveau achete. Portes par RunState.upgrades :
 * jamais sauvegardes, ils disparaissent avec la run. Seule source des
 * niveaux lue par les formules d'effet (run/*UpgradeEffects.ts) pendant une
 * run.
 */
export type RunUpgradeLevels = Record<string, number>;

/** Niveau d'une amelioration, 0 si elle n'a jamais ete achetee. */
export function runUpgradeLevel(levels: Readonly<RunUpgradeLevels>, id: string): number {
  return Object.prototype.hasOwnProperty.call(levels, id) ? (levels[id] ?? 0) : 0;
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

/**
 * TRANSITION (etape F0) : copie des niveaux PERMANENTS achetes dans la
 * boutique du menu (MetaProgress.unitUpgrades) en niveaux de run. Utilisee
 * a la creation d'une run, pour que celle-ci demarre avec les memes niveaux
 * qu'avant l'introduction de RunState.upgrades, et par la boutique du menu,
 * qui affiche encore ces niveaux permanents. Renvoie toujours un NOUVEL
 * objet : modifier l'un ne modifie jamais l'autre. A retirer quand les
 * ameliorations seront achetees pendant la run.
 */
export function copyMetaUpgradeLevelsForRun(progress: MetaProgress): RunUpgradeLevels {
  const levels: RunUpgradeLevels = {};
  for (const [id, state] of Object.entries(progress.unitUpgrades)) levels[id] = state.level;
  return levels;
}

// --- Achat d'ameliorations de run en Or ---------------------------------
//
// Circuit DISTINCT de l'ancienne boutique du menu (Runes, MetaProgress, voir
// run/metaProgress.ts purchaseUpgrade) : il ne lit et n'ecrit que
// RunState.gold et RunState.upgrades. Aucun talent n'en modifie le cout.

/** Limites d'une amelioration achetable : `maxLevel` absent = sans maximum. */
interface RunUpgradeLimits {
  maxLevel?: number;
}

/** Ameliorations achetables, par id (memes cles que RunState.upgrades). */
const RUN_UPGRADE_DEFS: Readonly<Record<string, RunUpgradeLimits>> = {
  ...UNIT_UPGRADES,
  [SENTINEL_UPGRADE.id]: SENTINEL_UPGRADE,
  [BALLISTA_UPGRADE.id]: BALLISTA_UPGRADE,
  [MINE_UPGRADE.id]: MINE_UPGRADE,
  [BARRACKS_UPGRADE.id]: BARRACKS_UPGRADE,
  [HEAL_SCROLL_UPGRADE.id]: HEAL_SCROLL_UPGRADE,
  [ICE_NOVA_UPGRADE.id]: ICE_NOVA_UPGRADE,
  [SHADOW_UPGRADE.id]: SHADOW_UPGRADE,
};

/** Vrai si `id` designe une amelioration achetable. */
export function isRunUpgradeId(id: string): boolean {
  return Object.prototype.hasOwnProperty.call(RUN_UPGRADE_DEFS, id);
}

/** Bareme PROVISOIRE (meme courbe numerique que l'ancienne boutique) :
 *  10 Or pour passer du niveau 0 au niveau 1, puis x2 a chaque niveau.
 *  Seul endroit a modifier pour le reequilibrer. */
export const RUN_UPGRADE_GOLD_COST_BASE = 10;
export const RUN_UPGRADE_GOLD_COST_GROWTH = 2;

/** Cout en Or du niveau suivant, depuis le niveau `level` deja atteint. */
export function runUpgradeGoldCost(level: number): number {
  return roundGold(RUN_UPGRADE_GOLD_COST_BASE * RUN_UPGRADE_GOLD_COST_GROWTH ** level);
}

/** Vrai si l'amelioration `id` peut etre achetee maintenant : id connu,
 *  maximum non atteint, Or suffisant pour le niveau suivant. */
export function canPurchaseRunUpgrade(run: RunState, id: string): boolean {
  if (!isRunUpgradeId(id)) return false;
  const level = runUpgradeLevel(run.upgrades, id);
  const maxLevel = RUN_UPGRADE_DEFS[id]!.maxLevel;
  if (maxLevel !== undefined && level >= maxLevel) return false;
  return run.gold >= runUpgradeGoldCost(level);
}

/** Achete un niveau de l'amelioration `id` avec l'Or de la run : debite le
 *  cout (spendGold) puis augmente le niveau de 1. Tout ou rien : en cas de
 *  refus, ni l'Or ni le niveau ne changent. */
export function purchaseRunUpgrade(run: RunState, id: string): boolean {
  if (!canPurchaseRunUpgrade(run, id)) return false;
  const level = runUpgradeLevel(run.upgrades, id);
  if (!spendGold(run, runUpgradeGoldCost(level))) return false;
  run.upgrades[id] = level + 1;
  return true;
}
