import { obstacleCenter, PLACEMENT_ROWS, TILE, type ObstacleDef } from '../config/constants';
import type { MapDef, MapUnitPlacement, TerrainCellDef, TerrainType } from '../config/mapDef';

/**
 * Agrandissement progressif du champ de bataille au fil des vagues
 * (2026-08-18, demande d'Antoine : "je veux que le champ de bataille evolue
 * physiquement au fil des vagues afin de donner progressivement davantage de
 * place" — plus de place pour construire une base, acheter des bâtiments,
 * placer des unités, des batailles plus amples).
 *
 * Architecture retenue APRÈS audit (voir échange avec Antoine) : la carte
 * reste TOUJOURS un rectangle plein (jamais une forme irrégulière) — piloté
 * par 3 compteurs plutôt que par une liste de cellules à faire évoluer à la
 * main :
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

function translateObstacleZ(o: ObstacleDef, offsetFor: (z: number) => number): ObstacleDef {
  const center = obstacleCenter(o);
  const offset = offsetFor(center.z);
  if (offset === 0) return o;
  if (o.x !== undefined && o.z !== undefined) return { ...o, z: o.z + offset };
  return { ...o, cornerZ: (o.cornerZ ?? 0) + offset };
}

function translateUnitZ(u: MapUnitPlacement, offsetFor: (z: number) => number): MapUnitPlacement {
  const offset = offsetFor(u.z);
  return offset === 0 ? u : { ...u, z: u.z + offset };
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
  switch (step) {
    case 'spawnBack': {
      // +1 rangée ENTIÈRE derrière CHAQUE zone de spawn (voir demande,
      // "après les waves 1/4/7...") — height grandit de 2 (1 par côté),
      // width inchangé. Rien ne bouge : la frontière spawn/battlefield est
      // `battlefieldRows/2` depuis le centre, INDÉPENDANTE de spawnDepth
      // (vérifié par calcul : halfH = spawnDepth + battlefieldRows/2, donc
      // frontZ = halfH - spawnDepth = battlefieldRows/2 quel que soit
      // spawnDepth) — seule la profondeur ARRIÈRE de chaque zone grandit.
      const newState: MapExpansionState = { ...state, spawnDepth: state.spawnDepth + 1 };
      const width = newState.halfWidthTiles * 2;
      const height = 2 * newState.spawnDepth + newState.battlefieldRows;
      return {
        map: { ...map, width, height, cells: buildUniformCells(width, height, DEFAULT_EXPANSION_TERRAIN) },
        state: newState,
        offsetForZ: () => 0,
      };
    }
    case 'sides': {
      // +1 bande de chaque côté (X), prolongeant la segmentation
      // longitudinale déjà en place (les zones sont un pur calcul sur Z,
      // jamais tagguées par cellule — voir le commentaire de classe) : une
      // nouvelle colonne hérite automatiquement de la bonne zone, aucun
      // objet existant ne change de X.
      const newState: MapExpansionState = { ...state, halfWidthTiles: state.halfWidthTiles + 1 };
      const width = newState.halfWidthTiles * 2;
      const height = 2 * newState.spawnDepth + newState.battlefieldRows;
      return {
        map: { ...map, width, height, cells: buildUniformCells(width, height, DEFAULT_EXPANSION_TERRAIN) },
        state: newState,
        offsetForZ: () => 0,
      };
    }
    case 'center': {
      // Voir le commentaire de classe / centerExpansionZOffset : le camp
      // JOUEUR reste fixe, l'ancien champ de bataille recule d'1 case, la
      // zone ENNEMIE (et tout ce qu'elle contient) recule de 2 cases — les
      // frontières utilisées sont celles d'AVANT cette étape (map.height
      // actuel), jamais les nouvelles.
      const halfH = (map.height * TILE) / 2;
      const playerFrontZ = halfH - state.spawnDepth * TILE;
      const enemyFrontZ = -halfH + state.spawnDepth * TILE;
      const offsetForZ = (z: number) => centerExpansionZOffset(z, playerFrontZ, enemyFrontZ);

      const newState: MapExpansionState = { ...state, battlefieldRows: state.battlefieldRows + 2 };
      const width = newState.halfWidthTiles * 2;
      const height = 2 * newState.spawnDepth + newState.battlefieldRows;
      return {
        map: {
          ...map,
          width,
          height,
          cells: buildUniformCells(width, height, DEFAULT_EXPANSION_TERRAIN),
          obstacles: map.obstacles.map((o) => translateObstacleZ(o, offsetForZ)),
          playerUnits: map.playerUnits.map((u) => translateUnitZ(u, offsetForZ)),
          enemyUnits: map.enemyUnits.map((u) => translateUnitZ(u, offsetForZ)),
        },
        state: newState,
        offsetForZ,
      };
    }
  }
}
