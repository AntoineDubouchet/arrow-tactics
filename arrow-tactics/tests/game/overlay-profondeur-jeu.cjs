// Test EN JEU (2026-11-08) : reperes prioritaires (anneaux de selection et de depot, marqueurs de
// ralliement, plaque de placement : couche GAMEPLAY_OVERLAY_LAYER) rendus par FogOfWarPass APRES la
// composition brouillard + nappes, mais en respectant la profondeur de la scene (render/fogOfWar.ts,
// makeOverlayDepthAware : relecture de la DepthTexture de la passe). Contrat : (1) en Survie, la passe
// du brouillard est active et tout objet de la couche a un materiau depth-aware ; (2) Heros
// selectionne DERRIERE l'Hotel de ville : couper le test (__R.fogPass.overlayDepthTest) fait apparaitre
// l'anneau sur la facade (difference de pixels nette), alors que DEVANT le batiment le test ne change
// rien. Mesure par difference de captures dans une petite zone autour du Heros, pas de pixel fixe.
// Captures : out/overlay-profondeur-{devant,derriere}-{on,off}.png (graine 12345).
// Usage : npm run test:game (ou VITE_BASE=http://localhost:5174/ node tests/game/overlay-profondeur-jeu.cjs)
const L = require('./lib.cjs');
const J = (v) => JSON.stringify(v);
let failures = 0;
const check = (label, ok, extra = '') => { if (!ok) failures++; console.log(`${ok ? 'OK   ' : 'ECHEC'} ${label}${extra !== '' ? ' — ' + String(typeof extra === 'string' ? extra : J(extra)).slice(0, 900) : ''}`); };

const teleport = (p, id, x, z) => p.evaluate(({ id, x, z }) => { const e = window.__world.entities.find((e) => e.id === id); e.x = e.prevX = x; e.z = e.prevZ = z; e.path = null; e.order = { type: 'guard' }; e.target = null; e.targetId = undefined; }, { id, x, z });
const setDepth = (p, on) => p.evaluate((on) => { window.__R.fogPass.overlayDepthTest = on; }, on);
/** Pixels (sur `roi`, en pixels CSS) dont la couleur differe de plus de 40 entre deux captures. */
async function roiDiff(helper, a, b, roi) {
  return helper.evaluate(async ({ a, b, roi }) => {
    const load = (src) => new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.src = src; });
    const [ia, ib] = await Promise.all([load(a), load(b)]);
    const cv = document.createElement('canvas'); cv.width = roi.w; cv.height = roi.h; const g = cv.getContext('2d');
    const read = (img) => { g.drawImage(img, roi.x, roi.y, roi.w, roi.h, 0, 0, roi.w, roi.h); return g.getImageData(0, 0, roi.w, roi.h).data; };
    const da = read(ia), db = read(ib); let removed = 0, added = 0;
    // Pixels bleus (anneau du joueur) presents sans le test (b) et absents avec (a) : `removed` ;
    // l'inverse : `added`. Le scintillement des lumieres chaudes (sol beige) ne compte pas.
    const blue = (d, i) => d[i + 2] > d[i] + 30 && d[i + 2] > d[i + 1] + 10;
    for (let i = 0; i < da.length; i += 4) { const a = blue(da, i), b = blue(db, i); if (b && !a) removed++; else if (a && !b) added++; }
    return { removed, added };
  }, { a, b, roi });
}

(async () => {
  const { browser, ctx } = await L.launch();
  const errors = [];
  const p = await L.openSurvival(ctx, '?seed=12345', errors);
  // Unites figees (aucun combat, Heros en Garde), tout visible : la mesure ne depend pas du brouillard.
  await p.evaluate(() => { for (const e of window.__world.entities) if (!e.isBuilding) { e.order = { type: 'guard' }; e.stats.aggroRange = 0; if (!e.hero) e.stats.moveSpeed = 0; } const f = window.__R.fog; f.update = () => {}; f.state.fill(2); f.texture.image.data.fill(255); f.texture.needsUpdate = true; });
  // Animations des unites figees : la difference de captures ne doit venir que de l'anneau.
  const freezeAnimations = () => p.evaluate(() => { let n = 0; window.__R.scene.traverse((o) => { if (o.userData?.riggedMixer) { o.userData.riggedMixer.timeScale = 0; n++; } }); return n; });
  const info = await p.evaluate(async () => {
    const w = window.__world; const R = window.__R;
    const th = w.entities.find((e) => e.isBuilding && e.unitId === 'townhall');
    const h = w.entities.find((e) => e.hero);
    const d = new window.THREE.Vector3(); R.camera.getWorldDirection(d); const n = Math.hypot(d.x, d.z);
    const fog = await import('/src/render/fogOfWar.ts');
    const overlay = []; R.scene.traverse((o) => { if (o.layers.mask === 1 << fog.GAMEPLAY_OVERLAY_LAYER && o.material) overlay.push({ name: o.name || o.type, aware: fog.isOverlayDepthAware(o.material) }); });
    return { th: { id: th.id, x: th.x, z: th.z }, hero: h.id, f: { x: d.x / n, z: d.z / n }, pass: !!R.fogPass && !!R.fog, test: R.fogPass?.overlayDepthTest, bias: R.fogPass?.overlayDepthBias, overlay };
  });
  check('Survie : passe du brouillard active, test de profondeur des reperes actif par defaut, biais 0,01', info.pass && info.test === true && info.bias === 0.01, { pass: info.pass, test: info.test, bias: info.bias });
  check('tous les objets de la couche overlay deja en scene ont un materiau depth-aware (au moins l\'anneau de depot)', info.overlay.length >= 1 && info.overlay.every((o) => o.aware), info.overlay);
  const T = info.th, f = info.f, H = info.hero;
  const at = (k) => ({ x: T.x + f.x * k, z: T.z + f.z * k });
  await L.setView(p, { targetX: T.x, targetZ: T.z, viewHeight: 12 }); await L.wait(p, 500); await L.texturesReady(p);
  // Heros selectionne au clic en terrain libre (a cote du batiment), puis teleporte.
  const open = { x: T.x + f.z * 4 - f.x * 4, z: T.z - f.x * 4 - f.z * 4 };
  await teleport(p, H, open.x, open.z); await L.wait(p, 250);
  const c = await p.evaluate(({ x, z }) => window.__toScreen(x, z, window.__S.surfaceY(x, z) + 0.6), open);
  await p.mouse.click(c.x, c.y); await L.wait(p, 350);
  const frozen = await freezeAnimations();
  const stats = await p.evaluate(() => { const r = window.__R.renderer; return { calls: r.info.render.calls, programs: r.info.programs.length }; });
  console.log('info', J({ frozen, stats }));
  const ringAware = await p.evaluate(async () => { const fog = await import('/src/render/fogOfWar.ts'); const r = []; window.__R.scene.traverse((o) => { if (o.visible && o.geometry?.type === 'RingGeometry' && o.layers.mask === 1 << fog.GAMEPLAY_OVERLAY_LAYER) r.push(fog.isOverlayDepthAware(o.material)); }); return r; });
  check('Heros selectionne : anneau de selection dans la couche overlay, materiau depth-aware', ringAware.length >= 1 && ringAware.every(Boolean), ringAware);
  const helper = await browser.newPage();
  const png = (b) => 'data:image/png;base64,' + b.toString('base64');
  const results = {};
  // Devant : a 4,4 cases du centre (3,2 avant le 2026-11-08), a l'ecart du feu de camp pose devant
  // l'Hotel de ville (render/warmLights.ts) et de la Baliste, dont les volumes masqueraient
  // legitimement une partie de l'anneau.
  for (const [name, k] of [['devant', -4.4], ['derriere', 3.0]]) {
    const pos = at(k);
    await teleport(p, H, pos.x, pos.z); await L.wait(p, 350);
    const s = await p.evaluate(({ x, z }) => window.__toScreen(x, z, window.__S.surfaceY(x, z)), pos);
    const roi = { x: Math.round(s.x - 70), y: Math.round(s.y - 50), w: 140, h: 100 };
    const shots = {};
    for (const on of [true, false]) { await setDepth(p, on); await L.wait(p, 250); shots[on ? 'on' : 'off'] = await p.screenshot(); L.fs.writeFileSync(`${L.OUT}overlay-profondeur-${name}-${on ? 'on' : 'off'}.png`, shots[on ? 'on' : 'off']); }
    await setDepth(p, true);
    results[name] = { roi, diff: await roiDiff(helper, png(shots.on), png(shots.off), roi) };
  }
  // Derriere : sans le test, l'anneau est dessine a travers la facade (pixels bleus retires par le test).
  // Devant : l'anneau reste ; seule sa portion derriere les pieds du Heros (occlusion legitime par le
  // corps de l'unite) disparait, bien moins que derriere le batiment.
  check('Heros DERRIERE l\'Hotel de ville : l\'anneau dessine a travers la facade sans le test est masque avec (>= 200 pixels retires)', results.derriere.diff.removed >= 200, results.derriere);
  check('Heros DEVANT l\'Hotel de ville : l\'anneau reste visible avec le test (moins de 40 % des pixels retires derriere)', results.devant.diff.removed < 0.4 * results.derriere.diff.removed, results.devant);
  check('aucune erreur de page', errors.length === 0, errors.slice(0, 3));
  await browser.close();
  if (failures > 0) { console.log(`${failures} ECHEC(S)`); process.exit(1); }
  console.log('tout OK');
})().catch((e) => { console.error(e); process.exit(1); });
