// Tests EN JEU du cargo economique (2026-11-03) : Heros : bois en cargo, HUD inchange avant depot, fiche « Ressources
// transportees », sac RPG sans ressource, sac 3D visible ; plein -> depot Baliste -> HUD +10 -> retour ; depot manuel
// (clic droit Baliste) ; or de butin -> monnaie directe. Villageois (nouveau modele) : mains vides au repos et en
// marche (aucun tool_* visible, pas d'arme), hache pendant la coupe, pioche pendant le minage, geste d'attaque joue,
// outil retire a la fin ; fiche « Transport » ; boucle plein -> depot -> retour ; aucune cible acquise.
// Usage : npm run test:game (ou VITE_BASE=http://localhost:5174/ node tests/game/cargo-jeu.cjs)
const L = require('./lib.cjs');
const OUT = require('./lib.cjs').OUT;
const J = (v) => JSON.stringify(v);
let failures = 0;
const check = (label, ok, extra = '') => { if (!ok) failures++; console.log(`${ok ? 'OK   ' : 'ECHEC'} ${label}${extra ? ' — ' + String(typeof extra === 'string' ? extra : J(extra)).slice(0, 900) : ''}`); };
(async () => {
  const { browser, ctx } = await L.launch(); const errors = [];
  const p = await L.openSurvival(ctx, '?seed=12345', errors);
  await p.evaluate(async () => {
    const urls = performance.getEntriesByType('resource').map((e) => e.name);
    window.__toScreen = (x, z, y) => { const v = new window.THREE.Vector3(x, y ?? window.__S.surfaceY(x, z), z).project(window.__R.camera); return { x: (v.x * 0.5 + 0.5) * innerWidth, y: (-v.y * 0.5 + 0.5) * innerHeight }; };
    window.__hero = () => window.__world.entities.find((e) => e.hero);
    window.__bld = await import(urls.find((n) => n.includes('/src/data/buildings.ts')));
    for (const u of urls.filter((n) => n.includes('/src/render/unitViews.ts'))) { const V = (await import(u)).UnitViews; const s = V.prototype.sync; if (!s.__p) { V.prototype.sync = function (...a) { window.__uv = this; return s.apply(this, a); }; V.prototype.sync.__p = true; } }
    for (const e of window.__world.entities) if (e.team === 'enemy') e.stats.damage = 0;
    // 2026-11-04 : hache et pioche des le depart, aucune Forge posee.
  });
  await p.evaluate(() => window.arrowEconomy.set({ gold: 20, wood: 0, stone: 0 }));
  await L.wait(p, 400);
  const stock = () => p.evaluate(() => window.arrowEconomy.stock());
  const hud = () => p.evaluate(() => [...document.querySelectorAll('.economy-hud-item')].map((e) => e.textContent).join(' | '));
  const sheetRows = () => p.evaluate(() => (document.querySelector('.entity-info:not([hidden])')?.innerText ?? '').replace(/\s+/g, ' '));
  const nearNode = (res) => p.evaluate((res) => { const w = window.__world; const n = [...w.resourceNodes.values()].filter((n) => n.resource === res && !w.depletedResourceNodes.has(n.id)).sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z))[0]; return { id: n.id, x: n.x, z: n.z, bx: n.block ? n.block.maxX + 0.6 : n.x + 1.2 }; }, res);
  const toolsVisible = (id) => p.evaluate((id) => { const v = window.__uv.views.get(id); const t = v?.userData.toonTools; const out = {}; if (t) for (const [k, m] of t) out[k] = m.visible; return { tool: v?.userData.toonTool ?? null, ...out, weapon: v ? !!v.getObjectByName?.('equipment_right')?.visible : null }; }, id);

  // --- Heros : bois en cargo.
  const tree = await nearNode('wood');
  await p.evaluate((t) => { const w = window.__world; const h = window.__hero(); h.x = h.prevX = t.bx; h.z = h.prevZ = t.z; w.issueCommand({ kind: 'harvest', entityIds: [h.id], nodeId: t.id }); }, tree);
  await L.wait(p, 5500);
  const s1 = await stock(); const hud1 = await hud();
  const h1 = await p.evaluate(() => { const h = window.__hero(); const v = window.__uv.views.get(h.id); return { cargo: { ...h.cargo }, bagRes: h.hero.inventory.slots.filter((s) => s && s.kind === 'resource').length, bag3d: !!v.userData.heroBag?.root.visible, working: h.hero.working }; });
  await p.keyboard.press('i'); await L.wait(p, 400);
  const sheet = await p.evaluate(() => ({ cargo: document.querySelector('.hero-inventory-cargo')?.textContent ?? '', cells: document.querySelectorAll('.inventory-cell--resource, .inventory-cell[data-resource]').length, text: document.querySelector('.hero-inventory')?.innerText?.replace(/\s+/g, ' ') ?? '' }));
  await p.screenshot({ path: OUT + 'cargo-heros-fiche.png' });
  await p.keyboard.press('i'); await L.wait(p, 200);
  check('Heros coupe 5 s : ~3 bois dans le cargo, stock et HUD inchanges (0 bois), aucune case du sac RPG, sac 3D visible, fenetre : « Ressources transportées : 3 / 10 — Bois 3 »', h1.cargo.wood >= 2 && h1.cargo.wood <= 4 && s1.wood === 0 && /Bois 0/.test(hud1) && h1.bagRes === 0 && h1.bag3d && sheet.cells === 0 && new RegExp(`Ressources transportées : ${h1.cargo.wood} / 10 — Bois ${h1.cargo.wood}`).test(sheet.cargo), { h1, s1, hud1, sheet: sheet.cargo });

  // Plein -> depot -> HUD +10 -> retour.
  let log = [], back = false;
  for (let i = 0; i < 160 && !back; i++) {
    await L.wait(p, 300);
    const st = await p.evaluate((t) => { const h = window.__hero(); return { o: h.order.type, c: h.cargo.wood, wood: window.arrowEconomy.stock().wood, ret: h.cargo.returnTo?.nodeId ?? null }; }, tree);
    if (!log.length || log[log.length - 1].o !== st.o) log.push(st);
    if (st.wood >= 10 && st.o === 'harvest') back = true;
  }
  const s2 = await stock(); const hud2 = await hud();
  check('cargo plein (10) : depot automatique a la Baliste, HUD +10 bois, retour a l arbre et reprise', log.some((l) => l.o === 'deposit') && back && s2.wood === 10 && /Bois 10/.test(hud2), { log, s2, hud2 });

  // Depot manuel avec 2 bois.
  // Camp de depart (graine 12345 : rotation 0, porte au sud) : le Heros attend devant la porte, hors de portee de
  // depot ; le depot instantane a portee rendrait l'ordre invisible si le Heros restait colle a la Baliste.
  const ball = await p.evaluate(() => { const b = window.__world.entities.find((e) => e.unitId === 'ballista'); return { x: b.x, z: b.z }; });
  await p.evaluate((b) => { const h = window.__hero(); h.x = h.prevX = b.x - 1; h.z = h.prevZ = b.z + 8; h.cargo.wood = 2; h.order = { type: 'guard' }; h.cargo.returnTo = null; }, ball);
  await L.setView(p, { targetX: ball.x, targetZ: ball.z, viewHeight: 14, yawDeg: 45, pitchDeg: 55 }); await L.wait(p, 400);
  const bs = await p.evaluate((b) => window.__toScreen(b.x, b.z, window.__S.surfaceY(b.x, b.z) + 1.5), ball);
  await p.mouse.move(bs.x, bs.y); await L.wait(p, 100); await p.mouse.click(bs.x, bs.y, { button: 'right' }); await L.wait(p, 200);
  const o3 = await p.evaluate(() => window.__hero().order.type);
  for (let i = 0; i < 60; i++) { await L.wait(p, 250); if (await p.evaluate(() => window.__hero().cargo.wood === 0)) break; }
  const s3 = await stock();
  check('depot manuel : Heros devant la porte du camp, clic droit sur la Baliste avec 2 bois -> ordre de depot, il entre, stock +2 (12)', o3 === 'deposit' && s3.wood === 12, { o3, s3 });

  // Or de butin : monnaie directe, cargo inchange.
  const gp = await p.evaluate(() => { const h = window.__hero(); const id = window.__world.dropGold(h.x + 2, h.z, 7); const g0 = window.arrowEconomy.stock().gold; return { id, g0 }; });
  await p.evaluate((id) => { const h = window.__hero(); window.__world.issueCommand({ kind: 'pickup', entityIds: [h.id], pileId: id }); }, gp.id);
  for (let i = 0; i < 40; i++) { await L.wait(p, 250); if (await p.evaluate((id) => window.__world.resourcePiles[id].amount === 0, gp.id)) break; }
  const g4 = await p.evaluate(() => ({ gold: window.arrowEconomy.stock().gold, cargoGold: window.__hero().cargo.minedGold }));
  check('or de butin (tas) : ramasse par le Heros -> monnaie +7 immediatement, cargo (or extrait) inchange', g4.gold === gp.g0 + 7 && g4.cargoGold === 0, { gp, g4 });

  // --- Villageois.
  const vil = await p.evaluate((t) => { const w = window.__world; const u = w.spawn('villageois', 'player', t.bx + 2, t.z + 1); return { id: u.id, x: u.x, z: u.z, aggro: u.stats.aggroRange, dmg: u.stats.damage }; }, tree);
  await L.wait(p, 700);
  await L.setView(p, { targetX: vil.x, targetZ: vil.z, viewHeight: 8, yawDeg: 45, pitchDeg: 40 }); await L.wait(p, 500);
  const idle = await toolsVisible(vil.id);
  const model = await p.evaluate((id) => { const v = window.__uv.views.get(id); let tri = 0, names = []; v.traverse((o) => { if (o.isMesh || o.isSkinnedMesh) { names.push(o.name); const g = o.geometry; tri += g.index ? g.index.count / 3 : g.attributes.position.count / 3; } }); return { names, tri: Math.round(tri) }; }, vil.id);
  await p.screenshot({ path: OUT + 'villageois-idle.png' });
  await p.evaluate((v) => { window.__world.issueCommand({ kind: 'move', entityIds: [v.id], x: v.x + 3, z: v.z }); }, vil);
  await L.wait(p, 600);
  const moving = await toolsVisible(vil.id);
  check('Villageois (modele human_villager, 330 triangles) : repos et deplacement mains vides (aucun outil visible), aucune arme ; aggro 0, degats 0', model.names.includes('tool_axe') && model.names.includes('tool_pick') && model.tri > 300 && model.tri < 400 && idle.tool === '' && idle.axe === false && idle.pick === false && moving.axe === false && moving.pick === false && vil.aggro === 0 && vil.dmg === 0, { idle, moving, model, vil });

  // Coupe : hache + geste ; fiche Transport.
  await p.evaluate(([v, t]) => { const w = window.__world; const u = w.getById(v.id); u.x = u.prevX = t.bx; u.z = u.prevZ = t.z + 0.3; w.issueCommand({ kind: 'harvest', entityIds: [u.id], nodeId: t.id }); }, [vil, tree]);
  await L.wait(p, 1500);
  const chop = await p.evaluate((id) => { const u = window.__world.getById(id); const v = window.__uv.views.get(id); return { working: u.worker.working, tool: v.userData.toonTool, anim: window.__uv.riggedActionState.get(id) ?? null, cargo: u.cargo.wood }; }, vil.id);
  await L.setView(p, { targetX: tree.bx, targetZ: tree.z, viewHeight: 7, yawDeg: 45, pitchDeg: 35 }); await L.wait(p, 300);
  await p.screenshot({ path: OUT + 'villageois-coupe.png' });
  // Le Villageois a rejoint son point d'approche au bord de l'arbre (G43) : rectangle de selection autour de sa position reelle.
  const vs = await p.evaluate((id) => { const u = window.__world.getById(id); return window.__toScreen(u.x, u.z, window.__S.surfaceY(u.x, u.z) + 0.6); }, vil.id);
  await p.mouse.move(vs.x - 40, vs.y - 50); await p.mouse.down(); await p.mouse.move(vs.x + 40, vs.y + 40, { steps: 6 }); await p.mouse.up(); await L.wait(p, 400);
  const vsheet = await sheetRows();
  check('Villageois coupe : hache visible, geste d attaque (chop), bois dans le cargo ; fiche « Transport : N / 5 — Bois N »', chop.working === 'chop' && chop.tool === 'axe' && chop.anim === 'chop' && chop.cargo >= 1 && new RegExp(`Transport ${chop.cargo}|Transport \\d / 5`).test(vsheet), { chop, vsheet: vsheet.slice(0, 200) });

  // Boucle plein (5) -> depot -> retour ; puis fin de travail : outil retire.
  let vlog = [], vback = false; const w0 = (await stock()).wood;
  for (let i = 0; i < 160 && !vback; i++) {
    await L.wait(p, 300);
    const st = await p.evaluate((id) => { const u = window.__world.getById(id); return { o: u.order.type, c: u.cargo.wood, wood: window.arrowEconomy.stock().wood }; }, vil.id);
    if (!vlog.length || vlog[vlog.length - 1].o !== st.o) vlog.push(st);
    if (st.wood >= w0 + 5 && st.o === 'harvest') vback = true;
  }
  check('Villageois : cargo 5 -> depot automatique -> stock +5 -> retour a l arbre', vlog.some((l) => l.o === 'deposit') && vback, { vlog, w0 });
  await p.evaluate((id) => { window.__world.issueCommand({ kind: 'stop', entityIds: [id] }); }, vil.id);
  await L.wait(p, 500);
  const stopped = await toolsVisible(vil.id);
  check('fin du travail (Stop) : hache retiree, mains vides', stopped.axe === false && stopped.pick === false && stopped.tool === '', stopped);

  // Minage : pioche.
  const rock = await nearNode('stone');
  await p.evaluate(([v, r]) => { const w = window.__world; const u = w.getById(v.id); u.x = u.prevX = r.bx; u.z = u.prevZ = r.z; u.cargo.wood = 0; w.issueCommand({ kind: 'harvest', entityIds: [u.id], nodeId: r.id }); }, [vil, rock]);
  await L.wait(p, 1500);
  const mine = await p.evaluate((id) => { const u = window.__world.getById(id); const v = window.__uv.views.get(id); return { working: u.worker.working, tool: v.userData.toonTool, anim: window.__uv.riggedActionState.get(id) ?? null, stone: u.cargo.stone }; }, vil.id);
  await L.setView(p, { targetX: rock.bx, targetZ: rock.z, viewHeight: 7, yawDeg: 45, pitchDeg: 35 }); await L.wait(p, 300);
  await p.screenshot({ path: OUT + 'villageois-mine.png' });
  check('Villageois mine la pierre : pioche visible, geste d attaque (mine), pierre dans le cargo', mine.working === 'mine' && mine.tool === 'pick' && mine.anim === 'mine' && mine.stone >= 1, mine);

  if (errors.length) { failures++; console.log('ERREURS', errors.join(' / ').slice(0, 1200)); }
  console.log(failures ? failures + ' ECHEC(S)' : 'tout OK');
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
