import { BLIZZARD_DAMAGE_PER_TICK, BLIZZARD_DURATION, HP_PER_PIP, ICE_NOVA_ROOT_DURATION } from '../config/constants';
import { getItem } from '../data/items';
import { ICE_NOVA_UPGRADE } from '../data/iceNovaUpgrade';
import { runUpgradeLevel, type RunUpgradeLevels } from './runUpgrades';

/**
 * Amelioration permanente de la NOVA DE GLACE (2026-08-14, voir
 * data/iceNovaUpgrade.ts) — meme principe que run/ballistaUpgradeEffects.ts/
 * run/healScrollUpgradeEffects.ts : ce module sait ce qu'est un niveau
 * d'amelioration, main.ts (castIceNova) ne recoit que des valeurs deja
 * calculees. Stockee dans la MEME MetaProgress.unitUpgrades que les autres
 * ameliorations (cle ICE_NOVA_UPGRADE.id = 'ice_nova', le meme id que
 * l'objet lui-meme dans data/items.ts) — aucun nouveau champ de sauvegarde.
 */

export function iceNovaUpgradeLevel(levels: RunUpgradeLevels): number {
  return runUpgradeLevel(levels, ICE_NOVA_UPGRADE.id);
}

/** Bonus de DUREE (secondes) — le MEME bonus s'applique au Root et au
 *  Blizzard, voir computePlayerIceNovaUpgradeEffects. */
export function iceNovaDurationBonus(level: number): number {
  return level * ICE_NOVA_UPGRADE.durationPerLevel;
}

/** Bonus de degats de tick AFFICHE (pas l'echelle interne x10) — "tous les
 *  N achats, +1 degat". */
export function iceNovaDamageBonusDisplay(level: number): number {
  return Math.floor(level / ICE_NOVA_UPGRADE.damageEveryLevels) * ICE_NOVA_UPGRADE.damagePerMilestone;
}

/** "Prochain bonus de degats dans X amelioration(s)" — meme formule que les
 *  autres ameliorations a palier (Baliste, unites). */
export function iceNovaRemainingUntilDamageBonus(level: number): number {
  return ICE_NOVA_UPGRADE.damageEveryLevels - (level % ICE_NOVA_UPGRADE.damageEveryLevels);
}

export function iceNovaNextPurchaseGrantsDamageBonus(level: number): boolean {
  return (level + 1) % ICE_NOVA_UPGRADE.damageEveryLevels === 0;
}

export interface IceNovaUpgradeEffects {
  level: number;
  /** Duree EFFECTIVE du Root (immobilisation), secondes. */
  rootDuration: number;
  /** Duree EFFECTIVE de la zone Blizzard (degats), secondes — n'a d'effet
   *  reel que si le talent Blizzard est debloque (voir main.ts, castIceNova). */
  blizzardDuration: number;
  damageBonusDisplay: number;
  /** Degats de tick EFFECTIFS, echelle INTERNE (x10) — base
   *  (BLIZZARD_DAMAGE_PER_TICK) + bonus permanent. */
  damagePerTickInternal: number;
}

/** Calcule TOUT ce dont main.ts a besoin pour la Nova de glace du JOUEUR —
 *  jamais applique a un ennemi (aucun ennemi ne lance de Nova de glace). */
export function computePlayerIceNovaUpgradeEffects(levels: RunUpgradeLevels): IceNovaUpgradeEffects {
  const level = iceNovaUpgradeLevel(levels);
  const durationBonus = iceNovaDurationBonus(level);
  const damageBonusDisplay = iceNovaDamageBonusDisplay(level);
  return {
    level,
    rootDuration: ICE_NOVA_ROOT_DURATION + durationBonus,
    blizzardDuration: BLIZZARD_DURATION + durationBonus,
    damageBonusDisplay,
    damagePerTickInternal: BLIZZARD_DAMAGE_PER_TICK + damageBonusDisplay * HP_PER_PIP,
  };
}

/** Cout Gold EFFECTIF d'achat en boutique de RUN (2026-08-15, chantier
 *  polish/equilibrage) — `getItem('ice_nova').cost` (base) + niveau
 *  d'amelioration x `goldCostPerLevel` (0.5) — SOURCE UNIQUE lue par
 *  ui/screens.ts (x1/x5) ET main.ts (transaction reelle). Le cout en RUNES
 *  de l'amelioration elle-meme (voir run/metaProgress.ts,
 *  effectiveUpgradeCost) n'est jamais touche par cette fonction. */
export function effectiveIceNovaCost(levels: RunUpgradeLevels): number {
  const base = getItem('ice_nova').cost;
  const level = iceNovaUpgradeLevel(levels);
  return base + level * ICE_NOVA_UPGRADE.goldCostPerLevel;
}
