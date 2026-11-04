import type { ResourceKind } from '../config/resourceNodes';
import { getTechnology, TECHNOLOGIES, technologiesAt, type TechnologyDef } from '../data/technologies';
import { sumUnitBonuses, type UnitBonus } from '../data/unitBonus';
import { isMilitaryUnit } from '../data/units';
import { runUpgradeLevel, type RunUpgradeLevels } from './runUpgrades';
import type { RunState } from './runState';

/**
 * Technologies de run (data/technologies.ts) cote etat de run : acquise ou
 * non (RunState.upgrades[id] >= 1), cout (or + stock), bonus cumule pour une
 * unite. La commande et la fin de recherche (file temps reel) sont dans
 * run/productionOrders.ts.
 */

export function isTechnologyAcquired(levels: Readonly<RunUpgradeLevels>, techId: string): boolean {
  return runUpgradeLevel(levels, techId) >= 1;
}

/** Vrai si la recherche de `techId` est AUTORISEE depuis un site de niveau
 *  `siteLevel` : pas encore acquise, niveau du site suffisant. L'argent et
 *  la file sont verifies a part. */
export function isTechnologyAvailable(levels: Readonly<RunUpgradeLevels>, techId: string, siteLevel: number): boolean {
  const def = getTechnology(techId);
  return !isTechnologyAcquired(levels, techId) && siteLevel >= (def.requiresSiteLevel ?? 0);
}

export function canAffordTechnology(run: Pick<RunState, 'gold' | 'resources'>, def: TechnologyDef): boolean {
  if (run.gold < def.goldCost) return false;
  for (const [kind, amount] of Object.entries(def.resourceCost) as [ResourceKind, number][]) {
    if ((run.resources[kind] ?? 0) < amount) return false;
  }
  return true;
}

/** Technologies de `siteId` avec leur etat pour la fiche : acquise, en
 *  recherche (`pending` fourni par l'orchestration), ou disponible
 *  (niveau du site et plafond), avec le detail « payable ». */
export interface TechnologyStatus {
  def: TechnologyDef;
  state: 'done' | 'pending' | 'locked' | 'available';
  affordable: boolean;
}

export function technologyStatusesAt(siteId: string, run: Pick<RunState, 'gold' | 'resources' | 'upgrades'>, siteLevel: number, pending: (techId: string) => boolean): TechnologyStatus[] {
  return technologiesAt(siteId).map((def) => {
    const state = isTechnologyAcquired(run.upgrades, def.id) ? 'done' : pending(def.id) ? 'pending' : siteLevel < (def.requiresSiteLevel ?? 0) ? 'locked' : 'available';
    return { def, state, affordable: canAffordTechnology(run, def) };
  });
}

/** Bonus cumule des technologies ACQUISES qui visent `unitId` (militaire ou
 *  cible nommee). Objet frais. */
export function technologyUnitBonus(levels: Readonly<RunUpgradeLevels>, unitId: string): Required<UnitBonus> {
  const bonuses: UnitBonus[] = [];
  const military = isMilitaryUnit(unitId);
  for (const def of Object.values(TECHNOLOGIES)) {
    const level = runUpgradeLevel(levels, def.id);
    if (level < 1) continue;
    for (const effect of def.effects) {
      const applies = effect.target.kind === 'military' ? military : effect.target.unitId === unitId;
      if (applies) bonuses.push(effect.bonus);
    }
  }
  return sumUnitBonuses(bonuses);
}
