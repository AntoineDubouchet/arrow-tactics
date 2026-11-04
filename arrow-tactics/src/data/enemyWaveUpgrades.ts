/**
 * Renforcement des unites ENNEMIES par vague : l'ANCIEN bareme des
 * ameliorations d'unites (+1 PV par niveau, +1 attaque tous les 3 niveaux),
 * conserve tel quel et separe de la progression du joueur pour que les
 * refontes cote joueur (2026-11-05 : technologies et niveaux de producteurs,
 * voir run/playerUnitStats.ts) ne changent pas la difficulte des vagues.
 * Niveau = fonction du numero de vague (run/enemyWaveEffects.ts,
 * enemyUpgradeLevelForWave). La Sentinelle ennemie n'a jamais eu de
 * renforcement.
 */
export interface EnemyWaveUpgradeDef {
  hpPerLevel: number;
  attackEveryLevels: number;
  /** OU s'applique le bonus d'attaque : UnitStats.damage ('stats') ou
   *  Entity.abilityDamageBonus (Boule de feu du Mage, 'ability'). */
  attackTarget: 'stats' | 'ability';
}

export const ENEMY_WAVE_UPGRADES: Record<string, EnemyWaveUpgradeDef> = {
  fantassin: { hpPerLevel: 1, attackEveryLevels: 3, attackTarget: 'stats' },
  archer: { hpPerLevel: 1, attackEveryLevels: 3, attackTarget: 'stats' },
  mage: { hpPerLevel: 1, attackEveryLevels: 3, attackTarget: 'ability' },
};

export function getEnemyWaveUpgradeDef(unitId: string): EnemyWaveUpgradeDef | undefined {
  return ENEMY_WAVE_UPGRADES[unitId];
}
