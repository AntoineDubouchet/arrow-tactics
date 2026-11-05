import type { ObstacleBounds } from '../../config/constants';
import type { ResourceNode } from '../../config/resourceNodes';
import { HARVEST_NODE_KINDS, type HarvestResource, type PileResource } from '../../data/resources';
import { UNIT_MOVE_SPEED_MULTIPLIER } from '../../data/units';
import { addItem } from '../inventory';
import { getBuilding } from '../../data/buildings';
import { distanceToSegment } from '../../core/wallLine';
import { applyDamageToEntity, type DamageType } from '../damage';
import { targetDistance } from '../geometry';
import { areAllied } from '../relations';
import {
  BUILD_CHAIN_RADIUS,
  BUILD_REACH,
  CHEST_OPEN_SECONDS,
  REPAIR_FULL_SECONDS,
  CHEST_REACH,
  CONSTRUCTION_START_HP_FRACTION,
  HARVEST_REACH,
  WORKER_HARVEST_REACH,
  HERO_XP_RANGE,
  heroLevelForXp,
  heroRespawnDelay,
  heroStatsForLevel,
  heroXpForKill,
  PICKUP_REACH,
  PICKUP_SECONDS,
} from '../../data/hero';
import type { Entity } from '../entity';
import { isWorkOrder, type UnitOrder } from '../orders';
import type { AbilityEvent } from './abilities';
import type { Chest } from './camps';
import { cargoWork, type CargoEvent } from './cargo';

/**
 * Heros (2026-11-01, direction Hero RTS, data/hero.ts) : progression (XP en
 * zone, niveaux), mort et resurrection a la Baliste, travail au contact
 * (recolte, ramassage, depot, construction des chantiers). Deterministe : aucun hasard, ordre
 * des entites. Le deplacement vers une source ou un chantier est fait par
 * movementSystem (workGoal) ; ce module decide quand le Heros travaille.
 *
 * Sorts (2026-11-02, data/spells.ts) : ordre `cast` ; le Heros s'approche a
 * portee, retient le mana et incante sur place (Entity.cast, avance par
 * abilitySystem, qui donne le soin). Tout autre ordre, la mort, une
 * Provocation ou la mort de la cible annulent l'incantation avant son effet :
 * aucun soin, mana rendu (interruptHeroSpells, AVANT abilitySystem). Une
 * cible sortie de portee a la fin : soin perdu, mana rendu.
 */
/** Raison de l'annulation d'un sort : nouvel ordre, mort du Heros,
 *  Provocation, cible morte ou disparue, cible hors de portee a la fin,
 *  mana insuffisant au moment d'incanter. */
export type SpellCancelReason = 'order' | 'death' | 'taunt' | 'target' | 'out-of-range' | 'no-mana';
export type HeroEvent =
  | { type: 'xp'; heroId: number; amount: number; xp: number }
  | { type: 'levelUp'; heroId: number; level: number }
  | { type: 'death'; heroId: number; respawnIn: number }
  | { type: 'respawn'; heroId: number; x: number; z: number }
  /** Une unite recoltee sur un arbre ou un rocher, mise dans le sac. */
  /** Petit tas ramasse : quantite prise et quantite restante au sol. */
  /** Item au sol ramasse (butin) : la run l'ajoute a l'inventaire du Heros. */
  | { type: 'itemPickup'; heroId: number; dropId: number; itemId: string }
  /** Butin non ramasse : aucune case libre (l'item reste au sol). */
  | { type: 'itemPickupFull'; heroId: number; dropId: number; itemId: string }
  /** Coffre ouvert : item tire (null : rien) pose au sol a cote (`dropId`). */
  | { type: 'chestOpened'; heroId: number; chestId: number; itemId: string | null; dropId: number | null }
  /** Coffre encore verrouille (camp defendu) a l'arrivee : rien ne s'ouvre. */
  | { type: 'chestLocked'; heroId: number; chestId: number }
  | { type: 'built'; heroId: number; buildingId: number }
  /** Fin d'une reparation : PV rendus sur le budget paye (remboursement du
   *  reste par l'orchestration). `reason` : terminee, ou interrompue (autre
   *  ordre, Heros mort, batiment perdu / deja intact). */
  | { type: 'repairEnd'; heroId: number; repairId: number; buildingId: number; restoredHp: number; budgetHp: number; reason: 'done' | 'interrupted' }
  /** Incantation commencee (mana retenu). */
  | { type: 'spellStart'; heroId: number; spellId: string; targetId: number }
  /** Tourbillon (2026-11-03) : frappe n (position, degats, entites touchees),
   *  puis fin (terminee, ou Heros mort). */
  | { type: 'whirlwindPulse'; heroId: number; x: number; z: number; pulse: number; damage: number; hits: number[]; damageType: DamageType }
  | { type: 'whirlwindEnd'; heroId: number; reason: 'done' | 'death' }
  /** Incantation annulee avant son effet ; `refunded` : mana rendu. */
  | { type: 'spellCancel'; heroId: number; spellId: string; reason: SpellCancelReason; refunded: number }
  /** Sort abouti (`healed` : PV internes reellement rendus). */
  | { type: 'spellEnd'; heroId: number; spellId: string; targetId: number; healed: number };

/** Item au sol (butin, 2026-11-02) : identifiant d'item (data/equipment.ts),
 *  ramasse une fois par le Heros (`taken`). L'inventaire est a la run. */
export interface ItemDrop {
  id: number;
  x: number;
  z: number;
  itemId: string;
  taken: boolean;
}

/** Petit tas au sol de la carte (MapDef.resourcePiles), etat de simulation :
 *  `amount` baisse a chaque ramassage, 0 = disparu. */
export interface ResourcePile {
  id: number;
  x: number;
  z: number;
  /** Bois / pierre (sac du Heros) ou or (monnaie, ramasse d'un clic). */
  resource: PileResource;
  amount: number;
}

/** Ce que le travail du Heros lit du monde : sources (arbres, rochers) et
 *  petits tas au sol (World). */
export interface HeroWorkContext {
  nodes: ReadonlyMap<number, ResourceNode>;
  /** Quantite restante de chaque source (World.resourceNodeAmounts : bois
   *  d'un arbre, pierre d'un gisement), decomptee ici. */
  nodeAmounts: Map<number, number>;
  /** Sources arrivees a 0 pendant ce pas (World : source retiree). */
  depleted: number[];
  /** Outil disponible pour une source (World.harvestPermissions). */
  canHarvest(resource: HarvestResource): boolean;
  /** Point actuellement VISIBLE par le camp du joueur (World.visibility,
   *  resolu par l'orchestration depuis le brouillard de guerre du jeu ; sans
   *  brouillard : toujours vrai). Lu par l'autonomie des Villageois
   *  (sim/systems/workers.ts) : une nouvelle source choisie seule doit etre
   *  visible ; jamais relu pendant un travail en cours. */
  isVisible(x: number, z: number): boolean;
  piles: readonly ResourcePile[];
  drops: readonly ItemDrop[];
  /** Coffres (World.chests), verrou (camp pas nettoye) et ouverture (tirage
   *  du butin avec la RNG du monde, item pose au sol). */
  chests: readonly Chest[];
  chestLocked(chest: Chest): boolean;
  openChest(chest: Chest): { itemId: string | null; dropId: number | null };
}

/** But du travail d'un Heros ou d'un Villageois (source, chantier, tas,
 *  depot) et portee de contact, ou null (pas d'ordre de travail, cible
 *  disparue). `box` : cases bloquantes de la source (arbre, gisement), pour
 *  que movementSystem vise un point d'approche sur un de ses cotes
 *  (2026-11-05) plutot que son centre impraticable. Lu par movementSystem. */
export function workGoal(e: Entity, work: HeroWorkContext, byId: ReadonlyMap<number, Entity>): { x: number; z: number; reached: boolean; target: Entity | null; box?: ObstacleBounds } | null {
  const order = e.order;
  if (!isWorkOrder(order)) return null;
  if (order.type === 'cast') {
    const target = byId.get(order.targetEntityId);
    const spell = e.hero?.spells.find((s) => s.id === order.spellId);
    if (!target || !target.alive || !spell) return null;
    // Incantation commencee : sur place, la cible peut bouger.
    if (e.hero!.spellCast || target === e) return { x: e.x, z: e.z, reached: true, target: null };
    return { x: target.x, z: target.z, reached: Math.hypot(target.x - e.x, target.z - e.z) <= spell.rangeTiles, target };
  }
  if (order.type === 'harvest') {
    const node = work.nodes.get(order.nodeId);
    if (!node) return null;
    // Outil perdu (derniere Forge detruite, 2026-11-02) : plus de travail,
    // sauf l'unite en cours d'extraction, que le Heros finit avant de
    // s'arreter (heroWorkSystem).
    const worker = e.hero ?? e.worker;
    const extracting = worker !== null && worker.workTimer > 0 && worker.working === HARVEST_NODE_KINDS[node.resource].working;
    if (!work.canHarvest(node.resource) && !extracting) return null;
    // Arbre (cases bloquantes, 2026-11-02) : portee mesuree jusqu'a ses cases,
    // le Heros ne pouvant plus en approcher le centre. Villageois
    // (2026-11-05) : portee courte (WORKER_HARVEST_REACH), au contact visuel
    // du bord de la source ; le Heros garde la sienne.
    const reach = node.block ? distanceToBox(e, node.block) : Math.hypot(node.x - e.x, node.z - e.z);
    const tolerance = e.worker ? WORKER_HARVEST_REACH : HARVEST_REACH;
    return { x: node.x, z: node.z, reached: reach <= e.stats.radius + tolerance, target: null, ...(node.block ? { box: node.block } : {}) };
  }
  if (order.type === 'pickupItem') {
    const drop = work.drops[order.dropId];
    if (!drop || drop.taken) return null;
    return { x: drop.x, z: drop.z, reached: Math.hypot(drop.x - e.x, drop.z - e.z) <= e.stats.radius + PICKUP_REACH, target: null };
  }
  if (order.type === 'openChest') {
    const chest = work.chests[order.chestId];
    if (!chest || chest.opened) return null;
    return { x: chest.x, z: chest.z, reached: Math.hypot(chest.x - e.x, chest.z - e.z) <= e.stats.radius + CHEST_REACH, target: null };
  }
  if (order.type === 'pickup') {
    const pile = work.piles[order.pileId];
    // Tas de bois, de pierre ou d'or : le Heros va au tas (2026-11-03).
    if (!pile || pile.amount <= 0) return null;
    return { x: pile.x, z: pile.z, reached: Math.hypot(pile.x - e.x, pile.z - e.z) <= e.stats.radius + PICKUP_REACH, target: null };
  }
  const target = byId.get(order.targetEntityId);
  if (!target || !target.alive || (order.type === 'build' && !target.construction)) return null;
  // Reparation : jamais un batiment a 0 PV (detruit au pas en cours, avant deathSystem).
  if (order.type === 'repair' && (target.construction || target.hp <= 0 || target.hp >= target.stats.maxHp)) return null;
  return { x: target.x, z: target.z, reached: distanceToSite(e, target) <= e.stats.radius + BUILD_REACH, target };
}

/**
 * Un pas de construction d'un chantier au contact, par le Heros OU un
 * Villageois (2026-11-05, G46 : meme chantier, meme vitesse, meme fin, meme
 * enchainement ; plusieurs constructeurs avancent chacun le meme chantier,
 * sans formule de bonus). `worker` : geste et minuteur de l'unite
 * (HeroState ou WorkerState). Fini : batiment termine (evenement `built`,
 * heroId = unite constructrice), puis chantier inacheve le plus proche,
 * sinon Garde. Ligne de mur V2 : le segment suivant de la meme ligne
 * d'abord (construction de A vers B).
 */
export function constructSite(e: Entity, worker: { working: 'chop' | 'mine' | 'build' | 'gather' | null; workTimer: number }, site: Entity, entities: readonly Entity[], dt: number, events: HeroEvent[]): void {
  const c = site.construction!;
  worker.working = 'build';
  const step = Math.min(dt / c.buildTime, 1 - c.progress);
  c.progress += step;
  site.hp = Math.min(site.stats.maxHp, site.hp + site.stats.maxHp * (1 - CONSTRUCTION_START_HP_FRACTION) * step);
  if (c.progress < 1 - 1e-9) return;
  // Erreur d'arrondi cumulee : un chantier intact finit a pleins PV exacts.
  if (site.stats.maxHp - site.hp < 1e-6) site.hp = site.stats.maxHp;
  site.construction = null;
  site.countsForDefeat = getBuilding(site.unitId).countsForDefeat;
  events.push({ type: 'built', heroId: e.id, buildingId: site.id });
  let next: Entity | null = null;
  let best = BUILD_CHAIN_RADIUS;
  const line = site.wall;
  if (line) {
    for (const o of entities) {
      if (!o.alive || !o.construction || o.team !== e.team || o.wall?.lineId !== line.lineId) continue;
      if (!next || Math.abs(o.wall.index - line.index) < Math.abs(next.wall!.index - line.index) || (Math.abs(o.wall.index - line.index) === Math.abs(next.wall!.index - line.index) && o.wall.index > next.wall!.index)) next = o;
    }
  }
  for (const o of next ? [] : entities) {
    if (!o.alive || !o.construction || o.team !== e.team) continue;
    const d = Math.hypot(o.x - site.x, o.z - site.z);
    if (d <= best) {
      best = d;
      next = o;
    }
  }
  e.order = next ? { type: 'build', targetEntityId: next.id } : { type: 'guard' };
  worker.working = null;
  worker.workTimer = 0;
}

/** Distance du centre de `e` a l'emprise d'un batiment (ou a son centre, rayon deduit).
 *  Piece de mur V2 : jusqu'a sa capsule (ligne moins la demi-epaisseur). */
function distanceToSite(e: Entity, site: Entity): number {
  const f = site.footprintObstacle;
  if (f?.line) return Math.max(0, distanceToSegment(e.x, e.z, f.line) - f.line.halfWidth);
  if (!f) return Math.max(0, Math.hypot(site.x - e.x, site.z - e.z) - site.stats.radius);
  return distanceToBox(e, { minX: site.x - (f.tilesX / 2), maxX: site.x + (f.tilesX / 2), minZ: site.z - (f.tilesZ / 2), maxZ: site.z + (f.tilesZ / 2) });
}

/** Distance du centre de `e` a un rectangle (0 a l'interieur). */
function distanceToBox(e: Entity, b: ObstacleBounds): number {
  const dx = Math.max(b.minX - e.x, 0, e.x - b.maxX);
  const dz = Math.max(b.minZ - e.z, 0, e.z - b.maxZ);
  return Math.hypot(dx, dz);
}

/** Travail au contact (apres movementSystem) : recolte vers le sac (une unite
 *  toutes les HARVEST_NODE_KINDS[r].seconds), ramassage d'un tas (PICKUP_SECONDS), depot
 *  du sac, construction (avancement, PV qui montent ; fin : batiment
 *  fonctionnel, enchainement sur le chantier voisin). */
export function heroWorkSystem(entities: Entity[], work: HeroWorkContext, dt: number, events: HeroEvent[], cargoEvents: CargoEvent[]): void {
  const byId = new Map(entities.map((e) => [e.id, e]));
  for (const e of entities) {
    const h = e.hero;
    if (!h) continue;
    // Reparation (2026-11-02) : un autre ordre, la mort du Heros ou la perte
    // de la cible termine le travail ; le budget non utilise est rendu par
    // l'orchestration (evenement).
    const job = h.repairJob;
    if (job && (!e.alive || e.order.type !== 'repair' || e.order.repairId !== job.repairId)) endRepair(e, 'interrupted', events);
    if (e.alive && e.order.type === 'repair' && h.repairJob === null) {
      h.repairJob = { repairId: e.order.repairId, targetId: e.order.targetEntityId, budgetHp: e.order.budgetHp, restoredHp: 0 };
    }
    if (!e.alive) continue;
    // Or de butin au sol (2026-11-05, decision d'Antoine) : ramasse
    // AUTOMATIQUEMENT au contact du corps du Heros (rayon + PICKUP_REACH),
    // sans ordre, sans geste ni duree, sans arret : monnaie directe
    // (evenement lootGold). Un ordre `pickup` sur ce tas ne sert qu'a y
    // marcher et s'acheve ici. Jamais le Villageois (sim/systems/cargo.ts).
    for (const pile of work.piles) {
      if (pile.resource !== 'gold' || pile.amount <= 0) continue;
      if (Math.hypot(pile.x - e.x, pile.z - e.z) > e.stats.radius + PICKUP_REACH) continue;
      const amount = pile.amount;
      pile.amount = 0;
      cargoEvents.push({ type: 'lootGold', entityId: e.id, pileId: pile.id, amount });
      if (e.order.type === 'pickup' && e.order.pileId === pile.id) e.order = { type: 'guard' };
    }
    const goal = workGoal(e, work, byId);
    // Recolte, tas, depot : cargo economique partage avec le Villageois
    // (sim/systems/cargo.ts, 2026-11-03) ; il gere lui-meme la perte de sa
    // cible (source epuisee, point de collecte detruit -> le suivant).
    if (cargoWork(e, goal, work, entities, dt, cargoEvents)) continue;
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
    if (e.order.type === 'cast') {
      h.working = null;
      h.workTimer = 0;
      if (!h.spellCast) startSpell(e, e.order, byId, events);
      continue;
    }
    if (e.order.type === 'pickupItem') {
      // Butin : meme geste et meme duree qu'un petit tas.
      const drop = work.drops[e.order.dropId]!;
      h.working = 'gather';
      h.workTimer += dt;
      if (h.workTimer < PICKUP_SECONDS) continue;
      // Une case libre du sac ; sinon l'item reste au sol.
      const next = addItem(h.inventory, drop.itemId);
      if (next) {
        h.inventory = next;
        drop.taken = true;
        events.push({ type: 'itemPickup', heroId: e.id, dropId: drop.id, itemId: drop.itemId });
      } else events.push({ type: 'itemPickupFull', heroId: e.id, dropId: drop.id, itemId: drop.itemId });
      e.order = { type: 'guard' };
      h.working = null;
      h.workTimer = 0;
      continue;
    }
    if (e.order.type === 'openChest') {
      // Coffre (2026-11-02) : CHEST_OPEN_SECONDS au contact, une seule fois ;
      // encore verrouille a l'arrivee : rien, Garde.
      const chest = work.chests[e.order.chestId]!;
      if (work.chestLocked(chest)) {
        events.push({ type: 'chestLocked', heroId: e.id, chestId: chest.id });
      } else {
        h.working = 'gather';
        h.workTimer += dt;
        if (h.workTimer < CHEST_OPEN_SECONDS) continue;
        const loot = work.openChest(chest);
        events.push({ type: 'chestOpened', heroId: e.id, chestId: chest.id, itemId: loot.itemId, dropId: loot.dropId });
      }
      e.order = { type: 'guard' };
      h.working = null;
      h.workTimer = 0;
      continue;
    }
    if (e.order.type === 'repair') {
      // Geste et marteau du chantier ; PV rendus au rythme de
      // REPAIR_FULL_SECONDS pour 100 %, dans la limite du budget paye.
      const target = goal.target!;
      const rj = h.repairJob!;
      h.working = 'build';
      const amount = Math.min((target.stats.maxHp / REPAIR_FULL_SECONDS) * dt, rj.budgetHp - rj.restoredHp, target.stats.maxHp - target.hp);
      target.hp += amount;
      rj.restoredHp += amount;
      if (rj.restoredHp >= rj.budgetHp - 1e-6 || target.hp >= target.stats.maxHp - 1e-6) {
        if (target.stats.maxHp - target.hp < 1e-6) target.hp = target.stats.maxHp;
        endRepair(e, 'done', events);
        e.order = { type: 'guard' };
        h.working = null;
      }
      continue;
    }
    constructSite(e, h, goal.target!, entities, dt, events);
  }
}

/** Fin du travail de reparation du Heros `e` (evenement repairEnd). */
function endRepair(e: Entity, reason: 'done' | 'interrupted', events: HeroEvent[]): void {
  const job = e.hero!.repairJob!;
  e.hero!.repairJob = null;
  events.push({ type: 'repairEnd', heroId: e.id, repairId: job.repairId, buildingId: job.targetId, restoredHp: job.restoredHp, budgetHp: job.budgetHp, reason });
}

/** Debut d'incantation a portee : mana retenu, soin porte par Entity.cast
 *  (abilitySystem l'avance et le donne a la fin, cible verifiee). */
function startSpell(e: Entity, order: Extract<UnitOrder, { type: 'cast' }>, byId: ReadonlyMap<number, Entity>, events: HeroEvent[]): void {
  const h = e.hero!;
  const spell = h.spells.find((s) => s.id === order.spellId)!;
  const target = byId.get(order.targetEntityId)!;
  if (h.mana < spell.manaCost) {
    events.push({ type: 'spellCancel', heroId: e.id, spellId: spell.id, reason: 'no-mana', refunded: 0 });
    e.order = { type: 'guard' };
    return;
  }
  h.mana -= spell.manaCost;
  h.spellCast = { spellId: spell.id, targetId: target.id, manaSpent: spell.manaCost, order };
  e.cast = {
    targetX: target.x,
    targetZ: target.z,
    elapsed: 0,
    duration: spell.castSeconds,
    projectileSpeed: 0,
    damage: 0,
    radiusTiles: 0,
    heal: { targetId: target.id, amount: spell.healAmount, endRangeTiles: spell.rangeTiles + spell.endRangeMarginTiles },
  };
  events.push({ type: 'spellStart', heroId: e.id, spellId: spell.id, targetId: target.id });
}

/**
 * Tourbillon (2026-11-03), avant le travail du Heros, apres le deplacement :
 * le temps avance dans le pas fixe ; frappe n a `n * pulseSeconds` (0,5 ;
 * 1 ; ... 5 s : exactement 10 frappes depuis le 2026-11-05, jamais a t = 0),
 * a la position du Heros ; fin apres la derniere. Chaque frappe touche une
 * fois chaque hostile vivant (ni allie, ni objet destructible, ni batiment
 * non ciblable) dont le corps est a `radiusTiles`, pour
 * `snapshotAttackDamage * damageRatio`, par applyDamageToEntity (meme
 * pipeline de degats que tout coup : l'orchestration en tire le meme flash
 * blanc, par cible touchee). Heros mort : fin immediate, aucune frappe.
 * Fin (terminee ou mort) : la recharge du sort commence (2026-11-03) ; les
 * recharges de chaque Heros avancent ici, vivant ou a terre.
 *
 * Lancement (2026-11-05) : demande par sim/orders.ts (Entity.hero
 * .pendingWhirlwind) et demarre ICI, apres les frappes du pas, SANS toucher a
 * l'ordre en cours : un Heros en deplacement continue vers sa destination
 * avec son chemin ; mana pris une fois, jamais rendu ; degats d'attaque
 * finaux (niveau, equipement) figes au lancement ; l'attaque de base en
 * cours est abandonnee. Heros a terre : demande oubliee.
 */
export function heroWhirlwindSystem(entities: Entity[], dt: number, events: HeroEvent[]): void {
  for (const e of entities) {
    const h = e.hero;
    if (!h) continue;
    for (const id of Object.keys(h.spellCooldowns)) {
      const left = h.spellCooldowns[id]! - dt;
      if (left <= 1e-9) delete h.spellCooldowns[id];
      else h.spellCooldowns[id] = left;
    }
    const w = h.whirlwind;
    if (!w) {
      startPendingWhirlwind(e, events);
      continue;
    }
    if (!e.alive) {
      h.whirlwind = null;
      if (w.cooldownSeconds > 0) h.spellCooldowns[w.spellId] = w.cooldownSeconds;
      events.push({ type: 'whirlwindEnd', heroId: e.id, reason: 'death' });
      continue;
    }
    w.elapsed += dt;
    const total = Math.round(w.durationSeconds / w.pulseSeconds);
    while (w.pulses < total && w.elapsed + 1e-6 >= (w.pulses + 1) * w.pulseSeconds) {
      w.pulses += 1;
      const damage = w.snapshotAttackDamage * w.damageRatio;
      const hits: number[] = [];
      for (const o of entities) {
        if (o === e || !o.alive || o.hp <= 0 || areAllied(o.team, e.team) || o.destructible) continue;
        if (o.isBuilding && !getBuilding(o.unitId).targetable) continue;
        const reach = targetDistance(e.x, e.z, o) - (o.wall ? 0 : o.stats.radius);
        if (reach > w.radiusTiles) continue;
        // Tourbillon = degats PHYSIQUES (2026-11-05, G46) : il fige l'attaque
        // de base, donc la progression physique, jamais la magique.
        applyDamageToEntity(o, damage, 'physical');
        hits.push(o.id);
      }
      events.push({ type: 'whirlwindPulse', heroId: e.id, x: e.x, z: e.z, pulse: w.pulses, damage, hits, damageType: 'physical' });
    }
    if (w.pulses >= total) {
      h.whirlwind = null;
      if (w.cooldownSeconds > 0) h.spellCooldowns[w.spellId] = w.cooldownSeconds;
      events.push({ type: 'whirlwindEnd', heroId: e.id, reason: 'done' });
    }
    // Une demande recue pendant l'effet a ete refusee par les commandes
    // (channeling) ; par securite, rien ne demarre a ce pas.
    h.pendingWhirlwind = null;
  }
}

/** Demarre le Tourbillon demande pendant ce pas (voir heroWhirlwindSystem) :
 *  mana verifie au moment du lancement (sinon spellCancel `no-mana`, rien
 *  ne part), compte a rebours a 0 (premiere frappe a pulseSeconds). */
function startPendingWhirlwind(e: Entity, events: HeroEvent[]): void {
  const h = e.hero!;
  const spellId = h.pendingWhirlwind;
  if (spellId === null) return;
  h.pendingWhirlwind = null;
  if (!e.alive) return;
  const spell = h.spells.find((s) => s.id === spellId);
  const w = spell?.whirlwind;
  if (!spell || !w) return;
  if (h.mana < spell.manaCost) {
    events.push({ type: 'spellCancel', heroId: e.id, spellId: spell.id, reason: 'no-mana', refunded: 0 });
    return;
  }
  h.mana -= spell.manaCost;
  h.whirlwind = { spellId: spell.id, elapsed: 0, pulses: 0, snapshotAttackDamage: e.stats.damage, durationSeconds: w.durationSeconds, pulseSeconds: w.pulseSeconds, radiusTiles: w.radiusTiles, damageRatio: w.damageRatio, cooldownSeconds: spell.cooldownSeconds ?? 0 };
  e.pendingAttack = null;
  events.push({ type: 'spellStart', heroId: e.id, spellId: spell.id, targetId: e.id });
}

/** Annule l'incantation en cours : aucun effet, mana retenu rendu. */
function cancelSpell(e: Entity, reason: SpellCancelReason, events: HeroEvent[]): void {
  const h = e.hero!;
  const c = h.spellCast!;
  h.mana = Math.min(h.maxMana, h.mana + c.manaSpent);
  h.spellCast = null;
  e.cast = null;
  events.push({ type: 'spellCancel', heroId: e.id, spellId: c.spellId, reason, refunded: c.manaSpent });
}

/** Juste apres les commandes, AVANT abilitySystem (qui donnerait le soin) :
 *  une incantation dont l'ordre a change (tout ordre accepte en cree un
 *  nouveau, meme identique), dont le Heros est mort ou provoque, ou dont la
 *  cible est morte, est annulee. Provocation : l'ordre `cast` reste suspendu
 *  et l'incantation repart de zero a sa fin. */
export function interruptHeroSpells(entities: Entity[], events: HeroEvent[]): void {
  let byId: Map<number, Entity> | null = null;
  for (const e of entities) {
    const c = e.hero?.spellCast;
    if (!c) continue;
    let reason: SpellCancelReason | null = null;
    if (!e.alive) reason = 'death';
    else if (e.order !== c.order) reason = 'order';
    else if (e.tauntSourceId !== null) reason = 'taunt';
    else {
      byId ??= new Map(entities.map((o) => [o.id, o]));
      if (!byId.get(c.targetId)?.alive) reason = 'target';
    }
    if (reason) cancelSpell(e, reason, events);
  }
}

/** Apres abilitySystem : fin des incantations du pas (soin donne, ou perdu
 *  hors de portee : mana rendu ; le Heros passe en Garde), puis regeneration
 *  du mana des Heros vivants (temps de simulation : figee en pause). */
export function heroSpellSystem(entities: Entity[], abilityEvents: readonly AbilityEvent[], dt: number, events: HeroEvent[]): void {
  for (const e of entities) {
    const h = e.hero;
    if (!h || !e.alive) continue;
    const c = h.spellCast;
    if (c && e.cast === null) {
      const lost = abilityEvents.some((a) => a.type === 'heal-lost' && a.entityId === e.id);
      if (lost) cancelSpell(e, 'out-of-range', events);
      else {
        const done = abilityEvents.find((a) => a.type === 'heal' && a.entityId === e.id);
        h.spellCast = null;
        events.push({ type: 'spellEnd', heroId: e.id, spellId: c.spellId, targetId: c.targetId, healed: done?.type === 'heal' ? done.healed : 0 });
      }
      e.order = { type: 'guard' };
    }
    h.mana = Math.min(h.maxMana, h.mana + h.manaRegen * dt);
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
      // Objet destructible (baril) : pas d'XP.
      if (dead.destructible !== null || !h.alive || h.team === dead.team || Math.hypot(h.x - dead.x, h.z - dead.z) > HERO_XP_RANGE) continue;
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
    h.level++;
    // Niveau d'unite (Entity.level) : copie de la progression du Heros.
    e.level = h.level;
    refreshHeroStats(e, 'add');
    events.push({ type: 'levelUp', heroId: e.id, level: h.level });
  }
}

/**
 * Stats FINALES du Heros (2026-11-02, equipement) : fiche de son niveau +
 * bonus d'equipement resolus (Entity.hero.equipment), recalculees d'un bloc
 * — jamais un bonus ajoute par-dessus le precedent, donc rien ne se cumule
 * en equipant, remplacant ou retirant. PV et mana actuels :
 *  - `add` (montee de niveau) : augmentes du meme ecart que le maximum ;
 *  - `ratio` (equipement) : meme proportion du maximum, pour qu'equiper puis
 *    retirer un objet ne soigne jamais.
 * Une baisse du maximum ramene toujours la valeur actuelle sous ce maximum.
 */
export function refreshHeroStats(e: Entity, rule: 'add' | 'ratio'): void {
  const h = e.hero!;
  const base = heroStatsForLevel(h.level);
  const b = h.equipment;
  const prevMaxHp = e.stats.maxHp;
  const maxHp = base.maxHp + b.maxHp;
  // Vitesse : niveau + equipement, puis le multiplicateur global (data/units.ts).
  // Degats : base + bonus PHYSIQUE seulement (b.magicDamage ne touche ni
  // l'attaque de base ni le Tourbillon, 2026-11-05).
  e.stats = { ...e.stats, maxHp, damage: base.damage + b.damage, moveSpeed: (base.moveSpeed + b.moveSpeed) * UNIT_MOVE_SPEED_MULTIPLIER, attackCooldown: base.attackCooldown / (1 + b.attackSpeed) };
  e.hp = adjustCurrent(e.hp, prevMaxHp, maxHp, rule);
  const prevMaxMana = h.maxMana;
  h.maxMana = h.baseMaxMana + b.maxMana;
  h.mana = adjustCurrent(h.mana, prevMaxMana, h.maxMana, rule);
  h.manaRegen = h.baseManaRegen + b.manaRegen;
  e.onHit = b.fireDamage > 0 ? { fireDamage: b.fireDamage } : null;
}

function adjustCurrent(current: number, prevMax: number, max: number, rule: 'add' | 'ratio'): number {
  if (max === prevMax) return Math.min(current, max);
  if (rule === 'add') return max > prevMax ? current + (max - prevMax) : Math.min(current, max);
  return prevMax > 0 ? Math.min(max, (current * max) / prevMax) : max;
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
    // Mana plein au retour, comme les PV. PROVISOIRE.
    h.mana = h.maxMana;
    h.spellCast = null;
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
