// Noyau de depart (2026-11-06, G50) : Hotel de ville au centre, Baliste, Auberge et Maisons pres de lui, sans se toucher ; bases de
// navigation dans les 4 rotations ; Hotel de ville sans production ni depot ; Maison +5 ; raccourcis A Z E R ; tas / 2 sans toucher
// aux arbres, aux gisements et aux camps. Reference des tas : compte d'avant la passe, graine par graine.
// Usage : node --import ../ts-register.mjs noyau-depart.mts (ou npm run test:sim)
const SRC = new URL('../../src/', import.meta.url).href;
const { World } = await import(SRC + 'sim/world.ts');
const { BUILDINGS, getBuilding, buildingFootprintTiles, buildingContinuousFootprint, listBuyableBuildingIds } = await import(SRC + 'data/buildings.ts');
const { generateSurvivalMap } = await import(SRC + 'config/maps/proceduralSurvival.ts');
const { expandMapCamps } = await import(SRC + 'data/campLayout.ts');
const SB = await import(SRC + 'config/startingBase.ts');
const { computeBallistaObstacle, resolveBallistaOrigin } = await import(SRC + 'config/mapDef.ts');
const { navigationState } = await import(SRC + 'sim/systems/movement.ts');
const { cachedPathGrid, isTileBlockedAt, pathSearchStats } = await import(SRC + 'sim/pathfinding.ts');
const { obstaclesForUnit } = await import(SRC + 'sim/geometry.ts');
const { populationOfEntities } = await import(SRC + 'data/population.ts');
const { CAMERA, PLAYER_ARROW_RANGE, PLAYER_BASE_POPULATION } = await import(SRC + 'config/constants.ts');
const { selectBallistaAutoTarget } = await import(SRC + 'sim/ballistaAuto.ts');
const { teamVision } = await import(SRC + 'sim/vision.ts');
const { PRODUCTION_HOTKEYS, productionHotkey, producibleUnits } = await import(SRC + 'data/production.ts');
const { VISION_RADIUS } = await import(SRC + 'data/vision.ts');
const { visionRadiusOf } = await import(SRC + 'sim/vision.ts');
const { nearestDropOff } = await import(SRC + 'sim/systems/cargo.ts');
const { repairBaseCost, repairCost } = await import(SRC + 'run/buildingRepair.ts');
const { isUpgradableBuilding } = await import(SRC + 'run/buildingUpgrades.ts');
const DT = 1 / 30;
let failures = 0;
const check = (label: string, ok: boolean, extra: unknown = '') => { if (!ok) failures++; console.log(`${ok ? 'OK   ' : 'ECHEC'} ${label}${extra !== '' ? ' — ' + JSON.stringify(extra).slice(0, 900) : ''}`); };
const CORE_RADIUS = 8;

const rectOf = (b: any) => { const t = buildingFootprintTiles(b.buildingId); return { id: b.buildingId, minX: b.x - t.tilesX / 2, maxX: b.x + t.tilesX / 2, minZ: b.z - t.tilesZ / 2, maxZ: b.z + t.tilesZ / 2 }; };
const ballistaRect = (L: any) => ({ id: 'ballista', minX: L.ballista.x - 1.2, maxX: L.ballista.x + 1.2, minZ: L.ballista.z - 1.2, maxZ: L.ballista.z + 1.2 });
const gap = (a: any, b: any) => Math.hypot(Math.max(a.minX - b.maxX, b.minX - a.maxX, 0), Math.max(a.minZ - b.maxZ, b.minZ - a.maxZ, 0));

// ---- 1. Le preset, 4 rotations.
{
  const rows: any[] = [];
  for (let r = 0; r < 4; r++) {
    const L = SB.startingBaseLayoutAt({ x: 0.5, z: 0.5 }, 'basic-camp', r);
    const hall = L.buildings.find((b: any) => b.buildingId === 'townhall');
    const rects = [...L.buildings.map(rectOf), ballistaRect(L)];
    const others = rects.filter((q) => q.id !== 'townhall');
    const gaps = rects.flatMap((a, i) => rects.slice(i + 1).map((b) => gap(a, b)));
    const centerDist = others.map((q) => Math.hypot((q.minX + q.maxX) / 2 - L.origin.x, (q.minZ + q.maxZ) / 2 - L.origin.z));
    const people = [L.hero, ...L.units];
    const clear = people.every((p: any) => rects.every((q) => gap({ minX: p.x, maxX: p.x, minZ: p.z, maxZ: p.z }, q) >= 0.6));
    rows.push({ r, centre: hall && hall.x === L.origin.x && hall.z === L.origin.z, n: [L.buildings.filter((b: any) => b.buildingId === 'house').length, L.buildings.filter((b: any) => b.buildingId === 'tavern').length], minGap: +Math.min(...gaps).toFixed(2), maxCentre: +Math.max(...centerDist).toFixed(2), clear, int: others.every((q) => Number.isInteger((q.minX + q.maxX) / 2 - 0.5) && Number.isInteger((q.minZ + q.maxZ) / 2 - 0.5)) });
  }
  check('Hotel de ville au centre exact, dans les 4 rotations', rows.every((q) => q.centre), rows);
  const yaw = SB.startingBaseFaceCameraRotationY();
  check('Hotel de ville en leger biais par rapport a la camera de la Survie (pas de face, porte visible)', Math.abs((yaw * 180) / Math.PI - CAMERA.survivalYawDeg - 27) < 1e-9 && CAMERA.survivalYawDeg === 18, (yaw * 180) / Math.PI);
  const layouts = [0, 1, 2, 3].map((r) => SB.startingBaseLayoutAt({ x: 0.5, z: 0.5 }, 'basic-camp', r));
  check('facade vers la camera : meme rotation dans les 4 rotations du camp, les autres batiments restent en quarts de tour', layouts.every((L: any) => L.buildings.find((b: any) => b.buildingId === 'townhall').rotationY === yaw && L.buildings.filter((b: any) => b.buildingId !== 'townhall').every((b: any) => Math.abs(Math.sin(b.rotationY * 2)) < 1e-9)), layouts.map((L: any) => L.buildings.map((b: any) => +b.rotationY.toFixed(3))));
  check(`noyau : 2 Maisons, 1 Auberge, 1 Baliste a moins de ${CORE_RADIUS} cases du centre`, rows.every((q) => q.n[0] === 2 && q.n[1] === 1 && q.maxCentre <= CORE_RADIUS), rows.map((q) => q.maxCentre));
  check('jamais colles : au moins 1,8 case entre deux batiments du noyau', rows.every((q) => q.minGap >= 1.8), rows.map((q) => q.minGap));
  check('Heros et Villageois de depart a au moins un rayon de Heros de tout batiment', rows.every((q) => q.clear));
  check('decalages entiers : memes passages sur la grille dans les 4 rotations', rows.every((q) => q.int));
  const raw = generateSurvivalMap(12345);
  const L = SB.startingBaseLayoutOf(raw);
  check('une seule source de verite pour la Baliste : resolveBallistaOrigin = place dans le noyau, MapDef.ballista = centre', JSON.stringify(resolveBallistaOrigin(raw)) === JSON.stringify(L.ballista) && raw.ballista.x === L.origin.x && raw.ballista.z === L.origin.z);
  const none = { ...raw, startingBase: { preset: 'none' } };
  check('sans camp de depart, la Baliste reste au Depart', JSON.stringify(resolveBallistaOrigin(none)) === JSON.stringify(raw.ballista));
}

// ---- 2. L'Hotel de ville : donnees.
{
  const def = getBuilding('townhall');
  check('Hotel de ville : id, nom, PV, emprise 4 x 4, modele du pack', def.id === 'townhall' && def.displayName === 'Hôtel de ville' && def.maxHp > 0 && def.footprintTilesX === 4 && def.footprintTilesZ === 4 && def.buildingModel === 'blue_townhall');
  check('ni cout, ni menu Construire', def.cost === undefined && def.resourceCost === undefined && !listBuyableBuildingIds().includes('townhall'));
  // 2026-11-08 (decision d'Antoine) : l'Hotel de ville produit le Villageois et recoit tout le cargo (depot universel,
  // a la place de la Baliste) ; toujours ni technologie, ni niveau, ni population, ni attaque.
  check('produit le Villageois et point de collecte universel (2026-11-08) ; ni technologie, ni niveau, ni population, ni attaque', JSON.stringify(producibleUnits('townhall', 0)) === '["villageois"]' && !isUpgradableBuilding('townhall') && def.populationBonus === undefined && def.attack === undefined && JSON.stringify(def.dropOff) === '["wood","stone","minedGold"]');
  const base = repairBaseCost('townhall');
  check('reparation : payante, base propre comme la Baliste (preconstruit, sans cout de construction)', base.gold > 0 && repairCost('townhall', 0.5).gold > 0, base);
  // 2026-11-08 : la Baliste garde sa reparation mais n'est plus un depot ; l'Hotel de ville prend le depot universel.
  check('la Baliste garde sa reparation ; le depot universel est passe a l Hotel de ville (2026-11-08)', repairBaseCost('ballista').gold === 30 && getBuilding('ballista').dropOff === undefined && JSON.stringify(getBuilding('townhall').dropOff) === JSON.stringify(['wood', 'stone', 'minedGold']));
}

/** Monde comme la vraie run : Baliste, batiments a empreinte continue, enceinte. */
function camp(seed: number) {
  const raw = generateSurvivalMap(seed);
  const L = SB.startingBaseLayoutOf(raw);
  const map = SB.expandStartingBase(expandMapCamps(raw));
  const w = new World(seed);
  w.setMap(map);
  const ballista = w.spawnBuilding(getBuilding('ballista'), 'player', L.ballista.x, L.ballista.z, computeBallistaObstacle(L.ballista));
  const buildings = L.buildings.map((b: any) => { const t = buildingFootprintTiles(b.buildingId); return w.spawnBuilding(getBuilding(b.buildingId), 'player', b.x, b.z, { kind: 'building', x: b.x, z: b.z, tilesX: t.tilesX, tilesZ: t.tilesZ, rotationY: b.rotationY, footprint: buildingContinuousFootprint(b.buildingId, b.x, b.z, b.rotationY) }); });
  for (const line of L.walls) w.spawnWallLine('player', line.type, line, { gates: line.gates, openGates: line.openGates });
  return { raw, L, w, ballista, buildings };
}

// ---- 3. Monde reel : depot, vision, collision, navigation.
{
  const { L, w, ballista, buildings } = camp(12345);
  const hall = buildings.find((b: any) => b.unitId === 'townhall');
  const vil = w.spawn('villageois', 'player', L.units[0].x, L.units[0].z);
  vil.order = { type: 'guard' };
  vil.cargo.wood = 3;
  check('depot : le Villageois vise l Hotel de ville, jamais la Baliste, meme tout pres d elle (2026-11-08)', nearestDropOff({ ...vil, x: hall.x, z: hall.z + 2.5 }, w.entities, 'wood') === hall && nearestDropOff({ ...vil, x: ballista.x, z: ballista.z + 1.5 }, w.entities, 'wood') === hall);
  check('vision de l Hotel de ville = celle de la Baliste (21) : le camp voit toujours ses abords', visionRadiusOf(hall) === VISION_RADIUS.townhall && VISION_RADIUS.townhall === VISION_RADIUS.ballista && visionRadiusOf(ballista) === 21);
  const grid = cachedPathGrid(obstaclesForUnit(w.obstacles, vil, false), w.boardWidth, w.boardHeight);
  check('collision : le centre de l Hotel de ville et ses coins bloquent la grille', [[0, 0], [1.5, 1.5], [-1.5, -1.5], [1.5, -1.5]].every(([dx, dz]) => isTileBlockedAt(grid, L.origin.x + dx!, L.origin.z + dz!)));
  hall.hp = 10;
  w.step(DT);
  check('l Hotel de ville reste un batiment ordinaire : ciblable, endommageable', hall.alive && hall.isBuilding && hall.stats.maxHp === getBuilding('townhall').maxHp);
  hall.hp = 0; hall.alive = false;
  w.step(DT);
  check('l Hotel de ville detruit : la Baliste est toujours la (la defaite reste decidee par la Baliste, tests/game/defaite-jeu.cjs)', ballista.alive);
}

// ---- 4. Aire libre et or visible, plusieurs graines.
{
  const rows: any[] = [];
  for (const seed of [1, 42, 12345, 99999]) {
    const { raw, L } = camp(seed);
    const blocked = new Set<string>();
    const block = (q: any) => { for (let z = Math.floor(q.minZ); z < Math.ceil(q.maxZ); z++) for (let x = Math.floor(q.minX); x < Math.ceil(q.maxX); x++) blocked.add(x + ',' + z); };
    for (const b of L.buildings) block(rectOf(b));
    block({ minX: L.ballista.x - 1.5, maxX: L.ballista.x + 1.5, minZ: L.ballista.z - 1.5, maxZ: L.ballista.z + 1.5 });
    for (const d of L.deposits) block({ minX: d.x - 1, maxX: d.x + 1, minZ: d.z - 1, maxZ: d.z + 1 });
    for (const t of L.trees) block({ minX: t.x - 0.5, maxX: t.x + 0.5, minZ: t.z - 0.5, maxZ: t.z + 0.5 });
    const apothem = 15 * Math.cos(Math.PI / 12);
    let free = 0;
    for (let z = Math.floor(L.origin.z - 16); z <= L.origin.z + 16; z++) for (let x = Math.floor(L.origin.x - 16); x <= L.origin.x + 16; x++) { const d = Math.hypot(x + 0.5 - L.origin.x, z + 0.5 - L.origin.z); if (d <= apothem - 1 && !blocked.has(x + ',' + z)) free++; }
    const gold = raw.obstacles.filter((o: any) => o.kind === 'rock' && o.ore === 'gold').map((o: any) => Math.hypot(o.cornerX + 1 - L.origin.x, o.cornerZ + 1 - L.origin.z)).filter((d: number) => d > 16 && d + 1.5 <= VISION_RADIUS.townhall);
    rows.push({ seed, free, gold: gold.length });
  }
  console.log('AIRE LIBRE', JSON.stringify(rows));
  check('aire libre constructible >= 500 cases, chaque graine', rows.every((q) => q.free >= 500), rows);
  check('second gisement d or visible hors de l enceinte depuis l Hotel de ville, chaque graine', rows.every((q) => q.gold >= 1), rows);
}

// ---- 5. Navigation autour du noyau : Heros et Villageois, emprises continues.
{
  const a0 = pathSearchStats.searches; let total = 0; const bad: any[] = [];
  for (const seed of [12345, 99999]) {
    const { L, w } = camp(seed);
    const hero = w.spawnHero('player', L.hero.x, L.hero.z, { xp: 0, level: 1, deaths: 0 });
    const vil = w.spawn('villageois', 'player', L.units[0].x, L.units[0].z);
    for (const u of [hero, vil]) {
      u.order = { type: 'guard' };
      if (u.worker) u.worker.autoRetryIn = 1e9;
      const grid = cachedPathGrid(obstaclesForUnit(w.obstacles, u, false), w.boardWidth, w.boardHeight);
      const pts: { x: number; z: number }[] = [];
      for (let r = 3.5; r <= 12.5; r += 3) for (let a = 0; a < 12; a++) pts.push({ x: L.origin.x + Math.round(Math.sin((a / 12) * 2 * Math.PI) * r), z: L.origin.z + Math.round(Math.cos((a / 12) * 2 * Math.PI) * r) });
      for (const p of pts.filter((q) => !isTileBlockedAt(grid, q.x, q.z))) {
        total++;
        w.issueCommand({ kind: 'move', entityIds: [u.id], x: p.x, z: p.z });
        let failed = false; let stuck = 0; let done = false;
        for (let i = 0; i < 30 * 25 && !done; i++) {
          w.step(DT);
          stuck = Math.max(stuck, navigationState(u).stuckCount);
          if (w.orderEvents.some((e: any) => e.entityId === u.id && e.outcome === 'failed')) failed = true;
          done = u.order.type !== 'move';
        }
        if (!done || failed || stuck > 0 || Math.hypot(u.x - p.x, u.z - p.z) > 1.5) bad.push({ seed, unit: u.unitId, to: p, at: [+u.x.toFixed(1), +u.z.toFixed(1)], failed, stuck });
      }
    }
  }
  check(`${total} trajets dans le camp, autour du noyau, Heros et Villageois, emprises continues : tous arrives, zero blocage`, bad.length === 0, bad.slice(0, 6));
  console.log(`PERF navigation autour du noyau : ${total} trajets, ${pathSearchStats.searches - a0} A*`);
}

// ---- 5 bis. Portee de la Baliste : toute l'enceinte, depuis sa place reelle.
{
  check('portee 22,6, sous le plafond provisoire de 23 ; cadrage de la Survie : pivot 18, hauteur 28 ; l editeur garde 45 et 20', PLAYER_ARROW_RANGE === 22.6 && CAMERA.survivalYawDeg === 18 && CAMERA.survivalViewHeight === 28 && CAMERA.yawDeg === 45 && CAMERA.viewHeight === 20);
  const rows: any[] = [];
  for (const seed of [12345, 99999, 1, 42]) {
    const { L, w, ballista } = camp(seed);
    const O = L.origin;
    const reach = (x: number, z: number) => {
      const foe = w.spawn('maraudeur', 'enemy', x, z);
      const picked = selectBallistaAutoTarget(w.entities, ballista.x, ballista.z, undefined, PLAYER_ARROW_RANGE, teamVision(w.entities, 'player'));
      foe.alive = false; foe.hp = 0;
      return { d: +Math.hypot(x - ballista.x, z - ballista.z).toFixed(2), ok: picked === foe };
    };
    // Devant chaque porte, un corps dehors contre elle ; classees de la plus proche a l'opposee.
    const gates = w.entities.filter((e: any) => e.wall?.door).map((g: any) => { const dx = g.x - O.x; const dz = g.z - O.z; const n = Math.hypot(dx, dz); return reach(g.x + (dx / n) * 1.2, g.z + (dz / n) * 1.2); }).sort((a: any, b: any) => a.d - b.d);
    // Tous les bouts de palissade : un corps dehors contre le mur.
    let far = { d: 0, ok: true };
    for (const line of L.walls) for (const [x, z] of [[line.ax, line.az], [line.bx, line.bz]]) { const dx = x! - O.x; const dz = z! - O.z; const n = Math.hypot(dx, dz); const r = reach(x! + (dx / n) * 1.2, z! + (dz / n) * 1.2); if (r.d > far.d) far = r; if (!r.ok) far.ok = false; }
    rows.push({ seed, rotation: L.rotation, portes: gates, palissadeLaPlusLointaine: far });
  }
  console.log('BALISTE distances reelles', JSON.stringify(rows));
  check('la Baliste engage un ennemi devant chacune des 4 portes, dans les 4 rotations', rows.every((r) => r.portes.length === 4 && r.portes.every((g: any) => g.ok)), rows.map((r) => r.portes.map((g: any) => g.d)));
  check('et contre le bout de palissade le plus lointain', rows.every((r) => r.palissadeLaPlusLointaine.ok && r.palissadeLaPlusLointaine.d <= PLAYER_ARROW_RANGE), rows.map((r) => r.palissadeLaPlusLointaine));
}

// ---- 6. Population.
{
  check('Maison : +5 dans la source de verite', getBuilding('house').populationBonus === 5);
  const { L, w, buildings } = camp(12345);
  const pop = () => populationOfEntities(w.entities);
  check(`cap initial : ${PLAYER_BASE_POPULATION} + 2 x 5 = 15`, pop().max === PLAYER_BASE_POPULATION + 10 && pop().max === 15, pop());
  const h3 = w.spawnBuilding(getBuilding('house'), 'player', L.origin.x + 9, L.origin.z + 1, { kind: 'building', x: L.origin.x + 9, z: L.origin.z + 1, tilesX: 2, tilesZ: 2 });
  check('nouvelle Maison : cap + 5 (20)', pop().max === 20, pop());
  const units = Array.from({ length: 18 }, (_, i) => { const u = w.spawn('villageois', 'player', L.origin.x - 10 + (i % 6) * 1.2, L.origin.z + 8 + Math.floor(i / 6) * 1.2); u.order = { type: 'guard' }; u.worker.autoRetryIn = 1e9; return u; });
  check('18 unites sous un cap de 20', pop().used === 18 && pop().max === 20, pop());
  h3.hp = 0; h3.alive = false;
  const house0 = buildings.find((b: any) => b.unitId === 'house');
  house0.hp = 0; house0.alive = false;
  for (let i = 0; i < 90; i++) w.step(DT);
  check('deux Maisons detruites : cap - 10 (10), jamais de mort automatique des unites en trop', pop().max === 10 && units.every((u) => u.alive) && pop().used === 18, pop());
}

// ---- 7. Raccourcis A Z E R : correspondance structurelle.
{
  check('touches dans l ordre : A, Z, E, R', JSON.stringify(PRODUCTION_HOTKEYS) === JSON.stringify(['A', 'Z', 'E', 'R']));
  const producers = Object.values(BUILDINGS).filter((b: any) => b.recruitmentUnlock) as any[];
  const wrong: any[] = [];
  for (const b of producers) b.recruitmentUnlock.unitIds.forEach((unitId: string, i: number) => { if (productionHotkey(b.id, unitId) !== (PRODUCTION_HOTKEYS[i] ?? null)) wrong.push([b.id, unitId]); });
  check(`chaque producteur (${producers.length}) : rang dans sa liste -> touche, sans regle par batiment`, producers.length >= 5 && wrong.length === 0, wrong);
  check('Hotel de ville : Villageois sur A (2026-11-08 ; Auberge sans production) ; Caserne : Piquier sur A, Fantassin sur Z', productionHotkey('townhall', 'villageois') === 'A' && productionHotkey('tavern', 'villageois') === null && productionHotkey('barracks', 'piquier') === 'A' && productionHotkey('barracks', 'fantassin') === 'Z');
  check('une unite garde sa touche quand elle se debloque : Fantassin absent niv. 0, Z au niv. 1', !producibleUnits('barracks', 0).includes('fantassin') && producibleUnits('barracks', 1).includes('fantassin') && productionHotkey('barracks', 'fantassin') === 'Z');
  // Un producteur de cinq unites : A Z E R, puis pas de touche.
  (BUILDINGS as any).__test = { ...getBuilding('tavern'), id: '__test', recruitmentUnlock: { unitIds: ['a', 'b', 'c', 'd', 'e'] } };
  check('n importe quel producteur : 4 touches, la 5e unite n en a pas', ['a', 'b', 'c', 'd', 'e'].map((u) => productionHotkey('__test', u)).join() === 'A,Z,E,R,');
  delete (BUILDINGS as any).__test;
  check('un batiment qui ne produit rien n a pas de touche', productionHotkey('house', 'villageois') === null && productionHotkey('tavern', 'villageois') === null);
}

// ---- 8. Tas : divises par deux, sans rien changer d'autre. Reference : avant G50.
{
  const before: Record<number, { bois: number; pierre: number; arbres: number; or: number; gisements: number; camps: string }> = {
    1: { bois: 18, pierre: 17, arbres: 929, or: 7, gisements: 14, camps: 'raiders_large@-34.5,-12.5 raiders_small@25.5,20.5' },
    42: { bois: 20, pierre: 17, arbres: 975, or: 0, gisements: 0, camps: '' },
    12345: { bois: 21, pierre: 17, arbres: 760, or: 0, gisements: 0, camps: 'raiders_large@-4.5,-35.5 raiders_small@-25.5,-21.5' },
    99999: { bois: 21, pierre: 16, arbres: 831, or: 0, gisements: 0, camps: 'raiders_large@32.5,8.5 raiders_small@9.5,31.5' },
  };
  const rows: any[] = [];
  for (const seed of Object.keys(before).map(Number)) {
    const m = generateSurvivalMap(seed);
    const piles = m.resourcePiles as any[];
    const wood = piles.filter((p) => p.resource === 'wood');
    const stone = piles.filter((p) => p.resource === 'stone');
    const b = before[seed]!;
    const q = [0, 0, 0, 0];
    for (const p of piles) q[(p.x >= 0 ? 1 : 0) + (p.z >= 0 ? 2 : 0)]!++;
    rows.push({
      seed, bois: `${b.bois}->${wood.length}`, pierre: `${b.pierre}->${stone.length}`,
      ratio: +((wood.length + stone.length) / (b.bois + b.pierre)).toFixed(2),
      arbres: m.obstacles.filter((o: any) => o.kind === 'tree').length === b.arbres,
      camps: !b.camps || (m.camps as any[]).map((c) => `${c.kind}@${c.x},${c.z}`).sort().join(' ') === b.camps,
      quadrants: q,
      proches: [piles.filter((p) => p.resource === 'wood' && Math.hypot(p.x, p.z) <= 30).reduce((s, p) => s + p.amount, 0), piles.filter((p) => p.resource === 'stone' && Math.hypot(p.x, p.z) <= 30).reduce((s, p) => s + p.amount, 0)],
    });
  }
  console.log('TAS', JSON.stringify(rows));
  check('nombre de tas divise par deux, chaque graine (0,44 a 0,56)', rows.every((q) => q.ratio >= 0.44 && q.ratio <= 0.56), rows.map((q) => [q.seed, q.ratio]));
  check('arbres identiques, camps identiques, graine par graine', rows.every((q) => q.arbres && q.camps), rows.map((q) => [q.seed, q.arbres, q.camps]));
  check('dispersion : au moins 3 quadrants sur 4 ont des tas', rows.every((q) => q.quadrants.filter((n: number) => n > 0).length >= 3), rows.map((q) => q.quadrants));
  check('encore des tas a portee d exploration : au moins 5 de bois et 3 de pierre a moins de 30 cases', rows.every((q) => q.proches[0] >= 5 && q.proches[1] >= 3), rows.map((q) => q.proches));
  const a = generateSurvivalMap(777);
  const b = generateSurvivalMap(777);
  check('deterministe : meme graine, memes tas', JSON.stringify(a.resourcePiles) === JSON.stringify(b.resourcePiles));
}

console.log(failures ? failures + ' ECHEC(S)' : 'tout OK');
process.exit(failures ? 1 : 0);
