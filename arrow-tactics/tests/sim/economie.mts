// Mesure economique LEGERE (2026-11-05, G44) sur le camp de depart reel (graine 12345), sans navigateur : un Villageois
// reste 20 s (bois) / 25 s (pierre) / 30 s (or) a sa source avant de rentrer (cargo 10 x temps par unite), cycle
// complet sous 38 s dans le camp, rendement 12 a 35 unites / min ; le Heros recolte plus lentement qu'un Villageois (x 1,25) ;
// 3 Villageois autonomes se repartissent sur bois, pierre et or et chacun rapporte ; 2 minutes simulees au plus.
// Les valeurs restent PROVISOIRES : ce test garde les ordres de grandeur, pas une balance.
// Usage : node --import ../ts-register.mjs economie.mts (ou npm run test:sim)
const SRC = new URL('../../src/', import.meta.url).href;
const { World } = await import(SRC + 'sim/world.ts');
const { getBuilding, buildingFootprintTiles } = await import(SRC + 'data/buildings.ts');
const { generateSurvivalMap } = await import(SRC + 'config/maps/proceduralSurvival.ts');
const { expandMapCamps } = await import(SRC + 'data/campLayout.ts');
const SB = await import(SRC + 'config/startingBase.ts');
const { computeBallistaObstacle } = await import(SRC + 'config/mapDef.ts');
const { HERO_HARVEST_FACTOR } = await import(SRC + 'data/hero.ts');
const { CARGO_CAPACITY, HARVEST_NODE_KINDS, cargoTotal } = await import(SRC + 'data/resources.ts');
const DT = 1 / 30;
let failures = 0;
const check = (label: string, ok: boolean, extra: unknown = '') => { if (!ok) failures++; console.log(`${ok ? 'OK   ' : 'ECHEC'} ${label}${extra !== '' ? ' — ' + JSON.stringify(extra).slice(0, 900) : ''}`); };

const seed = 12345;
const raw = generateSurvivalMap(seed);
const L = SB.startingBaseLayoutOf(raw);
const map = SB.expandStartingBase(expandMapCamps(raw));
function camp(nVil: number, withHero: boolean) {
  const w = new World(seed);
  w.setMap(map);
  w.spawnBuilding(getBuilding('ballista'), 'player', L.ballista.x, L.ballista.z, computeBallistaObstacle(L.ballista));
  for (const b of L.buildings) { const { tilesX, tilesZ } = buildingFootprintTiles(b.buildingId); w.spawnBuilding(getBuilding(b.buildingId), 'player', b.x, b.z, { kind: 'building', x: b.x, z: b.z, tilesX, tilesZ }); }
  for (const line of L.walls) w.spawnWallLine('player', line.type, line, { gates: line.gates, openGates: line.openGates });
  const hero = withHero ? w.spawnHero('player', L.hero.x, L.hero.z, { xp: 0, level: 1, deaths: 0 }) : null;
  if (hero) hero.order = { type: 'guard' };
  const vils: any[] = [];
  for (let i = 0; i < nVil; i++) { const u = L.units[i % L.units.length]; const v = w.spawn('villageois', 'player', u.x, u.z + Math.floor(i / 2)); v.order = { type: 'guard' }; vils.push(v); }
  const nodes = [...w.resourceNodes.values()].filter((n: any) => Math.hypot(n.x - L.origin.x, n.z - L.origin.z) < 15);
  return { w, hero, vils, nodes };
}
/** Boucle manuelle d'une unite sur une source : temps a la source par remplissage, cycle complet, rendement. */
function loop(w: any, u: any, node: any, seconds: number) {
  w.issueCommand({ kind: 'harvest', entityIds: [u.id], nodeId: node.id });
  let t = 0; let deposited = 0; let lastDep = -1; let workStart = -1; const cycles: number[] = []; const atSource: number[] = []; let prevWorking: string | null = null;
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    w.step(DT); t += DT;
    const working = (u.hero ?? u.worker).working;
    if (working && !prevWorking) workStart = t;
    if (!working && prevWorking && workStart >= 0) atSource.push(t - workStart);
    for (const ev of w.cargoEvents) if (ev.type === 'cargoDeposit' && ev.entityId === u.id) { deposited += ev.amount; if (ev.remaining === 0) { if (lastDep >= 0) cycles.push(t - lastDep); lastDep = t; } }
    prevWorking = working;
  }
  const avg = (a: number[]) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN;
  return { atSource: +avg(atSource).toFixed(1), cycle: +avg(cycles).toFixed(1), perMin: +(deposited / (seconds / 60)).toFixed(1), deposited };
}

// ---- 1. Un Villageois par ressource : temps a la source = cargo x temps par unite ; cycle court dans le camp.
{
  const rows: any = {};
  for (const r of ['wood', 'stone', 'gold'] as const) {
    const { w, vils, nodes } = camp(1, false);
    const v = vils[0]; v.worker.autoRetryIn = 1e9;
    const node = nodes.filter((n: any) => n.resource === r).sort((a: any, b: any) => Math.hypot(a.x - v.x, a.z - v.z) - Math.hypot(b.x - v.x, b.z - v.z))[0];
    rows[r] = { ...loop(w, v, node, 120), expected: CARGO_CAPACITY.villageois * HARVEST_NODE_KINDS[r].seconds };
  }
  check(`1 Villageois (cargo ${CARGO_CAPACITY.villageois}) : reste ${rows.wood.expected} s a l arbre, ${rows.stone.expected} s a la pierre, ${rows.gold.expected} s a l or (+/- 1 s), cycle complet < 38 s dans le camp (Baliste dans le noyau depuis G50), 12 a 35 unites / min`,
    (['wood', 'stone', 'gold'] as const).every((r) => Math.abs(rows[r].atSource - rows[r].expected) <= 1 && rows[r].cycle < 38 && rows[r].perMin >= 12 && rows[r].perMin <= 35), rows);
}

// ---- 2. Heros : plus lent qu'un Villageois sur la meme source (HERO_HARVEST_FACTOR), stats de combat intactes.
{
  const { w, hero, nodes } = camp(0, true);
  const node = nodes.filter((n: any) => n.resource === 'wood').sort((a: any, b: any) => Math.hypot(a.x - hero.x, a.z - hero.z) - Math.hypot(b.x - hero.x, b.z - hero.z))[0];
  const dmg = hero.stats.damage; const cd = hero.stats.attackCooldown;
  const h = loop(w, hero, node, 90);
  const expected = CARGO_CAPACITY.hero * HARVEST_NODE_KINDS.wood.seconds * HERO_HARVEST_FACTOR;
  check(`Heros : ${expected} s par remplissage de bois (x ${HERO_HARVEST_FACTOR}), rendement sous celui d un Villageois ; degats et recharge inchanges pendant la recolte`, HERO_HARVEST_FACTOR > 1 && Math.abs(h.atSource - expected) <= 1 && h.perMin < 26 && hero.stats.damage === dmg && hero.stats.attackCooldown === cd, h);
}

// ---- 3. Trois Villageois autonomes, 2 minutes : trois ressources, chacun rapporte, repartition plausible.
{
  const { w, vils } = camp(3, false);
  const by: Record<number, Record<string, number>> = {};
  for (let i = 0; i < Math.round(120 / DT); i++) { w.step(DT); for (const ev of w.cargoEvents) if (ev.type === 'cargoDeposit') { by[ev.entityId] ??= {}; by[ev.entityId][ev.resource] = (by[ev.entityId][ev.resource] ?? 0) + ev.amount; } }
  const res = vils.map((v) => Object.keys(by[v.id] ?? {}).sort().join('+'));
  const totals = vils.map((v) => Object.values(by[v.id] ?? {}).reduce((a, b) => a + b, 0));
  check('3 Villageois autonomes, 2 min : bois, pierre et or tous travailles (un Villageois chacun), chacun rapporte >= 30 unites', new Set(res).size === 3 && res.every((r) => r !== '') && totals.every((t) => t >= 30), { res, totals });
}

console.log(failures ? failures + ' ECHEC(S)' : 'tout OK');
