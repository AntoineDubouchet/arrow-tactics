import { getBuilding } from '../../data/buildings';
import { DEPOSIT_SECONDS_PER_ITEM, HARVEST_INTERVAL } from '../../data/hero';
import { HARVEST_NODE_KINDS, type CarriedResource } from '../../data/resources';
import type { Entity } from '../entity';
import { isWorkOrder } from '../orders';
import { areAllied } from '../relations';
import { workGoal, type HeroWorkContext } from './hero';

/** Bois ou pierre verses au depot par un Villageois pendant un pas (la run
 *  credite son stock, main.ts). */
export interface WorkerDepositEvent {
  entityId: number;
  resource: CarriedResource;
  amount: number;
}

/** Rayon (cases) de recherche d'une source du meme type quand la sienne est
 *  epuisee (2026-11-03, PROVISOIRE) : au-dela, le Villageois s'arrete. */
export const WORKER_NEXT_NODE_RADIUS = 6;

/**
 * Villageois (2026-11-03, premiere unite economique) : boucle simple
 * recolte -> transport -> depot -> retour, sans inventaire RPG ni IA
 * autonome.
 *
 * - `harvest` : au contact de la source (meme portee et meme cadence que le
 *   Heros), avec l'outil de la Forge (meme permission globale) ; bois et
 *   pierre remplissent sa charge (Entity.worker.carry, capacite de sa
 *   fiche) ; or : monnaie, credite a chaque unite (HeroWorkContext.goldMined),
 *   jamais porte ni depose.
 * - Charge pleine (ou autre ressource deja portee) : il part au depot allie
 *   le plus proche (BuildingDef.resourceDepot : la Baliste aujourd'hui, tout
 *   futur depot ensuite), verse une unite toutes les
 *   DEPOSIT_SECONDS_PER_ITEM s, puis retourne a sa source.
 * - Source epuisee : la plus proche du meme type a WORKER_NEXT_NODE_RADIUS
 *   cases, sinon depot de ce qu'il porte, puis Garde.
 * - Outil perdu (derniere Forge detruite) : l'unite en cours est finie, puis
 *   depot de ce qu'il porte et Garde.
 * - Tout autre ordre (deplacement, Stop...) interrompt la boucle ; ce qui est
 *   porte reste porte.
 */
export function workerSystem(entities: Entity[], work: HeroWorkContext, dt: number, deposits: WorkerDepositEvent[]): void {
  const byId = new Map(entities.map((e) => [e.id, e]));
  for (const e of entities) {
    const w = e.worker;
    if (!w || !e.alive) continue;
    // Source a laquelle revenir apres un depot : celle de l'ordre de
    // recolte ; un ordre hors de la boucle l'oublie.
    if (e.order.type === 'harvest') w.nodeId = e.order.nodeId;
    else if (e.order.type !== 'deposit') w.nodeId = null;
    const goal = workGoal(e, work, byId);
    if (isWorkOrder(e.order) && !goal) {
      // Source disparue ou outil perdu en chemin ; depot disparu.
      if (e.order.type === 'harvest') nextAfterSource(e, work, entities, w.nodeId);
      else e.order = { type: 'guard' };
      w.working = null;
      w.workTimer = 0;
      continue;
    }
    if (!goal || !goal.reached || e.tauntSourceId !== null) {
      w.working = null;
      w.workTimer = 0;
      continue;
    }
    if (e.order.type === 'deposit') {
      if (w.carry && w.carry.amount > 0) {
        w.working = 'deposit';
        w.workTimer += dt;
        while (w.workTimer >= DEPOSIT_SECONDS_PER_ITEM && w.carry.amount > 0) {
          w.workTimer -= DEPOSIT_SECONDS_PER_ITEM;
          w.carry.amount -= 1;
          deposits.push({ entityId: e.id, resource: w.carry.resource, amount: 1 });
        }
      }
      if (!w.carry || w.carry.amount <= 0) {
        w.carry = null;
        w.working = null;
        w.workTimer = 0;
        // Retour a la source si elle est encore la, sinon Garde.
        const back = w.nodeId !== null && work.nodes.has(w.nodeId) && (work.nodeAmounts.get(w.nodeId) ?? 1) > 0 && work.canHarvest(work.nodes.get(w.nodeId)!.resource);
        e.order = back ? { type: 'harvest', nodeId: w.nodeId! } : { type: 'guard' };
      }
      continue;
    }
    if (e.order.type !== 'harvest') continue;
    const node = work.nodes.get(e.order.nodeId)!;
    const kind = HARVEST_NODE_KINDS[node.resource];
    // Bois / pierre : charge pleine, ou autre ressource deja portee -> depot.
    if (!kind.currency && w.carry && w.carry.amount > 0 && (w.carry.resource !== node.resource || w.carry.amount >= w.capacity)) {
      if (!goDeposit(e, entities)) e.order = { type: 'guard' };
      w.working = null;
      w.workTimer = 0;
      continue;
    }
    const allowed = work.canHarvest(node.resource);
    w.working = kind.working;
    w.workTimer += dt;
    let lostTool = false;
    while (w.workTimer >= HARVEST_INTERVAL && (work.nodeAmounts.get(node.id) ?? 1) > 0) {
      w.workTimer -= HARVEST_INTERVAL;
      const left = work.nodeAmounts.get(node.id);
      if (left !== undefined) {
        work.nodeAmounts.set(node.id, left - 1);
        if (left - 1 <= 0) work.depleted.push(node.id);
      }
      if (kind.currency) work.goldMined.push({ entityId: e.id, nodeId: node.id, amount: 1 });
      else w.carry = { resource: node.resource as CarriedResource, amount: (w.carry?.amount ?? 0) + 1 };
      if (!allowed) {
        lostTool = true;
        break;
      }
      if (!kind.currency && w.carry!.amount >= w.capacity) break;
    }
    if (lostTool) {
      w.nodeId = null;
      if (!(w.carry && w.carry.amount > 0 && goDeposit(e, entities))) e.order = { type: 'guard' };
    } else if ((work.nodeAmounts.get(node.id) ?? 1) <= 0) {
      nextAfterSource(e, work, entities, node.id);
    } else if (!kind.currency && w.carry && w.carry.amount >= w.capacity) {
      if (!goDeposit(e, entities)) e.order = { type: 'guard' };
    } else continue;
    w.working = null;
    w.workTimer = 0;
  }
}

/** Source `nodeId` finie (epuisee, disparue, outil perdu) : la plus proche du
 *  meme type a WORKER_NEXT_NODE_RADIUS cases (outil disponible) ; sinon
 *  depot de la charge ; sinon Garde. */
function nextAfterSource(e: Entity, work: HeroWorkContext, entities: Entity[], nodeId: number | null): void {
  const w = e.worker!;
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
  w.nodeId = next;
  if (next !== null && !(w.carry && w.carry.amount >= w.capacity)) e.order = { type: 'harvest', nodeId: next };
  else if (!(w.carry && w.carry.amount > 0 && goDeposit(e, entities))) e.order = { type: 'guard' };
}

/** Ordre de depot vers le depot allie bati le plus proche ; faux sans depot. */
function goDeposit(e: Entity, entities: Entity[]): boolean {
  let best: Entity | null = null;
  let bestD = Infinity;
  for (const o of entities) {
    if (!o.alive || !o.isBuilding || o.construction || !areAllied(o.team, e.team) || !getBuilding(o.unitId).resourceDepot) continue;
    const d = Math.hypot(o.x - e.x, o.z - e.z);
    if (d < bestD) {
      bestD = d;
      best = o;
    }
  }
  if (!best) return false;
  e.order = { type: 'deposit', targetEntityId: best.id };
  return true;
}
