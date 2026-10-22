import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { BALLISTA_TOWER_FOOTPRINT, RIGGED_ANIM_FADE_SECONDS } from '../config/constants';
import { cloneScaledToFootprint, type EnvironmentAssets } from './assetLibrary';

const FBX_DIR = '/models/ballista/fbx';
const BODY_PATH = `${FBX_DIR}/Ballista.fbx`;
const SHOT_ANIM_PATH = `${FBX_DIR}/Ballista_Shot_Anim.fbx`;
const AFTER_SHOT_ANIM_PATH = `${FBX_DIR}/Ballista_AfterShot_Anim.fbx`;
const BASE_COLOR_PATH = `${FBX_DIR}/T_Ballista_C.png`;
const NORMAL_PATH = `${FBX_DIR}/T_Ballista_N.png`;
const ORM_PATH = `${FBX_DIR}/T_Ballista_ORM.png`;

/**
 * Nouveau modele de baliste (2026-08-13, fourni par Antoine — remplace le
 * .obj Blockbench "Level 1" precedent) : export FBX rigge (14 os, un
 * mecanisme d'arc articule — bras gauche/droit, treuil, corde) plutot qu'un
 * bloc statique, avec textures PBR separees (T_Ballista_C = couleur,
 * T_Ballista_N = normal map, T_Ballista_ORM = occlusion/rugosite/metal
 * empaquetes) et 3 clips d'animation EXPORTES SEPAREMENT (idle/tir/apres-tir).
 *
 * Contrairement au Fantassin/Archer/Mage riggés (des dizaines d'instances
 * simultanees), la baliste n'existe qu'EN UN SEUL EXEMPLAIRE dans tout le
 * jeu (voir main.ts, `const ballista = await buildBallista();`, seul site
 * d'appel) — pas besoin du couple preload-une-fois/clone-a-la-demande
 * (SkeletonUtils.clone) utilise pour les unites : cette fonction charge et
 * construit directement l'instance unique, une seule fois.
 */

/** Textures TGA fournies (4096x4096, ~50 Mo CHACUNE) decimees et reencodees
 *  en PNG 1024x1024 avant integration (voir scratch-convert-tga-to-png.mjs,
 *  script jetable deja execute — les .tga restent a cote dans le dossier
 *  source si besoin de reconvertir a une autre resolution plus tard, mais
 *  le jeu ne charge desormais QUE les .png). */
async function loadTextures(): Promise<{ map: THREE.Texture; normalMap: THREE.Texture; ormMap: THREE.Texture }> {
  const loader = new THREE.TextureLoader();
  const [map, normalMap, ormMap] = await Promise.all([
    loader.loadAsync(BASE_COLOR_PATH),
    loader.loadAsync(NORMAL_PATH),
    loader.loadAsync(ORM_PATH),
  ]);
  // Seule la texture de COULEUR est en sRGB — normal/ORM doivent rester en
  // espace lineaire (comportement par defaut de TextureLoader, laisse tel
  // quel), sinon le relief/la rugosite/le metal seraient fausses.
  map.colorSpace = THREE.SRGBColorSpace;
  return { map, normalMap, ormMap };
}

/**
 * Les clips `Ballista_Shot_Anim.fbx`/`Ballista_AfterShot_Anim.fbx` ont ete
 * exportes SEPAREMENT du corps (`Ballista.fbx`) : leurs pistes ciblent des
 * noms d'os NUS ("Root", "MainJoint"...), alors que le squelette du corps
 * porte un prefixe long ("ballista_0_rigskinning_finRoot",
 * "ballista_0_rigskinning_finMainJoint"...) — verifie par inspection directe
 * des deux fichiers (script jetable). Three.js relie les pistes d'un clip au
 * squelette PAR NOM DE NŒUD (meme principe deja exploite dans
 * render/riggedGltf.ts pour le Fantassin/Archer/Mage, mais la-bas les noms
 * coincidaient deja d'un fichier a l'autre) : il suffit donc de reecrire le
 * prefixe de chaque piste pour que le clip s'applique correctement au corps.
 */
const BONE_PREFIX = 'ballista_0_rigskinning_fin';

function retargetClipToBody(clip: THREE.AnimationClip, newName: string): THREE.AnimationClip {
  const tracks = clip.tracks.map((track) => {
    const dot = track.name.indexOf('.');
    const boneName = track.name.slice(0, dot);
    const property = track.name.slice(dot);
    const retargeted = track.clone();
    retargeted.name = `${BONE_PREFIX}${boneName}${property}`;
    return retargeted;
  });
  return new THREE.AnimationClip(newName, clip.duration, tracks);
}

async function loadRetargetedClip(path: string, name: string): Promise<THREE.AnimationClip> {
  const loader = new FBXLoader();
  const obj = await loader.loadAsync(path);
  const clip = obj.animations[0];
  if (!clip) throw new Error(`Aucune animation trouvee dans ${path}`);
  return retargetClipToBody(clip, name);
}

/**
 * Construit un clip "pose de repos" A UNE SEULE IMAGE-CLE par os anime par
 * `refClips` (2026-08-13, correctif "la baliste reste enfoncee dans le sol
 * apres le premier tir") — capture la position/rotation LOCALE ACTUELLE de
 * chaque os concerne, appelee juste apres le chargement du corps (donc AVANT
 * que la moindre animation n'ait jamais tourne : c'est la pose de repos
 * (bind pose) telle qu'exportee dans le .fbx).
 *
 * Diagnostic du bug : `afterShotAction` (LoopOnce + clampWhenFinished) n'avait
 * JAMAIS de gestionnaire sur son evenement 'finished' — une fois le clip
 * "apres-tir" termine, le mixer cesse de le faire avancer mais la POSE
 * atteinte (celle de la toute derniere image-cle du clip, telle qu'exportee
 * par l'animateur) reste figee pour toujours, puisque plus rien ne l'ecrase
 * jamais. Si cette derniere image ne revient pas exactement a la pose de
 * repos (le mecanisme de recul/reculement du treuil semble s'immobiliser plus
 * bas que sa position d'origine), le modele reste visuellement enfonce apres
 * le TOUT PREMIER tir, sans aucun moyen de s'en sortir — exactement le
 * symptome remonte par Antoine.
 *
 * Le fait de reconstruire cette pose depuis les valeurs REELLEMENT capturees
 * (plutot que de supposer que le clip revient a zero) garantit un retour
 * exact quelle que soit l'imperfection de l'animation source — meme principe
 * "jamais de derive, toujours un repere fixe" deja applique a
 * ProceduralAttackAnimator pour le Fantassin.
 */
function collectRestPoseClip(body: THREE.Object3D, refClips: THREE.AnimationClip[], name: string): THREE.AnimationClip {
  const boneNames = new Set<string>();
  for (const clip of refClips) {
    for (const track of clip.tracks) {
      boneNames.add(track.name.slice(0, track.name.indexOf('.')));
    }
  }
  const tracks: THREE.KeyframeTrack[] = [];
  for (const boneName of boneNames) {
    const bone = body.getObjectByName(boneName);
    if (!bone) continue;
    tracks.push(new THREE.VectorKeyframeTrack(`${boneName}.position`, [0], [bone.position.x, bone.position.y, bone.position.z]));
    tracks.push(
      new THREE.QuaternionKeyframeTrack(`${boneName}.quaternion`, [0], [
        bone.quaternion.x,
        bone.quaternion.y,
        bone.quaternion.z,
        bone.quaternion.w,
      ]),
    );
  }
  // Duree non-nulle (arbitraire, une seule image-cle donc la valeur est
  // constante sur toute la duree) pour rester une AnimationClip valide.
  return new THREE.AnimationClip(name, 1 / 30, tracks);
}

/**
 * Echelle : le corps FBX est exporte a une echelle NATIVE tres differente de
 * celle du jeu (bbox mesuree ~365×176×345 unites natives, contre ~1.9×0.7×1.4
 * pour l'ancien modele .obj deja bien integre a la grille — TILE = 1). Faute
 * d'unite d'export documentee, cette valeur est deduite en faisant
 * correspondre le plus grand cote horizontal du nouveau modele (365, l'axe X,
 * la largeur des bras de l'arc) a celui de l'ancien (1.875) : 1.875 / 365.109
 * ≈ 0.00513, arrondi a 0.005 — a ajuster si la baliste parait trop grande ou
 * trop petite une fois vue en jeu (aucun acces visuel de mon cote).
 */
const BALLISTA_SCALE = 0.005;

/**
 * Axe de tir : DEDUIT de la geometrie du squelette (script jetable), pas
 * suppose — l'axe LATERAL (largeur des bras de l'arc, ShoulderRoot_R ->
 * ShoulderRoot_L) est purement horizontal sur X ([-83.85, 0, 0]), donc l'axe
 * de tir est forcement l'AUTRE horizontale, Z. Le mecanisme de tir (BackJoint,
 * treuil/operateur) est au Z le plus POSITIF (+164) tandis que les bras de
 * l'arc sont au Z le plus NEGATIF (-136) : l'avant (par ou sort le carreau)
 * est donc vers -Z, exactement la convention deja utilisee partout ailleurs
 * dans le rendu (UnitViews.computeFacing, ancienne baliste) — AUCUNE rotation
 * de correction necessaire, contrairement au Mage/Fantassin dont le pipeline
 * d'export necessitait un facingFix. Reste a confirmer visuellement (aucun
 * acces de mon cote) : si la baliste tire de travers en jeu, la correction se
 * limite a une rotation.y fixe sur le groupe RACINE (jamais touchee par
 * repositionBallista, qui n'ecrit QUE x/z/rotation.y — voir main.ts).
 */

interface BallistaAnimState {
  mixer: THREE.AnimationMixer;
  shotAction: THREE.AnimationAction;
  afterShotAction: THREE.AnimationAction;
  restAction: THREE.AnimationAction;
}

/** Charge le corps + textures + animations et construit l'instance UNIQUE de
 *  la baliste — voir l'en-tete de fichier pour le detail de chaque etape.
 *  Le groupe retourne reste un `THREE.Group` positionnable/orientable
 *  normalement (`position`, `rotation.y`) exactement comme l'ancien modele :
 *  main.ts n'a besoin d'AUCUN changement pour le placer/l'orienter, seuls
 *  `tickBallista`/`playBallistaShot` (nouveaux) sont a brancher en plus pour
 *  profiter de l'animation. */
export async function buildBallista(): Promise<THREE.Group> {
  const bodyLoader = new FBXLoader();
  const [body, { map, normalMap, ormMap }, shotClip, afterShotClip] = await Promise.all([
    bodyLoader.loadAsync(BODY_PATH),
    loadTextures(),
    loadRetargetedClip(SHOT_ANIM_PATH, 'shot'),
    loadRetargetedClip(AFTER_SHOT_ANIM_PATH, 'afterShot'),
  ]);

  // Materiau PBR unique construit a partir de nos propres textures — le
  // corps FBX reference ses textures d'origine par chemin relatif (jamais
  // embarquees dans le fichier), on les ignore entierement et on remplace le
  // materiau de chaque mesh, meme principe deja applique a l'ancien .obj qui
  // referencait un .mtl absent.
  const material = new THREE.MeshStandardMaterial({
    map,
    normalMap,
    // Rugosite/metal lus depuis les canaux G/B de la MEME texture ORM
    // (convention standard, Three.js echantillonne roughnessMap.g et
    // metalnessMap.b independamment) — roughness/metalness a 1 pour que ces
    // cartes s'appliquent SANS attenuation (elles multiplient ces valeurs de
    // base ; les laisser aux defauts three.js, 1/0, aurait annule tout effet
    // metallique). Canal d'occlusion (R) delibrement PAS utilise (aoMap
    // exigerait un 2e jeu d'UV, pas confirme present sur ce maillage) —
    // impact visuel mineur, ecarte pour rester simple/sur.
    roughnessMap: ormMap,
    roughness: 1,
    metalnessMap: ormMap,
    metalness: 1,
  });

  body.scale.setScalar(BALLISTA_SCALE);
  body.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.material = material;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
  });

  // Capture de la pose de repos AVANT toute animation (voir collectRestPoseClip)
  // — sert de filet de secours garanti pour revenir exactement a l'apparence
  // d'origine apres la sequence tir/apres-tir, quelle que soit l'image sur
  // laquelle le clip "apres-tir" se termine reellement.
  const restClip = collectRestPoseClip(body, [shotClip, afterShotClip], 'rest');

  const mixer = new THREE.AnimationMixer(body);
  const shotAction = mixer.clipAction(shotClip);
  shotAction.loop = THREE.LoopOnce;
  shotAction.clampWhenFinished = true;
  const afterShotAction = mixer.clipAction(afterShotClip);
  afterShotAction.loop = THREE.LoopOnce;
  afterShotAction.clampWhenFinished = true;
  const restAction = mixer.clipAction(restClip);
  restAction.loop = THREE.LoopRepeat;

  // Enchainement Tir -> Apres-tir -> Repos (2026-08-13) : des que le tir se
  // termine, fondu-enchaine vers la recuperation ; des que la recuperation se
  // termine A SON TOUR, fondu-enchaine vers la pose de repos CAPTUREE plutot
  // que de laisser `clampWhenFinished` figer indefiniment la toute derniere
  // image du clip d'"apres-tir" — c'etait le bug : cette derniere image ne
  // revenait pas exactement a la pose d'origine (le mecanisme semblait
  // s'immobiliser plus bas, "enfonce dans le sol"), et comme rien ne
  // reecrivait plus jamais ces os ensuite, la baliste restait bloquee ainsi
  // en PERMANENCE des le tout premier tir. Meme mecanisme de fondu que
  // UnitViews.tickRiggedAnimation (fadeOut/fadeIn), pilote ici par
  // l'evenement natif 'finished' du mixer plutot que par un etat recalcule a
  // chaque frame, puisque la baliste n'a que des etats ponctuels (jamais de
  // marche a arbitrer par tick).
  mixer.addEventListener('finished', (event) => {
    if (event.action === shotAction) {
      shotAction.fadeOut(RIGGED_ANIM_FADE_SECONDS);
      afterShotAction.reset().fadeIn(RIGGED_ANIM_FADE_SECONDS).play();
    } else if (event.action === afterShotAction) {
      afterShotAction.fadeOut(RIGGED_ANIM_FADE_SECONDS);
      restAction.reset().fadeIn(RIGGED_ANIM_FADE_SECONDS).play();
    }
  });

  const animState: BallistaAnimState = { mixer, shotAction, afterShotAction, restAction };
  body.userData['ballistaAnim'] = animState;

  return body;
}

/** A appeler UNE FOIS PAR FRAME (temps reel, comme le reste des animations
 *  cosmetiques du jeu) — no-op silencieux si `group` n'est pas une baliste
 *  construite par buildBallista (defensif, ne devrait jamais arriver en
 *  pratique puisqu'il n'existe qu'une seule instance). */
export function tickBallista(group: THREE.Group, realDt: number): void {
  const anim = group.userData['ballistaAnim'] as BallistaAnimState | undefined;
  anim?.mixer.update(realDt);
}

/** Declenche le clip de tir — a appeler au moment ou la fleche du joueur part
 *  VRAIMENT (meme instant que le depart visuel, pas le clic) pour rester
 *  coherent avec le reste du jeu (voir CLAUDE.md, calibrage de l'Archer sur
 *  son animation). Coupe net toute animation en cours avant de la relancer
 *  (`stop()` puis `reset().play()`) : un nouveau tir ne doit jamais se
 *  superposer a la fin d'un tir precedent ou a sa recuperation. */
export function playBallistaShot(group: THREE.Group): void {
  const anim = group.userData['ballistaAnim'] as BallistaAnimState | undefined;
  if (!anim) return;
  anim.afterShotAction.stop();
  anim.restAction.stop();
  anim.shotAction.reset().play();
}

/**
 * Essai (2026-08-14, demande d'Antoine : "je veux que tu essaies de poser
 * le modele de la baliste sur un modele de 'tour — base (bleu)'... agrandit
 * la tour... le modele total peut prendre jusque 3x3 case et etre toujours
 * dans le coin inferieur de la map") — pose la baliste au SOMMET d'une tour
 * KayKit (`blue_tower_base`, voir render/assetLibrary.ts/render/buildings.ts,
 * chantier bâtiments du meme jour) agrandie pour porter credible l'engin.
 * `buildBallista()` original reste INTACT et exporte tel quel
 * (facilement reutilisable seul si Antoine prefere annuler cet essai) —
 * cette fonction ne fait qu'AJOUTER une composition par-dessus, jamais
 * modifier la construction de la baliste elle-meme.
 *
 * Empreinte de la tour choisie a 2.4×2.4 cases (mesure reelle du modele
 * `tower_base` natif : W=0.930, D=1.111, H=1.500 — voir CLAUDE.md, chantier
 * bâtiments) — dans le budget "jusqu'a 3x3" donne par Antoine mais pas au
 * maximum, pour laisser une marge de reglage si le resultat parait trop
 * imposant une fois vu en jeu (aucun acces visuel de mon cote). Mise a
 * l'echelle UNIFORME (cloneScaledToFootprint, meme fonction que pour un
 * batiment normal) : la tour reste proportionnee, jamais deformee.
 *
 * La baliste reste un groupe INDEPENDANT a l'interieur du groupe "plateforme"
 * retourne (position LOCALE = sommet de la tour, rotation LOCALE = aiming) —
 * comme la plateforme elle-meme ne tourne JAMAIS (rotation.y = 0 fixe), la
 * rotation locale de la baliste continue de correspondre exactement a
 * l'orientation MONDE souhaitee : aucun changement necessaire au code de
 * visee/tir existant (main.ts continue de lire/ecrire `ballista.rotation.y`
 * exactement comme avant, voir CLAUDE.md).
 *
 * BALLISTA_TOWER_FOOTPRINT deplacee dans config/constants.ts (2026-08-16) :
 * partagee avec config/mapDef.ts, computeBallistaObstacle — la Baliste
 * devient un batiment gameplay destructible dont le footprint de
 * collision/placement doit correspondre EXACTEMENT a cette emprise visuelle,
 * jamais une valeur dupliquee a la main.
 */

export interface BallistaTowerPlatform {
  /** Groupe RACINE a ajouter a la scene et a positionner/orienter au coin du
   *  plateau (voir main.ts, repositionBallista) — contient la tour ET la
   *  baliste. Ne tourne JAMAIS (rotation.y reste a 0). */
  platform: THREE.Group;
  /** Meme groupe baliste que buildBallista() aurait retourne seul — a
   *  passer tel quel a tickBallista/playBallistaShot, et dont la rotation
   *  LOCALE continue de piloter la visee (voir le commentaire ci-dessus). */
  ballista: THREE.Group;
  /** Hauteur (monde) du sommet de la tour = position Y locale de la baliste
   *  — 2026-08-14, correctif "le tir semble partir de la base de la tour" :
   *  main.ts en a besoin pour relever le point de DEPART VISUEL du tir
   *  (voir render/playerArrowView.ts, setLaunchHeight), qui ignorait
   *  jusqu'ici totalement l'elevation de la baliste. */
  mountHeight: number;
}

/** Le sommet de la boite englobante de la tour est celui de ses creneaux :
 *  le plancher interieur est ~0,22 plus bas (mesure par lancer de rayon en
 *  jeu). La Baliste est descendue d'autant pour reposer sur ce plancher.
 *  Purement visuel : `mountHeight` (depart visuel des tirs) ne change pas. */
const BALLISTA_FLOOR_DROP = 0.2;

export async function buildBallistaTowerPlatform(assets: EnvironmentAssets): Promise<BallistaTowerPlatform> {
  const ballista = await buildBallista();

  const towerPrototype = assets.buildingsByName['blue_tower_base'];
  if (!towerPrototype) throw new Error("Bâtiment 'blue_tower_base' introuvable pour la plateforme de la baliste.");
  const tower = cloneScaledToFootprint(towerPrototype, BALLISTA_TOWER_FOOTPRINT, BALLISTA_TOWER_FOOTPRINT);

  const towerHeight = new THREE.Box3().setFromObject(tower).getSize(new THREE.Vector3()).y;
  ballista.position.set(0, towerHeight - BALLISTA_FLOOR_DROP, 0);

  const platform = new THREE.Group();
  platform.add(tower, ballista);

  return { platform, ballista, mountHeight: towerHeight };
}
