import { HP_PER_PIP } from '../config/constants';
import { getHealEffectAmount, getItem } from '../data/items';
import { HEAL_SCROLL_UPGRADE } from '../data/healScrollUpgrade';
import { getUnitUpgradeLevel, type MetaProgress } from './metaProgress';

/**
 * Amelioration permanente du PARCHEMIN DE SOIN (2026-08-13, voir
 * data/healScrollUpgrade.ts) — meme principe que run/unitUpgradeEffects.ts.
 * Stockee dans la MEME MetaProgress.unitUpgrades que les unites/la baliste
 * (cle HEAL_SCROLL_UPGRADE.id = 'heal_scroll_minor', le meme id que
 * l'objet lui-meme dans data/items.ts — pas de nouveau champ de
 * sauvegarde).
 */

export function healScrollUpgradeLevel(progress: MetaProgress): number {
  return getUnitUpgradeLevel(progress, HEAL_SCROLL_UPGRADE.id);
}

/** Bonus de soin AFFICHE (pas l'echelle interne x10) — "+1 PV par niveau". */
export function healBonusDisplay(level: number): number {
  return level * HEAL_SCROLL_UPGRADE.healPerLevel;
}

/** Nombre de cibles SECONDAIRES soignees en meme temps que la cible
 *  principale — "tous les N achats, +1 allie supplementaire". */
export function healSecondaryTargetCount(level: number): number {
  return Math.floor(level / HEAL_SCROLL_UPGRADE.extraTargetEveryLevels);
}

export function healRemainingUntilNextTarget(level: number): number {
  return HEAL_SCROLL_UPGRADE.extraTargetEveryLevels - (level % HEAL_SCROLL_UPGRADE.extraTargetEveryLevels);
}

export function healNextPurchaseGrantsExtraTarget(level: number): boolean {
  return (level + 1) % HEAL_SCROLL_UPGRADE.extraTargetEveryLevels === 0;
}

/** Montant EFFECTIF du soin PRINCIPAL, echelle INTERNE (x10) — base de
 *  data/items.ts (heal_scroll_minor.effect.amount) + bonus permanent
 *  (AFFICHE, converti en interne ici). Utilisee PARTOUT ou le parchemin est
 *  consomme (clic bataille, clic placement, ET le talent "Aux petits
 *  oignons" qui le consomme automatiquement — meme parchemin, meme bonus,
 *  jamais un cas particulier separe). */
export function effectivePlayerHealAmount(progress: MetaProgress): number {
  const base = getHealEffectAmount('heal_scroll_minor');
  const level = healScrollUpgradeLevel(progress);
  return base + healBonusDisplay(level) * HP_PER_PIP;
}

/** Montant EFFECTIF du soin SECONDAIRE (echelle interne) — fraction FIXE du
 *  soin PRINCIPAL EFFECTIF actuel (point 23 de la demande : "utilise la
 *  valeur totale ACTUELLE du soin principal", jamais `level * ratio`). Le
 *  soin principal est toujours un multiple de 10 (base 50 + level*10), donc
 *  ce produit reste TOUJOURS un entier exact malgre le ratio 0.5 — jamais de
 *  demi-point interne a arrondir. */
export function effectivePlayerSecondaryHealAmount(progress: MetaProgress): number {
  return effectivePlayerHealAmount(progress) * HEAL_SCROLL_UPGRADE.secondaryHealRatio;
}

/** Cout Gold EFFECTIF d'achat en boutique de RUN (2026-08-15, chantier
 *  polish/equilibrage) — `getItem('heal_scroll_minor').cost` (base) +
 *  niveau d'amelioration x `goldCostPerLevel` (0.5) — SOURCE UNIQUE lue par
 *  ui/screens.ts (affichage/activation des boutons x1 ET x5) ET main.ts
 *  (transaction reelle), jamais recalculee independamment a ces deux
 *  endroits. Le cout en RUNES de l'amelioration elle-meme (voir
 *  run/metaProgress.ts, effectiveUpgradeCost) n'est jamais touche par cette
 *  fonction. */
export function effectiveHealScrollCost(progress: MetaProgress): number {
  const base = getItem('heal_scroll_minor').cost;
  const level = healScrollUpgradeLevel(progress);
  return base + level * HEAL_SCROLL_UPGRADE.goldCostPerLevel;
}
