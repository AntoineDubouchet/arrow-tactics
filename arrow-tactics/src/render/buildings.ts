import * as THREE from 'three';
import { obstacleCenter, TILE, type ObstacleDef } from '../config/constants';
import { cloneScaledToFootprint, createMissingModelPlaceholder, isLazyModel, type EnvironmentAssets } from './assetLibrary';

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
/** Raccord VISUEL des virages de muraille (ObstacleDef.wallJoin) : le
 *  modele est plus etroit que sa case (0,8 sur 1), un segment qui bute
 *  contre le flanc d'un segment perpendiculaire s'arreterait donc juste
 *  avant lui. Il est allonge de cet ecart exact (mesure sur le modele) du
 *  cote du virage : recouvrement controle, sans toucher a l'emprise ni a la
 *  collision. `length`/`depth` : emprise d'origine du modele (avant
 *  rotation), le long de l'axe X local de la racine. */
function wallJoinGroup(def: ObstacleDef, model: THREE.Object3D, oriented: THREE.Group, length: number, depth: number): THREE.Object3D {
  const join = def.wallJoin;
  if (!join || (!join.minEnd && !join.maxEnd)) return oriented;
  const box = new THREE.Box3().setFromObject(model);
  const gap = Math.max(0, (depth - (box.max.z - box.min.z)) / 2);
  // Extremite +X locale de la racine : cote des coordonnees hautes ou basses
  // de l'axe du segment, selon sa rotation enregistree.
  const r = def.rotationY ?? 0;
  const horizontal = def.tilesX >= def.tilesZ;
  const plusIsMax = horizontal ? Math.cos(r) > 0 : -Math.sin(r) > 0;
  const plus = (plusIsMax ? join.maxEnd : join.minEnd) ? gap : 0;
  const minus = (plusIsMax ? join.minEnd : join.maxEnd) ? gap : 0;
  const joined = new THREE.Group();
  joined.add(oriented);
  joined.scale.x = (length + plus + minus) / length;
  joined.position.x = (plus - minus) / 2;
  return joined;
}

export function createBuildingObstacle(def: ObstacleDef, assets: EnvironmentAssets): THREE.Group {
  const width = def.tilesX * TILE;
  const depth = def.tilesZ * TILE;
  const { x: centerX, z: centerZ } = obstacleCenter(def);
  const scale = def.scale ?? 1;

  const prototype = assets.buildingsByName[def.buildingModel ?? ''];
  if (!prototype && isLazyModel(def.buildingModel ?? '')) {
    // Modele a la demande pas encore charge (voir ensureModels).
    const placeholder = createMissingModelPlaceholder(width, depth);
    placeholder.position.set(centerX, 0, centerZ);
    return placeholder;
  }
  if (!prototype) throw new Error(`Bâtiment inconnu : ${def.buildingModel}`);

  // Emprise qui suit la rotation (muraille) : `tilesX`/`tilesZ` sont deja
  // tournes, le modele est donc cale sur l'emprise d'ORIGINE puis tourne.
  const quarterTurns = Math.round((def.rotationY ?? 0) / (Math.PI / 2));
  const swapFit = def.footprintFollowsRotation === true && Math.abs(quarterTurns) % 2 === 1;
  const fitWidth = swapFit ? depth : width;
  const fitDepth = swapFit ? width : depth;

  // Modele recentre (son centre au sol a l'origine locale), place dans un
  // groupe d'orientation (correction native du modele), lui-meme dans la
  // racine posee au centre EXACT de l'emprise. Toute rotation tourne ainsi
  // autour du centre de l'emprise : tourner directement le clone recentre le
  // faisait pivoter autour de l'origine de son fichier, donc sortir de son
  // emprise. La racine porte position et rotation enregistrees (l'editeur les
  // reecrit, voir refreshEditorObjects) sans toucher a la correction.
  // Virage de muraille : echelle native et pose fixe dans la case de coin
  // (BuildingDef.nativeModelPose), jamais cale sur l'emprise.
  const pose = def.nativeModelPose;
  // Demi-segment de muraille : cale sur une emprise plus longue puis
  // comprime le long de X (ObstacleDef.modelLengthScale).
  const lengthScale = def.modelLengthScale ?? 1;
  const model = pose ? prototype.clone(true) : cloneScaledToFootprint(prototype, (fitWidth * scale) / lengthScale, fitDepth * scale);
  if (pose) {
    model.position.set(pose.offsetX, 0, pose.offsetZ);
    model.rotation.y = pose.yaw;
  }
  const oriented = new THREE.Group();
  // Correction native du modele + lacet visuel du camp (face exterieure d'une
  // muraille vers les hostiles, ObstacleDef.modelFacingYaw) : un demi-tour
  // autour du centre laisse le modele dans son emprise.
  oriented.rotation.y = (BUILDING_MODEL_ROTATION_OFFSET[def.buildingModel ?? ''] ?? 0) + (def.modelFacingYaw ?? 0);
  if (lengthScale !== 1) {
    const squashed = new THREE.Group();
    squashed.scale.x = lengthScale;
    squashed.add(model);
    oriented.add(squashed);
  } else {
    oriented.add(model);
  }
  const building = new THREE.Group();
  building.add(wallJoinGroup(def, model, oriented, fitWidth * scale, fitDepth * scale));
  // Pas de rotation aleatoire par defaut (contrairement aux props/arbres,
  // organiques) : un batiment a une orientation "canonique" (facade) — une
  // rotation fixe et previsible (ajustable a la main via l'outil Tourner de
  // l'editeur) plutot qu'un tirage aleatoire a chaque placement.
  building.rotation.y = def.rotationY ?? 0;
  building.position.set(centerX, 0, centerZ);
  return building;
}
