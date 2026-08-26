import * as THREE from 'three';
import { obstacleCenter, TILE, type ObstacleDef } from '../config/constants';
import { cloneScaledTo, pickRandom, type EnvironmentAssets } from './assetLibrary';

/**
 * Arbre-obstacle : un clone d'un vrai modele d'arbre low-poly (voir
 * assetLibrary.ts, Kenney Nature Kit, CC0), mis a l'echelle sur sa hauteur —
 * pas sa largeur, contrairement au rocher : un arbre se juge d'abord a sa
 * hauteur relative aux autres elements du plateau, sa cime peut deborder
 * legerement de la case qu'il occupe (comme avant : un vrai arbre a toujours
 * une ramure plus large que son tronc, ca ne ment pas sur la case qui bloque
 * vraiment, voir OBSTACLES et combatSystem/movementSystem qui n'utilisent
 * que l'emprise au sol, jamais cette geometrie visuelle).
 *
 * Un modele different est tire au sort par arbre (voir TREE_MODELS dans
 * assetLibrary.ts) pour que la carte ne lise pas comme des copies du meme
 * arbre partout — sauf si `def.treeModel` force un modele precis (Antoine
 * designe parfois un arbre par son apparence et veut le meme ailleurs,
 * plutot que de laisser le hasard decider).
 */
export function createTreeObstacle(def: ObstacleDef, assets: EnvironmentAssets): THREE.Group {
  const width = def.tilesX * TILE;
  const depth = def.tilesZ * TILE;
  const { x: centerX, z: centerZ } = obstacleCenter(def);
  const footprint = Math.min(width, depth);

  // Hauteur cible +20 %, demande par Antoine apres le tout premier passage :
  // l'arbre lisait un peu chetif a cote du rocher. `def.scale` multiplie ce
  // resultat pour varier deliberement la stature d'un arbre precis, au-dela
  // de la petite variation aleatoire deja presente ici.
  const targetHeight = (1.6 + footprint * 0.4 + Math.random() * 0.4) * 1.2 * (def.scale ?? 1);

  const prototype = def.treeModel ? assets.treesByName[def.treeModel] ?? pickRandom(assets.trees) : pickRandom(assets.trees);
  const tree = cloneScaledTo(prototype, targetHeight, 'height');
  // Rotation forcee si fournie (voir ObstacleDef.rotationY, utilisee par
  // l'editeur de maps pour que la rotation choisie par Antoine survive),
  // sinon comportement inchange (aleatoire a chaque rendu).
  tree.rotation.y = def.rotationY ?? Math.random() * Math.PI * 2;
  tree.position.x += centerX;
  tree.position.z += centerZ;

  return tree;
}
