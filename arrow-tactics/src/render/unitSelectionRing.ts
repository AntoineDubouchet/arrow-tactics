import * as THREE from 'three';
import { COLORS } from '../config/constants';
import type { Team } from '../sim/entity';

/**
 * Anneau de selection d'UNE UNITE, identique dans l'editeur, la preparation
 * et la bataille. Sa couleur est celle du camp proprietaire de l'unite, pas
 * celle d'un "etat selectionne" : une unite du joueur a un anneau bleu, une
 * unite ennemie un anneau rouge.
 *
 * Reserve aux unites selectionnees : la cible d'un ordre d'attaque, les
 * parchemins, la Baliste, les decors et les apercus de placement ont leurs
 * propres indicateurs.
 */

/** Couleur de chaque camp : seul point a etendre si d'autres joueurs
 *  arrivent. Memes teintes que les zones de deploiement (render/board.ts). */
const TEAM_COLORS: Record<Team, number> = {
  player: COLORS.playerZone,
  enemy: COLORS.enemyZone,
};

/** Taille de l'anneau par rapport au rayon de l'unite. */
const RING_RADIUS_FACTOR = 1.4;
/** Hauteur au-dessus du sol, pour eviter le scintillement avec le terrain. */
const RING_HEIGHT = 0.03;

/** Geometrie de rayon 1, partagee par tous les anneaux (mise a l'echelle). */
const ringGeometry = new THREE.RingGeometry(0.85, 1, 24);
/** Un materiau par couleur, partage par tous les anneaux de cette couleur et
 *  JAMAIS modifie apres creation : changer la couleur d'un anneau consiste a
 *  lui assigner un autre materiau, jamais a muter celui-ci (il recolorerait
 *  les anneaux des autres unites). Ni geometrie ni materiau ne doivent etre
 *  liberes par les appelants. */
const ringMaterials = new Map<number, THREE.MeshBasicMaterial>();

export function teamColor(team: Team): number {
  return TEAM_COLORS[team];
}

function ringMaterial(team: Team): THREE.MeshBasicMaterial {
  const color = teamColor(team);
  let material = ringMaterials.get(color);
  if (!material) {
    material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, side: THREE.DoubleSide });
    ringMaterials.set(color, material);
  }
  return material;
}

/** Anneau de rayon 1, a placer avec placeUnitSelectionRing ou a rattacher a
 *  un modele avec attachUnitSelectionRing. Jamais touche par les raycasts :
 *  un indicateur ne doit pas agrandir la zone cliquable de l'unite. */
export function createUnitSelectionRing(team: Team): THREE.Mesh {
  const ring = new THREE.Mesh(ringGeometry, ringMaterial(team));
  ring.rotation.x = -Math.PI / 2;
  ring.raycast = () => {};
  return ring;
}

/** Place un anneau directement dans la scene (coordonnees monde), sous une
 *  unite de rayon `unitRadius` au point (x, z). */
export function placeUnitSelectionRing(ring: THREE.Mesh, team: Team, x: number, z: number, unitRadius: number): void {
  ring.material = ringMaterial(team);
  ring.position.set(x, RING_HEIGHT, z);
  ring.scale.setScalar(unitRadius * RING_RADIUS_FACTOR);
  ring.visible = true;
}

/** Ajoute un anneau en ENFANT du modele d'une unite posee au sol. Les modeles
 *  sont mis a l'echelle a la racine (voir *_MODEL_SCALE dans render/*Rig.ts) :
 *  l'echelle du parent est compensee pour que l'anneau ait la meme taille
 *  monde qu'en bataille, quelle que soit l'unite. */
export function attachUnitSelectionRing(unitMesh: THREE.Object3D, team: Team, unitRadius: number): THREE.Mesh {
  const ring = createUnitSelectionRing(team);
  const parentScale = unitMesh.scale.x || 1;
  ring.position.set(0, RING_HEIGHT / parentScale, 0);
  ring.scale.setScalar((unitRadius * RING_RADIUS_FACTOR) / parentScale);
  unitMesh.add(ring);
  return ring;
}
