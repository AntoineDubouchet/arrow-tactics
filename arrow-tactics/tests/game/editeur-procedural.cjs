// Tests de l'EDITEUR (2026-11-03) : generation procedurale (vrai generateur de la Survie, meme graine = meme carte,
// graine differente = autre carte), panneau d'informations, vue globale (toute la carte, deux tailles d'ecran),
// edition (camp supprime + annuler, gisement d'or supprime, tas ajoute), sauvegarde (etat concret, metadonnees),
// rechargement, « Tester le scénario », generations successives sans residus, historique remis a zero, carte vierge.
// Usage : npm run test:game (ou VITE_BASE=http://localhost:5174/ node tests/game/editeur-procedural.cjs)
const { chromium } = require('playwright');
const fs = require('fs');
const { OUT, BASE } = require('./lib.cjs');
const J = (v) => JSON.stringify(v);
let failures = 0;
const check = (label, ok, extra = '') => { if (!ok) failures++; console.log(`${ok ? 'OK   ' : 'ECHEC'} ${label}${extra ? ' — ' + String(typeof extra === 'string' ? extra : J(extra)).slice(0, 1000) : ''}`); };
(async () => {
  const browser = await chromium.launch({ channel: 'msedge' });
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 }, acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('dialog', (d) => d.accept());
  const wait = (ms) => page.waitForTimeout(ms);
  const ev = (fn, a) => page.evaluate(fn, a);
  await page.goto(BASE);
  await page.getByRole('button', { name: 'Mode survie', exact: true }).waitFor({ timeout: 120000 });
  await ev(async () => {
    const urls = performance.getEntriesByType('resource').map((e) => e.name);
    const mod = (p) => import(urls.find((n) => n.includes(p)));
    const THREE = await import(urls.find((n) => /\/deps\/three\.js/.test(n)));
    window.THREE = THREE;
    const ob = THREE.Object3D.prototype.onBeforeRender;
    THREE.Object3D.prototype.onBeforeRender = function (r, sc, c, ...rest) { if (this.isScene && c) { window.__cam = c; window.__scene = sc; } return ob.call(this, r, sc, c, ...rest); };
    for (const u of urls.filter((n) => n.includes('/src/sim/world.ts'))) { const W = (await import(u)).World; const os = W.prototype.step; if (!os.__p) { W.prototype.step = function (dt) { window.__world = this; return os.call(this, dt); }; W.prototype.step.__p = true; } }
    for (const u of urls.filter((n) => n.includes('/src/editor/editorState.ts'))) {
      const ES = (await import(u)).EditorState;
      for (const m of ['hasCellAt', 'objectsSnapshot', 'canPlaceBuildingAt', 'isWaterCell', 'heightField']) { const o = ES.prototype[m]; if (!o.__p) { ES.prototype[m] = function (...a) { window.__ed = this; return o.apply(this, a); }; ES.prototype[m].__p = true; } }
    }
    window.__gen = await mod('/src/config/maps/proceduralSurvival.ts');
    window.__toScreen = (x, z, y = 0) => { const v = new THREE.Vector3(x, y, z).project(window.__cam); return { x: (v.x * 0.5 + 0.5) * innerWidth, y: (-v.y * 0.5 + 0.5) * innerHeight }; };
  });
  const save = async (name) => { const [d] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Enregistrer' }).click()]); const f = OUT + name; await d.saveAs(f); return JSON.parse(fs.readFileSync(f, 'utf8')); };
  const generate = async (seed) => { await page.locator('.editor-seed-input').fill(String(seed)); await page.getByRole('button', { name: 'Générer', exact: true }).click(); await wait(2500); await ev(() => window.__ed?.hasCellAt(0, 0)); };
  const info = () => ev(() => { const el = document.querySelector('.editor-generation-info'); return el && !el.hidden ? el.innerText : null; });
  const state = () => ev(() => { const e = window.__ed; return { cells: e.cells.length, obstacles: e.obstacles.length, features: e.features.length, camps: e.features.filter((f) => f.kind === 'camp').length, piles: e.features.filter((f) => f.kind === 'pile').length, barrels: e.features.filter((f) => f.kind === 'destructible').length, markers: window.__scene.getObjectByName('editor-features')?.children.filter((c) => c.userData.featureId !== undefined).length ?? -1 }; });
  // Contenu concret d'une MapDef (comparaison de cartes).
  // Normalisee : ordre des cases de relief / sol, flottants a 1e-9 (le reste tel quel).
  const byCell = (a) => [...(a ?? [])].sort((p, q) => p.x - q.x || p.z - q.z);
  const concrete = (m) => JSON.stringify({ cells: byCell(m.cells), obstacles: m.obstacles, elevationCells: byCell(m.elevationCells), surfaceCells: byCell(m.surfaceCells), resourcePiles: m.resourcePiles, camps: m.camps, destructibles: m.destructibles, territory: byCell(m.territory), ballista: m.ballista }, (k, v) => (typeof v === 'number' && !Number.isInteger(v) ? Math.round(v * 1e9) / 1e9 : v));

  await page.getByRole('button', { name: 'Éditeur de maps' }).click(); await wait(2500);
  await page.getByRole('button', { name: 'Nouvelle carte' }).click(); await wait(900);
  const blank = { ...(await state()), info: await info() };

  // 1. Generation : vrai generateur, meme graine = meme carte, graine differente = autre carte.
  await generate(12345);
  const s1 = await state();
  const info1 = await info();
  const m1 = await save('gen-12345-a.json');
  const ref = await ev(() => window.__gen.generateSurvivalMap(12345));
  await generate(12345);
  const m1b = await save('gen-12345-b.json');
  await generate(777);
  const m2 = await save('gen-777.json');
  check('generer graine 12345 : carte = vrai generateur de la Survie (cases, decors, relief, sols, tas, camps, barils, territoire, Baliste) ; regeneree : identique ; graine 777 : differente',
    concrete(m1) === concrete(ref) && concrete(m1b) === concrete(m1) && concrete(m2) !== concrete(m1) && m1.generator?.seed === 12345 && m1.survivalRules === 'hero-rts' && s1.camps === ref.camps.length && s1.piles === ref.resourcePiles.length && s1.barrels === (ref.destructibles ?? []).length,
    { s1, ref: { obstacles: ref.obstacles.length, camps: ref.camps.length, piles: ref.resourcePiles.length, barrels: (ref.destructibles ?? []).length } });
  check('panneau d informations : graine, arbres, gisements pierre / or, tas, camps, relief', /Graine 12345/.test(info1 ?? '') && /Arbres \d+ · gisements : pierre 26, or 6/.test(info1 ?? '') && /Camps \d+ \(petits \d+, grands \d+\)/.test(info1 ?? '') && /Relief/.test(info1 ?? ''), info1);
  check('aucun etat de partie dans la carte (ni Heros, ni unites, ni vague, ni minuteur) : seulement le monde ; la Baliste n y est qu une position', m1.playerUnits.length === 0 && m1.enemyUnits.length === 0 && !('hero' in m1) && !('waves' in m1) && !('timers' in m1) && m1.ballista?.x === 0.5, Object.keys(m1));

  // 2. Generations successives : rien de la carte precedente ; historique remis a zero.
  await generate(12345);
  const sA = await state();
  await generate(777);
  const sB = await state();
  await page.keyboard.press('Control+z'); await wait(400);
  const sB2 = await state();
  check('generations successives : marqueurs = elements de la nouvelle carte (aucun residu) ; Ctrl+Z apres generation : rien (point de depart)', sB.markers === sB.features && sA.markers === sA.features && sB.obstacles === m2.obstacles.length && J(sB2) === J(sB), { sA, sB, sB2 });

  // 3. Vue globale : toute la carte dans l'ecran, a 1600 x 900 puis 1280 x 720 ; le zoom reste possible.
  await generate(12345);
  const fits = [];
  for (const [w, h] of [[1600, 900], [1280, 720]]) {
    await page.setViewportSize({ width: w, height: h }); await wait(500);
    await page.getByRole('button', { name: 'Vue globale' }).click(); await wait(600);
    const r = await ev(() => { const c = window.__ed.cells; let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity; for (const k of c) { minX = Math.min(minX, k.x); maxX = Math.max(maxX, k.x + 1); minZ = Math.min(minZ, k.z); maxZ = Math.max(maxZ, k.z + 1); } const pts = [[minX, minZ], [maxX, minZ], [minX, maxZ], [maxX, maxZ], [(minX + maxX) / 2, minZ], [(minX + maxX) / 2, maxZ], [minX, (minZ + maxZ) / 2], [maxX, (minZ + maxZ) / 2]].map(([x, z]) => window.__toScreen(x, z)); return { inside: pts.every((p) => p.x >= 0 && p.x <= innerWidth && p.y >= 0 && p.y <= innerHeight), pts: pts.map((p) => [Math.round(p.x), Math.round(p.y)]) }; });
    fits.push({ w, h, ...r });
    if (w === 1600) await page.screenshot({ path: OUT + 'editeur-vue-globale.png' });
  }
  await page.setViewportSize({ width: 1600, height: 900 }); await wait(400);
  const zoom0 = await ev(() => window.__cam.zoom ?? 0);
  await page.mouse.move(800, 450); for (let i = 0; i < 6; i++) { await page.mouse.wheel(0, -400); await wait(80); } await wait(400);
  const zoomed = await ev(() => { const a = window.__toScreen(0, 0), b = window.__toScreen(10, 0); return Math.hypot(b.x - a.x, b.y - a.y); });
  await page.getByRole('button', { name: 'Vue globale' }).click(); await wait(500);
  const global = await ev(() => { const a = window.__toScreen(0, 0), b = window.__toScreen(10, 0); return Math.hypot(b.x - a.x, b.y - a.y); });
  check('vue globale : le disque entier tient dans l ecran (1600 x 900 et 1280 x 720) ; la molette rezoome ensuite', fits.every((f) => f.inside) && zoomed > global * 1.05, { fits: fits.map((f) => ({ w: f.w, inside: f.inside })), zoomed, global, zoom0 });

  // 4. Edition : camp supprime (clic sur son marqueur, Suppr) puis annule, supprime ; gisement d'or supprime ; tas ajoute.
  await generate(12345);
  const camp = await ev(() => { const f = window.__ed.features.find((f) => f.kind === 'camp'); return { id: f.id, x: f.camp.x, z: f.camp.z }; });
  await ev((c) => window.__ed.select(null), camp);
  // Camera rapprochee sur le camp (vue globale trop lointaine pour viser le mat).
  const before = await state();
  const mast = await ev((c) => window.__toScreen(c.x, c.z, 2.0), camp);
  await page.mouse.click(mast.x, mast.y); await wait(300);
  const picked = await ev(() => window.__ed.selection);
  await page.keyboard.press('Delete'); await wait(300);
  const afterDel = await state();
  await page.keyboard.press('Control+z'); await wait(300);
  const afterUndo = await state();
  await ev((c) => window.__ed.select({ kind: 'feature', id: c.id }), camp);
  await page.keyboard.press('Delete'); await wait(300);
  const gold = await ev(() => window.__ed.obstacles.find((o) => o.kind === 'rock' && o.ore === 'gold').id);
  await ev((id) => window.__ed.select({ kind: 'obstacle', id }), gold);
  await page.keyboard.press('Delete'); await wait(300);
  await page.locator('.editor-asset-card', { hasText: /^Tas de bois \(5\)$/ }).first().click(); await wait(200);
  const spot = await ev(() => { const e = window.__ed; for (let r = 3; r < 9; r++) for (let x = -r; x <= r; x++) { const z = r; if (e.hasCellAt(x, z) && !e.isWaterCell(x, z) && !e.features.some((f) => Math.floor((f.pile ?? f.destructible ?? f.camp).x) === x && Math.floor((f.pile ?? f.destructible ?? f.camp).z) === z)) return { x: x + 0.5, z: z + 0.5 }; } return null; });
  await page.getByRole('button', { name: 'Vue globale' }).click(); await wait(400);
  const ps = await ev((s) => window.__toScreen(s.x, s.z), spot);
  await page.mouse.click(ps.x, ps.y); await wait(300);
  await page.keyboard.press('Escape'); await wait(200);
  const edited = await state();
  check('edition : clic sur le marqueur d un camp -> selection, Suppr -> camp retire, Ctrl+Z -> revenu ; gisement d or supprime ; tas de bois pose (outil « Survie »)',
    picked?.kind === 'feature' && afterDel.camps === before.camps - 1 && afterUndo.camps === before.camps && edited.camps === before.camps - 1 && edited.obstacles === before.obstacles - 1 && edited.piles === before.piles + 1, { picked, before, afterDel, afterUndo, edited });

  // 5. Sauvegarde, rechargement.
  const sv = await save('gen-12345-edite.json');
  const goldLeft = sv.obstacles.filter((o) => o.kind === 'rock' && o.ore === 'gold').length;
  check('sauvegarde : MapDef ordinaire avec l etat concret (camps -1, or -1, tas +1), graine en metadonnee, regles Hero RTS', sv.camps.length === ref.camps.length - 1 && goldLeft === 5 && sv.resourcePiles.length === ref.resourcePiles.length + 1 && sv.generator?.seed === 12345 && sv.survivalRules === 'hero-rts' && (sv.destructibles ?? []).length === (ref.destructibles ?? []).length, { camps: sv.camps.length, goldLeft, piles: sv.resourcePiles.length });
  await page.getByRole('button', { name: 'Nouvelle carte' }).click(); await wait(800);
  const blank2 = { ...(await state()), info: await info() };
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Charger une carte' }).click()]);
  await chooser.setFiles(OUT + 'gen-12345-edite.json'); await wait(2000);
  const reloaded = await state();
  const reSaved = await save('gen-12345-recharge.json');
  check('carte vierge toujours disponible (aucun element, aucun panneau) ; rechargement : memes elements, meme carte reenregistree', blank2.features === 0 && /Départ Survie absent/.test(blank2.info ?? '') && blank.features === 0 && reloaded.camps === sv.camps.length && reloaded.piles === sv.resourcePiles.length && concrete(reSaved) === concrete(sv), { blank2, reloaded });

  // 6. Tester le scenario : meme pipeline (camps, tas, barils en jeu).
  fs.writeFileSync(OUT + 'gen-12345-test.json', JSON.stringify({ ...sv, playerUnits: [{ unitId: 'fantassin', x: 2.5, z: 2.5 }], enemyUnits: [{ unitId: 'maraudeur', x: 30.5, z: 30.5 }] }));
  const [c2] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Charger une carte' }).click()]);
  await c2.setFiles(OUT + 'gen-12345-test.json'); await wait(2000);
  await page.getByRole('button', { name: 'Tester le scénario' }).click(); await wait(400);
  await ev(() => { for (const e of window.__world.entities) if (!e.isBuilding) { e.stats.maxHp = 1e6; e.hp = 1e6; e.stats.moveSpeed = 0; e.stats.damage = 0; } }); await wait(1500);
  const inTest = await ev(() => { const w = window.__world; return { camps: w.camps.length, piles: w.resourcePiles.length, barrels: w.entities.filter((e) => e.destructible).length, gold: [...w.resourceNodes.values()].filter((n) => n.resource === 'gold').length, ticks: w.tick }; });
  await page.screenshot({ path: OUT + 'editeur-test-scenario.png' });
  check('« Tester le scénario » sur la carte generee puis modifiee : camps, tas, barils et gisements (5 d or) en jeu', inTest.camps === sv.camps.length && inTest.piles === sv.resourcePiles.length && inTest.barrels === sv.camps.reduce((n, c) => n + (c.kind === 'raiders_large' ? 3 : 2), 0) + (sv.destructibles ?? []).length && inTest.gold === 5 && inTest.ticks > 0, inTest);

  if (errors.length) { failures++; console.log('ERREURS', errors.join(' / ').slice(0, 1500)); }
  console.log(failures ? failures + ' ECHEC(S)' : 'tout OK');
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
