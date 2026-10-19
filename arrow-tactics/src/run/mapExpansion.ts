import { obstacleAppearanceSeed, obstacleCenter, PLACEMENT_ROWS, TILE, type ObstacleDef } from '../config/constants';
import { cellKey, resolveMapCells, type MapDef, type MapUnitPlacement, type TerrainCellDef, type TerrainType } from '../config/mapDef';
import type { TerritoryCell } from '../config/territory';

/**
 * Agrandissement progressif du champ de bataille au fil des vagues
 * (2026-08-18, demande d'Antoine : "je veux que le champ de bataille evolue
 * physiquement au fil des vagues afin de donner progressivement davantage de
 * place" — plus de place pour construire une base, acheter des bâtiments,
 * placer des unités, des batailles plus amples).
 *
 * Architecture retenue APRÈS audit (voir échange avec Antoine) : l'emprise
 * de la carte reste un rectangle centré — piloté par 3 compteurs plutôt que
 * par une liste de cellules à faire évoluer à la main. Les trous et le
 * terrain de la carte de départ sont reportés à chaque étape (expandCells) :
 * une arène irrégulière garde sa forme. Compteurs :
 * - `spawnDepth` : profondeur (en cases) de CHAQUE zone de spawn (joueur ET
 *   ennemi, toujours égales — topologie symétrique même si l'IA n'utilise
 *   pas encore pleinement ses propres bâtiments, demande explicite). Démarre
 *   à PLACEMENT_ROWS (le jeu réel remplace désormais la constante globale
 *   par cette valeur dynamique, voir main.ts — PLACEMENT_ROWS reste la
 *   valeur de DÉPART et continue de piloter l'éditeur de maps, qui n'a pas
 *   de notion de run/expansion).
 * - `halfWidthTiles` : demi-largeur du plateau, en cases.
 * - `battlefieldRows` : nombre de rangées NEUTRES entre les deux zones de
 *   spawn (le "champ de bataille" au sens strict).
 *
 * `map.width`/`map.height` sont TOUJOURS dérivés de ces 3 compteurs
 * (`width = halfWidthTiles*2`, `height = 2*spawnDepth + battlefieldRows`) —
 * jamais désynchronisés. C'est ce qui permet aux étapes A et B de ne JAMAIS
 * avoir à translater le moindre objet existant : elles ne grandissent qu'un
 * bord EXTÉRIEUR (l'arrière de chaque spawn pour A, les côtés pour B), la
 * frontière avec le champ de bataille ne bouge pas — vérifié par calcul
 * (voir le commentaire de applyMapExpansionStep, cas 'spawnBack'/'sides').
 */

export type MapExpansionStep = 'spawnBack' | 'sides' | 'center';

const STEP_CYCLE: MapExpansionStep[] = ['spawnBack', 'sides', 'center'];

/** Cycle A → B → C → A → ... — `completedWave` est le numéro de la vague qui
 *  vient REELLEMENT d'être gagnée (1-indexé, celui affiché au joueur), pas un
 *  index interne : vague 1 gagnée → 'spawnBack', vague 2 → 'sides', vague 3
 *  → 'center', vague 4 → 'spawnBack' de nouveau, etc. */
export function expansionStepForCompletedWave(completedWave: number): MapExpansionStep {
  return STEP_CYCLE[(completedWave - 1) % 3]!;
}

/** Terrain par défaut des nouvelles cellules (2026-08-18) — toutes les
 *  cellules de ce jeu sont aujourd'hui de l'herbe uniforme (`DEFAULT_MAP.cells`
 *  est absent, synthétisé en 'grass' par resolveMapCells), donc régénérer un
 *  rectangle plein de ce type reproduit fidèlement l'existant sans avoir à
 *  "hériter" un terrain par cellule voisine — solution retenue plus simple,
 *  centralisée ici comme demandé explicitement (DEFAULT_EXPANSION_TERRAIN). */
export const DEFAULT_EXPANSION_TERRAIN: TerrainType = 'grass';

function buildUniformCells(width: number, height: number, terrain: TerrainType): TerrainCellDef[] {
  const halfW = Math.floor(width / 2);
  const halfH = Math.floor(height / 2);
  const cells: TerrainCellDef[] = [];
  for (let iz = 0; iz < height; iz++) {
    for (let ix = 0; ix < width; ix++) cells.push({ x: ix - halfW, z: iz - halfH, terrain });
  }
  return cells;
}

/** Déplacement d'un axe pendant une étape : `offset(c)` pour une coordonnée
 *  monde `c` (centre d'objet ou de case), et rang de préférence d'une
 *  ancienne rangée/colonne quand deux sources sont à égale distance d'une
 *  nouvelle case (plus petit = préféré). */
interface AxisMove {
  offset: (c: number) => number;
  tiePriority: (offset: number) => number;
}

const NO_MOVE: AxisMove = { offset: () => 0, tiePriority: () => 0 };

/** Indice d'ancienne rangée (ou colonne, coin entier) dont l'image est la
 *  plus proche de `target` ; à égalité, celui que `tiePriority` préfère, puis
 *  le premier (déterministe). */
function nearestSource(count: number, first: number, move: AxisMove, target: number): number {
  let best = first;
  let bestDistance = Infinity;
  let bestPriority = Infinity;
  for (let i = first; i < first + count; i++) {
    const offset = move.offset(i + TILE / 2);
    const distance = Math.abs(i + offset - target);
    const priority = move.tiePriority(offset);
    if (distance < bestDistance || (distance === bestDistance && priority < bestPriority)) {
      best = i;
      bestDistance = distance;
      bestPriority = priority;
    }
  }
  return best;
}

/**
 * Cases (et territoire explicite) du nouveau rectangle centré
 * `width × height`, en conservant la FORME de l'ancienne carte : chaque
 * nouvelle case reprend l'état (case présente ou trou, terrain, camp) de
 * l'ancienne case dont l'image par les déplacements de l'étape — les mêmes
 * que ceux des objets — est la plus proche. Une carte sans trou d'herbe
 * uniforme et sans territoire explicite (carte de départ historique) donne
 * exactement le rectangle plein d'herbe d'avant.
 */
function expandCells(map: MapDef, width: number, height: number, moveX: AxisMove = NO_MOVE, moveZ: AxisMove = NO_MOVE): Pick<MapDef, 'cells' | 'territory'> {
  const old = new Map(resolveMapCells(map).map((c) => [cellKey(c.x, c.z), c.terrain]));
  const oldTerritory = new Map((map.territory ?? []).map((c) => [cellKey(c.x, c.z), c.team]));
  const oldMinX = -Math.floor(map.width / 2);
  const oldMinZ = -Math.floor(map.height / 2);
  const sourceX = new Map<number, number>();
  const sourceZ = new Map<number, number>();
  const cells: TerrainCellDef[] = [];
  const territory: TerritoryCell[] = [];
  for (const cell of buildUniformCells(width, height, DEFAULT_EXPANSION_TERRAIN)) {
    if (!sourceX.has(cell.x)) sourceX.set(cell.x, nearestSource(map.width, oldMinX, moveX, cell.x));
    if (!sourceZ.has(cell.z)) sourceZ.set(cell.z, nearestSource(map.height, oldMinZ, moveZ, cell.z));
    const source = cellKey(sourceX.get(cell.x)!, sourceZ.get(cell.z)!);
    const terrain = old.get(source);
    if (terrain === undefined) continue;
    cells.push({ ...cell, terrain });
    const team = oldTerritory.get(source);
    if (team) territory.push({ x: cell.x, z: cell.z, team });
  }
  return map.territory === undefined ? { cells } : { cells, territory };
}

/**
 * Frontières des camps lues par l'expansion (coordonnées monde) : celles du
 * territoire EXPLICITE de la carte s'il existe, sinon celles des bandes
 * historiques — bords du plateau et `spawnDepth` (calcul d'avant inchangé).
 * - `playerFrontZ` / `enemyFrontZ` : bords des zones côté champ de bataille ;
 * - `backZ` / `enemyBackZ`, `leftX` / `rightX` : bords extérieurs des zones.
 *   Au-delà (bordure neutre d'une arène), les cases sont repoussées vers
 *   l'extérieur aux étapes A et B, et la zone grandit à leur place.
 */
interface ExpansionAnchors {
  playerFrontZ: number;
  enemyFrontZ: number;
  backZ: number;
  enemyBackZ: number;
  leftX: number;
  rightX: number;
}

function expansionAnchors(map: MapDef, state: MapExpansionState): ExpansionAnchors {
  const halfW = (map.width * TILE) / 2;
  const halfH = (map.height * TILE) / 2;
  const anchors: ExpansionAnchors = {
    playerFrontZ: halfH - state.spawnDepth * TILE,
    enemyFrontZ: -halfH + state.spawnDepth * TILE,
    backZ: halfH,
    enemyBackZ: -halfH,
    leftX: -halfW,
    rightX: halfW,
  };
  const territory = map.territory ?? [];
  const player = territory.filter((c) => c.team === 'player');
  const enemy = territory.filter((c) => c.team === 'enemy');
  if (player.length > 0) {
    anchors.playerFrontZ = Math.min(...player.map((c) => c.z));
    anchors.backZ = Math.max(...player.map((c) => c.z)) + TILE;
  }
  if (enemy.length > 0) {
    anchors.enemyFrontZ = Math.max(...enemy.map((c) => c.z)) + TILE;
    anchors.enemyBackZ = Math.min(...enemy.map((c) => c.z));
  }
  if (territory.length > 0) {
    anchors.leftX = Math.min(...territory.map((c) => c.x));
    anchors.rightX = Math.max(...territory.map((c) => c.x)) + TILE;
  }
  return anchors;
}

/** Étapes A et B : repousse d'une case vers l'extérieur ce qui est au-delà
 *  des zones (`high` et plus, ou sous `low`) ; une nouvelle case égale
 *  reprend de préférence l'ancienne case restée en place. */
function outwardMove(low: number, high: number): AxisMove {
  return {
    offset: (c) => (c >= high ? TILE : c < low ? -TILE : 0),
    tiePriority: (offset) => Math.abs(offset),
  };
}

function translateObstacle(o: ObstacleDef, moveX: AxisMove, moveZ: AxisMove): ObstacleDef {
  const center = obstacleCenter(o);
  const dx = moveX.offset(center.x);
  const dz = moveZ.offset(center.z);
  if (dx === 0 && dz === 0) return o;
  // Graine d'aspect figee avant le deplacement : le decor garde son aspect.
  const moved = { ...o, appearanceSeed: obstacleAppearanceSeed(o) };
  if (o.x !== undefined && o.z !== undefined) return { ...moved, x: o.x + dx, z: o.z + dz };
  return { ...moved, cornerX: (o.cornerX ?? 0) + dx, cornerZ: (o.cornerZ ?? 0) + dz };
}

function translateUnit(u: MapUnitPlacement, moveX: AxisMove, moveZ: AxisMove): MapUnitPlacement {
  const dx = moveX.offset(u.x);
  const dz = moveZ.offset(u.z);
  return dx === 0 && dz === 0 ? u : { ...u, x: u.x + dx, z: u.z + dz };
}

/** Nouvelle carte d'une étape : dimensions, cases et territoire reportés par
 *  `moveX`/`moveZ` ; objets et unités déplacés seulement si `moveObjects`
 *  (étape C). Aux étapes A et B, aucun objet ne bouge, comme avant : seules
 *  les cases et les zones s'élargissent. */
function expandedMap(map: MapDef, width: number, height: number, moveX: AxisMove, moveZ: AxisMove, moveObjects: boolean): MapDef {
  const objectX = moveObjects ? moveX : NO_MOVE;
  const objectZ = moveObjects ? moveZ : NO_MOVE;
  return {
    ...map,
    width,
    height,
    ...expandCells(map, width, height, moveX, moveZ),
    obstacles: map.obstacles.map((o) => translateObstacle(o, objectX, objectZ)),
    playerUnits: map.playerUnits.map((u) => translateUnit(u, objectX, objectZ)),
    enemyUnits: map.enemyUnits.map((u) => translateUnit(u, objectX, objectZ)),
  };
}

/**
 * État d'expansion d'une run — persiste sur `RunState` (voir run/runState.ts),
 * jamais sur `MetaProgress` : une nouvelle run repart toujours de la carte de
 * base, exactement comme l'or/l'armée/l'inventaire.
 */
export interface MapExpansionState {
  spawnDepth: number;
  halfWidthTiles: number;
  battlefieldRows: number;
  /** Dernière vague RÉELLEMENT gagnée pour laquelle une expansion a été
   *  appliquée — idempotence (voir demande explicite d'Antoine : "une vague
   *  ne doit jamais appliquer deux fois son expansion"). 0 = aucune
   *  expansion encore appliquée. */
  lastExpandedWave: number;
}

export function createInitialMapExpansionState(baseMap: Pick<MapDef, 'width' | 'height'>): MapExpansionState {
  return {
    spawnDepth: PLACEMENT_ROWS,
    halfWidthTiles: baseMap.width / 2,
    battlefieldRows: baseMap.height - 2 * PLACEMENT_ROWS,
    lastExpandedWave: 0,
  };
}

/** Décale la coordonnée Z (monde) d'un objet selon la formule "camp joueur
 *  fixe" retenue pour l'ÉTAPE C (voir commentaire de classe) : rien ne bouge
 *  au-delà de `playerFrontZ` (zone joueur, cette EXACTE frontière comprise),
 *  -1 case dans l'ancien champ de bataille, -2 cases à partir de la zone
 *  ennemie (au-delà de `enemyFrontZ`, comprise) — fonction CENTRALISÉE
 *  unique, jamais un `z -= 2` disperse à plusieurs endroits. */
function centerExpansionZOffset(z: number, playerFrontZ: number, enemyFrontZ: number): number {
  if (z >= playerFrontZ) return 0;
  if (z > enemyFrontZ) return -TILE;
  return -2 * TILE;
}

export interface MapExpansionResult {
  map: MapDef;
  state: MapExpansionState;
  /** Décalage Z appliqué (par objet, voir centerExpansionZOffset) — `0`
   *  partout pour 'spawnBack'/'sides' (rien ne bouge, voir plus haut), la
   *  vraie formule piecewise seulement pour 'center'. Exposé pour que
   *  l'appelant (main.ts) puisse translater ses propres objets RUN-mutables
   *  (RunState.buildings) avec la MEME fonction, jamais une deuxième copie. */
  offsetForZ: (z: number) => number;
}

/**
 * Applique UNE étape d'expansion à une MapDef existante — retourne une TOUTE
 * NOUVELLE MapDef (jamais de mutation en place : `map` peut être une
 * référence partagée comme DEFAULT_MAP, elle doit rester intacte) et le
 * nouvel état de compteurs.
 */
export function applyMapExpansionStep(map: MapDef, state: MapExpansionState, step: MapExpansionStep): MapExpansionResult {
  const anchors = expansionAnchors(map, state);
  switch (step) {
    case 'spawnBack': {
      // +1 rangée derrière CHAQUE zone de spawn (voir demande, "après les
      // waves 1/4/7...") — height grandit de 2 (1 par côté), width inchangé.
      // La frontière zone/champ de bataille ne bouge pas : seule la
      // profondeur ARRIÈRE de chaque zone grandit. Aucun objet ne bouge. Sans
      // territoire explicite, les bandes sont recalculées ; avec, la bordure
      // neutre au-delà des zones recule d'une case et la zone reprend la
      // rangée libérée.
      const newState: MapExpansionState = { ...state, spawnDepth: state.spawnDepth + 1 };
      const width = newState.halfWidthTiles * 2;
      const height = 2 * newState.spawnDepth + newState.battlefieldRows;
      return {
        map: expandedMap(map, width, height, NO_MOVE, outwardMove(anchors.enemyBackZ, anchors.backZ), false),
        state: newState,
        offsetForZ: () => 0,
      };
    }
    case 'sides': {
      // +1 colonne de chaque côté (X). Aucun objet ne bouge. Sans territoire
      // explicite, les nouvelles colonnes héritent des bandes ; avec, la
      // bordure latérale recule d'une case et les zones s'élargissent.
      const newState: MapExpansionState = { ...state, halfWidthTiles: state.halfWidthTiles + 1 };
      const width = newState.halfWidthTiles * 2;
      const height = 2 * newState.spawnDepth + newState.battlefieldRows;
      return {
        map: expandedMap(map, width, height, outwardMove(anchors.leftX, anchors.rightX), NO_MOVE, false),
        state: newState,
        offsetForZ: () => 0,
      };
    }
    case 'center': {
      // Voir le commentaire de classe / centerExpansionZOffset : le camp
      // JOUEUR reste fixe, l'ancien champ de bataille recule d'1 case, la
      // zone ENNEMIE (et tout ce qu'elle contient, territoire compris) recule
      // de 2 cases — frontières d'AVANT cette étape. Les deux nouvelles
      // rangées reprennent le champ de bataille voisin.
      const offsetForZ = (z: number) => centerExpansionZOffset(z, anchors.playerFrontZ, anchors.enemyFrontZ);
      const moveZ: AxisMove = { offset: offsetForZ, tiePriority: (offset) => (offset === -TILE ? 0 : 1) };
      const newState: MapExpansionState = { ...state, battlefieldRows: state.battlefieldRows + 2 };
      const width = newState.halfWidthTiles * 2;
      const height = 2 * newState.spawnDepth + newState.battlefieldRows;
      return {
        map: expandedMap(map, width, height, NO_MOVE, moveZ, true),
        state: newState,
        offsetForZ,
      };
    }
  }
}
