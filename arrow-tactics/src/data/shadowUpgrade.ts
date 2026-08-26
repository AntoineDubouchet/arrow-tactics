import type { RuneCostDef } from './unitUpgrades';

/**
 * Amelioration permanente du talent "Soins excédentaires" (2026-08-15) —
 * meme famille de systeme que data/mineUpgrade.ts/ballistaUpgrade.ts
 * (RuneCostDef generique, cout qui double a chaque achat). Point de depart
 * IDENTIQUE aux autres ameliorations (10 runes, voir data/unitUpgrades.ts) —
 * jamais la valeur "1" litteralement demandee dans la specification
 * initiale : Antoine a explicitement tranche depuis (voir CLAUDE.md,
 * "de toute maniere quand tu ajoutes un truc dans la boutique d'amelioration,
 * fais-le commencer a 10") que TOUTE nouvelle amelioration de boutique suit
 * cette convention, y compris celle-ci.
 *
 * N'a d'effet reel que si le talent "Soins excédentaires" lui-meme (voir
 * data/talents.ts) est deverrouille — le NIVEAU achete ici n'est jamais
 * supprime par un reset des talents (voir main.ts, resetTalentPoints), mais
 * son effet redevient nul tant que le talent n'est pas re-debloque (voir
 * run/shadowUpgradeEffects.ts). La carte de la boutique d'amelioration reste
 * MASQUEE tant que le talent n'est pas debloque (voir ui/screens.ts), meme
 * convention que la Mine pour "Le temps, c'est de l'argent".
 */
export interface ShadowUpgradeDef extends RuneCostDef {
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
  baseRuneCost: 10,
  costMultiplier: 2,
  damagePerLevel: 0.5,
  bonusProjectileEveryLevels: 3,
};
