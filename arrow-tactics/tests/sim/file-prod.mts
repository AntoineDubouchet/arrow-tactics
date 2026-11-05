// Tests cibles SANS NAVIGATEUR de la file de production temps reel : ordre des clics (unites et amelioration
// melangees), seule la premiere avance, file pleine (5), annulation (tete et milieu), batiment detruit, determinisme.
// Usage : node --import ../ts-register.mjs file-prod.mts (ou npm run test:sim)
const SRC = new URL('../../src/', import.meta.url).href;
const { World } = await import(SRC + 'sim/world.ts');
const { DEFAULT_MAP } = await import(SRC + 'config/mapDef.ts');
const { getBuilding } = await import(SRC + 'data/buildings.ts');
const { PRODUCTION_QUEUE_MAX } = await import(SRC + 'data/production.ts');
const DT = 1 / 30;
let failures = 0;
const check = (label: string, ok: boolean, extra: unknown = '') => { if (!ok) failures++; console.log(`${ok ? 'OK   ' : 'ECHEC'} ${label}${extra !== '' ? ' — ' + JSON.stringify(extra).slice(0, 700) : ''}`); };

const mk = () => {
  const w = new World(3);
  w.setMap(DEFAULT_MAP);
  const def = getBuilding('barracks');
  const b = w.spawnBuilding(def, 'player', 0.5, -2.5, { kind: 'building', x: 0.5, z: -2.5, tilesX: def.footprintTilesX, tilesZ: def.footprintTilesZ });
  // Population : une Maison pour ne jamais attendre.
  const hdef = getBuilding('house');
  for (let i = 0; i < 3; i++) w.spawnBuilding(hdef, 'player', -6.5 + i * 3, 4.5, { kind: 'building', x: -6.5 + i * 3, z: 4.5, tilesX: hdef.footprintTilesX, tilesZ: hdef.footprintTilesZ });
  return { w, b };
};
// Journal : chaque sortie (unite ou amelioration) dans l'ordre, avec le temps.
const run = (w: any, seconds: number, log: string[]) => { for (let t = 0; t < seconds; t += DT) { w.step(DT); for (const e of w.productionSpawnEvents) log.push(`${e.unitId}@${w.tick}`); for (const e of w.productionUpgradeEvents) log.push(`upgrade#${e.orderId}@${w.tick}`); } };

{
  const { w, b } = mk();
  const ids = [
    w.queueProduction(b.id, { kind: 'unit', unitId: 'piquier' }, 2),
    w.queueProduction(b.id, { kind: 'unit', unitId: 'piquier' }, 2),
    w.queueProduction(b.id, { kind: 'upgrade' }, 3),
    w.queueProduction(b.id, { kind: 'unit', unitId: 'piquier' }, 2),
    w.queueProduction(b.id, { kind: 'unit', unitId: 'piquier' }, 2),
  ];
  const sixth = w.queueProduction(b.id, { kind: 'unit', unitId: 'piquier' }, 2);
  check(`file : ${PRODUCTION_QUEUE_MAX} commandes acceptees (ids distincts), la 6e refusee (file pleine)`, ids.every((i: any) => typeof i === 'number') && new Set(ids).size === 5 && sixth === null && b.productionOrders.length === 5, { ids, sixth });
  // Seule la premiere avance.
  run(w, 1, []);
  const rem = b.productionOrders.map((o: any) => +o.remaining.toFixed(2));
  check('seule la premiere commande avance (les autres gardent leur duree complete)', rem[0] < 1.1 && rem.slice(1).every((r: number, i: number) => r === [2, 3, 2, 2][i]), rem);
  const log: string[] = [];
  run(w, 12, log);
  const kinds = log.map((s) => s.split('@')[0]!.replace(/#\d+/, ''));
  const ticks = log.map((s) => Number(s.split('@')[1]));
  check('ordre des clics respecte : Piquier, Piquier, amelioration, Piquier, Piquier ; l une apres l autre (2 s, 2 s, 3 s, 2 s, 2 s)', JSON.stringify(kinds) === JSON.stringify(['piquier', 'piquier', 'upgrade', 'piquier', 'piquier']) && ticks.every((t, i) => i === 0 || t > ticks[i - 1]!) && b.productionOrders.length === 0, { log });
}

{
  // Annulation : milieu puis tete (la suivante repart de sa duree complete).
  const { w, b } = mk();
  const a = w.queueProduction(b.id, { kind: 'unit', unitId: 'piquier' }, 4);
  const up = w.queueProduction(b.id, { kind: 'upgrade' }, 3);
  const c = w.queueProduction(b.id, { kind: 'unit', unitId: 'piquier' }, 2);
  run(w, 1, []);
  const removedMid = w.cancelProduction(b.id, up);
  const removedHead = w.cancelProduction(b.id, a);
  const again = w.cancelProduction(b.id, a);
  const left = b.productionOrders.map((o: any) => [o.id, o.kind, +o.remaining.toFixed(2)]);
  const log: string[] = [];
  run(w, 3, log);
  check('annulation : commande du milieu (amelioration) et de tete retirees et renvoyees ; une 2e annulation ne trouve rien ; la suivante repart de sa duree complete (2 s), aucune amelioration', removedMid?.kind === 'upgrade' && removedHead?.kind === 'unit' && again === null && left.length === 1 && left[0][0] === c && left[0][2] === 2 && log.length === 1 && log[0]!.startsWith('piquier'), { left, log });
}

{
  // Batiment detruit : file perdue ; chantier : n'avance pas ; refus pour un ennemi.
  const { w, b } = mk();
  w.queueProduction(b.id, { kind: 'unit', unitId: 'piquier' }, 2);
  b.hp = 0; b.alive = false;
  const log: string[] = [];
  run(w, 3, log);
  const def = getBuilding('barracks');
  const site = w.spawnBuilding(def, 'player', 8.5, -2.5, { kind: 'building', x: 8.5, z: -2.5, tilesX: def.footprintTilesX, tilesZ: def.footprintTilesZ }, undefined, undefined, undefined, { progress: 0.1, buildTime: 30 });
  const surChantier = w.queueProduction(site.id, { kind: 'unit', unitId: 'piquier' }, 2);
  const enemy = w.spawnBuilding(def, 'enemy', 8.5, 6.5, { kind: 'building', x: 8.5, z: 6.5, tilesX: def.footprintTilesX, tilesZ: def.footprintTilesZ });
  const ennemi = w.queueProduction(enemy.id, { kind: 'unit', unitId: 'piquier' }, 2);
  check('batiment detruit : file videe, rien ne sort ; chantier et batiment ennemi : commande refusee', b.productionOrders.length === 0 && log.length === 0 && surChantier === null && ennemi === null, { log, surChantier, ennemi });
}

{
  // Progression affichee (G47) : barre commune, seul le premier ordre progresse, le suivant repart de 0.
  const { orderProgress } = await import(SRC + 'run/productionOrders.ts');
  const { w, b } = mk();
  w.queueProduction(b.id, { kind: 'unit', unitId: 'piquier' }, 2);
  w.queueProduction(b.id, { kind: 'unit', unitId: 'piquier' }, 2);
  const start = orderProgress(b.productionOrders[0]);
  run(w, 1, []);
  const mid = orderProgress(b.productionOrders[0]);
  const waiting = orderProgress(b.productionOrders[1]);
  check('progression : premiere commande entre 0 et 100 %, deuxieme a 0 (en attente)', start.progress === 0 && mid.progress > 0.4 && mid.progress < 0.6 && waiting.progress === 0 && waiting.remaining === 2, { start, mid, waiting });
  run(w, 1.1, []);
  const next = orderProgress(b.productionOrders[0]);
  check('premiere terminee : la suivante devient la tete et repart de 0 (a peine commencee)', b.productionOrders.length === 1 && next.progress < 0.1 && next.remaining > 1.8, next);
  check('duree nulle : progression pleine, pas de division par zero', orderProgress({ ...b.productionOrders[0], total: 0, remaining: 0 }).progress === 1);
}

{
  // Determinisme.
  const sig = () => { const { w, b } = mk(); for (const k of ['unit', 'upgrade', 'unit']) w.queueProduction(b.id, k === 'unit' ? { kind: 'unit', unitId: 'piquier' } : { kind: 'upgrade' }, 2); const log: string[] = []; run(w, 8, log); return JSON.stringify([log, w.entities.map((e: any) => [e.id, e.unitId, Math.round(e.x * 1000), Math.round(e.z * 1000)])]); };
  check('determinisme : memes commandes -> memes sorties, memes positions', sig() === sig());
}
console.log(failures ? failures + ' ECHEC(S)' : 'tout OK');
