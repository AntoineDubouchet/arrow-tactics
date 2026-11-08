import * as THREE from 'three';
import { obstacleBounds } from '../config/constants';
import type { OrientedBox } from '../core/orientedBox';
import type { Entity } from '../sim/entity';

/**
 * CLAIRIERE DES BATIMENTS DANS LES MIST CLOUDS (2026-11-08, suite du Graphic Lab « Mist Clouds »,
 * VALIDE ; docs/DESIGN_DECISIONS.md A6) : nos batiments construits repoussent VISUELLEMENT les nappes
 * aeriennes (render/mistClouds.ts) autour d'eux, jusqu'a un niveau sous celui d'une case visible. Effet esthetique seulement : la grille du brouillard de guerre,
 * la vision gameplay, l'exploration, la detection des ennemis et l'assombrissement ne lisent jamais
 * cette carte ; en zone inexploree le facteur est coupe par le shader (rien n'est devine).
 *
 * Une seule texture R8 en espace monde (RES texels par case, le meme rectangle que la grille du
 * brouillard), valeur 0..1 = force de la clairiere : 1 au contact d'un batiment (empreinte reelle +
 * CLEARANCE_INNER cases), fondu doux jusqu'a 0 a CLEARANCE_OUTER cases de l'empreinte. Distance a
 * l'empreinte REELLE (rectangle oriente, ou disque de collision pour un batiment sans empreinte,
 * la Baliste) : un grand batiment influence naturellement plus loin qu'une Maison, sans cercle
 * centre. Plusieurs batiments : UNION (maximum), jamais une somme : cinq Maisons voisines font une
 * zone continue, pas une zone cinq fois plus claire. Recalculee seulement quand la liste des
 * batiments eligibles change (main.ts, signature), lue par le shader des nappes en une texture de
 * plus par fragment (demi-resolution) : aucune boucle par batiment dans le shader, viable pour une
 * grande base.
 *
 * Sources ELIGIBLES (mistClearanceSource, propriete generique, aucune liste d'identifiants) : tout
 * BATIMENT gameplay vivant du joueur, CONSTRUIT (Entity.construction === null : un chantier et a
 * fortiori un fantome de placement ne comptent pas), qui n'est ni une piece de mur (segment ou porte
 * de palissade : les nappes doivent encore venir contre l'enceinte et derriere elle) ni un objet
 * neutre destructible (baril). Hotel de ville, Maisons, Auberge, batiments economiques et de
 * production, Baliste (batiment de l'architecture), et tout futur batiment du meme systeme.
 */
const RES = 2;
/** Pleine force jusqu'a `INNER` cases de l'empreinte, fondu nul a `OUTER` cases. PROVISOIRE. */
export const CLEARANCE_INNER = 1.75;
export const CLEARANCE_OUTER = 5.5;

/** Empreinte d'un batiment eligible : rectangle oriente (empreinte de collision) ou disque. */
export type ClearanceSource =
  | { kind: 'box'; box: OrientedBox }
  | { kind: 'disc'; x: number; z: number; radius: number };

type ClearanceEntity = Pick<Entity, 'isBuilding' | 'alive' | 'team' | 'construction' | 'wall' | 'destructible' | 'footprintObstacle' | 'x' | 'z'> & { stats: { radius: number } };

/** Vrai si l'entite repousse les nappes (batiment construit ordinaire du joueur : voir en-tete). */
export function isMistClearanceBuilding(e: ClearanceEntity): boolean {
  return e.isBuilding && e.alive && e.team === 'player' && e.construction === null && e.wall === null && e.destructible === null;
}

/** Source de clairiere d'une entite, ou null si elle n'en est pas une. */
export function mistClearanceSource(e: ClearanceEntity): ClearanceSource | null {
  if (!isMistClearanceBuilding(e)) return null;
  const o = e.footprintObstacle;
  if (o) {
    if (o.footprint) return { kind: 'box', box: o.footprint };
    const b = obstacleBounds(o);
    return { kind: 'box', box: { x: (b.minX + b.maxX) / 2, z: (b.minZ + b.maxZ) / 2, halfW: (b.maxX - b.minX) / 2, halfD: (b.maxZ - b.minZ) / 2, cos: 1, sin: 0 } };
  }
  return { kind: 'disc', x: e.x, z: e.z, radius: e.stats.radius };
}

/** Distance signee d'un point a une source (negative dedans ; coins arrondis dehors). */
export function clearanceDistance(s: ClearanceSource, x: number, z: number): number {
  if (s.kind === 'disc') return Math.hypot(x - s.x, z - s.z) - s.radius;
  const dx = x - s.box.x;
  const dz = z - s.box.z;
  const ax = Math.abs(dx * s.box.cos - dz * s.box.sin) - s.box.halfW;
  const az = Math.abs(dx * s.box.sin + dz * s.box.cos) - s.box.halfD;
  return ax > 0 || az > 0 ? Math.hypot(Math.max(ax, 0), Math.max(az, 0)) : Math.max(ax, az);
}

/** Force de la clairiere (0..1) a une distance signee de l'empreinte. */
export function clearanceStrength(distance: number): number {
  return 1 - THREE.MathUtils.smoothstep(distance, CLEARANCE_INNER, CLEARANCE_OUTER);
}

export class MistClearanceMap {
  /** Texture R8 (0..255), lue par le shader des nappes (render/mistClouds.ts). */
  readonly texture: THREE.DataTexture;
  /** minX, minZ, largeur, hauteur (monde, cases) : le rectangle de la grille du brouillard. */
  readonly rect = new THREE.Vector4();
  /** Valeurs (0..255), RES texels par case, ligne par ligne en z ; lecture seule (tests). */
  readonly data: Uint8Array;
  readonly cols: number;
  readonly rows: number;
  private readonly minX: number;
  private readonly minZ: number;
  /** Nombre de sources au dernier refresh (controles). */
  sourceCount = 0;

  constructor(minX: number, minZ: number, width: number, height: number) {
    this.minX = minX;
    this.minZ = minZ;
    this.cols = width * RES;
    this.rows = height * RES;
    this.rect.set(minX, minZ, width, height);
    this.data = new Uint8Array(this.cols * this.rows);
    this.texture = new THREE.DataTexture(this.data, this.cols, this.rows, THREE.RedFormat, THREE.UnsignedByteType);
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.needsUpdate = true;
  }

  /** Force de la clairiere (0..1) a un point monde (texel le plus proche ; controles et tests). */
  strengthAt(x: number, z: number): number {
    const c = Math.floor((x - this.minX) * RES);
    const r = Math.floor((z - this.minZ) * RES);
    if (c < 0 || r < 0 || c >= this.cols || r >= this.rows) return 0;
    return this.data[r * this.cols + c]! / 255;
  }

  /** Recalcule toute la carte (union des sources). A appeler seulement quand la liste change. */
  refresh(sources: readonly ClearanceSource[]): void {
    this.data.fill(0);
    this.sourceCount = sources.length;
    for (const s of sources) {
      let minX: number, maxX: number, minZ: number, maxZ: number;
      if (s.kind === 'disc') {
        const reach = s.radius + CLEARANCE_OUTER;
        minX = s.x - reach; maxX = s.x + reach; minZ = s.z - reach; maxZ = s.z + reach;
      } else {
        const reach = Math.hypot(s.box.halfW, s.box.halfD) + CLEARANCE_OUTER;
        minX = s.box.x - reach; maxX = s.box.x + reach; minZ = s.box.z - reach; maxZ = s.box.z + reach;
      }
      const c0 = Math.max(0, Math.floor((minX - this.minX) * RES));
      const c1 = Math.min(this.cols - 1, Math.ceil((maxX - this.minX) * RES));
      const r0 = Math.max(0, Math.floor((minZ - this.minZ) * RES));
      const r1 = Math.min(this.rows - 1, Math.ceil((maxZ - this.minZ) * RES));
      for (let r = r0; r <= r1; r++) {
        const z = this.minZ + (r + 0.5) / RES;
        for (let c = c0; c <= c1; c++) {
          const x = this.minX + (c + 0.5) / RES;
          const a = clearanceStrength(clearanceDistance(s, x, z));
          if (a <= 0) continue;
          const i = r * this.cols + c;
          const v = Math.round(a * 255);
          if (v > this.data[i]!) this.data[i] = v;
        }
      }
    }
    this.texture.needsUpdate = true;
  }

  dispose(): void {
    this.texture.dispose();
  }
}
