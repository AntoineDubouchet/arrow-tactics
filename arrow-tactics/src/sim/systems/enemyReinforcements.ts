import { isCollidableObstacle, obstacleBounds, type ObstacleDef } from '../../config/constants';
import type { Entity } from '../entity';

/**
 * Renforts ennemis (mini-vagues du Mode survie, voir run/enemyWaveGroups.ts).
 * Systeme SIM PUR : decide QUAND un groupe arrive (ticks de simulation) et
 * OU (cases libres de la zone de spawn), jamais QUELLES STATS il recoit —
 * main.ts consomme World.enemyReinforcementSpawns et appelle World.spawn
 * avec les stats de la vague, comme pour la production des batiments.
 */

/** Unite prevue et sa position de formation souhaitee (centre de case). */
export interface EnemyReinforcementUnit {
  unitId: string;
  x: number;
  z: number;
}

/** Rectangle (monde) dans lequel les groupes peuvent apparaitre. */
export interface EnemySpawnZone {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/** Plan d'une vague, deja resolu par l'appelant (aucun calcul de gameplay ici). */
export interface EnemyReinforcementPlan {
  groups: EnemyReinforcementUnit[][];
  /** Ticks entre deux arrivees (le premier groupe arrive au demarrage). */
  delayTicks: number;
  /** Ticks sans aucun ennemi vivant au bout desquels le groupe suivant
   *  arrive sans attendre `delayTicks`. */
  emptyFieldTicks: number;
  zone: EnemySpawnZone;
}

/** Etat explicite des renforts de la vague en cours. */
export interface EnemyReinforcementState {
  plan: EnemyReinforcementPlan;
  /** Index du prochain groupe a faire apparaitre (= groupes deja apparus). */
  nextGroupIndex: number;
  /** Tick auquel le prochain groupe arrive au plus tard. */
  nextSpawnTick: number;
  /** Premier tick sans ennemi vivant alors que des groupes restent, null
   *  si des ennemis sont en vie. */
  emptySinceTick: number | null;
}

export interface EnemyReinforcementSpawn {
  groupIndex: number;
  unitId: string;
  x: number;
  z: number;
}

export function createEnemyReinforcementState(plan: EnemyReinforcementPlan, tick: number): EnemyReinforcementState {
  return { plan, nextGroupIndex: 0, nextSpawnTick: tick, emptySinceTick: null };
}

export function pendingEnemyGroupCount(state: EnemyReinforcementState): number {
  return state.plan.groups.length - state.nextGroupIndex;
}

/**
 * Fait apparaitre le prochain groupe s'il est du : delai normal atteint OU
 * `emptyFieldTicks` sans aucun ennemi vivant. Si la zone n'a pas assez de
 * cases libres pour tout le groupe, rien n'apparait et le groupe retente au
 * tick suivant. Renvoie les apparitions de ce tick (vide sinon).
 */
export function stepEnemyReinforcements(state: EnemyReinforcementState, tick: number, entities: Entity[], obstacles: ObstacleDef[]): EnemyReinforcementSpawn[] {
  if (pendingEnemyGroupCount(state) <= 0) return [];

  const enemyAlive = entities.some((e) => e.alive && e.team === 'enemy' && e.countsForDefeat);
  if (enemyAlive) state.emptySinceTick = null;
  else if (state.emptySinceTick === null) state.emptySinceTick = tick;

  const due = tick >= state.nextSpawnTick || (state.emptySinceTick !== null && tick - state.emptySinceTick >= state.plan.emptyFieldTicks);
  if (!due) return [];

  const group = state.plan.groups[state.nextGroupIndex]!;
  const cells = findGroupCells(group, state.plan.zone, entities, obstacles);
  if (!cells) return [];

  const groupIndex = state.nextGroupIndex;
  state.nextGroupIndex++;
  state.nextSpawnTick = tick + state.plan.delayTicks;
  state.emptySinceTick = null;
  return group.map((unit, i) => ({ groupIndex, unitId: unit.unitId, x: cells[i]!.x, z: cells[i]!.z }));
}

/**
 * Une case libre par unite du groupe, la plus proche de sa position de
 * formation : case de la zone, sans obstacle collidable (les trous et le
 * hors-carte sont des obstacles "vides", voir World.setMap), sans entite
 * vivante, et pas deja prise par une unite du meme groupe. Ordre stable :
 * distance a la position souhaitee, puis z, puis x. Null si la zone manque
 * de place pour tout le groupe.
 */
function findGroupCells(group: EnemyReinforcementUnit[], zone: EnemySpawnZone, entities: Entity[], obstacles: ObstacleDef[]): { x: number; z: number }[] | null {
  const minTileX = Math.ceil(zone.minX);
  const maxTileX = Math.floor(zone.maxX) - 1;
  const minTileZ = Math.ceil(zone.minZ);
  const maxTileZ = Math.floor(zone.maxZ) - 1;

  const blocked = new Set<string>();
  const key = (tx: number, tz: number): string => `${tx},${tz}`;
  for (const e of entities) if (e.alive) blocked.add(key(Math.floor(e.x), Math.floor(e.z)));
  for (const o of obstacles) {
    if (!isCollidableObstacle(o)) continue;
    const b = obstacleBounds(o);
    for (let tz = Math.max(minTileZ, Math.floor(b.minZ)); tz <= Math.min(maxTileZ, Math.ceil(b.maxZ) - 1); tz++) {
      for (let tx = Math.max(minTileX, Math.floor(b.minX)); tx <= Math.min(maxTileX, Math.ceil(b.maxX) - 1); tx++) {
        // Case bloquee si son centre est dans l'emprise (meme test que la production).
        const cx = tx + 0.5;
        const cz = tz + 0.5;
        if (cx > b.minX && cx < b.maxX && cz > b.minZ && cz < b.maxZ) blocked.add(key(tx, tz));
      }
    }
  }

  const free: { tx: number; tz: number }[] = [];
  for (let tz = minTileZ; tz <= maxTileZ; tz++) {
    for (let tx = minTileX; tx <= maxTileX; tx++) if (!blocked.has(key(tx, tz))) free.push({ tx, tz });
  }

  const cells: { x: number; z: number }[] = [];
  for (const unit of group) {
    const px = Math.floor(unit.x);
    const pz = Math.floor(unit.z);
    let best = -1;
    let bestScore = Infinity;
    for (let i = 0; i < free.length; i++) {
      const c = free[i]!;
      const score = (c.tx - px) ** 2 + (c.tz - pz) ** 2;
      // `free` est deja trie par z puis x : a score egal, la premiere gagne.
      if (score < bestScore) {
        best = i;
        bestScore = score;
      }
    }
    if (best < 0) return null;
    const cell = free.splice(best, 1)[0]!;
    cells.push({ x: cell.tx + 0.5, z: cell.tz + 0.5 });
  }
  return cells;
}
