// Tests cibles SANS NAVIGATEUR des points de collecte specialises (2026-11-03) : Scierie (bois), Camp de mineur
// (pierre, or extrait), Baliste universelle ; choix du point valide le plus proche pour la ressource (jamais par id) ;
// chantier et batiment ennemi ignores ; point detruit en chemin -> suivant ; cargo mixte (depot manuel partiel, chainage
// automatique) ; ordre manuel refuse en silence rien ; or de butin jamais en cargo ; Villageois ; determinisme.
// Usage : node --import ../ts-register.mjs collecte.mts (ou npm run test:sim)
const SRC = new URL('../../src/', import.meta.url).href;
const { World } = await import(SRC + 'sim/world.ts');
const { getBuilding } = await import(SRC + 'data/buildings.ts');
const { cargoTotal } = await import(SRC + 'data/resources.ts');
const { applyDamageToEntity } = await import(SRC + 'sim/damage.ts');
const { generateSurvivalMap } = await import(SRC + 'config/maps/proceduralSurvival.ts');
const DT = 1 / 30;
let failures = 0;
const check = (label: string, ok: boolean, extra: unknown = '') => { if (!ok) failures++; console.log(`${ok ? 'OK   ' : 'ECHEC'} ${label}${extra !== '' ? ' — ' + JSON.stringify(extra).slice(0, 900) : ''}`); };
const map = generateSurvivalMap(12345);
const nearest = (w: any, resource: string) => [...w.resourceNodes.values()].filter((n: any) => n.resource === resource).sort((a: any, b: any) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z))[0];
const beside = (node: any) => ({ x: node.x + (node.block ? node.block.maxX - node.x + 0.6 : 1.2), z: node.z });
const cargo = (u: any) => ({ wood: u.cargo.wood, stone: u.cargo.stone, gold: u.cargo.minedGold, total: cargoTotal(u.cargo) });
const kill = (e: any) => applyDamageToEntity(e, 1e6);

/** Monde : carte generee, unite a cote de la source `resource` ; batiments poses par `sites` (id, decalage depuis l'unite). */
function setup(unit: 'hero' | 'villageois', resource: 'wood' | 'stone' | 'gold', sites: { id: string; dx: number; dz: number; team?: string; chantier?: boolean }[], seed = 3) {
  const w = new World(seed);
  w.setMap(map);
  const node = nearest(w, resource);
  const at = beside(node);
  const u = unit === 'hero' ? w.spawnHero('player', at.x, at.z, { xp: 0, level: 1, deaths: 0 }) : w.spawn('villageois', 'player', at.x, at.z);
  w.harvestPermissions = { tools: ['axe', 'pickaxe', 'goldPickaxe'] };
  const built: Record<string, any> = {};
  for (const s of sites) {
    const b = w.spawnBuilding(getBuilding(s.id), s.team ?? 'player', at.x + s.dx, at.z + s.dz);
    if (s.chantier) b.construction = { progress: 0, builtHp: 0 };
    built[s.id] = b;
  }
  return { w, node, u, built };
}
/** Suit la boucle `seconds` s : phases « ordre:cible », depots par ressource et par batiment, butin, evenements sans point. */
function follow(w: any, u: any, seconds: number, onStep?: (i: number) => void) {
  const phases: string[] = []; const deposits: Record<string, number> = {}; const bySite: Record<string, number> = {}; let loot = 0; let noDrop = 0; let maxCargo = 0;
  for (let i = 0; i < Math.round(seconds * 30); i++) {
    onStep?.(i);
    const siteBefore = u.order.type === 'deposit' ? w.getById(u.order.targetEntityId)?.unitId ?? '?' : '?';
    w.step(DT);
    maxCargo = Math.max(maxCargo, cargoTotal(u.cargo));
    const o = u.order; const site = o.type === 'deposit' ? w.getById(o.targetEntityId)?.unitId ?? '?' : o.type === 'harvest' ? o.nodeId : '';
    const ph = `${o.type}${site !== '' ? ':' + site : ''}`;
    if (phases[phases.length - 1] !== ph) phases.push(ph);
    for (const ev of w.cargoEvents) {
      if (ev.type === 'cargoDeposit' && ev.entityId === u.id) { deposits[ev.resource] = (deposits[ev.resource] ?? 0) + ev.amount; bySite[siteBefore] = (bySite[siteBefore] ?? 0) + ev.amount; }
      if (ev.type === 'lootGold') loot += ev.amount;
      if (ev.type === 'cargoFullNoDropOff') noDrop++;
    }
  }
  return { phases, deposits, bySite, loot, noDrop, maxCargo };
}
const harvest = (w: any, u: any, node: any) => w.issueCommand({ kind: 'harvest', entityIds: [u.id], nodeId: node.id });

check('donnees : Scierie = bois seul ; Camp de mineur = pierre + or extrait ; Baliste = tout ; Forge = rien ; couts, emprises et PV inchanges',
  JSON.stringify(getBuilding('sawmill').dropOff) === '["wood"]' && JSON.stringify(getBuilding('miner_camp').dropOff) === '["stone","minedGold"]' && JSON.stringify(getBuilding('ballista').dropOff) === '["wood","stone","minedGold"]' && !getBuilding('forge').dropOff
  && getBuilding('sawmill').cost === 10 && getBuilding('sawmill').resourceCost!.wood === 8 && getBuilding('sawmill').footprintTilesX === 3 && getBuilding('sawmill').maxHp === 150 && getBuilding('miner_camp').cost === 10 && getBuilding('miner_camp').resourceCost!.stone === 4 && getBuilding('miner_camp').maxHp === 150);

// --- BOIS (Heros).
{
  const { w, node, u } = setup('hero', 'wood', [{ id: 'ballista', dx: 6, dz: 0 }]);
  harvest(w, u, node); const r = follow(w, u, 30);
  check('bois, Baliste seule : depot a la Baliste', r.phases.includes('deposit:ballista') && r.deposits.wood === 10, r);
}
{
  const { w, node, u } = setup('hero', 'wood', [{ id: 'ballista', dx: 9, dz: 0 }, { id: 'sawmill', dx: 0, dz: 4 }]);
  harvest(w, u, node); const r = follow(w, u, 30);
  check('bois, Scierie plus proche que la Baliste : depot a la Scierie, retour a l arbre', r.phases.includes('deposit:sawmill') && !r.phases.includes('deposit:ballista') && r.bySite.sawmill === 10 && r.phases.lastIndexOf(`harvest:${node.id}`) > r.phases.indexOf('deposit:sawmill'), r);
}
{
  const { w, node, u } = setup('hero', 'wood', [{ id: 'ballista', dx: 0, dz: 4 }, { id: 'sawmill', dx: 10, dz: 0 }]);
  harvest(w, u, node); const r = follow(w, u, 30);
  check('bois, Scierie plus loin que la Baliste : depot a la Baliste', r.phases.includes('deposit:ballista') && !r.phases.includes('deposit:sawmill'), r);
}
{
  const { w, node, u } = setup('hero', 'wood', [{ id: 'ballista', dx: 9, dz: 0 }, { id: 'sawmill', dx: 0, dz: 4, chantier: true }, { id: 'sawmill', dx: 0, dz: -4, team: 'enemy' }]);
  harvest(w, u, node); const r = follow(w, u, 30);
  check('Scierie en chantier et Scierie ennemie proches : ignorees, depot a la Baliste', r.phases.includes('deposit:ballista') && !r.phases.includes('deposit:sawmill'), r);
}
{
  const { w, node, u, built } = setup('hero', 'wood', [{ id: 'ballista', dx: 9, dz: 0 }, { id: 'sawmill', dx: 0, dz: 6 }]);
  harvest(w, u, node);
  let killed = false;
  const r = follow(w, u, 40, () => { if (!killed && u.order.type === 'deposit' && u.order.targetEntityId === built.sawmill.id && Math.hypot(u.x - built.sawmill.x, u.z - built.sawmill.z) < 4) { kill(built.sawmill); killed = true; } });
  check('Scierie detruite pendant le trajet : la Baliste reprend la destination, 10 bois deposes, retour a l arbre', killed && r.phases.includes('deposit:sawmill') && r.phases.indexOf('deposit:ballista') > r.phases.indexOf('deposit:sawmill') && r.bySite.ballista >= 10 && (r.bySite.sawmill ?? 0) === 0 && r.phases.lastIndexOf(`harvest:${node.id}`) > r.phases.indexOf('deposit:ballista'), r);
}

// --- PIERRE / OR EXTRAIT (Villageois).
{
  const { w, node, u } = setup('villageois', 'stone', [{ id: 'ballista', dx: 5, dz: 0 }]);
  harvest(w, u, node); const r = follow(w, u, 30);
  check('pierre, Baliste seule : depot a la Baliste (5)', r.bySite.ballista >= 5 && r.deposits.stone >= 5, r);
}
{
  const { w, node, u } = setup('villageois', 'stone', [{ id: 'ballista', dx: 8, dz: 0 }, { id: 'miner_camp', dx: 0, dz: 4 }, { id: 'sawmill', dx: 0, dz: -3 }]);
  harvest(w, u, node); const r = follow(w, u, 40);
  check('pierre, Camp de mineur plus proche (Scierie encore plus proche ignoree) : depot au Camp, retour, deuxieme boucle', r.phases.includes('deposit:miner_camp') && !r.phases.includes('deposit:sawmill') && !r.phases.includes('deposit:ballista') && r.bySite.miner_camp >= 10, r);
}
{
  const { w, node, u } = setup('villageois', 'gold', [{ id: 'ballista', dx: 8, dz: 0 }, { id: 'miner_camp', dx: 0, dz: 4 }]);
  harvest(w, u, node); const r = follow(w, u, 40);
  check('or extrait, Camp de mineur proche : depot au Camp (minedGold), jamais a la Baliste', r.phases.includes('deposit:miner_camp') && !r.phases.includes('deposit:ballista') && r.deposits.minedGold >= 5, r);
  const g = setup('villageois', 'gold', [{ id: 'ballista', dx: 4, dz: 0 }]);
  harvest(g.w, g.u, g.node); const rg = follow(g.w, g.u, 40);
  check('or extrait, Baliste seule : depot a la Baliste', rg.phases.includes('deposit:ballista') && rg.deposits.minedGold >= 5, rg);
}

// --- OR DE BUTIN : jamais en cargo, jamais de point de collecte.
{
  const { w, u } = setup('hero', 'wood', [{ id: 'miner_camp', dx: 2, dz: 2 }, { id: 'ballista', dx: 3, dz: -2 }]);
  const id = w.dropGold(u.x + 2, u.z, 9);
  w.issueCommand({ kind: 'pickup', entityIds: [u.id], pileId: id });
  const r = follow(w, u, 8);
  check('or de butin a cote d un Camp de mineur : ramasse -> lootGold 9 (monnaie), cargo 0, aucun ordre de depot', r.loot === 9 && cargoTotal(u.cargo) === 0 && !r.phases.some((p) => p.startsWith('deposit')) && u.order.type === 'guard', { ...r, cargo: cargo(u) });
}

// --- CARGO MIXTE du Heros : depot manuel partiel (un seul point), rien de vide en silence.
for (const [site, expect] of [['sawmill', { wood: 0, stone: 3, gold: 2, total: 5 }], ['miner_camp', { wood: 4, stone: 0, gold: 0, total: 4 }], ['ballista', { wood: 0, stone: 0, gold: 0, total: 0 }]] as const) {
  const { w, u, built } = setup('hero', 'wood', [{ id: 'sawmill', dx: 6, dz: 0 }, { id: 'miner_camp', dx: 0, dz: 6 }, { id: 'ballista', dx: -6, dz: 6 }]);
  Object.assign(u.cargo, { wood: 4, stone: 3, minedGold: 2 });
  w.issueCommand({ kind: 'deposit', entityIds: [u.id], targetEntityId: built[site].id });
  const r = follow(w, u, 15);
  const sites = r.phases.filter((p) => p.startsWith('deposit'));
  check(`cargo 4 bois / 3 pierre / 2 or, depot manuel : ${site} -> reste ${JSON.stringify(expect)}, un seul point visite, puis Garde`, JSON.stringify(cargo(u)) === JSON.stringify(expect) && sites.length === 1 && sites[0] === `deposit:${site}` && u.order.type === 'guard' && u.cargo.auto === false, { cargo: cargo(u), sites, order: u.order.type });
}
{
  const { w, u, built } = setup('hero', 'wood', [{ id: 'sawmill', dx: 6, dz: 0 }]);
  Object.assign(u.cargo, { wood: 0, stone: 3, minedGold: 1 });
  w.issueCommand({ kind: 'deposit', entityIds: [u.id], targetEntityId: built.sawmill.id });
  const r = follow(w, u, 10);
  check('depot manuel a la Scierie sans bois (pierre + or) : rien depose, cargo intact, Garde', Object.keys(r.deposits).length === 0 && cargo(u).total === 4 && u.order.type === 'guard', { ...r, cargo: cargo(u) });
}

// --- CARGO MIXTE : chainage automatique quand le cargo est plein.
{
  const { w, node, u } = setup('hero', 'wood', [{ id: 'sawmill', dx: 0, dz: 4 }, { id: 'miner_camp', dx: 0, dz: 8 }, { id: 'ballista', dx: 14, dz: 0 }]);
  Object.assign(u.cargo, { wood: 5, stone: 3, minedGold: 1 });
  harvest(w, u, node); const r = follow(w, u, 45);
  const order = ['deposit:sawmill', 'deposit:miner_camp', `harvest:${node.id}`].map((p) => r.phases.indexOf(p));
  check('plein (6 bois / 3 pierre / 1 or) : Scierie (bois) -> enchaine au Camp de mineur (pierre + or) -> retour a l arbre, cargo vide, Baliste lointaine jamais visitee', order[0] > 0 && order[1] > order[0] && r.phases.lastIndexOf(`harvest:${node.id}`) > order[1] && r.bySite.sawmill >= 6 && r.deposits.stone === 3 && r.deposits.minedGold === 1 && r.bySite.miner_camp === 4 && !r.phases.includes('deposit:ballista') && r.noDrop === 0, r);
}
{
  const { w, node, u } = setup('hero', 'wood', [{ id: 'sawmill', dx: 0, dz: 4 }]);
  Object.assign(u.cargo, { wood: 0, stone: 3, minedGold: 0 });
  harvest(w, u, node); const r = follow(w, u, 60);
  const deps = r.phases.filter((p) => p === 'deposit:sawmill').length;
  check('Scierie seule, 3 pierre dans le cargo : chaque plein depose le bois a la Scierie et reprend l arbre, la pierre reste (pas de blocage a 9/10, pas d alerte)', deps >= 2 && u.cargo.stone === 3 && r.bySite.sawmill >= 14 && r.noDrop === 0 && r.maxCargo === 10, { ...r, cargo: cargo(u) });
}
{
  const { w, node, u } = setup('hero', 'stone', [{ id: 'sawmill', dx: 0, dz: 4 }]);
  harvest(w, u, node); const r = follow(w, u, 25);
  check('Scierie seule, Heros mine la pierre : plein (10), aucun point pour la pierre -> alerte, Garde, cargo garde', r.noDrop >= 1 && u.order.type === 'guard' && u.cargo.stone === 10 && !r.phases.some((p) => p.startsWith('deposit')), { ...r, cargo: cargo(u) });
}

// --- VILLAGEOIS : boucle avec Scierie, puis Scierie detruite -> Baliste.
{
  const { w, node, u, built } = setup('villageois', 'wood', [{ id: 'ballista', dx: 8, dz: 0 }, { id: 'sawmill', dx: 0, dz: 4 }]);
  harvest(w, u, node);
  const r1 = follow(w, u, 30);
  kill(built.sawmill);
  const r2 = follow(w, u, 30);
  check('Villageois bucheron : arbre -> 5 bois -> Scierie -> retour (2 boucles) ; Scierie detruite -> la Baliste prend le relais', r1.phases.filter((p) => p === 'deposit:sawmill').length >= 2 && !r1.phases.includes('deposit:ballista') && r2.phases.includes('deposit:ballista') && !r2.phases.slice(1).includes('deposit:sawmill') && (r2.bySite.sawmill ?? 0) === 0 && r2.bySite.ballista >= 5, { r1, r2 });
}

// --- Determinisme.
{
  const trace = () => { const { w, node, u } = setup('hero', 'wood', [{ id: 'sawmill', dx: 0, dz: 4 }, { id: 'miner_camp', dx: 0, dz: 8 }], 11); Object.assign(u.cargo, { wood: 5, stone: 3, minedGold: 1 }); harvest(w, u, node); follow(w, u, 40); return JSON.stringify([u.x.toFixed(5), u.z.toFixed(5), u.cargo, w.resourceNodeAmounts.get(node.id)]); };
  check('determinisme : deux simulations identiques', trace() === trace());
}

console.log(failures ? failures + ' ECHEC(S)' : 'tout OK');
