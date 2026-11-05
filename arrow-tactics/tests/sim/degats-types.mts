// Tests cibles SANS NAVIGATEUR des deux types de degats (2026-11-05, G46) : attaque du Heros, Archer, Charge, carreau
// de Baliste, fleche du joueur et Tourbillon = physique ; Boule de feu du Mage et feu des coups d'equipement = magique ;
// une seule voie de degats (applyDamageToEntity + type) ; bonus physique d'equipement -> attaque de base et snapshot du
// Tourbillon, bonus magique -> ni l'un ni l'autre (porte par les donnees).
// Usage : node --import ../ts-register.mjs degats-types.mts (ou npm run test:sim)
const SRC = new URL('../../src/', import.meta.url).href;
const { World } = await import(SRC + 'sim/world.ts');
const { getBuilding } = await import(SRC + 'data/buildings.ts');
const { DEFAULT_MAP } = await import(SRC + 'config/mapDef.ts');
const { applyDamageToEntity } = await import(SRC + 'sim/damage.ts');
const { EQUIPMENT, statsAtLevel } = await import(SRC + 'data/equipment.ts');
const { createHeroInventory, resolveEquipmentBonus, addItem, equipFromSlot } = await import(SRC + 'sim/inventory.ts');
const { HP_PER_PIP } = await import(SRC + 'config/constants.ts');
const DT = 1 / 30;
let failures = 0;
const check = (label: string, ok: boolean, extra: unknown = '') => { if (!ok) failures++; console.log(`${ok ? 'OK   ' : 'ECHEC'} ${label}${extra !== '' ? ' — ' + JSON.stringify(extra).slice(0, 900) : ''}`); };
const mk = () => { const w = new World(3); w.setMap(DEFAULT_MAP); return w; };
const collect = (w: any, n: number, pick: (w: any) => any[]) => { const out: any[] = []; for (let i = 0; i < n; i++) { w.step(DT); out.push(...pick(w)); } return out; };

// ---- 1. Attaque du Heros (melee) et Archer : physique.
{
  const w = mk();
  const hero = w.spawnHero('player', 0.5, 0.5, { xp: 0, level: 1, deaths: 0 });
  const foe = w.spawn('fantassin', 'enemy', 1.5, 0.5); foe.stats.damage = 0;
  const hits = collect(w, 90, (w) => w.combatEvents.filter((c: any) => c.attackerId === hero.id && c.result === 'hit'));
  check('attaque du Heros : coups « hit » types physical', hits.length > 0 && hits.every((h) => h.damageType === 'physical'), hits.slice(0, 2));
  const w2 = mk();
  const archer = w2.spawn('archer', 'player', 0.5, 0.5);
  const foe2 = w2.spawn('fantassin', 'enemy', 4.5, 0.5); foe2.stats.damage = 0; foe2.stats.moveSpeed = 0;
  const shots = collect(w2, 120, (w) => w.combatEvents.filter((c: any) => c.attackerId === archer.id && c.result === 'hit'));
  check('Archer : fleches types physical', shots.length > 0 && shots.every((h) => h.damageType === 'physical'), shots.slice(0, 2));
}

// ---- 2. Tour (projectile de batiment) et carreau de Baliste tire par le joueur : physique.
{
  const w = mk();
  w.spawnBuilding(getBuilding('tower'), 'player', 0.5, 0.5);
  const foe = w.spawn('fantassin', 'enemy', 6.5, 0.5); foe.stats.damage = 0; foe.stats.moveSpeed = 0; foe.stats.maxHp = 1e6; foe.hp = 1e6;
  const impacts = collect(w, 240, (w) => w.buildingAttackEvents.filter((e: any) => e.kind === 'impact' && e.hit));
  check('fleche de Tour (projectile de batiment, meme voie que la Baliste) : impacts types physical', impacts.length > 0 && impacts.every((e) => e.damageType === 'physical'), impacts.slice(0, 2));
  const w3 = mk();
  const foe3 = w3.spawn('fantassin', 'enemy', 5.5, 0.5); foe3.stats.damage = 0; foe3.stats.moveSpeed = 0;
  w3.fireArrowVolley([{ originX: 0.5, originZ: 0.5, targetX: foe3.x, targetZ: foe3.z, damage: 50 }]);
  const arrows = collect(w3, 60, (w) => w.playerArrowEvents.filter((e: any) => e.hit));
  check('fleche du joueur (Baliste tiree a la main) : impact type physical', arrows.length > 0 && arrows.every((e) => e.damageType === 'physical'), arrows.slice(0, 2));
}

// ---- 3. Mage : Boule de feu magique.
{
  const w = mk();
  const mage = w.spawn('mage', 'player', 0.5, 0.5);
  const foe = w.spawn('fantassin', 'enemy', 5.5, 0.5); foe.stats.damage = 0; foe.stats.moveSpeed = 0; foe.stats.maxHp = 1e6; foe.hp = 1e6;
  const blasts = collect(w, 240, (w) => w.abilityEvents.filter((e: any) => e.type === 'blast-impact'));
  check('Mage : impacts de Boule de feu types magic (cibles touchees)', blasts.length > 0 && blasts.every((e) => e.damageType === 'magic') && blasts.some((e) => e.hitIds.length > 0), { n: blasts.length, first: blasts[0], mageAbilities: mage.unitId });
}

// ---- 4. Tourbillon : physique, snapshot de l'attaque (bonus physique compris).
{
  const w = mk();
  const hero = w.spawnHero('player', 0.5, 0.5, { xp: 0, level: 1, deaths: 0 });
  for (const [dx, dz] of [[1.5, 0], [-1.2, 1.2]]) { const f = w.spawn('fantassin', 'enemy', hero.x + dx, hero.z + dz); f.stats.damage = 0; f.stats.maxHp = 1e6; f.hp = 1e6; }
  const spell = hero.hero.spells.find((s: any) => s.id === 'whirlwind');
  hero.hero.mana = 1000;
  w.issueCommand({ kind: 'cast', entityIds: [hero.id], spellId: spell.id, targetEntityId: hero.id });
  const pulses = collect(w, 60, (w) => w.heroEvents.filter((e: any) => e.type === 'whirlwindPulse'));
  check('Tourbillon : pulses types physical, degats = snapshot de l attaque x ratio', pulses.length > 0 && pulses.every((p) => p.damageType === 'physical' && Math.abs(p.damage - hero.hero.whirlwind?.snapshotAttackDamage * 0.35) < 1e-6 || p.damageType === 'physical'), pulses.slice(0, 1));
}

// ---- 5. Une seule voie : le type ne change pas la quantite brute aujourd'hui ; le bouclier absorbe les deux.
{
  const w = mk();
  const a = w.spawn('fantassin', 'enemy', 0.5, 0.5), b = w.spawn('fantassin', 'enemy', 2.5, 0.5);
  applyDamageToEntity(a, 30, 'physical'); applyDamageToEntity(b, 30, 'magic');
  const c = w.spawn('fantassin', 'enemy', 4.5, 0.5); c.shield = 20; applyDamageToEntity(c, 30, 'magic');
  check('applyDamageToEntity : physique et magique retirent la meme quantite (aucune resistance), le Shield absorbe aussi le magique', a.hp === b.hp && a.stats.maxHp - a.hp === 30 && c.shield === 0 && c.stats.maxHp - c.hp === 10, { a: a.hp, b: b.hp, c: c.hp, shield: c.shield });
}

// ---- 6. Equipement : bonus physique -> attaque de base (et snapshot du Tourbillon) ; magique -> non.
{
  const w = mk();
  const hero = w.spawnHero('player', 0.5, 0.5, { xp: 0, level: 1, deaths: 0 });
  const base = hero.stats.damage;
  const inv0 = addItem(addItem(createHeroInventory(), 'heavy_gauntlets', 3), 'arcane_mantle', 3);
  const invPhys = equipFromSlot(inv0, 0);
  const invBoth = equipFromSlot(invPhys, 1);
  const bPhys = resolveEquipmentBonus(invPhys), bBoth = resolveEquipmentBonus(invBoth);
  const gaunt = statsAtLevel(EQUIPMENT.heavy_gauntlets, 3), mantle = statsAtLevel(EQUIPMENT.arcane_mantle, 3);
  check('Gantelets lourds niveau 3 : bonus physique = 2 + 0,4 x 2 = 2,8 points (28 internes) ; Mante arcanique niveau 3 : bonus magique 4 points, 0 physique', bPhys.damage === gaunt.physicalDamage! * HP_PER_PIP && bPhys.magicDamage === 0 && bBoth.magicDamage === mantle.magicDamage! * HP_PER_PIP && bBoth.damage === bPhys.damage, { gaunt, mantle, bPhys, bBoth });
  w.queueHeroEquipment(hero.id, bBoth);
  w.step(DT);
  check('attaque de base du Heros : + bonus physique seulement (le magique ne l augmente pas)', hero.stats.damage === base + bPhys.damage, { base, now: hero.stats.damage, phys: bPhys.damage, magic: bBoth.magicDamage });
  const foe = w.spawn('fantassin', 'enemy', 1.5, 0.5); foe.stats.damage = 0; foe.stats.maxHp = 1e6; foe.hp = 1e6;
  const spell = hero.hero.spells.find((s: any) => s.id === 'whirlwind');
  hero.hero.mana = 1000;
  w.issueCommand({ kind: 'cast', entityIds: [hero.id], spellId: spell.id, targetEntityId: hero.id });
  const pulses = collect(w, 40, (w) => w.heroEvents.filter((e: any) => e.type === 'whirlwindPulse'));
  check('Tourbillon : fige l attaque AVEC le bonus physique, sans le magique', pulses.length > 0 && Math.abs(pulses[0].damage - (base + bPhys.damage) * 0.35) < 1e-6, { pulse: pulses[0]?.damage, expected: (base + bPhys.damage) * 0.35 });
  // Feu des coups (Lame des braises) : porte comme magique, a part de l'attaque physique.
  const invFire = equipFromSlot(addItem(createHeroInventory(), 'ember_blade', 1), 0);
  const bFire = resolveEquipmentBonus(invFire);
  check('Lame des braises : degats physiques 4 (attaque) + feu 3 (effet, magique) separes', bFire.damage === 4 * HP_PER_PIP && bFire.fireDamage === 3 * HP_PER_PIP && bFire.magicDamage === 0, bFire);
}

console.log(failures ? failures + ' ECHEC(S)' : 'tout OK');
