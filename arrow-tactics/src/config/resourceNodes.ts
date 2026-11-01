import { obstacleCenter, type ObstacleDef } from './constants';

/**
 * Sources de ressources (2026-11-01, direction Hero RTS) : les DECORS de la
 * carte que le Heros peut exploiter. Aucune donnee nouvelle dans les cartes :
 * un arbre donne du bois, un rocher de la pierre. Les decors restent
 * traversables et purement visuels pour tout le reste (isBlockingMapObstacle).
 * Sources inepuisables dans cette passe (PROVISOIRE).
 */
export type ResourceKind = 'wood' | 'stone';
export const RESOURCE_KINDS: readonly ResourceKind[] = ['wood', 'stone'];
export const RESOURCE_LABELS: Readonly<Record<ResourceKind, string>> = { wood: 'Bois', stone: 'Pierre' };

/** Source exploitable : `id` = indice du decor dans la liste des obstacles de
 *  la carte (stable pour une carte donnee), centre et ressource. */
export interface ResourceNode {
  id: number;
  x: number;
  z: number;
  resource: ResourceKind;
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

/** Sources de ressources d'une liste de decors (MapDef.obstacles), dans
 *  l'ordre de la liste. */
export function resourceNodesOf(obstacles: readonly ObstacleDef[]): ResourceNode[] {
  const nodes: ResourceNode[] = [];
  obstacles.forEach((o, id) => {
    const resource = resourceOfObstacle(o);
    if (!resource) return;
    const c = obstacleCenter(o);
    nodes.push({ id, x: c.x, z: c.z, resource });
  });
  return nodes;
}
