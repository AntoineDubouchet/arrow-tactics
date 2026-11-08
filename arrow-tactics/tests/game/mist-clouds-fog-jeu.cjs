// Test EN JEU (2026-11-08) : les Mist Clouds (render/mistClouds.ts) suivent la grille du brouillard de
// guerre : case VISIBLE -> nappes faibles, EXPLOREE hors vision -> nappes fortes (la bande
// atmospherique principale), JAMAIS EXPLOREE -> noir souverain, nappes attenuees posees dessus.
// Contrat, sans pixel de l'image finale : (1) sans parametre d'URL les nappes sont actives,
// demi-resolution ; (2) avec des seuils de bruit forces a « plein » (uniforms, rendu seulement) la
// COUVERTURE des nappes (alpha de la cible demi-resolution, moyenne sur un bloc de 24 x 24 texels)
// vaut environ 0,29 en zone visible sans batiment proche et 0,90 en zones exploree et inexploree
// (meme densite, le noir et l'attenuation font la difference a l'image), et moins encore au centre de
// l'Hotel de ville (visible + clairiere des batiments construits, niveau cible 0,08, 2026-11-08) ;
// (3) seuils reels : un Villageois teleporte dans
// une zone exploree la rend visible et la couverture y chute d'au moins moitie, puis revient (a
// 25 % pres) quand il repart ; idem avec un Fantassin. Le disque explore est elargi par
// FogOfWar.exploreDisc (rendu seul, aucune regle de jeu).
// Captures : out/mist-clouds-fog-{trois-niveaux,villageois-present,villageois-parti}.png (graine 12345).
// Usage : npm run test:game (ou VITE_BASE=http://localhost:5174/ node tests/game/mist-clouds-fog-jeu.cjs)
const L = require('./lib.cjs');
const J = (v) => JSON.stringify(v);
let failures = 0;
const check = (label, ok, extra = '') => { if (!ok) failures++; console.log(`${ok ? 'OK   ' : 'ECHEC'} ${label}${extra !== '' ? ' — ' + String(typeof extra === 'string' ? extra : J(extra)).slice(0, 900) : ''}`); };

/** Couverture moyenne des nappes (alpha de la cible demi-resolution) autour de points monde (sol). */
const coverage = (p, pts) => p.evaluate((pts) => {
  const R = window.__R; const T = window.THREE; const t = R.fogPass?.cloudCoverage; if (!t) return null;
  const out = [];
  for (const [x, z] of pts) {
    const v = new T.Vector3(x, 0, z).project(R.camera);
    const cx = Math.round((v.x + 1) / 2 * t.width), cy = Math.round((v.y + 1) / 2 * t.height);
    const S = 12; const buf = new Uint16Array(2 * S * 2 * S * 4);
    R.renderer.readRenderTargetPixels(t, cx - S, cy - S, 2 * S, 2 * S, buf);
    let a = 0; for (let i = 3; i < buf.length; i += 4) a += T.DataUtils.fromHalfFloat(buf[i]);
    out.push(+(a / (buf.length / 4)).toFixed(3));
  }
  return out;
}, pts);
const states = (p, pts) => p.evaluate((pts) => pts.map(([x, z]) => window.__R.fog.stateAt(x, z)), pts);
const teleport = (p, id, x, z) => p.evaluate(({ id, x, z }) => { const e = window.__world.getById(id); e.x = e.prevX = x; e.z = e.prevZ = z; e.path = null; e.order = { type: 'guard' }; }, { id, x, z });

(async () => {
  const { browser, ctx } = await L.launch();
  const errors = [];
  const p = await L.openSurvival(ctx, '?seed=12345', errors);
  // Unites figees (Garde, immobiles, sans combat) : seules les teleportations changent la vision.
  await p.evaluate(() => { for (const e of window.__world.entities) if (!e.isBuilding) { e.order = { type: 'guard' }; e.stats.aggroRange = 0; if (!e.hero) e.stats.moveSpeed = 0; } });
  const mode = await p.evaluate(async () => { const mc = await import('/src/render/mistClouds.ts'); const fp = window.__R.fogPass; return { mode: mc.mistCloudsMode(), half: mc.mistCloudsHalfRes(), passHalf: fp?.cloudsHalfRes, cloudMat: !!fp?.cloudMaterial }; });
  check('sans parametre d\'URL : Mist Clouds actives (reference), demi-resolution, passe prete', mode.mode === 'reference' && mode.half && mode.passHalf && mode.cloudMat, mode);

  // Disque explore elargi (rendu seul) : camp visible au centre, anneau explore jusqu'a 36, inexplore au-dela.
  await p.evaluate(() => { window.__R.fog.exploreDisc(0.5, 0.5, 36); });
  await L.setView(p, { targetX: 0.5, targetZ: -18, viewHeight: 48 }); await L.wait(p, 900); await L.texturesReady(p);
  // `visible` : zone visible SANS batiment a moins de 5,5 cases (niveau de la grille seule) ;
  // `built` : centre de l'Hotel de ville, visible ET dans la clairiere des batiments construits
  // (render/mistClearance.ts, niveau cible 0,08 sous le niveau visible : mist-clearance-jeu.cjs).
  const PTS = { visible: [13.5, 0.5], built: [0.5, 0.5], explored: [0.5, -32], unexplored: [0.5, -40] };
  const pts = [PTS.visible, PTS.explored, PTS.unexplored, PTS.built];
  const st = await states(p, pts);
  check('etats de la grille aux quatre points (visible 2, explore 1, inexplore 0, Hotel de ville 2)', J(st) === J([2, 1, 0, 2]), st);

  // (2) Seuils de bruit forces a plein : la couverture ne depend plus que du niveau de visibilite.
  const flat = await p.evaluate(async () => { const mc = await import('/src/render/mistClouds.ts'); const u = mc.mistCloudUniforms; const saved = [u.uCloudLow.value, u.uCloudHigh.value]; u.uCloudLow.value = -1; u.uCloudHigh.value = -0.5; return saved; });
  await L.wait(p, 300);
  const cov = await coverage(p, pts);
  check('couverture a bruit plein : visible sans batiment ~0,29 (0,15..0,45), exploree ~0,90 (> 0,8), inexploree ~0,90 (> 0,8), visible bien en dessous ; Hotel de ville (visible + clairiere) plus bas encore', !!cov && cov[0] >= 0.15 && cov[0] <= 0.45 && cov[1] > 0.8 && cov[2] > 0.8 && cov[0] < cov[1] / 2 && cov[3] < cov[0] * 0.6, cov);
  await p.evaluate(async (saved) => { const mc = await import('/src/render/mistClouds.ts'); mc.mistCloudUniforms.uCloudLow.value = saved[0]; mc.mistCloudUniforms.uCloudHigh.value = saved[1]; }, flat);
  await L.wait(p, 300);
  await p.screenshot({ path: L.OUT + 'mist-clouds-fog-trois-niveaux.png' });

  // (3) Seuils reels : Villageois isole dans la zone exploree.
  const vil = await p.evaluate(() => { const v = window.__world.entities.find((e) => e.unitId === 'villageois' && e.alive); return { id: v.id, x: v.x, z: v.z }; });
  const before = (await coverage(p, [PTS.explored]))[0];
  await teleport(p, vil.id, PTS.explored[0], PTS.explored[1]); await L.wait(p, 700);
  const during = (await coverage(p, [PTS.explored]))[0];
  const stDuring = (await states(p, [PTS.explored]))[0];
  await L.setView(p, { targetX: 0.5, targetZ: -30, viewHeight: 22 }); await L.wait(p, 500);
  await p.screenshot({ path: L.OUT + 'mist-clouds-fog-villageois-present.png' });
  await L.setView(p, { targetX: 0.5, targetZ: -18, viewHeight: 48 }); await L.wait(p, 300);
  await teleport(p, vil.id, vil.x, vil.z); await L.wait(p, 700);
  const after = (await coverage(p, [PTS.explored]))[0];
  const stAfter = (await states(p, [PTS.explored]))[0];
  await L.setView(p, { targetX: 0.5, targetZ: -30, viewHeight: 22 }); await L.wait(p, 500);
  await p.screenshot({ path: L.OUT + 'mist-clouds-fog-villageois-parti.png' });
  await L.setView(p, { targetX: 0.5, targetZ: -18, viewHeight: 48 }); await L.wait(p, 300);
  check('Villageois teleporte dans la zone exploree : la case devient visible et la couverture des nappes y chute d\'au moins moitie', stDuring === 2 && before > 0.1 && during <= before / 2, { before, during, stDuring });
  check('Villageois reparti : la case redevient exploree et la couverture revient (a 25 % pres)', stAfter === 1 && Math.abs(after - before) <= 0.25 * before + 0.02, { before, after, stAfter });

  // Idem avec une unite militaire (Fantassin), autre point explore.
  const Q = [-14, -30];
  const stQ = (await states(p, [Q]))[0];
  const beforeQ = (await coverage(p, [Q]))[0];
  const fid = await p.evaluate(([x, z]) => { const w = window.__world; const f = w.spawn('fantassin', 'player', x, z); f.order = { type: 'guard' }; f.stats.aggroRange = 0; f.stats.moveSpeed = 0; return f.id; }, Q);
  await L.wait(p, 700);
  const duringQ = (await coverage(p, [Q]))[0];
  await p.evaluate((id) => { const e = window.__world.getById(id); e.alive = false; e.hp = 0; }, fid);
  await L.wait(p, 700);
  const afterQ = (await coverage(p, [Q]))[0];
  check('Fantassin apparu dans une autre zone exploree : couverture divisee par deux au moins, puis revenue apres sa disparition', stQ === 1 && beforeQ > 0.1 && duringQ <= beforeQ / 2 && Math.abs(afterQ - beforeQ) <= 0.25 * beforeQ + 0.02, { beforeQ, duringQ, afterQ, stQ });

  check('aucune erreur de page', errors.length === 0, errors.slice(0, 3));
  await browser.close();
  if (failures > 0) { console.log(`${failures} ECHEC(S)`); process.exit(1); }
  console.log('tout OK');
})().catch((e) => { console.error(e); process.exit(1); });
