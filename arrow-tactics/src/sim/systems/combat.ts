import { SIDESTEP_DURATION, type ObstacleDef } from '../../config/constants';
import { dist } from '../../core/math';
import type { Rng } from '../../core/rng';
import { applyDamageToEntity } from '../damage';
import { crossesTerrainCliff, findBlockingObstacle, isMeleeAttack } from '../geometry';
import type { Entity } from '../entity';

export type CombatEvent =
  | { attackerId: number; targetId: number; result: 'hit' | 'miss' | 'dodge' }
  | { attackerId: number; targetId: number; result: 'blocked'; impactX: number; impactZ: number };

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
 */
export function combatSystem(entities: Entity[], dt: number, rng: Rng, obstacles: ObstacleDef[]): CombatEvent[] {
  const events: CombatEvent[] = [];
  const byId = new Map(entities.map((e) => [e.id, e]));

  for (const e of entities) {
    if (!e.alive || e.targetId === null) continue;

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

    if (rng.next() < e.stats.missChance) {
      events.push({ attackerId: e.id, targetId: target.id, result: 'miss' });
      continue;
    }

    // Esquive DE LA CIBLE (distincte du miss DE L'ATTAQUANT ci-dessus) —
    // talent permanent "Réflexes de vétéran" (voir data/talents.ts), 0 par
    // defaut pour toute unite de base (voir UnitStats.dodgeChance). Un
    // deuxieme jet uniquement quand dodgeChance > 0 : les unites sans ce
    // talent consomment exactement le meme nombre de tirages RNG qu'avant son
    // introduction. Evenement 'dodge' distinct de 'miss' (2026-08-10) pour un
    // libelle "esquivé" propre au rendu, plutot que de reutiliser "raté".
    if (target.stats.dodgeChance > 0 && rng.next() < target.stats.dodgeChance) {
      events.push({ attackerId: e.id, targetId: target.id, result: 'dodge' });
      continue;
    }

    applyDamageToEntity(target, e.stats.damage);
    events.push({ attackerId: e.id, targetId: target.id, result: 'hit' });
  }

  return events;
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
