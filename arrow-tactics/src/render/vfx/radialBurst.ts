import * as THREE from 'three';

/**
 * Salve de particules qui giclent radialement depuis un point puis retombent
 * en s'estompant — motif partagé entre les braises de la Boule de feu, les
 * motes du projectile d'ombre et (historiquement) les embers de la Nova de
 * glace (2026-08-16, extrait pour ne plus dupliquer 3 fois la même boucle
 * vélocité/gravité/fondu). Toujours des formes SIMPLES fournies par
 * l'appelant (`buildParticle`) — ce module ne sait pas s'il anime des
 * `THREE.Mesh` (cubes) ou des `THREE.Sprite` (texturés), juste comment les
 * faire voler et s'estomper.
 */

export interface RadialParticle {
  mesh: THREE.Object3D;
  velocity: THREE.Vector3;
  elapsed: number;
}

export interface RadialBurstConfig {
  count: number;
  x: number;
  y: number;
  z: number;
  buildParticle: (index: number) => THREE.Object3D;
  speedMin: number;
  speedMax: number;
  liftMin: number;
  liftMax: number;
}

export function spawnRadialParticles(group: THREE.Group, config: RadialBurstConfig): RadialParticle[] {
  const particles: RadialParticle[] = [];
  for (let i = 0; i < config.count; i++) {
    const angle = (i / config.count) * Math.PI * 2 + Math.random() * 0.6;
    const speed = config.speedMin + Math.random() * (config.speedMax - config.speedMin);
    const mesh = config.buildParticle(i);
    mesh.position.set(config.x, config.y, config.z);
    group.add(mesh);
    particles.push({
      mesh,
      velocity: new THREE.Vector3(
        Math.cos(angle) * speed,
        config.liftMin + Math.random() * (config.liftMax - config.liftMin),
        Math.sin(angle) * speed,
      ),
      elapsed: 0,
    });
  }
  return particles;
}

/** Avance/estompe toutes les particules, retire celles arrivées en fin de
 *  vie (mutate `particles` en place, comme les autres listes d'effets de ce
 *  projet). `baseOpacity` : opacité de départ commune à toute la salve —
 *  suffisant pour les usages actuels (une seule salve = une seule intention
 *  visuelle), pas besoin d'une opacité par particule. */
export function tickRadialParticles(
  particles: RadialParticle[],
  group: THREE.Group,
  dt: number,
  duration: number,
  gravity: number,
  baseOpacity: number,
): void {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i]!;
    p.elapsed += dt;
    p.velocity.y -= gravity * dt;
    p.mesh.position.addScaledVector(p.velocity, dt);
    const t = Math.min(1, p.elapsed / duration);
    const mat = (p.mesh as THREE.Sprite | THREE.Mesh).material as THREE.SpriteMaterial | THREE.MeshBasicMaterial;
    mat.opacity = baseOpacity * (1 - t);
    if (t >= 1) {
      group.remove(p.mesh);
      particles.splice(i, 1);
    }
  }
}
