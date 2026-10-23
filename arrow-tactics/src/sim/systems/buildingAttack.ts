import { dist } from '../../core/math';
import { applyDamageToEntity } from '../damage';
import type { Entity } from '../entity';

/**
 * Tir automatique des batiments defensifs (Tour) : chaque batiment vivant
 * dote d'une attaque (Entity.buildingAttack) vise l'unite adverse vivante la
 * plus proche a sa portee, conserve cette cible tant qu'elle reste valide et
 * a portee, et tire une fleche a chaque fin de recharge.
 *
 * Contrairement a l'Archer (degats appliques au tir, fleche purement
 * cosmetique, voir combatSystem), la fleche est SIMULEE : elle vole pendant
 * distance / vitesse et les degats s'appliquent a l'IMPACT, via
 * applyDamageToEntity. Comme une fleche d'Archer, elle reste attachee a sa
 * cible : celle-ci est touchee si elle est encore vivante a l'arrivee ; morte
 * entre-temps, la fleche est perdue (aucune recherche d'une autre cible).
 *
 * Pas de jet de hasard, pas de ligne de tir (la fleche part des creneaux) :
 * entierement deterministe. Egalite de distance : plus petit id d'entite.
 */

/** Fleche en vol. `prevElapsed` sert a l'interpolation du rendu. */
export interface BuildingProjectile {
  id: number;
  attackerId: number;
  targetId: number;
  fromX: number;
  fromZ: number;
  prevElapsed: number;
  elapsed: number;
  duration: number;
  damage: number;
}

export type BuildingAttackEvent =
  | { kind: 'fired'; attackerId: number; targetId: number; projectileId: number }
  | { kind: 'impact'; attackerId: number; targetId: number; projectileId: number; hit: boolean };

function isValidTarget(attacker: Entity, e: Entity | undefined): e is Entity {
  return e !== undefined && e.alive && e.team !== attacker.team && !e.isBuilding;
}

function inRange(attacker: Entity, target: Entity, rangeTiles: number): boolean {
  return dist(attacker.x, attacker.z, target.x, target.z) <= rangeTiles + target.stats.radius;
}

export function buildingAttackSystem(
  entities: readonly Entity[],
  lookup: (id: number) => Entity | undefined,
  projectiles: BuildingProjectile[],
  dt: number,
  nextProjectileId: () => number,
): BuildingAttackEvent[] {
  const events: BuildingAttackEvent[] = [];

  // Vols en cours (y compris ceux d'une Tour detruite depuis) : impact a la
  // fin de la duree, sur la cible si elle vit encore.
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const p = projectiles[i]!;
    p.prevElapsed = p.elapsed;
    p.elapsed += dt;
    if (p.elapsed < p.duration) continue;
    const target = lookup(p.targetId);
    const hit = target !== undefined && target.alive;
    if (hit) applyDamageToEntity(target, p.damage);
    events.push({ kind: 'impact', attackerId: p.attackerId, targetId: p.targetId, projectileId: p.id, hit });
    projectiles.splice(i, 1);
  }

  for (const e of entities) {
    const attack = e.buildingAttack;
    if (!attack) continue;
    // Detruite (ou a 0 PV ce tick, avant deathSystem) : plus aucun tir, cible oubliee.
    if (!e.alive || e.hp <= 0) {
      attack.targetId = null;
      continue;
    }
    attack.timer = Math.max(0, attack.timer - dt);

    let target = attack.targetId !== null ? lookup(attack.targetId) : undefined;
    if (!isValidTarget(e, target) || !inRange(e, target, attack.rangeTiles)) {
      target = undefined;
      let bestDist = Infinity;
      for (const other of entities) {
        if (!isValidTarget(e, other) || !inRange(e, other, attack.rangeTiles)) continue;
        const d = dist(e.x, e.z, other.x, other.z);
        if (d < bestDist || (d === bestDist && target !== undefined && other.id < target.id)) {
          target = other;
          bestDist = d;
        }
      }
    }
    attack.targetId = target?.id ?? null;
    if (!target || attack.timer > 0) continue;

    const projectile: BuildingProjectile = {
      id: nextProjectileId(),
      attackerId: e.id,
      targetId: target.id,
      fromX: e.x,
      fromZ: e.z,
      prevElapsed: 0,
      elapsed: 0,
      duration: Math.max(0.05, dist(e.x, e.z, target.x, target.z) / attack.projectileSpeed),
      damage: attack.damage,
    };
    projectiles.push(projectile);
    attack.timer = attack.cooldownSeconds;
    events.push({ kind: 'fired', attackerId: e.id, targetId: target.id, projectileId: projectile.id });
  }

  return events;
}
