import * as THREE from 'three';
import { COLORS } from '../config/constants';
import type { EnvironmentAssets } from '../render/assetLibrary';
import { buildObstacleMesh } from '../render/obstacleFactory';
import { activeTerrain, appendCellSurfaceTriangles, surfaceY } from '../render/terrainSurface';
import { buildUnit } from '../render/unitMesh';
import { TerrainHeightField, type TerrainElevationCellDef } from '../config/terrainElevation';
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
 * Anneau plat dore sous le decor ou la Baliste selectionnes (et modele de
 * l'anneau de cible d'ordre d'attaque en bataille). Les unites selectionnees
 * ont leur propre anneau, a la couleur de leur camp
 * (render/unitSelectionRing.ts).
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
 * Zone de saisie de la poignee de rotation, a ajouter en ENFANT de l'anneau
 * de selection (meme position/echelle). Plus large que le trait visible
 * (0.85-1.0) pour etre confortable a attraper. Jamais dessinee
 * (`visible = false`) mais toujours raycastable : THREE.Raycaster ne teste
 * pas la visibilite des objets.
 */
export function createSelectionRingHitArea(): THREE.Mesh {
  const hitArea = new THREE.Mesh(new THREE.RingGeometry(0.6, 1.3, 32), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  hitArea.visible = false;
  return hitArea;
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
 *  le territoire de la case survolee, pour montrer le resultat AVANT le clic. */
export function buildUnitGhost(unitId: string, team: Team, x: number, z: number): THREE.Group {
  const mesh = buildUnit(unitId, team);
  if (team === 'enemy') mesh.rotation.y = Math.PI;
  mesh.position.set(x, surfaceY(x, z), z);
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
/** Pinceau de relief : case comblee par une liaison diagonale (orange). */
const PLATEAU_BRIDGE_PREVIEW_COLOR = 0xf59e0b;
/** Aperçu du pinceau "Effacer" du territoire : gris clair, distinct des
 *  couleurs de camp et du vert/rouge valide/invalide. */
export const TERRITORY_ERASE_PREVIEW_COLOR = 0xd4d4d4;

/** `color` (optionnel) remplace le vert/rouge : aperçu du pinceau de
 *  territoire, teinté de la couleur qui sera peinte. */
/** Petit repere d'extremite de muraille raccordable : pastille au bord de la
 *  case, du cote du connecteur libre ; plus grande et plus vive quand le
 *  curseur s'y aimante. */
export function buildWallEndMarker(x: number, z: number, dirX: number, dirZ: number, highlighted: boolean): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.CircleGeometry(highlighted ? 0.26 : 0.16, 20),
    new THREE.MeshBasicMaterial({ color: highlighted ? 0xffe08a : 0xe3b341, transparent: true, opacity: highlighted ? 0.95 : 0.75, side: THREE.DoubleSide, depthWrite: false }),
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(x + 0.5 + dirX * 0.42, 1.25 + surfaceY(x + 0.5, z + 0.5), z + 0.5 + dirZ * 0.42);
  mesh.renderOrder = 10;
  return mesh;
}

export function buildCellPreview(x: number, z: number, valid: boolean, color?: number): THREE.Mesh {
  // Relief : epouse la surface de la case (memes triangles que le sol, pente
  // de coin comprise) ; carte plate : a 0,03 au-dessus du sol, comme avant.
  const positions: number[] = [];
  appendCellSurfaceTriangles(activeTerrain(), x, z, 0.03, positions);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshBasicMaterial({
      color: color ?? (valid ? CELL_PREVIEW_VALID_COLOR : CELL_PREVIEW_INVALID_COLOR),
      transparent: true,
      opacity: 0.45,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  return mesh;
}

/**
 * Apercu du pinceau de relief : les cases futures `cells` dans leur vraie
 * geometrie (plateau, pentes cardinales, pentes de coin), surface verte si
 * la pose est valide, rouge sinon, avec le contour de chaque case. Cases
 * `bridged` (cles "x,z", liaisons diagonales comblees par sculptRelief) :
 * surface orange, pour qu'aucune case ne change sans etre signalee.
 */
export function buildReliefBrushPreview(cells: readonly TerrainElevationCellDef[], valid: boolean, bridged: ReadonlySet<string> = new Set()): THREE.Group {
  const group = new THREE.Group();
  const field = new TerrainHeightField(cells);
  const positions: number[] = [];
  const bridgePositions: number[] = [];
  const edges: number[] = [];
  for (const c of cells) {
    appendCellSurfaceTriangles(field, c.x, c.z, 0.04, bridged.has(`${c.x},${c.z}`) ? bridgePositions : positions);
    const h = field.cornerHeights(c.x, c.z);
    const p = (i: number) => [c.x + (i % 2), h[i]! + 0.05, c.z + (i < 2 ? 0 : 1)];
    for (const [a, b] of [[0, 1], [1, 3], [3, 2], [2, 0]] as const) edges.push(...p(a), ...p(b));
  }
  const surface = new THREE.BufferGeometry();
  surface.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  const fill = new THREE.Mesh(surface, new THREE.MeshBasicMaterial({ color: valid ? CELL_PREVIEW_VALID_COLOR : CELL_PREVIEW_INVALID_COLOR, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false }));
  fill.renderOrder = 10;
  const outline = new THREE.BufferGeometry();
  outline.setAttribute('position', new THREE.Float32BufferAttribute(edges, 3));
  const lines = new THREE.LineSegments(outline, new THREE.LineBasicMaterial({ color: valid ? 0x166534 : 0x7f1d1d, transparent: true, opacity: 0.9 }));
  lines.renderOrder = 11;
  group.add(fill, lines);
  if (bridgePositions.length > 0) {
    const bridge = new THREE.BufferGeometry();
    bridge.setAttribute('position', new THREE.Float32BufferAttribute(bridgePositions, 3));
    const bridgeFill = new THREE.Mesh(bridge, new THREE.MeshBasicMaterial({ color: PLATEAU_BRIDGE_PREVIEW_COLOR, transparent: true, opacity: 0.75, side: THREE.DoubleSide, depthWrite: false }));
    bridgeFill.renderOrder = 10;
    group.add(bridgeFill);
  }
  return group;
}

/**
 * Apercu du pinceau Surface : le contour clair de chaque case qui sera
 * peinte (cases existantes seulement) et un voile tres leger, sans masquer
 * la texture actuelle. Epouse le relief (plats, pentes, coins).
 */
export function buildSurfaceBrushPreview(cells: readonly { x: number; z: number }[], erase: boolean): THREE.Group {
  const group = new THREE.Group();
  const field = activeTerrain();
  const positions: number[] = [];
  const edges: number[] = [];
  for (const c of cells) {
    appendCellSurfaceTriangles(field, c.x, c.z, 0.03, positions);
    const h = field.cornerHeights(c.x, c.z);
    const p = (i: number) => [c.x + (i % 2), h[i]! + 0.04, c.z + (i < 2 ? 0 : 1)];
    for (const [a, b] of [[0, 1], [1, 3], [3, 2], [2, 0]] as const) edges.push(...p(a), ...p(b));
  }
  const surface = new THREE.BufferGeometry();
  surface.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  const fill = new THREE.Mesh(surface, new THREE.MeshBasicMaterial({ color: erase ? 0x94a3b8 : 0xfff7d6, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false }));
  fill.renderOrder = 10;
  const outline = new THREE.BufferGeometry();
  outline.setAttribute('position', new THREE.Float32BufferAttribute(edges, 3));
  const lines = new THREE.LineSegments(outline, new THREE.LineBasicMaterial({ color: erase ? 0xcbd5e1 : 0xfff7d6, transparent: true, opacity: 0.85 }));
  lines.renderOrder = 11;
  group.add(fill, lines);
  return group;
}
