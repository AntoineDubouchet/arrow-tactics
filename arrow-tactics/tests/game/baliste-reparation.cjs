// Test EN JEU (2026-11-03) : la Baliste endommagee se repare (bouton de sa fiche, cout paye, le Heros y va, PV pleins).
// Usage : npm run test:game (ou VITE_BASE=http://localhost:5174/ node tests/game/baliste-reparation.cjs)
const L = require('./lib.cjs');
const J = (v) => JSON.stringify(v);
let failures = 0;
const check = (label, ok, extra = '') => { if (!ok) failures++; console.log((ok ? 'OK    ' : 'ECHEC ') + label + (extra ? ' — ' + J(extra).slice(0, 600) : '')); };
(async () => {
  const { browser, ctx } = await L.launch(); const errors = [];
  const p = await L.openSurvival(ctx, '?seed=12345', errors);
  await p.evaluate(() => {
    window.__toScreen = (x, z, y) => { const v = new window.THREE.Vector3(x, y ?? window.__S.surfaceY(x, z), z).project(window.__R.camera); return { x: (v.x * 0.5 + 0.5) * innerWidth, y: (-v.y * 0.5 + 0.5) * innerHeight }; };
    window.__hero = () => window.__world.entities.find((e) => e.hero);
    window.arrowEconomy.set({ gold: 500, wood: 100, stone: 100 });
    for (const e of window.__world.entities) if (e.team === 'enemy') e.stats.damage = 0;
  });
  const b = await p.evaluate(() => { const w = window.__world; const b = w.entities.find((e) => e.unitId === 'ballista'); b.hp = b.stats.maxHp * 0.5; const h = window.__hero(); h.x = h.prevX = b.x + 7; h.z = h.prevZ = b.z + 3; return { id: b.id, x: b.x, z: b.z, hp: b.hp, max: b.stats.maxHp, radius: b.stats.radius, fp: b.footprintObstacle ? { kind: b.footprintObstacle.kind, tx: b.footprintObstacle.tilesX, tz: b.footprintObstacle.tilesZ } : null, obstacles: w.obstacles.filter((o) => Math.hypot((o.x ?? 0) - b.x, (o.z ?? 0) - b.z) < 3).map((o) => ({ kind: o.kind, tx: o.tilesX, tz: o.tilesZ, x: o.x, z: o.z })) }; });
  await L.setView(p, { targetX: b.x, targetZ: b.z, viewHeight: 14, yawDeg: 45, pitchDeg: 55 }); await L.wait(p, 400);
  const s = await p.evaluate((b) => window.__toScreen(b.x, b.z, window.__S.surfaceY(b.x, b.z) + 1.5), b);
  await p.mouse.click(s.x, s.y); await L.wait(p, 500);
  const fiche = await p.evaluate(() => ({ title: document.querySelector('.entity-info:not([hidden]) .entity-info-title')?.textContent ?? null, actions: [...document.querySelectorAll('.entity-info:not([hidden]) .entity-info-action')].map((x) => ({ a: x.dataset.action, t: x.textContent, off: x.disabled, title: x.title })) }));
  const stock0 = await p.evaluate(() => window.arrowEconomy.stock());
  const btn = p.locator('.entity-info:not([hidden]) .entity-info-action[data-action="repairBuilding"]');
  if (await btn.count()) { await btn.first().click(); await L.wait(p, 300); }
  const log = [];
  for (let i = 0; i < 24; i++) {
    await L.wait(p, 500);
    log.push(await p.evaluate((id) => { const w = window.__world; const h = window.__hero(); const b = w.getById(id); return { o: h.order.type, wk: h.hero.working, x: +h.x.toFixed(2), z: +h.z.toFixed(2), d: +Math.hypot(h.x - b.x, h.z - b.z).toFixed(2), hp: +b.hp.toFixed(1) }; }, b.id));
  }
  const stock1 = await p.evaluate(() => window.arrowEconomy.stock());
  const rep = fiche.actions.find((a) => a.a === 'repairBuilding');
  check('fiche de la Baliste endommagee : bouton « Réparer » actif avec son cout', !!rep && !rep.off && /Réparer — .*or/.test(rep.t), fiche.actions.map((a) => a.t));
  check('reparation : le Heros va a la Baliste (ordre repair, geste build), PV pleins, cout paye, puis Garde', log.some((l) => l.o === 'repair' && l.wk === 'build') && log[log.length - 1].hp === b.max && log[log.length - 1].o === 'guard' && stock1.gold < stock0.gold, { first: log[0], last: log[log.length - 1], stock0, stock1 });
  if (errors.length) { failures++; console.log('ERREURS', errors.join(' / ').slice(0, 600)); }
  console.log(failures ? failures + ' ECHEC(S)' : 'tout OK');
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
