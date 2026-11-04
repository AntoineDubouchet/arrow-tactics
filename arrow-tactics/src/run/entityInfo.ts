import { HP_PER_PIP, PLAYER_ARROW_RANGE } from '../config/constants';
import { findAbility } from '../data/abilities';
import { getBuilding, unitsProducedPerWave } from '../data/buildings';
import { HERO_UNIT_ID, heroStatsForLevel } from '../data/hero';
import { getUnit, unitPluralName, UNITS, withEffectiveMoveSpeed, type UnitStats } from '../data/units';
import type { Entity, Team } from '../sim/entity';
import {
  BALLISTA_STATUS_LABELS,
  effectivePlayerArrowCooldown,
  effectivePlayerArrowDamage,
  formatBallistaCooldownSeconds,
  playerArrowBoltsPerVolley,
  type BallistaFireMode,
  type BallistaStatus,
} from './ballistaStats';
import { effectiveBallistaMaxHp } from './ballistaUpgradeEffects';
import { effectiveBuildingAttackDamage, effectiveBuildingMaxHp } from './buildingUpgradeEffects';
import { churchHealCost, churchHealHpPerGold } from './churchHeal';
import { mineGoldRange, mineProductionIntervalSeconds } from './mineUpgradeEffects';
import { buildingUpgradeGoldCost, isBuildingAtMaxLevel, isUpgradableBuilding } from './buildingUpgrades';
import { BODY_LAYOUT, EQUIPMENT_SLOTS, EQUIPMENT_TYPES, getEquipment, RARITIES, type EquipmentSlot } from '../data/equipment';
import { CARGO_LABELS, CARGO_RESOURCES, cargoTotal, HARVEST_TOOLS, type ResourceCargo } from '../data/resources';
import { describeEquipment } from './heroEquipment';
import { freeSlotCount, type HeroInventory } from '../sim/inventory';
import { playerUnitAbilityDamageBonus, playerUnitStatOverrides, playerUnitTauntShieldBonus } from './playerUnitStats';
import { displayedUpgradeLevel, entityRunUpgradeLevel, type PlayerProgression, type RunUpgradeLevels } from './runUpgrades';
import { playerUnitProductionCost } from './unitUpgradeEffects';

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
  /** `upgradeBuilding` : ameliore le batiment selectionne (Mine, Caserne,
   *  Tour, Eglise). `toggleBallistaMode` : bascule la Baliste AUTO / MANUEL
   *  (bataille). `healArmy` : soin de l'armee a l'Eglise selectionnee ;
   *  `openChurchUpgrades` : ameliorations de run accessibles a l'Eglise. */
  id: 'openForge' | 'upgradeBuilding' | 'toggleBallistaMode' | 'healArmy' | 'openShrineUpgrades' | 'buildStructure' | 'produceUnit' | 'cancelProduction' | 'setRally' | 'clearRally' | 'repairBuilding' | 'toggleDoor';
  /** `buildStructure` : batiment a poser ; `produceUnit` : unite a produire
   *  (fiche d'un batiment), Survie en temps reel. */
  payload?: string;
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
  return level === null ? title : `${title} — Niv. ${displayedUpgradeLevel(level)}`;
}

/** Niveau a afficher pour un batiment : seulement dans le camp du joueur
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
  /** Niveau propre a l'unite (production pour le joueur, vague pour un
   *  ennemi), null s'il n'y en a pas. */
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
  const heal = findAbility(def.abilities, 'heal');

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
  // Seul le camp du joueur a un cout de production et une population (voir
  // data/population.ts) ; le cout est celui du niveau de CETTE unite.
  if (source.team === 'player') {
    rows.push(
      { label: 'Coût', value: `${formatNumber(playerUnitProductionCost(source.unitId, source.upgradeLevel ?? 0))} or` },
      { label: 'Population', value: String(def.populationCost) },
    );
  }

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

  if (heal) {
    const healRows: EntityInfoRow[] = [
      { label: 'Soin', value: formatPoints(heal.amount) },
      { label: 'Portée', value: `${formatNumber(heal.rangeTiles)} cases` },
      { label: 'Incantation', value: formatSeconds(heal.castTime) },
      { label: 'Recharge', value: formatSeconds(heal.cooldown) },
    ];
    if (battle) healRows.push({ label: 'État', value: battle.casting ? 'Incantation' : abilityState(battle.abilityCooldowns.heal) });
    sections.push({ title: 'Soin', rows: healRows });
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
function effectivePlayerUnitStats(unitId: string, productionLevel: number, progress: PlayerProgression): UnitStats {
  return { ...getUnit(unitId).stats, ...playerUnitStatOverrides(unitId, productionLevel, progress) };
}

/** Emplacement de preparation tel que la fiche le lit. */
interface PlacementUnitSource {
  unitId: string;
  hp: number;
  productionLevel: number;
}

/** Unite seule en preparation : PV actuels de l'emplacement (persistants
 *  d'une vague a l'autre), stats effectives de SON niveau de production.
 *  Heros : stats et niveau de sa progression (`heroLevel`, RunState.hero). */
export function placementUnitInfo(slot: PlacementUnitSource, progress: PlayerProgression, heroLevel = 1): UnitInfo {
  const hero = slot.unitId === HERO_UNIT_ID;
  const stats = effectivePlayerUnitStats(slot.unitId, slot.productionLevel, progress);
  return buildUnitInfo({
    unitId: slot.unitId,
    team: 'player',
    hp: slot.hp,
    // Vitesse effective (x1,4), comme l'entite en jeu.
    stats: withEffectiveMoveSpeed(hero ? { ...stats, ...heroStatsForLevel(heroLevel) } : stats),
    abilityDamageBonus: playerUnitAbilityDamageBonus(slot.unitId, slot.productionLevel),
    tauntShieldBonus: playerUnitTauntShieldBonus(slot.unitId, slot.productionLevel),
    battle: null,
    // Niveau d'unite (data/unitLevels.ts) : niveau de production propre
    // (0 = Niv. 1), pour tout type d'unite.
    upgradeLevel: hero ? heroLevel - 1 : slot.productionLevel,
  });
}

/** Unite seule en bataille : tout vient de l'entite, deja effective, niveau
 *  compris (Entity.level, data/unitLevels.ts : production pour le joueur,
 *  vague pour un ennemi, carte pour un garde de camp, progression pour le
 *  Heros). */
export function battleUnitInfo(entity: Entity, battleElapsedSeconds: number): UnitInfo {
  const info = buildUnitInfo({
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
    // Niveau d'unite >= 1 (titleWithLevel affiche niveau + 1).
    upgradeLevel: entity.level - 1,
  });
  // Villageois (2026-11-03) : cargo economique « Transport : 3 / 5 — Pierre ».
  if (!entity.worker || !entity.cargo) return info;
  return { ...info, rows: [...info.rows, { label: 'Transport', value: cargoSummary(entity.cargo) }] };
}

/** « 7 / 10 — Bois 4 · Pierre 2 · Or 1 » (vide : « 0 / 10 »). */
export function cargoSummary(c: ResourceCargo): string {
  const parts = CARGO_RESOURCES.filter((r) => c[r] > 0).map((r) => `${CARGO_LABELS[r]} ${c[r]}`);
  return `${cargoTotal(c)} / ${c.capacity}${parts.length > 0 ? ` — ${parts.join(' · ')}` : ''}`;
}

// --- Feuille du Heros (inventaire) -----------------------------------------

/** Item de la feuille du Heros : nom, rarete (nom, couleur), emplacement,
 *  lignes de stats et d'effets, valeur de vente. */
export interface HeroSheetItem {
  id: string;
  name: string;
  rarity: string;
  color: string;
  slot: string;
  /** Emplacement de donnees (glisser-deposer vers la silhouette). */
  slotId: EquipmentSlot;
  type: string;
  lines: string[];
  sellValue: number;
}

/** Case du sac (grille) : vide ou equipement (jamais une ressource :
 *  cargo, 2026-11-03). */
export type HeroSheetCell = { kind: 'empty' } | { kind: 'item'; item: HeroSheetItem };

/** Feuille du Heros (2026-11-02, inventaire, touche I) : remplace sa fiche,
 *  qui ne s'affiche plus a sa selection. Statistiques EFFECTIVES de son
 *  entite (niveau et equipement compris), sorts connus, equipement porte par
 *  emplacement et items du sac (run/heroEquipment.ts). */
export interface HeroSheetInfo {
  title: string;
  hp: EntityInfoHp;
  rows: EntityInfoRow[];
  spells: { name: string; detail: string; description: string }[];
  /** Silhouette (BODY_LAYOUT) : emplacements du corps et item porte. */
  body: { id: string; label: string; accepts: readonly EquipmentSlot[]; item: HeroSheetItem | null }[];
  /** Cases du sac, dans l'ordre. */
  cells: HeroSheetCell[];
  capacity: string;
  /** Monnaie du joueur (RunState.gold, 2026-11-02), affichee sous le sac :
   *  la meme donnee que le HUD economique, jamais une case du sac. */
  gold?: number;
  /** Cargo economique (2026-11-03) : « 7 / 10 — Bois 4 · Pierre 2 · Or 1 ». */
  cargo?: string;
}

function sheetItem(itemId: string): HeroSheetItem {
  const def = getEquipment(itemId);
  const rarity = RARITIES[def.rarity];
  return { id: def.id, name: def.name, rarity: rarity.name, color: rarity.color, slot: EQUIPMENT_SLOTS[def.slot].label, slotId: def.slot, type: EQUIPMENT_TYPES[def.type], lines: describeEquipment(def), sellValue: def.sellValue };
}

export function heroSheetInfo(entity: Entity, heroName: string, nextLevelXp: number | null): HeroSheetInfo {
  const inventory: HeroInventory = entity.hero!.inventory;
  const h = entity.hero!;
  const s = entity.stats;
  const rows: EntityInfoRow[] = [
    { label: 'Mana', value: `${Math.floor(h.mana)} / ${h.maxMana} (+${formatNumber(h.manaRegen)} / s)` },
    { label: 'Dégâts', value: formatPoints(s.damage) },
    { label: 'Portée', value: formatRange(s.attackRange) },
    { label: 'Cadence', value: `1 coup / ${formatSeconds(s.attackCooldown)}` },
    { label: 'Vitesse', value: `${formatNumber(s.moveSpeed)} cases/s` },
  ];
  if (s.dodgeChance > 0) rows.push({ label: 'Esquive', value: `${Math.round(s.dodgeChance * 100)} %` });
  rows.push(
    { label: 'Expérience', value: nextLevelXp === null ? `${h.xp} XP (niveau max)` : `${h.xp} / ${nextLevelXp} XP` },
    // Cargo economique (2026-11-03) : jamais une case du sac.
    { label: 'Ressources transportées', value: entity.cargo ? cargoSummary(entity.cargo) : '—' },
  );
  return {
    title: `${heroName} — Niv. ${h.level}`,
    hp: hpOf(entity.alive ? entity.hp : 0, s.maxHp, entity.shield),
    rows,
    spells: h.spells.map((spell) => ({
      name: spell.name,
      detail: `${spell.manaCost} mana · ${formatSeconds(spell.castSeconds)} · portée ${formatNumber(spell.rangeTiles)} cases`,
      description: spell.description,
    })),
    body: BODY_LAYOUT.map((b) => {
      const worn = b.accepts.map((slot) => inventory.equipped[slot]).find((id) => id !== undefined);
      return { id: b.id, label: b.label, accepts: b.accepts, item: worn ? sheetItem(worn) : null };
    }),
    cells: inventory.slots.map((s): HeroSheetCell => (s ? { kind: 'item', item: sheetItem(s.itemId) } : { kind: 'empty' })),
    capacity: `${inventory.slots.length - freeSlotCount(inventory)} / ${inventory.slots.length}`,
    cargo: entity.cargo ? cargoSummary(entity.cargo) : undefined,
  };
}

// --- Groupes ---------------------------------------------------------------

interface GroupMember {
  unitId: string;
  hp: number;
  maxHp: number;
  /** Niveau propre au membre (voir battleUnitInfo), null s'il n'y en a pas. */
  level: number | null;
}

/** Un niveau n'est rappele que pour un groupe d'un seul type dont tous les
 *  membres partagent le meme niveau (les unites d'un meme type peuvent
 *  differer : niveau de production fige a leur creation). */
function buildGroupInfo(members: GroupMember[], team: Team): GroupInfo {
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
    .map(([unitId, count]) => `${count} ${count > 1 ? unitPluralName(getUnit(unitId)) : getUnit(unitId).name}`);
  // Un seul type et un seul niveau : rappele sur la ligne de composition.
  const memberLevels = new Set(members.map((m) => m.level));
  const level = counts.size === 1 && memberLevels.size === 1 ? (members[0]?.level ?? null) : null;
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

export function placementGroupInfo(slots: readonly PlacementUnitSource[], progress: PlayerProgression): GroupInfo {
  return buildGroupInfo(
    slots.map((s) => ({
      unitId: s.unitId,
      hp: s.hp,
      maxHp: effectivePlayerUnitStats(s.unitId, s.productionLevel, progress).maxHp,
      level: s.productionLevel,
    })),
    'player',
  );
}

/** `entities` : unites encore vivantes de la selection (les mortes en sont
 *  deja retirees par BattleSelection.sync). Niveau : Entity.level (voir
 *  battleUnitInfo). */
export function battleGroupInfo(entities: readonly Entity[]): GroupInfo {
  return buildGroupInfo(
    entities.map((e) => ({ unitId: e.unitId, hp: e.hp, maxHp: e.stats.maxHp, level: e.level - 1 })),
    entities[0]?.team ?? 'player',
  );
}

// --- Mine, Caserne et Camp d'archerie --------------------------------------

/** Niveau interne propre au batiment (Mine, Caserne). `nextIn` : secondes
 *  avant la prochaine tranche d'une Mine en jeu, null hors jeu. */
function mineRows(level: number, nextIn: number | null = null): EntityInfoRow[] {
  const { min, max } = mineGoldRange(level);
  const rows: EntityInfoRow[] = [
    { label: 'Production', value: `${min} à ${max} or` },
    { label: 'Fréquence', value: `toutes les ${formatSeconds(mineProductionIntervalSeconds())}` },
  ];
  if (nextIn !== null) rows.push({ label: 'Prochaine tranche', value: `dans ${formatSeconds(Math.ceil(nextIn))}` });
  return rows;
}

/** "1 Fantassin par manche", "2 Archers par manche". */
/** « 1 Piquier et 1 Fantassin par manche » : unites produites, regroupees par type dans leur ordre. */
function unitsPerWaveText(unitIds: readonly string[]): string {
  const counts = new Map<string, number>();
  for (const unitId of unitIds) counts.set(unitId, (counts.get(unitId) ?? 0) + 1);
  const parts = [...counts].map(([unitId, count]) => {
    const def = getUnit(unitId);
    return `${count} ${count > 1 ? unitPluralName(def) : def.name}`;
  });
  return `${parts.join(' et ')} par manche`;
}

/** Recrutement debloque par le batiment (Caserne, Camp d'archerie, Eglise). */
function recruitmentUnlockRows(buildingId: string): EntityInfoRow[] {
  const unlock = getBuilding(buildingId).recruitmentUnlock;
  if (!unlock) return [];
  const names = unlock.unitIds.map((unitId) => {
    const plural = unitPluralName(getUnit(unitId));
    const minLevel = unlock.minLevels?.[unitId] ?? 0;
    return `${/^[AEIOUYÉÈH]/i.test(plural) ? 'd’' : 'de '}${plural}${minLevel > 0 ? ` (Niv. ${minLevel + 1})` : ''}`;
  });
  const list = names.length > 1 ? `${names.slice(0, -1).join(', ')} et ${names.at(-1)}` : names[0];
  return [{ label: 'Débloque', value: `Recrutement ${list}` }];
}

/** Batiment de production (Caserne, Camp d'archerie) a son niveau propre. */
function productionRows(buildingId: string, level: number): EntityInfoRow[] {
  return [
    { label: 'Produit', value: unitsPerWaveText(unitsProducedPerWave(buildingId, level)) },
    ...recruitmentUnlockRows(buildingId),
  ];
}

/** Emprise au sol d'un batiment posable (Mine, Caserne, Forge), en cases. */
function footprintRows(buildingId: string): EntityInfoRow[] {
  const def = getBuilding(buildingId);
  if (def.footprintTilesX === undefined || def.footprintTilesZ === undefined) return [];
  return [{ label: 'Emprise', value: `${def.footprintTilesX} × ${def.footprintTilesZ} cases` }];
}

/** Attaque d'un batiment defensif (Tour) : degats (points), portee, cadence. */
function attackRows(damage: number, rangeTiles: number, cooldownSeconds: number): EntityInfoRow[] {
  return [
    { label: 'Dégâts', value: formatPoints(damage) },
    { label: 'Portée', value: formatRange(rangeTiles) },
    { label: 'Cadence', value: `1 tir / ${formatSeconds(cooldownSeconds)}` },
  ];
}

/** Soin de l'armee (Eglise) : efficacite au niveau propre du batiment. */
function armyHealRows(buildingId: string, level: number): EntityInfoRow[] {
  return [{ label: 'Soin', value: `${formatNumber(churchHealHpPerGold(buildingId, level))} PV par or` }];
}

/** Population maximale apportee par le batiment (Maison). */
function populationBonusRows(buildingId: string): EntityInfoRow[] {
  const bonus = getBuilding(buildingId).populationBonus;
  return bonus ? [{ label: 'Population', value: `+${bonus}` }] : [];
}

/** Outils de recolte donnes par le batiment (Forge, 2026-11-02). */
function harvestUnlockRows(buildingId: string): EntityInfoRow[] {
  const tools = getBuilding(buildingId).unlocksTools ?? [];
  return tools.length > 0 ? [{ label: 'Outils', value: tools.map((t) => HARVEST_TOOLS[t].name).join(', ') }] : [];
}

/** Point de collecte (2026-11-03) : ressources de cargo acceptees
 *  (« Toutes ressources » quand il accepte tout, comme la Baliste). */
function dropOffRows(buildingId: string): EntityInfoRow[] {
  const accepted = getBuilding(buildingId).dropOff ?? [];
  if (accepted.length === 0) return [];
  const value = CARGO_RESOURCES.every((r) => accepted.includes(r)) ? 'Toutes ressources' : accepted.map((r) => CARGO_LABELS[r]).join(', ');
  return [{ label: 'Point de collecte', value }];
}

/** Lignes de production d'un batiment possede selon SON niveau. */
function ownedBuildingRows(buildingId: string, level: number): EntityInfoRow[] {
  const def = getBuilding(buildingId);
  if (def.id === 'mine') return mineRows(level);
  if (def.production) return productionRows(def.id, level);
  if (def.attack) return attackRows(effectiveBuildingAttackDamage(def.id, level), def.attack.rangeTiles, def.attack.cooldownSeconds);
  if (def.armyHeal) return [...armyHealRows(def.id, level), ...recruitmentUnlockRows(def.id)];
  return [...populationBonusRows(def.id), ...harvestUnlockRows(def.id), ...dropOffRows(def.id)];
}

/** Effet du prochain niveau, en une ligne (Mine, Caserne, Camp d'archerie,
 *  Tour, Eglise). */
function nextLevelRow(buildingId: string, level: number): EntityInfoRow {
  const label = `Niv. ${displayedUpgradeLevel(level + 1)}`;
  if (getBuilding(buildingId).attack) {
    const hpGain = effectiveBuildingMaxHp(buildingId, level + 1) - effectiveBuildingMaxHp(buildingId, level);
    const damageGain = effectiveBuildingAttackDamage(buildingId, level + 1) - effectiveBuildingAttackDamage(buildingId, level);
    return { label, value: `+${formatPoints(hpGain)} PV, +${formatPoints(damageGain)} dégâts` };
  }
  if (getBuilding(buildingId).armyHeal) {
    const hpGain = effectiveBuildingMaxHp(buildingId, level + 1) - effectiveBuildingMaxHp(buildingId, level);
    const healGain = churchHealHpPerGold(buildingId, level + 1) - churchHealHpPerGold(buildingId, level);
    return { label, value: `+${formatPoints(hpGain)} PV, +${formatNumber(healGain)} PV par or` };
  }
  if (buildingId === 'mine') {
    const { min, max } = mineGoldRange(level + 1);
    return { label, value: `${min} à ${max} or` };
  }
  const production = getBuilding(buildingId).production;
  return { label, value: production ? unitsPerWaveText(unitsProducedPerWave(buildingId, level + 1)) : '' };
}

const UPGRADE_LABELS: Readonly<Record<string, string>> = { mine: 'Améliorer la mine' };

/** Bâtiment possede en preparation : PV persistants de la run, niveau et
 *  production PROPRES a ce batiment ; Mine, Caserne, Tour et Eglise
 *  s'ameliorent ici (`gold` : or disponible, pour activer le bouton), la
 *  Forge et l'Eglise ouvrent leurs ameliorations de run, l'Eglise soigne
 *  l'armee (`armyMissingHp` : PV manquants de l'armee, interne). Aucune
 *  action en bataille (battleBuildingInfo). */
export function placementBuildingInfo(
  owned: { buildingId: string; hp: number; level?: number; constructionProgress?: number },
  progress: PlayerProgression,
  gold: number,
  armyMissingHp = 0,
): BuildingInfo {
  const def = getBuilding(owned.buildingId);
  if (owned.constructionProgress !== undefined) return chantierInfo(def.id, owned.hp, effectiveBuildingMaxHp(def.id, owned.level ?? 0), owned.constructionProgress);
  const upgradable = isUpgradableBuilding(def.id);
  const level = owned.level ?? 0;
  const rows = [...ownedBuildingRows(def.id, level), ...footprintRows(def.id)];
  const actions: EntityInfoAction[] = [];
  if (def.id === 'forge') actions.push({ id: 'openForge', label: 'Ouvrir la Forge', enabled: true });
  if (def.armyHeal) {
    // Soin de toute l'armee : cout total des PV manquants, tout ou rien.
    rows.push({ label: 'PV manquants (armée)', value: formatPoints(armyMissingHp) });
    const healCost = churchHealCost(armyMissingHp, churchHealHpPerGold(def.id, level));
    if (healCost <= 0) actions.push({ id: 'healArmy', label: 'Armée déjà au maximum', enabled: false });
    else {
      const enabled = gold >= healCost;
      actions.push({ id: 'healArmy', label: `Soigner l'armée — ${formatNumber(healCost)} or`, enabled, hint: enabled ? undefined : 'Or insuffisant' });
    }
  }
  if (upgradable && isBuildingAtMaxLevel(def.id, level)) rows.push({ label: 'Amélioration', value: 'Niveau maximum' });
  else if (upgradable) {
    rows.push(nextLevelRow(def.id, level));
    const cost = buildingUpgradeGoldCost(def.id, level);
    const enabled = gold >= cost;
    actions.push({ id: 'upgradeBuilding', label: `${UPGRADE_LABELS[def.id] ?? 'Améliorer'} — ${formatNumber(cost)} or`, enabled, hint: enabled ? undefined : 'Or insuffisant' });
  }
  if (def.runUpgradeSite === 'shrine') actions.push({ id: 'openShrineUpgrades', label: 'Parchemins du Sanctuaire', enabled: true });
  const title = titleWithLevel(def.displayName, upgradable ? level : playerLevel('player', progress.upgrades, def.id));
  return {
    kind: 'building',
    buildingId: def.id,
    title,
    team: 'player',
    hp: hpOf(owned.hp, effectiveBuildingMaxHp(def.id, level)),
    rows,
    sections: [],
    status: null,
    actions: actions.length > 0 ? actions : undefined,
  };
}

/** Chantier (2026-11-01, direction Hero RTS) : batiment achete mais pas
 *  encore bati par le Heros. Ni production, ni attaque, ni action. */
function chantierInfo(buildingId: string, hp: number, maxHp: number, progress: number, team: Team = 'player'): BuildingInfo {
  const def = getBuilding(buildingId);
  const rows: EntityInfoRow[] = [
    { label: 'Chantier', value: `${Math.floor(progress * 100)} %` },
    { label: 'Construction', value: 'Clic droit du Héros en bataille' },
    ...footprintRows(def.id),
  ];
  return { kind: 'building', buildingId: def.id, title: `${def.displayName} (chantier)`, team, hp: hpOf(hp, maxHp), rows, sections: [], status: null };
}

/** Bâtiment en bataille : PV et production lus sur l'entite. `ownedLevel` :
 *  niveau propre d'une Mine ou d'une Caserne possedee (null sinon) ; le
 *  revenu de la Mine n'est pas une donnee de simulation (verse par main.ts
 *  tant que la Mine est vivante), il se deduit de ce niveau. */
export function battleBuildingInfo(entity: Entity, progress: PlayerProgression, ownedLevel: number | null = null, mineNextIn: number | null = null): BuildingInfo {
  const def = getBuilding(entity.unitId);
  if (entity.construction) return chantierInfo(def.id, entity.hp, entity.stats.maxHp, entity.construction.progress, entity.team);
  let rows: EntityInfoRow[] = [];
  if (def.id === 'mine') rows = mineRows(ownedLevel ?? 0, mineNextIn);
  else if (def.production) {
    rows = productionRows(def.id, ownedLevel ?? 0);
    // Quota de la manche pas encore produit : il attend une place de
    // population ou des cases libres (voir sim/systems/buildingProduction.ts).
    if (entity.productionQueue.length > 0) {
      const reason = entity.productionWaitingForPopulation ? 'population pleine' : 'aucune case libre';
      rows.push({ label: 'En attente', value: `${entity.productionQueue.length} (${reason})` });
    }
  } else if (entity.buildingAttack) {
    const attack = entity.buildingAttack;
    rows = attackRows(attack.damage, attack.rangeTiles, attack.cooldownSeconds);
  } else if (def.armyHeal) {
    // Le soin de l'armee ne se declenche qu'en preparation.
    rows = [...armyHealRows(def.id, ownedLevel ?? 0), { label: 'Soin de l’armée', value: 'En préparation uniquement' }, ...recruitmentUnlockRows(def.id)];
  } else rows = [...populationBonusRows(def.id), ...harvestUnlockRows(def.id), ...dropOffRows(def.id)];
  rows.push(...footprintRows(def.id));
  // Batiment de production d'un scenario de l'editeur (non possede) : Niv. 1.
  const level = isUpgradableBuilding(def.id) ? (def.production ? (ownedLevel ?? 0) : ownedLevel) : playerLevel(entity.team, progress.upgrades, def.id);
  const title = titleWithLevel(def.displayName, level);
  return { kind: 'building', buildingId: def.id, title, team: entity.team, hp: hpOf(entity.hp, entity.stats.maxHp), rows, sections: [], status: null };
}

// --- Baliste ---------------------------------------------------------------

function ballistaRows(progress: PlayerProgression): EntityInfoRow[] {
  return [
    { label: 'Dégâts / carreau', value: formatPoints(effectivePlayerArrowDamage(progress)) },
    { label: 'Portée', value: formatRange(PLAYER_ARROW_RANGE) },
    { label: 'Recharge', value: formatSeconds(effectivePlayerArrowCooldown(progress)) },
    { label: 'Carreaux / volée', value: String(playerArrowBoltsPerVolley(progress.talents)) },
    ...dropOffRows('ballista'),
  ];
}

/** Baliste en preparation : elle reapparait toujours a pleins PV, en mode
 *  AUTO, au debut de la bataille. */
export function placementBallistaInfo(progress: PlayerProgression): BallistaInfo {
  const maxHp = effectiveBallistaMaxHp(progress.upgrades);
  return {
    kind: 'ballista',
    title: titleWithLevel(getBuilding('ballista').displayName, playerLevel('player', progress.upgrades, 'ballista')),
    team: 'player',
    hp: hpOf(maxHp, maxHp),
    rows: [...ballistaRows(progress), { label: 'Mode', value: 'Automatique au début de la bataille' }],
    sections: [],
    status: { label: 'Prête pour la bataille', tone: 'muted' },
  };
}

/** Lignes du mode de tir en bataille : en MANUEL, rappel du tir sur Q. */
function ballistaModeRows(mode: BallistaFireMode): EntityInfoRow[] {
  if (mode === 'auto') return [{ label: 'Mode', value: 'Automatique' }, { label: 'Cible', value: 'Ennemi le plus proche' }];
  return [{ label: 'Mode', value: 'Manuel' }, { label: 'Tir', value: 'Q vers le curseur' }];
}

/** Baliste en bataille : PV de son entite, etat de tir calcule par main.ts
 *  (currentBallistaStatus, meme source que le HUD de la Baliste), mode de
 *  tir et bouton de bascule AUTO / MANUEL. */
export function battleBallistaInfo(entity: Entity, status: BallistaStatus, progress: PlayerProgression, mode: BallistaFireMode): BallistaInfo {
  return {
    kind: 'ballista',
    title: titleWithLevel(getBuilding('ballista').displayName, playerLevel(entity.team, progress.upgrades, 'ballista')),
    team: entity.team,
    hp: hpOf(entity.alive ? entity.hp : 0, entity.stats.maxHp),
    rows: [...ballistaModeRows(mode), ...ballistaRows(progress)],
    sections: [],
    status: ballistaStatusInfo(status),
    actions: [
      {
        id: 'toggleBallistaMode',
        label: mode === 'auto' ? 'Passer en manuel' : 'Passer en automatique',
        enabled: entity.alive,
        hint: entity.alive ? undefined : 'Baliste détruite',
      },
    ],
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
