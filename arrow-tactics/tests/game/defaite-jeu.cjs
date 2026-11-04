// Test EN JEU de la condition de defaite (passe de modernisation 1, 2026-11-04) : Heros tue, Baliste vivante -> la run
// continue (resurrection a la Baliste, aucun ecran de fin) ; Baliste detruite -> banniere « Vague 1 — Défaite », ecran
// « Partie terminée » (raison : la Baliste), HUD de jeu masque ; « Retour au menu principal » -> menu, run videe.
// Usage : npm run test:game (ou VITE_BASE=http://localhost:5174/ node tests/game/defaite-jeu.cjs)
const L = require('./lib.cjs');
const OUT = L.OUT;
const J = (v) => JSON.stringify(v);
let failures = 0;
const check = (label, ok, extra = '') => { if (!ok) failures++; console.log(`${ok ? 'OK   ' : 'ECHEC'} ${label}${extra ? ' — ' + String(typeof extra === 'string' ? extra : J(extra)).slice(0, 900) : ''}`); };
(async () => {
  const { browser, ctx } = await L.launch(); const errors = [];
  const p = await L.openSurvival(ctx, '?seed=12345', errors);
  await p.evaluate(() => {
    window.__hero = () => window.__world.entities.find((e) => e.hero);
    for (const e of window.__world.entities) if (e.team === 'enemy') e.stats.damage = 0;
  });
  const overlay = (name) => p.evaluate((n) => !!document.querySelector(`.screen-${n}.screen-overlay--visible`), name);

  // 1. Heros tue : la run continue, resurrection.
  await p.evaluate(() => { const h = window.__hero(); h.hp = 0; });
  await L.wait(p, 600);
  const dead = await p.evaluate(() => { const h = window.__hero(); return { alive: h.alive, respawn: h.hero.respawnTimer, tick: window.__world.tick }; });
  const noEnd = !(await overlay('game-over'));
  await p.evaluate(() => { window.__hero().hero.respawnTimer = 0.2; });
  await L.wait(p, 800);
  const back = await p.evaluate(() => { const h = window.__hero(); const b = window.__world.entities.find((e) => e.unitId === 'ballista'); return { alive: h.alive, hp: h.hp, max: h.stats.maxHp, dist: +Math.hypot(h.x - b.x, h.z - b.z).toFixed(1), tick: window.__world.tick }; });
  check('Heros tue, Baliste vivante : aucun ecran de fin, le Heros revient a pleins PV pres de la Baliste, la simulation continue',
    !dead.alive && dead.respawn > 0 && noEnd && back.alive && back.hp === back.max && back.dist < 6 && back.tick > dead.tick, { dead, back });

  // 2. Baliste detruite : defaite.
  await p.evaluate(() => { const b = window.__world.entities.find((e) => e.unitId === 'ballista'); b.hp = 0; });
  let ended = false;
  for (let i = 0; i < 30 && !ended; i++) { await L.wait(p, 300); ended = await overlay('game-over'); }
  const end = await p.evaluate(() => ({
    reason: document.querySelector('.screen-game-over .screen-text')?.textContent ?? '',
    banner: document.body.textContent.includes('Défaite'),
    hudHidden: document.querySelector('.economy-hud')?.hidden === true && document.querySelector('.build-menu')?.hidden !== false,
    tick: window.__world.tick,
  }));
  await L.wait(p, 500);
  const tickLater = await p.evaluate(() => window.__world.tick);
  await p.screenshot({ path: OUT + 'defaite-ecran.png' });
  check('Baliste detruite : ecran « Partie terminée » (la Baliste est tombee), HUD economique masque, simulation figee',
    ended && /Baliste est tombée/.test(end.reason) && end.hudHidden && tickLater === end.tick, { end, tickLater });

  // 3. Retour au menu : run videe.
  await p.getByRole('button', { name: 'Retour au menu principal' }).click(); await L.wait(p, 500);
  const menu = await p.evaluate(() => ({ menu: !!document.querySelector('.screen-menu.screen-overlay--visible'), entities: window.__world.entities.length }));
  check('« Retour au menu principal » : menu affiche, monde vide', menu.menu && menu.entities === 0, menu);

  check('aucune erreur de page', errors.length === 0, errors.slice(0, 3));
  console.log(failures ? failures + ' ECHEC(S)' : 'tout OK');
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
