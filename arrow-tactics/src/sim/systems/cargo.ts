import { getBuilding } from '../../data/buildings';
import { HERO_HARVEST_FACTOR, PICKUP_SECONDS } from '../../data/hero';
import { cargoResourceOf, cargoRoom, cargoTotal, CARGO_RESOURCES, HARVEST_NODE_KINDS, type CargoResource } from '../../data/resources';
import type { CargoState, Entity } from '../entity';

/** Tache a reprendre apres un depot automatique. */
export type CargoReturnTo = CargoState['returnTo'];
import { areAllied } from '../relations';
import type { HeroWorkContext } from './hero';

/**
 * Cargo economique (2026-11-03, demande d'Antoine) : Heros et Villageois
 * TRANSPORTENT bois, pierre et or extrait d'un gisement (`minedGold`) dans un
 * sac separe de l'inventaire RPG (Entity.cargo), jusqu'a un point de
 * collecte (BuildingDef.dropOff : Baliste pour tout, Scierie pour le bois,
 * Camp de mineur pour la pierre et l'or extrait ; aucune regle par id de
 * batiment ici). Le stock de la run ne monte qu'au depot (evenement
 * `cargoDeposit`). L'or de butin au sol (monstres, coffres, barils) n'y
 * passe jamais : monnaie directe, ramasse par le Heros au contact
 * (sim/systems/hero.ts, evenement `lootGold`), jamais par un Villageois.
 *
 * Boucle (meme regle pour les deux unites) :
 *  - `harvest` au contact : une unite toutes les HARVEST_NODE_KINDS[r].seconds
 *    (x HERO_HARVEST_FACTOR pour le Heros) dans le
 *    cargo ; plein -> depot automatique au point allie le plus proche qui
 *    accepte la ressource la plus portee (a defaut, la suivante), puis
 *    retour a la source (`cargo.returnTo`) ;
 *  - `pickup` d'un tas de bois / pierre : PICKUP_SECONDS, puis autant que
 *    le cargo peut prendre ; le reste attend au sol, depot, retour au tas ;
 *  - `deposit` : transfert INSTANTANE au contact (2026-11-04, plus de
 *    temporisation par unite), seules les ressources acceptees par CE
 *    point, le reste demeure dans le cargo ;
 *    depot automatique (`cargo.auto`) : enchaine sur le prochain point qui
 *    accepte ce qui reste, jusqu'a cargo vide ou aucun point ; puis retour
 *    a la tache memorisee, sinon Garde ; depot manuel : ce point seulement ;
 *  - source epuisee : depot si le cargo n'est pas vide, puis (Villageois)
 *    source voisine du meme type, sinon Garde ;
 *  - outil perdu : l'unite en cours est finie, depot, Garde ;
 *  - aucun point de collecte : l'unite garde son cargo, s'arrete pleine,
 *    rien n'est perdu ; mort : cargo perdu (PROVISOIRE).
 * Tout ordre manuel oublie la tache a reprendre (`returnTo`).
 */
export type CargoEvent =
  | { type: 'cargoDeposit'; entityId: number; resource: CargoResource; amount: number; remaining: number }
  /** Or de butin ramasse au sol : monnaie directe. */
  | { type: 'lootGold'; entityId: number; pileId: number; amount: number }
  /** Tas de bois / pierre : part prise dans le cargo, reste au sol. */
  | { type: 'pilePickup'; entityId: number; pileId: number; resource: CargoResource; amount: number; remaining: number }
  /** Depot automatique impossible (cargo plein, source finie, point perdu
   *  en chemin) : aucun point de collecte valide pour ce que porte l'unite. */
  | { type: 'cargoFullNoDropOff'; entityId: number }
  /** Cargo perdu a la mort (PROVISOIRE : pas de sac au sol). */
  | { type: 'cargoLost'; entityId: number; wood: number; stone: number; minedGold: number };

/** Rayon (cases) de recherche d'une source du meme type quand la sienne est
 *  epuisee (Villageois, PROVISOIRE). */
export const WORKER_NEXT_NODE_RADIUS = 6;

type Worker = { working: 'chop' | 'mine' | 'gather' | 'deposit' | 'build' | null; workTimer: number };

function workerOf(e: Entity): Worker | null {
  return e.hero ?? e.worker;
}

/** Point de collecte allie, bati, vivant, qui accepte `resource`, le plus
 *  proche de `e` ; null sans. Deterministe (ordre des entites). */
export function nearestDropOff(e: Entity, entities: readonly Entity[], resource: CargoResource): Entity | null {
  let best: Entity | null = null;
  let bestD = Infinity;
  for (const o of entities) {
    if (!o.alive || !o.isBuilding || o.construction || !areAllied(o.team, e.team)) continue;
    const accepted = getBuilding(o.unitId).dropOff;
    if (!accepted || !accepted.includes(resource)) continue;
    const d = Math.hypot(o.x - e.x, o.z - e.z);
    if (d < bestD) {
      bestD = d;
      best = o;
    }
  }
  return best;
}

/** Ressources acceptees par le point de collecte `site` (vide : aucun). */
export function dropOffAccepts(site: Entity): readonly CargoResource[] {
  return site.isBuilding && !site.construction ? getBuilding(site.unitId).dropOff ?? [] : [];
}

/** Ressources portees, de la plus a la moins portee (tri stable sur
 *  CARGO_RESOURCES : deterministe). */
function carriedResources(c: CargoState): CargoResource[] {
  return CARGO_RESOURCES.filter((r) => c[r] > 0).sort((a, b) => c[b] - c[a]);
}

/** Part en depot (point allie le plus proche acceptant la ressource la plus
 *  portee ; a defaut la suivante), en memorisant `returnTo` ; faux sans
 *  aucun point. `auto` : depot de la boucle (chainage ensuite) ; `reroute` :
 *  point perdu en chemin, mode inchange ; `chain` : suite d'un depot
 *  partiel, silencieux sans point. */
function goDeposit(e: Entity, entities: readonly Entity[], returnTo: CargoReturnTo, events: CargoEvent[], mode: 'auto' | 'reroute' | 'chain' = 'auto'): boolean {
  const c = e.cargo!;
  let site: Entity | null = null;
  for (const r of carriedResources(c)) {
    site = nearestDropOff(e, entities, r);
    if (site) break;
  }
  if (!site) {
    if (mode !== 'chain') events.push({ type: 'cargoFullNoDropOff', entityId: e.id });
    return false;
  }
  if (mode === 'auto') c.auto = true;
  c.returnTo = returnTo;
  e.order = { type: 'deposit', targetEntityId: site.id };
  return true;
}

/** Tache memorisee encore valide ? -> ordre correspondant, sinon null. */
function resumeOrder(e: Entity, work: HeroWorkContext): Entity['order'] | null {
  const back = e.cargo!.returnTo;
  if (!back) return null;
  if (back.kind === 'node') {
    const node = work.nodes.get(back.nodeId);
    if (node && (work.nodeAmounts.get(node.id) ?? 1) > 0 && work.canHarvest(node.resource)) return { type: 'harvest', nodeId: node.id };
    return null;
  }
  const pile = work.piles[back.pileId];
  return pile && pile.amount > 0 && pile.resource !== 'gold' ? { type: 'pickup', pileId: pile.id } : null;
}

/** Source `nodeId` finie : la plus proche du meme type a
 *  WORKER_NEXT_NODE_RADIUS cases (Villageois seulement), sinon null. */
function nextNode(e: Entity, work: HeroWorkContext, nodeId: number): number | null {
  if (!e.worker) return null;
  const old = work.nodes.get(nodeId);
  if (!old || !work.canHarvest(old.resource)) return null;
  let next: number | null = null;
  let best = WORKER_NEXT_NODE_RADIUS;
  for (const n of work.nodes.values()) {
    if (n.id === old.id || n.resource !== old.resource || (work.nodeAmounts.get(n.id) ?? 1) <= 0) continue;
    const d = Math.hypot(n.x - old.x, n.z - old.z);
    if (d <= best) {
      best = d;
      next = n.id;
    }
  }
  return next;
}

/** Apres une source finie (epuisee, outil perdu) : depot si le cargo n'est
 *  pas vide (retour vers la source voisine du Villageois s'il y en a une),
 *  sinon source voisine, sinon Garde. */
function afterSource(e: Entity, work: HeroWorkContext, entities: readonly Entity[], nodeId: number, events: CargoEvent[], lostTool: boolean): void {
  const next = lostTool ? null : nextNode(e, work, nodeId);
  const returnTo = next !== null ? ({ kind: 'node', nodeId: next } as const) : null;
  if (cargoTotal(e.cargo!) > 0 && goDeposit(e, entities, returnTo, events)) return;
  e.cargo!.returnTo = null;
  e.cargo!.auto = false;
  e.order = next !== null ? { type: 'harvest', nodeId: next } : { type: 'guard' };
}

/** Le cargo est-il plein pour une unite supplementaire ? */
function cargoFull(e: Entity): boolean {
  return cargoRoom(e.cargo!) <= 0;
}

/**
 * Apres movementSystem, pour toute entite a cargo vivante. `goal` :
 * workGoal (sim/systems/hero.ts) deja evalue ; `reached` au contact.
 * Rend vrai si l'ordre a ete traite ici (recolte, tas, depot), faux pour
 * les autres ordres (construction, sort... : au systeme du Heros).
 */
export function cargoWork(e: Entity, goal: { reached: boolean; target: Entity | null } | null, work: HeroWorkContext, entities: readonly Entity[], dt: number, events: CargoEvent[]): boolean {
  const w = workerOf(e);
  const c = e.cargo;
  if (!w || !c) return false;
  const order = e.order;
  if (order.type !== 'harvest' && order.type !== 'pickup' && order.type !== 'deposit') {
    // Tout autre ordre (deplacement, Stop, attaque, chantier...) oublie la
    // tache a reprendre : la boucle est annulee, le cargo garde.
    c.returnTo = null;
    c.auto = false;
    return false;
  }
  // Ordre de travail sans but (source disparue, tas vide, depot perdu,
  // outil perdu en chemin).
  if (!goal) {
    if (order.type === 'harvest') afterSource(e, work, entities, order.nodeId, events, true);
    else if (order.type === 'deposit') {
      // Point de collecte disparu en chemin : le prochain point valide pour
      // ce qu'elle porte, sinon Garde (cargo garde).
      if (!goDeposit(e, entities, c.returnTo, events, 'reroute')) {
        c.returnTo = null;
        c.auto = false;
        e.order = { type: 'guard' };
      }
    } else {
      const resumed = resumeOrder(e, work);
      c.returnTo = null;
      e.order = resumed ?? { type: 'guard' };
      if (!resumed && cargoTotal(c) > 0 && order.type === 'pickup') e.order = { type: 'guard' };
    }
    w.working = null;
    w.workTimer = 0;
    return true;
  }
  if (!goal.reached || e.tauntSourceId !== null) {
    w.working = null;
    w.workTimer = 0;
    return true;
  }

  if (order.type === 'deposit') {
    const site = goal.target!;
    const accepted = dropOffAccepts(site);
    // Transfert instantane : au premier pas au contact, tout ce que le point
    // accepte passe au stock (un evenement par ressource), sans geste ni
    // attente ; le reste demeure dans le cargo.
    for (const r of CARGO_RESOURCES) {
      if (!accepted.includes(r) || c[r] <= 0) continue;
      const amount = c[r];
      c[r] = 0;
      events.push({ type: 'cargoDeposit', entityId: e.id, resource: r, amount, remaining: cargoTotal(c) });
    }
    {
      w.working = null;
      w.workTimer = 0;
      // Depot automatique partiel (point specialise, cargo mixte) : enchaine
      // sur le prochain point acceptant ce qui reste ; sinon (ou depot
      // manuel) le reste demeure dans le cargo.
      if (c.auto && cargoTotal(c) > 0 && goDeposit(e, entities, c.returnTo, events, 'chain')) return true;
      const resumed = resumeOrder(e, work);
      c.returnTo = null;
      c.auto = false;
      e.order = resumed ?? { type: 'guard' };
    }
    return true;
  }

  if (order.type === 'pickup') {
    const pile = work.piles[order.pileId]!;
    if (pile.resource === 'gold') {
      // Or de butin (2026-11-05) : ramasse par le Heros au CONTACT, sans
      // geste (sim/systems/hero.ts, avant ce travail) ; un Villageois ne le
      // ramasse jamais (sa boucle economique n'est pas detournee) : l'ordre
      // s'acheve ici, tas intact.
      e.order = { type: 'guard' };
      w.working = null;
      w.workTimer = 0;
      return true;
    }
    if (cargoFull(e)) {
      // Plein a l'arrivee : depot puis retour au tas.
      w.working = null;
      w.workTimer = 0;
      if (!goDeposit(e, entities, { kind: 'pile', pileId: pile.id }, events)) e.order = { type: 'guard' };
      return true;
    }
    w.working = 'gather';
    w.workTimer += dt;
    if (w.workTimer < PICKUP_SECONDS) return true;
    const resource: CargoResource = pile.resource;
    const taken = Math.min(pile.amount, cargoRoom(c));
    pile.amount -= taken;
    c[resource] += taken;
    events.push({ type: 'pilePickup', entityId: e.id, pileId: pile.id, resource, amount: taken, remaining: pile.amount });
    w.working = null;
    w.workTimer = 0;
    if (pile.amount > 0) {
      // Reste au sol : depot, puis retour au tas.
      if (!goDeposit(e, entities, { kind: 'pile', pileId: pile.id }, events)) e.order = { type: 'guard' };
    } else {
      c.returnTo = null;
      c.auto = false;
      e.order = { type: 'guard' };
    }
    return true;
  }

  // Recolte.
  const node = work.nodes.get(order.nodeId)!;
  const resource = cargoResourceOf(node.resource);
  if (cargoFull(e)) {
    w.working = null;
    w.workTimer = 0;
    if (!goDeposit(e, entities, { kind: 'node', nodeId: node.id }, events)) e.order = { type: 'guard' };
    return true;
  }
  const allowed = work.canHarvest(node.resource);
  w.working = HARVEST_NODE_KINDS[node.resource].working;
  w.workTimer += dt;
  let lostTool = false;
  const interval = HARVEST_NODE_KINDS[node.resource].seconds * (e.hero ? HERO_HARVEST_FACTOR : 1);
  while (w.workTimer >= interval && cargoRoom(c) > 0 && (work.nodeAmounts.get(node.id) ?? 1) > 0) {
    w.workTimer -= interval;
    const left = work.nodeAmounts.get(node.id);
    if (left !== undefined) {
      work.nodeAmounts.set(node.id, left - 1);
      if (left - 1 <= 0) work.depleted.push(node.id);
    }
    c[resource] += 1;
    if (!allowed) {
      lostTool = true;
      break;
    }
  }
  if (lostTool || (work.nodeAmounts.get(node.id) ?? 1) <= 0) {
    w.working = null;
    w.workTimer = 0;
    afterSource(e, work, entities, node.id, events, lostTool);
  } else if (cargoFull(e)) {
    w.working = null;
    w.workTimer = 0;
    if (!goDeposit(e, entities, { kind: 'node', nodeId: node.id }, events)) e.order = { type: 'guard' };
  }
  return true;
}

/** Mort d'une unite a cargo : ressources perdues (PROVISOIRE, pas de sac au
 *  sol) ; evenement si le cargo n'etait pas vide. */
export function loseCargoOnDeath(e: Entity, events: CargoEvent[]): void {
  const c = e.cargo;
  if (!c) return;
  if (cargoTotal(c) > 0) events.push({ type: 'cargoLost', entityId: e.id, wood: c.wood, stone: c.stone, minedGold: c.minedGold });
  c.wood = c.stone = c.minedGold = 0;
  c.returnTo = null;
  c.auto = false;
}
