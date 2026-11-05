import { WORKER_AUTO_RETRY_SECONDS, WORKER_IDLE_SECONDS } from '../../data/hero';
import type { NodeResource } from '../../config/resourceNodes';
import type { Entity } from '../entity';
import { resetNavigation } from '../orders';
import { areAllied } from '../relations';
import { cargoWork, type CargoEvent } from './cargo';
import { workGoal, type HeroWorkContext } from './hero';

/**
 * Villageois (2026-11-03, unite economique) : apres movementSystem, sa
 * recolte, ses tas et ses depots passent par le cargo economique partage
 * avec le Heros (sim/systems/cargo.ts) ; tout autre ordre de travail lui est
 * refuse (sim/orders.ts). Un Villageois mort perd son cargo (deathSystem du
 * monde). Aucune attaque : degats 0, aggro 0 (data/units.ts).
 *
 * AUTONOMIE (2026-11-05, decision d'Antoine) : un Villageois reellement
 * inactif — en Garde, sans ordre du joueur, sans boucle de cargo (recolte,
 * depot, retour), sans geste — pendant plus de WORKER_IDLE_SECONDS se
 * choisit seul une source a recolter :
 *  - parmi les ressources (bois, pierre, or) qui ont au moins une source
 *    valide ET VISIBLE (quantite > 0, outil, HeroWorkContext.isVisible :
 *    le brouillard de guerre du jeu, 2026-11-05 ; une ressource sans source
 *    visible ne participe pas au minimum, l'autonomie ne revele rien),
 *    la MOINS travaillee par les autres Villageois du camp (compte :
 *    harvest, deposit ou pickup dont la boucle revient a une source de
 *    cette ressource ; jamais le Heros ni un Villageois libre) ;
 *  - a egalite, celle dont une source visible valide est la plus proche ;
 *    a egalite encore, l'identifiant de source le plus bas. Aucun hasard :
 *    deterministe. La visibilite ne compte qu'au CHOIX : une source qui
 *    repasse dans le brouillard ne fait pas lacher le travail en cours.
 * Une fois affecte, il garde son cycle (plein -> depot -> retour) jusqu'a
 * redevenir inactif : aucun reequilibrage permanent. Tout ordre du joueur
 * reste prioritaire (il n'est jamais annule ici) ; un ordre manuel termine
 * rend le Villageois autonome apres WORKER_IDLE_SECONDS. Sans source valide,
 * ou si la source choisie n'a rien donne (injoignable) : il reste inactif et
 * reessaie apres WORKER_AUTO_RETRY_SECONDS, en evitant cette source — pas de
 * recherche a chaque pas, pas de boucle de pathfinding.
 */
export function workerSystem(entities: Entity[], work: HeroWorkContext, dt: number, events: CargoEvent[]): void {
  const byId = new Map(entities.map((e) => [e.id, e]));
  for (const e of entities) {
    const w = e.worker;
    if (!w || !e.alive) continue;
    const goal = workGoal(e, work, byId);
    const handled = cargoWork(e, goal, work, entities, dt, events);
    if (!handled) {
      w.working = null;
      w.workTimer = 0;
    }
    if (w.working === 'chop' || w.working === 'mine') w.autoWorked = true;
    // Un ordre qui n'est ni la source choisie seul, ni la boucle de cargo
    // (depot, retour), ni le repos vient du joueur ou d'une source voisine :
    // la source autonome n'est plus la notre.
    const order = e.order;
    if (w.autoNodeId !== null && !(order.type === 'guard' || order.type === 'deposit' || (order.type === 'harvest' && order.nodeId === w.autoNodeId))) w.autoNodeId = null;
    const idle = order.type === 'guard' && w.working === null && e.cargo?.returnTo === null;
    if (!idle) {
      w.idleSeconds = 0;
      continue;
    }
    w.idleSeconds += dt;
    if (w.autoRetryIn > 0) w.autoRetryIn = Math.max(0, w.autoRetryIn - dt);
    if (w.idleSeconds < WORKER_IDLE_SECONDS || w.autoRetryIn > 0) continue;
    // Source choisie seul qui n'a rien donne (injoignable, finie en chemin) :
    // evitee a cet essai, et pas avant WORKER_AUTO_RETRY_SECONDS.
    const avoid = w.autoNodeId !== null && !w.autoWorked ? w.autoNodeId : null;
    if (avoid !== null) {
      w.autoNodeId = null;
      w.autoRetryIn = WORKER_AUTO_RETRY_SECONDS;
    }
    const nodeId = chooseWork(e, entities, work, avoid);
    w.idleSeconds = 0;
    if (nodeId === null) {
      w.autoRetryIn = WORKER_AUTO_RETRY_SECONDS;
      continue;
    }
    e.order = { type: 'harvest', nodeId };
    resetNavigation(e);
    w.autoNodeId = nodeId;
    w.autoWorked = false;
    w.autoRetryIn = 0;
  }
}

const WORK_RESOURCES: readonly NodeResource[] = ['wood', 'stone', 'gold'];

/** Ressource travaillee par un Villageois engage dans sa boucle : recolte
 *  en cours ou a venir, depot ou tas dont la boucle revient a une source ;
 *  null pour un Villageois libre ou sur une tache sans source. */
function workedResource(e: Entity, work: HeroWorkContext): NodeResource | null {
  const order = e.order;
  const back = e.cargo?.returnTo ?? null;
  if (order.type === 'harvest') return work.nodes.get(order.nodeId)?.resource ?? null;
  if (order.type === 'pickup') return work.piles[order.pileId]?.resource ?? null;
  if (order.type === 'deposit' && back) {
    if (back.kind === 'node') return work.nodes.get(back.nodeId)?.resource ?? null;
    return work.piles[back.pileId]?.resource ?? null;
  }
  return null;
}

/** Source a recolter pour le Villageois inactif `e` (voir en-tete), ou null
 *  sans aucune source valide et visible. `avoid` : source a ne pas reprendre. */
export function chooseWork(e: Entity, entities: readonly Entity[], work: HeroWorkContext, avoid: number | null = null): number | null {
  const counts = new Map<NodeResource, number>(WORK_RESOURCES.map((r) => [r, 0]));
  for (const o of entities) {
    if (o === e || !o.alive || !o.worker || !areAllied(o.team, e.team)) continue;
    const r = workedResource(o, work);
    if (r !== null) counts.set(r, (counts.get(r) ?? 0) + 1);
  }
  // Source valide la plus proche de chaque ressource (egalite : id le plus bas).
  const nearest = new Map<NodeResource, { id: number; d: number }>();
  for (const n of work.nodes.values()) {
    if (n.id === avoid || (work.nodeAmounts.get(n.id) ?? 1) <= 0 || !work.canHarvest(n.resource) || !work.isVisible(n.x, n.z)) continue;
    const d = Math.hypot(n.x - e.x, n.z - e.z);
    const best = nearest.get(n.resource);
    if (!best || d < best.d - 1e-9 || (Math.abs(d - best.d) <= 1e-9 && n.id < best.id)) nearest.set(n.resource, { id: n.id, d });
  }
  let chosen: { id: number; d: number; count: number } | null = null;
  for (const r of WORK_RESOURCES) {
    const best = nearest.get(r);
    if (!best) continue;
    const count = counts.get(r) ?? 0;
    if (!chosen || count < chosen.count || (count === chosen.count && (best.d < chosen.d - 1e-9 || (Math.abs(best.d - chosen.d) <= 1e-9 && best.id < chosen.id)))) chosen = { id: best.id, d: best.d, count };
  }
  return chosen ? chosen.id : null;
}
