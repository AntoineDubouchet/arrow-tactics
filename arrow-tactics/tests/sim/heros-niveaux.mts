// Tests cibles SANS NAVIGATEUR de la progression du Heros jusqu'au niveau 100 : courbe d'XP (seuils 2 et 3 inchanges,
// +50 par niveau jusqu'a 10, +100 ensuite), bonus par niveau (PV, degats ; vitesse figee apres 3), montee jusqu'a 100,
// niveau d'entite. Usage : node --import ./ts-register.mjs heros-niveaux.mts
const SRC = new URL('../../src/', import.meta.url).href;
const { HERO_LEVELS, HERO_MAX_LEVEL, heroLevelForXp, heroStatsForLevel, heroXpToNextLevel, HERO_UNIT_ID } = await import(SRC + 'data/hero.ts');
const { getUnit } = await import(SRC + 'data/units.ts');
const { World } = await import(SRC + 'sim/world.ts');
const { DEFAULT_MAP } = await import(SRC + 'config/mapDef.ts');
const { gainHeroXp } = await import(SRC + 'sim/systems/hero.ts');
let failures = 0;
const check = (label: string, ok: boolean, extra: unknown = '') => { if (!ok) failures++; console.log(`${ok ? 'OK   ' : 'ECHEC'} ${label}${extra !== '' ? ' — ' + JSON.stringify(extra).slice(0, 700) : ''}`); };

const xpAt = (l: number) => HERO_LEVELS[l - 1].xp;
check('niveau maximum 100 : 100 paliers consecutifs', HERO_MAX_LEVEL === 100 && HERO_LEVELS.length === 100 && HERO_LEVELS.every((l: any, i: number) => l.level === i + 1));
check('seuils : niveau 2 a 50 XP et 3 a 150 (inchanges), 10 a 2 250, 20 a 12 250, 50 a 102 250, 100 a 452 250', xpAt(2) === 50 && xpAt(3) === 150 && xpAt(10) === 2250 && xpAt(20) === 12250 && xpAt(50) === 102250 && xpAt(100) === 452250, [2, 3, 10, 20, 50, 100].map(xpAt));
const steps = Array.from({ length: 99 }, (_, i) => heroXpToNextLevel(i + 1));
const growth = steps.slice(1).map((s, i) => s - steps[i]!);
check('chaque niveau un peu plus long : +50 XP par niveau jusqu au 10, puis +100 par niveau', growth.slice(0, 8).every((g) => g === 50) && growth.slice(8).every((g) => g === 100), { debut: steps.slice(0, 12), fin: steps.slice(-2) });
const base = getUnit(HERO_UNIT_ID).stats;
// Tranches (valeurs internes x10) : 2-10 +75 / +6 ; 11-25 +40 / +3 ; 26-50 +20 / +1,5 ; 51-100 +10 / +0,8.
const expect: Record<number, [number, number]> = { 2: [75, 6], 3: [150, 12], 10: [675, 54], 11: [715, 57], 25: [1275, 99], 26: [1295, 100.5], 50: [1775, 136.5], 51: [1785, 137.3], 100: [2275, 176.5] };
const got: Record<number, [number, number, number]> = {};
for (const l of Object.keys(expect).map(Number)) { const s = heroStatsForLevel(l); got[l] = [s.maxHp - base.maxHp, +(s.damage - base.damage).toFixed(3), +(s.moveSpeed - base.moveSpeed).toFixed(3)]; }
check('bonus par tranche : niveaux 2-10 +7,5 PV / +0,6 ; 11-25 +4 / +0,3 ; 26-50 +2 / +0,15 ; 51-100 +1 / +0,08 (cumuls aux niveaux 10, 11, 25, 26, 50, 51, 100) ; vitesse figee a +0,48 apres le niveau 3',
  Object.entries(expect).every(([l, [hp, d]]) => got[+l]![0] === hp && Math.abs(got[+l]![1] - d) < 1e-6) && Object.keys(expect).map(Number).filter((l) => l >= 3).every((l) => got[l]![2] === 0.48), got);
const s10 = heroStatsForLevel(10), s100 = heroStatsForLevel(100);
check('heroLevelForXp : 452 249 XP -> 99, 452 250 -> 100, au-dela reste 100', heroLevelForXp(452249).level === 99 && heroLevelForXp(452250).level === 100 && heroLevelForXp(9e9).level === 100);
// Montee reelle dans la simulation.
const w = new World(2);
w.setMap(DEFAULT_MAP);
const h = w.spawnHero('player', 0.5, 0.5, { xp: 0, level: 1, deaths: 0 });
const events: any[] = [];
gainHeroXp(h, 2250, events);
const at10 = { level: h.level, hero: h.hero.level, maxHp: h.stats.maxHp, hp: h.hp, ups: events.filter((e) => e.type === 'levelUp').length };
gainHeroXp(h, 2_000_000, events);
const at100 = { level: h.level, hero: h.hero.level, maxHp: h.stats.maxHp, hp: h.hp, ups: events.filter((e) => e.type === 'levelUp').length };
check('simulation : 2 250 XP -> niveau 10 (9 montees, PV pleins augmentes) ; 2 000 000 XP de plus -> niveau 100 (99 montees au total), niveau d entite 100, rien au-dela',
  at10.level === 10 && at10.hero === 10 && at10.ups === 9 && at10.maxHp === s10.maxHp && at100.level === 100 && at100.hero === 100 && at100.ups === 99 && at100.maxHp === s100.maxHp, { at10, at100 });


// ---- Portee de gain d'XP (2026-11-05, G46) : HERO_XP_RANGE = 12 (6 avant) ; kill a 6 -> XP, vers 11,5 -> XP,
// clairement au-dela (14) -> rien. Quantite, courbe et regles inchangees.
{
  const { HERO_XP_RANGE, heroXpForKill } = await import(SRC + 'data/hero.ts');
  const killAt = (d: number) => {
    const w2 = new World(5); w2.setMap({ name: 'xp', version: 1, width: 60, height: 60, obstacles: [], playerUnits: [], enemyUnits: [] });
    const hero = w2.spawnHero('player', 0.5, 0.5, { xp: 0, level: 1, deaths: 0 });
    const foe = w2.spawn('fantassin', 'enemy', 0.5 + d, 0.5); foe.stats.damage = 0;
    foe.hp = 0; w2.step(1 / 30); w2.step(1 / 30);
    return hero.hero.xp;
  };
  const xp6 = killAt(6), xp11 = killAt(11.5), xp14 = killAt(14), one = heroXpForKill('fantassin');
  check(`portee d XP ${HERO_XP_RANGE} : kill a 6 cases -> +${one} XP ; a 11,5 -> +${one} XP ; a 14 -> rien`, HERO_XP_RANGE === 12 && xp6 === one && xp11 === one && xp14 === 0 && one > 0, { xp6, xp11, xp14 });
}
console.log(failures ? failures + ' ECHEC(S)' : 'tout OK');
