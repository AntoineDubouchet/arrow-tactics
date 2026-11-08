// Tests EN JEU de l'ergonomie G47 (2026-11-05), run reelle graine 12345 :
//  - selection : Heros selectionne au lancement ; clic gauche terrain = aucune selection, HUD conserve ; clic droit sans
//    selection : Heros immobile ; clic sur le Heros, Espace : selection revient ; Echap vide, puis ouvre la pause ;
//    Villageois ou batiment selectionne : Heros hors selection, pas de resélection apres un ordre ;
//  - ralliement : producteur + clic droit terrain = point modifie, sans ordre parasite ; Maison : rien ; clic droit sur l'UI :
//    rien ; unite selectionnee : ordre, ralliement intact ; deux Auberges (double-clic) : meme point pour les deux ;
//  - barres : file de deux Villageois, tete entre 0 et 100 %, deuxieme en attente, suivante repartant a 0, annulation ;
//  - inventaire au clic droit : equiper, retirer, echange dans la case liberee, non portable refuse, plein refuse, menu
//    du navigateur neutralise, aucune commande au monde derriere la fenetre ; icones de tous les emplacements (capture).
// Usage : npm run test:game (ou VITE_BASE=http://localhost:5174/ node tests/game/ergonomie-jeu.cjs)
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
    const urls = performance.getEntriesByType('resource').map((e) => e.name);
    for (const u of urls.filter((n) => n.includes('/src/ui/waveIndicator.ts'))) {
      const W = (await import(u)).WaveIndicator; const fl = W.prototype.flash;
      if (!fl.__patched) { W.prototype.flash = function (m) { window.__flashes.push(m); return fl.call(this, m); }; W.prototype.flash.__patched = true; }
    }
    for (const u of urls.filter((n) => n.includes('/src/data/equipment.ts'))) {
      const E = (await import(u)).EQUIPMENT; window.__E = E;
      E.test_robe = { ...E.plate_cuirass, id: 'test_robe', name: 'Robe de test', allowedHeroes: ['mage_futur'] };
    }
    const w = window.__world;
    for (const e of w.entities) if (e.team === 'enemy') e.stats.damage = 0;
    // Villageois du camp tenus inactifs (autonomie G42) : aucun ordre ne doit venir d'eux.
    const vils = w.entities.filter((e) => e.worker && e.alive);
    w.issueCommand({ kind: 'stop', entityIds: vils.map((e) => e.id) });
    for (const e of vils) { e.worker.autoRetryIn = 1e9; e.cargo.wood = e.cargo.stone = e.cargo.minedGold = 0; }
    window.arrowEconomy.set({ gold: 500, wood: 500, stone: 500 });
    // Case de terrain libre dans la vue : loin des entites, sources, decors et de l'interface.
    window.__free = (cx, cz, avoid = []) => {
      const obstacles = (window.__maps ?? []).at(-1)?.obstacles ?? [];
      for (let r = 2; r < 16; r += 1) for (let a = 0; a < 16; a++) {
        const x = Math.floor(cx + r * Math.cos((a * Math.PI) / 8)) + 0.5; const z = Math.floor(cz + r * Math.sin((a * Math.PI) / 8)) + 0.5;
        const s = window.__toScreen(x, z);
        if (s.x < 420 || s.x > 1100 || s.y < 170 || s.y > 650) continue;
        const far = (o, d) => !(Math.hypot(o.x - x, o.z - z) < d);
        if (window.__world.entities.some((e) => e.alive && !far(e, e.isBuilding ? 4.5 : 2))) continue;
        if ([...window.__world.resourceNodes.values()].some((n) => !far(n, 3))) continue;
        if (window.__world.resourcePiles.some((n) => !far(n, 2)) || window.__world.chests.some((n) => !far(n, 2)) || obstacles.some((n) => !far(n, 2.5)) || avoid.some((n) => !far(n, 2))) continue;
        return { x, z };
      }
      return null;
    };
  });
  const base = await p.evaluate(() => { const b = window.__world.entities.find((e) => e.unitId === 'ballista'); return { x: b.x, z: b.z }; });
  const setView = (x, z, h = 16) => L.setView(p, { targetX: x, targetZ: z, viewHeight: h, yawDeg: 45, pitchDeg: 55 });
  const st = () => p.evaluate(() => {
    const h = window.__hero();
    const vis = (sel) => { const el = document.querySelector(sel); return !!el && !el.hidden && getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().width > 0; };
    return { heroId: h.id, builders: window.arrowInspection.builders(), primary: window.arrowInspection.primary(), group: window.arrowInspection.group(), order: h.order.type, x: +h.x.toFixed(3), z: +h.z.toFixed(3), hud: vis('.hero-panel-portrait') && vis('.hud-inventory-button') && vis('.hero-action-slot'), fiche: vis('.entity-info') };
  });
  const groundAt = (g) => p.evaluate(([x, z]) => window.__toScreen(x, z), [g.x, g.z]);
  const leftGround = async (g) => { const s = await groundAt(g); await p.mouse.click(s.x, s.y); await L.wait(p, 300); };
  const rightGround = async (g) => { const s = await groundAt(g); await p.mouse.click(s.x, s.y, { button: 'right' }); await L.wait(p, 300); };
  const free = (avoid = []) => p.evaluate(([b, avoid]) => window.__free(b.x, b.z, avoid), [base, avoid]);
  const clickEntity = async (id, h = 12) => {
    const e = await p.evaluate((id) => { const e = window.__world.getById(id); return { x: e.x, z: e.z, b: e.isBuilding }; }, id);
    await setView(e.x, e.z, h); await L.wait(p, 350);
    const s = await p.evaluate((e) => window.__toScreen(e.x, e.z, window.__S.surfaceY(e.x, e.z) + (e.b ? 1 : 0.6)), e);
    await p.mouse.click(s.x, s.y); await L.wait(p, 350);
  };
  const clickHero = async () => { const h = await p.evaluate(() => window.__hero().id); await clickEntity(h); };
  const pausePanel = () => p.evaluate(() => !!document.querySelector('.screen-pause.screen-overlay--visible'));
  const flashes = () => p.evaluate(() => window.__flashes.slice());
  const inv = () => p.evaluate(() => window.arrowItems.list().inventory);

  // ==== 1. SELECTION DU HEROS.
  await setView(base.x, base.z, 16); await L.wait(p, 400);
  const s0 = await st();
  check('lancement : Heros selectionne (provisoire), HUD present', s0.builders.includes(s0.heroId) && s0.hud, s0);
  const g = await free();
  check('une case de terrain libre existe dans la vue', !!g, g);
  await leftGround(g);
  const s1 = await st();
  check('Heros selectionne, clic gauche sur terrain vide : aucune selection ; HUD (portrait, sorts, inventaire) conserve', s1.builders.length === 0 && s1.primary === null && s1.group.length === 0 && s1.hud && !s1.fiche, s1);
  await p.screenshot({ path: OUT + 'selection-aucune.png' });
  await rightGround(g); await L.wait(p, 600);
  const s2 = await st();
  check('aucune selection, clic droit sur le terrain : Heros immobile, ordre inchange, selection toujours vide', s2.x === s1.x && s2.z === s1.z && s2.order === s1.order && s2.builders.length === 0, { s1, s2 });
  await p.keyboard.press('i'); await L.wait(p, 300);
  const invSansSel = await p.evaluate(() => !document.querySelector('.hero-inventory').hidden);
  await p.keyboard.press('i'); await L.wait(p, 200);
  check('aucune selection : l inventaire s ouvre quand meme (Heros existant, pas selectionne)', invSansSel);
  await clickHero();
  const s3 = await st();
  check('clic sur le Heros : selection revient', s3.builders.includes(s3.heroId), s3);
  await setView(base.x, base.z, 16); await L.wait(p, 300);
  const g2 = await free();
  await rightGround(g2);
  let moved = null;
  for (let i = 0; i < 20 && !moved; i++) { await L.wait(p, 100); const s = await st(); if (s.x !== s3.x || s.z !== s3.z) moved = s; }
  check('Heros selectionne, clic droit : il se deplace et reste selectionne', !!moved && moved.builders.includes(moved.heroId), { moved });
  await p.evaluate(() => { const h = window.__hero(); window.__world.issueCommand({ kind: 'stop', entityIds: [h.id] }); }); await L.wait(p, 200);
  await p.keyboard.press('Escape'); await L.wait(p, 250);
  const s4 = await st(); const pause4 = await pausePanel();
  check('Echap avec une selection : la selection se vide, la pause ne s ouvre pas', s4.builders.length === 0 && s4.primary === null && !pause4, { s4, pause4 });
  await p.keyboard.press('Escape'); await L.wait(p, 250);
  const pause5 = await pausePanel();
  if (pause5) { await p.keyboard.press('Escape'); await L.wait(p, 250); }
  check('Echap sans selection : la pause s ouvre (comportement historique)', pause5);
  await L.blur(p); await p.keyboard.press('Space'); await L.wait(p, 300);
  const s5 = await st();
  check('Espace : Heros selectionne de nouveau', s5.builders.includes(s5.heroId), s5);
  await p.evaluate(() => { const h = window.__hero(); window.__world.issueCommand({ kind: 'stop', entityIds: [h.id] }); }); await L.wait(p, 200);
  // Villageois selectionne : Heros hors selection, l'ordre ne le resélectionne pas, il ne bouge pas.
  const vil = await p.evaluate(() => { const w = window.__world; const h = window.__hero(); const v = w.entities.filter((e) => e.worker && e.alive).sort((a, b) => Math.hypot(a.x - h.x, a.z - h.z) - Math.hypot(b.x - h.x, b.z - h.z))[0]; return { id: v.id, x: v.x, z: v.z }; });
  await clickEntity(vil.id);
  const s6 = await st();
  check('clic sur un Villageois : lui seul selectionne, Heros hors selection', J(s6.builders) === J([vil.id]) && s6.primary === null, s6);
  await setView(vil.x, vil.z, 16); await L.wait(p, 300);
  const g3 = await p.evaluate((v) => window.__free(v.x, v.z), vil);
  const vilPos = () => p.evaluate((id) => { const v = window.__world.getById(id); return { x: v.x, z: v.z, order: v.order.type }; }, vil.id);
  const v0 = await vilPos();
  await rightGround(g3); await L.wait(p, 500);
  const s7 = await st();
  const v1 = await vilPos();
  check('Villageois selectionne, clic droit : il part vers le point ; Heros immobile, pas resélectionne', Math.hypot(v1.x - v0.x, v1.z - v0.z) > 0.5 && s7.x === s6.x && s7.z === s6.z && J(s7.builders) === J([vil.id]), { v0, v1, s6, s7 });
  await p.evaluate((id) => window.__world.issueCommand({ kind: 'stop', entityIds: [id] }), vil.id); await L.wait(p, 150);
  // 2026-11-08 (G53) : l'Auberge ne produit plus (le Villageois sort de l'Hotel de ville). Ce test porte sur
  // l'ergonomie (ralliement, double-clic, barres de file) d'un producteur que l'on peut batir en double : il
  // rend a l'Auberge une production de Villageois PAR INJECTION DE TEST, retiree a la fin de la section 3.
  await p.evaluate(async () => {
    const urls = performance.getEntriesByType('resource').map((e) => e.name);
    window.__buildings = window.__buildings ?? (await import(urls.find((n) => n.includes('/src/data/buildings.ts')))).BUILDINGS;
    window.__oldTavernUnlock = window.__buildings.tavern.recruitmentUnlock;
    window.__buildings.tavern.recruitmentUnlock = { unitIds: ['villageois'] };
  });
  // Batiment selectionne : Heros hors selection.
  const taverns = () => p.evaluate(() => window.__world.entities.filter((e) => e.alive && e.team === 'player' && e.unitId === 'tavern' && !e.construction).map((e) => ({ id: e.id, x: e.x, z: e.z, rally: e.rally })));
  const tav0 = (await taverns())[0];
  await clickHero();
  const s8 = await st();
  await clickEntity(tav0.id);
  const s9 = await st();
  check('clic sur une Auberge : Heros hors selection, Auberge inspectee (fiche)', s8.builders.includes(s8.heroId) && s9.builders.length === 0 && s9.primary === tav0.id && s9.fiche, { s8, s9 });

  // ==== 2. RALLIEMENT AU CLIC DROIT.
  const rallyOf = (id) => p.evaluate((id) => window.__world.getById(id).rally, id);
  await p.evaluate(() => { window.__flashes.length = 0; });
  await setView(tav0.x, tav0.z, 18); await L.wait(p, 300);
  const before = await st();
  const rp = await p.evaluate((t) => window.__free(t.x, t.z), tav0);
  await rightGround(rp); await L.wait(p, 400);
  const r1 = await rallyOf(tav0.id);
  const s10 = await st();
  const fl1 = await flashes();
  await p.screenshot({ path: OUT + 'ralliement-clic-droit.png' });
  check('producteur selectionne, clic droit terrain : ralliement au point vise, message ; Heros sans ordre, immobile ; Auberge toujours inspectee', !!r1 && Math.hypot(r1.x - rp.x, r1.z - rp.z) < 1 && fl1.includes('Point de ralliement placé') && s10.x === before.x && s10.z === before.z && s10.order === before.order && s10.primary === tav0.id, { r1, rp, fl1, before, s10 });
  // Clic droit sur la fiche : l'interface seulement, ralliement intact.
  const box = await p.locator('.entity-info').boundingBox();
  await p.mouse.click(box.x + box.width / 2, box.y + 12, { button: 'right' }); await L.wait(p, 300);
  const r2 = await rallyOf(tav0.id);
  const panelOver = await p.evaluate(([x, y]) => !!document.elementFromPoint(x, y)?.closest('.entity-info'), [box.x + box.width / 2, box.y + 12]);
  check('clic droit sur la fiche (UI) : ralliement intact ; la fiche prend le clic', panelOver && J(r2) === J(r1), { panelOver, r1, r2 });
  // Unite selectionnee : ordre, ralliement intact.
  await clickEntity(vil.id);
  await setView(vil.x, vil.z, 16); await L.wait(p, 300);
  const g4 = await p.evaluate(() => { const v = window.__world.entities.find((e) => e.worker && e.alive); return window.__free(v.x, v.z); });
  const v2 = await vilPos();
  await rightGround(g4); await L.wait(p, 300);
  const r3 = await rallyOf(tav0.id);
  const v3 = await vilPos();
  check('unite selectionnee, clic droit : ordre d unite, ralliement du batiment intact', J(r3) === J(r1) && Math.hypot(v3.x - v2.x, v3.z - v2.z) > 0.2, { r3, v2, v3 });
  await p.evaluate((id) => window.__world.issueCommand({ kind: 'stop', entityIds: [id] }), vil.id);
  // Maison : ni ralliement, ni ordre au Heros.
  const house = await p.evaluate(() => { const b = window.__world.entities.find((e) => e.alive && e.team === 'player' && e.unitId === 'house' && !e.construction); return { id: b.id, x: b.x, z: b.z }; });
  await clickEntity(house.id);
  const s11 = await st();
  await setView(house.x, house.z, 18); await L.wait(p, 300);
  const gH = await p.evaluate((h) => window.__free(h.x, h.z), house);
  await rightGround(gH); await L.wait(p, 400);
  const s12 = await st();
  const rH = await rallyOf(house.id);
  check('batiment non producteur (Maison), clic droit terrain : aucun ralliement, Heros immobile', s11.primary === house.id && rH === null && s12.x === s11.x && s12.z === s11.z && s12.order === s11.order, { s11, s12, rH });
  // Deuxieme Auberge batie par le Heros, puis double-clic : meme point pour les deux.
  await L.blur(p); await p.keyboard.press('Escape'); await L.wait(p, 150);
  if (await pausePanel()) { await p.keyboard.press('Escape'); await L.wait(p, 200); }
  await L.blur(p); await p.keyboard.press('Space'); await L.wait(p, 300);
  await setView(tav0.x, tav0.z, 18); await L.wait(p, 300);
  let tav1 = null;
  await p.click('.build-menu-button'); await L.wait(p, 300);
  await p.click('.build-menu-item:has-text("Auberge")'); await L.wait(p, 250);
  for (const [dx, dz] of [[5, 0], [-5, 0], [0, 5], [0, -5], [5, 5], [-5, 5], [5, -5], [-5, -5], [7, 0], [-7, 0], [0, 7], [0, -7]]) {
    const s = await p.evaluate(([x, z]) => window.__toScreen(x, z), [tav0.x + dx, tav0.z + dz]);
    await p.mouse.move(s.x, s.y, { steps: 2 }); await L.wait(p, 120);
    await p.mouse.click(s.x, s.y); await L.wait(p, 250);
    tav1 = await p.evaluate((id) => { const f = window.__world.entities.find((e) => e.alive && e.team === 'player' && e.unitId === 'tavern' && e.id !== id); return f ? { id: f.id, x: f.x, z: f.z } : null; }, tav0.id);
    if (tav1) break;
  }
  check('deuxieme Auberge posee par le menu', !!tav1, tav1);
  if (tav1) {
    let built = false;
    for (let i = 0; i < 120 && !built; i++) { await L.wait(p, 250); built = await p.evaluate((id) => window.__world.getById(id)?.construction === null, tav1.id); }
    await p.evaluate(() => { const h = window.__hero(); window.__world.issueCommand({ kind: 'stop', entityIds: [h.id] }); }); await L.wait(p, 200);
    const mx = (tav0.x + tav1.x) / 2; const mz = (tav0.z + tav1.z) / 2;
    await setView(mx, mz, 20); await L.wait(p, 400);
    const tS = await p.evaluate((t) => window.__toScreen(t.x, t.z, window.__S.surfaceY(t.x, t.z) + 1), tav1);
    await p.mouse.click(tS.x, tS.y); await L.wait(p, 120); await p.mouse.click(tS.x, tS.y); await L.wait(p, 400);
    const s13 = await st();
    const gp = await p.evaluate(([x, z, a, b]) => window.__free(x, z, [a, b]), [mx, mz, { x: tav0.x, z: tav0.z }, { x: tav1.x, z: tav1.z }]);
    await p.evaluate(() => { window.__flashes.length = 0; });
    await rightGround(gp); await L.wait(p, 400);
    const ra = await rallyOf(tav0.id); const rb = await rallyOf(tav1.id);
    const s14 = await st(); const fl2 = await flashes();
    check('deux Auberges (double-clic), clic droit terrain : meme point pour les deux, message groupe ; Heros sans ordre', built && s13.group.length === 2 && s13.builders.length === 0 && !!ra && !!rb && J(ra) === J(rb) && Math.hypot(ra.x - gp.x, ra.z - gp.z) < 1 && fl2.includes('Point de ralliement placé (2 bâtiments)') && s14.x === s13.x && s14.z === s13.z && s14.order === s13.order, { built, s13, ra, rb, gp, fl2, s14 });
    await p.screenshot({ path: OUT + 'ralliement-groupe.png' });
  }

  // ==== 3. BARRES DE PRODUCTION (Auberge : deux Villageois).
  const bars = () => p.evaluate(() => [...document.querySelectorAll('.entity-info .entity-info-action[data-action="cancelProduction"]')].map((b) => { const t = b.querySelector('.entity-info-progress'); const f = t?.querySelector('.hero-progress-fill'); return { label: b.childNodes[0].textContent, bar: !!t, track: t?.classList.contains('progress-track') ?? false, width: f ? parseFloat(f.style.width) : null, text: t?.querySelector('.hero-progress-text')?.textContent ?? null }; }));
  const orders = (id) => p.evaluate((id) => window.__world.getById(id).productionOrders.map((o) => ({ id: o.id, remaining: +o.remaining.toFixed(2), total: o.total })), id);
  await clickEntity(tav0.id);
  await p.locator('.entity-info-action[data-action="produceUnit"]').first().click(); await L.wait(p, 150);
  await p.locator('.entity-info-action[data-action="produceUnit"]').first().click(); await L.wait(p, 900);
  const q1 = await bars(); const o1 = await orders(tav0.id);
  await p.screenshot({ path: OUT + 'barre-production.png' });
  check('file de deux Villageois : seule la premiere a une barre, entre 0 et 100 %, durée restante ; la deuxieme « en attente », sans barre', q1.length === 2 && q1[0].bar && q1[0].track && q1[0].width > 0 && q1[0].width < 100 && /^\d+,\d s$/.test(q1[0].text) && !q1[1].bar && /en attente/.test(q1[1].label) && o1[1].remaining === o1[1].total, { q1, o1 });
  const sharedBar = await p.evaluate(() => { const hero = document.querySelector('.hero-progress'); const prod = document.querySelector('.entity-info-progress'); const cls = (el) => el ? { root: el.className, tag: el.tagName, children: [...el.children].map((c) => c.className).filter((c) => c !== 'hud-handle') } : null; return { hero: cls(hero), prod: cls(prod) }; });
  check('meme composant que la barre d action du Heros (memes classes, meme contenu)', !!sharedBar.hero && !!sharedBar.prod && sharedBar.hero.root.includes('progress-track') && sharedBar.prod.root.includes('progress-track') && sharedBar.hero.tag === sharedBar.prod.tag && J(sharedBar.hero.children) === J(sharedBar.prod.children), sharedBar);
  // La barre avance, puis la premiere se termine : la suivante repart de 0.
  await L.wait(p, 800);
  const q2 = await bars();
  let q3 = null;
  for (let i = 0; i < 120 && !q3; i++) { await L.wait(p, 100); const o = await orders(tav0.id); if (o.length === 1) { await L.wait(p, 150); q3 = await bars(); } }
  check('la barre avance ; premiere terminee : le suivant devient « 1. », sa barre repart de 0', q2[0].width > q1[0].width && !!q3 && q3.length === 1 && q3[0].bar && /^1\. /.test(q3[0].label) && q3[0].width < 25, { q1w: q1[0].width, q2w: q2[0].width, q3 });
  await L.wait(p, 700);
  const q4 = await bars();
  // Annulation : disparition propre.
  await p.locator('.entity-info-action[data-action="cancelProduction"]').first().click(); await L.wait(p, 300);
  const q5 = await bars();
  const noBar = await p.evaluate(() => document.querySelector('.entity-info-progress') === null);
  check('annulation : la barre disparait, plus aucune commande', q4[0].width > q3[0].width && q5.length === 0 && noBar, { q4, q5, noBar });

  // Fin de l'injection de test : l'Auberge redevient sans production (G53).
  await p.evaluate(() => { window.__buildings.tavern.recruitmentUnlock = window.__oldTavernUnlock; });

  // ==== 4. INVENTAIRE AU CLIC DROIT.
  await L.blur(p); await p.keyboard.press('Escape'); await L.wait(p, 150);
  if (await pausePanel()) { await p.keyboard.press('Escape'); await L.wait(p, 200); }
  await L.blur(p); await p.keyboard.press('Space'); await L.wait(p, 300);
  await p.evaluate(() => {
    document.addEventListener('contextmenu', (e) => { window.__ctx = e; }, true);
    window.arrowItems.give('swift_leggings');
    window.__flashes.length = 0;
  });
  await L.wait(p, 200);
  await p.keyboard.press('i'); await L.wait(p, 300);
  const heroPos = async () => { const s = await st(); return { x: s.x, z: s.z, order: s.order }; };
  const bag = (i) => p.locator(`.inventory-grid .inventory-cell[data-index="${i}"]`);
  const body = (s) => p.locator(`.inventory-cell--body[data-body="${s}"]`);
  const hp0 = await heroPos();
  await bag(0).click({ button: 'right' }); await L.wait(p, 350);
  const i1 = await inv();
  const ctx1 = await p.evaluate(() => window.__ctx?.defaultPrevented ?? null);
  check('clic droit sur un equipement du sac : equipe, sac vide ; menu du navigateur neutralise', i1.equipped.legs === 'swift_leggings' && i1.items.length === 0 && ctx1 === true, { equipped: i1.equipped, items: i1.items, ctx1 });
  await body('legs').click({ button: 'right' }); await L.wait(p, 350);
  const i2 = await inv();
  check('clic droit sur une piece portee : retiree vers une case libre', !i2.equipped.legs && i2.slots[0]?.itemId === 'swift_leggings', { equipped: i2.equipped, s0: i2.slots[0] });
  await bag(0).click({ button: 'right' }); await L.wait(p, 300);
  await p.evaluate(() => window.arrowItems.give('march_greaves')); await L.wait(p, 300);
  await bag(0).click({ button: 'right' }); await L.wait(p, 350);
  const i3 = await inv();
  check('emplacement occupe, clic droit : echange ; l ancienne piece revient dans la case liberee, rien de perdu', i3.equipped.legs === 'march_greaves' && i3.slots[0]?.itemId === 'swift_leggings' && i3.items.length === 1, { equipped: i3.equipped, s0: i3.slots[0], items: i3.items });
  await p.evaluate(() => window.arrowItems.give('test_robe')); await L.wait(p, 300);
  await bag(1).click({ button: 'right' }); await L.wait(p, 350);
  const i4 = await inv(); const fl3 = await flashes();
  check('piece non portable, clic droit : refus avec message, elle reste au sac', !i4.equipped.chest && i4.slots[1]?.itemId === 'test_robe' && fl3.includes('Ce Héros ne peut pas porter cet objet'), { equipped: i4.equipped, s1: i4.slots[1], fl3 });
  const hp1 = await heroPos();
  check('tous ces clics droits : aucune commande au monde derriere la fenetre (Heros selectionne, immobile, meme ordre)', J(hp0) === J(hp1), { hp0, hp1 });
  // Fond de la fenetre, case vide, emplacement vide : rien non plus.
  const winBox = await p.locator('.hero-inventory').boundingBox();
  await p.mouse.click(winBox.x + 30, winBox.y + 10, { button: 'right' }); await L.wait(p, 250);
  await body('cape').click({ button: 'right' }); await L.wait(p, 250);
  await bag(10).click({ button: 'right' }); await L.wait(p, 350);
  const hp2 = await heroPos(); const i5 = await inv();
  check('clic droit sur le fond de la fenetre, un emplacement vide, une case vide : rien, Heros immobile', J(hp2) === J(hp0) && J(i5.equipped) === J(i4.equipped) && J(i5.slots) === J(i4.slots), { hp2, hp0 });
  // Plein : la piece reste portee.
  await p.evaluate(() => { for (let i = 0; i < 25; i++) window.arrowItems.give('starter_sword'); window.__flashes.length = 0; }); await L.wait(p, 400);
  await body('legs').click({ button: 'right' }); await L.wait(p, 350);
  const i6 = await inv(); const fl4 = await flashes();
  check('sac plein, clic droit sur une piece portee : elle reste portee, message « Inventaire plein », rien de perdu', i6.equipped.legs === 'march_greaves' && i6.slots.every((s) => s !== null) && fl4.includes('Inventaire plein'), { equipped: i6.equipped, fl4 });

  // ==== 5. ICONES : tous les emplacements remplis, capture a inspecter.
  await p.evaluate(() => {
    const h = window.__hero(); const inv = h.hero.inventory; const E = window.__E;
    const equipped = {}; const equippedLevels = {}; const seen = new Set();
    for (const d of Object.values(E)) if (d.id !== 'test_robe' && d.slot !== 'offHand' && !seen.has(d.slot)) { seen.add(d.slot); equipped[d.slot] = d.id; equippedLevels[d.slot] = 1; }
    const inBag = [...new Set(Object.values(E).filter((d) => d.id !== 'test_robe').map((d) => d.slot))].map((slot) => Object.values(E).filter((d) => d.slot === slot && d.id !== 'test_robe').at(-1).id);
    h.hero.inventory = { ...inv, equipped, equippedLevels, slots: inv.slots.map((s, i) => (i < inBag.length ? { kind: 'item', itemId: inBag[i], level: 1 } : null)) };
  });
  await L.wait(p, 500);
  const icons = await p.evaluate(() => {
    const body = [...document.querySelectorAll('.inventory-cell--body')].map((c) => { const i = c.querySelector('.inventory-icon'); return { slot: c.dataset.body, cls: i?.className ?? null, icon: i?.style.getPropertyValue('--icon') ?? null }; });
    const bag = [...document.querySelectorAll('.inventory-grid .inventory-cell--item .inventory-icon')].map((i) => ({ cls: i.className, icon: i.style.getPropertyValue('--icon') }));
    return { body, bag };
  });
  const distinct = new Set(icons.bag.map((i) => i.icon)).size;
  const legs = icons.bag.find((i) => /slot-legs/.test(i.cls))?.icon; const chest = icons.bag.find((i) => /slot-chest/.test(i.cls))?.icon;
  await p.locator('.hero-inventory').screenshot({ path: OUT + 'inventaire-icones.png' });
  check('sac : les 9 emplacements ont chacun leur icone, toutes distinctes ; les jambes ne sont pas le plastron', icons.bag.length === 9 && distinct === 9 && !!legs && !!chest && legs !== chest, { n: icons.bag.length, distinct, cls: icons.bag.map((i) => i.cls) });
  const BODY_TO_SLOT = { head: 'helmet', shoulders: 'shoulders', chest: 'chest', arms: 'arms', right: 'mainHand', left: 'shield', legs: 'legs', cape: 'cape' };
  check('silhouette : chaque piece portee porte l icone de son emplacement', icons.body.filter((c) => c.cls).length === 8 && icons.body.filter((c) => c.cls).every((c) => c.cls.includes(`slot-${BODY_TO_SLOT[c.slot]}`)), icons.body.map((c) => [c.slot, c.cls]));
  await p.keyboard.press('i'); await L.wait(p, 200);

  // ==== 6. EFFET D'ARME EN JEU : givre, toutes les 3 attaques, 2 fois : deux textes de givre a l'impact.
  await p.evaluate(() => {
    const E = window.__E; const h = window.__hero();
    E.test_frost = { ...E.starter_sword, id: 'test_frost', name: 'Lame de givre', stats: {}, scaling: {}, effects: [{ every: 3, repeat: 2, effect: 'frostDamage', amount: 4 }] };
    h.hero.inventory = { ...h.hero.inventory, equipped: {}, equippedLevels: {}, slots: h.hero.inventory.slots.map(() => null) };
    window.arrowItems.give('test_frost');
  });
  await L.wait(p, 200);
  await p.evaluate(() => {
    window.arrowItems.equip('test_frost');
    window.__frostTexts = [];
    new MutationObserver((list) => { for (const m of list) for (const n of m.addedNodes) if (n.classList?.contains('school-text--frost')) window.__frostTexts.push(n.textContent); }).observe(document.body, { childList: true, subtree: true });
  });
  await L.wait(p, 200);
  const foe = await p.evaluate(() => { const w = window.__world; const h = window.__hero(); h.stats.missChance = 0; const f = w.spawn('fantassin', 'enemy', h.x + 1.1, h.z); f.stats.damage = 0; f.stats.maxHp = 1e6; f.hp = 1e6; f.stats.moveSpeed = 0; f.stats.dodgeChance = 0; w.issueCommand({ kind: 'attack', entityIds: [h.id], targetEntityId: f.id }); return { id: f.id, x: f.x, z: f.z }; });
  await setView(foe.x, foe.z, 8);
  let frost = [];
  for (let i = 0; i < 80 && frost.length < 2; i++) { await L.wait(p, 100); frost = await p.evaluate(() => window.__frostTexts.slice()); }
  await p.screenshot({ path: OUT + 'effet-givre.png' });
  const onHit = await p.evaluate(() => window.__hero().onHit);
  check('en jeu : arme « toutes les 3 attaques, 2 fois, givre 4 » : deux textes de givre a l impact, compteur actif sur l effet', frost.length >= 2 && frost.slice(0, 2).every((t) => /4/.test(t)) && Array.isArray(onHit) && onHit[0].school === 'frost', { frost, onHit });

  check('aucune erreur de page', errors.length === 0, errors.slice(0, 3));
  console.log(failures ? failures + ' ECHEC(S)' : 'tout OK');
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
