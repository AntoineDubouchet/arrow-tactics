// Test EN JEU de la premiere boucle d'exploration : camp cache sous le brouillard, decouverte, coffre verrouille,
// combat (XP), nettoyage (or), ouverture du coffre (barre d'action), butin au sol (couche), ramassage, inventaire (I),
// equipement (stats + visuel), la partie continue. Usage : npm run test:game (ou VITE_BASE=http://localhost:5174/ node tests/game/camp-boucle.cjs)
const L = require('./lib.cjs');
const OUT = require('./lib.cjs').OUT;
const J = (v) => JSON.stringify(v);
let failures = 0;
const check = (label, ok, extra = '') => { if (!ok) failures++; console.log(`${ok ? 'OK   ' : 'ECHEC'} ${label}${extra ? ' — ' + String(typeof extra === 'string' ? extra : J(extra)).slice(0, 900) : ''}`); };
(async () => {
  const { browser, ctx } = await L.launch(); const errors = [];
  const p = await L.openSurvival(ctx, '?seed=12345', errors);
  await p.evaluate(() => { window.__toScreen = (x, z, y) => { const v = new window.THREE.Vector3(x, y ?? window.__S.surfaceY(x, z), z).project(window.__R.camera); return { x: (v.x * 0.5 + 0.5) * innerWidth, y: (-v.y * 0.5 + 0.5) * innerHeight }; }; });
  const vue = () => p.evaluate(() => {
    const w = window.__world; const ids = new Set(w.camps[0].guardIds);
    let light = 0, chest = null, chestOpen = 0, guardsShown = 0, flames = null;
    window.__R.scene.traverse((o) => {
      if (o.isPointLight && o.color.getHexString() === 'ff8a3d') light = Math.max(light, o.intensity);
      if (o.userData?.chestId === 0) { chest = o.visible; o.traverse((c) => { if (c.isGroup && c !== o && Math.abs(c.rotation.x) > 0) chestOpen = Math.max(chestOpen, Math.abs(c.rotation.x)); }); }
      if (ids.has(o.userData?.entityId) && o.visible) guardsShown++;
    });
    const h = w.entities.find((e) => e.hero);
    return { light: +light.toFixed(2), chest, chestOpen: +chestOpen.toFixed(2), guardsShown, flash: document.querySelector('.wave-indicator')?.innerText ?? '', hero: { order: h.order.type, xp: h.hero.xp, level: h.hero.level, hp: Math.round(h.hp), max: h.stats.maxHp }, camp: w.camps[0].state, gold: document.querySelector('.gold-hud, .gold-display')?.innerText ?? '' };
  });
  const c = await p.evaluate(() => ({ x: window.__world.camps[0].x, z: window.__world.camps[0].z, chest: window.__world.chests[0] }));

  // 1. Cache sous le brouillard.
  const avant = await vue();
  await L.setView(p, { targetX: c.x, targetZ: c.z, viewHeight: 12, yawDeg: 45, pitchDeg: 55 }); await L.wait(p, 400);
  await p.screenshot({ path: OUT + 'boucle-1-brouillard.png' });
  check('avant decouverte : aucun garde affiche, coffre cache, lumiere du feu eteinte, aucune annonce de camp', avant.guardsShown === 0 && avant.chest === false && avant.light === 0 && !/Camp/.test(avant.flash), avant);

  // 2. Exploration : le Heros approche (8 cases du centre, cote Baliste, dans son aggro de 9), en Garde : il ne fonce pas.
  await p.evaluate((c) => { const w = window.__world; const h = w.entities.find((e) => e.hero); const len = Math.hypot(c.x, c.z); h.x = h.prevX = c.x - (c.x / len) * 8; h.z = h.prevZ = c.z - (c.z / len) * 8; w.issueCommand({ kind: 'stop', entityIds: [h.id] }); }, c);
  await L.wait(p, 900);
  const decouvert = await vue();
  check('decouverte : annonce « Camp de pillards decouvert ! », coffre et feu reveles (lumiere allumee), gardes visibles dans la vision du Heros ; le camp reste calme',
    /Camp de pillards découvert/.test(decouvert.flash) && decouvert.chest === true && decouvert.light > 3 && decouvert.guardsShown >= 1 && decouvert.camp === 'active' && decouvert.hero.order === 'guard', decouvert);

  // 3. Coffre verrouille : clic droit -> refus, le Heros ne bouge pas.
  await p.keyboard.press('Space'); await L.wait(p, 200); await p.keyboard.press('Space'); await L.wait(p, 300);
  await L.setView(p, { targetX: c.chest.x, targetZ: c.chest.z, viewHeight: 11, yawDeg: 45, pitchDeg: 55 }); await L.wait(p, 400);
  let pt = await p.evaluate((ch) => window.__toScreen(ch.x, ch.z), c.chest);
  await p.mouse.click(pt.x, pt.y, { button: 'right' }); await L.wait(p, 200);
  const refus = await vue();
  check('coffre avant nettoyage : clic droit -> « Camp encore defendu », aucun ordre (le Heros reste en Garde)', /Camp encore défendu/.test(refus.flash) && refus.hero.order === 'guard', refus);

  // 4. Combat : le Heros attaque les gardes (ordres d'attaque), XP, nettoyage, or.
  const goldBefore = await p.evaluate(() => window.__currentRun?.gold ?? null);
  let fin = null;
  for (let i = 0; i < 80 && !fin; i++) {
    const s = await p.evaluate(() => { const w = window.__world; const h = w.entities.find((e) => e.hero); if (w.camps[0].state === 'cleared') return 'cleared'; if (!h.alive) return 'mort';
      if (h.order.type === 'guard' && h.targetId === null) { const g = w.camps[0].guardIds.map((id) => w.getById(id)).find((g) => g.alive); if (g) w.issueCommand({ kind: 'attack', entityIds: [h.id], targetEntityId: g.id }); } return null; });
    if (s) fin = s; else await L.wait(p, 400);
    if (i === 12) { await L.setView(p, { targetX: c.x, targetZ: c.z, viewHeight: 9, yawDeg: 45, pitchDeg: 50 }); await L.wait(p, 200); await p.screenshot({ path: OUT + 'boucle-2-combat.png' }); }
  }
  await L.wait(p, 300);
  const nettoye = await vue();
  check('combat : camp nettoye par le Paladin seul, XP gagnee (niveau 2 : 58 XP des 4 gardes), annonce « Camp de pillards nettoye ! 8 or au sol »',
    fin === 'cleared' && nettoye.hero.level === 2 && nettoye.hero.xp >= 58 && /nettoyé ! 8 or au sol/.test(nettoye.flash), { fin, nettoye });

  // 5. Ouverture du coffre : clic droit, barre d'action, couvercle ouvert, item au sol.
  await L.setView(p, { targetX: c.chest.x, targetZ: c.chest.z, viewHeight: 8, yawDeg: 45, pitchDeg: 55 }); await L.wait(p, 400);
  await p.screenshot({ path: OUT + 'boucle-3-coffre-pret.png' });
  pt = await p.evaluate((ch) => window.__toScreen(ch.x, ch.z), c.chest);
  await p.mouse.click(pt.x, pt.y, { button: 'right' }); await L.wait(p, 120);
  const ordre = await p.evaluate(() => window.__world.entities.find((e) => e.hero).order);
  let barre = false; let ouvert = null;
  for (let i = 0; i < 60 && !ouvert; i++) {
    await L.wait(p, 100);
    const s = await p.evaluate(() => ({ barre: !document.querySelector('.hero-progress').hidden, opened: window.__world.chests[0].opened, drops: window.__world.itemDrops.filter((d) => !d.taken).map((d) => ({ id: d.id, item: d.itemId, x: d.x, z: d.z })) }));
    if (s.barre) barre = true;
    if (s.opened) ouvert = s;
  }
  await L.wait(p, 700);
  const apresCoffre = await vue();
  await p.screenshot({ path: OUT + 'boucle-4-coffre-ouvert.png' });
  const drop = ouvert?.drops[ouvert.drops.length - 1];
  check('coffre : clic droit -> ordre openChest, barre d action pendant l ouverture, coffre ouvert (couvercle releve), annonce « Coffre ouvert : ... », un item au sol devant le coffre',
    ordre.type === 'openChest' && barre && ouvert && apresCoffre.chestOpen > 1.5 && /Coffre ouvert : /.test(apresCoffre.flash) && drop && Math.hypot(drop.x - c.chest.x, drop.z - c.chest.z) < 1.2, { ordre, barre, ouvert, apresCoffre });

  // 6. Butin au sol couche (KI-45), puis ramassage.
  const pose = await p.evaluate((id) => { let out = null; window.__R.scene.traverse((o) => { if (o.userData?.itemDropId === id) { const holder = o.children[2]; const box = new window.THREE.Box3().setFromObject(holder); const s = box.getSize(new window.THREE.Vector3()); out = { h: +s.y.toFixed(2), w: +Math.max(s.x, s.z).toFixed(2), spin: +holder.rotation.y.toFixed(3) }; } }); return out; }, drop.id);
  await L.wait(p, 600);
  const pose2 = await p.evaluate((id) => { let out = null; window.__R.scene.traverse((o) => { if (o.userData?.itemDropId === id) out = +o.children[2].rotation.y.toFixed(3); }); return out; }, drop.id);
  await L.setView(p, { targetX: drop.x, targetZ: drop.z, viewHeight: 5, yawDeg: 30, pitchDeg: 45 }); await L.wait(p, 400);
  await p.screenshot({ path: OUT + 'boucle-5-butin-sol.png' });
  check('butin au sol (KI-45) : piece couchee (plus large que haute), orientation fixe (ne tourne plus)', pose && pose.h < pose.w && pose.spin === pose2, { pose, pose2 });
  pt = await p.evaluate((d) => window.__toScreen(d.x, d.z), drop);
  await p.mouse.click(pt.x, pt.y, { button: 'right' }); await L.wait(p, 200);
  let inv = null;
  for (let i = 0; i < 40 && !inv; i++) { await L.wait(p, 100); const s = await p.evaluate((id) => ({ pris: window.__world.itemDrops[id].taken, items: window.arrowItems.list().inventory.items }), drop.id); if (s.pris) inv = s; }
  check('ramassage : clic droit sur l item -> sac d objets', inv && inv.items.includes(drop.item), { inv, item: drop.item });

  // 7. Inventaire (I) puis Equiper (double-clic dans la grille) : stats et visuel.
  const avantEq = await p.evaluate(() => { const h = window.__world.entities.find((e) => e.hero); return { dmg: h.stats.damage, max: h.stats.maxHp, speed: +h.stats.moveSpeed.toFixed(2), cd: +h.stats.attackCooldown.toFixed(3) }; });
  await p.keyboard.press('i'); await L.wait(p, 400);
  // Inventaire unique (grille) : double-clic sur l item du sac = equiper.
  await p.locator('.inventory-grid .inventory-cell--item').first().dblclick(); await L.wait(p, 700);
  const apresEq = await p.evaluate(() => { const h = window.__world.entities.find((e) => e.hero); let right = false; window.__R.scene.traverse((o) => { if (o.name === 'equipment_right' && o.visible) right = true; }); return { dmg: h.stats.damage, max: h.stats.maxHp, speed: +h.stats.moveSpeed.toFixed(2), cd: +h.stats.attackCooldown.toFixed(3), equipped: window.arrowItems.list().inventory.equipped, right, texte: document.querySelector('.hero-inventory')?.innerText.slice(0, 400) }; });
  await p.screenshot({ path: OUT + 'boucle-6-inventaire.png' });
  const changed = apresEq.dmg !== avantEq.dmg || apresEq.max !== avantEq.max || apresEq.speed !== avantEq.speed || apresEq.cd !== avantEq.cd;
  const slot = Object.keys(apresEq.equipped)[0];
  check('inventaire (I) : « Equiper » -> l item du coffre est equipe, les stats du Heros changent ; une arme apparait dans sa main', Object.values(apresEq.equipped).includes(drop.item) && changed && (slot !== 'mainHand' || apresEq.right), { avantEq, apresEq: { ...apresEq, texte: undefined }, item: drop.item });
  await p.keyboard.press('i'); await L.wait(p, 300);

  // 8. La partie continue (compte a rebours de la vague, temps qui avance).
  const t0 = await p.evaluate(() => window.__world.tick); await L.wait(p, 800); const t1 = await p.evaluate(() => window.__world.tick);
  const flash = await p.evaluate(() => document.querySelector('.wave-indicator')?.innerText ?? '');
  check('la run continue : le temps de simulation avance, la vague 1 arrive toujours', t1 > t0 && /Vague 1/.test(flash), { t0, t1, flash });
  if (errors.length) { failures++; console.log('ERREURS', errors.join(' / ').slice(0, 1500)); }
  console.log(failures ? failures + ' ECHEC(S)' : 'tout OK');
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
