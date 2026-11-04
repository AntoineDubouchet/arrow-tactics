// Tests cibles EN JEU : pas de fiche pour le Heros seul (fiche pour une unite, un groupe, un batiment), boutons Soin et
// Inventaire du HUD, inventaire (touche I, bouton, Echap, contenu, mise a jour en direct, la partie continue), Soin
// lance depuis le HUD. Usage : npm run test:game (ou VITE_BASE=http://localhost:5174/ node tests/game/inventaire.cjs)
const L = require('./lib.cjs');
const OUT = require('./lib.cjs').OUT;
const J = (v) => JSON.stringify(v);
let failures = 0;
const check = (label, ok, extra = '') => { if (!ok) failures++; console.log(`${ok ? 'OK   ' : 'ECHEC'} ${label}${extra ? ' — ' + String(extra).slice(0, 900) : ''}`); };
(async () => {
  const { browser, ctx } = await L.launch(); const errors = [];
  const p = await L.openSurvival(ctx, '?seed=12345', errors);
  await p.evaluate(() => { window.__toScreen = (x, z, y) => { const v = new window.THREE.Vector3(x, y ?? window.__S.surfaceY(x, z), z).project(window.__R.camera); return { x: (v.x * 0.5 + 0.5) * innerWidth, y: (-v.y * 0.5 + 0.5) * innerHeight }; }; });
  const fiche = () => p.evaluate(() => { const el = document.querySelector('.entity-info'); if (!el || el.hidden || getComputedStyle(el).display === 'none' || el.getBoundingClientRect().width === 0) return null; return el.querySelector('.entity-info-title')?.textContent ?? '?'; });
  const inv = () => p.evaluate(() => { const el = document.querySelector('.hero-inventory'); return el && !el.hidden ? { titre: el.querySelector('.hero-inventory-title').textContent, texte: el.innerText } : null; });

  // ---- Heros seul : pas de fiche ; HUD avec Soin et Inventaire.
  await p.keyboard.press('Space'); await L.wait(p, 600);
  const heroSel = await p.evaluate(() => ({ sel: [...document.querySelectorAll('.selection-ring')].length, hud: [...document.querySelectorAll('.hud-inventory-button')].map((b) => ({ t: b.textContent, off: b.disabled })) }));
  const ficheHeros = await fiche();
  // Une unite alliee, puis un groupe Heros + unite (rectangle), puis la Baliste.
  const ally = await p.evaluate(() => { const h = window.__world.entities.find((e) => e.hero); const a = window.__world.spawn('fantassin', 'player', h.x + 1.5, h.z + 0.5); a.order = { type: 'guard' }; return a.id; });
  await L.wait(p, 300);
  const ap = await p.evaluate((id) => { const a = window.__world.getById(id); return window.__toScreen(a.x, a.z, window.__S.surfaceY(a.x, a.z) + 0.5); }, ally);
  await p.mouse.click(ap.x, ap.y); await L.wait(p, 500);
  const ficheUnite = await fiche();
  const hp = await p.evaluate(() => { const h = window.__world.entities.find((e) => e.hero); return window.__toScreen(h.x, h.z, window.__S.surfaceY(h.x, h.z) + 0.5); });
  await p.mouse.move(Math.min(hp.x, ap.x) - 60, Math.min(hp.y, ap.y) - 60); await p.mouse.down();
  await p.mouse.move(Math.max(hp.x, ap.x) + 60, Math.max(hp.y, ap.y) + 60, { steps: 8 }); await p.mouse.up(); await L.wait(p, 500);
  const ficheGroupe = await fiche();
  check('Heros seul selectionne : aucune fiche ; unite seule et groupe (Heros + Homme d armes) : fiche affichee ; HUD : bouton « Inventaire (I) » (le Soin est dans la barre d action)',
    ficheHeros === null && ficheUnite !== null && /Homme/.test(ficheUnite) && ficheGroupe !== null && heroSel.hud.some((b) => b.t === 'InventaireI'),
    J({ ficheHeros, ficheUnite, ficheGroupe, hud: heroSel.hud }));

  // ---- Inventaire : touche I, contenu, mise a jour en direct, partie qui continue, I / Echap / bouton.
  await p.keyboard.press('Space'); await L.wait(p, 200); await p.keyboard.press('Space'); await L.wait(p, 300);
  await p.keyboard.press('i'); await L.wait(p, 400);
  const ouvert = await inv();
  const tick0 = await p.evaluate(() => window.__world.tick);
  await p.evaluate(() => { const h = window.__world.entities.find((e) => e.hero); h.hero.mana = 7; h.hero.xp = 30; });
  await L.wait(p, 700);
  const apres = await inv();
  const tick1 = await p.evaluate(() => window.__world.tick);
  await p.screenshot({ path: OUT + 'inventaire.png' });
  check('touche I : inventaire ouvert (« Paladin — Niv. 1 ») : PV, Mana, Degats 2.5, Portee Melee, Cadence, Vitesse 5.8 (4,16 x 1,4 = 5,82 arrondi au dixieme, convention de la fiche), Experience, Sac ; Sorts : Soin ; Equipement : aucun (message)',
    ouvert && ouvert.titre === 'Paladin — Niv. 1' && /PV\s+30 \/ 30/.test(ouvert.texte) && /Mana\s+\d+ \/ 20 \(\+2 \/ s\)/.test(ouvert.texte) && /Dégâts\s+2\.5/.test(ouvert.texte) && /Portée\s+Mêlée/.test(ouvert.texte) && /Vitesse\s+5\.8 cases\/s/.test(ouvert.texte) && /Expérience\s+0 \/ 50 XP/.test(ouvert.texte) && /SORTS[\s\S]*Soin/.test(ouvert.texte) && /ÉQUIPEMENT[\s\S]*Main droite[\s\S]*Main gauche/.test(ouvert.texte) && /SAC \(0 \/ 20\)/.test(ouvert.texte),
    J(ouvert));
  check('inventaire mis a jour en direct (mana 7, XP 30) et la partie continue (temps de simulation qui avance)', apres && /Mana\s+[78] \/ 20/.test(apres.texte) && /Expérience\s+30 \/ 50 XP/.test(apres.texte) && tick1 > tick0, J({ apres: apres?.texte.slice(0, 200), tick0, tick1 }));
  await p.keyboard.press('i'); await L.wait(p, 300);
  const fermeI = await inv();
  await p.locator('.hud-inventory-button').click(); await L.wait(p, 300);
  const ouvertBouton = await inv();
  await p.keyboard.press('Escape'); await L.wait(p, 300);
  const fermeEchap = await inv();
  const pause = await p.evaluate(() => document.querySelectorAll('.screen-overlay--visible').length);
  check('I referme ; le bouton « Inventaire (I) » ouvre ; Echap referme sans ouvrir la pause', fermeI === null && ouvertBouton !== null && fermeEchap === null && pause === 0, J({ fermeI, ouvertBouton: !!ouvertBouton, fermeEchap, pause }));

  // ---- Soin depuis le HUD : bouton, puis clic sur le portrait (soi-meme).
  await p.evaluate(() => { const h = window.__world.entities.find((e) => e.hero); h.hp = h.stats.maxHp - 100; h.hero.mana = 20; });
  await p.locator('.hero-action-slot').first().click(); await L.wait(p, 200);
  const cible = await p.evaluate(() => document.querySelector('canvas').classList.contains('canvas--spell-target'));
  await p.locator('.hero-panel-portrait').click(); await L.wait(p, 400);
  const soin = await p.evaluate(() => { const h = window.__world.entities.find((e) => e.hero); return { incante: !!h.hero.spellCast, mana: Math.round(h.hero.mana), bouton: document.querySelector('.hero-action-slot').classList.contains('hero-action-slot--off') }; });
  await L.wait(p, 2300);
  const fin = await p.evaluate(() => { const h = window.__world.entities.find((e) => e.hero); return { pv: h.hp, max: h.stats.maxHp, bouton: document.querySelector('.hero-action-slot').classList.contains('hero-action-slot--off') }; });
  check('Soin depuis le HUD : bouton -> ciblage, clic sur le portrait -> incantation (mana 8, bouton grise pendant), +5 PV a la fin, bouton de nouveau actif',
    cible && soin.incante && soin.mana >= 8 && soin.mana <= 10 && soin.bouton && fin.pv === fin.max && !fin.bouton, J({ cible, soin, fin }));

  if (errors.length) { failures++; console.log('ERREURS', errors.join(' / ').slice(0, 1200)); }
  console.log(failures ? failures + ' ECHEC(S)' : 'tout OK');
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
