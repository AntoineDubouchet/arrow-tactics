import { HP_PER_PIP } from '../config/constants';
import { getEnemyWaveUpgradeDef } from '../data/enemyWaveUpgrades';
import { getUnit, type UnitStats } from '../data/units';

/**
 * Niveau de renforcement applique aux unites ENNEMIES (voir
 * data/enemyWaveUpgrades.ts) — un mecanisme SEPARE de la progression du
 * joueur, purement fonction du numero de vague : vague 1 = niveau 0, vagues
 * 2-3 = niveau 1, vagues 4-5 = niveau 2, etc., sans plafond.
 */
export function enemyUpgradeLevelForWave(waveNumber: number): number {
  return Math.max(0, Math.floor(waveNumber / 2));
}

/** Niveau effectivement applique a une unite ennemie apparue en vague
 *  `waveNumber`, ou null si son type n'a pas de renforcement. */
export function enemyUnitUpgradeLevel(unitId: string, waveNumber: number): number | null {
  return getEnemyWaveUpgradeDef(unitId) ? enemyUpgradeLevelForWave(waveNumber) : null;
}

export interface EnemyUnitUpgradeEffects {
  statOverrides: Partial<UnitStats>;
  abilityDamageBonus: number;
}

/** Stats d'une unite ENNEMIE avec le renforcement de sa vague : +1 PV par
 *  niveau, +1 attaque tous les 3 niveaux (bareme inchange par les refontes
 *  du joueur). Type sans renforcement : statOverrides vide. Ne mute JAMAIS
 *  `UNITS` : patch frais a chaque appel. */
export function computeEnemyUnitUpgradeEffects(unitId: string, waveNumber: number): EnemyUnitUpgradeEffects {
  const def = getEnemyWaveUpgradeDef(unitId);
  if (!def) return { statOverrides: {}, abilityDamageBonus: 0 };
  const level = enemyUpgradeLevelForWave(waveNumber);
  const base = getUnit(unitId).stats;
  const attackBonusInternal = Math.floor(level / def.attackEveryLevels) * HP_PER_PIP;

  const statOverrides: Partial<UnitStats> = { maxHp: base.maxHp + def.hpPerLevel * level * HP_PER_PIP };
  let abilityDamageBonus = 0;
  if (attackBonusInternal > 0) {
    if (def.attackTarget === 'stats') statOverrides.damage = base.damage + attackBonusInternal;
    else abilityDamageBonus = attackBonusInternal;
  }
  return { statOverrides, abilityDamageBonus };
}
