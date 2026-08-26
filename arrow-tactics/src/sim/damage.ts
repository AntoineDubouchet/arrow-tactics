import type { Entity } from './entity';

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
export function applyDamageToEntity(target: Entity, amount: number): void {
  if (amount <= 0) return;
  let remaining = amount;
  if (target.shield > 0) {
    const absorbed = Math.min(target.shield, remaining);
    target.shield -= absorbed;
    remaining -= absorbed;
  }
  if (remaining > 0) target.hp = Math.max(0, target.hp - remaining);
}
