// Tests cibles SANS NAVIGATEUR de l'enchainement de chantiers et de l'evenement de mort (2026-11-06, G48) : fin de chantier ->
// chantier allie inacheve le plus proche dans AUTO_CONSTRUCT_RANGE (egalite : id le plus bas) ; chantier a 20 ignore ; chaine
// A -> B -> C -> fin ; inaccessible : le suivant ; ordre manuel prioritaire ; Villageois : autonomie apres ; Heros : Garde ;
// plusieurs constructeurs : pas de bonus ; termine par un autre : il enchaine aussi ; ligne de mur d'abord ; determinisme.
// Mort du Heros : evenement unique, position, partie continue.
// Usage : node --import ../ts-register.mjs auto-construction.mts (ou npm run test:sim)
const SRC = new URL('../../src/', import.meta.url).href;
const { World } = await import(SRC + 'sim/world.ts');
const { DEFAULT_MAP } = await import(SRC + 'config/mapDef.ts');
const { getBuilding, buildingContinuousFootprint } = await import(SRC + 'data/buildings.ts');
const { AUTO_CONSTRUCT_RANGE, WORKER_IDLE_SECONDS } = await import(SRC + 'data/hero.ts');
const DT = 1 / 30;
let failures = 0;
const check = (label: string, ok: boolean, extra: unknown = '') => { if (!ok) failures++; console.log(`${ok ? 'OK   ' : 'ECHEC'} ${label}${extra !== '' ? ' — ' + JSON.stringify(extra).slice(0, 900) : ''}`); };
const MAP = { ...DEFAULT_MAP, width: 60, height: 60, obstacles: [] };
const site = (w: any, x: number, z: number, buildTime = 0.4, id = 'house') => w.spawnBuilding(getBuilding(id), 'player', x, z, { kind: 'building', tilesX: 2, tilesZ: 2, x, z, rotationY: 0, footprint: buildingContinuousFootprint(id, x, z, 0) }, 40, undefined, undefined, { progress: 0, buildTime });
const builder = (w: any, kind: string, x: number, z: number) => { const u = kind === 'hero' ? w.spawnHero('player', x, z, { xp: 0, level: 1, deaths: 0 }) : w.spawn('villageois', 'player', x, z); u.order = { type: 'guard' }; if (u.worker) u.worker.autoRetryIn = 1e9; return u; };
const run = (w: any, seconds: number, until?: () => boolean) => { for (let i = 0; i < seconds * 30; i++) { w.step(DT); if (until?.()) return true; } return false; };
const start = (w: any, u: any, s: any) => { w.issueCommand({ kind: 'build', entityIds: [u.id], targetEntityId: s.id }); w.step(DT); };

check(`portee : AUTO_CONSTRUCT_RANGE = 12 (provisoire)`, AUTO_CONSTRUCT_RANGE === 12);

for (const kind of ['villageois', 'hero']) {
  const w = new World(3); w.setMap(MAP);
  const A = site(w, 0.3, 0.2);
  const B = site(w, 8.3, 0.2);
  const C = site(w, 20.3, 0.2);
  const u = builder(w, kind, 0.3, -2.5);
  start(w, u, A);
  run(w, 8, () => !A.construction);
  const firstOrder = { ...u.order };
  run(w, 12, () => !B.construction);
  run(w, 3);
  check(`${kind} : A termine -> B (8 cases) automatiquement, C (20 cases) ignore ; apres B : plus de chantier proche, fin normale, C toujours en attente`, firstOrder.type === 'build' && firstOrder.targetEntityId === B.id && !B.construction && C.construction !== null && C.construction.progress === 0 && (u.order.type === 'guard' || (kind === 'villageois' && u.order.type === 'harvest')), { firstOrder, order: u.order, c: C.construction });
}

// ---- Chaine A -> B -> Tour -> fin.
{
  const w = new World(3); w.setMap(MAP);
  const A = site(w, 0.3, 0.2);
  const B = site(w, 6.3, 0.2);
  const T = site(w, 12.3, 0.2, 0.4, 'tower');
  const u = builder(w, 'hero', 0.3, -2.5);
  const log: number[] = [];
  start(w, u, A);
  for (let i = 0; i < 30 * 25 && (A.construction || B.construction || T.construction); i++) { w.step(DT); for (const e of w.heroEvents) if (e.type === 'built') log.push(e.buildingId); }
  run(w, 1);
  check('chaine : Maison A -> Maison B proche -> Tour proche -> plus rien : Garde', JSON.stringify(log) === JSON.stringify([A.id, B.id, T.id]) && u.order.type === 'guard', { log, order: u.order });
}

// ---- Le plus proche ; egalite : id le plus bas ; deterministe.
{
  const trace = () => {
    const w = new World(3); w.setMap(MAP);
    const A = site(w, 0.3, 0.2);
    const far = site(w, 0.3, 9.2);
    const near = site(w, 0.3, -7.2);
    const left = site(w, -6.3, 0.2);
    const right = site(w, 6.9, 0.2);
    const u = builder(w, 'hero', 0.3, 0);
    u.x = u.prevX = 0.3; u.z = u.prevZ = -1.6;
    start(w, u, A);
    run(w, 8, () => !A.construction);
    return { order: u.order.targetEntityId, near: near.id, far: far.id, left: left.id, right: right.id };
  };
  const a = trace();
  check('choix : le chantier le plus proche du constructeur ; deux traces identiques', a.order === a.near && JSON.stringify(a) === JSON.stringify(trace()), a);
  const w = new World(3); w.setMap(MAP);
  const A = site(w, 0.3, 0.2);
  const u = builder(w, 'villageois', 0.3, -2.5);
  // Deux chantiers strictement a la meme distance du Villageois au moment de finir : id le plus bas.
  start(w, u, A);
  run(w, 8, () => A.construction.progress > 0.5);
  const d = 7;
  const first = site(w, u.x - d, u.z);
  const second = site(w, u.x + d, u.z);
  run(w, 3, () => !A.construction);
  check('egalite de distance : id le plus bas', u.order.targetEntityId === Math.min(first.id, second.id), { order: u.order, first: first.id, second: second.id, x: u.x });
}

// ---- Chantier inaccessible : le suivant ; aucun : fin.
{
  const enclose = (w: any, x: number, z: number) => {
    const r = 3;
    const pts = [[x - r, z - r], [x + r, z - r], [x + r, z + r], [x - r, z + r], [x - r, z - r]];
    for (let i = 0; i < 4; i++) w.spawnWallLine('player', 'palisade', { ax: pts[i]![0], az: pts[i]![1], bx: pts[i + 1]![0], bz: pts[i + 1]![1] });
  };
  const w = new World(3); w.setMap(MAP);
  const A = site(w, 0.3, 0.2);
  const locked = site(w, 6.3, 0.2);
  const open = site(w, 0.3, 9.2);
  enclose(w, 6.3, 0.2);
  const u = builder(w, 'hero', -3, 0.2);
  start(w, u, A);
  run(w, 8, () => !A.construction);
  check('le plus proche est enferme par une palissade : ignore, le constructeur prend le suivant', u.order.type === 'build' && u.order.targetEntityId === open.id && locked.construction !== null, { order: u.order, locked: locked.id, open: open.id });

  const w2 = new World(3); w2.setMap(MAP);
  const A2 = site(w2, 0.3, 0.2);
  site(w2, 6.3, 0.2);
  enclose(w2, 6.3, 0.2);
  const v = builder(w2, 'villageois', -3, 0.2);
  v.worker.autoRetryIn = 0;
  start(w2, v, A2);
  run(w2, 8, () => !A2.construction);
  const afterOrder = { ...v.order };
  let auto = 0;
  for (let i = 0; i < 30 * (WORKER_IDLE_SECONDS + 1); i++) { w2.step(DT); if (v.order.type === 'harvest') { auto = i / 30; break; } }
  const hasSource = [...w2.resourceNodes.values()].length > 0;
  check(`seul chantier enferme : le Villageois ne reste pas bloque, Garde puis son autonomie ~${WORKER_IDLE_SECONDS} s (carte ${hasSource ? 'avec' : 'sans'} source)`, afterOrder.type === 'guard' && (!hasSource || auto > 0), { afterOrder, auto, hasSource });
  const w3 = new World(3); w3.setMap(MAP);
  const A3 = site(w3, 0.3, 0.2);
  site(w3, 6.3, 0.2);
  enclose(w3, 6.3, 0.2);
  const h = builder(w3, 'hero', -3, 0.2);
  start(w3, h, A3);
  run(w3, 8, () => !A3.construction);
  run(w3, 2);
  check('seul chantier enferme : le Heros reste au repos', h.order.type === 'guard', h.order);
}

// ---- Ordre manuel prioritaire.
{
  const w = new World(3); w.setMap(MAP);
  const A = site(w, 0.3, 0.2, 2);
  const B = site(w, 8.3, 0.2, 0.4);
  const u = builder(w, 'hero', 0.3, -2.5);
  start(w, u, A);
  run(w, 6, () => A.construction && A.construction.progress > 0.5);
  w.issueCommand({ kind: 'move', entityIds: [u.id], x: -9, z: -9 });
  w.step(DT);
  const moved = u.order.type;
  run(w, 3);
  check('ordre du joueur pendant le chantier : il le suit, rien ne le ramene au chantier voisin', moved === 'move' && (u.order.type === 'move' || u.order.type === 'guard') && B.construction.progress === 0, { moved, order: u.order });
  // Ordre donne au pas meme ou le chantier se termine : prioritaire.
  const w2 = new World(3); w2.setMap(MAP);
  const A2 = site(w2, 0.3, 0.2, 0.3);
  const B2 = site(w2, 8.3, 0.2, 0.3);
  const u2 = builder(w2, 'villageois', 0.3, -1.65);
  start(w2, u2, A2);
  // Reste un pas de travail.
  run(w2, 3, () => A2.construction && A2.construction.progress >= 1 - (DT / 0.3) * 1.5);
  w2.issueCommand({ kind: 'move', entityIds: [u2.id], x: -9, z: -9 });
  w2.step(DT);
  check('ordre au dernier pas du chantier : prioritaire sur l enchainement', u2.order.type === 'move' && B2.construction.progress === 0, { order: u2.order, a: A2.construction });
}

// ---- Grappe serree contre un gisement (blocage reel vu en jeu, graine 12345) : le constructeur finit tout.
{
  const map = { ...MAP, obstacles: [{ kind: 'rock', tilesX: 2, tilesZ: 2, cornerX: -8, cornerZ: 8, ore: 'gold' }] };
  const w = new World(3); w.setMap(map);
  const sites = [site(w, -3.39, 7.11, 1), site(w, -0.83, 8.93, 1), site(w, -3.06, 10.25, 1)];
  const u = builder(w, 'hero', 4.5, 7.2);
  w.issueCommand({ kind: 'build', entityIds: [u.id], targetEntityId: sites[2].id });
  let t = 0;
  for (; t < 30 * 40 && sites.some((s: any) => s.construction); t++) w.step(DT);
  w.step(DT);
  check('3 chantiers tres serres contre un gisement : un seul Heros les finit sans rester bloque, puis se repose', sites.every((s: any) => !s.construction) && u.order.type === 'guard', { t: t / 30, order: u.order, left: sites.map((s: any) => s.construction?.progress ?? 'ok'), at: [u.x, u.z] });
  // Poche : la case libre la plus proche du chantier est fermee par ses voisins.
  const w2 = new World(3); w2.setMap(MAP);
  const target = site(w2, 0.3, 0.3, 0.5);
  for (const [x, z] of [[-3.4, 0.3], [3.4, 0.3], [0.3, -3.4]]) w2.spawnBuilding(getBuilding('house'), 'player', x!, z!, { kind: 'building', tilesX: 2, tilesZ: 2, x: x!, z: z!, rotationY: 0, footprint: buildingContinuousFootprint('house', x!, z!, 0) });
  const u2 = builder(w2, 'villageois', 0.3, -8);
  w2.issueCommand({ kind: 'build', entityIds: [u2.id], targetEntityId: target.id });
  let t2 = 0;
  for (; t2 < 30 * 25 && target.construction; t2++) w2.step(DT);
  check('chantier entoure de 3 Maisons proches : le constructeur le rejoint par le cote ouvert', !target.construction, { t: t2 / 30, at: [u2.x, u2.z], progress: target.construction?.progress });
}

// ---- Plusieurs constructeurs.
{
  const w = new World(3); w.setMap(MAP);
  const A = site(w, 0.3, 0.2, 1);
  const B = site(w, 8.3, 0.2, 2);
  const u1 = builder(w, 'hero', 0.3, -1.7);
  const u2 = builder(w, 'villageois', -1.5, 0.2);
  w.issueCommand({ kind: 'build', entityIds: [u1.id, u2.id], targetEntityId: A.id });
  w.step(DT);
  run(w, 5, () => !A.construction);
  w.step(DT);
  w.step(DT);
  const o1 = u1.order; const o2 = u2.order;
  check('deux constructeurs sur A : tous deux enchainent sur B (celui qui n a pas pose le dernier coup aussi)', o1.type === 'build' && o1.targetEntityId === B.id && o2.type === 'build' && o2.targetEntityId === B.id, { o1, o2 });
  // Vitesse : chaque constructeur avance le meme chantier, aucune nouvelle formule de bonus.
  const speed = (n: number) => {
    const wn = new World(3); wn.setMap(MAP);
    const s = site(wn, 0.3, 0.2, 4);
    const units = Array.from({ length: n }, (_, i) => builder(wn, 'villageois', 0.3 + (i === 0 ? 0 : 2), i === 0 ? -1.7 : 0.2));
    wn.issueCommand({ kind: 'build', entityIds: units.map((x) => x.id), targetEntityId: s.id });
    let t = 0; for (; t < 30 * 12 && s.construction; t++) wn.step(DT);
    return t / 30;
  };
  const one = speed(1); const two = speed(2);
  check('regle inchangee : deux constructeurs avancent chacun le meme chantier (deux fois plus vite environ), sans bonus en plus', Math.abs(two * 2 - one) < 0.6, { one, two });
}

// ---- Ligne de mur : le segment suivant de la meme ligne d'abord.
{
  const w = new World(3); w.setMap(MAP);
  w.spawnWallLine('player', 'palisade', { ax: 0, az: 0, bx: 8, bz: 0 }, { construction: true });
  const pieces = w.entities.filter((e: any) => e.wall);
  if (pieces.length > 1 && pieces.every((p: any) => p.construction)) {
    const near = site(w, 2, 2.5);
    const u = builder(w, 'hero', 1, -1);
    w.issueCommand({ kind: 'build', entityIds: [u.id], targetEntityId: pieces[0].id });
    run(w, 15, () => !pieces[0].construction);
    w.step(DT);
    check('ligne de mur : le segment suivant de la meme ligne avant le chantier le plus proche', u.order.type === 'build' && u.order.targetEntityId === pieces[1].id && near.construction !== null, { order: u.order, piece: pieces[1].id });
  } else {
    console.log('OK    ligne de mur : non testee ici (spawnWallLine sans chantier), voir palissade.mts');
  }
}

// ---- Mort du Heros : evenement unique, position, partie continue.
{
  const w = new World(3); w.setMap(MAP);
  const b = w.spawnBuilding(getBuilding('ballista'), 'player', 0.5, 0.5, { kind: 'building', tilesX: 3, tilesZ: 3, x: 0.5, z: 0.5 });
  const h = builder(w, 'hero', 6.2, 3.4);
  const events: any[] = [];
  h.hp = 0;
  for (let i = 0; i < 30 * 5; i++) { w.step(DT); for (const e of w.heroEvents) if (e.type === 'death') events.push({ ...e, tick: w.tick }); }
  check('mort du Heros : evenement emis UNE fois, a sa position, sans repetition pendant l attente ; Baliste vivante : la simulation continue', events.length === 1 && events[0].heroId === h.id && events[0].x === 6.2 && events[0].z === 3.4 && events[0].respawnIn > 0 && !h.alive && b.alive, events);
  const before = events.length;
  for (let i = 0; i < 30 * 40; i++) { w.step(DT); for (const e of w.heroEvents) if (e.type === 'death') events.push(e); }
  check('retour du Heros : regles inchangees, aucun nouvel evenement de mort', h.alive && events.length === before, { alive: h.alive, n: events.length });
}

console.log(failures ? failures + ' ECHEC(S)' : 'tout OK');
