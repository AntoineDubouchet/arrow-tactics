// Tests EN JEU de la priorite 3 : Auberge (menu, fiche, Villageois produit), Villageois selectionne comme une unite,
// clic droit sur un arbre sans Forge : recolte directe (hache des le depart, 2026-11-04), depot a la Baliste,
// stock +5 bois, retour a l'arbre ; fiche (charge portee, ni XP ni mana). Auberge et Villageois du camp de depart exclus. Usage : npm run test:game (ou VITE_BASE=http://localhost:5174/ node tests/game/villageois-jeu.cjs)
const L = require('./lib.cjs');
const OUT = require('./lib.cjs').OUT;
const J = (v) => JSON.stringify(v);
let failures = 0;
const check = (label, ok, extra = '') => { if (!ok) failures++; console.log(`${ok ? 'OK   ' : 'ECHEC'} ${label}${extra ? ' — ' + String(typeof extra === 'string' ? extra : J(extra)).slice(0, 900) : ''}`); };
(async () => {
  const { browser, ctx } = await L.launch(); const errors = [];
  const p = await L.openSurvival(ctx, '?seed=12345', errors);
  await p.evaluate(async () => {
    const urls = performance.getEntriesByType('resource').map((e) => e.name);
    window.__toScreen = (x, z, y) => { const v = new window.THREE.Vector3(x, y ?? window.__S.surfaceY(x, z), z).project(window.__R.camera); return { x: (v.x * 0.5 + 0.5) * innerWidth, y: (-v.y * 0.5 + 0.5) * innerHeight }; };
    window.__hero = () => window.__world.entities.find((e) => e.hero);
    window.__bld = await import(urls.find((n) => n.includes('/src/data/buildings.ts')));
    window.__flashes = [];
    for (const u of urls.filter((n) => n.includes('/src/ui/waveIndicator.ts'))) {
      const W = (await import(u)).WaveIndicator; const fl = W.prototype.flash;
      if (!fl.__patched) { W.prototype.flash = function (m) { window.__flashes.push(m); return fl.call(this, m); }; W.prototype.flash.__patched = true; }
    }
    for (const e of window.__world.entities) if (e.team === 'enemy') e.stats.damage = 0;
  });
  await p.evaluate(() => window.arrowEconomy.set({ gold: 500, wood: 100, stone: 100 }));
  const base = await p.evaluate(() => { const b = window.__world.entities.find((e) => e.unitId === 'ballista'); return { x: Math.floor(b.x), z: Math.floor(b.z) }; });
  const setView = (x, z, h = 16) => L.setView(p, { targetX: x, targetZ: z, viewHeight: h, yawDeg: 45, pitchDeg: 55 });
  const actions = () => p.evaluate(() => [...document.querySelectorAll('.entity-info:not([hidden]) .entity-info-action')].map((b) => ({ a: b.dataset.action, t: b.textContent })));
  const rows = () => p.evaluate(() => (document.querySelector('.entity-info:not([hidden])')?.innerText ?? '').replace(/\s+/g, ' '));

  // 1. Auberge au menu, posee (hors de l'emprise du camp de depart), achevee par le Heros ; Villageois produit.
  const pre = await p.evaluate(() => ({ tav: window.__world.entities.filter((e) => e.unitId === 'tavern').map((e) => e.id), vil: window.__world.entities.filter((e) => e.unitId === 'villageois' && e.team === 'player').map((e) => e.id) }));
  await setView(base.x - 7, base.z + 12); await L.wait(p, 250);
  let tav = null;
  for (const [dx, dz] of [[0, 0], [1, 1], [-1, 1], [2, 0], [0, 2]]) {
    await p.locator('.build-menu-button').click(); await L.wait(p, 200);
    await p.locator('.build-menu-item', { hasText: 'Auberge' }).first().click(); await L.wait(p, 200);
    const s = await p.evaluate(([x, z]) => window.__toScreen(x, z), [base.x - 7 + dx, base.z + 12 + dz]);
    await p.mouse.move(s.x, s.y, { steps: 2 }); await L.wait(p, 120); await p.mouse.click(s.x, s.y); await L.wait(p, 350);
    tav = await p.evaluate((old) => window.__world.entities.find((e) => e.unitId === 'tavern' && !old.includes(e.id))?.id ?? null, pre.tav);
    if (tav !== null) break;
    await p.keyboard.press('Escape'); await L.wait(p, 150);
  }
  await p.evaluate((id) => { const w = window.__world; const e = w.getById(id); e.construction.progress = 0.995; const h = window.__hero(); h.x = h.prevX = e.x + e.stats.radius + 1.2; h.z = h.prevZ = e.z; w.issueCommand({ kind: 'build', entityIds: [h.id], targetEntityId: e.id }); }, tav);
  for (let i = 0; i < 20; i++) { await L.wait(p, 300); if (await p.evaluate((id) => !window.__world.getById(id).construction, tav)) break; }
  const tpos = await p.evaluate((id) => { const e = window.__world.getById(id); return { x: e.x, z: e.z }; }, tav);
  await setView(tpos.x, tpos.z + 2, 14); await L.wait(p, 400);
  const ts = await p.evaluate(([x, z]) => window.__toScreen(x, z, window.__S.surfaceY(x, z) + 0.8), [tpos.x, tpos.z]);
  await p.mouse.click(ts.x, ts.y); await L.wait(p, 400);
  const aTav = await actions();
  await p.locator('.entity-info:not([hidden]) .entity-info-action[data-action="produceUnit"]', { hasText: 'Villageois' }).first().click(); await L.wait(p, 300);
  await p.evaluate((id) => { const e = window.__world.getById(id); if (e.productionOrders[0]) e.productionOrders[0].remaining = 0.05; }, tav);
  await L.wait(p, 900);
  const vil = await p.evaluate((old) => { const e = window.__world.entities.find((e) => e.unitId === 'villageois' && e.team === 'player' && e.alive && !old.includes(e.id)); return e ? { id: e.id, x: e.x, z: e.z, hero: !!e.hero, level: e.level, worker: !!e.worker } : null; }, pre.vil);
  check('camp de depart : 1 Auberge et 2 Villageois deja presents (exclus de la suite)', pre.tav.length === 1 && pre.vil.length === 2, pre);
  check('Auberge : au menu, fiche -> Produire Villageois + Ralliement ; un Villageois sort (unite simple, pas Heros, niveau 1, transport)', aTav.some((x) => x.a === 'produceUnit' && /Villageois/.test(x.t)) && aTav.some((x) => x.a === 'setRally') && vil && !vil.hero && vil.worker && vil.level === 1, { aTav: aTav.map((x) => x.t), vil });

  // 2. Selection du Villageois (clic) ; arbre le plus proche.
  const tree = await p.evaluate((v) => { const w = window.__world; return [...w.resourceNodes.values()].filter((n) => n.resource === 'wood' && !w.depletedResourceNodes.has(n.id)).sort((a, b) => Math.hypot(a.x - v.x, a.z - v.z) - Math.hypot(b.x - v.x, b.z - v.z))[0]; }, vil);
  // Le Villageois est pose a 4 cases de l'arbre, cote camp, pour un trajet court.
  await p.evaluate(([id, t]) => { const e = window.__world.getById(id); const d = Math.hypot(t.x, t.z) || 1; e.x = e.prevX = t.x - (t.x / d) * 4; e.z = e.prevZ = t.z - (t.z / d) * 4; e.order = { type: 'guard' }; }, [vil.id, tree]);
  const vp = await p.evaluate((id) => { const e = window.__world.getById(id); return { x: e.x, z: e.z }; }, vil.id);
  await setView((vp.x + tree.x) / 2, (vp.z + tree.z) / 2, 12); await L.wait(p, 500);
  const vs = await p.evaluate(([x, z]) => window.__toScreen(x, z, window.__S.surfaceY(x, z) + 0.6), [vp.x, vp.z]);
  // Rectangle de selection autour du Villageois (le Heros est loin).
  await p.mouse.move(vs.x - 40, vs.y - 50); await p.mouse.down(); await p.mouse.move(vs.x + 40, vs.y + 40, { steps: 6 }); await p.mouse.up(); await L.wait(p, 400);
  const sheet = await rows();
  check('Villageois selectionne comme une unite : fiche « Villageois », ni charge, ni XP, ni mana', /villageois/i.test(sheet) && !/Porté (rien|d)/.test(sheet) && !/XP|Mana/.test(sheet), sheet.slice(0, 300));

  // 3. Sans Forge (aucune sur la carte) : clic droit sur l'arbre -> recolte directe, aucun message Forge.
  const ttop = await p.evaluate((t) => window.__toScreen(t.x, t.z, window.__S.surfaceY(t.x, t.z) + 1.6), tree);
  await p.mouse.click(ttop.x, ttop.y, { button: 'right' }); await L.wait(p, 4000);
  const noForge = await p.evaluate(([id, t]) => { const w = window.__world; const e = w.getById(id); return { forges: w.entities.filter((b) => b.unitId === 'forge').length, order: e.order.type, d: Math.hypot(e.x - t.x, e.z - t.z), working: e.worker.working, wood: e.cargo.wood, reste: w.resourceNodeAmounts.get(t.id), msg: window.__flashes.filter((m) => /Forge/.test(m)) }; }, [vil.id, tree]);
  check('sans Forge : clic droit -> recolte directe (ordre de recolte, coupe au pied de l arbre, bois dans le cargo, arbre decompte), aucun message Forge', noForge.forges === 0 && noForge.order === 'harvest' && noForge.msg.length === 0 && noForge.d < 3 && noForge.working === 'chop' && noForge.wood >= 1 && noForge.reste === 20 - noForge.wood, noForge);

  // 4. Toujours sans Forge : boucle complete, depot a la Baliste (+5 bois au stock), retour a l'arbre.
  const wood0 = (await p.evaluate(() => window.arrowEconomy.stock())).wood;
  await p.mouse.click(ttop.x, ttop.y, { button: 'right' }); await L.wait(p, 400);
  const o1 = await p.evaluate((id) => window.__world.getById(id).order, vil.id);
  let log = [], back = false;
  for (let i = 0; i < 90 && !back; i++) {
    await L.wait(p, 500);
    const s = await p.evaluate((id) => { const e = window.__world.getById(id); return { o: e.order.type, wood: window.arrowEconomy.stock().wood }; }, vil.id);
    if (!log.length || log[log.length - 1].o !== s.o) log.push(s);
    if (s.wood >= wood0 + 5 && s.o === 'harvest') back = true;
  }
  const wood1 = (await p.evaluate(() => window.arrowEconomy.stock())).wood;
  await p.screenshot({ path: OUT + 'villageois-jeu.png' });
  check('sans Forge : clic droit -> recolte, cargo 5 -> depot a la Baliste (stock +5) -> retour a l arbre (cargo economique, 2026-11-03)', o1.type === 'harvest' && wood1 >= wood0 + 5 && back && log.some((s) => s.o === 'deposit'), { o1, wood0, wood1, log });

  if (errors.length) { failures++; console.log('ERREURS', errors.join(' / ').slice(0, 1500)); }
  console.log(failures ? failures + ' ECHEC(S)' : 'tout OK');
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
