// Tests EN JEU de la recompense de vague (2026-11-05, G46), run reelle graine 12345 : vague repoussee (crochet
// arrowRewards.grant, sans attendre les vagues) -> panneau « Récompense de vague N » avec deux cartes (nom, niveau,
// emplacement, orientation, stats), la partie continue (tick avance, pas de pause), pas de +5 or ; clic sur une carte ->
// item au niveau de la vague dans le sac, panneau ferme ; sac plein -> cartes desactivees, « Inventaire plein », la
// recompense reste ; deux vagues non choisies -> file, une a la fois.
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
  const panel = () => p.evaluate(() => { const el = document.querySelector('.wave-reward'); if (!el || el.hidden) return null; return { title: el.querySelector('.wave-reward-title')?.textContent ?? '', cards: [...el.querySelectorAll('.wave-reward-card')].map((c) => ({ itemId: c.dataset.itemId, level: +c.dataset.level, name: c.querySelector('.wave-reward-card-name')?.textContent, meta: c.querySelector('.wave-reward-card-meta')?.textContent, stats: [...c.querySelectorAll('li')].map((li) => li.textContent), disabled: c.disabled })), foot: el.querySelector('.wave-reward-foot')?.textContent ?? '' }; });
  const inv = () => p.evaluate(() => window.arrowItems.list().inventory);
  const stock = () => p.evaluate(() => window.arrowEconomy.stock());

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
  // Choix : la premiere carte -> sac (niveau 1), panneau ferme, file vide.
  const chosen = v1.cards[0];
  await p.locator('.wave-reward-card').first().click(); await L.wait(p, 500);
  const inv1 = await inv();
  const v2 = await panel();
  const left = await p.evaluate(() => window.arrowRewards.pending().length);
  check('clic sur une carte : item ajoute au sac (id et niveau de la vague), panneau ferme, file vide', inv1.items.includes(chosen.itemId) && inv1.slots.some((s) => s && s.itemId === chosen.itemId && s.level === 1) && v2 === null && left === 0, { items: inv1.items, v2, left });

  // ---- 2. Deux vagues sans choix -> file (une a la fois) ; niveau de la vague.
  await p.evaluate(() => { window.arrowRewards.grant(); window.arrowRewards.grant(); });
  await L.wait(p, 500);
  const v3 = await panel();
  const pend2 = await p.evaluate(() => window.arrowRewards.pending().map((r) => r.wave));
  check('vagues 2 et 3 repoussees sans choix : file de 2, le panneau montre la vague 2 (niveau 2) et annonce 1 recompense en attente', J(pend2) === J([2, 3]) && !!v3 && /vague 2/.test(v3.title) && v3.cards.every((c) => c.level === 2) && /1 récompense/.test(v3.foot), { pend2, v3 });

  // ---- 3. Sac plein : cartes desactivees, « Inventaire plein », rien n'est perdu ; une case liberee -> choix possible.
  await p.evaluate(() => { for (let i = 0; i < 25; i++) window.arrowItems.give('starter_sword'); });
  await L.wait(p, 500);
  const v4 = await panel();
  const full = await p.evaluate(() => window.arrowItems.list().inventory.slots.every((s) => s !== null));
  await p.locator('.wave-reward-card').first().click({ force: true }).catch(() => {}); await L.wait(p, 300);
  const stillPending = await p.evaluate(() => window.arrowRewards.pending().map((r) => r.wave));
  check('sac plein : cartes desactivees, mention « Inventaire plein », un clic ne choisit rien, la recompense reste en file', full && !!v4 && v4.cards.every((c) => c.disabled) && /Inventaire plein/.test(v4.foot) && J(stillPending) === J([2, 3]), { full, foot: v4?.foot, stillPending });
  // Liberer une case : equiper l'epee de la case 0.
  await p.evaluate(() => window.arrowItems.equip('starter_sword'));
  await L.wait(p, 500);
  const v5 = await panel();
  const pick = v5?.cards[0];
  await p.locator('.wave-reward-card').first().click(); await L.wait(p, 500);
  const inv5 = await inv();
  const pend5 = await p.evaluate(() => window.arrowRewards.pending().map((r) => r.wave));
  const v6 = await panel();
  check('une case liberee : cartes actives ; choix -> item de niveau 2 dans le sac, puis la vague 3 s affiche (file)', !!v5 && v5.cards.every((c) => !c.disabled) && !!pick && inv5.slots.some((s) => s && s.itemId === pick.itemId && s.level === 2) && J(pend5) === J([3]) && !!v6 && /vague 3/.test(v6.title) && v6.cards.every((c) => c.level === 3), { pick, pend5, v6: v6 && v6.title });

  check('aucune erreur de page', errors.length === 0, errors.slice(0, 3));
  console.log(failures ? failures + ' ECHEC(S)' : 'tout OK');
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
