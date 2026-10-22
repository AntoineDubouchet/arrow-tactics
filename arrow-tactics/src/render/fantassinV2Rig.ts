import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import type { Team } from '../sim/entity';

/**
 * Footman V2 — Fantassin par defaut (voir main.ts ; `?footman=v1` revient a
 * l'ancien modele). Modeles Meshy riggés (un rig PAR camp, bleu et rouge
 * differents), clips par camp (Left Slash en jeu, voir ACTIVE_ATTACK), epee
 * commune et bouclier par camp.
 *
 * Assets de `public/assets/units/footman_v2/`, generes depuis les exports
 * Meshy par `tools/footman-v2/` (voir son README) : GLB sans textures, clips
 * JSON deja renommes (`mixamorig*` -> `smartrig*`), filtres et decoupes,
 * textures PNG 2K. Les exports Meshy bruts restent hors du jeu.
 *
 * Le Fantassin V1 (fantassinRig.ts) reste le repli automatique si un asset V2
 * manque (voir isFantassinV2Ready).
 *
 * Purement visuel : rien ici ne touche la simulation. L'attaque est un clip
 * 'attack' baked, pilote comme celui de l'Archer/du Mage par
 * UnitViews.playAttack (declenche au tick de l'evenement de combat, degats
 * deja appliques) et tickRiggedAnimation.
 */
const DIR = '/assets/units/footman_v2';

interface PbrTextureFiles {
  base: string;
  normal?: string;
  metallic: string;
  roughness: string;
}

/** Offsets d'un equipement dans le repere de l'os porteur (calibres dans le
 *  banc de test de l'audit, Euler XYZ en degres). `pivot` : point de la
 *  geometrie normalisee (190 unites, lame/haut vers +Y, face vers +Z) amene
 *  sur l'origine du porteur — centre de la poignee pour l'epee, centre du dos
 *  pour le bouclier. */
interface EquipmentOffset {
  bone: string;
  position: [number, number, number];
  rotationDeg: [number, number, number];
  scale: number;
  pivot: [number, number, number];
}

type AttackId = 'leftSlash' | 'spartanKick';

interface TeamFiles {
  character: string;
  walk: string;
  attacks: Record<AttackId, string>;
  bodyTextures: PbrTextureFiles;
  shield: string;
  shieldTextures: PbrTextureFiles;
}

/** Reglages valides d'un camp. */
interface TeamRig {
  sword: EquipmentOffset;
  /** Decalage du bouclier depuis la main gauche, repere du corps (voir
   *  SHIELD_SOCKET) : assez en avant et a l'exterieur pour ne pas rentrer
   *  dans l'epauliere ni la cuisse pendant la marche (mesure par camp). */
  shieldOffset: THREE.Vector3;
}

/** Textures 2K : `<nom>_base.png`, `_normal`, `_metallic`, `_roughness`. */
function pbrFiles(name: string, hasNormal: boolean): PbrTextureFiles {
  return {
    base: `${DIR}/${name}_base.png`,
    normal: hasNormal ? `${DIR}/${name}_normal.png` : undefined,
    metallic: `${DIR}/${name}_metallic.png`,
    roughness: `${DIR}/${name}_roughness.png`,
  };
}

/** Centre de la poignee (la lame monte vers +Y, le pommeau est en bas). */
const SWORD_PIVOT: [number, number, number] = [0, -57, 0];
/** Centre du dos du bouclier (la face decoree est en +Z). */
const SHIELD_PIVOT: [number, number, number] = [0, 5, -11];
/** Agrandissement visuel de l'epee et du bouclier (+30 %), applique autour de
 *  leur pivot : la prise et l'accroche ne bougent pas. */
const EQUIPMENT_SCALE = 1.3;

/** Bouclier : position et orientation decouplees. Le porteur est un enfant
 *  de la racine du modele (repere du corps : +Z avant, +X cote gauche,
 *  unites natives, 170 de haut), replace a chaque image sur la main gauche
 *  plus le decalage du camp (`shieldOffset`, voir followShieldSocket). Il
 *  tourne avec la torsion du buste autour de la verticale (`orientBone`),
 *  jamais avec le poignet : le clip n'a pas ete anime avec un bouclier,
 *  heriter du poignet le couchait ou l'inclinait trop, mais une rotation
 *  figee sur la racine le laissait « flotter » quand le buste pivote pendant
 *  l'attaque. `rotationDeg` est
 *  l'orientation dans le repere du corps a la pose de repos : port
 *  « fantasy », tenu a la main gauche, face tournee vers l'exterieur (~91°
 *  depuis l'avant), haut penche de 30° vers l'avant ; meme rotation pour les
 *  deux rigs. */
const SHIELD_SOCKET = {
  followBone: 'smartrigLeftHand',
  orientBone: 'smartrigSpine2',
  rotationDeg: [-89.7, 87.5, 118.4] as [number, number, number],
  scale: 0.42 * EQUIPMENT_SCALE,
  pivot: SHIELD_PIVOT,
};

/** Vitesse de lecture des attaques, purement visuelle (le cooldown reste
 *  celui de la simulation). Les plages jouees sont decoupees a la generation
 *  des clips (voir tools/footman-v2/footman-config.mjs). */
const ATTACK_TIME_SCALE: Record<AttackId, number> = {
  /** Left Slash : partie utile 0,45 -> 1,65 s du clip Meshy (fin de
   *  l'armement, coup principal, revers), sans le long retour au repos ;
   *  1,2 s / 1,3 = ~0,92 s, dans le cooldown de 1 s. */
  leftSlash: 1.3,
  /** Spartan Kick (~1,38 s) : clip entier, accelere pour tenir dans le
   *  cooldown de 1 s. Garde pour le futur melange d'attaques. */
  spartanKick: 1.5,
};

/** Attaque jouee en jeu : seul son fichier est charge. */
const ACTIVE_ATTACK: AttackId = 'leftSlash';

/** Epee : rotation de calibration relevee de 15° (seule la composante Z
 *  change) : au repos, la lame pointe a -9° sous l'horizontale au lieu de
 *  -24°. */
const TEAM_RIGS: Record<Team, TeamRig> = {
  player: {
    sword: { bone: 'smartrigRightHand', position: [-0.058, -0.117, -0.008], rotationDeg: [50.7, 38.8, -173.6], scale: 0.005 * EQUIPMENT_SCALE, pivot: SWORD_PIVOT },
    shieldOffset: new THREE.Vector3(14, -4, 2),
  },
  enemy: {
    sword: { bone: 'smartrigRightHand', position: [-0.048, 0.131, -0.024], rotationDeg: [-76.3, 64.1, 133.9], scale: 0.005 * EQUIPMENT_SCALE, pivot: SWORD_PIVOT },
    shieldOffset: new THREE.Vector3(14, -4, 2),
  },
};

function teamFiles(color: 'blue' | 'red', hasBodyNormal: boolean): TeamFiles {
  return {
    character: `${DIR}/footman_${color}.glb`,
    walk: `${DIR}/footman_${color}_walking.json`,
    attacks: {
      leftSlash: `${DIR}/footman_${color}_left_slash.json`,
      spartanKick: `${DIR}/footman_${color}_spartan_kick.json`,
    },
    bodyTextures: pbrFiles(`footman_${color}`, hasBodyNormal),
    shield: `${DIR}/shield_${color}.glb`,
    shieldTextures: pbrFiles(`shield_${color}`, true),
  };
}

// Pas de normal map fournie pour le corps rouge.
const TEAM_FILES: Record<Team, TeamFiles> = { player: teamFiles('blue', true), enemy: teamFiles('red', false) };
const SWORD_FILE = `${DIR}/sword.glb`;
const SWORD_TEXTURES = pbrFiles('sword', true);

/** Le Character Meshy mesure 170 unites (enfants a l'echelle 100). A la
 *  hauteur du V1 (1,70 × 0,805), sa carrure le faisait paraitre trop grand
 *  en jeu : reduit de 30 %, puis remonte de 20 % (environ 1,15 de haut). Les
 *  equipements, enfants du modele, suivent. */
const FANTASSIN_V2_MODEL_SCALE = (0.805 * 0.7 * 1.2) / 100;

/** Walking Meshy (cycle de 1 s, sur place : racine fixe, hanches qui ne se
 *  balancent que de quelques unites). A vitesse 1, la foulee correspond a
 *  ~0,94 unite/s en jeu ; accelere pour suivre le deplacement reel du
 *  Fantassin (la vitesse de simulation ne bouge jamais pour le clip). */
const WALK_TIME_SCALE = 2.0;

/** Fondu d'entree et de sortie de l'attaque, lu par UnitViews (le V1,
 *  l'Archer et le Mage gardent leur coupure nette). */
const ATTACK_FADE_SECONDS = 0.12;

interface FantassinV2Prototype {
  scene: THREE.Group;
  walk: THREE.AnimationClip;
  attack: THREE.AnimationClip;
  attackTimeScale: number;
}

const prototypes: Partial<Record<Team, FantassinV2Prototype>> = {};
let loading: Promise<void> | null = null;

const gltfLoader = new GLTFLoader();

async function loadModel(file: string): Promise<THREE.Group> {
  return (await gltfLoader.loadAsync(file)).scene;
}

/** Clip JSON genere par tools/footman-v2 (pistes deja ciblees sur le Character). */
async function loadClip(file: string): Promise<THREE.AnimationClip> {
  const response = await fetch(file);
  if (!response.ok) throw new Error(`Clip introuvable : ${file}`);
  return THREE.AnimationClip.parse(await response.json());
}

const textureLoader = new THREE.TextureLoader();
const textureCache = new Map<string, Promise<THREE.Texture>>();

function loadTexture(url: string, srgb: boolean): Promise<THREE.Texture> {
  let pending = textureCache.get(url);
  if (!pending) {
    pending = textureLoader.loadAsync(url).then((texture) => {
      if (srgb) texture.colorSpace = THREE.SRGBColorSpace;
      return texture;
    });
    textureCache.set(url, pending);
  }
  return pending;
}

/** Facteur applique a la carte metallic. La scene n'a pas de carte
 *  d'environnement : a 1, l'armure (metal quasi pur) ne reflete rien et
 *  devient presque noire. 0,35 garde le contraste de la carte tout en
 *  restant lisible (compare en jeu a 1 / 0,6 / 0,35 / 0). */
const METALNESS_FACTOR = 0.35;

/** Materiau PBR explicite depuis les PNG externes. roughness a 1 : la carte
 *  s'applique sans attenuation (elle multiplie cette valeur, meme principe
 *  que render/ballista.ts) ; metallic attenuee, voir METALNESS_FACTOR. */
async function buildPbrMaterial(files: PbrTextureFiles): Promise<THREE.MeshStandardMaterial> {
  const [map, normalMap, metalnessMap, roughnessMap] = await Promise.all([
    loadTexture(files.base, true),
    files.normal ? loadTexture(files.normal, false) : Promise.resolve(null),
    loadTexture(files.metallic, false),
    loadTexture(files.roughness, false),
  ]);
  return new THREE.MeshStandardMaterial({ map, normalMap, metalnessMap, roughnessMap, metalness: METALNESS_FACTOR, roughness: 1 });
}

/** Equipement rigide (geometrie deja normalisee dans le GLB), puis porteur ->
 *  pivot -> mesh, attache a `parent` dans le prototype (SkeletonUtils.clone
 *  le duplique avec le reste). */
function attachEquipment(
  parent: THREE.Object3D,
  model: THREE.Group,
  material: THREE.Material,
  offset: Omit<EquipmentOffset, 'bone'>,
  name: string,
): void {
  model.updateMatrixWorld(true);
  let source: THREE.Mesh | undefined;
  model.traverse((obj) => {
    if (!source && (obj as THREE.Mesh).isMesh) source = obj as THREE.Mesh;
  });
  if (!source) throw new Error(`Aucun mesh dans l'equipement ${name}`);
  const geometry = source.geometry.clone();
  geometry.applyMatrix4(source.matrixWorld);

  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  const pivot = new THREE.Group();
  pivot.position.set(-offset.pivot[0], -offset.pivot[1], -offset.pivot[2]);
  pivot.add(mesh);
  const carrier = new THREE.Group();
  carrier.name = `${name}Carrier`;
  carrier.position.fromArray(offset.position);
  carrier.rotation.set(...(offset.rotationDeg.map(THREE.MathUtils.degToRad) as [number, number, number]), 'XYZ');
  carrier.scale.setScalar(offset.scale);
  carrier.add(pivot);
  parent.add(carrier);
}

function requireObject(root: THREE.Object3D, name: string): THREE.Object3D {
  const obj = root.getObjectByName(name);
  if (!obj) throw new Error(`Objet ${name} introuvable dans le Footman V2`);
  return obj;
}

const followedPosition = new THREE.Vector3();
const bodyWorldQuaternion = new THREE.Quaternion();
const orientWorldQuaternion = new THREE.Quaternion();

/** Rotation de `bone` dans le repere de `body` (ecrit dans `target`). */
function quaternionInBody(bone: THREE.Object3D, body: THREE.Object3D, target: THREE.Quaternion): THREE.Quaternion {
  body.getWorldQuaternion(bodyWorldQuaternion);
  bone.getWorldQuaternion(orientWorldQuaternion);
  return target.copy(bodyWorldQuaternion.invert()).multiply(orientWorldQuaternion);
}

interface ShieldSocket {
  carrier: THREE.Object3D;
  body: THREE.Object3D;
  hand: THREE.Object3D;
  orient: THREE.Object3D;
  offset: THREE.Vector3;
  /** Orientation du bouclier a la pose de repos (`rotationDeg`). */
  restRotation: THREE.Quaternion;
  /** Inverse de la rotation du buste a la pose de repos, repere du corps. */
  orientRestInverse: THREE.Quaternion;
}

const orientDelta = new THREE.Quaternion();

/** Replace le porteur du bouclier sur la main gauche et le fait tourner avec
 *  la torsion du buste autour de la verticale seulement : il pivote avec le
 *  corps pendant l'attaque sans jamais se coucher. Appele juste avant le
 *  rendu et l'ombre du bouclier, donc apres l'animation de l'image. */
function followShieldSocket(socket: ShieldSocket): void {
  socket.hand.getWorldPosition(followedPosition);
  socket.body.worldToLocal(followedPosition);
  socket.carrier.position.copy(followedPosition).add(socket.offset);
  // Rotation du buste depuis le repos, reduite a sa composante autour de +Y.
  quaternionInBody(socket.orient, socket.body, orientDelta).multiply(socket.orientRestInverse);
  orientDelta.set(0, orientDelta.y, 0, orientDelta.w).normalize();
  socket.carrier.quaternion.copy(orientDelta).multiply(socket.restRotation);
  socket.carrier.updateMatrixWorld(true);
}

async function loadPrototype(
  team: Team,
  swordModel: Promise<THREE.Group>,
  swordMaterial: Promise<THREE.MeshStandardMaterial>,
): Promise<FantassinV2Prototype> {
  const files = TEAM_FILES[team];
  const rig = TEAM_RIGS[team];
  const [character, shield, walk, attack, bodyMaterial, shieldMaterial, sword, swordMat] = await Promise.all([
    loadModel(files.character),
    loadModel(files.shield),
    loadClip(files.walk),
    loadClip(files.attacks[ACTIVE_ATTACK]),
    buildPbrMaterial(files.bodyTextures),
    buildPbrMaterial(files.shieldTextures),
    swordModel.then((model) => model.clone()),
    swordMaterial,
  ]);
  // Les materiaux des GLB (sans textures) sont remplaces avant tout rendu.
  character.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.isMesh) mesh.material = bodyMaterial;
  });

  attachEquipment(requireObject(character, rig.sword.bone), sword, swordMat, rig.sword, 'FootmanSword');
  attachEquipment(character, shield, shieldMaterial, { ...SHIELD_SOCKET, position: [0, 0, 0] }, 'FootmanShield');

  return { scene: character, walk, attack, attackTimeScale: ATTACK_TIME_SCALE[ACTIVE_ATTACK] };
}

/**
 * Precharge le Footman V2 (bleu et rouge). Ne rejette JAMAIS : en cas
 * d'echec, avertit et laisse le V1 en place (isFantassinV2Ready reste faux),
 * pour qu'aucun asset V2 ne bloque le demarrage du jeu.
 */
export async function preloadFantassinV2Model(): Promise<void> {
  if (!loading) {
    loading = (async () => {
      try {
        const swordModel = loadModel(SWORD_FILE);
        const swordMaterial = buildPbrMaterial(SWORD_TEXTURES);
        const [player, enemy] = await Promise.all([
          loadPrototype('player', swordModel, swordMaterial),
          loadPrototype('enemy', swordModel, swordMaterial),
        ]);
        prototypes.player = player;
        prototypes.enemy = enemy;
      } catch (error) {
        console.warn('Footman V2 : chargement impossible, repli sur le Fantassin V1.', error);
      }
    })();
  }
  await loading;
}

export function isFantassinV2Ready(): boolean {
  return prototypes.player !== undefined && prototypes.enemy !== undefined;
}

/** Clone une instance du Footman V2 — memes conventions que le V1
 *  (fantassinRig.ts) : SkeletonUtils.clone, materiaux clones par instance
 *  (fondu de mort, flash d'impact), facingFix sur un groupe enfant. */
export function buildFantassinV2Model(team: Team): THREE.Group {
  const prototype = prototypes[team];
  if (!prototype) throw new Error('Footman V2 non precharge.');

  const group = cloneSkinned(prototype.scene) as THREE.Group;
  group.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.material = (mesh.material as THREE.MeshStandardMaterial).clone();
    mesh.castShadow = true;
    mesh.receiveShadow = true;
  });

  // Bouclier : position de la main gauche, torsion du buste (voir
  // SHIELD_SOCKET). Le clone est encore a la pose de repos : la rotation du
  // buste y sert de reference, au repos le bouclier garde `rotationDeg`.
  const shieldCarrier = requireObject(group, 'FootmanShieldCarrier');
  const orient = requireObject(group, SHIELD_SOCKET.orientBone);
  const socket: ShieldSocket = {
    carrier: shieldCarrier,
    body: group,
    hand: requireObject(group, SHIELD_SOCKET.followBone),
    orient,
    offset: TEAM_RIGS[team].shieldOffset,
    restRotation: shieldCarrier.quaternion.clone(),
    orientRestInverse: quaternionInBody(orient, group, new THREE.Quaternion()).invert(),
  };
  const shieldMesh = requireObject(group, 'FootmanShield');
  const followHand = (): void => followShieldSocket(socket);
  shieldMesh.onBeforeRender = followHand;
  shieldMesh.onBeforeShadow = followHand;

  // Avant natif en +Z, comme le V1.
  const facingFix = new THREE.Group();
  facingFix.rotation.y = Math.PI;
  facingFix.add(group);

  const root = new THREE.Group();
  root.add(facingFix);
  root.scale.setScalar(FANTASSIN_V2_MODEL_SCALE);

  const mixer = new THREE.AnimationMixer(group);
  const walk = mixer.clipAction(prototype.walk);
  walk.setLoop(THREE.LoopRepeat, Infinity);
  walk.timeScale = WALK_TIME_SCALE;
  // Fin de clip figee jusqu'au fondu decide par tickRiggedAnimation, comme
  // les attaques de l'Archer et du Mage.
  const attack = mixer.clipAction(prototype.attack);
  attack.setLoop(THREE.LoopOnce, 1);
  attack.clampWhenFinished = true;
  attack.timeScale = prototype.attackTimeScale;
  root.userData['riggedMixer'] = mixer;
  root.userData['riggedActions'] = { walk, attack };
  root.userData['riggedAttackFadeSeconds'] = ATTACK_FADE_SECONDS;

  return root;
}
