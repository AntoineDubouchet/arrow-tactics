/** Fonctions d'interpolation reutilisables (2026-08-12, coup d'epee du
 *  Fantassin — voir proceduralAttackAnimator.ts). Toutes prennent/renvoient
 *  t dans [0,1]. */
export type EasingFn = (t: number) => number;

export const linear: EasingFn = (t) => t;
export const easeInCubic: EasingFn = (t) => t * t * t;
export const easeOutCubic: EasingFn = (t) => 1 - Math.pow(1 - t, 3);
export const easeInOutCubic: EasingFn = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const smoothstepEase: EasingFn = (t) => t * t * (3 - 2 * t);
