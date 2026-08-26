import * as THREE from 'three';
import { createVfxSprite, type VfxMaterialSpec } from './vfxMaterials';

/**
 * Anneau de sprites qui orbitent à faible rayon autour d'un point (le noyau
 * d'un projectile magique) en scintillant — motif partagé entre les flammes
 * de la Boule de feu et les volutes du projectile d'ombre (2026-08-16,
 * extrait pour ne pas dupliquer deux fois la même logique de phase/flicker).
 *
 * Chaque sprite a sa PROPRE phase de scintillement, tirée UNE SEULE FOIS à
 * la construction (jamais recalculée par frame) — les sprites eux-mêmes ne
 * partagent jamais de matériau MUTÉ (chaque `createVfxSprite` clone déjà son
 * gabarit), donc plusieurs anneaux simultanés (plusieurs Mages, plusieurs
 * projectiles d'ombre) scintillent de façon indépendante sans jamais se
 * synchroniser artificiellement.
 */

export interface OrbitingSprite {
  sprite: THREE.Sprite;
  phase: number;
  angle: number;
}

export interface OrbitingSpritesConfig {
  /** Cyclée pour chaque sprite (`specs[i % specs.length]`) — permet de
   *  mélanger plusieurs textures/teintes dans le même anneau. */
  specs: VfxMaterialSpec[];
  count: number;
  baseScale: number;
  orbitRadius: number;
  /** Léger décalage vertical (fraction de orbitRadius) pour eviter un
   *  anneau parfaitement plat — donne un mouvement plus organique. */
  verticalJitter?: number;
}

export function buildOrbitingSprites(group: THREE.Group, config: OrbitingSpritesConfig): OrbitingSprite[] {
  const items: OrbitingSprite[] = [];
  const vJitter = config.verticalJitter ?? 0;
  for (let i = 0; i < config.count; i++) {
    const spec = config.specs[i % config.specs.length]!;
    const sprite = createVfxSprite(spec);
    sprite.scale.setScalar(config.baseScale);
    const angle = (i / config.count) * Math.PI * 2;
    sprite.position.set(
      Math.cos(angle) * config.orbitRadius,
      Math.sin(angle * 1.3) * config.orbitRadius * vJitter,
      Math.sin(angle) * config.orbitRadius,
    );
    group.add(sprite);
    items.push({ sprite, phase: Math.random() * Math.PI * 2, angle });
  }
  return items;
}

/** Fait scintiller (scale) chaque sprite de l'anneau — `elapsed` doit être
 *  un temps qui n'avance QUE tant que l'effet est visible (temps de vol/
 *  temps de vie), jamais l'horloge réelle globale, pour que le scintillement
 *  redémarre proprement à chaque nouvelle instance. */
export function tickOrbitingSprites(items: OrbitingSprite[], elapsed: number, baseScale: number, flickerSpeed: number, flickerAmount: number): void {
  for (const item of items) {
    const flicker = 1 + Math.sin(elapsed * flickerSpeed + item.phase) * flickerAmount;
    item.sprite.scale.setScalar(baseScale * flicker);
  }
}
