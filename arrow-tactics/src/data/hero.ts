import { getUnit } from './units';

/**
 * Heros (2026-11-01, direction « Hero RTS Survival », docs/DESIGN_DECISIONS.md
 * G1 et G4) : progression, resurrection, recolte et construction. Donnees
 * PROVISOIRES, lues par la simulation (sim/systems/hero.ts) et l'interface.
 */
export const HERO_UNIT_ID = 'hero';

/** Paliers de niveau : XP totale requise et bonus CUMULES par rapport a la
 *  fiche de base (data/units.ts). Niveau 1 a 3. PROVISOIRE. */
export interface HeroLevel {
  level: number;
  xp: number;
  maxHpBonus: number;
  damageBonus: number;
  moveSpeedBonus: number;
}
export const HERO_LEVELS: readonly HeroLevel[] = [
  { level: 1, xp: 0, maxHpBonus: 0, damageBonus: 0, moveSpeedBonus: 0 },
  { level: 2, xp: 50, maxHpBonus: 75, damageBonus: 6, moveSpeedBonus: 0.15 },
  { level: 3, xp: 150, maxHpBonus: 150, damageBonus: 12, moveSpeedBonus: 0.3 },
];
export const HERO_MAX_LEVEL = HERO_LEVELS[HERO_LEVELS.length - 1]!.level;

/** Niveau atteint avec `xp` points. */
export function heroLevelForXp(xp: number): HeroLevel {
  let current = HERO_LEVELS[0]!;
  for (const l of HERO_LEVELS) if (xp >= l.xp) current = l;
  return current;
}

/** Stats du Heros au niveau `level` : fiche de base + bonus cumules. */
export function heroStatsForLevel(level: number): { maxHp: number; damage: number; moveSpeed: number } {
  const base = getUnit(HERO_UNIT_ID).stats;
  const l = HERO_LEVELS.find((h) => h.level === level) ?? HERO_LEVELS[0]!;
  return { maxHp: base.maxHp + l.maxHpBonus, damage: base.damage + l.damageBonus, moveSpeed: base.moveSpeed + l.moveSpeedBonus };
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
 *  (cases) quand il en termine un (murailles case par case). */
export const BUILD_CHAIN_RADIUS = 3;

/** Transport (2026-11-01) : le Heros porte au plus HERO_CARRY_CAPACITY
 *  unites (bois et pierre confondus) ; le stock de la run n'augmente qu'au
 *  depot (BuildingDef.resourceDepot : la Baliste). Ramasser un petit tas
 *  prend PICKUP_SECONDS au contact (rayon du Heros + PICKUP_REACH) ; le
 *  depot se fait au contact de l'emprise (BUILD_REACH). PROVISOIRE. */
export const HERO_CARRY_CAPACITY = 6;
export const PICKUP_SECONDS = 0.6;
export const PICKUP_REACH = 0.5;
