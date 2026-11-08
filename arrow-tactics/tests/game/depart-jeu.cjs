// Tests EN JEU du camp de depart (2026-11-04), run reelle graine 12345 : Baliste, Auberge, 2 Maisons (A, B), 2
// Villageois, enceinte de Palissade V2 et porte OUVERTE ; population 2 / 15 ; stock de depart inchange ; camera sur le
// Heros ; production d'un Villageois a l'Hotel de ville (fiche, 2026-11-08) ; Heros et Villageois sortent par la porte (fermee au depart) ; recolte libre
// (bois, pierre) sans Forge ; clic droit sur un gisement d'or : recolte directe, sans Forge (2026-11-05) ; ennemi bloque par la porte
// ouverte ; Baliste detruite = defaite. Captures. Usage : npm run test:game (ou VITE_BASE=http://localhost:5174/ node tests/game/depart-jeu.cjs)
const L = require('./lib.cjs');
const OUT = require('./lib.cjs').OUT;
const J = (v) => JSON.stringify(v);
let failures = 0;
const check = (label, ok, extra = '') => { if (!ok) failures++; console.log(`${ok ? 'OK   ' : 'ECHEC'} ${label}${extra ? ' — ' + String(typeof extra === 'string' ? extra : J(extra)).slice(0, 1200) : ''}`); };
(async () => {
  const { browser, ctx } = await L.launch(); const errors = [];
  const p = await L.openSurvival(ctx, '?seed=12345', errors);
  await p.evaluate(async () => {
    const urls = performance.getEntriesByType('resource').map((e) => e.name);
    window.__toScreen = (x, z, y) => { const v = new window.THREE.Vector3(x, y ?? window.__S.surfaceY(x, z), z).project(window.__R.camera); return { x: (v.x * 0.5 + 0.5) * innerWidth, y: (-v.y * 0.5 + 0.5) * innerHeight }; };
    window.__hero = () => window.__world.entities.find((e) => e.hero);
    window.__SB = await import(urls.find((n) => n.includes('/src/config/startingBase.ts')));
    window.__layout = window.__SB.startingBaseLayoutOf((window.__maps ?? []).at(-1));
    window.__RES = await import(urls.find((n) => n.includes('/src/data/resources.ts')));
    // Villageois du camp (autonomes depuis le 2026-11-05, G42 ; sources du camp visibles et proches, G43) tenus
    // inactifs : les quantites des sources et le stock ne doivent bouger que par le test (ordres manuels respectes).
    const w = window.__world; const vils = w.entities.filter((e) => e.worker && e.alive);
    w.issueCommand({ kind: 'stop', entityIds: vils.map((e) => e.id) });
    for (const e of vils) { e.worker.autoRetryIn = 1e9; e.cargo.wood = e.cargo.stone = e.cargo.minedGold = 0; }
  });
  const NB_TREES = await p.evaluate(() => window.__SB.getStartingBasePreset('basic-camp').trees.length);
  const GOLD_AMOUNT = await p.evaluate(() => window.__RES.HARVEST_NODE_KINDS.gold.amount);
  const camp = await p.evaluate(() => {
    const w = window.__world; const L = window.__layout; const h = window.__hero();
    const b = (id) => w.entities.filter((e) => e.alive && e.team === 'player' && e.unitId === id);
    const walls = w.entities.filter((e) => e.alive && e.wall);
    const v = window.__R.getViewState();
    return {
      layout: L ? { rotation: L.rotation, origin: L.origin } : null,
      ballista: b('ballista').length, tavern: b('tavern').length,
      houses: b('house').map((e) => e.footprintObstacle?.buildingModel), houseBuilt: b('house').every((e) => e.construction === null),
      villagers: w.entities.filter((e) => e.alive && e.unitId === 'villageois').length,
      walls: walls.length, gates: walls.filter((e) => e.wall.door).map((e) => e.wall.door.open),
      // Gisements et bosquet garantis du camp (2026-11-05) : sources dans l'enceinte (1 or, 1 pierre, >= 6 arbres).
      deposits: [...w.resourceNodes.values()].filter((n) => Math.hypot(n.x - L.origin.x, n.z - L.origin.z) < 15).map((n) => n.resource).sort(),
      // Quantites initiales (75 / 250 / 250, data/resources.ts) : les Villageois autonomes ont pu entamer une source
      // d'une ou deux unites avant d'etre arretes.
      amounts: Object.fromEntries([...w.resourceNodes.values()].filter((n) => Math.hypot(n.x - L.origin.x, n.z - L.origin.z) < 15).map((n) => [n.resource, w.resourceNodeAmounts.get(n.id)])),
      hero: { x: +h.x.toFixed(2), z: +h.z.toFixed(2), inside: h.x > L.bounds.minX && h.x < L.bounds.maxX && h.z > L.bounds.minZ && h.z < L.bounds.maxZ },
      pop: document.querySelector('.economy-hud-item--pop')?.textContent ?? '', stock: window.arrowEconomy.stock(),
      cam: { dx: +(v.targetX - h.x).toFixed(2), dz: +(v.targetZ - h.z).toFixed(2) },
    };
  });
  check(`run reelle : 1 Baliste, 1 Auberge, 2 Maisons terminees (A puis B), 2 Villageois, enceinte arrondie de 36 pieces dont 4 portes posees FERMEES en mode automatique (2026-11-08 ; ouvertes de G48 a G50) ; 1 or (250) + 1 pierre (250) + ${NB_TREES} arbres (75, >= 6) dans l enceinte ; Heros dans le camp ; Pop. 2 / 15 ; stock de depart inchange (0 bois, 0 pierre, 20 or) ; camera centree sur le Heros`,
    camp.layout && NB_TREES >= 6 && J(camp.deposits) === J(['gold', 'stone', ...Array(NB_TREES).fill('wood')]) && 250 - camp.amounts.gold <= 3 && 250 - camp.amounts.stone <= 3 && 75 - camp.amounts.wood <= 3 && camp.ballista === 1 && camp.tavern === 1 && J(camp.houses) === J(['blue_home_A', 'blue_home_B']) && camp.houseBuilt && camp.villagers === 2 && camp.walls === 36 && J(camp.gates) === '[false,false,false,false]' && camp.hero.inside && /2\s*\/\s*15/.test(camp.pop) && camp.stock.wood === 0 && camp.stock.stone === 0 && camp.stock.gold === 20 && Math.hypot(camp.cam.dx, camp.cam.dz) < 1.5, camp);
  const o = camp.layout.origin;
  await L.wait(p, 800);
  await L.setView(p, { targetX: o.x, targetZ: o.z, viewHeight: 32, yawDeg: 45, pitchDeg: 55 }); await L.wait(p, 900);
  await p.screenshot({ path: OUT + 'depart-camp-run.png' });
  // Vue de dessus, semi-dezoomee (addendum : ressenti de l'enceinte arrondie).
  await L.setView(p, { targetX: o.x, targetZ: o.z, viewHeight: 36, yawDeg: 0, pitchDeg: 82 }); await L.wait(p, 900);
  await p.screenshot({ path: OUT + 'depart-camp-dessus.png' });
  await L.setView(p, { targetX: o.x, targetZ: o.z + 2, viewHeight: 13, yawDeg: 20, pitchDeg: 45 }); await L.wait(p, 700);
  await p.screenshot({ path: OUT + 'depart-camp-proche.png' });

  // Production d'un Villageois a l'Hotel de ville (fiche ; 2026-11-08 : l'Auberge ne produit plus).
  const tav = await p.evaluate(() => { const t = window.__world.entities.find((e) => e.unitId === 'townhall'); return { x: t.x, z: t.z }; });
  await L.setView(p, { targetX: tav.x, targetZ: tav.z, viewHeight: 12, yawDeg: 45, pitchDeg: 55 }); await L.wait(p, 400);
  const ts = await p.evaluate((t) => window.__toScreen(t.x, t.z, window.__S.surfaceY(t.x, t.z) + 1.0), tav);
  await p.mouse.click(ts.x, ts.y); await L.wait(p, 400);
  const actions = await p.evaluate(() => [...document.querySelectorAll('.entity-info-action')].map((b) => ({ id: b.dataset.action, text: b.textContent, disabled: b.disabled })));
  const prod = await p.$('.entity-info-action[data-action^="produce"]') ?? await p.$('.entity-info-action:has-text("Villageois")');
  if (prod) await prod.click();
  let villagers = 2;
  for (let i = 0; i < 40 && villagers < 3; i++) { await L.wait(p, 400); villagers = await p.evaluate(() => window.__world.entities.filter((e) => e.alive && e.unitId === 'villageois').length); }
  const pop2 = await p.evaluate(() => document.querySelector('.economy-hud-item--pop')?.textContent ?? '');
  check('fiche de l Hotel de ville : produire un Villageois -> 3e Villageois sorti, Pop. 3 / 15', !!prod && villagers === 3 && /3\s*\/\s*15/.test(pop2), { actions, villagers, pop2 });

  // Sortie par la porte : Heros et les 2 Villageois de depart.
  const exitPt = await p.evaluate(() => { const L = window.__layout; const g = L.walls.find((w) => w.gates); const mx = (g.ax + g.bx) / 2, mz = (g.az + g.bz) / 2; const dx = mx - L.origin.x, dz = mz - L.origin.z; const n = Math.hypot(dx, dz); return { x: mx + (dx / n) * 5, z: mz + (dz / n) * 5 }; });
  await p.evaluate((e) => { const w = window.__world; const ids = w.entities.filter((x) => x.alive && (x.hero || x.unitId === 'villageois')).map((x) => x.id); w.issueCommand({ kind: 'move', entityIds: ids, x: e.x, z: e.z }); }, exitPt);
  let out = null;
  for (let i = 0; i < 40; i++) { await L.wait(p, 300); out = await p.evaluate(() => { const L = window.__layout; return window.__world.entities.filter((x) => x.alive && (x.hero || x.unitId === 'villageois')).map((x) => !(x.x > L.bounds.minX && x.x < L.bounds.maxX && x.z > L.bounds.minZ && x.z < L.bounds.maxZ)); }); if (out.every(Boolean)) break; }
  await L.setView(p, { targetX: exitPt.x, targetZ: exitPt.z, viewHeight: 16, yawDeg: 45, pitchDeg: 55 }); await L.wait(p, 500);
  await p.screenshot({ path: OUT + 'depart-sortie.png' });
  check('Heros et Villageois (3) sortent du camp par la porte (fermee au depart, elle s ouvre devant eux)', out.length === 4 && out.every(Boolean), out);

  // Recolte libre, sans Forge : Villageois -> arbre, Heros -> pierre.
  const harvest = await p.evaluate(async () => {
    const w = window.__world; const h = window.__hero();
    const v = w.entities.find((x) => x.alive && x.unitId === 'villageois');
    const near = (res, from) => [...w.resourceNodes.values()].filter((n) => n.resource === res && !w.depletedResourceNodes.has(n.id)).sort((a, b) => Math.hypot(a.x - from.x, a.z - from.z) - Math.hypot(b.x - from.x, b.z - from.z))[0];
    const tree = near('wood', v); const rock = near('stone', h);
    w.issueCommand({ kind: 'harvest', entityIds: [v.id], nodeId: tree.id });
    w.issueCommand({ kind: 'harvest', entityIds: [h.id], nodeId: rock.id });
    const forges = w.entities.filter((x) => x.alive && x.unitId === 'forge').length;
    return { forges, tools: w.harvestPermissions.tools, tree: tree.id, rock: rock.id, vid: v.id };
  });
  let got = null;
  for (let i = 0; i < 80; i++) { await L.wait(p, 300); got = await p.evaluate((vid) => { const v = window.__world.getById(vid); const h = window.__hero(); return { wood: v.cargo.wood, stone: h.cargo.stone, vTool: window.__uv?.views?.get(vid)?.userData?.toonTool ?? null }; }, harvest.vid); if (got.wood >= 1 && got.stone >= 1) break; }
  check('sans Forge : outils de depart (hache, pioche) ; Villageois coupe du bois, Heros extrait de la pierre', harvest.forges === 0 && J(harvest.tools) === J(['axe', 'pickaxe']) && got.wood >= 1 && got.stone >= 1, { harvest, got });

  // Clic droit sur un gisement d'or (Heros selectionne) : recolte directe, sans Forge ni message (2026-11-05, G37).
  // Heros pose a 3 cases du gisement (vue degagee : le plus proche du camp peut etre masque par des arbres).
  const gold = await p.evaluate(() => { const w = window.__world; const h = window.__hero(); const g = [...w.resourceNodes.values()].filter((n) => n.resource === 'gold').sort((a, b) => Math.hypot(a.x - h.x, a.z - h.z) - Math.hypot(b.x - h.x, b.z - h.z))[0]; w.issueCommand({ kind: 'stop', entityIds: [h.id] }); h.x = h.prevX = g.x + 3; h.z = h.prevZ = g.z; return { x: g.x, z: g.z, id: g.id, reste: w.resourceNodeAmounts.get(g.id) }; });
  await p.keyboard.press('Space'); await L.wait(p, 300);
  await L.setView(p, { targetX: gold.x, targetZ: gold.z, viewHeight: 12, yawDeg: 45, pitchDeg: 55 }); await L.wait(p, 500);
  const gs = await p.evaluate((g) => window.__toScreen(g.x, g.z, window.__S.surfaceY(g.x, g.z) + 0.6), gold);
  const noticesBefore = await p.evaluate(() => document.querySelector('.wave-indicator-notice')?.textContent ?? '');
  await p.mouse.move(gs.x, gs.y); await L.wait(p, 100); await p.mouse.click(gs.x, gs.y, { button: 'right' }); await L.wait(p, 300);
  let mined = null;
  for (let i = 0; i < 40; i++) { await L.wait(p, 300); mined = await p.evaluate((g) => { const h = window.__hero(); return { order: h.order.type, gold: h.cargo.minedGold, reste: window.__world.resourceNodeAmounts.get(g.id), forges: window.__world.entities.filter((x) => x.alive && x.unitId === 'forge').length, msg: document.querySelector('.wave-indicator-notice')?.textContent ?? '' }; }, gold); if (mined.gold >= 1) break; }
  check('clic droit sur un gisement d or sans Forge : le Heros l extrait (ordre de recolte, or dans le cargo, gisement decompte), aucun message « il faut une Forge »', mined.forges === 0 && mined.gold >= 1 && mined.reste === gold.reste - mined.gold && gold.reste <= GOLD_AMOUNT && !/Forge|prospecteur/.test(mined.msg) && !/Forge|prospecteur/.test(noticesBefore), mined);

  // Ennemi devant la porte ouverte : n'entre pas.
  const foe = await p.evaluate((e) => { const w = window.__world; const L = window.__layout; const f = w.spawn('maraudeur', 'enemy', e.x, e.z); f.order = { type: 'move', x: L.origin.x, z: L.origin.z + 2 }; return f.id; }, exitPt);
  let entered = false; let closedSeen = false;
  for (let i = 0; i < 20; i++) { await L.wait(p, 300); const s = await p.evaluate((id) => { const L = window.__layout; const f = window.__world.getById(id); const gate = window.__world.entities.find((x) => x.wall?.door); return { inside: f.alive && f.x > L.bounds.minX + 0.4 && f.x < L.bounds.maxX - 0.4 && f.z > L.bounds.minZ + 0.4 && f.z < L.bounds.maxZ - 0.4, gate: gate?.alive && gate.wall.door.open }; }, foe); if (s.inside) entered = true; if (!s.gate) closedSeen = true; }
  check('Maraudeur devant la porte : elle se ferme d elle-meme, il n entre pas dans le camp', !entered && closedSeen, { entered, closedSeen });

  // Baliste detruite : defaite (regle inchangee).
  await p.evaluate(() => { const b = window.__world.entities.find((e) => e.unitId === 'ballista'); b.hp = 0; });
  let defeat = null;
  for (let i = 0; i < 30 && !defeat; i++) { await L.wait(p, 150); const t = await p.evaluate(() => ({ text: document.querySelector('.wave-transition-banner')?.textContent ?? '', ballista: window.__world.entities.find((e) => e.unitId === 'ballista')?.alive ?? false, houses: window.__world.entities.filter((e) => e.alive && e.unitId === 'house').length })); if (/Défaite/.test(t.text)) defeat = { ...t, text: (t.text.match(/[^.]{0,40}Défaite[^.]{0,40}/) ?? [''])[0] }; }
  check('Baliste detruite : « Défaite » aussitot, Maisons encore debout (les Maisons, l Auberge et la palissade n y changent rien)', !!defeat && defeat.ballista === false && defeat.houses === 2, defeat);

  if (errors.length) { failures++; console.log('ERREURS', errors.join(' / ').slice(0, 1200)); }
  console.log(failures ? failures + ' ECHEC(S)' : 'tout OK');
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
