import { SLOPE_DIRECTION_VECTORS, surfaceHeightInCell, type CellCornerHeights, type SlopeDirection, type TerrainHeightField } from '../config/terrainElevation';

/**
 * Forme VISUELLE des collines (`?hills=`, 2026-11-01, EXPERIMENTAL) :
 * `grid` par defaut (pentes planes, rendu actuel) ; `organic` arrondit les
 * pentes sans toucher a la grille.
 *
 * - Pente droite : profil en S (smoothstep) entre le pied et le sommet au
 *   lieu d'une rampe plane : epaule arrondie, pied adouci.
 * - Coin saillant (un seul coin haut) / rentrant (un seul coin bas) : hauteur
 *   RADIALE autour de ce coin, meme profil : le coin de la colline devient un
 *   quart de cone arrondi au lieu de deux facettes.
 * - Raccords : sur chaque arete d'une pente, le profil arrondi n'est garde
 *   que si la case voisine est aussi une pente au meme profil d'arete
 *   (edgeMatches) — les deux cases y donnent alors exactement la meme
 *   hauteur. Partout ailleurs (falaise, flanc de rampe, bord de carte, trou),
 *   l'arete garde son profil lineaire : bandes, jupes et falaises s'y
 *   raccordent comme aujourd'hui. Entre deux aretes de modes differents, le
 *   melange est progressif dans la case.
 *
 * Rendu seulement : coins des cases, niveaux, falaises, trajets, simulation
 * et editeur logique sont inchanges (TerrainHeightField.heightAt reste la
 * surface logique lineaire). Le dessus d'une pente est une sous-grille
 * `subdivisions` x `subdivisions` (celle des transitions de surface,
 * render/surfaceBlend.ts : memes sommets, memes triangles), et surfaceY lit
 * cette meme sous-grille : unites et decors posent exactement sur le sol
 * affiche. Deterministe, sans hasard.
 */
export type HillShape = 'grid' | 'organic';
export const HILL_SHAPES: readonly HillShape[] = ['grid', 'organic'];

let shape: HillShape = 'grid';
let subdivisions = 6;

/** Forme appliquee aux plateaux construits ensuite (main.ts : `?hills=`) ;
 *  `gridSubdivisions` : sous-grille des transitions de surface. */
export function setHillShape(next: HillShape, gridSubdivisions: number): void {
  shape = next;
  subdivisions = Math.max(1, Math.round(gridSubdivisions));
}

export function hillsAreOrganic(): boolean {
  return shape === 'organic';
}

/** Cote de la sous-grille du dessus d'une pente en `organic`. */
export function hillSubdivisions(): number {
  return subdivisions;
}

const smooth = (t: number) => t * t * (3 - 2 * t);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Arete `dir` de la case arrondie : la voisine est une pente au meme
 *  profil d'arete (voir le commentaire du module). */
function edgeIsOrganic(field: TerrainHeightField, cx: number, cz: number, dir: SlopeDirection): number {
  const v = SLOPE_DIRECTION_VECTORS[dir];
  return field.slopeAt(cx + v.dx, cz + v.dz) !== null && field.edgeMatches(cx, cz, dir) ? 1 : 0;
}

/** Hauteur affichee au point (fx, fz) ∈ [0, 1]² de la case (cx, cz) : la
 *  surface logique (surfaceHeightInCell) en `grid` ou sur une case plate,
 *  la pente arrondie en `organic`. Sommets de la sous-grille du dessus. */
export function hillHeightInCell(field: TerrainHeightField, cx: number, cz: number, fx: number, fz: number): number {
  const slope = field.slopeAt(cx, cz);
  const h = field.cornerHeights(cx, cz);
  const linear = surfaceHeightInCell(h, slope, fx, fz);
  if (shape !== 'organic' || !slope) return linear;
  const lo = Math.min(...h);
  const hi = Math.max(...h);
  const span = hi - lo;
  const highCount = h.filter((y) => y > lo + 1e-6).length;
  let organic: number;
  let w: number;
  if (highCount === 2) {
    // Pente droite : variation le long de z (N, S) ou de x (E, W).
    const alongZ = h[0] === h[1];
    const s = alongZ ? (h[2] > h[0] ? fz : 1 - fz) : h[1] > h[0] ? fx : 1 - fx;
    organic = lo + span * smooth(s);
    w = alongZ ? lerp(edgeIsOrganic(field, cx, cz, 'W'), edgeIsOrganic(field, cx, cz, 'E'), smooth(fx)) : lerp(edgeIsOrganic(field, cx, cz, 'N'), edgeIsOrganic(field, cx, cz, 'S'), smooth(fz));
  } else {
    // Coin : saillant (seul coin haut) ou rentrant (seul coin bas), profil
    // radial autour de ce coin.
    const convex = highCount === 1;
    const k = h.findIndex((y) => (convex ? y > lo + 1e-6 : y < hi - 1e-6));
    const kx = k % 2;
    const kz = k < 2 ? 0 : 1;
    const a = Math.abs(fx - kx);
    const b = Math.abs(fz - kz);
    const r = Math.min(1, Math.hypot(a, b));
    organic = convex ? lo + span * smooth(1 - r) : hi - span * smooth(1 - r);
    // Aretes non constantes : celle le long de x par le coin (b = 0) et celle
    // le long de z (a = 0) ; melange selon l'angle autour du coin.
    const mx = edgeIsOrganic(field, cx, cz, kz === 0 ? 'N' : 'S');
    const mz = edgeIsOrganic(field, cx, cz, kx === 0 ? 'W' : 'E');
    w = a + b < 1e-9 ? 1 : lerp(mx, mz, smooth(Math.atan2(b, a) / (Math.PI / 2)));
  }
  return linear + w * (organic - linear);
}

/** Hauteur affichee au point monde (x, z) : la surface logique en `grid` et
 *  sur une case plate ; en `organic`, sur une pente, l'interpolation dans la
 *  sous-grille (meme diagonale que la case) : exactement le sol affiche. */
export function hillHeightAt(field: TerrainHeightField, x: number, z: number): number {
  if (shape !== 'organic' || field.isFlat) return field.heightAt(x, z);
  const cx = Math.floor(x);
  const cz = Math.floor(z);
  const slope = field.slopeAt(cx, cz);
  if (!slope) return field.heightAt(x, z);
  const N = subdivisions;
  const fx = (x - cx) * N;
  const fz = (z - cz) * N;
  const i = Math.min(N - 1, Math.floor(fx));
  const j = Math.min(N - 1, Math.floor(fz));
  const q: CellCornerHeights = [
    hillHeightInCell(field, cx, cz, i / N, j / N),
    hillHeightInCell(field, cx, cz, (i + 1) / N, j / N),
    hillHeightInCell(field, cx, cz, i / N, (j + 1) / N),
    hillHeightInCell(field, cx, cz, (i + 1) / N, (j + 1) / N),
  ];
  return surfaceHeightInCell(q, slope, fx - i, fz - j);
}
