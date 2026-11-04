import { obstacleBounds, type ObstacleDef } from '../../config/constants';
import { populationOfEntities, unitPopulationCost } from '../../data/population';
import type { Entity, Team } from '../entity';
import { segmentIntersectsBox } from '../geometry';

/**
 * Production d'unites par les batiments producteurs (Caserne, Auberge,
 * Sanctuaire... — voir data/buildings.ts, BuildingDef.recruitmentUnlock et
 * data/production.ts). Une seule regle (2026-11-04) : la file temps reel
 * (Entity.productionOrders), payee par le joueur a la commande ; une unite
 * terminee attend dans Entity.productionQueue qu'une place de population et
 * une case libre existent, puis apparait. Aucun quota gratuit a l'apparition
 * du batiment (ancien modele « par manche », retire).
 *
 * Systeme SIM PUR : decide QUAND et OU une unite apparait, jamais QUELLES
 * STATS elle recoit. L'appelant (main.ts) consomme
 * World.productionSpawnEvents chaque tick et appelle World.spawn avec les
 * stats effectives.
 */
export interface ProductionSpawnEvent {
  /** Id du batiment producteur. */
  entityId: number;
  unitId: string;
  team: Team;
  x: number;
  z: number;
  /** Point de ralliement du batiment au moment de la sortie (Entity.rally) :
   *  l'unite y marche des son apparition. */
  rally: { x: number; z: number } | null;
}

/**
 * Pour chaque batiment vivant avec des unites terminees en attente : limite
 * le lot aux places de population et aux cases libres autour de son emprise,
 * puis pousse un evenement par unite. Un lot partiel est produit ; le reste
 * attend et retente aux ticks suivants. Population et cases sont decomptees
 * au fil du tick : plusieurs batiments ne depassent jamais ensemble le
 * maximum ni ne choisissent la meme case (ordre deterministe, celui des
 * entites).
 */
/** Amelioration d'un batiment terminee dans sa file de production
 *  (World.productionUpgradeEvents) : l'orchestration applique le niveau. */
export interface ProductionUpgradeEvent {
  entityId: number;
  orderId: number;
}

/** Production temps reel : avance la PREMIERE commande de chaque file
 *  (Entity.productionOrders, ordre des clics). Une unite terminee rejoint
 *  productionQueue, que buildingProductionSystem fait apparaitre au meme pas
 *  (place de population et case libre requises) ; une amelioration terminee
 *  est renvoyee. Un chantier ne produit pas ; un batiment mort perd sa file. */
export function tickProductionOrders(entities: Entity[], dt: number): ProductionUpgradeEvent[] {
  const upgrades: ProductionUpgradeEvent[] = [];
  for (const e of entities) {
    const order = e.productionOrders[0];
    if (!order) continue;
    if (!e.alive) {
      e.productionOrders = [];
      continue;
    }
    if (e.construction) continue;
    order.remaining -= dt;
    if (order.remaining > 1e-9) continue;
    e.productionOrders.shift();
    if (order.kind === 'unit') e.productionQueue.push(order.unitId);
    else upgrades.push({ entityId: e.id, orderId: order.id });
  }
  return upgrades;
}

export function buildingProductionSystem(entities: Entity[], obstacles: ObstacleDef[]): ProductionSpawnEvent[] {
  const events: ProductionSpawnEvent[] = [];
  const population = populationOfEntities(entities);
  let playerRoom = population.max - population.used;
  const reserved: { x: number; z: number }[] = [];

  for (const e of entities) {
    // Chantier : aucune production tant qu'il n'est pas construit.
    if (!e.alive || e.productionQueue.length === 0 || e.construction) continue;

    // Unites terminees dans l'ordre : on s'arrete a la premiere sans place de
    // population, sans la doubler.
    const costOf = (unitId: string): number => (e.team === 'player' ? unitPopulationCost(unitId) : 0);
    e.productionWaitingForPopulation = costOf(e.productionQueue[0]!) > Math.max(playerRoom, 0);
    if (e.productionWaitingForPopulation) continue;

    const cells = findFreeAdjacentCells(e, entities, obstacles, reserved, e.productionQueue.length);
    let produced = 0;
    for (const cell of cells) {
      const unitId = e.productionQueue[produced]!;
      const unitCost = costOf(unitId);
      if (unitCost > Math.max(playerRoom, 0)) break;
      events.push({ entityId: e.id, unitId, team: e.team, x: cell.x, z: cell.z, rally: e.rally ? { ...e.rally } : null });
      reserved.push(cell);
      playerRoom -= unitCost;
      produced++;
    }
    e.productionQueue.splice(0, produced);
  }

  return events;
}

/**
 * Cases de sortie autour de l'emprise du batiment (deux anneaux, emprise
 * exclue), pour n'importe quelle taille d'emprise. Filtre : aucun obstacle
 * COLLIDABLE dessus (rocher, arbre, autre batiment, case "vide" hors de la
 * map — voir World.setMap), aucune entite VIVANTE sur la case, aucune case
 * deja reservee ce tick.
 *
 * Ordre DETERMINISTE (2026-11-02, sortie de production) : DEVANT le
 * batiment d'abord (face +Z du modele tournee par son `rotationY`), puis
 * sur les cotes, DERRIERE en dernier recours ; dans chaque groupe, l'anneau
 * proche avant le second, la case la plus proche du milieu de la facade
 * avant les autres, puis x et z croissants.
 *
 * Renvoie JUSQU'A `count` cases distinctes, moins si la place manque.
 */
function findFreeAdjacentCells(
  building: Entity,
  entities: Entity[],
  obstacles: ObstacleDef[],
  reserved: { x: number; z: number }[],
  count: number,
): { x: number; z: number }[] {
  const footprint = building.footprintObstacle;
  if (!footprint) return [];
  const bounds = obstacleBounds(footprint);

  const minTileX = Math.floor(bounds.minX) - 2;
  const maxTileX = Math.ceil(bounds.maxX) + 1;
  const minTileZ = Math.floor(bounds.minZ) - 2;
  const maxTileZ = Math.ceil(bounds.maxZ) + 1;
  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerZ = (bounds.minZ + bounds.maxZ) / 2;
  // Devant : +Z du modele tourne par rotationY (sans rotation : vers +Z).
  const yaw = footprint.rotationY ?? 0;
  const fx = Math.sin(yaw);
  const fz = Math.cos(yaw);
  const halfDepth = Math.abs(fx) * (bounds.maxX - bounds.minX) / 2 + Math.abs(fz) * (bounds.maxZ - bounds.minZ) / 2;
  const doorX = centerX + fx * (halfDepth + 0.5);
  const doorZ = centerZ + fz * (halfDepth + 0.5);

  const candidates: { x: number; z: number; side: number; ring: number; door: number }[] = [];
  for (let tz = minTileZ; tz <= maxTileZ; tz++) {
    for (let tx = minTileX; tx <= maxTileX; tx++) {
      const cx = tx + 0.5;
      const cz = tz + 0.5;
      // Exclut les cases a l'INTERIEUR de l'emprise elle-meme.
      if (cx > bounds.minX && cx < bounds.maxX && cz > bounds.minZ && cz < bounds.maxZ) continue;
      const ring = Math.max(cx < bounds.minX ? bounds.minX - cx : cx > bounds.maxX ? cx - bounds.maxX : 0, cz < bounds.minZ ? bounds.minZ - cz : cz > bounds.maxZ ? cz - bounds.maxZ : 0) < 1 ? 1 : 2;
      const dx = cx - centerX;
      const dz = cz - centerZ;
      const along = (dx * fx + dz * fz) / Math.max(Math.hypot(dx, dz), 1e-6);
      const side = along > 0.35 ? 0 : along < -0.35 ? 2 : 1;
      candidates.push({ x: cx, z: cz, side, ring, door: Math.hypot(cx - doorX, cz - doorZ) });
    }
  }

  candidates.sort((a, b) => a.side - b.side || a.ring - b.ring || a.door - b.door || a.x - b.x || a.z - b.z);

  const chosen: { x: number; z: number }[] = [];
  for (const c of candidates) {
    if (chosen.length >= count) break;
    if (reserved.some((r) => sameCell(r, c))) continue;
    if (acrossCliff(bounds, c, obstacles)) continue;
    if (isCellFree(c.x, c.z, entities, obstacles)) chosen.push({ x: c.x, z: c.z });
  }
  return chosen;
}

/** Relief : vrai si une falaise (ObstacleDef.terrainCliff) separe la case
 *  candidate de la case de l'emprise la plus proche — une unite produite
 *  n'apparait jamais au pied ou en haut d'une falaise collee au batiment. */
function acrossCliff(bounds: { minX: number; maxX: number; minZ: number; maxZ: number }, c: { x: number; z: number }, obstacles: ObstacleDef[]): boolean {
  const fx = Math.min(Math.max(c.x, bounds.minX + 0.5), bounds.maxX - 0.5);
  const fz = Math.min(Math.max(c.z, bounds.minZ + 0.5), bounds.maxZ - 0.5);
  return obstacles.some((o) => o.terrainCliff === true && segmentIntersectsBox(fx, fz, c.x - fx, c.z - fz, obstacleBounds(o)) !== null);
}

function sameCell(a: { x: number; z: number }, b: { x: number; z: number }): boolean {
  return Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.z - b.z) < 1e-6;
}

function isCellFree(cx: number, cz: number, entities: Entity[], obstacles: ObstacleDef[]): boolean {
  // Obstacles de World : tous bloquants (decors exclus par World.setMap).
  for (const o of obstacles) {
    const b = obstacleBounds(o);
    if (cx > b.minX && cx < b.maxX && cz > b.minZ && cz < b.maxZ) return false;
  }
  for (const e of entities) {
    if (!e.alive) continue;
    const tileX = Math.floor(e.x) + 0.5;
    const tileZ = Math.floor(e.z) + 0.5;
    if (Math.abs(tileX - cx) < 1e-6 && Math.abs(tileZ - cz) < 1e-6) return false;
  }
  return true;
}
