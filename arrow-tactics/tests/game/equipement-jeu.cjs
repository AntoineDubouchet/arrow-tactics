// Tests cibles EN JEU : equipement du Heros (?items=demo) : inventaire (I) -> Equiper / Retirer, stats (fiche de
// l'inventaire), visuel (epee / bouclier en main, marteau cache), outil de travail temporaire (hache puis retour de
// l'epee), remplacement (Lame des braises), texte de feu, captures. Usage : npm run test:game (ou VITE_BASE=http://localhost:5174/ node tests/game/equipement-jeu.cjs)
const L = require('./lib.cjs');
const D = require('./lib.cjs');
const OUT = require('./lib.cjs').OUT;
const J = (v) => JSON.stringify(v);
let failures = 0;
const check = (label, ok, extra = '') => { if (!ok) failures++; console.log(`${ok ? 'OK   ' : 'ECHEC'} ${label}${extra ? ' — ' + String(extra).slice(0, 900) : ''}`); };
(async () => {
  const { browser, ctx } = await L.launch(); const errors = [];
  const p = await L.openSurvival(ctx, '?seed=12345&items=demo', errors);
  await p.evaluate(async () => {
    window.__bld = await import(performance.getEntriesByType('resource').map((e) => e.name).find((n) => n.includes('/src/data/buildings.ts')));
    const urls = performance.getEntriesByType('resource').map((e) => e.name);
    const UV = (await import(urls.find((n) => n.includes('/src/render/unitViews.ts')))).UnitViews;
    const us = UV.prototype.sync; UV.prototype.sync = function (...a) { window.__uv = this; return us.apply(this, a); };
    const CO = (await import(urls.find((n) => n.includes('/src/ui/combatOverlay.ts')))).CombatOverlay;
    const sf = CO.prototype.spawnFireText; window.__fire = []; CO.prototype.spawnFireText = function (x, z, a) { window.__fire.push(a); return sf.call(this, x, z, a); };
  });
  await L.wait(p, 400);
  const etat = () => p.evaluate(() => {
    const h = window.__world.entities.find((e) => e.hero); const view = window.__uv.views.get(h.id);
    const vis = {}; view.traverse((o) => { if (o.isMesh && (/^tool_/.test(o.name) || /^equipment_/.test(o.name))) vis[o.name] = o.visible; });
    return { vis, dmg: h.stats.damage, maxHp: h.stats.maxHp, hp: h.hp, fire: h.onHit?.fireDamage ?? 0, inv: window.arrowItems.list().inventory, working: h.hero.working };
  });
  const e0 = await etat();
  // Inventaire : I, puis Equiper l'Epee du debutant et le Bouclier robuste.
  await p.keyboard.press('i'); await L.wait(p, 300);
  // Inventaire unique (grille) : double-clic sur l item = equiper.
  const card = (name) => p.locator('.inventory-grid .inventory-cell--item', { hasText: name }).first();
  await card('Épée du débutant').dblclick(); await L.wait(p, 400);
  await card('Bouclier robuste').dblclick(); await L.wait(p, 1500);
  const e1 = await etat();
  const panel = await p.evaluate(() => document.querySelector('.hero-inventory').innerText);
  await p.keyboard.press('i'); await L.wait(p, 200);
  check('?items=demo : 5 items dans le sac ; inventaire : Equiper l Epee du debutant et le Bouclier robuste -> degats 55, PV max 380, epee et bouclier en main, marteau cache ; fiche : Degats 5.5, rarete et lignes de stats',
    e0.inv.items.length === 18 && e1.dmg === 55 && e1.maxHp === 380 && e1.vis.equipment_right === true && e1.vis.equipment_left === true && e1.vis.tool_hammer === false && /Dégâts\s+5\.5/.test(panel) && /Épée du débutant/.test(panel),
    J({ e0: e0.inv, e1, panel: panel.slice(0, 600) }));
  // Gros plan.
  const h = await p.evaluate(() => { const e = window.__world.entities.find((x) => x.hero); return { x: e.x, z: e.z }; });
  await L.setView(p, { targetX: h.x, targetZ: h.z, viewHeight: 5, yawDeg: 45, pitchDeg: 35 }); await L.wait(p, 600);
  await p.screenshot({ path: OUT + 'equipement-epee-bouclier.png' });
  // Travail : couper un arbre (hache, epee cachee), puis arret (epee de retour).
  await p.evaluate(() => {
    const w = window.__world; const e = w.entities.find((x) => x.hero);
    // Outils : une Forge terminee (les droits sont recalcules a chaque pas depuis les batiments, 2026-11-02).
    const b = w.entities.find((x) => x.unitId === 'ballista'); const fx = Math.floor(b.x) - 6.5, fz = Math.floor(b.z) - 6.5;
    w.spawnBuilding(window.__bld.getBuilding('forge'), 'player', fx, fz, { kind: 'building', x: fx, z: fz, tilesX: 2, tilesZ: 2 });
    const n = [...w.resourceNodes.values()].filter((q) => q.resource === 'wood' && !w.depletedResourceNodes.has(q.id)).sort((a, b) => Math.hypot(a.x - e.x, a.z - e.z) - Math.hypot(b.x - e.x, b.z - e.z))[0];
    e.x = e.prevX = n.block ? n.block.maxX + 0.6 : n.x + 1.2; e.z = e.prevZ = n.z;
    w.issueCommand({ kind: 'harvest', entityIds: [e.id], nodeId: n.id });
  });
  let chop = null; for (let i = 0; i < 40 && !chop; i++) { await L.wait(p, 200); const e = await etat(); if (e.working === 'chop') chop = e; }
  await p.evaluate(() => { const e = window.__world.entities.find((x) => x.hero); window.__world.issueCommand({ kind: 'stop', entityIds: [e.id] }); });
  await L.wait(p, 500);
  const after = await etat();
  check('travail : hache en main, epee cachee (bouclier garde) ; a l arret : epee de retour, outils caches',
    chop && chop.vis.tool_axe === true && chop.vis.equipment_right === false && chop.vis.equipment_left === true && after.vis.equipment_right === true && after.vis.tool_axe === false && after.vis.tool_hammer === false, J({ chop: chop?.vis, after: after.vis }));
  // Remplacement par la Lame des braises : bonus precedent retire, feu actif, texte de feu a l'impact.
  await p.evaluate(() => window.arrowItems.equip('ember_blade')); await L.wait(p, 1200);
  const e2 = await etat();
  await p.evaluate(() => { const w = window.__world; const e = w.entities.find((x) => x.hero); const f = w.spawn('maraudeur', 'enemy', e.x + 1.1, e.z); f.hp = f.stats.maxHp = 3000; f.rootTimer = 999; });
  await L.wait(p, 3500);
  const fires = await p.evaluate(() => window.__fire.slice());
  check('remplacement : Lame des braises -> degats 65 (+40, l Epee retiree et rendue au sac), feu 30 ; textes de feu « 3 » a l impact',
    e2.dmg === 65 && e2.fire === 30 && e2.inv.equipped.mainHand === 'ember_blade' && e2.inv.items.includes('starter_sword') && fires.length > 0 && fires.every((a) => a === 3), J({ dmg: e2.dmg, fire: e2.fire, inv: e2.inv, fires }));
  await p.screenshot({ path: OUT + 'equipement-braises.png' });
  // Retrait : stats de base, marteau de retour.
  await p.evaluate(() => { window.arrowItems.unequip('mainHand'); window.arrowItems.unequip('shield'); }); await L.wait(p, 800);
  const e3 = await etat();
  check('retrait de l arme et du bouclier : degats 25, PV max 300, plus de feu, marteau de retour', e3.dmg === 25 && e3.maxHp === 300 && e3.fire === 0 && e3.vis.tool_hammer === true && !e3.vis.equipment_right && !e3.vis.equipment_left, J(e3));
  if (errors.length) { failures++; console.log('ERREURS', errors.join(' / ').slice(0, 800)); }
  console.log(failures ? failures + ' ECHEC(S)' : 'tout OK');
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
