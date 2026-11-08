// Tests cibles SANS NAVIGATEUR de l'Hotel de ville (2026-11-08, decision d'Antoine) : point de collecte UNIVERSEL du camp
// (la Baliste n'accepte plus rien : jamais choisie, meme plus proche ; sans Hotel de ville, le porteur garde son cargo et
// s'arrete proprement), production du Villageois par la file standard (cout, duree, population, ralliement standard ;
// l'Auberge ne produit plus rien), determinisme.
// Usage : node --import ../ts-register.mjs hotel-de-ville.mts (ou npm run test:sim)
const SRC = new URL('../../src/', import.meta.url).href;
const { World } = await import(SRC + 'sim/world.ts');
const { getBuilding } = await import(SRC + 'data/buildings.ts');
const { getUnit } = await import(SRC + 'data/units.ts');
const { cargoTotal, CARGO_CAPACITY } = await import(SRC + 'data/resources.ts');
const { producibleUnits, productionHotkey, unitProductionSeconds } = await import(SRC + 'data/production.ts');
const { populationOfEntities, unitPopulationCost } = await import(SRC + 'data/population.ts');
const { generateSurvivalMap } = await import(SRC + 'config/maps/proceduralSurvival.ts');
const DT = 1 / 30;
let failures = 0;
const check = (label: string, ok: boolean, extra: unknown = '') => { if (!ok) failures++; console.log(`${ok ? 'OK   ' : 'ECHEC'} ${label}${extra !== '' ? ' — ' + JSON.stringify(extra).slice(0, 900) : ''}`); };
const fp = (id: string, x: number, z: number) => { const d = getBuilding(id); return { kind: 'building', x, z, tilesX: d.footprintTilesX ?? 3, tilesZ: d.footprintTilesZ ?? 3 }; };

// ---- Donnees.
{
  const th = getBuilding('townhall');
  const ballista = getBuilding('ballista');
  const tavern = getBuilding('tavern');
  check('donnees : Hotel de ville = point de collecte universel (bois, pierre, or extrait) ; Baliste : plus aucun depot ; Scierie et Camp de mineur inchanges',
    JSON.stringify(th.dropOff) === '["wood","stone","minedGold"]' && ballista.dropOff === undefined && JSON.stringify(getBuilding('sawmill').dropOff) === '["wood"]' && JSON.stringify(getBuilding('miner_camp').dropOff) === '["stone","minedGold"]');
  check('donnees : Hotel de ville produit le Villageois (touche A) ; Auberge ne produit plus rien ; Villageois : 5 or, 8 s, population 1 (inchanges)',
    JSON.stringify(producibleUnits('townhall', 0)) === '["villageois"]' && productionHotkey('townhall', 'villageois') === 'A' && producibleUnits('tavern', 0).length === 0 && tavern.recruitmentUnlock === undefined
    && getUnit('villageois').cost === 5 && unitProductionSeconds('villageois') === 8 && unitPopulationCost('villageois') === 1,
    { th: th.recruitmentUnlock, tavern: tavern.recruitmentUnlock, cost: getUnit('villageois').cost, s: unitProductionSeconds('villageois') });
  check('donnees : Baliste inchangee par ailleurs (25 PV, compte pour la defaite, jamais achetable) ; Hotel de ville 30 PV, 4 x 4', ballista.maxHp === 250 && ballista.countsForDefeat && ballista.cost === undefined && th.maxHp === 300 && th.footprintTilesX === 4 && th.footprintTilesZ === 4);
}

// ---- Depot : Villageois en recolte, Baliste PLUS PROCHE que l'Hotel de ville.
const map = generateSurvivalMap(12345);
const nearest = (w: any, resource: string) => [...w.resourceNodes.values()].filter((n: any) => n.resource === resource).sort((a: any, b: any) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z))[0];
const beside = (node: any) => ({ x: node.x + (node.block ? node.block.maxX - node.x + 0.6 : 1.2), z: node.z });
function setup(unit: 'hero' | 'villageois', sites: { id: string; dx: number; dz: number }[], seed = 3) {
  const w = new World(seed);
  w.setMap(map);
  const node = nearest(w, 'wood');
  const at = beside(node);
  const u = unit === 'hero' ? w.spawnHero('player', at.x, at.z, { xp: 0, level: 1, deaths: 0 }) : w.spawn('villageois', 'player', at.x, at.z);
  w.harvestPermissions = { tools: ['axe', 'pickaxe'] };
  const built: Record<string, any> = {};
  for (const s of sites) built[s.id] = w.spawnBuilding(getBuilding(s.id), 'player', at.x + s.dx, at.z + s.dz);
  return { w, node, u, built };
}
function follow(w: any, u: any, seconds: number) {
  const targets = new Set<string>(); let deposited = 0; let noDrop = 0; let maxCargo = 0;
  for (let i = 0; i < Math.round(seconds * 30); i++) {
    w.step(DT);
    maxCargo = Math.max(maxCargo, cargoTotal(u.cargo));
    if (u.order.type === 'deposit') targets.add(w.getById(u.order.targetEntityId)?.unitId ?? '?');
    for (const ev of w.cargoEvents) { if (ev.type === 'cargoDeposit' && ev.entityId === u.id) deposited += ev.amount; if (ev.type === 'cargoFullNoDropOff' && ev.entityId === u.id) noDrop++; }
  }
  return { targets: [...targets], deposited, noDrop, maxCargo };
}
{
  const { w, node, u } = setup('villageois', [{ id: 'ballista', dx: 4, dz: 0 }, { id: 'townhall', dx: 9, dz: 0 }]);
  w.issueCommand({ kind: 'harvest', entityIds: [u.id], nodeId: node.id });
  const r = follow(w, u, 70);
  check('Villageois : recolte -> cargo plein -> depot a l Hotel de ville (plus loin) et JAMAIS a la Baliste (plus proche) -> stock credite -> retour a la source', r.targets.length === 1 && r.targets[0] === 'townhall' && r.deposited >= CARGO_CAPACITY.villageois && r.maxCargo === CARGO_CAPACITY.villageois && u.order.type === 'harvest', r);
}
// ---- Sans Hotel de ville (Baliste seule) : aucun depot, cargo garde, arret propre.
{
  const { w, node, u } = setup('villageois', [{ id: 'ballista', dx: 4, dz: 0 }]);
  w.issueCommand({ kind: 'harvest', entityIds: [u.id], nodeId: node.id });
  const r = follow(w, u, 60);
  check('Baliste seule : la Baliste n est jamais un repli de depot ; cargo plein garde (rien de perdu), evenement « aucun point de collecte », Garde', r.targets.length === 0 && r.deposited === 0 && r.noDrop >= 1 && cargoTotal(u.cargo) === CARGO_CAPACITY.villageois && u.order.type === 'guard', { ...r, cargo: cargoTotal(u.cargo), order: u.order.type });
}
// ---- Heros : depot manuel accepte sur l'Hotel de ville, refuse sur la Baliste.
{
  const { w, u, built } = setup('hero', [{ id: 'ballista', dx: 4, dz: 0 }, { id: 'townhall', dx: 9, dz: 0 }]);
  u.cargo.wood = 6;
  w.issueCommand({ kind: 'deposit', entityIds: [u.id], targetEntityId: built['ballista'].id });
  w.step(DT);
  const refused = w.commandResults[0]?.rejection;
  w.issueCommand({ kind: 'deposit', entityIds: [u.id], targetEntityId: built['townhall'].id });
  w.step(DT);
  const accepted = w.commandResults[0]?.rejection === null;
  let deposited = 0;
  for (let i = 0; i < 30 * 20 && deposited === 0; i++) { w.step(DT); for (const ev of w.cargoEvents) if (ev.type === 'cargoDeposit') deposited += ev.amount; }
  check('Heros : depot manuel sur la Baliste refuse (invalid-target) ; sur l Hotel de ville accepte, 6 bois deposes', refused === 'invalid-target' && accepted && deposited === 6, { refused, accepted, deposited });
}

// ---- Production du Villageois a l'Hotel de ville : file, duree, population, ralliement.
const flat = { name: 'test', version: 1, width: 40, height: 40, obstacles: [], playerUnits: [], enemyUnits: [] };
function prodWorld(seed: number) {
  const w = new World(seed);
  w.setMap(flat);
  const th = w.spawnBuilding(getBuilding('townhall'), 'player', 0, 0, fp('townhall', 0, 0));
  const house = w.spawnBuilding(getBuilding('house'), 'player', 8.5, 8.5, fp('house', 8.5, 8.5));
  return { w, th, house };
}
function runProd(w: any, seconds: number) {
  const spawned: { unitId: string; x: number; z: number; tick: number; rally: unknown }[] = [];
  for (let i = 0; i < Math.round(seconds * 30); i++) {
    w.step(DT);
    for (const ev of w.productionSpawnEvents) { spawned.push({ unitId: ev.unitId, x: ev.x, z: ev.z, tick: w.tick, rally: ev.rally }); const u = w.spawn(ev.unitId, ev.team, ev.x, ev.z); if (ev.rally) w.issueCommand({ kind: 'move', entityIds: [u.id], x: ev.rally.x, z: ev.rally.z }); else w.issueCommand({ kind: 'stop', entityIds: [u.id] }); }
  }
  return spawned;
}
{
  const { w, th } = prodWorld(5);
  const before = populationOfEntities(w.entities);
  const id = w.queueProduction(th.id, { kind: 'unit', unitId: 'villageois' }, unitProductionSeconds('villageois'));
  const s1 = runProd(w, 9);
  const after = populationOfEntities(w.entities);
  const v = w.entities.find((e: any) => e.unitId === 'villageois');
  check('file de l Hotel de ville : un Villageois commande, sorti apres 8 s sur une case libre hors emprise, population +1, sans ralliement -> Garde pres du batiment',
    typeof id === 'number' && s1.length === 1 && s1[0]!.unitId === 'villageois' && s1[0]!.tick >= 8 * 30 && s1[0]!.tick <= 8 * 30 + 2 && s1[0]!.rally === null && after.used === before.used + 1
    && !!v && v.worker !== null && Math.hypot(v.x, v.z) >= 2 && Math.hypot(v.x, v.z) <= 4.5 && v.order.type === 'guard',
    { s1, before, after, v: v && [+v.x.toFixed(2), +v.z.toFixed(2), v.order.type] });
  // Ralliement standard des producteurs.
  const ok = (() => { w.queueRallyPoint(th.id, { x: 8, z: -6 }); w.step(DT); return JSON.stringify(th.rally) === JSON.stringify({ x: 8, z: -6 }); })();
  w.queueProduction(th.id, { kind: 'unit', unitId: 'villageois' }, unitProductionSeconds('villageois'));
  const s2 = runProd(w, 20);
  const v2 = w.entities.filter((e: any) => e.unitId === 'villageois')[1];
  check('ralliement de l Hotel de ville accepte (World.queueRallyPoint, producteur) ; le Villageois suivant sort puis marche jusqu au point', ok && s2.length === 1 && JSON.stringify(s2[0]!.rally) === JSON.stringify({ x: 8, z: -6 }) && !!v2 && Math.hypot(v2.x - 8, v2.z + 6) < 1.2, { ok, s2, v2: v2 && [+v2.x.toFixed(2), +v2.z.toFixed(2), v2.order.type] });
}
// ---- Determinisme.
{
  const a = prodWorld(11); const b = prodWorld(11);
  for (const { w, th } of [a, b]) { w.queueProduction(th.id, { kind: 'unit', unitId: 'villageois' }, 8); w.queueProduction(th.id, { kind: 'unit', unitId: 'villageois' }, 8); w.queueRallyPoint(th.id, { x: -7, z: 7 }); }
  const sa = runProd(a.w, 20); const sb = runProd(b.w, 20);
  const pos = (w: any) => w.entities.filter((e: any) => e.unitId === 'villageois').map((e: any) => [+e.x.toFixed(4), +e.z.toFixed(4)]);
  check('determinisme : deux mondes de meme graine -> memes sorties (cases, ticks) et memes positions finales', sa.length === 2 && JSON.stringify(sa) === JSON.stringify(sb) && JSON.stringify(pos(a.w)) === JSON.stringify(pos(b.w)), { sa, pa: pos(a.w) });
}

console.log(failures === 0 ? 'TOUT OK' : `${failures} ECHEC(S)`);
process.exit(failures === 0 ? 0 : 1);
