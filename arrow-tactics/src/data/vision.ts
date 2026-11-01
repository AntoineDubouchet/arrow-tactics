/**
 * Rayons de vision (cases), PROVISOIRES (2026-11-01, Hero RTS) : unite
 * standard, Baliste (intermediaire), Heros (+50 % d'une unite), batiment,
 * chantier. Partages par la vision GAMEPLAY de la simulation (sim/vision.ts :
 * acquisition automatique de cible) et par le brouillard de guerre du rendu
 * (render/fogOfWar.ts), qui ne se lisent jamais l'un l'autre.
 */
export const VISION_RADIUS = { unit: 6, ballista: 8, hero: 9, building: 4, site: 3 } as const;
