import * as THREE from 'three';
import { COLORS, TILE } from '../config/constants';

/**
 * Aperçu de destination pendant un glisser en phase de placement (demande
 * d'Antoine, 2026-08-10) : "le tour de la case qui serait pré-sélectionnée
 * s'illuminerait en bleu pour prévenir le joueur d'où il place son unité" —
 * un cadre par position prévisualisée (un glisser de GROUPE en affiche
 * plusieurs a la fois, voir main.ts). Couleur reprise de COLORS.playerZone,
 * deja la teinte "case du joueur" ailleurs dans le jeu (zone de placement au
 * sol) plutot qu'une nouvelle couleur inventee pour l'occasion.
 *
 * Geometrie/materiau partages au niveau du module (jamais mutes ensuite,
 * contrairement aux materiaux d'unites — voir unitMesh.ts) : aucun risque a
 * les reutiliser entre plusieurs cadres.
 */
const FRAME_THICKNESS = 0.06;
const FRAME_HEIGHT = 0.01;
const FRAME_Y = 0.03;

const material = new THREE.MeshBasicMaterial({ color: COLORS.playerZone });
const horizontalGeometry = new THREE.BoxGeometry(TILE, FRAME_HEIGHT, FRAME_THICKNESS);
const verticalGeometry = new THREE.BoxGeometry(FRAME_THICKNESS, FRAME_HEIGHT, TILE);

function createFrame(): THREE.Group {
  const frame = new THREE.Group();
  const half = TILE / 2;

  const top = new THREE.Mesh(horizontalGeometry, material);
  top.position.set(0, FRAME_Y, -half + FRAME_THICKNESS / 2);
  const bottom = new THREE.Mesh(horizontalGeometry, material);
  bottom.position.set(0, FRAME_Y, half - FRAME_THICKNESS / 2);
  const left = new THREE.Mesh(verticalGeometry, material);
  left.position.set(-half + FRAME_THICKNESS / 2, FRAME_Y, 0);
  const right = new THREE.Mesh(verticalGeometry, material);
  right.position.set(half - FRAME_THICKNESS / 2, FRAME_Y, 0);

  frame.add(top, bottom, left, right);
  return frame;
}

export class PlacementHighlight {
  readonly group = new THREE.Group();

  /** Affiche un cadre a chaque position donnee (cases centres, meme
   *  convention que le reste du placement) — reconstruit entierement a
   *  chaque appel plutot que mis en cache : le nombre de cadres change d'un
   *  appel a l'autre (glisser simple vs glisser de groupe), meme logique que
   *  playerPreview/combatOverlay.syncPlacement. */
  show(positions: { x: number; z: number }[]): void {
    this.group.clear();
    for (const pos of positions) {
      const frame = createFrame();
      frame.position.set(pos.x, 0, pos.z);
      this.group.add(frame);
    }
  }

  hide(): void {
    this.group.clear();
  }
}
