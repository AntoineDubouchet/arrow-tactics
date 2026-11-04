// Tests cibles SANS NAVIGATEUR du camp de depart et de KI-65 (2026-11-04) :
//  - preset « basic-camp » (4 rotations) : batiments sans chevauchement, dans l'enceinte, loin des murs ; Heros et
//    Villageois dans la cour ; une porte ouverte ;
//  - lot de graines : zone reservee propre (cases, eau, relief, arbres, gisements, decors, tas, camps), puis dans le
//    monde reel (Baliste, Auberge, 2 Maisons, enceinte, porte ouverte) : le Heros SORT par la porte, rejoint chaque
//    camp neutre et le pied de CHAQUE gisement en vrai deplacement (aucune teleportation hors du depart), les
//    Villageois sortent, un ennemi ne passe pas la porte ouverte ; aucun passage d'une case contre un gisement ;
//  - recolte libre (bois, pierre) sans Forge, or refuse sans Forge et accepte avec ; population ; determinisme.
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
const { harvestPermissionsOf } = await import(SRC + 'run/harvestPermissions.ts');
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
    const ballista = { minX: -1, maxX: 2, minZ: -1, maxZ: 2 };
    const rects = L.buildings.map(rectOf);
    const noOverlap = rects.every((a: any, i: number) => !overlap(a, ballista) && rects.every((b: any, j: number) => i === j || !overlap(a, b)));
    const inBounds = rects.every((q: any) => [[q.minX, q.minZ], [q.maxX, q.minZ], [q.minX, q.maxZ], [q.maxX, q.maxZ]].every(([x, z]) => insideCamp(L.origin, x!, z!)));
    const segs = L.walls.flatMap((w: any) => segmentWallLine(w, getWallType(w.type).segmentLength));
    const clearance = Math.min(...rects.flatMap((q: any) => segs.map((s: any) => segmentBoxDistance(s, q))));
    const people = [L.hero, ...L.units];
    const peopleOk = people.every((p: any) => insideCamp(L.origin, p.x, p.z, 1) && !rects.some((q: any) => inside(q, p.x, p.z, -0.6)) && !inside(ballista, p.x, p.z, -0.6));
    const gates = L.walls.filter((w: any) => w.gates?.length);
    res.push({ r, noOverlap, inBounds, clearance: +clearance.toFixed(2), peopleOk, gates: gates.length, open: gates.every((g: any) => g.openGates), pieces: segs.length, houses: L.buildings.filter((b: any) => b.buildingId === 'house').map((b: any) => b.modelVariant), tavern: L.buildings.filter((b: any) => b.buildingId === 'tavern').length, villagers: L.units.filter((u: any) => u.unitId === 'villageois').length });
  }
  check('preset basic-camp, 4 rotations : 2 Maisons (A, B) + 1 Auberge sans chevauchement (ni Baliste), dans l enceinte, a >= 1,5 case des murs ; Heros et 2 Villageois dans la cour, hors emprises ; 1 porte ouverte ; 25 pieces (dodecagone, 14 lignes)',
    res.every((q) => q.noOverlap && q.inBounds && q.clearance >= 1.5 && q.peopleOk && q.gates === 1 && q.open && q.pieces === 25 && L0.walls.length === 14 && JSON.stringify(q.houses) === '[0,1]' && q.tavern === 1 && q.villagers === 2), res);
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
  // 2b. Monde reel : carte (camps derives), Baliste, batiments, enceinte, Heros, Villageois. Camps non peuples (pas de combat).
  const map = expandMapCamps(raw);
  const w = new World(seed);
  w.setMap(map);
  w.spawnBuilding(getBuilding('ballista'), 'player', L.origin.x, L.origin.z, computeBallistaObstacle(L.origin));
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
  // Ennemi : ne passe pas la porte ouverte (tant qu'elle tient).
  back();
  hero.x = hero.prevX = L.origin.x + 30; hero.z = hero.prevZ = L.origin.z + 30;
  for (const v of vils) { v.x = v.prevX = L.origin.x + 31; v.z = v.prevZ = L.origin.z + 31; v.order = { type: 'guard' }; }
  const foe = w.spawn('maraudeur', 'enemy', exit.x, exit.z);
  foe.order = { type: 'move', x: L.origin.x, z: L.origin.z + 2.5 };
  const gate = w.entities.find((e: any) => e.wall?.door);
  let entered = false;
  for (let i = 0; i < 30 * 8; i++) { w.step(DT); if (gate?.alive && insideCamp(L.origin, foe.x, foe.z, 0.4)) entered = true; }
  row.ennemiBloque = !entered && gate?.wall.door.open === true;
  summary.push(row);
}
console.log('GRAINES', JSON.stringify(summary));
check('chaque graine : camp de depart present, zone reservee entierement dans la carte, sans eau, relief, obstacle, tas, ni camp neutre a moins de 5 cases',
  summary.every((r) => r.zone && r.zone.horsCarte === 0 && r.zone.eau === 0 && r.zone.relief === 0 && r.zone.obstacles === 0 && r.zone.tas === 0 && r.zone.camps === 0), summary.map((r) => [r.seed, r.zone]));
check('population au depart : 2 Villageois sur 9 (5 + 2 Maisons x 2)', summary.every((r) => r.pop?.used === 2 && r.pop?.max === 9), summary.map((r) => r.pop));
check('Heros : sort par la porte ouverte ; 2 Villageois aussi', summary.every((r) => r.sortieHeros && r.sortieVillageois), summary.map((r) => [r.seed, r.sortieHeros, r.sortieVillageois]));
check('Heros : rejoint le petit et le grand camp neutres depuis la sortie (vrai deplacement)', summary.every((r) => r.camps?.length === 2 && r.camps.every(Boolean)), summary.map((r) => [r.seed, r.camps]));
check('Heros : atteint le pied de CHAQUE gisement (pierre et or) depuis la sortie', summary.every((r) => r.gisements && r.gisements.split('/')[0] === r.gisements.split('/')[1]), summary.map((r) => [r.seed, r.gisements, r.ratees]));
check('aucun passage d une case contre un gisement (KI-65)', summary.every((r) => r.passagesUneCase === 0), summary.map((r) => [r.seed, r.passagesUneCase]));
check('ennemi (Maraudeur) a la porte ouverte : n entre jamais tant qu elle tient', summary.every((r) => r.ennemiBloque), summary.map((r) => [r.seed, r.ennemiBloque]));
console.log('PERF generation moyenne', (genMs / SEEDS.length).toFixed(1), 'ms ; rotations', JSON.stringify(summary.map((r) => r.rotation)));
check('determinisme : meme graine -> meme carte (camp de depart compris)', JSON.stringify(generateSurvivalMap(42)) === JSON.stringify(generateSurvivalMap(42)) && JSON.stringify(generateSurvivalMap(42).startingBase) === JSON.stringify({ preset: 'basic-camp', rotation: generateSurvivalMap(42).startingBase.rotation }));

// ---- 3. Recolte libre (outils de depart) ; or : Forge.
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
      // Immobile tant qu il n a pas d ordre (l ordre par defaut l eloignerait pendant le refus).
      u.order = { type: 'guard' };
      w.harvestPermissions = harvestPermissionsOf(w.entities, 'player');
      w.issueCommand({ kind: 'harvest', entityIds: [u.id], nodeId: n.id });
      w.step(DT);
      const rejection = w.commandResults[0]?.rejection ?? null;
      for (let i = 0; i < 30 * 5; i++) w.step(DT);
      let withForge = null;
      const goldBefore = u.cargo.minedGold;
      if (res === 'gold') {
        w.spawnBuilding(getBuilding('forge'), 'player', -20.5, -20.5, { kind: 'building', x: -20.5, z: -20.5, tilesX: 2, tilesZ: 2 });
        w.harvestPermissions = harvestPermissionsOf(w.entities, 'player');
        w.issueCommand({ kind: 'harvest', entityIds: [u.id], nodeId: n.id });
        for (let i = 0; i < 30 * 6; i++) w.step(DT);
        withForge = u.cargo.minedGold - goldBefore;
      }
      out[`${unit}:${res}`] = { goldBefore: res === 'gold' ? goldBefore : undefined, rejection, cargo: { wood: u.cargo.wood, stone: u.cargo.stone, gold: u.cargo.minedGold }, withForge, tools: harvestPermissionsOf(w.entities, 'player').tools };
    }
  }
  check('sans Forge : Heros et Villageois coupent du bois et extraient de la pierre (cargo) ; or refuse (« locked ») ; avec une Forge : or extrait',
    ['hero', 'villageois'].every((u) => out[`${u}:wood`].rejection === null && out[`${u}:wood`].cargo.wood >= 2 && out[`${u}:stone`].rejection === null && out[`${u}:stone`].cargo.stone >= 2 && out[`${u}:gold`].rejection === 'locked' && out[`${u}:gold`].goldBefore === 0 && out[`${u}:gold`].withForge >= 2),
    out);
}

console.log(failures ? failures + ' ECHEC(S)' : 'tout OK');
