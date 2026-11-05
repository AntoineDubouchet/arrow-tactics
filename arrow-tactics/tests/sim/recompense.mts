// Tests cibles SANS NAVIGATEUR de la recompense de vague (2026-11-05, G46) : vague repoussee -> deux propositions
// distinctes de la banque au niveau de la vague, stats deterministes (meme graine + meme vague = memes propositions),
// plus de +5 or ; choix -> item (avec son niveau) dans l'inventaire RPG ; inventaire plein -> recompense conservee ;
// deux vagues non choisies -> file ; sauvegarde : donnees pures dans RunState.
// Usage : node --import ../ts-register.mjs recompense.mts (ou npm run test:sim)
const SRC = new URL('../../src/', import.meta.url).href;
const { createNewRun, applyWaveVictory, takeWaveReward, STARTING_GOLD } = await import(SRC + 'run/runState.ts');
const { rollWaveReward, waveRewardChoices } = await import(SRC + 'run/waveRewards.ts');
const { EQUIPMENT, statsAtLevel } = await import(SRC + 'data/equipment.ts');
const { createHeroInventory, addItem, freeSlotCount, applyInventoryAction, equipFromSlot, resolveEquipmentBonus } = await import(SRC + 'sim/inventory.ts');
const { HERO_INVENTORY_SLOTS } = await import(SRC + 'data/hero.ts');
let failures = 0;
const check = (label: string, ok: boolean, extra: unknown = '') => { if (!ok) failures++; console.log(`${ok ? 'OK   ' : 'ECHEC'} ${label}${extra !== '' ? ' — ' + JSON.stringify(extra).slice(0, 900) : ''}`); };

// ---- 1. Vague N repoussee : deux propositions, niveau N, pas d'or.
{
  const run = createNewRun();
  run.mapSeed = 12345;
  const gold0 = run.gold;
  const r1 = applyWaveVictory(run, run.mapSeed);
  const [a, b] = waveRewardChoices(r1);
  check('vague 1 repoussee : 2 propositions distinctes de la banque, niveau 1, or inchange (plus de +5), vague suivante', r1.wave === 1 && r1.itemIds[0] !== r1.itemIds[1] && r1.itemIds.every((id) => !!EQUIPMENT[id]) && a.level === 1 && b.level === 1 && run.gold === gold0 && run.gold === STARTING_GOLD && run.waveNumber === 2 && run.pendingRewards.length === 1, { r1, gold: run.gold });
  const again = rollWaveReward(12345, 1);
  check('determinisme : meme graine + meme vague -> memes propositions ; autre graine ou autre vague -> tirage different (au moins l un des deux)', JSON.stringify(again.itemIds) === JSON.stringify(r1.itemIds) && (JSON.stringify(rollWaveReward(777, 1).itemIds) !== JSON.stringify(r1.itemIds) || JSON.stringify(rollWaveReward(12345, 2).itemIds) !== JSON.stringify(r1.itemIds)), { again, other: rollWaveReward(777, 1) });
  // Vague 7 : niveau 7, stats = statsAtLevel.
  for (let i = 0; i < 5; i++) applyWaveVictory(run, run.mapSeed);
  const r7 = applyWaveVictory(run, run.mapSeed);
  const [c] = waveRewardChoices(r7);
  check('vague 7 : propositions de niveau 7, stats deterministes de la definition (statsAtLevel)', r7.wave === 7 && c.level === 7 && JSON.stringify(c.stats) === JSON.stringify(statsAtLevel(EQUIPMENT[c.itemId], 7)), { id: c.itemId, stats: c.stats });
  check('file : 7 recompenses en attente dans l ordre des vagues', run.pendingRewards.length === 7 && run.pendingRewards.map((r: any) => r.wave).join() === '1,2,3,4,5,6,7');
  check('choix : la recompense quitte la file ; une vague absente est refusee', takeWaveReward(run, 3) && run.pendingRewards.length === 6 && !takeWaveReward(run, 3) && !run.pendingRewards.some((r: any) => r.wave === 3));
}

// ---- 2. Choix -> inventaire RPG avec le niveau ; plein -> conserve ; equiper applique les stats du niveau.
{
  const run = createNewRun();
  const r = applyWaveVictory(run, 42);
  const [pick] = waveRewardChoices(r);
  const inv = applyInventoryAction(createHeroInventory(), { type: 'add', itemId: pick.itemId, level: pick.level });
  check('item choisi ajoute au sac avec son niveau', !!inv && inv.slots[0]?.itemId === pick.itemId && inv.slots[0]?.level === pick.level, inv?.slots[0]);
  const full = createHeroInventory(Array.from({ length: HERO_INVENTORY_SLOTS }, () => 'starter_sword'));
  const refused = applyInventoryAction(full, { type: 'add', itemId: pick.itemId, level: pick.level });
  check('inventaire plein : ajout refuse (null), la recompense reste en attente (file intacte tant que le choix n est pas valide)', refused === null && freeSlotCount(full) === 0 && run.pendingRewards.length === 1, { free: freeSlotCount(full), pending: run.pendingRewards.length });
  // Niveau 9 d'un item physique : bonus = stats du niveau 9.
  const inv9 = equipFromSlot(addItem(createHeroInventory(), 'starter_sword', 9), 0)!;
  const bonus = resolveEquipmentBonus(inv9);
  check('Epee du debutant niveau 9 equipee : 3 + 0,5 x 8 = 7 points de degats physiques (70 internes), niveau garde a l emplacement', bonus.damage === 70 && inv9.equippedLevels.mainHand === 9, { bonus: bonus.damage, levels: inv9.equippedLevels });
  // Retirer puis re-equiper : le niveau suit l'item.
  const back = applyInventoryAction(inv9, { type: 'unequip', slot: 'mainHand' })!;
  check('retire : l item revient dans le sac avec son niveau 9', back.slots.find((s: any) => s?.itemId === 'starter_sword')?.level === 9 && back.equipped.mainHand === undefined, back.slots.filter(Boolean));
  // Ancienne sauvegarde sans niveaux : niveau 1 partout.
  const legacy: any = { slots: [{ kind: 'item', itemId: 'iron_helm' }, null], equipped: { shield: 'sturdy_shield' } };
  const lb = resolveEquipmentBonus(legacy);
  check('inventaire sans niveaux (ancienne sauvegarde) : lu comme niveau 1 (Bouclier robuste : +8 PV)', lb.maxHp === 80 && applyInventoryAction(legacy, { type: 'equip', from: 0 })!.equippedLevels.helmet === 1, lb);
}

console.log(failures ? failures + ' ECHEC(S)' : 'tout OK');
