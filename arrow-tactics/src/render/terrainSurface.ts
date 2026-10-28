import * as THREE from 'three';
import { cellTriangles, FLAT_TERRAIN, TERRAIN_ELEVATION_STEP, TERRAIN_LEVEL_MAX, type TerrainHeightField } from '../config/terrainElevation';

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
  // Depart au niveau du plus haut relief (ou a la camera si elle est plus
  // basse), puis marche jusqu'a passer sous la surface.
  if (ray.origin.y > -topPlane.constant) {
    if (!ray.intersectPlane(topPlane, lastPoint)) return false;
  } else {
    lastPoint.copy(ray.origin);
  }
  const step = ray.direction.clone().multiplyScalar(MARCH_STEP / Math.max(Math.hypot(ray.direction.x, ray.direction.z), 0.2));
  for (let i = 0; i < 4000; i++) {
    marchPoint.copy(lastPoint).add(step);
    if (marchPoint.y <= field.heightAt(marchPoint.x, marchPoint.z)) {
      // Bissection entre le dernier point au-dessus et le premier en dessous.
      let a = lastPoint.clone();
      let b = marchPoint.clone();
      for (let k = 0; k < 12; k++) {
        const mid = a.clone().add(b).multiplyScalar(0.5);
        if (mid.y <= field.heightAt(mid.x, mid.z)) b = mid;
        else a = mid;
      }
      target.set(b.x, field.heightAt(b.x, b.z), b.z);
      return true;
    }
    if (marchPoint.y < 0) return ray.intersectPlane(flatGround, target) !== null;
    lastPoint.copy(marchPoint);
  }
  return ray.intersectPlane(flatGround, target) !== null;
}
