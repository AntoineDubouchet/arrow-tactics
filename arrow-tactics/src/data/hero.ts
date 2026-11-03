import { getUnit } from './units';

/**
 * Heros (2026-11-01, direction « Hero RTS Survival », docs/DESIGN_DECISIONS.md
 * G1 et G4) : progression, resurrection, recolte et construction. Donnees
 * PROVISOIRES, lues par la simulation (sim/systems/hero.ts) et l'interface.
 */
export const HERO_UNIT_ID = 'hero';

/** Paliers de niveau : XP totale requise et bonus CUMULES par rapport a la
 *  fiche de base (data/units.ts). PROVISOIRE. */
export interface HeroLevel {
  level: number;
  xp: number;
  maxHpBonus: number;
  damageBonus: number;
  moveSpeedBonus: number;
}

/** Niveau maximum du Heros (2026-11-02, demande d'Antoine : 3 avant ; une
 *  progression quasi sans fin). PROVISOIRE. */
export const HERO_MAX_LEVEL = 100;

/** XP pour passer du niveau `level` au suivant (2026-11-02, demande
 *  d'Antoine) : jusqu'au niveau 10, 50 XP de plus a chaque niveau (50, 100,
 *  150 ... 450 ; les seuils des niveaux 2 et 3, 50 et 150 XP, sont inchanges) ;
 *  au-dela, 100 XP de plus a chaque niveau (10 -> 11 : 550, 20 -> 21 : 1 550,
 *  50 -> 51 : 4 550). Niveau 10 a 2 250 XP au total, 20 a 12 250, 50 a
 *  102 250, 100 a 452 250. PROVISOIRE. */
export function heroXpToNextLevel(level: number): number {
  return level < 10 ? 50 * level : 450 + 100 * (level - 9);
}

/** Gain de PV max et de degats PAR NIVEAU, par tranche (2026-11-02, demande
 *  d'Antoine), en valeurs internes (x10 : 75 = 7,5 PV) : niveaux 2 a 10,
 *  +7,5 PV et +0,6 degat ; 11 a 25, +4 et +0,3 ; 26 a 50, +2 et +0,15 ;
 *  51 a 100, +1 et +0,08. Seule source de ces gains. PROVISOIRE. */
const HERO_LEVEL_GAINS: readonly { upTo: number; hp: number; damage: number }[] = [
  { upTo: 10, hp: 75, damage: 6 },
  { upTo: 25, hp: 40, damage: 3 },
  { upTo: 50, hp: 20, damage: 1.5 },
  { upTo: 100, hp: 10, damage: 0.8 },
];
/** Vitesse : +0,24 aux niveaux 2 et 3 seulement (bonus augmentes de 60 %
 *  avec la vitesse de base le 2026-11-02), puis plus rien : un Heros plus
 *  rapide a chaque niveau deviendrait incontrolable. PROVISOIRE. */
const HERO_SPEED_PER_LEVEL = 0.24;
const HERO_SPEED_LEVELS = 2;

/** Bonus CUMULES du niveau `level` (niveau 1 : aucun), tranche par tranche. */
export function heroLevelBonus(level: number): { maxHpBonus: number; damageBonus: number; moveSpeedBonus: number } {
  let hp = 0;
  let damage = 0;
  let previous = 1;
  for (const gain of HERO_LEVEL_GAINS) {
    const levels = Math.max(0, Math.min(level, gain.upTo) - previous);
    hp += levels * gain.hp;
    damage += levels * gain.damage;
    previous = gain.upTo;
  }
  const round = (v: number) => Math.round(v * 1000) / 1000;
  return { maxHpBonus: round(hp), damageBonus: round(damage), moveSpeedBonus: HERO_SPEED_PER_LEVEL * Math.min(level - 1, HERO_SPEED_LEVELS) };
}

export const HERO_LEVELS: readonly HeroLevel[] = (() => {
  const levels: HeroLevel[] = [];
  let xp = 0;
  for (let level = 1; level <= HERO_MAX_LEVEL; level++) {
    if (level > 1) xp += heroXpToNextLevel(level - 1);
    levels.push({ level, xp, ...heroLevelBonus(level) });
  }
  return levels;
})();

/** Niveau atteint avec `xp` points. */
export function heroLevelForXp(xp: number): HeroLevel {
  let current = HERO_LEVELS[0]!;
  for (const l of HERO_LEVELS) if (xp >= l.xp) current = l;
  return current;
}

/** Stats du Heros au niveau `level` : fiche de base + bonus cumules. */
export function heroStatsForLevel(level: number): { maxHp: number; damage: number; moveSpeed: number; attackCooldown: number } {
  const base = getUnit(HERO_UNIT_ID).stats;
  const l = HERO_LEVELS.find((h) => h.level === level) ?? HERO_LEVELS[0]!;
  return { maxHp: base.maxHp + l.maxHpBonus, damage: base.damage + l.damageBonus, moveSpeed: base.moveSpeed + l.moveSpeedBonus, attackCooldown: base.attackCooldown };
}

/** Rayon (cases) du partage d'XP : toute unite du camp adverse (Neutre) qui
 *  meurt a cette distance du Heros vivant lui rapporte son XP, qui que soit
 *  son tueur (choix d'Antoine : « zone partagee »). */
export const HERO_XP_SHARE_RADIUS = 6;

/** XP maximale d'une seule mort (2026-11-01, demande d'Antoine) : un
 *  Ravageur (100) ne fait plus sauter toute la premiere progression. */
export const HERO_XP_PER_KILL_MAX = 30;

/** XP rapportee par une unite tuee : 4 par piece d'or de son cout, de 4 a
 *  HERO_XP_PER_KILL_MAX. Homme d'armes 8, Archer 12, Mage 30. PROVISOIRE. */
export function heroXpForKill(unitId: string): number {
  return Math.min(HERO_XP_PER_KILL_MAX, Math.max(4, Math.round(getUnit(unitId).cost * 4)));
}

/** Delais de resurrection (s), par mort sur la run : 15, 30, 60, puis 90 au
 *  plus (choix d'Antoine). Le Heros revient a la Baliste ; si elle est
 *  detruite, il ne revient pas (et la bataille est perdue). */
export const HERO_RESPAWN_DELAYS: readonly number[] = [15, 30, 60, 90];
export function heroRespawnDelay(deaths: number): number {
  return HERO_RESPAWN_DELAYS[Math.min(Math.max(deaths, 1), HERO_RESPAWN_DELAYS.length) - 1]!;
}

/** Ressources recoltables : bois (arbres) et pierre (rochers), voir
 *  config/resourceNodes.ts. */
export type { ResourceKind } from '../config/resourceNodes';

/** Recolte : une unite toutes les HARVEST_INTERVAL s au contact d'un arbre
 *  ou d'un rocher (portee : rayon du Heros + HARVEST_REACH), mise dans le sac
 *  (HERO_CARRY_CAPACITY). Sources inepuisables ; verrouillees tant que la
 *  Scierie / le Camp de mineur n'existent pas (run/harvestPermissions.ts).
 *  PROVISOIRE. */
export const HARVEST_INTERVAL = 1.5;
export const HARVEST_REACH = 0.7;

/** Construction : portee de travail du Heros autour de l'emprise d'un
 *  chantier, et PV d'un chantier a sa pose (fraction des PV max ; le reste
 *  vient avec l'avancement). PROVISOIRE. */
export const BUILD_REACH = 0.8;
export const CONSTRUCTION_START_HP_FRACTION = 0.25;
/** Le Heros enchaine sur le chantier inacheve le plus proche dans ce rayon
 *  (cases) quand il en termine un (une ligne de mur V2 passe d'abord au
 *  segment suivant de la meme ligne, sim/systems/hero.ts). */
export const BUILD_CHAIN_RADIUS = 3;

/** Transport (2026-11-03) : capacite du cargo dans data/resources.ts
 *  (CARGO_CAPACITY) ; le stock de la run n'augmente qu'au depot
 *  (BuildingDef.dropOff : la Baliste). Ramasser un petit tas prend
 *  PICKUP_SECONDS au contact (rayon + PICKUP_REACH) ; le depot se fait au
 *  contact de l'emprise (BUILD_REACH). PROVISOIRE. */
/** Depot (2026-11-02, demande d'Antoine) : une unite du sac versee au stock
 *  toutes les DEPOSIT_SECONDS_PER_ITEM s au contact du depot (3 s pour un sac
 *  de 6). PROVISOIRE. */
export const DEPOSIT_SECONDS_PER_ITEM = 0.5;
export const PICKUP_SECONDS = 0.6;
export const PICKUP_REACH = 0.5;
/** Inventaire unique du Heros (2026-11-02) : cases du sac (ressources en
 *  piles, equipements, butin). PROVISOIRE. */
export const HERO_INVENTORY_SLOTS = 20;
/** Ouverture d'un coffre (2026-11-02) : duree au contact (barre d'action),
 *  portee de contact. PROVISOIRE. */
export const CHEST_OPEN_SECONDS = 1;
export const CHEST_REACH = 0.7;
/** Reparation d'un batiment par le Heros (2026-11-02) : secondes pour
 *  rendre 100 % des PV max (proportionnel aux PV manquants). PROVISOIRE. */
export const REPAIR_FULL_SECONDS = 10;
