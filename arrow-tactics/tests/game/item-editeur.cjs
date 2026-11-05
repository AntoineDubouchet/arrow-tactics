// Tests EN JEU de l'Editeur d'items (2026-11-05, G47), vraie interface : remplacer « Feu a chaque coup » par des effets
// declenches : « Toutes les N attaques », « Declenche K fois », liste d'effets (six ecoles), degats ; aller-retour strict
// export -> import ; ancien item « feu a chaque coup » migre a l'import, nouveau format a l'export ; N et K >= 1 ; ajouter
// et retirer un effet ; icone commune d'emplacement sur la carte ; Lame des braises du catalogue en nouveau format.
// Usage : npm run test:game (ou VITE_BASE=http://localhost:5174/ node tests/game/item-editeur.cjs)
const L = require('./lib.cjs');
const OUT = L.OUT;
const J = (v) => JSON.stringify(v);
let failures = 0;
const check = (label, ok, extra = '') => { if (!ok) failures++; console.log(`${ok ? 'OK   ' : 'ECHEC'} ${label}${extra ? ' — ' + String(typeof extra === 'string' ? extra : J(extra)).slice(0, 1200) : ''}`); };
(async () => {
  const { browser, ctx } = await L.launch(); const errors = [];
  const p = await L.openPage(ctx, '', errors);
  await p.getByRole('button', { name: "Éditeur d'items", exact: true }).click();
  await p.waitForSelector('.item-editor [data-name="preset"]', { timeout: 90000 });
  const field = (name) => p.locator(`.item-editor [data-name="${name}"]`);
  const setNum = async (name, v) => { await field(name).fill(String(v)); await L.wait(p, 60); };
  const exported = () => p.locator('.item-editor .workshop-export').inputValue();
  const parsed = async () => Object.values(JSON.parse(await exported()))[0];
  const values = (i = 0) => p.evaluate((i) => { const v = (n) => document.querySelector(`.item-editor [data-name="effect-${i}-${n}"]`)?.value ?? null; return { every: v('every'), repeat: v('repeat'), effect: v('effect'), amount: v('amount') }; }, i);
  const addEffect = async () => { await p.getByRole('button', { name: '+ Ajouter un effet', exact: true }).click(); await L.wait(p, 100); };
  const load = async (text) => { await p.locator('.item-editor .workshop-export').fill(text); await p.getByRole('button', { name: 'Charger config', exact: true }).click(); await L.wait(p, 200); };
  const card = () => p.evaluate(() => { const c = document.querySelector('.item-editor-card'); return { text: c.innerText, icon: c.querySelector('.inventory-icon')?.className ?? null }; });

  // ---- 1. Interface : plus de champ « feu », bouton d'ajout, six ecoles.
  const legacyField = await p.evaluate(() => [...document.querySelectorAll('.item-editor .workshop-label')].some((l) => /Feu à chaque coup/.test(l.textContent)));
  await addEffect();
  const options = await p.evaluate(() => [...document.querySelector('.item-editor [data-name="effect-0-effect"]').options].map((o) => [o.value, o.textContent]));
  const labels = await p.evaluate(() => [...document.querySelectorAll('.item-editor .workshop-label')].map((l) => l.textContent));
  check('interface : « Feu à chaque coup » disparu ; « Toutes les … attaques », « Déclenche … fois », « Effet » ; six effets au selecteur', !legacyField && labels.includes('Toutes les … attaques') && labels.includes('Déclenche … fois') && labels.includes('Effet') && J(options.map((o) => o[0])) === J(['fireDamage', 'frostDamage', 'arcaneDamage', 'natureDamage', 'holyDamage', 'shadowDamage']), { legacyField, options });

  // ---- 2. Toutes les 4 attaques, 3 fois, Nature, 5 degats ; export -> import strictement identique.
  await setNum('effect-0-every', 4);
  await setNum('effect-0-repeat', 3);
  await field('effect-0-effect').selectOption('natureDamage'); await L.wait(p, 120);
  await setNum('effect-0-amount', 5);
  const firstText = await exported();
  const first = await parsed();
  const c1 = await card();
  await p.screenshot({ path: OUT + 'item-editeur-effets.png' });
  check('export : { every: 4, repeat: 3, effect: natureDamage, amount: 5 } ; carte : « Toutes les 4 attaques : 3 × 5 dégâts de nature »', J(first.effects) === J([{ every: 4, repeat: 3, effect: 'natureDamage', amount: 5 }]) && /Toutes les 4 attaques : 3 × 5 dégâts de nature/.test(c1.text), { effects: first.effects, c1 });
  // Partir d'un autre item, puis recharger le texte exporte.
  await field('preset').selectOption('ember_blade'); await L.wait(p, 250);
  const blade = await values();
  check('catalogue : Lame des braises en nouveau format (1, 1, feu, 3)', J(blade) === J({ every: '1', repeat: '1', effect: 'fireDamage', amount: '3' }), blade);
  await load(firstText);
  const back = await values(); const backText = await exported();
  check('import du texte exporte : champs restaures, nouvel export strictement identique', J(back) === J({ every: '4', repeat: '3', effect: 'natureDamage', amount: '5' }) && backText === firstText, { back, same: backText === firstText });

  // ---- 3. Ancien item « feu a chaque coup » : migration a l'import, nouveau format a l'export.
  const legacy = JSON.stringify({ vieille_lame: { ...first, id: 'vieille_lame', name: 'Vieille lame', effects: { onHit: { fireDamage: 3 } } } }, null, 2);
  await load(legacy);
  const migrated = await values(); const mText = await exported(); const m = await parsed();
  const c2 = await card();
  check('ancien item : importe en every 1, repeat 1, feu, 3 ; export uniquement au nouveau format ; carte « À chaque attaque : 3 dégâts de feu »', J(migrated) === J({ every: '1', repeat: '1', effect: 'fireDamage', amount: '3' }) && !mText.includes('onHit') && J(m.effects) === J([{ every: 1, repeat: 1, effect: 'fireDamage', amount: 3 }]) && /À chaque attaque : 3 dégâts de feu/.test(c2.text), { migrated, effects: m.effects, c2: c2.text });

  // ---- 4. Bornes : N et K >= 1 ; plusieurs effets ; retirer.
  await setNum('effect-0-every', 0);
  await setNum('effect-0-repeat', -2);
  const bounded = await parsed();
  check('N = 0 et K = -2 saisis : exportes a 1 et 1', bounded.effects[0].every === 1 && bounded.effects[0].repeat === 1, bounded.effects);
  await addEffect();
  await field('effect-1-effect').selectOption('shadowDamage'); await L.wait(p, 120);
  await setNum('effect-1-every', 2);
  await setNum('effect-1-amount', 4);
  const two = await parsed();
  check('+ Ajouter un effet : deux effets exportes, dans l ordre', two.effects.length === 2 && two.effects[1].effect === 'shadowDamage' && two.effects[1].every === 2 && two.effects[1].amount === 4, two.effects);
  await p.getByRole('button', { name: 'Retirer cet effet', exact: true }).first().click(); await L.wait(p, 120);
  const one = await parsed();
  check('Retirer cet effet : il reste l autre', one.effects.length === 1 && one.effects[0].effect === 'shadowDamage', one.effects);
  await setNum('effect-0-amount', 0);
  const none = await parsed();
  check('effet a 0 degat : non exporte', none.effects.length === 0, none.effects);

  // ---- 5. Icone commune : l'emplacement du selecteur decide de l'icone de la carte.
  const seen = [];
  for (const slot of ['legs', 'chest', 'cape']) { await field('slot').selectOption(slot); await L.wait(p, 150); const c = await card(); seen.push(c.icon); }
  check('carte de l Editeur : icone de la table commune selon l emplacement (Jambes, Torse, Cape)', /slot-legs/.test(seen[0]) && /slot-chest/.test(seen[1]) && /slot-cape/.test(seen[2]), seen);

  check('aucune erreur de page', errors.length === 0, errors.slice(0, 3));
  console.log(failures ? failures + ' ECHEC(S)' : 'tout OK');
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
