import type { MetaProgress } from './metaProgress';

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
