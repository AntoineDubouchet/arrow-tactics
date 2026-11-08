// Test EN JEU (2026-11-08) : flash de selection (render/unitSelectionRing.ts, selectionPulseScale ;
// render/battleSelection.ts, pulse) : au clic qui selectionne une unite, son anneau gonfle puis revient
// en ~240 ms ; le simple maintien de la selection ne pulse pas. Contrat, sans pixel : l'echelle de
// l'anneau visible de la couche overlay est echantillonnee a chaque image pendant 500 ms apres le
// clic : maximum >= 1,1 x l'echelle finale, echelle finale stable ; puis, sans nouveau clic, 500 ms
// d'echantillons sans variation (< 1 %). Meme chose pour une inspection de batiment (anneau de
// l'Hotel de ville). Usage : npm run test:game (ou VITE_BASE=http://localhost:5174/ node tests/game/selection-flash-jeu.cjs)
const L = require('./lib.cjs');
const J = (v) => JSON.stringify(v);
let failures = 0;
const check = (label, ok, extra = '') => { if (!ok) failures++; console.log(`${ok ? 'OK   ' : 'ECHEC'} ${label}${extra !== '' ? ' — ' + String(typeof extra === 'string' ? extra : J(extra)).slice(0, 900) : ''}`); };

/** Echelle (scale.x) du premier anneau visible qui verifie `pick`, a chaque image pendant `ms`. */
const sampleScale = (p, ms, which) => p.evaluate(async ({ ms, which }) => {
  const fog = await import('/src/render/fogOfWar.ts');
  const find = () => { let s = null; window.__R.scene.traverse((o) => { if (s !== null || !o.visible || o.geometry?.type !== 'RingGeometry') return; const overlay = o.layers.mask === 1 << fog.GAMEPLAY_OVERLAY_LAYER; if (which === 'unit' ? overlay : !overlay && o.parent === window.__R.scene) s = o.scale.x; }); return s; };
  return new Promise((res) => { const out = []; const t0 = performance.now(); const tick = () => { out.push({ t: Math.round(performance.now() - t0), s: find() }); if (performance.now() - t0 < ms) requestAnimationFrame(tick); else res(out); }; requestAnimationFrame(tick); });
}, { ms, which });
const summary = (samples) => { const s = samples.map((x) => x.s).filter((v) => v !== null); const last = s.slice(-5); return { n: s.length, max: Math.max(...s), final: last.length ? last.reduce((a, b) => a + b, 0) / last.length : null, finalSpread: last.length ? Math.max(...last) - Math.min(...last) : null }; };

(async () => {
  const { browser, ctx } = await L.launch();
  const errors = [];
  const p = await L.openSurvival(ctx, '?seed=12345', errors);
  await p.evaluate(() => { for (const e of window.__world.entities) if (!e.isBuilding) { e.order = { type: 'guard' }; e.stats.aggroRange = 0; e.stats.moveSpeed = 0; } });
  const hero = await p.evaluate(() => { const h = window.__world.entities.find((e) => e.hero); return { id: h.id, x: h.x, z: h.z }; });
  const open = { x: hero.x - 4, z: hero.z + 2 };
  await p.evaluate(({ id, x, z }) => { const e = window.__world.getById(id); e.x = e.prevX = x; e.z = e.prevZ = z; e.path = null; }, { id: hero.id, ...open });
  await L.setView(p, { targetX: open.x, targetZ: open.z, viewHeight: 10 }); await L.wait(p, 400);
  const c = await p.evaluate(({ x, z }) => window.__toScreen(x, z, window.__S.surfaceY(x, z) + 0.6), open);
  // Clic de selection puis echantillonnage immediat.
  await p.mouse.click(c.x, c.y);
  const pulse = summary(await sampleScale(p, 500, 'unit'));
  check('clic sur le Heros : l\'anneau de selection gonfle (max >= 1,1 x final) puis revient a une echelle stable', pulse.n >= 10 && pulse.final !== null && pulse.max >= 1.1 * pulse.final && pulse.finalSpread <= 0.01 * pulse.final, pulse);
  const hold = summary(await sampleScale(p, 500, 'unit'));
  check('selection maintenue sans nouveau clic : aucun pulse (variation < 1 %)', hold.n >= 10 && hold.max <= 1.01 * hold.final, hold);
  // Inspection d'un batiment : clic sur l'Hotel de ville, anneau d'inspection (scene, hors couche overlay).
  const th = await p.evaluate(() => { const t = window.__world.entities.find((e) => e.unitId === 'townhall'); return { x: t.x, z: t.z }; });
  await L.setView(p, { targetX: th.x, targetZ: th.z, viewHeight: 12 }); await L.wait(p, 400);
  const ct = await p.evaluate(({ x, z }) => window.__toScreen(x, z, window.__S.surfaceY(x, z) + 1.5), th);
  await p.mouse.click(ct.x, ct.y);
  const bpulse = summary(await sampleScale(p, 500, 'building'));
  check('clic sur l\'Hotel de ville : l\'anneau d\'inspection pulse puis revient a 1', bpulse.n >= 10 && bpulse.final !== null && bpulse.max >= 1.1 * bpulse.final && Math.abs(bpulse.final - 1) <= 0.01, bpulse);
  check('aucune erreur de page', errors.length === 0, errors.slice(0, 3));
  await browser.close();
  if (failures > 0) { console.log(`${failures} ECHEC(S)`); process.exit(1); }
  console.log('tout OK');
})().catch((e) => { console.error(e); process.exit(1); });
