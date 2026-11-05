// Tests cibles SANS NAVIGATEUR du placement libre (2026-11-06, G48) : positions flottantes ; collision par empreinte reelle ;
// petite marge ; rotation 15° ; refus sur source, mur, unite, eau, pente, hors carte ; rasterisation sur la grille ; passage
// large franchi, passage etroit ferme (jamais de traversee des modeles) ; Maison 3.27 / 8.63 a 15° : chantier, construction,
// navigation autour ; tous les batiments standards ; Heros et Villageois constructeurs ; determinisme.
// Usage : node --import ../ts-register.mjs placement-libre.mts (ou npm run test:sim)
const SRC = new URL('../../src/', import.meta.url).href;
const { World } = await import(SRC + 'sim/world.ts');
const { DEFAULT_MAP } = await import(SRC + 'config/mapDef.ts');
const { getBuilding, BUILDING_ROTATION_STEP, BUILDING_PLACEMENT_PADDING, BUILDING_NAVIGATION_PADDING, buildingContinuousFootprint, buildingFootprint, listBuyableBuildingIds } = await import(SRC + 'data/buildings.ts');
const { checkBuildingPlacement, buildingPlacementBox } = await import(SRC + 'run/buildingPlacement.ts');
const { makeOrientedBox, orientedBoxesOverlap, distanceToOrientedBox, orientedBoxContains, segmentEntersOrientedBox, pushCircleOutOfOrientedBox, orientedBoxBounds } = await import(SRC + 'core/orientedBox.ts');
const { buildPathGrid, findPath, isTileBlockedAt } = await import(SRC + 'sim/pathfinding.ts');
const { findBlockingObstacle, bodyPathNearStructure } = await import(SRC + 'sim/geometry.ts');
const { obstacleBounds, obstacleContainsPoint } = await import(SRC + 'config/constants.ts');
const DT = 1 / 30;
let failures = 0;
const check = (label: string, ok: boolean, extra: unknown = '') => { if (!ok) failures++; console.log(`${ok ? 'OK   ' : 'ECHEC'} ${label}${extra !== '' ? ' — ' + JSON.stringify(extra).slice(0, 900) : ''}`); };
const deg = (d: number) => (d * Math.PI) / 180;
/** Obstacle d'un batiment possede, comme main.ts (ownedBuildingObstacle). */
const placed = (id: string, x: number, z: number, rotationY = 0, def = getBuilding(id)) => ({ kind: 'building' as const, tilesX: def.footprintTilesX ?? 1, tilesZ: def.footprintTilesZ ?? 1, x, z, rotationY, footprint: buildingContinuousFootprint(id, x, z, rotationY) });
const emptyWorld = (over: any = {}) => ({ isBuildableCell: () => true, flatLevelOver: () => 0, blockers: [], sources: [], walls: [], bodies: [], ...over });

// ---- 1. Pas de grille obligatoire : positions flottantes, distinctes.
{
  const w = emptyWorld();
  const issues = [[3.27, 8.63], [3.31, 8.63], [3.5, 8.5]].map(([x, z]) => checkBuildingPlacement('house', x, z, 0, w));
  const a = buildingPlacementBox('house', 3.27, 8.63, 0);
  const b = buildingPlacementBox('house', 3.31, 8.63, 0);
  check('deux positions que l ancien arrondi a la grille confondait (3.27 et 3.31) : acceptees et distinctes, centre exact conserve', issues.every((i) => i === null) && a.x === 3.27 && a.z === 8.63 && b.x === 3.31 && Math.round(3.27 - 1) === Math.round(3.31 - 1), issues);
}

// ---- 2. Collision par empreinte reelle, petite marge.
{
  const h = placed('house', 0.37, 0.71);
  const w = emptyWorld({ blockers: [h] });
  const pad = BUILDING_PLACEMENT_PADDING;
  check(`marge de pose ${pad} : ecart de ${pad + 0.01} accepte, ${pad - 0.01} refuse, chevauchement refuse`, checkBuildingPlacement('house', 0.37 + 2 + pad + 0.01, 0.71, 0, w) === null && checkBuildingPlacement('house', 0.37 + 2 + pad - 0.01, 0.71, 0, w) === 'building' && checkBuildingPlacement('house', 1.2, 0.9, 0, w) === 'building');
  check('deux Maisons a coordonnees non entieres, proches sans se chevaucher : ecart reel de 0,21 case (l ancienne grille imposait un multiple d une case)', checkBuildingPlacement('house', 0.37 + 2.21, 1.13, 0, w) === null);
  // Rotation : a 45°, une Maison deborde en coin (demi-diagonale 1,41) ; a 15° un peu moins.
  const gap = 2 + pad + 0.05;
  const r45 = checkBuildingPlacement('house', 0.37 + gap, 0.71, deg(45), w);
  const r0 = checkBuildingPlacement('house', 0.37 + gap, 0.71, 0, w);
  const r15 = checkBuildingPlacement('house', 0.37 + gap, 0.71, BUILDING_ROTATION_STEP, w);
  check('rotation prise en compte : meme position valide a 0°, refusee a 15° et a 45° (le coin avance)', r0 === null && r15 === 'building' && r45 === 'building', { r0, r15, r45 });
  // Empreinte tournee : cote a cote une fois alignes, deux Maisons tournees de 15° passent la ou un AABB refuserait.
  const t = placed('house', 5.11, 5.23, deg(15));
  const box = obstacleBounds(t);
  const w2 = emptyWorld({ blockers: [t] });
  const along = 2 + pad + 0.02;
  const nx = 5.11 + along * Math.cos(deg(15));
  const nz = 5.23 - along * Math.sin(deg(15));
  check('deux Maisons tournees de 15°, l une a cote de l autre le long de leur axe : acceptee, bien qu elle chevauche la boite englobante', checkBuildingPlacement('house', nx, nz, deg(15), w2) === null && nx - 1.3 < box.maxX, { nx, nz, box });
}

// ---- 3. Ce qui refuse une pose.
{
  const q = (id: string, over: any) => checkBuildingPlacement(id, 3.27, 8.63, 0, emptyWorld(over));
  check('source debout (rectangle) : refusee ; a 0,3 case : acceptee', q('house', { sources: [{ minX: 3, maxX: 4, minZ: 9, maxZ: 10 }] }) === 'source' && q('house', { sources: [{ minX: 4.57, maxX: 5.57, minZ: 8, maxZ: 9 }] }) === null);
  const wall = { segment: { ax: 0, az: 9, bx: 9, bz: 9 }, clearance: 0.3 };
  check('mur ou porte : refuse pres de la ligne, accepte a distance', q('house', { walls: [wall] }) === 'wall' && q('house', { walls: [{ ...wall, segment: { ax: 0, az: 12, bx: 9, bz: 12 } }] }) === null);
  check('unite vivante sous l empreinte : refuse ; a distance de son rayon : accepte', q('house', { bodies: [{ x: 3.3, z: 8.6, radius: 0.5 }] }) === 'unit' && q('house', { bodies: [{ x: 5, z: 8.63, radius: 0.5 }] }) === null);
  check('case absente ou d eau sous l empreinte reelle : refuse ; pente : refuse', q('house', { isBuildableCell: (x: number, z: number) => !(x === 3 && z === 8) }) === 'terrain' && q('house', { flatLevelOver: () => null }) === 'slope');
  // Coin d'une Maison tournee de 45° : une case que l'emprise droite ne touche pas la bloque ; et inversement.
  const onlyCorner = (x: number, z: number) => !(x === 6 && z === 5);
  check('terrain lu sur l empreinte reelle : a 0° la Maison (4 ; 5) ne touche pas la case (6, 5) invalide, a 45° son coin la touche', checkBuildingPlacement('house', 4, 5, 0, emptyWorld({ isBuildableCell: onlyCorner })) === null && checkBuildingPlacement('house', 4.6, 5.5, deg(45), emptyWorld({ isBuildableCell: onlyCorner })) === 'terrain');
}

// ---- 4. Geometrie orientee.
{
  const b = makeOrientedBox(2, 3, 2, 2, deg(45));
  const corner = Math.SQRT2;
  check('rectangle a 45° : coin a la demi-diagonale, boite englobante exacte, distance et contenance justes', Math.abs(orientedBoxBounds(b).maxX - (2 + corner)) < 1e-9 && orientedBoxContains(b, 2 + corner - 0.01, 3) && !orientedBoxContains(b, 2 + 1.2, 3 + 1.2) && Math.abs(distanceToOrientedBox(b, 2 + corner + 1, 3) - 1) < 1e-9);
  const q = makeOrientedBox(0, 0, 2, 2, Math.PI / 2);
  check('quart de tour exact : pas de bruit d arrondi sur les bornes', q.cos === 0 && Math.abs(q.sin) === 1 && orientedBoxBounds(q).maxX === 1 && orientedBoxBounds(q).minZ === -1);
  const out = pushCircleOutOfOrientedBox(b, 2 + corner + 0.1, 3, 0.5)!;
  check('collision : un corps qui touche le coin est repousse a son rayon ; un corps loin n est pas touche ; segment a travers = entre', Math.abs(distanceToOrientedBox(b, out.x, out.z) - 0.5) < 1e-6 && pushCircleOutOfOrientedBox(b, 9, 9, 0.5) === null && segmentEntersOrientedBox(b, 0, 3, 5, 3) !== null && segmentEntersOrientedBox(b, 0, 9, 5, 9) === null);
  check('chevauchement (axes separateurs) : deux rectangles a 45° en coin / 2 cotes se touchant ne se chevauchent pas', orientedBoxesOverlap(makeOrientedBox(0, 0, 2, 2, 0), makeOrientedBox(1.5, 0, 2, 2, deg(45))) && !orientedBoxesOverlap(makeOrientedBox(0, 0, 2, 2, 0), makeOrientedBox(2, 0, 2, 2, 0)) && !orientedBoxesOverlap(makeOrientedBox(0, 0, 2, 2, 0), makeOrientedBox(2.5, 0, 2, 2, deg(45))));
  const o = placed('house', 4, 4, deg(45));
  check('obstacle : point dans le coin de sa boite englobante mais hors du rectangle tourne : non contenu ; centre contenu', !obstacleContainsPoint(o, 4 + 1.2, 4 + 1.2) && obstacleContainsPoint(o, 4, 4));
  const line = findBlockingObstacle(4 + 1.3, 0, 4 + 1.3, 3, [o]);
  const through = findBlockingObstacle(0, 4, 8, 4, [o]);
  check('ligne de vue : traverse le rectangle tourne = bloquee ; passe dans le coin vide de sa boite englobante = libre', through !== null && line === null, { through, line });
}

// ---- 5. Navigation : grille derivee de l'empreinte.
{
  const W = 40; const H = 40;
  const cellBlocked = (grid: any, x: number, z: number) => isTileBlockedAt(grid, x, z);
  const count = (grid: any) => grid.blocked.reduce((a: number, b: number) => a + b, 0);
  const pad = BUILDING_NAVIGATION_PADDING;
  // Maison 2 x 2 sur des bords entiers : la marge deborde sur les cases voisines.
  const aligned = buildPathGrid([placed('house', 1, 1)], W, H);
  // Maison a 3.27 / 8.63 : empreinte 2.27..4.27 x 7.63..9.63, elargie de la marge.
  const free = buildPathGrid([placed('house', 3.27, 8.63)], W, H);
  const fBox = { minX: 3.27 - 1 - pad, maxX: 3.27 + 1 + pad, minZ: 8.63 - 1 - pad, maxZ: 8.63 + 1 + pad };
  const expected = (Math.ceil(fBox.maxX) - Math.floor(fBox.minX)) * (Math.ceil(fBox.maxZ) - Math.floor(fBox.minZ));
  check(`rasterisation : cases touchees par empreinte + marge ${pad} (position flottante : ${expected} cases), centre bloque, case voisine hors marge libre`, count(free) === expected && cellBlocked(free, 3.27, 8.63) && cellBlocked(free, 2.1, 8.63) && !cellBlocked(free, 1.9, 8.63) && !cellBlocked(free, 3.27 + 1 + pad + 0.8, 8.63), { blocked: count(free), expected, aligned: count(aligned) });
  // Rotation : les coins de la boite englobante d'une Maison a 45° restent libres.
  const r = buildPathGrid([placed('house', 5.5, 5.5, deg(45))], W, H);
  check('rotation : Maison a 45° en (5.5 ; 5.5) : centre bloque, coin de sa boite englobante (7,1 ; 7,1) libre, moins de cases que sa boite pleine (25)', cellBlocked(r, 5.5, 5.5) && !cellBlocked(r, 7.1, 7.1) && count(r) < 25, count(r));
  // Toute case libre garde un corps de 0,7 au large du batiment.
  const f = buildingContinuousFootprint('house', 7.13, 9.41, deg(30));
  const g = buildPathGrid([{ ...placed('house', 7.13, 9.41, deg(30)) }], W, H);
  let minClear = Infinity;
  for (let tz = 0; tz < H; tz++) for (let tx = 0; tx < W; tx++) if (!g.blocked[tz * W + tx]) minClear = Math.min(minClear, distanceToOrientedBox(f, tx - W / 2 + 0.5, tz - H / 2 + 0.5));
  check('toute case libre a son centre a >= 0,7 case du batiment (corps le plus large du jeu, Cavalier)', minClear >= 0.7 - 1e-6, minClear);
}

// ---- 6. Passages : etroit ferme, large franchi, jamais de traversee.
const walkMap = { ...DEFAULT_MAP, width: 60, height: 60, obstacles: [] };
function arena(obstacles: any[]) {
  const w = new World(5); w.setMap(walkMap);
  const sites = obstacles.map((o) => w.spawnBuilding(getBuilding(o.id), 'player', o.x, o.z, placed(o.id, o.x, o.z, o.rot ?? 0)));
  return { w, sites };
}
/** Chemin de A a B ; aucune traversee d'empreinte par le CENTRE, et corps jamais a plus de 0,02 dans le modele. */
function walk(w: any, unit: any, x: number, z: number, seconds = 25) {
  const fps = w.entities.filter((e: any) => e.footprintObstacle?.footprint).map((e: any) => e.footprintObstacle.footprint);
  let inside = 0; let minGap = Infinity;
  w.issueCommand({ kind: 'move', entityIds: [unit.id], x, z });
  for (let i = 0; i < 30 * seconds; i++) {
    w.step(DT);
    for (const f of fps) { const d = distanceToOrientedBox(f, unit.x, unit.z); minGap = Math.min(minGap, d); if (d <= 1e-6) inside++; }
    if (Math.hypot(unit.x - x, unit.z - z) <= Math.max(unit.stats.radius, 0.5)) return { arrived: true, inside, minGap, t: i / 30 };
    if (unit.order.type !== 'move') return { arrived: false, inside, minGap, t: i / 30 };
  }
  return { arrived: false, inside, minGap, t: seconds };
}
{
  // Barriere de Maisons de part et d'autre du passage : seul le passage central relie les deux cotes en ligne droite.
  const bar = (gap: number) => {
    const list: any[] = [];
    for (let i = 0; i < 6; i++) { list.push({ id: 'house', x: -gap / 2 - 1 - i * 2.2, z: 0.37 }); list.push({ id: 'house', x: gap / 2 + 1 + i * 2.2, z: 0.37 }); }
    return list;
  };
  const narrow = arena(bar(0.3));
  const g = narrow.w.obstacles;
  const line = findBlockingObstacle(0, -5, 0, 5, g);
  const body = bodyPathNearStructure(0, -5, 0, 5, 0.6, g);
  const grid = buildPathGrid(g, narrow.w.boardWidth, narrow.w.boardHeight);
  const heroN = narrow.w.spawnHero('player', 0, -5, { xp: 0, level: 1, deaths: 0 });
  const rn = walk(narrow.w, heroN, 0, 5);
  check('passage de 0,3 case entre deux Maisons : la ligne passe, le corps non (body test) ; grille fermee en face du passage ; le Heros contourne et arrive, sans jamais entrer dans un modele', line === null && body === true && isTileBlockedAt(grid, 0, 0.37) && rn.arrived && rn.inside === 0 && rn.minGap >= 0.55, { line, body, rn });
  const wide = arena(bar(3));
  const gw = buildPathGrid(wide.w.obstacles, wide.w.boardWidth, wide.w.boardHeight);
  const heroW = wide.w.spawnHero('player', 0, -5, { xp: 0, level: 1, deaths: 0 });
  const rw = walk(wide.w, heroW, 0, 5);
  check('passage de 3 cases : ouvert sur la grille, le Heros le prend (arrivee rapide, 10 cases a pied), sans toucher un modele', !isTileBlockedAt(gw, 0, 0.37) && rw.arrived && rw.t < 3.5 && rw.inside === 0, rw);
  // Cavalier, corps le plus large : passage de 3 cases aussi ; depart coince entre deux Maisons : il en sort.
  const cav = arena(bar(3));
  const c = cav.w.spawn('cavalier', 'player', 0, -5); c.order = { type: 'guard' };
  const rc = walk(cav.w, c, 0, 5);
  const pocket = arena([{ id: 'house', x: -2, z: 0 }, { id: 'house', x: 2.2, z: 0 }]);
  const v = pocket.w.spawn('villageois', 'player', 0.1, 0); v.order = { type: 'guard' };
  const rp = walk(pocket.w, v, 0, -6);
  check('Cavalier (rayon 0,7) : passage de 3 cases franchi ; Villageois entre deux Maisons, sur des cases bloquees par la marge : il en sort', rc.arrived && rc.inside === 0 && rp.arrived, { rc, rp });
  // Maison tournee : aucune traversee en la contournant.
  const turned = arena([{ id: 'house', x: 0.13, z: 0.27, rot: deg(45) }]);
  const heroT = turned.w.spawnHero('player', 0, -4, { xp: 0, level: 1, deaths: 0 });
  const rt = walk(turned.w, heroT, 0, 4);
  check('Maison tournee de 45° sur le trajet : le Heros la contourne, jamais dans son rectangle', rt.arrived && rt.inside === 0 && rt.minGap >= 0.55, rt);
}

// ---- 7. Maison 3.27 / 8.63, 15° : chantier, construction, navigation, autres bâtiments, Heros et Villageois.
{
  const scenario = (builder: 'hero' | 'villageois', id = 'house', x = 3.27, z = 8.63, rot = BUILDING_ROTATION_STEP) => {
    const w = new World(9); w.setMap(walkMap);
    const def = getBuilding(id);
    const site = w.spawnBuilding(def, 'player', x, z, placed(id, x, z, rot), Math.round(def.maxHp * 0.25), undefined, undefined, { progress: 0, buildTime: 0.5 });
    const u = builder === 'hero' ? w.spawnHero('player', x, z - 6, { xp: 0, level: 1, deaths: 0 }) : w.spawn('villageois', 'player', x, z - 6);
    u.order = { type: 'guard' };
    w.issueCommand({ kind: 'build', entityIds: [u.id], targetEntityId: site.id });
    for (let i = 0; i < 30 * 12 && site.construction; i++) w.step(DT);
    return { w, site, u, done: site.construction === null, gap: distanceToOrientedBox(site.footprintObstacle.footprint, u.x, u.z) };
  };
  const hero = scenario('hero');
  const vil = scenario('villageois');
  const fp = hero.site.footprintObstacle.footprint;
  check('Maison 3.27 / 8.63 a 15° : chantier a sa position exacte, empreinte tournee, batie par le Heros comme par le Villageois (une seule voie), constructeur au contact, hors du modele', hero.done && vil.done && hero.site.x === 3.27 && hero.site.z === 8.63 && Math.abs(fp.cos - Math.cos(deg(15))) < 1e-9 && hero.gap > 0.3 && hero.gap < 1.5 && vil.gap > 0.3 && vil.gap < 1.5, { hero: hero.gap, vil: vil.gap });
  const back = walk(hero.w, hero.u, 3.27, 13);
  check('navigation autour de la Maison terminee : le Heros passe de l autre cote sans traverser', back.arrived && back.inside === 0, back);
  // Tous les batiments standards constructibles, une position flottante et une rotation.
  const ids = listBuyableBuildingIds().filter((b: string) => b !== 'palisade' && b !== 'palisade_gate');
  const results = ids.map((id: string) => { const issue = checkBuildingPlacement(id, 6.31, 7.77, deg(30), emptyWorld()); const r = scenario('villageois', id, 6.31, 7.77, deg(30)); return { id, issue, done: r.done, w: buildingFootprint(id).width, d: buildingFootprint(id).depth }; });
  check(`tous les batiments standards (${ids.length}) : pose libre acceptee, chantier bati par un Villageois, emprises issues de BuildingDef`, ids.length >= 12 && results.every((r: any) => r.issue === null && r.done && r.w === getBuilding(r.id).footprintTilesX && r.d === getBuilding(r.id).footprintTilesZ), results);
  // Production : sortie d'un batiment tourne, unite hors du modele.
  const w = new World(11); w.setMap(walkMap);
  const bar = w.spawnBuilding(getBuilding('barracks'), 'player', 2.31, 3.17, placed('barracks', 2.31, 3.17, deg(30)));
  for (let i = 0; i < 3; i++) w.spawnBuilding(getBuilding('house'), 'player', -9.11 + i * 3.1, 8.3, placed('house', -9.11 + i * 3.1, 8.3));
  w.queueProduction(bar.id, { kind: 'unit', unitId: 'piquier' }, 0.2);
  let made: any = null;
  for (let i = 0; i < 30 && !made; i++) { w.step(DT); made = w.productionSpawnEvents[0] ?? null; }
  check('production : la sortie d un batiment tourne est hors de son empreinte', !!made && distanceToOrientedBox(bar.footprintObstacle.footprint, made.x, made.z) > 0.3, made);
}

// ---- 8. Determinisme.
{
  const trace = () => { const { w } = arena([{ id: 'house', x: 1.37, z: 0.41, rot: deg(15) }, { id: 'house', x: -3.2, z: 2.2, rot: deg(60) }]); const h = w.spawnHero('player', 0, -5, { xp: 0, level: 1, deaths: 0 }); w.issueCommand({ kind: 'move', entityIds: [h.id], x: 0, z: 6 }); for (let i = 0; i < 120; i++) w.step(DT); return [h.x, h.z].join(); };
  check('determinisme : meme pose, meme trajet', trace() === trace());
}

console.log(failures ? failures + ' ECHEC(S)' : 'tout OK');
