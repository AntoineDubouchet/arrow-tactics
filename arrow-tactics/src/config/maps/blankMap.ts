import type { MapDef, TerrainCellDef } from '../mapDef';
import { PROCEDURAL_MAP_SIZE } from './proceduralSurvival';

/**
 * Carte vierge de l'Editeur de maps (2026-11-02) : ouverte par defaut a la
 * place de l'ancienne arene. Disque de 96 x 96 cases, meme emprise que la
 * carte Hero RTS (rayon 46,5), terrain plat d'herbe, sans eau, relief,
 * decor, arbre, batiment, unite, territoire, camp ni Depart Survie
 * (2026-11-03 : la Baliste n'est plus imposee au centre ; « Tester le
 * scénario » exige un Depart Survie pose dans l'editeur). Regles de la Survie
 * Hero RTS, comme la carte procedurale.
 */
const BLANK_MAP_RADIUS = 46.5;

export function createBlankMap(size: number = PROCEDURAL_MAP_SIZE): MapDef {
  const half = size / 2;
  const cells: TerrainCellDef[] = [];
  for (let z = -half; z < half; z++) {
    for (let x = -half; x < half; x++) {
      if (Math.hypot(x, z) <= BLANK_MAP_RADIUS * (size / PROCEDURAL_MAP_SIZE)) cells.push({ x, z, terrain: 'grass' });
    }
  }
  return {
    name: `Nouvelle carte (${size} × ${size})`,
    version: 1,
    width: size,
    height: size,
    cells,
    obstacles: [],
    playerUnits: [],
    enemyUnits: [],
    territory: [],
    survivalRules: 'hero-rts',
  };
}
