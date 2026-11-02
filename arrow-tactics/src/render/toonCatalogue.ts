import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { loadToonTextures } from './toonUnitRig';

/**
 * Catalogues de pieces Toon RTS (pipeline tools/toon-units, `--atelier`) et
 * objets tenus en main, PARTAGES par l'Atelier de personnage (src/workshop)
 * et le jeu (equipement visible du Heros, render/heroEquipmentView.ts) :
 * meme chargement, meme placement autour de la prise (echelle, rotation,
 * decalage), memes miroirs pour l'autre main. Toute source declaree par le
 * pipeline (western_kingdoms, barbarian, futures) fonctionne.
 */
const DIR = '/assets/units/toon/atelier';

export type ToonHand = 'right' | 'left';

/** Piece d'un catalogue (`<source>_atelier.json`). */
export interface ToonCataloguePiece {
  name: string;
  slot: string;
  /** Os porteur dans le FBX (objets tenus, extras), null pour le corps. */
  carrier: string | null;
  /** Main d'origine d'un objet tenu. */
  side: ToonHand | null;
  sommets: number;
  triangles: number;
}

/** Partie commune des catalogues (l'Atelier y lit aussi clips et presets). */
export interface ToonCatalogue {
  source: string;
  /** Prefixe des textures (`wk`, `brb`). */
  textures: string;
  pieces: ToonCataloguePiece[];
}

const catalogues = new Map<string, Promise<{ catalogue: ToonCatalogue; gltf: GLTF }>>();

/** Catalogue d'une source (JSON + GLB), charge une fois ; textures pretes. */
export function loadToonCatalogue<T extends ToonCatalogue = ToonCatalogue>(source: string): Promise<{ catalogue: T; gltf: GLTF }> {
  let pending = catalogues.get(source);
  if (!pending) {
    pending = (async () => {
      const response = await fetch(`${DIR}/${source}_atelier.json`);
      if (!response.ok) throw new Error(`Catalogue ${source} absent (tools/toon-units, --atelier).`);
      const catalogue = (await response.json()) as ToonCatalogue;
      const [gltf] = await Promise.all([new GLTFLoader().loadAsync(`${DIR}/${source}_atelier.glb`), loadToonTextures(catalogue.textures)]);
      return { catalogue, gltf };
    })();
    catalogues.set(source, pending);
  }
  return pending as Promise<{ catalogue: T; gltf: GLTF }>;
}

/** Nom d'os du glTF (espaces -> soulignes). */
export const boneKey = (name: string): string => name.replace(/[\s.]/g, '_');

/** Os d'un squelette et matrices inverses de liaison (pose de repos). */
export interface SkeletonRest {
  bones: Map<string, THREE.Bone>;
  restInverse: Map<string, THREE.Matrix4>;
}

/** Os et poses de repos d'un modele riggé (tous ses maillages skinnes). */
export function skeletonRestOf(root: THREE.Object3D): SkeletonRest {
  const rest: SkeletonRest = { bones: new Map(), restInverse: new Map() };
  root.traverse((obj) => {
    if ((obj as THREE.Bone).isBone) rest.bones.set(obj.name, obj as THREE.Bone);
    const mesh = obj as THREE.SkinnedMesh;
    if (!mesh.isSkinnedMesh) return;
    mesh.skeleton.bones.forEach((bone, i) => {
      if (!rest.restInverse.has(bone.name)) rest.restInverse.set(bone.name, mesh.skeleton.boneInverses[i]!.clone());
    });
  });
  return rest;
}

function restPosition(rest: SkeletonRest, boneName: string): THREE.Vector3 {
  const inverse = rest.restInverse.get(boneName);
  if (!inverse) throw new Error(`Os ${boneName} absent du squelette`);
  return new THREE.Vector3().setFromMatrixPosition(inverse.clone().invert());
}

/** Os symetrique (R <-> L), sinon celui du parent. */
function counterpartBone(bones: Map<string, THREE.Bone>, name: string): THREE.Bone {
  const swapped = name.replace(/(^|_)([LR])(_|$)/, (_m, a: string, side: string, b: string) => `${a}${side === 'L' ? 'R' : 'L'}${b}`);
  const bone = bones.get(swapped);
  if (bone && swapped !== name) return bone;
  const parent = bones.get(name)?.parent;
  if (!parent || !(parent as THREE.Bone).isBone) throw new Error(`Pas d'os symetrique pour ${name}`);
  return counterpartBone(bones, parent.name);
}

/** Symetrie du plan sagittal des mains au repos (espace de liaison). */
function handsMirror(rest: SkeletonRest): THREE.Matrix4 {
  const right = restPosition(rest, 'Bip001_R_Hand');
  const left = restPosition(rest, 'Bip001_L_Hand');
  const n = right.clone().sub(left).normalize();
  const mid = right.clone().add(left).multiplyScalar(0.5);
  const reflect = new THREE.Matrix4().set(
    1 - 2 * n.x * n.x, -2 * n.x * n.y, -2 * n.x * n.z, 0,
    -2 * n.y * n.x, 1 - 2 * n.y * n.y, -2 * n.y * n.z, 0,
    -2 * n.z * n.x, -2 * n.z * n.y, 1 - 2 * n.z * n.z, 0,
    0, 0, 0, 1,
  );
  return new THREE.Matrix4().makeTranslation(mid.x, mid.y, mid.z).multiply(reflect).multiply(new THREE.Matrix4().makeTranslation(-mid.x, -mid.y, -mid.z));
}

/** Reglage d'un objet tenu : echelle, rotation (degres), decalage. */
export interface HeldTransform {
  scale: number;
  rotation: readonly [number, number, number];
  offset: readonly [number, number, number];
}

/**
 * Objet tenu par la main `hand` : copie rigide de la piece `source` (maillage
 * du catalogue) sur l'os porteur de cette main (en miroir si la piece est
 * faite pour l'autre main), ajustee autour de la prise :
 * T(prise) . T(decalage) . Rx . Ry . Rz . S . T(-prise). Ajoutee a l'os ;
 * null si la piece n'est pas un objet tenu.
 */
export function createHeldPiece(rest: SkeletonRest, hand: ToonHand, info: ToonCataloguePiece, source: THREE.SkinnedMesh, material: THREE.Material, t: HeldTransform): THREE.Mesh | null {
  if (!info.carrier) return null;
  const native = boneKey(info.carrier);
  const bone = info.side === hand ? rest.bones.get(native) : counterpartBone(rest.bones, native);
  if (!bone) return null;
  const grip = restPosition(rest, bone.name);
  const [ox, oy, oz] = t.offset;
  const [rx, ry, rz] = t.rotation.map((d) => THREE.MathUtils.degToRad(d)) as [number, number, number];
  const adjust = new THREE.Matrix4()
    .makeTranslation(grip.x + ox, grip.y + oy, grip.z + oz)
    .multiply(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz, 'XYZ')))
    .multiply(new THREE.Matrix4().makeScale(t.scale, t.scale, t.scale))
    .multiply(new THREE.Matrix4().makeTranslation(-grip.x, -grip.y, -grip.z));
  const local = rest.restInverse.get(bone.name)!.clone().multiply(adjust);
  if (info.side !== hand) local.multiply(handsMirror(rest));
  local.multiply(source.bindMatrix);
  const mesh = new THREE.Mesh(source.geometry, material);
  mesh.matrixAutoUpdate = false;
  mesh.matrix.copy(local);
  mesh.castShadow = true;
  mesh.frustumCulled = false;
  bone.add(mesh);
  return mesh;
}

/** Maillage skinne d'une piece dans la scene d'un catalogue. */
export function cataloguePieceMesh(gltf: GLTF, piece: string): THREE.SkinnedMesh | null {
  let found: THREE.SkinnedMesh | null = null;
  gltf.scene.traverse((obj) => {
    if (!found && (obj as THREE.SkinnedMesh).isSkinnedMesh && obj.name === piece) found = obj as THREE.SkinnedMesh;
  });
  return found;
}
