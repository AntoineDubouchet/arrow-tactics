// Tests cibles SANS NAVIGATEUR de l'autonomie des Villageois (2026-11-05, decision d'Antoine) : un Villageois inactif
// plus de 1 s se choisit une source ; ressource la MOINS travaillee par les autres Villageois (bois, pierre, or), egalite
// -> source valide la plus proche, puis id ; 3 Villageois -> 3 ressources distinctes ; un 4e -> la plus proche parmi
// les egalites ; ordre manuel jamais interrompu, autonomie 1 s apres sa fin ; aucune source -> reste inactif (nouvel
// essai apres 5 s, pas a chaque pas) ; source epuisee -> nouveau travail apres retour a l'inactivite ; depot / retour
// ne comptent pas comme inactif (pas de reequilibrage en cours de cycle) ; determinisme.
// Passe corrective (2026-11-05) : seules les sources VISIBLES (World.visibility, brouillard resolu par l'orchestration)
// participent au choix, une ressource sans source visible est hors du minimum, perdre la vision ne fait pas lacher le
// travail ; portee de recolte du Villageois au contact du bord (WORKER_HARVEST_REACH, arbre / pierre / or) ; quantites
// 75 bois / 250 pierre / 250 or (HARVEST_NODE_KINDS, seule source de verite), decompte, epuisement a 0, tas inchanges.
// Source enfermee (aucun cote libre) : refusee par l'autonomie (abandon immediat, Garde, evitee, autre source choisie),
// ordre manuel arrete proprement (evenement `unreachable`, aucun tic de recolte), Heros compris. Source a cote libre
// mais sans aucun chemin (region coupee) : meme contrat (autonomie, ordre manuel, Heros) ; chemin direct bloque mais
// detour valide : la recolte se fait normalement.
// Usage : node --import ../ts-register.mjs villageois-autonomie.mts (ou npm run test:sim)
const SRC = new URL('../../src/', import.meta.url).href;
const { World } = await import(SRC + 'sim/world.ts');
const { getBuilding } = await import(SRC + 'data/buildings.ts');
const { WORKER_IDLE_SECONDS, WORKER_AUTO_RETRY_SECONDS, WORKER_HARVEST_REACH, HARVEST_REACH } = await import(SRC + 'data/hero.ts');
const { HARVEST_NODE_KINDS, TREE_WOOD_AMOUNT, STONE_DEPOSIT_AMOUNT, GOLD_DEPOSIT_AMOUNT } = await import(SRC + 'data/resources.ts');
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
  for (let i = 0; i < 30 * 45; i++) {
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

// ---- 7. Visibilite (2026-11-05) : seules les sources visibles participent au choix.
{
  const { w, spawn, resOf } = mk();
  const nodeOf = (r: string) => [...w.resourceNodes.values()].find((n: any) => n.resource === r);
  const gold = nodeOf('gold'), stone = nodeOf('stone'), tree = nodeOf('wood');
  const hide = (nodes: any[]) => { w.visibility = (x: number, z: number) => !nodes.some((n) => Math.hypot(x - n.x, z - n.z) < 1.5); };
  hide([gold]);
  const vs = [spawn(0.5, -3.5), spawn(1.5, -3.5)];
  run(w, 1.1);
  const two = vs.map(resOf).sort();
  // 3e Villageois : bois et pierre a 1 travailleur, or (0 travailleur) INVISIBLE -> jamais l'or ; la plus proche des deux visibles.
  const v3 = spawn(0.5, -2.5);
  run(w, 1.1);
  const three = resOf(v3);
  check('or hors de vue, bois et pierre visibles : 2 Villageois -> bois + pierre ; un 3e (or a 0 travailleur mais invisible) choisit bois ou pierre, jamais l or', two.join() === 'stone,wood' && (three === 'wood' || three === 'stone'), { two, three });
  // Or rendu visible : au prochain choix, il est pris (0 travailleur).
  w.visibility = null;
  const v4 = spawn(1.5, -2.5);
  run(w, 1.1);
  check('or de nouveau visible : le Villageois suivant le choisit (ressource la moins travaillee)', resOf(v4) === 'gold' && v4.order.nodeId === gold.id, { r: resOf(v4), order: v4.order });
  // Perte de vision apres affectation : le travail continue (vision relue seulement au choix).
  hide([gold]);
  run(w, 8);
  check('source choisie puis masquee par le brouillard : le Villageois continue son cycle sur l or (vision relue seulement au CHOIX)', resOf(v4) === 'gold' && (v4.order.type === 'harvest' || v4.order.type === 'deposit') && v4.worker.autoNodeId === gold.id, { r: resOf(v4), order: v4.order, auto: v4.worker.autoNodeId });
  // Tout invisible : aucun choix (pas de radar economique), nouvel essai periodique.
  hide([gold, stone, tree]);
  const v5 = spawn(2.5, -2.5);
  run(w, 3);
  check('aucune source visible : le Villageois reste en Garde (pas de radar economique), nouvel essai programme', v5.order.type === 'guard' && v5.worker.autoRetryIn > 0, { order: v5.order, retry: v5.worker.autoRetryIn });
  // Sans brouillard (visibility null) : chooseWork identique au contexte « tout visible ».
  w.visibility = null;
  const v6 = spawn(3.5, -2.5);
  const expected = chooseWork(v6, w.entities, (w as any).heroWork());
  run(w, 1.1);
  check('sans brouillard (World.visibility = null) : tout est visible, choix identique a chooseWork', expected !== null && v6.order.type === 'harvest' && v6.order.nodeId === expected, { expected, order: v6.order });
}

// ---- 8. Portee de recolte du Villageois : au contact du bord de la source (arbre, pierre, or).
{
  const boxDist = (e: any, b: any) => { const dx = Math.max(b.minX - e.x, 0, e.x - b.maxX); const dz = Math.max(b.minZ - e.z, 0, e.z - b.maxZ); return Math.hypot(dx, dz); };
  const rows: any[] = [];
  for (const [r, from] of [['wood', [2.5, 0.5]], ['stone', [-3.5, 0.5]], ['gold', [0.5, 3.5]]] as const) {
    const { w, spawn } = mk();
    const node = [...w.resourceNodes.values()].find((n: any) => n.resource === r);
    const v = spawn(from[0], from[1]);
    v.worker.autoRetryIn = 1e9;
    w.issueCommand({ kind: 'harvest', entityIds: [v.id], nodeId: node.id });
    let at: any = null;
    for (let i = 0; i < 30 * 20 && !at; i++) { w.step(DT); const got = r === 'gold' ? v.cargo.minedGold : v.cargo[r]; if (got >= 1) at = { x: v.x, z: v.z }; }
    const gap = at ? boxDist(at, node.block) - v.stats.radius : NaN;
    rows.push({ r, gap: +gap.toFixed(3), inside: at ? boxDist(at, node.block) === 0 : null, radius: v.stats.radius });
  }
  check(`premiere unite recoltee : le bord du corps du Villageois est a <= ${WORKER_HARVEST_REACH} du bord geometrique de la source (arbre 1 x 1, pierre 2 x 2, or 2 x 2), jamais dedans ; plus court que la portee du Heros (${HARVEST_REACH})`, WORKER_HARVEST_REACH < HARVEST_REACH && rows.every((q) => Number.isFinite(q.gap) && q.gap <= WORKER_HARVEST_REACH + 1e-6 && q.inside === false), rows);
}

// ---- 9. Quantites (2026-11-05) : 75 bois, 250 pierre, 250 or ; decompte ; epuisement a 0 ; tas inchanges.
{
  const { w, spawn } = mk();
  const amounts = Object.fromEntries([...w.resourceNodes.values()].map((n: any) => [n.resource, w.resourceNodeAmounts.get(n.id)]));
  check('source de verite : HARVEST_NODE_KINDS = 75 bois / 250 pierre / 250 or, constantes derivees egales, quantites initiales du monde identiques', HARVEST_NODE_KINDS.wood.amount === 75 && HARVEST_NODE_KINDS.stone.amount === 250 && HARVEST_NODE_KINDS.gold.amount === 250 && TREE_WOOD_AMOUNT === 75 && STONE_DEPOSIT_AMOUNT === 250 && GOLD_DEPOSIT_AMOUNT === 250 && amounts.wood === 75 && amounts.stone === 250 && amounts.gold === 250, amounts);
  // Decompte : 1 unite par coup ; la source garde amount - cargo.
  const tree = [...w.resourceNodes.values()].find((n: any) => n.resource === 'wood');
  const v = spawn(2.5, 0.5); v.worker.autoRetryIn = 1e9;
  w.issueCommand({ kind: 'harvest', entityIds: [v.id], nodeId: tree.id });
  for (let i = 0; i < 30 * 12 && v.cargo.wood < 3; i++) w.step(DT);
  check('decompte : 3 bois coupes -> l arbre passe de 75 a 72', v.cargo.wood === 3 && w.resourceNodeAmounts.get(tree.id) === 72, { cargo: v.cargo.wood, reste: w.resourceNodeAmounts.get(tree.id) });
  // Epuisement : quantite ramenee a 2, puis coupee jusqu'a 0 -> source epuisee (regle inchangee).
  w.resourceNodeAmounts.set(tree.id, 2);
  for (let i = 0; i < 30 * 12 && !w.depletedResourceNodes.has(tree.id); i++) w.step(DT);
  check('epuisement a zero : quantite 0, source marquee epuisee, plus jamais recoltee', w.resourceNodeAmounts.get(tree.id) === 0 && w.depletedResourceNodes.has(tree.id) && v.cargo.wood === 5, { reste: w.resourceNodeAmounts.get(tree.id), cargo: v.cargo.wood });
  // Tas au sol : quantite de la carte, independante des sources.
  const w2 = new World(5);
  w2.setMap({ name: 'tas', version: 1, width: 20, height: 20, obstacles: [sources.tree], playerUnits: [], enemyUnits: [], resourcePiles: [{ x: 3.5, z: 3.5, resource: 'wood', amount: 5 }, { x: 4.5, z: 3.5, resource: 'stone', amount: 8 }] });
  check('tas au sol inchanges : quantites de la carte (5 bois, 8 pierre), pas celles des sources', w2.resourcePiles.map((p: any) => [p.resource, p.amount]).join(';') === 'wood,5;stone,8' && w2.resourceNodeAmounts.get([...w2.resourceNodes.keys()][0]) === 75, w2.resourcePiles);
}

// ---- 10. Source enfermee sur ses quatre cotes : aucun point de travail -> refusee, autre source choisie.
{
  // Arbre a (6.5, 0.5) entoure de rochers decoratifs 1 x 1 (kind rock = gisements bloquants) : les 4 cotes bloques ;
  // le gisement de pierre a l'ouest reste visible et accessible.
  const fence = [[6, -1], [6, 1], [5, 0], [7, 0]].map(([cx, cz]) => ({ kind: 'rock', tilesX: 1, tilesZ: 1, cornerX: cx, cornerZ: cz }));
  const { w, spawn, resOf } = mk([sources.tree, ...fence, sources.stone]);
  const tree = [...w.resourceNodes.values()].find((n: any) => n.resource === 'wood');
  // Les 4 rochers de cloture sont des sources de pierre : le test les vide pour que seul le gisement de l'ouest compte.
  for (const n of w.resourceNodes.values()) if (n.resource === 'stone' && n.x > 0) w.resourceNodeAmounts.set(n.id, 0);
  const v = spawn(3.5, 0.5);
  const trace: string[] = [];
  let ticks = 0;
  for (let i = 0; i < 30 * 12; i++) {
    w.step(DT);
    if (v.worker.working !== null && v.order.type === 'harvest' && v.order.nodeId === tree.id) ticks++;
    const s = `${v.order.type}:${v.order.nodeId ?? '-'}`;
    if (trace[trace.length - 1] !== s) trace.push(s);
  }
  const triedTree = trace.includes(`harvest:${tree.id}`);
  const bounces = trace.filter((s) => s === `harvest:${tree.id}`).length;
  check('autonomie : l arbre enferme (plus proche, 0 travailleur) est essaye une fois au plus, abandonne aussitot sans aucun tic, puis le gisement de pierre visible est choisi ; aucune boucle', bounces <= 1 && ticks === 0 && resOf(v) === 'stone' && v.cargo.wood === 0 && v.worker.autoNodeId !== tree.id, { trace, ticks, triedTree, order: v.order });
  // Ordre manuel sur la source enfermee : arret propre, evenement, aucun tic.
  const v2 = spawn(3.5, -2.5); v2.worker.autoRetryIn = 1e9;
  w.issueCommand({ kind: 'harvest', entityIds: [v2.id], nodeId: tree.id });
  let ended: any = null; let ticks2 = 0; let steps = 0;
  for (let i = 0; i < 30 * 5 && !ended; i++) { w.step(DT); steps++; if (v2.worker.working !== null) ticks2++; ended = w.orderEvents.find((ev: any) => ev.entityId === v2.id && ev.order === 'harvest') ?? null; }
  const posAfter = { x: v2.x, z: v2.z };
  run(w, 2);
  check('ordre manuel sur la source enfermee : arret propre des le premier pas (Garde), evenement harvest / failed / unreachable, aucun tic de recolte, immobile ensuite', !!ended && ended.outcome === 'failed' && ended.reason === 'unreachable' && steps <= 2 && ticks2 === 0 && v2.cargo.wood === 0 && Math.hypot(v2.x - posAfter.x, v2.z - posAfter.z) < 1e-6 && (v2.order.type === 'guard' || (v2.order.type === 'harvest' && v2.order.nodeId !== tree.id)), { ended, steps, ticks2, order: v2.order });
  // Heros : meme principe (portee 0,7 inchangee).
  const h = w.spawnHero('player', 3.5, 2.5, { xp: 0, level: 1, deaths: 0 });
  w.issueCommand({ kind: 'harvest', entityIds: [h.id], nodeId: tree.id });
  let hEnded: any = null;
  for (let i = 0; i < 30 * 5 && !hEnded; i++) { w.step(DT); hEnded = w.orderEvents.find((ev: any) => ev.entityId === h.id && ev.order === 'harvest') ?? null; }
  check(`Heros : ordre de recolte sur la source enfermee arrete proprement (unreachable), aucun tour de la source ; HARVEST_REACH toujours ${HARVEST_REACH}`, !!hEnded && hEnded.reason === 'unreachable' && h.order.type === 'guard' && h.cargo.wood === 0 && HARVEST_REACH === 0.7, { hEnded, order: h.order });
}

// ---- 11. Cotes libres mais region inaccessible (anneau de rochers a 2 cases de l'arbre) ; detour valide.
{
  const ring: any[] = [];
  for (let cx = 4; cx <= 8; cx++) for (let cz = -2; cz <= 2; cz++) if (cx === 4 || cx === 8 || cz === -2 || cz === 2) ring.push({ kind: 'rock', tilesX: 1, tilesZ: 1, cornerX: cx, cornerZ: cz });
  const mkRing = () => { const m = mk([sources.tree, ...ring, sources.stone]); for (const n of m.w.resourceNodes.values()) if (n.resource === 'stone' && n.x > 0) m.w.resourceNodeAmounts.set(n.id, 0); return m; };
  // Cas A : Villageois autonome -> tentative, echec propre au premier pas, puis le gisement de pierre (visible, accessible).
  {
    const { w, spawn, resOf } = mkRing();
    const tree = [...w.resourceNodes.values()].find((n: any) => n.resource === 'wood');
    const v = spawn(1.5, 0.5);
    const trace: string[] = []; let ticks = 0; let moved = 0;
    for (let i = 0; i < 30 * 12; i++) {
      const x0 = v.x, z0 = v.z;
      w.step(DT);
      if (v.order.type === 'harvest' && v.order.nodeId === tree.id) { moved += Math.hypot(v.x - x0, v.z - z0); if (v.worker.working !== null) ticks++; }
      const s = `${v.order.type}:${v.order.nodeId ?? '-'}`;
      if (trace[trace.length - 1] !== s) trace.push(s);
    }
    const bounces = trace.filter((s) => s === `harvest:${tree.id}`).length;
    check('cas A, autonomie : arbre aux 4 cotes libres mais region coupee -> un seul essai, abandon sans tic ni deplacement, puis la pierre accessible ; aucune boucle', bounces === 1 && ticks === 0 && moved < 0.01 && resOf(v) === 'stone', { trace, ticks, moved: +moved.toFixed(3), order: v.order });
  }
  // Cas B : ordre manuel sur la meme source -> unreachable au premier pas, aucun tic, immobile.
  {
    const { w, spawn } = mkRing();
    const tree = [...w.resourceNodes.values()].find((n: any) => n.resource === 'wood');
    const v = spawn(1.5, 0.5); v.worker.autoRetryIn = 1e9;
    w.issueCommand({ kind: 'harvest', entityIds: [v.id], nodeId: tree.id });
    let ended: any = null; let steps = 0;
    for (let i = 0; i < 30 * 5 && !ended; i++) { w.step(DT); steps++; ended = w.orderEvents.find((ev: any) => ev.entityId === v.id && ev.order === 'harvest') ?? null; }
    const at = { x: v.x, z: v.z };
    run(w, 1);
    check('cas B, ordre manuel : harvest / failed / unreachable au premier pas, aucun tic, immobile, Garde', !!ended && ended.reason === 'unreachable' && steps <= 2 && v.cargo.wood === 0 && v.order.type === 'guard' && Math.hypot(v.x - at.x, v.z - at.z) < 1e-6, { ended, steps, order: v.order });
  }
  // Cas C : mur de rochers entre le Villageois et l'arbre (x = 4, z = -3..3), detour par le nord ou le sud -> recolte normale.
  {
    const wall = Array.from({ length: 7 }, (_, i) => ({ kind: 'rock', tilesX: 1, tilesZ: 1, cornerX: 4, cornerZ: i - 3 }));
    const { w, spawn } = mk([sources.tree, ...wall, sources.stone]);
    for (const n of w.resourceNodes.values()) if (n.resource === 'stone' && n.x > 0) w.resourceNodeAmounts.set(n.id, 0);
    const tree = [...w.resourceNodes.values()].find((n: any) => n.resource === 'wood');
    const v = spawn(2.5, 0.5); v.worker.autoRetryIn = 1e9;
    w.issueCommand({ kind: 'harvest', entityIds: [v.id], nodeId: tree.id });
    let maxAbsZ = 0; let ended: any = null;
    for (let i = 0; i < 30 * 25 && v.cargo.wood < 1; i++) { w.step(DT); maxAbsZ = Math.max(maxAbsZ, Math.abs(v.z - 0.5)); ended ??= w.orderEvents.find((ev: any) => ev.entityId === v.id && ev.order === 'harvest') ?? null; }
    const boxDist = (e: any, b: any) => { const dx = Math.max(b.minX - e.x, 0, e.x - b.maxX); const dz = Math.max(b.minZ - e.z, 0, e.z - b.maxZ); return Math.hypot(dx, dz); };
    check('cas C, detour : chemin direct bloque par un mur de rochers, A* contourne (passage a |z| > 3), recolte au contact, aucun echec signale', v.cargo.wood >= 1 && maxAbsZ > 3 && boxDist(v, tree.block) - v.stats.radius <= WORKER_HARVEST_REACH + 1e-6 && ended === null, { wood: v.cargo.wood, maxAbsZ: +maxAbsZ.toFixed(2), ended });
  }
  // Cas D : Heros, memes regles (region coupee -> unreachable ; detour -> recolte).
  {
    const { w } = mkRing();
    const tree = [...w.resourceNodes.values()].find((n: any) => n.resource === 'wood');
    const h = w.spawnHero('player', 1.5, 2.5, { xp: 0, level: 1, deaths: 0 });
    w.issueCommand({ kind: 'harvest', entityIds: [h.id], nodeId: tree.id });
    let ended: any = null; let steps = 0;
    for (let i = 0; i < 30 * 5 && !ended; i++) { w.step(DT); steps++; ended = w.orderEvents.find((ev: any) => ev.entityId === h.id && ev.order === 'harvest') ?? null; }
    const wall = Array.from({ length: 7 }, (_, i) => ({ kind: 'rock', tilesX: 1, tilesZ: 1, cornerX: 4, cornerZ: i - 3 }));
    const d = mk([sources.tree, ...wall, sources.stone]);
    const tree2 = [...d.w.resourceNodes.values()].find((n: any) => n.resource === 'wood');
    const h2 = d.w.spawnHero('player', 2.5, 0.5, { xp: 0, level: 1, deaths: 0 });
    d.w.issueCommand({ kind: 'harvest', entityIds: [h2.id], nodeId: tree2.id });
    let ended2: any = null;
    for (let i = 0; i < 30 * 25 && h2.cargo.wood < 1; i++) { d.w.step(DT); ended2 ??= d.w.orderEvents.find((ev: any) => ev.entityId === h2.id && ev.order === 'harvest') ?? null; }
    check('cas D, Heros : region coupee -> unreachable au premier pas, Garde ; mur avec detour -> recolte normale', !!ended && ended.reason === 'unreachable' && steps <= 2 && h.order.type === 'guard' && h2.cargo.wood >= 1 && ended2 === null, { ended, steps, hOrder: h.order, wood2: h2.cargo.wood, ended2 });
  }
}

// ---- 12. Villageois constructeur (2026-11-05, G46) : ordre build accepte, marche, construction jusqu'au bout avec
// les regles du Heros (chantier, PV, fin, enchainement), aucune autonomie pendant, retour a l'autonomie 1 s apres.
{
  const { w, spawn, resOf } = mk();
  const { buildingFootprintTiles } = await import(SRC + 'data/buildings.ts');
  const fp = (id: string, x: number, z: number) => { const t = buildingFootprintTiles(id); return { kind: 'building', x, z, tilesX: t.tilesX, tilesZ: t.tilesZ }; };
  const { CONSTRUCTION_START_HP_FRACTION } = await import(SRC + 'data/hero.ts');
  const site = w.spawnBuilding(getBuilding('house'), 'player', 3.5, -5.5, fp('house', 3.5, -5.5), Math.round(getBuilding('house').maxHp * CONSTRUCTION_START_HP_FRACTION), undefined, undefined, { progress: 0, buildTime: 5 });
  const hp0 = site.hp;
  const v = spawn(-3.5, -3.5);
  w.step(DT); // autonomie : rien avant 1 s
  w.issueCommand({ kind: 'harvest', entityIds: [v.id], nodeId: [...w.resourceNodes.values()].find((n: any) => n.resource === 'wood').id });
  w.step(DT);
  const cmd = w.issueCommand({ kind: 'build', entityIds: [v.id], targetEntityId: site.id });
  w.step(DT);
  const accepted = v.order.type === 'build' && v.order.targetEntityId === site.id;
  let harvestSeen = false; let buildTicks = 0; let gestures = new Set<string>(); let done = -1; let t = 0;
  for (let i = 0; i < 30 * 30 && done < 0; i++) {
    w.step(DT); t += DT;
    if (v.order.type === 'harvest') harvestSeen = true;
    if (v.worker.working === 'build') buildTicks++;
    if (v.worker.working) gestures.add(v.worker.working);
    if (!site.construction) done = t;
  }
  check('Villageois : ordre build accepte (plus de rejet « Heros seulement »), marche jusqu au chantier, geste build, chantier termine (~5 s de travail), PV montes, aucune recolte autonome pendant', accepted && done > 0 && buildTicks >= 30 * 4.5 && site.hp > hp0 && site.hp === site.stats.maxHp && !harvestSeen && [...gestures].join() === 'build' && !site.countsForDefeat === !getBuilding('house').countsForDefeat, { accepted, done: +done.toFixed(1), buildTicks, hp: [hp0, site.hp], harvestSeen, gestures: [...gestures], cmd });
  // Fini : Garde, puis autonomie 1 s plus tard.
  const atEnd = v.order.type;
  run(w, 1.2);
  check('chantier fini : Garde, puis recolte autonome ~1 s apres', atEnd === 'guard' && v.order.type === 'harvest' && resOf(v) !== null, { atEnd, order: v.order });
  // Chantier detruit en chemin : Garde propre.
  const site2 = w.spawnBuilding(getBuilding('house'), 'player', -4.5, 6.5, fp('house', -4.5, 6.5), undefined, undefined, undefined, { progress: 0, buildTime: 5 });
  w.issueCommand({ kind: 'build', entityIds: [v.id], targetEntityId: site2.id });
  run(w, 0.5);
  site2.hp = 0; site2.alive = false;
  run(w, 0.2);
  check('chantier disparu en chemin : Garde (puis autonomie), jamais bloque', v.order.type === 'guard' || v.order.type === 'harvest', v.order);
}

console.log(failures ? failures + ' ECHEC(S)' : 'tout OK');
