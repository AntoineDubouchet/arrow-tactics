// Tests cibles SANS NAVIGATEUR des camps neutres : generation (presence, determinisme, accessibilite, terrain), gardes
// (repos, aggro, poursuite limitee, retour, regeneration, alerte par blessure), vagues non affectees, coffre (verrou,
// ouverture, pas de double ouverture), butin (table, determinisme, sol), drop d'ennemi, XP, or, performance.
// Usage : node --import ../ts-register.mjs camp.mts (ou npm run test:sim)
const SRC = new URL('../../src/', import.meta.url).href;
const { generateSurvivalMap, ENEMY_SPAWN_RING_RADIUS } = await import(SRC + 'config/maps/proceduralSurvival.ts');
const { World } = await import(SRC + 'sim/world.ts');
const { campSpecOf } = await import(SRC + 'run/camps.ts');
// Camps semantiques (2026-11-03) : coffre, postes et rayon derives.
const { campLayoutOf } = await import(SRC + 'data/campLayout.ts');
const { CAMP_KINDS } = await import(SRC + 'data/camps.ts');
const { LOOT_TABLES, rollLoot } = await import(SRC + 'data/loot.ts');
const { EQUIPMENT, RARITIES } = await import(SRC + 'data/equipment.ts');
const { INITIAL_EXPLORED_RADIUS } = await import(SRC + 'data/vision.ts');
const { applyDamageToEntity } = await import(SRC + 'sim/damage.ts');
const { cachedPathGrid, reachableTiles, isReachable } = await import(SRC + 'sim/pathfinding.ts');
const { terrainObstacles } = await import(SRC + 'sim/geometry.ts');
const { Rng } = await import(SRC + 'core/rng.ts');
const DT = 1 / 30;
let failures = 0;
const check = (label: string, ok: boolean, extra: unknown = '') => { if (!ok) failures++; console.log(`${ok ? 'OK   ' : 'ECHEC'} ${label}${extra !== '' ? ' — ' + JSON.stringify(extra).slice(0, 700) : ''}`); };
const run = (w: any, seconds: number, each?: () => boolean | void) => { for (let t = 0; t < seconds; t += DT) { w.step(DT); if (each?.()) return true; } return false; };

// ---- Generation : 40 graines.
{
  const kinds: Record<string, number> = {};
  const bad: unknown[] = []; let minEdge = Infinity; let minDist = Infinity; let maxDist = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const m = generateSurvivalMap(seed);
    if (!m.camps?.length) { bad.push({ seed, err: 'aucun camp' }); continue; }
    const kk = m.camps.map((c: any) => c.kind).join('+'); kinds[kk] = (kinds[kk] ?? 0) + 1;
    if (m.camps.length === 2 && Math.hypot(m.camps[0].x - m.camps[1].x, m.camps[0].z - m.camps[1].z) < 20) bad.push({ seed, err: 'camps trop proches' });
    for (const c of m.camps) {
    const cl = campLayoutOf(c);
    const d = Math.hypot(c.x, c.z); minDist = Math.min(minDist, d); maxDist = Math.max(maxDist, d); minEdge = Math.min(minEdge, d - cl.radius);
    const water = new Set((m.surfaceCells ?? []).filter((s: any) => s.surface === 'eau').map((s: any) => `${s.x},${s.z}`));
    const elev = new Set((m.elevationCells ?? []).map((e: any) => `${e.x},${e.z}`));
    const treeCells = new Set(m.obstacles.filter((o: any) => o.kind === 'tree').map((o: any) => `${Math.floor(o.x)},${Math.floor(o.z)}`));
    const cells = new Set(m.cells.map((k: any) => `${k.x},${k.z}`));
    for (let z = Math.floor(c.z - cl.radius); z <= Math.ceil(c.z + cl.radius); z++) for (let x = Math.floor(c.x - cl.radius); x <= Math.ceil(c.x + cl.radius); x++) {
      if (Math.hypot(x + 0.5 - c.x, z + 0.5 - c.z) > cl.radius - 0.5) continue;
      const k = `${x},${z}`;
      if (!cells.has(k) || water.has(k) || elev.has(k) || treeCells.has(k)) bad.push({ seed, k, water: water.has(k), relief: elev.has(k), tree: treeCells.has(k) });
    }
    // Accessible a pied depuis la Baliste : centre, postes de garde, coffre.
    const w = new World(1); w.setMap(m);
    const grid = cachedPathGrid(terrainObstacles(w.obstacles, w.entities), w.boardWidth, w.boardHeight);
    const reach = reachableTiles(grid, 0.5, 0.5);
    for (const pt of [c, cl.chest, ...cl.guardPosts]) if (!isReachable(grid, reach, pt.x, pt.z)) bad.push({ seed, injoignable: pt });
    }
    if (JSON.stringify(generateSurvivalMap(seed).camps) !== JSON.stringify(m.camps)) bad.push({ seed, err: 'non deterministe' });
  }
  check(`generation (40 graines) : petit camp toujours present, grand camp le plus souvent (a plus de 20 cases du petit), meme graine = meme camp, clairiere sans eau / relief / rampe / arbre, centre + coffre + postes joignables a pied ; hors zone exploree au depart (${INITIAL_EXPLORED_RADIUS}) et de l anneau des vagues (${ENEMY_SPAWN_RING_RADIUS} +- 4), loin du bord (46,5)`,
    bad.length === 0 && (kinds['raiders_small'] ?? 0) + (kinds['raiders_small+raiders_large'] ?? 0) === 40 && (kinds['raiders_small+raiders_large'] ?? 0) >= 30 && minEdge > INITIAL_EXPLORED_RADIUS + 1 && minEdge >= ENEMY_SPAWN_RING_RADIUS + 4 && maxDist + 3.5 < 46.5 - 4, { kinds, bad: bad.slice(0, 6), minEdge: +minEdge.toFixed(2), minDist: +minDist.toFixed(2), maxDist: +maxDist.toFixed(2) });
}

const map = generateSurvivalMap(12345);
const def = map.camps[0];
const len = Math.hypot(def.x, def.z);
const toward = (d: number) => ({ x: def.x - (def.x / len) * d, z: def.z - (def.z / len) * d });
const setup = (seed = 7, heroAt = 20, passive = false) => {
  const w = new World(seed); w.setMap(map);
  const camp = w.addCamp(campSpecOf(def));
  const p = toward(heroAt);
  const h = w.spawnHero('player', p.x, p.z, { xp: 0, level: 1, deaths: 0 });
  h.order = { type: 'guard' };
  // Heros passif (essais du camp) : sans lui, le Paladin en Garde engage tout ennemi a 9 cases (son aggro).
  if (passive) h.stats.aggroRange = 0;
  const guards = () => camp.guardIds.map((id: number) => w.getById(id));
  return { w, camp, h, guards };
};

// ---- Gardes : repos, aggro par la zone de detection, vagues non affectees.
{
  const { w, camp, h, guards } = setup(7, 8, true);
  run(w, 5);
  const repos = guards().map((g: any) => ({ d: +Math.hypot(g.x - g.campGuard.postX, g.z - g.campGuard.postZ).toFixed(2), t: g.targetId, o: g.order.type }));
  const combatants = w.countCombatants('enemy');
  check('repos : Heros (passif) a 8 cases (hors detection 6), 5 s -> gardes immobiles a leur poste, sans cible, en Garde ; ils ne comptent pas comme ennemis de vague (countCombatants = 0)',
    repos.every((r: any) => r.d < 0.05 && r.t === null && r.o === 'guard') && !camp.alerted && combatants === 0, { repos, combatants });
  const p = toward(5); h.x = h.prevX = p.x; h.z = h.prevZ = p.z;
  run(w, 0.5);
  check('aggro : Heros dans la zone de detection (5 cases) -> camp en alerte (evenement), les 4 gardes le ciblent', camp.alerted && guards().every((g: any) => g.targetId === h.id), guards().map((g: any) => g.targetId));
}
// Camp au calme : jamais cible automatiquement (Heros en Garde, aggro 9, a 8 cases), seulement sur ordre d'attaque.
{
  const { w, camp, h, guards } = setup(7, 8);
  run(w, 4);
  const calme = { t: h.targetId, alerted: camp.alerted, calm: guards().map((g: any) => g.campGuard.calm) };
  w.issueCommand({ kind: 'attack', entityIds: [h.id], targetEntityId: guards()[0].id });
  run(w, 3);
  check('camp au calme : un Heros en Garde a 8 cases (dans son aggro de 9) ne fonce pas sur le camp (aucune cible, camp calme) ; un ordre d attaque explicite lance le combat (camp en alerte, gardes plus au calme)',
    calme.t === null && !calme.alerted && calme.calm.every(Boolean) && camp.alerted && guards().every((g: any) => !g.campGuard.calm) && guards().some((g: any) => g.targetId === h.id), { calme, alerted: camp.alerted });
}
// Alerte par blessure (archer hors detection) et poursuite limitee + retour + regeneration.
{
  const { w, camp, h, guards } = setup(7, 9, true);
  run(w, 1);
  const g0 = guards()[0];
  applyDamageToEntity(g0, 20);
  let alertEv = false;
  run(w, 0.4, () => { if (w.campEvents.some((e: any) => e.type === 'campAlert')) alertEv = true; });
  check('alerte par blessure : un garde touche alors que le Heros est hors detection (9 cases) -> alerte, le camp attaque le Heros (dans la laisse 11)', alertEv && camp.alerted && guards().some((g: any) => g.targetId === h.id), { alerted: camp.alerted, t: guards().map((g: any) => g.targetId) });
  // Le Heros s'enfuit loin (Heros intouchable pour l'essai).
  h.stats.maxHp = h.hp = 1e9;
  w.issueCommand({ kind: 'move', entityIds: [h.id], x: 0.5, z: 2 });
  let maxFromCamp = 0; let returningSeen = false;
  const back = run(w, 40, () => {
    for (const g of guards()) { maxFromCamp = Math.max(maxFromCamp, Math.hypot(g.x - def.x, g.z - def.z)); if (g.campGuard.returning) returningSeen = true; }
    return guards().every((g: any) => !g.campGuard.returning && g.order.type === 'guard' && Math.hypot(g.x - g.campGuard.postX, g.z - g.campGuard.postZ) < 0.05) && returningSeen;
  });
  check('poursuite limitee : le Heros fuit vers la Baliste -> les gardes ne depassent jamais laisse + 3 (14 cases du camp), puis rentrent a leur poste (ordre de deplacement, puis Garde) ; camp calme',
    back && maxFromCamp <= 14.5 && !camp.alerted, { maxFromCamp: +maxFromCamp.toFixed(2), back, alerted: camp.alerted });
  const hpBefore = g0.hp;
  run(w, 12);
  check('regeneration au poste (10 %/s, camp calme) : le garde blesse revient a pleins PV', hpBefore < g0.stats.maxHp && g0.hp === g0.stats.maxHp, { hpBefore, hp: g0.hp, max: g0.stats.maxHp });
}
// Ennemi de vague : pas de zone de chasse, marche vers la Baliste, inchange.
{
  const { w, guards } = setup(7, 30);
  w.assaultGoal = { x: 0.5, z: 0.5 };
  const wave = w.spawn('fantassin', 'enemy', toward(12).x, toward(12).z);
  const d0 = Math.hypot(wave.x, wave.z);
  run(w, 3);
  check('vague non affectee : un ennemi de vague (assault, sans zone de chasse ni camp) marche vers la Baliste ; les gardes restent au camp ; fin de vague : seul l ennemi de vague compte',
    wave.huntZone === null && wave.campGuard === null && Math.hypot(wave.x, wave.z) < d0 - 3 && guards().every((g: any) => g.order.type === 'guard') && w.countCombatants('enemy') === 1, { d0: +d0.toFixed(2), d: +Math.hypot(wave.x, wave.z).toFixed(2) });
}

// ---- Combat complet : Paladin niveau 1 seul, XP, nettoyage, or, coffre, butin.
const fight = (seed: number) => {
  const s = setup(seed, 9);
  const { w, camp, h, guards } = s;
  const events: any[] = []; let xp = 0;
  // Coffre verrouille avant : commande refusee ('locked').
  w.issueCommand({ kind: 'openChest', entityIds: [h.id], chestId: 0 }); w.step(DT);
  const refus = w.commandResults[0]?.rejection;
  w.issueCommand({ kind: 'move', entityIds: [h.id], x: def.x, z: def.z });
  run(w, 90, () => {
    for (const ev of w.heroEvents) if (ev.type === 'xp') xp += ev.amount;
    events.push(...w.campEvents);
    if (h.order.type === 'guard' && h.targetId === null) { const g = guards().find((g: any) => g.alive); if (g) w.issueCommand({ kind: 'attack', entityIds: [h.id], targetEntityId: g.id }); }
    return camp.state === 'cleared' || !h.alive;
  });
  return { ...s, refus, xp, events };
};
{
  const results = [1, 2, 3, 4, 5].map((seed) => { const f = fight(seed); return { seed, cleared: f.camp.state, hp: Math.round(f.h.hp), max: f.h.stats.maxHp, xp: f.xp, level: f.h.hero.level, refus: f.refus, cleared_ev: f.events.filter((e: any) => e.type === 'campCleared') }; });
  check('combat (5 graines) : Paladin niveau 1 seul gagne, PV restants entre 25 % et 90 % (accessible, pas gratuit) ; XP des 4 kills (58 = 8 + 8 + 12 + 30, plafond par kill respecte) -> niveau 2 ; un seul evenement de nettoyage avec 8 or ; coffre refuse avant (locked)',
    results.every((r) => r.cleared === 'cleared' && r.hp / r.max > 0.25 && r.hp / r.max < 0.9 && r.xp === 58 && r.level === 2 && r.refus === 'locked' && r.cleared_ev.length === 1 && r.cleared_ev[0].gold === 8), results);
}
{
  const { w, h, camp } = fight(3);
  h.hp = h.stats.maxHp;
  const chest = w.chests[0];
  w.issueCommand({ kind: 'openChest', entityIds: [h.id], chestId: 0 });
  let opened: any = null; let gatherT = 0; let t = 0;
  run(w, 20, () => { t += DT; if (h.hero.working === 'gather') gatherT += DT; const ev = w.heroEvents.find((e: any) => e.type === 'chestOpened'); if (ev) { opened = { ...ev, t }; return true; } });
  const drop = opened?.dropId !== null && opened ? w.itemDrops[opened.dropId] : null;
  w.issueCommand({ kind: 'openChest', entityIds: [h.id], chestId: 0 }); w.step(DT);
  const second = w.commandResults[0]?.rejection;
  check('coffre apres nettoyage : commande acceptee, le Heros y va, ouvre en 1 s (geste de ramassage), un item tire tombe devant le coffre (< 1,2 case), coffre ouvert ; seconde ouverture refusee',
    opened && opened.itemId && Math.abs(gatherT - 1) < 0.1 && chest.opened && drop && Math.hypot(drop.x - chest.x, drop.z - chest.z) < 1.2 && drop.itemId === opened.itemId && second === 'invalid-target' && w.lootEvents.length === 0, { opened, gatherT: +gatherT.toFixed(2), drop, second, state: camp.state });
  // Ramassage puis equipement : le circuit existant (pickupItem).
  w.issueCommand({ kind: 'pickupItem', entityIds: [h.id], dropId: drop.id });
  let picked: any = null; run(w, 10, () => { picked = w.heroEvents.find((e: any) => e.type === 'itemPickup') ?? null; return !!picked; });
  check('butin du coffre ramasse (ordre pickupItem existant)', picked?.itemId === opened.itemId && drop.taken, picked);
}
// Determinisme du coffre : meme graine de monde, meme etat -> meme item ; graines differentes -> butins varies.
{
  const items = [1, 1, 2, 3, 4, 5, 6, 7].map((seed) => {
    const { w, h } = fight(seed);
    h.stats.maxHp = h.hp = 1e9;
    w.issueCommand({ kind: 'openChest', entityIds: [h.id], chestId: 0 });
    let item = null; run(w, 15, () => { const ev = w.heroEvents.find((e: any) => e.type === 'chestOpened'); if (ev) { item = ev.itemId; return true; } });
    return item;
  });
  check('determinisme : meme graine (1) deux fois -> meme item ; 7 graines -> au moins 2 items differents', items[0] === items[1] && new Set(items).size >= 2, items);
}
// Table du coffre : frequences par rarete sur 20000 tirages (graine fixe).
{
  const rng = new Rng(99); const counts: Record<string, number> = {};
  for (let i = 0; i < 20000; i++) { const id = rollLoot(LOOT_TABLES.camp_chest_small, () => rng.next()); const r = EQUIPMENT[id!].rarity; counts[r] = (counts[r] ?? 0) + 1; }
  const pct = Object.fromEntries(Object.entries(counts).map(([k, v]) => [k, +(v / 200).toFixed(1)]));
  check('table du coffre : toujours un item ; Commune ~60 %, Peu commune ~30 %, Rare ~10 %, ni Epique ni Legendaire', Math.abs(pct.common - 60) < 2 && Math.abs(pct.uncommon - 30) < 2 && Math.abs(pct.rare - 10) < 1.5 && !pct.epic && !pct.legendary && Object.values(counts).reduce((a, b) => a + b, 0) === 20000, pct);
}
// ---- Drop d'ennemi : Maraudeur, ~12 %, une seule fois par mort, deterministe.
{
  const once = (seed: number) => {
    const w = new World(seed); w.setMap(map);
    const ids: number[] = [];
    for (let i = 0; i < 300; i++) { const e = w.spawn('maraudeur', 'enemy', 10 + (i % 20) * 0.9, 10 + Math.floor(i / 20) * 0.9); e.order = { type: 'guard' }; ids.push(e.id); }
    const traq = w.spawn('traqueur', 'enemy', -10, -10);
    for (const id of ids) applyDamageToEntity(w.getById(id), 1e6);
    applyDamageToEntity(traq, 1e6);
    w.step(DT);
    const first = w.lootEvents.map((e: any) => `${e.sourceId}:${e.itemId}`);
    w.step(DT); w.step(DT);
    return { first, again: w.lootEvents.length, drops: w.itemDrops.length, traq: first.some((s: string) => s.startsWith(traq.id + ':')) };
  };
  const a = once(5), b = once(5);
  const rate = a.first.length / 300;
  check('drop d ennemi : 300 Maraudeurs abattus -> ~12 % lachent un item commun au sol (une fois par mort, rien aux pas suivants) ; le Traqueur (sans table) rien ; meme graine -> memes drops',
    rate > 0.07 && rate < 0.17 && a.again === 0 && a.drops === a.first.length && !a.traq && JSON.stringify(a.first) === JSON.stringify(b.first) && a.first.every((s: string) => /starter_sword|guard_pauldrons/.test(s)), { rate, again: a.again, drops: a.drops });
}
// ---- Determinisme global d'un combat de camp (positions, PV, butin).
{
  const sig = (seed: number) => { const { w, h, camp } = fight(seed); return JSON.stringify([w.tick, Math.round(h.hp * 1000), Math.round(h.x * 1000), camp.state, w.itemDrops.map((d: any) => d.itemId)]); };
  check('determinisme : deux combats de meme graine -> meme tick de fin, memes PV, meme position, memes drops', sig(4) === sig(4), sig(4));
}
// ---- Grand camp : 6 gardes dont un Ravageur ; Paladin niveau 1 seul : mort ; niveau 2 + Epee du debutant : gagne.
{
  const big = map.camps.find((c: any) => c.kind === 'raiders_large');
  const res = big ? [1, 2].map((lvl) => {
    const w = new World(3); w.setMap(map); const camp = w.addCamp(campSpecOf(big)); const l = Math.hypot(big.x, big.z);
    const h = w.spawnHero('player', big.x - (big.x / l) * 9, big.z - (big.z / l) * 9, { xp: lvl === 2 ? 58 : 0, level: lvl, deaths: 0 });
    if (lvl === 2) w.queueHeroEquipment(h.id, { maxHp: 0, maxMana: 0, manaRegen: 0, damage: 30, magicDamage: 0, attackSpeed: 0, moveSpeed: 0, fireDamage: 0 });
    w.issueCommand({ kind: 'move', entityIds: [h.id], x: big.x, z: big.z });
    run(w, 90, () => { if (h.order.type === 'guard' && h.targetId === null) { const g = camp.guardIds.map((id: number) => w.getById(id)).find((g: any) => g.alive); if (g) w.issueCommand({ kind: 'attack', entityIds: [h.id], targetEntityId: g.id }); } return camp.state === 'cleared' || !h.alive; });
    return { lvl, gardes: camp.guardIds.map((id: number) => w.getById(id).unitId).join(), state: camp.state, alive: h.alive, hp: Math.round(h.hp), chest: w.chests[0].lootTableId };
  }) : null;
  check('grand camp (graine 12345) : 6 gardes dont un Ravageur, coffre a la table du grand camp ; Paladin niveau 1 seul : mort ; niveau 2 + Epee du debutant : camp nettoye',
    !!res && /ravageur/.test(res[0].gardes) && res[0].gardes.split(',').length === 6 && !res[0].alive && res[1].state === 'cleared' && res[1].alive && res[1].chest === 'camp_chest_large', res);
}
// ---- Performance : pas de simulation avec camp inactif / en combat, generation.
{
  const timeSteps = (w: any, n: number) => { const t0 = performance.now(); for (let i = 0; i < n; i++) w.step(DT); return (performance.now() - t0) / n; };
  const noCamp = (() => { const w = new World(7); w.setMap(map); const p = toward(20); const h = w.spawnHero('player', p.x, p.z, { xp: 0, level: 1, deaths: 0 }); h.order = { type: 'guard' }; timeSteps(w, 60); return timeSteps(w, 600); })();
  const idle = (() => { const { w } = setup(7, 20); timeSteps(w, 60); return timeSteps(w, 600); })();
  const combat = (() => { const { w, h, camp } = setup(7, 9); h.stats.maxHp = h.hp = 1e9; w.issueCommand({ kind: 'move', entityIds: [h.id], x: def.x, z: def.z }); timeSteps(w, 60); return camp.state === 'active' ? timeSteps(w, 300) : NaN; })();
  const t0 = performance.now(); for (let s = 1; s <= 10; s++) generateSurvivalMap(s); const gen = (performance.now() - t0) / 10;
  console.log(`PERF pas sans camp ${noCamp.toFixed(3)} ms, camp inactif ${idle.toFixed(3)} ms, combat de camp ${combat.toFixed(3)} ms ; generation ${gen.toFixed(1)} ms`);
}
console.log(failures ? failures + ' ECHEC(S)' : 'tout OK');
