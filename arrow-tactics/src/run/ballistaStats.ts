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

/**
 * Statistiques EFFECTIVES du tir de la Baliste : SOURCE UNIQUE du tir reel,
 * du HUD de la Baliste et, plus tard, de la fiche d'entite. Fonctions pures
 * de la progression (talents "Tir rapide" et "Mitraillette", amelioration
 * permanente "Baliste", voir run/ballistaUpgradeEffects.ts), recalculees a
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
export function totalBallistaAttackSpeedBonus(progress: MetaProgress): number {
  const talentBonus = isTalentUnlocked(progress, 'tir_rapide') ? TALENT_FIRE_RATE_BONUS : 0;
  const ballistaBonus = computePlayerBallistaUpgradeEffects(progress).attackSpeedBonus;
  return talentBonus + ballistaBonus;
}

/** Cooldown EFFECTIF de la fleche du joueur — une seule etape claire :
 *  collecter tous les bonus (totalBallistaAttackSpeedBonus) puis, SI
 *  Mitraillette est debloque, multiplier ce TOTAL par 3 avant de calculer la
 *  cadence finale (jamais une double application : le bonus boutique et le
 *  bonus Tir rapide ne sont JAMAIS multiplies individuellement, seule leur
 *  SOMME l'est, une seule fois). A 0 bonus actif, 0 x 3 = 0 : la cadence de
 *  base reste strictement inchangee. */
export function effectivePlayerArrowCooldown(progress: MetaProgress): number {
  const totalBonus = totalBallistaAttackSpeedBonus(progress);
  const effectiveBonus = isTalentUnlocked(progress, 'mitraillette') ? totalBonus * TALENT_MACHINE_GUN_ATTACK_SPEED_MULTIPLIER : totalBonus;
  return PLAYER_ARROW_COOLDOWN / (1 + effectiveBonus);
}

/** Vitesse EFFECTIVE du projectile : uniquement le talent "Tir rapide" —
 *  l'amelioration permanente "Baliste" ne touche JAMAIS cette valeur (demande
 *  explicite d'Antoine : ne pas confondre cadence, vitesse de projectile et
 *  degats). */
export function effectivePlayerArrowSpeed(progress: MetaProgress): number {
  return isTalentUnlocked(progress, 'tir_rapide') ? PLAYER_ARROW_SPEED * (1 + TALENT_PROJECTILE_SPEED_BONUS) : PLAYER_ARROW_SPEED;
}

/** Degats EFFECTIFS par carreau (echelle interne) : "Tir rapide" ajoute +2
 *  degats affiches (+20 internes, TALENT_PROJECTILE_DAMAGE_BONUS) et
 *  l'amelioration "Baliste" ajoute +1 tous les 3 niveaux — deux bonus
 *  INTERNES qui s'additionnent simplement sur la base. */
export function effectivePlayerArrowDamage(progress: MetaProgress): number {
  const talentBonus = isTalentUnlocked(progress, 'tir_rapide') ? TALENT_PROJECTILE_DAMAGE_BONUS : 0;
  const ballistaBonus = computePlayerBallistaUpgradeEffects(progress).damageBonusInternal;
  return PLAYER_ARROW_DAMAGE + talentBonus + ballistaBonus;
}

/** Nombre de carreaux par volee. */
export function playerArrowBoltsPerVolley(progress: MetaProgress): number {
  return isTalentUnlocked(progress, 'mitraillette') ? MACHINE_GUN_BOLTS_PER_VOLLEY : 1;
}
