import * as THREE from 'three';

/**
 * Mort du Heros (2026-11-06, G48, decision d'Antoine) : effet heroique, lumineux
 * et immediatement reconnaissable, blanc dominant et legerement dore, sans
 * explosion ni gore. L'orchestration (main.ts) le lance sur l'evenement de mort
 * de la simulation (HeroEvent 'death') : rien ici ne touche la simulation, et
 * le jeu fonctionne sans cet effet. Une seule fois, a la mort : jamais pendant
 * l'attente du retour. Aucune camera, aucun blocage.
 *
 * Deroule (~2,2 s), procedural et leger (une dizaine d'objets) :
 *  1. flash blanc doux ;
 *  2. halo et cercle au sol ;
 *  3. colonne de lumiere qui s'eleve, puis quitte le sol vers le ciel ;
 *  4. lueur (l'ame) qui monte verticalement, le signal principal ;
 *  5. particules blanches et dorees ascendantes ;
 *  6. tout s'efface progressivement, puis l'effet se retire seul.
 */
export interface HeroDeathEffect {
  /** Lance un effet au sol en (x, y, z). */
  play(x: number, y: number, z: number): void;
  /** A chaque image (temps reel) ; `frozen` : pause, effet fige. */
  tick(realDt: number, frozen: boolean): void;
  /** Retire tous les effets (fin de bataille). */
  clear(): void;
  /** Effets en cours (controles et tests). */
  activeCount(): number;
}

export const HERO_DEATH_VFX_DURATION = 2.2;
const WHITE = 0xffffff;
const PALE_GOLD = 0xfff0c8;
/** Hauteur atteinte par la colonne et par la lueur (cases). */
const COLUMN_HEIGHT = 14;
const SOUL_HEIGHT = 20;
const PARTICLES = 64;
/** Taille d'une particule (cases). Camera orthographique : PointsMaterial.size
 *  s'exprime en PIXELS, convertie a chaque image selon le zoom. */
const PARTICLE_SIZE = 0.35;

interface ActiveEffect {
  root: THREE.Group;
  t: number;
  flash: THREE.Mesh;
  halo: THREE.Mesh;
  ring: THREE.Mesh;
  column: THREE.Mesh;
  soul: THREE.Sprite;
  points: THREE.Points;
  rise: Float32Array;
}

/** Textures partagees, jamais liberees (une seule instance chacune). */
let glowTexture: THREE.Texture | null = null;
function softGlow(): THREE.Texture {
  if (glowTexture) return glowTexture;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.55)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  glowTexture = new THREE.CanvasTexture(canvas);
  return glowTexture;
}

/** Degrade vertical de la colonne : dense en bas, nul en haut. */
let fadeTexture: THREE.Texture | null = null;
function verticalFade(): THREE.Texture {
  if (fadeTexture) return fadeTexture;
  const canvas = document.createElement('canvas');
  canvas.width = 4;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createLinearGradient(0, 0, 0, 64);
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(1, 'rgba(255,255,255,1)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 4, 64);
  fadeTexture = new THREE.CanvasTexture(canvas);
  return fadeTexture;
}

function additive(params: THREE.MeshBasicMaterialParameters): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, ...params });
}

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
const easeOut = (t: number): number => 1 - (1 - t) * (1 - t);
const easeIn = (t: number): number => t * t;

/** `pixelsPerCase` : pixels (de tampon) par case a l'ecran, zoom courant. */
export function createHeroDeathEffect(scene: THREE.Object3D, pixelsPerCase: () => number): HeroDeathEffect {
  const active: ActiveEffect[] = [];

  const build = (): ActiveEffect => {
    const root = new THREE.Group();
    root.name = 'hero-death-vfx';
    const flash = new THREE.Mesh(new THREE.SphereGeometry(0.7, 16, 12), additive({ color: WHITE, opacity: 0.9 }));
    flash.name = 'hero-death-flash';
    flash.position.y = 1;
    const halo = new THREE.Mesh(new THREE.CircleGeometry(1, 32), additive({ color: WHITE, opacity: 0, map: softGlow() }));
    halo.name = 'hero-death-halo';
    halo.rotation.x = -Math.PI / 2;
    halo.position.y = 0.05;
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.86, 1, 48), additive({ color: PALE_GOLD, opacity: 0.85 }));
    ring.name = 'hero-death-ring';
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.07;
    // Colonne : hauteur unite, base a l'origine locale, etiree par scale.y.
    const columnGeometry = new THREE.CylinderGeometry(0.34, 0.58, 1, 24, 1, true);
    columnGeometry.translate(0, 0.5, 0);
    const column = new THREE.Mesh(columnGeometry, additive({ color: WHITE, opacity: 0, map: verticalFade() }));
    column.name = 'hero-death-column';
    const soul = new THREE.Sprite(new THREE.SpriteMaterial({ map: softGlow(), color: WHITE, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
    soul.name = 'hero-death-soul';
    soul.position.y = 1;
    soul.scale.setScalar(1.8);
    // Particules ascendantes, positions locales ; une sur quatre doree.
    const positions = new Float32Array(PARTICLES * 3);
    const colors = new Float32Array(PARTICLES * 3);
    const rise = new Float32Array(PARTICLES);
    const white = new THREE.Color(WHITE);
    const gold = new THREE.Color(0xffdf9a);
    for (let i = 0; i < PARTICLES; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 0.2 + Math.random() * 1.3;
      positions.set([Math.cos(a) * r, Math.random() * 0.8, Math.sin(a) * r], i * 3);
      const c = i % 4 === 0 ? gold : white;
      colors.set([c.r, c.g, c.b], i * 3);
      rise[i] = 2.5 + Math.random() * 4.5;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const points = new THREE.Points(geometry, new THREE.PointsMaterial({ size: PARTICLE_SIZE * pixelsPerCase(), map: softGlow(), vertexColors: true, transparent: true, opacity: 1, depthWrite: false, blending: THREE.AdditiveBlending }));
    points.name = 'hero-death-particles';
    root.add(flash, halo, ring, column, soul, points);
    root.traverse((o) => (o.renderOrder = 20));
    return { root, t: 0, flash, halo, ring, column, soul, points, rise };
  };

  const dispose = (fx: ActiveEffect): void => {
    scene.remove(fx.root);
    fx.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry && !(o instanceof THREE.Sprite)) m.geometry.dispose();
      if (m.material) (m.material as THREE.Material).dispose();
    });
  };

  return {
    play(x, y, z) {
      const fx = build();
      fx.root.position.set(x, y, z);
      scene.add(fx.root);
      active.push(fx);
    },
    tick(realDt, frozen) {
      if (frozen) return;
      for (let i = active.length - 1; i >= 0; i--) {
        const fx = active[i]!;
        fx.t += realDt;
        const k = fx.t / HERO_DEATH_VFX_DURATION;
        if (k >= 1) {
          dispose(fx);
          active.splice(i, 1);
          continue;
        }
        // 1. Flash blanc doux, bref.
        const f = clamp01(fx.t / 0.4);
        fx.flash.scale.setScalar(0.7 + f * 1.8);
        (fx.flash.material as THREE.MeshBasicMaterial).opacity = 0.9 * (1 - f) * (1 - f);
        fx.flash.visible = f < 1;
        // 2. Halo et cercle au sol : s'elargissent, puis s'effacent.
        const w = easeOut(clamp01(fx.t / 1));
        fx.ring.scale.setScalar(0.4 + w * 2.4);
        (fx.ring.material as THREE.MeshBasicMaterial).opacity = 0.85 * (1 - clamp01(fx.t / 1.4));
        fx.halo.scale.setScalar(1.2 + w * 1.8);
        (fx.halo.material as THREE.MeshBasicMaterial).opacity = 0.7 * clamp01(fx.t / 0.25) * (1 - clamp01((fx.t - 0.9) / 1));
        // 3. Colonne : s'eleve, puis sa base quitte le sol vers le ciel.
        const grow = easeOut(clamp01(fx.t / 0.7));
        const leave = easeIn(clamp01((fx.t - 0.7) / (HERO_DEATH_VFX_DURATION - 0.7)));
        const thin = 1 - 0.55 * leave;
        fx.column.scale.set(thin, Math.max(0.01, COLUMN_HEIGHT * grow), thin);
        fx.column.position.y = COLUMN_HEIGHT * leave;
        (fx.column.material as THREE.MeshBasicMaterial).opacity = 0.75 * clamp01(fx.t / 0.2) * (1 - clamp01((k - 0.7) / 0.3));
        // 4. Lueur : le signal principal, monte verticalement en accelerant.
        const up = easeIn(clamp01((fx.t - 0.15) / (HERO_DEATH_VFX_DURATION - 0.35)));
        fx.soul.position.y = 1 + (SOUL_HEIGHT - 1) * up;
        (fx.soul.material as THREE.SpriteMaterial).opacity = clamp01((fx.t - 0.1) / 0.25) * (1 - clamp01((k - 0.8) / 0.2));
        // 5. Particules : montent, et s'effacent.
        const p = fx.points.geometry.getAttribute('position') as THREE.BufferAttribute;
        for (let j = 0; j < PARTICLES; j++) p.setY(j, p.getY(j) + fx.rise[j]! * realDt);
        p.needsUpdate = true;
        fx.points.rotation.y += realDt * 0.6;
        const pointsMaterial = fx.points.material as THREE.PointsMaterial;
        pointsMaterial.size = PARTICLE_SIZE * pixelsPerCase();
        pointsMaterial.opacity = 1 - k * k;
      }
    },
    clear() {
      for (const fx of active) dispose(fx);
      active.length = 0;
    },
    activeCount() {
      return active.length;
    },
  };
}
