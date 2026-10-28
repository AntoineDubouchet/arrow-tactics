import * as THREE from 'three';
import { COLORS, TILE } from '../config/constants';
import { lerp } from '../core/math';
import type { BlastProjectile } from '../sim/systems/abilities';
import { LightPool } from './vfx/lightPool';
import { buildOrbitingSprites, tickOrbitingSprites, type OrbitingSprite } from './vfx/orbitingSprites';
import { spawnRadialParticles, tickRadialParticles, type RadialParticle } from './vfx/radialBurst';
import { createVfxGroundDecal, createVfxSprite, getVfxCoreMaterial, type VfxMaterialSpec } from './vfx/vfxMaterials';
import { surfaceY } from './terrainSurface';

/**
 * Rendu de la Boule de feu du Mage (2026-08-16, grosse passe VFX demandée
 * par Antoine — "je veux désormais un projectile qui donne vraiment
 * l'impression : DANGEREUX, CHAUD, MAGIQUE, PUISSANT", uniquement visuel :
 * AUCUN changement de dégâts/rayon/targeting/cast time/trajectoire/cadence,
 * ces fichiers ne sont pas touchés).
 *
 * Six couches, comme demandé : (1) noyau — deux sphères imbriquées, coeur
 * quasi blanc + coque orange, jamais un vrai gradient (pas de shader
 * personnalisé) mais l'effet de superposition suffit ; (2) halo — deux
 * sprites de glow orientés caméra (light_01), un intérieur chaud, un
 * extérieur rouge-orange, pulsent à des phases différentes ; (3) flammes —
 * anneau de sprites texturés (flame_05/flame_02/flame_06, vraies textures
 * Kenney) qui orbitent, scintillent et tournent sur eux-mêmes (chaque sprite
 * a son PROPRE matériau cloné, voir vfxMaterials — la rotation individuelle
 * est donc sûre) ; (4) traînée — sphères dégradées (orange -> braise sombre)
 * + un soupçon de fumée qui traîne, toujours COURTE (voir TRAIL_COUNT) ;
 * (5) braises — salve de petites particules texturées à l'impact
 * (spawnRadialParticles) ; (6) impact — flash blanc/jaune bref, explosion
 * orange, flammes radiales, braises, anneau + décalque de brûlure au sol,
 * fumée légère.
 *
 * Le télégraphe au sol (voir render/telegraph.ts) n'est PAS touché par ce
 * fichier — il lit `Entity.cast` indépendamment. Priorité gameplay
 * TELEGRAPH -> TRAJECTOIRE -> IMPACT respectée : aucun élément ajouté ici
 * n'a une échelle qui dépasse notablement `radiusTiles` (la même valeur qui
 * dimensionne déjà le télégraphe), donc la zone de danger reste lisible.
 *
 * Performance (Part I de la demande) : geometrie PARTAGEE (sphères/plan
 * construits une fois par module), materiaux GABARIT mis en cache et
 * seulement CLONES par instance (jamais par frame, voir vfxMaterials.ts),
 * aucun `TextureLoader` par projectile (voir vfxTextures.ts, cache par nom),
 * LightPool fixe (jamais de PointLight ajoutée/retirée en cours de partie).
 */

const HEIGHT = 0.65;
const ARC_HEIGHT = 0.9;
const IMPACT_DURATION = 0.35;

const CORE_RADIUS = 0.15;
const SHELL_RADIUS = 0.3;
const PULSE_SPEED = 14;
const PULSE_AMOUNT = 0.14;

const INNER_GLOW_SCALE = 0.5;
const INNER_GLOW_PULSE_SPEED = 6;
const INNER_GLOW_PULSE_AMOUNT = 0.12;
const OUTER_GLOW_SCALE = 0.72;
const OUTER_GLOW_PULSE_SPEED = 4.4;
const OUTER_GLOW_PULSE_AMOUNT = 0.14;
const OUTER_GLOW_PHASE = 1.7;

/** Flammes texturées "vivantes" orbitant le noyau — chaque sprite a sa
 *  propre phase de scintillement ET sa propre vitesse de rotation en plan
 *  (matériau cloné individuellement, voir vfxMaterials/orbitingSprites). */
const FLAME_SPRITE_COUNT = 5;
const FLAME_SPRITE_BASE_SCALE = 0.46;
const FLAME_FLICKER_SPEED = 9;
const FLAME_FLICKER_AMOUNT = 0.26;
const FLAME_ORBIT_RADIUS = 0.11;
const FLAME_SPIN_SPEED_MIN = 0.6;
const FLAME_SPIN_SPEED_MAX = 1.6;

const TRAIL_COUNT = 4;
const TRAIL_TIME_STEP = 0.045;
const TRAIL_RADII = [0.22, 0.17, 0.12, 0.08];
const TRAIL_OPACITIES = [0.42, 0.3, 0.2, 0.11];
/** Fumée légère qui traîne derrière — très discrète, fondu NORMAL (pas
 *  additif, voir vfxMaterials) pour rester "légère" plutôt que lumineuse. */
const SMOKE_TRAIL_COUNT = 2;
const SMOKE_TRAIL_TIME_STEP = 0.07;
const SMOKE_TRAIL_SCALE = 0.3;
const SMOKE_TRAIL_OPACITY = 0.16;

const BURST_DURATION = 0.4;
const FLASH_DURATION = 0.16;
const RADIAL_FLAME_COUNT = 5;
const RADIAL_FLAME_DURATION = 0.4;
const EMBER_COUNT = 8;
const EMBER_DURATION = 0.55;
const SMOKE_IMPACT_DURATION = 0.9;
const SMOKE_IMPACT_COUNT = 2;
const SCORCH_DURATION = 1.1;

const TRAVEL_LIGHT_INTENSITY = 3;
const TRAVEL_LIGHT_DISTANCE = 4;
const IMPACT_LIGHT_INTENSITY = 6.5;
const IMPACT_LIGHT_DISTANCE = 6;
const LIGHT_DECAY = 2;
const LIGHT_POOL_SIZE = 12;

const FLAME_SPECS: VfxMaterialSpec[] = [
  { texture: 'flame_05.png', color: COLORS.fireGlow, blending: 'additive', opacity: 0.85 },
  { texture: 'flame_02.png', color: COLORS.fireOuterGlow, blending: 'additive', opacity: 0.7 },
  { texture: 'flame_06.png', color: COLORS.fireGlow, blending: 'additive', opacity: 0.8 },
];

interface FireballMesh {
  group: THREE.Group;
  shell: THREE.Mesh;
  trail: THREE.Mesh[];
  smokeTrail: THREE.Sprite[];
  flames: OrbitingSprite[];
  flameSpin: number[];
  innerGlow: THREE.Sprite;
  outerGlow: THREE.Sprite;
  light: THREE.PointLight | null;
}

interface ImpactFx {
  flash: THREE.Sprite;
  burst: THREE.Mesh;
  ring: THREE.Mesh;
  scorch: THREE.Mesh;
  radialFlames: RadialParticle[];
  embers: RadialParticle[];
  smoke: THREE.Sprite[];
  light: THREE.PointLight | null;
  elapsed: number;
  radius: number;
  /** Hauteur du sol (relief) au point d'impact. */
  groundY: number;
}

export class FireballView {
  readonly group = new THREE.Group();
  private readonly lightPool: LightPool;
  private readonly bolts = new Map<BlastProjectile, FireballMesh>();
  private readonly impacts: ImpactFx[] = [];

  constructor() {
    this.lightPool = new LightPool(this.group, LIGHT_POOL_SIZE, COLORS.fireGlow, TRAVEL_LIGHT_DISTANCE, LIGHT_DECAY);
  }

  sync(blasts: BlastProjectile[], realDt: number): void {
    const active = new Set(blasts);

    for (const b of blasts) {
      let fx = this.bolts.get(b);
      if (!fx) {
        fx = this.buildFireball();
        this.bolts.set(b, fx);
        this.group.add(fx.group);
      }
      const t = Math.min(1, b.elapsed / b.duration);
      const headPos = positionAt(b, t);
      fx.group.position.copy(headPos);

      const pulse = 1 + Math.sin(b.elapsed * PULSE_SPEED) * PULSE_AMOUNT;
      fx.shell.scale.setScalar(pulse);
      if (fx.light) fx.light.intensity = TRAVEL_LIGHT_INTENSITY;

      const innerPulse = 1 + Math.sin(b.elapsed * INNER_GLOW_PULSE_SPEED) * INNER_GLOW_PULSE_AMOUNT;
      fx.innerGlow.scale.setScalar(INNER_GLOW_SCALE * innerPulse);
      const outerPulse = 1 + Math.sin(b.elapsed * OUTER_GLOW_PULSE_SPEED + OUTER_GLOW_PHASE) * OUTER_GLOW_PULSE_AMOUNT;
      fx.outerGlow.scale.setScalar(OUTER_GLOW_SCALE * outerPulse);

      tickOrbitingSprites(fx.flames, b.elapsed, FLAME_SPRITE_BASE_SCALE, FLAME_FLICKER_SPEED, FLAME_FLICKER_AMOUNT);
      for (let i = 0; i < fx.flames.length; i++) {
        const mat = fx.flames[i]!.sprite.material as THREE.SpriteMaterial;
        mat.rotation = b.elapsed * fx.flameSpin[i]!;
      }

      // Traînée (spheres + fumée) : positions LOCALES (relatives a fx.group,
      // deja place a headPos) — reevalue la MEME fonction parametrique a un
      // `t` legerement plus tot, aucun historique de position a maintenir.
      for (let i = 0; i < fx.trail.length; i++) {
        const trailT = t - ((i + 1) * TRAIL_TIME_STEP) / b.duration;
        fx.trail[i]!.visible = trailT > 0;
        if (trailT > 0) fx.trail[i]!.position.copy(positionAt(b, trailT).sub(headPos));
      }
      for (let i = 0; i < fx.smokeTrail.length; i++) {
        const smokeT = t - ((i + 1) * SMOKE_TRAIL_TIME_STEP) / b.duration;
        fx.smokeTrail[i]!.visible = smokeT > 0;
        if (smokeT > 0) fx.smokeTrail[i]!.position.copy(positionAt(b, smokeT).sub(headPos));
      }
    }

    for (const [b, fx] of this.bolts) {
      if (active.has(b)) continue;
      this.group.remove(fx.group);
      this.lightPool.release(fx.light);
      this.bolts.delete(b);
    }

    for (let i = this.impacts.length - 1; i >= 0; i--) {
      const fx = this.impacts[i]!;
      fx.elapsed += realDt;

      const flashT = Math.min(1, fx.elapsed / FLASH_DURATION);
      fx.flash.scale.setScalar(fx.radius * (0.5 + flashT * 0.9));
      (fx.flash.material as THREE.SpriteMaterial).opacity = 0.95 * (1 - flashT);

      const burstT = Math.min(1, fx.elapsed / BURST_DURATION);
      fx.burst.scale.setScalar(fx.radius * (0.3 + burstT * 1.1));
      (fx.burst.material as THREE.MeshBasicMaterial).opacity = 0.5 * (1 - burstT);

      const ringT = Math.min(1, fx.elapsed / IMPACT_DURATION);
      fx.ring.scale.setScalar(fx.radius * (0.4 + ringT * 0.95));
      (fx.ring.material as THREE.MeshBasicMaterial).opacity = 0.6 * (1 - ringT);

      const scorchT = Math.min(1, fx.elapsed / SCORCH_DURATION);
      (fx.scorch.material as THREE.MeshBasicMaterial).opacity = 0.5 * (1 - scorchT);

      if (fx.light) fx.light.intensity = Math.max(0, IMPACT_LIGHT_INTENSITY * (1 - fx.elapsed / BURST_DURATION));

      tickRadialParticles(fx.radialFlames, this.group, realDt, RADIAL_FLAME_DURATION, 0.6, 0.8);
      tickRadialParticles(fx.embers, this.group, realDt, EMBER_DURATION, 3.6, 0.9);

      const smokeT = Math.min(1, fx.elapsed / SMOKE_IMPACT_DURATION);
      for (const smoke of fx.smoke) {
        smoke.scale.setScalar(fx.radius * (0.5 + smokeT * 1.1));
        smoke.position.y = 0.2 + smokeT * 0.55 + fx.groundY;
        (smoke.material as THREE.SpriteMaterial).opacity = 0.28 * (1 - smokeT);
      }

      if (scorchT >= 1 && smokeT >= 1) {
        this.group.remove(fx.flash, fx.burst, fx.ring, fx.scorch, ...fx.smoke);
        this.lightPool.release(fx.light);
        this.impacts.splice(i, 1);
      }
    }
  }

  /** Déclenche le flash/onde/flammes radiales/braises/brûlure d'impact — voir
   *  main.ts, VfxManager.spawn('fireballImpact', ...). */
  spawnImpact(x: number, z: number, radiusTiles: number): void {
    const radius = radiusTiles * TILE;

    const flash = createVfxSprite({ texture: 'muzzle_02.png', color: COLORS.fireCoreBright, blending: 'additive', opacity: 0.95 });
    flash.position.set(x, 0.35 + surfaceY(x, z), z);
    this.group.add(flash);

    const burst = new THREE.Mesh(
      new THREE.SphereGeometry(1, 12, 10),
      new THREE.MeshBasicMaterial({ color: 0xffcf8c, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    burst.position.set(x, HEIGHT * 0.5 + surfaceY(x, z), z);
    this.group.add(burst);

    const ring = new THREE.Mesh(
      new THREE.CircleGeometry(1, 24),
      new THREE.MeshBasicMaterial({ color: COLORS.fireGlow, transparent: true, opacity: 0.6, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, 0.05 + surfaceY(x, z), z);
    this.group.add(ring);

    // Décalque de brûlure au sol (texture reelle, scorch_01) — s'attarde
    // nettement plus longtemps que l'anneau lumineux, une vraie marque
    // laissee par l'impact plutot qu'un simple flash qui disparait.
    const scorch = createVfxGroundDecal({ texture: 'scorch_01.png', color: 0x2a1408, blending: 'normal', opacity: 0.5 });
    scorch.scale.setScalar(radius * 2.4);
    scorch.position.set(x, 0.03 + surfaceY(x, z), z);
    this.group.add(scorch);

    const light = this.lightPool.acquire();
    if (light) {
      light.position.set(x, 0.6 + surfaceY(x, z), z);
      light.distance = IMPACT_LIGHT_DISTANCE;
      light.intensity = IMPACT_LIGHT_INTENSITY;
    }

    // Flammes radiales — giclent depuis le point d'impact, distinctes de
    // l'onde verticale (burst) : de vraies langues de flamme texturees qui
    // s'ecartent, pas juste une sphere qui grossit.
    const radialFlames = spawnRadialParticles(this.group, {
      count: RADIAL_FLAME_COUNT,
      x,
      y: 0.15,
      z,
      buildParticle: (i) => {
        const spec = FLAME_SPECS[i % FLAME_SPECS.length]!;
        const sprite = createVfxSprite(spec);
        sprite.scale.setScalar(radius * 0.7);
        return sprite;
      },
      speedMin: radius * 1.2,
      speedMax: radius * 2.4,
      liftMin: 0.6,
      liftMax: 1.4,
    });

    // Braises : petites particules texturees (etoiles) plutot que des cubes
    // plats — giclent plus loin/plus vite, retombent sous gravite.
    const embers = spawnRadialParticles(this.group, {
      count: EMBER_COUNT,
      x,
      y: 0.15,
      z,
      buildParticle: () => {
        const sprite = createVfxSprite({ texture: 'star_04.png', color: COLORS.fireEmberDark, blending: 'additive', opacity: 0.9 });
        sprite.scale.setScalar(0.14 + Math.random() * 0.08);
        return sprite;
      },
      speedMin: 1.6,
      speedMax: 3.2,
      liftMin: 1.6,
      liftMax: 2.8,
    });

    const smoke: THREE.Sprite[] = [];
    for (let i = 0; i < SMOKE_IMPACT_COUNT; i++) {
      const angle = (i / SMOKE_IMPACT_COUNT) * Math.PI * 2 + Math.random() * Math.PI;
      const sprite = createVfxSprite({ texture: 'smoke_02.png', color: COLORS.fireSmokeTint, blending: 'normal', opacity: 0.28 });
      sprite.position.set(x + Math.cos(angle) * radius * 0.2, 0.15 + surfaceY(x, z), z + Math.sin(angle) * radius * 0.2);
      this.group.add(sprite);
      smoke.push(sprite);
    }

    this.impacts.push({ flash, burst, ring, scorch, radialFlames, embers, smoke, light, elapsed: 0, radius, groundY: surfaceY(x, z) });
  }

  clear(): void {
    for (const fx of this.bolts.values()) {
      this.group.remove(fx.group);
      this.lightPool.release(fx.light);
    }
    this.bolts.clear();
    for (const fx of this.impacts) {
      this.group.remove(fx.flash, fx.burst, fx.ring, fx.scorch, ...fx.smoke);
      for (const p of [...fx.radialFlames, ...fx.embers]) this.group.remove(p.mesh);
      this.lightPool.release(fx.light);
    }
    this.impacts.length = 0;
  }

  private buildFireball(): FireballMesh {
    const { core: coreMat, shell: shellMat, trail: trailMats } = getFireballMaterials();
    const group = new THREE.Group();

    const core = new THREE.Mesh(new THREE.SphereGeometry(CORE_RADIUS, 10, 8), coreMat);
    group.add(core);

    const shell = new THREE.Mesh(new THREE.SphereGeometry(SHELL_RADIUS, 12, 10), shellMat);
    group.add(shell);

    const innerGlow = createVfxSprite({ texture: 'light_01.png', color: COLORS.fireGlow, blending: 'additive', opacity: 0.55 });
    innerGlow.scale.setScalar(INNER_GLOW_SCALE);
    group.add(innerGlow);

    const outerGlow = createVfxSprite({ texture: 'light_01.png', color: COLORS.fireOuterGlow, blending: 'additive', opacity: 0.35 });
    outerGlow.scale.setScalar(OUTER_GLOW_SCALE);
    group.add(outerGlow);

    const flames = buildOrbitingSprites(group, {
      specs: FLAME_SPECS,
      count: FLAME_SPRITE_COUNT,
      baseScale: FLAME_SPRITE_BASE_SCALE,
      orbitRadius: FLAME_ORBIT_RADIUS,
      verticalJitter: 0.45,
    });
    const flameSpin = flames.map(() => (Math.random() < 0.5 ? -1 : 1) * (FLAME_SPIN_SPEED_MIN + Math.random() * (FLAME_SPIN_SPEED_MAX - FLAME_SPIN_SPEED_MIN)));

    const trail: THREE.Mesh[] = [];
    for (let i = 0; i < TRAIL_COUNT; i++) {
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(TRAIL_RADII[i]!, 8, 6), trailMats[i]!);
      group.add(mesh);
      trail.push(mesh);
    }

    const smokeTrail: THREE.Sprite[] = [];
    for (let i = 0; i < SMOKE_TRAIL_COUNT; i++) {
      const sprite = createVfxSprite({ texture: 'smoke_02.png', color: COLORS.fireSmokeTint, blending: 'normal', opacity: SMOKE_TRAIL_OPACITY });
      sprite.scale.setScalar(SMOKE_TRAIL_SCALE);
      group.add(sprite);
      smokeTrail.push(sprite);
    }

    const light = this.lightPool.acquire();
    if (light) light.distance = TRAVEL_LIGHT_DISTANCE;

    return { group, shell, trail, smokeTrail, flames, flameSpin, innerGlow, outerGlow, light };
  }
}

function positionAt(b: BlastProjectile, t: number): THREE.Vector3 {
  const tt = Math.max(0, Math.min(1, t));
  return new THREE.Vector3(
    lerp(b.fromX, b.targetX, tt),
    // Relief : au-dessus du sol de depart puis de la cible.
    HEIGHT + lerp(surfaceY(b.fromX, b.fromZ), surfaceY(b.targetX, b.targetZ), tt) + Math.sin(tt * Math.PI) * ARC_HEIGHT,
    lerp(b.fromZ, b.targetZ, tt),
  );
}

let coreMaterial: THREE.MeshBasicMaterial | null = null;
let shellMaterial: THREE.MeshBasicMaterial | null = null;
const trailMaterials: THREE.MeshBasicMaterial[] = [];

/** Noyau/coque/traînée restent des `MeshBasicMaterial` non texturés
 *  (couleurs neutres jamais mutées par instance) — partagés DIRECTEMENT,
 *  comme avant ce chantier ; seuls les nouveaux éléments texturés passent
 *  par `vfxMaterials.ts` (clone-per-instance, nécessaire pour un
 *  scintillement/une rotation indépendante par sprite). */
function getFireballMaterials(): {
  core: THREE.MeshBasicMaterial;
  shell: THREE.MeshBasicMaterial;
  trail: THREE.MeshBasicMaterial[];
} {
  if (!coreMaterial) {
    coreMaterial = getVfxCoreMaterial(COLORS.fireCoreBright);
  }
  if (!shellMaterial) {
    shellMaterial = new THREE.MeshBasicMaterial({
      color: COLORS.fireGlow,
      transparent: true,
      opacity: 0.55,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
  }
  if (trailMaterials.length === 0) {
    const near = new THREE.Color(COLORS.fireGlow);
    const far = new THREE.Color(COLORS.fireEmberDark);
    for (let i = 0; i < TRAIL_OPACITIES.length; i++) {
      const color = near.clone().lerp(far, i / Math.max(1, TRAIL_OPACITIES.length - 1));
      trailMaterials.push(
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: TRAIL_OPACITIES[i]!, blending: THREE.AdditiveBlending, depthWrite: false }),
      );
    }
  }
  return { core: coreMaterial, shell: shellMaterial, trail: trailMaterials };
}
