import type { UpgradeDefBase } from './unitUpgrades';

/**
 * Amelioration permanente du talent "Soins excédentaires" (2026-08-15) —
 * meme famille de systeme que data/mineUpgrade.ts/ballistaUpgrade.ts
 * (UpgradeDefBase).
 *
 * N'a d'effet reel que si le talent "Soins excédentaires" lui-meme (voir
 * data/talents.ts) est deverrouille — le NIVEAU achete ici n'est jamais
 * supprime par un reset des talents (voir main.ts, resetTalentPoints), mais
 * son effet redevient nul tant que le talent n'est pas re-debloque (voir
 * run/shadowUpgradeEffects.ts). La carte de la boutique d'amelioration reste
 * MASQUEE tant que le talent n'est pas debloque (voir ui/screens.ts), meme
 * convention que la Mine pour "Le temps, c'est de l'argent".
 */
export interface ShadowUpgradeDef extends UpgradeDefBase {
  id: 'soins_excedentaires';
  /** +N degats AFFICHES par projectile, par niveau — ADDITIF depuis la base
   *  (1 point, voir config/constants.ts SHADOW_PROJECTILE_BASE_DAMAGE),
   *  jamais compose d'un niveau a l'autre. */
  damagePerLevel: number;
  /** +1 projectile BONUS par action de soin excedentaire, tous les N
   *  niveaux — ne s'ajoute JAMAIS a un overheal nul (voir
   *  run/shadowUpgradeEffects.ts, computePlayerShadowEffects). */
  bonusProjectileEveryLevels: number;
}

export const SHADOW_UPGRADE: ShadowUpgradeDef = {
  id: 'soins_excedentaires',
  damagePerLevel: 0.5,
  bonusProjectileEveryLevels: 3,
};
