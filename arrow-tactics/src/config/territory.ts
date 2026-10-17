import { cellKey, computeMapCellBounds, resolveMapCells, type MapDef } from './mapDef';

/**
 * Territoire par cases : quelle case appartient à quel camp. Module PUR
 * (aucun DOM, Three.js, rendu ni simulation), destiné à devenir la source de
 * vérité du placement, de la construction et du camp dans l'éditeur.
 *
 * Convention de coordonnées : exactement celle de `MapDef.cells` — x/z
 * entiers signés désignant le COIN bas-gauche d'une case d'1×1, qui couvre
 * `[x, x+1) × [z, z+1)`. Une case absente du territoire est NEUTRE.
 *
 * Utilisé par la validation du placement en jeu (main.ts) ; ni l'éditeur
 * ni le rendu ne l'utilisent encore.
 */

/** Camp propriétaire d'une case. Littéral volontairement local plutôt
 *  qu'importé de sim/ (config/ n'importe jamais sim/) : structurellement
 *  identique à `Team` (sim/entity.ts), donc directement assignable. */
export type TerritoryTeam = 'player' | 'enemy';

export interface TerritoryCell {
  x: number;
  z: number;
  team: TerritoryTeam;
}

export interface TerritoryIndex {
  /** Camp de la case (cellX, cellZ) — coordonnées ENTIÈRES de case — ou
   *  null si elle est neutre. */
  ownerAt(cellX: number, cellZ: number): TerritoryTeam | null;
}

/** Index O(1) d'un territoire, clé `cellKey` comme `buildCellIndex`. Même
 *  convention que lui pour les doublons : la DERNIÈRE entrée d'une même case
 *  l'emporte. Construit une fois par appelant, jamais par image. */
export function buildTerritoryIndex(cells: readonly TerritoryCell[]): TerritoryIndex {
  const owners = new Map<string, TerritoryTeam>();
  for (const c of cells) owners.set(cellKey(c.x, c.z), c.team);
  return {
    ownerAt: (cellX, cellZ) => owners.get(cellKey(cellX, cellZ)) ?? null,
  };
}

/** Camp de la case qui contient le point monde (x, z) : `floor` sur chaque
 *  axe, donc une frontière exacte appartient à la case de droite / du haut
 *  (x = -3 est dans la case -3, x = -2 dans la case -2). */
export function territoryOwnerAtPoint(index: TerritoryIndex, x: number, z: number): TerritoryTeam | null {
  return index.ownerAt(Math.floor(x), Math.floor(z));
}

/** Vrai seulement si TOUTES les cases de l'empreinte `tilesX × tilesZ`, de
 *  coin (cornerX, cornerZ), appartiennent à `team` : une seule case neutre
 *  ou adverse suffit à refuser. Dimensions entières et strictement
 *  positives exigées (sinon false — jamais un "vrai" par empreinte vide). */
export function isFootprintOwnedBy(
  index: TerritoryIndex,
  team: TerritoryTeam,
  cornerX: number,
  cornerZ: number,
  tilesX: number,
  tilesZ: number,
): boolean {
  if (!Number.isInteger(tilesX) || !Number.isInteger(tilesZ) || tilesX <= 0 || tilesZ <= 0) return false;
  for (let dz = 0; dz < tilesZ; dz++) {
    for (let dx = 0; dx < tilesX; dx++) {
      if (index.ownerAt(cornerX + dx, cornerZ + dz) !== team) return false;
    }
  }
  return true;
}

/**
 * Territoire d'une map — SOURCE UNIQUE du repli : `map.territory` s'il est
 * présent (même vide : `[]` reste un territoire vide, jamais remplacé),
 * sinon les bandes historiques (deriveLegacyTerritory). Renvoie toujours un
 * NOUVEAU tableau de nouvelles cases : le modifier ne touche jamais la map.
 */
export function resolveMapTerritory(map: Pick<MapDef, 'width' | 'height' | 'cells' | 'territory'>, spawnDepth: number): TerritoryCell[] {
  if (map.territory) return map.territory.map((c) => ({ x: c.x, z: c.z, team: c.team }));
  return deriveLegacyTerritory(map, spawnDepth);
}

/**
 * Territoire historique, en repli pour une carte qui n'en définit pas : les
 * `spawnDepth` rangées ARRIÈRE +z au joueur, les `spawnDepth` rangées
 * arrière -z à l'ennemi, le centre neutre. Seules les cellules RÉELLEMENT
 * présentes (resolveMapCells) reçoivent un camp : un trou reste hors
 * territoire.
 *
 * Les rangées se comptent depuis l'emprise réelle des cellules
 * (computeMapCellBounds), pas depuis `height / 2` : pour un rectangle plein
 * de dimensions paires (carte de départ et toutes ses expansions), le
 * résultat est identique à la zone de `isValidPlacementTile` (main.ts) ; pour
 * une dimension impaire, il suit la grille effective des cellules.
 *
 * Si les deux bandes se chevauchent (2 × spawnDepth supérieur à la
 * profondeur de la carte), une case des deux bandes revient au joueur.
 * Ordre de sortie : celui des cellules de la carte (déterministe).
 */
export function deriveLegacyTerritory(map: Pick<MapDef, 'width' | 'height' | 'cells'>, spawnDepth: number): TerritoryCell[] {
  const cells = resolveMapCells(map);
  if (cells.length === 0 || spawnDepth <= 0) return [];
  const bounds = computeMapCellBounds(cells);
  const playerMinZ = bounds.maxZ - spawnDepth;
  const enemyMaxZ = bounds.minZ + spawnDepth;

  const territory: TerritoryCell[] = [];
  for (const c of cells) {
    if (c.z >= playerMinZ) territory.push({ x: c.x, z: c.z, team: 'player' });
    else if (c.z < enemyMaxZ) territory.push({ x: c.x, z: c.z, team: 'enemy' });
  }
  return territory;
}
