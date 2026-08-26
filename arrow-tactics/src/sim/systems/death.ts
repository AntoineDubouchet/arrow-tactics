import type { Entity } from '../entity';

/**
 * Marque comme mortes les unites tombees a 0 PV. Le ciblage et le rendu lisent
 * `alive` au tick suivant : aucun nettoyage supplementaire n'est necessaire
 * ici (une unite qui visait la victime en cherchera une autre d'elle-meme).
 */
export function deathSystem(entities: Entity[]): void {
  for (const e of entities) {
    if (e.alive && e.hp <= 0) {
      e.hp = 0;
      e.alive = false;
    }
  }
}
