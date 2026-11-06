// Tests cibles SANS NAVIGATEUR de la passe corrective de navigation (2026-11-06, G49) : aucune unite ne reste indefiniment dans une
// boucle. Palissade entre des batiments, point de travail verrouille, cas tires au hasard dans le vrai camp (borne sur le temps
// et sur A*) ; route perdue ; watchdog (cas A a E, foule, faux positifs, hesitation de grande amplitude) ; charge : destinations
// impossibles et recherches par pas bornees.
// Usage : node --import ../ts-register.mjs navigation-boucle.mts (ou npm run test:sim)
const SRC = new URL('../../src/', import.meta.url).href;
const { World } = await import(SRC + 'sim/world.ts');
const { DEFAULT_MAP, computeBallistaObstacle } = await import(SRC + 'config/mapDef.ts');
const { getBuilding, buildingContinuousFootprint, buildingFootprintTiles } = await import(SRC + 'data/buildings.ts');
const { generateSurvivalMap } = await import(SRC + 'config/maps/proceduralSurvival.ts');
const { expandMapCamps } = await import(SRC + 'data/campLayout.ts');
const SB = await import(SRC + 'config/startingBase.ts');
const { pathSearchStats, cachedPathGrid, sameWalkRegion } = await import(SRC + 'sim/pathfinding.ts');
const { obstaclesForUnit } = await import(SRC + 'sim/geometry.ts');
const { navigationState } = await import(SRC + 'sim/systems/movement.ts');
const { chooseWorkStand, bodyFitsAt, distanceToSite } = await import(SRC + 'sim/workStand.ts');
const { Rng } = await import(SRC + 'core/rng.ts');
const { STUCK_CHECK_SECONDS, MAX_PATH_SEARCHES_PER_STEP } = await import(SRC + 'config/constants.ts');
const { BUILD_REACH, WORKER_IDLE_SECONDS } = await import(SRC + 'data/hero.ts');
const DT = 1 / 30;
let failures = 0;
const check = (label: string, ok: boolean, extra: unknown = '') => { if (!ok) failures++; console.log(`${ok ? 'OK   ' : 'ECHEC'} ${label}${extra !== '' ? ' — ' + JSON.stringify(extra).slice(0, 1000) : ''}`); };
const FLAT = { ...DEFAULT_MAP, width: 60, height: 60, obstacles: [] };
const placed = (w: any, id: string, x: number, z: number, r = 0) => { const t = buildingFootprintTiles(id); return w.spawnBuilding(getBuilding(id), 'player', x, z, { kind: 'building', tilesX: t.tilesX, tilesZ: t.tilesZ, x, z, rotationY: r, footprint: buildingContinuousFootprint(id, x, z, r) }); };
const hero = (w: any, x: number, z: number) => { const h = w.spawnHero('player', x, z, { xp: 0, level: 1, deaths: 0 }); h.order = { type: 'guard' }; return h; };
const villager = (w: any, x: number, z: number) => { const v = w.spawn('villageois', 'player', x, z); v.order = { type: 'guard' }; v.worker.autoRetryIn = 1e9; return v; };
const wallSites = (w: any, ax: number, az: number, bx: number, bz: number, buildTime = 0.3) => { const p = w.spawnWallLine('player', 'palisade', { ax, az, bx, bz }, { construction: true }); for (const s of p) s.construction.buildTime = buildTime; return p; };
/** Avance jusqu'a la fin de l'ordre de `u` sur `site`. Releve temps, A*, distance parcourue, changements de point. */
function runBuild(w: any, u: any, site: any, seconds = 25) {
  w.issueCommand({ kind: 'build', entityIds: [u.id], targetEntityId: site.id });
  const a0 = pathSearchStats.searches;
  let travelled = 0; let px = u.x; let pz = u.z; let t = 0; let maxStep = 0; const stands = new Set<string>(); const events: any[] = [];
  for (; t < seconds * 30; t++) {
    const s0 = pathSearchStats.searches;
    w.step(DT);
    maxStep = Math.max(maxStep, pathSearchStats.searches - s0);
    events.push(...w.orderEvents);
    travelled += Math.hypot(u.x - px, u.z - pz); px = u.x; pz = u.z;
    const s = navigationState(u).stand;
    if (s) stands.add(`${s.x.toFixed(3)},${s.z.toFixed(3)}`);
    if (!site.construction || u.order.type !== 'build' || u.order.targetEntityId !== site.id) break;
  }
  return { built: !site.construction, order: u.order.type, seconds: +(t / 30).toFixed(2), searches: pathSearchStats.searches - a0, maxStep, travelled: +travelled.toFixed(1), stands: stands.size, events };
}

// ==== 1. Palissade entre deux batiments : le cas qui bouclait.
{
  const scene = () => {
    const w = new World(5); w.setMap(FLAT);
    // Maisons collees a la ligne des deux cotes de la piece visee : a son milieu, le point de contact est bloque.
    placed(w, 'house', -1, -1.35); placed(w, 'house', -1, 1.35);
    const pieces = wallSites(w, -7, 0, 7, 0);
    const target = pieces.find((p: any) => Math.abs((p.wall.ax + p.wall.bx) / 2 + 1) < 1.01);
    return { w, target };
  };
  for (const [name, mk] of [['Heros', hero], ['Villageois', villager]] as const) {
    const { w, target } = scene();
    const u = mk(w, -1, -7);
    const r = runBuild(w, u, target);
    check(`${name} : segment entre deux Maisons : chantier atteint, un seul point de travail, A* borne, aucune tempete`, r.built && r.stands === 1 && r.searches <= 6 && r.maxStep <= 2, r);
  }
  // Le point reste du cote choisi : l'unite ne traverse jamais la ligne en hesitant.
  const { w, target } = scene();
  const u = hero(w, 4, -5);
  w.issueCommand({ kind: 'build', entityIds: [u.id], targetEntityId: target.id });
  const sides = new Set<number>(); const stands = new Set<string>();
  for (let i = 0; i < 30 * 12 && target.construction; i++) { w.step(DT); sides.add(Math.sign(u.z)); const s = navigationState(u).stand; if (s) stands.add(`${s.x},${s.z}`); }
  check('point verrouille : jamais de bascule gauche / droite, l unite reste de son cote', !target.construction && stands.size === 1 && !sides.has(1), { sides: [...sides], stands: stands.size });
}

// ==== 2. Le vrai camp : cas tires au hasard, jamais de boucle infinie.
{
  const raw = generateSurvivalMap(12345);
  const L = SB.startingBaseLayoutOf(raw);
  const map = SB.expandStartingBase(expandMapCamps(raw));
  const O = L.origin;
  const rng = new Rng(777);
  const R = (a: number, b: number) => a + rng.next() * (b - a);
  const rows: any[] = [];
  const t0 = performance.now();
  for (let n = 0; n < 40; n++) {
    const w = new World(1); w.setMap(map);
    w.spawnBuilding(getBuilding('ballista'), 'player', O.x, O.z, computeBallistaObstacle(O));
    for (const b of L.buildings) placed(w, b.buildingId, b.x, b.z, b.rotationY);
    for (const l of L.walls) w.spawnWallLine('player', l.type, l, { gates: l.gates, openGates: l.openGates });
    const cx = O.x + R(-7, 7), cz = O.z + R(-7, 7), a = R(0, Math.PI), len = R(4, 12);
    const ux = Math.cos(a), uz = Math.sin(a), nx = -uz, nz = ux;
    const pieces = wallSites(w, cx - (ux * len) / 2, cz - (uz * len) / 2, cx + (ux * len) / 2, cz + (uz * len) / 2);
    if (pieces.length < 2) continue;
    for (let i = 0, k = 2 + Math.floor(rng.next() * 4); i < k; i++) {
      const t = R(-len / 2, len / 2), side = rng.next() < 0.5 ? -1 : 1, off = R(1.25, 1.9);
      placed(w, 'house', cx + ux * t + nx * side * off, cz + uz * t + nz * side * off, rng.next() < 0.5 ? a : 0);
    }
    const target = pieces[Math.floor(rng.next() * pieces.length)];
    let hx = 0; let hz = 0;
    const obstacles = obstaclesForUnit(w.obstacles, { team: 'player' });
    for (let tries = 0; tries < 40; tries++) { hx = O.x + R(-9, 9); hz = O.z + R(-9, 9); if (bodyFitsAt(hx, hz, 0.6, obstacles)) break; }
    const u = hero(w, hx, hz);
    const stand0 = chooseWorkStand(u, target, obstacles, cachedPathGrid(obstacles, w.boardWidth, w.boardHeight));
    rows.push({ n, stand0: stand0 !== null, ...runBuild(w, u, target), events: undefined });
  }
  const worst = Math.max(...rows.map((r) => r.searches));
  const built = rows.filter((r) => r.built).length;
  const ended = rows.filter((r) => r.built || r.order === 'guard').length;
  console.log(`CAMP ${rows.length} cas : ${built} batis, ${rows.length - built} abandonnes ; pire A* ${worst} ; pire temps ${Math.max(...rows.map((r) => r.seconds))} s ; pas maximal ${Math.max(...rows.map((r) => r.maxStep))} A* ; calcul total ${(performance.now() - t0).toFixed(0)} ms`);
  check('camp reel, 40 cas de palissade encombree : chacun se termine (bati ou abandon propre), jamais de boucle', ended === rows.length && rows.every((r) => r.seconds < 25), rows.filter((r) => !r.built && r.order !== 'guard'));
  check('A* borne : au plus 30 recherches par ordre (3 750 en 25 s avant la correction), jamais plus de 6 par pas', worst <= 30 && rows.every((r) => r.maxStep <= MAX_PATH_SEARCHES_PER_STEP), { worst });
  check('un chantier qui a un point de travail se bat, au moins 90 % des cas', built / rows.length >= 0.9 && rows.filter((r) => r.stand0 && !r.built).length <= 2, rows.filter((r) => !r.built));
  check('abandon seulement si aucun point de travail, ou apres deux blocages : jamais un tremblement sans fin (parcours borne)', rows.every((r) => r.travelled < 130), Math.max(...rows.map((r) => r.travelled)));
}

// ==== 3. Chantier impossible, route perdue.
{
  const enclose = (w: any, x: number, z: number, r = 3) => { const pts = [[x - r, z - r], [x + r, z - r], [x + r, z + r], [x - r, z + r], [x - r, z - r]]; for (let i = 0; i < 4; i++) w.spawnWallLine('player', 'palisade', { ax: pts[i]![0], az: pts[i]![1], bx: pts[i + 1]![0], bz: pts[i + 1]![1] }); };
  const w = new World(5); w.setMap(FLAT);
  const inside = wallSites(w, -1, 0.3, 1, 0.3)[0];
  enclose(w, 0, 0.3);
  const u = hero(w, -8, 0);
  const r = runBuild(w, u, inside);
  check('chantier enferme : abandon immediat, unreachable (ordre build) signale une fois, aucun A*, Garde', !r.built && r.order === 'guard' && r.seconds < 0.2 && r.searches === 0 && r.events.filter((e: any) => e.order === 'build' && e.reason === 'unreachable').length === 1, r);
  const w2 = new World(5); w2.setMap(FLAT);
  const inside2 = wallSites(w2, -1, 0.3, 1, 0.3)[0];
  enclose(w2, 0, 0.3);
  const v = villager(w2, -8, 0);
  const near = wallSites(w2, -8, 4, -6, 4)[0];
  v.worker.autoRetryIn = 0;
  // Enchainement automatique vers un chantier enferme : silencieux.
  w2.issueCommand({ kind: 'build', entityIds: [v.id], targetEntityId: near.id });
  const evs: any[] = [];
  for (let i = 0; i < 30 * 6 && (near.construction || v.order.type === 'build'); i++) { w2.step(DT); evs.push(...w2.orderEvents); }
  check('enchainement automatique : le chantier enferme est ignore, sans message ; Villageois en Garde', !near.construction && inside2.construction !== null && v.order.type !== 'build' && evs.length === 0, { order: v.order, evs });

  // Route perdue : un batiment pose sur le point de travail en cours de route.
  const w3 = new World(5); w3.setMap(FLAT);
  const site = wallSites(w3, -1, 0, 1, 0, 0.3)[0];
  const h = hero(w3, 0, -12);
  w3.issueCommand({ kind: 'build', entityIds: [h.id], targetEntityId: site.id });
  w3.step(DT); w3.step(DT);
  const first = navigationState(h).stand;
  placed(w3, 'house', first.x, first.z);
  const a0 = pathSearchStats.searches;
  let t = 0;
  for (; t < 30 * 15 && site.construction && h.order.type === 'build'; t++) w3.step(DT);
  check('route perdue (batiment pose sur le point de travail) : nouveau point choisi tout de suite, jamais bloque, chantier fini, A* borne', !site.construction && t / 30 < 4 && pathSearchStats.searches - a0 <= 8, { t: t / 30, a: pathSearchStats.searches - a0, order: h.order.type, stand: navigationState(h).stand });
}

// ==== 4. Watchdog.
{
  const mover = (speed: number) => { const w = new World(5); w.setMap(FLAT); const u = hero(w, 0, 0); u.stats.moveSpeed = speed; return { w, u }; };
  // A. Lent mais reel.
  { const { w, u } = mover(0.25); w.issueCommand({ kind: 'move', entityIds: [u.id], x: 3, z: 0 }); w.step(DT); let lost = false; const evs: any[] = []; for (let i = 0; i < 30 * 16 && u.order.type === 'move'; i++) { w.step(DT); evs.push(...w.orderEvents); if (navigationState(u).stuckCount > 0) lost = true; }
    check('cas A : progression lente mais reelle (0,25 case/s) : ordre conserve, jamais detecte bloque, arrivee', !lost && evs.some((e: any) => e.outcome === 'completed'), evs); }
  // B et C. Totalement bloquee.
  { const { w, u } = mover(0); w.issueCommand({ kind: 'move', entityIds: [u.id], x: 10, z: 0 });
    const counts: number[] = []; const evs: any[] = []; let a = 0; const a0 = pathSearchStats.searches; let tFirst = 0; let tEnd = 0;
    for (let i = 0; i < 30 * 8; i++) { w.step(DT); evs.push(...w.orderEvents); const s = navigationState(u).stuckCount; if (s === 1 && !tFirst) { tFirst = i / 30; a = pathSearchStats.searches - a0; } counts.push(s); if (u.order.type !== 'move' && !tEnd) tEnd = i / 30; }
    const after = pathSearchStats.searches - a0;
    check(`cas B : totalement bloquee : premier blocage vers ${STUCK_CHECK_SECONDS} s = une recuperation, ordre conserve, une recherche de plus`, tFirst >= STUCK_CHECK_SECONDS - 0.1 && tFirst <= STUCK_CHECK_SECONDS + 0.2 && after >= a, { tFirst, a, after });
    check('cas C : toujours bloquee : ordre termine vers 3 s, failed / unreachable une seule fois, Garde ; le watchdog ne lance aucune tempete', tEnd > tFirst && tEnd <= STUCK_CHECK_SECONDS * 2 + 0.3 && u.order.type === 'guard' && evs.filter((e: any) => e.reason === 'unreachable').length === 1 && after <= 3, { tEnd, evs, after }); }
  // D. Detour valide : la distance a vol d'oiseau augmente d'abord.
  { const w = new World(5); w.setMap(FLAT); w.spawnWallLine('player', 'palisade', { ax: -25, az: 0, bx: 20, bz: 0 }); const u = hero(w, 18, -3);
    w.issueCommand({ kind: 'move', entityIds: [u.id], x: -20, z: 3 }); w.step(DT); const evs: any[] = []; let t = 0; for (; t < 30 * 30 && u.order.type === 'move'; t++) { w.step(DT); evs.push(...w.orderEvents); }
    check('cas D : long detour autour d un mur de 45 cases (on s eloigne d abord) : jamais annule, destination atteinte', evs.some((e: any) => e.outcome === 'completed') && Math.hypot(u.x + 20, u.z - 3) < 1.2 && !evs.some((e: any) => e.outcome === 'failed'), { t: t / 30, evs, at: [u.x, u.z] }); }
  // E. En construction, immobile.
  { const w = new World(5); w.setMap(FLAT); const s = wallSites(w, -1, 0, 1, 0, 8)[0]; const u = hero(w, 0, -1.2); w.issueCommand({ kind: 'build', entityIds: [u.id], targetEntityId: s.id }); let max = 0; let t = 0; for (; t < 30 * 7; t++) { w.step(DT); max = Math.max(max, navigationState(u).stuckCount); }
    check('cas E : en construction, immobile 7 s : jamais detectee bloquee, ordre conserve', max === 0 && u.order.type === 'build' && s.construction !== null, { max, order: u.order }); }
  // Faux positifs : recolte, attaque a portee, Root, Provocation.
  { const w = new World(5); w.setMap(FLAT); const foe = w.spawn('fantassin', 'enemy', 1.0, 0); foe.stats.damage = 0; foe.stats.maxHp = 1e7; foe.hp = 1e7; foe.stats.moveSpeed = 0; const a = w.spawn('fantassin', 'player', 0, 0); a.stats.damage = 1; w.issueCommand({ kind: 'attack', entityIds: [a.id], targetEntityId: foe.id }); let max = 0; for (let t = 0; t < 30 * 6; t++) { w.step(DT); max = Math.max(max, navigationState(a).stuckCount); }
    const { w: w2, u } = mover(4); u.rootTimer = 5; w2.issueCommand({ kind: 'move', entityIds: [u.id], x: 10, z: 0 }); let rootMax = 0; for (let t = 0; t < 30 * 4; t++) { w2.step(DT); rootMax = Math.max(rootMax, navigationState(u).stuckCount); }
    check('faux positifs : attaque a portee, Root : jamais detectes bloques, ordres conserves', max === 0 && a.order.type === 'attack' && rootMax === 0 && u.order.type === 'move', { max, rootMax }); }
  // Hesitation de grande amplitude : bouge beaucoup, n'avance jamais.
  { const { w, u } = mover(4); w.issueCommand({ kind: 'move', entityIds: [u.id], x: 25, z: 0 }); w.step(DT); let t = 0; const evs: any[] = []; for (; t < 30 * 30 && u.order.type === 'move'; t++) { w.step(DT); evs.push(...w.orderEvents); if (t % 45 === 0) { u.x = u.prevX = t % 90 === 0 ? 0 : 3; u.z = u.prevZ = t % 90 === 0 ? 3 : -3; u.path = null; } }
    check('hesitation de grande amplitude (va-et-vient, gros deplacements, aucun gain) : ordre termine malgre tout', u.order.type === 'guard' && t < 30 * 20 && evs.some((e: any) => e.reason === 'unreachable'), { t: t / 30, evs }); }
  // Destination dans un batiment : plus de boucle.
  { const w = new World(5); w.setMap(FLAT); placed(w, 'barracks', 8, 0); const u = hero(w, 0, 0); w.issueCommand({ kind: 'move', entityIds: [u.id], x: 8, z: 0 }); w.step(DT); let t = 0; for (; t < 30 * 12 && u.order.type === 'move'; t++) w.step(DT);
    check('destination dans un batiment : ordre termine, Garde, en quelques secondes', u.order.type === 'guard' && t < 30 * 8, { t: t / 30 }); }
  // Foule : passage etroit, tous passent ou s'arretent proprement, pas d'annulation de masse.
  { const w = new World(5); w.setMap(FLAT);
    const lines = w.spawnWallLine('player', 'palisade', { ax: -1.2, az: 0, bx: 1.2, bz: 0 }, { gates: [0], openGates: true });
    w.spawnWallLine('player', 'palisade', { ax: -25, az: 0, bx: -1.2, bz: 0 }); w.spawnWallLine('player', 'palisade', { ax: 1.2, az: 0, bx: 25, bz: 0 });
    const units = Array.from({ length: 16 }, (_, i) => { const a = w.spawn('fantassin', 'player', -4 + (i % 4) * 2.2, -3 - Math.floor(i / 4) * 2.2); a.order = { type: 'guard' }; return a; });
    w.issueCommand({ kind: 'move', entityIds: units.map((a: any) => a.id), x: 0.5, z: 8 }); const evs: any[] = []; for (let t = 0; t < 30 * 30; t++) { w.step(DT); evs.push(...w.orderEvents); }
    const through = units.filter((a: any) => a.z > 0.5).length;
    const failed = evs.filter((e: any) => e.outcome === 'failed').length;
    console.log(`FOULE 16 unites par une porte : ${through} passees, ${failed} abandons`);
    check('foule a une porte : le trafic se debloque, au moins 14 unites sur 16 passent', through >= 14 && lines.length === 1 && units.every((a: any) => a.order.type !== 'move' || through >= 14), { through, failed }); }
  // Villageois : apres un abandon, autonomie.
  { const w = new World(5); w.setMap({ ...FLAT, obstacles: [{ kind: 'rock', tilesX: 2, tilesZ: 2, cornerX: 8, cornerZ: 8 }] }); const v = villager(w, 0, 0); v.worker.autoRetryIn = 0; v.stats.moveSpeed = 0; const s = wallSites(w, 6, 0, 8, 0)[0]; w.issueCommand({ kind: 'build', entityIds: [v.id], targetEntityId: s.id }); w.step(DT); let t = 0; for (; t < 30 * 6 && v.order.type === 'build'; t++) w.step(DT); const tEnd = t / 30; v.stats.moveSpeed = 3; let auto = false; for (let i = 0; i < 30 * (WORKER_IDLE_SECONDS + 2) && !auto; i++) { w.step(DT); auto = v.order.type === 'harvest'; }
    check('Villageois bloque : ordre abandonne, Garde, puis son autonomie reprend', tEnd < 4 && auto, { tEnd, order: v.order }); }
}

// ==== 5. Charge : scenario volontairement mauvais.
{
  const w = new World(9); w.setMap(FLAT);
  const r = 4; const pts = [[-r, -r], [r, -r], [r, r], [-r, r], [-r, -r]];
  for (let i = 0; i < 4; i++) w.spawnWallLine('player', 'palisade', { ax: pts[i]![0], az: pts[i]![1], bx: pts[i + 1]![0], bz: pts[i + 1]![1] });
  const insideSite = wallSites(w, -1, 1, 1, 1)[0];
  const heroes = Array.from({ length: 20 }, (_, i) => villager(w, -20 + i * 2, -15));
  const a0 = pathSearchStats; const s0 = a0.searches; const rj0 = a0.rejected;
  w.issueCommand({ kind: 'move', entityIds: heroes.slice(0, 10).map((u: any) => u.id), x: 0.5, z: 0.5 });
  w.issueCommand({ kind: 'build', entityIds: heroes.slice(10).map((u: any) => u.id), targetEntityId: insideSite.id });
  const t0 = performance.now();
  let maxStep = 0; let stable = -1; let maxMs = 0;
  for (let t = 0; t < 30 * 10; t++) {
    const b = pathSearchStats.searches; const m0 = performance.now();
    w.step(DT);
    maxMs = Math.max(maxMs, performance.now() - m0);
    maxStep = Math.max(maxStep, pathSearchStats.searches - b);
    if (stable < 0 && heroes.every((u: any) => u.order.type !== 'move' && u.order.type !== 'build')) stable = t / 30;
  }
  const ms = performance.now() - t0;
  const total = pathSearchStats.searches - s0;
  console.log(`CHARGE 20 unites, destinations impossibles : ${total} A* lances, ${pathSearchStats.rejected - rj0} rejetes sans recherche, ${ms.toFixed(0)} ms pour 10 s de jeu, pas le plus long ${maxMs.toFixed(1)} ms, stable a ${stable} s`);
  check('20 unites vers des destinations impossibles : stable en moins de 3 s, au plus quelques A*, jamais plus que la limite par pas', stable >= 0 && stable < 3 && total <= 25 && maxStep <= MAX_PATH_SEARCHES_PER_STEP, { stable, total, maxStep });
  check('10 s de jeu calculees en moins de 2 s, plus aucun A* une fois stable', ms < 2000 && total <= 25, { ms });

  // Grand nombre de recherches LEGITIMES au meme instant : la limite par pas tient.
  const w2 = new World(9); w2.setMap(FLAT);
  w2.spawnWallLine('player', 'palisade', { ax: -25, az: 0, bx: 25, bz: 0 });
  const many = Array.from({ length: 60 }, (_, i) => { const a = w2.spawn('villageois', 'player', -24 + (i % 20) * 2.4, -3 - Math.floor(i / 20) * 2.4); a.order = { type: 'guard' }; a.worker.autoRetryIn = 1e9; return a; });
  w2.issueCommand({ kind: 'move', entityIds: many.map((u: any) => u.id), x: 0, z: 10 });
  let peak = 0; let total2 = 0;
  for (let t = 0; t < 30 * 3; t++) { const b = pathSearchStats.searches; w2.step(DT); const n = pathSearchStats.searches - b; peak = Math.max(peak, n); total2 += n; }
  console.log(`LIMITE 60 unites vers un seul point, mur a contourner : ${total2} A* en 3 s, pointe ${peak} par pas (limite ${MAX_PATH_SEARCHES_PER_STEP})`);
  check(`60 ordres simultanes : jamais plus de ${MAX_PATH_SEARCHES_PER_STEP} A* par pas, repartis sur les pas suivants`, peak <= MAX_PATH_SEARCHES_PER_STEP && total2 >= 6, { peak, total2 });
  // Sans A* : le rejet par region suffit.
  const g = cachedPathGrid(w.obstacles, w.boardWidth, w.boardHeight);
  check('regions connexes : dedans et dehors d un enclos ne sont pas relies ; deux points dehors, si', !sameWalkRegion(g, 0.5, 0.5, -15, -15) && sameWalkRegion(g, 15, 15, -15, -15));
  void distanceToSite; void BUILD_REACH;
}

// ==== 6. Determinisme.
{
  const trace = () => { const w = new World(5); w.setMap(FLAT); placed(w, 'house', -1, -1.35); placed(w, 'house', -1, 1.35); const p = wallSites(w, -7, 0, 7, 0); const u = hero(w, 4, -5); const r = runBuild(w, u, p[2]); return JSON.stringify([r.seconds, r.searches, u.x, u.z]); };
  check('determinisme : meme scene, meme trajet, memes recherches', trace() === trace());
}

console.log(failures ? failures + ' ECHEC(S)' : 'tout OK');
