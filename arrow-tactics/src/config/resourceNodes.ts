import { obstacleBounds, obstacleCenter, type ObstacleBounds, type ObstacleDef } from './constants';

/**
 * Sources de ressources (2026-11-01, direction Hero RTS) : les DECORS de la
 * carte que le Heros peut exploiter. Aucune donnee nouvelle dans les cartes :
 * un arbre donne du bois, un rocher de la pierre. Les decors restent
 * purement visuels pour tout le reste (isBlockingMapObstacle), SAUF les
 * arbres, dont les cases bloquent le deplacement depuis le 2026-11-02
 * (treeFootprintCells). Arbres : quantite finie (TREE_WOOD_AMOUNT,
 * data/resources.ts, decomptee par la simulation) ; rochers inepuisables
 * (PROVISOIRE).
 */
export type ResourceKind = 'wood' | 'stone';
export const RESOURCE_KINDS: readonly ResourceKind[] = ['wood', 'stone'];
export const RESOURCE_LABELS: Readonly<Record<ResourceKind, string>> = { wood: 'Bois', stone: 'Pierre' };

/** Source exploitable : `id` = indice du decor dans la liste des obstacles de
 *  la carte (stable pour une carte donnee), centre et ressource. `block` :
 *  rectangle des cases bloquees par un arbre (la recolte se mesure jusqu'a
 *  lui, le Heros ne pouvant plus y entrer), absent pour un rocher. */
export interface ResourceNode {
  id: number;
  x: number;
  z: number;
  resource: ResourceKind;
  block?: ObstacleBounds;
}

/** Petit tas au sol (MapDef.resourcePiles) : planches ou cailloux, quantite
 *  finie, ramasse a la main par le Heros (sans Scierie ni Camp de mineur). */
export interface ResourcePileDef {
  x: number;
  z: number;
  resource: ResourceKind;
  amount: number;
}

/** Props KayKit qui sont des arbres debout (pas les souches). */
export function isTreePropModel(model: string | undefined): boolean {
  return model === 'kaykit_tree_single_A' || model === 'kaykit_tree_single_B';
}

/** Batiments-decors qui sont des bosquets d'arbres. */
export function isTreeBuildingModel(model: string | undefined): boolean {
  return model !== undefined && model.startsWith('neutral_trees_');
}

/** Ressource d'un decor : bois (arbre Kenney, arbre isole KayKit, bosquet),
 *  pierre (rocher), sinon null. */
export function resourceOfObstacle(o: ObstacleDef): ResourceKind | null {
  if (o.kind === 'tree' || (o.kind === 'prop' && isTreePropModel(o.propModel)) || (o.kind === 'building' && isTreeBuildingModel(o.buildingModel))) return 'wood';
  if (o.kind === 'rock') return 'stone';
  return null;
}

/** Arbre debout (arbre, arbre isole, bosquet) : ses cases bloquent les
 *  unites terrestres (2026-11-02, demande d'Antoine). */
export function isBlockingTree(o: ObstacleDef): boolean {
  return resourceOfObstacle(o) === 'wood';
}

/** Cases bloquees par un arbre : celles dont le centre est dans l'emprise
 *  du decor (tilesX x tilesZ cases autour de son centre ; un arbre 1 x 1 : la
 *  case qui contient son centre ; un bosquet 2 x 2 : ses quatre cases).
 *  REGLE UNIQUE : simulation (World.setMap), recolte, generateur de carte. */
export function treeFootprintCells(o: ObstacleDef): { x: number; z: number }[] {
  const b = obstacleBounds(o);
  const cells: { x: number; z: number }[] = [];
  for (let z = Math.ceil(b.minZ - 0.5); z < Math.ceil(b.maxZ - 0.5); z++) {
    for (let x = Math.ceil(b.minX - 0.5); x < Math.ceil(b.maxX - 0.5); x++) cells.push({ x, z });
  }
  return cells;
}

/** Cases bloquees par les arbres d'une liste de decors (cles `x,z`, format
 *  de cellKey), en cache par tableau. REGLE UNIQUE des cases d'arbre
 *  (2026-11-02) : deplacement (World.setMap) et construction (main.ts,
 *  isValidPlacementTile : ni batiment, ni chantier, ni muraille, ni Baliste,
 *  ni unite posee). Couper un arbre, plus tard : le retirer de la liste. */
const treeCellsCache = new WeakMap<readonly ObstacleDef[], ReadonlySet<string>>();

export function treeCellKeys(obstacles: readonly ObstacleDef[]): ReadonlySet<string> {
  let cells = treeCellsCache.get(obstacles);
  if (!cells) {
    const keys = new Set<string>();
    for (const o of obstacles) {
      if (!isBlockingTree(o)) continue;
      for (const c of treeFootprintCells(o)) keys.add(`${c.x},${c.z}`);
    }
    cells = keys;
    treeCellsCache.set(obstacles, cells);
  }
  return cells;
}

/** Sources de ressources d'une liste de decors (MapDef.obstacles), dans
 *  l'ordre de la liste. */
export function resourceNodesOf(obstacles: readonly ObstacleDef[]): ResourceNode[] {
  const nodes: ResourceNode[] = [];
  obstacles.forEach((o, id) => {
    const resource = resourceOfObstacle(o);
    if (!resource) return;
    const c = obstacleCenter(o);
    const node: ResourceNode = { id, x: c.x, z: c.z, resource };
    const cells = resource === 'wood' ? treeFootprintCells(o) : [];
    if (cells.length > 0) {
      node.block = {
        minX: Math.min(...cells.map((p) => p.x)),
        maxX: Math.max(...cells.map((p) => p.x)) + 1,
        minZ: Math.min(...cells.map((p) => p.z)),
        maxZ: Math.max(...cells.map((p) => p.z)) + 1,
      };
    }
    nodes.push(node);
  });
  return nodes;
}
