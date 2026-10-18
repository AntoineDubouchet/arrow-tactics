import { HP_PER_PIP } from '../config/constants';
import { findAbility } from '../data/abilities';
import { getBuilding } from '../data/buildings';
import { getUnit, UNITS, type UnitStats } from '../data/units';
import type { Entity, Team } from '../sim/entity';
import {
  BALLISTA_STATUS_LABELS,
  effectivePlayerArrowCooldown,
  effectivePlayerArrowDamage,
  formatBallistaCooldownSeconds,
  playerArrowBoltsPerVolley,
  type BallistaStatus,
} from './ballistaStats';
import { effectiveBallistaMaxHp } from './ballistaUpgradeEffects';
import { effectiveBarracksSpawnCount, effectiveBarracksSpawnInterval } from './barracksUpgradeEffects';
import { effectiveMineGoldPerSecond } from './mineUpgradeEffects';
import { playerUnitAbilityDamageBonus, playerUnitStatOverrides, playerUnitTauntShieldBonus } from './playerUnitStats';
import { entityRunUpgradeLevel, type PlayerProgression, type RunUpgradeLevels } from './runUpgrades';

/**
 * Fiche d'entite : adaptateur PUR entre l'etat du jeu (emplacements de
 * preparation, bâtiments possedes, entites de simulation, progression du
 * joueur : talents et niveaux d'amelioration de la run) et
 * le panneau d'interface (ui/entityInfoPanel.ts). Ne lit ni le DOM ni
 * Three.js et ne calcule aucune statistique de gameplay : il lit les
 * valeurs EFFECTIVES deja utilisees par le jeu (run/playerUnitStats.ts,
 * run/ballistaStats.ts, run/*UpgradeEffects.ts en preparation ; l'entite de
 * simulation en bataille) et les met en forme a l'echelle visible par le
 * joueur (PV et degats en points, voir HP_PER_PIP).
 */

export interface EntityInfoRow {
  label: string;
  value: string;
}

/** Petite section nommee (capacite d'une unite). */
export interface EntityInfoSection {
  title: string;
  rows: EntityInfoRow[];
}

/** PV en points affiches. `fraction` (0..1) et `shieldFraction` sont
 *  calcules sur les valeurs internes, comme les barres de PV en jeu. */
export interface EntityInfoHp {
  current: string;
  max: string;
  fraction: number;
  /** Bouclier temporaire (Provocation), en points ; absent sans bouclier. */
  shield?: string;
  shieldFraction?: number;
}

/** Action proposee par la fiche (bouton). Donnee pure : main.ts recoit
 *  l'`id` au clic et decide de l'effet ; l'adaptateur ne connait pas le DOM. */
export interface EntityInfoAction {
  id: 'openForge';
  label: string;
  enabled: boolean;
  hint?: string;
}

export interface EntityInfoStatus {
  label: string;
  tone: 'ready' | 'busy' | 'muted' | 'danger';
}

interface EntityInfoCommon {
  title: string;
  team: Team;
  hp: EntityInfoHp;
  rows: EntityInfoRow[];
  sections: EntityInfoSection[];
  status: EntityInfoStatus | null;
  /** Actions proposees (boutons) ; absent = aucune. */
  actions?: EntityInfoAction[];
}

export interface UnitInfo extends EntityInfoCommon {
  kind: 'unit';
  unitId: string;
}

export interface GroupInfo extends EntityInfoCommon {
  kind: 'group';
  /** Repartition par classe, deja formulee ("4 Fantassins"). */
  composition: string[];
}

export interface BuildingInfo extends EntityInfoCommon {
  kind: 'building';
  buildingId: string;
}

export interface BallistaInfo extends EntityInfoCommon {
  kind: 'ballista';
}

export type EntityInfoViewModel = UnitInfo | GroupInfo | BuildingInfo | BallistaInfo;

// --- Mise en forme ---------------------------------------------------------

/** Au dixieme pres, sans ".0" superflu (meme convention que formatGold). */
function formatNumber(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

/** Titre suivi du niveau d'amelioration de run (« Fantassin — Niv. 3 ») ;
 *  inchange pour une entite sans amelioration (niveau null). */
function titleWithLevel(title: string, level: number | null): string {
  return level === null ? title : `${title} — Niv. ${level}`;
}

/** Niveau a afficher pour une entite : seulement dans le camp du joueur
 *  (les ameliorations de la Forge ne concernent que lui). */
function playerLevel(team: Team, levels: Readonly<RunUpgradeLevels>, definitionId: string): number | null {
  return team === 'player' ? entityRunUpgradeLevel(levels, definitionId) : null;
}

/** Valeur interne (PV, degats, bouclier) -> points affiches. */
export function toDisplayPoints(internal: number): number {
  return internal / HP_PER_PIP;
}

function formatPoints(internal: number): string {
  return formatNumber(toDisplayPoints(internal));
}

/** PV ACTUELS : arrondis au dixieme de point SUPERIEUR, pour qu'une entite
 *  encore vivante n'affiche jamais 0. */
function formatCurrentHp(internal: number): string {
  if (internal <= 0) return '0';
  return formatNumber(Math.ceil(toDisplayPoints(internal) * 10 - 1e-9) / 10);
}

function formatSeconds(seconds: number): string {
  return `${formatNumber(seconds)} s`;
}

/** Duree RESTANTE : meme arrondi que le HUD de la Baliste. */
function formatRemaining(seconds: number): string {
  return formatBallistaCooldownSeconds(seconds);
}

/** Portee d'attaque : en deca d'une case, c'est un coup au contact. */
const MELEE_RANGE_MAX = 1;

function formatRange(range: number): string {
  return range <= MELEE_RANGE_MAX ? 'Mêlée' : `${formatNumber(range)} cases`;
}

function plural(count: number, singular: string): string {
  return count > 1 ? `${singular}s` : singular;
}

function hpOf(current: number, max: number, shield = 0): EntityInfoHp {
  const hp: EntityInfoHp = {
    current: formatCurrentHp(current),
    max: formatPoints(max),
    fraction: clamp01(current / Math.max(1, max)),
  };
  if (shield > 0) {
    hp.shield = formatCurrentHp(shield);
    hp.shieldFraction = clamp01(shield / Math.max(1, max));
  }
  return hp;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

// --- Unites ----------------------------------------------------------------

/** Etat de combat lu sur l'entite, absent en preparation. */
interface BattleUnitState {
  abilityCooldowns: Entity['abilityCooldowns'];
  casting: boolean;
  shield: number;
  /** Temps de simulation ecoule depuis le debut de la bataille (World.time),
   *  lu par le verrou initial de Provocation. */
  battleElapsedSeconds: number;
}

interface UnitInfoSource {
  unitId: string;
  team: Team;
  hp: number;
  stats: UnitStats;
  abilityDamageBonus: number;
  tauntShieldBonus: number;
  battle: BattleUnitState | null;
  /** Niveau d'amelioration de run du type d'unite, null s'il n'y en a pas. */
  upgradeLevel: number | null;
}

function abilityState(remaining: number | undefined, lockoutRemaining = 0): string {
  if (lockoutRemaining > 0) return `Dans ${formatRemaining(lockoutRemaining)}`;
  if (remaining !== undefined && remaining > 0) return `Recharge ${formatRemaining(remaining)}`;
  return 'Prête';
}

function buildUnitInfo(source: UnitInfoSource): UnitInfo {
  const def = getUnit(source.unitId);
  const { stats, battle } = source;
  const fireball = findAbility(def.abilities, 'area-blast');
  const taunt = findAbility(def.abilities, 'taunt');

  const rows: EntityInfoRow[] = [];
  const sections: EntityInfoSection[] = [];
  if (fireball) {
    // Mage : la Boule de feu est son attaque normale ; le coup de repli au
    // contact (stats.damage) n'est pas affiche.
    const fireballRows: EntityInfoRow[] = [
      { label: 'Dégâts', value: formatPoints(fireball.damage + source.abilityDamageBonus) },
      { label: 'Portée', value: `${formatNumber(fireball.minRangeTiles)}–${formatNumber(fireball.maxRangeTiles)} cases` },
      { label: 'Recharge', value: formatSeconds(fireball.cooldown) },
    ];
    if (battle) {
      fireballRows.push({ label: 'État', value: battle.casting ? 'Incantation' : abilityState(battle.abilityCooldowns['area-blast']) });
    }
    sections.push({ title: 'Attaque — Boule de feu', rows: fireballRows });
  } else {
    rows.push(
      { label: 'Dégâts', value: formatPoints(stats.damage) },
      { label: 'Portée', value: formatRange(stats.attackRange) },
      { label: 'Cadence', value: `1 coup / ${formatSeconds(stats.attackCooldown)}` },
    );
  }
  rows.push({ label: 'Vitesse', value: `${formatNumber(stats.moveSpeed)} cases/s` });
  if (stats.dodgeChance > 0) rows.push({ label: 'Esquive', value: `${Math.round(stats.dodgeChance * 100)} %` });

  if (taunt) {
    const tauntRows: EntityInfoRow[] = [
      { label: 'Recharge', value: formatSeconds(taunt.cooldown) },
      { label: 'Rayon', value: `${formatNumber(taunt.radiusTiles)} cases` },
      { label: 'Bouclier', value: `${formatPoints(taunt.baseShieldPerTarget + source.tauntShieldBonus)} / ennemi` },
    ];
    if (battle) {
      const lockoutRemaining = (taunt.initialLockoutSeconds ?? 0) - battle.battleElapsedSeconds;
      tauntRows.push({ label: 'État', value: abilityState(battle.abilityCooldowns.taunt, lockoutRemaining) });
    }
    sections.push({ title: 'Provocation', rows: tauntRows });
  }

  return {
    kind: 'unit',
    unitId: source.unitId,
    title: titleWithLevel(def.name, source.upgradeLevel),
    team: source.team,
    hp: hpOf(source.hp, stats.maxHp, battle?.shield ?? 0),
    rows,
    sections,
    status: null,
  };
}

/** Stats EFFECTIVES d'une unite joueur avant son apparition : meme fusion
 *  que World.spawn ({ ...def.stats, ...statOverrides }) avec les memes
 *  surcharges (run/playerUnitStats.ts). */
function effectivePlayerUnitStats(unitId: string, progress: PlayerProgression): UnitStats {
  return { ...getUnit(unitId).stats, ...playerUnitStatOverrides(unitId, progress) };
}

/** Unite seule en preparation : PV actuels de l'emplacement (persistants
 *  d'une vague a l'autre), stats effectives recalculees. */
export function placementUnitInfo(slot: { unitId: string; hp: number }, progress: PlayerProgression): UnitInfo {
  return buildUnitInfo({
    unitId: slot.unitId,
    team: 'player',
    hp: slot.hp,
    stats: effectivePlayerUnitStats(slot.unitId, progress),
    abilityDamageBonus: playerUnitAbilityDamageBonus(slot.unitId, progress.upgrades),
    tauntShieldBonus: playerUnitTauntShieldBonus(slot.unitId, progress.upgrades),
    battle: null,
    upgradeLevel: playerLevel('player', progress.upgrades, slot.unitId),
  });
}

/** Unite seule en bataille : tout vient de l'entite, deja effective, sauf
 *  le niveau d'amelioration, lu dans les niveaux de la run (`levels`). */
export function battleUnitInfo(entity: Entity, battleElapsedSeconds: number, levels: Readonly<RunUpgradeLevels>): UnitInfo {
  return buildUnitInfo({
    unitId: entity.unitId,
    team: entity.team,
    hp: entity.hp,
    stats: entity.stats,
    abilityDamageBonus: entity.abilityDamageBonus,
    tauntShieldBonus: entity.tauntShieldBonus,
    battle: {
      abilityCooldowns: entity.abilityCooldowns,
      casting: entity.cast !== null,
      shield: entity.shield,
      battleElapsedSeconds,
    },
    upgradeLevel: playerLevel(entity.team, levels, entity.unitId),
  });
}

// --- Groupes ---------------------------------------------------------------

interface GroupMember {
  unitId: string;
  hp: number;
  maxHp: number;
}

function buildGroupInfo(members: GroupMember[], team: Team, levels: Readonly<RunUpgradeLevels>): GroupInfo {
  const counts = new Map<string, number>();
  let hp = 0;
  let maxHp = 0;
  let wounded = 0;
  for (const m of members) {
    counts.set(m.unitId, (counts.get(m.unitId) ?? 0) + 1);
    hp += m.hp;
    maxHp += m.maxHp;
    if (m.hp < m.maxHp) wounded++;
  }
  // Ordre stable : celui des definitions d'unites, jamais l'ordre de clic.
  const order = Object.keys(UNITS);
  const composition = [...counts.entries()]
    .sort(([a], [b]) => order.indexOf(a) - order.indexOf(b))
    .map(([unitId, count]) => `${count} ${plural(count, getUnit(unitId).name)}`);
  // Un seul type : un seul niveau de run, rappele sur la ligne de composition.
  const onlyType = counts.size === 1 ? [...counts.keys()][0]! : null;
  const level = onlyType ? playerLevel(team, levels, onlyType) : null;
  if (level !== null) composition[0] = titleWithLevel(composition[0]!, level);
  return {
    kind: 'group',
    title: `${members.length} ${plural(members.length, 'unité')}`,
    team,
    hp: hpOf(hp, maxHp),
    rows: [{ label: 'Blessées', value: String(wounded) }],
    sections: [],
    status: null,
    composition,
  };
}

export function placementGroupInfo(slots: readonly { unitId: string; hp: number }[], progress: PlayerProgression): GroupInfo {
  return buildGroupInfo(
    slots.map((s) => ({ unitId: s.unitId, hp: s.hp, maxHp: effectivePlayerUnitStats(s.unitId, progress).maxHp })),
    'player',
    progress.upgrades,
  );
}

/** `entities` : unites encore vivantes de la selection (les mortes en sont
 *  deja retirees par BattleSelection.sync). */
export function battleGroupInfo(entities: readonly Entity[], levels: Readonly<RunUpgradeLevels>): GroupInfo {
  return buildGroupInfo(
    entities.map((e) => ({ unitId: e.unitId, hp: e.hp, maxHp: e.stats.maxHp })),
    entities[0]?.team ?? 'player',
    levels,
  );
}

// --- Mine et Caserne -------------------------------------------------------

function mineRows(progress: PlayerProgression): EntityInfoRow[] {
  return [{ label: 'Revenu', value: `${effectiveMineGoldPerSecond(progress.upgrades).toFixed(1)} or/s` }];
}

function barracksRows(unitId: string, intervalSeconds: number, count: number): EntityInfoRow[] {
  return [
    { label: 'Produit', value: getUnit(unitId).name },
    { label: 'Intervalle', value: formatSeconds(intervalSeconds) },
    { label: 'Unités / production', value: String(count) },
  ];
}

/** Bâtiment possede en preparation : PV persistants de la run, production
 *  effective (amelioration de la Caserne), revenu effectif (Mine). */
export function placementBuildingInfo(owned: { buildingId: string; hp: number }, progress: PlayerProgression): BuildingInfo {
  const def = getBuilding(owned.buildingId);
  let rows: EntityInfoRow[] = [];
  if (def.id === 'mine') rows = mineRows(progress);
  else if (def.spawner) rows = barracksRows(def.spawner.unitId, effectiveBarracksSpawnInterval(progress.upgrades), effectiveBarracksSpawnCount(progress.upgrades));
  // Forge : seul acces aux ameliorations de la run, en preparation
  // uniquement (aucune action dans battleBuildingInfo).
  const actions: EntityInfoAction[] | undefined = def.id === 'forge' ? [{ id: 'openForge', label: 'Ouvrir la Forge', enabled: true }] : undefined;
  const title = titleWithLevel(def.displayName, playerLevel('player', progress.upgrades, def.id));
  return { kind: 'building', buildingId: def.id, title, team: 'player', hp: hpOf(owned.hp, def.maxHp), rows, sections: [], status: null, actions };
}

/** Bâtiment en bataille : PV et production lus sur l'entite. Le revenu de
 *  la Mine n'est pas une donnee de simulation (verse par main.ts tant que la
 *  Mine est vivante) : il reste lu sur la progression. */
export function battleBuildingInfo(entity: Entity, progress: PlayerProgression): BuildingInfo {
  const def = getBuilding(entity.unitId);
  let rows: EntityInfoRow[] = [];
  if (def.id === 'mine') rows = mineRows(progress);
  else if (entity.spawnUnitId !== null && entity.spawnIntervalSeconds !== null) {
    rows = barracksRows(entity.spawnUnitId, entity.spawnIntervalSeconds, entity.spawnCount ?? 1);
    if (entity.spawnTimer !== null) {
      // Minuterie a 0 : le lot attend des cases libres autour de la Caserne
      // (voir sim/systems/barracksSystem.ts).
      rows.push({ label: 'Prochaine production', value: entity.spawnTimer > 0 ? formatRemaining(entity.spawnTimer) : 'En attente' });
    }
  }
  const title = titleWithLevel(def.displayName, playerLevel(entity.team, progress.upgrades, def.id));
  return { kind: 'building', buildingId: def.id, title, team: entity.team, hp: hpOf(entity.hp, entity.stats.maxHp), rows, sections: [], status: null };
}

// --- Baliste ---------------------------------------------------------------

function ballistaRows(progress: PlayerProgression): EntityInfoRow[] {
  return [
    { label: 'Dégâts / carreau', value: formatPoints(effectivePlayerArrowDamage(progress)) },
    { label: 'Recharge', value: formatSeconds(effectivePlayerArrowCooldown(progress)) },
    { label: 'Carreaux / volée', value: String(playerArrowBoltsPerVolley(progress.talents)) },
  ];
}

/** Baliste en preparation : elle reapparait toujours a pleins PV au debut
 *  de la bataille. Aucune portee : le tir n'en a pas. */
export function placementBallistaInfo(progress: PlayerProgression): BallistaInfo {
  const maxHp = effectiveBallistaMaxHp(progress.upgrades);
  return {
    kind: 'ballista',
    title: titleWithLevel(getBuilding('ballista').displayName, playerLevel('player', progress.upgrades, 'ballista')),
    team: 'player',
    hp: hpOf(maxHp, maxHp),
    rows: ballistaRows(progress),
    sections: [],
    status: { label: 'Prête pour la bataille', tone: 'muted' },
  };
}

/** Baliste en bataille : PV de son entite, etat de tir calcule par main.ts
 *  (currentBallistaStatus, meme source que le HUD de la Baliste). */
export function battleBallistaInfo(entity: Entity, status: BallistaStatus, progress: PlayerProgression): BallistaInfo {
  return {
    kind: 'ballista',
    title: titleWithLevel(getBuilding('ballista').displayName, playerLevel(entity.team, progress.upgrades, 'ballista')),
    team: entity.team,
    hp: hpOf(entity.alive ? entity.hp : 0, entity.stats.maxHp),
    rows: ballistaRows(progress),
    sections: [],
    status: ballistaStatusInfo(status),
  };
}

function ballistaStatusInfo(status: BallistaStatus): EntityInfoStatus {
  switch (status.kind) {
    case 'reloading':
      return { label: `RECHARGE ${formatBallistaCooldownSeconds(status.cooldownSeconds)}`, tone: 'busy' };
    case 'ready':
      return { label: BALLISTA_STATUS_LABELS.ready, tone: 'ready' };
    case 'inFlight':
      return { label: BALLISTA_STATUS_LABELS.inFlight, tone: 'busy' };
    case 'destroyed':
      return { label: BALLISTA_STATUS_LABELS.destroyed, tone: 'danger' };
  }
}
