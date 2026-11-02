/**
 * Niveau d'unite (2026-11-02) : donnee generique portee par chaque entite
 * (Entity.level), toujours un entier >= 1. Pour l'instant une donnee de
 * difficulte et de presentation (fiche d'inspection, « Maraudeur — Niv. 1 »)
 * : le niveau ne modifie AUCUNE stat par lui-meme. Les stats restent
 * resolues comme avant (ameliorations du joueur, renfort de vague ennemi,
 * fiche de niveau du Heros) ; un futur scaling par niveau (PV, degats, XP,
 * butin) se branchera la ou les parametres sont resolus, jamais dans la
 * simulation.
 *
 * Origine du niveau, du plus prioritaire au moins prioritaire :
 *  1. valeur explicite de la carte (MapUnitPlacement.level, MapCampDef.level,
 *     poste de garde) — carte dessinee a la main OU ecrite par un generateur ;
 *  2. valeur proposee par une regle (futur : difficulte procedurale par
 *     tier, distance, type de zone) ;
 *  3. DEFAULT_UNIT_LEVEL.
 * Le Heros garde sa propre progression (XP, HERO_LEVELS) : son niveau
 * d'entite en est une copie.
 */

export const DEFAULT_UNIT_LEVEL = 1;
/** Borne haute de securite (donnees saisies a la main) ; au-dessus du niveau
 *  maximum du Heros (100). PROVISOIRE. */
export const MAX_UNIT_LEVEL = 999;

/** Niveau valide : entier de 1 a MAX_UNIT_LEVEL ; toute autre valeur
 *  (absente, 0, negative, non numerique) retombe sur DEFAULT_UNIT_LEVEL. */
export function normalizeUnitLevel(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_UNIT_LEVEL;
  const level = Math.floor(value);
  return level < 1 ? DEFAULT_UNIT_LEVEL : Math.min(MAX_UNIT_LEVEL, level);
}

/** Premier niveau defini parmi les sources, de la plus prioritaire a la
 *  moins prioritaire (valeur explicite, puis regle), normalise. */
export function resolveUnitLevel(...sources: (number | undefined | null)[]): number {
  for (const s of sources) if (s !== undefined && s !== null) return normalizeUnitLevel(s);
  return DEFAULT_UNIT_LEVEL;
}

/** Niveau d'unite d'apres un niveau d'amelioration (0 = jamais ameliore) :
 *  niveau de production du joueur, renfort de vague ennemi. */
export function unitLevelFromUpgradeLevel(upgradeLevel: number): number {
  return normalizeUnitLevel(upgradeLevel + 1);
}
