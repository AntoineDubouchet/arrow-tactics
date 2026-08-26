import * as THREE from 'three';
import { obstacleCenter, TILE, type ObstacleDef } from '../config/constants';
import { cloneScaledToFootprint, type EnvironmentAssets } from './assetLibrary';

/**
 * Batiment : un modele KayKit (.obj/.mtl, voir assetLibrary.ts) mis a
 * l'echelle UNIFORME (jamais deforme) pour tenir dans son emprise reelle
 * (`tilesX x tilesZ` cases, potentiellement rectangulaire — contrairement a
 * un prop, toujours 1x1) plutot que sur un seul axe (voir
 * cloneScaledToFootprint). `kind: 'building'` reste COLLIDABLE (voir
 * config/constants.ts, isCollidableObstacle) — un batiment bloque
 * mouvement ET ligne de tir comme un rocher/arbre, contrairement a un prop.
 */
export function createBuildingObstacle(def: ObstacleDef, assets: EnvironmentAssets): THREE.Group {
  const width = def.tilesX * TILE;
  const depth = def.tilesZ * TILE;
  const { x: centerX, z: centerZ } = obstacleCenter(def);
  const scale = def.scale ?? 1;

  const prototype = assets.buildingsByName[def.buildingModel ?? ''];
  if (!prototype) throw new Error(`Bâtiment inconnu : ${def.buildingModel}`);

  const building = cloneScaledToFootprint(prototype, width * scale, depth * scale);
  // Pas de rotation aleatoire par defaut (contrairement aux props/arbres,
  // organiques) : un batiment a une orientation "canonique" (facade) meme
  // si elle n'est pas connue de mon cote sans acces visuel — mieux vaut une
  // rotation fixe et previsible (ajustable a la main via l'outil Tourner de
  // l'editeur) qu'un tirage aleatoire a chaque placement.
  building.rotation.y = def.rotationY ?? 0;
  building.position.x += centerX;
  building.position.z += centerZ;
  return building;
}
