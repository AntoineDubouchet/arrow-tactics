import * as THREE from 'three';
import { obstacleCenter, TILE, type ObstacleDef } from '../config/constants';
import { cloneScaledTo, type EnvironmentAssets } from './assetLibrary';
import { applyContactShading } from './contactMap';

/** Modele du gros gisement (2026-11-02, demande d'Antoine : « Rocher E » du
 *  catalogue Nature de l'editeur). */
export const DEPOSIT_ROCK_MODEL = 'kaykit_rock_single_E';

/** Largeur du rocher rapportee a l'emprise (un peu plus present que l'ancien
 *  amas, sans deborder de ses cases bloquantes). */
const DEPOSIT_WIDTH_RATIO = 0.95;

const goldOre = new THREE.MeshStandardMaterial({ color: 0xf2c24a, metalness: 0.65, roughness: 0.35, emissive: 0x3d2800, flatShading: true });
const goldVein = new THREE.MeshStandardMaterial({ color: 0xd9a52e, metalness: 0.5, roughness: 0.45, emissive: 0x2a1a00, flatShading: true });
// Ombre de contact et voile de brume (render/contactMap.ts, rendu officiel 2026-11-07).
applyContactShading(goldOre);
applyContactShading(goldVein);

/** Petit hachage deterministe (aspect stable d'un gisement donne). */
function seeded(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Veines et pepites d'or posees SUR le rocher : on vise la surface depuis
 *  l'exterieur (rayon), a mi-hauteur et vers le haut, pour des morceaux
 *  dores lisibles de loin sans transformer le rocher en objet brillant. */
function addGoldOre(rock: THREE.Object3D, seed: number): void {
  rock.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(rock);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const meshes: THREE.Mesh[] = [];
  rock.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh);
  });
  const raycaster = new THREE.Raycaster();
  const rand = seeded(seed);
  const radius = Math.max(size.x, size.z);
  const ore = new THREE.Group();
  const count = 9;
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + rand() * 0.6;
    const h = box.min.y + size.y * (0.25 + rand() * 0.6);
    const from = new THREE.Vector3(center.x + Math.cos(a) * radius * 1.5, h, center.z + Math.sin(a) * radius * 1.5);
    raycaster.set(from, new THREE.Vector3(center.x, h, center.z).sub(from).normalize());
    const hit = raycaster.intersectObjects(meshes, false)[0];
    if (!hit) continue;
    const s = radius * (0.05 + rand() * 0.04);
    const nugget = new THREE.Mesh(new THREE.IcosahedronGeometry(s, 0), i % 3 === 0 ? goldVein : goldOre);
    nugget.position.copy(hit.point);
    nugget.scale.set(1.3, 0.8 + rand() * 0.5, 1);
    nugget.rotation.set(rand() * 3, rand() * 3, rand() * 3);
    nugget.castShadow = true;
    ore.add(nugget);
    // Veine : un second morceau aplati juste a cote, le long de la paroi.
    if (i % 2 === 0) {
      const vein = new THREE.Mesh(new THREE.IcosahedronGeometry(s * 0.7, 0), goldVein);
      vein.position.copy(hit.point).addScaledVector(new THREE.Vector3(-Math.sin(a), 0.35, Math.cos(a)), s * 1.4);
      vein.scale.set(1.6, 0.45, 0.9);
      vein.rotation.y = a;
      ore.add(vein);
    }
  }
  // Coordonnees du rocher seul (sans parent) -> son repere local.
  const inverse = new THREE.Matrix4().copy(rock.matrixWorld).invert();
  for (const piece of ore.children) piece.applyMatrix4(inverse);
  rock.add(ore);
}

/**
 * Gros gisement (`kind: 'rock'`, 2026-11-02) : le « Rocher E » KayKit,
 * calé sur l'emprise (DEPOSIT_WIDTH_RATIO), orientation fixée par la graine
 * d'aspect ou `rotationY`. Gisement d'or (`ore: 'gold'`) : même rocher, avec
 * des veines et pépites dorées (procédurales, aucun asset dédié). Remplace
 * l'ancien amas de rochers.
 */
export function createRock(def: ObstacleDef, assets: EnvironmentAssets, random: () => number): THREE.Group {
  const width = def.tilesX * TILE;
  const depth = def.tilesZ * TILE;
  const { x: centerX, z: centerZ } = obstacleCenter(def);
  const prototype = assets.propsByName[DEPOSIT_ROCK_MODEL];
  const root = new THREE.Group();
  if (!prototype) throw new Error(`Rocher inconnu : ${DEPOSIT_ROCK_MODEL}`);
  const rock = cloneScaledTo(prototype, Math.min(width, depth) * DEPOSIT_WIDTH_RATIO * (def.scale ?? 1), 'width');
  const yaw = def.rotationY ?? random() * Math.PI * 2;
  rock.rotation.y = yaw;
  root.add(rock);
  if (def.ore === 'gold') addGoldOre(rock, Math.round(centerX * 73 + centerZ * 131) >>> 0);
  root.position.set(centerX, 0, centerZ);
  return root;
}
