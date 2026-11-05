// Tests EN JEU du placement libre (2026-11-06, G48), run reelle graine 12345 : fantome continu (aucun saut de case), vert /
// rouge, touche R (15°, cumulatif), Echap ; Maison 3.27 / 8.63 a 15° : chantier exact, empreinte tournee, construction, selection,
// fiche ; R hors pose : camera ; refus sur un batiment sans rien payer ; Maj : 3 Maisons a positions flottantes, 3 couts, mode
// actif jusqu'a Echap, chaine automatique du constructeur ; Villageois constructeur ; double-clic sur des batiments non alignes ;
// Auberge tournee : ralliement au clic droit et production ; captures.
// Usage : npm run test:game (ou VITE_BASE=http://localhost:5174/ node tests/game/placement-jeu.cjs)
const L = require('./lib.cjs');
const OUT = L.OUT;
const J = (v) => JSON.stringify(v);
let failures = 0;
const check = (label, ok, extra = '') => { if (!ok) failures++; console.log(`${ok ? 'OK   ' : 'ECHEC'} ${label}${extra ? ' — ' + String(typeof extra === 'string' ? extra : J(extra)).slice(0, 1200) : ''}`); };
const DEG15 = Math.PI / 12;
(async () => {
  const { browser, ctx } = await L.launch(); const errors = [];
  const p = await L.openSurvival(ctx, '?seed=12345', errors);
  await p.evaluate(() => {
    window.__hero = () => window.__world.entities.find((e) => e.hero);
    window.__toScreen = (x, z, y) => { const v = new window.THREE.Vector3(x, y ?? window.__S.surfaceY(x, z), z).project(window.__R.camera); return { x: (v.x * 0.5 + 0.5) * innerWidth, y: (-v.y * 0.5 + 0.5) * innerHeight }; };
    const w = window.__world;
    for (const e of w.entities) if (e.team === 'enemy') e.stats.damage = 0;
    const vils = w.entities.filter((e) => e.worker && e.alive);
    w.issueCommand({ kind: 'stop', entityIds: vils.map((e) => e.id) });
    for (const e of vils) { e.worker.autoRetryIn = 1e9; e.cargo.wood = e.cargo.stone = e.cargo.minedGold = 0; }
    window.arrowEconomy.set({ gold: 500, wood: 500, stone: 500 });
    window.__sites = (id) => w.entities.filter((e) => e.alive && e.team === 'player' && e.unitId === id).map((e) => ({ id: e.id, x: e.x, z: e.z, site: !!e.construction, cos: e.footprintObstacle?.footprint?.cos, sin: e.footprintObstacle?.footprint?.sin }));
  });
  const base = await p.evaluate(() => { const b = window.__world.entities.find((e) => e.unitId === 'ballista'); return { x: b.x, z: b.z }; });
  const setView = (x, z, h = 14) => L.setView(p, { targetX: x, targetZ: z, viewHeight: h, yawDeg: 45, pitchDeg: 55 });
  const stock = () => p.evaluate(() => window.arrowEconomy.stock());
  const placing = () => p.evaluate(() => window.arrowInspection.placing());
  const screen = (x, z) => p.evaluate(([x, z]) => window.__toScreen(x, z), [x, z]);
  const moveTo = async (x, z) => { const s = await screen(x, z); await p.mouse.move(s.x, s.y, { steps: 2 }); await L.wait(p, 120); return s; };
  const openMenu = async (name) => { await p.locator('.build-menu-button').click({ timeout: 4000 }); await L.wait(p, 200); await p.locator('.build-menu-item', { hasText: name }).first().click({ timeout: 4000 }); await L.wait(p, 200); };
  const ghost = () => p.evaluate(() => { const g = window.__R.scene.getObjectByName('building-placement'); const m = g?.getObjectByName('building-placement-ghost'); const pl = g?.getObjectByName('building-placement-plate'); return m ? { x: m.position.x, z: m.position.z, rot: m.rotation.y, color: pl?.material.color.getHex() } : null; });
  const GREEN = 0x4ade80; const RED = 0xef4444;
  const selectHero = async () => { await L.blur(p); await p.keyboard.press('Escape'); await L.wait(p, 100); if (await p.evaluate(() => !!document.querySelector('.screen-pause.screen-overlay--visible'))) { await p.keyboard.press('Escape'); await L.wait(p, 150); } await L.blur(p); await p.keyboard.press('Space'); await L.wait(p, 250); };
  const clickEntity = async (e, up = 0.8) => { const s = await p.evaluate(([x, z, up]) => window.__toScreen(x, z, window.__S.surfaceY(x, z) + up), [e.x, e.z, up]); await p.mouse.click(s.x, s.y); await L.wait(p, 350); };
  const waitBuilt = async (ids, seconds = 40) => { for (let i = 0; i < seconds * 4; i++) { const left = await p.evaluate((ids) => ids.filter((id) => window.__world.getById(id)?.construction), ids); if (left.length === 0) return true; await L.wait(p, 250); } return false; };

  // ==== 1. Fantome continu, vert / rouge, R, Echap.
  await selectHero();
  await setView(3.27, 8.63, 14); await L.wait(p, 400);
  const s0 = await stock();
  await openMenu('Maison');
  check('menu Construire -> Maison : mode de pose, rien de paye', (await placing()) === 'house' && J(await stock()) === J(s0));
  const a = await moveTo(3.27, 8.63);
  const g1 = await ghost();
  await p.mouse.move(a.x + 3, a.y); await L.wait(p, 120);
  const g2 = await ghost();
  await p.mouse.move(a.x + 6, a.y + 2); await L.wait(p, 120);
  const g3 = await ghost();
  const steps = [Math.hypot(g2.x - g1.x, g2.z - g1.z), Math.hypot(g3.x - g2.x, g3.z - g2.z)];
  const hint = await p.evaluate(() => document.querySelector('.building-rotation-hint')?.textContent ?? '');
  check('fantome : suit la souris en continu, 3 pixels = quelques centiemes de case, position non alignee ; vert sur terrain libre ; indication R / Maj / Echap', !!g1 && Math.abs(g1.x - 3.27) < 0.06 && Math.abs(g1.z - 8.63) < 0.06 && steps.every((d) => d > 0.01 && d < 0.3) && g1.color === GREEN && /R/.test(hint) && /15/.test(hint) && /Maj/.test(hint), { g1, g2, g3, steps, hint });
  await moveTo(3.27, 8.63);
  await p.keyboard.press('r'); await L.wait(p, 120);
  const r1 = await ghost();
  await p.keyboard.press('r'); await L.wait(p, 120);
  const r2 = await ghost();
  await p.screenshot({ path: OUT + 'placement-fantome.png' });
  check('touche R : 15°, puis 30° (cumulatif), le fantome reste sous le curseur', Math.abs(r1.rot - DEG15) < 1e-6 && Math.abs(r2.rot - 2 * DEG15) < 1e-6 && Math.abs(r2.x - r1.x) < 1e-6, { r1: r1.rot, r2: r2.rot });
  await moveTo(base.x + 0.3, base.z + 0.3);
  const red = await ghost();
  await p.screenshot({ path: OUT + 'placement-refus.png' });
  const sa = await p.evaluate(() => window.__sites('house').length);
  const s1 = await p.evaluate(([x, z]) => window.__toScreen(x, z), [base.x + 0.3, base.z + 0.3]);
  await p.mouse.click(s1.x, s1.y); await L.wait(p, 200);
  check('fantome rouge sur la Baliste ; clic : aucun chantier, rien de paye, mode conserve', red.color === RED && (await p.evaluate(() => window.__sites('house').length)) === sa && J(await stock()) === J(s0) && (await placing()) === 'house', red);
  await p.keyboard.press('Escape'); await L.wait(p, 200);
  check('Echap : mode quitte, fantome retire, rien de paye', (await placing()) === null && (await ghost()) === null && J(await stock()) === J(s0));

  // ==== 2. Maison 3.27 / 8.63 a 15° : chantier, construction, selection.
  await selectHero();
  await setView(3.27, 8.63, 14); await L.wait(p, 300);
  const vBefore = await L.view(p);
  await p.keyboard.press('r'); await L.wait(p, 150);
  const vAfter = await L.view(p);
  check('R hors pose : camera remise (role d origine), aucun mode de pose', (await placing()) === null && !!vAfter && !!vBefore);
  await setView(3.27, 8.63, 14); await L.wait(p, 300);
  await openMenu('Maison');
  await moveTo(3.27, 8.63);
  await p.keyboard.press('r'); await L.wait(p, 120);
  const before = (await p.evaluate(() => window.__sites('house'))).map((h) => h.id);
  const s = await screen(3.27, 8.63);
  await p.mouse.click(s.x, s.y); await L.wait(p, 250);
  const house = (await p.evaluate(() => window.__sites('house'))).find((h) => !before.includes(h.id));
  const s2 = await stock();
  const order = await p.evaluate(() => window.__hero().order);
  check('clic : chantier a la position exacte (3.27 ; 8.63 a un pixel pres, jamais arrondie a la grille), empreinte tournee de 15°, 10 bois payes, le Heros part le construire, mode quitte', !!house && house.site && Math.abs(house.x - 3.27) < 0.06 && Math.abs(house.z - 8.63) < 0.06 && Math.abs(house.x * 2 - Math.round(house.x * 2)) > 0.1 && Math.abs(house.cos - Math.cos(DEG15)) < 1e-6 && Math.abs(house.sin - Math.sin(DEG15)) < 1e-6 && s2.wood === s0.wood - 10 && order.type === 'build' && order.targetEntityId === house.id && (await placing()) === null, { house, s2, order });
  const built = await waitBuilt([house.id]);
  const after = await p.evaluate((id) => { const e = window.__world.getById(id); const h = window.__hero(); const f = e.footprintObstacle.footprint; const dx = h.x - f.x; const dz = h.z - f.z; const ax = Math.abs(dx * f.cos - dz * f.sin) - f.halfW; const az = Math.abs(dx * f.sin + dz * f.cos) - f.halfD; return { x: e.x, z: e.z, hp: e.hp, max: e.stats.maxHp, gap: Math.hypot(Math.max(ax, 0), Math.max(az, 0)), order: h.order.type }; }, house.id);
  check('Maison batie : pleins PV, position intacte, Heros au contact et hors du modele, au repos', built && after.hp === after.max && after.x === house.x && after.z === house.z && after.gap > 0.3 && after.gap < 1.6 && after.order === 'guard', after);
  // Selection, y compris pres d'un coin de l'empreinte tournee.
  await L.blur(p);
  const corner = await p.evaluate((id) => { const f = window.__world.getById(id).footprintObstacle.footprint; const lx = 0.8, lz = 0.8; return { x: f.x + lx * f.cos + lz * f.sin, z: f.z - lx * f.sin + lz * f.cos }; }, house.id);
  await clickEntity(corner, 0.1);
  const fiche = await p.evaluate(() => ({ primary: window.arrowInspection.primary(), title: document.querySelector('.entity-info .entity-info-title')?.textContent ?? null }));
  check('clic pres d un coin de la Maison tournee : selectionnee, fiche ouverte', fiche.primary === house.id && /Maison/.test(fiche.title ?? ''), fiche);
  await p.screenshot({ path: OUT + 'placement-maison-15.png' });

  // ==== 3. Maj : 3 Maisons flottantes, 3 couts, mode conserve, chaine automatique.
  await selectHero();
  const spots = [[-3.37, 7.11], [-0.82, 8.93], [-3.05, 10.26]];
  await setView(-2, 8.5, 14); await L.wait(p, 300);
  const sBefore = await stock();
  const known = (await p.evaluate(() => window.__sites('house'))).map((h) => h.id);
  await openMenu('Maison');
  const modes = [];
  for (const [x, z] of spots) {
    const pt = await moveTo(x, z);
    await p.keyboard.down('Shift'); await p.mouse.click(pt.x, pt.y); await p.keyboard.up('Shift'); await L.wait(p, 200);
    modes.push(await placing());
  }
  const placed = (await p.evaluate(() => window.__sites('house'))).filter((h) => !known.includes(h.id));
  const sAfter = await stock();
  const ghostAfter = await ghost();
  check('Maj + clic : 3 Maisons a positions flottantes differentes, 3 chantiers, 3 couts, mode de pose toujours actif, fantome pret', placed.length === 3 && placed.every((h, i) => Math.abs(h.x - spots[i][0]) < 0.06 && Math.abs(h.z - spots[i][1]) < 0.06) && sAfter.wood === sBefore.wood - 30 && modes.every((m) => m === 'house') && !!ghostAfter, { placed, sBefore, sAfter, modes });
  const pt2 = await moveTo(-5.5, 5.2);
  const gNext = await ghost();
  check('fantome suivant : suit la souris en continu', Math.abs(gNext.x + 5.5) < 0.06 && Math.abs(gNext.z - 5.2) < 0.06, { gNext, pt2 });
  await p.keyboard.press('Escape'); await L.wait(p, 200);
  check('Echap : quitte le mode, 3 chantiers conserves', (await placing()) === null && (await p.evaluate(() => window.__sites('house'))).length === known.length + 3);
  const chained = await waitBuilt(placed.map((h) => h.id), 45);
  const heroAfter = await p.evaluate(() => window.__hero().order.type);
  check('chaine automatique : un seul constructeur bat les 3 chantiers de lui-meme, puis reste au repos', chained && heroAfter === 'guard', { chained, heroAfter });
  await setView(-1.5, 8.5, 12); await L.wait(p, 500);
  await p.screenshot({ path: OUT + 'placement-libre.png' });

  // ==== 4. Villageois constructeur, meme pipeline.
  const vil = await p.evaluate(() => { const v = window.__world.entities.find((e) => e.worker && e.alive); return { id: v.id, x: v.x, z: v.z }; });
  await setView(vil.x, vil.z, 12); await L.wait(p, 300);
  await L.blur(p); await p.keyboard.press('Escape'); await L.wait(p, 100);
  if (await p.evaluate(() => !!document.querySelector('.screen-pause.screen-overlay--visible'))) { await p.keyboard.press('Escape'); await L.wait(p, 150); }
  await clickEntity(vil, 0.6);
  const builders = await p.evaluate(() => window.arrowInspection.builders());
  const spot = await p.evaluate((v) => ({ x: v.x + 3.43, z: v.z - 2.71 }), vil);
  const knownT = (await p.evaluate(() => window.__sites('house'))).map((h) => h.id);
  await openMenu('Maison');
  const ptV = await moveTo(spot.x, spot.z);
  await p.keyboard.press('r'); await L.wait(p, 100);
  await p.mouse.click(ptV.x, ptV.y); await L.wait(p, 250);
  const vSite = (await p.evaluate(() => window.__sites('house'))).find((h) => !knownT.includes(h.id));
  const vOrder = await p.evaluate((id) => window.__world.getById(id).order, vil.id);
  const vDone = vSite ? await waitBuilt([vSite.id], 30) : false;
  check('Villageois selectionne : meme pose libre tournee, chantier, ordre de construction a lui seul, Maison terminee', J(builders) === J([vil.id]) && !!vSite && Math.abs(vSite.sin - Math.sin(DEG15)) < 1e-6 && vOrder.type === 'build' && vOrder.targetEntityId === vSite?.id && vDone, { builders, vSite, vOrder, vDone });

  // ==== 5. Double-clic : batiments non alignes du meme type.
  await selectHero();
  await setView(-1.5, 8.5, 18); await L.wait(p, 400);
  const target = placed[0];
  const ds = await p.evaluate((t) => window.__toScreen(t.x, t.z, window.__S.surfaceY(t.x, t.z) + 0.8), target);
  await L.blur(p); await p.keyboard.press('Escape'); await L.wait(p, 120);
  if (await p.evaluate(() => !!document.querySelector('.screen-pause.screen-overlay--visible'))) { await p.keyboard.press('Escape'); await L.wait(p, 150); }
  await p.mouse.click(ds.x, ds.y); await L.wait(p, 120); await p.mouse.click(ds.x, ds.y); await L.wait(p, 400);
  const group = await p.evaluate(() => ({ primary: window.arrowInspection.primary(), group: window.arrowInspection.group(), title: document.querySelector('.entity-info .entity-info-title')?.textContent ?? '' }));
  await p.screenshot({ path: OUT + 'placement-double-clic.png' });
  check('double-clic sur une Maison non alignee : les Maisons visibles en groupe, fiche « Maison ×N »', group.primary === target.id && placed.every((h) => group.group.includes(h.id)) && /Maison\s*(\(chantier\)\s*)?×/.test(group.title), group);

  // ==== 6. Auberge tournee : ralliement au clic droit, production.
  await selectHero();
  await setView(6.5, 3.5, 14); await L.wait(p, 300);
  const knownA = (await p.evaluate(() => window.__sites('tavern'))).map((h) => h.id);
  await openMenu('Auberge');
  const ptA = await moveTo(6.37, 3.41);
  await p.keyboard.press('r'); await L.wait(p, 80);
  await p.keyboard.press('r'); await L.wait(p, 80);
  await p.keyboard.press('r'); await L.wait(p, 100);
  await p.mouse.click(ptA.x, ptA.y); await L.wait(p, 250);
  const tav = (await p.evaluate(() => window.__sites('tavern'))).find((h) => !knownA.includes(h.id));
  const tavDone = tav ? await waitBuilt([tav.id], 30) : false;
  check('Auberge a 45° (R x 3), a position flottante : batie', !!tav && tavDone && Math.abs(tav.cos - Math.cos(Math.PI / 4)) < 1e-6, { tav, tavDone });
  if (tav) {
    await L.blur(p); await p.keyboard.press('Escape'); await L.wait(p, 120);
    if (await p.evaluate(() => !!document.querySelector('.screen-pause.screen-overlay--visible'))) { await p.keyboard.press('Escape'); await L.wait(p, 150); }
    await clickEntity(tav, 0.8);
    const insp = await p.evaluate(() => window.arrowInspection.primary());
    const rp = { x: tav.x - 3.21, z: tav.z + 3.34 };
    const rs = await screen(rp.x, rp.z);
    await p.mouse.click(rs.x, rs.y, { button: 'right' }); await L.wait(p, 300);
    const rally = await p.evaluate((id) => window.__world.getById(id).rally, tav.id);
    const units0 = await p.evaluate(() => window.__world.entities.filter((e) => e.alive && e.worker).length);
    await p.locator('.entity-info-action[data-action="produceUnit"]').first().click(); await L.wait(p, 200);
    let spawned = false;
    for (let i = 0; i < 48 && !spawned; i++) { await L.wait(p, 250); spawned = await p.evaluate((n) => window.__world.entities.filter((e) => e.alive && e.worker).length > n, units0); }
    const unit = await p.evaluate(([id, n]) => { const e = window.__world.entities.filter((x) => x.alive && x.worker).at(-1); const f = window.__world.getById(id).footprintObstacle.footprint; const dx = e.x - f.x; const dz = e.z - f.z; const ax = Math.abs(dx * f.cos - dz * f.sin) - f.halfW; const az = Math.abs(dx * f.sin + dz * f.cos) - f.halfD; return { x: e.x, z: e.z, gap: Math.hypot(Math.max(ax, 0), Math.max(az, 0)), n }; }, [tav.id, units0]);
    check('Auberge tournee : selection, ralliement au clic droit, Villageois produit, hors de son empreinte', insp === tav.id && !!rally && Math.hypot(rally.x - rp.x, rally.z - rp.z) < 0.1 && spawned && unit.gap > 0.2, { insp, rally, rp, spawned, unit });
  }

  check('aucune erreur de page', errors.length === 0, errors.slice(0, 3));
  console.log(failures ? failures + ' ECHEC(S)' : 'tout OK');
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
