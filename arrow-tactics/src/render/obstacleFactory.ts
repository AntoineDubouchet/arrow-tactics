import * as THREE from 'three';
import type { ObstacleDef } from '../config/constants';
import type { EnvironmentAssets } from './assetLibrary';
import { createBuildingObstacle } from './buildings';
import { createPropObstacle } from './props';
import { createRock } from './rocks';
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
  switch (def.kind) {
    case 'tree':
      return createTreeObstacle(def, assets);
    case 'prop':
      return createPropObstacle(def, assets);
    case 'rock':
      return createRock(def, assets);
    case 'building':
      return createBuildingObstacle(def, assets);
  }
}
