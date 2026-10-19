import * as THREE from 'three';
import type { Team } from '../sim/entity';
import { teamColor } from './unitSelectionRing';

/**
 * Retour visuel d'un ordre de deplacement accepte en bataille, a la couleur
 * du camp qui l'a donne (l'attaque a son propre retour, voir
 * render/attackOrderFeedback.ts) :
 *  - une pulsation au point vise : anneau fin qui s'agrandit en s'estompant ;
 *  - pour un groupe, une petite pastille pleine sous chaque destination
 *    reellement attribuee. Pleine plutot qu'un anneau, pour ne jamais se
 *    confondre avec l'anneau de selection d'une unite.
 *
 * Purement cosmetique, declenche depuis les resultats de commande de la
 * simulation (World.commandResults) : jamais lu depuis le rendu de l'etat.
 * Marqueurs en reserve, reutilises et masques, jamais recrees a chaque
 * ordre ; chacun a son propre materiau (opacite animee independamment),
 * cree une seule fois quand la reserve grandit.
 */

const PULSE_DURATION = 0.45;
const PULSE_START_RADIUS = 0.25;
const PULSE_END_RADIUS = 0.9;
const PULSE_START_OPACITY = 0.9;
const PULSE_HEIGHT = 0.035;

const DOT_DURATION = 0.6;
/** Apparition tres courte de la pastille (echelle 0,6 -> 1). */
const DOT_POP_DURATION = 0.08;
const DOT_RADIUS = 0.16;
const DOT_START_OPACITY = 0.6;
const DOT_HEIGHT = 0.03;

/** Geometries de rayon 1, partagees et mises a l'echelle. */
const pulseGeometry = new THREE.RingGeometry(0.86, 1, 40);
pulseGeometry.rotateX(-Math.PI / 2);
const dotGeometry = new THREE.CircleGeometry(1, 20);
dotGeometry.rotateX(-Math.PI / 2);

interface Marker {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  elapsed: number;
  active: boolean;
}

function buildMarker(geometry: THREE.BufferGeometry, group: THREE.Group): Marker {
  const material = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.raycast = () => {};
  mesh.visible = false;
  group.add(mesh);
  return { mesh, material, elapsed: 0, active: false };
}

function start(marker: Marker, x: number, y: number, z: number, color: number): void {
  marker.material.color.setHex(color);
  marker.mesh.position.set(x, y, z);
  marker.elapsed = 0;
  marker.active = true;
  marker.mesh.visible = true;
}

function stop(marker: Marker): void {
  marker.active = false;
  marker.mesh.visible = false;
}

export class MoveOrderFeedback {
  /** A ajouter a la scene par l'appelant. */
  readonly group = new THREE.Group();
  private readonly pulses: Marker[] = [];
  private readonly dots: Marker[] = [];

  /** Ordre de deplacement accepte : pulsation au point vise (`x`, `z`) et,
   *  pour un groupe (2 destinations ou plus), une pastille par destination.
   *  Les pastilles de l'ordre precedent, devenues obsoletes, sont remplacees
   *  aussitot ; ses pulsations finissent leur courte animation. */
  spawn(x: number, z: number, destinations: readonly { x: number; z: number }[], team: Team): void {
    const color = teamColor(team);
    const pulse = this.pulses.find((p) => !p.active) ?? this.addMarker(this.pulses, pulseGeometry);
    start(pulse, x, PULSE_HEIGHT, z, color);
    this.updatePulse(pulse);

    for (const dot of this.dots) stop(dot);
    if (destinations.length < 2) return;
    destinations.forEach((d, i) => {
      const dot = this.dots[i] ?? this.addMarker(this.dots, dotGeometry);
      start(dot, d.x, DOT_HEIGHT, d.z, color);
      this.updateDot(dot);
    });
  }

  /** A appeler chaque frame, en temps reel (comme les autres VFX). */
  sync(dt: number): void {
    for (const pulse of this.pulses) {
      if (!pulse.active) continue;
      pulse.elapsed += dt;
      if (pulse.elapsed >= PULSE_DURATION) stop(pulse);
      else this.updatePulse(pulse);
    }
    for (const dot of this.dots) {
      if (!dot.active) continue;
      dot.elapsed += dt;
      if (dot.elapsed >= DOT_DURATION) stop(dot);
      else this.updateDot(dot);
    }
  }

  /** Masque tout (fin de bataille, changement de phase) : aucun marqueur ne
   *  survit a une transition. */
  clear(): void {
    for (const pulse of this.pulses) stop(pulse);
    for (const dot of this.dots) stop(dot);
  }

  private addMarker(pool: Marker[], geometry: THREE.BufferGeometry): Marker {
    const marker = buildMarker(geometry, this.group);
    pool.push(marker);
    return marker;
  }

  private updatePulse(pulse: Marker): void {
    const t = pulse.elapsed / PULSE_DURATION;
    const ease = 1 - (1 - t) * (1 - t);
    pulse.mesh.scale.setScalar(PULSE_START_RADIUS + (PULSE_END_RADIUS - PULSE_START_RADIUS) * ease);
    pulse.material.opacity = PULSE_START_OPACITY * (1 - t);
  }

  private updateDot(dot: Marker): void {
    const pop = Math.min(1, dot.elapsed / DOT_POP_DURATION);
    dot.mesh.scale.setScalar(DOT_RADIUS * (0.6 + 0.4 * pop));
    const fadeT = dot.elapsed / DOT_DURATION;
    dot.material.opacity = DOT_START_OPACITY * (1 - fadeT * fadeT);
  }
}
