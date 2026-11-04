/**
 * Amelioration de la BALISTE pendant la run (2026-08-13, demande d'Antoine) —
 * "la baliste" est l'arme qui tire la fleche du JOUEUR (voir
 * config/constants.ts, les constantes PLAYER_ARROW_..., et render/ballista.ts
 * pour le modele visuel) : ce fichier ne decrit QUE le bonus par niveau, pas
 * une nouvelle unite. Depuis le 2026-11-05 (Pass 2), elle se commande depuis
 * la fiche de la Baliste elle-meme, par sa file temps reel (duree
 * BUILDING_UPGRADE_SECONDS, payee a la commande), plus depuis la Forge ;
 * niveau dans RunState.upgrades['ballista'] (run/runUpgrades.ts). Niveaux
 * repetes jusqu'au plafond `maxLevel` (prix double a chaque niveau : 1, 2,
 * 4, 8).
 */
export interface BallistaUpgradeDef {
  id: 'ballista';
  /** Niveau INTERNE maximal (4 = « Niv. 5 » affiche) ; absent = illimite.
   *  Au plafond : fiche « Niveau maximum atteint », aucune commande
   *  acceptee (run/productionOrders.ts). */
  maxLevel?: number;
  /** +X (fraction, 0.20 = +20 points de pourcentage) de CADENCE DE TIR par
   *  achat — additif depuis la cadence de BASE (jamais multiplicatif d'un
   *  niveau a l'autre, demande explicite d'Antoine : "pas baseRate × 1.2 ×
   *  1.2 × 1.2..."). Ne touche JAMAIS PROJECTILE SPEED (vitesse physique du
   *  carreau, voir PLAYER_ARROW_SPEED) — distinction explicite point 8 de la
   *  demande. */
  attackSpeedPerLevel: number;
  /** Tous les N achats, +damagePerMilestone degats AFFICHES sur le carreau. */
  damageEveryLevels: number;
  damagePerMilestone: number;
  /** +N PV AFFICHES (pas l'echelle interne x10) de la TOUR par achat —
   *  2026-08-16, demande explicite d'Antoine : "chaque niveau d'amelioration
   *  permanente de la Baliste lui donne egalement +10 HP". S'AJOUTE aux
   *  bonus deja existants ci-dessus (cadence/degats du CARREAU tire), ne les
   *  remplace jamais — un bonus different, sur un OBJET different (la
   *  structure Building elle-meme, voir data/buildings.ts, BUILDINGS.ballista,
   *  pas le projectile). */
  hpBonusPerLevel: number;
}

export const BALLISTA_UPGRADE: BallistaUpgradeDef = {
  id: 'ballista',
  // Plafond PROVISOIRE (2026-11-05, decision d'Antoine) : Niv. 5 au total,
  // soit 4 ameliorations ; les chiffres par niveau sont inchanges.
  maxLevel: 4,
  attackSpeedPerLevel: 0.2,
  damageEveryLevels: 3,
  damagePerMilestone: 1,
  hpBonusPerLevel: 10,
};
