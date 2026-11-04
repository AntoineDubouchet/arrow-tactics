// Tests cibles SANS NAVIGATEUR des contrats de la passe de modernisation 1 (2026-11-04) :
//  - production : un batiment pose n'apparait avec AUCUNE unite a produire (plus de quota « par manche »), la file
//    payee sort bien ses unites, le point de ralliement s'applique a TOUT producteur (Auberge, Sanctuaire, Eglise,
//    Ecurie), le Camp d'archerie n'est plus ameliorable, la Caserne Niv. 2 produit l'Homme d'armes ;
//  - Sanctuaire : produit le Mage ; aucune amelioration de parchemin dans les ameliorations de run ;
//  - talents : les talents retires sont rembourses au chargement, les talents actifs gardent leur effet ;
//  - defaite : la Baliste detruite est la seule condition (isBaseLost) ; les gardes de camp, murs et chantiers ne
//    comptent pas comme combattants ;
//  - economie : cargo / points de collecte inchanges (capacites, acceptation par batiment).
// Usage : node --import ../ts-register.mjs modernisation.mts (ou npm run test:sim)
const SRC = new URL('../../src/', import.meta.url).href;
const { World } = await import(SRC + 'sim/world.ts');
const { DEFAULT_MAP } = await import(SRC + 'config/mapDef.ts');
const { BUILDINGS, getBuilding } = await import(SRC + 'data/buildings.ts');
const { producibleUnits, PRODUCTION_QUEUE_MAX } = await import(SRC + 'data/production.ts');
const { isUpgradableBuilding } = await import(SRC + 'run/buildingUpgrades.ts');
const { isRunUpgradeId, runUpgradeGoldCost } = await import(SRC + 'run/runUpgrades.ts');
const { UNIT_UPGRADES } = await import(SRC + 'data/unitUpgrades.ts');
const { TALENTS, TALENT_BRANCH_ORDER, listFounderTalents, talentsByTier } = await import(SRC + 'data/talents.ts');
const { REMOVED_TALENT_REFUNDS, stripRemovedTalents, DEFAULT_META_PROGRESS, canUnlockTalent } = await import(SRC + 'run/metaProgress.ts');
const { computeStartingGoldBonus, computeTalentEconomyHooks } = await import(SRC + 'run/talentEffects.ts');
const { playerUnitStatOverrides } = await import(SRC + 'run/playerUnitStats.ts');
const { effectivePlayerArrowCooldown, playerArrowBoltsPerVolley } = await import(SRC + 'run/ballistaStats.ts');
const { TALENT_STARTING_GOLD_BONUS, TALENT_BONUS_GOLD_PER_KILL, TALENT_FANTASSIN_DODGE_CHANCE } = await import(SRC + 'config/constants.ts');
const { createNewRun, STARTING_GOLD, applyWaveVictory, WAVE_CLEAR_BONUS } = await import(SRC + 'run/runState.ts');
const { CARGO_CAPACITY } = await import(SRC + 'data/resources.ts');
const { generateSurvivalMap } = await import(SRC + 'config/maps/proceduralSurvival.ts');
const { campSpecOf } = await import(SRC + 'run/camps.ts');
const { applyDamageToEntity } = await import(SRC + 'sim/damage.ts');
const DT = 1 / 30;
let failures = 0;
const check = (label: string, ok: boolean, extra: unknown = '') => { if (!ok) failures++; console.log(`${ok ? 'OK   ' : 'ECHEC'} ${label}${extra !== '' ? ' — ' + JSON.stringify(extra).slice(0, 900) : ''}`); };
const run = (w: any, seconds: number) => { for (let t = 0; t < seconds; t += DT) w.step(DT); };
const fp = (id: string, x: number, z: number) => { const d = getBuilding(id); return { kind: 'building', x, z, tilesX: d.footprintTilesX, tilesZ: d.footprintTilesZ }; };

// ---- 1. Production : aucun spawn gratuit, file payee, ralliement pour tout producteur.
{
  const w = new World(3);
  w.setMap(DEFAULT_MAP);
  const hdef = getBuilding('house');
  for (let i = 0; i < 3; i++) w.spawnBuilding(hdef, 'player', -6.5 + i * 3, 6.5, fp('house', -6.5 + i * 3, 6.5));
  const producers = ['barracks', 'archery', 'tavern', 'shrine', 'church', 'stables'];
  const spawned = producers.map((id, i) => w.spawnBuilding(getBuilding(id), 'player', -8.5 + i * 4, -2.5, fp(id, -8.5 + i * 4, -2.5)));
  const unitsBefore = w.entities.filter((e: any) => !e.isBuilding).length;
  run(w, 5);
  const unitsAfter = w.entities.filter((e: any) => !e.isBuilding).length;
  check('aucun batiment pose ne produit gratuitement : productionQueue vide a l apparition, aucune unite apres 5 s (6 producteurs)',
    spawned.every((e: any) => e.productionQueue.length === 0 && e.productionOrders.length === 0) && unitsBefore === 0 && unitsAfter === 0, { unitsBefore, unitsAfter });
  check('aucune definition de batiment ne porte encore un quota par manche (`production`)', Object.values(BUILDINGS).every((d: any) => d.production === undefined));
  // Ralliement pour chaque producteur (avant : seuls Caserne et Camp d'archerie, par l'ancien quota).
  spawned.forEach((e: any, i: number) => w.queueRallyPoint(e.id, { x: 10 + i, z: 10 }));
  run(w, 1 / 30);
  check('point de ralliement accepte pour TOUS les producteurs (Caserne, Camp d archerie, Auberge, Sanctuaire, Eglise, Ecurie)',
    spawned.every((e: any, i: number) => e.rally && e.rally.x === 10 + i), spawned.map((e: any) => e.rally));
  // File payee : une unite par producteur, sortie a la fin de sa duree, et marche vers le ralliement.
  const first = producers.map((id) => producibleUnits(id, 0)[0]!);
  spawned.forEach((e: any, i: number) => w.queueProduction(e.id, { kind: 'unit', unitId: first[i] }, 1 + i * 0.5));
  const out: string[] = [];
  for (let t = 0; t < 6; t += DT) { w.step(DT); for (const ev of w.productionSpawnEvents) out.push(ev.unitId + (ev.rally ? '+r' : '')); }
  check('file temps reel : chaque producteur sort son unite (Piquier, Archer, Villageois, Mage, Oracle, Cavalier), avec son ralliement',
    JSON.stringify(out) === JSON.stringify(first.map((u) => u + '+r')), { out, first });
  check(`file : ${PRODUCTION_QUEUE_MAX} commandes au plus`, PRODUCTION_QUEUE_MAX === 5);
}

// ---- 2. Camp d'archerie / Caserne / Sanctuaire.
{
  check('Camp d archerie : plus ameliorable (Niv. 2 a redefinir en Pass 2), produit l Archer', !isUpgradableBuilding('archery') && JSON.stringify(producibleUnits('archery', 0)) === '["archer"]');
  check('Caserne : Niv. 1 Piquier ; Niv. 2 Piquier et Homme d armes ; ameliorable (max Niv. 2)',
    JSON.stringify(producibleUnits('barracks', 0)) === '["piquier"]' && JSON.stringify(producibleUnits('barracks', 1)) === '["piquier","fantassin"]' && isUpgradableBuilding('barracks') && getBuilding('barracks').maxUpgradeLevel === 1);
  const shrine = getBuilding('shrine');
  check('Sanctuaire : produit le Mage, amelioration Niv. 2 conservee (provisoire), plus de site d ameliorations de run',
    JSON.stringify(producibleUnits('shrine', 0)) === '["mage"]' && isUpgradableBuilding('shrine') && shrine.runUpgradeSite === undefined && !/parchemin/i.test(shrine.description ?? ''));
  check('Forge : seul site d ameliorations de run ; pioche de prospecteur conservee', getBuilding('forge').runUpgradeSite === 'forge' && JSON.stringify(getBuilding('forge').unlocksTools) === '["goldPickaxe"]');
  const ids = ['heal_scroll_minor', 'ice_nova', 'soins_excedentaires'];
  check('ameliorations de run : unites (Forge) et Baliste seulement ; aucune amelioration de parchemin', ids.every((id) => !isRunUpgradeId(id)) && Object.keys(UNIT_UPGRADES).every((id) => isRunUpgradeId(id)) && isRunUpgradeId('ballista') && runUpgradeGoldCost('fantassin', 0) === 7 && runUpgradeGoldCost('ballista', 0) === 1);
}

// ---- 3. Talents : retires rembourses, actifs appliques.
{
  const removed = ['aux_petits_oignons', 'blizzard', 'soins_excedentaires', 'recyclage'];
  check('talents retires absents de l arbre ; branches economie / precision / armee', removed.every((id) => !(id in TALENTS)) && JSON.stringify(TALENT_BRANCH_ORDER) === '["economie","precision","armee"]' && Object.keys(TALENTS).sort().join(',') === 'butin_de_guerre,mitraillette,or_depart,reflexes_fantassin,tir_rapide');
  check('arbre : 3 fondateurs, palier 2 = Mitraillette', listFounderTalents().map((t: any) => t.id).join(',') === 'butin_de_guerre,tir_rapide,reflexes_fantassin' && talentsByTier().length === 2 && talentsByTier()[1]!.map((t: any) => t.id).join(',') === 'mitraillette');
  const saved = ['or_depart', 'butin_de_guerre', 'aux_petits_oignons', 'blizzard', 'soins_excedentaires', 'recyclage', 'tir_rapide'];
  const { unlockedTalents, talentPoints } = stripRemovedTalents(saved, 1);
  check('sauvegarde ancienne : les 4 talents retires sont enleves et rembourses (1 + 1 + 1 + 2 + 2 = 7 points), les autres gardes',
    unlockedTalents.join(',') === 'or_depart,butin_de_guerre,tir_rapide' && talentPoints === 7 && removed.every((id) => REMOVED_TALENT_REFUNDS[id] !== undefined), { unlockedTalents, talentPoints });
  const all = { ...DEFAULT_META_PROGRESS, unlockedTalents: ['or_depart', 'butin_de_guerre', 'tir_rapide', 'mitraillette', 'reflexes_fantassin'], claimedWaveRewards: [], defeatedEnemyUnitIds: [], talentPoints: 5 };
  const none = { ...DEFAULT_META_PROGRESS, unlockedTalents: [], claimedWaveRewards: [], defeatedEnemyUnitIds: [], talentPoints: 5 };
  const progAll = { talents: all, upgrades: {} };
  const progNone = { talents: none, upgrades: {} };
  check('Or de depart : +5 or ; Butin de guerre : +1 or par tas', computeStartingGoldBonus(all) === TALENT_STARTING_GOLD_BONUS && computeStartingGoldBonus(none) === 0 && computeTalentEconomyHooks(all).bonusGoldPerKill!() === TALENT_BONUS_GOLD_PER_KILL && computeTalentEconomyHooks(none).bonusGoldPerKill!() === 0);
  check('Reflexes de veteran : +30 % d esquive pour l Homme d armes seulement', playerUnitStatOverrides('fantassin', 0, progAll).dodgeChance === TALENT_FANTASSIN_DODGE_CHANCE && playerUnitStatOverrides('fantassin', 0, progNone).dodgeChance === undefined && playerUnitStatOverrides('archer', 0, progAll).dodgeChance === undefined);
  check('Tir rapide + Mitraillette : recharge de la Baliste reduite, 3 carreaux par volee', effectivePlayerArrowCooldown(progAll) < effectivePlayerArrowCooldown(progNone) && playerArrowBoltsPerVolley(all) === 3 && playerArrowBoltsPerVolley(none) === 1, { all: effectivePlayerArrowCooldown(progAll), none: effectivePlayerArrowCooldown(progNone) });
  check('deblocage : racine puis fondateurs, Mitraillette apres Tir rapide', canUnlockTalent(none, 'or_depart') && !canUnlockTalent(none, 'tir_rapide') && !canUnlockTalent({ ...none, unlockedTalents: ['or_depart'] }, 'mitraillette') && canUnlockTalent({ ...none, unlockedTalents: ['or_depart', 'tir_rapide'] }, 'mitraillette'));
  const r = createNewRun(TALENT_STARTING_GOLD_BONUS);
  check('nouvelle run : 20 + 5 or, Heros seul, stock vide ; vague repoussee : +5 or et vague suivante', r.gold === STARTING_GOLD + 5 && r.army.length === 1 && r.army[0]!.unitId === 'hero' && r.resources.wood === 0 && !('inventory' in r) && !('mapExpansion' in r) && applyWaveVictory(r) === WAVE_CLEAR_BONUS && r.waveNumber === 2 && r.gold === STARTING_GOLD + 5 + WAVE_CLEAR_BONUS, r);
}

// ---- 4. Defaite : Baliste seule condition ; combattants.
{
  const map = generateSurvivalMap(12345);
  const w = new World(5);
  w.setMap(map);
  const b = w.spawnBuilding(getBuilding('ballista'), 'player', 0.5, 0.5);
  const hero = w.spawnHero('player', 0.5, 4.5, { xp: 0, level: 1, deaths: 0 });
  for (const def of map.camps ?? []) w.addCamp(campSpecOf(def));
  const site = w.spawnBuilding(getBuilding('house'), 'player', 6, 6, fp('house', 6, 6), undefined, undefined, undefined, { progress: 0, buildTime: 5 });
  const wall = w.spawnWallLine('player', 'palisade', { ax: -4, az: 8, bx: 4, bz: 8 });
  check('combattants : Baliste et Heros comptent ; chantier, murs et gardes de camp jamais', w.countCombatants('player') === 2 && !site.countsForDefeat && wall.every((e: any) => !e.countsForDefeat) && w.countCombatants('enemy') === 0 && w.entities.filter((e: any) => e.team === 'enemy').length > 0);
  check('base intacte : aucune defaite', !w.isBaseLost('player'));
  applyDamageToEntity(hero, 1e6);
  w.step(DT);
  check('Heros mort, Baliste vivante : la base tient (la run continue, resurrection)', !hero.alive && !w.isBaseLost('player') && hero.hero.respawnTimer > 0, { respawn: hero.hero.respawnTimer });
  applyDamageToEntity(b, 1e6);
  w.step(DT);
  check('Baliste detruite : defaite (isBaseLost), meme avec un Villageois vivant', (w.spawn('villageois', 'player', 3.5, 3.5), w.isBaseLost('player') && w.countCombatants('player') >= 1));
}

// ---- 5. Economie : cargo et points de collecte inchanges.
{
  check('cargo : Heros 10, Villageois 5', CARGO_CAPACITY.hero === 10 && CARGO_CAPACITY.villageois === 5);
  check('points de collecte : Baliste tout, Scierie bois, Camp de mineur pierre + or extrait ; Forge aucun',
    JSON.stringify(getBuilding('ballista').dropOff) === '["wood","stone","minedGold"]' && JSON.stringify(getBuilding('sawmill').dropOff) === '["wood"]' && JSON.stringify(getBuilding('miner_camp').dropOff) === '["stone","minedGold"]' && getBuilding('forge').dropOff === undefined);
}
console.log(failures ? failures + ' ECHEC(S)' : 'tout OK');
