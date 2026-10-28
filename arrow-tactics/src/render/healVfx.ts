import * as THREE from 'three';
import { COLORS } from '../config/constants';
import { loadVfxTexture } from './vfxTextures';
import { surfaceY } from './terrainSurface';

/**
 * VFX du parchemin de soin mineur (2026-08-14, demande d'Antoine : "je t'ai
 * mis un pack complet de VFX... sers-en toi pour ajouter une animation
 * sympa au parchemin de soin, je te laisse être créatif") — premier VFX du
 * jeu construit a partir de vraies textures (Kenney "Particle Pack", CC0 —
 * meme licence deja utilisee pour les rochers/arbres, voir CLAUDE.md,
 * Stack) plutot que des formes procedurales pures (Box/Ring/Circle) comme
 * le reste du rendu de combat (FireballView, IceNovaView). Le pack est en
 * niveaux de gris sur fond transparent, concu pour etre teinte via la
 * couleur du materiau — teinte ici en vert doux/blanc chaud/rose pale
 * (COLORS.healGlow/healCore/healAccent), une identite "soin" jamais
 * confondue avec les couleurs d'equipe ni les autres sorts.
 *
 * Quatre elements, tous des THREE.Sprite (toujours face camera, ideal pour
 * un glow vu depuis la camera inclinee de ce jeu) SAUF le cercle magique au
 * sol, un Mesh a plat comme les autres decalques de zone (Nova de glace,
 * telegraphe du Mage) :
 *  - un cercle magique (magic_02.png, un anneau ouvrage) qui apparait au
 *    sol sous l'unite, grossit puis tourne doucement en s'estompant ;
 *  - un flash d'etincelle (star_01.png) bref et lumineux au centre ;
 *  - un petit cœur (symbol_01.png) qui monte doucement au-dessus de l'unite
 *    en s'estompant — le geste le plus "lisible" du lot, plus long que le
 *    reste pour rester visible apres le flash initial ;
 *  - quelques etincelles (star_04.png) qui montent en derivant doucement
 *    autour de l'unite.
 * Purement cosmetique, declenche au moment ou le soin est REELLEMENT
 * applique (voir main.ts) — jamais lu depuis l'etat de simulation.
 */

// Chargees une seule fois (cache PARTAGE, voir vfxTextures.ts — reutilise
// par iceNova.ts pour le Blizzard texture, voir 2026-08-14), jamais
// rechargees par appel.
const magicCircleTexture = loadVfxTexture('magic_02.png');
const sparkleFlashTexture = loadVfxTexture('star_01.png');
const heartTexture = loadVfxTexture('symbol_01.png');
const sparkleTexture = loadVfxTexture('star_04.png');

const CIRCLE_DURATION = 0.9;
const FLASH_DURATION = 0.3;
const HEART_DURATION = 1.4;
const HEART_RISE_DISTANCE = 0.75;
const HEART_GROW_DURATION = 0.25;
const SPARKLE_DURATION = 0.9;
const SPARKLE_COUNT = 5;
const SPARKLE_GROW_DURATION = 0.2;

interface HealSparkle {
  sprite: THREE.Sprite;
  angle: number;
  driftSpeed: number;
  riseSpeed: number;
  baseRadius: number;
}

interface HealFx {
  circle: THREE.Mesh;
  flash: THREE.Sprite;
  heart: THREE.Sprite;
  sparkles: HealSparkle[];
  x: number;
  z: number;
  elapsed: number;
}

export class HealVfxView {
  readonly group = new THREE.Group();
  private readonly effects: HealFx[] = [];

  /** Declenche la sequence complete a la position de la cible soignee. */
  spawnHeal(x: number, z: number): void {
    // Teinte du cercle : healGOLD (or sature), PAS healCore (blanc chaud) —
    // 2026-08-14, DEUXIEME correctif ("faut vraiment zoomer pour voir
    // l'animation") : un blanc en fondu additif se "delave" sur une scene
    // deja bien eclairee, meme si la couleur en elle-meme n'est pas fausse
    // (contrairement au vert du tout premier essai). Une teinte SATUREE
    // (or, comme fireGlow/iceGlow ailleurs dans le jeu) garde son contraste
    // en additif quel que soit l'eclairage du sol.
    const circle = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        map: magicCircleTexture,
        color: COLORS.healGold,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    circle.rotation.x = -Math.PI / 2;
    circle.position.set(x, 0.04 + surfaceY(x, z), z);
    circle.scale.setScalar(0.3);
    this.group.add(circle);

    const flash = buildGlowSprite(sparkleFlashTexture, COLORS.healCore);
    flash.position.set(x, 0.6 + surfaceY(x, z), z);
    this.group.add(flash);

    // Cœur : element "signature" de l'effet, en fondu NORMAL (pas additif) —
    // 2026-08-14, DEUXIEME correctif : un fondu additif "delave" une forme
    // censee se lire comme une ICONE pleine et nette (contrairement a un
    // glow, ou l'additif est justement l'effet recherche). Blanc (demande
    // explicite d'Antoine, TROISIEME retouche le meme jour — healAccent
    // rose/magenta essaye entre-temps) + taille nettement plus grande que
    // la silhouette d'une unite pour ne plus jamais passer inapercu.
    const heart = buildIconSprite(heartTexture, COLORS.healCore);
    heart.center.set(0.5, 0.15); // pivot bas : grandit surtout VERS LE HAUT, pas dans le sol
    heart.position.set(x, 0.55 + surfaceY(x, z), z);
    heart.scale.setScalar(0.001);
    this.group.add(heart);

    const sparkles: HealSparkle[] = [];
    for (let i = 0; i < SPARKLE_COUNT; i++) {
      // healCore/healAccent en alternance (plus healGlow, meme raison que le
      // cercle ci-dessus) — les deux ressortent sur l'herbe.
      const sprite = buildGlowSprite(sparkleTexture, i % 2 === 0 ? COLORS.healCore : COLORS.healAccent);
      const angle = (i / SPARKLE_COUNT) * Math.PI * 2 + Math.random() * 0.6;
      const baseRadius = 0.18 + Math.random() * 0.22;
      sprite.position.set(x + Math.cos(angle) * baseRadius, 0.15 + surfaceY(x, z), z + Math.sin(angle) * baseRadius);
      sprite.scale.setScalar(0.001);
      this.group.add(sprite);
      sparkles.push({ sprite, angle, driftSpeed: 0.5 + Math.random() * 0.5, riseSpeed: 0.35 + Math.random() * 0.3, baseRadius });
    }

    this.effects.push({ circle, flash, heart, sparkles, x, z, elapsed: 0 });
  }

  /** A appeler chaque frame (temps reel, comme TelegraphView/FireballView/
   *  IceNovaView). */
  sync(dt: number): void {
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const fx = this.effects[i]!;
      fx.elapsed += dt;

      // Tailles ENCORE agrandies (2026-08-14, DEUXIEME correctif — "faut
      // vraiment zoomer pour voir l'animation" apres le premier passage).
      // Circle : jusqu'a 2.6 unites de diametre (etait 1.8).
      const circleT = Math.min(1, fx.elapsed / CIRCLE_DURATION);
      const circleGrowT = Math.min(1, circleT * 2.2);
      const circleEase = 1 - (1 - circleGrowT) * (1 - circleGrowT);
      (fx.circle.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.95 * (1 - circleT));
      fx.circle.scale.setScalar(0.3 + circleEase * 2.3);
      fx.circle.rotation.z += dt * 0.6;

      const flashT = Math.min(1, fx.elapsed / FLASH_DURATION);
      (fx.flash.material as THREE.SpriteMaterial).opacity = Math.max(0, 1 - flashT);
      fx.flash.scale.setScalar(0.35 + flashT * 1.35);

      // Cœur : jusqu'a 1.9 unite (etait 0.85) — desormais plus grand que la
      // silhouette d'une unite, impossible a manquer. Fondu NORMAL (pas
      // additif, voir spawnHeal) : opacite proche de 1 sur presque toute
      // la duree plutot qu'une decroissance immediate.
      const heartT = Math.min(1, fx.elapsed / HEART_DURATION);
      const heartRiseEase = 1 - (1 - heartT) * (1 - heartT);
      fx.heart.position.y = 0.55 + heartRiseEase * HEART_RISE_DISTANCE + surfaceY(fx.x, fx.z);
      const heartGrowT = Math.min(1, fx.elapsed / HEART_GROW_DURATION);
      fx.heart.scale.setScalar(1.9 * (1 - (1 - heartGrowT) * (1 - heartGrowT)));
      (fx.heart.material as THREE.SpriteMaterial).opacity = heartT < 0.6 ? 1 : Math.max(0, 1 - (heartT - 0.6) / 0.4);

      for (const s of fx.sparkles) {
        const t = Math.min(1, fx.elapsed / SPARKLE_DURATION);
        s.angle += dt * s.driftSpeed;
        const wobble = Math.sin(fx.elapsed * 3 + s.angle) * 0.04;
        s.sprite.position.set(fx.x + Math.cos(s.angle) * (s.baseRadius + wobble), 0.15 + t * s.riseSpeed + surfaceY(fx.x, fx.z), fx.z + Math.sin(s.angle) * (s.baseRadius + wobble));
        const growT = Math.min(1, fx.elapsed / SPARKLE_GROW_DURATION);
        s.sprite.scale.setScalar(0.4 * (1 - (1 - growT) * (1 - growT)) * (1 - t * 0.3));
        (s.sprite.material as THREE.SpriteMaterial).opacity = Math.max(0, (1 - t) * 0.95);
      }

      const maxDuration = Math.max(CIRCLE_DURATION, FLASH_DURATION, HEART_DURATION, SPARKLE_DURATION);
      if (fx.elapsed >= maxDuration) {
        this.group.remove(fx.circle, fx.flash, fx.heart, ...fx.sparkles.map((s) => s.sprite));
        this.effects.splice(i, 1);
      }
    }
  }

  /** Nettoyage complet (fin de bataille...) — jamais d'effet fantome apres
   *  un changement de vague. */
  clear(): void {
    for (const fx of this.effects) {
      this.group.remove(fx.circle, fx.flash, fx.heart, ...fx.sparkles.map((s) => s.sprite));
    }
    this.effects.length = 0;
  }
}

/** Glow (flash, etincelles) — fondu ADDITIF, adapte a un effet de lumiere
 *  qui s'ajoute a la scene. */
function buildGlowSprite(texture: THREE.Texture, color: number): THREE.Sprite {
  const material = new THREE.SpriteMaterial({
    map: texture,
    color,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  return new THREE.Sprite(material);
}

/** Icone (le cœur) — fondu NORMAL (2026-08-14, correctif "faut vraiment
 *  zoomer pour voir l'animation") : contrairement a un glow, une icone doit
 *  se lire comme une forme PLEINE et nette, ce que l'additif ne permet
 *  jamais (il ne peut qu'eclaircir, jamais donner une couleur/silhouette
 *  franche sur un fond deja clair). */
function buildIconSprite(texture: THREE.Texture, color: number): THREE.Sprite {
  const material = new THREE.SpriteMaterial({
    map: texture,
    color,
    transparent: true,
    opacity: 0,
    blending: THREE.NormalBlending,
    depthWrite: false,
  });
  return new THREE.Sprite(material);
}
