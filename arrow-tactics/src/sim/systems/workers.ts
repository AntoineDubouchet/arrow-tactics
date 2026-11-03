import { HARVEST_INTERVAL } from '../../data/hero';
import { HARVEST_NODE_KINDS } from '../../data/resources';
import type { Entity } from '../entity';
import { isWorkOrder } from '../orders';
import { workGoal, type HeroWorkContext } from './hero';

/** Rayon (cases) de recherche d'une source du meme type quand la sienne est
 *  epuisee (2026-11-03, PROVISOIRE) : au-dela, le Villageois s'arrete. */
export const WORKER_NEXT_NODE_RADIUS = 6;

/**
 * Villageois (2026-11-03, premiere unite economique) : recolte continue, sans
 * inventaire RPG ni IA autonome.
 *
 * - `harvest` : au contact de la source (meme portee et meme cadence que le
 *   Heros), avec l'outil de la Forge (meme permission globale) ; chaque
 *   unite extraite (bois, pierre, or) est creditee DIRECTEMENT au stock
 *   (HeroWorkContext.mined) : rien n'est porte, aucun depot (2026-11-03).
 * - Source epuisee : la plus proche du meme type a WORKER_NEXT_NODE_RADIUS
 *   cases, sinon Garde.
 * - Outil perdu (derniere Forge detruite) : l'unite en cours est finie, puis
 *   Garde.
 * - Tout autre ordre (deplacement, Stop...) interrompt la recolte.
 */
export function workerSystem(entities: Entity[], work: HeroWorkContext, dt: number): void {
  const byId = new Map(entities.map((e) => [e.id, e]));
  for (const e of entities) {
    const w = e.worker;
    if (!w || !e.alive) continue;
    w.nodeId = e.order.type === 'harvest' ? e.order.nodeId : null;
    const goal = workGoal(e, work, byId);
    if (isWorkOrder(e.order) && !goal) {
      // Source disparue ou outil perdu en chemin.
      if (e.order.type === 'harvest') nextAfterSource(e, work, w.nodeId);
      else e.order = { type: 'guard' };
      w.working = null;
      w.workTimer = 0;
      continue;
    }
    if (!goal || !goal.reached || e.tauntSourceId !== null || e.order.type !== 'harvest') {
      w.working = null;
      w.workTimer = 0;
      continue;
    }
    const node = work.nodes.get(e.order.nodeId)!;
    const allowed = work.canHarvest(node.resource);
    w.working = HARVEST_NODE_KINDS[node.resource].working;
    w.workTimer += dt;
    let lostTool = false;
    while (w.workTimer >= HARVEST_INTERVAL && (work.nodeAmounts.get(node.id) ?? 1) > 0) {
      w.workTimer -= HARVEST_INTERVAL;
      const left = work.nodeAmounts.get(node.id);
      if (left !== undefined) {
        work.nodeAmounts.set(node.id, left - 1);
        if (left - 1 <= 0) work.depleted.push(node.id);
      }
      work.mined.push({ entityId: e.id, nodeId: node.id, resource: node.resource, amount: 1 });
      if (!allowed) {
        lostTool = true;
        break;
      }
    }
    if (lostTool) e.order = { type: 'guard' };
    else if ((work.nodeAmounts.get(node.id) ?? 1) <= 0) nextAfterSource(e, work, node.id);
    else continue;
    w.working = null;
    w.workTimer = 0;
  }
}

/** Source `nodeId` finie (epuisee, disparue, outil perdu) : la plus proche du
 *  meme type a WORKER_NEXT_NODE_RADIUS cases (outil disponible), sinon
 *  Garde. */
function nextAfterSource(e: Entity, work: HeroWorkContext, nodeId: number | null): void {
  const old = nodeId !== null ? work.nodes.get(nodeId) : undefined;
  let next: number | null = null;
  if (old && work.canHarvest(old.resource)) {
    let best = WORKER_NEXT_NODE_RADIUS;
    for (const n of work.nodes.values()) {
      if (n.id === old.id || n.resource !== old.resource || (work.nodeAmounts.get(n.id) ?? 1) <= 0) continue;
      const d = Math.hypot(n.x - old.x, n.z - old.z);
      if (d <= best) {
        best = d;
        next = n.id;
      }
    }
  }
  e.worker!.nodeId = next;
  e.order = next !== null ? { type: 'harvest', nodeId: next } : { type: 'guard' };
}
