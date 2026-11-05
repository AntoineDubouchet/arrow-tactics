// Tests EN JEU de la recompense de vague (2026-11-05, G46 ; acquisition G47), run reelle graine 12345 : vague repoussee (crochet
// arrowRewards.grant, sans attendre les vagues) -> panneau « Récompense de vague N » avec deux cartes (nom, niveau,
// emplacement, orientation, stats), la partie continue (tick avance, pas de pause), pas de +5 or ; emplacement vide ->
// mention jaune visible avant le choix, clic -> item porte au niveau de la vague (jamais dans le sac), panneau ferme ;
// emplacement occupe -> pas de mention, clic -> sac, la piece portee reste ; sac plein -> carte active seulement pour un
// emplacement vide, sinon desactivee, « Inventaire plein », la recompense reste ; deux vagues non choisies -> file ; clic
// droit sur une carte -> rien.
// Usage : npm run test:game (ou VITE_BASE=http://localhost:5174/ node tests/game/recompense-jeu.cjs)
const L = require('./lib.cjs');
const OUT = L.OUT;
const J = (v) => JSON.stringify(v);
let failures = 0;
const check = (label, ok, extra = '') => { if (!ok) failures++; console.log(`${ok ? 'OK   ' : 'ECHEC'} ${label}${extra ? ' — ' + String(typeof extra === 'string' ? extra : J(extra)).slice(0, 1200) : ''}`); };
(async () => {
  const { browser, ctx } = await L.launch(); const errors = [];
  const p = await L.openSurvival(ctx, '?seed=12345', errors);
  await p.evaluate(() => { for (const e of window.__world.entities) if (e.team === 'enemy') e.stats.damage = 0; });
  const panel = () => p.evaluate(() => { const el = document.querySelector('.wave-reward'); if (!el || el.hidden) return null; return { title: el.querySelector('.wave-reward-title')?.textContent ?? '', cards: [...el.querySelectorAll('.wave-reward-card')].map((c) => ({ itemId: c.dataset.itemId, level: +c.dataset.level, name: c.querySelector('.wave-reward-card-name')?.textContent, meta: c.querySelector('.wave-reward-card-meta')?.textContent, stats: [...c.querySelectorAll('li')].map((li) => li.textContent), disabled: c.disabled, auto: c.querySelector('.wave-reward-card-auto')?.textContent ?? null, icon: !!c.querySelector('.inventory-icon') })), foot: el.querySelector('.wave-reward-foot')?.textContent ?? '' }; });
  const inv = () => p.evaluate(() => window.arrowItems.list().inventory);
  const stock = () => p.evaluate(() => window.arrowEconomy.stock());
  const MENTION = 'Emplacement vide — sera équipé automatiquement';
  await p.evaluate(async () => { const u = performance.getEntriesByType('resource').map((e) => e.name).find((n) => n.includes('/src/data/equipment.ts')); window.__E = (await import(u)).EQUIPMENT; });
  const wornSlotOf = (inventory, itemId) => Object.entries(inventory.equipped).find(([, id]) => id === itemId)?.[0] ?? null;

  // ---- 1. Vague repoussee : panneau, deux cartes de la banque au niveau 1, la partie continue, or inchange.
  const g0 = await stock();
  const t0 = await p.evaluate(() => window.__world.tick);
  const pending = await p.evaluate(() => { window.arrowRewards.grant(); return window.arrowRewards.pending(); });
  await L.wait(p, 500);
  const v1 = await panel();
  const t1 = await p.evaluate(() => window.__world.tick);
  const g1 = await stock();
  await p.screenshot({ path: OUT + 'recompense-vague.png' });
  check('vague 1 repoussee : panneau « Récompense de vague 1 », 2 cartes distinctes de la banque, niveau 1, nom / emplacement / orientation / stats ; la simulation continue ; aucun +5 or',
    !!v1 && /Récompense de vague 1/.test(v1.title) && v1.cards.length === 2 && v1.cards[0].itemId !== v1.cards[1].itemId && v1.cards.every((c) => c.level === 1 && /Niveau 1 ·/.test(c.meta) && c.stats.length >= 1 && !c.disabled) && pending.length === 1 && J(pending[0].itemIds) === J(v1.cards.map((c) => c.itemId)) && t1 > t0 && g1.gold === g0.gold, { v1, pending, t0, t1, g0, g1 });
  check('emplacements vides : mention jaune sur chaque carte, visible avant le choix ; icone d emplacement sur chaque carte', v1.cards.every((c) => c.auto === MENTION && c.icon), v1.cards);
  // Clic droit sur une carte : rien (ni choix, ni ordre au Heros selectionne derriere).
  const cardBox = await p.locator('.wave-reward-card').first().boundingBox();
  const h0 = await p.evaluate(() => { const h = window.__world.entities.find((e) => e.hero); return { x: h.x, z: h.z, order: h.order.type }; });
  await p.mouse.click(cardBox.x + cardBox.width / 2, cardBox.y + cardBox.height / 2, { button: 'right' }); await L.wait(p, 400);
  const h1 = await p.evaluate(() => { const h = window.__world.entities.find((e) => e.hero); return { x: h.x, z: h.z, order: h.order.type, pending: window.arrowRewards.pending().length }; });
  check('clic droit sur une carte : aucun choix, aucun ordre au Heros', h1.pending === 1 && h1.x === h0.x && h1.z === h0.z && h1.order === h0.order, { h0, h1 });
  // Choix : la premiere carte -> portee (niveau 1), sac vide, panneau ferme, file vide.
  const chosen = v1.cards[0];
  await p.locator('.wave-reward-card').first().click(); await L.wait(p, 500);
  const inv1 = await inv();
  const v2 = await panel();
  const left = await p.evaluate(() => window.arrowRewards.pending().length);
  const worn1 = wornSlotOf(inv1, chosen.itemId);
  check('clic sur une carte, emplacement vide : item porte directement au niveau de la vague, sac vide, panneau ferme, file vide', worn1 !== null && inv1.equippedLevels[worn1] === 1 && inv1.items.length === 0 && v2 === null && left === 0, { equipped: inv1.equipped, items: inv1.items, v2, left });

  // ---- 2. Deux vagues sans choix -> file (une a la fois) ; niveau de la vague.
  await p.evaluate(() => { window.arrowRewards.grant(); window.arrowRewards.grant(); });
  await L.wait(p, 500);
  const v3 = await panel();
  const pend2 = await p.evaluate(() => window.arrowRewards.pending().map((r) => r.wave));
  check('vagues 2 et 3 repoussees sans choix : file de 2, le panneau montre la vague 2 (niveau 2) et annonce 1 recompense en attente', J(pend2) === J([2, 3]) && !!v3 && /vague 2/.test(v3.title) && v3.cards.every((c) => c.level === 2) && /1 récompense/.test(v3.foot), { pend2, v3 });

  // ---- 3. Emplacement occupe : pas de mention, la piece va au sac, la piece portee reste.
  const target = v3.cards[0];
  const worn = await p.evaluate((id) => { const slot = window.__E[id].slot; const other = Object.values(window.__E).find((d) => d.slot === slot && d.id !== id); window.arrowItems.give(other.id); return { slot, other: other.id }; }, target.itemId);
  await L.wait(p, 200);
  await p.evaluate((id) => window.arrowItems.equip(id), worn.other);
  await L.wait(p, 500);
  const v3b = await panel();
  const c3b = v3b.cards.find((c) => c.itemId === target.itemId);
  await p.screenshot({ path: OUT + 'recompense-mention.png' });
  await p.locator(`.wave-reward-card[data-item-id="${target.itemId}"]`).click(); await L.wait(p, 500);
  const inv3 = await inv();
  check('emplacement occupe : plus de mention sur cette carte ; choix -> sac au niveau de la vague, la piece portee reste', c3b.auto === null && !c3b.disabled && inv3.equipped[worn.slot] === worn.other && inv3.slots.some((s) => s && s.itemId === target.itemId && s.level === 2), { c3b, equipped: inv3.equipped, worn });

  // ---- 4. Sac plein, emplacement vide : carte active avec mention, equipee quand meme.
  await p.evaluate(() => { window.arrowRewards.grant(); for (let i = 0; i < 25; i++) window.arrowItems.give('starter_sword'); });
  await L.wait(p, 500);
  const v4 = await panel();
  const full = await p.evaluate(() => window.arrowItems.list().inventory.slots.every((s) => s !== null));
  const active = v4?.cards.find((c) => !c.disabled);
  check('sac plein : « Inventaire plein » ; une carte n est active que si elle remplit un emplacement vide (avec la mention), l autre est desactivee sans mention', full && !!v4 && /Inventaire plein/.test(v4.foot) && v4.cards.every((c) => c.disabled === (c.auto === null)) && !!active, { full, foot: v4?.foot, cards: v4?.cards });
  if (active) {
    await p.locator(`.wave-reward-card[data-item-id="${active.itemId}"]`).click(); await L.wait(p, 500);
    const inv4 = await inv();
    const pend4 = await p.evaluate(() => window.arrowRewards.pending().map((r) => r.wave));
    check('sac plein, emplacement vide : choix -> piece portee, sac toujours plein, recompense suivante affichee', wornSlotOf(inv4, active.itemId) !== null && inv4.slots.every((s) => s !== null) && J(pend4) === J([4]), { equipped: inv4.equipped, pend4 });
  }

  // ---- 5. Sac plein, tous emplacements occupes : cartes desactivees, rien n'est perdu ; une case liberee -> sac.
  await p.evaluate(() => {
    const h = window.__world.entities.find((e) => e.hero); const inv = h.hero.inventory;
    const equipped = { ...inv.equipped }; const equippedLevels = { ...inv.equippedLevels };
    for (const def of Object.values(window.__E)) if (def.slot !== 'offHand' && !equipped[def.slot]) { equipped[def.slot] = def.id; equippedLevels[def.slot] = 1; }
    h.hero.inventory = { ...inv, equipped, equippedLevels };
  });
  await L.wait(p, 500);
  const v5 = await panel();
  await p.locator('.wave-reward-card').first().click({ force: true }).catch(() => {}); await L.wait(p, 300);
  const stillPending = await p.evaluate(() => window.arrowRewards.pending().map((r) => r.wave));
  check('sac plein, tous emplacements occupes : cartes desactivees, « Inventaire plein », un clic ne choisit rien, la recompense reste en file', !!v5 && v5.cards.every((c) => c.disabled && c.auto === null) && /Inventaire plein/.test(v5.foot) && J(stillPending) === J([4]), { foot: v5?.foot, cards: v5?.cards, stillPending });
  await p.evaluate(() => { const h = window.__world.entities.find((e) => e.hero); const inv = h.hero.inventory; h.hero.inventory = { ...inv, slots: inv.slots.map((s, i) => (i === 0 ? null : s)) }; });
  await L.wait(p, 500);
  const v6 = await panel();
  const pick = v6?.cards[0];
  await p.locator('.wave-reward-card').first().click(); await L.wait(p, 500);
  const inv6 = await inv();
  const pend6 = await p.evaluate(() => window.arrowRewards.pending().map((r) => r.wave));
  check('une case liberee : cartes actives ; choix -> item de niveau 4 dans le sac, file vide', !!v6 && v6.cards.every((c) => !c.disabled) && !!pick && inv6.slots.some((s) => s && s.itemId === pick.itemId && s.level === 4) && pend6.length === 0, { pick, pend6, v6: v6 && v6.title });

  check('aucune erreur de page', errors.length === 0, errors.slice(0, 3));
  console.log(failures ? failures + ' ECHEC(S)' : 'tout OK');
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
