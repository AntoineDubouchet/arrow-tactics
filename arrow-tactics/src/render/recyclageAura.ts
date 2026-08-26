import * as THREE from 'three';
import { COLORS } from '../config/constants';
import { loadVfxTexture } from './vfxTextures';

/**
 * Aura de particules pour les unites eligibles au talent "Recyclage"
 * (2026-08-14, demande d'Antoine : "on ne voit vraiment pas quand un
 * soldat peut être recyclé... rajoute un halo jaune grâce au vfx
 * précédemment utilisé... une aura jaune grâce à des particules, n'hésite
 * pas") — remplace le simple anneau plat (`createRecyclageRing`, retire de
 * main.ts) par un effet PERSISTANT construit avec les memes textures VFX
 * (Kenney "Particle Pack", voir healVfx.ts) que le parchemin de soin/le
 * Blizzard texture : lueur au sol qui pulse, anneau ouvrage qui tourne
 * lentement, et une couronne de particules qui orbitent autour de l'unite
 * a des hauteurs variees. Contrairement aux autres VFX du jeu (declenches
 * une fois, courte duree), celui-ci est CONTINU tant que l'unite reste
 * eligible pendant le placement — voir sync(), appelee chaque frame avec
 * l'ensemble courant des slots eligibles plutot qu'un evenement ponctuel.
 */

const groundGlowTexture = loadVfxTexture('circle_05.png');
const ringTexture = loadVfxTexture('magic_02.png');
const sparkleTexture = loadVfxTexture('star_04.png');

const PARTICLE_COUNT = 8;
const BASE_RADIUS = 0.55;
const RADIUS_VARIANCE = 0.16;
const ORBIT_SPEED = 1.1; // radians/s
const BOB_SPEED = 2.2;
const BOB_HEIGHT = 0.08;
const RING_SPIN_SPEED = 0.5;
const GLOW_PULSE_SPEED = 2.4;

interface RecyclageParticle {
  sprite: THREE.Sprite;
  angle: number;
  radius: number;
  heightOffset: number;
  bobPhase: number;
}

interface RecyclageAura {
  group: THREE.Group;
  groundGlow: THREE.Mesh;
  ring: THREE.Mesh;
  particles: RecyclageParticle[];
}

export class RecyclageAuraView {
  readonly group = new THREE.Group();
  private readonly auras = new Map<number, RecyclageAura>();
  private time = 0;

  /**
   * Met a jour l'ensemble des auras actives — cree une aura pour chaque
   * `key` nouvellement eligible, retire celles qui ne le sont plus (vente,
   * soin remontant au-dessus de 50% PV, talent pas encore debloque...),
   * repositionne et anime les autres. `key` = index dans `placementSlots`
   * (voir main.ts) : suffisant tant que les slots ne sont pas re-ordonnes
   * en cours de placement, cohérent avec le reste du code de placement qui
   * aligne deja tout par index. Passer un tableau VIDE (hors phase de
   * placement) vide l'ensemble des auras au frame suivant, sans appel de
   * nettoyage separe necessaire.
   */
  sync(slots: { key: number; x: number; z: number }[], dt: number): void {
    this.time += dt;
    const activeKeys = new Set(slots.map((s) => s.key));

    for (const [key, aura] of this.auras) {
      if (activeKeys.has(key)) continue;
      this.group.remove(aura.group);
      this.auras.delete(key);
    }

    for (const slot of slots) {
      let aura = this.auras.get(slot.key);
      if (!aura) {
        aura = this.buildAura();
        this.auras.set(slot.key, aura);
        this.group.add(aura.group);
      }
      aura.group.position.set(slot.x, 0, slot.z);
      this.animateAura(aura, dt);
    }
  }

  private buildAura(): RecyclageAura {
    const group = new THREE.Group();

    // Lueur au sol : plus large et douce, en fondu ADDITIF (glow), pulse en
    // continu pour rester visible meme si le joueur ne regarde pas fixement
    // cette unite.
    const groundGlow = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        map: groundGlowTexture,
        color: COLORS.recyclageHighlight,
        transparent: true,
        opacity: 0.5,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    groundGlow.rotation.x = -Math.PI / 2;
    groundGlow.position.y = 0.03;
    groundGlow.scale.setScalar(1.6);
    group.add(groundGlow);

    // Anneau ouvrage qui tourne lentement — plus net/lisible qu'un simple
    // disque, marque clairement le contour "case concernee".
    const ring = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        map: ringTexture,
        color: COLORS.recyclageHighlight,
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.035;
    ring.scale.setScalar(1.1);
    group.add(ring);

    // Couronne de particules qui orbitent a hauteur variable autour de
    // l'unite — l'element le plus "vivant" de l'aura, celui qui attire
    // vraiment l'œil.
    const particles: RecyclageParticle[] = [];
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const material = new THREE.SpriteMaterial({
        map: sparkleTexture,
        color: COLORS.recyclageHighlight,
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const sprite = new THREE.Sprite(material);
      sprite.scale.setScalar(0.24);
      group.add(sprite);
      particles.push({
        sprite,
        angle: (i / PARTICLE_COUNT) * Math.PI * 2 + Math.random() * 0.3,
        radius: BASE_RADIUS + (Math.random() - 0.5) * RADIUS_VARIANCE,
        heightOffset: 0.35 + Math.random() * 0.4,
        bobPhase: Math.random() * Math.PI * 2,
      });
    }

    return { group, groundGlow, ring, particles };
  }

  private animateAura(aura: RecyclageAura, dt: number): void {
    aura.ring.rotation.z += dt * RING_SPIN_SPEED;
    const pulse = 0.5 + Math.sin(this.time * GLOW_PULSE_SPEED) * 0.18;
    (aura.groundGlow.material as THREE.MeshBasicMaterial).opacity = pulse;

    for (const p of aura.particles) {
      p.angle += dt * ORBIT_SPEED;
      const bob = Math.sin(this.time * BOB_SPEED + p.bobPhase) * BOB_HEIGHT;
      p.sprite.position.set(Math.cos(p.angle) * p.radius, p.heightOffset + bob, Math.sin(p.angle) * p.radius);
      const twinkle = 0.65 + Math.sin(this.time * 3.2 + p.bobPhase) * 0.35;
      (p.sprite.material as THREE.SpriteMaterial).opacity = Math.max(0.25, twinkle);
    }
  }

  /** Nettoyage complet — jamais d'aura fantome apres un changement d'ecran. */
  clear(): void {
    for (const aura of this.auras.values()) this.group.remove(aura.group);
    this.auras.clear();
  }
}
