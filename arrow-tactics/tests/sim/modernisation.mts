// Tests cibles SANS NAVIGATEUR des contrats de la passe de modernisation 1 (2026-11-04) :
//  - production : un batiment pose n'apparait avec AUCUNE unite a produire (plus de quota « par manche »), la file
//    payee sort bien ses unites, le point de ralliement s'applique a TOUT producteur (Auberge, Sanctuaire, Eglise,
//    Ecurie), la Caserne Niv. 2 produit l'Homme d'armes ; Pass 2 (2026-11-05) : Camp d'archerie, Sanctuaire et
//    Ecurie Niv. 2 ameliorent leur roster, la Forge porte des technologies, plus d'outil d'or ni d'ecran ;
//  - Sanctuaire : produit le Mage ; aucune amelioration de parchemin ni d'unite a la Forge ;
//  - talents : les talents retires sont rembourses au chargement, les talents actifs gardent leur effet ;
//  - defaite : la Baliste detruite est la seule condition (isBaseLost) ; les gardes de camp, murs et chantiers ne
//    comptent pas comme combattants ;
//  - economie : cargo / points de collecte inchanges (capacites, acceptation par batiment).
// Usage : node --import ../ts-register.mjs modernisation.mts (ou npm run test:sim)
const SRC = new URL('../../src/', import.meta.url).href;
const { World } = await import(SRC + 'sim/world.ts');
const { DEFAULT_MAP } = await import(SRC + 'config/mapDef.ts');
const { BUILDINGS, getBuilding, buildingUpgradeScope } = await import(SRC + 'data/buildings.ts');
const { producibleUnits, PRODUCTION_QUEUE_MAX } = await import(SRC + 'data/production.ts');
const { isUpgradableBuilding } = await import(SRC + 'run/buildingUpgrades.ts');
const { ballistaUpgradeGoldCost } = await import(SRC + 'run/runUpgrades.ts');
const { technologiesAt, isTechnologyId } = await import(SRC + 'data/technologies.ts');
const { TALENTS, TALENT_BRANCH_ORDER, listFounderTalents, talentsByTier } = await import(SRC + 'data/talents.ts');
const { REMOVED_TALENT_REFUNDS, stripRemovedTalents, DEFAULT_META_PROGRESS, canUnlockTalent } = await import(SRC + 'run/metaProgress.ts');
const { computeStartingGoldBonus, computeTalentEconomyHooks } = await import(SRC + 'run/talentEffects.ts');
const { computePlayerUnitStats } = await import(SRC + 'run/playerUnitStats.ts');
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

// ---- 2. Camp d'archerie / Caserne / Sanctuaire / Ecurie / Forge / Eglise (Pass 2, 2026-11-05).
{
  const archery = getBuilding('archery');
  check('Camp d archerie : produit l Archer ; Niv. 2 (max) global a la run : Archers +2 PV, +1 degats',
    isUpgradableBuilding('archery') && archery.maxUpgradeLevel === 1 && buildingUpgradeScope('archery') === 'run' && JSON.stringify(archery.rosterBonusPerLevel) === '{"archer":{"hp":2,"attack":1}}' && JSON.stringify(producibleUnits('archery', 0)) === '["archer"]');
  check('Caserne : Niv. 1 Piquier ; Niv. 2 Piquier et Homme d armes ; ameliorable (max Niv. 2), niveau de run ; technologie Entrainement au Niv. 2',
    JSON.stringify(producibleUnits('barracks', 0)) === '["piquier"]' && JSON.stringify(producibleUnits('barracks', 1)) === '["piquier","fantassin"]' && isUpgradableBuilding('barracks') && getBuilding('barracks').maxUpgradeLevel === 1 && buildingUpgradeScope('barracks') === 'run' && technologiesAt('barracks').map((t: any) => t.id + ':' + t.requiresSiteLevel).join() === 'barracks_training:1');
  const shrine = getBuilding('shrine');
  check('Sanctuaire : produit le Mage ; Niv. 2 : Mages +3 PV, +2 Boule de feu ; plus de PV du batiment ni de parchemins',
    JSON.stringify(producibleUnits('shrine', 0)) === '["mage"]' && isUpgradableBuilding('shrine') && buildingUpgradeScope('shrine') === 'run' && JSON.stringify(shrine.rosterBonusPerLevel) === '{"mage":{"hp":3,"attack":2}}' && shrine.hpPerLevel === undefined && !/parchemin/i.test(shrine.description ?? ''));
  check('Ecurie : Niv. 2 : Cavaliers +5 PV, +5 % vitesse ; plus de PV du batiment', JSON.stringify(getBuilding('stables').rosterBonusPerLevel) === '{"cavalier":{"hp":5,"moveSpeedPercent":5}}' && getBuilding('stables').hpPerLevel === undefined && buildingUpgradeScope('stables') === 'run');
  const forge = getBuilding('forge') as any;
  check('Forge : technologies Armes forgees I et Armures forgees I ; plus d outil de recolte ni d ecran d ameliorations',
    technologiesAt('forge').map((t: any) => t.id).join() === 'forge_weapons,forge_armor' && forge.unlocksTools === undefined && forge.runUpgradeSite === undefined);
  check('Eglise : plus de soin de l armee, plus d amelioration (placeholder retire) ; produit Oracle et Vengeur', (getBuilding('church') as any).armyHeal === undefined && !isUpgradableBuilding('church') && getBuilding('church').hpPerLevel === undefined && JSON.stringify(producibleUnits('church', 0)) === '["oracle","vengeur"]');
  const ids = ['heal_scroll_minor', 'ice_nova', 'soins_excedentaires', 'fantassin', 'archer', 'mage', 'sentinel'];
  check('aucune amelioration de parchemin ni d unite a la Forge ; Baliste : 1 or au niveau 1, puis x2', ids.every((id) => !isTechnologyId(id)) && ballistaUpgradeGoldCost(0) === 1 && ballistaUpgradeGoldCost(3) === 8);
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
  const all = { ...DEFAULT_META_PROGRESS, unlockedTalents: ['or_depart', 'butin_de_guerre', 'tir_rapide', 'mitraillette', 'reflexes_fantassin'], claimedWaveRewards: [], talentPoints: 5 };
  const none = { ...DEFAULT_META_PROGRESS, unlockedTalents: [], claimedWaveRewards: [], talentPoints: 5 };
  const progAll = { talents: all, upgrades: {} };
  const progNone = { talents: none, upgrades: {} };
  check('Or de depart : +5 or ; Butin de guerre : +1 or par tas', computeStartingGoldBonus(all) === TALENT_STARTING_GOLD_BONUS && computeStartingGoldBonus(none) === 0 && computeTalentEconomyHooks(all).bonusGoldPerKill!() === TALENT_BONUS_GOLD_PER_KILL && computeTalentEconomyHooks(none).bonusGoldPerKill!() === 0);
  const ov = (u: string, p: any) => computePlayerUnitStats(u, p).statOverrides ?? {};
  check('Reflexes de veteran : +30 % d esquive pour l Homme d armes seulement', ov('fantassin', progAll).dodgeChance === TALENT_FANTASSIN_DODGE_CHANCE && ov('fantassin', progNone).dodgeChance === undefined && ov('archer', progAll).dodgeChance === undefined);
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
  check('cargo : Heros 10, Villageois 10 (5 avant la passe economie du 2026-11-05)', CARGO_CAPACITY.hero === 10 && CARGO_CAPACITY.villageois === 10);
  check('points de collecte : Baliste tout, Scierie bois, Camp de mineur pierre + or extrait ; Forge aucun',
    JSON.stringify(getBuilding('ballista').dropOff) === '["wood","stone","minedGold"]' && JSON.stringify(getBuilding('sawmill').dropOff) === '["wood"]' && JSON.stringify(getBuilding('miner_camp').dropOff) === '["stone","minedGold"]' && getBuilding('forge').dropOff === undefined);
}
console.log(failures ? failures + ' ECHEC(S)' : 'tout OK');
