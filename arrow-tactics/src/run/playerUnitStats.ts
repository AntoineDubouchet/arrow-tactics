import { HP_PER_PIP, TALENT_FANTASSIN_DODGE_CHANCE } from '../config/constants';
import { findAbility } from '../data/abilities';
import { rosterBonusSourcesOf } from '../data/buildings';
import { scaleUnitBonus, sumUnitBonuses, type UnitBonus } from '../data/unitBonus';
import { getUnit, type UnitStats } from '../data/units';
import { isTalentUnlocked } from './metaProgress';
import { runUpgradeLevel, type PlayerProgression, type RunUpgradeLevels } from './runUpgrades';
import { technologyUnitBonus } from './technologies';

/**
 * Statistiques EFFECTIVES d'une unite JOUEUR (2026-11-05, Pass 2) : SOURCE
 * UNIQUE, une seule hierarchie :
 *
 *   base (data/units.ts)
 *   + talents permanents (esquive de l'Homme d'armes)
 *   + niveau du batiment producteur (BuildingDef.rosterBonusPerLevel x niveau
 *     de run du type : Camp d'archerie Niv. 2 -> Archers +2 PV, +1 degats)
 *   + technologies acquises (data/technologies.ts : Forge +10 % degats / PV
 *     sur les unites militaires, Caserne +3 PV / +1 degats aux Hommes d'armes)
 *   = stats finales.
 *
 * Bonus fixes d'abord, puis les pourcentages cumules : PV max = (base + PV
 * fixes) x (1 + % PV) ; attaque principale idem (UnitStats.damage, ou la
 * Boule de feu via Entity.abilityDamageBonus pour une unite dont l'attaque
 * est une capacite 'area-blast'). Vitesse : base x (1 + %), le multiplicateur
 * global s'applique ensuite dans la simulation (withEffectiveMoveSpeed).
 * Fonctions pures de (unitId, progression) : la progression est GLOBALE a
 * la run et RETROACTIVE — l'orchestration recalcule les unites presentes a
 * chaque changement (run/productionOrders.ts, World.applyUnitStats, PV
 * actuels a la meme fraction) ; une unite n'a plus de niveau propre. Jamais
 * appelees pour une unite ENNEMIE (run/enemyWaveEffects.ts). Entity.level
 * reste une donnee de presentation sans effet (data/unitLevels.ts). Ne mute
 * JAMAIS `UNITS` : patch frais a chaque appel.
 */

/** Bonus cumule de la run pour `unitId` (producteur x niveau + technologies),
 *  valeurs affichees. Objet frais. */
export function playerUnitRunBonus(levels: Readonly<RunUpgradeLevels>, unitId: string): Required<UnitBonus> {
  const parts: UnitBonus[] = rosterBonusSourcesOf(unitId).map((s) => scaleUnitBonus(s.perLevel, runUpgradeLevel(levels, s.buildingId)));
  parts.push(technologyUnitBonus(levels, unitId));
  return sumUnitBonuses(parts);
}

export interface PlayerUnitStatsResult {
  /** Patch a passer a World.spawn / World.applyUnitStats ; `undefined` si
   *  rien ne differe de la base. */
  statOverrides: Partial<UnitStats> | undefined;
  /** Entity.abilityDamageBonus (echelle interne) : bonus de l'attaque
   *  principale quand c'est une capacite (Boule de feu du Mage). */
  abilityDamageBonus: number;
  /** Entity.tauntShieldBonus : aucune source aujourd'hui (Sentinelle
   *  dormante), toujours 0. */
  tauntShieldBonus: number;
  /** PV max effectifs (echelle interne). */
  maxHp: number;
  /** Attaque principale effective (echelle interne). */
  mainAttack: number;
  /** Nom de l'attaque principale (« dégâts », « Boule de feu »). */
  attackLabel: string;
  /** Bonus de run cumule (affichage). */
  bonus: Required<UnitBonus>;
}

export function computePlayerUnitStats(unitId: string, progress: PlayerProgression): PlayerUnitStatsResult {
  const def = getUnit(unitId);
  const base = def.stats;
  const bonus = playerUnitRunBonus(progress.upgrades, unitId);
  const overrides: Partial<UnitStats> = {};
  if (unitId === 'fantassin' && isTalentUnlocked(progress.talents, 'reflexes_fantassin')) {
    overrides.dodgeChance = TALENT_FANTASSIN_DODGE_CHANCE;
  }

  const maxHp = Math.round((base.maxHp + bonus.hp * HP_PER_PIP) * (1 + bonus.hpPercent / 100));
  if (maxHp !== base.maxHp) overrides.maxHp = maxHp;

  const fireball = findAbility(def.abilities, 'area-blast');
  const baseAttack = fireball ? fireball.damage : base.damage;
  const mainAttack = Math.round((baseAttack + bonus.attack * HP_PER_PIP) * (1 + bonus.attackPercent / 100));
  let abilityDamageBonus = 0;
  if (fireball) abilityDamageBonus = mainAttack - baseAttack;
  else if (mainAttack !== base.damage) overrides.damage = mainAttack;

  if (bonus.moveSpeedPercent !== 0) overrides.moveSpeed = base.moveSpeed * (1 + bonus.moveSpeedPercent / 100);

  return {
    statOverrides: Object.keys(overrides).length > 0 ? overrides : undefined,
    abilityDamageBonus,
    tauntShieldBonus: 0,
    maxHp,
    mainAttack,
    attackLabel: fireball ? 'Boule de feu' : 'dégâts',
    bonus,
  };
}

/** PV max effectifs d'une unite joueur (echelle interne) : nouvelle unite a
 *  pleins PV, armee de depart. */
export function playerUnitMaxHp(unitId: string, progress: PlayerProgression): number {
  return computePlayerUnitStats(unitId, progress).maxHp;
}
