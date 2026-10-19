import * as THREE from 'three';
import type { Entity } from '../sim/entity';
import { createAnimatedUnitRing, placeUnitRing, teamColor } from './unitSelectionRing';

/**
 * Retour visuel d'un ordre d'attaque accepte en bataille : sous la cible,
 * l'anneau d'unite commun (meme geometrie, meme taille, meme hauteur que
 * l'anneau de selection ou d'inspection, render/unitSelectionRing.ts), a la
 * couleur du camp de la cible, qui clignote brievement puis disparait.
 * Seule l'opacite varie : la geometrie reste fixe. Inspection = anneau
 * stable, ordre d'attaque = anneau qui clignote.
 *
 * Purement cosmetique, declenche depuis les resultats de commande de la
 * simulation (World.commandResults), comme MoveOrderFeedback. L'anneau suit
 * la position rendue de la cible et s'arrete si elle meurt ou disparait
 * (world.clear()). Anneaux en reserve, reutilises et masques.
 */

/** Duree d'une phase (allume ou attenue). */
const BLINK_STEP_SECONDS = 0.12;
/** Nombre de cycles allume -> attenue avant de disparaitre. */
const BLINK_COUNT = 4;
const BLINK_DURATION = BLINK_STEP_SECONDS * 2 * BLINK_COUNT;
/** Allume : meme opacite que l'anneau de selection. */
const BRIGHT_OPACITY = 0.9;
const DIM_OPACITY = 0.2;

type Lookup = (entityId: number) => Entity | undefined;
type RenderedPosition = (entityId: number) => { x: number; z: number } | null;

interface Marker {
  ring: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  /** Cible en cours, null si l'anneau est libre. */
  targetId: number | null;
  elapsed: number;
}

export class AttackOrderFeedback {
  /** A ajouter a la scene par l'appelant. */
  readonly group = new THREE.Group();
  private readonly markers: Marker[] = [];

  /** Ordre d'attaque accepte sur `targetEntityId`. Un nouvel ordre sur une
   *  cible qui clignote deja relance son animation (jamais deux anneaux
   *  superposes) ; les autres cibles finissent leur courte animation. */
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
      if (!target || !target.alive || marker.elapsed >= BLINK_DURATION) {
        this.stop(marker);
        continue;
      }
      const pos = renderedPosition(target.id) ?? { x: target.x, z: target.z };
      marker.material.color.setHex(teamColor(target.team));
      placeUnitRing(marker.ring, pos.x, pos.z, target.stats.radius);
      marker.material.opacity = Math.floor(marker.elapsed / BLINK_STEP_SECONDS) % 2 === 0 ? BRIGHT_OPACITY : DIM_OPACITY;
      marker.elapsed += dt;
    }
  }

  /** Masque tout (changement de phase) : aucun anneau ne survit. */
  clear(): void {
    for (const marker of this.markers) this.stop(marker);
  }

  private addMarker(): Marker {
    const ring = createAnimatedUnitRing('enemy');
    ring.visible = false;
    this.group.add(ring);
    const marker: Marker = { ring, material: ring.material as THREE.MeshBasicMaterial, targetId: null, elapsed: 0 };
    this.markers.push(marker);
    return marker;
  }

  private stop(marker: Marker): void {
    marker.targetId = null;
    marker.ring.visible = false;
  }
}
