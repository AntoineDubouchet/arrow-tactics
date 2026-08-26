import { BALLISTA_TOWER_FOOTPRINT, BOARD_H, BOARD_W, PLACEMENT_ROWS, PLAYER_ARROW_CORNER_INSET, TILE, type ObstacleDef } from './constants';

/**
 * Representation data-driven d'une map : ce qu'un futur editeur produira, ce
 * que le jeu charge pour construire le plateau et peupler la bataille.
 * Etape 1 du chantier editeur (voir echange avec Antoine, 2026-08-08) :
 * prouver que le jeu tourne a l'identique via cette structure, AVANT de
 * construire la moindre interface d'edition.
 *
 * Volontairement calque sur les interfaces qui existaient deja
 * (ObstacleDef, les formations {unitId,x,z}) plutot que d'inventer un
 * nouveau format : ca minimise le code de conversion entre "ancien" et
 * "nouveau" systeme.
 */

export interface MapUnitPlacement {
  unitId: string;
  x: number;
  z: number;
}

/** Types de terrain disponibles pour une cellule — herbe/terre pour
 *  l'instant (2026-08-16, chantier map irreguliere), extensible plus tard
 *  (peinture de terrain, voir CLAUDE.md etape 5 du chantier editeur). */
export type TerrainType = 'grass' | 'dirt';

/** Cellule de terrain, en coordonnees STABLES (memes conventions que
 *  ObstacleDef.cornerX/cornerZ : entier signe, coin bas-gauche de la case
 *  d'1x1, PAS un index de tableau 0..N) — voir resolveMapCells. */
export interface TerrainCellDef {
  x: number;
  z: number;
  terrain: TerrainType;
}

export interface MapDef {
  name: string;
  /** Permet de faire evoluer le format plus tard sans casser une map deja
   *  sauvegardee — un futur MapLoader pourra migrer une version 1 vers 2. */
  version: number;
  /** Taille NOMINALE — sert de reference pour la formation de placement/le
   *  coin de la baliste (voir computePlayerArrowOrigin ; la Mine est
   *  desormais un batiment ACHETABLE place librement par le joueur, plus une
   *  position fixe calculee depuis la map, voir main.ts requestPlaceBuilding)
   *  et, si `cells` est absent, pour synthetiser le
   *  rectangle plein de cellules "herbe" (voir resolveMapCells) reproduisant
   *  exactement le comportement d'AVANT le chantier map irreguliere. Une
   *  fois `cells` present, la VRAIE emprise jouable/rendue est celle des
   *  cellules elles-memes (potentiellement plus grande/irreguliere) — voir
   *  computeMapCellBounds. */
  width: number;
  height: number;
  /** Cellules de terrain REELLEMENT presentes (2026-08-16, chantier map
   *  irreguliere, voir CLAUDE.md) — SPARSE : une coordonnee (x, z) qui n'y
   *  figure pas represente le VIDE (aucun mesh, aucune navigation, aucun
   *  placement possible), pas une case "par defaut". ABSENT sur toute map
   *  sauvegardee avant cette date — `resolveMapCells` synthetise alors,
   *  SANS AUCUNE migration manuelle, un rectangle plein `width x height` de
   *  'grass' identique au comportement d'origine (sol uniforme). */
  cells?: TerrainCellDef[];
  obstacles: ObstacleDef[];
  /** Formation SUGGEREE pour la phase de placement : le joueur peut la
   *  deplacer avant de valider (voir main.ts, startPlacement/placementSlots) —
   *  contrairement a enemyUnits, qui est la position REELLE de depart. */
  playerUnits: MapUnitPlacement[];
  enemyUnits: MapUnitPlacement[];
}

/** Cle stable d'une cellule — sert de cle de Map/Set (lookup O(1) "cette
 *  case existe-t-elle ?"), reutilisee par EditorState et World.setMap. */
export function cellKey(x: number, z: number): string {
  return `${x},${z}`;
}

/**
 * Cellules REELLES d'une map, TOUJOURS resolues (jamais `undefined`) —
 * synthetise un rectangle plein de 'grass' pour toute map SANS `cells`
 * explicite (retro-compatibilite totale, voir MapDef.cells). Coordonnees
 * dans la MEME convention "entier signe centre sur l'origine" que
 * `ObstacleDef.cornerX/cornerZ` (ex. x dans [-9, 8] pour un plateau de
 * largeur 18) — jamais un index de tableau 0..N.
 */
export function resolveMapCells(map: Pick<MapDef, 'width' | 'height' | 'cells'>): TerrainCellDef[] {
  if (map.cells) return map.cells;
  const halfW = Math.floor(map.width / 2);
  const halfH = Math.floor(map.height / 2);
  const cells: TerrainCellDef[] = [];
  for (let iz = 0; iz < map.height; iz++) {
    for (let ix = 0; ix < map.width; ix++) {
      cells.push({ x: ix - halfW, z: iz - halfH, terrain: 'grass' });
    }
  }
  return cells;
}

/** Table de recherche O(1) "existe-t-il une cellule a (x, z) ?" — clee par
 *  cellKey. Construite UNE FOIS par appelant (World.setMap, EditorState),
 *  jamais reconstruite par frame. */
export function buildCellIndex(cells: TerrainCellDef[]): Map<string, TerrainCellDef> {
  const index = new Map<string, TerrainCellDef>();
  for (const c of cells) index.set(cellKey(c.x, c.z), c);
  return index;
}

export interface MapBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/** Emprise (monde) de l'ensemble des cellules — pour un rectangle plein
 *  (toute map anterieure au chantier map irreguliere), reproduit EXACTEMENT
 *  l'ancien `[-halfW, halfW] x [-halfH, halfH]` derive de width/height. Une
 *  cellule occupe `[x, x+1) x [z, z+1)`, d'ou le `+1` sur les bornes max —
 *  jamais juste le point (x, z) lui-meme. */
export function computeMapCellBounds(cells: TerrainCellDef[]): MapBounds {
  if (cells.length === 0) return { minX: 0, maxX: 0, minZ: 0, maxZ: 0 };
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const c of cells) {
    minX = Math.min(minX, c.x);
    maxX = Math.max(maxX, c.x + 1);
    minZ = Math.min(minZ, c.z);
    maxZ = Math.max(maxZ, c.z + 1);
  }
  return { minX, maxX, minZ, maxZ };
}

/**
 * Decor de la carte de campagne "vague1-20" (2026-08-10, fournie par Antoine
 * depuis l'editeur de maps — voir CLAUDE.md, chantier map de campagne) :
 * remplace l'ancien decor OBSTACLES minimal (config/constants.ts, garde tel
 * quel mais plus lu ici) comme decor du jeu REEL, valable jusqu'a la vague
 * 20 — au-dela, une carte differente est prevue pour le mode survie (pas
 * encore fournie/construit, voir CLAUDE.md).
 */
const CAMPAIGN_OBSTACLES: ObstacleDef[] = [
  { kind: 'tree', tilesX: 1, tilesZ: 1, treeModel: 'tree_pineDefaultA', cornerX: -4, cornerZ: -1 },
  { kind: 'tree', tilesX: 1, tilesZ: 1, treeModel: 'tree_pineGroundB', cornerX: -5, cornerZ: 0 },
  { kind: 'tree', tilesX: 1, tilesZ: 1, treeModel: 'tree_pineGroundA', cornerX: -5, cornerZ: -1 },
  { kind: 'tree', tilesX: 1, tilesZ: 1, treeModel: 'tree_pineRoundA', cornerX: -4, cornerZ: 1 },
  { kind: 'tree', tilesX: 1, tilesZ: 1, treeModel: 'tree_pineSmallA', cornerX: -4, cornerZ: 0 },
  { kind: 'tree', tilesX: 1, tilesZ: 1, treeModel: 'tree_pineRoundE', cornerX: 5, cornerZ: -5 },
  { kind: 'tree', tilesX: 1, tilesZ: 1, treeModel: 'tree_pineRoundF', cornerX: 1, cornerZ: -1 },
  { kind: 'tree', tilesX: 1, tilesZ: 1, treeModel: 'tree_pineSmallA', cornerX: -3, cornerZ: -6 },
  { kind: 'tree', tilesX: 1, tilesZ: 1, treeModel: 'tree_pineRoundF', cornerX: -7, cornerZ: -5 },
  { kind: 'tree', tilesX: 1, tilesZ: 1, treeModel: 'tree_pineSmallB', cornerX: -9, cornerZ: 5 },
  { kind: 'tree', tilesX: 1, tilesZ: 1, treeModel: 'tree_pineSmallC', cornerX: 8, cornerZ: 5 },
  { kind: 'tree', tilesX: 1, tilesZ: 1, treeModel: 'tree_pineRoundF', cornerX: 8, cornerZ: -3 },
  { kind: 'tree', tilesX: 1, tilesZ: 1, treeModel: 'tree_pineRoundD', cornerX: 2, cornerZ: 3 },
  { kind: 'tree', tilesX: 1, tilesZ: 1, treeModel: 'tree_pineRoundE', cornerX: 3, cornerZ: 3 },
  { kind: 'prop', tilesX: 1, tilesZ: 1, propModel: 'mushroom_tanTall', scale: 0.14, cornerX: -7, cornerZ: 4 },
  { kind: 'prop', tilesX: 1, tilesZ: 1, propModel: 'mushroom_tanTall', scale: 0.14, cornerX: -9, cornerZ: -2 },
  { kind: 'prop', tilesX: 1, tilesZ: 1, propModel: 'mushroom_tan', scale: 0.22, cornerX: -5, cornerZ: -11 },
  { kind: 'prop', tilesX: 1, tilesZ: 1, propModel: 'mushroom_tanGroup', scale: 0.27, cornerX: 4, cornerZ: -12 },
  { kind: 'prop', tilesX: 1, tilesZ: 1, propModel: 'mushroom_tanGroup', scale: 0.27, cornerX: -1, cornerZ: 6 },
  { kind: 'prop', tilesX: 1, tilesZ: 1, propModel: 'plant_bushLarge', scale: 0.37, cornerX: -2, cornerZ: 2 },
  { kind: 'prop', tilesX: 1, tilesZ: 1, propModel: 'plant_bushLarge', scale: 0.37, cornerX: -4, cornerZ: 8 },
  { kind: 'prop', tilesX: 1, tilesZ: 1, propModel: 'plant_bushLarge', scale: 0.37, cornerX: 1, cornerZ: -3 },
  { kind: 'prop', tilesX: 1, tilesZ: 1, propModel: 'mushroom_tanTall', scale: 0.14, cornerX: -9, cornerZ: -2 },
  { kind: 'prop', tilesX: 1, tilesZ: 1, propModel: 'plant_flatShort', scale: 0.28, cornerX: 2, cornerZ: -9 },
  { kind: 'prop', tilesX: 1, tilesZ: 1, propModel: 'plant_flatTall', scale: 0.27, cornerX: -5, cornerZ: -9 },
  { kind: 'prop', tilesX: 1, tilesZ: 1, propModel: 'plant_flatShort', scale: 0.28, cornerX: 5, cornerZ: 8 },
  { kind: 'prop', tilesX: 1, tilesZ: 1, propModel: 'plant_flatTall', scale: 0.27, cornerX: 2, cornerZ: 8 },
  { kind: 'prop', tilesX: 1, tilesZ: 1, propModel: 'plant_flatShort', scale: 0.28, cornerX: -3, cornerZ: 9 },
  { kind: 'prop', tilesX: 1, tilesZ: 1, propModel: 'plant_flatShort', scale: 0.28, cornerX: -8, cornerZ: 11 },
  { kind: 'prop', tilesX: 1, tilesZ: 1, propModel: 'plant_flatTall', scale: 0.27, cornerX: -7, cornerZ: 6 },
  { kind: 'prop', tilesX: 1, tilesZ: 1, propModel: 'plant_bushSmall', scale: 0.38, cornerX: -7, cornerZ: -1 },
  { kind: 'prop', tilesX: 1, tilesZ: 1, propModel: 'log_stackLarge', scale: 0.71, cornerX: 4, cornerZ: -3 },
  { kind: 'prop', tilesX: 1, tilesZ: 1, propModel: 'log', scale: 0.71, cornerX: 7, cornerZ: 5 },
  { kind: 'prop', tilesX: 1, tilesZ: 1, propModel: 'log_large', scale: 1, cornerX: -3, cornerZ: -5, rotationY: Math.PI },
  { kind: 'prop', tilesX: 1, tilesZ: 1, propModel: 'sign', scale: 0.3, cornerX: -5, cornerZ: 1 },
  { kind: 'rock', tilesX: 2, tilesZ: 2, cornerX: -4, cornerZ: 2 },
  { kind: 'rock', tilesX: 2, tilesZ: 2, cornerX: 2, cornerZ: -6 },
  { kind: 'rock', tilesX: 2, tilesZ: 2, cornerX: -9, cornerZ: -1 },
  { kind: 'rock', tilesX: 2, tilesZ: 2, cornerX: 7, cornerZ: 1 },
  { kind: 'tree', tilesX: 1, tilesZ: 1, treeModel: 'tree_fat', cornerX: -9, cornerZ: 12 },
  { kind: 'tree', tilesX: 1, tilesZ: 1, treeModel: 'tree_tall', cornerX: -9, cornerZ: -13 },
  { kind: 'tree', tilesX: 1, tilesZ: 1, treeModel: 'tree_pineGroundB', cornerX: 8, cornerZ: -13 },
  { kind: 'tree', tilesX: 1, tilesZ: 1, treeModel: 'tree_pineRoundA', cornerX: 1, cornerZ: -13 },
  { kind: 'prop', tilesX: 1, tilesZ: 1, propModel: 'plant_bush', scale: 0.4, cornerX: -1, cornerZ: 5 },
  { kind: 'prop', tilesX: 1, tilesZ: 1, propModel: 'plant_bush', scale: 0.4, cornerX: -3, cornerZ: -1 },
  { kind: 'prop', tilesX: 1, tilesZ: 1, propModel: 'plant_bush', scale: 0.4, cornerX: -5, cornerZ: -5 },
  { kind: 'prop', tilesX: 1, tilesZ: 1, propModel: 'plant_bush', scale: 0.4, cornerX: -3, cornerZ: -8 },
  { kind: 'prop', tilesX: 1, tilesZ: 1, propModel: 'plant_bush', scale: 0.4, cornerX: -8, cornerZ: -10 },
  { kind: 'prop', tilesX: 1, tilesZ: 1, propModel: 'plant_bush', scale: 0.4, cornerX: -5, cornerZ: -11 },
  { kind: 'prop', tilesX: 1, tilesZ: 1, propModel: 'plant_bush', scale: 0.4, cornerX: -1, cornerZ: -11 },
  { kind: 'prop', tilesX: 1, tilesZ: 1, propModel: 'plant_bush', scale: 0.4, cornerX: 3, cornerZ: -11 },
  { kind: 'prop', tilesX: 1, tilesZ: 1, propModel: 'plant_bushLargeTriangle', scale: 0.47, cornerX: 6, cornerZ: -8 },
  { kind: 'prop', tilesX: 1, tilesZ: 1, propModel: 'plant_flatShort', scale: 0.28, cornerX: 0, cornerZ: 4 },
  { kind: 'prop', tilesX: 1, tilesZ: 1, propModel: 'plant_flatShort', scale: 0.28, cornerX: -6, cornerZ: 2 },
  { kind: 'prop', tilesX: 1, tilesZ: 1, propModel: 'plant_flatShort', scale: 0.28, cornerX: -6, cornerZ: 9 },
  { kind: 'prop', tilesX: 1, tilesZ: 1, propModel: 'plant_flatShort', scale: 0.28, cornerX: 3, cornerZ: 10 },
  { kind: 'prop', tilesX: 1, tilesZ: 1, propModel: 'plant_flatShort', scale: 0.28, cornerX: 4, cornerZ: -1 },
  { kind: 'prop', tilesX: 1, tilesZ: 1, propModel: 'plant_flatShort', scale: 0.28, cornerX: -1, cornerZ: -8 },
  { kind: 'prop', tilesX: 1, tilesZ: 1, propModel: 'plant_flatShort', scale: 0.28, cornerX: 7, cornerZ: -10 },
  { kind: 'prop', tilesX: 1, tilesZ: 1, propModel: 'plant_flatTall', scale: 0.27, cornerX: 6, cornerZ: -12 },
  { kind: 'prop', tilesX: 1, tilesZ: 1, propModel: 'flower_purpleA', scale: 0.18, cornerX: 0, cornerZ: 11 },
  { kind: 'prop', tilesX: 1, tilesZ: 1, propModel: 'flower_purpleB', scale: 0.24, cornerX: -4, cornerZ: 4 },
  { kind: 'prop', tilesX: 1, tilesZ: 1, propModel: 'flower_purpleC', scale: 0.18, cornerX: 4, cornerZ: 0 },
  { kind: 'prop', tilesX: 1, tilesZ: 1, propModel: 'flower_purpleB', scale: 0.24, cornerX: -6, cornerZ: -7 },
  { kind: 'prop', tilesX: 1, tilesZ: 1, propModel: 'flower_purpleA', scale: 0.18, cornerX: 0, cornerZ: -10 },
  { kind: 'prop', tilesX: 1, tilesZ: 1, propModel: 'flower_purpleA', scale: 0.18, cornerX: -4, cornerZ: -11 },
  { kind: 'prop', tilesX: 1, tilesZ: 1, propModel: 'flower_purpleA', scale: 0.18, cornerX: 5, cornerZ: -10 },
  { kind: 'prop', tilesX: 1, tilesZ: 1, propModel: 'flower_purpleA', scale: 0.18, cornerX: 6, cornerZ: -2 },
  { kind: 'prop', tilesX: 1, tilesZ: 1, propModel: 'flower_yellowA', scale: 0.18, cornerX: -5, cornerZ: 4 },
  { kind: 'prop', tilesX: 1, tilesZ: 1, propModel: 'stump_round', scale: 0.37, cornerX: 3, cornerZ: 4 },
  { kind: 'prop', tilesX: 1, tilesZ: 1, propModel: 'stump_round', scale: 0.37, cornerX: 6, cornerZ: -6 },
  { kind: 'prop', tilesX: 1, tilesZ: 1, propModel: 'stump_squareDetailedWide', scale: 0.64, cornerX: -7, cornerZ: 2 },
  { kind: 'prop', tilesX: 1, tilesZ: 1, propModel: 'pot_small', scale: 0.32, cornerX: 3, cornerZ: -5 },
  { kind: 'prop', tilesX: 1, tilesZ: 1, propModel: 'campfire_bricks', scale: 0.47, cornerX: -3, cornerZ: -4 },
  { kind: 'prop', tilesX: 1, tilesZ: 1, propModel: 'log_large', scale: 1, cornerX: -4, cornerZ: -4, rotationY: Math.PI / 2 },
  { kind: 'prop', tilesX: 1, tilesZ: 1, propModel: 'campfire_planks', scale: 0.35, cornerX: -3, cornerZ: -4 },
  { kind: 'prop', tilesX: 1, tilesZ: 1, propModel: 'campfire_bricks', scale: 0.47, cornerX: -3, cornerZ: -4 },
  { kind: 'prop', tilesX: 1, tilesZ: 1, propModel: 'campfire_logs', scale: 0.29, cornerX: -3, cornerZ: -4 },
  { kind: 'tree', tilesX: 1, tilesZ: 1, treeModel: 'tree_pineTallC_detailed', cornerX: 2, cornerZ: 4 },
  { kind: 'tree', tilesX: 1, tilesZ: 1, treeModel: 'tree_pineTallC_detailed', cornerX: 1, cornerZ: -2 },
  { kind: 'tree', tilesX: 1, tilesZ: 1, treeModel: 'tree_pineTallC_detailed', cornerX: 5, cornerZ: -4 },
  { kind: 'tree', tilesX: 1, tilesZ: 1, treeModel: 'tree_pineTallC_detailed', cornerX: -9, cornerZ: -12 },
  { kind: 'tree', tilesX: 1, tilesZ: 1, treeModel: 'tree_pineTallC_detailed', cornerX: 8, cornerZ: -2 },
  { kind: 'tree', tilesX: 1, tilesZ: 1, treeModel: 'tree_pineTallD', cornerX: -9, cornerZ: -3 },
  { kind: 'prop', tilesX: 1, tilesZ: 1, propModel: 'stump_roundDetailed', scale: 0.37, cornerX: -6, cornerZ: 10 },
  { kind: 'prop', tilesX: 1, tilesZ: 1, propModel: 'stump_square', scale: 0.36, cornerX: 8, cornerZ: -8 },
  { kind: 'prop', tilesX: 1, tilesZ: 1, propModel: 'plant_bush', scale: 0.4, cornerX: -2, cornerZ: 7 },
  { kind: 'prop', tilesX: 1, tilesZ: 1, propModel: 'plant_bush', scale: 0.4, cornerX: -5, cornerZ: 6 },
  { kind: 'prop', tilesX: 1, tilesZ: 1, propModel: 'plant_bush', scale: 0.4, cornerX: -7, cornerZ: -10 },
  { kind: 'prop', tilesX: 1, tilesZ: 1, propModel: 'plant_bush', scale: 0.4, cornerX: -3, cornerZ: -11 },
  { kind: 'prop', tilesX: 1, tilesZ: 1, propModel: 'plant_bush', scale: 0.4, cornerX: 2, cornerZ: -9 },
  { kind: 'prop', tilesX: 1, tilesZ: 1, propModel: 'plant_bush', scale: 0.4, cornerX: -1, cornerZ: 6 },
  { kind: 'prop', tilesX: 1, tilesZ: 1, propModel: 'plant_bush', scale: 0.4, cornerX: 6, cornerZ: 7 },
  { kind: 'prop', tilesX: 1, tilesZ: 1, propModel: 'plant_bush', scale: 0.4, cornerX: 5, cornerZ: 2 },
  { kind: 'prop', tilesX: 1, tilesZ: 1, propModel: 'plant_bush', scale: 0.4, cornerX: 8, cornerZ: -1 },
  { kind: 'prop', tilesX: 1, tilesZ: 1, propModel: 'plant_bushDetailed', scale: 0.6, cornerX: -8, cornerZ: -6 },
  { kind: 'prop', tilesX: 1, tilesZ: 1, propModel: 'plant_bushDetailed', scale: 0.6, cornerX: -9, cornerZ: -4 },
  { kind: 'prop', tilesX: 1, tilesZ: 1, propModel: 'plant_bushDetailed', scale: 0.6, cornerX: -1, cornerZ: -7 },
  { kind: 'prop', tilesX: 1, tilesZ: 1, propModel: 'plant_bushDetailed', scale: 0.6, cornerX: -7, cornerZ: -9 },
  { kind: 'prop', tilesX: 1, tilesZ: 1, propModel: 'plant_bushDetailed', scale: 0.6, cornerX: 1, cornerZ: -10 },
  { kind: 'prop', tilesX: 1, tilesZ: 1, propModel: 'plant_bushDetailed', scale: 0.6, cornerX: 7, cornerZ: 12 },
  { kind: 'prop', tilesX: 1, tilesZ: 1, propModel: 'plant_bushDetailed', scale: 0.6, cornerX: -2, cornerZ: 12 },
];

/**
 * Formations joueur/ennemi : la map fournie par Antoine ne definissait que
 * le decor (playerUnits/enemyUnits vides a l'export) — on reprend donc les
 * MEMES formules que l'ancien decor par defaut (basees sur BOARD_H/
 * PLACEMENT_ROWS, valables sans changement ici puisque la largeur/hauteur
 * de cette carte est identique, 18x26). Rappel : ces deux tableaux ne
 * pilotent plus le jeu REEL (qui calcule sa propre formation/composition,
 * voir main.ts) — seulement l'editeur et setupTestBattle() (raccourci de
 * dev).
 */
function buildDefaultMap(): MapDef {
  const halfH = (BOARD_H * TILE) / 2;

  const playerFrontZ = halfH - PLACEMENT_ROWS * TILE + 0.5;
  const playerBackZ = playerFrontZ + TILE;
  const enemyFrontZ = -halfH + PLACEMENT_ROWS * TILE - 0.5;

  return {
    name: 'vague1-20',
    version: 1,
    width: BOARD_W,
    height: BOARD_H,
    obstacles: CAMPAIGN_OBSTACLES,
    playerUnits: [
      { unitId: 'fantassin', x: -2.5, z: playerFrontZ },
      { unitId: 'fantassin', x: -1.5, z: playerFrontZ },
      { unitId: 'fantassin', x: -0.5, z: playerFrontZ },
      { unitId: 'fantassin', x: 0.5, z: playerFrontZ },
      { unitId: 'archer', x: -1.5, z: playerBackZ },
      { unitId: 'archer', x: 0.5, z: playerBackZ },
    ],
    // Un seul fantassin, comme le joueur (demande d'Antoine, 2026-08-10) —
    // remplace l'ancienne composition fixe "3 fantassins + 1 archer".
    // ATTENTION : cette valeur ne pilote plus la vague 1 du jeu REEL, qui
    // calcule desormais sa composition dynamiquement depuis le numero de
    // vague (voir main.ts, computeEnemyWavePlacements + run/runState.ts,
    // computeEnemyWaveComposition — 1 fantassin en vague 1, +1 par vague
    // jusqu'a 3, puis +1 archer par vague a partir de la vague 4). Reste
    // utilisee par setupTestBattle() (raccourci de dev) et par l'editeur de
    // maps (carte de depart, "Tester le scenario") : gardee coherente avec
    // la vague 1 reelle par simplicite, pas parce qu'un lien de code existe
    // entre les deux.
    enemyUnits: [{ unitId: 'fantassin', x: 0, z: enemyFrontZ }],
  };
}

export const DEFAULT_MAP: MapDef = buildDefaultMap();

/**
 * Coin (+X, +Z) du plateau, a PLAYER_ARROW_CORNER_INSET cases du bord —
 * calculee depuis la taille REELLE de la map plutot que codee en dur, pour
 * que la baliste du joueur reste dans le coin quelle que soit la taille du
 * plateau charge (demande d'Antoine, 2026-08-08 : "elle doit se replacer
 * lors de l'agrandissement de la carte"). Pour le plateau par defaut
 * (18×26), reproduit exactement l'ancienne coordonnee fixe (8, 12).
 */
export function computePlayerArrowOrigin(map: Pick<MapDef, 'width' | 'height'>): { x: number; z: number } {
  const halfW = (map.width * TILE) / 2;
  const halfH = (map.height * TILE) / 2;
  return { x: halfW - PLAYER_ARROW_CORNER_INSET, z: halfH - PLAYER_ARROW_CORNER_INSET };
}

/**
 * Footprint de collision/placement de la plateforme tour+Baliste (2026-08-16,
 * architecture BUILDING : la Baliste devient un bâtiment gameplay
 * destructible, voir data/buildings.ts) — PUREMENT une empreinte de
 * collision (jamais passée à buildObstacleMesh/le rendu : le visuel de la
 * plateforme existe déjà séparément, voir render/ballista.ts,
 * buildBallistaTowerPlatform). Centrée sur computePlayerArrowOrigin, emprise
 * carrée BALLISTA_TOWER_FOOTPRINT — SOURCE UNIQUE partagée avec la mise à
 * l'échelle visuelle réelle de la tour, jamais une valeur dupliquée.
 */
/**
 * `origin` (2026-08-18, placement libre de la tour au debut d'une run —
 * "la tour ne doit plus être bloquée dans le coin, elle doit pouvoir être
 * placée librement dans la zone de spawn") : PRIS EN PARAMETRE plutot que
 * derive en interne d'une `map` — cette fonction ne sait plus OU se trouve
 * la tour, seulement calculer son empreinte de collision une fois qu'on le
 * lui dit. L'appelant (main.ts) passe soit `computePlayerArrowOrigin(map)`
 * (repli formule fixe, toujours utilise par l'editeur de maps/"Tester le
 * scenario", sans lien avec une run reelle), soit la position REELLEMENT
 * choisie par le joueur (`currentRun.ballistaPosition`/`playerArrowOrigin`).
 */
export function computeBallistaObstacle(origin: { x: number; z: number }): ObstacleDef {
  return {
    kind: 'building',
    tilesX: BALLISTA_TOWER_FOOTPRINT,
    tilesZ: BALLISTA_TOWER_FOOTPRINT,
    x: origin.x,
    z: origin.z,
    // Position via x/z (pas cornerX/cornerZ) : meme convention "libre" que
    // le reste du chantier placement libre (voir obstacleCenter). Aucune
    // rotationY : l'obstacle carre est deja symetrique, jamais rendu de
    // toute facon (voir le commentaire de fonction ci-dessus).
  };
}
