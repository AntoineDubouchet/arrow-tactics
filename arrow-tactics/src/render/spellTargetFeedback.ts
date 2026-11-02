import * as THREE from 'three';
import type { Entity } from '../sim/entity';
import { createAnimatedUnitRing, placeUnitRing } from './unitSelectionRing';

/**
 * Retour visuel d'une cible de sort validee (2026-11-02, Soin) : sous la
 * cible, l'anneau d'unite commun (meme geometrie et placement que l'anneau
 * de selection, render/unitSelectionRing.ts), jaune, qui s'allume puis
 * s'efface en FLASH_SECONDS en s'elargissant a peine. Seul message : « cette
 * unite est bien la cible ». L'incantation prend ensuite le relais.
 *
 * Purement cosmetique, declenche depuis les resultats de commande de la
 * simulation (ordre `cast` accepte), comme AttackOrderFeedback. Chaque frame,
 * l'anneau est repose a la position RENDUE de la cible (coordonnees monde),
 * jamais une coordonnee ecran : il ne derive pas et suit une cible qui
 * bouge. S'arrete si la cible meurt ou disparait.
 */

/** Duree du flash (s). PROVISOIRE. */
const FLASH_SECONDS = 0.25;
/** Elargissement en fin de flash (fraction de l'anneau d'unite). */
const FLASH_GROWTH = 0.2;
const FLASH_COLOR = 0xffd25a;

type Lookup = (entityId: number) => Entity | undefined;
type RenderedPosition = (entityId: number) => { x: number; z: number } | null;

interface Marker {
  ring: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  targetId: number | null;
  elapsed: number;
}

export class SpellTargetFeedback {
  /** A ajouter a la scene par l'appelant. */
  readonly group = Object.assign(new THREE.Group(), { name: 'spell-target-feedback' });
  private readonly markers: Marker[] = [];

  /** Cible validee : un nouveau flash sur une cible qui en a deja un le
   *  relance (jamais deux anneaux superposes). */
  spawn(targetEntityId: number): void {
    const marker =
      this.markers.find((m) => m.targetId === targetEntityId) ?? this.markers.find((m) => m.targetId === null) ?? this.addMarker();
    marker.targetId = targetEntityId;
    marker.elapsed = 0;
  }

  /** A appeler chaque frame, en temps reel, apres UnitViews.sync. */
  sync(dt: number, lookup: Lookup, renderedPosition: RenderedPosition): void {
    for (const marker of this.markers) {
      if (marker.targetId === null) continue;
      const target = lookup(marker.targetId);
      if (!target || !target.alive || marker.elapsed >= FLASH_SECONDS) {
        this.stop(marker);
        continue;
      }
      const t = marker.elapsed / FLASH_SECONDS;
      const pos = renderedPosition(target.id) ?? { x: target.x, z: target.z };
      placeUnitRing(marker.ring, pos.x, pos.z, target.stats.radius);
      marker.ring.scale.multiplyScalar(1 + FLASH_GROWTH * t);
      marker.material.opacity = 0.95 * (1 - t);
      marker.elapsed += dt;
    }
  }

  /** Masque tout (changement de phase). */
  clear(): void {
    for (const marker of this.markers) this.stop(marker);
  }

  private addMarker(): Marker {
    const ring = createAnimatedUnitRing('player');
    const material = ring.material as THREE.MeshBasicMaterial;
    material.color.setHex(FLASH_COLOR);
    ring.visible = false;
    this.group.add(ring);
    const marker: Marker = { ring, material, targetId: null, elapsed: 0 };
    this.markers.push(marker);
    return marker;
  }

  private stop(marker: Marker): void {
    marker.targetId = null;
    marker.ring.visible = false;
  }
}
