import { obstacleBounds } from '../../config/constants';
import type { Entity } from '../entity';
import { finishOrder, resetNavigation, type OrderEndEvent } from '../orders';
import { areAllied } from '../relations';

/**
 * Defense locale des batiments (2026-11-08, decision d'Antoine) : quand un
 * batiment allie ENCAISSE reellement des degats (Entity.damageTaken, pose par
 * sim/damage.ts : aucune comparaison de chaque batiment a chaque ennemi), les
 * unites MILITAIRES proches qui n'ont rien de mieux a faire viennent le
 * defendre.
 *
 *  - Rayon : LOCAL_DEFENSE_RADIUS, en cases de simulation — jamais la camera
 *    (zoom, fenetre, cadrage) : la simulation ne la connait pas. Environ une
 *    largeur d'ecran a l'echelle actuelle ; une attaque lointaine ne mobilise
 *    donc jamais toute l'armee.
 *  - Eligibles : unites alliees vivantes, non batiments, capables de combattre
 *    (degats > 0) et sans role economique (Entity.worker nul : jamais un
 *    Villageois), hors gardes de camp et objets neutres, SANS ordre manuel —
 *    seulement Garde ou comportement autonome (`guard`, `assault`), sans cible
 *    verrouillee et hors Provocation. Le Heros compte s'il est dans ce cas.
 *    Un ordre du joueur (`move`, `attack`, travail, sort) n'est JAMAIS ecrase ;
 *    une unite deja en defense garde son intervention (pas d'oscillation entre
 *    deux alertes).
 *  - Alerte : au plus une par batiment toutes les LOCAL_DEFENSE_ALERT_COOLDOWN
 *    secondes.
 *  - Reaction : ordre `defend` vers un point d'approche au bord du batiment, du
 *    cote de l'unite (jamais le centre, qui est dans l'emprise). En chemin, le
 *    ciblage normal reste actif (aggro) : l'unite se bat avec ce qu'elle
 *    rencontre, aucune connaissance de la carte ni revelation du brouillard.
 *  - Fin : arrivee (movementSystem), batiment disparu, LOCAL_DEFENSE_TIMEOUT
 *    ecoule, ou unite partie a plus de LOCAL_DEFENSE_LEAVE_RADIUS du point
 *    (poursuite qui s'eloigne) : retour en Garde, sans evenement — rien a
 *    restaurer puisqu'aucun ordre manuel n'a ete remplace.
 * Deterministe : ordre des entites, aucun hasard.
 */
export const LOCAL_DEFENSE_RADIUS = 22;
export const LOCAL_DEFENSE_ALERT_COOLDOWN = 1;
/** Duree maximale d'une intervention (s de simulation). PROVISOIRE. */
export const LOCAL_DEFENSE_TIMEOUT = 20;
/** Au-dela de cette distance au point d'alerte, l'intervention s'arrete. PROVISOIRE. */
export const LOCAL_DEFENSE_LEAVE_RADIUS = 30;
/** Marge entre le bord de l'emprise et le point d'approche (cases). */
const APPROACH_GAP = 0.4;

/** Unite capable de prendre part a une defense locale (voir en-tete) : militaire
 *  alliee du batiment, libre de tout ordre manuel. */
export function canDefendLocally(e: Entity, building: Entity): boolean {
  if (!e.alive || e.isBuilding || e.worker !== null || e.stats.damage <= 0) return false;
  if (e.campGuard !== null || e.destructible !== null || !areAllied(e.team, building.team)) return false;
  if (e.tauntSourceId !== null || e.targetId !== null) return false;
  return e.order.type === 'guard' || e.order.type === 'assault';
}

/** Point d'approche au bord de l'emprise de `building`, du cote de `e`. */
export function defenseApproachPoint(building: Entity, e: { x: number; z: number; stats: { radius: number } }): { x: number; z: number } {
  let dx = e.x - building.x;
  let dz = e.z - building.z;
  const len = Math.hypot(dx, dz);
  if (len < 1e-6) {
    dx = 0;
    dz = 1;
  } else {
    dx /= len;
    dz /= len;
  }
  const f = building.footprintObstacle;
  let exit: number;
  if (f) {
    const b = obstacleBounds(f);
    const halfW = (b.maxX - b.minX) / 2;
    const halfH = (b.maxZ - b.minZ) / 2;
    const tx = Math.abs(dx) > 1e-6 ? halfW / Math.abs(dx) : Infinity;
    const tz = Math.abs(dz) > 1e-6 ? halfH / Math.abs(dz) : Infinity;
    exit = Math.min(tx, tz);
  } else exit = building.stats.radius;
  const d = exit + e.stats.radius + APPROACH_GAP;
  return { x: building.x + dx * d, z: building.z + dz * d };
}

export function localDefenseSystem(entities: Entity[], alerts: Map<number, number>, time: number, dt: number, orderEvents: OrderEndEvent[]): void {
  const byId = new Map(entities.map((e) => [e.id, e]));
  // 1. Interventions en cours : fin propre (Garde) quand elles n'ont plus de sens.
  for (const e of entities) {
    if (!e.alive || e.order.type !== 'defend') continue;
    const order = e.order;
    order.elapsed += dt;
    const building = byId.get(order.targetEntityId);
    const gone = !building || !building.alive;
    const far = Math.hypot(order.x - e.x, order.z - e.z) > LOCAL_DEFENSE_LEAVE_RADIUS;
    if (gone || far || order.elapsed > LOCAL_DEFENSE_TIMEOUT) finishOrder(e, orderEvents, 'completed', 'arrived');
  }
  // 2. Alertes : batiments touches depuis le dernier passage (Entity.damageTaken,
  //    consomme et remis a zero ici pour toutes les entites).
  for (const b of entities) {
    const taken = b.damageTaken;
    b.damageTaken = 0;
    if (taken <= 0 || !b.isBuilding || !b.alive || b.destructible !== null) continue;
    const last = alerts.get(b.id);
    if (last !== undefined && time - last < LOCAL_DEFENSE_ALERT_COOLDOWN) continue;
    alerts.set(b.id, time);
    for (const e of entities) {
      if (!canDefendLocally(e, b)) continue;
      if (Math.hypot(e.x - b.x, e.z - b.z) > LOCAL_DEFENSE_RADIUS) continue;
      const point = defenseApproachPoint(b, e);
      e.order = { type: 'defend', targetEntityId: b.id, x: point.x, z: point.z, elapsed: 0 };
      resetNavigation(e);
    }
  }
}
