// Tests cibles SANS NAVIGATEUR de l'or de butin au sol (2026-11-05, decision d'Antoine) : ramasse AUTOMATIQUEMENT
// par le Heros au contact, sans ordre, sans geste (gather) ni duree, sans arret du deplacement ; aucun credit a
// distance ; clic (ordre pickup) = y marcher puis pickup immediat au contact ; jamais le Villageois ; l'or EXTRAIT
// d'un gisement reste du cargo (minedGold -> depot), jamais un lootGold ; un tas de bois garde son geste de 0,6 s.
// Usage : node --import ../ts-register.mjs or-butin.mts (ou npm run test:sim)
const SRC = new URL('../../src/', import.meta.url).href;
const { World } = await import(SRC + 'sim/world.ts');
const { getBuilding } = await import(SRC + 'data/buildings.ts');
const { PICKUP_REACH, PICKUP_SECONDS } = await import(SRC + 'data/hero.ts');
const DT = 1 / 30;
let failures = 0;
const check = (label: string, ok: boolean, extra: unknown = '') => { if (!ok) failures++; console.log(`${ok ? 'OK   ' : 'ECHEC'} ${label}${extra !== '' ? ' — ' + JSON.stringify(extra).slice(0, 900) : ''}`); };

function mk(obstacles: any[] = [], seed = 4) {
  const w = new World(seed);
  w.setMap({ name: 'test', version: 1, width: 40, height: 40, obstacles, playerUnits: [], enemyUnits: [] });
  w.spawnBuilding(getBuilding('ballista'), 'player', -6.5, -6.5, { kind: 'building', x: -6.5, z: -6.5, tilesX: 3, tilesZ: 3 });
  const hero = w.spawnHero('player', 0.5, 0.5, { xp: 0, level: 1, deaths: 0 });
  hero.order = { type: 'guard' };
  return { w, hero };
}

// ---- 1. Le Heros marche sur un tas d'or sans ordre de ramassage : credit au contact, aucun arret.
{
  const { w, hero } = mk();
  const pileId = w.dropGold(5.5, 0.5, 7);
  const pile = w.resourcePiles[pileId];
  w.issueCommand({ kind: 'move', entityIds: [hero.id], x: 10.5, z: 0.5 });
  let loot: any = null; let lootStep = -1; let farCredit = false; let gatherSeen = false; let stopped = false; let contactX = 0;
  const xs: number[] = [];
  for (let i = 0; i < 30 * 8; i++) {
    const d = Math.hypot(pile.x - hero.x, pile.z - hero.z);
    w.step(DT);
    xs.push(hero.x);
    if (hero.hero.working === 'gather') gatherSeen = true;
    for (const ev of w.cargoEvents) if (ev.type === 'lootGold') { loot = ev; lootStep = i; contactX = hero.x; if (d > hero.stats.radius + PICKUP_REACH + hero.stats.moveSpeed * DT) farCredit = true; }
    if (lootStep >= 0 && i > lootStep && i < lootStep + 15 && hero.order.type !== 'move') stopped = true;
  }
  const moving = lootStep >= 0 && xs[lootStep + 10]! > xs[lootStep]! + 0.5;
  check('tas d or (7) sur le chemin : present avant le contact, aucun credit a distance ; au contact : lootGold 7 au meme pas, tas vide, aucun geste gather, le deplacement continue (ordre move garde, x croissant) jusqu a la destination',
    loot?.amount === 7 && loot.pileId === pileId && !farCredit && pile.amount === 0 && !gatherSeen && !stopped && moving && Math.hypot(hero.x - 10.5, hero.z - 0.5) < 0.6 && contactX < 6.5, { loot, lootStep, farCredit, gatherSeen, stopped, moving, contactX: +contactX.toFixed(2), end: [+hero.x.toFixed(2), +hero.z.toFixed(2)] });
}

// ---- 2. Ordre pickup sur un tas d'or : y marcher, puis pickup immediat au contact (pas de gather de 0,6 s).
{
  const { w, hero } = mk();
  const pileId = w.dropGold(0.5, 6.5, 4);
  w.issueCommand({ kind: 'pickup', entityIds: [hero.id], pileId });
  w.step(DT);
  const accepted = w.commandResults[0]?.rejection === null && hero.order.type === 'pickup';
  let loot: any = null; let gatherSeen = false; let orderAfter = '';
  for (let i = 0; i < 30 * 6; i++) { w.step(DT); if (hero.hero.working === 'gather') gatherSeen = true; for (const ev of w.cargoEvents) if (ev.type === 'lootGold') { loot = ev; orderAfter = hero.order.type; } }
  check('ordre pickup sur un tas d or : accepte (le Heros y marche) ; au contact : credit immediat, ordre termine (Garde), jamais de geste gather', accepted && loot?.amount === 4 && !gatherSeen && orderAfter === 'guard' && w.resourcePiles[pileId].amount === 0, { accepted, loot, gatherSeen, orderAfter });
}

// ---- 3. Villageois : ne ramasse jamais l'or de butin (ni en passant, ni sur ordre).
{
  const { w } = mk();
  const v = w.spawn('villageois', 'player', 0.5, 0.5);
  const pileId = w.dropGold(4.5, 0.5, 5);
  w.issueCommand({ kind: 'move', entityIds: [v.id], x: 8.5, z: 0.5 });
  let loot = 0;
  for (let i = 0; i < 30 * 6; i++) { w.step(DT); for (const ev of w.cargoEvents) if (ev.type === 'lootGold') loot++; }
  w.issueCommand({ kind: 'pickup', entityIds: [v.id], pileId });
  for (let i = 0; i < 30 * 6; i++) { w.step(DT); for (const ev of w.cargoEvents) if (ev.type === 'lootGold') loot++; }
  check('Villageois : passe sur le tas d or sans le ramasser ; ordre pickup sur l or : y va, rien ramasse, tas intact', loot === 0 && w.resourcePiles[pileId].amount === 5 && v.order.type === 'guard', { loot, amount: w.resourcePiles[pileId].amount, order: v.order });
}

// ---- 4. Or EXTRAIT d'un gisement : cargo (minedGold), depot, jamais un lootGold ; tas de bois : geste de 0,6 s conserve.
{
  const { w, hero } = mk([{ kind: 'rock', tilesX: 2, tilesZ: 2, cornerX: 3, cornerZ: -1, ore: 'gold' }]);
  const node = [...w.resourceNodes.values()].find((n: any) => n.resource === 'gold');
  w.issueCommand({ kind: 'harvest', entityIds: [hero.id], nodeId: node.id });
  let loot = 0; let deposited = 0; let mined = 0;
  for (let i = 0; i < 30 * 40; i++) {
    w.step(DT);
    mined = Math.max(mined, hero.cargo.minedGold);
    for (const ev of w.cargoEvents) { if (ev.type === 'lootGold') loot++; if (ev.type === 'cargoDeposit' && ev.resource === 'minedGold') deposited += ev.amount; }
  }
  check('or extrait d un gisement : va dans le cargo (minedGold, jusqu a 10), depose a la Baliste (cargoDeposit minedGold), aucun lootGold', mined === 10 && deposited >= 10 && loot === 0, { mined, deposited, loot });
  w.issueCommand({ kind: 'stop', entityIds: [hero.id] }); w.step(DT);
  hero.cargo.minedGold = 0;
  const woodId = w.dropResource('wood', hero.x - 2, hero.z + 1.5, 3);
  w.issueCommand({ kind: 'pickup', entityIds: [hero.id], pileId: woodId });
  let gather = 0; let picked: any = null;
  for (let i = 0; i < 30 * 6 && !picked; i++) { w.step(DT); if (hero.hero.working === 'gather') gather++; for (const ev of w.cargoEvents) if (ev.type === 'pilePickup') picked = ev; }
  check(`tas de bois : geste de ramassage conserve (~${PICKUP_SECONDS} s de gather), bois dans le cargo`, picked?.resource === 'wood' && picked.amount === 3 && gather >= Math.round(PICKUP_SECONDS * 30) - 1, { picked, gather });
}

console.log(failures ? failures + ' ECHEC(S)' : 'tout OK');
