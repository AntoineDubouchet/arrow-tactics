// Test EN JEU (2026-11-09) : lisiere du brouillard de guerre (render/fogEdge.ts, render/fogOfWar.ts,
// render/mistClouds.ts). Contrat, sans pixel de l'image finale :
// (1) GRILLE : la texture du brouillard est RGBA et porte, par case, les distances signees aux
//     lisieres du visible (G) et de l'explore (B) : grandes et positives au coeur du camp, positive
//     et courte dans la premiere case visible, negative juste au-dela ; l'etat (R) et
//     FogOfWar.isVisible sont inchanges (la grille reste seule juge de la visibilite gameplay) ;
// (2) NAPPES (couverture de la cible demi-resolution, bruit force a plein, meme lecture que
//     mist-clouds-fog-jeu.cjs) : au centre de la PREMIERE case visible, la couverture reste proche
//     de celle de la zone exploree hors vision (une unite qui y entre est encore enveloppee) ; sept
//     cases a l'interieur, elle est tombee au niveau visible ;
// (3) ANCRAGE : la couverture lue au meme point MONDE ne change pas quand seule la camera se deplace ;
// (4) COUT : les distances ne sont recalculees que quand la grille change, et ce calcul (transformee
//     de distance CPU) reste sous 3 ms en mediane d'une serie de recalculs sur une grille de la
//     taille du jeu (une mesure isolee varie trop avec la charge de la machine) ;
// (5) MOUVEMENT (FogOfWar autonome, pas de temps imposes : aucune dependance a la cadence) : l'etat de
//     jeu change a l'image pres ; une case quittee reste figee pendant le delai puis rejoint la brume
//     en la duree de retour ; demi-tour pendant le delai : aucune fermeture ; retour pendant la
//     reformation : aucun saut, reprise depuis la valeur affichee ; ouverture continue, jamais en
//     avance sur la grille ; l'inconnu reste a sa valeur ;
// (6) ENNEMI (vrai jeu) : hors de vision, modele et barre disparaissent a l'instant alors que le
//     terrain reste affiche clair.
// Captures : out/lisiere-brouillard-{bord,est}.png (graine 12345).
// Usage : npm run test:game (ou VITE_BASE=http://localhost:5174/ node tests/game/lisiere-brouillard-jeu.cjs)
const L = require('./lib.cjs');
const J = (v) => JSON.stringify(v);
let failures = 0;
const check = (label, ok, extra = '') => { if (!ok) failures++; console.log(`${ok ? 'OK   ' : 'ECHEC'} ${label}${extra !== '' ? ' — ' + String(typeof extra === 'string' ? extra : J(extra)).slice(0, 900) : ''}`); };

/** Distances signees (cases) lues dans la texture de la grille, canaux G (visible) et B (explore). */
const edges = (p, pts) => p.evaluate((pts) => {
  const fog = window.__R.fog; const img = fog.texture.image; const d = img.data;
  return pts.map(([x, z]) => {
    const cx = Math.floor(x - fog.minX), cz = Math.floor(z - fog.minZ); const i = (cz * img.width + cx) * 4;
    return { st: fog.stateAt(x, z), vis: +((d[i + 1] - 128) / 15).toFixed(2), exp: +((d[i + 2] - 128) / 15).toFixed(2) };
  });
}, pts);
/** Couverture moyenne des nappes (alpha de la cible demi-resolution) autour de points monde (sol). */
const coverage = (p, pts) => p.evaluate((pts) => {
  const R = window.__R; const T = window.THREE; const t = R.fogPass?.cloudCoverage; if (!t) return null;
  const out = [];
  for (const [x, z] of pts) {
    const v = new T.Vector3(x, 0, z).project(R.camera);
    const cx = Math.round((v.x + 1) / 2 * t.width), cy = Math.round((v.y + 1) / 2 * t.height);
    const S = 6; const buf = new Uint16Array(2 * S * 2 * S * 4);
    R.renderer.readRenderTargetPixels(t, cx - S, cy - S, 2 * S, 2 * S, buf);
    let a = 0; for (let i = 3; i < buf.length; i += 4) a += T.DataUtils.fromHalfFloat(buf[i]);
    out.push(+(a / (buf.length / 4)).toFixed(3));
  }
  return out;
}, pts);

(async () => {
  const { browser, ctx } = await L.launch();
  const errors = [];
  const p = await L.openSurvival(ctx, '?seed=12345', errors);
  await p.evaluate(() => { for (const e of window.__world.entities) if (!e.isBuilding) { e.order = { type: 'guard' }; e.stats.aggroRange = 0; if (!e.hero) e.stats.moveSpeed = 0; } });

  // (1) Grille : vision de l'Hotel de ville (0,5 ; 0,5) = 21 cases vers l'est : premiere case
  // visible x dans [21, 22), premiere case hors vision x dans [22, 23) ; disque explore 25.
  const fmt = await p.evaluate(() => { const img = window.__R.fog.texture.image; return { len: img.data.length, cells: img.width * img.height }; });
  check('texture de la grille en RGBA (4 octets par case)', fmt.len === fmt.cells * 4, fmt);
  const E = await edges(p, [[0.5, 0.5], [21.5, 0.5], [22.5, 0.5], [27.5, 0.5]]);
  check('etats de la grille inchanges : coeur VISIBLE, x = 21,5 VISIBLE, x = 22,5 EXPLORE hors vision, x = 27,5 INEXPLORE', J(E.map((e) => e.st)) === J([2, 2, 1, 0]), E);
  check('distance a la lisiere du visible : >= 7 au coeur, dans ]0 ; 2] dans la premiere case visible, dans [-2 ; 0[ juste au-dela', E[0].vis >= 7 && E[1].vis > 0 && E[1].vis <= 2 && E[2].vis < 0 && E[2].vis >= -2, E);
  check('distance a la lisiere de l\'explore : >= 7 au coeur, positive a x = 22,5, negative a x = 27,5', E[0].exp >= 7 && E[2].exp > 0 && E[3].exp < 0, E);

  // (2) Nappes a bruit plein : premiere case visible, sept cases a l'interieur, zone exploree.
  await p.evaluate(() => { window.__R.fog.exploreDisc(0.5, 0.5, 44); });
  await L.setView(p, { targetX: 20, targetZ: 0.5, viewHeight: 18 }); await L.wait(p, 900); await L.texturesReady(p);
  const flat = await p.evaluate(async () => { const mc = await import('/src/render/mistClouds.ts'); const u = mc.mistCloudUniforms; const saved = [u.uCloudLow.value, u.uCloudHigh.value]; u.uCloudLow.value = -1; u.uCloudHigh.value = -0.5; return saved; });
  await L.wait(p, 400);
  const FIRST = [21.5, 0.5], DEEP = [14.5, 0.5], EXPL = [26.5, 0.5];
  const cov = await coverage(p, [FIRST, DEEP, EXPL]);
  // (Le point explore est donne a titre indicatif : un arbre sous le point de lecture reduit la
  // couverture lue, la densite y est celle de la zone exploree.)
  check('couverture a bruit plein : premiere case visible >= 0,75 (densite exploree, unite encore enveloppee) ; sept cases a l\'interieur <= 0,5 x premiere case', !!cov && cov[0] >= 0.75 && cov[1] <= 0.5 * cov[0], cov);
  await p.screenshot({ path: L.OUT + 'lisiere-brouillard-est.png' });
  // (3) Ancrage au terrain : meme point monde, camera deplacee de 3 cases.
  await L.setView(p, { targetX: 23, targetZ: 3.5, viewHeight: 18 }); await L.wait(p, 500);
  const cov2 = await coverage(p, [FIRST, DEEP, EXPL]);
  check('ancrage : la couverture au meme point monde ne change pas quand seule la camera bouge (ecart <= 0,08)', !!cov2 && cov.every((c, i) => Math.abs(c - cov2[i]) <= 0.08), { cov, cov2 });
  await p.evaluate(async (saved) => { const mc = await import('/src/render/mistClouds.ts'); mc.mistCloudUniforms.uCloudLow.value = saved[0]; mc.mistCloudUniforms.uCloudHigh.value = saved[1]; }, flat);

  // (4) Cout CPU de la transformee de distance : recalculee seulement quand une case change d'etat.
  // Un Villageois teleporte hors du camp (vision 6 dans une zone exploree) force un recalcul ; le
  // reste du temps, unites figees dans un camp entierement vu, la grille ne change pas.
  const ms = await p.evaluate(() => new Promise((resolve) => {
    const v = []; let n = 0;
    const tick = () => {
      if (n === 30) { const w = window.__world.entities.find((e) => e.alive && e.unitId === 'villageois'); if (w) { w.x = w.prevX = 0.5; w.z = w.prevZ = -31.5; w.path = null; } }
      v.push(window.__R.fog.lastEdgeMs); n++;
      if (n >= 90) resolve({ max: +Math.max(...v).toFixed(3), recalculs: v.filter((x) => x > 0).length }); else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }));
  check('distances aux lisieres : recalcul seulement quand la grille change (au moins 1, moins de 90 sur 90 images)', ms.recalculs >= 1 && ms.recalculs < 90, ms);
  const cost = await p.evaluate(async () => {
    const { FogOfWar } = await import('/src/render/fogOfWar.ts');
    const f = new FogOfWar(144, 144); const hall = { x: 0, z: 0, radius: 21 }; const edge = [], anim = [];
    f.update([hall], 0);
    for (let k = 0; k < 180; k++) { f.update([hall, { x: k * 0.1, z: k * 0.1, radius: 9 }], 1 / 60); if (f.lastEdgeMs > 0) edge.push(f.lastEdgeMs); anim.push(f.lastAnimMs); }
    const med = (a) => [...a].sort((x, y) => x - y)[a.length >> 1];
    return { recalculs: edge.length, medianeDistances: +med(edge).toFixed(2), maxDistances: +Math.max(...edge).toFixed(2), medianeAnimation: +med(anim).toFixed(2), maxAnimation: +Math.max(...anim).toFixed(2) };
  });
  check('cout CPU sur une grille de la taille du jeu, Heros en marche : distances < 3 ms en mediane', cost.recalculs >= 5 && cost.medianeDistances < 3, cost);

  // (6) Ennemi qui sort de vision pendant le delai. Un Fantassin dedie est la seule source de vision a
  // cet endroit, loin du camp et du Villageois du (4) : il disparait, la grille change, le terrain
  // reste affiche clair.
  const E6 = await p.evaluate(async () => {
    const UV = (await import('/src/render/unitViews.ts')).UnitViews;
    const s = UV.prototype.sync; UV.prototype.sync = function (...a) { window.__uv = this; return s.apply(this, a); };
    const CO = (await import('/src/ui/combatOverlay.ts')).CombatOverlay;
    const c = CO.prototype.sync; CO.prototype.sync = function (...a) { window.__co = this; return c.apply(this, a); };
    const w = window.__world; const src = w.spawn('fantassin', 'player', -28.5, -20.5); src.order = { type: 'guard' }; src.stats.aggroRange = 0; src.stats.moveSpeed = 0; window.__src6 = src.id;
    const en = w.spawn('maraudeur', 'enemy', -26.5, -20.5);
    en.stats.aggroRange = 0; en.stats.moveSpeed = 0; en.stats.maxHp = 100000; en.hp = 60000; en.order = { type: 'guard' };
    window.__en = en.id; return en.id;
  });
  await L.wait(p, 900);
  const readEnemy = () => p.evaluate(() => {
    const w = window.__world; const fog = window.__R.fog; const e = w.getById(window.__en); const img = fog.texture.image;
    const i = (Math.floor(e.z - fog.minZ) * img.width + Math.floor(e.x - fog.minX)) * 4;
    return { vision: fog.isVisible(e.x, e.z), sim: w.visibility ? w.visibility(e.x, e.z) : null, vue: window.__uv?.views?.get(e.id)?.visible ?? null, barre: (() => { const r = window.__co?.healthBars?.get(e.id); return !!r && r.bar.style.display !== 'none'; })(), g: +((img.data[i + 1] - 128) / 15).toFixed(2) };
  });
  const before6 = await readEnemy();
  await p.evaluate(() => { const e = window.__world.getById(window.__src6); e.alive = false; e.hp = 0; });
  await L.wait(p, 250);
  const after6 = await readEnemy();
  check('ennemi visible puis hors de vision : modele et barre retires a l\'instant, visibilite de jeu fausse, terrain encore affiche clair pendant le delai', before6.vision === true && before6.vue === true && after6.vision === false && after6.sim === false && after6.vue === false && before6.barre === true && after6.barre === false && after6.g > 0, { E6, before6, after6 });

  // (5) Mouvement, sur une grille autonome a pas imposes.
  const M5 = await p.evaluate(async () => {
    const { FogOfWar } = await import('/src/render/fogOfWar.ts');
    const { FOG_EDGE_TIMING: T } = await import('/src/render/fogEdge.ts');
    const DT = 1 / 60;
    const A = { x: 0.5, z: 0.5, radius: 9 }, FAR = { x: -24.5, z: -24.5, radius: 2 };
    const P = [3.5, 0.5];
    const channel = (fog, c, [x, z]) => { const i = (Math.floor(z - fog.minZ) * fog.width + Math.floor(x - fog.minX)) * 4; return (fog.texture.image.data[i + c] - 128) / 15; };
    const G = (fog) => channel(fog, 1, P);
    /** Avance de `duree` secondes ; rend les valeurs de G a chaque image. */
    const run = (fog, src, duree) => { const v = []; const n = Math.round(duree / DT); for (let i = 0; i < n; i++) { fog.update(src, DT); v.push(G(fog)); } return v; };
    const stable = () => { const f = new FogOfWar(60, 60); f.update([A], 0); run(f, [A], 0.2); return f; };
    const out = { T };
    // Delai puis retour.
    { const f = stable(); const g0 = G(f);
      f.update([FAR], DT); out.perteInstantanee = !f.isVisible(P[0], P[1]);
      const hold = run(f, [FAR], T.hold - 2 * DT - 0.02); const held = Math.min(...hold);
      const mid = run(f, [FAR], 0.02 + 2 * DT + T.close / 2).at(-1);
      const rest = run(f, [FAR], T.close / 2 + 0.05);
      out.delai = { g0, held, mid, fin: rest.at(-1) };
      const all = [...hold, mid, ...rest]; out.delai.monotone = all.every((v, i) => i === 0 || v <= all[i - 1] + 1e-6); }
    // Demi-tour pendant le delai.
    { const f = stable(); const g0 = G(f); run(f, [FAR], T.hold / 2); const back = run(f, [A], T.hold + T.close + 0.5); f.update([A], DT); out.demitour = { g0, min: Math.min(...back), vision: f.isVisible(P[0], P[1]), fin: G(f) }; }
    // Retour pendant la reformation.
    { const f = stable(); const g0 = G(f); const v = run(f, [FAR], T.hold + T.close / 2); const gMid = v.at(-1); const rise = run(f, [A], T.open + 0.08);
      out.reforme = { g0, gMid, premier: rise[0], ecart: Math.abs(rise[0] - gMid), monotone: rise.every((x, i) => i === 0 || x >= rise[i - 1] - 1e-6), fin: rise.at(-1) }; }
    // Ouverture : jamais en avance sur la grille, continue ; l'inconnu reste a sa valeur.
    { const f = new FogOfWar(120, 120); f.update([FAR], 0); const Q = [8.5, 8.5], U = [25.5, 8.5];
      const idx = (Math.floor(Q[1] - f.minZ) * f.width + Math.floor(Q[0] - f.minX));
      const src = (t) => { const d = Math.min(t * 5.82 / Math.SQRT2, 14.5); return [FAR, { x: -6.5 + d, z: -6.5 + d, radius: 9 }]; };
      let enAvance = 0, sautG = 0, sautB = 0, avantG = channel(f, 1, Q), avantB = channel(f, 2, Q), premiereVisible = null, valeurAlors = null;
      for (let k = 0; k < 240; k++) {
        const t = k * DT; f.update(src(t), DT);
        const g = channel(f, 1, Q), b = channel(f, 2, Q);
        if (b > f.targetKnown[idx] + 0.04 || g > f.targetVis[idx] + 0.04) enAvance++;
        if (avantG > -0.9 && avantG < 6.6 && g > -0.9 && g < 6.6) sautG = Math.max(sautG, Math.abs(g - avantG));
        if (avantB > -0.9 && avantB < 6.6 && b > -0.9 && b < 6.6) sautB = Math.max(sautB, Math.abs(b - avantB));
        if (premiereVisible === null && f.isVisible(Q[0], Q[1])) { premiereVisible = t; valeurAlors = g; }
        avantG = g; avantB = b;
      }
      out.ouverture = { enAvance, sautG: +sautG.toFixed(3), sautB: +sautB.toFixed(3), premiereVisible, valeurAlors, cibleFinale: +f.targetVis[idx].toFixed(2), final: +avantG.toFixed(2), inconnuB: channel(f, 2, U), inconnuR: f.texture.image.data[(Math.floor(U[1] - f.minZ) * f.width + Math.floor(U[0] - f.minX)) * 4] }; }
    return out;
  });
  const d5 = M5.delai;
  check('perte de vision : etat de jeu faux a la premiere image, delai fige, puis retour complet a la duree prevue et sans remontee', M5.perteInstantanee && Math.abs(d5.held - d5.g0) < 0.07 && d5.mid < d5.g0 && d5.mid > -0.9 && d5.fin <= -7.9 && d5.monotone, M5.delai);
  check('demi-tour pendant le delai : aucune fermeture, valeur stabilisee identique', M5.demitour.vision && M5.demitour.min >= M5.demitour.g0 - 0.07 && Math.abs(M5.demitour.fin - M5.demitour.g0) < 0.07, M5.demitour);
  check('retour pendant la reformation : aucun saut, reprise depuis la valeur affichee, retour exact a la valeur stabilisee', M5.reforme.gMid < M5.reforme.g0 - 0.5 && M5.reforme.ecart <= 0.25 && M5.reforme.monotone && Math.abs(M5.reforme.fin - M5.reforme.g0) < 0.07, M5.reforme);
  const o5 = M5.ouverture;
  check('ouverture en diagonale : jamais en avance sur la grille, sauts par image <= 0,3 case (dans la bande visible), convergence exacte, inconnu intact', o5.enAvance === 0 && o5.sautG <= 0.3 && o5.sautB <= 0.3 && o5.premiereVisible !== null && o5.valeurAlors < 0.5 && Math.abs(o5.final - o5.cibleFinale) < 0.07 && o5.inconnuB <= -7.9 && o5.inconnuR === 0, o5);

  await L.setView(p, { targetX: -14, targetZ: 14, viewHeight: 24 }); await L.wait(p, 700); await L.texturesReady(p);
  await p.screenshot({ path: L.OUT + 'lisiere-brouillard-bord.png' });
  check('aucune erreur de page', errors.length === 0, errors.slice(0, 3));
  await browser.close();
  if (failures > 0) { console.log(`${failures} ECHEC(S)`); process.exit(1); }
  console.log('tout OK');
})().catch((e) => { console.error(e); process.exit(1); });
