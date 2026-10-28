import * as THREE from 'three';
import {
  SHADOW_PROJECTILE_CORE_COLOR,
  SHADOW_PROJECTILE_CROWN_COLOR,
  SHADOW_PROJECTILE_GLOW_COLOR,
  SHADOW_PROJECTILE_IMPACT_COLOR,
  SHADOW_PROJECTILE_SHELL_COLOR,
} from '../config/constants';
import type { ShadowProjectile } from '../sim/systems/shadowProjectiles';
import { buildOrbitingSprites, tickOrbitingSprites, type OrbitingSprite } from './vfx/orbitingSprites';
import { spawnRadialParticles, tickRadialParticles, type RadialParticle } from './vfx/radialBurst';
import { createVfxSprite, getVfxCoreMaterial, type VfxMaterialSpec } from './vfx/vfxMaterials';
import { surfaceY } from './terrainSurface';

/**
 * Rendu des projectiles d'ombre (talent "Soins excédentaires") — DEUXIÈME
 * passe VFX (2026-08-18, retour d'Antoine : "toujours pas assez visuelles...
 * je veux que ça ressemble à de petites boules de magie violette, dans
 * l'esprit de la Fireball du Mage, mais plus petites/violettes/rapides/
 * nerveuses"). Reprend explicitement la recette de `fireballView.ts`
 * (noyau + coque + double halo + éléments orbitants + traînée + impact),
 * mise à l'échelle nettement plus PETITE et recolorée dans une palette
 * violet/mauve/magenta sombre — jamais une Fireball violette en taille
 * réduite : reste délibérément SOBRE (pas de PointLight, pas de fumée, pas
 * de décalque au sol), toujours automatiquement ATTÉNUÉ à mesure que le
 * nombre de projectiles simultanés grandit (voir crowdFactor) pour qu'une
 * salve de 15-30 orbes reste lisible.
 *
 * Nouveau dans cette passe : (1) une COQUE semi-transparente autour du
 * noyau (comme la Fireball) pour un vrai volume plutôt qu'un point ; (2) une
 * "couronne" ornée (texture magic_02, un vrai motif de rune/cercle) qui
 * orbite lentement en plus du halo rond — donne l'aura "mauve visible" une
 * vraie identité graphique distincte d'un simple flou ; (3) un STRETCH
 * directionnel du noyau+coque (déduit de l'historique de positions, le
 * projectile étant homing) pour une sensation de vitesse — les sprites
 * (toujours face caméra) ne sont JAMAIS inclus dans ce sous-groupe étiré,
 * pour ne jamais les déformer.
 *
 * `World.shadowProjectiles` est la source de vérité (position/état
 * RÉELLEMENT simulés) : ce fichier ne fait que LIRE cet état chaque frame et
 * le dessiner — Map clée par l'objet `ShadowProjectile` lui-même (la sim ne
 * lui donne pas d'id stable).
 *
 * Performance (demande explicite, point 8) : AUCUNE PointLight (comme avant),
 * matériaux GABARIT mis en cache et seulement CLONÉS par instance (jamais
 * par frame, voir vfxMaterials.ts), géométries de sphère PARTAGÉES (jamais
 * reconstruites par projectile), aucun `TextureLoader` par tir (cache par
 * nom, vfxTextures.ts).
 */

const HEIGHT = 0.5;

const CORE_RADIUS = 0.075;
const SHELL_RADIUS = 0.13;
const SHELL_PULSE_SPEED = 16;
const SHELL_PULSE_AMOUNT = 0.16;

const INNER_GLOW_SCALE = 0.26;
const INNER_GLOW_PULSE_SPEED = 9;
const INNER_GLOW_PULSE_AMOUNT = 0.16;
const OUTER_GLOW_SCALE = 0.4;
const OUTER_GLOW_PULSE_SPEED = 5.5;
const OUTER_GLOW_PULSE_AMOUNT = 0.18;
const OUTER_GLOW_PHASE = 2.1;

/** "Couronne" ornée (magic_02.png) — orbite lentement en PLAN (rotation du
 *  sprite lui-même, pas une orbite 3D comme les volutes), pulse légèrement. */
const CROWN_SCALE = 0.34;
const CROWN_SPIN_SPEED = 1.6;
const CROWN_PULSE_SPEED = 3.4;
const CROWN_PULSE_AMOUNT = 0.1;
const CROWN_OPACITY = 0.5;

/** Nombre de projectiles simultanés au-delà duquel l'échelle/opacité de
 *  CHAQUE orbe est réduite proportionnellement — recalculé À CHAQUE frame
 *  depuis le nombre RÉEL de projectiles encore en vol. */
const CROWD_THRESHOLD = 8;
const CROWD_MAX = 30;
const CROWD_MIN_SCALE = 0.5;
const CROWD_MIN_OPACITY_SCALE = 0.6;

function crowdFactor(count: number, floor: number): number {
  if (count <= CROWD_THRESHOLD) return 1;
  const t = Math.min(1, (count - CROWD_THRESHOLD) / (CROWD_MAX - CROWD_THRESHOLD));
  return 1 - t * (1 - floor);
}

const WISP_SPECS: VfxMaterialSpec[] = [
  { texture: 'twirl_01.png', color: SHADOW_PROJECTILE_GLOW_COLOR, blending: 'additive', opacity: 0.6 },
  { texture: 'twirl_02.png', color: SHADOW_PROJECTILE_GLOW_COLOR, blending: 'additive', opacity: 0.55 },
];
const WISP_COUNT = 3;
const WISP_ORBIT_RADIUS = 0.1;
const WISP_BASE_SCALE = 0.19;
const WISP_FLICKER_SPEED = 9;
const WISP_FLICKER_AMOUNT = 0.32;
const WISP_SPIN_SPEED_MIN = 1.1;
const WISP_SPIN_SPEED_MAX = 2.6;

/** Stretch directionnel (2026-08-18, "impression de vitesse") — le noyau+
 *  coque s'étirent le long de l'axe de déplacement (déduit de l'historique)
 *  et se compriment légèrement perpendiculairement, comme un projectile qui
 *  fend l'air. Jamais applique aux sprites (toujours face caméra, un
 *  stretch de leur PARENT les déformerait de façon indésirable). */
const STRETCH_AMOUNT = 0.55;
const STRETCH_SQUASH = 0.22;
const MIN_STRETCH_DIST = 0.01;

const TRAIL_COUNT = 3;
const TRAIL_SCALES = [0.15, 0.1, 0.06];
const TRAIL_OPACITIES = [0.55, 0.35, 0.2];
const HISTORY_LENGTH = TRAIL_COUNT + 1;

const IMPACT_DURATION = 0.26;
const IMPACT_FLASH_DURATION = 0.11;
const IMPACT_SCALE = 0.46;
const IMPACT_PARTICLE_COUNT = 6;

interface ShadowBoltMesh {
  group: THREE.Group;
  /** Sous-groupe DEDIE au noyau+coque (2026-08-18) — seul a recevoir le
   *  stretch directionnel, jamais les sprites (voir commentaire de classe). */
  coreGroup: THREE.Group;
  shell: THREE.Mesh;
  innerGlow: THREE.Sprite;
  outerGlow: THREE.Sprite;
  crown: THREE.Sprite;
  wisps: OrbitingSprite[];
  wispSpin: number[];
  trail: THREE.Sprite[];
  /** Positions passées (x, z), la plus récente en DERNIER — sert à la fois
   *  à la traînée ET au calcul de direction pour le stretch. */
  history: { x: number; z: number }[];
  elapsed: number;
}

interface ShadowImpactFx {
  flash: THREE.Sprite;
  implosionRing: THREE.Mesh;
  crownBurst: THREE.Sprite;
  particles: RadialParticle[];
  elapsed: number;
}

export class ShadowProjectileView {
  readonly group = new THREE.Group();
  private readonly bolts = new Map<ShadowProjectile, ShadowBoltMesh>();
  private readonly impacts: ShadowImpactFx[] = [];

  sync(projectiles: ShadowProjectile[], realDt: number): void {
    const active = new Set(projectiles);
    const scale = crowdFactor(projectiles.length, CROWD_MIN_SCALE);
    const opacityScale = crowdFactor(projectiles.length, CROWD_MIN_OPACITY_SCALE);

    for (const p of projectiles) {
      let fx = this.bolts.get(p);
      if (!fx) {
        fx = buildBolt();
        this.bolts.set(p, fx);
        this.group.add(fx.group);
      }
      fx.elapsed += realDt;

      fx.history.push({ x: p.x, z: p.z });
      if (fx.history.length > HISTORY_LENGTH) fx.history.shift();

      fx.group.position.set(p.x, HEIGHT + surfaceY(p.x, p.z), p.z);
      fx.group.scale.setScalar(scale);

      // Stretch directionnel (2026-08-18) — direction déduite des deux
      // dernières positions de l'historique ; sans mouvement mesurable
      // (tout début de vol, un seul point encore dans l'historique), reste
      // orienté vers +Z sans étirement pour éviter une rotation instable.
      const prev = fx.history[fx.history.length - 2];
      if (prev) {
        const dx = p.x - prev.x;
        const dz = p.z - prev.z;
        const d = Math.hypot(dx, dz);
        if (d > MIN_STRETCH_DIST) {
          fx.coreGroup.rotation.y = Math.atan2(dx, dz);
          fx.coreGroup.scale.set(1 - STRETCH_SQUASH, 1, 1 + STRETCH_AMOUNT);
        }
      }

      const shellPulse = 1 + Math.sin(fx.elapsed * SHELL_PULSE_SPEED) * SHELL_PULSE_AMOUNT;
      fx.shell.scale.setScalar(shellPulse);

      const innerPulse = 1 + Math.sin(fx.elapsed * INNER_GLOW_PULSE_SPEED) * INNER_GLOW_PULSE_AMOUNT;
      fx.innerGlow.scale.setScalar(INNER_GLOW_SCALE * innerPulse);
      const outerPulse = 1 + Math.sin(fx.elapsed * OUTER_GLOW_PULSE_SPEED + OUTER_GLOW_PHASE) * OUTER_GLOW_PULSE_AMOUNT;
      fx.outerGlow.scale.setScalar(OUTER_GLOW_SCALE * outerPulse);
      (fx.innerGlow.material as THREE.SpriteMaterial).opacity = 0.6 * opacityScale;
      (fx.outerGlow.material as THREE.SpriteMaterial).opacity = 0.4 * opacityScale;

      const crownMat = fx.crown.material as THREE.SpriteMaterial;
      crownMat.rotation = fx.elapsed * CROWN_SPIN_SPEED;
      crownMat.opacity = CROWN_OPACITY * opacityScale;
      const crownPulse = 1 + Math.sin(fx.elapsed * CROWN_PULSE_SPEED) * CROWN_PULSE_AMOUNT;
      fx.crown.scale.setScalar(CROWN_SCALE * crownPulse);

      tickOrbitingSprites(fx.wisps, fx.elapsed, WISP_BASE_SCALE, WISP_FLICKER_SPEED, WISP_FLICKER_AMOUNT);
      for (let i = 0; i < fx.wisps.length; i++) {
        const mat = fx.wisps[i]!.sprite.material as THREE.SpriteMaterial;
        mat.rotation = fx.elapsed * fx.wispSpin[i]!;
        mat.opacity = WISP_SPECS[i % WISP_SPECS.length]!.opacity * opacityScale;
      }

      // Traînée : chaque particule reprend une position PASSÉE de
      // l'historique (position LOCALE, relative à fx.group déjà placé à la
      // position courante). Homing => l'historique courbe naturellement.
      for (let i = 0; i < fx.trail.length; i++) {
        const histIndex = fx.history.length - 2 - i;
        const point = fx.history[histIndex];
        fx.trail[i]!.visible = point !== undefined;
        if (point) fx.trail[i]!.position.set((point.x - p.x) / scale, 0, (point.z - p.z) / scale);
        (fx.trail[i]!.material as THREE.SpriteMaterial).opacity = TRAIL_OPACITIES[i]! * opacityScale;
      }
    }

    for (const [p, fx] of this.bolts) {
      if (active.has(p)) continue;
      this.group.remove(fx.group);
      this.bolts.delete(p);
    }

    for (let i = this.impacts.length - 1; i >= 0; i--) {
      const fx = this.impacts[i]!;
      fx.elapsed += realDt;

      const flashT = Math.min(1, fx.elapsed / IMPACT_FLASH_DURATION);
      fx.flash.scale.setScalar(IMPACT_SCALE * (0.4 + flashT * 0.8));
      (fx.flash.material as THREE.SpriteMaterial).opacity = 0.9 * (1 - flashT);

      // Implosion : contrairement a la Boule de feu (anneau qui GROSSIT),
      // un petit anneau qui RETRECIT vers le centre en s'estompant — lecture
      // "aspiré vers l'ombre" plutot qu'"explosé vers l'exterieur".
      const implosionT = Math.min(1, fx.elapsed / IMPACT_DURATION);
      fx.implosionRing.scale.setScalar(IMPACT_SCALE * (1.1 - implosionT * 0.9));
      (fx.implosionRing.material as THREE.MeshBasicMaterial).opacity = 0.7 * (1 - implosionT);

      fx.crownBurst.scale.setScalar(IMPACT_SCALE * (0.5 + implosionT * 1.3));
      fx.crownBurst.material.rotation = implosionT * 2.4;
      (fx.crownBurst.material as THREE.SpriteMaterial).opacity = 0.55 * (1 - implosionT);

      tickRadialParticles(fx.particles, this.group, realDt, IMPACT_DURATION, 2.4, 0.85);

      if (implosionT >= 1) {
        this.group.remove(fx.flash, fx.implosionRing, fx.crownBurst);
        this.impacts.splice(i, 1);
      }
    }
  }

  /** Petit "pouf" violet — flash magenta bref + implosion + éclat de
   *  couronne + quelques particules, toujours SOBRE et RAPIDE (voir main.ts,
   *  VfxManager.spawn('shadowImpact', ...)) — jamais une salve/onde comme la
   *  Boule de feu. */
  spawnImpact(x: number, z: number): void {
    const flash = createVfxSprite({ texture: 'star_02.png', color: SHADOW_PROJECTILE_IMPACT_COLOR, blending: 'additive', opacity: 0.9 });
    flash.position.set(x, HEIGHT + surfaceY(x, z), z);
    this.group.add(flash);

    const implosionRing = new THREE.Mesh(
      new THREE.RingGeometry(0.55, 1, 16),
      new THREE.MeshBasicMaterial({ color: SHADOW_PROJECTILE_GLOW_COLOR, transparent: true, opacity: 0.7, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    implosionRing.rotation.x = -Math.PI / 2;
    implosionRing.position.set(x, 0.04 + surfaceY(x, z), z);
    this.group.add(implosionRing);

    // Eclat de couronne (2026-08-18) — le motif ornementé (magic_02) flashe
    // brièvement à l'impact, distinct de l'implosion ronde en dessous.
    const crownBurst = createVfxSprite({ texture: 'magic_02.png', color: SHADOW_PROJECTILE_CROWN_COLOR, blending: 'additive', opacity: 0.55 });
    crownBurst.position.set(x, HEIGHT + surfaceY(x, z), z);
    this.group.add(crownBurst);

    const particles = spawnRadialParticles(this.group, {
      count: IMPACT_PARTICLE_COUNT,
      x,
      y: HEIGHT,
      z,
      buildParticle: (i) => {
        const spec = WISP_SPECS[i % WISP_SPECS.length]!;
        const sprite = createVfxSprite({ ...spec, opacity: 0.8 });
        sprite.scale.setScalar(0.09 + Math.random() * 0.06);
        return sprite;
      },
      speedMin: 0.7,
      speedMax: 1.7,
      liftMin: 0.2,
      liftMax: 0.75,
    });

    this.impacts.push({ flash, implosionRing, crownBurst, particles, elapsed: 0 });
  }

  clear(): void {
    for (const fx of this.bolts.values()) this.group.remove(fx.group);
    this.bolts.clear();
    for (const fx of this.impacts) {
      this.group.remove(fx.flash, fx.implosionRing, fx.crownBurst);
      for (const p of fx.particles) this.group.remove(p.mesh);
    }
    this.impacts.length = 0;
  }
}

let shellMaterial: THREE.MeshBasicMaterial | null = null;

/** Coque semi-transparente — SHARED directement comme la coque de la
 *  Fireball (jamais clonée par instance) : elle ne pulse que par SCALE, son
 *  opacité reste fixe, donc plusieurs projectiles peuvent sûrement partager
 *  le même matériau. */
function getShellMaterial(): THREE.MeshBasicMaterial {
  if (!shellMaterial) {
    shellMaterial = new THREE.MeshBasicMaterial({
      color: SHADOW_PROJECTILE_SHELL_COLOR,
      transparent: true,
      opacity: 0.5,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
  }
  return shellMaterial;
}

function buildBolt(): ShadowBoltMesh {
  const coreMat = getVfxCoreMaterial(SHADOW_PROJECTILE_CORE_COLOR);
  const group = new THREE.Group();

  const coreGroup = new THREE.Group();
  group.add(coreGroup);

  const core = new THREE.Mesh(new THREE.SphereGeometry(CORE_RADIUS, 8, 6), coreMat);
  coreGroup.add(core);

  const shell = new THREE.Mesh(new THREE.SphereGeometry(SHELL_RADIUS, 10, 8), getShellMaterial());
  coreGroup.add(shell);

  const innerGlow = createVfxSprite({ texture: 'light_01.png', color: SHADOW_PROJECTILE_GLOW_COLOR, blending: 'additive', opacity: 0.6 });
  innerGlow.scale.setScalar(INNER_GLOW_SCALE);
  group.add(innerGlow);

  const outerGlow = createVfxSprite({ texture: 'light_01.png', color: SHADOW_PROJECTILE_GLOW_COLOR, blending: 'additive', opacity: 0.4 });
  outerGlow.scale.setScalar(OUTER_GLOW_SCALE);
  group.add(outerGlow);

  const crown = createVfxSprite({ texture: 'magic_02.png', color: SHADOW_PROJECTILE_CROWN_COLOR, blending: 'additive', opacity: CROWN_OPACITY });
  crown.scale.setScalar(CROWN_SCALE);
  group.add(crown);

  const wisps = buildOrbitingSprites(group, {
    specs: WISP_SPECS,
    count: WISP_COUNT,
    baseScale: WISP_BASE_SCALE,
    orbitRadius: WISP_ORBIT_RADIUS,
    verticalJitter: 0.5,
  });
  const wispSpin = wisps.map(() => (Math.random() < 0.5 ? -1 : 1) * (WISP_SPIN_SPEED_MIN + Math.random() * (WISP_SPIN_SPEED_MAX - WISP_SPIN_SPEED_MIN)));

  const trail: THREE.Sprite[] = [];
  for (let i = 0; i < TRAIL_COUNT; i++) {
    const sprite = createVfxSprite({ texture: 'twirl_02.png', color: SHADOW_PROJECTILE_GLOW_COLOR, blending: 'additive', opacity: TRAIL_OPACITIES[i]! });
    sprite.scale.setScalar(TRAIL_SCALES[i]!);
    group.add(sprite);
    trail.push(sprite);
  }

  return { group, coreGroup, shell, innerGlow, outerGlow, crown, wisps, wispSpin, trail, history: [], elapsed: 0 };
}
