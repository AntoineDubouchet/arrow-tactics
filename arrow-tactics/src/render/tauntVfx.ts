import * as THREE from 'three';
import { COLORS, TILE } from '../config/constants';
import type { Entity } from '../sim/entity';
import { surfaceY } from './terrainSurface';

/**
 * VFX de Provocation (Sentinelle, 2026-08-14, demande complete d'Antoine) —
 * "petit cercle radial partant de la Sentinelle, onde jaune/dorée/blanche...
 * pas un énorme VFX magique, la Sentinelle est un guerrier, pas un Mage".
 * Formes simples (Ring/Cone), pas de texture ni de systeme de particules —
 * plus sobre encore que la Nova de glace/le parchemin de soin (deja
 * texturés), pour rester "martial" plutot que "magique".
 *
 * Trois elements independants :
 *  - `spawnTauntWave` : onde ponctuelle qui part de la Sentinelle et
 *    s'etend jusqu'au rayon REEL de la Provocation (jamais une valeur
 *    approximative, voir main.ts qui passe `event.radiusTiles`).
 *  - `syncTauntIndicators` : petit symbole dore flottant au-dessus de
 *    CHAQUE unite ACTUELLEMENT provoquee (`Entity.tauntTimer > 0`), meme
 *    principe que IceNovaView.syncFrostIndicators — suit la position
 *    REELLEMENT rendue (interpolee), disparait des que le Taunt se termine
 *    ou que l'unite meurt.
 *  - `spawnShieldGain` : petit flash bleu-blanc bref sur la Sentinelle au
 *    moment ou elle gagne son bouclier.
 */

const WAVE_DURATION = 0.45;
const WAVE_START_RADIUS = 0.2;
const SHIELD_FLASH_DURATION = 0.35;
const INDICATOR_HEIGHT = 1.9;
const INDICATOR_BOB_SPEED = 3;
const INDICATOR_BOB_AMPLITUDE = 0.05;

interface WaveFx {
  group: THREE.Group;
  ring: THREE.Mesh;
  elapsed: number;
  maxRadius: number;
}

interface ShieldFlashFx {
  group: THREE.Group;
  ring: THREE.Mesh;
  elapsed: number;
}

/** Petit losange plein dore, pointe vers le bas — symbole neutre "cette
 *  unite est sous l'effet d'un ordre exterieur", volontairement discret. */
function buildTauntIndicator(): THREE.Group {
  const group = new THREE.Group();
  const material = new THREE.MeshBasicMaterial({ color: COLORS.tauntGold, transparent: true, opacity: 0.92, side: THREE.DoubleSide });
  const shape = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.16, 4), material);
  shape.rotation.x = Math.PI;
  group.add(shape);
  return group;
}

export class TauntVfxView {
  readonly group = new THREE.Group();
  private readonly waves: WaveFx[] = [];
  private readonly shieldFlashes: ShieldFlashFx[] = [];
  /** Indicateurs actifs, cle par id d'ENTITE (comme IceNovaView.frostIndicators). */
  private readonly indicators = new Map<number, THREE.Group>();
  private elapsedTime = 0;

  /** `radiusTiles` : rayon REEL de la Provocation qui vient de se
   *  declencher (voir sim/systems/abilities.ts, AbilityEvent 'taunt') —
   *  l'onde s'etend jusqu'a cette valeur exacte, jamais approximee. */
  spawnTauntWave(x: number, z: number, radiusTiles: number): void {
    const group = new THREE.Group();
    group.position.set(x, 0.03 + surfaceY(x, z), z);

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.85, 1, 40),
      new THREE.MeshBasicMaterial({ color: COLORS.tauntGold, transparent: true, opacity: 0.95, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.scale.setScalar(WAVE_START_RADIUS * TILE);
    group.add(ring);

    this.group.add(group);
    this.waves.push({ group, ring, elapsed: 0, maxRadius: radiusTiles * TILE });
  }

  /** Petit flash bleu-blanc bref autour de la Sentinelle au moment ou elle
   *  gagne son bouclier — sobre, pas de grosse bulle magique. */
  spawnShieldGain(x: number, z: number): void {
    const group = new THREE.Group();
    group.position.set(x, 0.65 + surfaceY(x, z), z);

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.65, 1, 24),
      new THREE.MeshBasicMaterial({ color: COLORS.shieldFlash, transparent: true, opacity: 0.9, side: THREE.DoubleSide }),
    );
    ring.scale.setScalar(0.35);
    group.add(ring);

    this.group.add(group);
    this.shieldFlashes.push({ group, ring, elapsed: 0 });
  }

  /** A appeler chaque frame — voir le commentaire de classe. */
  syncTauntIndicators(entities: Entity[], resolvePosition: (e: Entity) => { x: number; z: number }): void {
    const activeIds = new Set<number>();

    for (const e of entities) {
      if (!e.alive || e.tauntTimer <= 0) continue;
      activeIds.add(e.id);

      let fx = this.indicators.get(e.id);
      if (!fx) {
        fx = buildTauntIndicator();
        this.indicators.set(e.id, fx);
        this.group.add(fx);
      }
      const pos = resolvePosition(e);
      const bob = Math.sin(this.elapsedTime * INDICATOR_BOB_SPEED + e.id) * INDICATOR_BOB_AMPLITUDE;
      fx.position.set(pos.x, INDICATOR_HEIGHT + bob + surfaceY(pos.x, pos.z), pos.z);
    }

    for (const [id, fx] of this.indicators) {
      if (activeIds.has(id)) continue;
      this.group.remove(fx);
      this.indicators.delete(id);
    }
  }

  /** A appeler chaque frame (temps reel, purement cosmetique — comme le
   *  reste des VFX du jeu). */
  sync(dt: number): void {
    this.elapsedTime += dt;

    for (let i = this.waves.length - 1; i >= 0; i--) {
      const w = this.waves[i]!;
      w.elapsed += dt;
      const t = Math.min(1, w.elapsed / WAVE_DURATION);
      const radius = WAVE_START_RADIUS * TILE + (w.maxRadius - WAVE_START_RADIUS * TILE) * t;
      w.ring.scale.setScalar(Math.max(0.01, radius));
      (w.ring.material as THREE.MeshBasicMaterial).opacity = 0.95 * (1 - t);
      if (t >= 1) {
        this.group.remove(w.group);
        this.waves.splice(i, 1);
      }
    }

    for (let i = this.shieldFlashes.length - 1; i >= 0; i--) {
      const s = this.shieldFlashes[i]!;
      s.elapsed += dt;
      const t = Math.min(1, s.elapsed / SHIELD_FLASH_DURATION);
      s.ring.scale.setScalar(0.35 + 0.55 * t);
      (s.ring.material as THREE.MeshBasicMaterial).opacity = 0.9 * (1 - t);
      if (t >= 1) {
        this.group.remove(s.group);
        this.shieldFlashes.splice(i, 1);
      }
    }
  }

  clear(): void {
    for (const w of this.waves) this.group.remove(w.group);
    this.waves.length = 0;
    for (const s of this.shieldFlashes) this.group.remove(s.group);
    this.shieldFlashes.length = 0;
    for (const fx of this.indicators.values()) this.group.remove(fx);
    this.indicators.clear();
  }
}
