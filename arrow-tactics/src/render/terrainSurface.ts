import * as THREE from 'three';
import { cellTriangles, FLAT_TERRAIN, TERRAIN_ELEVATION_STEP, TERRAIN_LEVEL_MAX, type TerrainHeightField } from '../config/terrainElevation';
import { CELL_THICKNESS } from './terrainCells';

/**
 * Surface ACTIVE du rendu (relief 2.5D, voir config/terrainElevation.ts) :
 * le champ de hauteur de la carte affichee — celle de la bataille, ou le
 * brouillon de l'editeur pendant l'edition. main.ts le remplace a chaque
 * changement de carte (setActiveTerrain) ; tout placement vertical d'un
 * element pose au sol (unite, batiment, decor, anneau, apercu, effet) part
 * de surfaceY, jamais d'un y = 0 code en dur. Carte plate : surfaceY vaut
 * toujours 0, rendu identique a avant le relief.
 */
let active: TerrainHeightField = FLAT_TERRAIN;

export function setActiveTerrain(field: TerrainHeightField): void {
  active = field;
}

export function activeTerrain(): TerrainHeightField {
  return active;
}

/** Hauteur monde de la surface visible au point (x, z). */
export function surfaceY(x: number, z: number): number {
  return active.heightAt(x, z);
}

/**
 * Matrice qui pose un element PLAT centre a l'origine (overlay de case :
 * zone de camp, apercu de pose) sur la surface de la case (cx, cz) du champ
 * `field`, `lift` au-dessus : translation au centre de la case et, sur une
 * pente, cisaillement vertical le long de la montee — l'overlay epouse la
 * pente sans rotation ni deformation horizontale. Ecrit dans `target`.
 */
export function cellSurfaceMatrix(field: TerrainHeightField, cx: number, cz: number, lift: number, target: THREE.Matrix4): THREE.Matrix4 {
  // Pente cardinale : cisaillement ; plate ou pente de coin (non plane) :
  // translation seule (les overlays de case utilisent cellSurfaceGeometry).
  const shape = field.slopeAt(cx, cz);
  const slope = shape === 'N' || shape === 'E' || shape === 'S' || shape === 'W' ? shape : null;
  const mid = field.heightAt(cx + 0.5, cz + 0.5) + lift;
  const k = slope === 'E' || slope === 'S' ? TERRAIN_ELEVATION_STEP : slope ? -TERRAIN_ELEVATION_STEP : 0;
  const kx = slope === 'E' || slope === 'W' ? k : 0;
  const kz = slope === 'S' || slope === 'N' ? k : 0;
  return target.set(1, 0, 0, cx + 0.5, kx, 1, kz, mid, 0, 0, 1, cz + 0.5, 0, 0, 0, 1);
}

/**
 * Ajoute a `out` les deux triangles (positions x, y, z, `lift` au-dessus de
 * la surface, moins `origin`) qui recouvrent exactement la case (cx, cz) du
 * champ `field` : memes coins et meme diagonale que le sol
 * (cellTriangles), pente de coin comprise. Overlays de case (zones de
 * territoire, apercus de l'editeur).
 */
export function appendCellSurfaceTriangles(field: TerrainHeightField, cx: number, cz: number, lift: number, out: number[], originX = 0, originZ = 0): void {
  const h = field.cornerHeights(cx, cz);
  for (const tri of cellTriangles(field.slopeAt(cx, cz))) {
    for (const i of tri) out.push(cx + (i % 2) - originX, h[i]! + lift, cz + (i < 2 ? 0 : 1) - originZ);
  }
}

const flatGround = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const topPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -TERRAIN_LEVEL_MAX * TERRAIN_ELEVATION_STEP);
const marchPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const marchPoint = new THREE.Vector3();
const lastPoint = new THREE.Vector3();
/** Pas de la marche le long du rayon (cases) : bien plus fin qu'une case,
 *  une bissection affine ensuite le point d'impact. */
const MARCH_STEP = 0.05;

/**
 * Point ou le rayon touche la surface visible (dessus des cases, ou face
 * d'une falaise : le point retenu est alors juste derriere la face, sur la
 * case haute). Remplace l'intersection avec le plan y = 0 pour tout le
 * pointage a la souris. Carte plate : exactement ce plan. Ecrit dans
 * `target` ; false si le rayon ne descend pas vers le sol. `field` : la
 * surface visee, l'active par defaut (un trait de sculpture vise le terrain
 * de son debut, voir main.ts).
 */
export function intersectTerrain(ray: THREE.Ray, target: THREE.Vector3, field: TerrainHeightField = active): boolean {
  if (field.isFlat) return ray.intersectPlane(flatGround, target) !== null;
  if (ray.direction.y >= 0) return false;
  if (marchToSurface(ray, target, (x, z) => field.heightAt(x, z), -topPlane.constant)) return true;
  return ray.intersectPlane(flatGround, target) !== null;
}

const workPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const planePoint = new THREE.Vector3();

/** Rayon (cases) dans lequel le plan de travail prend la hauteur des cases
 *  existantes voisines (voir nearestCellHeight). */
const WORK_PLANE_REACH = 2;

/**
 * Pointage des pinceaux de sculpture (Surelever / Abaisser) : comme
 * intersectTerrain sur `field` (le terrain du debut du trait pendant un
 * trait), mais le vide — hors carte ou trou (`hasCell` faux) — n'arrete
 * jamais le pinceau : il y prolonge un PLAN DE TRAVAIL horizontal a la
 * hauteur des cases existantes voisines (a WORK_PLANE_REACH cases
 * pres ; au-dela, `planeY`, hauteur du dernier point vise, voir
 * main.ts). En sortant d'un plateau, le pinceau continue a sa hauteur, sans
 * saut ; au-dessus d'un trou, a la hauteur de son bord ; la coordonnee de
 * grille reste definie partout. Le plan passe devant le terrain que le rayon
 * touche ensuite (face d'un flanc vue depuis le vide) ; un terrain vise
 * au-dela d'un trou reste atteint, le plan n'etant jamais plus haut que le
 * bord le plus proche. Ecrit dans `target` ; 'terrain' sur une case
 * existante, 'void' sur le plan de travail, null si le rayon ne descend pas.
 */
export function intersectSculptSurface(ray: THREE.Ray, target: THREE.Vector3, field: TerrainHeightField, hasCell: (cx: number, cz: number) => boolean, planeY: number): 'terrain' | 'void' | null {
  if (ray.direction.y >= 0) return null;
  const classify = (p: THREE.Vector3) => (hasCell(Math.floor(p.x), Math.floor(p.z)) ? 'terrain' : 'void');
  if (field.isFlat) {
    workPlane.constant = 0;
    return ray.intersectPlane(workPlane, target) ? classify(target) : null;
  }
  // Terrain reel : le vide est transparent (le rayon y passe), une case
  // existante l'arrete par son dessus ou la face visible d'un flanc.
  const heightAt = (x: number, z: number) => (hasCell(Math.floor(x), Math.floor(z)) ? field.heightAt(x, z) : -Infinity);
  const hit = marchToSurface(ray, target, heightAt, -topPlane.constant, -CELL_THICKNESS);
  // Plan de travail : a la hauteur du dernier point vise, puis a celle de la
  // case existante la plus proche de ce point.
  workPlane.constant = -planeY;
  if (!ray.intersectPlane(workPlane, planePoint)) return hit ? 'terrain' : null;
  const local = nearestCellHeight(field, hasCell, planePoint.x, planePoint.z);
  if (local !== null && local !== planeY) {
    workPlane.constant = -local;
    if (!ray.intersectPlane(workPlane, planePoint)) return hit ? 'terrain' : null;
  }
  const inVoid = classify(planePoint) === 'void';
  if (!hit) {
    target.copy(planePoint);
    return inVoid ? 'void' : classify(target);
  }
  const planeFirst = planePoint.clone().sub(ray.origin).dot(ray.direction) < target.clone().sub(ray.origin).dot(ray.direction);
  if (inVoid && planeFirst) {
    target.copy(planePoint);
    return 'void';
  }
  return 'terrain';
}

/** Hauteur du terrain existant autour de (x, z), a WORK_PLANE_REACH cases
 *  pres : moyenne des surfaces des cases voisines (au point de chacune le
 *  plus proche de (x, z)), ponderee par l'inverse du carre de la distance —
 *  dominee par le bord le plus proche et continue quand le curseur longe
 *  des cases de hauteurs differentes. null si aucune case. */
function nearestCellHeight(field: TerrainHeightField, hasCell: (cx: number, cz: number) => boolean, x: number, z: number): number | null {
  const cx = Math.floor(x);
  const cz = Math.floor(z);
  let sum = 0;
  let weights = 0;
  for (let dz = -WORK_PLANE_REACH; dz <= WORK_PLANE_REACH; dz++) {
    for (let dx = -WORK_PLANE_REACH; dx <= WORK_PLANE_REACH; dx++) {
      if (!hasCell(cx + dx, cz + dz)) continue;
      const px = Math.min(cx + dx + 0.999, Math.max(cx + dx, x));
      const pz = Math.min(cz + dz + 0.999, Math.max(cz + dz, z));
      const w = 1 / ((px - x) ** 2 + (pz - z) ** 2 + 0.05);
      sum += w * field.heightAt(px, pz);
      weights += w;
    }
  }
  return weights > 0 ? sum / weights : null;
}

/** Marche le long du rayon (descendant) depuis l'altitude `topY` (ou la
 *  camera si elle est plus basse) jusqu'a passer sous `heightAt`, puis
 *  bissection ; false si le rayon passe sous `floorY` sans toucher. */
function marchToSurface(ray: THREE.Ray, target: THREE.Vector3, heightAt: (x: number, z: number) => number, topY: number, floorY = 0): boolean {
  if (ray.origin.y > topY) {
    marchPlane.constant = -topY;
    if (!ray.intersectPlane(marchPlane, lastPoint)) return false;
  } else {
    lastPoint.copy(ray.origin);
  }
  const step = ray.direction.clone().multiplyScalar(MARCH_STEP / Math.max(Math.hypot(ray.direction.x, ray.direction.z), 0.2));
  for (let i = 0; i < 4000; i++) {
    marchPoint.copy(lastPoint).add(step);
    if (marchPoint.y <= heightAt(marchPoint.x, marchPoint.z)) {
      // Bissection entre le dernier point au-dessus et le premier en dessous.
      let a = lastPoint.clone();
      let b = marchPoint.clone();
      for (let k = 0; k < 12; k++) {
        const mid = a.clone().add(b).multiplyScalar(0.5);
        if (mid.y <= heightAt(mid.x, mid.z)) b = mid;
        else a = mid;
      }
      target.set(b.x, heightAt(b.x, b.z), b.z);
      return true;
    }
    if (marchPoint.y < floorY) return false;
    lastPoint.copy(marchPoint);
  }
  return false;
}
