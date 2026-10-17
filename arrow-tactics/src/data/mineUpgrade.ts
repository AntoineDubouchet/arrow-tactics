import type { UpgradeDefBase } from './unitUpgrades';

/**
 * Amelioration permanente de la MINE (2026-08-14, demande d'Antoine).
 * Formule REVUE le meme jour (Antoine : le premier palier a milestone
 * rendait le bonus trop puissant) — remplacee par un bonus PUREMENT
 * LINEAIRE, sans palier : +0.2 or/seconde par achat, un point c'est tout.
 * Meme famille de systeme que data/ballistaUpgrade.ts (UpgradeDefBase) mais SANS le mecanisme de
 * palier tous les N achats — retire entierement plutot que mis a zero,
 * puisque ce n'est plus le design voulu. N'a d'effet reel que si le talent
 * "Le temps, c'est de l'argent" (voir data/talents.ts, temps_argent) est
 * deverrouille — la mine elle-meme n'existe pas sinon (voir main.ts) ; la
 * carte de la boutique d'amelioration reste MASQUEE tant que ce n'est pas
 * le cas (voir ui/screens.ts).
 */
export interface MineUpgradeDef extends UpgradeDefBase {
  id: 'mine';
  /** +N or/seconde par achat — ADDITIF depuis la base
   *  (MINE_BASE_GOLD_PER_SECOND, voir config/constants.ts), jamais
   *  compose d'un niveau a l'autre, jamais de palier. */
  goldPerSecondPerLevel: number;
}

export const MINE_UPGRADE: MineUpgradeDef = {
  id: 'mine',
  goldPerSecondPerLevel: 0.2,
};
