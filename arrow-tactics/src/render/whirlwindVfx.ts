import * as THREE from 'three';

/**
 * Effet 3D du Tourbillon (2026-11-03) : PROVISOIRE, probablement remplace par
 * un VFX achete. Interface separee de l'etat de jeu, comme LevelUpEffect :
 * la simulation decide (HeroEvent spellStart / whirlwindPulse /
 * whirlwindEnd), le rendu ne fait qu'afficher. Hasard purement cosmetique.
 */
export interface WhirlwindEffect {
  /** Demarre l'effet du Heros `key`, ancre sur `anchor` (position au sol
   *  relue chaque image ; null = Heros disparu : l'effet s'arrete). */
  start(key: number, anchor: () => { x: number; y: number; z: number } | null): void;
  /** Frappe : bref anneau qui s'elargit au sol en (x, y, z). */
  pulse(x: number, y: number, z: number, radius: number): void;
  /** Fin de l'effet du Heros `key` (termine ou Heros mort) : retire tout de suite. */
  stop(key: number): void;
  /** A chaque image (temps reel) ; `frozen` : pause, effet fige. */
  tick(realDt: number, frozen: boolean): void;
  /** Retire tous les effets (fin de bataille). */
  clear(): void;
  /** Effets continus en cours (controles et tests). */
  activeCount(): number;
}

const RING_RADIUS = 1.6;
const STREAKS = 10;
const PULSE_SECONDS = 0.35;

/** Vitesse de rotation du Tourbillon (rad/s, 5 tours par seconde depuis le
 *  2026-11-03, demande d'Antoine : 2x plus vite) : celle du modele
 *  (UnitViews) et celle des arcs de taille, qui tournent avec lui. */
export const WHIRLWIND_SPIN_RAD_PER_S = Math.PI * 10;

/** Rayon de frappe du Tourbillon (data/spells.ts), marque au sol. */
const AREA_RADIUS = 2.25;

/** Arc de taille horizontal (secteur d'anneau) : lame qui balaie le cercle. */
function slashArc(inner: number, outer: number, sweep: number, color: number, opacity: number): THREE.Mesh {
  const geometry = new THREE.RingGeometry(inner, outer, 40, 1, 0, sweep);
  geometry.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
  mesh.userData['ownGeometry'] = true;
  return mesh;
}

/** Anneau de vent et de poussiere qui tourne autour du Heros, petits traits
 *  de mouvement, et une onde breve a chaque frappe. */
export function createProceduralWhirlwindEffect(scene: THREE.Scene): WhirlwindEffect {
  const root = new THREE.Group();
  root.name = 'whirlwind-vfx';
  scene.add(root);
  const ringGeometry = new THREE.RingGeometry(RING_RADIUS * 0.72, RING_RADIUS, 48, 1);
  ringGeometry.rotateX(-Math.PI / 2);
  const streakGeometry = new THREE.PlaneGeometry(0.9, 0.07);
  const pulseGeometry = new THREE.RingGeometry(0.9, 1, 48, 1);
  pulseGeometry.rotateX(-Math.PI / 2);

  const active = new Map<number, { group: THREE.Group; spin: THREE.Group; slash: THREE.Group; area: THREE.Mesh; anchor: () => { x: number; y: number; z: number } | null; age: number }>();
  const pulses: { mesh: THREE.Mesh; age: number; radius: number }[] = [];

  const disposeGroup = (group: THREE.Object3D): void => {
    group.traverse((o) => {
      const mesh = o as THREE.Mesh;
      (mesh.material as THREE.Material | undefined)?.dispose();
      // Geometries propres a un effet (arcs, cercle de zone) ; les autres sont partagees.
      if (mesh.userData['ownGeometry']) mesh.geometry.dispose();
    });
    group.removeFromParent();
  };

  return {
    start(key, anchor) {
      this.stop(key);
      const group = new THREE.Group();
      const spin = new THREE.Group();
      group.add(spin);
      // Anneau de poussiere (deux couches qui tournent en sens contraire).
      for (const [opacity, height] of [[0.35, 0.12], [0.22, 0.45]] as const) {
        const ring = new THREE.Mesh(ringGeometry, new THREE.MeshBasicMaterial({ color: 0xd8cfb8, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide }));
        ring.position.y = height;
        ring.scale.setScalar(height > 0.2 ? 0.8 : 1);
        ring.userData['dir'] = height > 0.2 ? -1 : 1;
        spin.add(ring);
      }
      // Traits de mouvement tangents au cercle.
      for (let i = 0; i < STREAKS; i++) {
        const a = (i / STREAKS) * Math.PI * 2;
        const streak = new THREE.Mesh(streakGeometry, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide }));
        const r = RING_RADIUS * (0.75 + Math.random() * 0.35);
        streak.position.set(Math.cos(a) * r, 0.25 + Math.random() * 0.9, Math.sin(a) * r);
        streak.rotation.y = -a;
        spin.add(streak);
      }
      // Effet circulaire (2026-11-03) : deux arcs de taille opposes (lame et
      // trainee) a hauteur d'arme, qui tournent avec le modele, et le cercle
      // de la zone de frappe au sol, qui palpite.
      const slash = new THREE.Group();
      slash.name = 'whirlwind-slash';
      for (const [height, phase] of [[0.7, 0], [1.05, Math.PI]] as const) {
        const blade = slashArc(0.55, 1.45, Math.PI * 0.55, 0xfff6dc, 0.75);
        const trail = slashArc(0.6, 1.4, Math.PI * 1.1, 0xffd58a, 0.28);
        for (const arc of [blade, trail]) {
          arc.position.y = height;
          arc.rotation.y = phase;
          slash.add(arc);
        }
        // La trainee suit la lame (sens de rotation).
        trail.rotation.y = phase - Math.PI * 0.55;
      }
      group.add(slash);
      const areaGeometry = new THREE.RingGeometry(AREA_RADIUS - 0.08, AREA_RADIUS, 64, 1);
      areaGeometry.rotateX(-Math.PI / 2);
      const area = new THREE.Mesh(areaGeometry, new THREE.MeshBasicMaterial({ color: 0xffe2a0, transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
      area.name = 'whirlwind-area';
      area.userData['ownGeometry'] = true;
      area.position.y = 0.05;
      group.add(area);
      root.add(group);
      active.set(key, { group, spin, slash, area, anchor, age: 0 });
    },
    pulse(x, y, z, radius) {
      const mesh = new THREE.Mesh(pulseGeometry, new THREE.MeshBasicMaterial({ color: 0xfff1c4, transparent: true, opacity: 0.6, depthWrite: false, side: THREE.DoubleSide }));
      mesh.position.set(x, y + 0.06, z);
      mesh.scale.setScalar(radius * 0.4);
      root.add(mesh);
      pulses.push({ mesh, age: 0, radius });
    },
    stop(key) {
      const fx = active.get(key);
      if (!fx) return;
      disposeGroup(fx.group);
      active.delete(key);
    },
    tick(realDt, frozen) {
      const dt = frozen ? 0 : realDt;
      for (const [key, fx] of active) {
        const p = fx.anchor();
        if (!p) {
          this.stop(key);
          continue;
        }
        fx.age += dt;
        fx.group.position.set(p.x, p.y, p.z);
        fx.spin.rotation.y += dt * 9;
        for (const child of fx.spin.children) {
          const dir = child.userData['dir'] as number | undefined;
          if (dir !== undefined) child.rotation.y += dt * 4 * dir;
        }
        // Apparition douce.
        fx.spin.scale.setScalar(Math.min(1, 0.4 + fx.age * 4));
        // Arcs de taille : meme vitesse que le modele ; cercle de zone qui palpite.
        fx.slash.rotation.y += dt * WHIRLWIND_SPIN_RAD_PER_S;
        fx.slash.scale.setScalar(Math.min(1, 0.3 + fx.age * 5));
        (fx.area.material as THREE.MeshBasicMaterial).opacity = 0.35 + 0.25 * Math.sin(fx.age * Math.PI * 4);
      }
      for (let i = pulses.length - 1; i >= 0; i--) {
        const pl = pulses[i]!;
        pl.age += dt;
        const t = pl.age / PULSE_SECONDS;
        if (t >= 1) {
          disposeGroup(pl.mesh);
          pulses.splice(i, 1);
          continue;
        }
        pl.mesh.scale.setScalar(pl.radius * (0.4 + 0.6 * t));
        (pl.mesh.material as THREE.MeshBasicMaterial).opacity = 0.6 * (1 - t);
      }
    },
    clear() {
      for (const key of [...active.keys()]) this.stop(key);
      for (const pl of pulses) disposeGroup(pl.mesh);
      pulses.length = 0;
    },
    activeCount() {
      return active.size;
    },
  };
}
