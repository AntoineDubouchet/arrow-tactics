import {
  ENEMY_EMPTY_FIELD_SPAWN_SECONDS,
  ENEMY_GROUP_DELAY_BASE_SECONDS,
  ENEMY_GROUP_DELAY_LOG_FACTOR,
  ENEMY_GROUP_DELAY_MAX_SECONDS,
  ENEMY_GROUP_DELAY_MIN_SECONDS,
  ENEMY_GROUP_MAX_SIZE,
  SIM_HZ,
} from '../config/constants';
import type { EnemyWaveComposition } from './runState';

/**
 * Mini-vagues du Mode survie : decoupe d'une vague (composition inchangee,
 * computeEnemyWaveComposition) en groupes qui arrivent les uns apres les
 * autres pendant la bataille (sim/systems/enemyReinforcements.ts). Fonctions
 * pures et deterministes, sans aucun tirage.
 */

type EnemyType = keyof EnemyWaveComposition;

/** Poids de "puissance" d'un type, pour etaler les unites lourdes. */
const ENEMY_GROUP_WEIGHTS: Readonly<Record<EnemyType, number>> = { sentinel: 20, mage: 5, archer: 1.5, fantassin: 1 };

/** Ordre des unites DANS un groupe (meme ordre que la formation historique :
 *  layoutFormation range ensuite la melee devant et la distance derriere). */
const IN_GROUP_ORDER: readonly EnemyType[] = ['fantassin', 'archer', 'mage', 'sentinel'];

/** G = ceil(total / ENEMY_GROUP_MAX_SIZE) groupes, tailles a 1 pres, les plus
 *  grands d'abord : 6 -> [3, 3], 7 -> [4, 3], 14 -> [5, 5, 4]. */
export function enemyWaveGroupSizes(total: number): number[] {
  if (total <= 0) return [];
  const count = Math.ceil(total / ENEMY_GROUP_MAX_SIZE);
  const base = Math.floor(total / count);
  const extra = total % count;
  return Array.from({ length: count }, (_, g) => base + (g < extra ? 1 : 0));
}

/**
 * Repartit la composition dans les groupes (ids d'unite par groupe) :
 * 1. Sentinelles puis Mages, un par un, dans le groupe libre le moins charge
 *    (poids rapporte a la taille du groupe), puis le plus proche de sa
 *    position ideale dans la vague (floor((k + 0.5) * G / n)), puis le plus
 *    petit index : les unites lourdes s'etalent et evitent de se cumuler ;
 * 2. Archers au prorata de la place restante, par quotas cumules arrondis
 *    (les surplus s'etalent regulierement) ;
 * 3. Fantassins pour completer.
 */
export function splitEnemyWaveComposition(composition: EnemyWaveComposition): string[][] {
  const sizes = enemyWaveGroupSizes(IN_GROUP_ORDER.reduce((sum, type) => sum + composition[type], 0));
  const count = sizes.length;
  const groups = sizes.map(() => ({ fantassin: 0, archer: 0, mage: 0, sentinel: 0, used: 0, load: 0 }));
  const free = (g: number): number => sizes[g]! - groups[g]!.used;
  const put = (g: number, type: EnemyType): void => {
    const group = groups[g]!;
    group[type]++;
    group.used++;
    group.load += ENEMY_GROUP_WEIGHTS[type];
  };

  for (const type of ['sentinel', 'mage'] as const) {
    const n = composition[type];
    for (let k = 0; k < n; k++) {
      const ideal = Math.floor(((k + 0.5) * count) / n);
      let best = -1;
      let bestLoad = Infinity;
      let bestDistance = Infinity;
      for (let g = 0; g < count; g++) {
        if (free(g) <= 0) continue;
        const load = groups[g]!.load / sizes[g]!;
        const distance = Math.abs(g - ideal);
        if (load < bestLoad || (load === bestLoad && distance < bestDistance)) {
          best = g;
          bestLoad = load;
          bestDistance = distance;
        }
      }
      if (best >= 0) put(best, type);
    }
  }

  const capacity = groups.map((_, g) => free(g));
  const capacityTotal = capacity.reduce((sum, c) => sum + c, 0);
  let cumulative = 0;
  let placed = 0;
  for (let g = 0; g < count; g++) {
    cumulative += capacity[g]!;
    const target = capacityTotal > 0 ? Math.round((composition.archer * cumulative) / capacityTotal) : 0;
    const n = Math.min(capacity[g]!, target - placed);
    for (let i = 0; i < n; i++) put(g, 'archer');
    placed += n;
  }

  for (let g = 0; g < count; g++) while (free(g) > 0) put(g, 'fantassin');

  return groups.map((group) => IN_GROUP_ORDER.flatMap((type) => Array<string>(group[type]).fill(type)));
}

/** Delai entre deux arrivees : clamp(BASE - LOG_FACTOR * ln(G), MIN, MAX). */
export function enemyGroupDelaySeconds(groupCount: number): number {
  const raw = ENEMY_GROUP_DELAY_BASE_SECONDS - ENEMY_GROUP_DELAY_LOG_FACTOR * Math.log(Math.max(1, groupCount));
  return Math.min(ENEMY_GROUP_DELAY_MAX_SECONDS, Math.max(ENEMY_GROUP_DELAY_MIN_SECONDS, raw));
}

/** Meme delai, en ticks entiers de simulation. */
export function enemyGroupDelayTicks(groupCount: number): number {
  return Math.round(enemyGroupDelaySeconds(groupCount) * SIM_HZ);
}

/** Terrain vide tolere avant d'avancer le groupe suivant, en ticks. */
export function enemyEmptyFieldSpawnTicks(): number {
  return Math.round(ENEMY_EMPTY_FIELD_SPAWN_SECONDS * SIM_HZ);
}
