import { VISION_RADIUS } from '../data/vision';
import type { Entity, Team } from './entity';

/**
 * Vision GAMEPLAY (2026-11-01, Hero RTS) : un point est vu par un camp s'il
 * est dans le rayon de vision d'une de ses entites vivantes. Calculee depuis
 * les positions SIMULEES, deterministe, sans occlusion (arbres, falaises) ;
 * jamais derivee du brouillard du rendu (render/fogOfWar.ts). Sert aux
 * acquisitions automatiques de cible (Baliste en mode AUTO).
 */
export function visionRadiusOf(e: Entity): number {
  if (e.hero) return VISION_RADIUS.hero;
  if (e.unitId === 'ballista') return VISION_RADIUS.ballista;
  if (e.isBuilding) return e.construction ? VISION_RADIUS.site : VISION_RADIUS.building;
  return VISION_RADIUS.unit;
}

/** Test « ce point est-il vu par `team` ? » pour l'etat courant des entites
 *  (sources relevees une fois a l'appel). */
export function teamVision(entities: readonly Entity[], team: Team): (x: number, z: number) => boolean {
  const sources = entities.filter((e) => e.alive && e.team === team).map((e) => ({ x: e.x, z: e.z, r2: visionRadiusOf(e) ** 2 }));
  return (x, z) => sources.some((s) => (s.x - x) ** 2 + (s.z - z) ** 2 <= s.r2);
}
