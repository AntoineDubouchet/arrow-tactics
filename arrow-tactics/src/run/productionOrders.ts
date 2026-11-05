import type { ResourceKind } from '../config/resourceNodes';
import { buildingUpgradeScope } from '../data/buildings';
import { BUILDING_UPGRADE_SECONDS, producibleUnits, unitProductionSeconds } from '../data/production';
import { getTechnology } from '../data/technologies';
import { getUnit } from '../data/units';
import type { Entity, ProductionOrder } from '../sim/entity';
import type { ProductionUpgradeEvent } from '../sim/systems/buildingProduction';
import type { World } from '../sim/world';
import { effectiveBallistaMaxHp } from './ballistaUpgradeEffects';
import { effectiveBuildingAttackDamage, effectiveBuildingMaxHp } from './buildingUpgradeEffects';
import { applyBuildingUpgrade, buildingUpgradeGoldCost, canAffordBuildingUpgrade } from './buildingUpgrades';
import { computePlayerUnitStats } from './playerUnitStats';
import { ballistaUpgradeGoldCost, canBallistaLevelUp, grantRunUpgradeLevel, runUpgradeLevel, type PlayerProgression } from './runUpgrades';
import { roundGold, type OwnedBuilding, type RunState } from './runState';
import { canAffordTechnology, isTechnologyAcquired, isTechnologyAvailable } from './technologies';

/**
 * COMMANDES de la file temps reel des batiments du joueur (2026-11-05,
 * Pass 2) : SOURCE UNIQUE du paiement, de la mise en file, de l'annulation
 * et de l'application a la fin, pour les quatre sortes de commandes qui
 * partagent la MEME file (Entity.productionOrders, World.queueProduction,
 * sim/systems/buildingProduction.ts) :
 *  - unite (Caserne, Camp d'archerie, Sanctuaire, Eglise, Ecurie, Auberge) ;
 *  - amelioration d'un batiment (Mine, Tour : exemplaire ; Caserne,
 *    Camp d'archerie, Sanctuaire, Ecurie : type, global a la run) ;
 *  - amelioration de la Baliste (depuis sa propre fiche) ;
 *  - recherche d'une technologie (Forge, Caserne : data/technologies.ts).
 * Tout est paye A LA COMMANDE (or de la run, stock pour une technologie) et
 * rendu a l'annulation ; une file perdue avec son batiment n'est JAMAIS
 * remboursee, mais une amelioration ou une technologie deja TERMINEE reste
 * acquise pour la run. Rien ne fige le jeu : chaque commande termine en temps
 * reel, l'orchestration (main.ts) relaie seulement World.productionUpgradeEvents
 * ici (completeOrders) et les unites sorties (World.productionSpawnEvents).
 * Pur de tout DOM : utilisable par les tests sans navigateur.
 */

/** Ce qu'une commande en file a coute (rendu a l'annulation). */
export interface OrderPayment {
  gold: number;
  wood: number;
  stone: number;
}

/** id de commande -> paiement. Vide a chaque nouveau monde (main.ts). */
export type OrderLedger = Map<number, OrderPayment>;

function pay(run: RunState, ledger: OrderLedger, orderId: number, cost: OrderPayment): void {
  run.gold = Math.max(0, roundGold(run.gold - cost.gold));
  run.resources.wood = Math.max(0, run.resources.wood - cost.wood);
  run.resources.stone = Math.max(0, run.resources.stone - cost.stone);
  ledger.set(orderId, cost);
}

const goldOnly = (gold: number): OrderPayment => ({ gold, wood: 0, stone: 0 });

// --- Mise en file -----------------------------------------------------------

/** Unite `unitId` a la file du batiment `entity` (de niveau effectif
 *  `level`) : autorisee par son roster, or suffisant, file non pleine. */
export function queueUnitOrder(run: RunState, world: World, ledger: OrderLedger, entity: Entity, level: number, unitId: string): number | null {
  if (!producibleUnits(entity.unitId, level).includes(unitId)) return null;
  const cost = getUnit(unitId).cost;
  if (run.gold < cost) return null;
  const orderId = world.queueProduction(entity.id, { kind: 'unit', unitId }, unitProductionSeconds(unitId));
  if (orderId === null) return null;
  pay(run, ledger, orderId, goldOnly(cost));
  return orderId;
}

/** Vrai si une amelioration du batiment `entity` est deja en file : sur lui
 *  (portee 'instance') ou sur n'importe quel exemplaire vivant de son type
 *  (portee 'run'). */
export function isBuildingUpgradePending(world: World, entity: Entity): boolean {
  const hasUpgrade = (e: Entity): boolean => e.productionOrders.some((o) => o.kind === 'upgrade');
  if (buildingUpgradeScope(entity.unitId) !== 'run') return hasUpgrade(entity);
  return world.entities.some((e) => e.alive && e.team === entity.team && e.unitId === entity.unitId && hasUpgrade(e));
}

/** Amelioration du batiment `entity` (niveau effectif `level`) a sa file :
 *  payee maintenant, appliquee a sa fin (completeOrders). Une seule a la
 *  fois (exemplaire ou type selon la portee). */
export function queueBuildingUpgradeOrder(run: RunState, world: World, ledger: OrderLedger, entity: Entity, level: number): number | null {
  if (!canAffordBuildingUpgrade(entity.unitId, level, run.gold) || isBuildingUpgradePending(world, entity)) return null;
  const cost = buildingUpgradeGoldCost(entity.unitId, level);
  const orderId = world.queueProduction(entity.id, { kind: 'upgrade' }, BUILDING_UPGRADE_SECONDS);
  if (orderId === null) return null;
  pay(run, ledger, orderId, goldOnly(cost));
  return orderId;
}

/** Vrai si la Baliste a deja son amelioration en file. */
export function isBallistaUpgradePending(ballista: Entity): boolean {
  return ballista.productionOrders.some((o) => o.kind === 'upgrade');
}

/** Niveau suivant de la Baliste (data/ballistaUpgrade.ts) a la file de la
 *  Baliste elle-meme : prix du niveau courant (run/runUpgrades.ts), duree
 *  BUILDING_UPGRADE_SECONDS, un seul a la fois. */
export function queueBallistaUpgradeOrder(run: RunState, world: World, ledger: OrderLedger, ballista: Entity): number | null {
  const level = runUpgradeLevel(run.upgrades, 'ballista');
  if (!canBallistaLevelUp(level) || isBallistaUpgradePending(ballista)) return null;
  const cost = ballistaUpgradeGoldCost(level);
  if (run.gold < cost) return null;
  const orderId = world.queueProduction(ballista.id, { kind: 'upgrade' }, BUILDING_UPGRADE_SECONDS);
  if (orderId === null) return null;
  pay(run, ledger, orderId, goldOnly(cost));
  return orderId;
}

/** Vrai si la technologie `techId` est en recherche quelque part (n'importe
 *  quel batiment vivant du joueur). */
/** Avancement d'un ordre de la file (unite, recherche, amelioration : meme
 *  file, meme calcul ; 2026-11-05, G47). */
export function orderProgress(order: ProductionOrder): { progress: number; remaining: number } {
  return { progress: order.total > 0 ? 1 - order.remaining / order.total : 1, remaining: order.remaining };
}

export function isTechnologyPending(world: World, techId: string): boolean {
  return world.entities.some((e) => e.alive && e.team === 'player' && e.productionOrders.some((o) => o.kind === 'research' && o.techId === techId));
}

/** Recherche de `techId` a la file du site `entity` (niveau effectif
 *  `siteLevel`) : site de la technologie, pas encore acquise ni en
 *  recherche, niveau du site suffisant, or ET stock suffisants. */
export function queueTechnologyOrder(run: RunState, world: World, ledger: OrderLedger, entity: Entity, siteLevel: number, techId: string): number | null {
  const def = getTechnology(techId);
  if (def.site !== entity.unitId || !isTechnologyAvailable(run.upgrades, techId, siteLevel) || isTechnologyPending(world, techId) || !canAffordTechnology(run, def)) return null;
  const orderId = world.queueProduction(entity.id, { kind: 'research', techId }, def.seconds);
  if (orderId === null) return null;
  const res = def.resourceCost as Partial<Record<ResourceKind, number>>;
  pay(run, ledger, orderId, { gold: def.goldCost, wood: res.wood ?? 0, stone: res.stone ?? 0 });
  return orderId;
}

// --- Annulation -------------------------------------------------------------

/** Retire la commande `orderId` de la file du batiment `entityId` et rend
 *  ce qu'elle avait coute. Faux si elle n'y est plus. */
export function cancelOrder(run: RunState, world: World, ledger: OrderLedger, entityId: number, orderId: number): boolean {
  if (!world.cancelProduction(entityId, orderId)) return false;
  const paid = ledger.get(orderId);
  ledger.delete(orderId);
  if (paid) {
    run.gold = roundGold(run.gold + paid.gold);
    run.resources.wood += paid.wood;
    run.resources.stone += paid.stone;
  }
  return true;
}

// --- Fin de commande --------------------------------------------------------

export type CompletedOrder =
  | { kind: 'buildingUpgrade'; buildingId: string; scope: 'instance' | 'run'; level: number; entityId: number }
  | { kind: 'ballistaUpgrade'; level: number }
  | { kind: 'research'; techId: string };

/**
 * Applique les ameliorations et recherches TERMINEES pendant ce pas
 * (World.productionUpgradeEvents), deja payees :
 *  - Baliste (`ballistaEntityId`) : niveau de run 'ballista' + 1, PV max
 *    reappliques a son entite ;
 *  - batiment possede (`ownedOf`) : niveau de l'exemplaire ou du type
 *    (run/buildingUpgrades.ts), PV max et degats reappliques a l'exemplaire,
 *    ou a tous les exemplaires vivants du type ;
 *  - technologie : acquise (niveau 1).
 * Puis, si la progression des unites a change (technologie ou niveau de
 * type), stats de TOUTES les unites presentes recalculees (retroactif,
 * refreshPlayerUnitStats). Renvoie ce qui a ete applique (annonces).
 */
export function completeOrders(
  run: RunState,
  progress: PlayerProgression,
  world: World,
  ledger: OrderLedger,
  events: readonly ProductionUpgradeEvent[],
  ballistaEntityId: number | null,
  ownedOf: (entityId: number) => OwnedBuilding | undefined,
): CompletedOrder[] {
  const completed: CompletedOrder[] = [];
  let unitsChanged = false;
  for (const event of events) {
    ledger.delete(event.orderId);
    const entity = world.getById(event.entityId);
    if (!entity) continue;
    if (event.kind === 'research') {
      if (isTechnologyAcquired(run.upgrades, event.techId)) continue;
      grantRunUpgradeLevel(run.upgrades, event.techId);
      completed.push({ kind: 'research', techId: event.techId });
      unitsChanged = true;
      continue;
    }
    if (event.entityId === ballistaEntityId) {
      const level = grantRunUpgradeLevel(run.upgrades, 'ballista');
      world.applyBuildingStats(entity, effectiveBallistaMaxHp(run.upgrades));
      completed.push({ kind: 'ballistaUpgrade', level });
      continue;
    }
    const buildingId = entity.unitId;
    const scope = buildingUpgradeScope(buildingId);
    const level = applyBuildingUpgrade(run.upgrades, ownedOf(event.entityId) ?? null, buildingId);
    if (level === null) continue;
    const targets = scope === 'run' ? world.entities.filter((e) => e.alive && e.team === entity.team && e.unitId === buildingId) : [entity];
    for (const e of targets) world.applyBuildingStats(e, effectiveBuildingMaxHp(buildingId, level), effectiveBuildingAttackDamage(buildingId, level));
    if (scope === 'run') unitsChanged = true;
    completed.push({ kind: 'buildingUpgrade', buildingId, scope, level, entityId: event.entityId });
  }
  if (unitsChanged) refreshPlayerUnitStats(world, progress);
  return completed;
}

/** Stats effectives de TOUTES les unites vivantes du joueur recalculees
 *  (run/playerUnitStats.ts) et reappliquees par la simulation
 *  (World.applyUnitStats : PV a la meme fraction). Jamais le Heros. */
export function refreshPlayerUnitStats(world: World, progress: PlayerProgression): void {
  for (const e of world.entities) {
    if (!e.alive || e.team !== 'player' || e.isBuilding || e.hero) continue;
    const s = computePlayerUnitStats(e.unitId, progress);
    world.applyUnitStats(e, s.statOverrides, s.abilityDamageBonus, s.tauntShieldBonus);
  }
}
