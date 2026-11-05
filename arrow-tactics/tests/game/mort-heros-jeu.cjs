// Test EN JEU de la mort du Heros (2026-11-06, G48), run reelle graine 12345 : VFX a sa position, flash initial, lumiere qui
// monte verticalement, disparition apres la duree prevue, un seul effet (aucune repetition chaque image ni pendant l'attente),
// partie continue, Baliste vivante = pas de defaite, camera ni deplacee ni bloquee, retour du Heros sans nouvel effet ; capture
// au milieu de l'effet.
// Usage : npm run test:game (ou VITE_BASE=http://localhost:5174/ node tests/game/mort-heros-jeu.cjs)
const L = require('./lib.cjs');
const OUT = L.OUT;
const J = (v) => JSON.stringify(v);
let failures = 0;
const check = (label, ok, extra = '') => { if (!ok) failures++; console.log(`${ok ? 'OK   ' : 'ECHEC'} ${label}${extra ? ' — ' + String(typeof extra === 'string' ? extra : J(extra)).slice(0, 1200) : ''}`); };
(async () => {
  const { browser, ctx } = await L.launch(); const errors = [];
  const p = await L.openSurvival(ctx, '?seed=12345', errors);
  await p.evaluate(() => {
    window.__hero = () => window.__world.entities.find((e) => e.hero);
    for (const e of window.__world.entities) if (e.team === 'enemy') e.stats.damage = 0;
    // Releve a chaque image : nombre d'effets et etat de l'effet courant.
    window.__vfx = () => {
      const roots = [];
      window.__R.scene.traverse((o) => { if (o.name === 'hero-death-vfx') roots.push(o); });
      if (roots.length === 0) return { n: 0 };
      const r = roots[0];
      const g = (n) => r.getObjectByName(n);
      return { n: roots.length, x: r.position.x, z: r.position.z, y: r.position.y, flash: g('hero-death-flash').visible ? g('hero-death-flash').material.opacity : 0, halo: g('hero-death-halo').material.opacity, ring: g('hero-death-ring').material.opacity, soulY: g('hero-death-soul').position.y, soulA: g('hero-death-soul').material.opacity, columnBase: g('hero-death-column').position.y, columnTop: g('hero-death-column').position.y + g('hero-death-column').scale.y, pointSize: g('hero-death-particles').material.size, pointTop: Math.max(...g('hero-death-particles').geometry.getAttribute('position').array.filter((_, i) => i % 3 === 1)) };
    };
    window.__samples = [];
    window.__maxRoots = 0;
    const sample = () => { const s = window.__vfx(); window.__maxRoots = Math.max(window.__maxRoots, s.n); if (s.n) window.__samples.push({ t: performance.now(), ...s }); window.__sampler = requestAnimationFrame(sample); };
    sample();
  });
  await p.waitForFunction(() => !!window.__R);
  const pos = await p.evaluate(() => { const h = window.__hero(); return { x: h.x, z: h.z }; });
  await L.setView(p, { targetX: pos.x, targetZ: pos.z, viewHeight: 24, yawDeg: 45, pitchDeg: 40 }); await L.wait(p, 500);
  const view0 = await L.view(p);

  const noVfx = await p.evaluate(() => window.__vfx().n);
  check('avant la mort : aucun effet', noVfx === 0);

  // ---- La mort.
  const t0 = await p.evaluate(() => { const h = window.__hero(); h.hp = 0; window.__t0 = performance.now(); return { tick: window.__world.tick, x: h.x, z: h.z }; });
  await p.waitForFunction(() => window.__vfx().n > 0, null, { timeout: 3000 });
  await L.wait(p, 900);
  await p.screenshot({ path: OUT + 'mort-heros-milieu.png' });
  const mid = await p.evaluate(() => window.__vfx());
  await L.wait(p, 600);
  await p.screenshot({ path: OUT + 'mort-heros-fin.png' });
  // Fin : plus d'effet.
  await p.waitForFunction(() => window.__vfx().n === 0, null, { timeout: 5000 });
  const samples = await p.evaluate(() => window.__samples.map((s) => ({ ...s, t: (s.t - window.__t0) / 1000 })));
  const maxRoots = await p.evaluate(() => window.__maxRoots);
  const first = samples[0];
  const last = samples.at(-1);
  const dur = last.t - first.t;
  const heroNow = await p.evaluate(() => { const h = window.__hero(); return { alive: h.alive, timer: h.hero.respawnTimer, deaths: h.hero.deaths }; });

  check('effet a la position du Heros, au sol', Math.abs(first.x - t0.x) < 0.01 && Math.abs(first.z - t0.z) < 0.01, { first, t0 });
  check('flash blanc initial, tres bref : fort au debut, eteint apres 0,5 s', first.flash > 0.4 && samples.filter((s) => s.t > first.t + 0.5).every((s) => s.flash === 0), { flash: first.flash });
  check('cercle et halo au sol : visibles au debut, effaces a la fin', Math.max(...samples.map((s) => s.halo)) > 0.3 && first.ring > 0.3 && last.ring < 0.1 && last.halo < 0.2, { halo: Math.max(...samples.map((s) => s.halo)), last });
  const monotone = samples.every((s, i) => i === 0 || s.soulY >= samples[i - 1].soulY - 1e-6);
  check('lumiere qui MONTE verticalement : lueur en hausse continue, de ~1 a plus de 12 cases, sans bouger en x / z', monotone && first.soulY < 2 && last.soulY > 12 && samples.every((s) => s.x === first.x && s.z === first.z), { soul0: first.soulY, soul1: last.soulY });
  const midS = samples.find((s) => s.t > first.t + 1);
  check('colonne : s eleve puis sa base quitte le sol vers le ciel', Math.max(...samples.map((s) => s.columnTop)) > 12 && first.columnBase < 0.1 && last.columnBase > 5, { midS, last });
  check('particules : visibles (camera orthographique : taille en pixels, >= 8), elles montent', first.pointSize >= 8 && last.pointTop > first.pointTop + 5, { size: first.pointSize, top0: first.pointTop, top1: last.pointTop });
  check('duree prevue : 2,2 s environ', dur > 1.7 && dur < 3, dur);
  check('un seul effet, jamais empile ni relance', maxRoots === 1 && samples.every((s) => s.n === 1), maxRoots);

  // ---- La partie continue.
  const live = await p.evaluate(() => { const b = window.__world.entities.find((e) => e.unitId === 'ballista'); return { tick: window.__world.tick, ballista: b.alive, defeat: !!document.querySelector('.screen-overlay--visible'), flash: document.querySelector('.wave-indicator')?.innerText ?? '' }; });
  const view1 = await L.view(p);
  check('partie continue : la simulation avance, Baliste vivante, aucun ecran de defaite, Heros a terre en attente de retour', live.tick > t0.tick && live.ballista && !live.defeat && !heroNow.alive && heroNow.timer > 0 && heroNow.deaths === 1, { live, heroNow });
  check('camera ni forcee ni deplacee', J(view0) === J(view1), { view0, view1 });

  // ---- Pendant l'attente, et au retour : plus aucun effet de mort.
  await L.wait(p, 1500);
  const count1 = await p.evaluate(() => window.__samples.length);
  await p.evaluate(() => { window.__hero().hero.respawnTimer = 0.2; });
  await L.wait(p, 1200);
  const back = await p.evaluate(() => ({ alive: window.__hero().alive, vfx: window.__vfx().n, samples: window.__samples.length }));
  check('attente puis retour : aucun nouvel effet, Heros de retour', back.alive && back.vfx === 0 && back.samples === count1, { back, count1 });

  // ---- Deuxieme mort : effet de nouveau, une fois.
  await p.evaluate(() => { window.__samples.length = 0; window.__maxRoots = 0; window.__hero().hp = 0; });
  await p.waitForFunction(() => window.__vfx().n > 0, null, { timeout: 3000 });
  await p.waitForFunction(() => window.__vfx().n === 0, null, { timeout: 5000 });
  const second = await p.evaluate(() => ({ max: window.__maxRoots, n: window.__samples.length, deaths: window.__hero().hero.deaths }));
  check('deuxieme mort : un nouvel effet, un seul', second.max === 1 && second.n > 0 && second.deaths === 2, second);

  await p.evaluate(() => cancelAnimationFrame(window.__sampler));
  check('aucune erreur de page', errors.length === 0, errors.slice(0, 3));
  console.log(failures ? failures + ' ECHEC(S)' : 'tout OK');
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
