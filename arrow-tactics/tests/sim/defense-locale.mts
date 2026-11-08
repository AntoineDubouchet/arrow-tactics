// Tests cibles SANS NAVIGATEUR de la defense locale des batiments (2026-11-08, decision d'Antoine) : un batiment allie
// qui ENCAISSE des degats (Entity.damageTaken, sim/damage.ts) alerte les unites militaires inactives a moins de
// LOCAL_DEFENSE_RADIUS (22 cases de simulation, jamais la camera) ; Villageois et unites lointaines ne reagissent pas ;
// un ordre manuel (move, attack) n'est jamais ecrase ; les defenseurs rejoignent le bord du batiment puis combattent
// normalement ; fin propre (arrivee, batiment perdu, temps mort) ; temps mort d'alerte de 1 s par batiment ; determinisme.
// Usage : node --import ../ts-register.mjs defense-locale.mts (ou npm run test:sim)
const SRC = new URL('../../src/', import.meta.url).href;
const { World } = await import(SRC + 'sim/world.ts');
const { getBuilding } = await import(SRC + 'data/buildings.ts');
const { applyDamageToEntity } = await import(SRC + 'sim/damage.ts');
const D = await import(SRC + 'sim/systems/localDefense.ts');
const DT = 1 / 30;
let failures = 0;
const check = (label: string, ok: boolean, extra: unknown = '') => { if (!ok) failures++; console.log(`${ok ? 'OK   ' : 'ECHEC'} ${label}${extra !== '' ? ' — ' + JSON.stringify(extra).slice(0, 900) : ''}`); };
const flat = { name: 'test', version: 1, width: 64, height: 64, obstacles: [], playerUnits: [], enemyUnits: [] };
const fp = (id: string, x: number, z: number) => { const d = getBuilding(id); return { kind: 'building', x, z, tilesX: d.footprintTilesX ?? 3, tilesZ: d.footprintTilesZ ?? 3 }; };
const dist = (a: any, b: any) => Math.hypot(a.x - b.x, a.z - b.z);
const run = (w: any, s: number, each?: (i: number) => void) => { for (let i = 0; i < Math.round(s * 30); i++) { each?.(i); w.step(DT); } };

check('constantes : rayon 22 cases, temps mort 1 s, intervention bornee (20 s), sortie a 30 cases', D.LOCAL_DEFENSE_RADIUS === 22 && D.LOCAL_DEFENSE_ALERT_COOLDOWN === 1 && D.LOCAL_DEFENSE_TIMEOUT === 20 && D.LOCAL_DEFENSE_LEAVE_RADIUS === 30);

/** Monde : Hotel de ville a l'origine (4 x 4) ; unites du joueur en Garde (ordre stop applique). */
function setup(seed = 3) {
  const w = new World(seed);
  w.setMap(flat);
  const th = w.spawnBuilding(getBuilding('townhall'), 'player', 0, 0, fp('townhall', 0, 0));
  const guard = (e: any) => { w.issueCommand({ kind: 'stop', entityIds: [e.id] }); return e; };
  return { w, th, guard };
}

// ---- 1. Eligibilite : militaire proche oui ; Villageois non ; militaire lointain non ; ordre manuel conserve ; Heros libre oui.
{
  const { w, th, guard } = setup();
  const near = guard(w.spawn('fantassin', 'player', 10.5, 0.5));
  const vil = guard(w.spawn('villageois', 'player', -10.5, 0.5));
  const far = guard(w.spawn('fantassin', 'player', 0.5, 26.5));
  const moving = w.spawn('fantassin', 'player', 0.5, -10.5);
  w.issueCommand({ kind: 'move', entityIds: [moving.id], x: 0.5, z: -28.5 });
  const foe = w.spawn('maraudeur', 'enemy', 28.5, -28.5);
  foe.stats.maxHp = 1e9; foe.hp = 1e9;
  const attacker = w.spawn('archer', 'player', -10.5, -10.5);
  w.issueCommand({ kind: 'attack', entityIds: [attacker.id], targetEntityId: foe.id });
  const hero = guard(w.spawnHero('player', 8, 8, { xp: 0, level: 1, deaths: 0 }));
  w.step(DT);
  const before = [near, vil, far, moving, attacker, hero].map((e) => e.order.type);
  applyDamageToEntity(th, 10, 'physical');
  w.step(DT);
  const after = [near, vil, far, moving, attacker, hero].map((e) => e.order.type);
  check('batiment touche : militaire inactif a 10 cases -> defend (vers CE batiment) ; Heros libre -> defend ; Villageois a 10 -> rien ; militaire a 26 -> rien ; move et attack manuels conserves',
    JSON.stringify(before) === JSON.stringify(['guard', 'guard', 'guard', 'move', 'attack', 'guard']) && JSON.stringify(after) === JSON.stringify(['defend', 'guard', 'guard', 'move', 'attack', 'defend'])
    && near.order.type === 'defend' && near.order.targetEntityId === th.id && moving.order.type === 'move' && moving.order.z === -28.5 && attacker.order.type === 'attack' && attacker.order.targetEntityId === foe.id,
    { before, after, near: near.order, moving: moving.order });
  const point = near.order.type === 'defend' ? { x: near.order.x, z: near.order.z } : null;
  check('destination : point d approche au bord de l emprise (4 x 4) du cote de l unite, jamais le centre', !!point && point.x > 2 && point.x < 3.2 && Math.abs(point.z - 0.5) < 0.5, point);
  // Trajet : l'unite se rapproche puis Garde a l'arrivee ; le Villageois et le lointain n'ont pas bouge.
  const d0 = dist(near, th); const vil0 = { x: vil.x, z: vil.z }; const far0 = { x: far.x, z: far.z };
  run(w, 8);
  check('le defenseur rejoint le bord du batiment (distance 10 -> ~3) puis repasse en Garde ; Villageois et unite lointaine immobiles', dist(near, th) < d0 - 5 && dist(near, th) < 3.6 && near.order.type === 'guard' && dist(vil, vil0) < 0.05 && dist(far, far0) < 0.05 && far.order.type === 'guard', { d: +dist(near, th).toFixed(2), order: near.order.type });
}
// ---- 2. Temps mort d'alerte : 1 s par batiment.
{
  const { w, th, guard } = setup();
  const u = guard(w.spawn('fantassin', 'player', 10.5, 0.5));
  w.step(DT);
  applyDamageToEntity(th, 5, 'physical'); w.step(DT);
  const first = u.order.type;
  u.order = { type: 'guard' };
  applyDamageToEntity(th, 5, 'physical'); w.step(DT);
  const within = u.order.type;
  run(w, 1.1);
  applyDamageToEntity(th, 5, 'physical'); w.step(DT);
  const later = u.order.type;
  check('temps mort : une alerte, puis plus rien pendant 1 s (coups suivants ignores), puis une nouvelle alerte', first === 'defend' && within === 'guard' && later === 'defend', { first, within, later });
}
// ---- 3. Vrai ennemi au contact du batiment : le defenseur arrive et le combat (ciblage normal), sans tout savoir de la carte.
{
  const { w, th, guard } = setup(5);
  const u = guard(w.spawn('fantassin', 'player', 16.5, 0.5));
  const foe = w.spawn('maraudeur', 'enemy', -3.5, 0.5);
  w.issueCommand({ kind: 'stop', entityIds: [u.id] });
  let defended = false; let engaged = false; let hitBuilding = false;
  run(w, 25, () => { if (u.order.type === 'defend') defended = true; if (u.targetId === foe.id) engaged = true; if (th.hp < th.stats.maxHp) hitBuilding = true; });
  check('ennemi qui frappe l Hotel de ville : l unite a 16 cases (hors de son aggro) recoit l alerte, vient, puis verrouille et combat l attaquant (mort ou engage)', hitBuilding && defended && engaged && (!foe.alive || dist(u, foe) < 3), { hitBuilding, defended, engaged, foeAlive: foe.alive, d: +dist(u, foe).toFixed(2) });
}
// ---- 4. Fin propre : batiment detruit pendant le trajet -> Garde ; temps mort d'intervention.
{
  const { w, th, guard } = setup(7);
  const u = guard(w.spawn('fantassin', 'player', 18.5, 0.5));
  w.step(DT);
  applyDamageToEntity(th, 5, 'physical'); w.step(DT);
  const started = u.order.type === 'defend';
  applyDamageToEntity(th, 1e6, 'physical'); w.step(DT); w.step(DT);
  check('batiment detruit pendant l approche : l intervention s arrete (Garde), aucun evenement d ordre', started && !th.alive && u.order.type === 'guard' && w.orderEvents.length === 0, { started, order: u.order.type, events: w.orderEvents });
}
{
  const { w, th, guard } = setup(8);
  const u = guard(w.spawn('fantassin', 'player', 12.5, 0.5));
  u.stats.moveSpeed = 0.01; // n'avance pas : le watchdog de navigation (G49) abandonne l'ordre, en silence
  w.step(DT);
  applyDamageToEntity(th, 5, 'physical'); w.step(DT);
  const started = u.order.type === 'defend';
  let events = 0; let endTick: number | null = null;
  run(w, 12, () => { events += w.orderEvents.length; if (endTick === null && u.order.type !== 'defend') endTick = w.tick; });
  check('sans progres (unite quasi immobile) : le watchdog de navigation met fin a l intervention (Garde) en quelques secondes, sans aucun evenement d ordre (ordre automatique)', started && u.order.type === 'guard' && endTick !== null && endTick < 12 * 30 && events === 0, { started, endTick, events });
}
{
  const { w, th, guard } = setup(8);
  const u = guard(w.spawn('fantassin', 'player', 12.5, 0.5));
  u.rootTimer = 60; // immobilisee (statut generique) : ni trajet, ni watchdog ; seul le temps mort borne l'intervention
  w.step(DT);
  applyDamageToEntity(th, 5, 'physical'); w.step(DT);
  let maxElapsed = 0;
  run(w, 21, () => { if (u.order.type === 'defend') maxElapsed = Math.max(maxElapsed, u.order.elapsed); });
  check('intervention bornee : unite immobilisee, retour en Garde apres LOCAL_DEFENSE_TIMEOUT (20 s)', u.order.type === 'guard' && maxElapsed > 19.5 && maxElapsed <= 20.1, { order: u.order.type, maxElapsed: +maxElapsed.toFixed(2) });
}
// ---- 5. Deux batiments attaques : une unite en defense garde son intervention.
{
  const { w, th, guard } = setup(9);
  const house = w.spawnBuilding(getBuilding('house'), 'player', 12.5, 12.5, fp('house', 12.5, 12.5));
  const u = guard(w.spawn('fantassin', 'player', 12.5, 0.5));
  w.step(DT);
  applyDamageToEntity(th, 5, 'physical'); w.step(DT);
  const firstTarget = u.order.type === 'defend' ? u.order.targetEntityId : null;
  applyDamageToEntity(house, 5, 'physical'); w.step(DT);
  const secondTarget = u.order.type === 'defend' ? u.order.targetEntityId : null;
  check('deuxieme batiment attaque juste apres : l unite garde sa premiere intervention (pas d oscillation)', firstTarget === th.id && secondTarget === th.id, { firstTarget, secondTarget, house: house.id });
}
// ---- 6. Villageois jamais, meme seul et tout pres ; soin / reparation ne declenchent rien (pas des degats).
{
  const { w, th, guard } = setup(10);
  const vil = guard(w.spawn('villageois', 'player', 4.5, 0.5));
  w.step(DT);
  applyDamageToEntity(th, 20, 'physical'); w.step(DT);
  const vilOrder = vil.order.type;
  const u = guard(w.spawn('fantassin', 'player', 8.5, 0.5));
  run(w, 1.2);
  th.hp += 10; w.step(DT); // soin : aucun degat encaisse
  check('Villageois seul a 4 cases : ne reagit jamais ; des PV rendus ne sont pas une alerte', vilOrder === 'guard' && u.order.type === 'guard', { vilOrder, u: u.order.type });
}
// ---- 7. Determinisme.
{
  const go = () => { const { w, th, guard } = setup(21); const us = [guard(w.spawn('fantassin', 'player', 14.5, 3.5)), guard(w.spawn('archer', 'player', -9.5, 6.5)), guard(w.spawn('fantassin', 'player', 3.5, -15.5))]; const foe = w.spawn('maraudeur', 'enemy', -3.5, 0.5); run(w, 12); return [...us.map((u) => [+u.x.toFixed(4), +u.z.toFixed(4), u.order.type]), foe.alive, th.hp]; };
  const a = go(); const b = go();
  check('determinisme : deux mondes de meme graine identiques (positions, ordres, PV)', JSON.stringify(a) === JSON.stringify(b), a);
}

console.log(failures === 0 ? 'TOUT OK' : `${failures} ECHEC(S)`);
process.exit(failures === 0 ? 0 : 1);
