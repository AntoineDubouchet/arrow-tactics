// Tests cibles SANS NAVIGATEUR du cargo economique (2026-11-03) : capacites (Heros 10, Villageois 5), bois / pierre /
// or de gisement transportes (stock inchange avant depot), plein -> depot automatique a la Baliste -> retour a la
// source, melange, depot manuel, tas (prise partielle, reste au sol, retour), or de butin (monnaie directe, jamais
// dans le cargo), Stop, ordre manuel pendant le trajet, source epuisee, outil perdu, aucun point de collecte,
// mort (cargo perdu, respawn vide), sac RPG inchange, determinisme.
// Usage : node --import ../ts-register.mjs cargo.mts (ou npm run test:sim)
const SRC = new URL('../../src/', import.meta.url).href;
const { World } = await import(SRC + 'sim/world.ts');
const { getBuilding } = await import(SRC + 'data/buildings.ts');
const { CARGO_CAPACITY, cargoTotal } = await import(SRC + 'data/resources.ts');
const { generateSurvivalMap } = await import(SRC + 'config/maps/proceduralSurvival.ts');
const DT = 1 / 30;
let failures = 0;
const check = (label: string, ok: boolean, extra: unknown = '') => { if (!ok) failures++; console.log(`${ok ? 'OK   ' : 'ECHEC'} ${label}${extra !== '' ? ' — ' + JSON.stringify(extra).slice(0, 900) : ''}`); };
// 2026-11-05 : hache et pioche de depart, l'or compris (plus de pioche de prospecteur).
const TOOLS = { tools: ['axe', 'pickaxe'] };
const map = generateSurvivalMap(12345);
const nearest = (w: any, resource: string) => [...w.resourceNodes.values()].filter((n: any) => n.resource === resource).sort((a: any, b: any) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z))[0];
const beside = (node: any) => ({ x: node.x + (node.block ? node.block.maxX - node.x + 0.6 : 1.2), z: node.z });

/** Monde : carte generee, Baliste au centre (point de collecte), unite (Heros ou Villageois) a cote de la source. */
function setup(unit: 'hero' | 'villageois', resource: 'wood' | 'stone' | 'gold', seed = 3, withDepot = true) {
  const w = new World(seed);
  w.setMap(map);
  const depot = withDepot ? w.spawnBuilding(getBuilding('ballista'), 'player', 0.5, 0.5) : null;
  const node = nearest(w, resource);
  const at = beside(node);
  const u = unit === 'hero' ? w.spawnHero('player', at.x, at.z, { xp: 0, level: 1, deaths: 0 }) : w.spawn('villageois', 'player', at.x, at.z);
  w.harvestPermissions = TOOLS;
  return { w, node, u, depot };
}
const cargo = (u: any) => ({ wood: u.cargo.wood, stone: u.cargo.stone, gold: u.cargo.minedGold, total: cargoTotal(u.cargo) });
/** Lance la recolte et suit la boucle jusqu'a `seconds` ; renvoie le journal des phases et les depots. */
function runLoop(w: any, u: any, nodeId: number, seconds: number) {
  w.issueCommand({ kind: 'harvest', entityIds: [u.id], nodeId });
  const phases: string[] = []; const deposits: Record<string, number> = { wood: 0, stone: 0, minedGold: 0 }; let maxCargo = 0; let loot = 0;
  for (let i = 0; i < Math.round(seconds * 30); i++) {
    w.step(DT);
    maxCargo = Math.max(maxCargo, cargoTotal(u.cargo));
    const ph = `${u.order.type}${u.order.type === 'harvest' ? ':' + u.order.nodeId : ''}`;
    if (phases[phases.length - 1] !== ph) phases.push(ph);
    for (const ev of w.cargoEvents) { if (ev.type === 'cargoDeposit' && ev.entityId === u.id) deposits[ev.resource] += ev.amount; if (ev.type === 'lootGold') loot += ev.amount; }
  }
  return { phases, deposits, maxCargo, loot };
}

check('donnees : capacites Heros 10, Villageois 10 (passe economie 2026-11-05 ; 5 avant) ; Baliste = point de collecte universel (bois, pierre, or extrait) ; Forge non ; Scierie et Camp de mineur specialises (voir collecte.mts)', CARGO_CAPACITY.hero === 10 && CARGO_CAPACITY.villageois === 10 && JSON.stringify(getBuilding('ballista').dropOff) === '["wood","stone","minedGold"]' && !getBuilding('forge').dropOff && getBuilding('sawmill').dropOff!.length === 1 && getBuilding('miner_camp').dropOff!.length === 2);

// 1. Heros : bois, plein a 10 -> depot -> retour ; pierre ; or de gisement (monnaie seulement au depot).
for (const [resource, key] of [['wood', 'wood'], ['stone', 'stone'], ['gold', 'minedGold']] as const) {
  const { w, node, u } = setup('hero', resource);
  const r = runLoop(w, u, node.id, resource === 'gold' ? 50 : 40); // Heros : 10 or a 3,75 s (G44)
  const bag = u.hero.inventory.slots.filter((s: any) => s && s.kind === 'resource').length;
  check(`Heros ${resource} : cargo jusqu a 10 (jamais plus), depot automatique a la Baliste (10 ${key} deposes), retour a la source, sac RPG vide`, r.maxCargo === 10 && r.deposits[key] >= 10 && r.phases.includes('deposit') && r.phases.indexOf('deposit') > 0 && r.phases.lastIndexOf(`harvest:${node.id}`) > r.phases.indexOf('deposit') && bag === 0, { ...r, cargo: cargo(u), bag });
}

// 2. Villageois : capacite 10, boucle arbre -> plein -> Baliste -> retour (bois, pierre, or). Temps par unite : bois 2 s,
// pierre et or 2,5 s (2026-11-05) : 20 a 25 s par remplissage, deux boucles en 80 s.
for (const [resource, key] of [['wood', 'wood'], ['stone', 'stone'], ['gold', 'minedGold']] as const) {
  const { w, node, u } = setup('villageois', resource);
  const r = runLoop(w, u, node.id, resource === 'wood' ? 70 : 90);
  check(`Villageois ${resource} : cargo jusqu a 10, depot automatique, retour a la source, nouvelle boucle`, r.maxCargo === 10 && r.deposits[key] >= 20 && r.phases.filter((p) => p === 'deposit').length >= 2, r);
}

// 3. Melange bois + pierre (Heros) : plein a 10 au total, tout depose.
{
  const { w, u } = setup('hero', 'wood');
  const tree = nearest(w, 'wood'); const rock = nearest(w, 'stone');
  w.issueCommand({ kind: 'harvest', entityIds: [u.id], nodeId: tree.id });
  for (let i = 0; i < 30 * 16; i++) w.step(DT); // 6 bois (Heros : 2,5 s par bois)
  const c1 = cargo(u);
  const at = beside(rock); u.x = u.prevX = at.x; u.z = u.prevZ = at.z;
  w.issueCommand({ kind: 'harvest', entityIds: [u.id], nodeId: rock.id });
  let dep = { wood: 0, stone: 0 }; let maxT = 0; let firstDone = false;
  for (let i = 0; i < 30 * 60 && !firstDone; i++) { w.step(DT); maxT = Math.max(maxT, cargoTotal(u.cargo)); for (const ev of w.cargoEvents) if (ev.type === 'cargoDeposit') (dep as any)[ev.resource] += ev.amount; if (dep.wood + dep.stone > 0 && u.order.type !== 'deposit') firstDone = true; }
  check('melange : 6 bois puis pierre -> plein a 10 au total (6 + 4), depot des deux', c1.wood === 6 && c1.stone === 0 && maxT === 10 && dep.wood === 6 && dep.stone === 4, { c1, maxT, dep });
}

// 4. Depot manuel avant d'etre plein ; « rien a deposer » cote interface (pas teste ici) ; depot accepte seulement les ressources acceptees.
{
  const { w, node, u, depot } = setup('hero', 'wood');
  w.issueCommand({ kind: 'harvest', entityIds: [u.id], nodeId: node.id });
  for (let i = 0; i < 30 * 8; i++) w.step(DT); // 3 bois (Heros : 2,5 s par bois)
  const before = cargo(u);
  w.issueCommand({ kind: 'deposit', entityIds: [u.id], targetEntityId: depot.id });
  let dep = 0;
  for (let i = 0; i < 30 * 20; i++) { w.step(DT); for (const ev of w.cargoEvents) if (ev.type === 'cargoDeposit') dep += ev.amount; }
  check('depot manuel (clic droit Baliste avec 3 bois) : le Heros y va, depose 3, cargo vide, Garde (pas de retour : ordre manuel)', before.wood === 3 && dep === 3 && cargoTotal(u.cargo) === 0 && u.order.type === 'guard', { before, dep, order: u.order.type });
}

// 5. Tas de bois > place restante : prise partielle, reste au sol, depot, retour, tas fini. Or de butin : monnaie, jamais cargo.
{
  const { w, u } = setup('hero', 'wood');
  u.cargo.wood = 8;
  const id = w.dropResource('wood', u.x + 3, u.z, 5);
  w.issueCommand({ kind: 'pickup', entityIds: [u.id], pileId: id });
  const log: any[] = []; let deps = 0;
  for (let i = 0; i < 30 * 40; i++) { w.step(DT); for (const ev of w.cargoEvents) { if (ev.type === 'pilePickup') log.push({ amount: ev.amount, remaining: ev.remaining, cargo: cargoTotal(u.cargo) }); if (ev.type === 'cargoDeposit') deps += ev.amount; } if (w.resourcePiles[id].amount === 0 && u.order.type === 'guard' && cargoTotal(u.cargo) === 0) break; }
  check('tas de 5 bois, cargo 8/10 : prise de 2 (plein), 3 au sol, depot (10), retour au tas, prise des 3, tas fini', log.length === 2 && log[0].amount === 2 && log[0].remaining === 3 && log[0].cargo === 10 && log[1].amount === 3 && log[1].remaining === 0 && deps === 10 && w.resourcePiles[id].amount === 0, { log, deps });
  u.cargo.wood = 0;
  const gold = w.dropGold(u.x + 2, u.z + 1, 6);
  w.issueCommand({ kind: 'pickup', entityIds: [u.id], pileId: gold });
  let loot = 0;
  for (let i = 0; i < 30 * 6; i++) { w.step(DT); for (const ev of w.cargoEvents) if (ev.type === 'lootGold') loot += ev.amount; }
  check('or de butin : le Heros va le ramasser, evenement lootGold 6 (monnaie), cargo inchange (0)', loot === 6 && cargoTotal(u.cargo) === 0 && w.resourcePiles[gold].amount === 0, { loot, cargo: cargo(u) });
}

// 6. Villageois : Stop pendant la recolte ; ordre manuel pendant le trajet de depot (boucle annulee, cargo garde).
// 2026-11-05 : un Villageois inactif redevient autonome apres 1 s (villageois-autonomie.mts) : les fenetres
// d'observation restent sous 1 s apres la fin de l'ordre manuel.
{
  const { w, node, u } = setup('villageois', 'wood');
  w.issueCommand({ kind: 'harvest', entityIds: [u.id], nodeId: node.id });
  for (let i = 0; i < 30 * 4; i++) w.step(DT);
  w.issueCommand({ kind: 'stop', entityIds: [u.id] });
  let after = 0;
  for (let i = 0; i < 25; i++) { w.step(DT); if (u.order.type === 'harvest') after++; }
  const kept = cargo(u);
  check('Stop pendant la recolte : plus de recolte (0,8 s observees, avant l autonomie), cargo garde (2 bois)', after === 0 && u.worker.working === null && kept.wood === 2, { after, kept });
  w.issueCommand({ kind: 'harvest', entityIds: [u.id], nodeId: node.id });
  for (let i = 0; i < 30 * 30 && u.order.type !== 'deposit'; i++) w.step(DT);
  const onWay = u.order.type === 'deposit';
  w.issueCommand({ kind: 'move', entityIds: [u.id], x: u.x + 2, z: u.z + 2 });
  let seen: string[] = [];
  for (let i = 0; i < 30; i++) { w.step(DT); if (seen[seen.length - 1] !== u.order.type) seen.push(u.order.type); }
  check('ordre manuel pendant le trajet de depot : boucle annulee (ni depot ni retour pendant la seconde observee), cargo garde (10)', onWay && !seen.includes('deposit') && !seen.includes('harvest') && cargoTotal(u.cargo) === 10 && u.cargo.returnTo === null, { onWay, seen, cargo: cargo(u) });
}

// 7. Source epuisee (Villageois) : depot du cargo puis source voisine ; Heros : depot puis Garde.
{
  const { w, node, u } = setup('villageois', 'wood');
  w.resourceNodeAmounts.set(node.id, 3);
  const r = runLoop(w, u, node.id, 30);
  const nextIds = r.phases.filter((p) => p.startsWith('harvest:') && p !== `harvest:${node.id}`);
  check('Villageois, source epuisee (3 bois) : depot des 3, puis arbre voisin (nouvelle recolte, nouveaux depots)', r.deposits.wood >= 3 && r.phases[1] === 'deposit' && nextIds.length > 0 && r.phases.indexOf(nextIds[0]!) > r.phases.indexOf('deposit'), r);
  const h = setup('hero', 'wood');
  h.w.resourceNodeAmounts.set(h.node.id, 3);
  const rh = runLoop(h.w, h.u, h.node.id, 30);
  check('Heros, source epuisee : depot des 3, puis Garde (pas de source voisine)', rh.deposits.wood === 3 && rh.phases[rh.phases.length - 1] === 'guard' && !rh.phases.some((p) => p.startsWith('harvest:') && p !== `harvest:${h.node.id}`), rh);
}

// 8. Outils retires pendant la recolte (permissions vides, cas generique) : unite en cours finie, depot, Garde.
{
  const { w, node, u } = setup('villageois', 'wood');
  w.issueCommand({ kind: 'harvest', entityIds: [u.id], nodeId: node.id });
  for (let i = 0; i < 30 * 4; i++) w.step(DT);
  w.harvestPermissions = { tools: [] };
  let dep = 0;
  for (let i = 0; i < 30 * 30; i++) { w.step(DT); for (const ev of w.cargoEvents) if (ev.type === 'cargoDeposit') dep += ev.amount; }
  check('outil perdu (permissions vides) : unite en cours finie (3), depot des 3, Garde', dep === 3 && u.order.type === 'guard' && cargoTotal(u.cargo) === 0, { dep, order: u.order.type });
}

// 9. Aucun point de collecte : cargo garde, recolte arretee pleine, rien perdu.
{
  const { w, node, u } = setup('hero', 'wood', 3, false);
  const r = runLoop(w, u, node.id, 25);
  let noDrop = 0; // evenement cargoFullNoDropOff compte via une seconde boucle courte
  for (let i = 0; i < 30 * 2; i++) { w.step(DT); for (const ev of w.cargoEvents) if (ev.type === 'cargoFullNoDropOff') noDrop++; }
  check('sans Baliste : cargo plein (10) garde, recolte arretee, aucune teleportation, aucun depot', cargoTotal(u.cargo) === 10 && r.deposits.wood === 0 && !r.phases.includes('deposit') && u.order.type === 'guard', { ...r, cargo: cargo(u), noDrop });
}

// 10. Mort avec cargo : perdu ; respawn du Heros a cargo vide.
{
  const { w, node, u } = setup('hero', 'wood');
  w.issueCommand({ kind: 'harvest', entityIds: [u.id], nodeId: node.id });
  for (let i = 0; i < 30 * 8; i++) w.step(DT); // 3 bois (Heros : 2,5 s par bois)
  const before = cargoTotal(u.cargo);
  u.hp = 0;
  let lost: any = null;
  for (let i = 0; i < 30 * 2; i++) { w.step(DT); lost ??= w.cargoEvents.find((e: any) => e.type === 'cargoLost') ?? null; }
  for (let i = 0; i < 30 * 40 && !u.alive; i++) w.step(DT);
  check('Heros mort avec 3 bois : cargo perdu (evenement), respawn a cargo vide', before === 3 && lost?.wood === 3 && u.alive && cargoTotal(u.cargo) === 0, { before, lost, alive: u.alive, cargo: cargo(u) });
  const v = setup('villageois', 'wood');
  v.w.issueCommand({ kind: 'harvest', entityIds: [v.u.id], nodeId: v.node.id });
  for (let i = 0; i < 30 * 6.5; i++) v.w.step(DT); // 3 bois (Villageois : 2 s par bois)
  const vb = cargoTotal(v.u.cargo); v.u.hp = 0; v.w.step(DT); v.w.step(DT);
  check('Villageois mort avec cargo : perdu', vb === 3 && !v.u.alive && cargoTotal(v.u.cargo) === 0, { vb, cargo: cargo(v.u) });
}

// 11. Determinisme.
{
  const trace = () => { const { w, node, u } = setup('villageois', 'wood', 9); runLoop(w, u, node.id, 30); return JSON.stringify([u.x.toFixed(5), u.z.toFixed(5), u.cargo, w.resourceNodeAmounts.get(node.id)]); };
  const a = trace(), b = trace();
  check('determinisme : deux simulations identiques', a === b, a);
}

// 12. Depot INSTANTANE (2026-11-04) : au premier pas au contact du point de collecte, tout le cargo accepte passe au stock
// d'un coup (un evenement par ressource), aucun geste 'deposit', retour a la source des le meme pas.
for (const unit of ['villageois', 'hero'] as const) {
  const { w, node, u } = setup(unit, 'wood');
  const cap = CARGO_CAPACITY[unit];
  w.issueCommand({ kind: 'harvest', entityIds: [u.id], nodeId: node.id });
  let arrival: any = null; let gestures = 0;
  for (let i = 0; i < 30 * 60 && !arrival; i++) {
    const before = { total: cargoTotal(u.cargo), order: u.order.type };
    w.step(DT);
    if ((u.hero ?? u.worker).working === 'deposit') gestures++;
    const dep = w.cargoEvents.filter((e: any) => e.type === 'cargoDeposit' && e.entityId === u.id).reduce((n: number, e: any) => n + e.amount, 0);
    if (dep > 0) arrival = { before, dep, after: cargoTotal(u.cargo), order: u.order.type, events: w.cargoEvents.filter((e: any) => e.type === 'cargoDeposit').length };
  }
  check(unit + ' : arrive plein (' + cap + ') -> au premier pas de contact, ' + cap + ' deposes d un coup (1 evenement), cargo 0, ordre de retour (harvest) le meme pas, jamais de geste deposit',
    !!arrival && arrival.before.total === cap && arrival.before.order === 'deposit' && arrival.dep === cap && arrival.after === 0 && arrival.events === 1 && arrival.order === 'harvest' && gestures === 0, { arrival, gestures });
}

console.log(failures ? failures + ' ECHEC(S)' : 'tout OK');
