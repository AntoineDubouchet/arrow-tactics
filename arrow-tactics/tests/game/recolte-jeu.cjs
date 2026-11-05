// Test EN JEU de la recolte au contact (2026-11-05, passe corrective apres l'autonomie des Villageois), run reelle
// graine 12345, sur le bosquet et les gisements du camp de depart : un Villageois envoye couper / extraire depuis
// plusieurs cotes (nord, sud, est, ouest) s'arrete au bord de la source (bord du corps a <= WORKER_HARVEST_REACH du
// bord geometrique, jamais dedans), son modele REGARDE la source pendant le geste (ecart <= 25 degres entre l'avant du
// modele rendu et la direction de la source, stable d'une image a l'autre), geste de travail = clips du dossier Worker
// du Heros pretes au rig (hache : workingA, pioche : workingB, plus l'estoc de lance), outil visible ; captures : coupe,
// extraction de pierre, extraction d'or.
// Usage : npm run test:game (ou VITE_BASE=http://localhost:5174/ node tests/game/recolte-jeu.cjs)
const L = require('./lib.cjs');
const OUT = L.OUT;
const J = (v) => JSON.stringify(v);
let failures = 0;
const check = (label, ok, extra = '') => { if (!ok) failures++; console.log(`${ok ? 'OK   ' : 'ECHEC'} ${label}${extra ? ' — ' + String(typeof extra === 'string' ? extra : J(extra)).slice(0, 1400) : ''}`); };
const TOL_DEG = 25;
(async () => {
  const { browser, ctx } = await L.launch(); const errors = [];
  const p = await L.openSurvival(ctx, '?seed=12345', errors);
  await p.evaluate(async () => {
    const urls = performance.getEntriesByType('resource').map((e) => e.name);
    for (const u of urls.filter((n) => n.includes('/src/render/unitViews.ts'))) { const V = (await import(u)).UnitViews; const s = V.prototype.sync; if (!s.__p) { V.prototype.sync = function (...a) { window.__uv = this; return s.apply(this, a); }; V.prototype.sync.__p = true; } }
    window.__SB = await import(urls.find((n) => n.includes('/src/config/startingBase.ts')));
    window.__HERO = await import(urls.find((n) => n.includes('/src/data/hero.ts')));
    window.__RES = await import(urls.find((n) => n.includes('/src/data/resources.ts')));
    window.__layout = window.__SB.startingBaseLayoutOf((window.__maps ?? []).at(-1));
    window.__hero = () => window.__world.entities.find((e) => e.hero);
    for (const e of window.__world.entities) if (e.team === 'enemy') e.stats.damage = 0;
    // Villageois du camp (autonomes, G42) : arretes et tenus inactifs ; le Heros aussi ; seul le Villageois du test travaille.
    const w = window.__world; const vils = w.entities.filter((e) => e.worker && e.alive);
    w.issueCommand({ kind: 'stop', entityIds: [...vils.map((e) => e.id), window.__hero().id] });
    for (const e of vils) { e.worker.autoRetryIn = 1e9; e.cargo.wood = e.cargo.stone = e.cargo.minedGold = 0; }
  });
  await p.waitForFunction(() => !!window.__uv, null, { timeout: 5000 });
  const reach = await p.evaluate(() => window.__HERO.WORKER_HARVEST_REACH);
  const sources = await p.evaluate(() => {
    const w = window.__world; const o = window.__layout.origin;
    const inCamp = (n) => Math.hypot(n.x - o.x, n.z - o.z) < 10;
    const nodes = [...w.resourceNodes.values()].filter(inCamp);
    const pick = (r, side) => { const list = nodes.filter((n) => n.resource === r); return side ? list.sort((a, b) => side(a) - side(b))[0] : list[0]; };
    // Arbres de bord du bosquet (ouest, est, sud : cotes libres ; le nord est la bande etroite contre l'enceinte).
    const treeW = pick('wood', (n) => n.x) ?? null; const treeE = pick('wood', (n) => -n.x) ?? null; const treeS = pick('wood', (n) => -n.z) ?? null;
    const f = (n) => n ? { id: n.id, x: n.x, z: n.z, block: n.block, resource: n.resource } : null;
    return { treeW: f(treeW), treeE: f(treeE), treeS: f(treeS), stone: f(pick('stone')), gold: f(pick('gold')), vil: w.entities.find((e) => e.worker && e.alive).id, origin: o };
  });
  check('camp de depart : bosquet (arbres), gisement de pierre et gisement d or presents dans l enceinte, un Villageois disponible', !!sources.treeW && !!sources.stone && !!sources.gold && typeof sources.vil === 'number', sources);

  // Un cas : Villageois pose a 3 cases de la source du cote `side` (unitaire), ordre de recolte, attente du premier
  // coup (working chop / mine) puis de la premiere unite ; mesure de la portee et du cap rendu sur plusieurs images.
  const boxDist = (e, b) => { const dx = Math.max(b.minX - e.x, 0, e.x - b.maxX); const dz = Math.max(b.minZ - e.z, 0, e.z - b.maxZ); return Math.hypot(dx, dz); };
  const runCase = async (name, node, side, want, shotName) => {
    await p.evaluate(([vid, n, s]) => {
      const w = window.__world; const v = w.getById(vid);
      w.issueCommand({ kind: 'stop', entityIds: [vid] });
      v.x = v.prevX = n.x + s.x * 3; v.z = v.prevZ = n.z + s.z * 3; v.path = null; v.worker.autoRetryIn = 1e9;
      v.cargo.wood = v.cargo.stone = v.cargo.minedGold = 0;
      w.issueCommand({ kind: 'harvest', entityIds: [vid], nodeId: n.id });
    }, [sources.vil, node, side]);
    let st = null;
    for (let i = 0; i < 60; i++) { await L.wait(p, 250); st = await p.evaluate(([vid, nid]) => { const w = window.__world; const v = w.getById(vid); return { working: v.worker.working, order: v.order.type, cargo: v.cargo.wood + v.cargo.stone + v.cargo.minedGold, reste: w.resourceNodeAmounts.get(nid), x: v.x, z: v.z }; }, [sources.vil, node.id]); if (st.cargo >= 1) break; }
    // Cap rendu : 6 images consecutives (avant du modele = -sin / -cos de rotation.y du groupe, voir renderedFacing).
    const samples = [];
    for (let i = 0; i < 6; i++) {
      await L.wait(p, 120);
      samples.push(await p.evaluate(([vid, n]) => { const w = window.__world; const v = w.getById(vid); const g = window.__uv.views.get(vid); const rotY = g.rotation.y; const fx = -Math.sin(rotY), fz = -Math.cos(rotY); const dx = n.x - v.x, dz = n.z - v.z; const d = Math.hypot(dx, dz) || 1; const ang = Math.acos(Math.max(-1, Math.min(1, (fx * dx + fz * dz) / d))) * 180 / Math.PI; const act = g.userData.riggedActions; const role = window.__uv.riggedActionState.get(vid) ?? null; const a = role ? act?.[role] : null; return { ang: +ang.toFixed(1), rotY: +rotY.toFixed(3), role, clip: a ? a.getClip().name : null, timeScale: a ? +a.timeScale.toFixed(2) : null, running: a ? a.isRunning() : null, tool: g.userData.toonTool ?? null, working: v.worker.working, moving: Math.hypot(v.x - v.prevX, v.z - v.prevZ) > 1e-4 }; }, [sources.vil, node]));
    }
    const pos = await p.evaluate((vid) => { const v = window.__world.getById(vid); return { x: v.x, z: v.z, radius: v.stats.radius }; }, sources.vil);
    const gap = boxDist(pos, node.block) - pos.radius;
    const maxAng = Math.max(...samples.map((s) => s.ang));
    const jitter = Math.max(...samples.map((s) => s.rotY)) - Math.min(...samples.map((s) => s.rotY));
    if (shotName) {
      // Camera du cote du Villageois (le feuillage du bosquet masque l'autre cote), basse, legerement de biais.
      const yaw = Math.round((Math.atan2(side.x, side.z) * 180) / Math.PI) + 35;
      await L.setView(p, { targetX: (node.x + pos.x) / 2, targetZ: (node.z + pos.z) / 2, viewHeight: 5, yawDeg: yaw, pitchDeg: 22 }); await L.wait(p, 350);
      await p.screenshot({ path: OUT + shotName + '.png' });
    }
    const ok = st.cargo >= 1 && st.working === want.working && gap <= reach + 0.02 && boxDist(pos, node.block) > 0 && maxAng <= TOL_DEG && jitter < 0.05 && samples.every((s) => s.role === want.working && s.clip === want.clip && s.tool === want.tool && s.running && !s.moving);
    check(`${name} : premiere unite recoltee au contact (bord du corps a <= ${reach} du bord, jamais dedans) ; regarde la source (<= ${TOL_DEG} degres sur 6 images, cap fige) ; geste ${want.working} = clip ${want.clip} du Heros, outil ${want.tool}`, ok, { gap: +gap.toFixed(3), maxAng, jitter: +jitter.toFixed(4), st: { working: st.working, cargo: st.cargo, reste: st.reste }, sample: samples[0] });
    return ok;
  };
  const axe = { working: 'chop', clip: 'workingA', tool: 'axe' };
  const pick = { working: 'mine', clip: 'workingB', tool: 'pick' };
  // Arbres de bord du bosquet depuis l'ouest, l'est et le sud ; gisements : ouest / est (pierre), sud / nord (or).
  await runCase('arbre depuis l OUEST', sources.treeW, { x: -1, z: 0 }, axe, 'recolte-hache');
  await runCase('arbre depuis l EST', sources.treeE, { x: 1, z: 0 }, axe, null);
  await runCase('arbre depuis le SUD', sources.treeS, { x: 0, z: 1 }, axe, null);
  await runCase('gisement de pierre depuis l OUEST', sources.stone, { x: -1, z: 0 }, pick, 'recolte-pioche-pierre');
  await runCase('gisement de pierre depuis l EST', sources.stone, { x: 1, z: 0 }, pick, null);
  await runCase('gisement d or depuis le SUD', sources.gold, { x: 0, z: 1 }, pick, 'recolte-pioche-or');
  await runCase('gisement d or depuis le NORD', sources.gold, { x: 0, z: -1 }, pick, null);

  // Outil retire et clip de repos a l'arret ; cadence (passe economie 2026-11-05) : HARVEST_STROKES_PER_UNIT coups par
  // unite de la ressource travaillee, soit bois 2 s / 2 = 1 s par coup (clip 0,9 s -> timeScale 0,9) ; le dernier geste
  // de pioche etait sur l'or : 3 s / 2 = 1,5 s par coup (timeScale 0,6) : ni plusieurs coups rapides, ni outil fige.
  const after = await p.evaluate(async (vid) => { const w = window.__world; w.issueCommand({ kind: 'stop', entityIds: [vid] }); await new Promise((r) => setTimeout(r, 700)); const g = window.__uv.views.get(vid); const act = g.userData.riggedActions; return { tool: g.userData.toonTool ?? null, role: window.__uv.riggedActionState.get(vid) ?? null, chopDur: +act.chop.getClip().duration.toFixed(3), chopScale: +act.chop.timeScale.toFixed(2), mineDur: +act.mine.getClip().duration.toFixed(3), mineScale: +act.mine.timeScale.toFixed(2), wood: window.__RES.HARVEST_NODE_KINDS.wood.seconds, gold: window.__RES.HARVEST_NODE_KINDS.gold.seconds, strokes: window.__RES.HARVEST_STROKES_PER_UNIT }; }, sources.vil);
  const strokeChop = after.chopDur / after.chopScale, strokeMine = after.mineDur / after.mineScale;
  check(`a l arret : outil retire, repos ; cadence des gestes calee sur le temps par unite de la ressource (${after.strokes} coups par unite : un coup de ${strokeChop.toFixed(2)} s pour un bois toutes les ${after.wood} s, ${strokeMine.toFixed(2)} s pour un or toutes les ${after.gold} s)`, !after.tool && after.role === 'idle' && Math.abs(strokeChop * after.strokes - after.wood) < 0.05 && Math.abs(strokeMine * after.strokes - after.gold) < 0.05, after);

  check('aucune erreur de page', errors.length === 0, errors.slice(0, 3));
  console.log(failures ? failures + ' ECHEC(S)' : 'tout OK');
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
