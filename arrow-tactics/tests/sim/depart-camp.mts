// Tests cibles SANS NAVIGATEUR du camp de depart et de KI-65 (2026-11-04) :
//  - preset « basic-camp » (4 rotations) : batiments sans chevauchement, dans l'enceinte, loin des murs ; Heros et
//    Villageois dans la cour ; quatre portes posees fermees, automatiques (2026-11-08 ; ouvertes de G48 a G50) ;
//  - lot de graines : zone reservee propre (cases, eau, relief, arbres, gisements, decors, tas, camps), puis dans le
//    monde reel (Baliste, Auberge, 2 Maisons, enceinte, porte ouverte) : le Heros SORT par la porte, rejoint chaque
//    camp neutre et le pied de CHAQUE gisement en vrai deplacement (aucune teleportation hors du depart), les
//    Villageois sortent, un ennemi ne passe pas la porte ouverte ; aucun passage d'une case contre un gisement ;
//  - recolte libre (bois, pierre, or) sans aucun batiment (2026-11-05, G37) ; population ; determinisme ;
//  - gisements garantis du camp (2026-11-05) : 1 pierre + 1 or dans l'enceinte, hors batiments / Baliste / places /
//    axe de la porte, a >= 1 case des murs (4 rotations) ; dans le monde : sources presentes, atteintes par le Heros
//    depuis la cour, aucun passage d'une case, jamais ecrits dans la carte (expandStartingBase a la consommation).
// Usage : node --import ../ts-register.mjs depart-camp.mts (ou npm run test:sim)
const SRC = new URL('../../src/', import.meta.url).href;
const { World } = await import(SRC + 'sim/world.ts');
const { getBuilding, buildingFootprintTiles } = await import(SRC + 'data/buildings.ts');
const { generateSurvivalMap } = await import(SRC + 'config/maps/proceduralSurvival.ts');
const { expandMapCamps, campLayoutOf } = await import(SRC + 'data/campLayout.ts');
const SB = await import(SRC + 'config/startingBase.ts');
const { computeBallistaObstacle, CAMP_CLEAR_RADIUS } = await import(SRC + 'config/mapDef.ts');
const { segmentWallLine, segmentBoxDistance } = await import(SRC + 'core/wallLine.ts');
const { getWallType } = await import(SRC + 'data/walls.ts');
const { cachedPathGrid } = await import(SRC + 'sim/pathfinding.ts');
const { terrainObstacles } = await import(SRC + 'sim/geometry.ts');
const { populationOfEntities } = await import(SRC + 'data/population.ts');
const { VISION_RADIUS } = await import(SRC + 'data/vision.ts');
const DT = 1 / 30;
let failures = 0;
const check = (label: string, ok: boolean, extra: unknown = '') => { if (!ok) failures++; console.log(`${ok ? 'OK   ' : 'ECHEC'} ${label}${extra !== '' ? ' — ' + JSON.stringify(extra).slice(0, 1200) : ''}`); };
const rectOf = (b: { buildingId: string; x: number; z: number }) => { const { tilesX, tilesZ } = buildingFootprintTiles(b.buildingId); return { minX: b.x - tilesX / 2, maxX: b.x + tilesX / 2, minZ: b.z - tilesZ / 2, maxZ: b.z + tilesZ / 2 }; };
const overlap = (a: any, b: any) => a.minX < b.maxX && b.minX < a.maxX && a.minZ < b.maxZ && b.minZ < a.maxZ;
const inside = (r: any, x: number, z: number, m = 0) => x > r.minX + m && x < r.maxX - m && z > r.minZ + m && z < r.maxZ - m;
// Enceinte arrondie (addendum 2026-11-04) : interieur = disque de l'apotheme du polygone.
const ENC = SB.getStartingBasePreset('basic-camp').enclosure;
const IN_R = ENC.radius * Math.cos(Math.PI / ENC.sides);
const insideCamp = (o: any, x: number, z: number, m = 0) => Math.hypot(x - o.x, z - o.z) < IN_R - m;

// ---- 1. Preset : geometrie, 4 rotations.
{
  const res: any[] = [];
  const L0 = SB.startingBaseLayoutAt({ x: 0.5, z: 0.5 }, 'basic-camp', 0);
  for (let r = 0; r < 4; r++) {
    const L = SB.startingBaseLayoutAt({ x: 0.5, z: 0.5 }, 'basic-camp', r);
    const ballista = { minX: L.ballista.x - 1.5, maxX: L.ballista.x + 1.5, minZ: L.ballista.z - 1.5, maxZ: L.ballista.z + 1.5 };
    const rects = L.buildings.map(rectOf);
    const noOverlap = rects.every((a: any, i: number) => !overlap(a, ballista) && rects.every((b: any, j: number) => i === j || !overlap(a, b)));
    const inBounds = rects.every((q: any) => [[q.minX, q.minZ], [q.maxX, q.minZ], [q.minX, q.maxZ], [q.maxX, q.maxZ]].every(([x, z]) => insideCamp(L.origin, x!, z!)));
    const segs = L.walls.flatMap((w: any) => segmentWallLine(w, getWallType(w.type).segmentLength));
    const clearance = Math.min(...rects.flatMap((q: any) => segs.map((s: any) => segmentBoxDistance(s, q))));
    const people = [L.hero, ...L.units];
    const peopleOk = people.every((p: any) => insideCamp(L.origin, p.x, p.z, 1) && !rects.some((q: any) => inside(q, p.x, p.z, -0.6)) && !inside(ballista, p.x, p.z, -0.6));
    const gates = L.walls.filter((w: any) => w.gates?.length);
    // Gisements garantis : emprise 2 x 2 (coin = centre - 1).
    const depRects = L.deposits.map((d: any) => ({ minX: d.x - 1, maxX: d.x + 1, minZ: d.z - 1, maxZ: d.z + 1 }));
    const gateMids = gates.map((gate: any) => ({ x: (gate.ax + gate.bx) / 2, z: (gate.az + gate.bz) / 2 }));
    // Axe Baliste -> chaque porte : distance a ce segment > 2 cases.
    const clearOfAxes = (q: any) => gateMids.every((gm: any) => segmentBoxDistance({ ax: L.origin.x, az: L.origin.z, bx: gm.x, bz: gm.z }, q) > 2);
    const axisClear = depRects.every(clearOfAxes);
    const depOk = depRects.length === 2 && L.deposits.map((d: any) => d.resource).sort().join() === 'gold,stone'
      && depRects.every((q: any, i: number) => !overlap(q, ballista) && rects.every((b: any) => !overlap(q, b)) && depRects.every((o: any, j: number) => i === j || !overlap(q, o)))
      && depRects.every((q: any) => [[q.minX, q.minZ], [q.maxX, q.minZ], [q.minX, q.maxZ], [q.maxX, q.maxZ]].every(([x, z]) => insideCamp(L.origin, x!, z!, 1)))
      && Math.min(...depRects.flatMap((q: any) => segs.map((s: any) => segmentBoxDistance(s, q)))) >= 1.0
      && people.every((p: any) => !depRects.some((q: any) => inside(q, p.x, p.z, -0.6)))
      && axisClear
      && L.deposits.every((d: any) => Number.isInteger(d.x) && Number.isInteger(d.z));
    // Bosquet garanti (2026-11-05) : >= 6 arbres 1 x 1 sur des cases entieres, groupes (chaque arbre a un voisin a
    // 1 case, amas de diametre <= 5), dans l'enceinte, sans chevauchement, hors places, loin de l'axe de la porte,
    // a >= 1 case des murs, a >= 2 cases des batiments / gisements (aucun passage d'une case).
    const treeRects = L.trees.map((t: any) => ({ minX: t.x - 0.5, maxX: t.x + 0.5, minZ: t.z - 0.5, maxZ: t.z + 0.5 }));
    const treeOk = L.trees.length >= 6
      && L.trees.every((t: any) => Math.abs(t.x - Math.floor(t.x) - 0.5) < 1e-9 && Math.abs(t.z - Math.floor(t.z) - 0.5) < 1e-9)
      && L.trees.every((t: any, i: number) => L.trees.some((u: any, j: number) => i !== j && Math.abs(t.x - u.x) + Math.abs(t.z - u.z) === 1))
      && Math.max(...L.trees.flatMap((t: any) => L.trees.map((u: any) => Math.max(Math.abs(t.x - u.x), Math.abs(t.z - u.z))))) <= 5
      && treeRects.every((q: any, i: number) => !overlap(q, ballista) && rects.every((b: any) => !overlap(q, b)) && depRects.every((o: any) => !overlap(q, o)) && treeRects.every((o: any, j: number) => i === j || !overlap(q, o)))
      && treeRects.every((q: any) => [[q.minX, q.minZ], [q.maxX, q.minZ], [q.minX, q.maxZ], [q.maxX, q.maxZ]].every(([x, z]) => insideCamp(L.origin, x!, z!, 1)))
      && Math.min(...treeRects.flatMap((q: any) => segs.map((s: any) => segmentBoxDistance(s, q)))) >= 1.0
      && treeRects.every((q: any) => [...rects, ...depRects].every((b: any) => Math.max(b.minX - q.maxX, q.minX - b.maxX, b.minZ - q.maxZ, q.minZ - b.maxZ) >= 2))
      && people.every((p: any) => !treeRects.some((q: any) => inside(q, p.x, p.z, -0.6)))
      && treeRects.every(clearOfAxes);
    res.push({ r, treeOk, trees: L.trees.length, noOverlap, inBounds, clearance: +clearance.toFixed(2), peopleOk, gates: gates.length, closedAuto: gates.every((g: any) => !g.openGates), pieces: segs.length, houses: L.buildings.filter((b: any) => b.buildingId === 'house').map((b: any) => b.modelVariant), tavern: L.buildings.filter((b: any) => b.buildingId === 'tavern').length, villagers: L.units.filter((u: any) => u.unitId === 'villageois').length, depOk, deposits: L.deposits.map((d: any) => [d.resource, d.x, d.z]) });
  }
  check('gisements garantis, 4 rotations : 1 pierre + 1 or, emprises 2 x 2 sur cases entieres, dans l enceinte (coins a >= 1 case), sans chevauchement (Baliste, batiments, entre eux), hors places d apparition, loin des axes des 4 portes (> 2 cases), a >= 1 case des murs',
    res.every((q) => q.depOk), res.map((q) => [q.r, q.depOk, q.deposits]));
  check('bosquet garanti, 4 rotations : >= 6 arbres 1 x 1 groupes, dans l enceinte, sans chevauchement (Baliste, batiments, gisements, entre eux), a >= 2 cases des batiments et gisements, hors places, loin des axes des 4 portes, a >= 1 case des murs',
    res.every((q) => q.treeOk), res.map((q) => [q.r, q.treeOk, q.trees]));
  check('preset basic-camp, 4 rotations : Hotel de ville, 2 Maisons (A, B) + 1 Auberge sans chevauchement (ni Baliste), dans l enceinte, a >= 1,5 case des murs ; Heros et 2 Villageois dans la cour, hors emprises ; 4 portes posees FERMEES en mode automatique (2026-11-08) ; 36 pieces (dodecagone de rayon 15, 20 lignes)',
    res.every((q) => q.noOverlap && q.inBounds && q.clearance >= 1.5 && q.peopleOk && q.gates === 4 && q.closedAuto && q.pieces === 36 && L0.walls.length === 20 && JSON.stringify(q.houses) === '[0,1]' && q.tavern === 1 && q.villagers === 2), res);
}

// ---- 2. Lot de graines.
const SEEDS = [1, 2, 3, 7, 42, 99, 777, 4242, 12345, 99999, 31337, 2024];
const summary: any[] = [];
let genMs = 0;
for (const seed of SEEDS) {
  const t0 = performance.now();
  const raw = generateSurvivalMap(seed);
  genMs += performance.now() - t0;
  const L = SB.startingBaseLayoutOf(raw);
  const row: any = { seed, rotation: L?.rotation };
  if (!L) { row.err = 'aucun camp de depart'; summary.push(row); continue; }
  // 2a. Zone reservee propre.
  const cells = new Set(raw.cells.map((c: any) => `${c.x},${c.z}`));
  const water = new Set((raw.surfaceCells ?? []).filter((s: any) => s.surface === 'eau').map((s: any) => `${s.x},${s.z}`));
  const elev = new Set((raw.elevationCells ?? []).map((e: any) => `${e.x},${e.z}`));
  const zone = SB.reservedCells(L.reserved);
  row.zone = {
    cells: zone.length,
    horsCarte: zone.filter((c: any) => !cells.has(`${c.x},${c.z}`)).length,
    eau: zone.filter((c: any) => water.has(`${c.x},${c.z}`)).length,
    relief: zone.filter((c: any) => elev.has(`${c.x},${c.z}`)).length,
    // Par case (comme le generateur) : case du centre, ou une case d un gisement 2 x 2.
    obstacles: raw.obstacles.filter((o: any) => o.kind === 'rock' ? [0, 1].some((dx) => [0, 1].some((dz) => SB.reservedContainsCell(L.reserved, o.cornerX + dx, o.cornerZ + dz))) : SB.reservedContainsCell(L.reserved, Math.floor(o.x ?? o.cornerX), Math.floor(o.z ?? o.cornerZ))).length,
    // Par case, comme le generateur (un tas est decale dans sa case).
    tas: (raw.resourcePiles ?? []).filter((p: any) => SB.reservedContainsCell(L.reserved, Math.floor(p.x), Math.floor(p.z))).length,
    camps: raw.camps.filter((c: any) => Math.hypot(c.x - L.reserved.x, c.z - L.reserved.z) - L.reserved.radius < CAMP_CLEAR_RADIUS + 5).length,
  };
  // 2b. Monde reel : carte (camps derives, gisements garantis du camp), Baliste, batiments, enceinte, Heros, Villageois. Camps non peuples (pas de combat).
  const map = SB.expandStartingBase(expandMapCamps(raw));
  // Gisements garantis : dans le monde (sources), jamais dans la carte brute ni dans une carte reexportee.
  row.gisementsCamp = { brut: raw.obstacles.filter((o: any) => o.kind === 'rock' && Math.hypot(o.cornerX + 1 - L.origin.x, o.cornerZ + 1 - L.origin.z) < IN_R).length, monde: map.obstacles.length - expandMapCamps(raw).obstacles.length, murs: (map.walls ?? []).length - (raw.walls ?? []).length };
  const w = new World(seed);
  w.setMap(map);
  const campNodes = [...w.resourceNodes.values()].filter((n: any) => insideCamp(L.origin, n.x, n.z));
  row.sourcesCamp = campNodes.map((n: any) => n.resource).sort();
  // Or proche garanti (G46) : un gisement d'or HORS de l'enceinte dont les 4 cases sont dans la vision initiale de la
  // Hotel de ville (VISION_RADIUS.townhall depuis l'origine, centres de cases a < rayon - 0,5), a >= 1 case des murs.
  row.orProche = raw.obstacles.filter((o: any) => o.kind === 'rock' && o.ore === 'gold').filter((o: any) => { const cs = [[0, 0], [1, 0], [0, 1], [1, 1]].map(([dx, dz]) => Math.hypot(o.cornerX + dx + 0.5 - L.origin.x, o.cornerZ + dz + 0.5 - L.origin.z)); return Math.min(...cs) > ENC.radius + 1 && Math.max(...cs) < VISION_RADIUS.townhall - 0.5; }).length;
  // Cour libre : cases a plus d'une case des murs, hors Baliste, batiments, gisements, bosquet (constructibles).
  { const blocked = new Set<string>(); const block = (minX: number, maxX: number, minZ: number, maxZ: number) => { for (let z = Math.floor(minZ); z < Math.ceil(maxZ); z++) for (let x = Math.floor(minX); x < Math.ceil(maxX); x++) blocked.add(x + ',' + z); };
    block(L.ballista.x - 1.5, L.ballista.x + 1.5, L.ballista.z - 1.5, L.ballista.z + 1.5);
    for (const b of L.buildings) { const t = buildingFootprintTiles(b.buildingId); block(b.x - t.tilesX / 2, b.x + t.tilesX / 2, b.z - t.tilesZ / 2, b.z + t.tilesZ / 2); }
    for (const d of L.deposits) block(d.x - 1, d.x + 1, d.z - 1, d.z + 1);
    for (const t of L.trees) block(t.x - 0.5, t.x + 0.5, t.z - 0.5, t.z + 0.5);
    let free = 0; for (let z = Math.floor(L.origin.z - 16); z <= L.origin.z + 16; z++) for (let x = Math.floor(L.origin.x - 16); x <= L.origin.x + 16; x++) if (insideCamp(L.origin, x + 0.5, z + 0.5, 1) && !blocked.has(x + ',' + z)) free++;
    row.courLibre = free; }
  w.spawnBuilding(getBuilding('ballista'), 'player', L.ballista.x, L.ballista.z, computeBallistaObstacle(L.ballista));
  for (const b of L.buildings) { const { tilesX, tilesZ } = buildingFootprintTiles(b.buildingId); w.spawnBuilding(getBuilding(b.buildingId), 'player', b.x, b.z, { kind: 'building', x: b.x, z: b.z, tilesX, tilesZ }); }
  for (const line of L.walls) w.spawnWallLine('player', line.type, line, { gates: line.gates, openGates: line.openGates });
  for (const d of map.destructibles ?? []) w.addDestructible(d.kind, d.x, d.z);
  const hero = w.spawnHero('player', L.hero.x, L.hero.z, { xp: 0, level: 1, deaths: 0 });
  const vils = L.units.map((u: any) => w.spawn(u.unitId, 'player', u.x, u.z));
  const gateDir = SB.startingBaseLayoutAt({ x: 0, z: 0 }, 'basic-camp', L.rotation).walls.find((wl: any) => wl.gates)!;
  const gm = { x: (gateDir.ax + gateDir.bx) / 2, z: (gateDir.az + gateDir.bz) / 2 };
  const glen = Math.hypot(gm.x, gm.z);
  const exit = { x: L.origin.x + gm.x + (gm.x / glen) * 5, z: L.origin.z + gm.z + (gm.z / glen) * 5 };
  row.pop = populationOfEntities(w.entities);
  const goTo = (u: any, x: number, z: number, maxS: number, reach: number) => {
    w.issueCommand({ kind: 'move', entityIds: [u.id], x, z });
    for (let i = 0; i < Math.round(maxS * 30); i++) { w.step(DT); if (Math.hypot(u.x - x, u.z - z) <= reach) return true; if (i > 30 && u.order.type !== 'move' && Math.hypot(u.x - x, u.z - z) > reach + 0.6) return false; }
    return Math.hypot(u.x - x, u.z - z) <= reach;
  };
  row.sortieHeros = goTo(hero, exit.x, exit.z, 12, 1.2) && !insideCamp(L.origin, hero.x, hero.z);
  row.sortieVillageois = vils.map((v: any) => goTo(v, exit.x, exit.z, 15, 1.6) && !insideCamp(L.origin, v.x, v.z)).every(Boolean);
  // Camps neutres : depuis la sortie, jusqu'au feu de camp.
  const back = () => { hero.x = hero.prevX = exit.x; hero.z = hero.prevZ = exit.z; hero.order = { type: 'guard' }; hero.path = null; };
  row.camps = raw.camps.map((c: any) => { back(); return goTo(hero, c.x, c.z, 30, 1.6); });
  // Gisements : case libre de l'anneau la plus proche de la sortie.
  const terrain = cachedPathGrid(terrainObstacles(w.obstacles, w.entities), w.boardWidth, w.boardHeight);
  const blocked = (x: number, z: number) => { const ix = x + terrain.halfW, iz = z + terrain.halfH; return ix < 0 || iz < 0 || ix >= terrain.width || iz >= terrain.height || terrain.blocked[iz * terrain.width + ix] === 1 || !cells.has(`${x},${z}`) || water.has(`${x},${z}`); };
  const rocks = raw.obstacles.filter((o: any) => o.kind === 'rock');
  let deposits = 0; const ratees: any[] = []; let narrow = 0;
  for (const r of rocks) {
    const ring: { x: number; z: number; ox: number; oz: number }[] = [];
    for (let i = 0; i < 2; i++) { ring.push({ x: r.cornerX + i, z: r.cornerZ - 1, ox: 0, oz: -1 }, { x: r.cornerX + i, z: r.cornerZ + 2, ox: 0, oz: 1 }, { x: r.cornerX - 1, z: r.cornerZ + i, ox: -1, oz: 0 }, { x: r.cornerX + 2, z: r.cornerZ + i, ox: 1, oz: 0 }); }
    // Passage d'une case contre le gisement : case de l'anneau libre, sa voisine exterieure bloquee.
    for (const c of ring) if (!blocked(c.x, c.z) && blocked(c.x + c.ox, c.z + c.oz)) narrow++;
    const target = ring.filter((c) => !blocked(c.x, c.z)).sort((a, b) => Math.hypot(a.x - exit.x, a.z - exit.z) - Math.hypot(b.x - exit.x, b.z - exit.z))[0];
    back();
    if (target && goTo(hero, target.x + 0.5, target.z + 0.5, 30, 1.0)) deposits++;
    else ratees.push({ x: r.cornerX, z: r.cornerZ, ore: r.ore ?? 'pierre', hero: [+hero.x.toFixed(1), +hero.z.toFixed(1)] });
  }
  row.gisements = `${deposits}/${rocks.length}`;
  row.passagesUneCase = narrow;
  if (ratees.length) row.ratees = ratees.slice(0, 4);
  // Sources du camp (gisements 2 x 2, arbres du bosquet 1 x 1) : atteintes depuis la cour (vrai deplacement), aucun
  // passage d'une case autour (case de l'anneau libre dont la voisine exterieure est bloquee : aucune case enclavee).
  let campReached = 0; let campNarrow = 0;
  for (const n of campNodes) {
    const ring: { x: number; z: number; ox: number; oz: number }[] = [];
    if (n.resource === 'wood') {
      const cx = Math.floor(n.x), cz = Math.floor(n.z);
      ring.push({ x: cx, z: cz - 1, ox: 0, oz: -1 }, { x: cx, z: cz + 1, ox: 0, oz: 1 }, { x: cx - 1, z: cz, ox: -1, oz: 0 }, { x: cx + 1, z: cz, ox: 1, oz: 0 });
    } else {
      const cx = Math.round(n.x) - 1, cz = Math.round(n.z) - 1;
      for (let i = 0; i < 2; i++) { ring.push({ x: cx + i, z: cz - 1, ox: 0, oz: -1 }, { x: cx + i, z: cz + 2, ox: 0, oz: 1 }, { x: cx - 1, z: cz + i, ox: -1, oz: 0 }, { x: cx + 2, z: cz + i, ox: 1, oz: 0 }); }
    }
    for (const c of ring) if (!blocked(c.x, c.z) && blocked(c.x + c.ox, c.z + c.oz)) campNarrow++;
    hero.x = hero.prevX = L.hero.x; hero.z = hero.prevZ = L.hero.z; hero.order = { type: 'guard' }; hero.path = null;
    const target = ring.filter((c) => !blocked(c.x, c.z)).sort((a, b) => Math.hypot(a.x - L.hero.x, a.z - L.hero.z) - Math.hypot(b.x - L.hero.x, b.z - L.hero.z))[0];
    if (target && goTo(hero, target.x + 0.5, target.z + 0.5, 20, 1.0)) campReached++;
  }
  row.campAtteints = `${campReached}/${campNodes.length}`;
  row.campPassagesUneCase = campNarrow;
  // Ennemi : ne passe pas la porte ouverte (tant qu'elle tient).
  back();
  hero.x = hero.prevX = L.origin.x + 30; hero.z = hero.prevZ = L.origin.z + 30;
  for (const v of vils) { v.x = v.prevX = L.origin.x + 31; v.z = v.prevZ = L.origin.z + 31; v.order = { type: 'guard' }; }
  const foe = w.spawn('maraudeur', 'enemy', exit.x, exit.z);
  foe.order = { type: 'move', x: L.origin.x, z: L.origin.z + 2.5 };
  const gate = w.entities.find((e: any) => e.wall?.door);
  let entered = false;
  for (let i = 0; i < 30 * 8; i++) { w.step(DT); if (gate?.alive && insideCamp(L.origin, foe.x, foe.z, 0.4)) entered = true; }
  row.ennemiBloque = !entered && gate?.wall.door.open === false;
  summary.push(row);
}
console.log('GRAINES', JSON.stringify(summary));
check('chaque graine : camp de depart present, zone reservee entierement dans la carte, sans eau, relief, obstacle, tas, ni camp neutre a moins de 5 cases',
  summary.every((r) => r.zone && r.zone.horsCarte === 0 && r.zone.eau === 0 && r.zone.relief === 0 && r.zone.obstacles === 0 && r.zone.tas === 0 && r.zone.camps === 0), summary.map((r) => [r.seed, r.zone]));
check('population au depart : 2 Villageois sur 15 (5 + 2 Maisons x 5, G50)', summary.every((r) => r.pop?.used === 2 && r.pop?.max === 15), summary.map((r) => r.pop));
check('Heros : sort par la porte (fermee au depart, elle s ouvre devant lui) ; 2 Villageois aussi', summary.every((r) => r.sortieHeros && r.sortieVillageois), summary.map((r) => [r.seed, r.sortieHeros, r.sortieVillageois]));
check('Heros : rejoint le petit et le grand camp neutres depuis la sortie (vrai deplacement)', summary.every((r) => r.camps?.length === 2 && r.camps.every(Boolean)), summary.map((r) => [r.seed, r.camps]));
check('Heros : atteint le pied de CHAQUE gisement (pierre et or) depuis la sortie', summary.every((r) => r.gisements && r.gisements.split('/')[0] === r.gisements.split('/')[1]), summary.map((r) => [r.seed, r.gisements, r.ratees]));
check('aucun passage d une case contre un gisement (KI-65)', summary.every((r) => r.passagesUneCase === 0), summary.map((r) => [r.seed, r.passagesUneCase]));
check('ennemi (Maraudeur) a la porte : elle se ferme, il n entre jamais tant qu elle tient', summary.every((r) => r.ennemiBloque), summary.map((r) => [r.seed, r.ennemiBloque]));
const NB_TREES = SB.getStartingBasePreset('basic-camp').trees.length;
check('or proche garanti (G46, chaque graine) : au moins 1 gisement d or hors de l enceinte, entierement dans la vision initiale de l Hotel de ville (21) ; cour libre constructible >= 500 cases (241 avant, rayon 10,5)', summary.every((r) => r.orProche >= 1 && r.courLibre >= 500), summary.map((r) => [r.seed, r.orProche, r.courLibre]));
check(`gisements et bosquet garantis du camp (chaque graine) : aucun dans la carte brute, 2 + ${NB_TREES} ajoutes a la consommation (expandStartingBase, avec les 20 lignes de murs) ; dans le monde : 1 pierre + 1 or + ${NB_TREES} arbres (>= 6) dans l enceinte`, NB_TREES >= 6 && summary.every((r) => r.gisementsCamp?.brut === 0 && r.gisementsCamp?.monde === 2 + NB_TREES && r.gisementsCamp?.murs === 20 && r.sourcesCamp?.join() === ['gold', 'stone', ...Array(NB_TREES).fill('wood')].join()), summary.map((r) => [r.seed, r.gisementsCamp, r.sourcesCamp]));
check(`sources du camp : toutes atteintes par le Heros depuis la cour (${2 + NB_TREES}), aucun passage d une case autour (KI-65)`, summary.every((r) => r.campAtteints === `${2 + NB_TREES}/${2 + NB_TREES}` && r.campPassagesUneCase === 0), summary.map((r) => [r.seed, r.campAtteints, r.campPassagesUneCase]));
console.log('PERF generation moyenne', (genMs / SEEDS.length).toFixed(1), 'ms ; rotations', JSON.stringify(summary.map((r) => r.rotation)));
check('determinisme : meme graine -> meme carte (camp de depart compris)', JSON.stringify(generateSurvivalMap(42)) === JSON.stringify(generateSurvivalMap(42)) && JSON.stringify(generateSurvivalMap(42).startingBase) === JSON.stringify({ preset: 'basic-camp', rotation: generateSurvivalMap(42).startingBase.rotation }));

// ---- 3. Recolte libre (outils de depart) : bois, pierre ET or, sans aucun batiment (2026-11-05, G37).
{
  const map = generateSurvivalMap(12345);
  const near = (w: any, res: string) => [...w.resourceNodes.values()].filter((n: any) => n.resource === res).sort((a: any, b: any) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z))[0];
  const out: any = {};
  for (const unit of ['hero', 'villageois'] as const) {
    for (const res of ['wood', 'stone', 'gold'] as const) {
      const w = new World(4); w.setMap(map);
      const n = near(w, res);
      const at = { x: n.x + (n.block ? n.block.maxX - n.x + 0.6 : 1.2), z: n.z };
      const u = unit === 'hero' ? w.spawnHero('player', at.x, at.z, { xp: 0, level: 1, deaths: 0 }) : w.spawn('villageois', 'player', at.x, at.z);
      u.order = { type: 'guard' };
      // Permissions par defaut du monde (STARTING_HARVEST_PERMISSIONS) : aucun batiment n'en ajoute plus.
      w.issueCommand({ kind: 'harvest', entityIds: [u.id], nodeId: n.id });
      w.step(DT);
      const rejection = w.commandResults[0]?.rejection ?? null;
      for (let i = 0; i < 30 * 10; i++) w.step(DT); // >= 2 unites a 3,125 s (Heros, or)
      out[`${unit}:${res}`] = { rejection, cargo: { wood: u.cargo.wood, stone: u.cargo.stone, gold: u.cargo.minedGold }, tools: w.harvestPermissions.tools };
    }
  }
  check('sans aucun batiment : Heros et Villageois coupent du bois, extraient de la pierre ET de l or (cargo), aucun refus ; outils : hache et pioche seulement',
    ['hero', 'villageois'].every((u) => out[`${u}:wood`].rejection === null && out[`${u}:wood`].cargo.wood >= 2 && out[`${u}:stone`].rejection === null && out[`${u}:stone`].cargo.stone >= 2 && out[`${u}:gold`].rejection === null && out[`${u}:gold`].cargo.gold >= 2 && JSON.stringify(out[`${u}:gold`].tools) === '["axe","pickaxe"]'),
    out);
}

console.log(failures ? failures + ' ECHEC(S)' : 'tout OK');
