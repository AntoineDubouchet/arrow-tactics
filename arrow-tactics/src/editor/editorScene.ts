import * as THREE from 'three';
import { COLORS } from '../config/constants';
import type { EnvironmentAssets } from '../render/assetLibrary';
import { buildObstacleMesh } from '../render/obstacleFactory';
import { buildUnit } from '../render/unitMesh';
import type { Team } from '../sim/entity';
import type { EditorObstacle, EditorUnit, PlacementTemplate } from './editorState';

/**
 * Cote rendu de l'editeur : construit le visuel d'UN obstacle place (via
 * buildObstacleMesh, meme fonction que le jeu — pas de duplication de
 * logique visuelle) et le fantome de placement.
 *
 * Une fonction par obstacle, pas un groupe complet reconstruit d'un coup :
 * createRock/createTreeObstacle tirent leur composition au hasard
 * (Math.random) a CHAQUE appel — un rocher ou un arbre deja pose ne doit
 * jamais etre reconstruit tant que ses donnees n'ont pas change, sous peine
 * de le voir "sauter" (nouvelle rotation, nouvelle grappe de rochers) a
 * chaque clic ailleurs sur le plateau. C'est exactement le bug remonte par
 * Antoine : main.ts garde donc un cache mesh par id et n'appelle cette
 * fonction que pour un obstacle reellement nouveau (voir refreshEditorObjects).
 */
export function buildObstacleView(o: EditorObstacle, assets: EnvironmentAssets): THREE.Group {
  const mesh = buildObstacleMesh(o, assets);
  // Tag qui permet au raycast de retrouver l'obstacle depuis le mesh touche,
  // en remontant la hierarchie (voir main.ts, findEditorObstacleId).
  mesh.userData['editorId'] = o.id;
  return mesh;
}

/**
 * Visuel d'une unite placee dans l'editeur (bestiaire du jeu, voir
 * data/units.ts) — reutilise buildUnit, la meme fonction que la phase de
 * placement en jeu (main.ts, refreshPlayerPreview) : le camp choisit la
 * couleur automatiquement, exactement comme en partie reelle. Pas de
 * probleme de materiaux partages ici (contrairement aux rochers/arbres
 * .glb) : buildUnit fabrique des boites avec des materiaux neufs a chaque
 * appel, donc pas de cache a proteger.
 */
export function buildUnitView(u: EditorUnit): THREE.Group {
  const mesh = buildUnit(u.unitId, u.team);
  // Meme convention que le reste du rendu (voir UnitViews.computeFacing,
  // main.ts startPlacement) : le camp ennemi fait face au camp joueur, donc
  // tourne de 180° par rapport a l'orientation par defaut.
  if (u.team === 'enemy') mesh.rotation.y = Math.PI;
  mesh.userData['editorUnitId'] = u.id;
  return mesh;
}

/**
 * Anneau plat sous l'objet selectionne, meme technique que la surbrillance
 * de la phase de placement (main.ts, createSelectionRing) — dupliquee ici
 * plutot que partagee, pour ne pas faire dependre le module editeur de
 * main.ts (mauvais sens de dependance).
 */
export function createSelectionRing(radius: number): THREE.Mesh {
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(radius * 0.85, radius, 24),
    new THREE.MeshBasicMaterial({ color: COLORS.playerArrowAccent, transparent: true, opacity: 0.9, side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.02;
  return ring;
}

/**
 * Rend `mesh` semi-transparent en clonant chaque materiau rencontre avant de
 * modifier son opacite. Necessaire pour les rochers/arbres .glb : leurs
 * clones partagent leurs materiaux entre instances (voir assetLibrary.ts,
 * cloneScaledTo — clone() ne duplique pas les materiaux), donc modifier
 * l'opacite en place rendrait TOUS les rochers/arbres du meme modele
 * transparents, pas seulement le fantome. Sans risque pour les unites (boites
 * a materiaux neufs, voir buildUnitView) mais cloner ne coute rien de plus.
 */
function makeGhostTransparent(mesh: THREE.Group): void {
  mesh.traverse((obj) => {
    const m = obj as THREE.Mesh;
    if (!m.isMesh) return;
    const materials = Array.isArray(m.material) ? m.material : [m.material];
    const cloned = materials.map((mat) => {
      const c = mat.clone();
      c.transparent = true;
      c.opacity = 0.5;
      c.depthWrite = false;
      return c;
    });
    m.material = Array.isArray(m.material) ? cloned : cloned[0]!;
  });
}

/** Fantome semi-transparent qui suit la souris pendant le placement d'un
 *  obstacle/decor — position CONTINUE (2026-08-16, placement libre : suit
 *  l'intersection raycaster -> terrain exactement, sans arrondi). */
export function buildGhost(template: PlacementTemplate, x: number, z: number, assets: EnvironmentAssets): THREE.Group {
  const fake: EditorObstacle = { ...template, x, z, id: -1 };
  const mesh = buildObstacleMesh(fake, assets);
  makeGhostTransparent(mesh);
  return mesh;
}

/** Fantome semi-transparent qui suit la souris pendant le placement d'une
 *  unite — le camp (donc la couleur) se met deja a jour en temps reel selon
 *  la moitie du plateau survolee, pour montrer le resultat AVANT le clic. */
export function buildUnitGhost(unitId: string, team: Team, x: number, z: number): THREE.Group {
  const mesh = buildUnit(unitId, team);
  if (team === 'enemy') mesh.rotation.y = Math.PI;
  mesh.position.set(x, 0, z);
  makeGhostTransparent(mesh);
  return mesh;
}

/** Aperçu vert/rouge d'une cellule de terrain (outils "Ajouter case"/
 *  "Supprimer case", 2026-08-16, Part AF de la demande) — vert = action
 *  valide à cet endroit, rouge = invalide (cellule déjà existante pour
 *  Ajouter, absente/bloquée pour Supprimer). Toujours aligné sur la grille
 *  (contrairement au fantôme d'obstacle libre) : une case entière, jamais
 *  arrondie autrement qu'au coin de grille le plus proche. */
const CELL_PREVIEW_VALID_COLOR = 0x4ade80;
const CELL_PREVIEW_INVALID_COLOR = 0xef4444;

export function buildCellPreview(x: number, z: number, valid: boolean): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({
      color: valid ? CELL_PREVIEW_VALID_COLOR : CELL_PREVIEW_INVALID_COLOR,
      transparent: true,
      opacity: 0.45,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(x + 0.5, 0.03, z + 0.5);
  return mesh;
}
