import type { ObstacleBounds } from '../../config/constants';
import type { ResourceKind, ResourceNode } from '../../config/resourceNodes';
import { getBuilding } from '../../data/buildings';
import {
  BUILD_CHAIN_RADIUS,
  BUILD_REACH,
  CONSTRUCTION_START_HP_FRACTION,
  HARVEST_INTERVAL,
  HARVEST_REACH,
  HERO_CARRY_CAPACITY,
  HERO_XP_SHARE_RADIUS,
  heroLevelForXp,
  heroRespawnDelay,
  heroStatsForLevel,
  heroXpForKill,
  PICKUP_REACH,
  PICKUP_SECONDS,
} from '../../data/hero';
import type { Entity } from '../entity';
import { isWorkOrder } from '../orders';

/**
 * Heros (2026-11-01, direction Hero RTS, data/hero.ts) : progression (XP en
 * zone, niveaux), mort et resurrection a la Baliste, travail au contact
 * (recolte, ramassage, depot, construction des chantiers). Deterministe : aucun hasard, ordre
 * des entites. Le deplacement vers une source ou un chantier est fait par
 * movementSystem (workGoal) ; ce module decide quand le Heros travaille.
 */
export type HeroEvent =
  | { type: 'xp'; heroId: number; amount: number; xp: number }
  | { type: 'levelUp'; heroId: number; level: number }
  | { type: 'death'; heroId: number; respawnIn: number }
  | { type: 'respawn'; heroId: number; x: number; z: number }
  /** Une unite recoltee sur un arbre ou un rocher, mise dans le sac. */
  | { type: 'harvest'; heroId: number; resource: ResourceKind; amount: number; nodeId: number }
  /** Petit tas ramasse : quantite prise et quantite restante au sol. */
  | { type: 'pickup'; heroId: number; resource: ResourceKind; amount: number; pileId: number; remaining: number }
  /** Sac plein : le travail s'arrete (le Heros passe en Garde). */
  | { type: 'carryFull'; heroId: number }
  /** Sac vide au depot : quantites versees au stock de la run. */
  | { type: 'deposit'; heroId: number; wood: number; stone: number }
  | { type: 'built'; heroId: number; buildingId: number };

/** Petit tas au sol de la carte (MapDef.resourcePiles), etat de simulation :
 *  `amount` baisse a chaque ramassage, 0 = disparu. */
export interface ResourcePile {
  id: number;
  x: number;
  z: number;
  resource: ResourceKind;
  amount: number;
}

/** Ce que le travail du Heros lit du monde : sources (arbres, rochers) et
 *  petits tas au sol (World). */
export interface HeroWorkContext {
  nodes: ReadonlyMap<number, ResourceNode>;
  piles: readonly ResourcePile[];
}

/** Unites portees par un Heros. */
export function carriedAmount(h: { carry: { wood: number; stone: number } }): number {
  return h.carry.wood + h.carry.stone;
}

/** But du travail d'un Heros (source, chantier, tas, depot) et portee de
 *  contact, ou null (pas d'ordre de travail, cible disparue). Lu par
 *  movementSystem. */
export function workGoal(e: Entity, work: HeroWorkContext, byId: ReadonlyMap<number, Entity>): { x: number; z: number; reached: boolean; target: Entity | null } | null {
  const order = e.order;
  if (!isWorkOrder(order)) return null;
  if (order.type === 'harvest') {
    const node = work.nodes.get(order.nodeId);
    if (!node) return null;
    return { x: node.x, z: node.z, reached: Math.hypot(node.x - e.x, node.z - e.z) <= e.stats.radius + HARVEST_REACH, target: null };
  }
  if (order.type === 'pickup') {
    const pile = work.piles[order.pileId];
    if (!pile || pile.amount <= 0) return null;
    return { x: pile.x, z: pile.z, reached: Math.hypot(pile.x - e.x, pile.z - e.z) <= e.stats.radius + PICKUP_REACH, target: null };
  }
  const target = byId.get(order.targetEntityId);
  if (!target || !target.alive || (order.type === 'build' && !target.construction)) return null;
  return { x: target.x, z: target.z, reached: distanceToSite(e, target) <= e.stats.radius + BUILD_REACH, target };
}

/** Distance du centre de `e` a l'emprise d'un batiment (ou a son centre, rayon deduit). */
function distanceToSite(e: Entity, site: Entity): number {
  const f = site.footprintObstacle;
  if (!f) return Math.max(0, Math.hypot(site.x - e.x, site.z - e.z) - site.stats.radius);
  const b: ObstacleBounds = { minX: site.x - (f.tilesX / 2), maxX: site.x + (f.tilesX / 2), minZ: site.z - (f.tilesZ / 2), maxZ: site.z + (f.tilesZ / 2) };
  const dx = Math.max(b.minX - e.x, 0, e.x - b.maxX);
  const dz = Math.max(b.minZ - e.z, 0, e.z - b.maxZ);
  return Math.hypot(dx, dz);
}

/** Travail au contact (apres movementSystem) : recolte vers le sac (une unite
 *  toutes les HARVEST_INTERVAL s), ramassage d'un tas (PICKUP_SECONDS), depot
 *  du sac, construction (avancement, PV qui montent ; fin : batiment
 *  fonctionnel, enchainement sur le chantier voisin). */
export function heroWorkSystem(entities: Entity[], work: HeroWorkContext, dt: number, events: HeroEvent[]): void {
  const byId = new Map(entities.map((e) => [e.id, e]));
  for (const e of entities) {
    const h = e.hero;
    if (!h || !e.alive) continue;
    const goal = workGoal(e, work, byId);
    if (isWorkOrder(e.order) && !goal) {
      // Source, tas ou chantier disparu (chantier termine par ailleurs,
      // detruit, tas vide) : le Heros passe en Garde.
      e.order = { type: 'guard' };
    }
    if (!goal || !goal.reached || e.tauntSourceId !== null) {
      h.working = null;
      h.workTimer = 0;
      continue;
    }
    if (e.order.type === 'deposit') {
      // Depot : tout le sac, d'un coup, au contact du depot.
      if (carriedAmount(h) > 0) events.push({ type: 'deposit', heroId: e.id, wood: h.carry.wood, stone: h.carry.stone });
      h.carry = { wood: 0, stone: 0 };
      e.order = { type: 'guard' };
      h.working = null;
      h.workTimer = 0;
      continue;
    }
    if (e.order.type === 'harvest' || e.order.type === 'pickup') {
      if (carriedAmount(h) >= HERO_CARRY_CAPACITY) {
        events.push({ type: 'carryFull', heroId: e.id });
        e.order = { type: 'guard' };
        h.working = null;
        h.workTimer = 0;
        continue;
      }
    }
    if (e.order.type === 'harvest') {
      const node = work.nodes.get(e.order.nodeId)!;
      h.working = node.resource === 'wood' ? 'chop' : 'mine';
      h.workTimer += dt;
      while (h.workTimer >= HARVEST_INTERVAL && carriedAmount(h) < HERO_CARRY_CAPACITY) {
        h.workTimer -= HARVEST_INTERVAL;
        h.carry[node.resource]++;
        events.push({ type: 'harvest', heroId: e.id, resource: node.resource, amount: 1, nodeId: node.id });
      }
      continue;
    }
    if (e.order.type === 'pickup') {
      const pile = work.piles[e.order.pileId]!;
      h.working = 'gather';
      h.workTimer += dt;
      if (h.workTimer < PICKUP_SECONDS) continue;
      // Tout ce que le sac peut prendre ; le reste du tas reste au sol.
      const amount = Math.min(pile.amount, HERO_CARRY_CAPACITY - carriedAmount(h));
      pile.amount -= amount;
      h.carry[pile.resource] += amount;
      events.push({ type: 'pickup', heroId: e.id, resource: pile.resource, amount, pileId: pile.id, remaining: pile.amount });
      e.order = { type: 'guard' };
      h.working = null;
      h.workTimer = 0;
      continue;
    }
    const site = goal.target!;
    const c = site.construction!;
    h.working = 'build';
    const step = Math.min(dt / c.buildTime, 1 - c.progress);
    c.progress += step;
    site.hp = Math.min(site.stats.maxHp, site.hp + site.stats.maxHp * (1 - CONSTRUCTION_START_HP_FRACTION) * step);
    if (c.progress < 1 - 1e-9) continue;
    // Erreur d'arrondi cumulee : un chantier intact finit a pleins PV exacts.
    if (site.stats.maxHp - site.hp < 1e-6) site.hp = site.stats.maxHp;
    site.construction = null;
    site.countsForDefeat = getBuilding(site.unitId).countsForDefeat;
    events.push({ type: 'built', heroId: e.id, buildingId: site.id });
    // Chantier inacheve le plus proche (murailles case par case), sinon Garde.
    let next: Entity | null = null;
    let best = BUILD_CHAIN_RADIUS;
    for (const o of entities) {
      if (!o.alive || !o.construction || o.team !== e.team) continue;
      const d = Math.hypot(o.x - site.x, o.z - site.z);
      if (d <= best) {
        best = d;
        next = o;
      }
    }
    e.order = next ? { type: 'build', targetEntityId: next.id } : { type: 'guard' };
    h.working = null;
  }
}

/** Morts du pas (apres deathSystem) : XP partagee des unites adverses tombees
 *  pres d'un Heros vivant, mort du Heros (delai de resurrection). */
export function heroDeathSystem(entities: Entity[], aliveBefore: ReadonlySet<number>, events: HeroEvent[]): void {
  const heroes = entities.filter((e) => e.hero);
  for (const dead of entities) {
    if (dead.alive || !aliveBefore.has(dead.id)) continue;
    if (dead.hero) {
      dead.hero.deaths++;
      dead.hero.respawnTimer = heroRespawnDelay(dead.hero.deaths);
      dead.hero.working = null;
      dead.hero.workTimer = 0;
      dead.order = { type: 'guard' };
      events.push({ type: 'death', heroId: dead.id, respawnIn: dead.hero.respawnTimer });
      continue;
    }
    if (dead.isBuilding) continue;
    for (const h of heroes) {
      if (!h.alive || h.team === dead.team || Math.hypot(h.x - dead.x, h.z - dead.z) > HERO_XP_SHARE_RADIUS) continue;
      gainHeroXp(h, heroXpForKill(dead.unitId), events);
    }
  }
}

/** Ajoute de l'XP ; montee de niveau immediate (stats de la fiche du niveau,
 *  PV actuels augmentes du meme ecart que les PV max). */
export function gainHeroXp(e: Entity, amount: number, events: HeroEvent[]): void {
  const h = e.hero!;
  h.xp += amount;
  events.push({ type: 'xp', heroId: e.id, amount, xp: h.xp });
  const target = heroLevelForXp(h.xp).level;
  while (h.level < target) {
    const before = heroStatsForLevel(h.level);
    h.level++;
    const after = heroStatsForLevel(h.level);
    e.stats = { ...e.stats, maxHp: e.stats.maxHp + after.maxHp - before.maxHp, damage: e.stats.damage + after.damage - before.damage, moveSpeed: e.stats.moveSpeed + after.moveSpeed - before.moveSpeed };
    e.hp += after.maxHp - before.maxHp;
    events.push({ type: 'levelUp', heroId: e.id, level: h.level });
  }
}

/** Resurrection : le delai court en temps de simulation ; a son terme, le
 *  Heros revient a pleins PV pres de la Baliste de son camp si elle est
 *  debout (`spawnPoint`), en Garde. Baliste detruite : il ne revient pas. */
export function heroRespawnSystem(entities: Entity[], dt: number, spawnPoint: (hero: Entity) => { x: number; z: number } | null, events: HeroEvent[]): void {
  for (const e of entities) {
    const h = e.hero;
    if (!h || e.alive || h.respawnTimer <= 0) continue;
    h.respawnTimer = Math.max(0, h.respawnTimer - dt);
    if (h.respawnTimer > 0) continue;
    const at = spawnPoint(e);
    if (!at) continue;
    e.alive = true;
    e.hp = e.stats.maxHp;
    e.x = e.prevX = at.x;
    e.z = e.prevZ = at.z;
    e.order = { type: 'guard' };
    e.targetId = null;
    e.path = null;
    e.pendingAttack = null;
    e.dash = null;
    e.cast = null;
    e.rootTimer = 0;
    e.tauntSourceId = null;
    e.tauntTimer = 0;
    e.attackTimer = 0;
    events.push({ type: 'respawn', heroId: e.id, x: at.x, z: at.z });
  }
}
