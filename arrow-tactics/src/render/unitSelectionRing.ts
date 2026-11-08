import * as THREE from 'three';
import { sidePalette } from '../config/factions';
import type { Team } from '../sim/entity';
import { surfaceY } from './terrainSurface';
import { markGameplayOverlay } from './fogOfWar';

/**
 * Anneau de selection d'UNE UNITE, identique dans l'editeur, la preparation
 * et la bataille. Sa couleur est celle du camp proprietaire de l'unite, pas
 * celle d'un "etat selectionne" : une unite du joueur a un anneau bleu, une
 * unite du camp Neutre un anneau brun.
 *
 * Reserve aux unites selectionnees ou inspectees ; le retour d'ordre
 * d'attaque (render/attackOrderFeedback.ts) en reprend exactement la
 * geometrie et le placement (createAnimatedUnitRing, placeUnitRing). Les
 * parchemins, la Baliste, les decors et les apercus de placement ont leurs
 * propres indicateurs.
 */

/** Couleur de chaque camp : palette de son allegeance (config/factions.ts :
 *  joueur Bleu, cote adverse Neutre brun). Memes teintes que les zones de
 *  deploiement (render/board.ts). */
const TEAM_COLORS: Record<Team, number> = {
  player: sidePalette('player').primary,
  enemy: sidePalette('enemy').primary,
};

/** Taille de l'anneau par rapport au rayon de l'unite : un peu en dessous de
 *  l'empreinte reelle, pour que les anneaux d'un groupe dense (une unite par
 *  case) restent distincts au lieu de former un amas. Seule source de la
 *  taille d'un anneau d'unite, quel que soit le camp. Anciennes valeurs :
 *  1,4, 0,9 puis 0,85. */
const RING_RADIUS_FACTOR = 0.765;
/** Hauteur au-dessus du sol, pour eviter le scintillement avec le terrain. */
const RING_HEIGHT = 0.03;
/** Part du biais de profondeur des reperes (render/fogOfWar.ts, OVERLAY_DEPTH_BIAS) pour un anneau
 *  d'unite : 0,001 unite monde. L'arc avant de l'anneau passe sous les pieds de l'unite, a quelques
 *  millimetres de profondeur seulement : avec le biais entier (0,01) les pieds ne le masquaient plus
 *  et l'anneau semblait peint devant les jambes (2026-11-08). RING_HEIGHT suffit a l'ecarter du
 *  terrain (~0,025 sur la ligne de vue), aucun scintillement. */
const RING_DEPTH_BIAS_SCALE = 0.1;

/** Flash de selection (2026-11-08) : au moment d'une VRAIE selection du joueur (clic, Maj + clic,
 *  rectangle, double-clic, inspection d'un batiment), l'anneau gonfle puis revient en
 *  SELECTION_PULSE_MS ; jamais en boucle, le simple maintien de la selection ne pulse pas.
 *  `elapsedMs` : temps ecoule depuis l'evenement ; 1 hors de la fenetre. */
export const SELECTION_PULSE_MS = 240;
export function selectionPulseScale(elapsedMs: number): number {
  if (!(elapsedMs >= 0) || elapsedMs >= SELECTION_PULSE_MS) return 1;
  return 1 + 0.22 * Math.sin(Math.PI * (elapsedMs / SELECTION_PULSE_MS));
}

/** Geometrie de rayon 1, partagee par tous les anneaux (mise a l'echelle).
 *  Bande de 20 % du rayon : un anneau compact reste lisible. */
const ringGeometry = new THREE.RingGeometry(0.8, 1, 32);
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
  // Repere prioritaire : rendu apres brouillard et nappes, profondeur de la scene relue
  // (render/fogOfWar.ts), biais reduit pour passer sous les pieds.
  markGameplayOverlay(ring, RING_DEPTH_BIAS_SCALE);
  return ring;
}

/** Anneau d'unite au materiau PROPRE (opacite animable sans toucher aux
 *  autres anneaux), sinon identique a createUnitSelectionRing : meme
 *  geometrie, a placer avec placeUnitRing. Le materiau est a liberer par
 *  l'appelant s'il detruit l'anneau. */
export function createAnimatedUnitRing(team: Team): THREE.Mesh {
  const ring = new THREE.Mesh(ringGeometry, ringMaterial(team).clone());
  ring.rotation.x = -Math.PI / 2;
  ring.raycast = () => {};
  markGameplayOverlay(ring, RING_DEPTH_BIAS_SCALE);
  return ring;
}

/** Position, hauteur et taille d'un anneau d'unite pose dans la scene
 *  (coordonnees monde), sous une unite de rayon `unitRadius` au point
 *  (x, z) : seule regle de taille, partagee par tous les anneaux d'unite. */
export function placeUnitRing(ring: THREE.Mesh, x: number, z: number, unitRadius: number): void {
  ring.position.set(x, RING_HEIGHT + surfaceY(x, z), z);
  ring.scale.setScalar(unitRadius * RING_RADIUS_FACTOR);
  ring.visible = true;
}

/** Place un anneau directement dans la scene (coordonnees monde), sous une
 *  unite de rayon `unitRadius` au point (x, z). */
export function placeUnitSelectionRing(ring: THREE.Mesh, team: Team, x: number, z: number, unitRadius: number): void {
  ring.material = ringMaterial(team);
  placeUnitRing(ring, x, z, unitRadius);
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
