// Tests cibles SANS NAVIGATEUR de la Palissade V2 : decoupage A -> B (angles), cases A*, collision (Heros,
// Homme d'armes, Cavalier, ennemi) a plusieurs angles, jonctions et enceintes, breche, porte (ouverte, fermee,
// fermeture differee), vague contre une enceinte, construction de A vers B, regles de pose, cout, determinisme,
// performance (10 / 50 / 100 segments).
// Usage : node --import ../ts-register.mjs palissade.mts (ou npm run test:sim)
const SRC = new URL('../../src/', import.meta.url).href;
const { World } = await import(SRC + 'sim/world.ts');
const W = await import(SRC + 'core/wallLine.ts');
const { getWallType, wallLineCost, wallGateCost, wallPieceMaxHp } = await import(SRC + 'data/walls.ts');
const { cachedPathGrid, buildPathGrid, findPath } = await import(SRC + 'sim/pathfinding.ts');
const DT = 1 / 30;
let failures = 0;
const check = (label: string, ok: boolean, extra: unknown = '') => { if (!ok) failures++; console.log(`${ok ? 'OK   ' : 'ECHEC'} ${label}${extra !== '' ? ' — ' + JSON.stringify(extra).slice(0, 900) : ''}`); };
const type = getWallType('palisade');
const flatMap = (size = 48) => ({ name: 'test', version: 1, width: size, height: size, obstacles: [], playerUnits: [], enemyUnits: [] });
const rad = (d: number) => (d * Math.PI) / 180;
const lineAt = (cx: number, cz: number, length: number, angleDeg: number) => {
  const ux = Math.cos(rad(angleDeg)), uz = Math.sin(rad(angleDeg));
  return { ax: cx - ux * length / 2, az: cz - uz * length / 2, bx: cx + ux * length / 2, bz: cz + uz * length / 2 };
};
const side = (l: any, x: number, z: number) => Math.sign((l.bx - l.ax) * (z - l.az) - (l.bz - l.az) * (x - l.ax));

// ---- 1. Decoupage : courte, longue, horizontale, verticale, diagonale, angle quelconque.
{
  const cases = [['courte 1,5', lineAt(0, 0, 1.5, 0)], ['longue 29', lineAt(0, 0, 29, 0)], ['horizontale 10', lineAt(0, 0, 10, 0)], ['verticale 10', lineAt(0, 0, 10, 90)], ['diagonale 10', lineAt(0, 0, 10, 45)], ['angle 17° 9,3', lineAt(0.3, -0.7, 9.3, 17)]] as const;
  const out: any[] = [];
  let ok = true;
  for (const [name, l] of cases) {
    const segs = W.segmentWallLine(l, type.segmentLength);
    const total = segs.reduce((s: number, x: any) => s + W.wallLength(x), 0);
    const chained = segs.every((s: any, i: number) => i === 0 || (Math.abs(s.ax - segs[i - 1].bx) < 1e-9 && Math.abs(s.az - segs[i - 1].bz) < 1e-9));
    const lengths = segs.map((s: any) => W.wallLength(s));
    const regular = Math.max(...lengths) - Math.min(...lengths) < 1e-9 && (segs.length === 1 || Math.min(...lengths) >= type.segmentLength - 1e-9);
    // Cases A* de la ligne centrale : chaine connexe (arete ou coin).
    const cells = segs.flatMap((s: any) => W.wallLineCells(s));
    const connected = cells.every((c: any, i: number) => i === 0 || Math.max(Math.abs(c.x - cells[i - 1].x), Math.abs(c.z - cells[i - 1].z)) <= 1);
    ok &&= chained && regular && Math.abs(total - W.wallLength(l)) < 1e-6 && connected;
    out.push({ name, segments: segs.length, longueur: +lengths[0].toFixed(2), cases: cells.length, chained, connected });
  }
  check('decoupage : segments egaux (>= 2 cases sauf ligne courte), extremites partagees, longueur totale exacte, cases A* connexes, a tout angle', ok, out);
}

// ---- 2. Collision : une unite ordonnee de l'autre cote d'une palissade de 14 cases la contourne, sans la traverser.
const crossTest = (unitId: string, team: 'player' | 'enemy', angle: number, spawnHero = false) => {
  const w = new World(7);
  w.setMap(flatMap());
  const l = lineAt(0, 0, 14, angle);
  const pieces = w.spawnWallLine('player', 'palisade', l);
  const nx = -Math.sin(rad(angle)), nz = Math.cos(rad(angle));
  const u = spawnHero ? w.spawnHero(team, nx * 3, nz * 3, { xp: 0, level: 1, deaths: 0 }) : w.spawn(unitId, team, nx * 3, nz * 3);
  const startSide = side(l, u.x, u.z);
  // Ennemi : pas d'ordre du joueur ; il marche vers le camp (de l'autre cote) et
  // bute sur la palissade, rendue incassable pour ne mesurer que la collision.
  if (team === 'enemy') { w.assaultGoal = { x: -nx * 3, z: -nz * 3 }; for (const p of pieces) { p.stats.maxHp = 1e9; p.hp = 1e9; } }
  else w.issueCommand({ kind: 'move', entityIds: [u.id], x: -nx * 3, z: -nz * 3 });
  let crossed = false, minDist = Infinity;
  for (let i = 0; i < 30 * 25; i++) {
    w.step(DT);
    const t = W.closestOnSegment(u.x, u.z, l).t;
    const d = W.distanceToSegment(u.x, u.z, l);
    if (t > 0.001 && t < 0.999) minDist = Math.min(minDist, d);
    if (t > 0.001 && t < 0.999 && side(l, u.x, u.z) !== startSide && d < 0.6) crossed = true;
    if (Math.hypot(u.x + nx * 3, u.z + nz * 3) < 0.6) break;
  }
  return { arrive: team === 'enemy' ? pieces.some((p: any) => p.hp < 1e9) : Math.hypot(u.x + nx * 3, u.z + nz * 3) < 0.8, crossed, minDist: +minDist.toFixed(3), radius: u.stats.radius };
};
{
  const results: any = {};
  let ok = true;
  for (const [name, id, team, hero] of [['Heros', 'hero', 'player', true], ['Homme d armes', 'fantassin', 'player', false], ['Cavalier', 'cavalier', 'player', false], ['ennemi (maraudeur)', 'maraudeur', 'enemy', false]] as const) {
    for (const angle of [0, 90, 45, 17, 128]) {
      const r = crossTest(id, team as any, angle, hero);
      results[`${name} ${angle}°`] = r;
      // Jamais a travers ; corps jamais plus pres de la ligne que rayon + demi-epaisseur (tolerance 0,02).
      ok &&= r.arrive && !r.crossed && r.minDist >= r.radius + type.halfWidth - 0.02;
    }
  }
  const bad = Object.fromEntries(Object.entries(results).filter(([, r]: any) => !(r.arrive && !r.crossed && r.minDist >= r.radius + type.halfWidth - 0.02)));
  const minMargin = Math.min(...Object.values(results).map((r: any) => r.minDist - r.radius - type.halfWidth));
  check('collision : Heros, Homme d armes, Cavalier et ennemi ordonnes de l autre cote d une palissade de 14 cases (0°, 90°, 45°, 17°, 128°) la contournent et arrivent (ennemi en marche vers le camp : bute et frappe la palissade), sans jamais la traverser ni y entrer', ok, { cas: Object.keys(results).length, ecartMinAuContact: +minMargin.toFixed(3), echecs: bad });
}

// ---- 3. Enceintes fermees (jonctions a angles libres, diagonales) : une unite enfermee ne sort jamais.
const polygon = (cx: number, cz: number, r: number, n: number, rot: number) => Array.from({ length: n }, (_, i) => ({ x: cx + r * Math.cos(rad(rot) + (i * 2 * Math.PI) / n), z: cz + r * Math.sin(rad(rot) + (i * 2 * Math.PI) / n) }));
const enclosure = (w: any, pts: { x: number; z: number }[]) => pts.flatMap((p, i) => { const q = pts[(i + 1) % pts.length]!; return w.spawnWallLine('player', 'palisade', { ax: p.x, az: p.z, bx: q.x, bz: q.z }); });
const inside = (pts: { x: number; z: number }[], x: number, z: number) => { let c = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const a = pts[i]!, b = pts[j]!; if ((a.z > z) !== (b.z > z) && x < ((b.x - a.x) * (z - a.z)) / (b.z - a.z) + a.x) c = !c; } return c; };
{
  const out: any = {};
  let ok = true;
  for (const [name, n, rot] of [['triangle', 3, 10], ['carre a 45° (diamant)', 4, 0], ['carre tourne 30°', 4, 30], ['pentagone', 5, 7], ['hexagone', 6, 0]] as const) {
    for (const unit of ['hero', 'cavalier']) {
      const w = new World(11);
      w.setMap(flatMap());
      const pts = polygon(0, 0, 6, n, rot);
      enclosure(w, pts);
      const u = unit === 'hero' ? w.spawnHero('player', 0, 0, { xp: 0, level: 1, deaths: 0 }) : w.spawn(unit, 'player', 0, 0);
      let escaped = false;
      // Vise successivement chaque sommet (jonction) au-dela de l'enceinte.
      for (let k = 0; k < pts.length && !escaped; k++) {
        const p = pts[k]!;
        w.issueCommand({ kind: 'move', entityIds: [u.id], x: p.x * 1.6, z: p.z * 1.6 });
        for (let i = 0; i < 30 * 5; i++) { w.step(DT); if (!inside(pts, u.x, u.z)) escaped = true; }
      }
      out[`${name} / ${unit}`] = { escaped, x: +u.x.toFixed(2), z: +u.z.toFixed(2) };
      ok &&= !escaped;
    }
  }
  check('jonctions : enceintes fermees (triangle, diamant, carre tourne, pentagone, hexagone) — Heros et Cavalier enfermes poussant vers chaque jonction ne sortent jamais', ok, out);
  // Pathfinding : interieur et exterieur separes dans la grille A*.
  const w = new World(12);
  w.setMap(flatMap());
  const pts = polygon(0, 0, 6, 5, 7);
  enclosure(w, pts);
  const grid = cachedPathGrid(w.obstacles, w.boardWidth, w.boardHeight);
  check('pathfinding : aucune route A* de l interieur d une enceinte fermee vers l exterieur', findPath(grid, 0, 0, 15, 15) === null);
}

// ---- 4. Breche : un segment detruit ouvre le passage, le pathfinding suit.
{
  const out: any = {};
  let ok = true;
  for (const [name, n, rot] of [['carre', 4, 45], ['diamant (diagonales)', 4, 0], ['hexagone', 6, 13]] as const) {
    const w = new World(13);
    w.setMap(flatMap());
    const pts = polygon(0, 0, 6, n, rot);
    const pieces = enclosure(w, pts);
    const u = w.spawn('cavalier', 'player', 0, 0);
    const before = findPath(cachedPathGrid(w.obstacles, w.boardWidth, w.boardHeight), 0, 0, 16, 16);
    // Segment le plus proche du coin (16, 16) detruit.
    const target = pieces.slice().sort((a: any, b: any) => Math.hypot(a.x - 16, a.z - 16) - Math.hypot(b.x - 16, b.z - 16))[0];
    const others = pieces.filter((p: any) => p !== target);
    target.hp = 0;
    w.step(DT);
    const after = findPath(cachedPathGrid(w.obstacles, w.boardWidth, w.boardHeight), 0, 0, 16, 16);
    w.issueCommand({ kind: 'move', entityIds: [u.id], x: 16, z: 16 });
    for (let i = 0; i < 30 * 12; i++) w.step(DT);
    const out1 = Math.hypot(u.x - 16, u.z - 16) < 1;
    out[name] = { avant: before === null, apres: after !== null, sorti: out1, autresDebout: others.every((p: any) => p.alive), emprise: !w.obstacles.includes(target.footprintObstacle) };
    ok &&= before === null && after !== null && out1 && others.every((p: any) => p.alive) && !w.obstacles.includes(target.footprintObstacle);
  }
  check('breche : un segment detruit (le reste de la ligne debout) -> emprise retiree, route A* ouverte, un Cavalier (rayon 0,7) sort par la breche', ok, out);
}

// ---- 5. Porte : chantier, fermee, ouverte, passage, fermeture differee avec une unite dans l'ouverture.
{
  const w = new World(17);
  w.setMap(flatMap());
  const pts = polygon(0, 0, 6, 4, 45);
  const pieces = enclosure(w, pts);
  const seg = pieces.slice().sort((a: any, b: any) => Math.hypot(a.x - 6, a.z) - Math.hypot(b.x - 6, b.z))[0];
  const gate = w.replaceWallSegmentWithGate(seg.id)!;
  const ajout = gate && gate.wall.door && gate.construction !== null && !seg.alive && gate.wall.index === seg.wall.index && Math.abs(gate.wall.ax - seg.wall.ax) < 1e-9;
  const refusChantier = (() => { w.setDoorWanted(gate.id, true, 'player'); w.step(DT); return gate.wall.door.open === false && gate.wall.door.built === false; })();
  gate.construction = null;
  w.setDoorWanted(gate.id, false, 'player');
  const u = w.spawn('fantassin', 'player', 0, 0);
  w.issueCommand({ kind: 'move', entityIds: [u.id], x: 14, z: 0 });
  for (let i = 0; i < 30 * 6; i++) w.step(DT);
  const fermee = !inside(pts, u.x, u.z) && gate.wall.door.open && w.obstacles.includes(gate.footprintObstacle);
  w.setDoorWanted(gate.id, true, 'player');
  w.step(DT);
  const ouverte = gate.wall.door.open && w.obstacles.includes(gate.footprintObstacle);
  w.issueCommand({ kind: 'move', entityIds: [u.id], x: 14, z: 0 });
  let traverse = false;
  for (let i = 0; i < 30 * 8; i++) { w.step(DT); if (!inside(pts, u.x, u.z)) traverse = true; }
  // Unite plantee au milieu de l'ouverture : la fermeture attend.
  const mid = { x: (gate.wall.ax + gate.wall.bx) / 2, z: (gate.wall.az + gate.wall.bz) / 2 };
  w.issueCommand({ kind: 'move', entityIds: [u.id], x: mid.x, z: mid.z, exact: true });
  for (let i = 0; i < 30 * 5; i++) w.step(DT);
  w.issueCommand({ kind: 'stop', entityIds: [u.id] });
  w.step(DT);
  w.setDoorWanted(gate.id, false, 'player');
  for (let i = 0; i < 15; i++) w.step(DT);
  const attend = gate.wall.door.open === true && W.distanceToSegment(u.x, u.z, gate.wall) < u.stats.radius + type.halfWidth;
  w.issueCommand({ kind: 'move', entityIds: [u.id], x: 14, z: 0 });
  for (let i = 0; i < 30 * 4; i++) w.step(DT);
  const fermeApres = gate.wall.door.open === false && w.obstacles.includes(gate.footprintObstacle);
  check('porte : remplace un segment (meme geometrie, chantier) ; chantier jamais ouvert ; fermee -> elle s ouvre devant l allie, il sort ; ouverte -> passage pour son camp (emprise gardee pour les hostiles), il sort ; fermeture demandee avec une unite dans l ouverture -> attend ; ouverture libre -> se ferme',
    ajout && refusChantier && fermee && ouverte && traverse && attend && fermeApres, { ajout, refusChantier, fermee, ouverte, traverse, attend, fermeApres, gateHp: gate.stats.maxHp, segHp: seg.stats.maxHp });
}

// ---- 6. Vague : des ennemis marchant vers le camp butent sur l'enceinte, l'attaquent, ouvrent une breche.
{
  const w = new World(19);
  w.setMap(flatMap(64));
  const pts = polygon(0, 0, 7, 6, 0);
  const pieces = enclosure(w, pts);
  w.assaultGoal = { x: 0, z: 0 };
  const enemies = [0, 1, 2, 3].map((i) => w.spawn('maraudeur', 'enemy', 20 + i * 0.9, 1.5 * i));
  let insideBeforeBreach = false, firstBreach = -1, wallTargeted = false;
  for (let i = 0; i < 30 * 90; i++) {
    w.step(DT);
    const breach = pieces.some((p: any) => !p.alive);
    if (breach && firstBreach < 0) firstBreach = i;
    if (!breach && enemies.some((e: any) => e.alive && inside(pts, e.x, e.z))) insideBeforeBreach = true;
    if (enemies.some((e: any) => e.targetId !== null && pieces.some((p: any) => p.id === e.targetId))) wallTargeted = true;
    if (breach && enemies.some((e: any) => inside(pts, e.x, e.z))) break;
  }
  const entered = enemies.some((e: any) => inside(pts, e.x, e.z));
  check('vague : les ennemis butent sur l enceinte (jamais dedans avant une breche), ciblent la palissade, la percent et entrent par la breche',
    wallTargeted && firstBreach >= 0 && !insideBeforeBreach && entered, { wallTargeted, breche_s: +(firstBreach / 30).toFixed(1), insideBeforeBreach, entered, morts: pieces.filter((p: any) => !p.alive).length });
}

// ---- 7. Construction : chantiers, le Heros bâtit de A vers B, PV de longueur.
{
  const w = new World(23);
  w.setMap(flatMap());
  const l = lineAt(0, 4, 11, 20);
  const pieces = w.spawnWallLine('player', 'palisade', l, { construction: true });
  const hero = w.spawnHero('player', l.ax - 1, l.az - 1, { xp: 0, level: 1, deaths: 0 });
  w.issueCommand({ kind: 'build', entityIds: [hero.id], targetEntityId: pieces[0].id });
  const order: number[] = [];
  for (let i = 0; i < 30 * 60 && order.length < pieces.length; i++) {
    w.step(DT);
    for (const ev of w.heroEvents) if (ev.type === 'built') order.push(pieces.findIndex((p: any) => p.id === ev.buildingId));
  }
  const len = W.wallLength(pieces[0].wall);
  const hpOk = pieces.every((p: any) => Math.abs(p.stats.maxHp - wallPieceMaxHp(type, 'segment', W.wallLength(p.wall))) < 1e-9 && p.hp === p.stats.maxHp);
  check('construction : chaque segment est un chantier ; le Heros les bâtit dans l ordre de A vers B ; PV pleins de la longueur (15 PV / case)',
    order.join(',') === pieces.map((_: any, i: number) => i).join(',') && hpOk && pieces.every((p: any) => p.construction === null), { order, segments: pieces.length, longueur: +len.toFixed(2), pv: pieces[0].stats.maxHp / 10 });
}

// ---- 8. Regles de pose (checkWallLine, contexte factice) et cout.
{
  const ctx = (over: any = {}) => ({ isCell: (x: number, z: number) => Math.abs(x) < 20 && Math.abs(z) < 20, isWater: (x: number, z: number) => x > 10 && x < 12, crossesCliff: () => false, obstacles: [{ minX: -2, maxX: -1, minZ: 5, maxZ: 6 }], buildings: [{ minX: 3, maxX: 6, minZ: -9, maxZ: -6 }], walls: [{ ax: -10, az: 0, bx: -4, bz: 0 }], bodies: [{ x: 0, z: 14, r: 0.45 }], ...over });
  const plan = (ax: number, az: number, bx: number, bz: number) => W.planWallLine({ x: ax, z: az }, { x: bx, z: bz }, type, ctx());
  const r = {
    valide: plan(0, -3, 6, 2).issue,
    eau: plan(8, 3, 14, 3).issue,
    batiment: plan(0, -7.5, 9, -7.5).issue,
    horsCarte: plan(15, 0, 25, 0).issue,
    arbre: plan(-4, 5.5, 2, 5.5).issue,
    unite: plan(-3, 14, 3, 14).issue,
    croisement: plan(-7, -3, -7, 3).issue,
    chevauchement: plan(-9, 0.2, -5, 0.2).issue,
    jonctionBout: plan(-4.3, 0.2, -1, 4).issue,
    jonctionT: plan(-7, 0.3, -7, 5).issue,
    prolongement: plan(-4.1, 0, 0, 0).issue,
    tropCourt: plan(0, 0, 0.5, 0).issue,
    tropLong: plan(-15, -15, 15, 15).issue,
  };
  const ok = r.valide === null && r.eau === 'water' && r.batiment === 'building' && r.horsCarte === 'out-of-map' && r.arbre === 'obstacle' && r.unite === 'unit' && r.croisement === 'crossing' && r.chevauchement === 'overlap' && r.jonctionBout === null && r.jonctionT === null && r.prolongement === null && r.tropCourt === 'too-short' && r.tropLong === 'too-long';
  check('pose : valide ; refus eau, batiment, hors carte, arbre, unite sur le trace, croisement franc, chevauchement ; jonctions (bout, T, prolongement) acceptees ; trop court / trop long refuses', ok, r);
  const c74 = wallLineCost(type, 7.4), c2 = wallLineCost(type, 2), g = wallGateCost(type);
  check('cout : 0,5 bois par case arrondi au superieur (7,4 cases -> 4 bois ; 2 cases -> 1 bois), porte 4 bois, aucune pierre', c74.wood === 4 && c2.wood === 1 && g.wood === 4 && c74.stone === 0, { c74, c2, g });
}

// ---- 9. Determinisme : meme scenario, meme graine -> meme etat.
{
  const run = () => {
    const w = new World(29);
    w.setMap(flatMap(64));
    const pieces = enclosure(w, polygon(0, 0, 7, 5, 3));
    w.assaultGoal = { x: 0, z: 0 };
    for (let i = 0; i < 5; i++) w.spawn('maraudeur', 'enemy', 18 + i, -3 + i * 1.3);
    for (let i = 0; i < 30 * 40; i++) w.step(DT);
    return JSON.stringify([w.entities.map((e: any) => [e.id, +e.x.toFixed(6), +e.z.toFixed(6), +e.hp.toFixed(4), e.alive]), pieces.map((p: any) => p.hp)]);
  };
  check('determinisme : deux executions identiques (graine fixe, palissade attaquee) -> etats identiques', run() === run());
}

// ---- 10. Performance : 10 / 50 / 100 segments (grille A*, collision, pas complet).
{
  const res: any = {};
  for (const n of [10, 50, 100]) {
    const w = new World(31);
    w.setMap(flatMap(96));
    // n segments de 2 cases en plusieurs lignes paralleles.
    let made = 0, row = 0;
    while (made < n) {
      const count = Math.min(12, n - made);
      w.spawnWallLine('player', 'palisade', { ax: -12, az: -30 + row * 5, bx: -12 + count * 2, bz: -30 + row * 5 + count * 0.7 });
      made += count;
      row++;
    }
    const units = Array.from({ length: 60 }, (_, i) => w.spawn('fantassin', i % 2 ? 'player' : 'enemy', -30 + (i % 10) * 6, -35 + Math.floor(i / 10) * 11));
    for (const u of units) w.issueCommand({ kind: 'move', entityIds: [u.id], x: -u.x, z: -u.z });
    let t0 = performance.now();
    for (let i = 0; i < 20; i++) buildPathGrid(w.obstacles, w.boardWidth, w.boardHeight);
    const grid = (performance.now() - t0) / 20;
    for (let i = 0; i < 30; i++) w.step(DT);
    t0 = performance.now();
    for (let i = 0; i < 90; i++) w.step(DT);
    const step = (performance.now() - t0) / 90;
    res[`${n} segments`] = { pieces: w.entities.filter((e: any) => e.wall).length, obstacles: w.obstacles.length, grilleA_ms: +grid.toFixed(2), pas_ms: +step.toFixed(2) };
  }
  console.log('PERF', JSON.stringify(res));
  check('performance : 100 segments -> grille A* < 15 ms, pas complet (60 unites) < 12 ms', res['100 segments'].grilleA_ms < 15 && res['100 segments'].pas_ms < 12, res);
}

console.log(failures ? `${failures} ECHEC(S)` : 'tout OK');
