// Tests cibles SANS NAVIGATEUR des effets d'arme (2026-11-05, G47) : « toutes les N attaques reussies, K declenchements » ;
// N = 3, K = 2, givre 4 : rien aux hits 1 et 2, exactement deux evenements au 3e, magique / givre, montant 4 + bonus magique,
// jamais le bonus physique ; les six ecoles au niveau donnees et voie de degats ; compteurs : rate et esquive n'avancent
// pas, Tourbillon n'avance pas, un declenchement ne se redeclenche pas, retire = remis a zero ; magicDamage n'augmente ni
// l'attaque ni le Tourbillon ; ancien feu migre (N = 1, K = 1) ; import / export de l'Editeur d'items ; determinisme.
// Usage : node --import ../ts-register.mjs effets-arme.mts (ou npm run test:sim)
const SRC = new URL('../../src/', import.meta.url).href;
const { World } = await import(SRC + 'sim/world.ts');
const { DEFAULT_MAP } = await import(SRC + 'config/mapDef.ts');
const { EQUIPMENT, ITEM_EFFECTS, ITEM_EFFECT_ORDER, describeTriggeredEffect } = await import(SRC + 'data/equipment.ts');
const { DAMAGE_SCHOOL_ORDER, DAMAGE_SCHOOLS } = await import(SRC + 'data/damageTypes.ts');
const { resolveEquipmentBonus, createHeroInventory, addItem, equipFromSlot } = await import(SRC + 'sim/inventory.ts');
const { cleanItem, exportItem, importItem, defaultItem } = await import(SRC + 'itemEditor/itemEditorConfig.ts');
const { HP_PER_PIP } = await import(SRC + 'config/constants.ts');
const DT = 1 / 30;
let failures = 0;
const check = (label: string, ok: boolean, extra: unknown = '') => { if (!ok) failures++; console.log(`${ok ? 'OK   ' : 'ECHEC'} ${label}${extra !== '' ? ' — ' + JSON.stringify(extra).slice(0, 900) : ''}`); };

/** Ajoute un item de test a la banque (ce processus seulement). */
const testItem = (id: string, effects: any[], stats: any = {}, slot = 'mainHand') => { (EQUIPMENT as any)[id] = { ...EQUIPMENT.starter_sword, id, name: id, slot, visual: null, stats, scaling: {}, effects }; return id; };
/** Heros au contact d'une cible immobile tres solide ; items equipes par la vraie voie (acquire). */
function arena(itemIds: string[]) {
  const w = new World(3); w.setMap(DEFAULT_MAP);
  const hero = w.spawnHero('player', 0.5, 0.5, { xp: 0, level: 1, deaths: 0 });
  hero.stats.missChance = 0;
  for (const id of itemIds) w.queueInventoryAction(hero.id, { type: 'acquire', itemId: id, level: 1 });
  w.step(DT);
  const foe = w.spawn('fantassin', 'enemy', hero.x + 1.1, hero.z);
  foe.stats.damage = 0; foe.stats.maxHp = 1e7; foe.hp = 1e7; foe.stats.moveSpeed = 0; foe.stats.dodgeChance = 0;
  return { w, hero, foe };
}
/** Avance jusqu'au n-ieme coup du Heros qui touche ; renvoie les evenements de ce Heros, par pas de coup. */
function hits(w: any, hero: any, n: number) {
  const out: { hit: any; procs: any[] }[] = [];
  for (let i = 0; i < 30 * 60 && out.length < n; i++) {
    w.step(DT);
    const mine = w.combatEvents.filter((c: any) => c.attackerId === hero.id);
    const hit = mine.find((c: any) => c.result === 'hit');
    if (hit) out.push({ hit, procs: mine.filter((c: any) => c.result === 'proc') });
  }
  return out;
}

// ---- 1. N = 3, K = 2, givre 4.
{
  const id = testItem('t_frost', [{ every: 3, repeat: 2, effect: 'frostDamage', amount: 4 }]);
  const { w, hero, foe } = arena([id]);
  const seq = hits(w, hero, 6);
  const procs = seq.map((s) => s.procs.length);
  const third = seq[2]!.procs;
  check('every 3, repeat 2 : aucun declenchement aux hits 1 et 2, exactement deux au 3e, puis le cycle repart (hits 4, 5 : rien ; 6 : deux)', procs.join() === '0,0,2,0,0,2', procs);
  check('declenchement : magique, ecole givre, montant 4 points (40 internes), un evenement par declenchement, le coup physique reste physique sans ecole', third.length === 2 && third.every((p: any) => p.damageType === 'magic' && p.damageSchool === 'frost' && p.damage === 4 * HP_PER_PIP) && seq[2]!.hit.damageType === 'physical' && !('damageSchool' in seq[2]!.hit), third);
  // PV : 6 coups physiques + 4 declenchements de 40.
  const physical = hero.stats.damage * 6;
  check('PV de la cible : coups physiques + declenchements, par la voie commune', Math.abs((foe.stats.maxHp - foe.hp) - (physical + 4 * 40)) < 1e-6, { perte: foe.stats.maxHp - foe.hp, attendu: physical + 160 });
}

// ---- 2. Bonus magique applique a chaque declenchement ; bonus physique jamais.
{
  const weapon = testItem('t_frost_b', [{ every: 1, repeat: 2, effect: 'frostDamage', amount: 4 }]);
  const magic = testItem('t_magic', [], { magicDamage: 3 }, 'cape');
  const phys = testItem('t_phys', [], { physicalDamage: 5 }, 'arms');
  const { w, hero } = arena([weapon, magic, phys]);
  const [s] = hits(w, hero, 1);
  check('degats = 4 + bonus magique 3 = 7 points pour CHAQUE declenchement, le bonus physique +5 n y entre pas', s!.procs.length === 2 && s!.procs.every((p: any) => p.damage === 7 * HP_PER_PIP), s!.procs);
  const { w: w2, hero: h2, foe: f2 } = arena([magic]);
  const base = h2.stats.damage;
  const [s2] = hits(w2, h2, 1);
  check('bonus magique seul : l attaque physique du Heros ne change pas (aucun declenchement sans effet)', base === 25 && s2!.procs.length === 0 && f2.stats.maxHp - f2.hp === base, { base, perte: f2.stats.maxHp - f2.hp });
}

// ---- 3. Les six ecoles : donnees et pipeline.
{
  check('six ecoles : feu, givre, arcane, nature, sacre, ombre ; un effet par ecole au selecteur', DAMAGE_SCHOOL_ORDER.join() === 'fire,frost,arcane,nature,holy,shadow' && ITEM_EFFECT_ORDER.length === 6 && new Set(ITEM_EFFECT_ORDER.map((e: string) => ITEM_EFFECTS[e].school)).size === 6 && DAMAGE_SCHOOL_ORDER.every((s: string) => !!DAMAGE_SCHOOLS[s].label));
  const rows: any[] = [];
  for (const effect of ITEM_EFFECT_ORDER) {
    const id = testItem(`t_${effect}`, [{ every: 1, repeat: 1, effect, amount: 2 }]);
    const { w, hero } = arena([id]);
    const [s] = hits(w, hero, 1);
    rows.push({ effect, type: s!.procs[0]?.damageType, school: s!.procs[0]?.damageSchool, damage: s!.procs[0]?.damage });
  }
  check('chaque effet produit un evenement magique de son ecole, 2 points', rows.every((r) => r.type === 'magic' && r.school === ITEM_EFFECTS[r.effect].school && r.damage === 20), rows);
}

// ---- 4. Ce qui ne compte pas comme une attaque : rate, esquive, Tourbillon ; pas de recursion.
{
  const id = testItem('t_every2', [{ every: 2, repeat: 1, effect: 'fireDamage', amount: 1 }]);
  const { w, hero, foe } = arena([id]);
  hero.stats.missChance = 1;
  for (let i = 0; i < 30 * 6; i++) w.step(DT);
  const missed = hero.onHit[0].count;
  hero.stats.missChance = 0; foe.stats.dodgeChance = 1;
  for (let i = 0; i < 30 * 6; i++) w.step(DT);
  const dodged = hero.onHit[0].count;
  foe.stats.dodgeChance = 0;
  check('rates et esquives : le compteur n avance pas', missed === 0 && dodged === 0, { missed, dodged });
  const seq = hits(w, hero, 1);
  check('premiere attaque qui touche : compteur a 1, aucun declenchement ; le declenchement ne fait pas avancer le compteur (pas de recursion)', hero.onHit[0].count === 1 && seq[0]!.procs.length === 0);
  const seq2 = hits(w, hero, 1);
  check('deuxieme : un declenchement, compteur remis a 0 (pas 1 : le declenchement ne compte pas comme une attaque)', seq2[0]!.procs.length === 1 && hero.onHit[0].count === 0, hero.onHit[0]);
}
{
  // Tourbillon : physique, bonus physique oui, magique non, compteur intact.
  const id = testItem('t_ww', [{ every: 3, repeat: 1, effect: 'arcaneDamage', amount: 1 }], { physicalDamage: 2, magicDamage: 9 });
  const { w, hero } = arena([id]);
  // Pas d'attaque de base pendant le Tourbillon (blocage existant) : on lit le compteur apres plusieurs frappes.
  hits(w, hero, 1);
  const before = hero.onHit[0].count;
  const spell = hero.hero.spells.find((s: any) => s.id === 'whirlwind');
  hero.hero.mana = 1000;
  w.issueCommand({ kind: 'cast', entityIds: [hero.id], spellId: spell.id, targetEntityId: hero.id });
  const pulses: any[] = []; const procsDuring: any[] = [];
  for (let i = 0; i < 30 * 5 && hero.onHit; i++) {
    w.step(DT);
    if (hero.hero.whirlwind) {
      pulses.push(...w.heroEvents.filter((e: any) => e.type === 'whirlwindPulse'));
      procsDuring.push(...w.combatEvents.filter((c: any) => c.attackerId === hero.id && c.result === 'proc'));
    }
  }
  const expected = (25 + 20) * 0.35;
  check('Tourbillon : physique, fige le bonus physique (+2) et jamais le magique (+9), aucun declenchement, compteur d effet intact', pulses.length >= 8 && pulses.every((p) => p.damageType === 'physical' && Math.abs(p.damage - expected) < 1e-6) && procsDuring.length === 0 && hero.onHit[0].count >= before, { n: pulses.length, damage: pulses[0]?.damage, expected, procsDuring: procsDuring.length, before, after: hero.onHit[0].count });
}

// ---- 5. Compteur : appartient a l'effet porte ; retire = remis a zero ; autre piece, niveau : conserve.
{
  const id = testItem('t_counter', [{ every: 5, repeat: 1, effect: 'holyDamage', amount: 1 }]);
  const { w, hero } = arena([id]);
  hits(w, hero, 3);
  const three = hero.onHit[0].count;
  w.queueInventoryAction(hero.id, { type: 'acquire', itemId: 'iron_helm', level: 1 });
  w.step(DT);
  const afterOther = hero.onHit[0].count;
  const events: any[] = [];
  (await import(SRC + 'sim/systems/hero.ts')).gainHeroXp(hero, 100, events);
  const afterLevel = hero.onHit[0].count;
  check('autre piece equipee, montee de niveau : le compteur de l effet ne bouge pas', three === 3 && afterOther === 3 && afterLevel === 3, { three, afterOther, afterLevel });
  w.queueInventoryAction(hero.id, { type: 'unequip', slot: 'mainHand' });
  w.step(DT);
  const off = hero.onHit;
  w.queueInventoryAction(hero.id, { type: 'equip', from: 0 });
  w.step(DT);
  check('arme retiree : plus d effet ; remise : compteur reparti de 0 (aucun compteur fantome pour un item du sac)', off === null && hero.onHit[0].count === 0, { off, count: hero.onHit?.[0]?.count });
}

// ---- 6. Migration et Item Editor : aller-retour strict.
{
  const blade = EQUIPMENT.ember_blade;
  check('banque : Lame des braises migree en N = 1, K = 1, feu 3 ; bonus resolu sans ancien champ', JSON.stringify(blade.effects) === JSON.stringify([{ every: 1, repeat: 1, effect: 'fireDamage', amount: 3 }]) && !('onHit' in blade.effects) && !('fireDamage' in resolveEquipmentBonus(equipFromSlot(addItem(createHeroInventory(), 'ember_blade', 1), 0))));
  const made = { ...defaultItem(), id: 'test_nature', name: 'Test nature', effects: [{ every: 4, repeat: 3, effect: 'natureDamage', amount: 5 }] };
  const back = importItem(exportItem(made));
  check('editeur : Toutes les 4 attaques, 3 fois, nature, 5 degats : export puis import identiques', JSON.stringify(back.effects) === JSON.stringify([{ every: 4, repeat: 3, effect: 'natureDamage', amount: 5 }]), back.effects);
  const legacy = importItem(JSON.stringify({ vieille: { id: 'vieille', name: 'Vieille lame', rarity: 'common', type: 'weapon', slot: 'mainHand', visual: null, stats: { damage: 2 }, effects: { onHit: { fireDamage: 3 } }, sellValue: 1 } }));
  const exported = exportItem(legacy);
  check('ancien item « feu a chaque coup » : import converti (1, 1, feu, 3) ; export sans ancien champ', JSON.stringify(legacy.effects) === JSON.stringify([{ every: 1, repeat: 1, effect: 'fireDamage', amount: 3 }]) && !exported.includes('onHit') && !exported.includes('fireDamage":') && exported.includes('"effect": "fireDamage"'), exported.slice(0, 200));
  const cleaned = cleanItem({ ...defaultItem(), effects: [{ every: 0, repeat: -2, effect: 'fireDamage', amount: 2 }, { every: 2.7, repeat: 1.9, effect: 'shadowDamage', amount: 0 }] });
  check('nettoyage : N et K >= 1 entiers, effet a 0 degat non exporte', JSON.stringify(cleaned.effects) === JSON.stringify([{ every: 1, repeat: 1, effect: 'fireDamage', amount: 2 }]), cleaned.effects);
  check('plusieurs effets et effet inconnu : tableau conserve, inconnu ignore', importItem(JSON.stringify({ name: 'x', effects: [{ every: 2, repeat: 1, effect: 'holyDamage', amount: 1 }, { every: 1, repeat: 1, effect: 'inconnu', amount: 1 }, { every: 3, repeat: 2, effect: 'shadowDamage', amount: 4 }] })).effects.length === 2);
  check('portabilite conservee a l aller-retour', JSON.stringify(importItem(exportItem({ ...defaultItem(), allowedHeroes: ['paladin'] })).allowedHeroes) === '["paladin"]' && !('allowedHeroes' in importItem(exportItem(defaultItem()))));
  check('description : « A chaque attaque : 3 degats de feu » ; « Toutes les 4 attaques : 3 × 5 degats de nature »', describeTriggeredEffect(blade.effects[0]) === 'À chaque attaque : 3 dégâts de feu' && describeTriggeredEffect({ every: 4, repeat: 3, effect: 'natureDamage', amount: 5 }) === 'Toutes les 4 attaques : 3 × 5 dégâts de nature', describeTriggeredEffect(blade.effects[0]));
}

// ---- 7. Determinisme.
{
  const id = testItem('t_det', [{ every: 2, repeat: 2, effect: 'shadowDamage', amount: 3 }]);
  const trace = () => { const { w, hero, foe } = arena([id]); hits(w, hero, 7); return JSON.stringify([w.tick, foe.hp, hero.onHit]); };
  check('determinisme : deux simulations identiques', trace() === trace());
}

console.log(failures ? failures + ' ECHEC(S)' : 'tout OK');
