import * as THREE from 'three';
import { cellTriangles, TERRAIN_ELEVATION_STEP, type TerrainHeightField } from '../config/terrainElevation';
import type { TerrainMaterials } from './terrainCells';

/**
 * HABILLAGE DU RELIEF (`?relief=`, passe du 2026-10-31, en comparaison) :
 * falaises, bords d'ile, trous et collines du rendu `faceted-plus`
 * (render/terrainStylized.ts). Purement visuel : les DESSUS restent
 * exactement le sol logique (memes triangles, memes hauteurs : unites,
 * grille, pose et pointage inchanges) ; seuls changent l'ombrage des dessus
 * (couleur et normale par sommet) et les parois sous les cretes. Carte,
 * relief, collisions, trajets et simulation ne le voient jamais.
 *
 * - `baseline` (defaut) : le rendu actuel, rien n'est change.
 * - `roche` (variante sure) : parois en roche low-poly (facettes a plat,
 *   couleur par facette, palette des rochers KayKit), quelques lignes
 *   decalees en plus, une bande d'herbe qui deborde sur la crete, des bords
 *   d'ile plus profonds au pied irregulier ; ombre de contact au pied des
 *   falaises, creux un peu plus sombres et bosses un peu plus claires.
 * - `massif` (variante marquee) : `roche` plus massive (bords d'ile profonds
 *   qui se resserrent vers le bas, strates), collines a l'ombrage lisse
 *   (normales moyennees sur les surfaces continues : les anneaux de pente ne
 *   se lisent plus comme des marches), relief qui projette ses ombres.
 * - `hybrid` : `massif` (collines, ombrage, roche, falaises interieures,
 *   ombres) avec des bords libres (bord d'ile, trous) de la profondeur de
 *   `roche`, pied irregulier et base un peu resserree.
 * - `?reliefShadows=on|off` (debug) : force les ombres portees du relief de
 *   la variante, sans autre difference.
 *
 * Deterministe (hash de positions, jamais Math.random) ; chaque valeur se
 * calcule depuis la carte entiere : un morceau de l'editeur a les memes
 * sommets que le plateau d'un seul tenant.
 */
export type ReliefLook = 'baseline' | 'roche' | 'massif' | 'hybrid';
export const RELIEF_LOOKS: readonly ReliefLook[] = ['baseline', 'roche', 'massif', 'hybrid'];
let reliefLook: ReliefLook = 'baseline';
let reliefShadows: boolean | null = null;

/** Habillage applique aux plateaux construits ensuite (main.ts : `?relief=`). */
export function setReliefLook(next: ReliefLook): void {
  reliefLook = next;
}

/** Debug (main.ts : `?reliefShadows=on|off`) : force `castShadow` de la variante ; null = valeur de la variante. */
export function setReliefShadows(on: boolean | null): void {
  reliefShadows = on;
}

export function currentReliefLook(): ReliefLook {
  return reliefLook;
}

type Rgb = readonly [number, number, number];

/** Reglages d'une variante (longueurs en cases). */
export interface ReliefParams {
  /** Bords libres (bord d'ile, trou) : profondeur du pied sous y = 0, et sa variation par colonne. */
  edgeDepth: number;
  edgeDepthJitter: number;
  /** Lignes de roche sous la bande d'herbe (bords libres, jupes des ruptures). */
  edgeRows: number;
  skirtRows: number;
  /** Decalage des lignes de roche : bombement (profil) et ecart par sommet, vers le vide. */
  bulge: number;
  rowJitter: readonly [number, number];
  /** Strates : une ligne sur deux en retrait de cette fraction de l'ecart. */
  strata: number;
  /** Resserrement de la base des bords libres (vers l'interieur, au pied). */
  taper: number;
  /** Jupes : bombement max vers la case basse (reste pres de l'arete : on y marche). */
  skirtJitter: readonly [number, number];
  /** Crete : abaissement de la levre exterieure, hauteur et debord de la bande d'herbe. */
  crestDrop: number;
  turf: number;
  turfOut: number;
  /** Assombrissement de la bande d'herbe (face sous la crete). */
  turfShade: number;
  /** Ombre de contact au pied d'une falaise (0..1). */
  contact: number;
  /** Creux plus sombres, bosses plus claires (rayon ~2 cases), par niveau d'ecart. */
  relief: number;
  /** Normales des dessus : 0 = facettes, 1 = lissees sur les surfaces continues (jamais a travers une falaise). */
  smooth: number;
  /** Le relief projette ses ombres. */
  castShadow: boolean;
  /** Roche : couleurs lineaires (haut de paroi, corps, pied), variation par facette. */
  soil: Rgb;
  rockWarm: Rgb;
  rockCool: Rgb;
  facetJitter: number;
  footShade: number;
}

const ROCHE: ReliefParams = {
  edgeDepth: 0.85,
  edgeDepthJitter: 0.2,
  edgeRows: 3,
  skirtRows: 2,
  bulge: 0.05,
  rowJitter: [0.03, 0.12],
  strata: 0,
  taper: 0,
  skirtJitter: [0.01, 0.06],
  crestDrop: 0.04,
  turf: 0.07,
  turfOut: 0.015,
  turfShade: 0.62,
  contact: 0.22,
  relief: 0.08,
  smooth: 0.55,
  castShadow: false,
  soil: [0.42, 0.28, 0.16],
  rockWarm: [0.52, 0.46, 0.38],
  rockCool: [0.43, 0.43, 0.44],
  facetJitter: 0.12,
  footShade: 0.72,
};

const MASSIF: ReliefParams = {
  ...ROCHE,
  edgeDepth: 1.55,
  edgeDepthJitter: 0.4,
  edgeRows: 5,
  skirtRows: 3,
  bulge: 0.09,
  rowJitter: [0.04, 0.16],
  strata: 0.6,
  taper: 0.45,
  skirtJitter: [0.015, 0.08],
  crestDrop: 0.06,
  turf: 0.09,
  contact: 0.3,
  relief: 0.16,
  smooth: 0.75,
  castShadow: true,
};

export const RELIEF_PARAMS: Readonly<Record<Exclude<ReliefLook, 'baseline'>, ReliefParams>> = {
  roche: ROCHE,
  massif: MASSIF,
  // Bords libres a la profondeur de `roche` (lignes de meme hauteur que `massif`), base resserree en proportion.
  hybrid: {
    ...MASSIF,
    edgeDepth: 0.85,
    edgeDepthJitter: 0.25,
    edgeRows: 3,
    bulge: 0.07,
    taper: 0.25,
  },
};

/** Reglages de la variante courante ; null en `baseline` (rendu actuel, aucun calcul). */
export function reliefParams(): ReliefParams | null {
  if (reliefLook === 'baseline') return null;
  const P = RELIEF_PARAMS[reliefLook];
  return reliefShadows === null ? P : { ...P, castShadow: reliefShadows };
}

/** Hash deterministe dans [0, 1). */
export function reliefHash(a: number, b: number, c: number, d = 0): number {
  let h = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1) ^ Math.imul(c | 0, 0x1b873593) ^ Math.imul(d | 0, 0x85ebca77) ^ 0x6c1d3a5;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Couleur (lineaire, avant eclairage) d'une facette de paroi : `depth` sous la crete, `span` hauteur de la paroi,
 *  (x, y, z) centre de la facette. Haut de paroi en terre, corps en roche (chaude ou froide), pied plus sombre. */
export function rockFacetColor(P: ReliefParams, depth: number, span: number, x: number, y: number, z: number): [number, number, number] {
  const qx = Math.round(x * 8), qy = Math.round(y * 8), qz = Math.round(z * 8);
  const u = reliefHash(qx, qy, qz, 1), w = reliefHash(qx, qy, qz, 2);
  const rock = [0, 1, 2].map((i) => P.rockWarm[i]! + (P.rockCool[i]! - P.rockWarm[i]!) * w);
  const soilMix = Math.max(0, Math.min(1, 1 - depth / 0.22));
  const f = Math.max(0, Math.min(1, depth / Math.max(span, 0.3)));
  const k = (1 + P.facetJitter * (u * 2 - 1)) * (1 - (1 - P.footShade) * f);
  return [0, 1, 2].map((i) => (rock[i]! + (P.soil[i]! - rock[i]!) * soilMix) * k) as [number, number, number];
}

/** Materiau des parois de roche : facettes a plat, couleur par sommet, sans texture. */
export function rockMaterial(materials: TerrainMaterials): THREE.MeshLambertMaterial {
  return materials.get('rock', () => new THREE.MeshLambertMaterial({ vertexColors: true }));
}

/** Ombrage des dessus d'une variante : facteur de couleur (contact, creux et bosses, voile de pente lisse) et
 *  normale lissee, definis aux coins des cases puis interpoles dans le triangle de la case (meme interpolation que
 *  le GPU : dessus, levres et transitions ont exactement les memes valeurs). */
export interface ReliefShading {
  readonly smooth: number;
  /** Point (x, z) du dessus de la case (cx, cz), ramene dans la case (levres) : `normal` recoit la normale lissee. */
  at(cx: number, cz: number, x: number, z: number, normal: THREE.Vector3): { factor: number; veil: number };
}

interface CornerData { factor: number; veil: number; normal: THREE.Vector3 }

export function reliefShading(field: TerrainHeightField, has: (x: number, z: number) => boolean, slopeShade: number, slopeNormalY: number): ReliefShading | null {
  const P = reliefParams();
  if (!P) return null;
  const step = TERRAIN_ELEVATION_STEP;
  const AROUND = [[-1, -1, 3], [0, -1, 2], [-1, 0, 1], [0, 0, 0]] as const;
  // Hauteurs presentes au sommet (vx, vz) : une par case existante qui le touche.
  const heightsMemo = new Map<string, number[]>();
  const heightsAt = (vx: number, vz: number) => {
    const key = `${vx},${vz}`;
    let hs = heightsMemo.get(key);
    if (!hs) {
      hs = [];
      for (const [dx, dz, i] of AROUND) if (has(vx + dx, vz + dz)) hs.push(field.cornerHeights(vx + dx, vz + dz)[i]!);
      heightsMemo.set(key, hs);
    }
    return hs;
  };
  const facet = (cx: number, cz: number, tri: readonly number[]) => {
    const h = field.cornerHeights(cx, cz);
    const p = tri.map((i) => new THREE.Vector3(cx + (i % 2), h[i]!, cz + (i < 2 ? 0 : 1)));
    const n = new THREE.Vector3().subVectors(p[1]!, p[0]!).cross(new THREE.Vector3().subVectors(p[2]!, p[0]!)).normalize();
    return n.y < 0 ? n.negate() : n;
  };
  const corners = new Map<string, CornerData>();
  const corner = (vx: number, vz: number, y: number): CornerData => {
    const key = `${vx},${vz},${y}`;
    let c = corners.get(key);
    if (c) return c;
    // Normale lissee : facettes des cases qui touchent le sommet a CETTE hauteur (surface continue).
    const normal = new THREE.Vector3();
    for (const [dx, dz, i] of AROUND) {
      const cx = vx + dx, cz = vz + dz;
      if (!has(cx, cz) || Math.abs(field.cornerHeights(cx, cz)[i]! - y) > 1e-6) continue;
      for (const tri of cellTriangles(field.slopeAt(cx, cz))) if (tri.includes(i)) normal.add(facet(cx, cz, tri));
    }
    if (normal.lengthSq() < 1e-12) normal.set(0, 1, 0);
    normal.normalize();
    // Contact : falaise a ce sommet ou a un sommet voisin, plus haute que ce point.
    let contact = 0;
    for (const [ox, oz, w] of [[0, 0, 1], [1, 0, 0.45], [-1, 0, 0.45], [0, 1, 0.45], [0, -1, 0.45]] as const) {
      const hs = heightsAt(vx + ox, vz + oz);
      if (hs.length < 2 || Math.max(...hs) - Math.min(...hs) < step - 1e-6) continue;
      contact = Math.max(contact, w * Math.min(1, Math.max(0, (Math.max(...hs) - y) / (1.5 * step))));
    }
    // Creux et bosses : ecart a la hauteur moyenne alentour (sommets existants, poids gaussien, rayon 2).
    let sum = 0, wsum = 0;
    for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) {
      const hs = heightsAt(vx + a, vz + b);
      if (hs.length === 0) continue;
      const w = Math.exp(-(a * a + b * b) / 2.9);
      sum += w * Math.max(...hs); wsum += w;
    }
    const rel = wsum > 0 ? Math.max(-1.5, Math.min(1.5, (y - sum / wsum) / step)) : 0;
    const tilt = Math.min(1, Math.max(0, (1 - normal.y) / (1 - slopeNormalY)));
    c = { factor: (1 - P.contact * contact) * (1 + P.relief * rel), veil: 1 - slopeShade * tilt, normal };
    corners.set(key, c);
    return c;
  };
  const bary = [0, 0, 0];
  const result = { factor: 1, veil: 1 };
  return {
    smooth: P.smooth,
    at(cx, cz, x, z, normal) {
      const fx = Math.min(1, Math.max(0, x - cx)), fz = Math.min(1, Math.max(0, z - cz));
      const h = field.cornerHeights(cx, cz);
      // Triangle de la case qui contient le point, coordonnees barycentriques.
      let tri: readonly number[] = cellTriangles(field.slopeAt(cx, cz))[1]!;
      for (const t of cellTriangles(field.slopeAt(cx, cz))) {
        const [a, b, c] = t.map((i) => [i % 2, i < 2 ? 0 : 1] as const);
        const det = (b![1] - c![1]) * (a![0] - c![0]) + (c![0] - b![0]) * (a![1] - c![1]);
        const l0 = ((b![1] - c![1]) * (fx - c![0]) + (c![0] - b![0]) * (fz - c![1])) / det;
        const l1 = ((c![1] - a![1]) * (fx - c![0]) + (a![0] - c![0]) * (fz - c![1])) / det;
        const l2 = 1 - l0 - l1;
        if (l0 >= -1e-9 && l1 >= -1e-9 && l2 >= -1e-9) { tri = t; bary[0] = l0; bary[1] = l1; bary[2] = l2; break; }
      }
      normal.set(0, 0, 0);
      result.factor = 0; result.veil = 0;
      for (let k = 0; k < 3; k++) {
        const i = tri[k]!;
        const d = corner(cx + (i % 2), cz + (i < 2 ? 0 : 1), h[i]!);
        result.factor += bary[k]! * d.factor;
        result.veil += bary[k]! * d.veil;
        normal.addScaledVector(d.normal, bary[k]!);
      }
      normal.normalize();
      return result;
    },
  };
}
