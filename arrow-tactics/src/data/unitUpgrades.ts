/**
 * Donnees pures (comme units.ts/talents.ts/items.ts) des AMELIORATIONS
 * d'unites achetees a la Forge pendant la run (niveaux : RunState.upgrades,
 * voir run/runUpgrades.ts ; calcul des bonus reels : run/unitUpgradeEffects.ts).
 * Les memes definitions servent au renforcement des ennemis par vague
 * (computeEnemyUnitUpgradeEffects).
 *
 * Architecture data-driven demandee explicitement par Antoine ("evite les
 * if footman/if archer/if mage partout") : une entree ici suffit a rendre
 * une unite amelioration — Cavalier/Chevalier/Baliste pourront s'ajouter
 * plus tard sans toucher au moteur (run/unitUpgradeEffects.ts).
 */

/** Champs communs a toute amelioration achetable a la Forge. Le cout en Or
 *  n'est pas une donnee : il est centralise dans run/runUpgrades.ts
 *  (runUpgradeGoldCost). */
export interface UpgradeDefBase {
  /** Niveau maximal atteignable ; absent = illimite (aucune amelioration
   *  n'en a aujourd'hui). Lu par canPurchaseRunUpgrade. */
  maxLevel?: number;
}

export interface UnitUpgradeDef extends UpgradeDefBase {
  unitId: string;
  /** Bonus de PV AFFICHE (echelle joueur, pas interne x10) par achat. */
  hpPerLevel: number;
  /** Tous les N achats, +1 point d'ATTAQUE affiche (voir primaryDamageTarget). */
  attackEveryLevels: number;
  /** OU s'applique le bonus d'ATTAQUE (demande explicite d'Antoine, point 15 :
   *  "je veux que +1 attaque represente principalement la puissance
   *  offensive de l'unite... ne modifie pas aveuglement toutes les sources
   *  de degats") :
   *   - 'stats' : patch UnitStats.damage (attaque PRINCIPALE au corps a
   *     corps/a distance classique — Fantassin, Archer).
   *   - 'ability' : patch Entity.abilityDamageBonus, ajoute au damage d'une
   *     capacite generique (voir sim/systems/abilities.ts) — le Mage l'utilise
   *     pour sa Boule de feu (attaque PRINCIPALE), jamais son "Coup de bâton"
   *     de repli au contact (UnitStats.damage, volontairement mediocre et
   *     jamais touche par ce systeme). */
  primaryDamageTarget: 'stats' | 'ability';
}

export const UNIT_UPGRADES: Record<string, UnitUpgradeDef> = {
  fantassin: {
    unitId: 'fantassin',
    hpPerLevel: 1,
    attackEveryLevels: 3,
    primaryDamageTarget: 'stats',
  },
  archer: {
    unitId: 'archer',
    hpPerLevel: 1,
    attackEveryLevels: 3,
    primaryDamageTarget: 'stats',
  },
  mage: {
    unitId: 'mage',
    hpPerLevel: 1,
    attackEveryLevels: 3,
    // Attaque PRINCIPALE du Mage = la Boule de feu (voir data/units.ts,
    // UNITS.mage.abilities), jamais le "Coup de bâton" de repli.
    primaryDamageTarget: 'ability',
  },
};

/** `undefined` si l'unite n'a pas (encore) d'amelioration permanente
 *  definie — l'appelant doit alors se rabattre sur les stats/cout de base
 *  sans erreur (voir run/unitUpgradeEffects.ts). */
export function getUnitUpgradeDef(unitId: string): UnitUpgradeDef | undefined {
  return UNIT_UPGRADES[unitId];
}

/** Liste des unites ameliorables, dans l'ordre de declaration ci-dessus —
 *  utilisee par l'UI (voir ui/screens.ts) pour construire une carte par
 *  unite sans jamais coder les 3 ids en dur. */
export function listUpgradableUnitIds(): string[] {
  return Object.keys(UNIT_UPGRADES);
}
