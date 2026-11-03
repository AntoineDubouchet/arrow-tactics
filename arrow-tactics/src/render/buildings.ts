import * as THREE from 'three';
import { obstacleCenter, TILE, type ObstacleDef } from '../config/constants';
import { cloneScaledToFootprint, createMissingModelPlaceholder, isLazyModel, type EnvironmentAssets } from './assetLibrary';
import { isTreeBuildingModel, TREE_VISUAL_SCALE } from './trees';

/** Correction d'orientation NATIVE par modele (radians), ajoutee a la
 *  rotation enregistree : elle fixe ce que montre « 0° » dans l'editeur et
 *  au placement en jeu, sans changer l'angle stocke ni l'empreinte de
 *  collision. Mine : a 0°, son entree fait face a la camera par defaut
 *  (lacet 45°, voir CAMERA.yawDeg), donc vers le bas de l'ecran ; sans
 *  correction elle pointait vers +z (bas-gauche). */
const BUILDING_MODEL_ROTATION_OFFSET: Readonly<Record<string, number>> = {
  blue_mine: Math.PI / 4,
};

/**
 * Batiment : un modele KayKit (.obj/.mtl, voir assetLibrary.ts) mis a
 * l'echelle UNIFORME (jamais deforme) pour tenir dans son emprise reelle
 * (`tilesX x tilesZ` cases, potentiellement rectangulaire — contrairement a
 * un prop, toujours 1x1) plutot que sur un seul axe (voir
 * cloneScaledToFootprint). Collision : voir config/constants.ts,
 * isBlockingMapObstacle (decor traversable, sauf « Obstacles / structures » ;
 * les batiments gameplay ont leur propre emprise bloquante).
 */
export function createBuildingObstacle(def: ObstacleDef, assets: EnvironmentAssets): THREE.Group {
  const width = def.tilesX * TILE;
  const depth = def.tilesZ * TILE;
  const { x: centerX, z: centerZ } = obstacleCenter(def);
  // Bosquet : meme agrandissement que les autres arbres (deborde de son
  // emprise 2x2, purement visuel).
  const scale = (def.scale ?? 1) * (isTreeBuildingModel(def.buildingModel) ? TREE_VISUAL_SCALE : 1);

  const prototype = assets.buildingsByName[def.buildingModel ?? ''];
  if (!prototype && isLazyModel(def.buildingModel ?? '')) {
    // Modele a la demande pas encore charge (voir ensureModels).
    const placeholder = createMissingModelPlaceholder(width, depth);
    placeholder.position.set(centerX, 0, centerZ);
    return placeholder;
  }
  if (!prototype) throw new Error(`Bâtiment inconnu : ${def.buildingModel}`);

  // Modele recentre (son centre au sol a l'origine locale), place dans un
  // groupe d'orientation (correction native du modele), lui-meme dans la
  // racine posee au centre EXACT de l'emprise. Toute rotation tourne ainsi
  // autour du centre de l'emprise : tourner directement le clone recentre le
  // faisait pivoter autour de l'origine de son fichier, donc sortir de son
  // emprise. La racine porte position et rotation enregistrees (l'editeur les
  // reecrit, voir refreshEditorObjects) sans toucher a la correction.
  const model = cloneScaledToFootprint(prototype, width * scale, depth * scale);
  const oriented = new THREE.Group();
  oriented.rotation.y = BUILDING_MODEL_ROTATION_OFFSET[def.buildingModel ?? ''] ?? 0;
  oriented.add(model);
  const building = new THREE.Group();
  building.add(oriented);
  // Pas de rotation aleatoire par defaut (contrairement aux props/arbres,
  // organiques) : un batiment a une orientation "canonique" (facade) — une
  // rotation fixe et previsible (ajustable a la main via l'outil Tourner de
  // l'editeur) plutot qu'un tirage aleatoire a chaque placement.
  building.rotation.y = def.rotationY ?? 0;
  building.position.set(centerX, 0, centerZ);
  return building;
}
