import { HP_PER_PIP } from '../config/constants';
import { getUnitUpgradeDef, type UnitUpgradeDef } from '../data/unitUpgrades';
import { getUnit, type UnitStats } from '../data/units';
import { runUpgradeLevel, type RunUpgradeLevels } from './runUpgrades';
import { computePlayerSentinelUpgradeEffects } from './sentinelUpgradeEffects';

/**
 * Calcule les bonus de la boutique d'amelioration permanente (2026-08-13,
 * voir data/unitUpgrades.ts) a partir du SEUL `upgradeLevel` stocke —
 * demande explicite d'Antoine, point 9 : "évite de stocker séparément
 * hpBonus/attackBonus/upgradeLevel si les deux premiers peuvent être
 * recalculés proprement depuis upgradeLevel". Meme principe que
 * run/talentEffects.ts : ce module sait ce qu'est un upgrade, main.ts/
 * run/runState.ts ne recoivent que des nombres deja calcules.
 *
 * IMPORTANT (point 21 de la demande) : ne mute JAMAIS `UNITS`/`UnitDef` —
 * tout ici est un calcul PUR qui renvoie un patch, jamais une ecriture sur
 * les donnees globales (qui contamineraient aussi les ennemis).
 */

/** Bonus de PV, AFFICHE (pas l'echelle interne x10). */
export function upgradeHpBonusDisplay(def: UnitUpgradeDef, level: number): number {
  return def.hpPerLevel * level;
}

/** Bonus d'ATTAQUE, AFFICHE — "tous les N achats, +1 attaque" (point 8/9). */
export function upgradeAttackBonusDisplay(def: UnitUpgradeDef, level: number): number {
  return Math.floor(level / def.attackEveryLevels);
}

/** "Prochain +1 ATK dans X amélioration(s)" (point 26) — la formule brute
 *  `attackEveryLevels - (level % attackEveryLevels)` couvre deja le cas
 *  `level % attackEveryLevels === 0` (0 -> attackEveryLevels - 0 =
 *  attackEveryLevels), pas besoin d'un cas particulier separe. */
export function upgradeRemainingUntilAttackBonus(def: UnitUpgradeDef, level: number): number {
  return def.attackEveryLevels - (level % def.attackEveryLevels);
}

/** Vrai si le PROCHAIN achat (level -> level+1) declenche un palier
 *  d'attaque — sert a l'UI pour mettre en avant un achat "important"
 *  (point 27). */
export function upgradeNextPurchaseGrantsAttackBonus(def: UnitUpgradeDef, level: number): boolean {
  return (level + 1) % def.attackEveryLevels === 0;
}

/** Cout Gold EFFECTIF de recrutement en boutique de RUN : SOURCE UNIQUE du
 *  prix affiche, du prix facture et de la revente avec Recyclage. Les
 *  niveaux d'amelioration ne le modifient plus (refonte economique : une
 *  amelioration achetee a la Forge ne renchérit pas ce qu'elle ameliore) ;
 *  c'est aujourd'hui le cout de base de l'unite, point d'entree garde pour
 *  tout futur modificateur de prix. */
export function effectivePlayerUnitCost(unitId: string): number {
  return getUnit(unitId).cost;
}

/** PV MAXIMUM effectifs (base + bonus permanent), echelle INTERNE (x10) —
 *  a utiliser PARTOUT ou une unite JOUEUR doit connaitre son propre plafond
 *  de PV (nouvelle unite a pleins PV, plafond de soin...), jamais
 *  `getUnit(unitId).stats.maxHp` seul (qui ne reflete que la base, voir
 *  CLAUDE.md, correctif "je commence a 5/9" 2026-08-13). Toujours egal a
 *  `computePlayerUnitUpgradeEffects(...).statOverrides.maxHp`, expose ici a
 *  part pour les sites qui n'ont besoin QUE de ce nombre. */
export function effectivePlayerUnitMaxHp(unitId: string, levels: RunUpgradeLevels): number {
  // Sentinelle (2026-08-14) : amelioration DEDIEE (voir
  // data/sentinelUpgrade.ts), pas enregistree dans UNIT_UPGRADES (elle ne
  // donne jamais d'attaque, forme incompatible avec UnitUpgradeDef) — sans
  // ce cas special, la Sentinelle retomberait sur le maxHp de BASE ici
  // malgre des PV permanents achetes, meme classe de bug que "je commence a
  // 5/9" deja corrigee pour Fantassin/Archer/Mage.
  if (unitId === 'sentinel') return computePlayerSentinelUpgradeEffects(levels).statOverrides.maxHp!;

  const def = getUnitUpgradeDef(unitId);
  const base = getUnit(unitId).stats.maxHp;
  if (!def) return base;
  const level = runUpgradeLevel(levels, unitId);
  return base + upgradeHpBonusDisplay(def, level) * HP_PER_PIP;
}

export interface PlayerUnitUpgradeEffects {
  level: number;
  hpBonusDisplay: number;
  attackBonusDisplay: number;
  /** A fusionner dans le `statOverrides` passe a World.spawn (voir main.ts) —
   *  contient TOUJOURS `maxHp` (deja PV de base + bonus), et `damage` en
   *  PLUS si `primaryDamageTarget === 'stats'` (Fantassin/Archer). Jamais
   *  mute sur `UnitStats`/`UNITS` global — un objet frais a chaque appel. */
  statOverrides: Partial<UnitStats>;
  /** A passer a World.spawn separement (voir Entity.abilityDamageBonus) —
   *  non nul UNIQUEMENT si `primaryDamageTarget === 'ability'` (Mage). */
  abilityDamageBonus: number;
}

/** Coeur PARTAGE du calcul de bonus (bonus PV/attaque -> statOverrides +
 *  abilityDamageBonus) a partir d'un `level` DEJA determine — reutilise a
 *  l'IDENTIQUE par le joueur (level = achats en boutique d'amelioration,
 *  voir computePlayerUnitUpgradeEffects) et par les ennemis (level = fonction
 *  du numero de vague, voir computeEnemyUnitUpgradeEffects, 2026-08-13) :
 *  memes formules, seule la SOURCE du niveau differe. */
function buildUpgradeStatEffects(
  unitId: string,
  def: UnitUpgradeDef,
  level: number,
): { hpBonusDisplay: number; attackBonusDisplay: number; statOverrides: Partial<UnitStats>; abilityDamageBonus: number } {
  const base = getUnit(unitId);
  const hpBonusDisplay = upgradeHpBonusDisplay(def, level);
  const attackBonusDisplay = upgradeAttackBonusDisplay(def, level);
  const attackBonusInternal = attackBonusDisplay * HP_PER_PIP;

  const statOverrides: Partial<UnitStats> = { maxHp: base.stats.maxHp + hpBonusDisplay * HP_PER_PIP };
  let abilityDamageBonus = 0;
  if (attackBonusInternal > 0) {
    if (def.primaryDamageTarget === 'stats') {
      statOverrides.damage = base.stats.damage + attackBonusInternal;
    } else {
      abilityDamageBonus = attackBonusInternal;
    }
  }

  return { hpBonusDisplay, attackBonusDisplay, statOverrides, abilityDamageBonus };
}

/** Calcule TOUT ce dont main.ts a besoin pour faire apparaitre une unite
 *  JOUEUR avec ses bonus permanents appliques — jamais appelee pour une
 *  unite ENNEMIE (voir CLAUDE.md, point 20/21 de la demande initiale : les
 *  stats de base d'UnitDef restent les stats ENNEMIES telles quelles — voir
 *  cependant computeEnemyUnitUpgradeEffects plus bas pour le buff ennemi
 *  PAR VAGUE, un systeme DELIBEREMENT distinct, 2026-08-13). Unite sans
 *  amelioration definie : tous les bonus a 0, statOverrides vide — spawn
 *  identique a avant ce systeme. */
export function computePlayerUnitUpgradeEffects(unitId: string, levels: RunUpgradeLevels): PlayerUnitUpgradeEffects {
  const def = getUnitUpgradeDef(unitId);
  if (!def) {
    return { level: 0, hpBonusDisplay: 0, attackBonusDisplay: 0, statOverrides: {}, abilityDamageBonus: 0 };
  }
  const level = runUpgradeLevel(levels, unitId);
  return { level, ...buildUpgradeStatEffects(unitId, def, level) };
}

/**
 * Niveau d'amelioration "difficulte" applique aux unites ENNEMIES
 * (2026-08-13, demande explicite d'Antoine : "les unités ennemies doivent
 * être améliorées (même buff que boutique améliorations)") — un mecanisme
 * SEPARE des ameliorations du joueur (aucun RunState ni MetaProgress ici),
 * purement fonction du numero de vague.
 *
 * Cadence CORRIGEE deux fois le meme jour :
 *  1. D'abord "toutes les 3 vagues" (`floor((wave-1)/3)`), corrige en
 *     `floor(wave/3)` apres qu'Antoine a remonte que le premier palier
 *     n'apparaissait qu'a la vague 4 au lieu de 3.
 *  2. Puis explicitement remplace par "toutes les 2 vagues" (demande
 *     directe d'Antoine, meme jour : "au lieu de s'améliorer toutes les 3
 *     vagues c'est toutes les 2 vagues") — `floor(wave/2)` : premier palier
 *     des la vague 2, puis pile tous les 2 (2, 4, 6, 8...) — vague 1 =
 *     niveau 0 (aucun bonus), vagues 2-3 = niveau 1, vagues 4-5 = niveau 2,
 *     vagues 6-7 = niveau 3, etc., sans plafond — s'ajoute a la courbe
 *     d'effectifs deja croissante (voir run/runState.ts, computeEnemyWaveComposition).
 */
export function enemyUpgradeLevelForWave(waveNumber: number): number {
  return Math.max(0, Math.floor(waveNumber / 2));
}

export interface EnemyUnitUpgradeEffects {
  statOverrides: Partial<UnitStats>;
  abilityDamageBonus: number;
}

/** Calcule TOUT ce dont main.ts a besoin pour faire apparaitre une unite
 *  ENNEMIE avec le buff de difficulte de sa vague (voir enemyUpgradeLevelForWave
 *  ci-dessus) — MEMES formules que la boutique d'amelioration du joueur
 *  (buildUpgradeStatEffects), jamais lue depuis MetaProgress. Unite sans
 *  amelioration definie (future Cavalier/Baliste...) : statOverrides vide,
 *  spawn identique a avant ce systeme. */
export function computeEnemyUnitUpgradeEffects(unitId: string, waveNumber: number): EnemyUnitUpgradeEffects {
  const def = getUnitUpgradeDef(unitId);
  if (!def) return { statOverrides: {}, abilityDamageBonus: 0 };
  const level = enemyUpgradeLevelForWave(waveNumber);
  const { statOverrides, abilityDamageBonus } = buildUpgradeStatEffects(unitId, def, level);
  return { statOverrides, abilityDamageBonus };
}
