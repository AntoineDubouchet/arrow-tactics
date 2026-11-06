// Test EN JEU de la passe corrective de navigation (2026-11-06, G49), run reelle graine 12345 : le Paladin construit une palissade
// posee par le menu, entre deux Maisons elles aussi posees par le menu : chantier fini, recherches A* bornees, point de travail
// garde, aucune image gelee par la navigation ; chantier enferme et destination impossible : Heros en Garde, message unique ;
// groupe : pas de rafale de messages.
// Usage : npm run test:game (ou VITE_BASE=http://localhost:5174/ node tests/game/navigation-jeu.cjs)
const L = require('./lib.cjs');
const OUT = L.OUT;
const J = (v) => JSON.stringify(v);
let failures = 0;
const check = (label, ok, extra = '') => { if (!ok) failures++; console.log(`${ok ? 'OK   ' : 'ECHEC'} ${label}${extra ? ' — ' + String(typeof extra === 'string' ? extra : J(extra)).slice(0, 1200) : ''}`); };
(async () => {
  const { browser, ctx } = await L.launch(); const errors = [];
  const p = await L.openSurvival(ctx, '?seed=12345', errors);
  await p.evaluate(async () => {
    window.__hero = () => window.__world.entities.find((e) => e.hero);
    window.__toScreen = (x, z, y) => { const v = new window.THREE.Vector3(x, y ?? window.__S.surfaceY(x, z), z).project(window.__R.camera); return { x: (v.x * 0.5 + 0.5) * innerWidth, y: (-v.y * 0.5 + 0.5) * innerHeight }; };
    window.__flashes = [];
    const urls = performance.getEntriesByType('resource').map((e) => e.name);
    for (const u of urls.filter((n) => n.includes('/src/ui/waveIndicator.ts'))) { const W = (await import(u)).WaveIndicator; const fl = W.prototype.flash; if (!fl.__patched) { W.prototype.flash = function (m) { window.__flashes.push(m); return fl.call(this, m); }; W.prototype.flash.__patched = true; } }
    window.__stats = (await import(urls.find((n) => n.includes('/src/sim/pathfinding.ts')))).pathSearchStats;
    window.__nav = (await import(urls.find((n) => n.includes('/src/sim/systems/movement.ts')))).navigationState;
    const w = window.__world;
    for (const e of w.entities) if (e.team === 'enemy') e.stats.damage = 0;
    const vils = w.entities.filter((e) => e.worker && e.alive);
    w.issueCommand({ kind: 'stop', entityIds: vils.map((e) => e.id) });
    for (const e of vils) { e.worker.autoRetryIn = 1e9; e.cargo.wood = e.cargo.stone = e.cargo.minedGold = 0; }
    window.arrowEconomy.set({ gold: 500, wood: 500, stone: 500 });
    // Duree de chaque image : un gel se verrait ici.
    window.__frames = { max: 0, last: performance.now(), on: false };
    const frame = () => { const t = performance.now(); if (window.__frames.on) window.__frames.max = Math.max(window.__frames.max, t - window.__frames.last); window.__frames.last = t; requestAnimationFrame(frame); };
    frame();
  });
  const setView = (x, z, h = 16) => L.setView(p, { targetX: x, targetZ: z, viewHeight: h, yawDeg: 45, pitchDeg: 55 });
  const screen = (x, z) => p.evaluate(([x, z]) => window.__toScreen(x, z), [x, z]);
  const moveTo = async (x, z) => { const s = await screen(x, z); await p.mouse.move(s.x, s.y, { steps: 2 }); await L.wait(p, 120); return s; };
  const openMenu = async (name) => { await p.locator('.build-menu-button').click({ timeout: 4000 }); await L.wait(p, 200); await p.locator('.build-menu-item', { hasText: name }).first().click({ timeout: 4000 }); await L.wait(p, 200); };
  const heroState = () => p.evaluate(() => { const h = window.__hero(); const n = window.__nav(h); return { x: +h.x.toFixed(2), z: +h.z.toFixed(2), order: h.order.type, stuck: n.stuckCount, stand: n.stand ? [+n.stand.x.toFixed(2), +n.stand.z.toFixed(2)] : null }; });
  const flashes = () => p.evaluate(() => window.__flashes.slice());
  const searches = () => p.evaluate(() => window.__stats.searches);

  // ==== 1. Deux Maisons par le menu, baties.
  const line = { ax: 4, az: 3.3, bx: 14, bz: 3.3 };
  await setView(9, 3, 16); await L.wait(p, 400);
  await openMenu('Maison');
  const houses = [];
  for (const [x, z] of [[9.4, 1.5], [9.4, 5.1]]) {
    const s = await moveTo(x, z);
    await p.keyboard.down('Shift'); await p.mouse.click(s.x, s.y); await p.keyboard.up('Shift'); await L.wait(p, 250);
  }
  await p.keyboard.press('Escape'); await L.wait(p, 200);
  for (let i = 0; i < 120; i++) { const left = await p.evaluate(() => window.__world.entities.filter((e) => e.alive && e.unitId === 'house' && e.construction).length); if (left === 0) break; await L.wait(p, 250); }
  houses.push(...(await p.evaluate(() => window.__world.entities.filter((e) => e.alive && e.unitId === 'house' && e.team === 'player' && !e.construction).map((e) => [e.id, +e.x.toFixed(2), +e.z.toFixed(2)]))));
  check('deux Maisons posees par le menu, baties par le Heros', houses.length >= 4, houses);

  // ==== 2. Palissade entre elles : le cas qui bouclait.
  // Heros au loin, Villageois ecartes : une ligne de palissade refuse de traverser une unite.
  await p.evaluate(() => { const w = window.__world; const h = window.__hero(); w.issueCommand({ kind: 'stop', entityIds: [h.id] }); h.x = h.prevX = -3.5; h.z = h.prevZ = 0.5; let i = 0; for (const e of w.entities) if (e.worker && e.alive) { e.x = e.prevX = -3 + i; e.z = e.prevZ = 10; e.path = null; i += 2; } });
  await L.wait(p, 200);
  await L.blur(p); await p.keyboard.press('Space'); await L.wait(p, 250);
  await setView(9, 3, 16); await L.wait(p, 300);
  const before = await searches();
  await p.evaluate(() => { window.__frames.max = 0; window.__frames.on = true; });
  await openMenu('Palissade');
  const a = await moveTo(line.ax, line.az);
  await p.mouse.click(a.x, a.y); await L.wait(p, 200);
  const b = await moveTo(line.bx, line.bz);
  await p.mouse.click(b.x, b.y); await L.wait(p, 300);
  // Echap : quitte le mode (le trace n'est plus en cours).
  await p.keyboard.press('Escape'); await L.wait(p, 150);
  const count = await p.evaluate(() => window.__world.entities.filter((e) => e.alive && e.wall && e.construction).map((e) => e.id));
  const st0 = await heroState();
  await L.wait(p, 700);
  await p.screenshot({ path: OUT + 'navigation-palissade.png' });
  const samples = [];
  let done = false;
  let t = 0;
  for (; t < 180 && !done; t++) { await L.wait(p, 250); const left = await p.evaluate((ids) => ids.filter((id) => window.__world.getById(id)?.construction).length, count); samples.push((await heroState()).stuck); done = left === 0; }
  const used = (await searches()) - before;
  const frames = await p.evaluate(() => { window.__frames.on = false; return window.__frames.max; });
  const hs = await heroState();
  const fl = await flashes();
  await L.wait(p, 200);
  await p.screenshot({ path: OUT + 'navigation-palissade-fini.png' });
  console.log(`VIDEO palissade de ${count.length} pieces : ${(t * 0.25).toFixed(1)} s, ${used} A*, image la plus longue ${frames.toFixed(0)} ms, blocages ${Math.max(0, ...samples)}`);
  check(`Paladin + palissade de ${count.length} pieces entre deux Maisons : tout est construit, sans abandon`, count.length >= 4 && done && hs.order === 'guard' && !fl.some((m) => /Impossible/.test(m)), { st0, hs, n: count.length, fl });
  check('A* borne sur toute la ligne (150 par seconde pour une seule unite avant la correction)', used <= count.length * 6, { used, secondes: t * 0.25 });
  check('aucune image gelee pendant la construction (moins d une seconde, sous Edge sans GPU)', frames < 1000, frames);

  // ==== 3. Chantier enferme : clic droit, message, Garde.
  const c = { x: -8.5, z: -2.5 };
  await p.evaluate((c) => {
    const w = window.__world; const r = 3;
    const pts = [[c.x - r, c.z - r], [c.x + r, c.z - r], [c.x + r, c.z + r], [c.x - r, c.z + r], [c.x - r, c.z - r]];
    for (let i = 0; i < 4; i++) w.spawnWallLine('player', 'palisade', { ax: pts[i][0], az: pts[i][1], bx: pts[i + 1][0], bz: pts[i + 1][1] });
    window.__sealed = w.spawnWallLine('player', 'palisade', { ax: c.x - 1, az: c.z, bx: c.x + 1, bz: c.z }, { construction: true })[0].id;
    window.__flashes.length = 0;
  }, c);
  await L.wait(p, 200);
  const before2 = await searches();
  await p.evaluate(() => { const h = window.__hero(); window.__world.issueCommand({ kind: 'build', entityIds: [h.id], targetEntityId: window.__sealed }); });
  await L.wait(p, 500);
  const s1 = await heroState(); const f1 = await flashes();
  await p.screenshot({ path: OUT + 'navigation-chantier-enferme.png' });
  check('chantier enferme : Heros en Garde aussitot, « Impossible d atteindre le chantier » une fois, aucun A*', s1.order === 'guard' && f1.filter((m) => /Impossible d.atteindre le chantier/.test(m)).length === 1 && (await searches()) === before2, { s1, f1 });

  // ==== 4. Destination impossible au clic droit, groupe : un seul message.
  await p.evaluate(() => { window.__flashes.length = 0; });
  await L.wait(p, 3200);
  await setView(c.x, c.z, 16); await L.wait(p, 300);
  await L.blur(p); await p.keyboard.press('Space'); await L.wait(p, 250);
  await setView(c.x, c.z, 16); await L.wait(p, 300);
  await p.evaluate(() => { window.__flashes.length = 0; });
  const inside = await screen(c.x + 1.8, c.z + 1.8);
  await p.mouse.click(inside.x, inside.y, { button: 'right' }); await L.wait(p, 500);
  const s2 = await heroState(); const f2 = await flashes();
  check('clic droit dans l enclos : Heros en Garde, « Impossible d atteindre la destination » une fois', s2.order === 'guard' && f2.filter((m) => /Impossible d.atteindre la destination/.test(m)).length === 1, { s2, f2 });
  await L.wait(p, 3200);
  await p.evaluate((c) => {
    const w = window.__world; window.__flashes.length = 0;
    const ids = [window.__hero().id, ...w.entities.filter((e) => e.worker && e.alive).map((e) => e.id)];
    for (let i = 0; i < 6; i++) { const u = w.spawn('fantassin', 'player', 3 + i, 10); u.order = { type: 'guard' }; ids.push(u.id); }
    w.issueCommand({ kind: 'move', entityIds: ids, x: c.x + 1.5, z: c.z + 1.5 });
  }, c);
  await L.wait(p, 900);
  const f3 = await flashes();
  const orders = await p.evaluate(() => window.__world.entities.filter((e) => e.alive && !e.isBuilding && e.team === 'player' && e.order.type === 'move').length);
  check('groupe vers la meme destination impossible : tous arretes, un seul message', orders === 0 && f3.filter((m) => /Impossible/.test(m)).length === 1, { orders, f3 });

  check('aucune erreur de page', errors.length === 0, errors.slice(0, 3));
  console.log(failures ? failures + ' ECHEC(S)' : 'tout OK');
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
