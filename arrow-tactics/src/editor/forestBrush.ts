/**
 * Pinceau Foret de l'editeur (2026-11-01) : calcul PUR et deterministe des
 * arbres poses par un trait. Aucun hasard : tout derive d'un hachage de la
 * case, de sorte que la meme carte et le meme trait donnent toujours les
 * memes arbres (positions, modeles, rotations, tailles).
 *
 *  - Cases : disque de diametre `size` autour de la case visee
 *    (forestBrushCells).
 *  - Densite : une probabilite par case, modulee par un bruit de basse
 *    frequence (une valeur par bloc de FOREST_CLUSTER_CELLS cases, interpolee) :
 *    zones touffues et clairieres, jamais une grille reguliere.
 *  - Arbres : un par case retenue, parfois deux dans les zones touffues
 *    (petits groupes) ; jamais au centre exact de la case, toujours dans la
 *    case ; rotation et taille (±10 %) propres a chaque arbre.
 *
 * Les arbres poses sont des decors ordinaires (ObstacleDef `kind: 'tree'`,
 * traversables, voir isBlockingMapObstacle) : rien ne change pour la
 * simulation. PROVISOIRE : types, densites et tailles proposes, a ajuster a
 * l'usage.
 */

/** Diametres (cases) proposes. */
export const FOREST_BRUSH_SIZES = [1, 3, 5, 7] as const;
export type ForestBrushSize = (typeof FOREST_BRUSH_SIZES)[number];

/** Densites proposees : part moyenne des cases qui recoivent un arbre. */
export const FOREST_DENSITIES = [
  { id: 'clairsemee', label: 'Clairsemée', fill: 0.22 },
  { id: 'moyenne', label: 'Moyenne', fill: 0.4 },
  { id: 'dense', label: 'Dense', fill: 0.62 },
] as const;
export type ForestDensity = (typeof FOREST_DENSITIES)[number]['id'];

/** Types d'arbres : chacun tire ses modeles (Kenney, render/assetLibrary.ts,
 *  TREE_MODELS + EXTRA_TREE_MODELS) dans sa liste, case par case. */
export const FOREST_TREE_TYPES = [
  {
    id: 'mixte',
    label: 'Mixte',
    models: ['tree_default', 'tree_oak', 'tree_detailed', 'tree_fat', 'tree_pineDefaultA', 'tree_pineRoundA', 'tree_pineTallA', 'tree_cone'],
  },
  { id: 'feuillus', label: 'Feuillus', models: ['tree_default', 'tree_oak', 'tree_detailed', 'tree_fat', 'tree_simple'] },
  { id: 'pins', label: 'Pins', models: ['tree_pineDefaultA', 'tree_pineDefaultB', 'tree_pineRoundA', 'tree_pineRoundC', 'tree_pineTallA', 'tree_pineTallB'] },
  { id: 'coniques', label: 'Coniques', models: ['tree_cone', 'tree_tall', 'tree_thin'] },
  { id: 'palmiers', label: 'Palmiers', models: ['tree_palm', 'tree_palmBend', 'tree_palmTall', 'tree_palmShort'] },
] as const;
export type ForestTreeTypeId = (typeof FOREST_TREE_TYPES)[number]['id'];

/** Cote (cases) d'un bloc du bruit de densite : taille typique d'un bosquet. */
const FOREST_CLUSTER_CELLS = 4;

/** Arbre calcule pour une case. */
export interface ForestTree {
  x: number;
  z: number;
  treeModel: string;
  rotationY: number;
  scale: number;
}

/** Cases (coins nord-ouest) du disque de diametre `size` centre sur la case
 *  sous (x, z). Ordre deterministe : z puis x croissants. */
export function forestBrushCells(size: ForestBrushSize, x: number, z: number): { x: number; z: number }[] {
  const cx = Math.floor(x);
  const cz = Math.floor(z);
  const r = (size - 1) / 2;
  const cells: { x: number; z: number }[] = [];
  for (let dz = -r; dz <= r; dz++) {
    for (let dx = -r; dx <= r; dx++) if (dx * dx + dz * dz <= (r + 0.5) ** 2) cells.push({ x: cx + dx, z: cz + dz });
  }
  return cells;
}

/** Arbres de la case (cellX, cellZ) pour ce type et cette densite : 0, 1 ou
 *  2. Ne depend que de ses arguments. */
export function forestTreesForCell(cellX: number, cellZ: number, typeId: ForestTreeTypeId, density: ForestDensity): ForestTree[] {
  const type = FOREST_TREE_TYPES.find((t) => t.id === typeId) ?? FOREST_TREE_TYPES[0];
  const fill = (FOREST_DENSITIES.find((d) => d.id === density) ?? FOREST_DENSITIES[1]).fill;
  const cluster = clusterNoise(cellX, cellZ);
  const p = Math.min(0.95, fill * (0.3 + 1.4 * cluster));
  const rand = (salt: number) => hash01(cellX, cellZ, salt);
  if (rand(1) >= p) return [];
  const count = cluster > 0.5 && rand(2) < p * 0.45 ? 2 : 1;
  // Premier arbre : a 0,18-0,38 du centre, jamais au centre exact ; second
  // de l'autre cote (petit groupe dans la meme case). Toujours dans la case.
  const angle = rand(3) * Math.PI * 2;
  const trees: ForestTree[] = [];
  for (let k = 0; k < count; k++) {
    const a = k === 0 ? angle : angle + Math.PI + (rand(4) - 0.5);
    const d = 0.18 + rand(5 + k) * 0.2;
    trees.push({
      x: cellX + 0.5 + Math.cos(a) * d,
      z: cellZ + 0.5 + Math.sin(a) * d,
      treeModel: type.models[Math.floor(rand(10 + k) * type.models.length)]!,
      rotationY: rand(20 + k) * Math.PI * 2,
      scale: 0.9 + rand(30 + k) * 0.2,
    });
  }
  return trees;
}

/** Bruit de valeur de basse frequence dans [0, 1] : une valeur par sommet
 *  de blocs FOREST_CLUSTER_CELLS, interpolee (smoothstep). */
function clusterNoise(x: number, z: number): number {
  const u = (x + 0.5) / FOREST_CLUSTER_CELLS;
  const v = (z + 0.5) / FOREST_CLUSTER_CELLS;
  const i = Math.floor(u);
  const j = Math.floor(v);
  const s = smooth(u - i);
  const t = smooth(v - j);
  const at = (a: number, b: number) => hash01(a, b, 97);
  const top = at(i, j) + (at(i + 1, j) - at(i, j)) * s;
  const bottom = at(i, j + 1) + (at(i + 1, j + 1) - at(i, j + 1)) * s;
  return top + (bottom - top) * t;
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

/** Hachage entier (x, z, salt) -> [0, 1). */
function hash01(x: number, z: number, salt: number): number {
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(z | 0, 0x165667b1) ^ Math.imul(salt | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
