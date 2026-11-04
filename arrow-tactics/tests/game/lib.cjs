// Outils communs des tests EN JEU (Playwright, Edge) : page du jeu servie par
// Vite (VITE_BASE, par defaut http://localhost:5177/ comme tests/run-game.mjs),
// crochets de lecture (camera, scene, monde, Renderer), Mode survie lance en
// temps reel, captures dans tests/game/out/ (ignore par Git).
// Deterministe cote rendu : Math.random est remplace par deux suites fixes
// (debris de bois de render/board.ts a part) ; les tirages de la simulation
// passent par la RNG du World et ne sont pas concernes.
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');
const OUT = path.join(__dirname, 'out') + path.sep;
const BASE = process.env.VITE_BASE || 'http://localhost:5177/';
const CHANNEL = process.env.TEST_BROWSER_CHANNEL || 'msedge';
const J = (v) => JSON.stringify(v);
const wait = (p, ms) => p.waitForTimeout(ms);

async function launch() {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ channel: CHANNEL });
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 }, acceptDownloads: true });
  await ctx.addInitScript(() => {
    const mk = (seed) => { let s = seed >>> 0; return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
    const other = mk(0x2545f491), debris = mk(0x1234567);
    Math.random = () => (/scatterDecoration|createWoodDebris/.test(new Error().stack || '') ? debris() : other());
  });
  return { browser, ctx };
}

/** Page du jeu, crochets installes : THREE, camera/scene/WebGLRenderer, Renderer du jeu (__R), World (__world, __maps). */
async function openPage(ctx, query = '', errors = []) {
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push(String(e.stack || e)));
  p.on('dialog', (d) => d.accept());
  await p.goto(BASE + query);
  await p.getByRole('button', { name: 'Mode survie', exact: true }).waitFor({ timeout: 120000 });
  await p.evaluate(async () => {
    const urls = performance.getEntriesByType('resource').map((e) => e.name);
    const mod = (q) => import(urls.find((n) => n.includes(q)) ?? q);
    const THREE = await import(urls.find((n) => /\/deps\/three\.js/.test(n)));
    window.THREE = THREE;
    const ob = THREE.Object3D.prototype.onBeforeRender;
    THREE.Object3D.prototype.onBeforeRender = function (r, sc, c, ...rest) { if (this.isScene && c) { window.__cam = c; window.__scene = sc; window.__renderer = r; } return ob.call(this, r, sc, c, ...rest); };
    const R = (await mod('/src/render/renderer.ts')).Renderer;
    const rr = R.prototype.render; R.prototype.render = function (...a) { window.__R = this; return rr.apply(this, a); };
    const W = (await mod('/src/sim/world.ts')).World;
    const st = W.prototype.step; W.prototype.step = function (...a) { window.__world = this; return st.apply(this, a); };
    const sm = W.prototype.setMap; W.prototype.setMap = function (map, ...a) { window.__maps = [...(window.__maps ?? []), map]; window.__world = this; return sm.call(this, map, ...a); };
    window.__S = await mod('/src/render/terrainSurface.ts');
    window.__blend = await mod('/src/render/surfaceBlend.ts');
    window.__toScreen = (x, z, y) => { const v = new window.THREE.Vector3(x, y ?? window.__S.surfaceY(x, z), z).project(window.__cam); return { x: (v.x * 0.5 + 0.5) * innerWidth, y: (-v.y * 0.5 + 0.5) * innerHeight }; };
    window.__entities = () => (window.__world?.entities ?? []).filter((e) => e.unitId).map((e) => ({ id: e.id, team: e.team, unitId: e.unitId, x: +e.x.toFixed(2), z: +e.z.toFixed(2), hp: e.hp }));
  });
  await p.waitForFunction(() => !!window.__R, null, { timeout: 10000 });
  return p;
}

/** Page du jeu + Mode survie (Heros preselectionne, run en temps reel), grille et voile de territoire masques. */
async function openSurvival(ctx, query, errors) {
  const p = await openPage(ctx, query, errors);
  await p.getByRole('button', { name: 'Mode survie', exact: true }).click(); await wait(p, 400);
  const launchBtn = p.locator('.hero-select-launch');
  if (await launchBtn.isVisible().catch(() => false)) await launchBtn.click();
  await wait(p, 2100);
  await p.waitForFunction(() => window.__world && window.__world.tick > 0, null, { timeout: 15000 }); await wait(p, 700);
  await overlays(p, false);
  return p;
}

/** Resume d'une MapDef lue par le monde (World.setMap). */
const mapStats = (p, which = -1) => p.evaluate((which) => {
  const m = (window.__maps ?? []).at(which); if (!m) return null;
  return { nom: m.name, taille: `${m.width}x${m.height}`, cases: m.cells.length, altitude: (m.elevationCells ?? []).length, surfaces: (m.surfaceCells ?? []).length, decors: m.obstacles.length, territoireJoueur: (m.territory ?? []).filter((c) => c.team === 'player').length, territoireEnnemi: (m.territory ?? []).filter((c) => c.team === 'enemy').length, baliste: m.ballista, unitesScenario: m.playerUnits.length + m.enemyUnits.length };
}, which);

/** Grille et voile de territoire (opacites de render/terrainCells.ts et render/board.ts). */
const overlays = (p, on) => p.evaluate((on) => { window.__scene.traverse((o) => { if (o.isLineSegments && o.material?.opacity === 0.5) o.visible = on; if (o.isMesh && o.material?.opacity === 0.16) o.visible = on; }); }, on);
const gridVisible = (p) => p.evaluate(() => { let v = null; window.__scene.traverse((o) => { if (o.isLineSegments && o.material?.opacity === 0.5) v = o.visible; }); return v; });

/** Camera REELLE du jeu (Renderer.setViewState) : rotation, inclinaison, hauteur de vue (zoom), point vise. */
const view = (p) => p.evaluate(() => window.__R.getViewState());
const setView = (p, s) => p.evaluate((s) => window.__R.setViewState({ ...window.__R.getViewState(), ...s }), s);

async function texturesReady(p) {
  for (let i = 0; i < 60; i++) {
    const ok = await p.evaluate(() => { let ok = true; window.__scene.traverse((o) => { if (o.isMesh && o.material?.map && !(o.material.map.image && o.material.map.image.complete !== false)) ok = false; }); return ok; });
    if (ok) return; await p.waitForTimeout(100);
  }
}

async function shot(p, name) {
  await p.waitForTimeout(700); await texturesReady(p);
  await p.screenshot({ path: OUT + name + '.png' });
  return OUT + name + '.png';
}

/** Retire le focus clavier (KI-24 : Espace reactive le bouton qui a garde le focus). */
const blur = (p) => p.evaluate(() => document.activeElement?.blur?.());

module.exports = { launch, openPage, openSurvival, mapStats, overlays, gridVisible, view, setView, shot, texturesReady, blur, wait, OUT, BASE, J, fs };
