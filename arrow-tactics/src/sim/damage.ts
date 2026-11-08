import type { DamageSchool, DamageType } from '../data/damageTypes';
import type { Entity } from './entity';

export type { DamageSchool, DamageType } from '../data/damageTypes';

/**
 * Applique des degats a une entite, en faisant passer le Shield temporaire
 * (voir Entity.shield, Provocation de la Sentinelle — 2026-08-14) AVANT les
 * PV eux-memes. SOURCE UNIQUE reutilisee par TOUS les points ou une entite
 * encaisse des degats (combat automatique, Charge, Boule de feu, Blizzard,
 * fleche du joueur) : un Shield doit absorber N'IMPORTE QUELLE source de
 * degats, pas seulement le combat au corps a corps/a distance classique —
 * sans ca, une Sentinelle avec du Shield encaisserait quand meme les degats
 * pleins d'un sort de zone ou de la fleche du joueur.
 *
 * Ne s'applique JAMAIS au miss/dodge (voir combat.ts) : ces deux resultats
 * n'appellent jamais cette fonction, donc aucun Shield n'est consomme sur un
 * coup qui ne touche pas.
 */
/**
 * Applique un soin a une entite de la simulation (Oracle, voir
 * sim/systems/abilities.ts) : PV plafonnes aux PV max, sans bouclier ni
 * surplus conserve. Renvoie les PV reellement rendus (echelle interne).
 * Pendant des degats : SOURCE UNIQUE des soins appliques PAR LA SIMULATION
 * (les parchemins, eux, passent par main.ts, applyPlayerHeal).
 */
export function applyHealToEntity(target: Entity, amount: number): number {
  if (amount <= 0 || !target.alive) return 0;
  const before = target.hp;
  target.hp = Math.min(target.stats.maxHp, before + amount);
  return target.hp - before;
}

/** Deux familles de degats (2026-11-05, decision d'Antoine, G46) : physique
 *  (melee, armes, projectiles d'Archer et de Baliste, Charge, Tourbillon) et
 *  magique (Boule de feu, effets d'arme, futurs sorts), avec une ecole pour
 *  les degats magiques elementaires (G47, data/damageTypes.ts). Aucune
 *  resistance aujourd'hui : tous infligent la meme quantite brute ; type et
 *  ecole sont portes par les evenements et les donnees (equipement, talents,
 *  resistances et interface futures). Une seule voie de degats. */
export function applyDamageToEntity(target: Entity, amount: number, _type: DamageType, _school?: DamageSchool): void {
  if (amount <= 0) return;
  // Degats recus depuis le dernier pas (2026-11-08, Entity.damageTaken) :
  // l'evenement reel « cette entite a ete touchee », consomme et remis a zero
  // par la defense locale des batiments (sim/systems/localDefense.ts).
  target.damageTaken += amount;
  let remaining = amount;
  if (target.shield > 0) {
    const absorbed = Math.min(target.shield, remaining);
    target.shield -= absorbed;
    remaining -= absorbed;
  }
  if (remaining > 0) target.hp = Math.max(0, target.hp - remaining);
}
