import { SIDESTEP_DURATION, type ObstacleDef } from '../../config/constants';
import { dist } from '../../core/math';
import type { Rng } from '../../core/rng';
import { applyDamageToEntity } from '../damage';
import { crossesTerrainCliff, findBlockingObstacle, isMeleeAttack } from '../geometry';
import type { Entity } from '../entity';

export type CombatEvent =
  /** `windup` : coup resolu a la fin d'un elan (UnitStats.attackWindup). */
  | { attackerId: number; targetId: number; result: 'hit' | 'miss' | 'dodge'; windup?: true }
  | { attackerId: number; targetId: number; result: 'blocked'; impactX: number; impactZ: number }
  /** Debut d'un elan : le coup sera resolu `attackWindup` secondes plus tard. */
  | { attackerId: number; targetId: number; result: 'windup' }
  /** Elan termine sans coup : ordre de deplacement, cible morte ou hors
   *  d'atteinte. Aucun degat, aucun tirage. */
  | { attackerId: number; targetId: number; result: 'cancelled' };

/** Marge d'atteinte toleree a la fin d'un elan (cases) : une cible qui
 *  sort reellement du contact pendant le geste fait rater le coup (0,2 case,
 *  decision d'Antoine 2026-11-01). */
const WINDUP_REACH_TOLERANCE = 0.2;

/**
 * Fait attaquer les unites a portee de leur cible verrouillee (targetId, pose
 * par targetingSystem). Le cooldown tourne toujours ; le jet de miss et les
 * degats n'arrivent que lorsqu'il atteint zero, que la cible est a portee, ET
 * que la ligne de tir n'est pas coupee par un obstacle.
 *
 * Un tir bloque consomme quand meme le cooldown (l'unite a essaye, la fleche
 * a fini dans le rocher) et declenche un contournement lateral, gere par
 * movementSystem via sidestepTimer/X/Z.
 *
 * Retourne les evenements du tick pour que le rendu affiche un retour visuel
 * sans avoir a deviner un changement d'etat : un miss ou un tir bloque ne
 * change aucun PV, donc rien d'autre ne le signalerait.
 *
 * Elan (UnitStats.attackWindup > 0, 2026-11-01) : au depart du coup, la
 * cible est verrouillee et le cooldown repart comme d'habitude, mais le
 * jet et les degats n'arrivent qu'a la fin de l'elan (voir
 * advancePendingAttack). Ordre joueur > attaque : un ordre de deplacement
 * (cible retiree par targetingSystem) annule l'elan avant l'impact, sans
 * degat ni tirage, et rend le cooldown. Sans elan, rien ne change : le coup
 * est resolu au tick de depart, comme avant.
 */
export function combatSystem(entities: Entity[], dt: number, rng: Rng, obstacles: ObstacleDef[]): CombatEvent[] {
  const events: CombatEvent[] = [];
  const byId = new Map(entities.map((e) => [e.id, e]));

  for (const e of entities) {
    if (!e.alive) {
      e.pendingAttack = null;
      continue;
    }
    if (e.pendingAttack) {
      // La cadence court pendant l'elan.
      e.attackTimer -= dt;
      advancePendingAttack(e, byId, dt, rng, events);
      continue;
    }
    if (e.targetId === null) continue;

    e.attackTimer -= dt;
    if (e.attackTimer > 0) continue;

    const target = byId.get(e.targetId);
    if (!target || !target.alive) continue;

    const inRange = dist(e.x, e.z, target.x, target.z) <= e.stats.attackRange + target.stats.radius;
    if (!inRange) continue;
    // Relief : aucun contact de corps a corps a travers une falaise (arete
    // dont les hauteurs ne se raccordent pas). L'attaque reste prete ; le
    // deplacement continue de chercher un passage (movementSystem).
    if (isMeleeAttack(e.stats) && crossesTerrainCliff(e.x, e.z, target.x, target.z, obstacles)) continue;

    // target.footprintObstacle (2026-08-16) : un batiment ne doit jamais
    // bloquer sa PROPRE ligne de tir vers lui-meme, voir geometry.ts.
    const blocked = findBlockingObstacle(e.x, e.z, target.x, target.z, obstacles, target.footprintObstacle, true);
    e.attackTimer = e.stats.attackCooldown;

    if (blocked) {
      applySidestep(e, target, blocked.centerX, blocked.centerZ);
      events.push({
        attackerId: e.id,
        targetId: target.id,
        result: 'blocked',
        impactX: blocked.impactX,
        impactZ: blocked.impactZ,
      });
      continue;
    }

    // Ligne de tir degagee : plus besoin de contourner quoi que ce soit.
    e.sidestepTimer = 0;

    const windup = e.stats.attackWindup ?? 0;
    if (windup > 0) {
      e.pendingAttack = { targetId: target.id, remaining: windup };
      events.push({ attackerId: e.id, targetId: target.id, result: 'windup' });
      continue;
    }

    resolveStrike(e, target, rng, events, false);
  }

  return events;
}

/**
 * Fait avancer l'elan d'une attaque. Annule sans degat ni tirage si l'unite
 * n'a plus de cible (ordre de deplacement : targetingSystem la retire ; ou
 * plus aucun ennemi), en lui rendant son cooldown pour qu'elle puisse frapper
 * des l'arret. A la fin de l'elan, resout le coup sur la cible verrouillee si
 * elle est vivante et encore a portee (+ WINDUP_REACH_TOLERANCE), sinon
 * l'attaque est perdue.
 */
function advancePendingAttack(e: Entity, byId: Map<number, Entity>, dt: number, rng: Rng, events: CombatEvent[]): void {
  const pending = e.pendingAttack!;
  if (e.targetId === null) {
    e.pendingAttack = null;
    e.attackTimer = 0;
    events.push({ attackerId: e.id, targetId: pending.targetId, result: 'cancelled' });
    return;
  }
  pending.remaining -= dt;
  if (pending.remaining > 1e-6) return;
  e.pendingAttack = null;
  const target = byId.get(pending.targetId);
  if (!target || !target.alive || dist(e.x, e.z, target.x, target.z) > e.stats.attackRange + target.stats.radius + WINDUP_REACH_TOLERANCE) {
    events.push({ attackerId: e.id, targetId: pending.targetId, result: 'cancelled' });
    return;
  }
  resolveStrike(e, target, rng, events, true);
}

/** Jet de rate, esquive de la cible, puis degats : le coup lui-meme. */
function resolveStrike(e: Entity, target: Entity, rng: Rng, events: CombatEvent[], fromWindup: boolean): void {
  const windup = fromWindup ? ({ windup: true } as const) : {};
  if (rng.next() < e.stats.missChance) {
    events.push({ attackerId: e.id, targetId: target.id, result: 'miss', ...windup });
    return;
  }

  // Esquive DE LA CIBLE (distincte du miss DE L'ATTAQUANT ci-dessus) —
  // talent permanent "Réflexes de vétéran" (voir data/talents.ts), 0 par
  // defaut pour toute unite de base (voir UnitStats.dodgeChance). Un
  // deuxieme jet uniquement quand dodgeChance > 0 : les unites sans ce
  // talent consomment exactement le meme nombre de tirages RNG qu'avant son
  // introduction. Evenement 'dodge' distinct de 'miss' (2026-08-10) pour un
  // libelle "esquivé" propre au rendu, plutot que de reutiliser "raté".
  if (target.stats.dodgeChance > 0 && rng.next() < target.stats.dodgeChance) {
    events.push({ attackerId: e.id, targetId: target.id, result: 'dodge', ...windup });
    return;
  }

  applyDamageToEntity(target, e.stats.damage);
  events.push({ attackerId: e.id, targetId: target.id, result: 'hit', ...windup });
}

/** Pas de cote choisi pour s'eloigner de l'obstacle par rapport a la ligne de
 *  tir, plutot qu'une direction arbitraire : ca donne l'air de vraiment
 *  chercher un angle degage au lieu de trembler sur place. */
function applySidestep(e: Entity, target: Entity, obstacleCenterX: number, obstacleCenterZ: number): void {
  const fx = target.x - e.x;
  const fz = target.z - e.z;
  const len = Math.hypot(fx, fz) || 1;
  const perpX = -fz / len;
  const perpZ = fx / len;

  const toObstacleX = obstacleCenterX - e.x;
  const toObstacleZ = obstacleCenterZ - e.z;
  const side = perpX * toObstacleX + perpZ * toObstacleZ;
  const stepSign = side > 0 ? -1 : 1;

  e.sidestepTimer = SIDESTEP_DURATION;
  e.sidestepX = perpX * stepSign;
  e.sidestepZ = perpZ * stepSign;
}
