// Test EN JEU du modele d'ameliorations de la Pass 2 (2026-11-05) : chantier de Forge pose par le menu Construire et
// bati par le Heros ; fiche de la Forge : plus d'ecran modal ni d'« Ouvrir la Forge », deux recherches (Armes / Armures
// forgees I) avec cout et duree ; « Rechercher » : or ET stock debites, commande en file, la simulation CONTINUE ;
// a la fin : « Terminé », Archer deja present ameliore (+10 % degats), Heros inchange ; Baliste : « Améliorer Niv. 2 »
// depuis sa fiche (1 or, 20 s), niveau et PV max appliques ; Camp d'archerie : fiche « Niv. 2 | Archers : +2 PV, +1
// dégâts », amelioration par la file ; aucun clic ne fige le jeu.
// Usage : npm run test:game (ou VITE_BASE=http://localhost:5174/ node tests/game/forge-jeu.cjs)
const L = require('./lib.cjs');
const OUT = L.OUT;
const J = (v) => JSON.stringify(v);
let failures = 0;
const check = (label, ok, extra = '') => { if (!ok) failures++; console.log(`${ok ? 'OK   ' : 'ECHEC'} ${label}${extra ? ' — ' + String(typeof extra === 'string' ? extra : J(extra)).slice(0, 900) : ''}`); };
(async () => {
  const { browser, ctx } = await L.launch(); const errors = [];
  const p = await L.openSurvival(ctx, '?seed=12345', errors);
  await p.evaluate(() => {
    window.__toScreen = (x, z, y) => { const v = new window.THREE.Vector3(x, y ?? window.__S.surfaceY(x, z), z).project(window.__R.camera); return { x: (v.x * 0.5 + 0.5) * innerWidth, y: (-v.y * 0.5 + 0.5) * innerHeight }; };
    window.__hero = () => window.__world.entities.find((e) => e.hero);
    window.arrowEconomy.set({ gold: 200, wood: 100, stone: 100 });
    for (const e of window.__world.entities) if (e.team === 'enemy') e.stats.damage = 0;
    // Villageois du camp (autonomes depuis le 2026-11-05) tenus inactifs : le stock ne doit bouger que par le test.
    const vils = window.__world.entities.filter((e) => e.worker).map((e) => e.id);
    window.__world.issueCommand({ kind: 'stop', entityIds: vils });
    for (const e of window.__world.entities) if (e.worker) { e.worker.autoRetryIn = 1e9; e.cargo.wood = e.cargo.stone = e.cargo.minedGold = 0; }
  });
  const at = (x, z, y) => p.evaluate(([x, z, y]) => window.__toScreen(x, z, y), [x, z, y]);
  const stock = () => p.evaluate(() => window.arrowEconomy.stock());
  const tick = () => p.evaluate(() => window.__world.tick);
  const fiche = () => p.evaluate(() => ({
    title: document.querySelector('.entity-info:not([hidden]) .entity-info-title')?.textContent ?? null,
    rows: [...document.querySelectorAll('.entity-info:not([hidden]) .entity-info-row')].map((r) => r.textContent.replace(/\s+/g, ' ').trim()),
    actions: [...document.querySelectorAll('.entity-info:not([hidden]) .entity-info-action')].map((a) => ({ a: a.dataset.action, t: a.textContent, off: a.disabled })),
  }));
  const clickEntity = async (e) => { await L.setView(p, { targetX: e.x, targetZ: e.z, viewHeight: 12, yawDeg: 45, pitchDeg: 55 }); await L.wait(p, 400); const s = await at(e.x, e.z, await p.evaluate((f) => window.__S.surfaceY(f.x, f.z) + 1.0, e)); await p.mouse.click(s.x, s.y); await L.wait(p, 400); };
  const b = await p.evaluate(() => { const b = window.__world.entities.find((e) => e.unitId === 'ballista'); return { x: b.x, z: b.z }; });

  /** Pose un chantier `name` par le menu Construire autour de la Baliste, attend que le Heros le batisse. */
  const build = async (name, unitId, spots) => {
    await L.setView(p, { targetX: b.x, targetZ: b.z + 3, viewHeight: 16, yawDeg: 45, pitchDeg: 55 }); await L.wait(p, 400);
    await p.keyboard.press('Space'); await L.wait(p, 300);
    await p.click('.build-menu-button'); await L.wait(p, 400);
    await p.click(`.build-menu-item:has-text("${name}")`); await L.wait(p, 300);
    let e = null;
    for (const [dx, dz] of spots) {
      const s = await at(b.x + dx, b.z + dz);
      await p.mouse.move(s.x, s.y, { steps: 3 }); await L.wait(p, 200);
      await p.mouse.click(s.x, s.y); await L.wait(p, 300);
      e = await p.evaluate((u) => { const f = window.__world.entities.find((x) => x.unitId === u && x.team === 'player'); return f ? { id: f.id, x: f.x, z: f.z, chantier: !!f.construction } : null; }, unitId);
      if (e) break;
    }
    if (!e) return null;
    let built = false;
    for (let i = 0; i < 100 && !built; i++) { await L.wait(p, 400); built = await p.evaluate((id) => { const f = window.__world.getById(id); return !!f && f.alive && f.construction === null; }, e.id); }
    return built ? e : null;
  };

  // 1. Forge batie ; aucun ecran modal de Forge n'existe plus.
  const forge = await build('Forge', 'forge', [[-4, 5], [4, 5], [-5, 3], [5, 3], [0, 6]]);
  const s1 = await stock();
  check('menu Construire : Forge posee et batie par le Heros (10 or, 5 bois, 5 pierre debites) ; plus aucun ecran « unit-upgrade-shop » dans la page', !!forge && s1.gold === 190 && s1.wood === 95 && s1.stone === 95 && (await p.evaluate(() => document.querySelector('.screen-unit-upgrade-shop') === null)), { forge, s1 });

  // 2. Fiche de la Forge : deux recherches, cout et duree, aucune action « openForge ».
  const archer = await p.evaluate((b) => { const w = window.__world; const e = w.spawn('archer', 'player', b.x + 2, b.z + 2); e.order = { type: 'guard' }; return { id: e.id, dmg: e.stats.damage, max: e.stats.maxHp }; }, b);
  await clickEntity(forge);
  const f1 = await fiche();
  const weapons = f1.actions.find((a) => a.a === 'research' && /Armes forgées I/.test(a.t));
  const armor = f1.actions.find((a) => a.a === 'research' && /Armures forgées I/.test(a.t));
  check('fiche de la Forge : « Rechercher : Armes forgées I — 20 or, 10 bois, 5 pierre · 30 s » et « Armures forgées I — 20 or, 5 bois, 10 pierre · 30 s », actives ; aucune action « openForge »',
    /Forge/.test(f1.title ?? '') && !!weapons && !weapons.off && /20 or, 10 bois, 5 pierre · 30 s/.test(weapons.t) && !!armor && !armor.off && /20 or, 5 bois, 10 pierre · 30 s/.test(armor.t) && !f1.actions.some((a) => a.a === 'openForge'), f1);

  // 3. Rechercher Armes forgees I : paye, en file, la simulation continue.
  await p.click('.entity-info:not([hidden]) .entity-info-action[data-action="research"]:has-text("Armes forgées")'); await L.wait(p, 300);
  const s2 = await stock();
  const t0 = await tick(); await L.wait(p, 700); const t1 = await tick();
  const f2 = await fiche();
  const order = await p.evaluate((id) => window.__world.getById(id).productionOrders.map((o) => ({ kind: o.kind, techId: o.techId, total: o.total })), forge.id);
  await p.screenshot({ path: OUT + 'forge-recherche.png' });
  check('« Rechercher » : 20 or, 10 bois, 5 pierre debites (190/95/95 -> 170/85/90) ; commande « research » de 30 s en file ; fiche « Armes forgées I : En recherche » + « 1. Armes forgées I — N s ✕ » ; la simulation CONTINUE (aucun ecran, tick qui avance)',
    s2.gold === 170 && s2.wood === 85 && s2.stone === 90 && J(order) === J([{ kind: 'research', techId: 'forge_weapons', total: 30 }]) && t1 > t0 && f2.rows.some((r) => /Armes forgées I.*En recherche/.test(r)) && f2.actions.some((a) => a.a === 'cancelProduction' && /1\. Armes forgées I — \d+ s/.test(a.t)) && !(await p.evaluate(() => document.querySelector('.screen-overlay--visible') !== null)), { s2, order, t0, t1, f2 });

  // 4. Fin de la recherche : Terminé, Archer present ameliore, Heros inchange.
  let done = false;
  for (let i = 0; i < 90 && !done; i++) { await L.wait(p, 400); done = await p.evaluate((id) => window.__world.getById(id).productionOrders.length === 0, forge.id); }
  await L.wait(p, 300);
  const after = await p.evaluate((id) => { const a = window.__world.getById(id); const h = window.__hero(); return { dmg: a.stats.damage, max: a.stats.maxHp, hero: h.stats.damage, heroMax: h.stats.maxHp }; }, archer.id);
  await clickEntity(forge);
  const f3 = await fiche();
  check('30 s plus tard : « Armes forgées I : Terminé — Unités militaires : +10 % dégâts » ; l Archer deja present passe de 1,2 a 1,3 degats (PV intacts) ; Heros inchange (25 degats, 30 PV)',
    done && f3.rows.some((r) => /Armes forgées I.*Terminé/.test(r)) && !f3.actions.some((a) => /Armes forgées/.test(a.t)) && after.dmg === Math.round(archer.dmg * 1.1) && after.max === archer.max && after.hero === 25 && after.heroMax === 300, { after, archer, rows: f3.rows });

  // 5. Baliste : amelioration depuis sa fiche, par sa file ; le jeu continue.
  await clickEntity(b);
  const bf = await fiche();
  const up = bf.actions.find((a) => a.a === 'upgradeBallista');
  const sb = await stock();
  await p.click('.entity-info:not([hidden]) .entity-info-action[data-action="upgradeBallista"]'); await L.wait(p, 300);
  const sb2 = await stock();
  const tb0 = await tick(); await L.wait(p, 700); const tb1 = await tick();
  const bq = await p.evaluate(() => window.__world.entities.find((e) => e.unitId === 'ballista').productionOrders.map((o) => o.kind));
  check('fiche de la Baliste : « Améliorer Niv. 2 — 1 or · 20 s » (ligne Niv. 2 : +10 PV, +20 % cadence) ; clic : 1 or debite, commande « upgrade » en file, simulation en marche',
    /Baliste/.test(bf.title ?? '') && !!up && /Améliorer Niv\. 2 — 1 or · 20 s/.test(up.t) && bf.rows.some((r) => /Niv\. 2.*\+10 PV, \+20 % cadence/.test(r)) && sb2.gold === sb.gold - 1 && J(bq) === J(['upgrade']) && tb1 > tb0, { up, rows: bf.rows, sb, sb2, bq });
  let bdone = false;
  for (let i = 0; i < 70 && !bdone; i++) { await L.wait(p, 400); bdone = await p.evaluate(() => window.__world.entities.find((e) => e.unitId === 'ballista').productionOrders.length === 0); }
  await clickEntity(b);
  const bf2 = await fiche();
  const bal = await p.evaluate(() => { const e = window.__world.entities.find((x) => x.unitId === 'ballista'); return { max: e.stats.maxHp, hp: e.hp }; });
  check('20 s plus tard : « Baliste — Niv. 2 », PV max 35 (25 + 10), prochain niveau « 2 or »', bdone && /Baliste — Niv\. 2/.test(bf2.title ?? '') && bal.max === 350 && bal.hp === 350 && bf2.actions.some((a) => a.a === 'upgradeBallista' && /Niv\. 3 — 2 or/.test(a.t)), { bf2: bf2.title, bal, actions: bf2.actions });

  // 6. Camp d'archerie : fiche du Niv. 2 et amelioration par la file (retroactive sur l'Archer present).
  await p.evaluate(() => window.arrowEconomy.set({ gold: 200, wood: 100, stone: 100 }));
  const archery = await build('Camp d’archerie', 'archery', [[-6, 6], [6, 6], [-7, 2], [7, 2], [0, 8], [-3, 8], [3, 8]]);
  if (archery) await clickEntity(archery);
  const af = archery ? await fiche() : null;
  const upA = af?.actions.find((a) => a.a === 'upgradeBuilding');
  check('fiche du Camp d archerie : « Niv. 2 | Archers : +2 PV, +1 dégâts » et « Améliorer Niv. 2 — 20 or · 20 s » ; « Produire : Archer — 3 or · 9 s »', !!archery && !!upA && /Améliorer Niv\. 2 — 20 or · 20 s/.test(upA.t) && af.rows.some((r) => /Niv\. 2.*Archers : \+2 PV, \+1 dégâts/.test(r)) && af.actions.some((a) => a.a === 'produceUnit' && /Archer — 3 or · 9 s/.test(a.t)), af);
  if (upA) {
    const before = await p.evaluate((id) => { const a = window.__world.getById(id); return { dmg: a.stats.damage, max: a.stats.maxHp, hp: a.hp }; }, archer.id);
    await p.click('.entity-info:not([hidden]) .entity-info-action[data-action="upgradeBuilding"]'); await L.wait(p, 300);
    const ta0 = await tick(); await L.wait(p, 700); const ta1 = await tick();
    let adone = false;
    for (let i = 0; i < 70 && !adone; i++) { await L.wait(p, 400); adone = await p.evaluate((id) => window.__world.getById(id).productionOrders.length === 0, archery.id); }
    const afterA = await p.evaluate((id) => { const a = window.__world.getById(id); return { dmg: a.stats.damage, max: a.stats.maxHp, hp: a.hp }; }, archer.id);
    await clickEntity(archery);
    const af2 = await fiche();
    check('Camp d archerie Niv. 2 par la file (20 s, jeu en marche) : l Archer present gagne +2 PV max (3 -> 5, PV actuels a la meme fraction) et +1 degats (x1,1 des Armes forgees) ; fiche « Camp d’archerie — Niv. 2 », « Niveau maximum »',
      adone && ta1 > ta0 && afterA.max === before.max + 20 && afterA.hp === Math.round((before.hp * (before.max + 20)) / before.max) && afterA.dmg === Math.round((before.dmg / 1.1 + 10) * 1.1) && /Niv\. 2/.test(af2.title ?? '') && af2.rows.some((r) => /Niveau maximum/.test(r)), { before, afterA, title: af2.title });
  }

  check('aucune erreur de page', errors.length === 0, errors.slice(0, 3));
  console.log(failures ? failures + ' ECHEC(S)' : 'tout OK');
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
