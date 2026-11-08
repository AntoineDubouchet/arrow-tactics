// Test EN JEU du noyau de depart (2026-11-06, G50), run reelle graine 12345 : base complete en image, Hotel de ville (selection, fiche,
// reparation, ni production ni technologie), population 2 / 15, Maison +5, raccourcis A Z E R (bouton, placement, champ texte, unite 4),
// fiche du Heros (portrait et nom), six Villageois sur un arbre a 3 emplacements au clic droit (redirection, A*), puis le vrai surplus et son message.
// Usage : npm run test:game (ou VITE_BASE=http://localhost:5174/ node tests/game/noyau-jeu.cjs)
const L = require('./lib.cjs');
const OUT = L.OUT;
const J = (v) => JSON.stringify(v);
let failures = 0;
const check = (label, ok, extra = '') => { if (!ok) failures++; console.log(`${ok ? 'OK   ' : 'ECHEC'} ${label}${extra !== '' ? ' — ' + String(typeof extra === 'string' ? extra : J(extra)).slice(0, 1000) : ''}`); };
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
    window.__stand = (await import(urls.find((n) => n.includes('/src/sim/harvestStands.ts')))).harvestReservationOf;
    window.__buildings = (await import(urls.find((n) => n.includes('/src/data/buildings.ts')))).BUILDINGS;
    const w = window.__world;
    for (const e of w.entities) if (e.team === 'enemy') e.stats.damage = 0;
    for (const e of w.entities) if (e.worker) { e.worker.autoRetryIn = 1e9; e.order = { type: 'guard' }; }
    window.arrowEconomy.set({ gold: 500, wood: 500, stone: 500 });
  });
  const setView = (x, z, h = 16) => L.setView(p, { targetX: x, targetZ: z, viewHeight: h, yawDeg: 45, pitchDeg: 55 });
  const screen = (x, z, y) => p.evaluate(([x, z, y]) => window.__toScreen(x, z, y), [x, z, y]);
  const panel = () => p.evaluate(() => { const r = document.querySelector('.entity-info'); if (!r || r.style.display === 'none') return null; return { kind: [...r.classList].find((c) => c.startsWith('entity-info--')), title: r.querySelector('.entity-info-title')?.textContent ?? null, img: !!r.querySelector('.entity-info-portrait img'), hp: !!r.querySelector('.entity-info-hp'), rows: r.querySelectorAll('.entity-info-row').length, actions: [...r.querySelectorAll('.entity-info-action')].map((b) => [b.dataset.action, b.textContent, b.disabled]) }; });
  const byId = (unitId) => p.evaluate((id) => window.__world.entities.filter((e) => e.alive && e.unitId === id).map((e) => ({ id: e.id, x: e.x, z: e.z })), unitId);
  const clickEntity = async (x, z, y = 0.4) => { const s = await screen(x, z, y); await p.mouse.click(s.x, s.y); await L.wait(p, 250); };
  const queueLen = (id) => p.evaluate((id) => window.__world.getById(id).productionOrders.length, id);
  const clearSelection = async () => { await L.blur(p); await p.keyboard.press('Escape'); await L.wait(p, 120); await p.keyboard.press('Escape'); await L.wait(p, 120); const pm = p.locator('.pause-menu, .screen-overlay--visible'); if (await pm.count()) await p.keyboard.press('Escape'); await L.wait(p, 120); };

  // ==== 1. Base complete.
  const summary = await p.evaluate(() => { const w = window.__world; const of = (id) => w.entities.filter((e) => e.alive && e.team === 'player' && e.unitId === id).map((e) => [+e.x.toFixed(2), +e.z.toFixed(2)]); return { hall: of('townhall'), ballista: of('ballista'), tavern: of('tavern'), houses: of('house'), hud: document.querySelector('.economy-hud, .economy-line')?.textContent ?? '', pop: document.body.textContent.match(/\d+\s*\/\s*\d+/g)?.slice(0, 6) }; });
  const d = (q) => Math.hypot(q[0] - summary.hall[0][0], q[1] - summary.hall[0][1]);
  check('Hotel de ville au centre, Auberge, 2 Maisons et Baliste a moins de 8 cases', summary.hall.length === 1 && summary.tavern.length === 1 && summary.houses.length === 2 && summary.ballista.length === 1 && [...summary.tavern, ...summary.houses, ...summary.ballista].every((q) => d(q) < 8), summary);
  const ctr = summary.hall[0];
  await setView(ctr[0], ctr[1], 44); await L.wait(p, 600);
  await p.screenshot({ path: OUT + 'noyau-base-complete.png' });
  await setView(ctr[0], ctr[1], 18); await L.wait(p, 600);
  await p.screenshot({ path: OUT + 'noyau-coeur.png' });
  const gates = await p.evaluate(() => window.__world.entities.filter((e) => e.alive && e.wall?.door).map((e) => [e.wall.door.open, +e.x.toFixed(1), +e.z.toFixed(1)]));
  check('4 portes presentes, posees fermees (mode automatique, 2026-11-08)', gates.length === 4 && gates.every((g) => g[0] === false), gates);
  const popText = await p.evaluate(() => [...document.querySelectorAll('*')].filter((n) => n.children.length === 0 && /^\D*\d+\s*\/\s*\d+\D*$/.test(n.textContent ?? '')).map((n) => n.textContent).slice(0, 6));
  check('HUD : population 2 / 15', popText.some((t) => /2\s*\/\s*15/.test(t)), popText);

  // ==== 2. Hotel de ville.
  await clickEntity(ctr[0], ctr[1], 0.5);
  const hallPanel = await panel();
  // 2026-11-08 (G53) : l'Hotel de ville produit le Villageois ([A], ralliement) ; toujours ni technologie ni amelioration.
  check('clic sur l Hotel de ville : sa fiche, « [A] Villageois » et Ralliement, sans technologie ni amelioration', hallPanel?.title === 'Hôtel de ville' && hallPanel.kind === 'entity-info--building' && hallPanel.actions.some(([a, l]) => a === 'produceUnit' && /^\[A\] Villageois/.test(l)) && hallPanel.actions.some(([a]) => a === 'setRally') && hallPanel.actions.every(([a]) => a !== 'research' && a !== 'upgradeBuilding'), hallPanel);
  await p.evaluate(() => { const h = window.__world.entities.find((e) => e.unitId === 'townhall'); h.hp = h.stats.maxHp * 0.5; }); await L.wait(p, 300);
  const hallDamaged = await panel();
  const repair = hallDamaged?.actions.find(([a]) => a === 'repairBuilding');
  check('Hotel de ville endommage : action Reparer, payante', repair && !repair[2] && /\d/.test(repair[1]), hallDamaged?.actions);
  await p.locator('.entity-info-action[data-action="repairBuilding"]').click(); await L.wait(p, 300);
  const repairOrder = await p.evaluate(() => { const h = window.__hero(); return [h.order.type, h.order.targetEntityId === window.__world.entities.find((e) => e.unitId === 'townhall').id]; });
  check('Reparer : le Heros y va', repairOrder[0] === 'repair' && repairOrder[1], repairOrder);
  for (let i = 0; i < 80; i++) { const hp = await p.evaluate(() => { const h = window.__world.entities.find((e) => e.unitId === 'townhall'); return h.hp / h.stats.maxHp; }); if (hp > 0.999) break; await L.wait(p, 500); }
  const hallHp = await p.evaluate(() => { const h = window.__world.entities.find((e) => e.unitId === 'townhall'); return h.hp / h.stats.maxHp; });
  check('reparation terminee, Heros arrive en contournant le noyau', hallHp > 0.999 && (await p.evaluate(() => window.__nav(window.__hero()).stuckCount)) === 0, hallHp);
  await clearSelection();

  // ==== 3. Raccourcis.
  const tavern = (await byId('townhall'))[0]; // Hotel de ville : producteur du Villageois depuis le 2026-11-08 (l'Auberge ne produit plus)
  await setView(tavern.x, tavern.z, 16); await L.wait(p, 300);
  await clickEntity(tavern.x, tavern.z, 0.8);
  const tp = await panel();
  const produceBtn = tp?.actions.find(([a]) => a === 'produceUnit');
  check('Hotel de ville : bouton « [A] Villageois »', tp?.title?.startsWith('Hôtel de ville') && /^\[A\] Villageois/.test(produceBtn?.[1] ?? ''), tp?.actions);
  const beforeGold = await p.evaluate(() => window.arrowEconomy.stock().gold);
  await L.blur(p); await p.keyboard.press('a'); await L.wait(p, 200);
  const afterGold = await p.evaluate(() => window.arrowEconomy.stock().gold);
  check('touche A : un Villageois en file, paye comme au bouton', (await queueLen(tavern.id)) === 1 && afterGold === beforeGold - 5, { q: await queueLen(tavern.id), beforeGold, afterGold });
  const zoomBefore = await p.evaluate(() => window.__R.camera.top ?? window.__R.camera.position.y);
  await p.keyboard.press('a'); await L.wait(p, 150);
  const zoomAfter = await p.evaluate(() => window.__R.camera.top ?? window.__R.camera.position.y);
  check('producteur selectionne : A produit, ne zoome plus', (await queueLen(tavern.id)) === 2 && zoomBefore === zoomAfter, { q: await queueLen(tavern.id), zoomBefore, zoomAfter });
  // Champ texte focalise : aucune production.
  await p.evaluate(() => { const i = document.createElement('input'); i.id = '__field'; i.style.position = 'fixed'; i.style.top = '0'; document.body.appendChild(i); i.focus(); });
  const q0 = await queueLen(tavern.id);
  await p.keyboard.press('a'); await L.wait(p, 150);
  check('champ texte focalise : aucune production', (await queueLen(tavern.id)) === q0, await p.evaluate(() => document.getElementById('__field').value));
  await p.evaluate(() => document.getElementById('__field').remove()); await L.blur(p);
  // Touche Z sur l'Auberge : pas de deuxieme unite, rien.
  const q1 = await queueLen(tavern.id);
  await p.keyboard.press('z'); await L.wait(p, 120);
  check('Z sur un producteur d une seule unite : rien', (await queueLen(tavern.id)) === q1);
  // Hors producteur selectionne : zoom historique.
  await clearSelection();
  const zb = await p.evaluate(() => window.__R.camera.top ?? window.__R.camera.position.y);
  await L.blur(p); await p.keyboard.press('a'); await L.wait(p, 150);
  const za = await p.evaluate(() => window.__R.camera.top ?? window.__R.camera.position.y);
  check('sans producteur selectionne : A garde son zoom', zb !== za, { zb, za });
  // Quatre unites sur l'Hotel de ville (injection de test : aucun producteur n'en a quatre aujourd'hui).
  const R = await p.evaluate(() => { const u = window.__buildings.townhall.recruitmentUnlock; window.__oldUnits = u.unitIds; u.unitIds = ['villageois', 'piquier', 'archer', 'fantassin']; return u.unitIds; });
  await clickEntity(tavern.x, tavern.z, 0.8);
  const fourPanel = await panel();
  const labels = (fourPanel?.actions ?? []).filter(([a]) => a === 'produceUnit').map(([, l]) => l.split(' ')[0]);
  check('producteur a 4 unites : [A] [Z] [E] [R], dans l ordre', labels.join() === '[A],[Z],[E],[R]', fourPanel?.actions);
  const q2 = await queueLen(tavern.id);
  await L.blur(p); await p.keyboard.press('z'); await L.wait(p, 120);
  const zOrder = await p.evaluate((id) => window.__world.getById(id).productionOrders.at(-1).unitId, tavern.id);
  check('Z : l unite 2', (await queueLen(tavern.id)) === q2 + 1 && zOrder === R[1], zOrder);
  await p.keyboard.press('r'); await L.wait(p, 120);
  const rOrder = await p.evaluate((id) => window.__world.getById(id).productionOrders.at(-1).unitId, tavern.id);
  check('R hors placement, producteur a 4 unites : l unite 4', rOrder === R[3], rOrder);
  // R en mode placement (Construire demande le Heros ou un Villageois) : rotation, jamais production.
  const q3 = await queueLen(tavern.id);
  await clearSelection(); await L.blur(p); await p.keyboard.press('Space'); await L.wait(p, 250);
  await setView(tavern.x + 3, tavern.z + 2, 16); await L.wait(p, 300);
  await p.locator('.build-menu-button').click({ timeout: 4000 }); await L.wait(p, 200);
  await p.locator('.build-menu-item', { hasText: 'Maison' }).first().click({ timeout: 4000 }); await L.wait(p, 200);
  const rotBefore = await p.evaluate(() => window.__R.scene.getObjectByName('building-placement-ghost')?.rotation.y ?? null);
  const ghost = await screen(tavern.x + 6, tavern.z + 3); await p.mouse.move(ghost.x, ghost.y, { steps: 2 }); await L.wait(p, 150);
  const rotBefore2 = await p.evaluate(() => { const o = window.__R.scene.getObjectByName('building-placement'); return o ? o.children.map((c) => c.rotation.y) : null; });
  await p.keyboard.press('r'); await L.wait(p, 200);
  const rotAfter = await p.evaluate(() => { const o = window.__R.scene.getObjectByName('building-placement'); return o ? o.children.map((c) => c.rotation.y) : null; });
  check('R en placement : rotation, aucune production', (await queueLen(tavern.id)) === q3 && J(rotBefore2) !== J(rotAfter), { q3, rotBefore, rotBefore2, rotAfter });
  await p.keyboard.press('Escape'); await L.wait(p, 200);
  await p.evaluate(() => { window.__buildings.townhall.recruitmentUnlock.unitIds = window.__oldUnits; });
  await clearSelection();
  await p.waitForTimeout(100);

  // Vrai batiment a deux unites (Eglise) : Z produit la seconde.
  await clearSelection(); await L.blur(p); await p.keyboard.press('Space'); await L.wait(p, 250);
  // Place libre a cote de l'Auberge reelle (le producteur teste plus haut est l'Hotel de ville, au centre du camp).
  const realTavern = (await byId('tavern'))[0];
  const cSpot = { x: realTavern.x + 5, z: realTavern.z + 4 };
  await setView(cSpot.x, cSpot.z, 16); await L.wait(p, 300);
  await p.locator('.build-menu-button').click({ timeout: 4000 }); await L.wait(p, 200);
  await p.locator('.build-menu-item', { hasText: 'Église' }).first().click({ timeout: 4000 }); await L.wait(p, 200);
  const cScr = await screen(cSpot.x, cSpot.z); await p.mouse.move(cScr.x, cScr.y, { steps: 2 }); await L.wait(p, 150);
  await p.mouse.click(cScr.x, cScr.y); await L.wait(p, 350);
  const church = await p.evaluate(() => { const c = window.__world.entities.find((e) => e.alive && e.unitId === 'church'); if (!c) return null; c.construction.progress = 0.995; const h = window.__hero(); h.x = h.prevX = c.x + c.stats.radius + 1.5; h.z = h.prevZ = c.z; window.__world.issueCommand({ kind: 'build', entityIds: [h.id], targetEntityId: c.id }); return { id: c.id, x: c.x, z: c.z }; });
  for (let i = 0; i < 30 && church; i++) { await L.wait(p, 250); if (await p.evaluate((id) => !window.__world.getById(id).construction, church.id)) break; }
  await clearSelection();
  await clickEntity(church.x, church.z, 0.8);
  const churchPanel = await panel();
  const churchLabels = (churchPanel?.actions ?? []).filter(([a]) => a === 'produceUnit').map(([, l]) => l.split(' ')[0]);
  const qc = await queueLen(church.id);
  await L.blur(p); await p.keyboard.press('z'); await L.wait(p, 200);
  const zChurch = await p.evaluate((id) => window.__world.getById(id).productionOrders.at(-1)?.unitId, church.id);
  const churchUnits = await p.evaluate(() => window.__buildings.church.recruitmentUnlock.unitIds);
  check('batiment a deux unites (Eglise) : [A] et [Z], Z produit la seconde', churchLabels.join() === '[A],[Z]' && (await queueLen(church.id)) === qc + 1 && zChurch === churchUnits[1], { churchLabels, zChurch, churchUnits, churchPanel: churchPanel?.title });
  await clearSelection();

  // ==== 4. Maison : +5 au HUD, a la pose ; destruction -5.
  await p.evaluate(() => { for (const e of window.__world.entities) if (e.productionOrders?.length) e.productionOrders.length = 0; });
  const popMax = () => p.evaluate(() => { const w = window.__world; let max = 5; for (const e of w.entities) if (e.alive && e.team === 'player' && e.isBuilding && !e.construction && e.unitId === 'house') max += 5; return max; });
  const hudPop = () => p.evaluate(() => [...document.querySelectorAll('*')].filter((n) => n.children.length === 0 && /^\D*\d+\s*\/\s*\d+\D*$/.test(n.textContent ?? '')).map((n) => n.textContent));
  const house = (await byId('house'))[0];
  await p.evaluate((id) => { const h = window.__world.getById(id); h.hp = 0; }, house.id); await L.wait(p, 500);
  const afterDestroy = await hudPop();
  check('Maison detruite : le HUD perd 5 places', afterDestroy.some((t) => /\/\s*10/.test(t)), { afterDestroy, attendu: await popMax() });

  // ==== 5. Fiche du Heros.
  await clearSelection();
  const heroPos = await p.evaluate(() => { const h = window.__hero(); return { x: h.x, z: h.z }; });
  await setView(heroPos.x, heroPos.z, 12); await L.wait(p, 300);
  await clickEntity(heroPos.x, heroPos.z, 0.8);
  await L.wait(p, 400);
  const hc = await panel();
  check('Heros seul selectionne : portrait et nom seulement, ni PV ni statistiques', hc?.kind === 'entity-info--hero' && hc.img && !hc.hp && hc.rows === 0 && hc.actions.length === 0 && hc.title === (await p.evaluate(() => window.__R ? document.querySelector('.entity-info-title').textContent : '')), hc);
  const hud = await p.evaluate(() => ({ panel: getComputedStyle(document.querySelector('.hero-panel')).display !== 'none', slots: document.querySelectorAll('.hero-action-slot').length, build: !!document.querySelector('.build-menu-button') }));
  check('HUD RPG et bouton Construire inchanges', hud.panel && hud.slots > 0 && hud.build, hud);
  await p.screenshot({ path: OUT + 'noyau-fiche-heros.png' });
  await clearSelection();

  // ==== 6. Scenario : plusieurs Villageois autour d'un arbre, au clic droit.
  const treeSpot = await p.evaluate(() => { const w = window.__world; const c = w.entities.find((e) => e.unitId === 'townhall'); const nodes = [...w.resourceNodes.values()].filter((n) => n.resource === 'wood' && Math.hypot(n.x - c.x, n.z - c.z) < 14); return nodes.map((n) => ({ id: n.id, x: n.x, z: n.z })); });
  await p.evaluate(() => {
    const w = window.__world; const c = w.entities.find((e) => e.unitId === 'townhall');
    window.__six = [];
    for (let i = 0; i < 6; i++) { const u = w.spawn('villageois', 'player', c.x - 2.5 + i, c.z + 7); u.order = { type: 'guard' }; u.worker.autoRetryIn = 1e9; window.__six.push(u); }
  });
  await L.wait(p, 200);
  // Arbre le plus accessible du bosquet : celui qui a le plus d'emplacements utilisables.
  const target = treeSpot.find((n) => n.x === Math.max(...treeSpot.map((q) => q.x))) ?? treeSpot[0];
  await setView(target.x, target.z, 18); await L.wait(p, 400);
  // Selection des six au cadre (mode reel, coordonnees ecran).
  const box = await p.evaluate(() => { const ss = window.__six.map((u) => window.__toScreen(u.x, u.z, 0.4)); return ss; });
  await setView(box.length ? (await p.evaluate(() => window.__six[0].x)) + 2.5 : target.x, await p.evaluate(() => window.__six[0].z), 16); await L.wait(p, 300);
  const pts = await p.evaluate(() => window.__six.map((u) => window.__toScreen(u.x, u.z, 0.4)));
  const minX = Math.min(...pts.map((q) => q.x)) - 28; const maxX = Math.max(...pts.map((q) => q.x)) + 28; const minY = Math.min(...pts.map((q) => q.y)) - 34; const maxY = Math.max(...pts.map((q) => q.y)) + 20;
  await p.mouse.move(minX, minY); await p.mouse.down(); await p.mouse.move(maxX, maxY, { steps: 6 }); await p.mouse.up(); await L.wait(p, 250);
  const selected = await p.evaluate(() => window.arrowInspection?.group?.() ?? null);
  await setView(target.x, target.z, 18); await L.wait(p, 400);
  const stats0 = await p.evaluate(() => window.__stats.searches);
  const ts = await screen(target.x, target.z, 0.6);
  await p.mouse.click(ts.x, ts.y, { button: 'right' }); await L.wait(p, 300);
  const ordered = await p.evaluate(() => window.__six.filter((u) => u.order.type === 'harvest').length);
  check('six Villageois selectionnes, clic droit sur un arbre : tous recoivent l ordre', ordered === 6, { ordered, selected });
  await p.evaluate(() => { window.__flashes.length = 0; window.__track = { overlap: 0, jitter: 0, stuck: 0, prev: new Map() }; const tick = () => { const t = window.__track; const workers = window.__six.filter((u) => u.alive && u.worker.working === 'chop'); for (let i = 0; i < workers.length; i++) for (let j = i + 1; j < workers.length; j++) if (Math.hypot(workers[i].x - workers[j].x, workers[i].z - workers[j].z) < 0.79) t.overlap++; for (const u of workers) { const q = t.prev.get(u.id); const s = window.__stand(u); if (q && s && Math.hypot(s.x - q.x, s.z - q.z) < 1e-3) t.jitter += Math.hypot(u.x - q.x, u.z - q.z); t.prev.set(u.id, { x: u.x, z: u.z }); } t.stuck = Math.max(t.stuck, ...window.__six.map((u) => window.__nav(u).stuckCount)); requestAnimationFrame(tick); }; tick(); });
  const readFarm = () => p.evaluate(() => ({ work: window.__six.filter((u) => u.worker.working === 'chop').length, stands: window.__six.map((u) => { const s = window.__stand(u); return s ? [s.resourceNodeId, s.slot] : null; }), guard: window.__six.filter((u) => u.order.type === 'guard').length, flashes: window.__flashes.slice(), track: { overlap: window.__track.overlap, jitter: window.__track.jitter, stuck: window.__track.stuck } }));
  let farm = await readFarm();
  for (let i = 0; i < 80 && farm.work < 6; i++) { await L.wait(p, 250); farm = await readFarm(); }
  await p.screenshot({ path: OUT + 'noyau-villageois-arbre.png' });
  const onTarget = farm.stands.filter((s) => s && s[0] === target.id).length;
  const otherTrees = new Set(farm.stands.filter((s) => s && s[0] !== target.id).map((s) => s[0]));
  const standKeys = farm.stands.filter(Boolean).map((s) => s.join());
  check('six Villageois sur un arbre a 3 emplacements : 3 sur lui, 3 sur des arbres voisins, emplacements distincts, tous au travail, sans attente ni message', onTarget === 3 && otherTrees.size >= 1 && new Set(standKeys).size === 6 && farm.work === 6 && farm.guard === 0 && !farm.flashes.some((m) => /Aucun emplacement/.test(m)), { onTarget, otherTrees: otherTrees.size, farm });
  check('aucun chevauchement, aucune alternance, aucun blocage', farm.track.overlap === 0 && farm.track.jitter < 0.01 && farm.track.stuck === 0, farm.track);
  const usedA = (await p.evaluate(() => window.__stats.searches)) - stats0;
  check('A* bornes sur tout le scenario (au plus 6 par Villageois, 150 par seconde pour un seul avant G49)', usedA <= 36, usedA);
  console.log('VIDEO scenario arbre :', J({ surCible: onTarget, autresArbres: otherTrees.size, travail: farm.work, astar: usedA, track: farm.track }));
  // Le vrai surplus : plus de Villageois que le bosquet n'a de place.
  await p.evaluate((id) => {
    const w = window.__world; const c = w.entities.find((e) => e.unitId === 'townhall');
    window.__flashes.length = 0;
    window.__more = [];
    for (let i = 0; i < 10; i++) { const u = w.spawn('villageois', 'player', c.x - 1 + (i % 5) * 1.3, c.z - 6 - Math.floor(i / 5) * 1.3); u.order = { type: 'guard' }; u.worker.autoRetryIn = 1e9; window.__more.push(u); }
    w.issueCommand({ kind: 'harvest', entityIds: window.__more.map((u) => u.id), nodeId: id });
  }, target.id);
  let moreStopped = 0;
  for (let i = 0; i < 60; i++) { await L.wait(p, 250); const s = await p.evaluate(() => ({ go: window.__more.filter((u) => u.order.type === 'harvest' && !window.__stand(u)).length, stop: window.__more.filter((u) => u.order.type === 'guard').length })); moreStopped = s.stop; if (s.go === 0) break; }
  const moreFlashes = await p.evaluate(() => window.__flashes.filter((m) => /Aucun emplacement de travail disponible/.test(m)).length);
  check('vrai surplus du bosquet : s arrete, sans boucle, message « Aucun emplacement de travail disponible » une seule fois', moreStopped > 0 && moreFlashes === 1, { moreStopped, moreFlashes });

  check('aucune erreur de page', errors.length === 0, errors.slice(0, 3));
  console.log(failures ? failures + ' ECHEC(S)' : 'tout OK');
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
