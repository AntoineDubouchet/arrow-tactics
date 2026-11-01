import { obstacleBounds, type ObstacleDef } from '../../config/constants';
import { populationOfEntities, unitPopulationCost } from '../../data/population';
import { forwardDir, type Entity, type Team } from '../entity';
import { segmentIntersectsBox } from '../geometry';

/**
 * Production d'unites par les batiments de production (Caserne, Camp
 * d'archerie — voir data/buildings.ts, BuildingDef.production). Chaque
 * batiment recoit un quota pour la manche au moment de son apparition
 * (World.spawnBuilding, debut de bataille) ; ce systeme le consomme des que
 * la population et les cases libres le permettent, sans jamais le
 * renouveler. Un quota non produit a la fin de la bataille est perdu (le
 * batiment est recree a la bataille suivante avec un quota neuf).
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
}

/**
 * Pour chaque batiment vivant avec un quota restant : limite le lot aux
 * places de population et aux cases libres autour de son emprise, puis
 * pousse un evenement par unite. Un lot partiel est produit ; le reste du
 * quota attend et retente aux ticks suivants. Population et cases sont
 * decomptees au fil du tick : plusieurs batiments ne depassent jamais
 * ensemble le maximum ni ne choisissent la meme case (ordre deterministe,
 * celui des entites).
 */
/** Production temps reel : avance les commandes (Entity.productionOrder) ;
 *  une commande terminee rejoint productionQueue, que buildingProductionSystem
 *  fait apparaitre au meme pas (place de population et case libre requises).
 *  Un chantier ne produit pas ; un batiment mort perd sa commande. */
export function tickProductionOrders(entities: Entity[], dt: number): void {
  for (const e of entities) {
    const order = e.productionOrder;
    if (!order) continue;
    if (!e.alive) {
      e.productionOrder = null;
      continue;
    }
    if (e.construction) continue;
    order.remaining -= dt;
    if (order.remaining > 1e-9) continue;
    e.productionQueue.push(order.unitId);
    e.productionOrder = null;
  }
}

export function buildingProductionSystem(entities: Entity[], obstacles: ObstacleDef[]): ProductionSpawnEvent[] {
  const events: ProductionSpawnEvent[] = [];
  const population = populationOfEntities(entities);
  let playerRoom = population.max - population.used;
  const reserved: { x: number; z: number }[] = [];

  for (const e of entities) {
    // Chantier : aucune production tant qu'il n'est pas construit.
    if (!e.alive || e.productionQueue.length === 0 || e.construction) continue;

    // File dans l'ordre (Caserne Niv. 2 : Piquier puis Fantassin) : on
    // s'arrete a la premiere unite sans place de population, sans la doubler.
    const costOf = (unitId: string): number => (e.team === 'player' ? unitPopulationCost(unitId) : 0);
    e.productionWaitingForPopulation = costOf(e.productionQueue[0]!) > Math.max(playerRoom, 0);
    if (e.productionWaitingForPopulation) continue;

    const cells = findFreeAdjacentCells(e, entities, obstacles, reserved, e.productionQueue.length);
    let produced = 0;
    for (const cell of cells) {
      const unitId = e.productionQueue[produced]!;
      const unitCost = costOf(unitId);
      if (unitCost > Math.max(playerRoom, 0)) break;
      events.push({ entityId: e.id, unitId, team: e.team, x: cell.x, z: cell.z });
      reserved.push(cell);
      playerRoom -= unitCost;
      produced++;
    }
    e.productionQueue.splice(0, produced);
  }

  return events;
}

/**
 * Anneau de cases entourant l'emprise du batiment (emprise agrandie d'une
 * case dans chaque direction, emprise elle-meme exclue), pour n'importe
 * quelle taille d'emprise. Filtre : aucun obstacle COLLIDABLE dessus
 * (rocher, arbre, autre batiment, case "vide" hors de la map — voir
 * World.setMap), aucune entite VIVANTE sur la case, aucune case deja
 * reservee ce tick. Ordre DETERMINISTE : cases les plus "avancees" vers le
 * champ de bataille d'abord, puis x croissant, puis z croissant.
 *
 * Renvoie JUSQU'A `count` cases distinctes, moins si l'anneau manque de
 * place.
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

  const minTileX = Math.floor(bounds.minX) - 1;
  const maxTileX = Math.ceil(bounds.maxX);
  const minTileZ = Math.floor(bounds.minZ) - 1;
  const maxTileZ = Math.ceil(bounds.maxZ);

  const candidates: { x: number; z: number }[] = [];
  for (let tz = minTileZ; tz <= maxTileZ; tz++) {
    for (let tx = minTileX; tx <= maxTileX; tx++) {
      const cx = tx + 0.5;
      const cz = tz + 0.5;
      // Exclut les cases a l'INTERIEUR de l'emprise elle-meme.
      if (cx > bounds.minX && cx < bounds.maxX && cz > bounds.minZ && cz < bounds.maxZ) continue;
      candidates.push({ x: cx, z: cz });
    }
  }

  const dir = forwardDir(building.team);
  candidates.sort((a, b) => {
    const scoreA = a.z * dir;
    const scoreB = b.z * dir;
    if (scoreA !== scoreB) return scoreB - scoreA; // plus "avance" vers le champ de bataille d'abord
    if (a.x !== b.x) return a.x - b.x;
    return a.z - b.z;
  });

  const chosen: { x: number; z: number }[] = [];
  for (const c of candidates) {
    if (chosen.length >= count) break;
    if (reserved.some((r) => sameCell(r, c))) continue;
    if (acrossCliff(bounds, c, obstacles)) continue;
    if (isCellFree(c.x, c.z, entities, obstacles)) chosen.push(c);
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
