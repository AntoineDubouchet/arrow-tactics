import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { loadRiggedPrototype, type RiggedPrototype } from './riggedGltf';
import { buildMultiBoneClip, type SwingKeyframe } from './proceduralSwing';
import { ProceduralAttackAnimator, type AttackAnimationConfig } from './proceduralAttackAnimator';
import { easeInOutCubic, easeOutCubic, smoothstepEase } from './easing';
import type { Team } from '../sim/entity';

// TROISIEME version du modele (2026-08-11, meme dossier source) : deux
// exports DEJA teints (bleu/rouge, comme l'Archer) — PAS de systeme de
// teinte par code ici, contrairement aux deux versions precedentes. Antoine :
// "ces modeles ne contiennent aucune animations de mort, ni d'attaque" — en
// realite AUCUNE animation du tout (fichier verifie : 0 clip). Attaque ET
// marche sont donc construites PROCEDURALEMENT (voir plus bas, 2026-08-12).
const BLUE_MESH_URL = '/models/fantassin/fantassin_blue_base.glb';
const RED_MESH_URL = '/models/fantassin/fantassin_red_base.glb';

/**
 * Squelette anonyme ("Bone_XXX", pipeline d'auto-rigging different de
 * Mixamo — voir CLAUDE.md) — hierarchie tracee par analyse FK hors-navigateur
 * (script jetable, positions monde de chaque os au repos) : Hips (Bone_001)
 * -> colonne (Bone_005/004/003/002, ce dernier forkant vers tete/bras droit/
 * bras gauche) -> deux chaines de bras symetriques, PARENT direct de
 * Bone_002.
 *
 * **Correctif 2026-08-12** : le bras choisi initialement (Bone_025, cote
 * +X en espace local brut) etait en fait le bras GAUCHE, pas le droit
 * (retour d'Antoine : "tu t'es trompé de bras"). Cause : la determination
 * du cote avait suppose que l'avant du modele NON corrige était -Z, alors
 * que `facingFix` (rotation.y = π, ligne plus bas) existe justement PARCE
 * QUE l'avant natif de ce modele est +Z — avec ce forward corrige, coté
 * droit = -X, pas +X. Bone_030 (cote -X) est donc la VRAIE epaule droite —
 * chaine confirmee sans sous-chaine de doigts distincte (juste
 * Bone_030→029→028→027→026), contrairement a Bone_025 qui en a deux (une
 * incoherence anatomique mineure entre les deux mains de ce modele, sans
 * impact sur l'animation). Animer l'epaule RIGIDEMENT (tout le bras + l'epee
 * suit comme un seul bloc) reste la methode la plus sure sans acces visuel.
 */
const FANTASSIN_RIGHT_SHOULDER_BONE = 'Bone_030';

/**
 * Coup d'epee V2 (2026-08-12) — refonte complete demandee par Antoine apres
 * la V1 (rotation d'epaule seule) : "une vraie grande courbe d'epee... qui
 * PART DU HAUT... HAUT DROITE -> DEVANT -> BAS GAUCHE". Remplace
 * SWORD_SWING_AXIS/KEYFRAMES (V1, epaule seule sur un axe) par une vraie
 * chaine multi-os pilotee par `ProceduralAttackAnimator` (torse, epaule,
 * bras, avant-bras, main, bouclier, bassin, tete) avec easing par phase.
 *
 * Chronologie (secondes, cf. FOOTMAN_ATTACK_TIMING demande par Antoine) :
 * repos(0) -> windup(0.18) -> anticipation(0.25) -> impact/slash(0.43) ->
 * follow-through(0.56) -> recovery(0.72). Chaque canal ci-dessous fournit UNE
 * valeur (degres) par point de cette chronologie.
 *
 * Trajectoire de l'EPAULE (canal dominant, ~100% du mouvement per la
 * consigne d'Antoine) VERIFIEE par script hors-navigateur (vrai
 * THREE.Quaternion/Object3D, hierarchie facingFix incluse pour travailler
 * dans le repere MONDE final du jeu) : windup X=-110/Z=+20 leve la main a
 * pos Y~1.34 (rest Y=0.53, donc nettement au-dessus, "au-dessus de la tete"
 * plausible) tout en restant cote droit (dX~0) et loin derriere (dZ~+1.16) ;
 * impact X=+50/Z=-35 place la main devant le corps (dZ=-0.46) en ayant deja
 * commence a traverser vers la gauche (dX=-0.19) ; follow-through X=+10/
 * Z=-70 termine LOIN a gauche (dX=-0.84, traverse largement le centre) a
 * une hauteur moderee (dY=+0.25, nettement plus bas que le pic du windup) —
 * la combinaison dessine bien HAUT-DROITE -> DEVANT -> BAS-GAUCHE. Les
 * autres canaux (upperArm/foreArm/hand/torse/tete/bouclier/bassin) sont des
 * ACCENTS d'amplitude modeste (voir commentaires), non verifies aussi
 * finement — risque limite puisqu'ils s'ajoutent par-dessus la trajectoire
 * deja verifiee de l'epaule, jamais a sa place.
 *
 * Proprite cle exploitee (voir proceduralAttackAnimator.ts) : la cible MONDE
 * de chaque os reste exacte quel que soit ce que fait son parent (torse,
 * bassin) la MEME frame, tant que `bones` liste les canaux PARENT AVANT
 * ENFANT — d'ou l'ordre choisi plus bas (bassin, torse, tete/bouclier/
 * epaule, avant-bras, main).
 */
const FOOTMAN_ATTACK_TIMING = {
  windupEnd: 0.18,
  anticipationEnd: 0.25,
  impact: 0.43,
  followThroughEnd: 0.56,
  duration: 0.72,
};
const ATTACK_KEYFRAME_TIMES = [
  0,
  FOOTMAN_ATTACK_TIMING.windupEnd,
  FOOTMAN_ATTACK_TIMING.anticipationEnd,
  FOOTMAN_ATTACK_TIMING.impact,
  FOOTMAN_ATTACK_TIMING.followThroughEnd,
  FOOTMAN_ATTACK_TIMING.duration,
];
// [rest->windup, windup->anticipation, anticipation->impact (slash rapide),
//  impact->follow-through, follow-through->recovery] — demande explicite
// d'Antoine sur les courbes a utiliser par phase.
const ATTACK_SEGMENT_EASINGS = [easeInOutCubic, easeInOutCubic, easeInOutCubic, easeOutCubic, smoothstepEase];

const FANTASSIN_ATTACK_CONFIG: AttackAnimationConfig = {
  keyframeTimes: ATTACK_KEYFRAME_TIMES,
  segmentEasings: ATTACK_SEGMENT_EASINGS,
  bones: [
    // Bassin (Bone_001, ANCETRE du torse) — leger transfert de poids,
    // valeurs reprises telles quelles des consignes d'Antoine.
    {
      boneNames: ['Bone_001'],
      axes: [{ axis: new THREE.Vector3(0, 1, 0), degreesPerKeyframe: [0, -3, -3.5, 4, 2, 0] }],
    },
    // Torse (Bone_002) — rotation (yaw) : droite pendant l'armement, vers la
    // cible pendant la frappe. Valeurs Antoine (+15/+18 windup, -10 impact,
    // -15 follow-through).
    {
      boneNames: ['Bone_002'],
      axes: [{ axis: new THREE.Vector3(0, 1, 0), degreesPerKeyframe: [0, 15, 18, -10, -15, 0] }],
    },
    // Tete/cou (Bone_020, enfant du torse) — contre-rotation FAIBLE pour
    // continuer a regarder la cible pendant que le torse tourne.
    {
      boneNames: ['Bone_020'],
      axes: [{ axis: new THREE.Vector3(0, 1, 0), degreesPerKeyframe: [0, -6, -7, 4, 6, 0] }],
    },
    // Bouclier / bras gauche (Bone_025, enfant du torse) — amplitude faible
    // (5-10% du mouvement principal), non verifie numeriquement (signe
    // possible a corriger si le bouclier bouge dans le mauvais sens a
    // l'usage, mais amplitude volontairement petite pour limiter le risque).
    {
      boneNames: ['Bone_025'],
      axes: [
        { axis: new THREE.Vector3(1, 0, 0), degreesPerKeyframe: [0, 10, 12, -8, -5, 0] },
        { axis: new THREE.Vector3(0, 0, 1), degreesPerKeyframe: [0, -8, -9, 10, 6, 0] },
      ],
    },
    // Epaule droite (Bone_030, enfant du torse) — canal DOMINANT, verifie
    // numeriquement (voir commentaire au-dessus). L'ordre des axes
    // (X compose puis Z) doit rester X-avant-Z pour reproduire exactement
    // la trajectoire mesuree.
    {
      boneNames: [FANTASSIN_RIGHT_SHOULDER_BONE],
      axes: [
        { axis: new THREE.Vector3(1, 0, 0), degreesPerKeyframe: [0, -110, -118, 50, 10, 0] },
        { axis: new THREE.Vector3(0, 0, 1), degreesPerKeyframe: [0, 20, 24, -35, -70, 0] },
      ],
    },
    // Bras/avant-bras (Bone_029, enfant de l'epaule) — accent de "poids",
    // amplitude modeste pour ne pas ecraser la trajectoire de l'epaule.
    {
      boneNames: ['Bone_029'],
      axes: [{ axis: new THREE.Vector3(1, 0, 0), degreesPerKeyframe: [0, -15, -18, 12, 6, 0] }],
    },
    // Coude (Bone_028, enfant du bras) — plie pendant l'armement, se
    // deplie progressivement pendant la frappe ("le coude se plie... se
    // deplie progressivement", demande explicite).
    {
      boneNames: ['Bone_028'],
      axes: [{ axis: new THREE.Vector3(1, 0, 0), degreesPerKeyframe: [0, -30, -35, 20, 8, 0] }],
    },
    // Poignet (Bone_027, enfant de l'avant-bras) — correction fine
    // uniquement ("n'est jamais le moteur principal"), amplitude la plus
    // faible de la chaine.
    {
      boneNames: ['Bone_027'],
      axes: [{ axis: new THREE.Vector3(1, 0, 0), degreesPerKeyframe: [0, -10, -12, 15, 5, 0] }],
    },
  ],
};

/**
 * Marche (2026-08-12, demande d'Antoine) : balancement alterne des deux
 * hanches (Bone_011/Bone_017, cote droit/gauche — peu importe lequel est
 * anatomiquement "droit" ici, la marche est symetrique) autour de l'axe
 * MONDE X, meme principe que `tickWalkAnim` des unites en boites
 * (jambe gauche/droite en phase opposee) mais applique en AnimationClip
 * BOUCLEE plutot qu'en rotation.x procedurale a chaque frame. Verifie par
 * script hors-navigateur (AnimationMixer reel, LoopRepeat) : les deux pieds
 * oscillent en parfaite phase opposee, boucle exactement sans a-coup au
 * point de raccord (t=0 et t=duree ont des valeurs identiques).
 */
const WALK_AXIS = new THREE.Vector3(1, 0, 0);
const WALK_DURATION = 0.6;
const WALK_HIP_A_BONE = 'Bone_011';
const WALK_HIP_B_BONE = 'Bone_017';
const WALK_HIP_A_KEYFRAMES: SwingKeyframe[] = [
  { time: 0, degrees: 0 },
  { time: 0.15, degrees: 25 },
  { time: 0.3, degrees: 0 },
  { time: 0.45, degrees: -25 },
  { time: 0.6, degrees: 0 },
];
const WALK_HIP_B_KEYFRAMES: SwingKeyframe[] = [
  { time: 0, degrees: 0 },
  { time: 0.15, degrees: -25 },
  { time: 0.3, degrees: 0 },
  { time: 0.45, degrees: 25 },
  { time: 0.6, degrees: 0 },
];

/** Taille (2026-08-11) : d'abord reduite de 30% ("rends les fantassins et
 *  les archers 30% plus petits d'aspect visuel", 0.7), puis Antoine est
 *  revenu dessus le meme jour ("augmente finalement la taille... de 15%
 *  pour le fantassin") — compris comme +15% relatif a cette taille DEJA
 *  reduite (0.7 * 1.15 = 0.805), pas +15% sur la taille d'origine (meme
 *  logique cumulative que MAGE_MODEL_SCALE, mageRig.ts). Applique sur la
 *  racine directement (jamais touche par UnitViews.sync). */
const FANTASSIN_MODEL_SCALE = 0.7 * 1.15;

let bluePrototype: RiggedPrototype | null = null;
let redPrototype: RiggedPrototype | null = null;
let loading: Promise<void> | null = null;

/**
 * Precharge les deux variantes (2026-08-11, TROISIEME version du modele —
 * voir le commentaire en tete de fichier). Contrairement aux deux versions
 * precedentes, AUCUN fichier d'animation a fusionner : `loadRiggedPrototype`
 * est appele sans second argument. Seule la MARCHE reste un `AnimationClip`
 * BOUCLE construit ici (voir buildMultiBoneClip) — l'ATTAQUE (2026-08-12,
 * V2) n'est PLUS un clip baked : elle est jouee par un `ProceduralAttackAnimator`
 * independant, construit par instance dans `buildFantassinModel` (voir
 * FANTASSIN_ATTACK_CONFIG plus haut), pour permettre le controle par phase/
 * easing/os multiples demande par Antoine — un `AnimationClip` a images-cles
 * fixes ne s'y pretait plus une fois plusieurs os/axes en jeu.
 */
export async function preloadFantassinModel(): Promise<void> {
  if (bluePrototype && redPrototype) return;
  if (!loading) {
    loading = Promise.all([loadRiggedPrototype(BLUE_MESH_URL), loadRiggedPrototype(RED_MESH_URL)]).then(
      ([blue, red]) => {
        for (const proto of [blue, red]) {
          proto.animations.push(
            buildMultiBoneClip(
              proto.scene,
              [
                { boneName: WALK_HIP_A_BONE, axis: WALK_AXIS, keyframes: WALK_HIP_A_KEYFRAMES },
                { boneName: WALK_HIP_B_BONE, axis: WALK_AXIS, keyframes: WALK_HIP_B_KEYFRAMES },
              ],
              'Walking',
              WALK_DURATION,
            ),
          );
        }
        bluePrototype = blue;
        redPrototype = red;
      },
    );
  }
  await loading;
}

/**
 * Clone une instance du Fantassin riggé — memes techniques que
 * mageRig.ts/archerRig.ts (SkeletonUtils.clone obligatoire, materiau clone
 * par instance). PAS de teinte appliquee ici (comme l'Archer) : chaque camp
 * a deja SA PROPRE texture correctement coloree dans son export.
 */
export function buildFantassinModel(team: Team): THREE.Group {
  const prototype = team === 'player' ? bluePrototype : redPrototype;
  if (!prototype) {
    throw new Error('Fantassin model not preloaded — call preloadFantassinModel() before spawning a Fantassin.');
  }

  const group = cloneSkinned(prototype.scene) as THREE.Group;

  group.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;

    // Materiau CLONE par instance (jamais partage) — meme raison que le
    // Mage/l'Archer : setOpacity/setEmissive (fondu de mort, flash
    // d'impact) mutent directement le materiau.
    const material = (mesh.material as THREE.MeshStandardMaterial).clone();

    // Meme correctif "quasiment noir" que le Mage/l'Archer (voir leurs
    // fichiers respectifs) : materiau source sans metallicFactor explicite
    // => valeur par defaut du glTF = 1 (entierement metallique), quasi noir
    // sans carte d'environnement. Force a 0 ici aussi.
    material.metalness = 0;

    // Meme lueur emissive baked-in que les deux autres unites riggees —
    // desactivee pour proteger l'hypothese "emissive=0 est l'etat de repos"
    // de UnitViews.setEmissive (flash d'impact generique).
    material.emissive.setRGB(0, 0, 0);
    material.emissiveMap = null;
    material.emissiveIntensity = 0;

    mesh.material = material;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
  });

  // Correction d'orientation (2026-08-11) — meme hypothese que pour le
  // Mage/l'Archer (meme pipeline d'export qui avait produit un modele
  // "tournant le dos") : NON VERIFIEE visuellement de mon cote, appliquee
  // par prudence sur un groupe ENFANT du groupe racine (jamais la racine
  // elle-meme, ecrasee chaque frame par UnitViews.sync) — a retirer d'une
  // ligne si besoin.
  const facingFix = new THREE.Group();
  facingFix.rotation.y = Math.PI;
  facingFix.add(group);

  const root = new THREE.Group();
  root.add(facingFix);
  root.scale.setScalar(FANTASSIN_MODEL_SCALE);

  // Mixer construit sur le groupe CLONE (pas le prototype) — le clip
  // "Walking" (construit une fois par prototype, voir preloadFantassinModel)
  // se lie par NOM d'os, exactement comme un clip charge depuis un fichier
  // separe (meme mecanisme que le Mage/l'Archer). Plus de clip "Attack" ici
  // (voir preloadFantassinModel) — l'attaque est geree par
  // ProceduralAttackAnimator ci-dessous, independamment du mixer.
  const mixer = new THREE.AnimationMixer(group);
  const walkClip = prototype.animations.find((c) => c.name === 'Walking');
  const actions: Record<string, THREE.AnimationAction> = {};
  if (walkClip) {
    const walk = mixer.clipAction(walkClip);
    walk.setLoop(THREE.LoopRepeat, Infinity);
    actions['walk'] = walk;
    root.userData['riggedMixer'] = mixer;
    root.userData['riggedActions'] = actions;
  }

  // Coup d'epee V2 (2026-08-12) — construit sur `group` (le clone), APRES
  // qu'il ait ete attache a facingFix/root : les quaternions MONDE de repos
  // captures a la construction incluent donc bien la correction d'orientation
  // (meme repere que celui utilise pour calibrer FANTASSIN_ATTACK_CONFIG).
  root.userData['proceduralAttack'] = new ProceduralAttackAnimator(group, FANTASSIN_ATTACK_CONFIG);

  return root;
}
