import { HP_PER_PIP } from '../config/constants';
import { BALLISTA_UPGRADE } from '../data/ballistaUpgrade';
import { getBuilding } from '../data/buildings';
import { getUnitUpgradeLevel, type MetaProgress } from './metaProgress';

/**
 * Amelioration permanente de la BALISTE (2026-08-13, voir data/ballistaUpgrade.ts) —
 * meme principe que run/unitUpgradeEffects.ts : ce module sait ce qu'est un
 * niveau d'amelioration, main.ts ne recoit que des nombres deja calcules.
 * Stockee dans la MEME MetaProgress.unitUpgrades que les unites (cle
 * BALLISTA_UPGRADE.id = 'ballista') — aucun nouveau champ de sauvegarde,
 * reutilise le systeme existant tel quel (demande explicite d'Antoine :
 * "ne recree pas un deuxieme systeme").
 *
 * IMPORTANT — 3 notions distinctes, jamais confondues (demande explicite) :
 *  - ATTACK SPEED (cadence) : modifiee ICI, additif depuis la base
 *    (effectiveRate = baseRate * (1 + 0.20*level), JAMAIS baseRate*1.2^level).
 *  - PROJECTILE SPEED (vitesse physique du carreau, PLAYER_ARROW_SPEED) :
 *    JAMAIS touchee par cette amelioration — seul le talent "Tir rapide"
 *    l'affecte (voir main.ts, TALENT_PROJECTILE_SPEED_BONUS).
 *  - DAMAGE : modifiee tous les damageEveryLevels achats seulement.
 */

export function ballistaUpgradeLevel(progress: MetaProgress): number {
  return getUnitUpgradeLevel(progress, BALLISTA_UPGRADE.id);
}

/** Bonus de cadence, en FRACTION (0.20 = +20 points de %) — ADDITIF depuis
 *  la base, jamais compose d'un niveau a l'autre. */
export function ballistaAttackSpeedBonus(level: number): number {
  return level * BALLISTA_UPGRADE.attackSpeedPerLevel;
}

/** Bonus de degats AFFICHE (pas l'echelle interne x10) — "tous les N
 *  achats, +1 degat". */
export function ballistaDamageBonusDisplay(level: number): number {
  return Math.floor(level / BALLISTA_UPGRADE.damageEveryLevels) * BALLISTA_UPGRADE.damagePerMilestone;
}

/** "Prochain bonus de degats dans X amelioration(s)" — meme formule deja
 *  utilisee pour les unites (voir upgradeRemainingUntilAttackBonus), pas de
 *  cas particulier pour level % damageEveryLevels === 0 (deja couvert : 0 ->
 *  damageEveryLevels - 0 = damageEveryLevels). */
export function ballistaRemainingUntilDamageBonus(level: number): number {
  return BALLISTA_UPGRADE.damageEveryLevels - (level % BALLISTA_UPGRADE.damageEveryLevels);
}

/** Vrai si le PROCHAIN achat (level -> level+1) declenche un palier de
 *  degats — sert a l'UI pour mettre en avant un achat "important". */
export function ballistaNextPurchaseGrantsDamageBonus(level: number): boolean {
  return (level + 1) % BALLISTA_UPGRADE.damageEveryLevels === 0;
}

/** Bonus de PV AFFICHE (pas l'echelle interne x10) de la TOUR — "+10 PV par
 *  achat", chaque niveau (pas un palier tous les N comme les degats du
 *  carreau ci-dessus). Derive du SEUL `level`, jamais stocke separement
 *  (meme principe que le reste de ce fichier — voir CLAUDE.md point 12 de
 *  la demande : "ne stocke pas inutilement ces bonus si on peut les deriver
 *  du level"). */
export function ballistaHpBonusDisplay(level: number): number {
  return level * BALLISTA_UPGRADE.hpBonusPerLevel;
}

/** PV MAX EFFECTIFS de la Baliste du JOUEUR (base + bonus permanent),
 *  echelle INTERNE (x10) — `getBuilding('ballista').maxHp` reste la valeur
 *  de BASE inchangee (250 interne = 25 affiches), SEULE cette fonction
 *  derive le plafond reellement applique au spawn. Jamais appelee pour un
 *  batiment ENNEMI (aucune Baliste ennemie n'existe actuellement — meme
 *  principe deja etabli pour toutes les autres ameliorations permanentes du
 *  joueur, voir CLAUDE.md point 13 de la demande). */
export function effectiveBallistaMaxHp(progress: MetaProgress): number {
  const level = ballistaUpgradeLevel(progress);
  return getBuilding('ballista').maxHp + ballistaHpBonusDisplay(level) * HP_PER_PIP;
}

export interface BallistaUpgradeEffects {
  level: number;
  attackSpeedBonus: number;
  damageBonusDisplay: number;
  /** Bonus de degats a AJOUTER au damage de base de la fleche du joueur,
   *  echelle INTERNE (x10). */
  damageBonusInternal: number;
  /** Bonus de PV AFFICHE de la tour (voir ballistaHpBonusDisplay). */
  hpBonusDisplay: number;
  /** PV max EFFECTIFS de la tour, echelle INTERNE — meme valeur que
   *  effectiveBallistaMaxHp, exposee ici pour les appelants qui calculent
   *  deja le reste des effets par ce point d'entree unique. */
  effectiveMaxHpInternal: number;
}

/** Calcule TOUT ce dont main.ts a besoin pour la baliste du JOUEUR — jamais
 *  applique a un ennemi (aucun ennemi n'a de baliste actuellement, mais le
 *  principe "BASE + PERMANENT UPGRADE = VERSION JOUEUR" reste identique aux
 *  autres systemes du jeu, voir CLAUDE.md point 35 de la demande). */
export function computePlayerBallistaUpgradeEffects(progress: MetaProgress): BallistaUpgradeEffects {
  const level = ballistaUpgradeLevel(progress);
  const damageBonusDisplay = ballistaDamageBonusDisplay(level);
  const hpBonusDisplay = ballistaHpBonusDisplay(level);
  return {
    level,
    attackSpeedBonus: ballistaAttackSpeedBonus(level),
    damageBonusDisplay,
    damageBonusInternal: damageBonusDisplay * HP_PER_PIP,
    hpBonusDisplay,
    effectiveMaxHpInternal: effectiveBallistaMaxHp(progress),
  };
}
