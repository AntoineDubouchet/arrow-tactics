// Tests cibles SANS NAVIGATEUR de la vitesse x1,4 (2026-11-04) : stats d'entite = base x 1,4 (Heros niveau 1 et
// niveau 3, equipement compris), vitesse MESUREE sur 20 cases / vitesse de base ~ 1,40 (Heros, Villageois, Homme
// d'armes, Archer, Cavalier, Maraudeur, Homme d'armes de vague), arrivee sans depassement ni oscillation, attaque /
// recharge / recolte inchangees, aucun mur traverse, 60 unites (cout du pas).
// Usage : node --import ../ts-register.mjs vitesse.mts (ou npm run test:sim)
const SRC = new URL('../../src/', import.meta.url).href;
const { World } = await import(SRC + 'sim/world.ts');
const { getUnit, UNIT_MOVE_SPEED_MULTIPLIER } = await import(SRC + 'data/units.ts');
const { heroStatsForLevel, HERO_HARVEST_FACTOR } = await import(SRC + 'data/hero.ts');
const { HARVEST_NODE_KINDS } = await import(SRC + 'data/resources.ts');
const { createBlankMap } = await import(SRC + 'config/maps/blankMap.ts');
const { refreshHeroStats } = await import(SRC + 'sim/systems/hero.ts');
const DT = 1 / 30;
let failures = 0;
const check = (label: string, ok: boolean, extra: unknown = '') => { if (!ok) failures++; console.log(`${ok ? 'OK   ' : 'ECHEC'} ${label}${extra !== '' ? ' — ' + JSON.stringify(extra).slice(0, 900) : ''}`); };
const map = { ...createBlankMap(), survivalRules: undefined };

check('multiplicateur central = 1,4', UNIT_MOVE_SPEED_MULTIPLIER === 1.4);

// 1. Mesure : 20 cases en ligne droite, plaine vide ; vitesse moyenne (depart arrete) et arrivee.
const cases: [string, string][] = [['hero', 'player'], ['villageois', 'player'], ['fantassin', 'player'], ['archer', 'player'], ['cavalier', 'player'], ['maraudeur', 'enemy'], ['fantassin', 'enemy']];
const rows: any[] = [];
for (const [unitId, team] of cases) {
  const w = new World(1);
  w.setMap(map as any);
  const u = unitId === 'hero' ? w.spawnHero('player', -10.5, 0.5, { xp: 0, level: 1, deaths: 0 }) : w.spawn(unitId, team as any, -10.5, 0.5);
  const base = unitId === 'hero' ? heroStatsForLevel(1).moveSpeed : getUnit(unitId).stats.moveSpeed;
  // Ennemis : ordre direct (issueCommand ne commande que le camp du joueur).
  if (team === 'player') w.issueCommand({ kind: 'move', entityIds: [u.id], x: 9.5, z: 0.5 }); else u.order = { type: 'move', x: 9.5, z: 0.5 };
  let t = 0; let arrivedAt = -1; let minD = Infinity; const after: number[] = [];
  for (let i = 0; i < 30 * 12; i++) {
    w.step(DT); t += DT;
    const d = Math.hypot(u.x - 9.5, u.z - 0.5);
    minD = Math.min(minD, d);
    if (arrivedAt < 0 && u.order.type !== 'move') arrivedAt = t;
    if (arrivedAt >= 0) after.push(+u.x.toFixed(4));
  }
  // Distance REELLEMENT parcourue (l unite s arrete a sa tolerance d arrivee, inchangee).
  const measured = Math.hypot(u.x + 10.5, u.z - 0.5) / arrivedAt;
  const ratio = measured / base;
  const overshoot = Math.max(0, u.x - 9.5);
  const settled = after.length > 0 && Math.max(...after) - Math.min(...after) < 1e-6;
  rows.push({ unitId, team, radius: u.stats.radius, base, stat: +(u.stats.moveSpeed).toFixed(3), statRatio: +(u.stats.moveSpeed / base).toFixed(4), measured: +measured.toFixed(3), ratio: +ratio.toFixed(3), overshoot: +overshoot.toFixed(3), finalD: +Math.hypot(u.x - 9.5, u.z - 0.5).toFixed(3), settled });
}
console.log('MESURES', JSON.stringify(rows));
check('stats des entites = base x 1,4 exactement (7 unites, joueur / neutres / vague)', rows.every((r) => Math.abs(r.statRatio - 1.4) < 1e-9), rows.map((r) => [r.unitId, r.statRatio]));
check('vitesse mesuree (distance parcourue / duree) / base dans [1,37 ; 1,41]', rows.every((r) => r.ratio > 1.37 && r.ratio < 1.41), rows.map((r) => [r.unitId, r.ratio]));
check('arrivee : arret a la tolerance existante (distance <= rayon + 0,1, identique a HEAD), aucun depassement, plus aucun mouvement ensuite (pas d oscillation)', rows.every((r) => r.finalD <= r.radius + 0.1 && r.overshoot === 0 && r.settled), rows.map((r) => [r.unitId, r.finalD, r.overshoot, r.settled]));

// 2. Heros : niveau 3 et equipement +0,3 -> (base niveau + bonus) x 1,4 ; rien d'autre ne change.
{
  const w = new World(1);
  w.setMap(map as any);
  const h = w.spawnHero('player', 0.5, 0.5, { xp: 0, level: 3, deaths: 0 });
  const lvl3 = h.stats.moveSpeed;
  h.hero.equipment = { ...h.hero.equipment, moveSpeed: 0.3 };
  refreshHeroStats(h, 'add');
  const def = getUnit('hero').stats;
  check('Heros niveau 3 : base du niveau x 1,4 ; avec +0,3 d equipement : (base + 0,3) x 1,4 ; cadence et degats non multiplies',
    Math.abs(lvl3 - heroStatsForLevel(3).moveSpeed * 1.4) < 1e-9 && Math.abs(h.stats.moveSpeed - (heroStatsForLevel(3).moveSpeed + 0.3) * 1.4) < 1e-9 && h.stats.attackCooldown === heroStatsForLevel(3).attackCooldown && h.stats.damage === heroStatsForLevel(3).damage && def.moveSpeed === 4.16,
    { lvl3, eq: h.stats.moveSpeed, l1: heroStatsForLevel(1).moveSpeed, l3: heroStatsForLevel(3).moveSpeed, l5: heroStatsForLevel(5).moveSpeed });
}
check('pas de croissance de vitesse apres le niveau 3 (donnee inchangee)', heroStatsForLevel(5).moveSpeed === heroStatsForLevel(3).moveSpeed && heroStatsForLevel(10).moveSpeed === heroStatsForLevel(3).moveSpeed);
check('attaque, recharge, recolte : valeurs de base inchangees (seul moveSpeed est multiplie)', (() => { const w = new World(1); w.setMap(map as any); const u = w.spawn('archer', 'player', 0, 0); const d = getUnit('archer').stats; return u.stats.attackCooldown === d.attackCooldown && u.stats.attackRange === d.attackRange && u.stats.damage === d.damage && HARVEST_NODE_KINDS.wood.seconds === 2 && HARVEST_NODE_KINDS.stone.seconds === 2.5 && HARVEST_NODE_KINDS.gold.seconds === 3 && HERO_HARVEST_FACTOR === 1.25; })());

// 3. Mur : une palissade de 12 cases entre l'unite et la destination ; jamais traversee.
{
  const w = new World(1);
  w.setMap(map as any);
  w.spawnWallLine('player', 'palisade', { ax: 0, az: -6, bx: 0, bz: 6 });
  const res: any[] = [];
  for (const [unitId, team] of [['cavalier', 'player'], ['fantassin', 'enemy'], ['villageois', 'player']] as const) {
    const u = w.spawn(unitId, team, -4.5, 0.5);
    if (team === 'player') w.issueCommand({ kind: 'move', entityIds: [u.id], x: 4.5, z: 0.5 }); else u.order = { type: 'move', x: 4.5, z: 0.5 };
    let crossed = false; let prevX = u.x;
    for (let i = 0; i < 30 * 10; i++) { w.step(DT); if ((prevX < 0) !== (u.x < 0) && Math.abs(u.z) < 6) crossed = true; prevX = u.x; }
    res.push({ unitId, crossed, x: +u.x.toFixed(2), z: +u.z.toFixed(2) });
    u.alive = false; u.hp = 0; w.step(DT);
  }
  // L ennemi s arrete pour frapper la palissade du joueur (regle existante) : jamais traversee suffit.
  check('palissade de 12 cases : jamais traversee en son milieu ; Cavalier et Villageois la contournent et arrivent', res.every((r) => !r.crossed) && res.filter((r) => r.unitId !== 'fantassin').every((r) => r.x > 3.5), res);
}

// 4. Cout : 60 unites en mouvement.
{
  const w = new World(1);
  w.setMap(map as any);
  const ids: number[] = [];
  for (let i = 0; i < 60; i++) ids.push(w.spawn(['fantassin', 'archer', 'villageois', 'cavalier'][i % 4]!, 'player', -20.5 + (i % 10) * 1.5, -8.5 + Math.floor(i / 10) * 1.5).id);
  w.issueCommand({ kind: 'move', entityIds: ids, x: 20.5, z: 0.5 });
  const t0 = performance.now();
  for (let i = 0; i < 300; i++) w.step(DT);
  console.log('PERF 60 unites en mouvement :', ((performance.now() - t0) / 300).toFixed(3), 'ms par pas');
}

console.log(failures ? failures + ' ECHEC(S)' : 'tout OK');
