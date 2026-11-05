import { obstacleBounds, obstacleCenter, type ObstacleBounds, type ObstacleDef } from './constants';

/**
 * Sources de ressources (2026-11-01, direction Hero RTS) : les DECORS de la
 * carte exploitables. Un arbre donne du bois, un rocher (gros gisement) de la
 * pierre, un rocher marque `ore: 'gold'` de l'or. Quantite finie pour toutes
 * (HARVEST_NODE_KINDS, data/resources.ts, decomptee par la simulation).
 *
 * BLOQUANTES (2026-11-02) : les cases d'un arbre ET d'un gros gisement
 * (pierre, or) bloquent les unites terrestres et la construction
 * (resourceNodeCells). Epuisee, la source libere ses cases (gravats ou
 * souche non bloquants). PROVISOIRE.
 */
export type ResourceKind = 'wood' | 'stone';
export const RESOURCE_KINDS: readonly ResourceKind[] = ['wood', 'stone'];
export const RESOURCE_LABELS: Readonly<Record<ResourceKind, string>> = { wood: 'Bois', stone: 'Pierre' };

/** Ressource d'une source du monde (meme liste que data/resources.ts,
 *  HarvestResource) : l'or y est une monnaie, pas une ressource portee. */
export type NodeResource = 'wood' | 'stone' | 'gold';

/** Source exploitable : `id` = indice du decor dans la liste des obstacles de
 *  la carte (stable pour une carte donnee), centre et ressource. `block` :
 *  rectangle des cases bloquees (la recolte se mesure jusqu'a lui, l'unite
 *  ne pouvant plus y entrer). */
export interface ResourceNode {
  id: number;
  x: number;
  z: number;
  resource: NodeResource;
  block?: ObstacleBounds;
}

/** Petit tas au sol (MapDef.resourcePiles) : planches ou cailloux, quantite
 *  finie, ramasse a la main par le Heros (sans outil). */
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
 *  pierre (rocher), or (rocher `ore: 'gold'`), sinon null. */
export function resourceOfObstacle(o: ObstacleDef): NodeResource | null {
  if (o.kind === 'tree' || (o.kind === 'prop' && isTreePropModel(o.propModel)) || (o.kind === 'building' && isTreeBuildingModel(o.buildingModel))) return 'wood';
  if (o.kind === 'rock') return o.ore === 'gold' ? 'gold' : 'stone';
  return null;
}

/** Source de ressource debout (arbre, gros gisement) : ses cases bloquent
 *  les unites terrestres et la construction (2026-11-02). */
export function isBlockingResourceNode(o: ObstacleDef): boolean {
  return resourceOfObstacle(o) !== null;
}

/** Cases bloquees par une source : celles dont le centre est dans l'emprise
 *  du decor (tilesX x tilesZ cases autour de son centre ; un arbre 1 x 1 : la
 *  case qui contient son centre ; un bosquet ou un gisement 2 x 2 : ses
 *  quatre cases). REGLE UNIQUE : simulation (World.setMap), recolte,
 *  construction, generateur de carte. */
export function resourceNodeCells(o: ObstacleDef): { x: number; z: number }[] {
  const b = obstacleBounds(o);
  const cells: { x: number; z: number }[] = [];
  for (let z = Math.ceil(b.minZ - 0.5); z < Math.ceil(b.maxZ - 0.5); z++) {
    for (let x = Math.ceil(b.minX - 0.5); x < Math.ceil(b.maxX - 0.5); x++) cells.push({ x, z });
  }
  return cells;
}

/** Cases bloquees par les sources d'une liste de decors (cles `x,z`, format
 *  de cellKey), en cache par tableau. REGLE UNIQUE : deplacement
 *  (World.setMap) et construction (main.ts, buildingPlacementWorld). Une
 *  source epuisee : la retirer de la liste. */
const resourceCellsCache = new WeakMap<readonly ObstacleDef[], ReadonlySet<string>>();

export function resourceNodeCellKeys(obstacles: readonly ObstacleDef[]): ReadonlySet<string> {
  let cells = resourceCellsCache.get(obstacles);
  if (!cells) {
    const keys = new Set<string>();
    for (const o of obstacles) {
      if (!isBlockingResourceNode(o)) continue;
      for (const c of resourceNodeCells(o)) keys.add(`${c.x},${c.z}`);
    }
    cells = keys;
    resourceCellsCache.set(obstacles, cells);
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
    const cells = resourceNodeCells(o);
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
