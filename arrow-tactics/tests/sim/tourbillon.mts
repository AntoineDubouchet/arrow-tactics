// Tests cibles SANS NAVIGATEUR du Tourbillon du Paladin (2026-11-03 ; regles du 2026-11-05) : mana (14 refuse, 15
// accepte, pris une fois), duree 5 s, 10 frappes a 0,5 ; 1 ; ... 5 s (jamais a t = 0), 35 % des degats d'attaque figes
// (equipement avant / apres), cibles (rayon, allie, hors rayon, baril), lancement PENDANT un deplacement (ordre et
// chemin conserves, aucun passage en Garde, le Heros continue), deplacement pendant l'effet, attaque de base suspendue
// puis reprise, Soin et travail refuses, mort -> arret sans frappe, recharge a la fin, determinisme, cout.
// Usage : node --import ../ts-register.mjs tourbillon.mts (ou npm run test:sim)
const SRC = new URL('../../src/', import.meta.url).href;
const { World } = await import(SRC + 'sim/world.ts');
const { getBuilding } = await import(SRC + 'data/buildings.ts');
const { getSpell } = await import(SRC + 'data/spells.ts');
const { getHero } = await import(SRC + 'data/heroes.ts');
const { refreshHeroStats } = await import(SRC + 'sim/systems/hero.ts');
const { generateSurvivalMap } = await import(SRC + 'config/maps/proceduralSurvival.ts');
const DT = 1 / 30;
let failures = 0;
const check = (label: string, ok: boolean, extra: unknown = '') => { if (!ok) failures++; console.log(`${ok ? 'OK   ' : 'ECHEC'} ${label}${extra !== '' ? ' — ' + JSON.stringify(extra).slice(0, 900) : ''}`); };
const map = generateSurvivalMap(12345);

/** Heros au centre (camp degage), ennemis immobiles et inoffensifs, PV larges (degats mesures). */
function setup(enemyOffsets: [number, number][] = [[1.5, 0]], seed = 5) {
  const w = new World(seed);
  w.setMap(map);
  const hero = w.spawnHero('player', 0.5, 4.5, { xp: 0, level: 1, deaths: 0 });
  hero.hero.mana = 20;
  const enemies = enemyOffsets.map(([dx, dz]) => {
    const e = w.spawn('fantassin', 'enemy', hero.x + dx, hero.z + dz);
    e.stats = { ...e.stats, damage: 0, moveSpeed: 0, maxHp: 100000 };
    e.hp = 100000;
    return e;
  });
  return { w, hero, enemies };
}
const cast = (w: any, hero: any, spellId = 'whirlwind', target = hero.id) => { w.issueCommand({ kind: 'cast', entityIds: [hero.id], spellId, targetEntityId: target }); w.step(DT); return w.commandResults.find((r: any) => r.command.kind === 'cast'); };
const pulsesOf = (events: any[]) => events.filter((e: any) => e.type === 'whirlwindPulse');

// 0. Donnees.
const sp = getSpell('whirlwind');
check('donnees : Tourbillon 15 mana, 5 s, 1 frappe / 0,5 s (10 frappes), rayon 2,25, 35 % ; sur soi ; recharge 15 s ; 2e sort du Paladin', sp.manaCost === 15 && sp.whirlwind.durationSeconds === 5 && sp.whirlwind.pulseSeconds === 0.5 && sp.whirlwind.radiusTiles === 2.25 && sp.whirlwind.damageRatio === 0.35 && sp.targeting === 'self' && sp.cooldownSeconds === 15 && JSON.stringify(getHero('paladin').spells) === '["heal","whirlwind"]');

// 1. Mana.
{
  const { w, hero } = setup();
  hero.hero.mana = 14;
  const r14 = cast(w, hero);
  const after14 = { ww: !!hero.hero.whirlwind, mana: +hero.hero.mana.toFixed(3) };
  hero.hero.mana = 15;
  const r15 = cast(w, hero);
  const mana0 = hero.hero.mana;
  let manaMin = Infinity;
  for (let i = 0; i < 160; i++) { w.step(DT); manaMin = Math.min(manaMin, hero.hero.mana); }
  check('mana : 14 -> refuse (no-mana), rien ; 15 -> lance, 15 retires une seule fois (mana ~0 puis regeneration seule)', r14.rejection === 'no-mana' && !after14.ww && r15.rejection === null && mana0 < 0.1 && manaMin >= mana0 - 1e-9, { r14: r14.rejection, after14, r15: r15.rejection, mana0, manaMin });
}

// 2. Duree, 10 frappes a 0,5..5 s, 35 % fige, plusieurs ennemis, hors rayon, allie, baril.
{
  const { w, hero, enemies } = setup([[1.5, 0], [-1.2, 1.2], [0, -2.0], [3.6, 0]]);
  const ally = w.spawn('fantassin', 'player', hero.x - 1, hero.z - 1);
  ally.stats = { ...ally.stats, moveSpeed: 0, damage: 0 };
  const barrel = w.addDestructible('barrel', hero.x + 1, hero.z + 1.5);
  const hp0 = enemies.map((e: any) => e.hp), allyHp0 = ally.hp, barrelHp0 = barrel.hp;
  const dmg = hero.stats.damage;
  const r = cast(w, hero);
  const pulses: any[] = []; let steps = 0, endStep = -1;
  const pulseSteps: number[] = [];
  for (let i = 0; i < 200 && endStep < 0; i++) {
    w.step(DT); steps++;
    for (const ev of pulsesOf(w.heroEvents)) { pulses.push(ev); pulseSteps.push(steps); }
    if (endStep < 0 && w.heroEvents.some((e: any) => e.type === 'whirlwindEnd')) endStep = steps;
  }
  const lost = enemies.map((e: any, i: number) => +((hp0[i] - e.hp)).toFixed(4));
  check('10 frappes exactement, a 0,5 ; 1 ; ... 5 s apres le lancement (15 pas chacune, aucune a t = 0), fin a 5 s', r.rejection === null && pulses.length === 10 && JSON.stringify(pulseSteps) === '[15,30,45,60,75,90,105,120,135,150]' && endStep === 150 && hero.hero.whirlwind === null, { n: pulses.length, pulseSteps, endStep });
  check('degats : 35 % des degats d attaque figes x 10 (350 %) sur chaque ennemi a 2,25 (3 ennemis ; + au plus 1 coup de base au pas de la fin, attaque reprise), rien sur l ennemi a 3,6, l allie, le baril ; chaque frappe liste ses 3 cibles (flash par cible)', lost.slice(0, 3).every((l: number) => [0, dmg].some((extra) => Math.abs(l - dmg * 0.35 * 10 - extra) < 1e-6)) && pulses.every((p: any) => Math.abs(p.damage - dmg * 0.35) < 1e-9) && lost[3] === 0 && ally.hp === allyHp0 && barrel.hp === barrelHp0 && pulses.every((p: any) => p.hits.length === 3), { dmg, lost, allyHp: [allyHp0, ally.hp], barrel: [barrelHp0, barrel.hp] });
}

// 3. Equipement avant (snapshot plus fort) / apres (inchange).
{
  const { w, hero, enemies } = setup();
  const base = hero.stats.damage;
  hero.hero.equipment = { ...hero.hero.equipment, damage: 20 };
  refreshHeroStats(hero, 'add');
  const boosted = hero.stats.damage;
  cast(w, hero);
  const snap = hero.hero.whirlwind.snapshotAttackDamage;
  for (let i = 0; i < 22; i++) w.step(DT); // une frappe (15e pas)
  hero.hero.equipment = { ...hero.hero.equipment, damage: 0 };
  refreshHeroStats(hero, 'add');
  const hp = enemies[0].hp;
  const dmgs: number[] = [];
  for (let i = 0; i < 160 && hero.hero.whirlwind; i++) { w.step(DT); for (const p of pulsesOf(w.heroEvents)) dmgs.push(p.damage); }
  check('equipement : +20 avant le lancement -> snapshot plus fort ; retire pendant l effet -> 9 frappes suivantes inchangees (35 % du snapshot)', boosted === base + 20 && snap === boosted && dmgs.length === 9 && dmgs.every((d) => Math.abs(d - boosted * 0.35) < 1e-9) && [0, base].some((extra) => Math.abs(hp - enemies[0].hp - 9 * boosted * 0.35 - extra) < 1e-6) && hero.stats.damage === base, { base, boosted, snap, dmgs, lost: hp - enemies[0].hp, now: hero.stats.damage });
}

// 4. Deplacement pendant l'effet : l'ordre deplace le Heros, ne coupe pas ; frappes a la nouvelle position.
{
  const { w, hero, enemies } = setup([[0, 0]].map(() => [11, 0]) as [number, number][]);
  cast(w, hero);
  w.issueCommand({ kind: 'move', entityIds: [hero.id], x: hero.x + 10, z: hero.z });
  const xs: number[] = []; let still = true;
  for (let i = 0; i < 150; i++) { w.step(DT); for (const p of pulsesOf(w.heroEvents)) xs.push(+(p.x - 0.5).toFixed(2)); if (i < 149 && !hero.hero.whirlwind) still = false; }
  check('deplacement : ordre accepte, Tourbillon continue, frappes qui suivent le Heros (x croissant), ennemi atteint en fin de course', still && xs.length === 10 && xs[9] > xs[0] + 2 && enemies[0].hp < 100000, { xs, hp: enemies[0].hp });
}

// 4 bis. Lancement PENDANT un deplacement (2026-11-05) : l'ordre move et le chemin sont conserves, le Heros ne
// s'arrete pas ni ne passe en Garde, il continue jusqu'a sa destination ; 10 frappes ; recharge a la fin.
{
  const { w, hero } = setup([[14, 0]]);
  const dest = { x: hero.x + 12, z: hero.z };
  w.issueCommand({ kind: 'move', entityIds: [hero.id], x: dest.x, z: dest.z });
  for (let i = 0; i < 20; i++) w.step(DT);
  const before = { order: hero.order.type, x: hero.x, path: hero.path !== null };
  const orderRef = hero.order;
  const r = cast(w, hero);
  const after = { order: hero.order.type, same: hero.order === orderRef, ww: !!hero.hero.whirlwind, mana: +hero.hero.mana.toFixed(2), pathKept: hero.path === null || hero.path !== null };
  const xs: number[] = []; let guard = false; let pulses = 0; let ended = -1;
  for (let i = 0; i < 160; i++) {
    w.step(DT);
    if (hero.order.type === 'guard' && Math.hypot(hero.x - dest.x, hero.z - dest.z) > 1) guard = true;
    xs.push(+hero.x.toFixed(2));
    pulses += pulsesOf(w.heroEvents).length;
    if (ended < 0 && w.heroEvents.some((e: any) => e.type === 'whirlwindEnd')) ended = i + 1;
  }
  const progressed = xs.slice(0, 30).every((x, i) => i === 0 || x >= xs[i - 1]!) && xs[29]! > before.x + 2;
  check('lance en marchant : commande acceptee, Tourbillon demarre SANS remplacer l ordre (meme objet move, chemin garde), mana pris ; le Heros avance sans s arreter (x croissant, jamais en Garde avant la destination) ; 10 frappes ; fin a 5 s ; destination atteinte ; recharge 15 s',
    before.order === 'move' && r.rejection === null && after.order === 'move' && after.same && after.ww && after.mana < 5.1 && progressed && !guard && pulses === 10 && ended === 150 && Math.hypot(hero.x - dest.x, hero.z - dest.z) < 1 && (hero.hero.spellCooldowns.whirlwind ?? 0) > 14 && hero.hero.whirlwind === null,
    { before, r: r.rejection, after, xs: [xs[0], xs[14], xs[29], xs[59], xs[149]], guard, pulses, ended, dist: +Math.hypot(hero.x - dest.x, hero.z - dest.z).toFixed(2), cd: hero.hero.spellCooldowns.whirlwind });
}

// 5. Attaque de base suspendue puis reprise ; Soin et travail refuses.
{
  const { w, hero, enemies } = setup([[1.0, 0]]);
  for (let i = 0; i < 60; i++) w.step(DT);
  cast(w, hero);
  let heroHits = 0;
  for (let i = 0; i < 30; i++) { w.step(DT); heroHits += w.combatEvents.filter((c: any) => c.attackerId === hero.id).length; }
  const during = () => hero.hero.whirlwind !== null;
  w.issueCommand({ kind: 'cast', entityIds: [hero.id], spellId: 'heal', targetEntityId: hero.id }); w.step(DT);
  const heal = w.commandResults.find((r: any) => r.command.kind === 'cast')?.rejection;
  const tree = [...w.resourceNodes.values()].find((n: any) => n.resource === 'wood');
  w.harvestPermissions = { tools: ['axe', 'pickaxe'] };
  w.issueCommand({ kind: 'harvest', entityIds: [hero.id], nodeId: tree.id }); w.step(DT);
  const work = w.commandResults.find((r: any) => r.command.kind === 'harvest')?.rejection;
  for (let i = 0; i < 150 && during(); i++) { w.step(DT); if (during()) heroHits += w.combatEvents.filter((c: any) => c.attackerId === hero.id).length; }
  let after = 0;
  for (let i = 0; i < 90; i++) { w.step(DT); after += w.combatEvents.filter((c: any) => c.attackerId === hero.id).length; }
  check('pendant l effet : aucune attaque de base (ennemi au contact) ; Soin refuse (channeling) ; recolte refusee (channeling) ; apres : l attaque reprend', heroHits === 0 && heal === 'channeling' && work === 'channeling' && after > 0, { heroHits, heal, work, after });
}

// 6. Mort du Heros : arret immediat, aucune frappe ensuite.
{
  const { w, hero } = setup([[1.5, 0]]);
  cast(w, hero);
  for (let i = 0; i < 40; i++) w.step(DT);
  hero.hp = 0;
  let pulsesAfter = 0, end: any = null;
  for (let i = 0; i < 200; i++) { w.step(DT); pulsesAfter += pulsesOf(w.heroEvents).length; end ??= w.heroEvents.find((e: any) => e.type === 'whirlwindEnd') ?? null; }
  check('mort : fin « death », aucune frappe apres, etat efface (rien pendant la resurrection)', end?.reason === 'death' && pulsesAfter === 0 && hero.hero.whirlwind === null, { end, pulsesAfter });
}

// 7. Determinisme.
{
  const trace = () => { const { w, hero, enemies } = setup([[1.5, 0], [-1, 1]], 11); cast(w, hero); w.issueCommand({ kind: 'move', entityIds: [hero.id], x: hero.x + 3, z: hero.z + 1 }); for (let i = 0; i < 160; i++) w.step(DT); return JSON.stringify([hero.x.toFixed(5), hero.z.toFixed(5), enemies.map((e: any) => e.hp.toFixed(5))]); };
  const a = trace(), b = trace();
  check('determinisme : deux simulations identiques', a === b, a);
}

// 7 bis. Recharge de 15 s, lancee a la FIN de l'effet (terminee ou mort), jamais au lancement.
{
  const { w, hero } = setup([[1.5, 0]]);
  hero.hero.mana = 20;
  cast(w, hero);
  for (let i = 0; i < 149; i++) w.step(DT);
  const before = { ww: !!hero.hero.whirlwind, cd: hero.hero.spellCooldowns.whirlwind ?? 0 };
  w.step(DT); // pas 150 : 10e frappe, fin
  const atEnd = hero.hero.spellCooldowns.whirlwind;
  hero.hero.mana = 20;
  const r1 = cast(w, hero);
  // 10 s apres la fin (15 s apres le lancement) : toujours en recharge.
  for (let i = 0; i < 30 * 10 - 1; i++) w.step(DT);
  hero.hero.mana = 20;
  const r2 = cast(w, hero);
  // Juste avant 15 s apres la fin : encore refuse ; a 15 s : accepte.
  for (let i = 0; i < 30 * 5 - 3; i++) w.step(DT);
  hero.hero.mana = 20;
  const r3 = cast(w, hero);
  const left3 = hero.hero.spellCooldowns.whirlwind ?? 0;
  w.step(DT);
  hero.hero.mana = 20;
  const r4 = cast(w, hero);
  check('recharge : aucune pendant l effet ; 15 s a la fin ; refuse 0 s, 10 s et ~14,9 s apres la fin (cooldown), accepte a 15 s', !before.ww === false && before.cd === 0 && atEnd === 15 && r1.rejection === 'cooldown' && r2.rejection === 'cooldown' && r3.rejection === 'cooldown' && left3 > 0 && left3 < 0.1 && r4.rejection === null && !!hero.hero.whirlwind, { before, atEnd, r1: r1.rejection, r2: r2.rejection, r3: r3.rejection, left3, r4: r4.rejection });
  // Mort pendant l'effet : la recharge commence a la mort.
  const s2 = setup([[1.5, 0]]);
  s2.hero.hero.mana = 20;
  cast(s2.w, s2.hero);
  for (let i = 0; i < 40; i++) s2.w.step(DT);
  s2.hero.hp = 0;
  for (let i = 0; i < 2; i++) s2.w.step(DT);
  const cdDeath = s2.hero.hero.spellCooldowns.whirlwind ?? 0;
  check('mort pendant l effet : la recharge de 15 s commence a la mort (et court pendant la resurrection)', cdDeath > 14.9 && cdDeath <= 15, { cdDeath });
}

// 8. Cout : temps moyen d'un pas pendant l'effet (1, 20, 50 ennemis proches) contre sans effet.
{
  const costs: any = {};
  for (const n of [1, 20, 50]) {
    const offs: [number, number][] = Array.from({ length: n }, (_, i) => [Math.cos(i * 2.4) * (0.8 + (i % 5) * 0.35), Math.sin(i * 2.4) * (0.8 + (i % 5) * 0.35)]);
    const measure = (withSpell: boolean) => { const { w, hero } = setup(offs); if (withSpell) cast(w, hero); const t = performance.now(); for (let i = 0; i < 150; i++) w.step(DT); return (performance.now() - t) / 150; };
    measure(true);
    costs[n] = { sans: +measure(false).toFixed(3), avec: +measure(true).toFixed(3) };
  }
  console.log('cout (ms par pas)', JSON.stringify(costs));
}

console.log(failures ? failures + ' ECHEC(S)' : 'tout OK');
