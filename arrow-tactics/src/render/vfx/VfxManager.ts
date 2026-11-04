import type { FireballView } from '../fireballView';

/**
 * Registre nommé pour les VFX d'IMPACT (ponctuels, "spawn and forget") —
 * 2026-08-16, demande d'Antoine : "vfx.spawn('fireballImpact', position)...
 * je ne veux plus de VFX bricolés individuellement dans main.ts".
 *
 * Ne couvre QUE les effets réellement ponctuels (un impact = un évènement
 * instantané). Les traînées/projectiles en vol (Boule de feu) restent
 * pilotés directement par `FireballView.sync(world.blasts, dt)` : ce sont
 * des effets CONTINUS lus depuis l'état de simulation à chaque frame, pas
 * des évènements "spawn once" — les forcer dans une API `spawn(name,
 * position)` aurait été une fausse généralisation (Antoine, "ne pas
 * sur-abstraire"). L'impact d'ombre (talent Soins excédentaires) a été
 * retiré avec les parchemins (2026-11-04).
 */
export type VfxSpawnName = 'fireballImpact';

export interface VfxSpawnParams {
  fireballImpact: { x: number; z: number; radiusTiles: number };
}

export class VfxManager {
  constructor(private readonly fireballView: FireballView) {}

  spawn<K extends VfxSpawnName>(name: K, params: VfxSpawnParams[K]): void {
    switch (name) {
      case 'fireballImpact': {
        const p = params as VfxSpawnParams['fireballImpact'];
        this.fireballView.spawnImpact(p.x, p.z, p.radiusTiles);
        return;
      }
    }
  }
}
