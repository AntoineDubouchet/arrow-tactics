// Test EN JEU (2026-11-06, G50) : au debut de la Survie, l'Hotel de ville presente sa facade a la camera initiale en leger biais (27°), quelle que soit la
// rotation du camp. Vecteur avant REEL : la normale de la marche basse de l'escalier (cote porte), lue sur la geometrie du modele, pas une constante.
// Cadrage de la Survie : hauteur 28 au lancement, Espace et R y reviennent apres un zoom manuel, l'editeur n'en herite pas.
// Captures : out/survie-zoom-28.png et out/townhall-angle-27.png (graine 12345), out/townhall-face-camera*.png, une par rotation.
// Usage : npm run test:game (ou VITE_BASE=http://localhost:5174/ node tests/game/townhall-face-jeu.cjs)
const L = require('./lib.cjs');
const OUT = L.OUT;
const J = (v) => JSON.stringify(v);
let failures = 0;
const check = (label, ok, extra = '') => { if (!ok) failures++; console.log(`${ok ? 'OK   ' : 'ECHEC'} ${label}${extra !== '' ? ' — ' + String(typeof extra === 'string' ? extra : J(extra)).slice(0, 900) : ''}`); };

/** Lecture a l'instant du depart : aucune vue changee par le test. */
const measure = (p) => p.evaluate(() => {
  const THREE = window.THREE;
  const w = window.__world;
  const of = (id) => w.entities.find((e) => e.alive && e.team === 'player' && e.unitId === id);
  const hall = of('townhall'); const tavern = of('tavern'); const ballista = of('ballista');
  const cam = window.__R.camera;
  const norm = (x, z) => { const l = Math.hypot(x, z) || 1; return { x: x / l, z: z / l }; };
  const deg = (a, b) => (Math.acos(Math.min(1, Math.max(-1, a.x * b.x + a.z * b.z))) * 180) / Math.PI;
  // Modele de l'Hotel de ville dans la scene : la marche basse depasse en +Z local (cote porte).
  let mesh = null;
  window.__R.scene.traverse((o) => { if (!mesh && o.isMesh && /townhall/i.test(o.name) && o.position && Math.hypot(new THREE.Vector3().setFromMatrixPosition(o.matrixWorld).x - hall.x, new THREE.Vector3().setFromMatrixPosition(o.matrixWorld).z - hall.z) < 0.5) mesh = o; });
  if (!mesh) return { erreur: 'modele introuvable' };
  mesh.updateWorldMatrix(true, false);
  // Normale monde de la face de la marche basse qui regarde devant le batiment. Le centre de
  // la marche, lui, n'est pas sur l'axe du modele : la porte est decalee vers la gauche.
  const pos = mesh.geometry.attributes.position; const nor = mesh.geometry.attributes.normal;
  const toWorld = new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld);
  const v = new THREE.Vector3(); const nv = new THREE.Vector3(); const step = new THREE.Vector3(); const faceNormal = new THREE.Vector3(); let n = 0; let riser = 0;
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    if (v.z <= 0.7 || v.y >= 0.11) continue;
    step.add(v.clone().applyMatrix4(mesh.matrixWorld)); n++;
    nv.fromBufferAttribute(nor, i);
    if (nv.z > 0.9) { faceNormal.add(nv.clone().applyMatrix3(toWorld).normalize()); riser++; }
  }
  step.divideScalar(n || 1);
  const origin = new THREE.Vector3(0, 0, 0).applyMatrix4(mesh.matrixWorld);
  const front = norm(faceNormal.x, faceNormal.z);
  const toCamera = norm(cam.position.x - hall.x, cam.position.z - hall.z);
  const dir = new THREE.Vector3(); cam.getWorldDirection(dir);
  const towardViewer = norm(-dir.x, -dir.z);
  // A l'ecran : la marche du cote porte passe sous le centre du batiment (plus pres du spectateur).
  const scr = (q) => q.clone().project(cam);
  return {
    verts: n,
    riser,
    yaw: window.__R.yawDeg,
    viewHeight: window.__R.getViewState().viewHeight,
    pitch: window.__R.getViewState().pitchDeg,
    rotationY: +(hall.footprintObstacle?.rotationY ?? NaN).toFixed(4),
    front: { x: +front.x.toFixed(3), z: +front.z.toFixed(3) },
    ecartPosition: +deg(front, toCamera).toFixed(2),
    ecartVue: +deg(front, towardViewer).toFixed(2),
    porteSousCentre: scr(step).y < scr(origin).y,
    porteADroite: scr(origin.clone().add(new THREE.Vector3(front.x, 0, front.z))).x > scr(origin).x,
    relTavern: [+(tavern.x - hall.x).toFixed(1), +(tavern.z - hall.z).toFixed(1)],
    relBallista: [+(ballista.x - hall.x).toFixed(1), +(ballista.z - hall.z).toFixed(1)],
    footprint: { halfW: hall.footprintObstacle?.footprint?.halfW, cos: +(hall.footprintObstacle?.footprint?.cos ?? 0).toFixed(3), sin: +(hall.footprintObstacle?.footprint?.sin ?? 0).toFixed(3) },
    hallCentre: [hall.x, hall.z],
  };
});

(async () => {
  const { browser, ctx } = await L.launch();
  const rows = [];
  for (const [seed, name] of [[12345, 'townhall-face-camera.png'], [99999, 'townhall-face-camera-r1.png'], [1, 'townhall-face-camera-r2.png'], [42, 'townhall-face-camera-r3.png']]) {
    const errors = [];
    const p = await L.openSurvival(ctx, `?seed=${seed}`, errors);
    const m = await measure(p);
    await p.screenshot({ path: OUT + name });
    rows.push({ seed, ...m, errors: errors.length });
    if (seed === 12345) {
      await p.screenshot({ path: OUT + 'survie-zoom-28.png' });
      const view = () => p.evaluate(() => window.__R.getViewState());
      const heroAt = () => p.evaluate(() => { const h = window.__world.entities.find((e) => e.hero); return { x: h.x, z: h.z }; });
      // Gros plan de l'Hotel de ville, meme pivot et meme inclinaison que la camera de depart.
      await L.setView(p, { targetX: m.hallCentre[0], targetZ: m.hallCentre[1], viewHeight: 13 }); await L.wait(p, 500);
      await p.screenshot({ path: OUT + 'townhall-angle-27.png' });
      // Zoom manuel puis Espace : retour au cadrage de la Survie, suivi du Heros.
      await L.blur(p); await p.keyboard.press('Space'); await L.wait(p, 300);
      const afterSpace = await view(); const hero = await heroAt();
      check('Espace apres un zoom manuel : hauteur 28, pivot 18, inclinaison 28, centre sur le Heros', afterSpace.viewHeight === 28 && afterSpace.yawDeg === 18 && afterSpace.pitchDeg === 28 && Math.hypot(afterSpace.targetX - hero.x, afterSpace.targetZ - hero.z) < 0.3, { afterSpace, hero });
      await p.keyboard.press('a'); await L.wait(p, 150);
      const zoomedIn = await view();
      check('zoom manuel toujours possible', zoomedIn.viewHeight < 28, zoomedIn.viewHeight);
      await L.setView(p, { yawDeg: 90, pitchDeg: 50, viewHeight: 15 }); await L.wait(p, 150);
      await p.keyboard.press('r'); await L.wait(p, 200);
      const afterR = await view();
      check('R : retour au meme cadrage (hauteur 28, pivot 18, inclinaison 28)', afterR.viewHeight === 28 && afterR.yawDeg === 18 && afterR.pitchDeg === 28, afterR);
      await p.keyboard.press('Space'); await L.wait(p, 300);
      // Selection, fiche et reparation : le losange se clique et se rejoint comme avant.
      const scr = await p.evaluate(([x, z]) => { const v = new window.THREE.Vector3(x, 1, z).project(window.__R.camera); return { x: (v.x * 0.5 + 0.5) * innerWidth, y: (-v.y * 0.5 + 0.5) * innerHeight }; }, m.hallCentre);
      await p.mouse.click(scr.x, scr.y); await L.wait(p, 300);
      const title = await p.evaluate(() => document.querySelector('.entity-info-title')?.textContent ?? null);
      check('clic sur l Hotel de ville tourne : sa fiche', title === 'Hôtel de ville', title);
      await p.evaluate(() => { window.arrowEconomy.set({ gold: 100, wood: 100, stone: 100 }); const h = window.__world.entities.find((e) => e.unitId === 'townhall'); h.hp = h.stats.maxHp * 0.5; }); await L.wait(p, 300);
      await p.locator('.entity-info-action[data-action="repairBuilding"]').click(); await L.wait(p, 200);
      let hp = 0; for (let i = 0; i < 80 && hp < 0.999; i++) { await L.wait(p, 400); hp = await p.evaluate(() => { const h = window.__world.entities.find((e) => e.unitId === 'townhall'); return h.hp / h.stats.maxHp; }); }
      check('reparation : le Heros rejoint le losange et finit', hp > 0.999, hp);
    }
    await p.close();
  }
  console.log('MESURES', J(rows));
  const rotations = new Set(rows.map((r) => r.relTavern?.join()));
  check('quatre rotations differentes du camp testees (Auberge a quatre places)', rotations.size === 4, [...rotations]);
  check('camera initiale de la Survie : pivot 18°, inclinaison 28°, hauteur 28, jamais change entre la pose et le lancement', rows.every((r) => r.yaw === 18 && r.pitch === 28 && r.viewHeight === 28), rows.map((r) => [r.yaw, r.pitch, r.viewHeight]));
  check('modele trouve : marche basse lue sur sa geometrie (24 sommets, dont la face avant)', rows.every((r) => r.verts === 24 && r.riser > 0), rows.map((r) => [r.verts ?? r.erreur, r.riser]));
  check('facade reelle / direction de la camera (vue orthographique) : biais de 27° a moins de 1° pres, chaque rotation du camp', rows.every((r) => Math.abs(r.ecartVue - 27) < 1), rows.map((r) => [r.seed, r.ecartVue]));
  check('facade reelle / direction Hotel de ville -> position de la camera : 27° a moins de 3° pres (la camera vise le Heros, a 3,4 cases)', rows.every((r) => Math.abs(r.ecartPosition - 27) < 3), rows.map((r) => [r.seed, r.ecartPosition]));
  check('la porte est du cote de la camera, vers la droite de l ecran', rows.every((r) => r.porteSousCentre && r.porteADroite), rows.map((r) => [r.porteSousCentre, r.porteADroite]));
  check('meme orientation partout (deterministe, sans lien avec la rotation du camp)', new Set(rows.map((r) => J(r.front))).size === 1, rows.map((r) => r.front));
  check('collision : l emprise continue tourne avec le modele', rows.every((r) => r.footprint.halfW === 2 && Math.abs(Math.abs(r.footprint.sin) - Math.SQRT1_2) < 0.01), rows.map((r) => r.footprint));
  check('aucune erreur de page', rows.every((r) => r.errors === 0), rows.map((r) => r.errors));
  console.log(failures ? failures + ' ECHEC(S)' : 'tout OK');
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
