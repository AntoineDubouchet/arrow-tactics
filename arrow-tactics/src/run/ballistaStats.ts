import {
  PLAYER_ARROW_COOLDOWN,
  PLAYER_ARROW_DAMAGE,
  PLAYER_ARROW_SPEED,
  TALENT_FIRE_RATE_BONUS,
  TALENT_MACHINE_GUN_ATTACK_SPEED_MULTIPLIER,
  TALENT_PROJECTILE_DAMAGE_BONUS,
  TALENT_PROJECTILE_SPEED_BONUS,
} from '../config/constants';
import { computePlayerBallistaUpgradeEffects } from './ballistaUpgradeEffects';
import { isTalentUnlocked, type MetaProgress } from './metaProgress';
import type { PlayerProgression } from './runUpgrades';

/**
 * Statistiques EFFECTIVES du tir de la Baliste : SOURCE UNIQUE du tir reel,
 * du HUD de la Baliste et de la fiche d'entite. Fonctions pures de la
 * progression (talents "Tir rapide" et "Mitraillette" ; niveau
 * d'amelioration "Baliste" de la run, voir run/ballistaUpgradeEffects.ts) :
 * `PlayerProgression` quand talents et amelioration comptent, les seuls
 * talents (`MetaProgress`) sinon. Recalculees a
 * chaque usage plutot que stockees : talents et ameliorations peuvent changer
 * entre deux tirs.
 */

/** Carreaux tires par volee : 3 avec le talent "Mitraillette" (le carreau
 *  vise et deux carreaux lateraux, voir main.ts buildBallistaVolleyShots),
 *  1 sinon. */
export const MACHINE_GUN_BOLTS_PER_VOLLEY = 3;

/** Somme de TOUS les bonus de VITESSE D'ATTAQUE (cadence) de la Baliste,
 *  TOUS ADDITIFS entre eux — talent "Tir rapide" (bonus FIXE) + amelioration
 *  permanente "Baliste" (bonus CROISSANT avec le niveau achete en runes) +
 *  tout futur bonus qui s'ajouterait ici. Reutilisee par
 *  effectivePlayerArrowCooldown ET par le talent "Mitraillette" :
 *  Mitraillette multiplie ce TOTAL par
 *  TALENT_MACHINE_GUN_ATTACK_SPEED_MULTIPLIER, JAMAIS la cadence de base ni
 *  un bonus pris isolement — demande explicite d'Antoine ("je ne veux pas
 *  cadence de base x3, je veux BONUS DE VITESSE D'ATTAQUE x3"). Jamais
 *  composes multiplicativement l'un avec l'autre ni d'un niveau de Baliste a
 *  l'autre. */
export function totalBallistaAttackSpeedBonus(progress: PlayerProgression): number {
  const talentBonus = isTalentUnlocked(progress.talents, 'tir_rapide') ? TALENT_FIRE_RATE_BONUS : 0;
  const ballistaBonus = computePlayerBallistaUpgradeEffects(progress.upgrades).attackSpeedBonus;
  return talentBonus + ballistaBonus;
}

/** Cooldown EFFECTIF de la fleche du joueur — une seule etape claire :
 *  collecter tous les bonus (totalBallistaAttackSpeedBonus) puis, SI
 *  Mitraillette est debloque, multiplier ce TOTAL par 3 avant de calculer la
 *  cadence finale (jamais une double application : le bonus boutique et le
 *  bonus Tir rapide ne sont JAMAIS multiplies individuellement, seule leur
 *  SOMME l'est, une seule fois). A 0 bonus actif, 0 x 3 = 0 : la cadence de
 *  base reste strictement inchangee. */
export function effectivePlayerArrowCooldown(progress: PlayerProgression): number {
  const totalBonus = totalBallistaAttackSpeedBonus(progress);
  const effectiveBonus = isTalentUnlocked(progress.talents, 'mitraillette') ? totalBonus * TALENT_MACHINE_GUN_ATTACK_SPEED_MULTIPLIER : totalBonus;
  return PLAYER_ARROW_COOLDOWN / (1 + effectiveBonus);
}

/** Vitesse EFFECTIVE du projectile : uniquement le talent "Tir rapide" —
 *  l'amelioration permanente "Baliste" ne touche JAMAIS cette valeur (demande
 *  explicite d'Antoine : ne pas confondre cadence, vitesse de projectile et
 *  degats). */
export function effectivePlayerArrowSpeed(talents: MetaProgress): number {
  return isTalentUnlocked(talents, 'tir_rapide') ? PLAYER_ARROW_SPEED * (1 + TALENT_PROJECTILE_SPEED_BONUS) : PLAYER_ARROW_SPEED;
}

/** Degats EFFECTIFS par carreau (echelle interne) : "Tir rapide" ajoute +2
 *  degats affiches (+20 internes, TALENT_PROJECTILE_DAMAGE_BONUS) et
 *  l'amelioration "Baliste" ajoute +1 tous les 3 niveaux — deux bonus
 *  INTERNES qui s'additionnent simplement sur la base. */
export function effectivePlayerArrowDamage(progress: PlayerProgression): number {
  const talentBonus = isTalentUnlocked(progress.talents, 'tir_rapide') ? TALENT_PROJECTILE_DAMAGE_BONUS : 0;
  const ballistaBonus = computePlayerBallistaUpgradeEffects(progress.upgrades).damageBonusInternal;
  return PLAYER_ARROW_DAMAGE + talentBonus + ballistaBonus;
}

/** Nombre de carreaux par volee. */
export function playerArrowBoltsPerVolley(talents: MetaProgress): number {
  return isTalentUnlocked(talents, 'mitraillette') ? MACHINE_GUN_BOLTS_PER_VOLLEY : 1;
}

/** Etat de tir de la Baliste pendant la bataille, calcule par main.ts
 *  (currentBallistaStatus) et lu par le HUD de la Baliste et la fiche
 *  d'entite. `reloading` : temps de recharge restant et duree totale de la
 *  recharge en cours (secondes de simulation), pour le texte et la barre.
 *  `inFlight` : recharge terminee mais volee precedente encore en vol, ce qui
 *  bloque aussi le tir (voir sim/playerArrow.ts). */
export type BallistaStatus =
  | { kind: 'ready' }
  | { kind: 'reloading'; cooldownSeconds: number; totalSeconds: number }
  | { kind: 'inFlight' }
  | { kind: 'destroyed' };

/** Libelles des etats sans duree, partages par le HUD et la fiche. */
export const BALLISTA_STATUS_LABELS: Record<Exclude<BallistaStatus['kind'], 'reloading'>, string> = {
  ready: 'PRÊTE',
  inFlight: 'EN VOL',
  destroyed: 'DÉTRUITE',
};

/** Recharge restante affichee : arrondie au dixieme superieur, jamais
 *  "0.0 s" tant que la recharge n'est pas terminee. */
export function formatBallistaCooldownSeconds(cooldownSeconds: number): string {
  return `${Math.max(0.1, Math.ceil(cooldownSeconds * 10) / 10).toFixed(1)} s`;
}
