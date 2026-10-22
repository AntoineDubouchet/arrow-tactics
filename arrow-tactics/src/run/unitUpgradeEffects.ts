import { HP_PER_PIP, SHIELD_PER_TAUNTED_ENEMY } from '../config/constants';
import { findAbility } from '../data/abilities';
import { getEnemyWaveUpgradeDef, getUnitUpgradeDef } from '../data/unitUpgrades';
import { getUnit, type UnitStats } from '../data/units';
import { runUpgradeLevel, type RunUpgradeLevels } from './runUpgrades';

/**
 * Stats et cout d'une unite JOUEUR selon son NIVEAU DE PRODUCTION (voir
 * data/unitUpgrades.ts) : fonctions PURES de (unitId, niveau), jamais du
 * niveau courant de la run. C'est ce qui garantit l'absence de
 * retroactivite : chaque unite possedee porte son propre niveau
 * (OwnedUnit.productionLevel), fixe a sa creation ; seule une NOUVELLE
 * unite lit le niveau courant (currentProductionLevel).
 *
 * Ne mute JAMAIS `UNITS`/`UnitDef` : tout renvoie un patch frais (une
 * ecriture sur les donnees globales contaminerait aussi les ennemis).
 */

/** Niveau auquel une NOUVELLE unite `unitId` est produite maintenant
 *  (boutique, Caserne) : le niveau de Forge achete dans la run, 0 sans
 *  amelioration. */
export function currentProductionLevel(levels: Readonly<RunUpgradeLevels>, unitId: string): number {
  return getUnitUpgradeDef(unitId) ? runUpgradeLevel(levels, unitId) : 0;
}

/** Cout Gold de production d'une unite produite au niveau `productionLevel` :
 *  base + niveau x goldCostPerLevel. SOURCE UNIQUE du prix affiche, du prix
 *  facture et de la revente avec Recyclage. */
export function playerUnitProductionCost(unitId: string, productionLevel: number): number {
  const def = getUnitUpgradeDef(unitId);
  return getUnit(unitId).cost + (def ? def.goldCostPerLevel * productionLevel : 0);
}

/** Cout Gold d'une NOUVELLE unite `unitId` au niveau de production courant. */
export function effectivePlayerUnitCost(unitId: string, levels: Readonly<RunUpgradeLevels>): number {
  return playerUnitProductionCost(unitId, currentProductionLevel(levels, unitId));
}

export interface PlayerUnitUpgradeEffects {
  hpBonusDisplay: number;
  attackBonusDisplay: number;
  tauntShieldBonusDisplay: number;
  /** A fusionner dans le `statOverrides` passe a World.spawn : contient
   *  TOUJOURS `maxHp` (base + bonus), et `damage` si le bonus d'attaque vise
   *  les stats. Objet frais a chaque appel. */
  statOverrides: Partial<UnitStats>;
  /** Entity.abilityDamageBonus, echelle interne (Boule de feu du Mage). */
  abilityDamageBonus: number;
  /** Entity.tauntShieldBonus, echelle interne (Sentinelle). */
  tauntShieldBonus: number;
}

/** Bonus d'une unite JOUEUR produite au niveau `productionLevel`. Unite sans
 *  amelioration definie : tout a 0, statOverrides vide. */
export function computePlayerUnitUpgradeEffects(unitId: string, productionLevel: number): PlayerUnitUpgradeEffects {
  const def = getUnitUpgradeDef(unitId);
  if (!def) {
    return { hpBonusDisplay: 0, attackBonusDisplay: 0, tauntShieldBonusDisplay: 0, statOverrides: {}, abilityDamageBonus: 0, tauntShieldBonus: 0 };
  }
  const base = getUnit(unitId).stats;
  const hpBonusDisplay = def.hpPerLevel * productionLevel;
  const attackBonusDisplay = def.attackPerLevel * productionLevel;
  const tauntShieldBonusDisplay = def.tauntShieldPerLevel * productionLevel;

  const statOverrides: Partial<UnitStats> = { maxHp: base.maxHp + hpBonusDisplay * HP_PER_PIP };
  let abilityDamageBonus = 0;
  if (attackBonusDisplay > 0) {
    if (def.attackTarget === 'stats') statOverrides.damage = base.damage + attackBonusDisplay * HP_PER_PIP;
    else abilityDamageBonus = attackBonusDisplay * HP_PER_PIP;
  }
  return {
    hpBonusDisplay,
    attackBonusDisplay,
    tauntShieldBonusDisplay,
    statOverrides,
    abilityDamageBonus,
    tauntShieldBonus: tauntShieldBonusDisplay * HP_PER_PIP,
  };
}

/** PV MAXIMUM d'une unite JOUEUR produite au niveau `productionLevel`,
 *  echelle INTERNE (x10) — a utiliser partout ou une unite joueur doit
 *  connaitre son propre plafond (nouvelle unite a pleins PV, soin, barres
 *  de PV), toujours avec le niveau de CETTE unite. */
export function playerUnitMaxHp(unitId: string, productionLevel: number): number {
  return computePlayerUnitUpgradeEffects(unitId, productionLevel).statOverrides.maxHp ?? getUnit(unitId).stats.maxHp;
}

/** Resume AFFICHE (points) d'une unite produite au niveau `productionLevel` :
 *  boutique, Forge, fiches. `attack` est l'attaque principale (Boule de feu
 *  pour le Mage) ; `tauntShield` n'existe que pour une unite qui provoque. */
export interface UnitProductionSummary {
  productionLevel: number;
  hp: number;
  attack: number;
  /** Nom de l'attaque principale quand ce n'est pas l'attaque de base. */
  attackLabel: string;
  tauntShield: number | null;
  cost: number;
  population: number;
}

export function unitProductionSummary(unitId: string, productionLevel: number): UnitProductionSummary {
  const def = getUnit(unitId);
  const effects = computePlayerUnitUpgradeEffects(unitId, productionLevel);
  const fireball = findAbility(def.abilities, 'area-blast');
  const taunt = findAbility(def.abilities, 'taunt');
  const attackInternal = fireball
    ? fireball.damage + effects.abilityDamageBonus
    : (effects.statOverrides.damage ?? def.stats.damage);
  return {
    productionLevel,
    hp: playerUnitMaxHp(unitId, productionLevel) / HP_PER_PIP,
    attack: attackInternal / HP_PER_PIP,
    attackLabel: fireball ? 'Boule de feu' : 'Attaque',
    tauntShield: taunt ? SHIELD_PER_TAUNTED_ENEMY + effects.tauntShieldBonusDisplay : null,
    cost: playerUnitProductionCost(unitId, productionLevel),
    population: def.populationCost,
  };
}

/**
 * Niveau de renforcement applique aux unites ENNEMIES (voir
 * data/unitUpgrades.ts, ENEMY_WAVE_UPGRADES) — un mecanisme SEPARE des
 * ameliorations du joueur, purement fonction du numero de vague : vague 1 =
 * niveau 0, vagues 2-3 = niveau 1, vagues 4-5 = niveau 2, etc., sans plafond.
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
 *  niveau, +1 attaque tous les 3 niveaux (bareme inchange par la refonte du
 *  joueur). Type sans renforcement : statOverrides vide. */
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
