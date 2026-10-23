import { dist } from '../core/math';
import type { Entity } from './entity';

/**
 * Mode AUTOMATIQUE de la Baliste du joueur : choix de la cible et point de
 * visee anticipe. Fonctions PURES et deterministes (aucun Math.random,
 * aucune ecriture dans les entites) : le tir lui-meme passe toujours par
 * World.fireArrowVolley, seule autorite sur la cadence, exactement comme le
 * tir manuel (main.ts, fireArrowIfReady).
 */

/** Cible valide en AUTO : unite ennemie vivante. Les batiments ennemis
 *  eventuels sont exclus (la Baliste ne vise que des unites). */
export function isValidBallistaAutoTarget(e: Entity | undefined): e is Entity {
  return e !== undefined && e.alive && e.team === 'enemy' && !e.isBuilding;
}

/** Vrai si `e` est a portee de la Baliste centree en (originX, originZ) :
 *  distance de centre a centre <= `rangeTiles` (PLAYER_ARROW_RANGE). */
export function isWithinBallistaRange(e: Entity, originX: number, originZ: number, rangeTiles: number): boolean {
  return dist(originX, originZ, e.x, e.z) <= rangeTiles;
}

/**
 * Cible AUTO : la cible courante est CONSERVEE tant qu'elle reste valide et
 * a portee (pas d'oscillation entre deux ennemis presque equidistants) ;
 * sinon, l'unite ennemie valide la plus proche de la Baliste DANS sa portee,
 * egalite tranchee par id croissant (stable). null si aucune cible valide a
 * portee.
 */
export function selectBallistaAutoTarget(
  entities: readonly Entity[],
  originX: number,
  originZ: number,
  current: Entity | undefined,
  rangeTiles: number,
): Entity | null {
  if (isValidBallistaAutoTarget(current) && isWithinBallistaRange(current, originX, originZ, rangeTiles)) return current;
  let best: Entity | null = null;
  let bestDist = Infinity;
  for (const e of entities) {
    if (!isValidBallistaAutoTarget(e) || !isWithinBallistaRange(e, originX, originZ, rangeTiles)) continue;
    const d = dist(originX, originZ, e.x, e.z);
    if (d < bestDist || (d === bestDist && best !== null && e.id < best.id)) {
      best = e;
      bestDist = d;
    }
  }
  return best;
}

/** Duree de vol maximale retenue pour l'anticipation (secondes) : au-dela,
 *  la trajectoire de la cible est trop incertaine pour extrapoler plus loin. */
export const BALLISTA_AUTO_MAX_LEAD_SECONDS = 2.5;

/**
 * Point d'interception anticipe : ou sera la cible quand le carreau
 * arrivera, en supposant qu'elle garde sa vitesse ACTUELLE (deplacement reel
 * du dernier pas : (x - prevX) / dt, aucune modification du mouvement).
 *
 * Resolution exacte projectile / cible en ligne droite : on cherche t > 0
 * tel que |P + V t - O| = s t (le carreau vole en ligne droite a vitesse
 * constante, voir sim/playerArrow.ts, duree = distance / vitesse), soit
 * (V.V - s^2) t^2 + 2 (D.V) t + D.D = 0 avec D = P - O. Plus petite racine
 * positive ; sans solution (cible plus rapide que le carreau, cas
 * degenere), repli sur predicted = P + V x (distance / s). Le temps est
 * plafonne a BALLISTA_AUTO_MAX_LEAD_SECONDS.
 *
 * Une cible qui change de direction apres le tir peut naturellement etre
 * ratee : c'est une estimation, pas un projectile a tete chercheuse.
 */
export function predictBallistaAimPoint(
  originX: number,
  originZ: number,
  target: Entity,
  projectileSpeed: number,
  dt: number,
): { x: number; z: number } {
  let vx = dt > 0 ? (target.x - target.prevX) / dt : 0;
  let vz = dt > 0 ? (target.z - target.prevZ) / dt : 0;
  // Un deplacement ponctuel hors marche (recul, dash) ne doit pas faire
  // extrapoler une vitesse absurde : plafond a 2 x la vitesse de marche.
  const speed = Math.hypot(vx, vz);
  const maxSpeed = 2 * target.stats.moveSpeed;
  if (speed > maxSpeed) {
    const k = maxSpeed > 0 ? maxSpeed / speed : 0;
    vx *= k;
    vz *= k;
  }
  const dx = target.x - originX;
  const dz = target.z - originZ;

  const a = vx * vx + vz * vz - projectileSpeed * projectileSpeed;
  const b = 2 * (dx * vx + dz * vz);
  const c = dx * dx + dz * dz;
  let t = Math.sqrt(c) / projectileSpeed;
  if (Math.abs(a) > 1e-9) {
    const disc = b * b - 4 * a * c;
    if (disc >= 0) {
      const sq = Math.sqrt(disc);
      const roots = [(-b - sq) / (2 * a), (-b + sq) / (2 * a)].filter((r) => r > 0);
      if (roots.length > 0) t = Math.min(...roots);
    }
  } else if (b < 0) {
    // Vitesse de la cible egale a celle du carreau : equation lineaire.
    t = -c / b;
  }
  t = Math.min(Math.max(t, 0), BALLISTA_AUTO_MAX_LEAD_SECONDS);
  return { x: target.x + vx * t, z: target.z + vz * t };
}
