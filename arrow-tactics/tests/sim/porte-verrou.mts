// Tests cibles SANS NAVIGATEUR des portes manuelles (2026-11-08, decision d'Antoine) : etat initial FERME en mode AUTO
// (camp de depart compris), ouverture automatique devant un allie, verrouillage ferme (plus d'ouverture, allie bloque,
// trajets et collision la traitent comme fermee, fermeture differee si l'ouverture est occupee), retour en mode
// automatique, ennemi toujours bloque, refus (segment, porte d'un autre camp), relation generique, determinisme.
// Usage : node --import ../ts-register.mjs porte-verrou.mts (ou npm run test:sim)
const SRC = new URL('../../src/', import.meta.url).href;
const { World } = await import(SRC + 'sim/world.ts');
const W = await import(SRC + 'core/wallLine.ts');
const R = await import(SRC + 'sim/relations.ts');
const G = await import(SRC + 'sim/geometry.ts');
const SB = await import(SRC + 'config/startingBase.ts');
const { generateSurvivalMap } = await import(SRC + 'config/maps/proceduralSurvival.ts');
const { expandMapCamps } = await import(SRC + 'data/campLayout.ts');
const DT = 1 / 30;
let failures = 0;
const check = (label: string, ok: boolean, extra: unknown = '') => { if (!ok) failures++; console.log(`${ok ? 'OK   ' : 'ECHEC'} ${label}${extra !== '' ? ' — ' + JSON.stringify(extra).slice(0, 700) : ''}`); };
const flatMap = (size = 56) => ({ name: 'test', version: 1, width: size, height: size, obstacles: [], playerUnits: [], enemyUnits: [] });
const rad = (d: number) => (d * Math.PI) / 180;
const square = (r: number) => [0, 1, 2, 3].map((i) => ({ x: r * Math.cos(rad(45 + i * 90)), z: r * Math.sin(rad(45 + i * 90)) }));
const inside = (pts: { x: number; z: number }[], x: number, z: number) => { let c = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const a = pts[i]!, b = pts[j]!; if ((a.z > z) !== (b.z > z) && x < ((b.x - a.x) * (z - a.z)) / (b.z - a.z) + a.x) c = !c; } return c; };
const run = (w: any, s: number, each?: () => void) => { for (let i = 0; i < Math.round(s * 30); i++) { w.step(DT); each?.(); } };

/** Enceinte carree (cote ~8,5), une porte batie sur le cote est, murs incassables. */
const setup = (seed: number) => {
  const w = new World(seed);
  w.setMap(flatMap());
  const pts = square(6);
  const pieces = pts.flatMap((p, i) => { const q = pts[(i + 1) % 4]!; return w.spawnWallLine('player', 'palisade', { ax: p.x, az: p.z, bx: q.x, bz: q.z }); });
  const east = pieces.slice().sort((a: any, b: any) => (b.x - a.x) || (Math.abs(a.z) - Math.abs(b.z)))[0];
  const gate = w.replaceWallSegmentWithGate(east.id)!;
  gate.construction = null; gate.hp = gate.stats.maxHp;
  w.step(DT);
  for (const p of [...pieces.filter((p: any) => p !== east), gate]) { p.stats.maxHp = 1e9; p.hp = 1e9; }
  return { w, pts, gate };
};
const door = (g: any) => g.wall.door;
/** Allie dans la cour qui veut sortir a l'est ; renvoie s'il est sorti et si la porte s'est ouverte. */
const tryExit = (w: any, pts: any, gate: any, seconds = 8) => {
  const u = w.spawn('fantassin', 'player', 0, 0);
  w.issueCommand({ kind: 'move', entityIds: [u.id], x: 14, z: 0 });
  let out = false; let opened = false; let crossedClosed = false;
  const contact = u.stats.radius + gate.footprintObstacle.line.halfWidth;
  run(w, seconds, () => { if (!inside(pts, u.x, u.z)) out = true; if (door(gate).open) opened = true; if (!door(gate).open && W.distanceToSegment(u.x, u.z, gate.wall) < contact - 1e-3) crossedClosed = true; });
  return { u, out, opened, crossedClosed };
};

// ---- Relation generique.
check('relation : une porte verrouillee ne laisse plus passer son proprietaire (ni personne) ; non verrouillee : inchange',
  !R.canUnitPassGate({ team: 'player' }, { owner: 'player', built: true, locked: true }) && R.canUnitPassGate({ team: 'player' }, { owner: 'player', built: true, locked: false }) && R.canUnitPassGate({ team: 'player' }, { owner: 'player', built: true }) && !R.canUnitPassGate({ team: 'enemy' }, { owner: 'player', built: true, locked: false }));

// ---- 0. Etat initial du camp de depart : 4 portes FERMEES, mode AUTO (ni ouvertes, ni verrouillees).
{
  const raw = generateSurvivalMap(12345);
  const L = SB.startingBaseLayoutOf(raw);
  const map = SB.expandStartingBase(expandMapCamps(raw));
  const w = new World(12345);
  w.setMap(map);
  for (const line of L.walls) w.spawnWallLine('player', line.type, line, { gates: line.gates, openGates: line.openGates });
  const gates = w.entities.filter((e: any) => e.wall?.door);
  w.step(DT);
  check('camp de depart : aucune ligne « openGates » ; 4 portes baties, physiquement fermees, non verrouillees, aucune ouverture demandee', L.walls.every((l: any) => l.openGates !== true) && gates.length === 4 && gates.every((g: any) => door(g).built && !door(g).open && !door(g).locked && !door(g).wantOpen), gates.map((g: any) => ({ ...door(g) })));
}
// ---- 1. Fermee + AUTO : s'ouvre devant l'allie, il sort.
{
  const { w, pts, gate } = setup(3);
  const r = tryExit(w, pts, gate);
  check('porte fermee en AUTO : s ouvre devant l allie, il sort sans jamais la traverser fermee', !door(gate).locked && r.out && r.opened && !r.crossedClosed, r);
}
// ---- 2. Verrouillee fermee : reste fermee, l'allie ne sort pas, trajets et collision la bloquent.
{
  const { w, pts, gate } = setup(5);
  const ok = w.setDoorLocked(gate.id, true, 'player');
  w.step(DT);
  const blockedForAlly = G.obstaclesForUnit(w.obstacles, { team: 'player' }).includes(gate.footprintObstacle);
  const r = tryExit(w, pts, gate);
  check('verrouillee : acceptee ; l emprise reste un obstacle POUR L ALLIE (liste par camp renouvelee) ; porte jamais ouverte ; allie jamais sorti, jamais a travers ; son ordre s arrete (aucune route)',
    ok && blockedForAlly && door(gate).locked && !r.opened && !r.out && !r.crossedClosed && r.u.order.type !== 'move' && inside(pts, r.u.x, r.u.z), { ...r, u: undefined, order: r.u.order.type, x: +r.u.x.toFixed(2) });
}
// ---- 3. Verrouillage avec une unite dans l'ouverture : attend, puis se ferme ; retour AUTO : fonctionnement normal.
{
  const { w, pts, gate } = setup(7);
  w.setDoorWanted(gate.id, true, 'player'); w.step(DT);
  const u = w.spawn('fantassin', 'player', gate.x, gate.z);
  u.order = { type: 'guard' };
  w.setDoorLocked(gate.id, true, 'player');
  // Verrouillee, la porte redevient un obstacle pour l'allie : la collision le repousse hors de l'ouverture (comme
  // n'importe quel obstacle), puis la porte se ferme ; elle ne se ferme jamais sur un corps.
  const contact = u.stats.radius + gate.footprintObstacle.line.halfWidth;
  let closedOnBody = false; let closeTick: number | null = null;
  run(w, 2, () => { const inOpening = W.distanceToSegment(u.x, u.z, gate.wall) < contact - 1e-3; if (!door(gate).open && inOpening) closedOnBody = true; if (closeTick === null && !door(gate).open) closeTick = w.tick; });
  const pushedOut = W.distanceToSegment(u.x, u.z, gate.wall) >= contact - 1e-3;
  const closedAfter = door(gate).open === false && door(gate).locked;
  const back = w.setDoorLocked(gate.id, false, 'player'); w.step(DT);
  const r = tryExit(w, pts, gate);
  check('verrouillage avec un allie dans l ouverture : il est repousse hors de l ouverture (obstacle), la porte se ferme ensuite, jamais sur un corps ; « Mode automatique » : elle s ouvre a nouveau devant un allie, il sort', !closedOnBody && pushedOut && closedAfter && closeTick !== null && back && !door(gate).locked && r.out && r.opened, { closedOnBody, pushedOut, closedAfter, closeTick, back, out: r.out, opened: r.opened });
}
// ---- 4. Ennemi : bloque, verrouillee ou non ; verrou sans effet sur lui.
{
  const { w, pts, gate } = setup(9);
  w.setDoorLocked(gate.id, true, 'player');
  w.assaultGoal = { x: 0, z: 0 };
  const e = w.spawn('maraudeur', 'enemy', 15, 0.3);
  let entered = false; run(w, 10, () => { if (inside(pts, e.x, e.z)) entered = true; });
  check('ennemi devant une porte verrouillee : jamais dedans (comme devant une porte automatique)', !entered && !door(gate).open, { x: +e.x.toFixed(2) });
}
// ---- 5. Refus : segment, porte d'un autre camp, porte morte.
{
  const { w, gate } = setup(11);
  const seg = w.entities.find((e: any) => e.wall && !e.wall.door);
  const foeGate = w.spawnWallLine('enemy', 'palisade', { ax: -20, az: -20, bx: -17.6, bz: -20 }, { gates: [0] })[0];
  const segRefused = !w.setDoorLocked(seg.id, true, 'player');
  const foeRefused = !w.setDoorLocked(foeGate.id, true, 'player') && w.setDoorLocked(foeGate.id, true, 'enemy');
  gate.alive = false;
  const deadRefused = !w.setDoorLocked(gate.id, true, 'player');
  check('refus : segment, porte d un autre camp (mais acceptee par son camp), porte detruite', segRefused && foeRefused && deadRefused);
}
// ---- 6. Determinisme.
{
  const go = () => { const { w, pts, gate } = setup(13); w.setDoorLocked(gate.id, true, 'player'); const r = tryExit(w, pts, gate, 3); w.setDoorLocked(gate.id, false, 'player'); run(w, 6); return [+r.u.x.toFixed(4), +r.u.z.toFixed(4), r.u.order.type, door(gate).open]; };
  const a = go(); const b = go();
  check('determinisme : deux executions identiques', JSON.stringify(a) === JSON.stringify(b), a);
}

console.log(failures === 0 ? 'TOUT OK' : `${failures} ECHEC(S)`);
process.exit(failures === 0 ? 0 : 1);
