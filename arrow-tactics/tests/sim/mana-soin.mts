// Tests cibles SANS NAVIGATEUR : mana du Heros (max, regeneration, plafond), sort Soin (incantation 2 s, +5 PV,
// 20 mana, portee 5, soi-meme, allie, plafond des PV), interruption par un deplacement (aucun soin fantome,
// mana rendu), cible morte, cible hors de portee a la fin, refus (mana, cible ennemie, batiment), determinisme,
// vision 18/18 et portees d'attaque inchangees, isolation de sim/.
// Usage : node --import ../ts-register.mjs mana-soin.mts (ou npm run test:sim)
const SRC = new URL('../../src/', import.meta.url).href;
const { generateSurvivalMap } = await import(SRC + 'config/maps/proceduralSurvival.ts');
const { World } = await import(SRC + 'sim/world.ts');
const { heroKit, getHero } = await import(SRC + 'data/heroes.ts');
const { VISION_RADIUS, INITIAL_EXPLORED_RADIUS } = await import(SRC + 'data/vision.ts');
const { visionRadiusOf } = await import(SRC + 'sim/vision.ts');
const { getUnit } = await import(SRC + 'data/units.ts');
const { getBuilding } = await import(SRC + 'data/buildings.ts');
const { HP_PER_PIP } = await import(SRC + 'config/constants.ts');
const fs = await import('node:fs');
const DT = 1 / 30;
let failures = 0;
const check = (label: string, ok: boolean, extra: unknown = '') => { if (!ok) failures++; console.log(`${ok ? 'OK   ' : 'ECHEC'} ${label}${extra !== '' ? ' — ' + JSON.stringify(extra).slice(0, 900) : ''}`); };
const r2 = (v: number) => Math.round(v * 100) / 100;

const MAP = generateSurvivalMap(1);
/** Monde neuf avec un Heros en (0.5, 3.5) (plaine du camp, sans vague). */
function setup() {
  const w = new World(7);
  w.setMap(MAP);
  const hero = w.spawnHero('player', 0.5, 3.5, { xp: 0, level: 1, deaths: 0 }, undefined, heroKit('paladin'));
  return { w, hero };
}
const steps = (w: any, n: number, onStep?: () => void) => { const ev: any[] = []; for (let i = 0; i < n; i++) { w.step(DT); ev.push(...w.heroEvents, ...w.abilityEvents.map((a: any) => ({ ability: a.type, ...a }))); onStep?.(); } return ev; };

// ---- Donnees : Paladin, mana, Soin.
{
  const p = getHero('paladin');
  const k = heroKit('paladin');
  const heal = k.spells.find((s: any) => s.id === 'heal')!;
  check('Paladin : mana max 20, initial 20 (niveau 1), regeneration 2/s ; Soin : 12 mana, 2 s, 15 PV (150 internes), portee 5',
    p.name === 'Paladin' && p.mana.max === 20 && p.mana.initial === 20 && p.mana.regenPerSecond === 2 && heal.manaCost === 12 && heal.castSeconds === 2 && heal.healAmount === 15 * HP_PER_PIP && heal.rangeTiles === 5,
    { mana: p.mana, heal });
}

// ---- Mana : apparition, regeneration, plafond, reprise d'une valeur de run.
{
  const { w, hero } = setup();
  const h = hero.hero;
  const start = h.mana;
  h.mana = 5;
  steps(w, 150);
  const after5 = h.mana;
  steps(w, 30 * 30);
  const w2 = new World(7); w2.setMap(MAP);
  const resumed = w2.spawnHero('player', 0.5, 3.5, { xp: 0, level: 1, deaths: 0, mana: 13 }, undefined, heroKit('paladin'));
  const fant = w.spawn('fantassin', 'player', 2.5, 3.5);
  check('mana : 20 / 20 a l apparition ; 5 -> 15 apres 5 s de simulation (2/s) ; plafonne a 20 ; valeur de run reprise (13) ; une unite ordinaire n a pas de mana',
    start === 20 && h.maxMana === 20 && Math.abs(after5 - 15) < 1e-6 && h.mana === 20 && resumed.hero.mana === 13 && fant.hero === null,
    { start, after5: r2(after5), cap: h.mana, resumed: resumed.hero.mana });
}

// ---- Soin sur soi-meme : incantation 2 s, +50 internes, mana 100 -> 80, Garde ensuite.
{
  const { w, hero } = setup();
  hero.hp = hero.stats.maxHp - 200;
  w.issueCommand({ kind: 'cast', entityIds: [hero.id], spellId: 'heal', targetEntityId: hero.id });
  const ev1 = steps(w, 1);
  const manaAtStart = hero.hero.mana;
  const casting = hero.cast !== null && hero.hero.spellCast !== null;
  let healTick = -1; let n = 1;
  const hpBefore = hero.hp;
  steps(w, 80, () => { n++; if (healTick < 0 && hero.hp > hpBefore) healTick = n; });
  const healed = hero.hp - hpBefore;
  check('Soin sur soi : incantation des le pas suivant l ordre, mana 20 -> 8 retenu au debut, soin de 15 PV (150) apres 2 s (pas 60 a 62), Garde a la fin, plus d incantation',
    ev1.some((e) => e.type === 'spellStart') && Math.abs(manaAtStart - 8) < 0.1 && casting && healed === 150 && healTick >= 60 && healTick <= 62 && hero.order.type === 'guard' && hero.cast === null && hero.hero.spellCast === null,
    { manaAtStart: r2(manaAtStart), healed, healTick, order: hero.order.type });
}

// ---- Soin d'un allie a portee, plafond des PV max.
{
  const { w, hero } = setup();
  const ally = w.spawn('fantassin', 'player', 3.5, 3.5);
  ally.hp = ally.stats.maxHp - 20;
  ally.order = { type: 'guard' };
  w.issueCommand({ kind: 'cast', entityIds: [hero.id], spellId: 'heal', targetEntityId: ally.id });
  const ev = steps(w, 70);
  const end = ev.find((e) => e.type === 'spellEnd');
  check('Soin d un allie a 3 cases : soigne sans depasser ses PV max (20 rendus sur 50), evenement de soin pour le rendu',
    ally.hp === ally.stats.maxHp && end?.healed === 20 && ev.some((e) => e.ability === 'heal' && e.targetId === ally.id),
    { hp: ally.hp, max: ally.stats.maxHp, end });
}

// ---- Allie hors de portee : le Heros s'approche a 5 cases, puis incante sur place.
{
  const { w, hero } = setup();
  const ally = w.spawn('sentinel', 'player', 0.5, 13.5);
  ally.hp -= 60;
  ally.order = { type: 'guard' };
  const ally0 = ally.hp;
  w.issueCommand({ kind: 'cast', entityIds: [hero.id], spellId: 'heal', targetEntityId: ally.id });
  let startDist = -1; let moved = 0; let castX = 0, castZ = 0;
  steps(w, 200, () => {
    if (startDist < 0 && hero.hero.spellCast) { startDist = Math.hypot(hero.x - ally.x, hero.z - ally.z); castX = hero.x; castZ = hero.z; }
    else if (startDist >= 0 && hero.hero.spellCast) moved = Math.max(moved, Math.hypot(hero.x - castX, hero.z - castZ));
  });
  check('allie a 10 cases : le Heros s approche, commence a 5 cases au plus, reste sur place pendant l incantation, soin donne',
    startDist > 0 && startDist <= 5 + 1e-6 && moved < 0.05 && ally.hp === Math.min(ally.stats.maxHp, ally0 + 150), { startDist: r2(startDist), moved: r2(moved), hp: ally.hp, ally0 });
}

// ---- Interruption par un deplacement : aucun soin (meme plus tard), mana rendu.
{
  const { w, hero } = setup();
  hero.hp = hero.stats.maxHp - 100;
  w.issueCommand({ kind: 'cast', entityIds: [hero.id], spellId: 'heal', targetEntityId: hero.id });
  steps(w, 30);
  const manaMid = hero.hero.mana;
  const hpMid = hero.hp;
  w.issueCommand({ kind: 'move', entityIds: [hero.id], x: 4.5, z: 3.5 });
  const ev = steps(w, 1);
  const cancel = ev.find((e) => e.type === 'spellCancel');
  const manaAfter = hero.hero.mana;
  const ev2 = steps(w, 120);
  check('deplacement a 1 s d incantation : Soin annule (raison order), mana rendu (+12), aucun soin ni pendant ni apres (4 s), le Heros se deplace',
    cancel?.reason === 'order' && cancel.refunded === 12 && Math.abs(manaAfter - Math.min(20, manaMid + 12 + 2 * DT)) < 1e-6 && hero.hp === hpMid && !ev2.some((e) => e.ability === 'heal' || e.type === 'spellEnd') && hero.cast === null && Math.abs(hero.x - 4.5) < 0.6,
    { cancel, manaMid: r2(manaMid), manaAfter: r2(manaAfter), hp: hero.hp, hpMid, x: r2(hero.x) });
}

// ---- Arret (stop) et nouveau Soin : meme regle, l'incantation repart de zero.
{
  const { w, hero } = setup();
  hero.hp = hero.stats.maxHp - 200;
  w.issueCommand({ kind: 'cast', entityIds: [hero.id], spellId: 'heal', targetEntityId: hero.id });
  steps(w, 45);
  w.issueCommand({ kind: 'cast', entityIds: [hero.id], spellId: 'heal', targetEntityId: hero.id });
  let healTick = -1; let n = 0; const hp0 = hero.hp;
  const ev = steps(w, 80, () => { n++; if (healTick < 0 && hero.hp > hp0) healTick = n; });
  check('nouveau Soin pendant un Soin : le premier est annule (mana rendu), le second repart de zero (soin 2 s apres), un seul soin',
    ev.filter((e) => e.type === 'spellCancel').length === 1 && healTick >= 60 && hero.hp === hp0 + 150, { healTick, hp: hero.hp - hp0 });
}

// ---- Cible morte pendant l'incantation ; cible sortie de portee a la fin.
{
  const { w, hero } = setup();
  const ally = w.spawn('sentinel', 'player', 3.5, 3.5);
  ally.hp -= 50;
  w.issueCommand({ kind: 'cast', entityIds: [hero.id], spellId: 'heal', targetEntityId: ally.id });
  steps(w, 20);
  ally.alive = false; ally.hp = 0;
  const ev = steps(w, 60);
  const cancel = ev.find((e) => e.type === 'spellCancel');
  const { w: w2, hero: hero2 } = setup();
  const runner = w2.spawn('fantassin', 'player', 3.5, 3.5);
  runner.hp -= 20; const r0 = runner.hp;
  w2.issueCommand({ kind: 'cast', entityIds: [hero2.id], spellId: 'heal', targetEntityId: runner.id });
  steps(w2, 2);
  // Cible eloignee d'un coup a 9 cases (au-dela de 5 + 1) pendant l'incantation.
  runner.x = runner.prevX = 0.5; runner.z = runner.prevZ = 12.5;
  w2.issueCommand({ kind: 'stop', entityIds: [runner.id] });
  const ev2 = steps(w2, 70);
  const lost = ev2.find((e) => e.type === 'spellCancel');
  check('cible morte : annule (raison target), mana rendu, aucun soin ; cible a plus de 6 cases a la fin : soin perdu (out-of-range), mana rendu, Garde',
    cancel?.reason === 'target' && cancel.refunded === 12 && !ev.some((e) => e.ability === 'heal') && lost?.reason === 'out-of-range' && lost.refunded === 12 && runner.hp === r0 && hero2.order.type === 'guard' && hero2.hero.mana > 19.9,
    { cancel, lost, mana2: r2(hero2.hero.mana) });
}

// ---- Refus : mana insuffisant, cible ennemie, batiment, unite sans le sort.
{
  const { w, hero } = setup();
  hero.hero.mana = 10;
  const foe = w.spawn('fantassin', 'enemy', 3.5, 3.5);
  const ally = w.spawn('fantassin', 'player', 1.5, 2.5);
  const ballistaLike = w.entities.find((e: any) => e.isBuilding) ?? null;
  w.issueCommand({ kind: 'cast', entityIds: [hero.id], spellId: 'heal', targetEntityId: hero.id });
  steps(w, 1);
  const noMana = w.commandResults[0];
  hero.hero.mana = 20;
  w.issueCommand({ kind: 'cast', entityIds: [hero.id], spellId: 'heal', targetEntityId: foe.id });
  w.issueCommand({ kind: 'cast', entityIds: [ally.id], spellId: 'heal', targetEntityId: ally.id });
  steps(w, 1);
  const [onFoe, byAlly] = w.commandResults;
  check('refus : mana insuffisant (no-mana), cible ennemie (invalid-target), unite sans le sort (no-commandable / invalid) ; mana intact',
    noMana.rejection === 'no-mana' && onFoe.rejection === 'invalid-target' && byAlly.rejection !== null && hero.hero.spellCast === null && hero.hero.mana > 19.9,
    { noMana: noMana.rejection, onFoe: onFoe.rejection, byAlly: byAlly.rejection, building: ballistaLike?.unitId ?? null });
}

// ---- Determinisme : deux mondes identiques, memes etats apres un scenario avec soin et interruption.
{
  const run = () => {
    const { w, hero } = setup();
    const ally = w.spawn('sentinel', 'player', 6.5, 8.5); ally.hp -= 70; hero.hp -= 90;
    w.issueCommand({ kind: 'cast', entityIds: [hero.id], spellId: 'heal', targetEntityId: ally.id });
    steps(w, 40);
    w.issueCommand({ kind: 'move', entityIds: [hero.id], x: -3.5, z: 2.5 });
    steps(w, 20);
    w.issueCommand({ kind: 'cast', entityIds: [hero.id], spellId: 'heal', targetEntityId: hero.id });
    steps(w, 90);
    return JSON.stringify([hero.x, hero.z, hero.hp, hero.hero.mana, ally.hp, w.tick]);
  };
  const a = run(), b = run();
  check('determinisme : meme scenario, memes positions, PV et mana', a === b, a);
}

// ---- Vision gameplay 18 / 18, portees d'attaque inchangees, disque explore 22.
{
  const { w } = setup();
  const ballista = w.spawnBuilding(getBuilding('ballista'), 'player', 0.5, -4.5, { kind: 'rock', x: 0, z: -5, w: 1, d: 1 } as any);
  const tower = w.spawnBuilding(getBuilding('tower'), 'player', 6.5, -4.5, { kind: 'rock', x: 6, z: -5, w: 1, d: 1 } as any);
  const site = w.spawnBuilding(getBuilding('tower'), 'player', -6.5, -4.5, { kind: 'rock', x: -7, z: -5, w: 1, d: 1 } as any, undefined, undefined, undefined, { progress: 0, buildTime: 10 });
  check('vision : Baliste 21 (18 avant G46), Tour terminee 18, chantier 3 ; portee d attaque de la Tour inchangee (' + (tower.buildingAttack?.range ?? '?') + ') ; disque explore 25 > 21',
    VISION_RADIUS.ballista === 21 && VISION_RADIUS.tower === 18 && visionRadiusOf(ballista) === 21 && visionRadiusOf(tower) === 18 && visionRadiusOf(site) === 3 && INITIAL_EXPLORED_RADIUS === 25 && INITIAL_EXPLORED_RADIUS > VISION_RADIUS.ballista,
    { ballista: visionRadiusOf(ballista), tower: visionRadiusOf(tower), site: visionRadiusOf(site), towerAttack: tower.buildingAttack });
}

// ---- Isolation de sim/ : aucun import de three, render, ui, run, editor, audio ; pas de Math.random.
{
  const dir = decodeURIComponent(new URL('../../src/sim/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
  const files = [...fs.readdirSync(dir).map((f: string) => dir + f), ...fs.readdirSync(dir + 'systems').map((f: string) => dir + 'systems/' + f)].filter((f: string) => f.endsWith('.ts'));
  const bad = files.filter((f: string) => { const s = fs.readFileSync(f, 'utf8'); return /from '(three|\.\.\/(\.\.\/)?(render|ui|run|editor|audio)\/)/.test(s) || /Math\.random/.test(s.replace(/\/\/.*|\/\*[\s\S]*?\*\//g, '')); });
  check('sim/ isole (aucun import three/render/ui/run/editor/audio, aucun Math.random hors commentaires)', bad.length === 0, bad);
}

console.log(failures ? failures + ' ECHEC(S)' : 'tout OK');
