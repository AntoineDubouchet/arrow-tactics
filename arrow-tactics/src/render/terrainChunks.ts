import * as THREE from 'three';
import type { GroundTextureId } from '../config/groundSurfaces';
import { cellKey, type TerrainCellDef } from '../config/mapDef';
import type { TerrainHeightField } from '../config/terrainElevation';
import { groundRepaintReach } from './groundLook';
import { buildTerrainChunk, TerrainMaterials, terrainContext, type TerrainContext } from './terrainCells';

/** Cote d'un morceau (cases). Mesure (2026-10-29, Edge, 64x64 tres peinte,
 *  mise a jour seule, mediane) : 16 -> 3,5 ms (pinceau 1x1), 7 ms (4x4),
 *  84 meshes ; 8 -> deux fois plus rapide mais 282 meshes ; 32 -> 13 ms. */
export const TERRAIN_CHUNK_SIZE = 16;

/**
 * Sol de l'EDITEUR decoupe en morceaux carres (organisation du rendu
 * seulement : aucune incidence sur la carte, le relief ou le jeu). Chaque
 * morceau est construit par buildTerrainChunk avec le contexte de la carte
 * entiere : memes sommets que le plateau d'un seul tenant (jeu, board.ts),
 * aucune couture. Un coup de pinceau Surface ne reconstruit que les morceaux
 * qui contiennent une case repeinte ou une voisine (rayon 1 : ce que lit une
 * transition, render/surfaceBlend.ts ; 2 en `?groundLook=living`, voir
 * groundRepaintReach). Toute autre modification (forme,
 * relief) passe par rebuild. Materiaux partages par tous les morceaux.
 */
export class ChunkedTerrainView {
  readonly group = new THREE.Group();
  private readonly materials = new TerrainMaterials();
  private readonly chunks = new Map<string, THREE.Group>();
  private cellsByChunk = new Map<string, TerrainCellDef[]>();
  /** Surfaces du dernier rendu (copie : la carte de l'editeur est modifiee en place). */
  private readonly painted = new Map<string, GroundTextureId>();
  private ctx: TerrainContext | null = null;

  constructor(private readonly size = TERRAIN_CHUNK_SIZE) {}

  /** Reconstruit tout (nouvelle forme ou nouveau relief). */
  rebuild(cells: readonly TerrainCellDef[], field: TerrainHeightField, painted: ReadonlyMap<string, GroundTextureId>): void {
    for (const key of [...this.chunks.keys()]) this.dropChunk(key);
    this.painted.clear();
    for (const [key, surface] of painted) this.painted.set(key, surface);
    this.ctx = terrainContext(cells, field, this.painted, this.materials);
    this.cellsByChunk = new Map();
    for (const c of cells) {
      const key = this.chunkOf(c.x, c.z);
      let list = this.cellsByChunk.get(key);
      if (!list) this.cellsByChunk.set(key, (list = []));
      list.push(c);
    }
    for (const key of this.cellsByChunk.keys()) this.buildChunk(key);
  }

  /** Apres un changement de surfaces SEULEMENT (forme et relief inchanges
   *  depuis rebuild) : reconstruit les morceaux touches. Renvoie leur nombre. */
  updateSurfaces(painted: ReadonlyMap<string, GroundTextureId>): number {
    const changed: string[] = [];
    for (const [key, surface] of painted) if (this.painted.get(key) !== surface) changed.push(key);
    for (const key of this.painted.keys()) if (!painted.has(key)) changed.push(key);
    if (changed.length === 0) return 0;
    // Voisines lues par le rendu d'une case : 1 (transitions), plus en
    // `?groundLook=living` (etats de l'herbe, usure, render/groundLook.ts).
    const reach = groundRepaintReach();
    const dirty = new Set<string>();
    for (const key of changed) {
      const surface = painted.get(key);
      if (surface) this.painted.set(key, surface);
      else this.painted.delete(key);
      const [x, z] = key.split(',').map(Number) as [number, number];
      for (let dz = -reach; dz <= reach; dz++) for (let dx = -reach; dx <= reach; dx++) dirty.add(this.chunkOf(x + dx, z + dz));
    }
    let rebuilt = 0;
    for (const key of dirty) {
      if (!this.cellsByChunk.has(key)) continue;
      this.dropChunk(key);
      this.buildChunk(key);
      rebuilt++;
    }
    return rebuilt;
  }

  dispose(): void {
    for (const key of [...this.chunks.keys()]) this.dropChunk(key);
    this.materials.dispose();
  }

  private chunkOf(x: number, z: number): string {
    return cellKey(Math.floor(x / this.size), Math.floor(z / this.size));
  }

  private buildChunk(key: string): void {
    const chunk = buildTerrainChunk(this.cellsByChunk.get(key)!, this.ctx!);
    chunk.userData['terrainChunk'] = key;
    this.chunks.set(key, chunk);
    this.group.add(chunk);
  }

  /** Libere les geometries d'un morceau (jamais les materiaux, partages). */
  private dropChunk(key: string): void {
    const chunk = this.chunks.get(key);
    if (!chunk) return;
    this.group.remove(chunk);
    chunk.traverse((object) => (object as THREE.Mesh).geometry?.dispose());
    this.chunks.delete(key);
  }
}
