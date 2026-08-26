import type { FireballView } from '../fireballView';
import type { ShadowProjectileView } from '../shadowProjectileView';

/**
 * Registre nommé pour les VFX d'IMPACT (ponctuels, "spawn and forget") —
 * 2026-08-16, demande d'Antoine : "vfx.spawn('fireballImpact', position)...
 * je ne veux plus de VFX bricolés individuellement dans main.ts".
 *
 * Ne couvre QUE les effets réellement ponctuels (un impact = un évènement
 * instantané). Les traînées/projectiles en vol (Boule de feu, projectile
 * d'ombre) restent pilotés directement par `FireballView.sync(world.blasts,
 * dt)`/`ShadowProjectileView.sync(world.shadowProjectiles, dt)` : ce sont des
 * effets CONTINUS lus depuis l'état de simulation à chaque frame, pas des
 * évènements "spawn once" — les forcer dans une API `spawn(name, position)`
 * aurait été une fausse généralisation (Antoine, "ne pas sur-abstraire").
 */
export type VfxSpawnName = 'fireballImpact' | 'shadowImpact';

export interface VfxSpawnParams {
  fireballImpact: { x: number; z: number; radiusTiles: number };
  shadowImpact: { x: number; z: number };
}

export class VfxManager {
  constructor(
    private readonly fireballView: FireballView,
    private readonly shadowProjectileView: ShadowProjectileView,
  ) {}

  spawn<K extends VfxSpawnName>(name: K, params: VfxSpawnParams[K]): void {
    switch (name) {
      case 'fireballImpact': {
        const p = params as VfxSpawnParams['fireballImpact'];
        this.fireballView.spawnImpact(p.x, p.z, p.radiusTiles);
        return;
      }
      case 'shadowImpact': {
        const p = params as VfxSpawnParams['shadowImpact'];
        this.shadowProjectileView.spawnImpact(p.x, p.z);
        return;
      }
    }
  }
}
