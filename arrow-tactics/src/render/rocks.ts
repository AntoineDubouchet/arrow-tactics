import * as THREE from 'three';
import { clamp } from '../core/math';
import { obstacleCenter, TILE, type ObstacleDef } from '../config/constants';
import { cloneScaledTo, pickRandom, type EnvironmentAssets } from './assetLibrary';

/** Marge de securite : la masse du rocher reste legerement en retrait de
 *  l'emprise reelle pour que la hitbox (voir OBSTACLES) corresponde toujours
 *  a ce que le joueur voit occupe, jamais un bloc qui deborderait
 *  visuellement de sa case. */
const FOOTPRINT_INSET = 0.92;

/**
 * Place `mesh` a cote de `anchor` (meme niveau de sol, jamais empile dessus)
 * a une distance et un angle donnes, en restant dans l'emprise autorisee.
 * `cloneScaledTo` a deja recentre `mesh` sur (0,0) et pose son pied a y=0 :
 * on ajoute simplement le decalage voulu par-dessus.
 */
function placeBeside(mesh: THREE.Group, anchor: THREE.Group, angle: number, dist: number, halfW: number, halfD: number): void {
  const x = clamp(anchor.position.x + Math.cos(angle) * dist, -halfW, halfW);
  const z = clamp(anchor.position.z + Math.sin(angle) * dist, -halfD, halfD);
  mesh.position.x += x;
  mesh.position.z += z;
  mesh.rotation.y = Math.random() * Math.PI * 2;
}

/** Petites pierres eparpillees au pied du rocher, comme sur la photo de
 *  reference : contrairement a la masse principale, elles peuvent deborder
 *  legerement de l'emprise (meme logique que la cime d'un arbre, voir
 *  createTreeObstacle) — purement decoratives, elles ne bloquent rien de
 *  plus que ce que le rocher bloque deja. */
function scatterBaseStones(rock: THREE.Group, width: number, depth: number, debrisModels: THREE.Group[]): void {
  const count = 2 + Math.floor(Math.random() * 4);
  const halfW = width / 2;
  const halfD = depth / 2;

  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const ringDist = Math.max(halfW, halfD) * (0.85 + Math.random() * 0.35);
    const size = 0.25 + Math.random() * 0.3;

    const stone = cloneScaledTo(pickRandom(debrisModels), size, 'width');
    stone.position.x += Math.cos(angle) * ringDist;
    stone.position.z += Math.sin(angle) * ringDist;
    stone.rotation.y = Math.random() * Math.PI * 2;
    rock.add(stone);
  }
}

/**
 * Rocher : composition HORIZONTALE, pas empilee — revirement du 2026-08-08
 * apres que la structure precedente (plusieurs "tiers" de blocs empiles du
 * bas vers le haut, y compris avec de vrais modeles .glb) ait quand meme
 * produit un look de "totem"/colonne verticale. Antoine a demande d'abandonner
 * l'empilement en hauteur : une masse principale posee au sol (70-80 % du
 * plus petit cote de l'emprise), une masse secondaire ACCOLEE LATERALEMENT au
 * meme niveau (jamais dessus), parfois une troisieme plus petite, puis des
 * debris au pied. La hauteur finale vient uniquement des proportions
 * naturelles des modeles choisis (voir assetLibrary.ts, ROCK_MASS_MODELS —
 * deliberement filtre aux modeles mesures larges/bas, jamais les rock_tall*),
 * jamais d'un empilement artificiel.
 *
 * Suite (meme jour) : cette premiere version lisait "trop plate, comme des
 * dalles" — la masse principale et la secondaire piochent maintenant en
 * priorite dans ROCK_TALL_MASS_MODELS (sous-ensemble de ROCK_MASS_MODELS
 * naturellement le plus haut, ratio largeur/hauteur mesure 0.42-0.53) plutot
 * que dans tout le pool (qui descendait jusqu'a 0.26) — cible d'Antoine :
 * hauteur visuelle finale autour de 40-60 % de la largeur de la masse
 * principale. Toujours aucun scale non-uniforme : on choisit le bon modele
 * au depart plutot que de deformer un modele plat pour le faire paraitre haut.
 *
 * La silhouette suit l'emprise exacte de l'obstacle de simulation (voir
 * OBSTACLES) pour que ce qu'on voit et ce qui bloque les tirs soient toujours
 * le meme objet — seules les masses principale/secondaire/tertiaire y sont
 * contraintes ; les petites pierres au pied peuvent deborder legerement,
 * purement decoratif.
 */
export function createRock(def: ObstacleDef, assets: EnvironmentAssets): THREE.Group {
  const rock = new THREE.Group();
  const width = def.tilesX * TILE;
  const depth = def.tilesZ * TILE;
  const { x: centerX, z: centerZ } = obstacleCenter(def);
  const minSide = Math.min(width, depth);
  const halfInsetW = (width * FOOTPRINT_INSET) / 2;
  const halfInsetD = (depth * FOOTPRINT_INSET) / 2;

  const mainSize = minSide * (0.7 + Math.random() * 0.1);
  const main = cloneScaledTo(pickRandom(assets.rockTallMasses), mainSize, 'width');
  main.position.x += clamp((Math.random() - 0.5) * (halfInsetW * 2 - mainSize), -halfInsetW, halfInsetW);
  main.position.z += clamp((Math.random() - 0.5) * (halfInsetD * 2 - mainSize), -halfInsetD, halfInsetD);
  main.rotation.y = Math.random() * Math.PI * 2;
  rock.add(main);

  // Secondaire : puise dans le pool "haut" une fois sur deux pour renforcer
  // la presence verticale globale (demande d'Antoine), sinon dans le pool
  // complet ou les dalles plates pour garder un peu de variete de silhouette.
  const secondarySize = mainSize * (0.4 + Math.random() * 0.15);
  const secondaryRoll = Math.random();
  const secondaryPrototype =
    secondaryRoll < 0.4
      ? pickRandom(assets.rockTallMasses)
      : secondaryRoll < 0.7
        ? pickRandom(assets.rockMasses)
        : pickRandom(assets.rockFlatAccents);
  const secondary = cloneScaledTo(secondaryPrototype, secondarySize, 'width');
  const angle1 = Math.random() * Math.PI * 2;
  // Distance choisie pour un leger chevauchement (les deux masses se
  // touchent/fusionnent), plutot que d'etre simplement posees cote a cote
  // sans contact visuel.
  const dist1 = (mainSize + secondarySize) * 0.32;
  placeBeside(secondary, main, angle1, dist1, halfInsetW, halfInsetD);
  rock.add(secondary);

  if (Math.random() < 0.5) {
    const tertiarySize = mainSize * (0.22 + Math.random() * 0.13);
    const tertiary = cloneScaledTo(pickRandom(assets.rockMasses), tertiarySize, 'width');
    const angle2 = angle1 + Math.PI * (0.6 + Math.random() * 0.8);
    const dist2 = (mainSize + tertiarySize) * 0.32;
    placeBeside(tertiary, main, angle2, dist2, halfInsetW, halfInsetD);
    rock.add(tertiary);
  }

  scatterBaseStones(rock, width, depth, assets.rockDebris);

  // Rotation d'ensemble optionnelle (voir ObstacleDef.rotationY) : tourne
  // tout le cluster compose (main+secondaire+tertiaire+debris) autour de son
  // propre centre, par-dessus les rotations aleatoires internes de chaque
  // sous-partie — utilisee par l'editeur de maps pour que la rotation
  // choisie par Antoine survive au lieu d'etre re-tiree au hasard. Absente
  // par defaut : comportement inchange (pas de rotation d'ensemble).
  if (def.rotationY !== undefined) rock.rotation.y = def.rotationY;

  rock.position.set(centerX, 0, centerZ);
  return rock;
}
