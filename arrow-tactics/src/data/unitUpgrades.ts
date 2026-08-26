/**
 * Donnees pures (comme units.ts/talents.ts/items.ts) pour la BOUTIQUE
 * D'AMELIORATION PERMANENTE des unites du joueur (2026-08-13, demande
 * d'Antoine) — systeme DISTINCT de la boutique de run, de l'arbre de talents
 * et des stats de base des ennemis (voir run/unitUpgradeEffects.ts pour le
 * calcul des bonus reels, run/metaProgress.ts pour le stockage).
 *
 * Architecture data-driven demandee explicitement par Antoine ("evite les
 * if footman/if archer/if mage partout") : une entree ici suffit a rendre
 * une unite amelioration — Cavalier/Chevalier/Baliste pourront s'ajouter
 * plus tard sans toucher au moteur (run/unitUpgradeEffects.ts).
 */

/** Forme MINIMALE partagee par TOUTE amelioration permanente basee sur des
 *  runes (unites, Baliste, Parchemin de soin — 2026-08-13) : premier achat a
 *  `baseRuneCost`, prix multiplie par `costMultiplier` a chaque achat
 *  suivant. `nextUpgradeCost` ci-dessous n'a besoin que de CES deux champs —
 *  vit ici (data/) plutot que dans run/metaProgress.ts pour eviter un import
 *  circulaire (metaProgress.ts et les modules d'effets en ont tous les deux
 *  besoin). */
export interface RuneCostDef {
  /** Cout en runes du TOUT PREMIER achat (upgradeLevel 0 -> 1). */
  baseRuneCost: number;
  /** Le cout est multiplie par cette valeur a chaque achat. */
  costMultiplier: number;
  /** Niveau maximal atteignable (2026-08-17, Caserne — voir
   *  data/barracksUpgrade.ts) — au-dela, canPurchaseUpgrade
   *  (run/metaProgress.ts) refuse tout achat supplementaire, quel que soit
   *  le nombre de runes disponibles. ABSENT = illimite (comportement
   *  historique de toutes les autres ameliorations permanentes de ce jeu,
   *  inchange). */
  maxLevel?: number;
}

/** Cout en runes du PROCHAIN achat (le (level+1)-ieme) — baseRuneCost *
 *  costMultiplier^level, level = nombre d'achats DEJA effectues. Fonction
 *  PURE et GENERIQUE (n'importe quelle amelioration a base de runes) —
 *  SEULE formule reutilisee par TOUTES les ameliorations permanentes du jeu
 *  (unites, Baliste, Parchemin de soin, Nova de glace, Mine, Caserne,
 *  Sentinelle, Soins excedentaires), jamais dupliquee. Le cout EFFECTIVEMENT
 *  facture/affiche applique en PLUS le talent "Maître de la forge" par-dessus
 *  cette formule de BASE (voir run/metaProgress.ts, effectiveUpgradeCost) —
 *  cette fonction-ci reste volontairement ignorante des talents (evite un
 *  import circulaire avec run/metaProgress.ts, qui importe deja depuis ce
 *  fichier). */
export function nextUpgradeCost(def: RuneCostDef, level: number): number {
  return def.baseRuneCost * def.costMultiplier ** level;
}

export interface UnitUpgradeDef extends RuneCostDef {
  unitId: string;
  /** Bonus de PV AFFICHE (echelle joueur, pas interne x10) par achat. */
  hpPerLevel: number;
  /** Tous les N achats, +1 point d'ATTAQUE affiche (voir primaryDamageTarget). */
  attackEveryLevels: number;
  /** A chaque palier d'attaque franchi, +N au cout Gold d'achat de cette
   *  unite en boutique de RUN (voir run/unitUpgradeEffects.ts,
   *  effectivePlayerUnitCost). */
  goldCostPerAttackUpgrade: number;
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
    baseRuneCost: 10,
    costMultiplier: 2,
    hpPerLevel: 1,
    attackEveryLevels: 3,
    goldCostPerAttackUpgrade: 1,
    primaryDamageTarget: 'stats',
  },
  archer: {
    unitId: 'archer',
    baseRuneCost: 10,
    costMultiplier: 2,
    hpPerLevel: 1,
    attackEveryLevels: 3,
    goldCostPerAttackUpgrade: 1,
    primaryDamageTarget: 'stats',
  },
  mage: {
    unitId: 'mage',
    baseRuneCost: 10,
    costMultiplier: 2,
    hpPerLevel: 1,
    attackEveryLevels: 3,
    goldCostPerAttackUpgrade: 1,
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
