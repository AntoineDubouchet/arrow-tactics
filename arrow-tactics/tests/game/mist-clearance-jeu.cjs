// Test EN JEU (2026-11-08) : clairiere des batiments construits dans les Mist Clouds
// (render/mistClearance.ts, lue par render/mistClouds.ts) et feu de camp recentre (render/warmLights.ts).
// Contrat, sans pixel de l'image finale :
// (1) MASQUE (texture de clairiere, logique) : 1 au centre et au bord de l'Hotel de ville, 1 a la
//     Baliste, 0 au centre d'un segment et d'une porte de palissade, 0 loin de tout batiment ; un
//     CHANTIER de Maison ne compte pas (0), le meme batiment termine compte (1) ;
// (2) NAPPES (couverture de la cible demi-resolution, bruit force a plein, meme lecture que
//     mist-clouds-fog-jeu.cjs) : une Maison construite dans une zone EXPLOREE HORS VISION (crochet
//     rendu : les sources de vision des batiments sont retirees de la grille, l'etat de la case reste
//     « explore », aucune vision ajoutee) fait chuter la couverture a son pied a moins du tiers de celle
//     d'un point lointain, alors qu'au pied d'un segment de palissade dans la meme situation la
//     couverture reste forte ; une Maison posee au bord de l'INEXPLORE ne change rien a la couverture
//     au-dela de la frontiere ; en zone VISIBLE (Heros place a cote), le pied de la Maison reste
//     nettement plus clair qu'un point visible sans batiment (niveau cible 0,08 sous le niveau visible
//     0,22 : decision du 2026-11-08, DESIGN_DECISIONS.md A6) ;
// (3) FEU : le feu de camp est a x local +0,8, z local 3,0 de l'Hotel de ville (sous l'axe du clocher,
//     a droite des marches), au sol.
// Captures : out/mist-clearance-{maison,palissade}.png (graine 12345).
// Usage : npm run test:game (ou VITE_BASE=http://localhost:5174/ node tests/game/mist-clearance-jeu.cjs)
const L = require('./lib.cjs');
const J = (v) => JSON.stringify(v);
let failures = 0;
const check = (label, ok, extra = '') => { if (!ok) failures++; console.log(`${ok ? 'OK   ' : 'ECHEC'} ${label}${extra !== '' ? ' — ' + String(typeof extra === 'string' ? extra : J(extra)).slice(0, 900) : ''}`); };

/** Force de la clairiere (texture R8 de render/mistClearance.ts) a des points monde. */
const clearance = (p, pts) => p.evaluate(async (pts) => {
  const mc = await import('/src/render/mistClouds.ts');
  const tex = mc.mistCloudUniforms.tCloudClear.value; const rect = mc.mistCloudUniforms.uCloudClearRect.value;
  if (!tex) return null;
  const img = tex.image; const res = img.width / rect.z;
  return pts.map(([x, z]) => { const c = Math.floor((x - rect.x) * res), r = Math.floor((z - rect.y) * res); if (c < 0 || r < 0 || c >= img.width || r >= img.height) return 0; return +(img.data[r * img.width + c] / 255).toFixed(3); });
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
const states = (p, pts) => p.evaluate((pts) => pts.map(([x, z]) => window.__R.fog.stateAt(x, z)), pts);
const spawnHouse = (p, x, z, site) => p.evaluate(async ({ x, z, site }) => {
  const B = await import('/src/data/buildings.ts'); const w = window.__world;
  const h = w.spawnBuilding(B.getBuilding('house'), 'player', x, z, undefined, undefined, undefined, undefined, site ? { progress: 0, buildTime: 30 } : undefined);
  return h.id;
}, { x, z, site });

(async () => {
  const { browser, ctx } = await L.launch();
  const errors = [];
  const p = await L.openSurvival(ctx, '?seed=12345', errors);
  // Unites figees (Garde, immobiles, sans combat).
  await p.evaluate(() => { for (const e of window.__world.entities) if (!e.isBuilding) { e.order = { type: 'guard' }; e.stats.aggroRange = 0; if (!e.hero) e.stats.moveSpeed = 0; } });
  const on = await p.evaluate(async () => { const mc = await import('/src/render/mistClouds.ts'); return { on: mc.mistCloudUniforms.uCloudClear.value.x, level: mc.mistCloudUniforms.uCloudClear.value.y, tex: !!mc.mistCloudUniforms.tCloudClear.value }; });
  check('carte de clairiere branchee (facteur actif, texture presente, niveau cible 0,08 sous le niveau visible)', on.on === 1 && on.tex && Math.abs(on.level - 0.08) < 1e-6, on);

  // (1) Masque.
  const ents = await p.evaluate(() => {
    const w = window.__world; const of = (f) => w.entities.find((e) => e.alive && e.team === 'player' && f(e));
    const hall = of((e) => e.unitId === 'townhall'); const ball = of((e) => e.unitId === 'ballista');
    const wall = of((e) => e.wall && !e.wall.door); const door = of((e) => e.wall && e.wall.door);
    const fp = hall.footprintObstacle.footprint;
    return { hall: [hall.x, hall.z], hallEdge: [hall.x + (fp.halfW + 0.8) * fp.cos, hall.z - (fp.halfW + 0.8) * fp.sin], ball: [ball.x, ball.z], wall: [wall.x, wall.z], door: [door.x, door.z], far: [hall.x + 45, hall.z + 45] };
  });
  const m = await clearance(p, [ents.hall, ents.hallEdge, ents.ball, ents.wall, ents.door, ents.far]);
  check('masque : Hotel de ville 1 (centre et bord + 0,8), Baliste 1, segment 0, porte 0, loin 0', !!m && m[0] === 1 && m[1] === 1 && m[2] === 1 && m[3] === 0 && m[4] === 0 && m[5] === 0, m);
  // Chantier puis batiment termine, dans une zone libre de tout autre batiment.
  const SITE = [30.5, 30.5];
  const before = (await clearance(p, [SITE]))[0];
  const siteId = await spawnHouse(p, SITE[0], SITE[1], true);
  await L.wait(p, 300);
  const asSite = (await clearance(p, [SITE]))[0];
  await p.evaluate((id) => { window.__world.getById(id).construction = null; }, siteId);
  await L.wait(p, 300);
  const asBuilt = (await clearance(p, [SITE]))[0];
  await p.evaluate((id) => { const e = window.__world.getById(id); e.alive = false; e.hp = 0; }, siteId);
  await L.wait(p, 300);
  const asDead = (await clearance(p, [SITE]))[0];
  check('masque : chantier de Maison 0, Maison terminee 1, Maison detruite 0 (recalcul a chaque changement de liste)', before === 0 && asSite === 0 && asBuilt === 1 && asDead === 0, { before, asSite, asBuilt, asDead });

  // (2) Nappes. Disque explore elargi (rendu seul), Maison construite loin de tout, hors vision.
  await p.evaluate(() => { window.__R.fog.exploreDisc(0.5, 0.5, 40); });
  const HOUSE = [0.5, -31.5];
  await spawnHouse(p, HOUSE[0], HOUSE[1], false);
  // Crochet RENDU : la grille du brouillard ignore les sources de vision des batiments (la Maison et la
  // palissade restent en zone exploree hors vision) ; la simulation n'est pas touchee.
  await p.evaluate(() => { const fog = window.__R.fog; const orig = fog.update.bind(fog); fog.update = (src) => orig(src.filter((s) => !window.__world.entities.some((e) => e.isBuilding && Math.hypot(e.x - s.x, e.z - s.z) < 0.01))); });
  // Les zones qui viennent de perdre la vision des batiments reviennent a la brume avec le delai
  // visuel (FOG_EDGE_TIMING : 2 s + 1,5 s) : on lit l'etat stabilise.
  await L.setView(p, { targetX: 0.5, targetZ: -20, viewHeight: 44 }); await L.wait(p, 4400); await L.texturesReady(p);
  const flat = await p.evaluate(async () => { const mc = await import('/src/render/mistClouds.ts'); const u = mc.mistCloudUniforms; const saved = [u.uCloudLow.value, u.uCloudHigh.value]; u.uCloudLow.value = -1; u.uCloudHigh.value = -0.5; return saved; });
  await L.wait(p, 400);
  const WALL_N = [-2.04, -13.99];
  const FAR = [12, -31.5];
  const PTS = [HOUSE, WALL_N, FAR];
  const st = await states(p, PTS);
  const cov = await coverage(p, PTS);
  check('etats de la grille : Maison, segment nord et point lointain EXPLORES hors vision (aucune vision ajoutee par la clairiere)', J(st) === J([1, 1, 1]), st);
  check('couverture a bruit plein (explore hors vision) : au pied de la Maison < tiers de celle du point lointain ; au pied du segment de palissade > 0,8 (aucune clairiere)', !!cov && cov[2] > 0.8 && cov[0] < cov[2] / 3 && cov[1] > 0.8, cov);
  await p.screenshot({ path: L.OUT + 'mist-clearance-maison.png' });
  // Maison au bord de l'inexplore : au-dela de la frontiere, rien ne change.
  const EDGE_HOUSE = [0.5, -42.5];
  const UNSEEN = [0.5, -46];
  const stU = (await states(p, [EDGE_HOUSE, UNSEEN]));
  const covU0 = (await coverage(p, [UNSEEN]))[0];
  await spawnHouse(p, EDGE_HOUSE[0], EDGE_HOUSE[1], false);
  await L.wait(p, 500);
  const clU = (await clearance(p, [UNSEEN]))[0];
  const covU1 = (await coverage(p, [UNSEEN]))[0];
  check('Maison au bord de l\'inexplore : la clairiere couvre le point inexplore voisin (masque > 0) mais la couverture des nappes n\'y change pas (facteur coupe hors zone exploree)', stU[1] === 0 && clU > 0 && covU0 > 0.8 && Math.abs(covU1 - covU0) <= 0.05, { stU, clU, covU0, covU1 });
  // Zone VISIBLE : le Heros (vision 9) est place entre la Maison et le point lointain ; les deux
  // deviennent visibles, seul le pied de la Maison est dans la clairiere.
  // Heros fige : un camp neutre voisin tire sur la Maison de test, la defense locale l'attirerait hors de portee du point lointain.
  await p.evaluate(() => { const h = window.__world.entities.find((e) => e.hero && e.alive); h.x = h.prevX = 6; h.z = h.prevZ = -31.5; h.path = null; h.order = { type: 'guard' }; h.stats.moveSpeed = 0; });
  await L.wait(p, 800);
  const stV = await states(p, [HOUSE, FAR]);
  const covV = await coverage(p, [HOUSE, FAR]);
  check('zone visible (Heros a cote) : Maison et point lointain VISIBLES ; couverture au pied de la Maison < 0,6 x celle du point visible sans batiment (niveau cible sous le niveau visible)', J(stV) === J([2, 2]) && !!covV && covV[1] > 0.15 && covV[0] < covV[1] * 0.6, { stV, covV });
  await p.evaluate(async (saved) => { const mc = await import('/src/render/mistClouds.ts'); mc.mistCloudUniforms.uCloudLow.value = saved[0]; mc.mistCloudUniforms.uCloudHigh.value = saved[1]; }, flat);
  await L.setView(p, { targetX: -13, targetZ: 0.5, viewHeight: 20 }); await L.wait(p, 700);
  await p.screenshot({ path: L.OUT + 'mist-clearance-palissade.png' });

  // (3) Feu de camp : coordonnees locales de l'Hotel de ville.
  const fire = await p.evaluate(() => {
    const T = window.THREE; const w = window.__world;
    const hall = w.entities.find((e) => e.alive && e.unitId === 'townhall'); const fp = hall.footprintObstacle.footprint;
    let g = null; window.__R.scene.traverse((o) => { if (!g && o.name === 'campfire') g = o; });
    if (!g) return null;
    const q = new T.Vector3(); g.getWorldPosition(q);
    const dx = q.x - hall.x, dz = q.z - hall.z;
    return { lx: +(dx * fp.cos - dz * fp.sin).toFixed(2), lz: +(dx * fp.sin + dz * fp.cos).toFixed(2), dy: +(q.y - window.__S.surfaceY(q.x, q.z)).toFixed(3) };
  });
  check('feu de camp a x local +0,8 et z local 3,0 de l\'Hotel de ville (sous l\'axe du clocher, a droite des marches), pose au sol', !!fire && Math.abs(fire.lx - 0.8) < 0.05 && Math.abs(fire.lz - 3.0) < 0.05 && Math.abs(fire.dy) < 0.02, fire);

  check('aucune erreur de page', errors.length === 0, errors.slice(0, 3));
  await browser.close();
  if (failures > 0) { console.log(`${failures} ECHEC(S)`); process.exit(1); }
  console.log('tout OK');
})().catch((e) => { console.error(e); process.exit(1); });
