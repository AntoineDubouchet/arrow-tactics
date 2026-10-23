import * as THREE from 'three';
import { obstacleCenter, TILE, type ObstacleDef } from '../config/constants';
import { cloneScaledTo, createMissingModelPlaceholder, isLazyModel, type EnvironmentAssets } from './assetLibrary';

/**
 * Prop independant : un seul modele .glb (buche, souche, champignon,
 * buisson, fleur, cactus, feu de camp, statue, pot, panneau, tente — voir
 * assetLibrary.ts, PROP_MODELS), mis a l'echelle sur sa LARGEUR pour tenir
 * dans l'emprise (comme un rocher), pas sur sa hauteur (comme un arbre) : la
 * plupart de ces modeles sont plus larges/bas que hauts, un calage sur la
 * hauteur les ferait deborder de leur case.
 */
export function createPropObstacle(def: ObstacleDef, assets: EnvironmentAssets, random: () => number): THREE.Group {
  const width = def.tilesX * TILE;
  const depth = def.tilesZ * TILE;
  const { x: centerX, z: centerZ } = obstacleCenter(def);
  const footprint = Math.min(width, depth) * 0.85 * (def.scale ?? 1);

  const prototype = assets.propsByName[def.propModel ?? ''];
  if (!prototype && isLazyModel(def.propModel ?? '')) {
    // Modele a la demande pas encore charge (voir ensureModels).
    const placeholder = createMissingModelPlaceholder(width, depth);
    placeholder.position.set(centerX, 0, centerZ);
    return placeholder;
  }
  if (!prototype) throw new Error(`Prop inconnu : ${def.propModel}`);

  const prop = cloneScaledTo(prototype, footprint, 'width');
  prop.rotation.y = def.rotationY ?? random() * Math.PI * 2;
  prop.position.x += centerX;
  prop.position.z += centerZ;
  return prop;
}
