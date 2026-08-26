import * as THREE from 'three';
import { COLORS, TILE } from '../config/constants';
import type { Entity } from '../sim/entity';

/**
 * Telegraphe au sol pendant l'incantation d'une capacite de zone (Boule de
 * feu du Mage — 2026-08-11, demande explicite d'Antoine, point 9 : "le
 * joueur doit pouvoir comprendre 'une grosse attaque va arriver ici', même
 * si ses unités sont contrôlées automatiquement", surtout pour un Mage
 * ENNEMI). Un disque plat translucide, positionne sur `entity.cast.targetX/
 * targetZ` (deja VERROUILLE, voir Entity.cast) et mis a l'echelle de
 * `entity.cast.radiusTiles` — lu directement depuis l'etat de simulation
 * chaque frame, aucun evenement dedie necessaire.
 *
 * Un disque par entite en train d'incanter (pas un pool partage) : cree a
 * l'apparition du cast, retire des qu'il se termine (impact ou interruption
 * par la mort — Entity.cast redevient null dans les deux cas, voir
 * sim/systems/abilities.ts).
 */
export class TelegraphView {
  readonly group = new THREE.Group();
  private readonly discs = new Map<number, THREE.Mesh>();

  sync(entities: Entity[]): void {
    const activeIds = new Set<number>();

    for (const e of entities) {
      if (!e.alive || !e.cast) continue;
      activeIds.add(e.id);

      let disc = this.discs.get(e.id);
      if (!disc) {
        disc = buildDisc();
        this.discs.set(e.id, disc);
        this.group.add(disc);
      }
      disc.position.set(e.cast.targetX, 0.03, e.cast.targetZ);
      disc.scale.setScalar(e.cast.radiusTiles * TILE);
    }

    for (const [id, disc] of this.discs) {
      if (activeIds.has(id)) continue;
      this.group.remove(disc);
      this.discs.delete(id);
    }
  }

  clear(): void {
    for (const disc of this.discs.values()) this.group.remove(disc);
    this.discs.clear();
  }
}

function buildDisc(): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.CircleGeometry(1, 24),
    new THREE.MeshBasicMaterial({ color: COLORS.fireGlow, transparent: true, opacity: 0.35, side: THREE.DoubleSide }),
  );
  mesh.rotation.x = -Math.PI / 2;
  return mesh;
}
