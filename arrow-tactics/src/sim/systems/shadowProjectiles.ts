import { dist } from '../../core/math';
import type { Rng } from '../../core/rng';
import { applyDamageToEntity } from '../damage';
import type { Entity, Team } from '../entity';

/**
 * Projectiles d'ombre (talent "Soins excédentaires", 2026-08-15) — un VRAI
 * projectile simule (lancement -> vol -> impact -> dégâts), pas un dégât
 * instantané deguise. Genere par main.ts (voir World.spawnShadowProjectiles)
 * chaque fois qu'un soin du joueur DEBORDE du plafond de PV d'une cible (voir
 * applyPlayerHeal) — 1 point de soin excedentaire = 1 projectile.
 *
 * HOMING plutot qu'une trajectoire figee a un point verrouille (contrairement
 * a la Boule de feu du Mage) : `targetId` est suivi en continu, la position
 * du projectile est corrigee vers la position ACTUELLE de sa cible a chaque
 * tick — demande explicite ("les projectiles ciblent un ennemi aleatoire...
 * si la cible meurt en vol, retente une cible simple, sinon se dissipe").
 * Independant de tout Entity comme World.blasts (pas de lanceur a suivre
 * ici, le joueur n'est pas une Entity) — vit directement dans World.
 */

const HIT_RADIUS = 0.15;

export interface ShadowProjectile {
  x: number;
  z: number;
  /** Camp qui a lance le projectile (toujours 'player' aujourd'hui — le
   *  joueur est la seule source de soin/surchauffe actuellement) : determine
   *  qui peut etre cible (`team !== casterTeam`), jamais code en dur en
   *  'enemy' pour rester coherent avec le reste du moteur (Nova de glace,
   *  Blizzard prennent aussi un `casterTeam` explicite). */
  casterTeam: Team;
  targetId: number;
  damage: number;
  speed: number;
}

export type ShadowProjectileEvent = { type: 'shadow-impact'; x: number; z: number; targetId: number };

/** Fisher-Yates deterministe (meme RNG que la bataille, voir World.rng) —
 *  jamais Math.random(), pour rester coherent avec le reste du jeu
 *  (determinisme/rejouabilite d'une bataille a graine fixe). */
function shuffle<T>(items: T[], rng: Rng): T[] {
  const copy = items.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    const tmp = copy[i]!;
    copy[i] = copy[j]!;
    copy[j] = tmp;
  }
  return copy;
}

/**
 * Choisit `count` cibles parmi `pool` (ennemis vivants, non vide — verifie
 * par l'appelant), en PREFERANT des cibles DISTINCTES entre elles : un
 * tirage melange une fois, consomme dans l'ordre ; si `count` depasse
 * `pool.length`, un nouveau melange redemarre (donc une meme cible peut
 * revenir, mais seulement une fois que toutes les autres ont deja ete
 * visees une premiere fois) — demande explicite d'Antoine.
 */
export function pickShadowTargets(pool: Entity[], count: number, rng: Rng): Entity[] {
  const result: Entity[] = [];
  let shuffled = shuffle(pool, rng);
  let idx = 0;
  for (let i = 0; i < count; i++) {
    if (idx >= shuffled.length) {
      shuffled = shuffle(pool, rng);
      idx = 0;
    }
    result.push(shuffled[idx]!);
    idx++;
  }
  return result;
}

/**
 * Avance tous les projectiles d'ombre en vol d'un pas de temps. Corrige la
 * trajectoire vers la position ACTUELLE de la cible avant de tester l'arrivee
 * (HIT_RADIUS) — resout l'impact (dégâts + evenement) des que la distance
 * passe sous ce seuil. Si la cible n'est plus valide (morte), retente un
 * ciblage aleatoire simple parmi les ennemis vivants restants (pas de
 * preference de distinction ici — cas rare, ne concerne qu'un projectile deja
 * en vol) ; si aucun ennemi vivant ne reste, le projectile se dissipe
 * SILENCIEUSEMENT (retire, aucun degat, aucun evenement).
 */
export function advanceShadowProjectiles(
  projectiles: ShadowProjectile[],
  dt: number,
  entities: Entity[],
  rng: Rng,
): ShadowProjectileEvent[] {
  const events: ShadowProjectileEvent[] = [];
  const byId = new Map(entities.map((e) => [e.id, e]));

  for (let i = projectiles.length - 1; i >= 0; i--) {
    const p = projectiles[i]!;
    let target = byId.get(p.targetId);

    if (!target || !target.alive) {
      const alternatives = entities.filter((e) => e.alive && e.team !== p.casterTeam);
      if (alternatives.length === 0) {
        projectiles.splice(i, 1);
        continue;
      }
      target = alternatives[Math.floor(rng.next() * alternatives.length)]!;
      p.targetId = target.id;
    }

    const d = dist(p.x, p.z, target.x, target.z);
    const step = p.speed * dt;
    if (step >= d) {
      p.x = target.x;
      p.z = target.z;
    } else {
      p.x += ((target.x - p.x) / d) * step;
      p.z += ((target.z - p.z) / d) * step;
    }

    if (dist(p.x, p.z, target.x, target.z) <= HIT_RADIUS) {
      applyDamageToEntity(target, p.damage);
      events.push({ type: 'shadow-impact', x: target.x, z: target.z, targetId: target.id });
      projectiles.splice(i, 1);
    }
  }

  return events;
}
