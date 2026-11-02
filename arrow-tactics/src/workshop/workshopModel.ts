import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { createToonTintMaterial, loadToonTextures } from '../render/toonUnitRig';
import { BODY_SLOTS, type CataloguePiece, type Hand, type HandConfig, type PieceRef, type WorkshopCatalogue, type WorkshopConfig } from './workshopConfig';

/**
 * Atelier de personnage : modele compose a partir des GLB des catalogues
 * (toutes les pieces, skinnees sur le squelette commun). Le squelette et les
 * clips sont ceux de la source de BASE ; les pieces des autres sources (unite
 * mixte, selecteur « All ») y sont rattachees par nom d'os (meme squelette
 * Biped, meme repos), chacune avec le materiau de sa source (atlas et masque
 * propres, meme teinte). Pieces de corps et extras : maillages skinnes
 * affiches ou masques, echelle propre (`scaledSkinnedGeometry`). Objets
 * tenus : copies RIGIDES attachees a l'os de la main voulue — en miroir si
 * l'objet vient de l'autre main (plan des mains au repos, comme
 * `offhand_weapon`), ajustees autour de la prise (meme convention que
 * `pieces.hands` du pipeline).
 */
const DIR = '/assets/units/toon/atelier';

export interface LoadedCatalogue {
  catalogue: WorkshopCatalogue;
  gltf: GLTF;
}

const catalogues = new Map<string, Promise<LoadedCatalogue>>();

/** Catalogue d'une source (JSON + GLB du pipeline), charge une fois. */
export function loadCatalogue(source: string): Promise<LoadedCatalogue> {
  let pending = catalogues.get(source);
  if (!pending) {
    pending = (async () => {
      const response = await fetch(`${DIR}/${source}_atelier.json`);
      if (!response.ok) throw new Error(`Catalogue ${source} absent (tools/toon-units, --atelier).`);
      const catalogue = (await response.json()) as WorkshopCatalogue;
      const [gltf] = await Promise.all([new GLTFLoader().loadAsync(`${DIR}/${source}_atelier.glb`), loadToonTextures(catalogue.textures)]);
      return { catalogue, gltf };
    })();
    catalogues.set(source, pending);
  }
  return pending;
}

/** Nom d'os du glTF (espaces -> soulignes). */
const boneKey = (name: string): string => name.replace(/[\s.]/g, '_');

/** Os symetrique (R <-> L), sinon celui du parent. */
function counterpartBone(bones: Map<string, THREE.Bone>, name: string): THREE.Bone {
  const swapped = name.replace(/(^|_)([LR])(_|$)/, (_m, a: string, side: string, b: string) => `${a}${side === 'L' ? 'R' : 'L'}${b}`);
  const bone = bones.get(swapped);
  if (bone && swapped !== name) return bone;
  const parent = bones.get(name)?.parent;
  if (!parent || !(parent as THREE.Bone).isBone) throw new Error(`Pas d'os symetrique pour ${name}`);
  return counterpartBone(bones, parent.name);
}

/**
 * Echelle propre d'une piece skinnee : chaque sommet, en espace de liaison,
 * est mis a l'echelle autour de la moyenne ponderee (poids de skinning) des
 * articulations qui le portent (os au repos). Squelette, poids et clips
 * inchanges : la piece grossit autour de ses os et les suit dans toutes les
 * poses (une piece rigide sur un os : echelle autour de cette articulation).
 * Meme calcul que le pipeline (`scale_piece`, tools/toon-units).
 */
export function scaledSkinnedGeometry(base: THREE.BufferGeometry, mesh: THREE.SkinnedMesh, scale: number): THREE.BufferGeometry {
  const geometry = base.clone();
  const position = geometry.attributes['position'] as THREE.BufferAttribute;
  const index = geometry.attributes['skinIndex']!;
  const weight = geometry.attributes['skinWeight']!;
  const joints = mesh.skeleton.boneInverses.map((m) => new THREE.Vector3().setFromMatrixPosition(m.clone().invert()));
  const toMesh = mesh.bindMatrix.clone().invert();
  const p = new THREE.Vector3();
  const pivot = new THREE.Vector3();
  for (let i = 0; i < position.count; i++) {
    pivot.set(0, 0, 0);
    let total = 0;
    for (let k = 0; k < 4; k++) {
      const w = weight.getComponent(i, k);
      if (w <= 0) continue;
      pivot.addScaledVector(joints[index.getComponent(i, k)]!, w);
      total += w;
    }
    if (total <= 0) continue;
    pivot.divideScalar(total);
    p.fromBufferAttribute(position, i).applyMatrix4(mesh.bindMatrix).sub(pivot).multiplyScalar(scale).add(pivot).applyMatrix4(toMesh);
    position.setXYZ(i, p.x, p.y, p.z);
  }
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

export interface WorkshopStats {
  triangles: number;
  sommets: number;
  os: number;
  materiaux: number;
  clips: number;
  /** Sources des pieces affichees (base d'abord). */
  sources: string[];
  pieces: string[];
}

/** Pieces d'une source : maillages (rattaches au squelette de base) et materiau. */
interface SourcePieces {
  catalogue: WorkshopCatalogue;
  meshes: Map<string, THREE.SkinnedMesh>;
  tint: ReturnType<typeof createToonTintMaterial>;
}

export class WorkshopModel {
  /** Racine affichee (echelle du personnage). */
  readonly root = new THREE.Group();
  readonly mixer: THREE.AnimationMixer;
  readonly clips: THREE.AnimationClip[];
  /** Catalogue de la source de base (squelette, clips). */
  readonly catalogue: WorkshopCatalogue;
  private readonly scene: THREE.Object3D;
  private readonly sources = new Map<string, SourcePieces>();
  private readonly bones = new Map<string, THREE.Bone>();
  private readonly restInverse = new Map<string, THREE.Matrix4>();
  /** Geometrie d'origine des pieces mises a l'echelle. */
  private readonly baseGeometry = new Map<THREE.SkinnedMesh, THREE.BufferGeometry>();
  private handObjects: THREE.Mesh[] = [];
  private action: THREE.AnimationAction | null = null;

  /** `base` : source du squelette et des clips ; `all` : catalogues dont les
   *  pieces peuvent etre affichees (base comprise). */
  constructor(base: LoadedCatalogue, all: ReadonlyMap<string, LoadedCatalogue>) {
    this.catalogue = base.catalogue;
    this.scene = cloneSkinned(base.gltf.scene);
    const own: SourcePieces = { catalogue: base.catalogue, meshes: new Map(), tint: createToonTintMaterial(base.catalogue.textures) };
    this.sources.set(base.catalogue.source, own);
    this.scene.traverse((obj) => {
      const mesh = obj as THREE.SkinnedMesh;
      if ((obj as THREE.Bone).isBone) this.bones.set(obj.name, obj as THREE.Bone);
      if (!mesh.isSkinnedMesh) return;
      mesh.material = own.tint.material;
      mesh.frustumCulled = false;
      mesh.castShadow = true;
      own.meshes.set(mesh.name, mesh);
      mesh.skeleton.bones.forEach((bone, i) => {
        if (!this.restInverse.has(bone.name)) this.restInverse.set(bone.name, mesh.skeleton.boneInverses[i]!.clone());
      });
    });
    // Autres sources : memes geometries, liees aux os de base du meme nom
    // (liaison « attached » : la place du maillage dans la scene est sans effet).
    for (const [id, loaded] of all) {
      if (id === base.catalogue.source) continue;
      const other: SourcePieces = { catalogue: loaded.catalogue, meshes: new Map(), tint: createToonTintMaterial(loaded.catalogue.textures) };
      this.sources.set(id, other);
      loaded.gltf.scene.traverse((obj) => {
        const src = obj as THREE.SkinnedMesh;
        if (!src.isSkinnedMesh) return;
        const skeleton = new THREE.Skeleton(
          src.skeleton.bones.map((b) => {
            const bone = this.bones.get(b.name);
            if (!bone) throw new Error(`Os ${b.name} (${id}) absent du squelette de base`);
            return bone;
          }),
          src.skeleton.boneInverses.map((m) => m.clone()),
        );
        const mesh = new THREE.SkinnedMesh(src.geometry, other.tint.material);
        mesh.name = src.name;
        mesh.bind(skeleton, src.bindMatrix.clone());
        mesh.frustumCulled = false;
        mesh.castShadow = true;
        mesh.visible = false;
        this.scene.add(mesh);
        other.meshes.set(mesh.name, mesh);
      });
    }
    this.root.add(this.scene);
    this.mixer = new THREE.AnimationMixer(this.scene);
    this.clips = base.gltf.animations;
  }

  private piece(source: string, name: string | null): CataloguePiece | undefined {
    return name ? this.sources.get(source)?.catalogue.pieces.find((p) => p.name === name) : undefined;
  }

  /** Position de repos (espace de liaison) d'un os. */
  private restPosition(boneName: string): THREE.Vector3 {
    const inverse = this.restInverse.get(boneName);
    if (!inverse) throw new Error(`Os ${boneName} absent du squelette`);
    return new THREE.Vector3().setFromMatrixPosition(inverse.clone().invert());
  }

  /** Symetrie du plan sagittal des mains au repos (espace de liaison). */
  private handsMirror(): THREE.Matrix4 {
    const right = this.restPosition('Bip001_R_Hand');
    const left = this.restPosition('Bip001_L_Hand');
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

  /** Objet tenu par la main `hand` : copie rigide sur l'os de cette main. */
  private attachHand(hand: Hand, config: HandConfig): void {
    const info = this.piece(config.source, config.piece);
    const pieces = this.sources.get(config.source);
    const source = config.piece ? pieces?.meshes.get(config.piece) : undefined;
    if (!info || !source || !info.carrier || !pieces) return;
    const native = boneKey(info.carrier);
    const bone = info.side === hand ? this.bones.get(native)! : counterpartBone(this.bones, native);
    const grip = this.restPosition(bone.name);
    const [ox, oy, oz] = config.offset;
    const [rx, ry, rz] = config.rotation.map((d) => THREE.MathUtils.degToRad(d)) as [number, number, number];
    // Ajustement autour de la prise : T(prise) . T(decalage) . Rx . Ry . Rz . S . T(-prise).
    const adjust = new THREE.Matrix4()
      .makeTranslation(grip.x + ox, grip.y + oy, grip.z + oz)
      .multiply(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz, 'XYZ')))
      .multiply(new THREE.Matrix4().makeScale(config.scale, config.scale, config.scale))
      .multiply(new THREE.Matrix4().makeTranslation(-grip.x, -grip.y, -grip.z));
    const local = this.restInverse.get(bone.name)!.clone().multiply(adjust);
    if (info.side !== hand) local.multiply(this.handsMirror());
    local.multiply(source.bindMatrix);
    const mesh = new THREE.Mesh(source.geometry, pieces.tint.material);
    mesh.name = `${config.piece}_${hand}`;
    mesh.userData['source'] = config.source;
    mesh.matrixAutoUpdate = false;
    mesh.matrix.copy(local);
    mesh.castShadow = true;
    mesh.frustumCulled = false;
    bone.add(mesh);
    this.handObjects.push(mesh);
  }

  /** Geometrie de la piece a l'echelle `scale` (1 : geometrie d'origine). */
  private scalePiece(mesh: THREE.SkinnedMesh, scale: number): void {
    const base = this.baseGeometry.get(mesh) ?? mesh.geometry;
    this.baseGeometry.set(mesh, base);
    if ((mesh.userData['scale'] ?? 1) === scale) return;
    if (mesh.geometry !== base) mesh.geometry.dispose();
    mesh.geometry = scale === 1 ? base : scaledSkinnedGeometry(base, mesh, scale);
    mesh.userData['scale'] = scale;
  }

  /** Applique une configuration (pieces et leurs echelles, mains, teinte, echelle). */
  apply(config: WorkshopConfig): void {
    const shown = new Map<THREE.SkinnedMesh, number>();
    const refs = [...BODY_SLOTS.map((slot) => config.body[slot]), ...config.extras].filter((r): r is PieceRef => !!r);
    for (const ref of refs) {
      const mesh = this.sources.get(ref.source)?.meshes.get(ref.piece);
      if (mesh && this.piece(ref.source, ref.piece)?.slot !== 'hand') shown.set(mesh, ref.scale);
    }
    for (const { meshes } of this.sources.values()) {
      for (const mesh of meshes.values()) {
        mesh.visible = shown.has(mesh);
        this.scalePiece(mesh, shown.get(mesh) ?? 1);
      }
    }
    for (const obj of this.handObjects) obj.removeFromParent();
    this.handObjects = [];
    for (const hand of ['right', 'left'] as const) this.attachHand(hand, config.hands[hand]);
    this.setLook(config);
  }

  /** Teinte (couleur, melange, intensite : la meme pour toutes les sources) et echelle, en direct. */
  setLook(config: WorkshopConfig): void {
    const look = config.look;
    const color = new THREE.Color(look.couleur).lerp(new THREE.Color(look.couleurB), look.melange);
    for (const { tint } of this.sources.values()) tint.setTint(color, look.intensite);
    this.root.scale.setScalar(look.echelle);
  }

  /** Clip d'apercu (nom du catalogue) ; faux s'il n'existe pas. */
  play(name: string): boolean {
    const clip = this.clips.find((c) => c.name === name);
    if (!clip) return false;
    this.action?.stop();
    this.action = this.mixer.clipAction(clip);
    const info = this.catalogue.clips.find((c) => c.name === name);
    this.action.setLoop(info?.boucle === false ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    this.action.clampWhenFinished = true;
    this.action.reset().play();
    return true;
  }

  stats(): WorkshopStats {
    let triangles = 0, sommets = 0;
    const materials = new Set<string>();
    const used = new Set<string>();
    const pieces: string[] = [];
    const count = (mesh: THREE.Mesh, source: string) => {
      const g = mesh.geometry;
      triangles += (g.index ? g.index.count : g.attributes['position']!.count) / 3;
      sommets += g.attributes['position']!.count;
      materials.add((mesh.material as THREE.Material).uuid);
      used.add(source);
      pieces.push(mesh.name);
    };
    for (const [id, { meshes }] of this.sources) for (const mesh of meshes.values()) if (mesh.visible) count(mesh, id);
    for (const mesh of this.handObjects) count(mesh, mesh.userData['source'] as string);
    const sources = [...this.sources.keys()].filter((id) => used.has(id));
    return { triangles, sommets, os: this.catalogue.os, materiaux: materials.size, clips: this.clips.length, sources, pieces };
  }

  dispose(): void {
    this.mixer.stopAllAction();
    for (const [mesh, base] of this.baseGeometry) if (mesh.geometry !== base) mesh.geometry.dispose();
    for (const { tint } of this.sources.values()) tint.material.dispose();
  }
}
