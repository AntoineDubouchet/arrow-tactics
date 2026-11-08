// Tests cibles SANS NAVIGATEUR de la reparation manuelle (2026-11-08, decision d'Antoine) : capacite generique
// `canRepair` (Heros, Villageois ; jamais une unite militaire), ordre `repair` accepte pour les deux, approche puis PV
// rendus au contact dans la limite du budget paye, refus si batiment intact ou unite incapable, interruption (autre
// ordre, mort du reparateur, batiment detruit) avec evenement `repairEnd` pour le remboursement, determinisme.
// Usage : node --import ../ts-register.mjs reparation.mts (ou npm run test:sim)
const SRC = new URL('../../src/', import.meta.url).href;
const { World } = await import(SRC + 'sim/world.ts');
const { getBuilding } = await import(SRC + 'data/buildings.ts');
const { canRepair } = await import(SRC + 'sim/orders.ts');
const { applyDamageToEntity } = await import(SRC + 'sim/damage.ts');
const { REPAIR_FULL_SECONDS } = await import(SRC + 'data/hero.ts');
const { repairCost, repairRefund } = await import(SRC + 'run/buildingRepair.ts');
const DT = 1 / 30;
let failures = 0;
const check = (label: string, ok: boolean, extra: unknown = '') => { if (!ok) failures++; console.log(`${ok ? 'OK   ' : 'ECHEC'} ${label}${extra !== '' ? ' — ' + JSON.stringify(extra).slice(0, 900) : ''}`); };
const flat = { name: 'test', version: 1, width: 40, height: 40, obstacles: [], playerUnits: [], enemyUnits: [] };
const fp = (id: string, x: number, z: number) => { const d = getBuilding(id); return { kind: 'building', x, z, tilesX: d.footprintTilesX ?? 3, tilesZ: d.footprintTilesZ ?? 3 }; };
let nextRepairId = 1;
/** PV retires sans passer par les degats : un batiment endommage, sans alerte de defense locale (sim/systems/localDefense.ts). */
const hurt = (b: any, n: number) => { b.hp -= n; };

function setup(kind: 'hero' | 'villageois' | 'fantassin', at = { x: 7, z: 0.5 }, seed = 3) {
  const w = new World(seed);
  w.setMap(flat);
  const th = w.spawnBuilding(getBuilding('townhall'), 'player', 0, 0, fp('townhall', 0, 0));
  const u = kind === 'hero' ? w.spawnHero('player', at.x, at.z, { xp: 0, level: 1, deaths: 0 }) : w.spawn(kind, 'player', at.x, at.z);
  w.issueCommand({ kind: 'stop', entityIds: [u.id] });
  w.step(DT);
  return { w, th, u };
}
/** Ordre de reparation de tout le manque de PV (comme le clic droit de main.ts). */
function orderRepair(w: any, u: any, th: any) {
  const budgetHp = th.stats.maxHp - th.hp;
  const repairId = nextRepairId++;
  w.issueCommand({ kind: 'repair', entityIds: [u.id], targetEntityId: th.id, repairId, budgetHp });
  w.step(DT);
  return { repairId, budgetHp, result: w.commandResults[0] };
}
/** Suit jusqu'a `repairEnd` (ou `maxS`) : evenement, PV mini du batiment, geste vu, distance min. */
function follow(w: any, u: any, th: any, maxS: number, each?: (i: number) => void) {
  let end: any = null; let hammer = false; let minD = Infinity; let hpStart = th.hp;
  for (let i = 0; i < Math.round(maxS * 30) && !end; i++) {
    each?.(i);
    w.step(DT);
    const worker = u.hero ?? u.worker;
    if (worker?.working === 'build') hammer = true;
    minD = Math.min(minD, Math.hypot(u.x - th.x, u.z - th.z));
    end = w.heroEvents.find((ev: any) => ev.type === 'repairEnd') ?? null;
  }
  return { end, hammer, minD: +minD.toFixed(2), hpStart, hpEnd: th.hp };
}

// ---- Capacite generique.
{
  const { w, u: hero } = setup('hero');
  const vil = w.spawn('villageois', 'player', 9, 2); const foot = w.spawn('fantassin', 'player', 9, -2); const foe = w.spawn('maraudeur', 'enemy', 15, 0.5);
  check('canRepair : Heros et Villageois oui ; Homme d armes et ennemi non (une seule regle, aucun test de type disperse)', canRepair(hero) && canRepair(vil) && !canRepair(foot) && !canRepair(foe));
}
// ---- Heros puis Villageois : approche, geste, PV rendus, fin « done ».
for (const kind of ['hero', 'villageois'] as const) {
  const { w, th, u } = setup(kind, { x: 9, z: 0.5 });
  hurt(th, 100);
  const { repairId, budgetHp, result } = orderRepair(w, u, th);
  const r = follow(w, u, th, 25);
  const expectedS = (100 / th.stats.maxHp) * REPAIR_FULL_SECONDS;
  check(`${kind === 'hero' ? 'Heros' : 'Villageois'} : clic droit manuel accepte -> approche (distance diminue) -> geste de construction -> PV 200 -> 300 ; repairEnd done, 100 PV rendus sur un budget de 100 ; fin en ~${expectedS.toFixed(0)} s + trajet`,
    result.rejection === null && r.end?.reason === 'done' && r.end.repairId === repairId && Math.abs(r.end.restoredHp - budgetHp) < 1e-6 && th.hp === th.stats.maxHp && r.hammer && r.minD < 9 && u.order.type === 'guard' && (u.hero ?? u.worker).repairJob === null,
    { rejection: result.rejection, end: r.end, hammer: r.hammer, minD: r.minD, hp: th.hp, order: u.order.type });
}
// ---- Refus : batiment intact ; unite incapable ; chantier.
{
  const { w, th, u } = setup('villageois');
  const { result } = orderRepair(w, u, th);
  check('batiment a PV max : commande refusee (invalid-target), aucun ordre', result.rejection === 'invalid-target' && u.order.type === 'guard');
  hurt(th, 50);
  const foot = w.spawn('fantassin', 'player', 7, 3);
  w.issueCommand({ kind: 'stop', entityIds: [foot.id] }); w.step(DT);
  const r2 = orderRepair(w, foot, th);
  check('Homme d armes : commande refusee (no-commandable-entity), le batiment reste endommage', r2.result.rejection === 'no-commandable-entity' && r2.result.rejectedEntityIds.includes(foot.id) && foot.order.type === 'guard' && th.hp === th.stats.maxHp - 50);
  const site = w.spawnBuilding(getBuilding('house'), 'player', 10, 10, fp('house', 10, 10), undefined, undefined, undefined, { progress: 0.2, buildTime: 5 });
  w.issueCommand({ kind: 'repair', entityIds: [u.id], targetEntityId: site.id, repairId: 99, budgetHp: 10 }); w.step(DT);
  check('chantier : jamais repare (invalid-target) — il se construit', w.commandResults[0].rejection === 'invalid-target');
}
// ---- Interruption par un autre ordre : remboursement de la part non utilisee.
{
  const { w, th, u } = setup('villageois', { x: 4, z: 0.5 });
  hurt(th, 150);
  const { budgetHp } = orderRepair(w, u, th);
  let end: any = null;
  const r = follow(w, u, th, 60, (i) => { if (i === 90) w.issueCommand({ kind: 'move', entityIds: [u.id], x: 10, z: 10 }); });
  end = r.end;
  const cost = repairCost('townhall', budgetHp / th.stats.maxHp);
  const refund = repairRefund(cost, 1 - end.restoredHp / end.budgetHp);
  check('ordre de deplacement pendant la reparation : repairEnd interrupted, PV partiellement rendus (0 < rendu < budget), remboursement proportionnel (regle de run/buildingRepair.ts)',
    end?.reason === 'interrupted' && end.restoredHp > 0 && end.restoredHp < budgetHp - 1e-6 && th.hp > th.stats.maxHp - 150 && th.hp < th.stats.maxHp && refund.wood >= 0 && u.order.type === 'move',
    { end, hp: th.hp, cost, refund });
}
// ---- Mort du reparateur, batiment detruit : fin propre.
{
  const { w, th, u } = setup('villageois', { x: 4, z: 0.5 });
  hurt(th, 150);
  orderRepair(w, u, th);
  const r = follow(w, u, th, 60, (i) => { if (i === 60) applyDamageToEntity(u, 1e6, 'physical'); });
  check('Villageois tue pendant la reparation : repairEnd interrupted (budget rendu par l orchestration), batiment partiellement repare', r.end?.reason === 'interrupted' && !u.alive && th.hp > th.stats.maxHp - 150 && th.hp < th.stats.maxHp, { end: r.end, hp: th.hp });
}
{
  const { w, th, u } = setup('hero', { x: 4, z: 0.5 });
  hurt(th, 150);
  orderRepair(w, u, th);
  const r = follow(w, u, th, 60, (i) => { if (i === 60) applyDamageToEntity(th, 1e6, 'physical'); });
  check('batiment detruit pendant la reparation : ordre annule proprement (Garde), repairEnd interrupted', r.end?.reason === 'interrupted' && !th.alive && u.order.type === 'guard' && u.hero.repairJob === null, { end: r.end, order: u.order.type });
}
// ---- Deux reparateurs, meme paiement : refuse par design cote orchestration ; ici un seul ordre par batiment a la fois.
// ---- Determinisme.
{
  const run = () => { const { w, th, u } = setup('villageois', { x: 9, z: 0.5 }, 7); hurt(th, 120); orderRepair(w, u, th); const r = follow(w, u, th, 25); return [r.end?.restoredHp, +u.x.toFixed(4), +u.z.toFixed(4), w.tick]; };
  const a = run(); const b = run();
  check('determinisme : deux executions identiques (PV rendus, position, pas)', JSON.stringify(a) === JSON.stringify(b), { a, b });
}

console.log(failures === 0 ? 'TOUT OK' : `${failures} ECHEC(S)`);
process.exit(failures === 0 ? 0 : 1);
