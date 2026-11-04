// Tests cibles SANS NAVIGATEUR de l'autonomie des Villageois (2026-11-05, decision d'Antoine) : un Villageois inactif
// plus de 1 s se choisit une source ; ressource la MOINS travaillee par les autres Villageois (bois, pierre, or), egalite
// -> source valide la plus proche, puis id ; 3 Villageois -> 3 ressources distinctes ; un 4e -> la plus proche parmi
// les egalites ; ordre manuel jamais interrompu, autonomie 1 s apres sa fin ; aucune source -> reste inactif (nouvel
// essai apres 5 s, pas a chaque pas) ; source epuisee -> nouveau travail apres retour a l'inactivite ; depot / retour
// ne comptent pas comme inactif (pas de reequilibrage en cours de cycle) ; determinisme.
// Usage : node --import ../ts-register.mjs villageois-autonomie.mts (ou npm run test:sim)
const SRC = new URL('../../src/', import.meta.url).href;
const { World } = await import(SRC + 'sim/world.ts');
const { getBuilding } = await import(SRC + 'data/buildings.ts');
const { WORKER_IDLE_SECONDS, WORKER_AUTO_RETRY_SECONDS } = await import(SRC + 'data/hero.ts');
const { chooseWork } = await import(SRC + 'sim/systems/workers.ts');
const DT = 1 / 30;
let failures = 0;
const check = (label: string, ok: boolean, extra: unknown = '') => { if (!ok) failures++; console.log(`${ok ? 'OK   ' : 'ECHEC'} ${label}${extra !== '' ? ' — ' + JSON.stringify(extra).slice(0, 900) : ''}`); };
const run = (w: any, seconds: number) => { for (let t = 0; t < seconds - 1e-9; t += DT) w.step(DT); };

/** Carte plate : un arbre a l'est, un gisement de pierre a l'ouest, un gisement d'or au nord ; Baliste au centre (point de collecte). */
const sources = { tree: { kind: 'tree', x: 6.5, z: 0.5, tilesX: 1, tilesZ: 1 }, stone: { kind: 'rock', tilesX: 2, tilesZ: 2, cornerX: -8, cornerZ: -1 }, gold: { kind: 'rock', tilesX: 2, tilesZ: 2, cornerX: -1, cornerZ: 6, ore: 'gold' } };
function mk(obstacles: any[] = [sources.tree, sources.stone, sources.gold], seed = 3) {
  const w = new World(seed);
  w.setMap({ name: 'test', version: 1, width: 40, height: 40, obstacles, playerUnits: [], enemyUnits: [] });
  const b = getBuilding('ballista');
  w.spawnBuilding(b, 'player', 0.5, 0.5, { kind: 'building', x: 0.5, z: 0.5, tilesX: 3, tilesZ: 3 });
  const spawn = (x: number, z: number) => { const e = w.spawn('villageois', 'player', x, z); e.order = { type: 'guard' }; return e; };
  const resOf = (e: any) => { const o = e.order; if (o.type === 'harvest') return w.resourceNodes.get(o.nodeId)?.resource ?? null; if (o.type === 'deposit' && e.cargo.returnTo?.kind === 'node') return w.resourceNodes.get(e.cargo.returnTo.nodeId)?.resource ?? null; return null; };
  return { w, spawn, resOf };
}

// ---- 1. Trois Villageois inactifs : rien avant 1 s, puis trois ressources distinctes.
{
  const { w, spawn, resOf } = mk();
  const vs = [spawn(0.5, -3.5), spawn(1.5, -3.5), spawn(2.5, -3.5)];
  run(w, 0.9);
  const early = vs.map((v) => v.order.type);
  run(w, 0.3);
  const res = vs.map(resOf);
  check(`3 Villageois inactifs : encore en Garde a 0,9 s ; a ${WORKER_IDLE_SECONDS} s chacun part recolter une ressource DIFFERENTE (bois, pierre, or)`, early.every((t) => t === 'guard') && res.every((r) => r !== null) && new Set(res).size === 3, { early, res });
  // 4e Villageois : toutes les ressources a 1 travailleur -> la source valide la plus proche de lui (l'arbre, a l'est).
  const v4 = spawn(3.5, -2.5);
  const expected = chooseWork(v4, w.entities, (w as any).heroWork());
  run(w, 1.1);
  const r4 = resOf(v4);
  const treeNode = [...w.resourceNodes.values()].find((n: any) => n.resource === 'wood');
  check('4e Villageois (egalite 1 / 1 / 1) : la source valide la plus proche de lui (l arbre, a l est), choix identique a chooseWork', r4 === 'wood' && v4.order.nodeId === treeNode.id && expected === treeNode.id, { r4, expected, tree: treeNode.id, order: v4.order });
  // Une fois affectes, aucun reequilibrage : 10 s plus tard, chacun est toujours sur sa ressource (ou en depot vers elle).
  const before = vs.map(resOf);
  run(w, 10);
  const after = vs.map(resOf);
  check('aucun reequilibrage permanent : 10 s plus tard, les 3 premiers gardent leur ressource (cycle recolte / depot / retour)', JSON.stringify(before) === JSON.stringify(after) && after.every((r) => r !== null), { before, after });
}

// ---- 2. Ordre manuel prioritaire, puis autonomie 1 s apres sa fin.
{
  const { w, spawn, resOf } = mk();
  const v = spawn(0.5, -3.5);
  w.issueCommand({ kind: 'move', entityIds: [v.id], x: 0.5, z: -12.5 });
  let overridden = false; let arrived = -1;
  for (let i = 0; i < 30 * 12; i++) { w.step(DT); if (v.order.type === 'harvest' && arrived < 0) overridden = true; if (arrived < 0 && v.order.type === 'guard') arrived = i; }
  const atArrival = { order: v.order.type, idle: +v.worker.idleSeconds.toFixed(2) };
  const steps = 30 * 12 - arrived - 1;
  check('ordre manuel (deplacement de 9 cases, > 1 s) : jamais remplace en chemin ; arrive en Garde, puis autonome ~1 s apres (recolte)', !overridden && arrived > 30 && resOf(v) !== null && steps >= 29 && v.order.type === 'harvest', { overridden, arrived, atArrival, final: v.order });
  // Ordre manuel pendant un travail autonome : respecte, et la source autonome oubliee.
  w.issueCommand({ kind: 'stop', entityIds: [v.id] });
  w.step(DT);
  const stopped = { order: v.order.type, autoNode: v.worker.autoNodeId };
  run(w, 1.1);
  check('Stop pendant le travail autonome : Garde immediate, puis nouveau choix 1 s plus tard', stopped.order === 'guard' && v.order.type === 'harvest', { stopped, order: v.order });
}

// ---- 3. Aucune source : reste inactif, nouvel essai periodique seulement.
{
  const { w, spawn } = mk([]);
  const v = spawn(0.5, -3.5);
  run(w, 3);
  const idle3 = { order: v.order.type, retry: +v.worker.autoRetryIn.toFixed(2) };
  check(`aucune source valide : le Villageois reste en Garde ; nouvel essai programme (${WORKER_AUTO_RETRY_SECONDS} s), pas a chaque pas`, idle3.order === 'guard' && idle3.retry > 0 && idle3.retry <= WORKER_AUTO_RETRY_SECONDS, idle3);
}

// ---- 4. Source epuisee : fin du cycle (depot), puis nouveau travail sur une autre ressource.
{
  const { w, spawn, resOf } = mk();
  const v = spawn(5.5, 0.5);
  const tree = [...w.resourceNodes.values()].find((n: any) => n.resource === 'wood');
  w.resourceNodeAmounts.set(tree.id, 1);
  run(w, 1.1);
  const first = resOf(v);
  let dep = 0;
  for (let i = 0; i < 30 * 25; i++) { w.step(DT); for (const ev of w.cargoEvents) if (ev.type === 'cargoDeposit' && ev.resource === 'wood') dep += ev.amount; }
  const second = resOf(v);
  check('arbre (1 bois) choisi puis epuise : depot du bois, puis, inactif, nouveau travail sur une autre ressource (pierre ou or)', first === 'wood' && dep === 1 && w.depletedResourceNodes.has(tree.id) && second !== null && second !== 'wood', { first, dep, second, order: v.order });
}

// ---- 5. Depot / retour ne comptent pas comme inactif ; la source reste la meme.
{
  const { w, spawn } = mk();
  const v = spawn(5.5, 0.5);
  run(w, 1.1);
  const nodeId = v.order.nodeId;
  let sawDeposit = false; let idleDuringDeposit = 0; let resumedSame = false;
  for (let i = 0; i < 30 * 30; i++) {
    w.step(DT);
    if (v.order.type === 'deposit') { sawDeposit = true; idleDuringDeposit = Math.max(idleDuringDeposit, v.worker.idleSeconds); }
    if (sawDeposit && v.order.type === 'harvest' && v.order.nodeId === nodeId) { resumedSame = true; break; }
  }
  check('cycle : cargo plein -> depot (jamais compte inactif : idleSeconds reste 0) -> retour a la MEME source (pas de nouveau choix)', sawDeposit && idleDuringDeposit === 0 && resumedSame && v.worker.autoNodeId === nodeId, { sawDeposit, idleDuringDeposit, resumedSame, auto: v.worker.autoNodeId, nodeId });
}

// ---- 6. Determinisme.
{
  const trace = () => { const { w, spawn } = mk([sources.tree, sources.stone, sources.gold], 9); const vs = [spawn(0.5, -3.5), spawn(1.5, -3.5), spawn(2.5, -3.5), spawn(3.5, -2.5)]; run(w, 40); return JSON.stringify(vs.map((v) => [v.order.type, v.order.nodeId ?? null, +v.x.toFixed(4), +v.z.toFixed(4), v.cargo.wood, v.cargo.stone, v.cargo.minedGold])); };
  const a = trace(), b = trace();
  check('determinisme : deux simulations identiques (4 Villageois autonomes, 40 s)', a === b, a);
}

console.log(failures ? failures + ' ECHEC(S)' : 'tout OK');
