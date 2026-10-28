import * as THREE from 'three';
import { COLORS } from '../config/constants';
import type { EnvironmentAssets } from '../render/assetLibrary';
import { buildObstacleMesh } from '../render/obstacleFactory';
import { activeTerrain, appendCellSurfaceTriangles, cellSurfaceMatrix, surfaceY } from '../render/terrainSurface';
import { buildUnit } from '../render/unitMesh';
import { cornerHeightsOf, EDGE_CORNERS, OPPOSITE_SLOPE_DIRECTION, SLOPE_DIRECTION_VECTORS, TerrainHeightField, cornerOfShape, isConcaveCornerSlope, type CornerShape, type SlopeDirection, type TerrainElevationCellDef } from '../config/terrainElevation';
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

/** Fleche de l'outil Pente : triangle plat pose sur la case, pointe vers le
 *  haut de la future pente. */
const SLOPE_ARROW_YAW: Record<SlopeDirection, number> = { N: 0, W: Math.PI / 2, S: Math.PI, E: -Math.PI / 2 };

export function buildSlopeArrow(x: number, z: number, dir: SlopeDirection, field: TerrainHeightField = activeTerrain()): THREE.Mesh {
  const shape = new THREE.Shape([new THREE.Vector2(0, 0.36), new THREE.Vector2(-0.26, -0.22), new THREE.Vector2(0.26, -0.22)]);
  const mesh = new THREE.Mesh(
    new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false }),
  );
  mesh.matrixAutoUpdate = false;
  cellSurfaceMatrix(field, x, z, 0.06, mesh.matrix).multiply(new THREE.Matrix4().makeRotationY(SLOPE_ARROW_YAW[dir]));
  mesh.renderOrder = 11;
  return mesh;
}

const SLOPE_LOW_EDGE_COLOR = 0x3b82f6;
const SLOPE_HIGH_EDGE_COLOR = 0xfacc15;

/**
 * Apercu de l'outil Pente sur la case (x, z) : la surface inclinee qu'aura
 * la pente (verte, ou rouge si refusee), son bord BAS (bande bleue) et son
 * bord HAUT (bande jaune) a leurs hauteurs, et la fleche de montee. `level`
 * : niveau de la pente si elle est posable ; inconnu (refus), l'apercu
 * reste a la hauteur actuelle de la case.
 */
export function buildSlopePreview(x: number, z: number, dir: SlopeDirection, level: number | null): THREE.Group {
  const group = new THREE.Group();
  const valid = level !== null;
  const corners = valid ? cornerHeightsOf(level, dir) : activeTerrain().cornerHeights(x, z);
  const lift = 0.03;
  const at = (i: number): THREE.Vector3 => new THREE.Vector3(x + (i % 2), corners[i]! + lift, z + (i < 2 ? 0 : 1));
  const quad = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, color: number, opacity: number, order: number): THREE.Mesh => {
    const geometry = new THREE.BufferGeometry().setFromPoints([a, b, c, a, c, d]);
    const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color, transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false }));
    mesh.renderOrder = order;
    return mesh;
  };
  group.add(quad(at(0), at(1), at(3), at(2), valid ? 0x4ade80 : 0xef4444, 0.45, 10));
  // Bandes le long des bords bas et haut, a l'interieur de la case.
  const edgeStrip = (side: SlopeDirection, color: number) => {
    const [i0, i1] = EDGE_CORNERS[side];
    const p0 = at(i0!);
    const p1 = at(i1!);
    const inward = SLOPE_DIRECTION_VECTORS[OPPOSITE_SLOPE_DIRECTION[side]];
    const w = 0.14;
    const shift = (p: THREE.Vector3) => new THREE.Vector3(p.x + inward.dx * w, p.y + 0.01, p.z + inward.dz * w);
    group.add(quad(p0.clone().setY(p0.y + 0.01), p1.clone().setY(p1.y + 0.01), shift(p1), shift(p0), color, 0.95, 12));
  };
  edgeStrip(OPPOSITE_SLOPE_DIRECTION[dir], SLOPE_LOW_EDGE_COLOR);
  edgeStrip(dir, SLOPE_HIGH_EDGE_COLOR);
  group.add(buildSlopeArrow(x, z, dir, valid ? new TerrainHeightField([{ x, z, level, slope: dir }]) : activeTerrain()));
  return group;
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
 * Apercu de l'outil Coin de pente sur la case (x, z) : la surface qu'aura la
 * pente de coin (verte, rouge si refusee) et un point sur le coin
 * « different » : blanc sur le coin haut d'un coin exterieur, bleu sur le
 * coin bas d'un coin interieur (meme code que le bord bas de Pente).
 * `level` : niveau de la pente si elle est posable ; inconnu (refus),
 * l'apercu reste a la hauteur actuelle de la case.
 */
export function buildCornerSlopePreview(x: number, z: number, dir: CornerShape, level: number | null): THREE.Group {
  const group = new THREE.Group();
  const valid = level !== null;
  const field = valid ? new TerrainHeightField([{ x, z, level, slope: dir }]) : activeTerrain();
  const positions: number[] = [];
  appendCellSurfaceTriangles(field, x, z, 0.04, positions);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  const fill = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: valid ? CELL_PREVIEW_VALID_COLOR : CELL_PREVIEW_INVALID_COLOR, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false }));
  fill.renderOrder = 10;
  const index = { NW: 0, NE: 1, SW: 2, SE: 3 }[cornerOfShape(dir)];
  const h = field.cornerHeights(x, z);
  // Point du coin different, legerement rentre dans la case pour rester visible.
  const marker = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 8), new THREE.MeshBasicMaterial({ color: isConcaveCornerSlope(dir) ? 0x38bdf8 : 0xffffff, depthTest: false }));
  marker.position.set(x + (index % 2 === 0 ? 0.12 : 0.88), h[index]! + 0.06, z + (index < 2 ? 0.12 : 0.88));
  marker.renderOrder = 12;
  group.add(fill, marker);
  return group;
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
