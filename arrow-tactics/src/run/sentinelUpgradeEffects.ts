import { HP_PER_PIP, SHIELD_PER_TAUNTED_ENEMY } from '../config/constants';
import { SENTINEL_UPGRADE } from '../data/sentinelUpgrade';
import { getUnit, type UnitStats } from '../data/units';
import { runUpgradeLevel, type RunUpgradeLevels } from './runUpgrades';

/**
 * Amelioration permanente de la SENTINELLE (2026-08-14, voir
 * data/sentinelUpgrade.ts) — meme principe que run/ballistaUpgradeEffects.ts/
 * run/iceNovaUpgradeEffects.ts : ce module sait ce qu'est un niveau
 * d'amelioration, main.ts ne recoit que des valeurs deja calculees. Niveau
 * lu dans RunState.upgrades, comme les autres ameliorations (cle
 * SENTINEL_UPGRADE.id = 'sentinel') — aucun nouveau champ de sauvegarde.
 *
 * N'affecte JAMAIS une Sentinelle ENNEMIE (point 37 de la demande) : ce
 * module n'est appele que depuis les fonctions "player*" de main.ts, jamais
 * depuis enemyStatOverrides/enemyAbilityDamageBonus (qui restent bases sur
 * data/unitUpgrades.ts, ou 'sentinel' n'est pas enregistre).
 */

export function sentinelUpgradeLevel(levels: RunUpgradeLevels): number {
  return runUpgradeLevel(levels, SENTINEL_UPGRADE.id);
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

export function computePlayerSentinelUpgradeEffects(levels: RunUpgradeLevels): SentinelUpgradeEffects {
  const level = sentinelUpgradeLevel(levels);
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
