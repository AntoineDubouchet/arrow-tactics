// Tests cibles SANS NAVIGATEUR de la porte de palissade alliee : fermee (s'ouvre devant l'allie, ennemi bloque), ouverte (Heros et
// unite du joueur passent, ennemi et vague bloques, contournement si une route existe), ennemi qui detruit la porte,
// breche, fermeture differee (allie dans l'ouverture ; un hostile devant la porte (il la frappe) ne la retient pas), portes automatiques, determinisme.
// Usage : node --import ../ts-register.mjs porte-alliee.mts (ou npm run test:sim)
const SRC = new URL('../../src/', import.meta.url).href;
const { World } = await import(SRC + 'sim/world.ts');
const W = await import(SRC + 'core/wallLine.ts');
const R = await import(SRC + 'sim/relations.ts');
const DT = 1 / 30;
let failures = 0;
const check = (label: string, ok: boolean, extra: unknown = '') => { if (!ok) failures++; console.log(`${ok ? 'OK   ' : 'ECHEC'} ${label}${extra !== '' ? ' — ' + JSON.stringify(extra).slice(0, 700) : ''}`); };
const flatMap = (size = 56) => ({ name: 'test', version: 1, width: size, height: size, obstacles: [], playerUnits: [], enemyUnits: [] });
const rad = (d: number) => (d * Math.PI) / 180;
const square = (r: number) => [0, 1, 2, 3].map((i) => ({ x: r * Math.cos(rad(45 + i * 90)), z: r * Math.sin(rad(45 + i * 90)) }));
const inside = (pts: { x: number; z: number }[], x: number, z: number) => { let c = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const a = pts[i]!, b = pts[j]!; if ((a.z > z) !== (b.z > z) && x < ((b.x - a.x) * (z - a.z)) / (b.z - a.z) + a.x) c = !c; } return c; };
const run = (w: any, s: number, each?: () => void) => { for (let i = 0; i < Math.round(s * 30); i++) { w.step(DT); each?.(); } };

/** Enceinte carree (cote ~8,5) avec une porte sur le cote est ; `open` : porte ouverte ; `tough` : murs et porte incassables. */
const setup = (seed: number, open: boolean, tough: boolean) => {
  const w = new World(seed);
  w.setMap(flatMap());
  const pts = square(6);
  const pieces = pts.flatMap((p, i) => { const q = pts[(i + 1) % 4]!; return w.spawnWallLine('player', 'palisade', { ax: p.x, az: p.z, bx: q.x, bz: q.z }); });
  const east = pieces.slice().sort((a: any, b: any) => (b.x - a.x) || (Math.abs(a.z) - Math.abs(b.z)))[0];
  const gate = w.replaceWallSegmentWithGate(east.id)!;
  gate.construction = null; gate.hp = gate.stats.maxHp;
  if (open) { w.setDoorWanted(gate.id, true, 'player'); w.step(DT); }
  const walls = [...pieces.filter((p: any) => p !== east), gate];
  if (tough) for (const p of walls) { p.stats.maxHp = 1e9; p.hp = 1e9; }
  return { w, pts, gate, walls };
};

// ---- Relation generique.
check('relation : canUnitPassGate = porte batie ET unite alliee du proprietaire (areAllied, aucun camp code en dur)',
  R.canUnitPassGate({ team: 'player' }, { owner: 'player', built: true }) && !R.canUnitPassGate({ team: 'enemy' }, { owner: 'player', built: true }) && !R.canUnitPassGate({ team: 'player' }, { owner: 'player', built: false }) && R.canUnitPassGate({ team: 'enemy' }, { owner: 'enemy', built: true }) && R.areAllied('faction-x', 'faction-x'));

// ---- 1. Porte fermee + allie : son chemin passe par elle, elle s'ouvre avant le contact.
{
  const { w, pts, gate } = setup(3, false, true);
  const u = w.spawn('fantassin', 'player', 0, 0);
  w.issueCommand({ kind: 'move', entityIds: [u.id], x: 14, z: 0 });
  const contact = u.stats.radius + gate.footprintObstacle.line.halfWidth;
  let out = false; let crossedClosed = false;
  run(w, 8, () => { if (!inside(pts, u.x, u.z)) out = true; if (!gate.wall.door.open && W.distanceToSegment(u.x, u.z, gate.wall) < contact) crossedClosed = true; });
  check('1. porte fermee + allie (Homme d armes) : elle s ouvre avant le contact, il sort, emprise de la porte dans les obstacles', out && !crossedClosed && w.obstacles.includes(gate.footprintObstacle) && gate.wall.door.open, { x: +u.x.toFixed(2), crossedClosed });
}
// ---- 2. Porte fermee + ennemi : bloque.
{
  const { w, pts } = setup(5, false, true);
  w.assaultGoal = { x: 0, z: 0 };
  const e = w.spawn('maraudeur', 'enemy', 15, 0.3);
  let entered = false; run(w, 15, () => { if (inside(pts, e.x, e.z)) entered = true; });
  check('2. porte fermee + ennemi (marche sur le camp, a l est de la porte) : jamais dedans', !entered, { x: +e.x.toFixed(2), cible: e.targetId });
}
// ---- 3 et 4. Porte ouverte : Heros et unite du joueur passent (par la porte).
for (const [n, kind] of [['3', 'hero'], ['4', 'fantassin']] as const) {
  const { w, pts, gate } = setup(7, true, true);
  const u = kind === 'hero' ? w.spawnHero('player', 0, 0, { xp: 0, level: 1, deaths: 0 }) : w.spawn(kind, 'player', 0, 0);
  w.issueCommand({ kind: 'move', entityIds: [u.id], x: 14, z: 0 });
  let viaGate = false, out = false;
  run(w, 8, () => { if (!out && !inside(pts, u.x, u.z)) { out = true; viaGate = W.distanceToSegment(u.x, u.z, gate.wall) < 1; } });
  check(`${n}. porte ouverte + ${kind === 'hero' ? 'Heros' : 'Homme d armes'} : sort par la porte (emprise toujours dans les obstacles du monde)`, out && viaGate && w.obstacles.includes(gate.footprintObstacle), { out, viaGate, x: +u.x.toFixed(2) });
}
// ---- 5. Porte ouverte + ennemi : ne passe pas (il poursuit un allie enferme).
{
  const { w, pts, gate } = setup(9, true, true);
  const bait = w.spawn('fantassin', 'player', -1, 0); bait.stats.maxHp = 1e9; bait.hp = 1e9;
  w.issueCommand({ kind: 'stop', entityIds: [bait.id] });
  const e = w.spawn('maraudeur', 'enemy', 9, 0);
  let entered = false; let blockedByGate = false;
  run(w, 15, () => { if (inside(pts, e.x, e.z)) entered = true; if (W.distanceToSegment(e.x, e.z, gate.wall) < e.stats.radius + 0.2) blockedByGate = true; });
  check('5. porte ouverte + ennemi (poursuit un allie enferme, juste devant la porte) : ne passe jamais', !entered && gate.wall.door.open, { entered, contactPorte: blockedByGate, x: +e.x.toFixed(2) });
}
// ---- 6. Porte ouverte + vague : ne passe pas ; elle s'en prend aux murs / a la porte.
{
  const { w, pts, gate, walls } = setup(11, true, true);
  w.assaultGoal = { x: 0, z: 0 };
  const wave = [0, 1, 2, 3, 4, 5].map((i) => w.spawn('maraudeur', 'enemy', 16 + (i % 3), -2.5 + i));
  let entered = false, hitsWall = false;
  run(w, 30, () => { if (wave.some((e: any) => e.alive && inside(pts, e.x, e.z))) entered = true; if (wave.some((e: any) => walls.some((p: any) => p.id === e.targetId))) hitsWall = true; });
  check('6. porte ouverte + vague (6 maraudeurs, porte sur leur trajet) : elle se ferme, aucun ne passe, ils frappent la porte / la palissade', !entered && hitsWall && !gate.wall.door.open, { entered, hitsWall });
}
// ---- 7 et 8. L'ennemi detruit la porte ouverte ; breche : tout le monde passe.
{
  const { w, pts, gate } = setup(13, true, false);
  for (const p of w.entities.filter((x: any) => x.wall && x !== gate)) { p.stats.maxHp = 1e9; p.hp = 1e9; }
  w.assaultGoal = { x: -2, z: gate.z };
  const foes = [-0.6, 0, 0.6].map((dz, i) => w.spawn('maraudeur', 'enemy', gate.x + 8 + i, gate.z + dz));
  const e = foes[1];
  let enteredBefore = false;
  let t = 0; for (; t < 30 * 150 && gate.alive; t++) { w.step(DT); if (foes.some((f: any) => inside(pts, f.x, f.z))) enteredBefore = true; }
  const destroyed = !gate.alive && !w.obstacles.includes(gate.footprintObstacle);
  // Breche seule : sans aggro, ils ne s'arretent plus sur les segments voisins (incassables ici) et marchent sur le camp.
  for (const f of foes) { f.stats.aggroRange = 0; f.targetId = null; }
  const ally = w.spawn('fantassin', 'player', -1.5, gate.z); ally.stats.aggroRange = 0;
  w.issueCommand({ kind: 'move', entityIds: [ally.id], x: gate.x + 4, z: gate.z + 3 });
  let enteredAfter = false; run(w, 10, () => { if (foes.some((f: any) => inside(pts, f.x, f.z))) enteredAfter = true; });
  check('7. des ennemis (3 maraudeurs) attaquent la porte ouverte (cible, degats) et la detruit ; jamais entre avant', destroyed && !enteredBefore, { destroyed, s: +(t / 30).toFixed(1) });
  check('8. porte detruite : vraie breche, emprise retiree, les ennemis entrent et un allie sort (tout le monde passe)', destroyed && enteredAfter && !inside(pts, ally.x, ally.z), { enteredAfter, allyOut: !inside(pts, ally.x, ally.z) });
}
// ---- 9. Fermeture : allie dans l'ouverture -> attente ; hostile plaque contre la porte -> ne la retient pas.
{
  const { w, gate } = setup(15, true, true);
  const mid = { x: (gate.wall.ax + gate.wall.bx) / 2, z: (gate.wall.az + gate.wall.bz) / 2 };
  const u = w.spawn('fantassin', 'player', 0, 0);
  w.issueCommand({ kind: 'move', entityIds: [u.id], x: mid.x, z: mid.z, exact: true });
  run(w, 5);
  w.issueCommand({ kind: 'stop', entityIds: [u.id] }); w.step(DT);
  w.setDoorWanted(gate.id, false, 'player');
  run(w, 0.5);
  const waits = gate.wall.door.open === true;
  w.issueCommand({ kind: 'move', entityIds: [u.id], x: -3, z: -3 });
  run(w, 3);
  u.stats.aggroRange = 0;
  const closed = gate.wall.door.open === false && w.obstacles.includes(gate.footprintObstacle);
  // Hostile plaque contre la porte ouverte (bloque par elle) : la fermeture se fait.
  w.setDoorWanted(gate.id, true, 'player'); w.step(DT);
  w.assaultGoal = { x: -2, z: mid.z };
  const e = w.spawn('maraudeur', 'enemy', mid.x + 4, mid.z);
  run(w, 3);
  const pressed = W.distanceToSegment(e.x, e.z, gate.wall) < 1.5 && e.targetId === gate.id;
  w.setDoorWanted(gate.id, false, 'player');
  run(w, 0.3);
  const closedDespiteHostile = gate.wall.door.open === false;
  const refusedEnemy = !w.setDoorWanted(gate.id, true, 'enemy');
  check('9. fermeture : allie dans l ouverture -> attente (sans poussee) ; libre -> fermee ; un hostile plaque contre la porte ne la retient pas ; un autre camp ne peut pas la commander',
    waits && closed && pressed && closedDespiteHostile && refusedEnemy, { waits, closed, pressed, closedDespiteHostile, refusedEnemy });
}
// ---- 11. Portes automatiques.
{
  const { w, pts, gate } = setup(21, true, true);
  const door = gate.wall.door;
  const list = w.obstacles;
  const foe = w.spawn('maraudeur', 'enemy', gate.x + 9, gate.z);
  foe.order = { type: 'guard' }; foe.stats.moveSpeed = 0; foe.stats.damage = 0;
  run(w, 0.3);
  const openFar = door.open;
  foe.x = foe.prevX = gate.x + 4;
  run(w, 0.2);
  const closesNear = !door.open;
  w.setDoorWanted(gate.id, true, 'player');
  run(w, 0.2);
  const manualLoses = !door.open;
  check('11a. hostile a 9 cases : porte ouverte ; a 4 cases : elle se ferme ; rouverte a la main, elle se referme', openFar && closesNear && manualLoses, { openFar, closesNear, manualLoses });

  // Allie qui approche, hostile toujours la : l'allie passe en premier, puis elle se referme.
  const ally = w.spawn('fantassin', 'player', gate.x - 6, gate.z);
  ally.stats.maxHp = 1e9; ally.hp = 1e9;
  w.issueCommand({ kind: 'move', entityIds: [ally.id], x: gate.x + 6, z: gate.z + 3 });
  const contact = ally.stats.radius + gate.footprintObstacle.line.halfWidth;
  let openedAt = -1; let crossedClosed = false; let foeInside = false;
  run(w, 8, () => {
    const d = W.distanceToSegment(ally.x, ally.z, gate.wall);
    if (door.open && openedAt < 0) openedAt = d;
    if (!door.open && d < contact) crossedClosed = true;
    if (inside(pts, foe.x, foe.z)) foeInside = true;
  });
  const passed = !inside(pts, ally.x, ally.z);
  check('11b. allie qui approche, hostile tout pres : elle s ouvre a moins de 2,5 cases et avant le contact, il passe, l hostile non, puis elle se referme', passed && !crossedClosed && !foeInside && openedAt <= 2.6 && openedAt >= contact && !door.open, { passed, crossedClosed, foeInside, openedAt: +openedAt.toFixed(2), open: door.open });

  // Allie immobile pres de la porte : il ne la retient pas.
  w.issueCommand({ kind: 'move', entityIds: [ally.id], x: gate.x - 1.8, z: gate.z });
  run(w, 5);
  w.issueCommand({ kind: 'stop', entityIds: [ally.id] });
  run(w, 1);
  const idleCloses = !door.open;
  // Hostile parti : elle reste comme elle est.
  foe.hp = 0;
  run(w, 1);
  const staysClosed = !door.open;
  check('11c. allie immobile a cote, hostile proche : fermee ; hostile parti : elle reste fermee', idleCloses && staysClosed, { idleCloses, staysClosed });
  check('11d. ouvrir ou fermer ne remplace pas la liste d obstacles : aucune grille A* a refaire', w.obstacles === list);
}

// ---- Pathfinding : ligne ouverte avec porte ouverte -> l'allie passe par la porte, l'ennemi contourne.
{
  const make = () => { const w = new World(17); w.setMap(flatMap()); const pieces = w.spawnWallLine('player', 'palisade', { ax: 0, az: -9, bx: 0, bz: 9 }); const g = w.replaceWallSegmentWithGate(pieces[4].id)!; g.construction = null; for (const p of [...pieces, g]) { p.stats.maxHp = 1e9; p.hp = 1e9; } w.setDoorWanted(g.id, true, 'player'); w.step(DT); return { w, g }; };
  const a = make();
  const ally = a.w.spawn('fantassin', 'player', 4, 0.2);
  a.w.issueCommand({ kind: 'move', entityIds: [ally.id], x: -4, z: 0.2 });
  let allyMaxZ = 0; run(a.w, 6, () => { allyMaxZ = Math.max(allyMaxZ, Math.abs(ally.z)); });
  // Ligne ENNEMIE, porte ouverte (par son camp) : une unite du joueur doit la contourner (meme regle, camps inverses).
  const b = (() => { const w = new World(17); w.setMap(flatMap()); const pieces = w.spawnWallLine('enemy', 'palisade', { ax: 0, az: -9, bx: 0, bz: 9 }); const g = w.replaceWallSegmentWithGate(pieces[4].id)!; g.construction = null; for (const p of [...pieces, g]) { p.stats.maxHp = 1e9; p.hp = 1e9; } w.setDoorWanted(g.id, true, 'enemy'); w.step(DT); return { w, g }; })();
  const foe = b.w.spawn('fantassin', 'player', 4, 0.2); foe.stats.aggroRange = 0;
  b.w.issueCommand({ kind: 'move', entityIds: [foe.id], x: -4, z: 0.2 });
  let foeMaxZ = 0, foeCrossedAtGate = false; let prevX = foe.x;
  run(b.w, 20, () => { foeMaxZ = Math.max(foeMaxZ, Math.abs(foe.z)); if (prevX > 0 && foe.x <= 0 && Math.abs(foe.z) < 1.2) foeCrossedAtGate = true; prevX = foe.x; });
  check('pathfinding : porte ouverte au milieu d une ligne de 18 cases -> l allie du proprietaire passe par la porte (ecart < 1,5) ; une unite hostile au proprietaire (ligne ennemie, unite du joueur ordonnee de l autre cote) CONTOURNE la ligne (|z| > 9), jamais par la porte',
    ally.x < -3 && allyMaxZ < 1.5 && !foeCrossedAtGate && foeMaxZ > 9 && foe.x < 0, { allyX: +ally.x.toFixed(2), allyMaxZ: +allyMaxZ.toFixed(2), foeMaxZ: +foeMaxZ.toFixed(2), foeX: +foe.x.toFixed(2) });
}
// ---- 10. Determinisme.
{
  const once = () => { const { w } = setup(19, true, false); w.assaultGoal = { x: 0, z: 0 }; for (let i = 0; i < 4; i++) w.spawn('maraudeur', 'enemy', 14 + i, -2 + i * 1.3); const h = w.spawnHero('player', 0, 0, { xp: 0, level: 1, deaths: 0 }); w.issueCommand({ kind: 'move', entityIds: [h.id], x: 12, z: 0 }); run(w, 25); return JSON.stringify(w.entities.map((e: any) => [e.id, +e.x.toFixed(6), +e.z.toFixed(6), +e.hp.toFixed(4), e.alive, e.wall?.door?.open ?? null])); };
  check('10. determinisme : deux executions identiques (porte ouverte, vague, Heros qui sort) -> etats identiques', once() === once());
}
console.log(failures ? `${failures} ECHEC(S)` : 'tout OK');
