import { HP_PER_PIP, SHIELD_PER_TAUNTED_ENEMY } from '../config/constants';
import { SENTINEL_UPGRADE } from '../data/sentinelUpgrade';
import { getUnit, type UnitStats } from '../data/units';
import { getUnitUpgradeLevel, type MetaProgress } from './metaProgress';

/**
 * Amelioration permanente de la SENTINELLE (2026-08-14, voir
 * data/sentinelUpgrade.ts) — meme principe que run/ballistaUpgradeEffects.ts/
 * run/iceNovaUpgradeEffects.ts : ce module sait ce qu'est un niveau
 * d'amelioration, main.ts ne recoit que des valeurs deja calculees. Stockee
 * dans la MEME MetaProgress.unitUpgrades que les autres ameliorations (cle
 * SENTINEL_UPGRADE.id = 'sentinel') — aucun nouveau champ de sauvegarde.
 *
 * N'affecte JAMAIS une Sentinelle ENNEMIE (point 37 de la demande) : ce
 * module n'est appele que depuis les fonctions "player*" de main.ts, jamais
 * depuis enemyStatOverrides/enemyAbilityDamageBonus (qui restent bases sur
 * data/unitUpgrades.ts, ou 'sentinel' n'est pas enregistre).
 */

export function sentinelUpgradeLevel(progress: MetaProgress): number {
  return getUnitUpgradeLevel(progress, SENTINEL_UPGRADE.id);
}

/** Bonus de PV AFFICHE (pas l'echelle interne x10). */
export function sentinelHpBonusDisplay(level: number): number {
  return level * SENTINEL_UPGRADE.hpPerLevel;
}

/** Bonus de BOUCLIER AFFICHE par ennemi provoque — "tous les N achats, +1". */
export function sentinelShieldBonusPerEnemyDisplay(level: number): number {
  return Math.floor(level / SENTINEL_UPGRADE.shieldEveryLevels) * SENTINEL_UPGRADE.shieldBonusPerMilestone;
}

/** "Prochain bonus de bouclier dans X amelioration(s)" — meme formule que
 *  les autres ameliorations a palier (Baliste, Nova de glace, Mine). */
export function sentinelRemainingUntilShieldBonus(level: number): number {
  return SENTINEL_UPGRADE.shieldEveryLevels - (level % SENTINEL_UPGRADE.shieldEveryLevels);
}

export function sentinelNextPurchaseGrantsShieldBonus(level: number): boolean {
  return (level + 1) % SENTINEL_UPGRADE.shieldEveryLevels === 0;
}

export interface SentinelUpgradeEffects {
  level: number;
  hpBonusDisplay: number;
  shieldBonusPerEnemyDisplay: number;
  /** A fusionner dans le `statOverrides` passe a World.spawn — contient
   *  TOUJOURS `maxHp` (base + bonus). Jamais mute sur UnitStats/UNITS
   *  global — un objet frais a chaque appel. */
  statOverrides: Partial<UnitStats>;
  /** A passer a World.spawn separement (voir Entity.tauntShieldBonus),
   *  echelle INTERNE (x10). */
  tauntShieldBonusInternal: number;
  /** Points de bouclier par ennemi provoque EFFECTIFS, AFFICHES (base +
   *  bonus) — pratique pour l'UI, qui n'a pas besoin de refaire l'addition. */
  effectiveShieldPerEnemyDisplay: number;
}

export function computePlayerSentinelUpgradeEffects(progress: MetaProgress): SentinelUpgradeEffects {
  const level = sentinelUpgradeLevel(progress);
  const hpBonusDisplay = sentinelHpBonusDisplay(level);
  const shieldBonusPerEnemyDisplay = sentinelShieldBonusPerEnemyDisplay(level);
  const base = getUnit('sentinel').stats.maxHp;
  return {
    level,
    hpBonusDisplay,
    shieldBonusPerEnemyDisplay,
    statOverrides: { maxHp: base + hpBonusDisplay * HP_PER_PIP },
    tauntShieldBonusInternal: shieldBonusPerEnemyDisplay * HP_PER_PIP,
    effectiveShieldPerEnemyDisplay: SHIELD_PER_TAUNTED_ENEMY + shieldBonusPerEnemyDisplay,
  };
}

/** Cout Gold EFFECTIF de RECRUTEMENT en boutique de RUN (2026-08-15, chantier
 *  polish/equilibrage — REVIREMENT explicite sur la decision documentee dans
 *  data/sentinelUpgrade.ts, "toujours 40" abandonne) — `getUnit('sentinel').cost`
 *  (base, 40) + niveau d'amelioration x `goldCostPerLevel` (5). Appelee
 *  depuis run/unitUpgradeEffects.ts, effectivePlayerUnitCost (cas special
 *  'sentinel', meme motif que le cas special deja existant dans
 *  effectivePlayerUnitMaxHp) — jamais depuis un calcul ENNEMI, une Sentinelle
 *  adverse n'a pas de cout Gold et ne recoit jamais ce bonus. */
export function effectiveSentinelGoldCost(progress: MetaProgress): number {
  const base = getUnit('sentinel').cost;
  const level = sentinelUpgradeLevel(progress);
  return base + level * SENTINEL_UPGRADE.goldCostPerLevel;
}
