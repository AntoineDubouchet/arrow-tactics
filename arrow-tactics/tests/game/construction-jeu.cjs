// Tests EN JEU de la construction (2026-11-05, G46), run reelle graine 12345 :
//  - Villageois constructeur : Villageois selectionne -> menu Construire actif -> Maison -> chantier -> il marche, construit
//    (geste build), batiment termine ; aucune recolte autonome pendant ; autonomie de retour ~1 s apres ;
//  - Maj + placement repete (Heros) : Maison sans Maj -> sortie du mode ; avec Maj -> reste en placement, 2e Maison payee a
//    nouveau ; ressources insuffisantes -> aucun batiment gratuit, sortie du mode ;
//  - double-clic sur une Maison : les Maisons visibles a l'ecran du meme camp sont inspectees en groupe (anneaux, fiche
//    « Maison ×N »), pas celle hors ecran, pas l'Auberge, pas un batiment ennemi.
// Usage : npm run test:game (ou VITE_BASE=http://localhost:5174/ node tests/game/construction-jeu.cjs)
const L = require('./lib.cjs');
const OUT = L.OUT;
const J = (v) => JSON.stringify(v);
let failures = 0;
const check = (label, ok, extra = '') => { if (!ok) failures++; console.log(`${ok ? 'OK   ' : 'ECHEC'} ${label}${extra ? ' — ' + String(typeof extra === 'string' ? extra : J(extra)).slice(0, 1200) : ''}`); };
(async () => {
  const { browser, ctx } = await L.launch(); const errors = [];
  const p = await L.openSurvival(ctx, '?seed=12345', errors);
  await p.evaluate(async () => {
    window.__hero = () => window.__world.entities.find((e) => e.hero);
    window.__toScreen = (x, z, y) => { const v = new window.THREE.Vector3(x, y ?? window.__S.surfaceY(x, z), z).project(window.__R.camera); return { x: (v.x * 0.5 + 0.5) * innerWidth, y: (-v.y * 0.5 + 0.5) * innerHeight }; };
    window.__flashes = [];
    for (const u of performance.getEntriesByType('resource').map((e) => e.name).filter((n) => n.includes('/src/ui/waveIndicator.ts'))) {
      const W = (await import(u)).WaveIndicator; const fl = W.prototype.flash;
      if (!fl.__patched) { W.prototype.flash = function (m) { window.__flashes.push(m); return fl.call(this, m); }; W.prototype.flash.__patched = true; }
    }
    for (const e of window.__world.entities) if (e.team === 'enemy') e.stats.damage = 0;
    // Villageois du camp tenus inactifs (autonomie G42) ; le test en reactive un.
    const w = window.__world; const vils = w.entities.filter((e) => e.worker && e.alive);
    w.issueCommand({ kind: 'stop', entityIds: vils.map((e) => e.id) });
    for (const e of vils) { e.worker.autoRetryIn = 1e9; e.cargo.wood = e.cargo.stone = e.cargo.minedGold = 0; }
  });
  await p.evaluate(() => window.arrowEconomy.set({ gold: 100, wood: 100, stone: 100 }));
  const setView = (x, z, h = 16) => L.setView(p, { targetX: x, targetZ: z, viewHeight: h, yawDeg: 45, pitchDeg: 55 });
  const stock = () => p.evaluate(() => window.arrowEconomy.stock());
  const base = await p.evaluate(() => { const b = window.__world.entities.find((e) => e.unitId === 'ballista'); return { x: b.x, z: b.z }; });
  const houses = () => p.evaluate(() => window.__world.entities.filter((e) => e.alive && e.unitId === 'house' && e.team === 'player').map((e) => ({ id: e.id, x: e.x, z: e.z, site: !!e.construction })));
  const placeHouse = async (x, z, shift) => {
    const st = await p.evaluate(() => { const b = document.querySelector('.build-menu-button'); const r = b.getBoundingClientRect(); return { disabled: b.disabled, open: b.classList.contains('build-menu-button--open'), over: document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)?.className, builders: window.arrowInspection.builders(), placing: window.arrowInspection.placing(), heroAlive: !!window.__hero()?.alive }; });
    await p.locator('.build-menu-button').click({ timeout: 4000 }).catch(() => { throw new Error('bouton Construire injoignable ' + JSON.stringify(st)); }); await L.wait(p, 200);
    await p.locator('.build-menu-item', { hasText: 'Maison' }).first().click({ timeout: 4000 }); await L.wait(p, 200);
    const s = await p.evaluate(([x, z]) => window.__toScreen(x, z), [x, z]);
    await p.mouse.move(s.x, s.y, { steps: 2 }); await L.wait(p, 120);
    if (shift) await p.keyboard.down('Shift');
    await p.mouse.click(s.x, s.y);
    if (shift) await p.keyboard.up('Shift');
    await L.wait(p, 350);
  };
  // Clic gauche sur le terrain : vide la selection (Echap ouvrirait le menu de pause).
  const clickGround = async (x, z) => { await p.keyboard.press('Escape').catch(() => {}); await L.wait(p, 100); const pause = await p.evaluate(() => !!document.querySelector('.screen-pause.screen-overlay--visible')); if (pause) { await p.keyboard.press('Escape'); await L.wait(p, 200); } const s = await p.evaluate(([x, z]) => window.__toScreen(x, z), [x, z]); await p.mouse.click(s.x, s.y); await L.wait(p, 250); };
  const freeSpots = (cx, cz) => [[0, 0], [2, 0], [-2, 0], [0, 2], [0, -2], [3, 3], [-3, 3], [3, -3], [-3, -3], [4, 0], [-4, 0]].map(([dx, dz]) => [cx + dx, cz + dz]);

  // ---- 1. Villageois constructeur.
  const vil = await p.evaluate(() => { const v = window.__world.entities.find((e) => e.worker && e.alive); return { id: v.id, x: v.x, z: v.z }; });
  await setView(vil.x, vil.z, 12); await L.wait(p, 400);
  const vs = await p.evaluate(([x, z]) => window.__toScreen(x, z, window.__S.surfaceY(x, z) + 0.6), [vil.x, vil.z]);
  await p.mouse.move(vs.x - 40, vs.y - 50); await p.mouse.down(); await p.mouse.move(vs.x + 40, vs.y + 40, { steps: 6 }); await p.mouse.up(); await L.wait(p, 400);
  const menuEnabled = await p.evaluate(() => !document.querySelector('.build-menu-button')?.disabled);
  const h0 = await houses();
  const s0 = await stock();
  // Cour du camp, a 5 cases au sud de la Baliste, puis quelques places voisines.
  let site = null;
  await setView(base.x, base.z + 5, 14); await L.wait(p, 300);
  for (const [x, z] of freeSpots(base.x, base.z + 5)) {
    await placeHouse(x, z, false);
    const after = await houses();
    site = after.find((h) => !h0.some((o) => o.id === h.id)) ?? null;
    if (site) break;
    await p.keyboard.press('Escape'); await L.wait(p, 150);
  }
  const s1 = await stock();
  const order0 = await p.evaluate((id) => { const v = window.__world.getById(id); return { type: v.order.type, target: v.order.targetEntityId ?? null }; }, vil.id);
  check('Villageois selectionne : menu Construire actif, Maison posee (10 bois debites, chantier cree), ordre build donne au Villageois', menuEnabled && !!site && site.site && s1.wood === s0.wood - 10 && s1.gold === s0.gold && order0.type === 'build' && order0.target === site.id, { menuEnabled, site, s0, s1, order0 });
  let seen = { build: 0, harvest: 0, done: false, t: 0 };
  for (let i = 0; i < 80 && !seen.done; i++) {
    await L.wait(p, 250);
    const st = await p.evaluate(([vid, sid]) => { const w = window.__world; const v = w.getById(vid); const s = w.getById(sid); return { working: v.worker.working, order: v.order.type, site: !!s?.construction, hp: s?.hp }; }, [vil.id, site?.id ?? -1]);
    if (st.working === 'build') seen.build++;
    if (st.order === 'harvest') seen.harvest++;
    if (!st.site) seen.done = true;
    seen.t = i * 0.25;
  }
  await p.screenshot({ path: OUT + 'construction-villageois.png' });
  check(`Villageois : marche au chantier, construit (geste build observe ${seen.build} fois), Maison terminee en ~${seen.t} s, aucune recolte autonome pendant`, seen.done && seen.build >= 4 && seen.harvest === 0, seen);
  await p.evaluate((id) => { window.__world.getById(id).worker.autoRetryIn = 0; }, vil.id);
  await L.wait(p, 1800);
  const after = await p.evaluate((id) => { const v = window.__world.getById(id); return { order: v.order.type, auto: v.worker.autoNodeId }; }, vil.id);
  check('chantier fini : le Villageois redevient autonome ~1 s apres (ordre de recolte choisi seul)', after.order === 'harvest' && after.auto !== null, after);

  // ---- 2. Maj + placement repete (Heros selectionne par Espace : plus de Heros implicite depuis G47).
  await setView(base.x, base.z - 3, 14); await L.wait(p, 300); await clickGround(base.x, base.z - 3);
  await p.evaluate(() => { const w = window.__world; const h = window.__hero(); h.x = h.prevX = w.entities.find((e) => e.unitId === 'ballista').x; h.z = h.prevZ = w.entities.find((e) => e.unitId === 'ballista').z + 8; w.issueCommand({ kind: 'stop', entityIds: [h.id] }); });
  await L.blur(p); await p.keyboard.press('Space'); await L.wait(p, 200);
  await p.evaluate(() => window.arrowEconomy.set({ gold: 100, wood: 35, stone: 100 }));
  await setView(base.x + 6, base.z + 6, 14); await L.wait(p, 300);
  const hA = await houses();
  let first = null; let spotIndex = -1;
  const spots = freeSpots(base.x + 6, base.z + 6);
  for (let i = 0; i < spots.length && !first; i++) {
    await placeHouse(spots[i][0], spots[i][1], false);
    const hb = await houses(); first = hb.find((h) => !hA.some((o) => o.id === h.id)) ?? null; spotIndex = i;
    if (!first) { await p.keyboard.press('Escape'); await L.wait(p, 150); }
  }
  const placingAfterPlain = await p.evaluate(() => window.arrowInspection.placing());
  check('Maison posee sans Maj : sortie du mode de pose', !!first && placingAfterPlain === null, { first, placingAfterPlain });
  // Avec Maj : reste en mode Maison ; seconde pose (Maj) payee a nouveau ; 35 - 10 (sans Maj) - 10 - 10 = 5 bois -> quatrieme refusee, sortie propre.
  let second = null, third = null, placingAfterShift = null, placingAfterSecond = null;
  const sBefore = await stock();
  for (let i = spotIndex + 1; i < spots.length && !second; i++) {
    await placeHouse(spots[i][0], spots[i][1], true);
    placingAfterShift = await p.evaluate(() => window.arrowInspection.placing());
    const hb = await houses(); second = hb.find((h) => !hA.some((o) => o.id === h.id) && h.id !== first.id) ?? null;
    if (!second) { await p.keyboard.press('Escape'); await L.wait(p, 150); continue; }
    // Toujours en mode : clic (Maj) direct sur une autre place, sans repasser par le menu.
    for (let j = i + 1; j < spots.length && !third; j++) {
      const s = await p.evaluate(([x, z]) => window.__toScreen(x, z), spots[j]);
      await p.mouse.move(s.x, s.y, { steps: 2 }); await L.wait(p, 120);
      await p.keyboard.down('Shift'); await p.mouse.click(s.x, s.y); await p.keyboard.up('Shift'); await L.wait(p, 350);
      const hc = await houses(); third = hc.find((h) => !hA.some((o) => o.id === h.id) && h.id !== first.id && h.id !== second.id) ?? null;
    }
    placingAfterSecond = await p.evaluate(() => window.arrowInspection.placing());
  }
  const sAfter = await stock();
  const flashes = await p.evaluate(() => window.__flashes.filter((m) => /insuffisantes/.test(m)));
  check('Maj + clic : Maison posee ET mode de pose conserve (meme batiment) ; seconde Maison posee par un clic Maj direct, cout debite a nouveau (25 -> 15 -> 5 bois) ; 5 bois < 10 : sortie : sortie du mode avec message « Ressources insuffisantes », aucun batiment gratuit',
    !!second && placingAfterShift === 'house' && !!third && sAfter.wood === sBefore.wood - 20 && placingAfterSecond === null && flashes.length >= 1, { second, third, placingAfterShift, placingAfterSecond, sBefore, sAfter, flashes });

  // ---- 3. Double-clic sur une Maison : les Maisons visibles a l'ecran (meme camp), pas celle hors ecran, pas l'Auberge.
  await clickGround(base.x, base.z - 3);
  const all = await houses();
  // Camera serree sur la Maison la plus au sud-est (les nouvelles) : les Maisons de depart (nord-ouest) sortent de l'ecran.
  const far = all.reduce((a, b) => (a.x + a.z > b.x + b.z ? a : b));
  await setView(far.x, far.z, 9); await L.wait(p, 400);
  const onScreen = await p.evaluate(() => { const ins = (x, z) => { const s = window.__toScreen(x, z); return s.x > 0 && s.x < innerWidth && s.y > 0 && s.y < innerHeight; }; return window.__world.entities.filter((e) => e.alive && e.isBuilding && e.team === 'player').map((e) => ({ id: e.id, unitId: e.unitId, visible: ins(e.x, e.z) })); });
  const visibleHouses = onScreen.filter((b) => b.unitId === 'house' && b.visible).map((b) => b.id);
  const hiddenHouses = onScreen.filter((b) => b.unitId === 'house' && !b.visible).map((b) => b.id);
  const fs = await p.evaluate(([x, z]) => window.__toScreen(x, z, window.__S.surfaceY(x, z) + 0.8), [far.x, far.z]);
  await p.mouse.click(fs.x, fs.y); await L.wait(p, 120); await p.mouse.click(fs.x, fs.y); await L.wait(p, 400);
  const group = await p.evaluate(() => ({ primary: window.arrowInspection.primary(), group: window.arrowInspection.group(), title: document.querySelector('.entity-info:not([hidden]) .entity-info-title, .entity-info:not([hidden]) h2, .entity-info:not([hidden])')?.textContent ?? '' }));
  await p.screenshot({ path: OUT + 'construction-double-clic.png' });
  check(`double-clic sur une Maison : groupe = les ${visibleHouses.length} Maisons visibles a l ecran, Maison principale = celle cliquee, ${hiddenHouses.length} hors ecran exclue(s), Auberge exclue ; fiche « Maison ×N »`,
    visibleHouses.length >= 2 && group.primary === far.id && J([...group.group].sort()) === J([...visibleHouses].sort()) && !hiddenHouses.some((id) => group.group.includes(id)) && new RegExp(`×${visibleHouses.length}`).test(group.title), { visibleHouses, hiddenHouses, group: { primary: group.primary, group: group.group, title: group.title.slice(0, 80) } });
  // Clic simple sur le terrain : groupe vide.
  await setView(base.x, base.z - 3, 14); await L.wait(p, 300); await clickGround(base.x, base.z - 3);
  const cleared = await p.evaluate(() => window.arrowInspection.group().length);
  check('clic sur le terrain : groupe vide', cleared === 0, cleared);

  if (errors.length) { failures++; console.log('ERREURS', errors.join(' / ').slice(0, 1500)); }
  console.log(failures ? failures + ' ECHEC(S)' : 'tout OK');
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
