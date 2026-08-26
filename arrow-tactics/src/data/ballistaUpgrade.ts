import type { RuneCostDef } from './unitUpgrades';

/**
 * Amelioration permanente de la BALISTE (2026-08-13, demande d'Antoine) —
 * "la baliste" est l'arme qui tire la fleche du JOUEUR (voir
 * config/constants.ts, les constantes PLAYER_ARROW_..., et render/ballista.ts
 * pour le modele visuel) : ce fichier ne decrit QUE le bonus permanent, pas
 * une nouvelle unite. Meme famille de systeme que data/unitUpgrades.ts (RuneCostDef,
 * premier achat -> prix double a chaque achat suivant), mais un SHAPE
 * different (cadence de tir en %, pas PV/ATK d'une UnitDef) — pas de sens a
 * le forcer dans UnitUpgradeDef.
 */
export interface BallistaUpgradeDef extends RuneCostDef {
  id: 'ballista';
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
  // 1 -> 10 runes (2026-08-13, demande explicite d'Antoine : "le prix de
  // l'amélioration de la baliste et du parchemin de soins commence
  // également à partir de 10 runes") — aligne le premier achat sur celui
  // des unites (voir data/unitUpgrades.ts). Le NIVEAU reste independant
  // (acheter la Baliste n'avance pas le niveau du Fantassin/Parchemin, etc.),
  // seule la valeur de DEPART du cout est desormais partagee.
  baseRuneCost: 10,
  costMultiplier: 2,
  attackSpeedPerLevel: 0.2,
  damageEveryLevels: 3,
  damagePerMilestone: 1,
  hpBonusPerLevel: 10,
};
