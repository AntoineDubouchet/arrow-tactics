import { TALENT_FANTASSIN_DODGE_CHANCE } from '../config/constants';
import type { UnitStats } from '../data/units';
import { isTalentUnlocked, type MetaProgress } from './metaProgress';
import { computePlayerSentinelUpgradeEffects } from './sentinelUpgradeEffects';
import { computePlayerUnitUpgradeEffects } from './unitUpgradeEffects';

/**
 * Statistiques EFFECTIVES d'une unite JOUEUR : SOURCE UNIQUE des bonus
 * appliques a son apparition (World.spawn : armee de la bataille, "Tester le
 * scenario", unites produites par une Caserne) et, plus tard, de la fiche
 * d'entite. Fonctions pures de `unitId` et de la progression : jamais
 * appelees pour une unite ENNEMIE, qui garde ses stats de base plus le buff
 * par vague (computeEnemyUnitUpgradeEffects, voir run/unitUpgradeEffects.ts).
 */

/** Patch de stats a passer a World.spawn (statOverrides) — fusionne DEUX
 *  sources independantes :
 *  1. les talents (pour l'instant, seul "Réflexes de vétéran", esquive des
 *     fantassins) ;
 *  2. la boutique d'amelioration PERMANENTE (voir run/unitUpgradeEffects.ts) :
 *     PV/degats bonus derives du niveau d'amelioration de l'unite.
 *  `undefined` si aucune source ne modifie l'unite (spawn aux stats de base). */
export function playerUnitStatOverrides(unitId: string, progress: MetaProgress): Partial<UnitStats> | undefined {
  const overrides: Partial<UnitStats> = {};
  if (unitId === 'fantassin' && isTalentUnlocked(progress, 'reflexes_fantassin')) {
    overrides.dodgeChance = TALENT_FANTASSIN_DODGE_CHANCE;
  }
  Object.assign(overrides, computePlayerUnitUpgradeEffects(unitId, progress).statOverrides);
  // Sentinelle : amelioration permanente DEDIEE (voir data/sentinelUpgrade.ts),
  // pas enregistree dans UNIT_UPGRADES — sans ce cas special,
  // computePlayerUnitUpgradeEffects ci-dessus renvoie toujours un
  // statOverrides vide pour 'sentinel'.
  if (unitId === 'sentinel') {
    Object.assign(overrides, computePlayerSentinelUpgradeEffects(progress).statOverrides);
  }
  return Object.keys(overrides).length > 0 ? overrides : undefined;
}

/** Bonus de degats de CAPACITE (voir Entity.abilityDamageBonus,
 *  sim/systems/abilities.ts) — boutique d'amelioration permanente,
 *  Mage/Boule de feu pour l'instant (voir data/unitUpgrades.ts,
 *  primaryDamageTarget: 'ability'). 0 par defaut. */
export function playerUnitAbilityDamageBonus(unitId: string, progress: MetaProgress): number {
  return computePlayerUnitUpgradeEffects(unitId, progress).abilityDamageBonus;
}

/** Bonus de bouclier PAR ENNEMI PROVOQUE (voir Entity.tauntShieldBonus,
 *  data/abilities.ts TauntAbility.baseShieldPerTarget) — boutique
 *  d'amelioration permanente de la Sentinelle (voir
 *  run/sentinelUpgradeEffects.ts). 0 pour toute autre unite. */
export function playerUnitTauntShieldBonus(unitId: string, progress: MetaProgress): number {
  return unitId === 'sentinel' ? computePlayerSentinelUpgradeEffects(progress).tauntShieldBonusInternal : 0;
}
