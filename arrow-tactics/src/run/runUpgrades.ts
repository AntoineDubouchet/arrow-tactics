import { BALLISTA_UPGRADE } from '../data/ballistaUpgrade';
import type { MetaProgress } from './metaProgress';
import { roundGold } from './runState';

/**
 * Niveaux d'amelioration de la RUN en cours (2026-11-05, Pass 2) : SEULE
 * source des progressions GLOBALES a la run, portee par RunState.upgrades
 * (id -> niveau, jamais sauvegardee, disparait avec la run). Trois familles
 * y cohabitent, chacune reconnue par son id :
 *  - 'ballista' : niveaux repetes de la Baliste (data/ballistaUpgrade.ts) ;
 *  - technologies (data/technologies.ts : 'forge_weapons', 'forge_armor',
 *    'barracks_training') : 1 = acquise (un palier II/III serait un niveau
 *    de plus) ;
 *  - niveaux des batiments producteurs a portee 'run' (id = id du batiment,
 *    data/buildings.ts upgradeScope : 'barracks', 'archery', 'shrine',
 *    'stables') : un seul niveau par type, pour tous les exemplaires.
 * Toutes s'obtiennent par la file temps reel d'un batiment (run/productionOrders.ts),
 * payees a la commande, et sont RETROACTIVES sur les unites presentes
 * (run/playerUnitStats.ts). Mine, Tour et Eglise gardent un niveau propre a
 * chaque exemplaire (OwnedBuilding.level, run/buildingUpgrades.ts).
 */
export type RunUpgradeLevels = Record<string, number>;

/** Niveau AFFICHE au joueur (fiches) : le niveau interne compte les
 *  ameliorations obtenues depuis 0, l'affichage commence a 1. */
export function displayedUpgradeLevel(level: number): number {
  return level + 1;
}

/** Niveau d'une amelioration, 0 si elle n'a jamais ete obtenue. */
export function runUpgradeLevel(levels: Readonly<RunUpgradeLevels>, id: string): number {
  return Object.prototype.hasOwnProperty.call(levels, id) ? (levels[id] ?? 0) : 0;
}

/** Niveau suivant de l'amelioration `id` (deja payee a la commande). */
export function grantRunUpgradeLevel(levels: RunUpgradeLevels, id: string): number {
  const next = runUpgradeLevel(levels, id) + 1;
  levels[id] = next;
  return next;
}

/**
 * Sources de la progression du joueur pour les statistiques effectives :
 * - `talents` : progression PERMANENTE (talents debloques) ;
 * - `upgrades` : niveaux d'amelioration de la RUN (ci-dessus).
 * Construite par main.ts (playerProgression), jamais stockee.
 */
export interface PlayerProgression {
  talents: MetaProgress;
  upgrades: RunUpgradeLevels;
}

// --- Baliste ---------------------------------------------------------------

/** Bareme PROVISOIRE du niveau suivant de la Baliste : 1 or au niveau 0 -> 1,
 *  puis x2 a chaque niveau (1, 2, 4, 8, 16...). Seul endroit a modifier. */
export const BALLISTA_UPGRADE_GOLD_COST_BASE = 1;
export const BALLISTA_UPGRADE_GOLD_COST_GROWTH = 2;

export function ballistaUpgradeGoldCost(level: number): number {
  return roundGold(BALLISTA_UPGRADE_GOLD_COST_BASE * BALLISTA_UPGRADE_GOLD_COST_GROWTH ** level);
}

/** Vrai tant que la Baliste n'a pas atteint BALLISTA_UPGRADE.maxLevel
 *  (aucun plafond aujourd'hui). */
export function canBallistaLevelUp(level: number): boolean {
  return BALLISTA_UPGRADE.maxLevel === undefined || level < BALLISTA_UPGRADE.maxLevel;
}
