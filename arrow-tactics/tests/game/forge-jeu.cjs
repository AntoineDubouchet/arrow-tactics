// Test EN JEU de la Forge (passe de modernisation 1, 2026-11-04) : chantier de Forge pose par le menu Construire, bati
// par le Heros ; fiche de la Forge -> « Ouvrir la Forge » -> ecran des ameliorations de run (temps fige), cartes des
// unites + Baliste seulement (aucune carte de parchemin) ; achat d'un niveau de Baliste en jeu (or debite, niveau
// affiche) ; Echap referme et le temps repart. Le Sanctuaire n'offre plus d'ameliorations.
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
  });
  const at = (x, z, y) => p.evaluate(([x, z, y]) => window.__toScreen(x, z, y), [x, z, y]);
  const overlay = (name) => p.evaluate((n) => !!document.querySelector(`.screen-${n}.screen-overlay--visible`), name);

  // 1. Chantier de Forge par le menu Construire, dans la cour du camp (sud de la Baliste).
  const b = await p.evaluate(() => { const b = window.__world.entities.find((e) => e.unitId === 'ballista'); return { x: b.x, z: b.z }; });
  await L.setView(p, { targetX: b.x, targetZ: b.z + 3, viewHeight: 16, yawDeg: 45, pitchDeg: 55 }); await L.wait(p, 500);
  await p.keyboard.press('Space'); await L.wait(p, 300);
  await p.click('.build-menu-button'); await L.wait(p, 400);
  const items = await p.evaluate(() => [...document.querySelectorAll('.build-menu-item')].map((i) => ({ name: i.querySelector('.build-menu-name')?.textContent, disabled: i.disabled })));
  await p.click('.build-menu-item:has-text("Forge")'); await L.wait(p, 300);
  let forge = null;
  for (const [dx, dz] of [[-4, 5], [4, 5], [-5, 3], [5, 3], [0, 6]]) {
    const s = await at(b.x + dx, b.z + dz);
    await p.mouse.move(s.x, s.y, { steps: 3 }); await L.wait(p, 200);
    await p.mouse.click(s.x, s.y); await L.wait(p, 300);
    forge = await p.evaluate(() => { const f = window.__world.entities.find((e) => e.unitId === 'forge' && e.team === 'player'); return f ? { id: f.id, x: f.x, z: f.z, chantier: !!f.construction } : null; });
    if (forge) break;
  }
  const goldAfterPlace = (await p.evaluate(() => window.arrowEconomy.stock())).gold;
  check('menu Construire : la Forge se pose en chantier dans la cour (10 or debites : 200 -> 190)', items.some((i) => i.name === 'Forge') && !!forge?.chantier && goldAfterPlace === 190, { items, forge, goldAfterPlace });

  // 2. Le Heros la construit (ordre automatique).
  let built = false;
  for (let i = 0; i < 80 && !built; i++) { await L.wait(p, 400); built = await p.evaluate((id) => { const f = window.__world.getById(id); return !!f && f.alive && f.construction === null; }, forge.id); }
  check('le Heros bâtit la Forge (chantier termine en moins de 32 s)', built);

  // 3. Fiche de la Forge -> « Ouvrir la Forge » : ecran, temps fige, cartes.
  await L.setView(p, { targetX: forge.x, targetZ: forge.z, viewHeight: 12, yawDeg: 45, pitchDeg: 55 }); await L.wait(p, 400);
  const fs = await at(forge.x, forge.z, await p.evaluate((f) => window.__S.surfaceY(f.x, f.z) + 1.0, forge));
  await p.mouse.click(fs.x, fs.y); await L.wait(p, 500);
  const fiche = await p.evaluate(() => ({ title: document.querySelector('.entity-info:not([hidden]) .entity-info-title')?.textContent ?? null, actions: [...document.querySelectorAll('.entity-info:not([hidden]) .entity-info-action')].map((a) => ({ a: a.dataset.action, t: a.textContent, off: a.disabled })) }));
  const openBtn = await p.$('.entity-info-action[data-action="openForge"]');
  if (openBtn) await openBtn.click();
  await L.wait(p, 400);
  const t0 = await p.evaluate(() => window.__world.tick); await L.wait(p, 700);
  const t1 = await p.evaluate(() => window.__world.tick);
  const screen = await p.evaluate(() => ({ visible: !!document.querySelector('.screen-unit-upgrade-shop.screen-overlay--visible'), title: document.querySelector('.screen-unit-upgrade-shop .screen-title')?.textContent, cards: [...document.querySelectorAll('.screen-unit-upgrade-shop .upgrade-card')].map((c) => c.querySelector('.upgrade-card-name')?.textContent) }));
  await p.screenshot({ path: OUT + 'forge-ecran.png' });
  check('fiche de la Forge : « Ouvrir la Forge » -> ecran Forge, temps fige, cartes Homme d armes / Archer / Mage / Sentinelle / Baliste, aucune carte de parchemin',
    /Forge/.test(fiche.title ?? '') && !!openBtn && screen.visible && screen.title === 'Forge' && t1 === t0 && screen.cards.length === 5 && screen.cards.includes('Baliste') && !screen.cards.some((n) => /Parchemin|Nova|excédentaires/.test(n ?? '')), { fiche, screen, t0, t1 });

  // 4. Achat d'un niveau de Baliste en jeu : or debite (1), niveau affiche.
  const goldBefore = (await p.evaluate(() => window.arrowEconomy.stock())).gold;
  const ballistaCard = p.locator('.screen-unit-upgrade-shop .upgrade-card', { has: p.locator('.upgrade-card-name', { hasText: 'Baliste' }) });
  const levelBefore = await ballistaCard.locator('.upgrade-card-line').first().textContent();
  await ballistaCard.locator('.upgrade-card-button').click(); await L.wait(p, 300);
  const levelAfter = await ballistaCard.locator('.upgrade-card-line').first().textContent();
  const goldAfter = (await p.evaluate(() => window.arrowEconomy.stock())).gold;
  check('achat Baliste en jeu : « Niveau : 1 » -> « Niveau : 2 », 1 or debite (la garde de preparation qui refusait tout achat en Survie est retiree)', levelBefore === 'Niveau : 1' && levelAfter === 'Niveau : 2' && goldAfter === goldBefore - 1, { levelBefore, levelAfter, goldBefore, goldAfter });

  // 5. Echap referme, le temps repart.
  await p.keyboard.press('Escape'); await L.wait(p, 300);
  const t2 = await p.evaluate(() => window.__world.tick); await L.wait(p, 700);
  const t3 = await p.evaluate(() => window.__world.tick);
  check('Echap : ecran ferme, la simulation repart', !(await overlay('unit-upgrade-shop')) && t3 > t2, { t2, t3 });

  // 6. Sanctuaire : fiche sans action d'ameliorations de parchemins.
  const shrine = await p.evaluate((b) => {
    const w = window.__world; const urls = performance.getEntriesByType('resource').map((e) => e.name);
    return import(urls.find((n) => n.includes('/src/data/buildings.ts'))).then((B) => {
      const d = B.getBuilding('shrine'); const x = Math.floor(b.x) - 6, z = Math.floor(b.z) + 6;
      const e = w.spawnBuilding(d, 'player', x, z, { kind: 'building', x, z, tilesX: d.footprintTilesX, tilesZ: d.footprintTilesZ });
      return { id: e.id, x: e.x, z: e.z };
    });
  }, b);
  await L.setView(p, { targetX: shrine.x, targetZ: shrine.z, viewHeight: 12, yawDeg: 45, pitchDeg: 55 }); await L.wait(p, 500);
  const ss = await at(shrine.x, shrine.z, await p.evaluate((s) => window.__S.surfaceY(s.x, s.z) + 1.0, shrine));
  await p.mouse.click(ss.x, ss.y); await L.wait(p, 500);
  const shrineFiche = await p.evaluate(() => ({ title: document.querySelector('.entity-info:not([hidden]) .entity-info-title')?.textContent ?? null, rows: [...document.querySelectorAll('.entity-info:not([hidden]) .entity-info-row')].map((r) => r.textContent), actions: [...document.querySelectorAll('.entity-info:not([hidden]) .entity-info-action')].map((a) => a.dataset.action) }));
  check('fiche du Sanctuaire : aucune action « Parchemins du Sanctuaire », aucune mention de parchemin', /Sanctuaire/.test(shrineFiche.title ?? '') && !shrineFiche.actions.includes('openShrineUpgrades') && !shrineFiche.rows.some((r) => /parchemin|par manche/i.test(r ?? '')), shrineFiche);

  check('aucune erreur de page', errors.length === 0, errors.slice(0, 3));
  console.log(failures ? failures + ' ECHEC(S)' : 'tout OK');
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
