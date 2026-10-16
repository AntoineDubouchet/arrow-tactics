import { HP_PER_PIP, SHADOW_PROJECTILE_BASE_DAMAGE } from '../config/constants';
import { SHADOW_UPGRADE } from '../data/shadowUpgrade';
import { runUpgradeLevel, type RunUpgradeLevels } from './runUpgrades';

/**
 * Amelioration permanente du talent "Soins excédentaires" (2026-08-15, voir
 * data/shadowUpgrade.ts) — meme principe que run/mineUpgradeEffects.ts : ce
 * module sait ce qu'est un niveau d'amelioration, main.ts ne recoit que des
 * nombres deja calcules. Ne verifie PAS lui-meme si le talent est deverrouille
 * (comme effectiveMineGoldPerSecond ne verifie pas "Le temps, c'est de
 * l'argent") — c'est a l'APPELANT (main.ts, triggerShadowProjectiles) de
 * gater l'appel entier sur isTalentUnlocked : le niveau achete ici reste
 * intact meme si le talent est ensuite retire par un reset, mais ne produit
 * plus aucun effet tant qu'il n'est pas re-debloque, SANS code special —
 * cette fonction serait simplement appelee de nouveau des que le gate
 * repasse a `true`.
 */

export function shadowUpgradeLevel(levels: RunUpgradeLevels): number {
  return runUpgradeLevel(levels, SHADOW_UPGRADE.id);
}

/** Degats AFFICHES par projectile a ce niveau — base (1) + niveau * 0.5. */
export function shadowDamagePerProjectileDisplay(level: number): number {
  return SHADOW_PROJECTILE_BASE_DAMAGE / HP_PER_PIP + level * SHADOW_UPGRADE.damagePerLevel;
}

/** Bonus de NOMBRE de projectiles par action de soin excedentaire, tous les
 *  bonusProjectileEveryLevels niveaux (3) — voir computePlayerShadowEffects
 *  pour la regle "jamais applique sur un overheal nul". */
export function shadowBonusProjectileCount(level: number): number {
  return Math.floor(level / SHADOW_UPGRADE.bonusProjectileEveryLevels);
}

/** Achats restants avant le PROCHAIN palier de projectile bonus — couvre
 *  nativement le cas `level % N === 0` -> N (meme formule deja etablie par
 *  run/unitUpgradeEffects.ts, upgradeRemainingUntilAttackBonus). */
export function shadowRemainingUntilBonusProjectile(level: number): number {
  return SHADOW_UPGRADE.bonusProjectileEveryLevels - (level % SHADOW_UPGRADE.bonusProjectileEveryLevels);
}

/** Vrai si le TOUT PROCHAIN achat (level + 1) declenche un palier de
 *  projectile bonus. */
export function shadowNextPurchaseGrantsBonusProjectile(level: number): boolean {
  return (level + 1) % SHADOW_UPGRADE.bonusProjectileEveryLevels === 0;
}

/**
 * Degats EFFECTIFS (echelle interne x10) par projectile + bonus de nombre de
 * projectiles a ce niveau d'amelioration — calculs bruts, sans savoir si le
 * talent est actif (voir commentaire d'en-tete).
 */
export function computePlayerShadowEffects(levels: RunUpgradeLevels): {
  damagePerProjectileInternal: number;
  bonusProjectileCount: number;
} {
  const level = shadowUpgradeLevel(levels);
  return {
    damagePerProjectileInternal: shadowDamagePerProjectileDisplay(level) * HP_PER_PIP,
    bonusProjectileCount: shadowBonusProjectileCount(level),
  };
}
