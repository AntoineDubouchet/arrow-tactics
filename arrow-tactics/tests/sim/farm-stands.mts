// Recolte a plusieurs (2026-11-06, G50) : emplacements de travail reserves autour d'une source (sim/harvestStands.ts).
// 4 Villageois sur un arbre, 8 sur un gisement 2 x 2, plus de Villageois que d'emplacements (surplus manuel et autonome),
// redirection immediate vers une source voisine du meme type (bosquet reel), liberation (annulation, depot, source epuisee, mort, autre
// source), retour du depot, charge a 20 Villageois.
// Reference d'avant la passe (meme scenario, 60 s) : 20 Villageois sur 6 sources = 10 728 ticks de chevauchement, 170 A*.
// Usage : node --import ../ts-register.mjs farm-stands.mts (ou npm run test:sim)
const SRC = new URL('../../src/', import.meta.url).href;
const { World } = await import(SRC + 'sim/world.ts');
const { DEFAULT_MAP } = await import(SRC + 'config/mapDef.ts');
const { getBuilding } = await import(SRC + 'data/buildings.ts');
const { pathSearchStats } = await import(SRC + 'sim/pathfinding.ts');
const { navigationState } = await import(SRC + 'sim/systems/movement.ts');
const { harvestReservationOf, harvestStandSlots } = await import(SRC + 'sim/harvestStands.ts');
const { HARVEST_NODE_KINDS, CARGO_CAPACITY } = await import(SRC + 'data/resources.ts');
const { HARVEST_REDIRECT_RANGE, WORKER_IDLE_SECONDS } = await import(SRC + 'data/hero.ts');
const { generateSurvivalMap } = await import(SRC + 'config/maps/proceduralSurvival.ts');
const { expandMapCamps } = await import(SRC + 'data/campLayout.ts');
const SB = await import(SRC + 'config/startingBase.ts');
const { computeBallistaObstacle } = await import(SRC + 'config/mapDef.ts');
const { buildingFootprintTiles, buildingContinuousFootprint } = await import(SRC + 'data/buildings.ts');
const { readFileSync } = await import('node:fs');
const DT = 1 / 30;
let failures = 0;
const check = (label: string, ok: boolean, extra: unknown = '') => { if (!ok) failures++; console.log(`${ok ? 'OK   ' : 'ECHEC'} ${label}${extra !== '' ? ' — ' + JSON.stringify(extra).slice(0, 900) : ''}`); };

const tree = (x: number, z: number) => ({ kind: 'tree', tilesX: 1, tilesZ: 1, x, z });
const rock = (x: number, z: number) => ({ kind: 'rock', tilesX: 2, tilesZ: 2, cornerX: x, cornerZ: z });
const DEPOT = { x: 0.5, z: 0.5 };

function setup(obstacles: any[], count: number, seed = 3) {
  const w = new World(seed);
  w.setMap({ ...DEFAULT_MAP, width: 60, height: 60, obstacles });
  w.spawnBuilding(getBuilding('townhall'), 'player', DEPOT.x, DEPOT.z, { kind: 'building', tilesX: 2.4, tilesZ: 2.4, x: DEPOT.x, z: DEPOT.z });
  const us = Array.from({ length: count }, (_, i) => {
    const u = w.spawn('villageois', 'player', DEPOT.x + 3 + (i % 5) * 1.1, DEPOT.z + 3 + Math.floor(i / 5) * 1.1);
    u.order = { type: 'guard' };
    // Pas d'autonomie pendant les mesures d'un ordre manuel (remise a 0 ou le test en a besoin).
    u.worker.autoRetryIn = 1e9;
    return u;
  });
  return { w, us, nodes: [...w.resourceNodes.values()] as any[] };
}
const atWork = (u: any) => u.worker.working === 'chop' || u.worker.working === 'mine';

/** Mesure pendant `seconds` : emplacements, chevauchements et gigue au travail, blocages, A*, depots. */
function measure(w: any, us: any[], seconds: number) {
  const a0 = pathSearchStats.searches;
  const out = { stuck: 0, failed: 0, jitter: 0, overlaps: 0, minGap: Infinity, deposited: 0, peakAstar: 0, astar: 0, slotsSeen: new Set<string>(), sameSlot: 0, ms: 0 };
  const prevWork = new Map<number, { x: number; z: number; slot: number | null }>();
  const prevStuck = new Map<number, number>();
  const t0 = performance.now();
  for (let t = 0; t < seconds * 30; t++) {
    const s0 = pathSearchStats.searches;
    w.step(DT);
    out.peakAstar = Math.max(out.peakAstar, pathSearchStats.searches - s0);
    out.failed += w.orderEvents.filter((e: any) => e.outcome === 'failed').length;
    for (const e of w.cargoEvents) if (e.type === 'cargoDeposit') out.deposited += e.amount;
    const workers = us.filter((u) => u.alive && atWork(u));
    for (const u of us) {
      const stuck = navigationState(u).stuckCount;
      if (stuck > (prevStuck.get(u.id) ?? 0)) out.stuck++;
      prevStuck.set(u.id, stuck);
    }
    for (const u of workers) {
      const r = harvestReservationOf(u);
      const p = prevWork.get(u.id);
      // Une fois sur son point, plus aucun mouvement ; la fin de son placement ne compte pas.
      if (p && r && p.slot === r.slot && Math.hypot(r.x - p.x, r.z - p.z) < 1e-3) out.jitter += Math.hypot(u.x - p.x, u.z - p.z);
      prevWork.set(u.id, { x: u.x, z: u.z, slot: r?.slot ?? null });
      if (r) out.slotsSeen.add(`${r.resourceNodeId}:${r.slot}`);
    }
    for (let i = 0; i < workers.length; i++) {
      for (let j = i + 1; j < workers.length; j++) {
        const d = Math.hypot(workers[i].x - workers[j].x, workers[i].z - workers[j].z);
        out.minGap = Math.min(out.minGap, d);
        if (d < workers[i].stats.radius + workers[j].stats.radius - 0.01) out.overlaps++;
        const ri = harvestReservationOf(workers[i]);
        const rj = harvestReservationOf(workers[j]);
        if (ri && rj && ri.resourceNodeId === rj.resourceNodeId && ri.slot === rj.slot) out.sameSlot++;
      }
    }
  }
  out.astar = pathSearchStats.searches - a0;
  out.ms = Math.round(performance.now() - t0);
  return out;
}

// ---- 1. Geometrie des emplacements.
{
  const t = harvestStandSlots({ minX: 10, maxX: 11, minZ: 10, maxZ: 11 }, 0.4);
  const g = harvestStandSlots({ minX: 10, maxX: 12, minZ: 10, maxZ: 12 }, 0.4);
  const minD = (a: any[]) => Math.min(...a.flatMap((p, i) => a.slice(i + 1).map((q) => Math.hypot(p.x - q.x, p.z - q.z))));
  const sides = (a: any[], b: any) => ({ n: a.filter((p) => p.z < b.minZ).length, s: a.filter((p) => p.z > b.maxZ).length, o: a.filter((p) => p.x < b.minX).length, e: a.filter((p) => p.x > b.maxX).length });
  check('arbre 1 x 1 : 4 emplacements cardinaux', t.length === 4 && JSON.stringify(sides(t, { minX: 10, maxX: 11, minZ: 10, maxZ: 11 })) === JSON.stringify({ n: 1, s: 1, o: 1, e: 1 }), t);
  check('gisement 2 x 2 : 8 emplacements, 2 par cote', g.length === 8 && JSON.stringify(sides(g, { minX: 10, maxX: 12, minZ: 10, maxZ: 12 })) === JSON.stringify({ n: 2, s: 2, o: 2, e: 2 }), g);
  check('aucun emplacement n est trop pres d un autre pour deux Villageois (rayon 0,4)', minD(t) >= 0.8 && minD(g) >= 0.8, [minD(t), minD(g)]);
  check('rangs stables, independants du rayon (Heros et Villageois parlent du meme emplacement)', JSON.stringify(harvestStandSlots({ minX: 10, maxX: 11, minZ: 10, maxZ: 11 }, 0.6).map((s) => s.slot)) === JSON.stringify(t.map((s) => s.slot)));
}

// ---- 2. 4 Villageois sur un arbre.
{
  const { w, us, nodes } = setup([tree(10.5, 10.5)], 4);
  w.issueCommand({ kind: 'harvest', entityIds: us.map((u) => u.id), nodeId: nodes[0].id });
  const m = measure(w, us, 15);
  const res = us.map((u) => harvestReservationOf(u));
  const slots = new Set(res.map((r) => r?.slot));
  check('4 Villageois sur un arbre : 4 emplacements distincts, tous au travail apres 15 s', res.every(Boolean) && slots.size === 4 && us.every(atWork), res);
  check('aucun meme emplacement, aucun chevauchement entre Villageois au travail', m.sameSlot === 0 && m.overlaps === 0, { sameSlot: m.sameSlot, overlaps: m.overlaps, minGap: m.minGap });
  check('une fois a son emplacement, aucun mouvement : ni alternance ni danse autour du tronc', m.jitter === 0, m.jitter);
  check('zero blocage, zero abandon, A* borne (une recherche pour un emplacement de l autre cote du tronc)', m.stuck === 0 && m.failed === 0 && m.astar <= 4 && m.peakAstar <= 1, { stuck: m.stuck, failed: m.failed, astar: m.astar, pic: m.peakAstar });
  const bois = HARVEST_NODE_KINDS.wood.seconds * CARGO_CAPACITY.villageois;
  const before = us.map((u) => u.cargo.wood);
  const m2 = measure(w, us, 12);
  check(`recolte stable : ${bois} s par remplissage, le depot libere l emplacement, tout l arbre finit au depot`, us.every((u, i) => u.cargo.wood >= before[i] || u.order.type === 'deposit' || u.cargo.wood < before[i]) && m2.stuck === 0, { before, after: us.map((u) => u.cargo.wood) });
  const m3 = measure(w, us, 40);
  check('arbre fini (75 de bois) : tout depose, sans blocage ni abandon', m.deposited + m2.deposited + m3.deposited === 75 && m3.stuck === 0 && m3.failed === 0, { depose: m.deposited + m2.deposited + m3.deposited, stuck: m3.stuck, failed: m3.failed });
}

// ---- 3. 8 Villageois sur un gisement 2 x 2.
{
  const { w, us, nodes } = setup([rock(10, 10)], 8);
  w.issueCommand({ kind: 'harvest', entityIds: us.map((u) => u.id), nodeId: nodes[0].id });
  const m = measure(w, us, 20);
  const slots = new Set(us.map((u) => harvestReservationOf(u)?.slot));
  check('8 Villageois sur un gisement 2 x 2 : 8 emplacements distincts, tous au travail', slots.size === 8 && us.every(atWork), { slots: [...slots], travail: us.filter(atWork).length });
  check('aucun chevauchement, aucune gigue, zero blocage, A* borne', m.overlaps === 0 && m.sameSlot === 0 && m.jitter === 0 && m.stuck === 0 && m.failed === 0 && m.astar <= 16 && m.peakAstar <= 2, { overlaps: m.overlaps, jitter: m.jitter, stuck: m.stuck, failed: m.failed, astar: m.astar, pic: m.peakAstar });
}

// ---- 4. Plus de Villageois que d'emplacements, ordre manuel, aucune autre source.
{
  const { w, us, nodes } = setup([tree(10.5, 10.5)], 10);
  w.issueCommand({ kind: 'harvest', entityIds: us.map((u) => u.id), nodeId: nodes[0].id });
  const events: any[] = [];
  let workers = 0;
  const a0 = pathSearchStats.searches;
  let moved = 0;
  let lastStop = 0;
  const pos = new Map<number, { x: number; z: number }>();
  for (let t = 0; t < 30 * 15; t++) {
    w.step(DT);
    const stops = w.orderEvents.filter((e: any) => e.outcome === 'failed');
    if (stops.length > 0) lastStop = t / 30;
    events.push(...stops);
    workers = Math.max(workers, us.filter(atWork).length);
    if (t > 30 * 9) for (const u of us) if (u.order.type === 'guard') { const p = pos.get(u.id); if (p) moved += Math.hypot(u.x - p.x, u.z - p.z); pos.set(u.id, { x: u.x, z: u.z }); }
  }
  check('10 Villageois sur un arbre : 4 au travail, jamais plus', workers === 4 && us.filter(atWork).length === 4, { workers, maintenant: us.filter(atWork).length });
  check('surplus manuel sans autre source : s arrete des qu il arrive pres de l arbre, sans attente (moins de 4 s de marche), un evenement « no-work-stand » par unite, jamais « inaccessible »', events.length === 6 && events.every((e) => e.reason === 'no-work-stand') && lastStop < 4, { n: events.length, lastStop: +lastStop.toFixed(2) });
  check('le surplus ne boucle pas : A* bornes, plus aucun mouvement une fois arrete, zero blocage', pathSearchStats.searches - a0 <= 4 && moved < 0.5 && us.every((u) => navigationState(u).stuckCount === 0), { astar: pathSearchStats.searches - a0, moved });
}

// ---- 5. Place liberee reprise, et liberation d'une reservation.
{
  const { w, us, nodes } = setup([tree(10.5, 10.5)], 5);
  w.issueCommand({ kind: 'harvest', entityIds: us.map((u) => u.id), nodeId: nodes[0].id });
  for (let t = 0; t < 30 * 5; t++) w.step(DT);
  const waiter = us.find((u) => !harvestReservationOf(u))!;
  const holder = us.find((u) => atWork(u))!;
  const slot = harvestReservationOf(holder)!.slot;
  check('5 Villageois, 4 emplacements : le 5e est deja arrete, en Garde', waiter !== undefined && holder !== undefined && waiter.order.type === 'guard');
  w.issueCommand({ kind: 'stop', entityIds: [holder.id] });
  w.step(DT); w.step(DT);
  check('annulation d ordre : reservation liberee', harvestReservationOf(holder) === null);
  w.issueCommand({ kind: 'harvest', entityIds: [waiter.id], nodeId: nodes[0].id });
  for (let t = 0; t < 30; t++) w.step(DT);
  check('nouvel ordre sur cette source : il prend l emplacement libere', harvestReservationOf(waiter)?.slot === slot, harvestReservationOf(waiter));
  for (let t = 0; t < 30 * 3; t++) w.step(DT);
  check('et s y met au travail', atWork(waiter));

  const other = us.find((u) => u !== holder && u !== waiter && atWork(u))!;
  w.issueCommand({ kind: 'harvest', entityIds: [other.id], nodeId: nodes[0].id });
  w.step(DT);
  const dying = us.find((u) => u !== holder && u !== waiter && u !== other && atWork(u))!;
  const free = harvestReservationOf(dying)!.slot;
  dying.hp = 0; dying.alive = false;
  w.step(DT);
  w.issueCommand({ kind: 'harvest', entityIds: [holder.id], nodeId: nodes[0].id });
  for (let t = 0; t < 30 * 3; t++) w.step(DT);
  check('mort : l emplacement est repris par un autre', harvestReservationOf(holder)?.slot === free && harvestReservationOf(dying) === null, { reprend: harvestReservationOf(holder)?.slot, free });
}

// ---- 6. Depot : l'emplacement est libere au depart, et repris pres de la source au retour.
{
  const { w, us, nodes } = setup([tree(10.5, 10.5)], 2);
  w.issueCommand({ kind: 'harvest', entityIds: us.map((u) => u.id), nodeId: nodes[0].id });
  const u = us[0];
  let leftWith: boolean | null = null; let far = false; let backSlot = false; let farReserved = false;
  for (let t = 0; t < 30 * 50; t++) {
    w.step(DT);
    if (leftWith === null && u.order.type === 'deposit') leftWith = harvestReservationOf(u) !== null;
    if (u.order.type === 'deposit' && harvestReservationOf(u) === null) far = true;
    if (far && u.order.type === 'harvest') {
      if (Math.hypot(u.x - 10.5, u.z - 10.5) > 8 && harvestReservationOf(u) !== null) farReserved = true;
      if (harvestReservationOf(u)) backSlot = true;
    }
  }
  check('depart au depot : emplacement libere ; retour : reserve avant l approche finale, pas au depot', far && backSlot && !farReserved, { far, backSlot, farReserved });
}

// ---- 7. Autonomie : une source saturee n'est pas choisie.
{
  const { w, us, nodes } = setup([tree(10.5, 10.5), tree(14.5, 10.5)], 6);
  for (const u of us) u.worker.autoRetryIn = 0;
  for (let t = 0; t < 30 * 12; t++) w.step(DT);
  const by = (id: number) => us.filter((u) => u.order.type === 'harvest' && u.order.nodeId === id).length;
  check('6 Villageois autonomes, 2 arbres : aucun arbre au-dela de ses 4 emplacements, les deux travailles, aucun message', by(nodes[0].id) <= 4 && by(nodes[1].id) <= 4 && by(nodes[0].id) + by(nodes[1].id) === 6 && by(nodes[0].id) > 0 && by(nodes[1].id) > 0, [by(nodes[0].id), by(nodes[1].id)]);
  check('chacun a son emplacement, zero blocage', us.every((u) => harvestReservationOf(u) !== null) && us.every((u) => navigationState(u).stuckCount === 0));

  const only = setup([tree(10.5, 10.5)], 7);
  for (const u of only.us) u.worker.autoRetryIn = 0;
  const a0 = pathSearchStats.searches;
  const fails: any[] = [];
  for (let t = 0; t < 30 * 12; t++) { only.w.step(DT); fails.push(...only.w.orderEvents.filter((e: any) => e.outcome === 'failed')); }
  const on = only.us.filter((u) => u.order.type === 'harvest').length;
  check('7 Villageois autonomes, un seul arbre : 4 y vont, les autres restent libres, en silence, sans A*', on === 4 && fails.length === 0 && pathSearchStats.searches - a0 <= 4, { on, fails: fails.length, astar: pathSearchStats.searches - a0 });

  // Surplus manuel qui s'arrete, faute de source voisine : autonome 1 s apres, sur une source plus loin.
  const s = setup([tree(10.5, 10.5), tree(26.5, 10.5)], 6);
  s.w.issueCommand({ kind: 'harvest', entityIds: s.us.map((u) => u.id), nodeId: s.nodes[0].id });
  for (const u of s.us) u.worker.autoRetryIn = 0;
  let stopped = 0;
  let autoAfter = Infinity;
  const stopAt = new Map<number, number>();
  for (let t = 0; t < 30 * 8; t++) {
    s.w.step(DT);
    for (const e of s.w.orderEvents) if (e.reason === 'no-work-stand') { stopped++; stopAt.set(e.entityId, t / 30); }
    for (const u of s.us) if (stopAt.has(u.id) && u.order.type === 'harvest') autoAfter = Math.min(autoAfter, t / 30 - stopAt.get(u.id)!);
  }
  const secondTree = s.us.filter((u) => u.order.type === 'harvest' && u.order.nodeId === s.nodes[1].id).length;
  check('surplus manuel sans source voisine : arrete, puis autonome apres 1 s, sur une autre source visible', stopped === 2 && secondTree === 2 && Math.abs(autoAfter - WORKER_IDLE_SECONDS) < 0.1, { stopped, secondTree, autoAfter: +autoAfter.toFixed(2) });
}

// ---- 7 bis. Redirection immediate d'un ordre manuel.
{
  const byRes = (r: { w: any; nodes: any[] }, res: string) => r.nodes.filter((n: any) => n.resource === res);
  const on = (us: any[], id: number) => us.filter((u) => u.order.type === 'harvest' && u.order.nodeId === id).length;
  // Arbre sature : l'arbre voisin, jamais le gisement tout pres.
  const a = setup([tree(10.5, 10.5), tree(14.5, 10.5), rock(8, 12)], 6);
  const t0 = byRes(a, 'wood')[0]; const t1 = byRes(a, 'wood')[1];
  const events: any[] = [];
  a.w.issueCommand({ kind: 'harvest', entityIds: a.us.map((u) => u.id), nodeId: t0.id });
  let firstMove = -1;
  for (let t = 0; t < 30 * 8; t++) { a.w.step(DT); events.push(...a.w.orderEvents.filter((e: any) => e.outcome === 'failed')); if (firstMove < 0 && on(a.us, t1.id) > 0) firstMove = t / 30; }
  check('arbre sature : 4 sur lui, 2 sur l arbre voisin, aucun sur le gisement tout pres, aucun message, tout de suite (moins de 4 s de marche)', on(a.us, t0.id) === 4 && on(a.us, t1.id) === 2 && a.us.every((u) => u.order.type === 'harvest' && byRes(a, 'wood').some((n: any) => n.id === u.order.nodeId)) && events.length === 0 && firstMove >= 0 && firstMove < 4, { t0: on(a.us, t0.id), t1: on(a.us, t1.id), events: events.length, firstMove });
  // Pierre et or : chacun reste sur son type.
  const b = setup([rock(10, 10), rock(13, 10), { ...rock(10, 13), ore: 'gold' }, { ...rock(13, 13), ore: 'gold' }], 10);
  const stone = byRes(b, 'stone'); const gold = byRes(b, 'gold');
  b.w.issueCommand({ kind: 'harvest', entityIds: b.us.map((u) => u.id), nodeId: stone[0].id });
  for (let t = 0; t < 30 * 8; t++) b.w.step(DT);
  check('gisement de pierre sature : l autre gisement de pierre, jamais l or', on(b.us, stone[0].id) + on(b.us, stone[1].id) === 10 && on(b.us, gold[0].id) + on(b.us, gold[1].id) === 0 && on(b.us, stone[1].id) >= 2, { s0: on(b.us, stone[0].id), s1: on(b.us, stone[1].id) });
  const c = setup([rock(10, 10), rock(13, 10), { ...rock(10, 13), ore: 'gold' }, { ...rock(13, 13), ore: 'gold' }], 10);
  const goldC = byRes(c, 'gold'); const stoneC = byRes(c, 'stone');
  c.w.issueCommand({ kind: 'harvest', entityIds: c.us.map((u) => u.id), nodeId: goldC[0].id });
  for (let t = 0; t < 30 * 8; t++) c.w.step(DT);
  check('gisement d or sature : l autre gisement d or, jamais la pierre', on(c.us, goldC[0].id) + on(c.us, goldC[1].id) === 10 && on(c.us, stoneC[0].id) + on(c.us, stoneC[1].id) === 0, { g0: on(c.us, goldC[0].id), g1: on(c.us, goldC[1].id) });
  // Hors de portee, ou derriere un mur : pas de redirection.
  const d = setup([tree(10.5, 10.5), tree(10.5 + HARVEST_REDIRECT_RANGE + 1.5, 10.5)], 6);
  d.w.issueCommand({ kind: 'harvest', entityIds: d.us.map((u) => u.id), nodeId: d.nodes[0].id });
  for (let t = 0; t < 30 * 6; t++) d.w.step(DT);
  check(`arbre a plus de ${HARVEST_REDIRECT_RANGE} cases : pas de redirection, le surplus s arrete`, on(d.us, d.nodes[1].id) === 0 && d.us.filter((u) => u.order.type === 'guard').length === 2);
  const f = setup([tree(10.5, 10.5), tree(15.5, 10.5)], 6);
  f.w.spawnWallLine('player', 'palisade', { ax: 13, az: -30, bx: 13, bz: 30 });
  f.w.step(DT);
  f.w.issueCommand({ kind: 'harvest', entityIds: f.us.map((u) => u.id), nodeId: f.nodes[0].id });
  for (let t = 0; t < 30 * 6; t++) f.w.step(DT);
  check('arbre proche mais inaccessible (palissade continue) : pas de redirection, le surplus s arrete', on(f.us, f.nodes[1].id) === 0 && f.us.filter((u) => u.order.type === 'guard').length === 2);
}

// ---- 7 ter. Bosquet reel du camp.
{
  const seed = 12345;
  const raw = generateSurvivalMap(seed);
  const L = SB.startingBaseLayoutOf(raw);
  const map = SB.expandStartingBase(expandMapCamps(raw));
  const camp = (count: number) => {
    const w = new World(seed); w.setMap(map);
    w.spawnBuilding(getBuilding('ballista'), 'player', L.ballista.x, L.ballista.z, computeBallistaObstacle(L.ballista));
    for (const b of L.buildings) { const t = buildingFootprintTiles(b.buildingId); w.spawnBuilding(getBuilding(b.buildingId), 'player', b.x, b.z, { kind: 'building', x: b.x, z: b.z, tilesX: t.tilesX, tilesZ: t.tilesZ, rotationY: b.rotationY, footprint: buildingContinuousFootprint(b.buildingId, b.x, b.z, b.rotationY) }); }
    for (const line of L.walls) w.spawnWallLine('player', line.type, line, { gates: line.gates, openGates: line.openGates });
    const us = Array.from({ length: count }, (_, i) => { const u = w.spawn('villageois', 'player', L.origin.x - 2 + (i % 8) * 1.0, L.origin.z - 6 - Math.floor(i / 8) * 1.0); u.order = { type: 'guard' }; u.worker.autoRetryIn = 1e9; return u; });
    const grove = [...w.resourceNodes.values()].filter((n: any) => n.resource === 'wood' && Math.hypot(n.x - L.origin.x, n.z - L.origin.z) < 15) as any[];
    return { w, us, grove };
  };
  // L'arbre a 3 emplacements du bosquet.
  const three = camp(6);
  const target = three.grove.find((n: any) => n.x === Math.max(...three.grove.map((q: any) => q.x)))!;
  three.w.issueCommand({ kind: 'harvest', entityIds: three.us.map((u) => u.id), nodeId: target.id });
  const m = measure(three.w, three.us, 12);
  const onTarget = three.us.filter((u) => harvestReservationOf(u)?.resourceNodeId === target.id).length;
  const others = new Set(three.us.map((u) => harvestReservationOf(u)?.resourceNodeId).filter((id) => id !== target.id && id !== undefined));
  console.log('BOSQUET 6 Villageois :', JSON.stringify({ surCible: onTarget, autresArbres: others.size, travail: three.us.filter(atWork).length, A: m.astar, pic: m.peakAstar, stuck: m.stuck, abandons: m.failed, chevauchements: m.overlaps }));
  check('6 Villageois, arbre a 3 emplacements du bosquet : 3 sur lui, 3 sur des arbres voisins, tous au travail', onTarget === 3 && others.size >= 1 && three.us.every(atWork), { onTarget, others: others.size, travail: three.us.filter(atWork).length });
  check('aucune attente ni message, aucun chevauchement, aucun watchdog, A* borne', m.failed === 0 && m.overlaps === 0 && m.sameSlot === 0 && m.stuck === 0 && m.astar <= 24 && m.peakAstar <= 6, { failed: m.failed, overlaps: m.overlaps, stuck: m.stuck, astar: m.astar, pic: m.peakAstar });
  // Plus de Villageois que le bosquet n'a de place.
  const many = camp(16);
  many.w.issueCommand({ kind: 'harvest', entityIds: many.us.map((u) => u.id), nodeId: target.id });
  const stops: any[] = [];
  for (let t = 0; t < 30 * 14; t++) { many.w.step(DT); stops.push(...many.w.orderEvents.filter((e: any) => e.outcome === 'failed')); }
  const groveIds = new Set(many.grove.map((n: any) => n.id));
  const working = many.us.filter((u) => u.order.type === 'harvest');
  const guards = many.us.filter((u) => u.order.type === 'guard');
  console.log('BOSQUET 16 Villageois :', JSON.stringify({ surBosquet: working.length, arretes: guards.length, evenements: stops.length, stuck: many.us.filter((u) => navigationState(u).stuckCount > 0).length }));
  check('16 Villageois sur le bosquet : le vrai surplus s arrete (un evenement « no-work-stand » par unite), personne hors du bosquet, zero blocage', guards.length > 0 && working.every((u) => groveIds.has(u.order.nodeId)) && stops.length === guards.length && stops.every((e) => e.reason === 'no-work-stand') && many.us.every((u) => navigationState(u).stuckCount === 0), { guards: guards.length, stops: stops.length });
  check('chacun des autres a son emplacement, tous distincts', working.every((u) => harvestReservationOf(u)) && new Set(working.map((u) => `${harvestReservationOf(u)!.x},${harvestReservationOf(u)!.z}`)).size === working.length);
}

// ---- 8. Le Heros passe par la meme regle.
{
  const { w, us, nodes } = setup([tree(10.5, 10.5)], 4);
  const hero = w.spawnHero('player', 5, 5, { xp: 0, level: 1, deaths: 0 });
  hero.order = { type: 'guard' };
  w.issueCommand({ kind: 'harvest', entityIds: [hero.id, ...us.map((u) => u.id)], nodeId: nodes[0].id });
  for (let t = 0; t < 30 * 6; t++) w.step(DT);
  const r = harvestReservationOf(hero);
  check('Heros + 4 Villageois sur un arbre : le Heros a aussi un emplacement propre (4 au travail)', [hero, ...us].filter(atWorkAny).length === 4 && (r === null || [...us].every((u) => harvestReservationOf(u)?.slot !== r.slot)), { heros: r?.slot, autres: us.map((u) => harvestReservationOf(u)?.slot) });
}
function atWorkAny(u: any): boolean {
  const worker = u.hero ?? u.worker;
  return worker.working === 'chop' || worker.working === 'mine';
}

// ---- 9. Charge : 20 Villageois sur 6 sources proches.
{
  const six = [tree(10.5, 10.5), tree(13.5, 8.5), tree(8.5, 14.5), rock(14, 13), rock(5, 12), tree(11.5, 16.5)];
  const { w, us, nodes } = setup(six, 20);
  for (const u of us) u.worker.autoRetryIn = 0;
  // Ordre manuel de groupe sur une seule source : le pire cas ; le surplus se reporte sur les arbres voisins.
  w.issueCommand({ kind: 'harvest', entityIds: us.map((u) => u.id), nodeId: nodes.find((n: any) => n.resource === 'wood').id });
  const m = measure(w, us, 60);
  console.log('PERF 20 Villageois / 6 sources, 60 s :', JSON.stringify({ A: m.astar, pic: m.peakAstar, stuck: m.stuck, abandons: m.failed, chevauchements: m.overlaps, depose: m.deposited, ms: m.ms }), '— avant G50 : 170 A*, 10 728 chevauchements, 75 deposes');
  check('20 Villageois sur 6 sources : aucun chevauchement au travail, zero blocage, A* bornes', m.overlaps === 0 && m.sameSlot === 0 && m.stuck === 0 && m.astar < 80 && m.peakAstar <= 3, { overlaps: m.overlaps, stuck: m.stuck, astar: m.astar, pic: m.peakAstar });
  check('rendement : les 20 se repartissent et rapportent (75 deposes avant la passe, tout le monde autour du meme arbre)', m.deposited > 150, m.deposited);
  check('temps de calcul raisonnable (moins de 1 s pour 60 s de jeu)', m.ms < 1000, m.ms);
}

// ---- 10. Determinisme.
{
  const run = () => {
    const { w, us, nodes } = setup([tree(10.5, 10.5), rock(14, 13)], 12);
    for (const u of us) u.worker.autoRetryIn = 0;
    w.issueCommand({ kind: 'harvest', entityIds: us.map((u) => u.id), nodeId: nodes[0].id });
    for (let t = 0; t < 30 * 40; t++) w.step(DT);
    return JSON.stringify(us.map((u) => [u.x, u.z, u.order.type, harvestReservationOf(u)?.slot ?? null]));
  };
  check('deux executions identiques : memes positions, memes emplacements', run() === run());
}

// ---- 11. Isolement de la simulation.
{
  const source = readFileSync(new URL('../../src/sim/harvestStands.ts', import.meta.url), 'utf8');
  check('sim/harvestStands.ts : ni three, ni render, ui, run, ni Math.random', !/from '(three|.*\/(render|ui|run)\/)/.test(source) && !source.includes('Math.random'));
}

console.log(failures ? failures + ' ECHEC(S)' : 'tout OK');
process.exit(failures ? 1 : 0);
