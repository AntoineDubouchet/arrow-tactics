// Test EN JEU de la Porte de palissade refaite (2026-11-05) : structure du modele (2 vrais vantaux gauche / droite,
// aucune face miroir, dessus ouvert : rien au-dessus des montants, meme famille que les segments) ; ouverture /
// fermeture animees ; captures : face exterieure fermee, face interieure fermee, ouverte, trois-quarts avec les
// segments voisins (camp de depart rond). Gameplay inchange (porte-alliee.mts, palissade.mts, depart-camp.mts).
// Usage : npm run test:game (ou VITE_BASE=http://localhost:5174/ node tests/game/porte-jeu.cjs)
const L = require('./lib.cjs');
const OUT = L.OUT;
const J = (v) => JSON.stringify(v);
let failures = 0;
const check = (label, ok, extra = '') => { if (!ok) failures++; console.log(`${ok ? 'OK   ' : 'ECHEC'} ${label}${extra ? ' — ' + String(typeof extra === 'string' ? extra : J(extra)).slice(0, 900) : ''}`); };
(async () => {
  const { browser, ctx } = await L.launch(); const errors = [];
  const p = await L.openSurvival(ctx, '?seed=12345', errors);
  await p.evaluate(async () => {
    const urls = performance.getEntriesByType('resource').map((e) => e.name);
    window.__SB = await import(urls.find((n) => n.includes('/src/config/startingBase.ts')));
    window.__layout = window.__SB.startingBaseLayoutOf((window.__maps ?? []).at(-1));
    for (const e of window.__world.entities) if (e.team === 'enemy') e.stats.damage = 0;
  });

  // Structure du modele de la porte (scene) : groupe qui contient palisade_door_left / _right.
  const info = await p.evaluate(() => {
    const T = window.THREE;
    let gate = null;
    window.__R.scene.traverse((o) => { if (!gate && o.name === 'palisade_door_left') gate = o.parent; });
    if (!gate) return null;
    const box = (o) => { const b = new T.Box3().setFromObject(o); return { min: [b.min.x, b.min.y, b.min.z].map((v) => +v.toFixed(2)), max: [b.max.x, b.max.y, b.max.z].map((v) => +v.toFixed(2)) }; };
    const leaves = gate.children.filter((c) => /_door_(left|right)$/.test(c.name)).map((c) => ({ name: c.name, rotY: +c.rotation.y.toFixed(3), local: (() => { const b = new T.Box3(); c.traverse((m) => { if (m.isMesh) { m.geometry.computeBoundingBox(); b.union(m.geometry.boundingBox); } }); return { min: [b.min.x, b.min.y, b.min.z].map((v) => +v.toFixed(2)), max: [b.max.x, b.max.y, b.max.z].map((v) => +v.toFixed(2)) }; })(), world: box(c) }));
    const frame = gate.children.filter((c) => c.isMesh);
    const frameBox = frame.length ? box(frame[0]) : null;
    const g = window.__world.entities.find((e) => e.wall?.door);
    return { leaves, frame: frame.length, frameBox, gateWorld: box(gate), door: g ? { open: g.wall.door.open, x: g.x, z: g.z } : null };
  });
  const left = info?.leaves.find((l) => l.name === 'palisade_door_left');
  const right = info?.leaves.find((l) => l.name === 'palisade_door_right');
  const posts = info?.frameBox;
  check('modele de la porte : 1 cadre (2 montants), 2 vantaux nommes left / right, chacun construit dans SON sens (gauche vers +X, droit vers -X en local), aucune rotation miroir (porte ouverte au depart : gauche -pi/2, droit +pi/2, symetriques)',
    !!info && info.frame === 1 && info.leaves.length === 2 && !!left && !!right && left.local.min[0] >= -0.05 && left.local.max[0] > 0.5 && right.local.max[0] <= 0.05 && right.local.min[0] < -0.5 && Math.abs(left.rotY + Math.PI / 2) < 0.01 && Math.abs(right.rotY - Math.PI / 2) < 0.01, info);
  check('dessus ouvert : les vantaux ne depassent pas les montants, et rien ne relie les deux montants (pas de linteau : la boite du cadre ne couvre pas la largeur entre les deux poteaux sur une seule piece au-dessus des pieux)',
    !!posts && !!left && left.world.max[1] <= posts.max[1] + 0.02 && right.world.max[1] <= posts.max[1] + 0.02 && (info.gateWorld.max[1] - info.gateWorld.min[1]) > 2 && (info.gateWorld.max[1] - info.gateWorld.min[1]) < 2.5, { posts, left: left?.world, right: right?.world, gate: info?.gateWorld });

  // Captures : camera sur la porte (ouverte au depart), puis fermee, ext / int, trois-quarts.
  const g = info?.door ?? (await p.evaluate(() => { const d = window.__world.entities.find((e) => e.wall?.door); return { open: d.wall.door.open, x: d.x, z: d.z }; }));
  const layout = await p.evaluate(() => window.__layout);
  const dir = { x: (g.x - layout.origin.x), z: (g.z - layout.origin.z) };
  const n = Math.hypot(dir.x, dir.z); dir.x /= n; dir.z /= n;
  const yawOf = (vx, vz) => Math.round((Math.atan2(vx, vz) * 180) / Math.PI);
  // La camera suit le Heros : il est pose juste derriere la porte (cote camp), immobile, pour cadrer la porte.
  await p.evaluate(([g, d]) => { const w = window.__world; const h = w.entities.find((e) => e.hero); h.x = h.prevX = g.x - d.x * 2.5; h.z = h.prevZ = g.z - d.z * 2.5; w.issueCommand({ kind: 'stop', entityIds: [h.id] }); }, [g, dir]); await L.wait(p, 400);
  const shot = async (name, from, pitch = 28, h = 7) => { await L.setView(p, { targetX: g.x, targetZ: g.z, viewHeight: h, yawDeg: yawOf(from.x, from.z), pitchDeg: pitch }); await L.wait(p, 500); await p.screenshot({ path: OUT + name + '.png' }); };
  await shot('porte-ouverte', { x: dir.x, z: dir.z }, 30);
  // Fermeture : par la simulation (le joueur n'a plus de bouton).
  const closed = await p.evaluate((id) => { const w = window.__world; const d = w.entities.find((e) => e.wall?.door); w.setDoorWanted(d.id, false, 'player'); return d.id; }, g);
  let isClosed = false;
  for (let i = 0; i < 20 && !isClosed; i++) { await L.wait(p, 250); isClosed = await p.evaluate(() => !window.__world.entities.find((e) => e.wall?.door).wall.door.open); }
  await L.wait(p, 900);
  // Plusieurs portes (G48) : le vantail le plus proche de la porte manipulee.
  await p.evaluate(() => { window.__leafOfDoor = () => { const d = window.__world.entities.find((e) => e.wall?.door); const v = new window.THREE.Vector3(); let rot = null; let best = Infinity; window.__R.scene.traverse((o) => { if (o.name !== 'palisade_door_left') return; o.getWorldPosition(v); const dist = Math.hypot(v.x - d.x, v.z - d.z); if (dist < best) { best = dist; rot = +o.rotation.y.toFixed(3); } }); return rot; }; });
  const openness = await p.evaluate(() => window.__leafOfDoor());
  await shot('porte-exterieur-fermee', { x: dir.x, z: dir.z }, 22, 6);
  await shot('porte-interieur-fermee', { x: -dir.x, z: -dir.z }, 22, 6);
  const reopened = await p.evaluate(() => { const w = window.__world; const d = w.entities.find((e) => e.wall?.door); w.setDoorWanted(d.id, true, 'player'); return true; });
  let isOpen = false;
  for (let i = 0; i < 20 && !isOpen; i++) { await L.wait(p, 250); isOpen = await p.evaluate(() => window.__world.entities.find((e) => e.wall?.door).wall.door.open); }
  await L.wait(p, 900);
  // Trois-quarts, porte rouverte (les vantaux ouverts rendent l'ouverture evidente).
  await L.setView(p, { targetX: g.x, targetZ: g.z, viewHeight: 9, yawDeg: yawOf(dir.x, dir.z) + 35, pitchDeg: 30 }); await L.wait(p, 500); await p.screenshot({ path: OUT + 'porte-trois-quarts.png' });
  const opennessOpen = await p.evaluate(() => window.__leafOfDoor());
  check('ouverture / fermeture : porte fermee -> vantail gauche a 0 rad ; rouverte -> vantail gauche a -pi/2 (animation de pivot conservee) ; 4 captures ecrites', typeof closed === 'number' && isClosed && openness === 0 && reopened && isOpen && Math.abs(opennessOpen + Math.PI / 2) < 0.02, { isClosed, openness, isOpen, opennessOpen });
  // Fiche d'une porte : plus de boutons Ouvrir / Fermer.
  await L.setView(p, { targetX: g.x, targetZ: g.z, viewHeight: 9, yawDeg: 18, pitchDeg: 40 }); await L.wait(p, 400);
  // Clic au sol sur son emprise : la selection d'un batiment lit le point au sol.
  const doorScreen = await p.evaluate((g) => { const v = new window.THREE.Vector3(g.x, window.__S.surfaceY(g.x, g.z), g.z).project(window.__R.camera); return { x: (v.x * 0.5 + 0.5) * innerWidth, y: (-v.y * 0.5 + 0.5) * innerHeight }; }, g);
  await p.mouse.click(doorScreen.x, doorScreen.y); await L.wait(p, 350);
  const doorPanel = await p.evaluate(() => { const r = document.querySelector('.entity-info'); return { title: r?.querySelector('.entity-info-title')?.textContent ?? null, actions: [...(r?.querySelectorAll('.entity-info-action') ?? [])].map((b) => b.textContent), text: r?.innerText ?? '' }; });
  check('fiche de la porte : aucun bouton Ouvrir, Fermer, ni verrou', /Porte/.test(doorPanel.title ?? '') && !/Ouvrir|Fermer|Maintenir|Verrou/.test(doorPanel.actions.join(' ')), doorPanel);
  await L.blur(p); await p.keyboard.press('Space'); await L.wait(p, 250);

  // Portes automatiques (2026-11-06) : hostile proche -> fermee ; allie qui approche -> ouverte ; puis refermee.
  await p.evaluate((a) => { const w = window.__world; for (const e of w.entities) if (e.worker) { e.worker.autoRetryIn = 1e9; w.issueCommand({ kind: 'stop', entityIds: [e.id] }); } const d = w.entities.find((e) => e.wall?.door); const f = w.spawn('maraudeur', 'enemy', d.x + a.x * 3.5, d.z + a.z * 3.5); f.order = { type: 'guard' }; f.stats.moveSpeed = 0; f.stats.damage = 0; const h = w.entities.find((e) => e.hero); h.x = h.prevX = d.x - a.x * 7; h.z = h.prevZ = d.z - a.z * 7; h.path = null; h.order = { type: 'guard' }; }, dir);
  const doorOpen = () => p.evaluate(() => window.__world.entities.find((e) => e.wall?.door).wall.door.open);
  let autoClosed = false;
  for (let i = 0; i < 20 && !autoClosed; i++) { await L.wait(p, 200); autoClosed = !(await doorOpen()); }
  await L.setView(p, { targetX: g.x, targetZ: g.z, viewHeight: 11, yawDeg: yawOf(dir.x, dir.z) + 180 + 30, pitchDeg: 30 }); await L.wait(p, 600);
  await p.screenshot({ path: OUT + 'porte-auto-ennemi-fermee.png' });
  check('hostile proche d une porte ouverte : elle se ferme', autoClosed);
  await p.evaluate((a) => { const w = window.__world; const d = w.entities.find((e) => e.wall?.door); const h = w.entities.find((e) => e.hero); w.issueCommand({ kind: 'move', entityIds: [h.id], x: d.x + a.x * 3 + a.z * 3, z: d.z + a.z * 3 - a.x * 3 }); }, dir);
  let autoOpened = false; let shotOpen = false; let heroOut = false; let unreachable = false;
  for (let i = 0; i < 60 && !heroOut; i++) {
    await L.wait(p, 80);
    const s = await p.evaluate(() => { const w = window.__world; const d = w.entities.find((e) => e.wall?.door); const h = w.entities.find((e) => e.hero); return { open: d.wall.door.open, order: h.order.type, dist: Math.hypot(h.x - d.x, h.z - d.z), failed: w.orderEvents.some((ev) => ev.outcome === 'failed') }; });
    if (s.failed) unreachable = true;
    if (s.open) autoOpened = true;
    if (s.open && !shotOpen) { await p.screenshot({ path: OUT + 'porte-auto-allie-ouverte.png' }); shotOpen = true; }
    if (s.order !== 'move') heroOut = true;
  }
  check('allie qui approche la porte fermee, hostile present : elle s ouvre, l ordre aboutit (aucun « Impossible d atteindre »)', autoOpened && heroOut && !unreachable, { autoOpened, heroOut, unreachable });
  let reclosed = false;
  for (let i = 0; i < 20 && !reclosed; i++) { await L.wait(p, 200); reclosed = !(await doorOpen()); }
  check('une fois l allie passe, hostile toujours la : elle se referme', reclosed);

  check('aucune erreur de page', errors.length === 0, errors.slice(0, 3));
  console.log(failures ? failures + ' ECHEC(S)' : 'tout OK');
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
