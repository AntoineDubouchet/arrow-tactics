// Tests cibles SANS NAVIGATEUR du modele d'ameliorations de la Pass 2 (2026-11-05) : technologies de la Forge
// (Armes / Armures forgees I), niveaux de producteurs (Camp d'archerie, Sanctuaire, Ecurie, Caserne), Baliste
// depuis sa fiche, technologie de Caserne, file unique (ordre des commandes), annulation, destruction pendant une
// recherche, deux Forges, retroactivite (unites presentes a la meme fraction de PV, unites futures), Heros et
// Villageois exclus, cout d'unite inchange. Orchestration : run/productionOrders.ts (la meme que main.ts).
// Usage : node --import ../ts-register.mjs technologies.mts (ou npm run test:sim)
const SRC = new URL('../../src/', import.meta.url).href;
const { World } = await import(SRC + 'sim/world.ts');
const { DEFAULT_MAP } = await import(SRC + 'config/mapDef.ts');
const { getBuilding } = await import(SRC + 'data/buildings.ts');
const { getUnit, isMilitaryUnit, UNIT_MOVE_SPEED_MULTIPLIER } = await import(SRC + 'data/units.ts');
const { producibleUnits, BUILDING_UPGRADE_SECONDS } = await import(SRC + 'data/production.ts');
const { TECHNOLOGIES, getTechnology } = await import(SRC + 'data/technologies.ts');
const { createNewRun } = await import(SRC + 'run/runState.ts');
const { DEFAULT_META_PROGRESS } = await import(SRC + 'run/metaProgress.ts');
const { computePlayerUnitStats, playerUnitMaxHp } = await import(SRC + 'run/playerUnitStats.ts');
const { buildingLevelOf } = await import(SRC + 'run/buildingUpgrades.ts');
const { technologyStatusesAt, isTechnologyAcquired } = await import(SRC + 'run/technologies.ts');
const { runUpgradeLevel, ballistaUpgradeGoldCost, canBallistaLevelUp } = await import(SRC + 'run/runUpgrades.ts');
const { effectiveBallistaMaxHp } = await import(SRC + 'run/ballistaUpgradeEffects.ts');
const PO = await import(SRC + 'run/productionOrders.ts');
const { findAbility } = await import(SRC + 'data/abilities.ts');
const DT = 1 / 30;
let failures = 0;
const check = (label: string, ok: boolean, extra: unknown = '') => { if (!ok) failures++; console.log(`${ok ? 'OK   ' : 'ECHEC'} ${label}${extra !== '' ? ' — ' + JSON.stringify(extra).slice(0, 900) : ''}`); };
const fp = (id: string, x: number, z: number) => { const d = getBuilding(id); return { kind: 'building', x, z, tilesX: d.footprintTilesX ?? 1, tilesZ: d.footprintTilesZ ?? 1 }; };

/** Monde + run + progression (talents vides) + registre des paiements ; Maisons pour la population. */
function mk(gold = 200, wood = 100, stone = 100) {
  const w = new World(7);
  w.setMap(DEFAULT_MAP);
  for (let i = 0; i < 4; i++) w.spawnBuilding(getBuilding('house'), 'player', -9.5 + i * 3, 8.5, fp('house', -9.5 + i * 3, 8.5));
  const run = createNewRun();
  run.gold = gold; run.resources.wood = wood; run.resources.stone = stone;
  const progress = { talents: { ...DEFAULT_META_PROGRESS, unlockedTalents: [], claimedWaveRewards: [] }, upgrades: run.upgrades };
  const ledger = new Map();
  const owned = new Map<number, any>();
  let ballistaId: number | null = null;
  const completed: any[] = [];
  const spawnBuilding = (id: string, x: number, z: number) => { const e = w.spawnBuilding(getBuilding(id), 'player', x, z, fp(id, x, z)); owned.set(e.id, { buildingId: id, x, z, hp: e.hp }); if (id === 'ballista') ballistaId = e.id; return e; };
  const spawnUnit = (unitId: string, x: number, z: number) => { const s = computePlayerUnitStats(unitId, progress); const e = w.spawn(unitId, 'player', x, z, undefined, s.statOverrides, s.abilityDamageBonus, s.tauntShieldBonus); e.order = { type: 'guard' }; return e; };
  /** Un pas : simulation puis fin des commandes (comme main.ts). Les unites sorties sont creees aux stats effectives. */
  const spawned: any[] = [];
  const step = () => { w.step(DT); completed.push(...PO.completeOrders(run, progress, w, ledger, w.productionUpgradeEvents, ballistaId, (id: number) => owned.get(id))); for (const ev of w.productionSpawnEvents) spawned.push(spawnUnit(ev.unitId, ev.x, ev.z)); };
  const runFor = (seconds: number) => { for (let t = 0; t < seconds - 1e-9; t += DT) step(); };
  return { w, run, progress, ledger, owned, completed, spawned, spawnBuilding, spawnUnit, step, runFor, get ballistaId() { return ballistaId; } };
}
const hpPts = (e: any) => ({ hp: e.hp, max: e.stats.maxHp });

// ---- 1. Donnees : unites militaires, technologies.
{
  const military = ['piquier', 'fantassin', 'archer', 'mage', 'oracle', 'vengeur', 'cavalier', 'sentinel'];
  check('unites militaires : Piquier, Homme d armes, Archer, Mage, Oracle, Vengeur, Cavalier, Sentinelle ; jamais Heros, Villageois ni neutres', military.every((u) => isMilitaryUnit(u)) && !isMilitaryUnit('hero') && !isMilitaryUnit('villageois') && !isMilitaryUnit('maraudeur'));
  const fw = getTechnology('forge_weapons'), fa = getTechnology('forge_armor');
  check('Armes forgees I : Forge, 20 or / 10 bois / 5 pierre, 30 s, militaires +10 % degats ; Armures forgees I : 20 / 5 / 10, 30 s, +10 % PV',
    fw.site === 'forge' && fw.goldCost === 20 && fw.resourceCost.wood === 10 && fw.resourceCost.stone === 5 && fw.seconds === 30 && fw.effects[0]!.target.kind === 'military' && fw.effects[0]!.bonus.attackPercent === 10
    && fa.site === 'forge' && fa.goldCost === 20 && fa.resourceCost.wood === 5 && fa.resourceCost.stone === 10 && fa.seconds === 30 && fa.effects[0]!.bonus.hpPercent === 10 && Object.keys(TECHNOLOGIES).length === 3);
}

// ---- 2. Forge : aucune Forge, construction, Armes I (cout, duree, simulation continue), retroactif, futur, Heros / Villageois, Armures I, deux Forges.
{
  const T = mk();
  const barracks = T.spawnBuilding('barracks', 0.5, -2.5);
  check('aucune Forge : Armes forgees I ne se commande pas ailleurs (Caserne) ; statut « disponible » listee pour une Forge', PO.queueTechnologyOrder(T.run, T.w, T.ledger, barracks, 0, 'forge_weapons') === null && technologyStatusesAt('forge', T.run, 0, () => false).map((s: any) => s.def.id + ':' + s.state).join() === 'forge_weapons:available,forge_armor:available');
  const forge = T.spawnBuilding('forge', 6, -2);
  const archer = T.spawnUnit('archer', 4.5, 4.5);
  const hero = T.w.spawnHero('player', 2.5, 4.5, { xp: 0, level: 1, deaths: 0 });
  const villager = T.spawnUnit('villageois', 5.5, 4.5);
  const base = getUnit('archer').stats;
  archer.hp = base.maxHp / 2;
  const t0 = T.w.tick;
  const id1 = PO.queueTechnologyOrder(T.run, T.w, T.ledger, forge, 0, 'forge_weapons');
  check('Forge : Armes forgees I en file (recherche, 30 s), 20 or / 10 bois / 5 pierre debites', typeof id1 === 'number' && forge.productionOrders[0]?.kind === 'research' && forge.productionOrders[0]?.techId === 'forge_weapons' && forge.productionOrders[0]?.total === 30 && T.run.gold === 180 && T.run.resources.wood === 90 && T.run.resources.stone === 95, { gold: T.run.gold, res: T.run.resources, order: forge.productionOrders[0] });
  check('en recherche : statut « pending », une 2e commande de la meme technologie refusee', PO.isTechnologyPending(T.w, 'forge_weapons') && technologyStatusesAt('forge', T.run, 0, (id: string) => PO.isTechnologyPending(T.w, id))[0]!.state === 'pending' && PO.queueTechnologyOrder(T.run, T.w, T.ledger, forge, 0, 'forge_weapons') === null);
  T.runFor(10);
  check('la simulation continue pendant la recherche (10 s : 300 pas, 20 s restantes), Archer inchange pour l instant', Math.abs(T.w.tick - t0 - 300) <= 1 && Math.abs(forge.productionOrders[0]!.remaining - 20) < 0.05 && archer.stats.damage === base.damage && !isTechnologyAcquired(T.run.upgrades, 'forge_weapons'), { tick: T.w.tick - t0, rem: forge.productionOrders[0]?.remaining });
  T.runFor(20.1);
  const expectedDamage = Math.round(base.damage * 1.1);
  check('30 s : Armes forgees I acquise (niveau de run), Archer PRESENT : degats +10 % (12 -> 13,2), PV intacts', isTechnologyAcquired(T.run.upgrades, 'forge_weapons') && forge.productionOrders.length === 0 && archer.stats.damage === expectedDamage && archer.hp === base.maxHp / 2 && archer.stats.maxHp === base.maxHp && T.completed.some((c) => c.kind === 'research' && c.techId === 'forge_weapons'), { dmg: archer.stats.damage, expectedDamage, hp: hpPts(archer) });
  const future = T.spawnUnit('archer', 7.5, 4.5);
  check('Archer FUTUR : memes degats ameliores des l apparition', future.stats.damage === expectedDamage && future.hp === future.stats.maxHp, { dmg: future.stats.damage });
  check('Heros et Villageois inchanges (jamais militaires)', hero.stats.damage === getUnit('hero').stats.damage && villager.stats.damage === getUnit('villageois').stats.damage && villager.stats.maxHp === getUnit('villageois').stats.maxHp && computePlayerUnitStats('villageois', T.progress).statOverrides === undefined, { hero: hero.stats.damage, vil: villager.stats.damage });
  // Armures I : fraction de PV conservee (Archer 3 PV = 30 interne : 10 / 30 -> 11 / 33).
  archer.hp = 10;
  const id2 = PO.queueTechnologyOrder(T.run, T.w, T.ledger, forge, 0, 'forge_armor');
  check('Armures forgees I en file : 20 or / 5 bois / 10 pierre', typeof id2 === 'number' && T.run.gold === 160 && T.run.resources.wood === 85 && T.run.resources.stone === 85);
  T.runFor(30.1);
  const expectedHp = Math.round(base.maxHp * 1.1);
  check('Armures forgees I acquise : Archer present PV max +10 % (30 -> 33), PV actuels a la meme fraction (10 -> 11), futur Archer idem ; Heros intact',
    isTechnologyAcquired(T.run.upgrades, 'forge_armor') && archer.stats.maxHp === expectedHp && archer.hp === Math.round((10 * expectedHp) / base.maxHp) && future.stats.maxHp === expectedHp && future.hp === expectedHp && hero.stats.maxHp === getUnit('hero').stats.maxHp && T.spawnUnit('archer', 8.5, 4.5).stats.maxHp === expectedHp, { archer: hpPts(archer), future: hpPts(future), expectedHp });
  const forge2 = T.spawnBuilding('forge', 10, -2);
  check('deux Forges : la seconde affiche les deux technologies « Terminé », aucune nouvelle commande possible', technologyStatusesAt('forge', T.run, 0, () => false).every((s: any) => s.state === 'done') && PO.queueTechnologyOrder(T.run, T.w, T.ledger, forge2, 0, 'forge_weapons') === null && PO.queueTechnologyOrder(T.run, T.w, T.ledger, forge2, 0, 'forge_armor') === null);
  check('cout de recrutement inchange par les technologies (Archer 3 or, Homme d armes 2 or)', getUnit('archer').cost === 3 && getUnit('fantassin').cost === 2 && PO.queueUnitOrder(T.run, T.w, T.ledger, barracks, 0, 'piquier') !== null && T.run.gold === 160 - getUnit('piquier').cost);
}

// ---- 3. Destruction pendant une recherche ; annulation ; technologie acquise conservee.
{
  const T = mk();
  const forge = T.spawnBuilding('forge', 6, -2);
  PO.queueTechnologyOrder(T.run, T.w, T.ledger, forge, 0, 'forge_armor');
  T.runFor(30.1);
  const id = PO.queueTechnologyOrder(T.run, T.w, T.ledger, forge, 0, 'forge_weapons');
  T.runFor(5);
  forge.hp = 0; forge.alive = false;
  T.runFor(1);
  check('Forge detruite pendant Armes forgees I : file perdue, AUCUN remboursement (160 or, 85 bois, 85 pierre), technologie non acquise ; Armures forgees I deja terminee reste acquise',
    typeof id === 'number' && forge.productionOrders.length === 0 && T.run.gold === 160 && T.run.resources.wood === 85 && T.run.resources.stone === 85 && !isTechnologyAcquired(T.run.upgrades, 'forge_weapons') && isTechnologyAcquired(T.run.upgrades, 'forge_armor') && !PO.isTechnologyPending(T.w, 'forge_weapons'), { gold: T.run.gold, res: T.run.resources });
  const rebuilt = T.spawnBuilding('forge', 10, -2);
  const statuses = technologyStatusesAt('forge', T.run, 0, (t: string) => PO.isTechnologyPending(T.w, t)).map((s: any) => s.def.id + ':' + s.state).join();
  const again = PO.queueTechnologyOrder(T.run, T.w, T.ledger, rebuilt, 0, 'forge_weapons');
  const cancelled = PO.cancelOrder(T.run, T.w, T.ledger, rebuilt.id, again!);
  check('Forge reconstruite : Armures « Terminé », Armes a nouveau disponible ; annulation : or ET stock rendus', statuses === 'forge_weapons:available,forge_armor:done' && typeof again === 'number' && cancelled && T.run.gold === 160 && T.run.resources.wood === 85 && T.run.resources.stone === 85 && rebuilt.productionOrders.length === 0, { statuses, gold: T.run.gold, res: T.run.resources });
}

// ---- 4. Producteurs : Camp d'archerie, Sanctuaire, Ecurie, Caserne (niveau de run, retroactif, futur) ; deux Camps.
{
  const T = mk(500);
  const archery = T.spawnBuilding('archery', 0.5, -2.5);
  const archery2 = T.spawnBuilding('archery', 5.5, -2.5);
  const a1 = T.spawnUnit('archer', 4.5, 4.5);
  const base = getUnit('archer').stats;
  a1.hp = 15;
  check('Camp d archerie Niv. 1 : Archer aux stats de base', a1.stats.maxHp === base.maxHp && a1.stats.damage === base.damage);
  const id = PO.queueBuildingUpgradeOrder(T.run, T.w, T.ledger, archery, 0);
  check('amelioration Niv. 2 en file (20 or, 20 s) ; le 2e Camp d archerie ne peut pas la commander aussi (meme type, en file)', typeof id === 'number' && T.run.gold === 480 && archery.productionOrders[0]?.kind === 'upgrade' && archery.productionOrders[0]?.total === BUILDING_UPGRADE_SECONDS && PO.isBuildingUpgradePending(T.w, archery2) && PO.queueBuildingUpgradeOrder(T.run, T.w, T.ledger, archery2, 0) === null);
  T.runFor(BUILDING_UPGRADE_SECONDS + 0.1);
  const lvl = (b: any) => buildingLevelOf(T.run.upgrades, T.owned.get(b.id));
  check('Niv. 2 termine : niveau de RUN (les deux Camps Niv. 2) ; Archer PRESENT : +2 PV (3 -> 5, PV actuels 1,5 -> 2,5), +1 degats (1,2 -> 2,2) ; futur Archer idem',
    lvl(archery) === 1 && lvl(archery2) === 1 && runUpgradeLevel(T.run.upgrades, 'archery') === 1 && a1.stats.maxHp === base.maxHp + 20 && a1.hp === Math.round((15 * (base.maxHp + 20)) / base.maxHp) && a1.stats.damage === base.damage + 10 && T.spawnUnit('archer', 6.5, 4.5).stats.damage === base.damage + 10 && playerUnitMaxHp('archer', T.progress) === base.maxHp + 20, { a1: { ...hpPts(a1), dmg: a1.stats.damage }, levels: T.run.upgrades });
  check('Niv. 2 est le maximum : plus d amelioration possible', PO.queueBuildingUpgradeOrder(T.run, T.w, T.ledger, archery2, 1) === null);
  // Sanctuaire : Mage (Boule de feu via abilityDamageBonus).
  const shrine = T.spawnBuilding('shrine', 10, -2);
  const mage = T.spawnUnit('mage', 8.5, 4.5);
  const fireball = findAbility(getUnit('mage').abilities, 'area-blast');
  PO.queueBuildingUpgradeOrder(T.run, T.w, T.ledger, shrine, 0);
  T.runFor(BUILDING_UPGRADE_SECONDS + 0.1);
  check('Sanctuaire Niv. 2 : Mage present +3 PV, Boule de feu +2 (abilityDamageBonus 20) ; futur Mage idem ; PV du Sanctuaire inchanges', mage.stats.maxHp === getUnit('mage').stats.maxHp + 30 && mage.abilityDamageBonus === 20 && T.spawnUnit('mage', 9.5, 4.5).abilityDamageBonus === 20 && shrine.stats.maxHp === getBuilding('shrine').maxHp && fireball !== undefined, { mage: { max: mage.stats.maxHp, ab: mage.abilityDamageBonus } });
  // Ecurie : Cavalier (+5 PV, +5 % vitesse dans la chaine normale, avant le x1,4 global).
  const stables = T.spawnBuilding('stables', 14, -2);
  const cav = T.spawnUnit('cavalier', 12.5, 4.5);
  const cavBase = getUnit('cavalier').stats;
  PO.queueBuildingUpgradeOrder(T.run, T.w, T.ledger, stables, 0);
  T.runFor(BUILDING_UPGRADE_SECONDS + 0.1);
  check('Ecurie Niv. 2 : Cavalier present +5 PV, vitesse x1,05 (puis x1,4 global) ; futur Cavalier idem', cav.stats.maxHp === cavBase.maxHp + 50 && Math.abs(cav.stats.moveSpeed - cavBase.moveSpeed * 1.05 * UNIT_MOVE_SPEED_MULTIPLIER) < 1e-9 && Math.abs(T.spawnUnit('cavalier', 13.5, 4.5).stats.moveSpeed - cavBase.moveSpeed * 1.05 * UNIT_MOVE_SPEED_MULTIPLIER) < 1e-9, { speed: cav.stats.moveSpeed, base: cavBase.moveSpeed });
  // Caserne : Niv. 2 debloque l'Homme d'armes ; technologie d'entrainement au Niv. 2 seulement.
  const barracks = T.spawnBuilding('barracks', -8.5, -2.5);
  const locked = technologyStatusesAt('barracks', T.run, 0, () => false)[0]!.state;
  const refused = PO.queueTechnologyOrder(T.run, T.w, T.ledger, barracks, 0, 'barracks_training');
  PO.queueBuildingUpgradeOrder(T.run, T.w, T.ledger, barracks, 0);
  T.runFor(BUILDING_UPGRADE_SECONDS + 0.1);
  const fant = T.spawnUnit('fantassin', -6.5, 4.5);
  const fBase = getUnit('fantassin').stats;
  const trainId = PO.queueTechnologyOrder(T.run, T.w, T.ledger, barracks, lvl(barracks), 'barracks_training');
  T.runFor(getTechnology('barracks_training').seconds + 0.1);
  check('Caserne : Entrainement verrouille au Niv. 1 (« locked », refuse) ; Niv. 2 debloque l Homme d armes ; Entrainement (7 or, 20 s) : Hommes d armes presents et futurs +3 PV, +1 degats',
    locked === 'locked' && refused === null && JSON.stringify(producibleUnits('barracks', lvl(barracks))) === '["piquier","fantassin"]' && typeof trainId === 'number' && isTechnologyAcquired(T.run.upgrades, 'barracks_training') && fant.stats.maxHp === fBase.maxHp + 30 && fant.stats.damage === fBase.damage + 10 && T.spawnUnit('fantassin', -5.5, 4.5).stats.damage === fBase.damage + 10 && T.spawnUnit('piquier', -4.5, 4.5).stats.damage === getUnit('piquier').stats.damage, { locked, fant: { max: fant.stats.maxHp, dmg: fant.stats.damage } });
}

// ---- 5. Baliste depuis sa fiche ; file unique (ordre) ; Forge + producteurs cumules.
{
  const T = mk(500);
  const ballista = T.spawnBuilding('ballista', 0.5, 0.5);
  ballista.hp = 200;
  const b1 = PO.queueBallistaUpgradeOrder(T.run, T.w, T.ledger, ballista);
  const dup = PO.queueBallistaUpgradeOrder(T.run, T.w, T.ledger, ballista);
  check('Baliste : amelioration a SA file (1 or, 20 s), une seule a la fois', typeof b1 === 'number' && dup === null && T.run.gold === 499 && ballista.productionOrders[0]?.kind === 'upgrade' && PO.isBallistaUpgradePending(ballista));
  T.runFor(BUILDING_UPGRADE_SECONDS + 0.1);
  check('Baliste Niv. 2 : niveau de run, PV max +10 (25 -> 35) et PV actuels du meme ecart (20 -> 30) ; prochain niveau 2 or', runUpgradeLevel(T.run.upgrades, 'ballista') === 1 && ballista.stats.maxHp === effectiveBallistaMaxHp(T.run.upgrades) && ballista.stats.maxHp === 350 && ballista.hp === 300 && ballistaUpgradeGoldCost(1) === 2 && T.completed.some((c) => c.kind === 'ballistaUpgrade' && c.level === 1), hpPts(ballista));
  // Plafond provisoire : Niv. 5 au total (interne 4). Niveaux 3, 4, 5 (2 + 4 + 8 or), puis refus.
  const ids = [];
  for (let i = 0; i < 3; i++) { ids.push(PO.queueBallistaUpgradeOrder(T.run, T.w, T.ledger, ballista)); T.runFor(BUILDING_UPGRADE_SECONDS + 0.1); }
  const sixth = PO.queueBallistaUpgradeOrder(T.run, T.w, T.ledger, ballista);
  check('Baliste : Niv. 3, 4, 5 acceptes (2 + 4 + 8 or), Niv. 5 = plafond (interne 4) : une 6e commande est REFUSEE, rien n est debite, file vide ; PV max 65', ids.every((id) => typeof id === 'number') && runUpgradeLevel(T.run.upgrades, 'ballista') === 4 && !canBallistaLevelUp(4) && sixth === null && T.run.gold === 499 - 2 - 4 - 8 && ballista.productionOrders.length === 0 && ballista.stats.maxHp === 650, { ids, sixth, gold: T.run.gold, level: T.run.upgrades.ballista });
  // File unique : Forge Armes -> Armures ; Sanctuaire Mage -> Niv. 2 -> Mage.
  const forge = T.spawnBuilding('forge', 6, -2);
  PO.queueTechnologyOrder(T.run, T.w, T.ledger, forge, 0, 'forge_weapons');
  PO.queueTechnologyOrder(T.run, T.w, T.ledger, forge, 0, 'forge_armor');
  const shrine = T.spawnBuilding('shrine', 10, -2);
  PO.queueUnitOrder(T.run, T.w, T.ledger, shrine, 0, 'mage');
  PO.queueBuildingUpgradeOrder(T.run, T.w, T.ledger, shrine, 0);
  PO.queueUnitOrder(T.run, T.w, T.ledger, shrine, 0, 'mage');
  const log: string[] = [];
  let seen = T.completed.length;
  let sp = T.spawned.length;
  for (let t = 0; t < 62; t += DT) {
    T.step();
    while (seen < T.completed.length) { const c = T.completed[seen++]; log.push(c.kind === 'research' ? c.techId : c.buildingId); }
    while (sp < T.spawned.length) { sp++; log.push('mage@' + sp); }
  }
  const mages = T.spawned.filter((e) => e.unitId === 'mage');
  const fb = findAbility(getUnit('mage').abilities, 'area-blast')!.damage;
  check('file unique, ordre respecte : Forge Armes puis Armures (30 s chacune) ; Sanctuaire Mage (14 s), Niv. 2 (20 s), Mage ; le 2e Mage sort avec Sanctuaire Niv. 2 ET les technologies, le 1er les a recus retroactivement',
    log.join() === 'mage@1,forge_weapons,shrine,mage@2,forge_armor' && mages.length === 2 && mages.every((m) => m.abilityDamageBonus === Math.round((fb + 20) * 1.1) - fb && m.stats.maxHp === Math.round((getUnit('mage').stats.maxHp + 30) * 1.1)), { log, mages: mages.map((m) => ({ ab: m.abilityDamageBonus, max: m.stats.maxHp })) });
  check('ordre des fiches : Villageois et Heros toujours hors des technologies', computePlayerUnitStats('villageois', T.progress).bonus.attackPercent === 0 && computePlayerUnitStats('hero', T.progress).bonus.hpPercent === 0);
}

console.log(failures ? failures + ' ECHEC(S)' : 'tout OK');
