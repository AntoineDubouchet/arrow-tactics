// Tests cibles SANS NAVIGATEUR des couts recales (2026-11-05, G45 : autour d'un cargo Villageois de 10) :
//  - echelle : Maison 10 bois sans or ; economique 1 a 2 cargaisons de matiere, militaire standard 2 a 4, avance 3 a 6 ;
//    bois pour les batiments legers, pierre pour les lourds ; Mine pas moins de matiere qu'une Maison ; technologies
//    militaires au moins autant de matiere qu'un batiment economique ; Palissade 0,5 bois par case ;
//  - run/buildingCosts.ts : cout exact, refus sans ressources (bois OU pierre manquant), debit exact quand le stock
//    suffit, jamais sous zero, `times` ; un chantier pose dans le monde garde le cout de sa definition (reparation).
// La pose elle-meme (verification d'or + matiere, chantier cree) vit dans main.ts (confirmBuildingPlacement) et n'est
// pas simulable ici : forge-jeu.cjs couvre les debits exacts en jeu.
// Usage : node --import ../ts-register.mjs couts.mts (ou npm run test:sim)
const SRC = new URL('../../src/', import.meta.url).href;
const { World } = await import(SRC + 'sim/world.ts');
const { getBuilding, listBuyableBuildingIds } = await import(SRC + 'data/buildings.ts');
const { getTechnology } = await import(SRC + 'data/technologies.ts');
const { getWallType } = await import(SRC + 'data/walls.ts');
const { buildingMaterialCost, canAffordMaterials, payMaterials } = await import(SRC + 'run/buildingCosts.ts');
const { repairBaseCost } = await import(SRC + 'run/buildingRepair.ts');
let failures = 0;
const check = (label: string, ok: boolean, extra: unknown = '') => { if (!ok) failures++; console.log(`${ok ? 'OK   ' : 'ECHEC'} ${label}${extra !== '' ? ' — ' + JSON.stringify(extra).slice(0, 900) : ''}`); };
const CARGO = 10;
const mat = (id: string) => { const c = buildingMaterialCost(id); return { gold: getBuilding(id).cost ?? 0, wood: c.wood, stone: c.stone, cargos: (c.wood + c.stone) / CARGO }; };

// ---- 1. Echelle.
{
  const t: Record<string, any> = {};
  for (const id of ['house', 'sawmill', 'miner_camp', 'mine', 'tavern', 'barracks', 'archery', 'forge', 'tower', 'shrine', 'stables', 'church']) t[id] = mat(id);
  check('Maison : 10 bois, aucune pierre, 0 or', t.house.wood === 10 && t.house.stone === 0 && t.house.gold === 0, t.house);
  check('economiques (Scierie, Camp de mineur, Mine) : 1 a 2 cargaisons de matiere ; Scierie bois seul ; Mine >= matiere d une Maison', ['sawmill', 'miner_camp', 'mine'].every((id) => t[id].cargos >= 1 && t[id].cargos <= 2) && t.sawmill.stone === 0 && t.mine.wood + t.mine.stone >= t.house.wood + t.house.stone, { sawmill: t.sawmill, miner_camp: t.miner_camp, mine: t.mine });
  check('militaires standard (Auberge, Caserne, Camp d archerie, Forge) : 2 a 4 cargaisons ; Auberge et Camp d archerie surtout bois, Forge surtout pierre, Caserne mixte', ['tavern', 'barracks', 'archery', 'forge'].every((id) => t[id].cargos >= 2 && t[id].cargos <= 4) && t.tavern.stone === 0 && t.archery.wood > t.archery.stone && t.forge.stone > t.forge.wood && t.barracks.wood > 0 && t.barracks.stone > 0, { tavern: t.tavern, barracks: t.barracks, archery: t.archery, forge: t.forge });
  check('avances (Tour, Sanctuaire, Ecurie, Eglise) : 3 a 6 cargaisons ; Tour, Sanctuaire et Eglise surtout pierre ; Ecurie mixte', ['tower', 'shrine', 'stables', 'church'].every((id) => t[id].cargos >= 3 && t[id].cargos <= 6) && t.tower.stone > t.tower.wood && t.shrine.stone > t.shrine.wood && t.church.stone > t.church.wood && t.stables.wood > 0 && t.stables.stone > 0, { tower: t.tower, shrine: t.shrine, stables: t.stables, church: t.church });
  check('or : garde partout sauf la Maison, Eglise la plus chere (35), Sanctuaire 25, Scierie et Camp de mineur 5', listBuyableBuildingIds().every((id: string) => id === 'house' || (getBuilding(id).cost ?? 0) >= 5) && t.church.gold === 35 && t.shrine.gold === 25 && t.sawmill.gold === 5 && t.miner_camp.gold === 5, Object.fromEntries(Object.entries(t).map(([k, v]: any) => [k, v.gold])));
  const fw = getTechnology('forge_weapons'), fa = getTechnology('forge_armor'), bt = getTechnology('barracks_training');
  const matOf = (d: any) => (d.resourceCost.wood ?? 0) + (d.resourceCost.stone ?? 0);
  check('technologies : Armes forgees I et Armures forgees I >= matiere d une Scierie (30 chacune), Entrainement des hommes d armes avec de la matiere (15), or inchange (20 / 20 / 7)', matOf(fw) >= 15 && matOf(fa) >= 15 && matOf(bt) >= 10 && fw.goldCost === 20 && fa.goldCost === 20 && bt.goldCost === 7, { fw: fw.resourceCost, fa: fa.resourceCost, bt: bt.resourceCost });
  const pal = getWallType('palisade');
  check('Palissade inchangee : 0,5 bois par case (enceinte de depart de 66 cases = 33 bois, un peu plus d un trajet)', pal.costPerTile.wood === 0.5 && !pal.costPerTile.stone, pal.costPerTile);
}

// ---- 2. Helpers purs : cout exact, refus, debit exact.
{
  const res = { wood: 24, stone: 9 };
  check('Caserne (20 bois, 10 pierre) : refusee avec 24 bois / 9 pierre (pierre manquante), stock intact', !canAffordMaterials(res, 'barracks') && res.wood === 24 && res.stone === 9, res);
  res.stone = 10;
  check('Caserne : acceptee a 24 / 10, debit exact -> 4 bois / 0 pierre', canAffordMaterials(res, 'barracks') && (payMaterials(res, 'barracks'), res.wood === 4 && res.stone === 0), res);
  check('Maison : refusee a 4 bois, acceptee a 10 (bois seul), debit -> 0 ; jamais sous zero', !canAffordMaterials(res, 'house') && (res.wood = 10, canAffordMaterials(res, 'house')) && (payMaterials(res, 'house'), res.wood === 0 && res.stone === 0) && (payMaterials(res, 'house'), res.wood === 0), res);
  const r2 = { wood: 100, stone: 100 };
  const twice = buildingMaterialCost('tower', 2);
  check('times : 2 Tours = 20 bois + 50 pierre ; payable, debit exact', twice.wood === 20 && twice.stone === 50 && canAffordMaterials(r2, 'tower', 2) && (payMaterials(r2, 'tower', 2), r2.wood === 80 && r2.stone === 50), { twice, r2 });
  check('Palissade (hors batiments) : cout matiere 0 par les helpers (son prix passe par data/walls.ts)', buildingMaterialCost('palisade').wood === 0 && canAffordMaterials({ wood: 0, stone: 0 }, 'palisade'));
}

// ---- 3. Monde : un chantier pose garde le cout de sa definition (reparation lue depuis BuildingDef).
{
  const w = new World(1);
  w.setMap({ name: 'test', version: 1, width: 20, height: 20, obstacles: [], playerUnits: [], enemyUnits: [] });
  const b = w.spawnBuilding(getBuilding('forge'), 'player', 2.5, 2.5);
  b.construction = { progress: 0, builtHp: 0 };
  const rc = repairBaseCost(b.unitId);
  check('chantier de Forge dans le monde : definition 10 or, 15 bois, 20 pierre (reparation : memes bases)', b.unitId === 'forge' && !!b.construction && getBuilding(b.unitId).cost === 10 && getBuilding(b.unitId).resourceCost!.wood === 15 && getBuilding(b.unitId).resourceCost!.stone === 20 && (rc.gold === 10 && rc.wood === 15 && rc.stone === 20), { rc });
}

console.log(failures ? failures + ' ECHEC(S)' : 'tout OK');
