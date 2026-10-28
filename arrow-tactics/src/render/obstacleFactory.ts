import * as THREE from 'three';
import { obstacleAppearanceSeed, obstacleCenter, type ObstacleDef } from '../config/constants';
import { Rng } from '../core/rng';
import type { EnvironmentAssets } from './assetLibrary';
import { createBuildingObstacle } from './buildings';
import { createPropObstacle } from './props';
import { createRock } from './rocks';
import { surfaceY } from './terrainSurface';
import { createTreeObstacle } from './trees';

/**
 * Point d'entree unique pour construire le visuel d'un obstacle a partir de
 * son `kind` — partage entre le plateau du jeu (board.ts) et l'editeur de
 * maps (editorScene.ts) pour que les deux ne divergent jamais sur "quel
 * kind produit quel rendu" (contrairement a createSelectionRing, dupliquee
 * volontairement, ceci est de la logique de rendu pure sans dependance a
 * l'UI de l'un ou l'autre cote).
 */
export function buildObstacleMesh(def: ObstacleDef, assets: EnvironmentAssets): THREE.Group {
  // Aspect deterministe (orientation sans rotationY, forme d'un rocher,
  // hauteur et modele d'un arbre) : meme decor = meme aspect, dans l'editeur
  // comme en jeu (voir obstacleAppearanceSeed).
  const rng = new Rng(obstacleAppearanceSeed(def));
  const random = () => rng.next();
  const mesh = buildObstacleModel(def, assets, random);
  // Decalage de pose du modele par rapport au centre de l'obstacle, calcule
  // par sa fabrique (recentrage X/Z, base du modele posee au sol en Y, voir
  // cloneScaledTo) : conserve tel quel, puis pose sur le relief.
  const center = obstacleCenter(def);
  mesh.userData[PLACEMENT_OFFSET_KEY] = { x: mesh.position.x - center.x, y: mesh.position.y, z: mesh.position.z - center.z };
  placeObstacleMesh(mesh, def);
  return mesh;
}

const PLACEMENT_OFFSET_KEY = 'obstaclePlacementOffset';

/** Decalage de pose d'un mesh construit par buildObstacleMesh (0 sinon). */
export function obstaclePlacementOffset(mesh: THREE.Object3D): { x: number; y: number; z: number } {
  return (mesh.userData[PLACEMENT_OFFSET_KEY] as { x: number; y: number; z: number } | undefined) ?? { x: 0, y: 0, z: 0 };
}

/**
 * (Re)pose un mesh de buildObstacleMesh sur le centre de `def`, a la hauteur
 * de la surface sous ce centre (`height`, par defaut la surface active —
 * relief, pente de coin comprise), sans perdre le decalage de pose du modele.
 * SOURCE UNIQUE du placement : plateau du jeu, editeur (y compris apres un
 * changement de relief), gizmo de deplacement.
 */
export function placeObstacleMesh(mesh: THREE.Object3D, def: ObstacleDef, height?: number): void {
  const center = obstacleCenter(def);
  const offset = obstaclePlacementOffset(mesh);
  mesh.position.set(center.x + offset.x, (height ?? surfaceY(center.x, center.z)) + offset.y, center.z + offset.z);
}

function buildObstacleModel(def: ObstacleDef, assets: EnvironmentAssets, random: () => number): THREE.Group {
  switch (def.kind) {
    case 'tree':
      return createTreeObstacle(def, assets, random);
    case 'prop':
      return createPropObstacle(def, assets, random);
    case 'rock':
      return createRock(def, assets, random);
    case 'building':
      return createBuildingObstacle(def, assets);
  }
}
