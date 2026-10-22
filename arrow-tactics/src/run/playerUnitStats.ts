import { TALENT_FANTASSIN_DODGE_CHANCE } from '../config/constants';
import type { UnitStats } from '../data/units';
import { isTalentUnlocked } from './metaProgress';
import type { PlayerProgression } from './runUpgrades';
import { computePlayerUnitUpgradeEffects } from './unitUpgradeEffects';

/**
 * Statistiques EFFECTIVES d'une unite JOUEUR : SOURCE UNIQUE des bonus
 * appliques a son apparition (World.spawn : armee de la bataille, "Tester le
 * scenario", unites produites par une Caserne) et de la fiche d'entite.
 * Fonctions pures de `unitId`, du NIVEAU DE PRODUCTION propre a l'unite
 * (fixe a sa creation, voir run/unitUpgradeEffects.ts) et des talents
 * permanents : jamais du niveau de Forge courant, pour qu'une amelioration
 * ne soit jamais retroactive. Jamais appelees pour une unite ENNEMIE, qui
 * garde ses stats de base plus le renforcement par vague
 * (computeEnemyUnitUpgradeEffects).
 */

/** Patch de stats a passer a World.spawn (statOverrides) — fusionne DEUX
 *  sources independantes :
 *  1. les talents (pour l'instant, seul "Réflexes de vétéran", esquive des
 *     fantassins) ;
 *  2. le niveau de production de l'unite (PV/degats).
 *  `undefined` si aucune source ne modifie l'unite (spawn aux stats de base). */
export function playerUnitStatOverrides(unitId: string, productionLevel: number, progress: PlayerProgression): Partial<UnitStats> | undefined {
  const overrides: Partial<UnitStats> = {};
  if (unitId === 'fantassin' && isTalentUnlocked(progress.talents, 'reflexes_fantassin')) {
    overrides.dodgeChance = TALENT_FANTASSIN_DODGE_CHANCE;
  }
  Object.assign(overrides, computePlayerUnitUpgradeEffects(unitId, productionLevel).statOverrides);
  return Object.keys(overrides).length > 0 ? overrides : undefined;
}

/** Bonus de degats de CAPACITE (voir Entity.abilityDamageBonus,
 *  sim/systems/abilities.ts) — Boule de feu du Mage. 0 par defaut. */
export function playerUnitAbilityDamageBonus(unitId: string, productionLevel: number): number {
  return computePlayerUnitUpgradeEffects(unitId, productionLevel).abilityDamageBonus;
}

/** Bonus de bouclier PAR ENNEMI PROVOQUE (voir Entity.tauntShieldBonus,
 *  data/abilities.ts TauntAbility.baseShieldPerTarget) — Sentinelle. 0 pour
 *  toute autre unite. */
export function playerUnitTauntShieldBonus(unitId: string, productionLevel: number): number {
  return computePlayerUnitUpgradeEffects(unitId, productionLevel).tauntShieldBonus;
}
