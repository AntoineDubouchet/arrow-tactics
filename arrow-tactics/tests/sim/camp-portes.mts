// Tests cibles SANS NAVIGATEUR des 4 portes du camp de depart (2026-11-06, G48), graines 1, 42, 12345, 99999 : exactement 4
// portes, a ~90°, ouvertes ; meme systeme que toute Porte de Palissade (PV, largeur, regles) ; axes degages de tout batiment et
// de toute ressource ; le Heros, un Villageois et un Cavalier sortent depuis la cour par CHAQUE porte, dans son axe ; porte
// fermee : il passe par une autre ; toutes fermees : enferme ; ennemi : n'entre par aucune ; ressources de depart intactes ; or
// proche visible, jamais devant une porte ; camps neutres hors des axes ; couloirs sans arbre ni gisement ; rotation : les 4
// portes suivent ; batiments reels (empreinte continue, comme la vraie run).
// Usage : node --import ../ts-register.mjs camp-portes.mts (ou npm run test:sim)
const SRC = new URL('../../src/', import.meta.url).href;
const { World } = await import(SRC + 'sim/world.ts');
const { getBuilding, buildingContinuousFootprint, buildingFootprintTiles } = await import(SRC + 'data/buildings.ts');
const { generateSurvivalMap } = await import(SRC + 'config/maps/proceduralSurvival.ts');
const { expandMapCamps } = await import(SRC + 'data/campLayout.ts');
const SB = await import(SRC + 'config/startingBase.ts');
const { computeBallistaObstacle } = await import(SRC + 'config/mapDef.ts');
const { segmentBoxDistance, segmentWallLine } = await import(SRC + 'core/wallLine.ts');
const { getWallType } = await import(SRC + 'data/walls.ts');
const { VISION_RADIUS } = await import(SRC + 'data/vision.ts');
const DT = 1 / 30;
let failures = 0;
const check = (label: string, ok: boolean, extra: unknown = '') => { if (!ok) failures++; console.log(`${ok ? 'OK   ' : 'ECHEC'} ${label}${extra !== '' ? ' — ' + JSON.stringify(extra).slice(0, 1200) : ''}`); };
const ENC = SB.getStartingBasePreset('basic-camp').enclosure;
const APOTHEM = ENC.radius * Math.cos(Math.PI / ENC.sides);
const gateMid = (g: any) => ({ x: (g.ax + g.bx) / 2, z: (g.az + g.bz) / 2 });

// ---- 1. Layout, 4 rotations : geometrie des portes.
{
  const rows: any[] = [];
  for (let r = 0; r < 4; r++) {
    const L = SB.startingBaseLayoutAt({ x: 0.5, z: 0.5 }, 'basic-camp', r);
    const gates = L.walls.filter((w: any) => w.gates?.length);
    const angles = gates.map((g: any) => { const m = gateMid(g); return (Math.round((Math.atan2(m.x - 0.5, m.z - 0.5) * 180) / Math.PI) + 360) % 360; }).sort((a: number, b: number) => a - b);
    const lens = gates.map((g: any) => +Math.hypot(g.bx - g.ax, g.bz - g.az).toFixed(3));
    const rects = [
      ...L.buildings.map((b: any) => { const t = buildingFootprintTiles(b.buildingId); return { minX: b.x - t.tilesX / 2, maxX: b.x + t.tilesX / 2, minZ: b.z - t.tilesZ / 2, maxZ: b.z + t.tilesZ / 2 }; }),
      ...L.deposits.map((d: any) => ({ minX: d.x - 1, maxX: d.x + 1, minZ: d.z - 1, maxZ: d.z + 1 })),
      ...L.trees.map((t: any) => ({ minX: t.x - 0.5, maxX: t.x + 0.5, minZ: t.z - 0.5, maxZ: t.z + 0.5 })),
    ];
    // Axe centre -> au-dela de la porte : aucun batiment ni ressource a moins de 2 cases.
    const axisGap = Math.min(...gates.flatMap((g: any) => { const m = gateMid(g); return rects.map((q: any) => segmentBoxDistance({ ax: L.origin.x, az: L.origin.z, bx: m.x, bz: m.z }, q)); }));
    const pieces = L.walls.flatMap((w: any) => segmentWallLine(w, getWallType(w.type).segmentLength).map((s: any, i: number) => ({ s, gate: w.gates?.includes(i) ?? false })));
    // Les bouts de mur rejoignent les portes : chaque extremite de porte est aussi l'extremite d'un bout de mur.
    const joined = gates.every((g: any) => [[g.ax, g.az], [g.bx, g.bz]].every(([x, z]) => L.walls.some((w: any) => w !== g && ((w.ax === x && w.az === z) || (w.bx === x && w.bz === z)))));
    rows.push({ r, gates: gates.length, open: gates.every((g: any) => g.openGates === true), angles, lens, axisGap: +axisGap.toFixed(2), doorPieces: pieces.filter((p: any) => p.gate).length, joined, type: gates.every((g: any) => g.type === 'palisade') });
  }
  check('4 rotations : exactement 4 portes de palissade, ouvertes, a 0° / 90° / 180° / 270°, 2,4 cases, 4 pieces-portes, raccordees aux murs ; axes centre -> porte a >= 2 cases de tout batiment et ressource', rows.every((q) => q.gates === 4 && q.open && q.type && q.angles.join() === '0,90,180,270' && q.lens.every((l: number) => l === ENC.gateLength) && q.doorPieces === 4 && q.joined && q.axisGap >= 2), rows);
  // La rotation fait suivre les portes, et le camp reste le meme a un quart de tour pres.
  const at = (r: number) => SB.startingBaseLayoutAt({ x: 0.5, z: 0.5 }, 'basic-camp', r);
  const moved = at(0).buildings.map((b: any) => [b.x, b.z]).join() !== at(1).buildings.map((b: any) => [b.x, b.z]).join();
  const shift = SB.startingBaseLayoutAt({ x: 10.5, z: -3.5 }, 'basic-camp', 1).walls.filter((w: any) => w.gates).map((g: any) => { const m = gateMid(g); return +Math.hypot(m.x - 10.5, m.z + 3.5).toFixed(2); });
  check('deplacer et faire pivoter le Depart : les 4 portes suivent, a l apotheme du nouveau centre', moved && shift.length === 4 && shift.every((d: number) => Math.abs(d - APOTHEM) < 0.01), shift);
  const raw = generateSurvivalMap(42);
  check('une carte ne stocke aucune porte : expandStartingBase les ajoute a la consommation, sans doublon', (raw.walls ?? []).length === 0 && SB.expandStartingBase(raw).walls.filter((w: any) => w.gates).length === 4 && SB.expandStartingBase(raw).walls.length === 20);
}

// ---- 2. Monde reel, 4 graines.
const SEEDS = [1, 42, 12345, 99999];
const summary: any[] = [];
for (const seed of SEEDS) {
  const raw = generateSurvivalMap(seed);
  const L = SB.startingBaseLayoutOf(raw);
  const row: any = { seed, rotation: L.rotation };
  const map = SB.expandStartingBase(expandMapCamps(raw));
  /** Monde comme la vraie run : Baliste, batiments a empreinte continue, enceinte, ressources. */
  const mkWorld = () => {
    const w = new World(seed);
    w.setMap(map);
    w.spawnBuilding(getBuilding('ballista'), 'player', L.origin.x, L.origin.z, computeBallistaObstacle(L.origin));
    for (const b of L.buildings) { const t = buildingFootprintTiles(b.buildingId); w.spawnBuilding(getBuilding(b.buildingId), 'player', b.x, b.z, { kind: 'building', tilesX: t.tilesX, tilesZ: t.tilesZ, x: b.x, z: b.z, rotationY: b.rotationY, footprint: buildingContinuousFootprint(b.buildingId, b.x, b.z, b.rotationY) }); }
    for (const line of L.walls) w.spawnWallLine('player', line.type, line, { gates: line.gates, openGates: line.openGates });
    for (const d of map.destructibles ?? []) w.addDestructible(d.kind, d.x, d.z);
    return w;
  };
  const w0 = mkWorld();
  const gates = w0.entities.filter((e: any) => e.wall?.door);
  row.gates = gates.length;
  row.open = gates.every((g: any) => g.wall.door.open === true);
  const stats = gates.map((g: any) => [g.stats.maxHp, g.unitId, +Math.hypot(g.wall.bx - g.wall.ax, g.wall.bz - g.wall.az).toFixed(2)].join('/'));
  row.memePorte = new Set(stats).size === 1;
  // Ressources de depart et or proche.
  const inCamp = (n: any) => Math.hypot(n.x - L.origin.x, n.z - L.origin.z) < APOTHEM;
  const camp = [...w0.resourceNodes.values()].filter(inCamp).map((n: any) => n.resource).sort();
  row.ressources = camp.filter((r: string) => r === 'gold').length === 1 && camp.filter((r: string) => r === 'stone').length === 1 && camp.filter((r: string) => r === 'wood').length === L.trees.length;
  const orProche = raw.obstacles.filter((o: any) => o.kind === 'rock' && o.ore === 'gold').map((o: any) => ({ x: o.cornerX + 1 - L.origin.x, z: o.cornerZ + 1 - L.origin.z })).filter((o: any) => { const d = Math.hypot(o.x, o.z); return d > ENC.radius + 1 && d + 1.5 < VISION_RADIUS.ballista; });
  row.orProche = orProche.length;
  // Ecart angulaire aux axes (0° = plein axe d'une porte).
  row.orAngle = orProche.length ? Math.round(Math.min(...orProche.map((o: any) => { const a = Math.abs((Math.atan2(o.x, o.z) * 180) / Math.PI) % 90; return Math.min(a, 90 - a); }))) : null;
  row.orLateral = orProche.length ? +Math.min(...orProche.map((o: any) => Math.min(Math.abs(o.x), Math.abs(o.z)))).toFixed(1) : null;
  // Camps neutres hors des axes des portes.
  row.campsAxe = raw.camps.map((c: any) => +Math.min(Math.abs(c.x - L.origin.x), Math.abs(c.z - L.origin.z)).toFixed(1));
  // Couloirs : aucun arbre ni gisement.
  const inRel = (x: number, z: number) => Math.min(Math.abs(x), Math.abs(z)) <= 2 && Math.max(Math.abs(x), Math.abs(z)) >= ENC.radius - 1 && Math.max(Math.abs(x), Math.abs(z)) <= ENC.radius + 8;
  row.couloirs = raw.obstacles.filter((o: any) => (o.kind === 'tree' && inRel(Math.floor(o.x) - 0, Math.floor(o.z) - 0)) || (o.kind === 'rock' && [0, 1].some((dx) => [0, 1].some((dz) => inRel(o.cornerX + dx, o.cornerZ + dz))))).length;

  // Sortie par chaque porte : la position au franchissement de l'enceinte est dans l'axe de la porte.
  const exitThrough = (kind: string, g: any, w: any) => {
    const m = { x: g.x, z: g.z };
    const dx = m.x - L.origin.x; const dz = m.z - L.origin.z; const len = Math.hypot(dx, dz);
    const inward = { x: L.origin.x + (dx / len) * 6, z: L.origin.z + (dz / len) * 6 };
    const outward = { x: m.x + (dx / len) * 3, z: m.z + (dz / len) * 3 };
    const u = kind === 'hero' ? w.spawnHero('player', inward.x, inward.z, { xp: 0, level: 1, deaths: 0 }) : w.spawn(kind, 'player', inward.x, inward.z);
    u.order = { type: 'guard' };
    if (u.worker) u.worker.autoRetryIn = 1e9;
    w.issueCommand({ kind: 'move', entityIds: [u.id], x: outward.x, z: outward.z });
    let lateral: number | null = null;
    let arrived = false;
    let prev = Math.hypot(u.x - L.origin.x, u.z - L.origin.z);
    for (let i = 0; i < 30 * 15 && !arrived; i++) {
      w.step(DT);
      const d = Math.hypot(u.x - L.origin.x, u.z - L.origin.z);
      if (lateral === null && prev < APOTHEM && d >= APOTHEM) lateral = Math.hypot(u.x - m.x, u.z - m.z);
      prev = d;
      arrived = Math.hypot(u.x - outward.x, u.z - outward.z) <= Math.max(u.stats.radius, 0.6);
    }
    u.alive = false; u.hp = 0;
    return { arrived, lateral: lateral === null ? null : +lateral.toFixed(2) };
  };
  const per: Record<string, any[]> = { hero: [], villageois: [], cavalier: [] };
  for (const kind of Object.keys(per)) {
    for (const g of gates) { const w = mkWorld(); const again = w.entities.find((e: any) => e.wall?.door && e.x === g.x && e.z === g.z); per[kind]!.push(exitThrough(kind, again, w)); }
  }
  row.sorties = per;
  // Porte fermee : passe par une autre, jamais a travers ; toutes fermees : enferme.
  {
    const w = mkWorld();
    const list = w.entities.filter((e: any) => e.wall?.door);
    const g = list[0];
    w.setDoorWanted(g.id, false, 'player');
    w.step(DT);
    const dx = g.x - L.origin.x; const dz = g.z - L.origin.z; const len = Math.hypot(dx, dz);
    const h = w.spawnHero('player', L.origin.x + (dx / len) * 8, L.origin.z + (dz / len) * 8, { xp: 0, level: 1, deaths: 0 });
    const to = { x: g.x + (dx / len) * 2.5, z: g.z + (dz / len) * 2.5 };
    w.issueCommand({ kind: 'move', entityIds: [h.id], x: to.x, z: to.z });
    let near = Infinity; let done = false;
    for (let i = 0; i < 30 * 40 && !done; i++) { w.step(DT); const d = Math.hypot(h.x - g.x, h.z - g.z); if (Math.hypot(h.x - L.origin.x, h.z - L.origin.z) > APOTHEM + 0.2 && d < near) near = d; done = Math.hypot(h.x - to.x, h.z - to.z) <= 1 ; }
    row.porteFermee = { arrive: done, ferme: g.wall.door.open === false };
    const w2 = mkWorld();
    for (const e of w2.entities) if (e.wall?.door) w2.setDoorWanted(e.id, false, 'player');
    w2.step(DT);
    const h2 = w2.spawnHero('player', L.origin.x, L.origin.z + 4, { xp: 0, level: 1, deaths: 0 });
    w2.issueCommand({ kind: 'move', entityIds: [h2.id], x: L.origin.x, z: L.origin.z + 22 });
    for (let i = 0; i < 30 * 8; i++) w2.step(DT);
    row.enferme = Math.hypot(h2.x - L.origin.x, h2.z - L.origin.z) < APOTHEM;
  }
  // Ennemi : n'entre par aucune porte ouverte.
  {
    const w = mkWorld();
    const list = w.entities.filter((e: any) => e.wall?.door);
    let entered = false;
    const foes = list.map((g: any) => { const dx = g.x - L.origin.x; const dz = g.z - L.origin.z; const len = Math.hypot(dx, dz); const f = w.spawn('maraudeur', 'enemy', g.x + (dx / len) * 3, g.z + (dz / len) * 3); f.order = { type: 'move', x: L.origin.x, z: L.origin.z + 2.5 }; return f; });
    for (let i = 0; i < 30 * 8; i++) { w.step(DT); if (list.every((g: any) => g.alive) && foes.some((f: any) => Math.hypot(f.x - L.origin.x, f.z - L.origin.z) < APOTHEM - 0.4)) entered = true; }
    row.ennemiEntre = entered;
  }
  summary.push(row);
}
console.log('GRAINES', JSON.stringify(summary.map((r) => ({ seed: r.seed, rot: r.rotation, orAngle: r.orAngle, orLateral: r.orLateral, campsAxe: r.campsAxe, couloirs: r.couloirs }))));
check('chaque graine : 4 portes ouvertes dans le monde, meme definition (PV, type, largeur)', summary.every((r) => r.gates === 4 && r.open && r.memePorte), summary.map((r) => [r.seed, r.gates, r.open, r.memePorte]));
check('ressources de depart intactes (1 pierre, 1 or, bosquet complet dans l enceinte)', summary.every((r) => r.ressources), summary.map((r) => [r.seed, r.ressources]));
check('second or visible au depart, jamais devant une porte (>= 20° des axes)', summary.every((r) => r.orProche >= 1 && r.orAngle !== null && r.orAngle >= 20), summary.map((r) => [r.seed, r.orProche, r.orAngle, r.orLateral]));
check('camps neutres hors des axes des portes (> 2 cases de l axe)', summary.every((r) => r.campsAxe.every((d: number) => d > 2)), summary.map((r) => [r.seed, r.campsAxe]));
check('couloirs des portes : aucun arbre ni gisement', summary.every((r) => r.couloirs === 0), summary.map((r) => [r.seed, r.couloirs]));
for (const kind of ['hero', 'villageois', 'cavalier']) {
  check(`${kind} : sort depuis la cour par CHACUNE des 4 portes, dans son axe (< 1,3 case du centre de la porte au franchissement)`, summary.every((r) => r.sorties[kind].length === 4 && r.sorties[kind].every((s: any) => s.arrived && s.lateral !== null && s.lateral < 1.3)), summary.map((r) => [r.seed, r.sorties[kind]]));
}
check('porte fermee : le Heros sort par une autre et rejoint le point juste derriere ; 4 portes fermees : il reste enferme', summary.every((r) => r.porteFermee.arrive && r.porteFermee.ferme && r.enferme), summary.map((r) => [r.seed, r.porteFermee, r.enferme]));
check('ennemi devant chacune des 4 portes ouvertes : n entre par aucune', summary.every((r) => !r.ennemiEntre), summary.map((r) => [r.seed, r.ennemiEntre]));

console.log(failures ? failures + ' ECHEC(S)' : 'tout OK');
