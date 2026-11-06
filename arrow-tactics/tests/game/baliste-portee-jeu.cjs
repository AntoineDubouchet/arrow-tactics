// Test EN JEU de la portee de la Baliste (2026-11-06, 22,6 cases) : en mode AUTO, depuis sa place reelle dans le noyau, elle engage et touche
// un ennemi devant la porte proche, les portes laterales et la porte opposee, dans deux rotations du camp. Distances reelles affichees.
// Usage : npm run test:game (ou VITE_BASE=http://localhost:5174/ node tests/game/baliste-portee-jeu.cjs)
const L = require('./lib.cjs');
const J = (v) => JSON.stringify(v);
let failures = 0;
const check = (label, ok, extra = '') => { if (!ok) failures++; console.log(`${ok ? 'OK   ' : 'ECHEC'} ${label}${extra !== '' ? ' — ' + String(typeof extra === 'string' ? extra : J(extra)).slice(0, 900) : ''}`); };

(async () => {
  const { browser, ctx } = await L.launch();
  const rows = [];
  for (const seed of [12345, 1]) {
    const errors = [];
    const p = await L.openSurvival(ctx, `?seed=${seed}`, errors);
    const gates = await p.evaluate(() => {
      const w = window.__world;
      const hall = w.entities.find((e) => e.unitId === 'townhall'); const ballista = w.entities.find((e) => e.unitId === 'ballista');
      window.__ballista = ballista;
      return w.entities.filter((e) => e.wall?.door).map((g) => { const dx = g.x - hall.x; const dz = g.z - hall.z; const n = Math.hypot(dx, dz); const x = g.x + (dx / n) * 1.2; const z = g.z + (dz / n) * 1.2; return { x, z, d: Math.hypot(x - ballista.x, z - ballista.z) }; }).sort((a, b) => a.d - b.d);
    });
    const names = ['proche', 'proche 2', 'laterale ou opposee', 'la plus loin'];
    const results = [];
    for (let i = 0; i < gates.length; i++) {
      const gate = gates[i];
      await p.evaluate((g) => {
        const w = window.__world;
        const f = w.spawn('maraudeur', 'enemy', g.x, g.z);
        f.order = { type: 'guard' }; f.stats.moveSpeed = 0; f.stats.damage = 0; f.stats.aggroRange = 0; f.stats.maxHp = 1e6; f.hp = 1e6;
        window.__foe = f;
      }, gate);
      let hit = false;
      for (let t = 0; t < 40 && !hit; t++) { await L.wait(p, 250); hit = await p.evaluate(() => window.__foe.hp < 1e6); }
      results.push({ porte: names[i], distance: +gate.d.toFixed(2), touche: hit });
      await p.evaluate(() => { window.__foe.hp = 0; });
      await L.wait(p, 500);
    }
    rows.push({ seed, portes: results, erreurs: errors.length });
    await p.close();
  }
  console.log('BALISTE distances reelles', J(rows));
  check('Baliste en AUTO : un ennemi devant chacune des 4 portes est engage et touche, porte opposee comprise, dans 2 rotations', rows.every((r) => r.portes.length === 4 && r.portes.every((g) => g.touche)), rows);
  check('aucune erreur de page', rows.every((r) => r.erreurs === 0), rows.map((r) => r.erreurs));
  console.log(failures ? failures + ' ECHEC(S)' : 'tout OK');
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
