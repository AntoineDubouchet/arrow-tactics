/**
 * Rayons de vision (cases), PROVISOIRES (2026-11-01, Hero RTS) : unite
 * standard, Baliste, Heros (+50 % d'une unite), batiment, Tour, chantier.
 * Partages par la vision GAMEPLAY de la simulation (sim/vision.ts :
 * acquisition automatique de cible) et par le brouillard de guerre du rendu
 * (render/fogOfWar.ts), qui ne se lisent jamais l'un l'autre.
 *
 * 2026-11-02 (demande d'Antoine) : Baliste et Tour terminee ont une vision
 * STRATEGIQUE de 18 cases (36 a la passe precedente, 8 avant). Leur portee
 * d'attaque ne change pas (data/units.ts, data/buildings.ts) : voir n'est
 * pas tirer. 2026-11-05 (G46) : Baliste 21, pour que le camp agrandi
 * (enceinte de rayon 15) garde 6 cases de vue au-dela de ses murs et voie
 * le gisement d'or proche garanti (config/startingBase.ts nearbyGold).
 */
export const VISION_RADIUS = { unit: 6, ballista: 21, hero: 9, building: 4, tower: 18, site: 3 } as const;

/** Disque deja EXPLORE (terrain memorise, pas visible) autour du camp au
 *  lancement d'une run (2026-11-02, brouillard du rendu seulement) : un peu
 *  plus large que la vision de la Baliste, le joueur voit d'emblee ses
 *  abords. 25 depuis le 2026-11-05 (22 avant). PROVISOIRE. */
export const INITIAL_EXPLORED_RADIUS = 25;
