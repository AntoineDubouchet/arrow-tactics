import * as THREE from 'three';
import type { GroundTextureId } from '../config/groundSurfaces';
import { cellKey, type TerrainCellDef } from '../config/mapDef';
import type { TerrainHeightField } from '../config/terrainElevation';
import { groundRepaintReach } from './groundLook';
import { surfaceBlendReach } from './surfaceBlend';
import { buildTerrainChunk, TerrainMaterials, terrainContext, type TerrainContext } from './terrainCells';

/** Cote d'un morceau (cases). Mesure (2026-10-29, Edge, 64x64 tres peinte,
 *  mise a jour seule, mediane) : 16 -> 3,5 ms (pinceau 1x1), 7 ms (4x4),
 *  84 meshes ; 8 -> deux fois plus rapide mais 282 meshes ; 32 -> 13 ms. */
export const TERRAIN_CHUNK_SIZE = 16;

/** Rayon (cases) du relief lu par le rendu d'une case : ombrage du relief (fenetre de 2 sommets, contact a 1,
 *  render/reliefLook.ts), parois et levres (voisines), transitions (3 × 3). 3 suffit ; 4 par prudence. */
const RELIEF_REACH = 4;

/** Meme relief pour la case (x, z) : hauteurs de ses coins et forme (diagonale des triangles). */
function sameRelief(a: TerrainHeightField, b: TerrainHeightField, x: number, z: number): boolean {
  if (a === b) return true;
  const ha = a.cornerHeights(x, z), hb = b.cornerHeights(x, z);
  return ha[0] === hb[0] && ha[1] === hb[1] && ha[2] === hb[2] && ha[3] === hb[3] && a.slopeAt(x, z) === b.slopeAt(x, z);
}

/**
 * Sol de l'EDITEUR decoupe en morceaux carres (organisation du rendu
 * seulement : aucune incidence sur la carte, le relief ou le jeu). Chaque
 * morceau est construit par buildTerrainChunk avec le contexte de la carte
 * entiere : memes sommets que le plateau d'un seul tenant (jeu, board.ts),
 * aucune couture. Un coup de pinceau Surface ne reconstruit que les morceaux
 * qui contiennent une case repeinte ou une voisine (rayon 1 : ce que lit une
 * transition, 2 en `?surfaceBlend=lisiere`, `melange` et `organic`, voir
 * surfaceBlendReach ; 2 en `?groundLook=living`, voir
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
  /** Cases du dernier rebuild complet (position et type de terrain). */
  private cellSignature = new Set<string>();

  constructor(private readonly size = TERRAIN_CHUNK_SIZE) {}

  /** Reconstruit tout (nouvelle forme), ou, si seuls des reliefs de cases ont change (memes cases, memes surfaces),
   *  les morceaux proches de ces cases (RELIEF_REACH) : le rendu d'une case ne lit pas le relief plus loin. */
  rebuild(cells: readonly TerrainCellDef[], field: TerrainHeightField, painted: ReadonlyMap<string, GroundTextureId>): void {
    const prev = this.ctx;
    if (prev && this.sameCells(cells) && this.samePainted(painted)) {
      this.ctx = terrainContext(cells, field, this.painted, this.materials, true);
      const dirty = new Set<string>();
      const reach = RELIEF_REACH;
      for (const c of cells) {
        if (sameRelief(prev.field, field, c.x, c.z)) continue;
        for (let dz = -reach; dz <= reach; dz++) for (let dx = -reach; dx <= reach; dx++) dirty.add(this.chunkOf(c.x + dx, c.z + dz));
      }
      for (const key of dirty) {
        if (!this.cellsByChunk.has(key)) continue;
        this.dropChunk(key);
        this.buildChunk(key);
      }
      return;
    }
    for (const key of [...this.chunks.keys()]) this.dropChunk(key);
    this.painted.clear();
    for (const [key, surface] of painted) this.painted.set(key, surface);
    this.ctx = terrainContext(cells, field, this.painted, this.materials, true);
    this.cellSignature = new Set(cells.map((c) => `${c.x},${c.z},${c.terrain}`));
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
    // Voisines lues par le rendu d'une case : transitions (render/surfaceBlend.ts),
    // etats de l'herbe et usure en `?groundLook=living` (render/groundLook.ts).
    const reach = Math.max(groundRepaintReach(), surfaceBlendReach());
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

  /** Memes cases (position et type de terrain) que le dernier rebuild complet. */
  private sameCells(cells: readonly TerrainCellDef[]): boolean {
    return cells.length === this.cellSignature.size && cells.every((c) => this.cellSignature.has(`${c.x},${c.z},${c.terrain}`));
  }

  private samePainted(painted: ReadonlyMap<string, GroundTextureId>): boolean {
    if (painted.size !== this.painted.size) return false;
    for (const [key, surface] of painted) if (this.painted.get(key) !== surface) return false;
    return true;
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
