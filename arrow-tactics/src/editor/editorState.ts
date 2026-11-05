import { isBlockingMapObstacle, obstacleBounds, obstacleCenter, PLACEMENT_ROWS, type ObstacleBounds, type ObstacleDef } from '../config/constants';
import { isWaterSurface, surfaceBrushOrigin, type GroundTextureId, type SurfaceBrushSize, type SurfaceCellDef } from '../config/groundSurfaces';
import {
  BALLISTA_PLACEMENT_TILES,
  buildCellIndex,
  CAMP_CLEAR_RADIUS,
  cellKey,
  computeBallistaObstacle,
  computePlayerArrowOrigin,
  DEFAULT_MAP,
  dropLegacyWalls,
  resolveMapCells,
  snapBallistaOrigin,
  type MapBuildingPlacement,
  type MapCampDef,
  type WallLineDef,
  type MapDef,
  type MapUnitPlacement,
  type TerrainCellDef,
  type TerrainType,
} from '../config/mapDef';
import {
  deriveReliefLogic,
  reliefBrushCore,
  reliefBrushOrigin,
  renderReliefLogic,
  sculptRelief,
  SLOPE_DIRECTION_VECTORS,
  SLOPE_DIRECTIONS,
  TerrainHeightField,
  TERRAIN_LEVEL_MAX,
  TERRAIN_LEVEL_MIN,
  type ReliefBrushSize,
  type ReliefDelta,
  type ReliefSculptContext,
  type RenderedRelief,
  type SlopeDirection,
  type SlopeShape,
  type TerrainElevationCellDef,
} from '../config/terrainElevation';
import {
  buildTerritoryIndex,
  isFootprintOwnedBy,
  resolveMapTerritory,
  territoryOwnerAtPoint,
  type TerritoryCell,
  type TerritoryIndex,
  type TerritoryTeam,
} from '../config/territory';
import { buildingFootprintTiles } from '../data/buildings';
import { getWallType } from '../data/walls';
import { campFacingFrom } from '../data/campLayout';
import { DEFAULT_STARTING_BASE_PRESET, reservedCells, reservedOverlapsDisc, startingBaseLayoutAt, startingBaseRotationFor, STARTING_BASE_PRESETS, type StartingBaseLayout } from '../config/startingBase';
import { getCampKind } from '../data/camps';
import { planWallLine, segmentBoxDistance, segmentWallLine, wallLineCells, wallSegmentAt, type WallLinePlan, type WallPlacementContext, type WallPoint, type WallSegment } from '../core/wallLine';
import { resourceNodeCellKeys, resourceOfObstacle, type ResourcePileDef } from '../config/resourceNodes';
import { computeCliffObstacles } from '../config/terrainElevation';
import { getUnit } from '../data/units';
import type { Team } from '../sim/entity';
import { forestTreesForCell, type ForestBrushSize, type ForestDensity, type ForestTreeTypeId } from './forestBrush';

/**
 * Etat de l'editeur de maps (chantier en cours, voir CLAUDE.md) : les
 * obstacles et les unites places, la selection courante, l'outil actif. Pure
 * donnee, zero Three.js ici — meme esprit de separation que sim/ (voir
 * World), meme si l'editeur n'est pas la simulation de bataille : ca permet
 * de tester la logique de placement/selection sans navigateur, et de
 * brancher un futur MapSerializer sans toucher a cette classe.
 *
 * Un id stable par objet (pas juste son index dans le tableau) est necessaire
 * des cette etape : le rendu doit pouvoir retrouver "quel objet a ete clique"
 * via un tag sur le mesh (userData), et l'index seul ne survivrait pas a une
 * suppression au milieu du tableau. Obstacles et unites partagent le meme
 * compteur d'id (nextId) : leurs id ne se collisionnent jamais, meme si les
 * deux listes sont manipulees separement.
 */

export interface EditorObstacle extends ObstacleDef {
  id: number;
}

/** Gabarit d'obstacle a placer, choisi dans l'asset browser : pas encore un
 *  EditorObstacle (pas de position tant qu'on n'a pas clique sur le
 *  plateau). */
export type PlacementTemplate = Omit<ObstacleDef, 'cornerX' | 'cornerZ' | 'x' | 'z'>;

/**
 * Unite placee dans l'editeur (bestiaire du jeu, voir data/units.ts). Le
 * camp n'est PAS choisi explicitement dans l'asset browser : c'est le
 * proprietaire de la case dans le territoire (voir territoryOwnerAt) — case
 * bleue -> joueur, case rouge -> ennemi, case neutre -> pose refusee.
 * `team` est recalcule a chaque deplacement ; il n'est jamais recalcule au
 * chargement ni quand on repeint le territoire sous l'unite.
 */
export interface EditorUnit {
  id: number;
  unitId: string;
  team: Team;
  x: number;
  z: number;
  /** Niveau d'unite explicite de la carte (MapUnitPlacement.level),
   *  conserve tel quel au chargement et a la sauvegarde ; pas encore
   *  modifiable dans l'editeur (2026-11-02). */
  level?: number;
}

/** Batiment GAMEPLAY de scenario (onglet « Bâtiments », voir
 *  MapDef.buildings) : vrai batiment de data/buildings.ts, distinct des
 *  decors. (x, z) = centre de son emprise (BuildingDef.footprintTiles*),
 *  calee sur la grille ; camp joueur pour cette premiere version. */
export interface EditorBuilding {
  id: number;
  buildingId: string;
  team: Team;
  x: number;
  z: number;
  /** Rotation visuelle, voir MapBuildingPlacement.rotationY. */
  rotationY?: number;
}

/** Ligne de mur V2 du brouillon (MapDef.walls, WallLineDef) : la meme
 *  geometrie que le jeu (core/wallLine.ts), un id d'edition en plus. */
export interface EditorWallLine extends WallLineDef {
  id: number;
}

/** Une selection d'UNITES est un ensemble ordonne d'unites, toujours
 *  normalise par selectUnits : une seule unite = `unit`, deux ou plus =
 *  `unit-group` (jamais un groupe a un membre). `ids[0]` sert d'ANCRE pour
 *  un deplacement de groupe. Decors et Baliste
 *  restent des selections a part, jamais melangees a des unites. */
export type EditorSelection =
  | { kind: 'obstacle'; id: number }
  | { kind: 'unit'; id: number }
  | { kind: 'unit-group'; ids: number[] }
  /** Batiment gameplay de scenario. */
  | { kind: 'building'; id: number }
  /** Ligne de mur V2 entiere. */
  | { kind: 'wall'; id: number }
  /** Element de carte Survie (camp, petit tas, baril ; 2026-11-03). */
  | { kind: 'feature'; id: number }
  /** La Baliste (unique, toujours presente) : deplacable, jamais supprimee
   *  ni tournee. */
  | { kind: 'ballista' }
  | null;

/** Etat du relief au DEBUT d'un trait de sculpture (EditorState.reliefStrokeStart) :
 *  tout le trait se mesure sur lui (une case logique ne change qu'une fois). */
export interface ReliefStrokeStart {
  logic: ReadonlyMap<string, number>;
  rendered: RenderedRelief;
  field: TerrainHeightField;
}

/** Plan d'un tampon de pinceau de relief (voir EditorState.reliefBrushPlanAt). */
export interface ReliefBrushPlan {
  /** Case nord-ouest du coeur logique. */
  originX: number;
  originZ: number;
  /** Coeur logique du tampon sur des cases de terrain (cles "x,z"), ajoute
   *  aux cases peintes du trait ; la partie hors carte ou dans un trou est
   *  simplement coupee. */
  core: string[];
  /** Relief futur : toutes les cases que le trait (cases deja peintes + ce
   *  tampon) change, si le tampon est valide ; sinon le carre du pinceau
   *  dans la carte, tel qu'il est (apercu rouge). */
  cells: TerrainElevationCellDef[];
  /** Cases (cles "x,z") de `cells` comblees par une liaison diagonale
   *  (apercu orange : aucune case modifiee hors apercu). */
  bridged: string[];
  /** Champ logique apres le trait (a appliquer avec `cells`). */
  logic: Map<string, number>;
  /** Changement de niveau du coeur du tampon, pour la ligne d'etat :
   *  « niveau 0 → 1 », ou une formulation generale si le coeur couvre
   *  plusieurs niveaux. */
  levels: string;
  /** `reason` null : aucune case de terrain sous le pinceau (vide, hors
   *  carte ou trou) — rien a appliquer, mais rien de refuse non plus
   *  (apercu vide, jamais rouge). */
  status: { ok: true } | { ok: false; reason: string | null };
}

export type EditorTool =
  | { type: 'select' }
  | { type: 'place-obstacle'; template: PlacementTemplate }
  | { type: 'place-unit'; unitId: string }
  /** Petit tas ou baril (2026-11-03), pose continue. */
  | { type: 'place-feature'; feature: EditorFeatureTemplate }
  /** Pose de batiments gameplay de scenario (reste actif, comme les unites). */
  | { type: 'place-building'; buildingId: string; rotationY?: number }
  /** Mur V2 : premier clic = A, second = B (meme regle que le jeu) ;
   *  `start` = A deja pose. Porte : clic sur un segment d'une ligne. */
  | { type: 'place-wall'; wallType: string; start?: WallPoint }
  | { type: 'place-wall-gate'; wallType: string }
  | { type: 'add-cell'; terrain: TerrainType }
  | { type: 'remove-cell' }
  /** Sculpture du relief (config/terrainElevation.ts, sculptRelief) :
   *  pinceau continu Surelever (+1) / Abaisser (-1), une couche par trait,
   *  taille 1×1 ou 4×4. */
  | { type: 'relief-brush'; delta: ReliefDelta; size: ReliefBrushSize }
  /** Outils EXPLICITES d'une case (2026-11-01, restaures en complement des
   *  pinceaux) : Monter une case, Descendre une case, Pente (orientation par
   *  glisser, sinon deduite des voisines). Voir EditorState.planCellRelief. */
  | { type: 'cell-relief'; op: CellReliefOp }
  /** Pinceau de territoire : `team` peint la case pour ce camp, `null`
   *  l'efface (case neutre). */
  | { type: 'paint-territory'; team: TerritoryTeam | null }
  /** Pinceau Surface (purement visuel, config/groundSurfaces.ts) : peint le
   *  dessus des cases du carre `size × size` avec `surface` ; `null` (Par
   *  defaut) efface la peinture. */
  | { type: 'paint-surface'; surface: GroundTextureId | null; size: SurfaceBrushSize }
  /** Pinceau Foret (editor/forestBrush.ts) : plante des arbres-decors dans
   *  le disque de diametre `size`, ou les retire (`erase`). */
  | { type: 'forest-brush'; treeType: ForestTreeTypeId; density: ForestDensity; size: ForestBrushSize; erase: boolean };

/** Operation d'un outil explicite de relief (EditorTool `cell-relief`). */
export type CellReliefOp = 'raise' | 'lower' | 'slope';

/** Resultat d'un outil explicite de relief sur une case : sa nouvelle
 *  definition et sa hauteur logique, ou la raison du refus. */
export type CellReliefPlan = { ok: true; cell: TerrainElevationCellDef; logic: number } | { ok: false; reason: string };

/** Proprietaire de la Baliste de la carte : toujours le joueur (meme camp
 *  que spawnBallistaBuilding en jeu) ; son placement interactif exige une
 *  empreinte entierement dans ce territoire. */
export const EDITOR_BALLISTA_OWNER: TerritoryTeam = 'player';

/** Les deux rectangles se chevauchent (un simple contact de bord ne compte
 *  pas). */
function boundsOverlap(a: ObstacleBounds, b: ObstacleBounds): boolean {
  return a.minX < b.maxX && a.maxX > b.minX && a.minZ < b.maxZ && a.maxZ > b.minZ;
}

/** Position et camp d'une unite, pour annuler / retablir un deplacement. */
export interface EditorUnitState {
  id: number;
  x: number;
  z: number;
  team: Team;
}

/** Etat des objets poses (decors, unites) et de la selection, pour annuler /
 *  retablir une pose ou une suppression. Les tableaux sont copies mais les
 *  objets sont les MEMES references : rejouer l'etat restaure exactement les
 *  objets crees ou supprimes (camp, position, rotation, ordre), sans rien
 *  recalculer — l'historique etant lineaire, chaque objet a deja retrouve
 *  ses valeurs de l'epoque quand l'etat est restaure. */
export interface EditorObjectsSnapshot {
  obstacles: EditorObstacle[];
  units: EditorUnit[];
  buildings: EditorBuilding[];
  walls: EditorWallLine[];
  features: EditorFeature[];
  selection: EditorSelection;
}

/** Element de carte Survie edite (2026-11-03) : camp neutre (MapDef.camps ;
 *  son decor reste dans les obstacles), petit tas (MapDef.resourcePiles),
 *  objet destructible (MapDef.destructibles : baril). Selectionnable,
 *  supprimable (annuler / retablir) et enregistre tel quel. */
export type EditorFeature =
  | { id: number; kind: 'camp'; camp: MapCampDef }
  | { id: number; kind: 'pile'; pile: ResourcePileDef }
  | { id: number; kind: 'destructible'; destructible: { kind: string; x: number; z: number } };

/** Position (monde) d'un element de carte Survie. */
export function featurePosition(f: EditorFeature): { x: number; z: number } {
  return f.kind === 'camp' ? { x: f.camp.x, z: f.camp.z } : f.kind === 'pile' ? { x: f.pile.x, z: f.pile.z } : { x: f.destructible.x, z: f.destructible.z };
}

/** Elements posables a la main (catalogue de l'editeur, groupe Survie) :
 *  petits tas, baril, camp neutre d'un type de data/camps.ts
 *  (`camp:raiders_small`...) et Depart Survie (position de la Baliste). */
export type EditorFeatureTemplate = 'pile-wood' | 'pile-stone' | 'barrel' | 'start' | `camp:${string}`;

/** Type de camp d'un gabarit `camp:<kind>`, null pour les autres. */
export function campKindOfTemplate(template: EditorFeatureTemplate): string | null {
  return template.startsWith('camp:') ? template.slice('camp:'.length) : null;
}

/** Regles de pose d'un camp a la main (PROVISOIRES, 2026-11-03) : ecart
 *  minimal entre camps, distance au Depart Survie, cases ouvertes requises
 *  dans la couronne (abords « manifestement inaccessibles » sinon). Le
 *  generateur garde ses propres distances (anneau, 20 cases entre camps). */
export const CAMP_MIN_SPACING = 10;
export const CAMP_START_CLEARANCE = 17;
export const CAMP_RING_OPEN_MIN = 12;

/** Validation legere d'une carte de Survie (editeur, 2026-11-03) : les
 *  erreurs bloquent « Tester le scénario », les avertissements non. */
export interface SurvivalValidation {
  errors: string[];
  warnings: string[];
}

/** Centre cale sur la grille de l'emprise d'un batiment dont le centre
 *  tomberait pres de (x, z) : coin de case entier, centre = coin + taille / 2
 *  (meme convention que le placement des batiments en preparation). */
export function snapBuildingCenter(buildingId: string, x: number, z: number): { x: number; z: number } {
  const { tilesX, tilesZ } = buildingFootprintTiles(buildingId);
  return { x: Math.round(x - tilesX / 2) + tilesX / 2, z: Math.round(z - tilesZ / 2) + tilesZ / 2 };
}

/** Rectangle de l'emprise d'un batiment centre en (x, z). */
export function buildingBoundsAt(buildingId: string, x: number, z: number): ObstacleBounds {
  const { tilesX, tilesZ } = buildingFootprintTiles(buildingId);
  return { minX: x - tilesX / 2, maxX: x + tilesX / 2, minZ: z - tilesZ / 2, maxZ: z + tilesZ / 2 };
}

/** Ce que modifie le changement de taille (voir setSize), pour l'annuler. */
export interface EditorMapShapeSnapshot {
  width: number;
  height: number;
  cells: TerrainCellDef[];
  elevation: TerrainElevationCellDef[];
  /** Champ logique de la sculpture (entrees [cle de sommet, niveau]). */
  reliefLogic: [string, number][];
  /** Surfaces peintes : une case supprimee perd la sienne, que l'annulation
   *  restaure avec la case. */
  surfaces: SurfaceCellDef[];
  ballista: { x: number; z: number };
  ballistaExplicit: boolean;
}

function copySelection(selection: EditorSelection): EditorSelection {
  return selection?.kind === 'unit-group' ? { kind: 'unit-group', ids: [...selection.ids] } : selection ? { ...selection } : null;
}

export class EditorState {
  obstacles: EditorObstacle[];
  units: EditorUnit[];
  /** Batiments gameplay de scenario (voir EditorBuilding). */
  buildings: EditorBuilding[];
  /** Murs V2 (voir EditorWallLine). */
  walls: EditorWallLine[];
  /** Camps, petits tas et barils (2026-11-03). */
  features: EditorFeature[];
  /** Metadonnees de la carte source, conservees a l'enregistrement : regles
   *  de la Survie Hero RTS et origine (graine du generateur). */
  readonly survivalRules: MapDef['survivalRules'];
  readonly generator: MapDef['generator'];
  /** Camp de depart (2026-11-04, config/startingBase.ts) : preset et
   *  rotation, recalculee a chaque pose ou deplacement du Depart Survie (porte
   *  vers le cote le plus degage). Absent : preset par defaut, rotation 0. */
  startingBase: { preset: string; rotation: number } | undefined;
  /** Taille du brouillon en cours d'edition (en cases) — independante de la
   *  taille du plateau reellement en jeu tant que la carte n'est pas
   *  sauvegardee/testee (voir main.ts, rebuildEditorBoard). Modifiable via
   *  setSize (panneau "Taille" de l'editeur). */
  width: number;
  height: number;
  selection: EditorSelection = null;
  tool: EditorTool = { type: 'select' };

  /** Cellules de terrain du brouillon (2026-08-16, chantier map irrégulière,
   *  voir CLAUDE.md) — Map clée par "x,z" (voir config/mapDef.ts, cellKey)
   *  pour un lookup/toggle O(1). Initialisée depuis `resolveMapCells(source)` :
   *  une map SANS `cells` explicite (toute map antérieure à cette date)
   *  redevient donc un rectangle plein dès l'ouverture dans l'éditeur —
   *  exactement son apparence actuelle, aucune migration nécessaire. */
  private cellMap: Map<string, TerrainCellDef>;

  /** Relief du brouillon (voir MapDef.elevationCells) : seulement les cases
   *  qui ne sont pas plates au niveau 0, clees par cellKey. */
  private elevationMap: Map<string, TerrainElevationCellDef>;
  /** Champ de hauteur du brouillon, reconstruit a la demande apres toute
   *  modification du relief ou des cases. */
  private heightFieldCache: TerrainHeightField | null = null;
  /** Hauteurs logiques des cases (sculpture, voir ReliefLogic) : deduites
   *  du relief au chargement, puis corrigees par MapDef.reliefLogic. */
  private reliefLogicMap: Map<string, number>;
  /** Surface canonique du champ logique (renderReliefLogic), a la demande. */
  private renderedReliefCache: RenderedRelief | null = null;
  /** Surfaces peintes du brouillon (voir MapDef.surfaceCells), clees par
   *  cellKey : seulement des cases existantes, jamais la surface par defaut. */
  private surfaceMap: Map<string, GroundTextureId>;

  private nextId = 1;

  /** Centre de la Baliste du brouillon (voir MapDef.ballista). */
  ballista: { x: number; z: number };
  /** Faux tant que la Baliste n'a jamais ete deplacee dans l'editeur (map
   *  sans champ `ballista`) : la position suit alors le repli historique
   *  computePlayerArrowOrigin, y compris apres un changement de taille, et
   *  l'export n'ecrit aucun champ — une ancienne map rouverte puis
   *  reenregistree reste identique. Vrai des qu'elle est deplacee ou si la
   *  map en definit une. */
  ballistaExplicit: boolean;

  /** Territoire EXPLICITE du brouillon (voir MapDef.territory), copie de la
   *  map chargee — `undefined` si elle n'en avait pas (repli historique, et
   *  aucun champ a l'export), `[]` s'il est explicitement vide. Modifie
   *  uniquement par paintTerritoryCell / restoreTerritory / removeCell. */
  territory: TerritoryCell[] | undefined;

  /** Index du territoire resolu (voir territoryOwnerAt), construit a la
   *  demande et invalide par toute modification du territoire ou des
   *  cellules (le repli historique depend des cellules). */
  private territoryIndexCache: TerritoryIndex | null = null;

  /** Par defaut, repart de la map actuelle : l'editeur sert d'abord a
   *  AJUSTER ce qui existe deja, pas a repartir d'une carte vide. Un appelant
   *  peut fournir une autre MapDef (voir main.ts, chargement d'un fichier
   *  sauvegarde) pour reprendre l'edition d'une carte precedemment exportee. */
  constructor(source: MapDef = DEFAULT_MAP) {
    this.obstacles = source.obstacles.map((o) => ({ ...o, id: this.nextId++ }));
    this.units = [
      ...source.playerUnits.map((u) => this.toEditorUnit(u, 'player')),
      ...source.enemyUnits.map((u) => this.toEditorUnit(u, 'enemy')),
    ];
    // Wall V1 supprime (2026-11-02) : ses pieces ne sont jamais reprises.
    this.buildings = dropLegacyWalls(source.buildings ?? []).map((b) => this.toEditorBuilding(b));
    this.walls = (source.walls ?? []).map((w) => ({ ...w, ...(w.gates ? { gates: [...w.gates] } : {}), id: this.nextId++ }));
    this.features = [
      ...(source.camps ?? []).map((camp): EditorFeature => ({ id: this.nextId++, kind: 'camp', camp: structuredClone(camp) })),
      ...(source.resourcePiles ?? []).map((pile): EditorFeature => ({ id: this.nextId++, kind: 'pile', pile: { ...pile } })),
      ...(source.destructibles ?? []).map((d): EditorFeature => ({ id: this.nextId++, kind: 'destructible', destructible: { ...d } })),
    ];
    this.survivalRules = source.survivalRules;
    this.generator = source.generator ? { ...source.generator } : undefined;
    this.startingBase = source.startingBase ? { preset: source.startingBase.preset, rotation: source.startingBase.rotation ?? 0 } : undefined;
    this.width = source.width;
    this.height = source.height;
    this.cellMap = buildCellIndex(resolveMapCells(source));
    this.elevationMap = new Map();
    for (const e of source.elevationCells ?? []) {
      if (!this.cellMap.has(cellKey(e.x, e.z)) || (e.level === 0 && !e.slope)) continue;
      this.elevationMap.set(cellKey(e.x, e.z), { x: e.x, z: e.z, level: e.level, ...(e.slope ? { slope: e.slope } : {}) });
    }
    this.reliefLogicMap = deriveReliefLogic(this.heightField(), this.cells);
    for (const v of source.reliefLogic ?? []) {
      if (v.level === 0) this.reliefLogicMap.delete(cellKey(v.x, v.z));
      else this.reliefLogicMap.set(cellKey(v.x, v.z), v.level);
    }
    this.territory = source.territory?.map((c) => ({ x: c.x, z: c.z, team: c.team }));
    // Entree sur une case absente (trou, fichier modifie a la main) : ecartee.
    this.surfaceMap = new Map();
    for (const c of source.surfaceCells ?? []) if (this.cellMap.has(cellKey(c.x, c.z))) this.surfaceMap.set(cellKey(c.x, c.z), c.surface);

    this.ballistaExplicit = source.ballista !== undefined;
    this.ballista = source.ballista ? { x: source.ballista.x, z: source.ballista.z } : computePlayerArrowOrigin(source);
    // Position chargee invalide (fichier modifie a la main, carte dont les
    // cases ont change...) : la valide la plus proche sur la grille de la
    // Baliste. Le repli historique d'une map SANS champ n'est jamais deplace
    // automatiquement (comportement inchange pour les anciennes maps).
    if (this.ballistaExplicit && !this.canPlaceBallistaAt(this.ballista.x, this.ballista.z)) {
      const nearest = this.findNearestValidBallistaOrigin(this.ballista.x, this.ballista.z);
      if (nearest) {
        console.warn(`Position de Baliste invalide (${this.ballista.x}, ${this.ballista.z}) : deplacee en (${nearest.x}, ${nearest.z}).`);
        this.ballista = nearest;
      } else {
        console.warn(`Position de Baliste invalide (${this.ballista.x}, ${this.ballista.z}) et aucune position valide trouvee : conservee telle quelle.`);
      }
    }
  }

  /** Rectangle de collision de la Baliste centree en (x, z) — l'empreinte
   *  REELLE de la bataille (computeBallistaObstacle), jamais une autre
   *  taille. */
  private ballistaBoundsAt(x: number, z: number): ObstacleBounds {
    return obstacleBounds(computeBallistaObstacle({ x, z }));
  }

  /** Vrai si le point (x, z) est dans l'empreinte de la Baliste actuelle
   *  (bord exclu). */
  isInsideBallista(x: number, z: number): boolean {
    const b = this.ballistaBoundsAt(this.ballista.x, this.ballista.z);
    return x > b.minX && x < b.maxX && z > b.minZ && z < b.maxZ;
  }

  /** Vrai si la case (x, z) est sous l'empreinte de la Baliste actuelle. */
  private isCellUnderBallista(x: number, z: number): boolean {
    return boundsOverlap({ minX: x, maxX: x + 1, minZ: z, maxZ: z + 1 }, this.ballistaBoundsAt(this.ballista.x, this.ballista.z));
  }

  /** Vrai si la Baliste peut etre centree en (x, z) : toutes les cases sous
   *  son empreinte existent (donc ni hors du plateau ni au-dessus d'un
   *  trou), aucun obstacle COLLIDABLE ne la chevauche et aucune unite n'a son
   *  centre dedans. Validite GEOMETRIQUE seulement, sans territoire : sert a
   *  relocaliser une position chargee invalide, sans jamais deplacer une
   *  Baliste chargee hors du territoire joueur (voir canMoveBallistaTo pour
   *  un deplacement interactif). */
  canPlaceBallistaAt(x: number, z: number): boolean {
    const b = this.ballistaBoundsAt(x, z);
    for (let cz = Math.floor(b.minZ); cz < b.maxZ; cz++) {
      for (let cx = Math.floor(b.minX); cx < b.maxX; cx++) {
        if (!this.hasCellAt(cx, cz)) return false;
      }
    }
    // Relief : tour posee sur une emprise entierement plate, a un seul niveau.
    if (this.heightField().flatLevelOver(b.minX, b.maxX, b.minZ, b.maxZ) === null) return false;
    if (this.boundsTouchWater(b)) return false;
    if (this.obstacles.some((o) => isBlockingMapObstacle(o) && boundsOverlap(b, obstacleBounds(o)))) return false;
    if (this.buildings.some((bd) => boundsOverlap(b, buildingBoundsAt(bd.buildingId, bd.x, bd.z)))) return false;
    return !this.units.some((u) => u.x > b.minX && u.x < b.maxX && u.z > b.minZ && u.z < b.maxZ);
  }

  /** Position valide la plus proche de (x, z) sur la grille de la Baliste,
   *  ou null. Deterministe : anneaux de distance croissante autour du point
   *  cale, candidats tries par distance puis z puis x. */
  private findNearestValidBallistaOrigin(x: number, z: number): { x: number; z: number } | null {
    const start = snapBallistaOrigin(x, z);
    const maxRing = Math.max(this.width, this.height);
    for (let ring = 0; ring <= maxRing; ring++) {
      const candidates: { x: number; z: number; d: number }[] = [];
      for (let dz = -ring; dz <= ring; dz++) {
        for (let dx = -ring; dx <= ring; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== ring) continue;
          const c = { x: start.x + dx, z: start.z + dz };
          candidates.push({ ...c, d: (c.x - x) ** 2 + (c.z - z) ** 2 });
        }
      }
      candidates.sort((a, b) => a.d - b.d || a.z - b.z || a.x - b.x);
      const found = candidates.find((c) => this.canPlaceBallistaAt(c.x, c.z));
      if (found) return { x: found.x, z: found.z };
    }
    return null;
  }

  /** Vrai si les BALLISTA_PLACEMENT_TILES × BALLISTA_PLACEMENT_TILES cases
   *  de placement de la Baliste centree en (x, z) (centre cale par
   *  snapBallistaOrigin) appartiennent toutes au joueur. */
  isBallistaFootprintInPlayerTerritory(x: number, z: number): boolean {
    const cornerX = Math.round(x - BALLISTA_PLACEMENT_TILES / 2);
    const cornerZ = Math.round(z - BALLISTA_PLACEMENT_TILES / 2);
    return isFootprintOwnedBy(this.territoryIndex(), EDITOR_BALLISTA_OWNER, cornerX, cornerZ, BALLISTA_PLACEMENT_TILES, BALLISTA_PLACEMENT_TILES);
  }

  /** Vrai si la Baliste (Depart Survie) peut etre deplacee en (x, z)
   *  (centre deja cale) : voir startPlacementIssue. Le territoire joueur
   *  n'est plus exige depuis le 2026-11-03 (une carte dessinee pose son
   *  depart avant de peindre son territoire). */
  canMoveBallistaTo(x: number, z: number): boolean {
    return this.startPlacementIssue(x, z) === null;
  }

  /** Raison pour laquelle le Depart Survie ne peut pas etre centre en
   *  (x, z) (centre deja cale sur sa grille), ou null : emprise 3 × 3 sur des
   *  cases existantes, plates, hors eau, sans obstacle bloquant (gisements
   *  compris), batiment ni unite (canPlaceBallistaAt) ; aucun camp a moins de
   *  CAMP_START_CLEARANCE cases. */
  startPlacementIssue(x: number, z: number, rotation?: number): string | null {
    if (!this.canPlaceBallistaAt(x, z)) return 'emplacement invalide (cases manquantes, eau, relief, obstacle, gisement, bâtiment ou unité sous l’emprise 3 × 3)';
    const camp = this.features.find((f) => f.kind === 'camp' && Math.hypot(f.camp.x - x, f.camp.z - z) < CAMP_START_CLEARANCE);
    if (camp) return `camp trop proche (moins de ${CAMP_START_CLEARANCE} cases)`;
    // Camp de depart (2026-11-04) : toute son emprise (enceinte + marge).
    const layout = this.startingBaseLayoutFor(x, z, rotation);
    if (layout) {
      const level = this.elevationAt(Math.floor(x), Math.floor(z)).level;
      const sources = resourceNodeCellKeys(this.obstacles);
      const walls = this.wallPieces();
      // Cases que le camp occupe (Maisons, Auberge, palissade) : une unite
      // n'y est refusee que la ; ailleurs dans l'emprise, elle reste libre.
      const occupied = new Set<string>();
      for (const b of layout.buildings) {
        const r = buildingBoundsAt(b.buildingId, b.x, b.z);
        for (let cx = Math.floor(r.minX); cx < Math.ceil(r.maxX); cx++) for (let cz = Math.floor(r.minZ); cz < Math.ceil(r.maxZ); cz++) occupied.add(cellKey(cx, cz));
      }
      for (const line of layout.walls) for (const seg of segmentWallLine(line, getWallType(line.type).segmentLength)) for (const w of wallLineCells(seg)) occupied.add(cellKey(w.x, w.z));
      // Gisements (emprise 2 x 2) et bosquet (1 x 1) garantis, derives du
      // Depart (2026-11-05).
      for (const d of layout.deposits) for (const dx of [-1, 0]) for (const dz of [-1, 0]) occupied.add(cellKey(Math.round(d.x) + dx, Math.round(d.z) + dz));
      for (const t of layout.trees) occupied.add(cellKey(Math.floor(t.x), Math.floor(t.z)));
      for (const c of reservedCells(layout.reserved)) {
        if (!this.hasCellAt(c.x, c.z)) return 'camp de départ hors de la carte';
        if (this.isWaterCell(c.x, c.z)) return 'eau dans l’emprise du camp de départ';
        const e = this.elevationAt(c.x, c.z);
        if (e.slope || e.level !== level) return 'relief dans l’emprise du camp de départ';
        if (sources.has(cellKey(c.x, c.z))) return 'arbre ou gisement dans l’emprise du camp de départ';
        const cell = { minX: c.x, maxX: c.x + 1, minZ: c.z, maxZ: c.z + 1 };
        if (this.obstacles.some((o) => isBlockingMapObstacle(o) && boundsOverlap(cell, obstacleBounds(o)))) return 'obstacle dans l’emprise du camp de départ';
        if (this.buildings.some((b) => boundsOverlap(cell, buildingBoundsAt(b.buildingId, b.x, b.z)))) return 'bâtiment dans l’emprise du camp de départ';
        if (walls.some((p) => wallLineCells(p.segment).some((w) => w.x === c.x && w.z === c.z))) return 'palissade dans l’emprise du camp de départ';
      }
      if (this.units.some((u) => occupied.has(cellKey(Math.floor(u.x), Math.floor(u.z))))) return 'unité sous un bâtiment ou la palissade du camp de départ';
      if (this.features.some((f) => f.kind === 'camp' && reservedOverlapsDisc(layout.reserved, f.camp.x, f.camp.z, CAMP_CLEAR_RADIUS))) return 'camp neutre dans l’emprise du camp de départ';
    }
    return null;
  }

  /** Preset du camp de depart de cette carte (carte de Survie Hero RTS),
   *  ou null. */
  private startingPreset(): string | null {
    if (this.survivalRules !== 'hero-rts') return null;
    const preset = this.startingBase?.preset ?? DEFAULT_STARTING_BASE_PRESET;
    return preset !== 'none' && STARTING_BASE_PRESETS[preset] ? preset : null;
  }

  /** Case ouverte pour orienter la porte du camp de depart : dans la
   *  carte, hors eau, sans source ni objet bloquant. */
  private isOpenForStart(x: number, z: number, sources: ReadonlySet<string>): boolean {
    return this.hasCellAt(x, z) && !this.isWaterCell(x, z) && !sources.has(cellKey(x, z)) && !this.isCellOccupied(x, z);
  }

  /** Camp de depart derive si le Depart Survie etait centre en (x, z) :
   *  rotation donnee, sinon porte vers le cote le plus degage ; null sans
   *  preset. Apercu, validation, pose. */
  startingBaseLayoutFor(x: number, z: number, rotation?: number): StartingBaseLayout | null {
    const preset = this.startingPreset();
    if (!preset) return null;
    const sources = resourceNodeCellKeys(this.obstacles);
    return startingBaseLayoutAt({ x, z }, preset, rotation ?? startingBaseRotationFor({ x, z }, preset, (cx, cz) => this.isOpenForStart(cx, cz, sources)));
  }

  /** Camp de depart du Depart Survie actuel (pose), ou null. */
  get startingBaseLayout(): StartingBaseLayout | null {
    return this.ballistaExplicit ? this.startingBaseLayoutFor(this.ballista.x, this.ballista.z, this.startingBase?.rotation ?? 0) : null;
  }

  /** Cases (coordonnees entieres) dont le centre est dans la couronne
   *  rMin < d <= rMax autour de (cx, cz). */
  private discCells(cx: number, cz: number, rMin: number, rMax: number): { x: number; z: number }[] {
    const out: { x: number; z: number }[] = [];
    for (let z = Math.floor(cz - rMax); z <= Math.ceil(cz + rMax); z++) {
      for (let x = Math.floor(cx - rMax); x <= Math.ceil(cx + rMax); x++) {
        const d = Math.hypot(x + 0.5 - cx, z + 0.5 - cz);
        if (d > rMin && d <= rMax) out.push({ x, z });
      }
    }
    return out;
  }

  /** Raison pour laquelle un camp ne peut pas etre centre en (x, z), ou
   *  null (memes criteres que le generateur, sans sa connexite exacte) : sa
   *  clairiere (CAMP_CLEAR_RADIUS) entierement sur des cases existantes,
   *  hors eau, plates a un seul niveau (pas de falaise), sans batiment,
   *  palissade, Depart Survie, unite, obstacle bloquant (arbre, gros
   *  gisement, structure) ; aucun autre camp a moins de CAMP_MIN_SPACING, le
   *  Depart Survie a plus de CAMP_START_CLEARANCE ; abords ouverts (au moins
   *  CAMP_RING_OPEN_MIN cases libres dans la couronne de 2 cases). Les
   *  decors traversables poses a la main ne genent pas et restent a part.
   *  `ignoreId` : le camp lui-meme (deplacement). */
  campPlacementIssue(x: number, z: number, ignoreId?: number): string | null {
    const r = CAMP_CLEAR_RADIUS;
    // Cases des arbres et des gros gisements (bloquants en jeu).
    const sources = resourceNodeCellKeys(this.obstacles);
    let level: number | null = null;
    for (const c of this.discCells(x, z, -1, r)) {
      if (!this.hasCellAt(c.x, c.z)) return 'hors de la carte';
      if (this.isWaterCell(c.x, c.z)) return 'eau';
      if (sources.has(cellKey(c.x, c.z))) {
        const cell = { minX: c.x, maxX: c.x + 1, minZ: c.z, maxZ: c.z + 1 };
        const source = this.obstacles.find((o) => resourceOfObstacle(o) !== null && boundsOverlap(cell, obstacleBounds(o)));
        return source && resourceOfObstacle(source) === 'wood' ? 'arbre' : 'gros gisement';
      }
      const e = this.elevationAt(c.x, c.z);
      if (e.slope || (level !== null && e.level !== level)) return 'relief (falaise ou pente)';
      level = e.level;
      if (this.isCellUnderBallista(c.x, c.z) && this.ballistaExplicit) return 'Départ Survie';
      const cell = { minX: c.x, maxX: c.x + 1, minZ: c.z, maxZ: c.z + 1 };
      if (this.buildings.some((b) => boundsOverlap(cell, buildingBoundsAt(b.buildingId, b.x, b.z)))) return 'bâtiment';
      if (this.wallPieces().some((p) => wallLineCells(p.segment).some((w) => w.x === c.x && w.z === c.z))) return 'palissade';
      if (this.units.some((u) => Math.floor(u.x) === c.x && Math.floor(u.z) === c.z)) return 'unité';
      const blocker = this.obstacles.find((o) => {
        if (!isBlockingMapObstacle(o)) return false;
        const center = obstacleCenter(o);
        return (Math.floor(center.x) === c.x && Math.floor(center.z) === c.z) || boundsOverlap(cell, obstacleBounds(o));
      });
      if (blocker) return resourceOfObstacle(blocker) === 'wood' ? 'arbre' : resourceOfObstacle(blocker) ? 'gros gisement' : 'obstacle';
    }
    // Emprise du camp de depart (2026-11-04) : jamais sous un camp neutre.
    const base = this.startingBaseLayout;
    if (base && reservedOverlapsDisc(base.reserved, x, z, r)) return 'emprise du camp de départ';
    const other = this.features.find((f) => f.kind === 'camp' && f.id !== ignoreId && Math.hypot(f.camp.x - x, f.camp.z - z) < CAMP_MIN_SPACING);
    if (other) return `autre camp trop proche (moins de ${CAMP_MIN_SPACING} cases)`;
    if (this.ballistaExplicit && Math.hypot(this.ballista.x - x, this.ballista.z - z) < CAMP_START_CLEARANCE) return `Départ Survie trop proche (moins de ${CAMP_START_CLEARANCE} cases)`;
    let open = 0;
    for (const c of this.discCells(x, z, r, r + 2)) {
      if (!this.hasCellAt(c.x, c.z) || this.isWaterCell(c.x, c.z) || sources.has(cellKey(c.x, c.z))) continue;
      const e = this.elevationAt(c.x, c.z);
      if (e.slope || e.level !== level) continue;
      if (this.isCellOccupied(c.x, c.z)) continue;
      open++;
    }
    if (open < CAMP_RING_OPEN_MIN) return 'abords fermés (zone inaccessible)';
    return null;
  }

  /** Deplace un element de Survie (camp entier, tas ou baril) en (x, z) :
   *  meme validation qu'a la pose (le camp s'ignore lui-meme) ; faux si la
   *  position est refusee ou inchangee. Un camp deplace garde son
   *  orientation ; coffre, gardes, decor et barils en derivent. Nouvel objet
   *  (jamais une mutation) : l'historique restaure l'ancien. */
  moveFeatureTo(id: number, x: number, z: number): boolean {
    const f = this.features.find((e) => e.id === id);
    if (!f) return false;
    const cx = Math.floor(x) + 0.5;
    const cz = Math.floor(z) + 0.5;
    const pos = featurePosition(f);
    if (pos.x === cx && pos.z === cz) return false;
    let next: EditorFeature;
    if (f.kind === 'camp') {
      if (this.campPlacementIssue(cx, cz, id) !== null) return false;
      next = { ...f, camp: { ...f.camp, x: cx, z: cz } };
    } else {
      if (!this.canPlaceSmallFeatureAt(cx, cz)) return false;
      next = f.kind === 'pile' ? { ...f, pile: { ...f.pile, x: cx, z: cz } } : { ...f, destructible: { ...f.destructible, x: cx, z: cz } };
    }
    this.features = this.features.map((e) => (e.id === id ? next : e));
    return true;
  }

  /** Niveau d'un camp (fiche de l'editeur) : entier >= 1 ; faux si
   *  inchange ou invalide. Nouvel objet, pour l'historique. */
  setCampLevel(id: number, level: number): boolean {
    const f = this.features.find((e) => e.id === id);
    if (!f || f.kind !== 'camp' || !Number.isInteger(level) || level < 1) return false;
    if ((f.camp.level ?? 1) === level) return false;
    this.features = this.features.map((e) => (e.id === id ? { ...f, camp: { ...f.camp, level } } : e));
    return true;
  }

  /** Validation legere de la carte de Survie : erreurs (aucun Depart
   *  Survie, depart invalide, camp invalide) et avertissements (aucun camp,
   *  aucune ressource, aucune palissade). */
  survivalValidation(): SurvivalValidation {
    const errors: string[] = [];
    const warnings: string[] = [];
    if (!this.ballistaExplicit) errors.push('Aucun Départ Survie : posez-le (groupe Survie du catalogue).');
    else {
      const issue = this.startPlacementIssue(this.ballista.x, this.ballista.z, this.startingBase?.rotation ?? 0);
      if (issue) errors.push(`Départ Survie invalide : ${issue}.`);
    }
    const camps = this.features.filter((f): f is Extract<EditorFeature, { kind: 'camp' }> => f.kind === 'camp');
    for (const f of camps) {
      const issue = this.campPlacementIssue(f.camp.x, f.camp.z, f.id);
      if (issue) errors.push(`${getCampKind(f.camp.kind).shortName} en (${f.camp.x.toFixed(1)} ; ${f.camp.z.toFixed(1)}) invalide : ${issue}.`);
    }
    if (camps.length === 0) warnings.push('Aucun camp.');
    if (!this.obstacles.some((o) => resourceOfObstacle(o) !== null) && !this.features.some((f) => f.kind === 'pile')) warnings.push('Aucune ressource (arbre, gisement ou tas).');
    if (this.walls.length === 0 && !this.startingBaseLayout?.walls.length) warnings.push('Aucune palissade.');
    return { errors, warnings };
  }

  /** Case libre pour un petit tas ou un baril : existante, hors eau, sans
   *  autre tas ni baril (les camps ne comptent pas). */
  private canPlaceSmallFeatureAt(x: number, z: number): boolean {
    if (!this.hasCellAt(Math.floor(x), Math.floor(z)) || this.isWaterCell(Math.floor(x), Math.floor(z))) return false;
    return !this.features.some((f) => f.kind !== 'camp' && Math.floor(featurePosition(f).x) === Math.floor(x) && Math.floor(featurePosition(f).z) === Math.floor(z));
  }

  /** Deplace la Baliste vers la position calee sur sa grille la plus proche
   *  de (x, z), si elle est valide (canMoveBallistaTo) — la rend explicite.
   *  Renvoie false (rien ne change) si la position est invalide ou
   *  identique. */
  moveBallista(x: number, z: number): boolean {
    const target = snapBallistaOrigin(x, z);
    if (target.x === this.ballista.x && target.z === this.ballista.z && this.ballistaExplicit) return false;
    if (!this.canMoveBallistaTo(target.x, target.z)) return false;
    // Camp de depart (2026-11-04) : porte vers le cote le plus degage de la
    // nouvelle position (meme calcul que l'apercu et la validation).
    const layout = this.startingBaseLayoutFor(target.x, target.z);
    if (layout) this.startingBase = { preset: layout.preset, rotation: layout.rotation };
    this.ballista = target;
    this.ballistaExplicit = true;
    return true;
  }

  /** Ecrit directement position, statut explicite et camp de depart —
   *  annuler/retablir (voir main.ts), sans validation : on revient a un etat
   *  deja valide. */
  setBallista(position: { x: number; z: number }, explicit: boolean, startingBase?: { preset: string; rotation: number }): void {
    this.ballista = { x: position.x, z: position.z };
    this.ballistaExplicit = explicit;
    this.startingBase = startingBase ? { ...startingBase } : undefined;
  }

  /** Cellules RÉELLEMENT présentes — nouveau tableau à chaque appel (le
   *  rendu en a besoin comme une liste stable le temps d'une frame, jamais
   *  muté en place). */
  get cells(): TerrainCellDef[] {
    return [...this.cellMap.values()];
  }

  /** Relief du brouillon pour l'export (MapDef.elevationCells), trie par z
   *  puis x : meme fichier quel que soit l'ordre des modifications. */
  get elevationCells(): TerrainElevationCellDef[] {
    return [...this.elevationMap.values()].sort((a, b) => a.z - b.z || a.x - b.x).map((e) => ({ ...e }));
  }

  /** Champ de hauteur du brouillon (rendu, raycast, regles de pose). */
  heightField(): TerrainHeightField {
    if (!this.heightFieldCache) this.heightFieldCache = new TerrainHeightField([...this.elevationMap.values()]);
    return this.heightFieldCache;
  }

  private invalidateHeightField(): void {
    this.heightFieldCache = null;
  }

  /** Vrai si la case porte quelque chose dont la hauteur depend d'elle :
   *  batiment de scenario, ligne de mur V2 (cases de sa ligne centrale),
   *  Baliste, obstacle / structure BLOQUANT (centre dans la case ou emprise
   *  qui la chevauche) ou unite de scenario. Regle du relief : une telle case ne change jamais
   *  d'altitude. Un DECOR ne verrouille rien : il suit la nouvelle surface
   *  (hauteur derivee du terrain a son point d'ancrage, jamais stockee). */
  isCellOccupied(x: number, z: number): boolean {
    const cell = { minX: x, maxX: x + 1, minZ: z, maxZ: z + 1 };
    if (this.isCellUnderBallista(x, z)) return true;
    if (this.buildings.some((b) => boundsOverlap(cell, buildingBoundsAt(b.buildingId, b.x, b.z)))) return true;
    if (this.units.some((u) => Math.floor(u.x) === x && Math.floor(u.z) === z)) return true;
    if (this.wallPieces().some((p) => wallLineCells(p.segment).some((c) => c.x === x && c.z === z))) return true;
    return this.obstacles.some((o) => {
      if (!isBlockingMapObstacle(o)) return false;
      const center = obstacleCenter(o);
      return (Math.floor(center.x) === x && Math.floor(center.z) === z) || boundsOverlap(cell, obstacleBounds(o));
    });
  }

  /** Niveau (bord bas pour une pente) et pente de la case. */
  elevationAt(x: number, z: number): { level: number; slope: SlopeShape | null } {
    const e = this.elevationMap.get(cellKey(x, z));
    return { level: e?.level ?? 0, slope: e?.slope ?? null };
  }

  private setElevation(x: number, z: number, level: number, slope: SlopeShape | null): void {
    const key = cellKey(x, z);
    if (level === 0 && !slope) this.elevationMap.delete(key);
    else this.elevationMap.set(key, { x, z, level, ...(slope ? { slope } : {}) });
    this.invalidateHeightField();
  }

  /** Surface canonique du champ logique courant (voir renderReliefLogic). */
  renderedRelief(): RenderedRelief {
    this.renderedReliefCache ??= renderReliefLogic(this.reliefLogicMap, this.cells);
    return this.renderedReliefCache;
  }

  private invalidateRenderedRelief(): void {
    this.renderedReliefCache = null;
  }

  /** Remplace le champ logique de la sculpture (fin de tampon, voir main.ts). */
  setReliefLogic(logic: ReadonlyMap<string, number>): void {
    this.reliefLogicMap = new Map(logic);
    this.invalidateRenderedRelief();
  }

  /** Hauteurs logiques a enregistrer (MapDef.reliefLogic) : seulement les
   *  cases existantes dont la hauteur logique differe de celle que l'on
   *  deduit du relief (deriveReliefLogic) ; triees par z puis x. */
  get reliefLogicEntries(): { x: number; z: number; level: number }[] {
    const derived = deriveReliefLogic(this.heightField(), this.cells);
    const keys = new Set([...derived.keys(), ...this.reliefLogicMap.keys()]);
    const out: { x: number; z: number; level: number }[] = [];
    for (const key of keys) {
      const [x, z] = key.split(',').map(Number) as [number, number];
      if (!this.hasCellAt(x, z)) continue;
      const level = this.reliefLogicMap.get(key) ?? 0;
      if (level !== (derived.get(key) ?? 0)) out.push({ x, z, level });
    }
    return out.sort((a, b) => a.z - b.z || a.x - b.x);
  }

  /**
   * Outils explicites de relief (Monter une case, Descendre une case, Pente),
   * sur le MEME modele que la sculpture : une case = un niveau (bas d'une
   * pente) et une forme, meme verrou (case occupee : isCellOccupied), meme
   * champ logique (la hauteur logique de la case suit, pour que les
   * pinceaux la relisent), niveaux TERRAIN_LEVEL_MIN..MAX. Aucun
   * autotuilage : une case montee seule est une marche (falaises), comme
   * avec les anciens outils.
   *  - raise : case plate un niveau plus haut (une pente devient le plat de
   *    son sommet) ;
   *  - lower : case plate un niveau plus bas (une pente devient le plat de
   *    son pied) ;
   *  - slope : pente du niveau de la case vers le niveau suivant, montant
   *    vers `dir` (glisser), ou vers la seule voisine plus haute.
   */
  planCellRelief(x: number, z: number, op: CellReliefOp, dir: SlopeDirection | null = null): CellReliefPlan {
    if (!this.hasCellAt(x, z)) return { ok: false, reason: 'aucune case' };
    if (this.isCellOccupied(x, z)) return { ok: false, reason: 'case occupée (relief verrouillé)' };
    const { level, slope } = this.elevationAt(x, z);
    if (op === 'raise' || op === 'lower') {
      const next = op === 'raise' ? level + 1 : slope ? level : level - 1;
      if (next > TERRAIN_LEVEL_MAX) return { ok: false, reason: `niveau maximal (${TERRAIN_LEVEL_MAX})` };
      if (next < TERRAIN_LEVEL_MIN) return { ok: false, reason: `niveau minimal (${TERRAIN_LEVEL_MIN})` };
      return { ok: true, cell: { x, z, level: next }, logic: next };
    }
    if (level + 1 > TERRAIN_LEVEL_MAX) return { ok: false, reason: `niveau maximal (${TERRAIN_LEVEL_MAX}) : pas de pente au-dessus` };
    const rising = dir ?? this.slopeDirectionFromNeighbors(x, z, level);
    if (!rising) return { ok: false, reason: 'orientation ambiguë : glisser dans le sens de la montée' };
    if (slope === rising) return { ok: false, reason: 'pente déjà orientée ainsi' };
    return { ok: true, cell: { x, z, level, slope: rising }, logic: level };
  }

  /** Seule direction ou la case voisine est plus haute que `level` (son
   *  bas au moins level + 1) ; null si aucune ou plusieurs. */
  private slopeDirectionFromNeighbors(x: number, z: number, level: number): SlopeDirection | null {
    const higher = SLOPE_DIRECTIONS.filter((d) => {
      const v = SLOPE_DIRECTION_VECTORS[d];
      return this.hasCellAt(x + v.dx, z + v.dz) && this.elevationAt(x + v.dx, z + v.dz).level >= level + 1;
    });
    return higher.length === 1 ? higher[0]! : null;
  }

  /** Applique un plan valide de planCellRelief. Renvoie true si la case a
   *  change (relief ou hauteur logique). */
  applyCellRelief(plan: Extract<CellReliefPlan, { ok: true }>): boolean {
    const { x, z, level, slope } = plan.cell;
    const key = cellKey(x, z);
    const current = this.elevationAt(x, z);
    const logicChanged = (this.reliefLogicMap.get(key) ?? 0) !== plan.logic;
    if (current.level === level && current.slope === (slope ?? null) && !logicChanged) return false;
    this.setElevation(x, z, level, slope ?? null);
    const logic = new Map(this.reliefLogicMap);
    if (plan.logic === 0) logic.delete(key);
    else logic.set(key, plan.logic);
    this.setReliefLogic(logic);
    return true;
  }

  /** Etat du relief au debut d'un trait de sculpture. */
  reliefStrokeStart(): ReliefStrokeStart {
    return { logic: new Map(this.reliefLogicMap), rendered: this.renderedRelief(), field: this.heightField() };
  }

  private reliefContext(start: ReliefStrokeStart): ReliefSculptContext {
    return {
      ...start,
      cells: this.cells,
      hasCell: (cx, cz) => this.hasCellAt(cx, cz),
      isLocked: (cx, cz) => this.isCellOccupied(cx, cz),
    };
  }

  /** Tampon du pinceau de relief pres de (x, z) (voir reliefBrushPlanAt). */
  reliefBrushPlan(x: number, z: number, delta: ReliefDelta, size: ReliefBrushSize, painted: ReadonlySet<string> = new Set(), start: ReliefStrokeStart = this.reliefStrokeStart()): ReliefBrushPlan {
    const origin = reliefBrushOrigin(size, x, z);
    return this.reliefBrushPlanAt(origin.x, origin.z, delta, size, painted, start);
  }

  /** Tampon du pinceau de relief dont le coeur logique commence en
   *  (originX, originZ) : coeur coupe aux cases de terrain existantes (hors
   *  carte et trous ignores, jamais un refus pour un debordement), relief
   *  resultant du trait (`painted` + ce coeur, mesure sur `start`) et
   *  validite : refuse si une case a changer est occupee, ou si tout le
   *  coeur est deja a la limite (niveau max en montant, 0 en descendant).
   *  SOURCE UNIQUE de l'apercu et de la pose (main.ts). */
  reliefBrushPlanAt(originX: number, originZ: number, delta: ReliefDelta, size: ReliefBrushSize, painted: ReadonlySet<string> = new Set(), start: ReliefStrokeStart = this.reliefStrokeStart()): ReliefBrushPlan {
    const core = reliefBrushCore(size, originX, originZ).filter((key) => {
      const [cx, cz] = key.split(',').map(Number) as [number, number];
      return this.hasCellAt(cx, cz);
    });
    // Pinceau entierement dans le vide : operation neutre (le pinceau suit
    // le curseur, sans apercu ni refus).
    if (core.length === 0) return { originX, originZ, core, cells: [], bridged: [], logic: new Map(start.logic), levels: 'aucune case de terrain sous le pinceau', status: { ok: false, reason: null } };
    // Carre visible du pinceau (coeur + couronne), dans la carte : apercu rouge.
    const square: TerrainElevationCellDef[] = [];
    const side = Math.sqrt(reliefBrushCore(size, 0, 0).length);
    for (let dz = -1; dz <= side; dz++) {
      for (let dx = -1; dx <= side; dx++) {
        const cx = originX + dx;
        const cz = originZ + dz;
        if (this.hasCellAt(cx, cz)) square.push(start.field.entryAt(cx, cz) ?? { x: cx, z: cz, level: 0 });
      }
    }
    // Niveau logique du coeur avant / apres, pour la ligne d'etat ; limite
    // si aucune case du coeur (cases existantes) ne peut bouger.
    const changes = new Set<string>();
    let movable = false;
    for (const key of core) {
      const from = start.logic.get(key) ?? 0;
      const to = Math.min(TERRAIN_LEVEL_MAX, Math.max(TERRAIN_LEVEL_MIN, from + delta));
      if (from !== to) { movable = true; changes.add(`${from} → ${to}`); }
    }
    const levels = changes.size === 1 ? `niveau ${[...changes][0]}` : changes.size > 1 ? `plusieurs niveaux, une couche ${delta > 0 ? 'de plus' : 'de moins'} chacun` : '';
    const refuse = (reason: string): ReliefBrushPlan => ({ originX, originZ, core, cells: square, bridged: [], logic: new Map(start.logic), levels, status: { ok: false, reason } });
    if (!movable) return refuse(delta > 0 ? `limite atteinte (niveau ${TERRAIN_LEVEL_MAX} maximum)` : `limite atteinte (niveau ${TERRAIN_LEVEL_MIN} minimum)`);
    const result = sculptRelief(this.reliefContext(start), new Set([...painted, ...core]), delta);
    if (result.blocked) {
      const where = `case ${result.blocked.x}, ${result.blocked.z}`;
      return refuse(`case occupée : bâtiment, mur, Baliste, unité ou obstacle (${where})`);
    }
    return { originX, originZ, core, cells: result.cells, bridged: result.bridged, logic: result.logic, levels, status: { ok: true } };
  }

  /** Applique un trait de sculpture : les cases `next` (resultat complet du
   *  trait, voir sculptRelief) ; une case de `previous` (resultat applique
   *  juste avant) absente de `next` reprend son relief de `start`. Renvoie
   *  true si une case a change. */
  applyReliefCells(start: TerrainHeightField, previous: readonly TerrainElevationCellDef[], next: readonly TerrainElevationCellDef[]): boolean {
    const wanted = new Map<string, TerrainElevationCellDef>();
    for (const c of previous) wanted.set(cellKey(c.x, c.z), start.entryAt(c.x, c.z) ?? { x: c.x, z: c.z, level: 0 });
    for (const c of next) wanted.set(cellKey(c.x, c.z), c);
    let changed = false;
    for (const c of wanted.values()) {
      const current = this.elevationAt(c.x, c.z);
      if (current.level === c.level && current.slope === (c.slope ?? null)) continue;
      this.setElevation(c.x, c.z, c.level, c.slope ?? null);
      changed = true;
    }
    return changed;
  }

  hasCellAt(x: number, z: number): boolean {
    return this.cellMap.has(cellKey(x, z));
  }

  /** Vrai si la case (x, z) est peinte d'une surface d'eau (isWaterSurface) :
   *  aucune unite, aucun batiment ni mur, pas de Baliste. */
  isWaterCell(x: number, z: number): boolean {
    return isWaterSurface(this.surfaceMap.get(cellKey(x, z)));
  }

  /** Vrai si l'une des cases sous le rectangle `r` est une case d'eau. */
  private boundsTouchWater(r: ObstacleBounds): boolean {
    for (let cz = Math.floor(r.minZ); cz < r.maxZ; cz++) {
      for (let cx = Math.floor(r.minX); cx < r.maxX; cx++) {
        if (this.isWaterCell(cx, cz)) return true;
      }
    }
    return false;
  }

  /** Vrai si AUCUNE cellule n'existe encore à (x, z) — condition de
   *  validité de l'outil "Ajouter case" (Part AF : aperçu vert/rouge),
   *  partagée avec `addCell` pour ne jamais diverger. */
  canAddCell(x: number, z: number): boolean {
    return !this.cellMap.has(cellKey(x, z));
  }

  /** Ajoute EXACTEMENT une cellule — refuse (renvoie false) si une cellule
   *  existe déjà à cette position (Part Y : "exactement UNE nouvelle case",
   *  jamais un remplacement silencieux du type existant). */
  addCell(x: number, z: number, terrain: TerrainType): boolean {
    if (!this.canAddCell(x, z)) return false;
    this.cellMap.set(cellKey(x, z), { x, z, terrain });
    this.invalidateTerritoryIndex();
    this.invalidateRenderedRelief();
    return true;
  }

  /** Vrai si la cellule existe ET peut être supprimée (Part AE, V1 :
   *  "interdire la suppression tant qu'une unité ou un objet occupe la
   *  cellule") : aucune unité et aucun décor — prop traversable compris —
   *  n'a son centre dessus, sinon il resterait suspendu dans le vide.
   *  Partagée entre `removeCell` (action réelle) et l'aperçu vert/rouge de
   *  l'outil (Part AF), pour ne jamais diverger. */
  canRemoveCell(x: number, z: number): boolean {
    if (!this.cellMap.has(cellKey(x, z))) return false;
    // Case necessaire sous la Baliste ou sous un batiment de scenario.
    if (this.isCellUnderBallista(x, z)) return false;
    const cell = { minX: x, maxX: x + 1, minZ: z, maxZ: z + 1 };
    if (this.buildings.some((b) => boundsOverlap(cell, buildingBoundsAt(b.buildingId, b.x, b.z)))) return false;

    const occupiedByUnit = this.units.some((u) => Math.floor(u.x) === x && Math.floor(u.z) === z);
    if (occupiedByUnit) return false;

    const occupiedByObstacle = this.obstacles.some((o) => {
      const center = obstacleCenter(o);
      return Math.floor(center.x) === x && Math.floor(center.z) === z;
    });
    return !occupiedByObstacle;
  }

  /** Vrai si un décor peut avoir son centre en (x, z) : la case sous son
   *  centre existe — jamais hors du plateau ni au-dessus d'un trou. Source
   *  unique de la pose (placeAt), du déplacement (moveSelected) et de
   *  l'aperçu de pose. */
  canPlaceObstacleAt(x: number, z: number): boolean {
    return this.hasCellAt(Math.floor(x), Math.floor(z));
  }

  /** canPlaceObstacleAt plus la regle du relief : un obstacle / structure
   *  BLOQUANT de plus d'une case exige une emprise plate a un seul niveau.
   *  Un DECOR se pose partout (pente comprise) : son emprise n'est plus une
   *  contrainte, il suit la hauteur sous son point d'ancrage, sans
   *  inclinaison. */
  canPlaceObstacleFootprintAt(o: Pick<ObstacleDef, 'kind' | 'buildingModel' | 'tilesX' | 'tilesZ'>, x: number, z: number): boolean {
    if (!this.canPlaceObstacleAt(x, z)) return false;
    if (!isBlockingMapObstacle(o as ObstacleDef) || o.tilesX * o.tilesZ <= 1) return true;
    const halfX = o.tilesX / 2;
    const halfZ = o.tilesZ / 2;
    return this.heightField().flatLevelOver(x - halfX, x + halfX, z - halfZ, z + halfZ) !== null;
  }

  /** Supprime une cellule — voir canRemoveCell pour les conditions de refus.
   *  Retire aussi sa case de territoire explicite : aucun territoire ne
   *  reste sur une case qui n'existe plus. */
  removeCell(x: number, z: number): boolean {
    if (!this.canRemoveCell(x, z)) return false;
    this.cellMap.delete(cellKey(x, z));
    // Une case supprimee redevient un trou : son relief (et sa couche
    // logique) disparait avec elle.
    if (this.elevationMap.delete(cellKey(x, z))) this.invalidateHeightField();
    this.reliefLogicMap.delete(cellKey(x, z));
    if (this.territory) this.territory = this.territory.filter((c) => c.x !== x || c.z !== z);
    // Aucune surface peinte sur un trou.
    this.surfaceMap.delete(cellKey(x, z));
    this.invalidateTerritoryIndex();
    this.invalidateRenderedRelief();
    return true;
  }

  /** Territoire affiche et peint par l'editeur : l'explicite s'il existe,
   *  sinon les bandes historiques de profondeur PLACEMENT_ROWS (l'editeur
   *  n'a pas de run), limitees aux cellules existantes. */
  resolvedTerritory(): TerritoryCell[] {
    return resolveMapTerritory({ width: this.width, height: this.height, cells: this.cells, territory: this.territory }, PLACEMENT_ROWS);
  }

  /** Camp proprietaire de la case qui contient le point (x, z), d'apres le
   *  territoire resolu (explicite, sinon repli historique) — null si la case
   *  est neutre ou absente. SOURCE UNIQUE du camp des unites de l'editeur
   *  (pose, deplacement, apercus). */
  territoryOwnerAt(x: number, z: number): TerritoryTeam | null {
    return territoryOwnerAtPoint(this.territoryIndex(), x, z);
  }

  private territoryIndex(): TerritoryIndex {
    if (!this.territoryIndexCache) this.territoryIndexCache = buildTerritoryIndex(this.resolvedTerritory());
    return this.territoryIndexCache;
  }

  private invalidateTerritoryIndex(): void {
    this.territoryIndexCache = null;
  }

  /** Vrai si la case (x, z) — coordonnees entieres de case — existe et peut
   *  donc recevoir du territoire. */
  canPaintTerritoryAt(x: number, z: number): boolean {
    return Number.isInteger(x) && Number.isInteger(z) && this.hasCellAt(x, z);
  }

  /** Donne la case (x, z) a `team`, ou la rend neutre (`null`). Renvoie
   *  false si rien ne change (case absente, ou deja dans cet etat).
   *  Territoire encore implicite (`undefined`) : le premier vrai changement
   *  part d'une copie du territoire affiche (repli historique), jamais d'un
   *  territoire vide. Une seule entree par case apres ecriture ; une case
   *  repeinte garde sa place dans la liste, une nouvelle case va a la fin. */
  paintTerritoryCell(x: number, z: number, team: TerritoryTeam | null): boolean {
    if (!this.canPaintTerritoryAt(x, z)) return false;
    const current = this.territory ?? this.resolvedTerritory();
    const isCell = (c: TerritoryCell) => c.x === x && c.z === z;
    const entries = current.filter(isCell);
    const owner = entries.length > 0 ? entries[entries.length - 1]!.team : null;
    if (owner === team && entries.length <= 1) return false;
    const index = current.findIndex(isCell);
    const next = current.filter((c) => !isCell(c));
    if (team) next.splice(index >= 0 ? index : next.length, 0, { x, z, team });
    this.territory = next;
    this.invalidateTerritoryIndex();
    return true;
  }

  /** Copie de l'etat du territoire explicite (`undefined` compris), pour
   *  annuler / retablir. */
  territorySnapshot(): TerritoryCell[] | undefined {
    return this.territory?.map((c) => ({ x: c.x, z: c.z, team: c.team }));
  }

  /** Remet le territoire exactement dans un etat capture par
   *  territorySnapshot (annuler / retablir), sans validation. */
  restoreTerritory(snapshot: TerritoryCell[] | undefined): void {
    this.territory = snapshot?.map((c) => ({ x: c.x, z: c.z, team: c.team }));
    this.invalidateTerritoryIndex();
  }

  /** Surfaces peintes pour l'export (MapDef.surfaceCells), triees par z
   *  puis x : meme fichier quel que soit l'ordre de la peinture. */
  get surfaceCells(): SurfaceCellDef[] {
    return [...this.surfaceMap].map(([key, surface]) => {
      const [x, z] = key.split(',').map(Number) as [number, number];
      return { x, z, surface };
    }).sort((a, b) => a.z - b.z || a.x - b.x);
  }

  /** Surface peinte par case (cle cellKey), pour le rendu. */
  get surfaceIndex(): ReadonlyMap<string, GroundTextureId> {
    return this.surfaceMap;
  }

  /** Cases existantes du carre `size × size` d'un pinceau Surface pose pres
   *  de (x, z) — hors carte et trous exclus. */
  surfaceBrushCells(size: SurfaceBrushSize, x: number, z: number): { x: number; z: number }[] {
    const origin = surfaceBrushOrigin(size, x, z);
    return this.surfaceBrushCellsAt(size, origin.x, origin.z);
  }

  /** Meme chose depuis la case nord-ouest du carre (trait interpole). */
  surfaceBrushCellsAt(size: SurfaceBrushSize, originX: number, originZ: number): { x: number; z: number }[] {
    const cells: { x: number; z: number }[] = [];
    for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) if (this.hasCellAt(originX + i, originZ + j)) cells.push({ x: originX + i, z: originZ + j });
    return cells;
  }

  /** Peint le dessus de la case (x, z) avec `surface`, ou efface sa peinture
   *  (`null`, surface par defaut : aucune entree). Visuel seulement, sauf
   *  l'eau (isWaterSurface, infranchissable) : jamais peinte sous une unite,
   *  un batiment, une structure bloquante ou la Baliste (isCellOccupied,
   *  meme regle que le verrou du relief). Renvoie false si
   *  rien ne change (case absente, deja dans cet etat ou occupee). */
  paintSurfaceCell(x: number, z: number, surface: GroundTextureId | null): boolean {
    const key = cellKey(x, z);
    if (!this.cellMap.has(key) || (this.surfaceMap.get(key) ?? null) === surface) return false;
    if (isWaterSurface(surface ?? undefined) && this.isCellOccupied(x, z)) return false;
    if (surface) this.surfaceMap.set(key, surface);
    else this.surfaceMap.delete(key);
    return true;
  }

  /** Arbres (kind 'tree') dont le centre est dans la case (x, z). */
  private treesInCell(x: number, z: number): EditorObstacle[] {
    return this.obstacles.filter((o) => {
      if (o.kind !== 'tree') return false;
      const c = obstacleCenter(o);
      return Math.floor(c.x) === x && Math.floor(c.z) === z;
    });
  }

  /** Pinceau Foret : plante les arbres de la case (x, z) (forestTreesForCell,
   *  deterministe). Rien sur une case absente, d'eau, occupee (unite,
   *  batiment, structure bloquante, Baliste : isCellOccupied) ou qui porte
   *  deja un arbre — repasser le pinceau n'empile jamais. Renvoie vrai si un
   *  arbre a ete pose. */
  plantForestCell(x: number, z: number, treeType: ForestTreeTypeId, density: ForestDensity): boolean {
    if (!this.hasCellAt(x, z) || this.isWaterCell(x, z) || this.isCellOccupied(x, z)) return false;
    if (this.treesInCell(x, z).length > 0) return false;
    const trees = forestTreesForCell(x, z, treeType, density);
    for (const t of trees) {
      this.obstacles.push({ kind: 'tree', tilesX: 1, tilesZ: 1, treeModel: t.treeModel, x: t.x, z: t.z, rotationY: t.rotationY, scale: t.scale, id: this.nextId++ });
    }
    return trees.length > 0;
  }

  /** Gomme du pinceau Foret : retire les arbres (kind 'tree') de la case
   *  (x, z), quelle que soit leur origine, et les retire de la selection.
   *  Renvoie vrai si un arbre a ete retire. */
  eraseForestCell(x: number, z: number): boolean {
    const removed = new Set(this.treesInCell(x, z).map((o) => o.id));
    if (removed.size === 0) return false;
    this.obstacles = this.obstacles.filter((o) => !removed.has(o.id));
    if (this.selection?.kind === 'obstacle' && removed.has(this.selection.id)) this.selection = null;
    return true;
  }

  /** Remet les surfaces peintes dans un etat capture par surfaceCells
   *  (annuler / retablir), sans validation. */
  restoreSurfaces(snapshot: readonly SurfaceCellDef[]): void {
    this.surfaceMap = new Map(snapshot.map((c) => [cellKey(c.x, c.z), c.surface]));
  }

  private toEditorUnit(u: MapUnitPlacement, team: Team): EditorUnit {
    return { id: this.nextId++, unitId: u.unitId, team, x: u.x, z: u.z, ...(u.level !== undefined ? { level: u.level } : {}) };
  }

  /** Change la taille du brouillon (en cases, minimum 1×1) — ne touche pas
   *  aux obstacles/unites deja poses, meme si certains se retrouvent hors des
   *  nouvelles limites : a Antoine de les ajuster/supprimer, pas de
   *  suppression automatique (choix explicite, voir CLAUDE.md).
   *
   *  2026-08-16 : REMPLIT (jamais ne retire) les cellules manquantes du
   *  nouveau rectangle en 'grass' — "Taille" reste une façon rapide de
   *  garantir AU MOINS un rectangle plein, l'outil Ajouter/Supprimer case
   *  donnant ensuite un contrôle fin par-dessus. Une cellule déjà présente
   *  (y compris hors du nouveau rectangle, ou déjà en 'dirt') n'est jamais
   *  touchée. */
  setSize(width: number, height: number): void {
    this.width = Math.max(1, Math.round(width));
    this.height = Math.max(1, Math.round(height));

    const halfW = Math.floor(this.width / 2);
    const halfH = Math.floor(this.height / 2);
    for (let iz = 0; iz < this.height; iz++) {
      for (let ix = 0; ix < this.width; ix++) {
        const x = ix - halfW;
        const z = iz - halfH;
        const key = cellKey(x, z);
        if (!this.cellMap.has(key)) this.cellMap.set(key, { x, z, terrain: 'grass' });
      }
    }
    this.invalidateTerritoryIndex();
    this.invalidateRenderedRelief();
    // Baliste jamais deplacee : elle suit le repli historique du coin, comme
    // le ferait "Tester le scenario" sur la map exportee (sans champ).
    if (!this.ballistaExplicit) this.ballista = computePlayerArrowOrigin(this);
  }

  /** Element de carte Survie selectionne, ou null. */
  get selectedFeature(): EditorFeature | null {
    const sel = this.selection;
    if (sel?.kind !== 'feature') return null;
    return this.features.find((f) => f.id === sel.id) ?? null;
  }

  /** Pose un petit tas (5 bois / 5 pierre) ou un baril sur la case de (x, z)
   *  (2026-11-03 : case existante, hors eau, libre de tout element Survie),
   *  un camp (centre de case, campPlacementIssue, niveau 1, dos a l'oppose
   *  du Depart Survie) ou le Depart Survie (moveBallista : un nouveau
   *  placement remplace l'ancien) ; faux sinon. */
  placeFeatureAt(template: EditorFeatureTemplate, x: number, z: number): boolean {
    const cx = Math.floor(x) + 0.5;
    const cz = Math.floor(z) + 0.5;
    if (template === 'start') return this.moveBallista(x, z);
    const campKind = campKindOfTemplate(template);
    if (campKind !== null) {
      if (this.campPlacementIssue(cx, cz) !== null) return false;
      const origin = this.ballistaExplicit ? this.ballista : { x: 0, z: 0 };
      const camp: MapCampDef = { kind: campKind, x: cx, z: cz, level: 1, facing: campFacingFrom(cx, cz, origin) };
      this.features = [...this.features, { id: this.nextId++, kind: 'camp', camp }];
      return true;
    }
    if (!this.canPlaceSmallFeatureAt(cx, cz)) return false;
    const id = this.nextId++;
    if (template === 'barrel') this.features = [...this.features, { id, kind: 'destructible', destructible: { kind: 'barrel', x: cx, z: cz } }];
    else this.features = [...this.features, { id, kind: 'pile', pile: { x: cx, z: cz, resource: template === 'pile-wood' ? 'wood' : 'stone', amount: 5 } }];
    return true;
  }

  get selectedObstacle(): EditorObstacle | null {
    const sel = this.selection;
    if (sel?.kind !== 'obstacle') return null;
    return this.obstacles.find((o) => o.id === sel.id) ?? null;
  }

  get selectedUnit(): EditorUnit | null {
    const sel = this.selection;
    if (sel?.kind !== 'unit') return null;
    return this.units.find((u) => u.id === sel.id) ?? null;
  }

  /** Unites de la selection de groupe courante, ou null si la selection
   *  n'est pas un groupe. */
  get selectedUnitGroup(): EditorUnit[] | null {
    if (this.selection?.kind !== 'unit-group') return null;
    const ids = new Set(this.selection.ids);
    return this.units.filter((u) => ids.has(u.id));
  }

  select(selection: EditorSelection): void {
    this.selection = selection;
  }

  /** Ids des unites selectionnees, dans l'ordre de selection ; vide si la
   *  selection n'est pas une selection d'unites. */
  get selectedUnitIds(): number[] {
    const sel = this.selection;
    if (sel?.kind === 'unit') return [sel.id];
    if (sel?.kind === 'unit-group') return [...sel.ids];
    return [];
  }

  /** Remplace la selection par ces unites (ids inconnus ignores, doublons
   *  retires, ordre conserve) : aucune -> rien, une -> `unit`, plusieurs ->
   *  `unit-group`. Remplace aussi une selection de decor ou de Baliste. */
  selectUnits(ids: Iterable<number>): void {
    const existing = new Set(this.units.map((u) => u.id));
    const unique = [...new Set(ids)].filter((id) => existing.has(id));
    if (unique.length === 0) this.selection = null;
    else if (unique.length === 1) this.selection = { kind: 'unit', id: unique[0]! };
    else this.selection = { kind: 'unit-group', ids: unique };
  }

  /** Ajoute l'unite a la selection d'unites si elle n'y est pas, l'en retire
   *  sinon. Depuis une selection de decor ou de Baliste, demarre une
   *  nouvelle selection d'unites. */
  toggleUnitSelection(id: number): void {
    const ids = this.selectedUnitIds;
    this.selectUnits(ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]);
  }

  setTool(tool: EditorTool): void {
    this.tool = tool;
    this.selection = null;
  }

  /** Place une nouvelle instance du gabarit actif à la position CONTINUE
   *  donnée (2026-08-16, placement libre des décors — voir CLAUDE.md) : les
   *  obstacles ne sont plus jamais posés sur un coin de case, `x`/`z`
   *  suivent exactement l'intersection raycaster → terrain, sans arrondi.
   *  Revient à l'outil sélection ensuite — un clic place un objet, pas un
   *  tampon continu (choix conservé depuis l'origine de l'éditeur). */
  placeAt(x: number, z: number): EditorObstacle | null {
    if (this.tool.type !== 'place-obstacle') return null;
    if (!this.canPlaceObstacleFootprintAt(this.tool.template, x, z)) return null;
    const obstacle: EditorObstacle = { ...this.tool.template, x, z, id: this.nextId++ };
    this.obstacles.push(obstacle);
    this.tool = { type: 'select' };
    this.selection = { kind: 'obstacle', id: obstacle.id };
    return obstacle;
  }

  /** Vrai si une UNITE peut être placée à (x, z) — cellule de terrain
   *  existante appartenant à un camp (case neutre interdite), aucun obstacle
   *  BLOQUANT (« Obstacles / structures » — jamais un décor, toujours
   *  traversable, voir isBlockingMapObstacle) et aucune autre unité
   *  déjà sur cette même case (2026-08-16, demande explicite : "aucune
   *  unité incompatible déjà présente" / "aucun bâtiment n'occupe cette
   *  cellule"). SOURCE UNIQUE partagée par la preview visuelle (case verte/
   *  rouge, voir editor/editorScene.ts buildCellPreview) et placeUnitAt
   *  ci-dessous — la preview ne doit JAMAIS promettre un résultat que le
   *  clic ne tiendrait pas. `ignoreUnitIds` : unités en cours de
   *  déplacement, dont la case actuelle ne bloque pas. */
  canPlaceUnitAt(x: number, z: number, ignoreUnitIds?: ReadonlySet<number>, unitId?: string): boolean {
    const cellX = Math.floor(x);
    const cellZ = Math.floor(z);
    if (!this.hasCellAt(cellX, cellZ)) return false;
    if (this.isWaterCell(cellX, cellZ)) return false;
    // Camp de l'unite a cet endroit (unitTeamAt) : case neutre interdite aux
    // unites du joueur ou de l'ennemi, territoire joueur interdit aux unites
    // neutres.
    if ((unitId === undefined ? this.territoryOwnerAt(x, z) : this.unitTeamAt(unitId, x, z)) === null) return false;
    if (this.isInsideBallista(x, z)) return false;
    if (this.buildingAt(x, z) !== null) return false;

    const onObstacle = this.obstacles.some((o) => {
      if (!isBlockingMapObstacle(o)) return false;
      const center = obstacleCenter(o);
      return Math.floor(center.x) === cellX && Math.floor(center.z) === cellZ;
    });
    if (onObstacle) return false;

    return !this.units.some((u) => !ignoreUnitIds?.has(u.id) && Math.floor(u.x) === cellX && Math.floor(u.z) === cellZ);
  }

  /** Place une nouvelle unite au point donne — son camp est celui de la case
   *  dans le territoire (voir territoryOwnerAt), pas choisi dans l'asset
   *  browser. Refuse (voir canPlaceUnitAt) si aucune cellule de terrain
   *  n'existe à cet endroit, si la case est neutre, si un obstacle/bâtiment
   *  occupe déjà la case, ou si une autre unité y est déjà posée. */
  /** Camp d'une unite `unitId` posee en (x, z) : unite NEUTRE (UnitDef.neutral)
   *  toujours du cote adverse (le camp Neutre, config/factions.ts), posable
   *  en territoire ennemi ou neutre, jamais en territoire joueur ; toute
   *  autre unite prend le camp du territoire (null sur une case neutre). */
  unitTeamAt(unitId: string, x: number, z: number): TerritoryTeam | null {
    const owner = this.territoryOwnerAt(x, z);
    if (getUnit(unitId).neutral) return owner === 'player' ? null : 'enemy';
    return owner;
  }

  placeUnitAt(x: number, z: number): EditorUnit | null {
    if (this.tool.type !== 'place-unit') return null;
    if (!this.canPlaceUnitAt(x, z, undefined, this.tool.unitId)) return null;
    const team = this.unitTeamAt(this.tool.unitId, x, z);
    if (!team) return null;
    const unit: EditorUnit = { id: this.nextId++, unitId: this.tool.unitId, team, x, z };
    this.units.push(unit);
    // Pose CONTINUE : l'outil reste actif pour l'unite suivante (clic droit
    // ou Echap pour revenir a la selection).
    return unit;
  }

  /** Batiment de scenario dont l'emprise contient le point (x, z) (bord
   *  exclu), ou null. */
  buildingAt(x: number, z: number): EditorBuilding | null {
    return (
      this.buildings.find((b) => {
        const r = buildingBoundsAt(b.buildingId, b.x, b.z);
        return x > r.minX && x < r.maxX && z > r.minZ && z < r.maxZ;
      }) ?? null
    );
  }

  /** Vrai si le batiment `buildingId` peut etre centre en (x, z) (centre
   *  deja cale, voir snapBuildingCenter), selon son emprise REELLE : toutes
   *  les cases existent (ni hors du plateau ni au-dessus d'un trou), aucun
   *  autre batiment de scenario, ni la Baliste, ni un decor COLLIDABLE ne la
   *  chevauche, et aucune unite n'a son centre dedans. Pas de regle de
   *  territoire : l'editeur cree des scenarios librement. SOURCE UNIQUE de la
   *  pose et de son apercu. */
  canPlaceBuildingAt(buildingId: string, x: number, z: number, ignoreBuildingId?: number): boolean {
    const r = buildingBoundsAt(buildingId, x, z);
    for (let cz = Math.floor(r.minZ); cz < r.maxZ; cz++) {
      for (let cx = Math.floor(r.minX); cx < r.maxX; cx++) {
        if (!this.hasCellAt(cx, cz)) return false;
      }
    }
    // Relief : emprise entierement plate, a un seul niveau (jamais sur une
    // pente ni a cheval sur une falaise).
    if (this.heightField().flatLevelOver(r.minX, r.maxX, r.minZ, r.maxZ) === null) return false;
    if (this.boundsTouchWater(r)) return false;
    if (this.buildings.some((b) => b.id !== ignoreBuildingId && boundsOverlap(r, buildingBoundsAt(b.buildingId, b.x, b.z)))) return false;
    if (boundsOverlap(r, this.ballistaBoundsAt(this.ballista.x, this.ballista.z))) return false;
    if (this.obstacles.some((o) => isBlockingMapObstacle(o) && boundsOverlap(r, obstacleBounds(o)))) return false;
    // Sources debout (arbres, gros gisements, 2026-11-02) : bloquantes en jeu.
    const sources = resourceNodeCellKeys(this.obstacles);
    for (let cz = Math.floor(r.minZ); cz < r.maxZ; cz++) for (let cx = Math.floor(r.minX); cx < r.maxX; cx++) if (sources.has(`${cx},${cz}`)) return false;
    // Murs V2 : jamais un batiment sur une ligne de mur.
    if (this.wallPieces().some((p) => segmentBoxDistance(p.segment, r) < getWallType(p.line.type).halfWidth)) return false;
    return !this.units.some((u) => u.x > r.minX && u.x < r.maxX && u.z > r.minZ && u.z < r.maxZ);
  }

  /** Segments internes de tous les murs du brouillon (meme decoupage que le
   *  jeu, core/wallLine.ts) : ligne, rang depuis A, geometrie. */
  wallPieces(): { line: EditorWallLine; index: number; segment: WallSegment; gate: boolean }[] {
    return this.walls.flatMap((line) =>
      segmentWallLine(line, getWallType(line.type).segmentLength).map((segment, index) => ({ line, index, segment, gate: line.gates?.includes(index) === true })),
    );
  }

  /** Ce que la pose d'un mur lit du brouillon : cases, eau, falaises, arbres
   *  et structures bloquantes, batiments et Baliste, murs, unites. MEMES
   *  regles qu'en jeu (core/wallLine.ts, checkWallLine). */
  wallPlacementContext(): WallPlacementContext {
    const field = this.heightField();
    const cliffs = computeCliffObstacles(field, (x, z) => this.hasCellAt(x, z), this.cells).map(obstacleBounds);
    const trees = [...resourceNodeCellKeys(this.obstacles)].map((k) => {
      const [x, z] = k.split(',').map(Number) as [number, number];
      return { minX: x, maxX: x + 1, minZ: z, maxZ: z + 1 };
    });
    return {
      isCell: (x, z) => this.hasCellAt(Math.floor(x), Math.floor(z)),
      isWater: (x, z) => this.isWaterCell(Math.floor(x), Math.floor(z)),
      crossesCliff: (s) => cliffs.some((b) => segmentBoxDistance(s, b) === 0),
      obstacles: [...trees, ...this.obstacles.filter(isBlockingMapObstacle).map(obstacleBounds)],
      buildings: [...this.buildings.map((b) => buildingBoundsAt(b.buildingId, b.x, b.z)), this.ballistaBoundsAt(this.ballista.x, this.ballista.z)],
      walls: this.wallPieces().map((p) => p.segment),
      bodies: this.units.map((u) => ({ x: u.x, z: u.z, r: getUnit(u.unitId).stats.radius })),
    };
  }

  /** Ligne proposee de A a (x, z) pour l'outil Mur actif (apercu et pose). */
  planWallTo(x: number, z: number): WallLinePlan | null {
    if (this.tool.type !== 'place-wall' || !this.tool.start) return null;
    const type = getWallType(this.tool.wallType);
    return planWallLine(this.tool.start, { x, z }, type, this.wallPlacementContext());
  }

  /** Clic de l'outil Mur : le premier fixe A (aimante a un mur proche), le
   *  second pose la ligne si elle est valide (pas de cout dans l'editeur) et
   *  l'outil repart pour une nouvelle ligne. Renvoie la ligne posee, sinon
   *  null (A fixe ou pose refusee). */
  wallClick(x: number, z: number): EditorWallLine | null {
    if (this.tool.type !== 'place-wall') return null;
    if (!this.tool.start) {
      const a = planWallLine({ x, z }, { x, z }, getWallType(this.tool.wallType), this.wallPlacementContext()).line;
      this.tool = { ...this.tool, start: { x: a.ax, z: a.az } };
      return null;
    }
    const plan = this.planWallTo(x, z);
    if (!plan || plan.issue) return null;
    const line: EditorWallLine = { id: this.nextId++, type: this.tool.wallType, ax: plan.line.ax, az: plan.line.az, bx: plan.line.bx, bz: plan.line.bz };
    this.walls.push(line);
    this.tool = { type: 'place-wall', wallType: this.tool.wallType };
    return line;
  }

  /** Segment de mur sous (x, z) pour l'outil Porte (a moins de 0,6 case de
   *  sa ligne), ou null. */
  wallPieceAt(x: number, z: number): { line: EditorWallLine; index: number; segment: WallSegment; gate: boolean } | null {
    const pieces = this.wallPieces();
    const i = wallSegmentAt(x, z, pieces.map((p) => p.segment), 0.6);
    return i >= 0 ? pieces[i]! : null;
  }

  /** Outil Porte : le segment sous (x, z) devient une porte. Faux si aucun
   *  segment n'est vise ou si c'est deja une porte. */
  placeGateAt(x: number, z: number): boolean {
    if (this.tool.type !== 'place-wall-gate') return false;
    const piece = this.wallPieceAt(x, z);
    if (!piece || piece.gate) return false;
    // Nouvel objet ligne : l'historique garde l'ancien (sans cette porte).
    const updated: EditorWallLine = { ...piece.line, gates: [...(piece.line.gates ?? []), piece.index].sort((a, b) => a - b) };
    this.walls = this.walls.map((w) => (w === piece.line ? updated : w));
    return true;
  }

  get selectedWall(): EditorWallLine | null {
    const sel = this.selection;
    if (sel?.kind !== 'wall') return null;
    return this.walls.find((w) => w.id === sel.id) ?? null;
  }

  /** Pose un batiment de l'outil actif, centre cale pres de (x, z). L'outil
   *  reste actif (pose continue). Null (rien ne change) si la position est
   *  invalide. */
  placeBuildingAt(x: number, z: number): EditorBuilding | null {
    if (this.tool.type !== 'place-building') return null;
    const buildingId = this.tool.buildingId;
    const rotationY = this.tool.rotationY ?? 0;
    const center = snapBuildingCenter(buildingId, x, z);
    if (!this.canPlaceBuildingAt(buildingId, center.x, center.z)) return null;
    const building: EditorBuilding = { id: this.nextId++, buildingId, team: 'player', x: center.x, z: center.z, ...(rotationY ? { rotationY } : {}) };
    this.buildings.push(building);
    return building;
  }

  get selectedBuilding(): EditorBuilding | null {
    const sel = this.selection;
    if (sel?.kind !== 'building') return null;
    return this.buildings.find((b) => b.id === sel.id) ?? null;
  }

  private toEditorBuilding(b: MapBuildingPlacement): EditorBuilding {
    return { id: this.nextId++, buildingId: b.buildingId, team: b.team, x: b.x, z: b.z, ...(b.rotationY ? { rotationY: b.rotationY } : {}) };
  }

  /** Déplace librement l'obstacle sélectionné (position continue, plus de
   *  snap sur la grille — voir placeAt). Refusé (faux, position inchangée)
   *  si son centre tomberait dans le vide, voir canPlaceObstacleAt. */
  moveSelected(x: number, z: number): boolean {
    const o = this.selectedObstacle;
    if (!o || !this.canPlaceObstacleFootprintAt(o, x, z)) return false;
    o.x = x;
    o.z = z;
    return true;
  }

  /** Écrit directement position ET rotation d'un obstacle par id — utilisé
   *  par TransformControls (voir main.ts) : le gizmo manipule le mesh Three
   *  directement, cette méthode répercute le résultat dans `EditorState`
   *  (source de vérité pour la sauvegarde), qu'il s'agisse ou non de
   *  l'obstacle actuellement `selected` (en pratique toujours le cas, le
   *  gizmo n'est jamais attaché à autre chose que la sélection courante,
   *  mais ne PAS dépendre de `this.selection` ici évite un couplage
   *  implicite inutile). */
  setObstacleTransform(id: number, x: number, z: number, rotationY: number): void {
    const o = this.obstacles.find((obstacle) => obstacle.id === id);
    if (!o) return;
    o.x = x;
    o.z = z;
    o.rotationY = rotationY;
  }

  /** Ecrit uniquement la rotation d'un obstacle (normalisee dans [0, 2π)),
   *  sans toucher a sa position — utilise par la poignee de rotation de
   *  l'anneau et par Ctrl+molette. */
  setObstacleRotation(id: number, rotationY: number): void {
    const o = this.obstacles.find((obstacle) => obstacle.id === id);
    if (!o) return;
    const fullTurn = Math.PI * 2;
    o.rotationY = ((rotationY % fullTurn) + fullTurn) % fullTurn;
  }

  /** Retire la rotation explicite d'un obstacle (annuler la premiere
   *  rotation d'un decor qui n'en avait pas). */
  clearObstacleRotation(id: number): void {
    const o = this.obstacles.find((obstacle) => obstacle.id === id);
    if (o) delete o.rotationY;
  }

  /** Applique un deplacement d'unites deja valide (voir main.ts,
   *  planEditorUnitMove, meme calcul que l'apercu) et donne a chaque unite
   *  deplacee le camp de sa case d'arrivee (territoryOwnerAt) : une unite
   *  amenee en territoire adverse change de camp. Le plan valide n'arrive
   *  jamais sur une case neutre (canPlaceUnitAt) ; par prudence, le camp est
   *  alors conserve. Renvoie l'etat de chaque unite avant et apres, pour
   *  l'historique. */
  moveUnits(moves: readonly { id: number; x: number; z: number }[]): { before: EditorUnitState[]; after: EditorUnitState[] } {
    const before: EditorUnitState[] = [];
    const after: EditorUnitState[] = [];
    for (const move of moves) {
      const u = this.units.find((unit) => unit.id === move.id);
      if (!u) continue;
      before.push({ id: u.id, x: u.x, z: u.z, team: u.team });
      u.x = move.x;
      u.z = move.z;
      u.team = this.unitTeamAt(u.unitId, move.x, move.z) ?? u.team;
      after.push({ id: u.id, x: u.x, z: u.z, team: u.team });
    }
    return { before, after };
  }

  /** Remet ces unites exactement dans cet etat (annuler / retablir). */
  setUnitStates(states: readonly EditorUnitState[]): void {
    for (const state of states) {
      const u = this.units.find((unit) => unit.id === state.id);
      if (!u) continue;
      u.x = state.x;
      u.z = state.z;
      u.team = state.team;
    }
  }

  /** Voir EditorObjectsSnapshot. */
  objectsSnapshot(): EditorObjectsSnapshot {
    return { obstacles: [...this.obstacles], units: [...this.units], buildings: [...this.buildings], walls: [...this.walls], features: [...this.features], selection: copySelection(this.selection) };
  }

  /** Remet les objets et la selection exactement dans un etat capture par
   *  objectsSnapshot (annuler / retablir). */
  restoreObjects(snapshot: EditorObjectsSnapshot): void {
    this.obstacles = [...snapshot.obstacles];
    this.units = [...snapshot.units];
    this.buildings = [...snapshot.buildings];
    this.walls = [...snapshot.walls];
    this.features = [...snapshot.features];
    this.selection = copySelection(snapshot.selection);
  }

  /** Voir EditorMapShapeSnapshot. */
  mapShapeSnapshot(): EditorMapShapeSnapshot {
    return {
      width: this.width,
      height: this.height,
      cells: this.cells.map((c) => ({ ...c })),
      elevation: this.elevationCells,
      reliefLogic: [...this.reliefLogicMap.entries()],
      surfaces: this.surfaceCells,
      ballista: { ...this.ballista },
      ballistaExplicit: this.ballistaExplicit,
    };
  }

  /** Remet taille, cellules et Baliste dans un etat capture par
   *  mapShapeSnapshot (annuler / retablir un changement de taille). */
  restoreMapShape(snapshot: EditorMapShapeSnapshot): void {
    this.width = snapshot.width;
    this.height = snapshot.height;
    this.cellMap = buildCellIndex(snapshot.cells.map((c) => ({ ...c })));
    this.elevationMap = new Map(snapshot.elevation.map((e) => [cellKey(e.x, e.z), { ...e }]));
    this.invalidateHeightField();
    this.reliefLogicMap = new Map(snapshot.reliefLogic);
    this.invalidateRenderedRelief();
    this.restoreSurfaces(snapshot.surfaces);
    this.ballista = { ...snapshot.ballista };
    this.ballistaExplicit = snapshot.ballistaExplicit;
    this.invalidateTerritoryIndex();
  }

  deleteSelected(): void {
    const sel = this.selection;
    // La Baliste est unique et toujours presente : jamais supprimee.
    if (!sel || sel.kind === 'ballista') return;
    if (sel.kind === 'obstacle') {
      this.obstacles = this.obstacles.filter((o) => o.id !== sel.id);
    } else if (sel.kind === 'unit') {
      this.units = this.units.filter((u) => u.id !== sel.id);
    } else if (sel.kind === 'building') {
      this.buildings = this.buildings.filter((b) => b.id !== sel.id);
    } else if (sel.kind === 'wall') {
      this.walls = this.walls.filter((w) => w.id !== sel.id);
    } else if (sel.kind === 'feature') {
      this.features = this.features.filter((f) => f.id !== sel.id);
    } else {
      const ids = new Set(sel.ids);
      this.units = this.units.filter((u) => !ids.has(u.id));
    }
    this.selection = null;
  }
}
