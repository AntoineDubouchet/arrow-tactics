// Tests cibles SANS NAVIGATEUR de la banque d'items (2026-11-05, G46) : exactement 2 items par emplacement (9
// emplacements, 18 items), ids uniques et stables, aucune stat aleatoire (meme item + meme niveau -> memes stats,
// progression deterministe par niveau), les trois orientations (tank, physique, magique) presentes, tables de butin
// et catalogue coherents, editeur d'items (export / import, progression, archetype, ancien champ `damage`).
// Usage : node --import ../ts-register.mjs loot-bank.mts (ou npm run test:sim)
const SRC = new URL('../../src/', import.meta.url).href;
const { EQUIPMENT, EQUIPMENT_SLOT_ORDER, EQUIPMENT_STAT_DEFS, statsAtLevel, equipmentIds, ITEM_LEVEL_MIN } = await import(SRC + 'data/equipment.ts');
const { LOOT_TABLES, rollLoot } = await import(SRC + 'data/loot.ts');
const { exportItem, importItem, cleanItem } = await import(SRC + 'itemEditor/itemEditorConfig.ts');
const { Rng } = await import(SRC + 'core/rng.ts');
let failures = 0;
const check = (label: string, ok: boolean, extra: unknown = '') => { if (!ok) failures++; console.log(`${ok ? 'OK   ' : 'ECHEC'} ${label}${extra !== '' ? ' — ' + JSON.stringify(extra).slice(0, 900) : ''}`); };
const defs: any[] = Object.values(EQUIPMENT);

// ---- 1. Taille et structure.
{
  const perSlot: Record<string, number> = {};
  for (const d of defs) perSlot[d.slot] = (perSlot[d.slot] ?? 0) + 1;
  check(`banque : ${EQUIPMENT_SLOT_ORDER.length} emplacements x 2 = ${EQUIPMENT_SLOT_ORDER.length * 2} items, exactement 2 par emplacement`, defs.length === EQUIPMENT_SLOT_ORDER.length * 2 && EQUIPMENT_SLOT_ORDER.every((s: string) => perSlot[s] === 2), perSlot);
  check('ids uniques, stables (cle = id), en minuscules_soulignes', defs.every((d) => /^[a-z0-9_]+$/.test(d.id)) && Object.entries(EQUIPMENT).every(([k, d]: any) => k === d.id) && new Set(defs.map((d) => d.id)).size === defs.length, defs.map((d) => d.id));
  check('chaque item : nom, emplacement, archetype, type, rarete, stats, progression, effets, valeur de vente', defs.every((d) => d.name && d.slot && d.archetype && d.type && d.rarity && d.stats && d.scaling && d.effects && typeof d.sellValue === 'number'));
  const arche = new Set(defs.map((d) => d.archetype));
  check('les trois orientations sont presentes : tank, physique, magique', arche.has('tank') && arche.has('physical') && arche.has('magic') && arche.size === 3, [...arche]);
  check('coherence des orientations : un item physique porte des degats physiques, un magique des degats magiques ou du mana, un tank des PV max', defs.every((d) => (d.archetype === 'physical' ? (d.stats.physicalDamage ?? 0) > 0 : d.archetype === 'magic' ? (d.stats.magicDamage ?? 0) > 0 || (d.stats.maxMana ?? 0) > 0 : (d.stats.maxHp ?? 0) > 0)), defs.map((d) => [d.id, d.archetype]));
  check('aucun item ne melange degats physiques ET magiques', defs.every((d) => !((d.stats.physicalDamage ?? 0) > 0 && (d.stats.magicDamage ?? 0) > 0)));
}

// ---- 2. Determinisme des stats : aucun hasard, progression par niveau.
{
  const a = statsAtLevel(EQUIPMENT.starter_sword, 8), b = statsAtLevel(EQUIPMENT.starter_sword, 8);
  check('meme item + meme niveau -> memes stats (Epee du debutant, niveau 8 : 3 + 0,5 x 7 = 6,5 degats physiques)', JSON.stringify(a) === JSON.stringify(b) && a.physicalDamage === 6.5, { a, b });
  const l1 = statsAtLevel(EQUIPMENT.plate_cuirass, 1), l5 = statsAtLevel(EQUIPMENT.plate_cuirass, 5), l0 = statsAtLevel(EQUIPMENT.plate_cuirass, 0);
  check(`progression : Cuirasse niveau 1 = 10 PV, niveau 5 = 16 PV ; niveau < ${ITEM_LEVEL_MIN} ramene au niveau 1 ; statsAtLevel ne lit que stats + scaling`, l1.maxHp === 10 && l5.maxHp === 16 && JSON.stringify(l0) === JSON.stringify(l1), { l1, l5 });
  // 100 appels, 100 fois le meme resultat (aucune source de hasard).
  const same = Array.from({ length: 100 }, () => JSON.stringify(statsAtLevel(EQUIPMENT.arcane_mantle, 12))).every((s, _, arr) => s === arr[0]);
  check('100 evaluations identiques (Mante arcanique, niveau 12)', same);
  check('ordre stable des ids (equipmentIds = cles du catalogue)', JSON.stringify(equipmentIds()) === JSON.stringify(Object.keys(EQUIPMENT)));
}

// ---- 3. Tables de butin : toutes les entrees existent dans la banque, tirage deterministe.
{
  const ids = new Set(Object.keys(EQUIPMENT));
  const all = Object.values(LOOT_TABLES).flatMap((t: any) => t.entries.map((e: any) => e.itemId));
  check('tables de butin : chaque item existe dans la banque (plus de hache du chef pillard)', all.every((id) => ids.has(id)) && !ids.has('raider_axe'), all);
  const roll = (seed: number) => { const rng = new Rng(seed); return Array.from({ length: 20 }, () => rollLoot(LOOT_TABLES.camp_chest_small, () => rng.next())); };
  check('tirage de coffre : meme graine -> memes items ; le choix varie, jamais les stats', JSON.stringify(roll(5)) === JSON.stringify(roll(5)) && JSON.stringify(roll(5)) !== JSON.stringify(roll(6)));
}

// ---- 4. Editeur d'items : aller-retour, progression et archetype conserves, ancien `damage` migre.
{
  const src = EQUIPMENT.runic_ward;
  const back = importItem(exportItem(src));
  check('export / import : item identique (archetype, stats, progression, visuel, effets)', JSON.stringify(cleanItem(src)) === JSON.stringify(back), back);
  const legacy = importItem(JSON.stringify({ old_sword: { id: 'old_sword', name: 'Vieille épée', rarity: 'common', type: 'weapon', slot: 'mainHand', visual: null, stats: { damage: 2.5, maxHp: 1 }, effects: {}, sellValue: 2 } }));
  check('ancien format sans archetype ni progression : `damage` -> physicalDamage, archetype par defaut, progression vide', legacy.stats.physicalDamage === 2.5 && legacy.stats.maxHp === 1 && !('damage' in legacy.stats) && legacy.archetype === 'physical' && JSON.stringify(legacy.scaling) === '{}', legacy);
  check('EQUIPMENT_STAT_DEFS : degats physiques et magiques distincts, plus de cle `damage`', EQUIPMENT_STAT_DEFS.some((d: any) => d.key === 'physicalDamage') && EQUIPMENT_STAT_DEFS.some((d: any) => d.key === 'magicDamage') && !EQUIPMENT_STAT_DEFS.some((d: any) => d.key === 'damage'));
}

console.log(failures ? failures + ' ECHEC(S)' : 'tout OK');
