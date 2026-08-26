import * as THREE from 'three';

/**
 * Réserve fixe de `THREE.PointLight` AJOUTÉES À LA SCÈNE UNE SEULE FOIS,
 * jamais retirées ensuite — extrait de `render/fireballView.ts` (2026-08-16,
 * chantier VFX) pour être réutilisable par tout futur effet lumineux, même
 * principe.
 *
 * Cause du correctif d'origine (2026-08-11, freeze intermittent remonté par
 * Antoine à l'impact de la Boule de feu) : en Three.js, AJOUTER ou RETIRER
 * une vraie lumière de la scène change le nombre de lumières actives, ce qui
 * force le moteur à RECOMPILER les shaders de tous les matériaux visibles
 * pour ce nouveau compte de lumières (le nombre de PointLight est "gravé en
 * dur" dans le shader compilé, pas un simple uniforme) — un coût ponctuel
 * mais réel, suffisant pour un a-coup perceptible si répété à chaque tir.
 *
 * Avec une réserve fixe (jamais ajoutée/retirée après la construction), le
 * NOMBRE de lumières dans la scène reste constant tout au long de la
 * bataille — seules `intensity`/`position` changent frame par frame, ce qui
 * est un simple uniforme (aucune recompilation). Une lumière "inactive" a
 * `intensity = 0` mais reste TECHNIQUEMENT présente (jamais `visible =
 * false`, qui l'exclurait du compte au même titre qu'un retrait).
 */
export class LightPool {
  private readonly free: THREE.PointLight[] = [];

  constructor(group: THREE.Group, count: number, color: number, distance: number, decay: number) {
    for (let i = 0; i < count; i++) {
      const light = new THREE.PointLight(color, 0, distance, decay);
      group.add(light);
      this.free.push(light);
    }
  }

  /** Emprunte une lumière de la réserve, ou `null` si épuisée (dégrade
   *  proprement : l'effet concerné perd juste son éclairage local, aucune
   *  erreur, aucune lumière créée à la volée). */
  acquire(): THREE.PointLight | null {
    return this.free.pop() ?? null;
  }

  /** Rend une lumière à la réserve — remise à intensité 0, JAMAIS retirée du
   *  groupe (voir commentaire de classe). */
  release(light: THREE.PointLight | null): void {
    if (!light) return;
    light.intensity = 0;
    this.free.push(light);
  }
}
