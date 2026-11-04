// Test EN JEU du Tourbillon (regles du 2026-11-05) : flash blanc de degats sur CHAQUE cible a CHAQUE tic (10 tics en
// 5 s, observe par le crochet de rendu UnitViews.playHit) ; lance pendant un deplacement : l'ordre move est conserve,
// le Heros continue jusqu'a sa destination sans passer en Garde ; recharge 15 s a la fin.
// Usage : npm run test:game (ou VITE_BASE=http://localhost:5174/ node tests/game/tourbillon-jeu.cjs)
const L = require('./lib.cjs');
const OUT = L.OUT;
const J = (v) => JSON.stringify(v);
let failures = 0;
const check = (label, ok, extra = '') => { if (!ok) failures++; console.log(`${ok ? 'OK   ' : 'ECHEC'} ${label}${extra ? ' — ' + String(typeof extra === 'string' ? extra : J(extra)).slice(0, 900) : ''}`); };
(async () => {
  const { browser, ctx } = await L.launch(); const errors = [];
  const p = await L.openSurvival(ctx, '?seed=12345', errors);
  await p.evaluate(async () => {
    const urls = performance.getEntriesByType('resource').map((e) => e.name);
    window.__hits = [];
    for (const u of urls.filter((n) => n.includes('/src/render/unitViews.ts'))) {
      const UV = (await import(u)).UnitViews; const ph = UV.prototype.playHit;
      if (!ph.__patched) { UV.prototype.playHit = function (id) { window.__hits.push({ id, t: window.__world.tick }); return ph.call(this, id); }; UV.prototype.playHit.__patched = true; }
    }
    window.__hero = () => window.__world.entities.find((e) => e.hero);
    for (const e of window.__world.entities) if (e.team === 'enemy') e.stats.damage = 0;
  });
  const hero = await p.evaluate(() => { const h = window.__hero(); return { id: h.id, x: h.x, z: h.z }; });

  // 1. Trois ennemis immobiles et inoffensifs autour du Heros immobile : 10 tics, 3 flashs par tic.
  const foes = await p.evaluate((h) => {
    const w = window.__world; const ids = [];
    for (const [dx, dz] of [[1.3, 0], [-1.0, 0.9], [0, -1.3]]) { const e = w.spawn('fantassin', 'enemy', h.x + dx, h.z + dz); e.stats = { ...e.stats, damage: 0, moveSpeed: 0, maxHp: 100000 }; e.hp = 100000; ids.push(e.id); }
    const hero = window.__hero(); hero.hero.mana = 20; w.issueCommand({ kind: 'stop', entityIds: [hero.id] });
    return ids;
  }, hero);
  await L.setView(p, { targetX: hero.x, targetZ: hero.z, viewHeight: 10, yawDeg: 45, pitchDeg: 55 }); await L.wait(p, 400);
  const t0 = await p.evaluate((h) => { window.__hits = []; const w = window.__world; w.issueCommand({ kind: 'cast', entityIds: [h], spellId: 'whirlwind', targetEntityId: h }); return w.tick; }, hero.id);
  await L.wait(p, 1200);
  await p.screenshot({ path: OUT + 'tourbillon-flash.png' });
  let state = null;
  for (let i = 0; i < 30; i++) { await L.wait(p, 300); state = await p.evaluate(() => ({ ww: !!window.__hero().hero.whirlwind, tick: window.__world.tick })); if (!state.ww) break; }
  // La commande s'applique au pas suivant (t0 + 1 = lancement) ; seuls les flashs pendant l'effet comptent (l'attaque
  // de base reprend apres la 10e frappe).
  const hits = await p.evaluate(([ids, t0]) => { const by = {}; for (const id of ids) by[id] = [...new Set(window.__hits.filter((h) => h.id === id && h.t > t0 + 1 && h.t <= t0 + 1 + 150).map((h) => h.t - (t0 + 1)))].sort((a, b) => a - b); return by; }, [foes, t0]);
  // Pas distincts de flash par ennemi (l'attaque de base, qui reprend au pas de la 10e frappe, peut flasher au meme pas).
  // D'autres sources peuvent flasher un ennemi au meme moment (carreaux de la Baliste du camp) : chaque ennemi doit
  // avoir recu un flash a CHACUN des 10 pas de frappe (15, 30, ... 150 apres le lancement).
  const expected = Array.from({ length: 10 }, (_, i) => 15 * (i + 1));
  const perFoe = foes.map((id) => expected.filter((t) => hits[id].includes(t)).length);
  const ticks = hits[foes[0]];
  const cd = await p.evaluate(() => window.__hero().hero.spellCooldowns.whirlwind ?? 0);
  check('Tourbillon sur place : chaque ennemi touche recoit le flash de degats (playHit) a chacun des 10 tics ; tics toutes les 0,5 s (15 pas), le premier a 0,5 s, le dernier a 5 s ; recharge 15 s a la fin',
    !state.ww && perFoe.every((n) => n === 10) && cd > 12 && cd <= 15, { perFoe, ticks, cd, t0 });

  // 2. Lance en marchant : ordre move conserve, le Heros continue jusqu'a sa destination.
  await p.evaluate((ids) => { for (const id of ids) { const e = window.__world.getById(id); e.hp = 0; } }, foes);
  await L.wait(p, 500);
  const walk = await p.evaluate((h) => {
    const w = window.__world; const hero = window.__hero(); hero.hero.mana = 20; hero.hero.spellCooldowns = {};
    const dest = { x: hero.x, z: hero.z - 7 };
    w.issueCommand({ kind: 'move', entityIds: [h], x: dest.x, z: dest.z });
    return { dest, start: { x: hero.x, z: hero.z } };
  }, hero.id);
  await L.wait(p, 700);
  const mid = await p.evaluate((h) => { const w = window.__world; const hero = window.__hero(); const before = { order: hero.order.type, z: hero.z, ref: hero.order }; w.issueCommand({ kind: 'cast', entityIds: [h], spellId: 'whirlwind', targetEntityId: h }); return before; }, hero.id);
  await L.wait(p, 400);
  const during = await p.evaluate(() => { const hero = window.__hero(); return { order: hero.order.type, ww: !!hero.hero.whirlwind, z: hero.z }; });
  let arrived = null;
  for (let i = 0; i < 30 && !arrived; i++) { await L.wait(p, 300); arrived = await p.evaluate((d) => { const hero = window.__hero(); const dist = Math.hypot(hero.x - d.x, hero.z - d.z); return dist < 0.8 ? { dist, order: hero.order.type } : null; }, walk.dest); }
  check('lance en marchant : l ordre move est conserve pendant le Tourbillon (aucun passage en Garde), le Heros continue (z decroissant) et atteint sa destination',
    mid.order === 'move' && during.order === 'move' && during.ww && during.z < mid.z - 0.3 && !!arrived, { mid: { order: mid.order, z: +mid.z.toFixed(2) }, during: { ...during, z: +during.z.toFixed(2) }, arrived });
  check('aucune erreur de page', errors.length === 0, errors.slice(0, 3));
  console.log(failures ? failures + ' ECHEC(S)' : 'tout OK');
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
