/**
 * Donnees pures (comme units.ts/talents.ts/items.ts) des AMELIORATIONS
 * d'unites achetees a la Forge pendant la run (niveaux : RunState.upgrades,
 * voir run/runUpgrades.ts ; calcul des stats reelles : run/unitUpgradeEffects.ts).
 *
 * NIVEAU DE PRODUCTION (refonte "escarmouches") : ameliorer une unite-type
 * a la Forge eleve le niveau auquel les PROCHAINES unites de ce type sont
 * produites (boutique, Caserne). Chaque niveau est un vrai gain de puissance
 * et renchérit d'autant le cout de production. Une unite deja creee garde
 * pour toujours le niveau de sa creation (OwnedUnit.productionLevel) : une
 * amelioration n'est jamais retroactive.
 *
 * Architecture data-driven (aucun `if fantassin/if archer` dans le moteur) :
 * une entree ici suffit a rendre une unite ameliorable.
 */

/** Champs communs a toute amelioration achetable a la Forge. Le cout en Or
 *  de l'amelioration elle-meme n'est pas une donnee : il est centralise dans
 *  run/runUpgrades.ts (runUpgradeGoldCost). */
export interface UpgradeDefBase {
  /** Niveau maximal atteignable ; absent = illimite (aucune amelioration
   *  n'en a aujourd'hui). Lu par canPurchaseRunUpgrade. */
  maxLevel?: number;
}

/** Gains d'UN niveau de production, cumules lineairement (niveau n =
 *  base + n x gain). Valeurs AFFICHEES (points), pas l'echelle interne x10. */
export interface UnitUpgradeDef extends UpgradeDefBase {
  unitId: string;
  hpPerLevel: number;
  /** +N points d'ATTAQUE par niveau, appliques a `attackTarget`. */
  attackPerLevel: number;
  /** OU s'applique le bonus d'attaque :
   *   - 'stats' : UnitStats.damage, attaque principale (Fantassin, Archer) ;
   *   - 'ability' : Entity.abilityDamageBonus, ajoute aux degats de la
   *     capacite (Boule de feu du Mage), jamais au "Coup de bâton" de repli. */
  attackTarget: 'stats' | 'ability';
  /** +N points de bouclier par ennemi provoque, par niveau (Sentinelle). */
  tauntShieldPerLevel: number;
  /** +N Or au cout de production de chaque nouvelle unite, par niveau. */
  goldCostPerLevel: number;
}

/** Valeurs PROVISOIRES, seul endroit a modifier pour reequilibrer. Un
 *  niveau regroupe les 3 premiers achats de l'ancien systeme (+1 PV par
 *  achat, +1 attaque tous les 3 achats ; Sentinelle : +5 PV par achat,
 *  +1 bouclier tous les 3 achats). */
export const UNIT_UPGRADES: Record<string, UnitUpgradeDef> = {
  // Robuste, melee : ancien cumul exact (+3 PV, +1 attaque), +1 Or.
  fantassin: {
    unitId: 'fantassin',
    hpPerLevel: 3,
    attackPerLevel: 1,
    attackTarget: 'stats',
    tauntShieldPerLevel: 0,
    goldCostPerLevel: 1,
  },
  // Degats a distance, fragile : l'attaque complete, moins de PV que le
  // Fantassin (+2 au lieu de +3). Portee inchangee (aucune ancienne
  // amelioration ne la touchait).
  archer: {
    unitId: 'archer',
    hpPerLevel: 2,
    attackPerLevel: 1,
    attackTarget: 'stats',
    tauntShieldPerLevel: 0,
    goldCostPerLevel: 1,
  },
  // Puissance, cout eleve : Boule de feu +2 (l'ancien cumul ne donnait que
  // +1, trop faible pour un niveau a +3 Or), +3 PV.
  mage: {
    unitId: 'mage',
    hpPerLevel: 3,
    attackPerLevel: 2,
    attackTarget: 'ability',
    tauntShieldPerLevel: 0,
    goldCostPerLevel: 3,
  },
  // Lourde, tres chere : ancien cumul exact (+15 PV, +1 bouclier par ennemi
  // provoque), jamais d'attaque (decision conservee), +10 Or.
  sentinel: {
    unitId: 'sentinel',
    hpPerLevel: 15,
    attackPerLevel: 0,
    attackTarget: 'stats',
    tauntShieldPerLevel: 1,
    goldCostPerLevel: 10,
  },
};

/** `undefined` si l'unite n'a pas d'amelioration definie — l'appelant se
 *  rabat alors sur les stats/cout de base sans erreur. */
export function getUnitUpgradeDef(unitId: string): UnitUpgradeDef | undefined {
  return UNIT_UPGRADES[unitId];
}

/** Liste des unites ameliorables, dans l'ordre de declaration ci-dessus —
 *  utilisee par l'UI (voir ui/screens.ts) pour construire une carte par
 *  unite sans coder les ids en dur. */
export function listUpgradableUnitIds(): string[] {
  return Object.keys(UNIT_UPGRADES);
}

/**
 * Renforcement des unites ENNEMIES par vague : l'ANCIEN bareme des
 * ameliorations d'unites (+1 PV par niveau, +1 attaque tous les 3 niveaux),
 * conserve tel quel et separe du niveau de production du joueur pour que la
 * refonte ne change pas la difficulte des vagues. Niveau = fonction du
 * numero de vague (run/unitUpgradeEffects.ts, enemyUpgradeLevelForWave).
 * La Sentinelle ennemie n'a jamais eu de renforcement.
 */
export interface EnemyWaveUpgradeDef {
  hpPerLevel: number;
  attackEveryLevels: number;
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
