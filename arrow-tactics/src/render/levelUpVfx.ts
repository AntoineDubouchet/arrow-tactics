import * as THREE from 'three';

/**
 * VFX de montee de niveau du Heros (2026-11-02, PROVISOIRE : sera
 * probablement remplace par un VFX achete).
 *
 * Architecture remplacable : l'orchestration (main.ts) ne connait que
 * l'interface LevelUpEffect — elle recoit l'evenement de la simulation
 * (HeroEvent 'levelUp') et appelle play(). Aucune regle de niveau ni d'XP ici,
 * et rien d'ici ne touche la simulation. Remplacer l'effet = fournir une
 * autre implementation de LevelUpEffect (createProceduralLevelUpEffect
 * ci-dessous est la seule aujourd'hui).
 *
 * Effet procedural (~1,3 s), dans le monde 3D, centre sur la position
 * AFFICHEE du Heros et qui le suit pendant sa duree (ancrage relu chaque
 * image) : flash blanc-dore, onde au sol, colonne de lumiere, particules qui
 * montent, quelques etincelles dorees et une touche bleue (Paladin).
 * Agregation : un seul effet par Heros ; un nouveau niveau pendant l'effet le
 * RELANCE depuis le debut (jamais d'empilement de 15 effets).
 */
export interface LevelUpEffect {
  /** Lance (ou relance) l'effet du Heros `key`, ancre sur `anchor` (position
   *  au sol relue chaque image ; null = Heros disparu, l'effet reste sur
   *  place). */
  play(key: number, anchor: () => { x: number; y: number; z: number } | null): void;
  /** A chaque image (temps reel) ; `frozen` : pause, effet fige. */
  tick(realDt: number, frozen: boolean): void;
  /** Retire tous les effets (fin de bataille). */
  clear(): void;
  /** Effets en cours (controles et tests). */
  activeCount(): number;
}

const DURATION = 1.3;
const GOLD = 0xffd36b;
const WHITE = 0xfff8e6;
const BLUE = 0x9fd4ff;
const PARTICLES = 26;
const SPARKS = 10;

interface ActiveEffect {
  root: THREE.Group;
  anchor: () => { x: number; y: number; z: number } | null;
  t: number;
  flash: THREE.Mesh;
  ring: THREE.Mesh;
  innerRing: THREE.Mesh;
  column: THREE.Mesh;
  points: THREE.Points;
  sparks: THREE.Points;
  /** Vitesses verticales et phases des particules (cosmetique). */
  rise: Float32Array;
  sparkDir: Float32Array;
}

/** Petite texture ronde et douce pour les particules (partagee). */
let dotTexture: THREE.Texture | null = null;
function softDot(): THREE.Texture {
  if (dotTexture) return dotTexture;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 32;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.4, 'rgba(255,255,255,0.6)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 32, 32);
  dotTexture = new THREE.CanvasTexture(canvas);
  return dotTexture;
}

function additive(color: number, opacity: number, side: THREE.Side = THREE.FrontSide): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, side });
}

const easeOut = (t: number): number => 1 - (1 - t) * (1 - t);

export function createProceduralLevelUpEffect(scene: THREE.Object3D): LevelUpEffect {
  const active = new Map<number, ActiveEffect>();

  const build = (): ActiveEffect => {
    const root = new THREE.Group();
    root.name = 'level-up-vfx';
    root.renderOrder = 20;
    const flash = new THREE.Mesh(new THREE.SphereGeometry(0.55, 16, 12), additive(WHITE, 0.9));
    flash.position.y = 0.9;
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.82, 1, 48), additive(GOLD, 0.85, THREE.DoubleSide));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.06;
    const innerRing = new THREE.Mesh(new THREE.RingGeometry(0.88, 1, 48), additive(BLUE, 0.6, THREE.DoubleSide));
    innerRing.rotation.x = -Math.PI / 2;
    innerRing.position.y = 0.05;
    const column = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.62, 3.2, 24, 1, true), additive(GOLD, 0.45, THREE.DoubleSide));
    column.position.y = 1.6;
    // Particules montantes (dorees et quelques bleues), positions locales.
    const positions = new Float32Array(PARTICLES * 3);
    const colors = new Float32Array(PARTICLES * 3);
    const rise = new Float32Array(PARTICLES);
    const gold = new THREE.Color(GOLD);
    const blue = new THREE.Color(BLUE);
    for (let i = 0; i < PARTICLES; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 0.25 + Math.random() * 0.55;
      positions.set([Math.cos(a) * r, Math.random() * 0.4, Math.sin(a) * r], i * 3);
      const c = i % 5 === 0 ? blue : gold;
      colors.set([c.r, c.g, c.b], i * 3);
      rise[i] = 1.2 + Math.random() * 1.6;
    }
    const pGeo = new THREE.BufferGeometry();
    pGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    pGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const points = new THREE.Points(pGeo, new THREE.PointsMaterial({ size: 0.22, map: softDot(), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    // Etincelles dorees projetees en gerbe.
    const sparkPos = new Float32Array(SPARKS * 3);
    const sparkDir = new Float32Array(SPARKS * 3);
    for (let i = 0; i < SPARKS; i++) {
      const a = (i / SPARKS) * Math.PI * 2 + Math.random() * 0.4;
      sparkPos.set([0, 1, 0], i * 3);
      sparkDir.set([Math.cos(a) * (1.4 + Math.random()), 2.2 + Math.random() * 1.5, Math.sin(a) * (1.4 + Math.random())], i * 3);
    }
    const sGeo = new THREE.BufferGeometry();
    sGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3));
    const sparks = new THREE.Points(sGeo, new THREE.PointsMaterial({ size: 0.16, map: softDot(), color: 0xffe9a8, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    root.add(flash, ring, innerRing, column, points, sparks);
    for (const o of root.children) o.renderOrder = 20;
    return { root, anchor: () => null, t: 0, flash, ring, innerRing, column, points, sparks, rise, sparkDir };
  };

  const dispose = (fx: ActiveEffect): void => {
    scene.remove(fx.root);
    fx.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.geometry) return;
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
    });
  };

  const place = (fx: ActiveEffect): void => {
    const at = fx.anchor();
    if (at) fx.root.position.set(at.x, at.y, at.z);
  };

  return {
    play(key, anchor) {
      // Agregation : un effet deja en cours pour ce Heros est relance.
      const existing = active.get(key);
      const fx = existing ?? build();
      fx.anchor = anchor;
      fx.t = 0;
      if (!existing) {
        scene.add(fx.root);
        active.set(key, fx);
      }
      place(fx);
    },
    tick(realDt, frozen) {
      if (frozen) return;
      for (const [key, fx] of active) {
        fx.t += realDt;
        const k = fx.t / DURATION;
        if (k >= 1) {
          dispose(fx);
          active.delete(key);
          continue;
        }
        place(fx);
        // Flash : bref (0,25 s), grossit et s'efface.
        const f = Math.min(1, fx.t / 0.25);
        fx.flash.scale.setScalar(0.6 + f * 1.4);
        (fx.flash.material as THREE.MeshBasicMaterial).opacity = 0.9 * (1 - f);
        fx.flash.visible = f < 1;
        // Onde au sol : s'elargit jusqu'a 2,4 cases et s'efface.
        const w = easeOut(Math.min(1, fx.t / 0.8));
        fx.ring.scale.setScalar(0.3 + w * 2.1);
        (fx.ring.material as THREE.MeshBasicMaterial).opacity = 0.85 * (1 - w);
        const w2 = easeOut(Math.min(1, Math.max(0, fx.t - 0.12) / 0.8));
        fx.innerRing.scale.setScalar(0.2 + w2 * 1.6);
        (fx.innerRing.material as THREE.MeshBasicMaterial).opacity = 0.6 * (1 - w2);
        // Colonne : monte vite, puis s'amincit et s'efface.
        const c = Math.min(1, fx.t / 0.2);
        fx.column.scale.set(1 - 0.6 * k, c, 1 - 0.6 * k);
        fx.column.position.y = 1.6 * c;
        (fx.column.material as THREE.MeshBasicMaterial).opacity = 0.45 * (1 - k) * c;
        // Particules qui montent en tournant doucement.
        const p = fx.points.geometry.getAttribute('position') as THREE.BufferAttribute;
        for (let i = 0; i < PARTICLES; i++) p.setY(i, p.getY(i) + fx.rise[i]! * realDt);
        p.needsUpdate = true;
        fx.points.rotation.y += realDt * 1.5;
        (fx.points.material as THREE.PointsMaterial).opacity = 1 - k * k;
        // Etincelles : gerbe balistique courte.
        const s = fx.sparks.geometry.getAttribute('position') as THREE.BufferAttribute;
        for (let i = 0; i < SPARKS; i++) {
          s.setXYZ(i, fx.sparkDir[i * 3]! * fx.t, 1 + fx.sparkDir[i * 3 + 1]! * fx.t - 4.5 * fx.t * fx.t, fx.sparkDir[i * 3 + 2]! * fx.t);
        }
        s.needsUpdate = true;
        (fx.sparks.material as THREE.PointsMaterial).opacity = Math.max(0, 1 - fx.t / 0.9);
      }
    },
    clear() {
      for (const fx of active.values()) dispose(fx);
      active.clear();
    },
    activeCount() {
      return active.size;
    },
  };
}
