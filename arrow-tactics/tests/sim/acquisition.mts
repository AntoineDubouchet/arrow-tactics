// Tests cibles SANS NAVIGATEUR de l'acquisition d'items et de l'ergonomie d'inventaire (2026-11-05, G47) : piece portable +
// emplacement vide = auto-equipee (regle unique acquireItem / acquisitionPlan : recompense, butin ramasse) ; emplacement
// occupe ou main exclusive prise : sac, jamais de remplacement ; piece non portable : sac, equipement manuel refuse ; sac
// plein : refus sans perte, sauf si l'emplacement est libre ; equiper = echange dans la case liberee, sans seconde case ;
// retirer sac plein : refus, la piece reste portee ; le niveau suit la piece ; une icone distincte par emplacement.
// Usage : node --import ../ts-register.mjs acquisition.mts (ou npm run test:sim)
const SRC = new URL('../../src/', import.meta.url).href;
const { EQUIPMENT, EQUIPMENT_SLOT_ORDER } = await import(SRC + 'data/equipment.ts');
const { canHeroEquipItem, HEROES } = await import(SRC + 'data/heroes.ts');
const { HERO_INVENTORY_SLOTS } = await import(SRC + 'data/hero.ts');
const { acquireItem, acquisitionPlan, addItem, applyInventoryAction, createHeroInventory, equipFromSlot, resolveEquipmentBonus, unequipSlot } = await import(SRC + 'sim/inventory.ts');
const { SLOT_ICON_PATHS } = await import(SRC + 'ui/slotIcons.ts');
const { World } = await import(SRC + 'sim/world.ts');
const { DEFAULT_MAP } = await import(SRC + 'config/mapDef.ts');
const DT = 1 / 30;
let failures = 0;
const check = (label: string, ok: boolean, extra: unknown = '') => { if (!ok) failures++; console.log(`${ok ? 'OK   ' : 'ECHEC'} ${label}${extra !== '' ? ' — ' + JSON.stringify(extra).slice(0, 900) : ''}`); };
const PALADIN = HEROES[0].id;
// Item de test reserve a un autre Heros (la banque actuelle n'en a aucun) : seule la regle est testee.
(EQUIPMENT as any).test_mage_robe = { ...EQUIPMENT.plate_cuirass, id: 'test_mage_robe', name: 'Robe de test', allowedHeroes: ['mage_futur'] };

// ---- 1. Portabilite : une seule regle, sans id de Heros code en dur.
check('canHeroEquipItem : sans restriction = tous ; restriction = seulement les Heros listes', canHeroEquipItem(PALADIN, EQUIPMENT.plate_cuirass) && canHeroEquipItem('autre', EQUIPMENT.plate_cuirass) && !canHeroEquipItem(PALADIN, EQUIPMENT.test_mage_robe) && canHeroEquipItem('mage_futur', EQUIPMENT.test_mage_robe));

// ---- 2. Slot vide + portable : auto-equipe, sans passer par le sac.
{
  const inv = createHeroInventory();
  const plan = acquisitionPlan(inv, 'swift_leggings', PALADIN);
  const got = acquireItem(inv, 'swift_leggings', 4, PALADIN)!;
  check('emplacement vide + piece portable : auto-equipee, au niveau recu, sac intact', plan === 'equip' && got.equipped && got.inventory.equipped.legs === 'swift_leggings' && got.inventory.equippedLevels.legs === 4 && got.inventory.slots.every((s: any) => s === null) && Object.keys(inv.equipped).length === 0, got.inventory.equipped);
  check('bonus resolu au niveau de la piece auto-equipee', resolveEquipmentBonus(got.inventory).attackSpeed > 0.08);
  // ---- 3. Slot occupe : sac, jamais de remplacement, meme si la nouvelle piece est plus forte.
  const second = acquireItem(got.inventory, 'march_greaves', 50, PALADIN)!;
  check('emplacement occupe : la nouvelle piece va au sac, l ancienne reste portee (aucune comparaison de puissance)', !second.equipped && second.inventory.equipped.legs === 'swift_leggings' && second.inventory.slots[0]?.itemId === 'march_greaves' && second.inventory.slots[0]?.level === 50, second.inventory.slots[0]);
  // Main gauche exclusive : un bouclier porte occupe aussi la main secondaire.
  const withShield = acquireItem(createHeroInventory(), 'sturdy_shield', 1, PALADIN)!.inventory;
  const dagger = acquireItem(withShield, 'hunting_dagger', 1, PALADIN)!;
  check('bouclier porte : une dague (meme main) va au sac, le bouclier n est jamais retire', !dagger.equipped && dagger.inventory.equipped.shield === 'sturdy_shield' && !dagger.inventory.equipped.offHand && dagger.inventory.slots[0]?.itemId === 'hunting_dagger');
}

// ---- 4. Non portable : sac ; equipement manuel refuse.
{
  const got = acquireItem(createHeroInventory(), 'test_mage_robe', 1, PALADIN)!;
  check('piece non portable, emplacement vide : va au sac, jamais equipee', !got.equipped && !got.inventory.equipped.chest && got.inventory.slots[0]?.itemId === 'test_mage_robe' && acquisitionPlan(createHeroInventory(), 'test_mage_robe', PALADIN) === 'bag');
  check('equipement manuel d une piece non portable : refuse ; le Heros autorise peut', equipFromSlot(got.inventory, 0, undefined, PALADIN) === null && applyInventoryAction(got.inventory, { type: 'equip', from: 0 }, PALADIN) === null && !!equipFromSlot(got.inventory, 0, undefined, 'mage_futur'));
}

// ---- 5. Sac plein : rien n'est perdu ; l'emplacement vide reste possible.
{
  const full = createHeroInventory(Array.from({ length: HERO_INVENTORY_SLOTS }, () => 'starter_sword'));
  const onEmptySlot = acquireItem(full, 'iron_helm', 3, PALADIN)!;
  check('sac plein + emplacement vide : equipee quand meme (aucune case necessaire)', onEmptySlot.equipped && onEmptySlot.inventory.equipped.helmet === 'iron_helm' && acquisitionPlan(full, 'iron_helm', PALADIN) === 'equip');
  const worn = onEmptySlot.inventory;
  check('sac plein + emplacement occupe : refus, inventaire intact (la recompense reste en attente)', acquisitionPlan(worn, 'sage_circlet', PALADIN) === null && acquireItem(worn, 'sage_circlet', 1, PALADIN) === null && worn.equipped.helmet === 'iron_helm');
  check('sac plein : retirer une piece portee est refuse, elle reste portee (rien de perdu)', unequipSlot(worn, 'helmet') === null && applyInventoryAction(worn, { type: 'unequip', slot: 'helmet' }, PALADIN) === null && worn.equipped.helmet === 'iron_helm');
  // ---- 6. Echange par le sac plein : aucune seconde case necessaire.
  const swap = equipFromSlot(worn, 5, undefined, PALADIN);
  const swapHelm = (() => { const inv = { ...worn, slots: worn.slots.map((s: any, i: number) => (i === 5 ? { kind: 'item', itemId: 'sage_circlet', level: 7 } : s)) }; return equipFromSlot(inv, 5, undefined, PALADIN)!; })();
  check('equiper depuis le sac plein : la piece remplacee revient dans la case liberee (aucune perte, aucune seconde case)', !!swap && swapHelm.equipped.helmet === 'sage_circlet' && swapHelm.equippedLevels.helmet === 7 && swapHelm.slots[5]?.itemId === 'iron_helm' && swapHelm.slots[5]?.level === 3 && swapHelm.slots.filter((s: any) => s === null).length === 0, swapHelm.slots[5]);
}

// ---- 7. Simulation : action `acquire` (recompense) et butin ramasse passent par la meme regle ; stats a jour.
{
  const w = new World(3); w.setMap(DEFAULT_MAP);
  const hero = w.spawnHero('player', 0.5, 0.5, { xp: 0, level: 1, deaths: 0 });
  const base = hero.stats.maxHp;
  w.queueInventoryAction(hero.id, { type: 'acquire', itemId: 'plate_cuirass', level: 1 });
  w.step(DT);
  check('action acquire (recompense) : equipee, PV max du Heros augmentes aussitot', hero.hero.inventory.equipped.chest === 'plate_cuirass' && hero.stats.maxHp === base + 100, hero.stats.maxHp);
  w.queueInventoryAction(hero.id, { type: 'acquire', itemId: 'battle_mail', level: 1 });
  w.step(DT);
  check('action acquire, emplacement occupe : sac, stats inchangees', hero.hero.inventory.slots[0]?.itemId === 'battle_mail' && hero.hero.inventory.equipped.chest === 'plate_cuirass' && hero.stats.maxHp === base + 100);
  // Meme item a un autre niveau : les bonus suivent (le meme id, un autre niveau).
  w.queueInventoryAction(hero.id, { type: 'add', itemId: 'plate_cuirass', level: 11 });
  w.step(DT);
  w.queueInventoryAction(hero.id, { type: 'equip', from: 1 });
  w.step(DT);
  check('remplacer une piece par le meme item d un autre niveau : stats recalculees (niveau 11 : 10 + 1,5 x 10 = 25 PV)', hero.hero.inventory.equippedLevels.chest === 11 && hero.stats.maxHp === base + 250, { maxHp: hero.stats.maxHp, levels: hero.hero.inventory.equippedLevels });
  // Butin au sol : ramassage, auto-equipement, stats.
  const dmg0 = hero.stats.damage;
  const drop = w.dropItem('heavy_gauntlets', hero.x + 1, hero.z);
  w.issueCommand({ kind: 'pickupItem', entityIds: [hero.id], dropId: drop });
  let ev: any = null;
  for (let i = 0; i < 30 * 5 && !ev; i++) { w.step(DT); ev = w.heroEvents.find((e: any) => e.type === 'itemPickup') ?? null; }
  check('butin ramasse, emplacement vide : auto-equipe (evenement equipped), degats physiques du Heros augmentes, jamais dans le sac', ev?.equipped === true && hero.hero.inventory.equipped.arms === 'heavy_gauntlets' && hero.stats.damage === dmg0 + 20 && !hero.hero.inventory.slots.some((s: any) => s?.itemId === 'heavy_gauntlets'), ev);
  const drop2 = w.dropItem('weaver_sleeves', hero.x + 1, hero.z);
  w.issueCommand({ kind: 'pickupItem', entityIds: [hero.id], dropId: drop2 });
  let ev2: any = null;
  for (let i = 0; i < 30 * 5 && !ev2; i++) { w.step(DT); ev2 = w.heroEvents.find((e: any) => e.type === 'itemPickup') ?? null; }
  check('butin ramasse, emplacement occupe : sac (evenement equipped faux)', ev2?.equipped === false && hero.hero.inventory.equipped.arms === 'heavy_gauntlets' && hero.hero.inventory.slots.some((s: any) => s?.itemId === 'weaver_sleeves'), ev2);
}

// ---- 8. Icones : une par emplacement reel, toutes distinctes ; les jambes ne sont plus le plastron.
{
  const paths = EQUIPMENT_SLOT_ORDER.map((s: string) => SLOT_ICON_PATHS[s]);
  check(`icones : les ${EQUIPMENT_SLOT_ORDER.length} emplacements ont chacun leur pictogramme, tous distincts ; table sans emplacement inconnu`, paths.every((p: string) => typeof p === 'string' && p.length > 10) && new Set(paths).size === EQUIPMENT_SLOT_ORDER.length && Object.keys(SLOT_ICON_PATHS).length === EQUIPMENT_SLOT_ORDER.length, Object.keys(SLOT_ICON_PATHS));
  check('jambes : pictogramme different du torse ; epaules, bras, cape aussi', SLOT_ICON_PATHS.legs !== SLOT_ICON_PATHS.chest && SLOT_ICON_PATHS.shoulders !== SLOT_ICON_PATHS.chest && SLOT_ICON_PATHS.arms !== SLOT_ICON_PATHS.chest && SLOT_ICON_PATHS.cape !== SLOT_ICON_PATHS.chest);
  check('chaque item de la banque a une icone (son emplacement)', Object.values(EQUIPMENT).every((d: any) => !!SLOT_ICON_PATHS[d.slot]));
}

console.log(failures ? failures + ' ECHEC(S)' : 'tout OK');
