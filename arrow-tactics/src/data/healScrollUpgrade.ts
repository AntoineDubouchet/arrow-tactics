import type { RuneCostDef } from './unitUpgrades';

/**
 * Amelioration permanente du PARCHEMIN DE SOIN (2026-08-13, demande
 * d'Antoine) — meme famille de systeme que data/unitUpgrades.ts
 * (RuneCostDef), mais un SHAPE different (soin + cibles secondaires, pas
 * PV/ATK d'une UnitDef).
 */
export interface HealScrollUpgradeDef extends RuneCostDef {
  id: 'heal_scroll_minor';
  /** +N PV AFFICHES (pas internes x10) par achat, ajoutes au soin
   *  PRINCIPAL de data/items.ts, heal_scroll_minor.effect.amount. */
  healPerLevel: number;
  /** Tous les N achats, +1 cible secondaire soignee en meme temps que la
   *  cible principale. */
  extraTargetEveryLevels: number;
  /** Fraction du soin PRINCIPAL EFFECTIF (base + bonus permanent, PAS la
   *  seule base) recue par chaque cible secondaire — demande explicite
   *  d'Antoine, point 23 : "le 50% utilise le soin ACTUEL", pas
   *  `upgradeLevel * 0.5`. */
  secondaryHealRatio: number;
  /** Rayon (cases) autour de la cible PRINCIPALE pour choisir les cibles
   *  secondaires — DISTINCT de config/constants.ts HEAL_TARGET_RADIUS (qui
   *  mesure du CURSEUR a la cible principale, pas d'une cible aux autres).
   *  Aucune notion de "portee cible -> allies proches" n'existait avant
   *  cette demande ; valeur choisie par Claude en reprenant la MEME
   *  magnitude que HEAL_TARGET_RADIUS (2 cases) par coherence avec l'unique
   *  reference de "portee de soin" deja etablie dans le jeu — a confirmer/
   *  ajuster par Antoine une fois teste. Centralisee ICI (pas dans
   *  constants.ts) comme demande explicitement (point 28 : "centralise
   *  cette valeur dans la definition de l'amelioration"). */
  secondaryTargetRadius: number;
  /** A chaque NIVEAU d'amelioration achete (pas seulement par palier), +N au
   *  cout GOLD d'achat du parchemin en boutique de RUN (2026-08-15, chantier
   *  polish/equilibrage — voir run/healScrollUpgradeEffects.ts,
   *  effectiveHealScrollCost). Ne change JAMAIS le cout en RUNES de
   *  l'amelioration elle-meme (RuneCostDef ci-dessus, inchange). */
  goldCostPerLevel: number;
}

export const HEAL_SCROLL_UPGRADE: HealScrollUpgradeDef = {
  id: 'heal_scroll_minor',
  // 1 -> 10 runes (2026-08-13, demande explicite d'Antoine : "le prix de
  // l'amélioration de la baliste et du parchemin de soins commence
  // également à partir de 10 runes") — aligne le premier achat sur celui
  // des unites/de la Baliste (voir data/unitUpgrades.ts).
  baseRuneCost: 10,
  costMultiplier: 2,
  healPerLevel: 1,
  extraTargetEveryLevels: 3,
  secondaryHealRatio: 0.5,
  secondaryTargetRadius: 2,
  goldCostPerLevel: 0.5,
};
