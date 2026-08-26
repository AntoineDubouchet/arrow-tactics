import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { loadRiggedPrototype, type RiggedPrototype } from './riggedGltf';
import { buildMultiBoneClip, type SwingKeyframe } from './proceduralSwing';
import { ProceduralAttackAnimator, type AttackAnimationConfig } from './proceduralAttackAnimator';
import { easeInCubic, easeInOutCubic, easeOutCubic, smoothstepEase } from './easing';
import type { Team } from '../sim/entity';

/**
 * Sentinelle (2026-08-14, demande complete d'Antoine) — modele riggé Meshy AI
 * (dossier "Sentinelle", deux exports COMPLETS et INDEPENDANTS deja teints
 * par camp, comme l'Archer/le Fantassin V3 : PAS de systeme de teinte par
 * code ici). Inspecte avant integration (script jetable hors-navigateur,
 * supprime apres usage) : AUCUNE animation embarquee (0 clip, comme le
 * Fantassin V3) et squelette ANONYME (28 os "Bone_XXX", parent racine
 * "UniRigArmature" — pipeline d'auto-rig different de Mixamo, meme famille
 * de probleme que le Fantassin) — marche/attaque/Provocation sont donc
 * TOUTES construites PROCEDURALEMENT ici, aucun fichier d'animation a
 * charger.
 */
const BLUE_MESH_URL = '/models/sentinel/sentinel_blue.glb';
const RED_MESH_URL = '/models/sentinel/sentinel_red.glb';

/**
 * Hierarchie tracee par analyse FK hors-navigateur (script jetable, positions
 * MONDE de chaque os au repos, comme pour le Fantassin) :
 *   Bone_000 (racine, parent = UniRigArmature)
 *     -> Bone_001 (Hips reel, legerement plus bas que Bone_000)
 *          -> Bone_005 -> 004 -> 003 -> Bone_002 (torse/base du cou, fork) :
 *               -> Bone_017 -> 016 (cou -> tete)
 *               -> Bone_022 -> 021 -> 020 -> 019 -> 018 (bras, cote NATIF +X)
 *               -> Bone_027 -> 026 -> 025 -> 024 -> 023 (bras, cote NATIF -X)
 *          -> Bone_010 -> 009 -> 008 -> 007 -> 006 (jambe, cote NATIF -X)
 *          -> Bone_015 -> 014 -> 013 -> 012 -> 011 (jambe, cote NATIF +X)
 *
 * `facingFix` (rotation.y = π, comme TOUTES les autres unites riggees de ce
 * projet — meme pipeline d'export Meshy AI/Blender qui produit un avant
 * natif +Z) inverse le signe X final : NATIF +X devient FINAL -X et
 * inversement. Avec l'avant final -Z et le haut +Y (repere standard du
 * projet), le cote DROIT du personnage correspond a FINAL +X, donc a NATIF
 * -X — meme raisonnement DEJA CORRIGE une fois pour le Fantassin (bug
 * remonte par Antoine : "tu t'es trompé de bras", cause exactement
 * symetrique). Le bras droit (epee) est donc la chaine Bone_027, le bras
 * gauche (bouclier) la chaine Bone_022 ; la jambe droite Bone_010, la jambe
 * gauche Bone_015.
 *
 * NON VERIFIE VISUELLEMENT (aucun acces au rendu de mon cote, comme pour
 * toutes les unites riggees de ce projet) — a confirmer par Antoine ; si le
 * bras d'epee est le mauvais, c'est un changement d'UNE ligne (permuter
 * SENTINEL_RIGHT_SHOULDER_BONE/SENTINEL_LEFT_SHOULDER_BONE).
 */
const SENTINEL_RIGHT_SHOULDER_BONE = 'Bone_027';
const SENTINEL_RIGHT_UPPER_ARM_BONE = 'Bone_026';
const SENTINEL_RIGHT_ELBOW_BONE = 'Bone_025';
const SENTINEL_RIGHT_WRIST_BONE = 'Bone_024';
const SENTINEL_LEFT_SHOULDER_BONE = 'Bone_022';
// Chaine du bras GAUCHE (bouclier), symetrique de la chaine droite ci-dessus
// (meme hierarchie mesuree : Bone_022 -> 021 -> 020 -> 019 -> 018) — jusqu'ici
// seule l'epaule (022) etait animee (compensation defensive pendant le coup
// d'epee, avancee pendant la Provocation) ; le Shield Bash (2026-08-14,
// deuxieme demande d'Antoine) exploite toute la chaine.
const SENTINEL_LEFT_UPPER_ARM_BONE = 'Bone_021';
const SENTINEL_LEFT_ELBOW_BONE = 'Bone_020';
const SENTINEL_LEFT_WRIST_BONE = 'Bone_019';
const SENTINEL_HIPS_BONE = 'Bone_001';
const SENTINEL_TORSO_BONE = 'Bone_002';
// Tete (2026-08-14) : Bone_016, enfant de Bone_017 (cou, lui-meme jamais
// anime) — "la tete doit autant que possible rester orientee vers la
// cible", contre-rotation legere par rapport au torse.
const SENTINEL_HEAD_BONE = 'Bone_016';
const SENTINEL_RIGHT_THIGH_BONE = 'Bone_010';
const SENTINEL_LEFT_THIGH_BONE = 'Bone_015';

// --- Marche LOURDE (points 43-48 de la demande) --------------------------
// Meme technique que le Fantassin (balancement des deux cuisses en phase
// opposee, buildMultiBoneClip) mais : cycle plus LONG (0.8s contre 0.6s,
// coherent avec SENTINEL_MOVE_SPEED_MULTIPLIER = 0.75 — un pas plus lent
// dure logiquement plus longtemps a distance de foulee comparable) et
// amplitude REDUITE (18° contre 25°, "amplitude moderee" demandee plutot
// que le pas plus vif du Fantassin). Balancement du torse (leger, contre-
// phase) et petit retard du bras-bouclier (dephase d'un quart de cycle,
// "petite inertie") ajoutes par-dessus pour la sensation de masse. PAS de
// mouvement vertical (DOWN/UP a chaque pas, point 46) : le systeme
// d'animation procedural de ce projet (proceduralSwing.ts) n'anime QUE des
// rotations d'os, jamais des translations — omission assumee pour cette V1,
// a construire separement (extension de buildMultiBoneClip a des pistes de
// position) si le manque se voit trop a l'usage.
const WALK_AXIS = new THREE.Vector3(1, 0, 0);
const WALK_DURATION = 0.8;
const WALK_THIGH_AMPLITUDE = 18;
const walkThighKeyframes = (sign: 1 | -1): SwingKeyframe[] => [
  { time: 0, degrees: 0 },
  { time: 0.2, degrees: sign * WALK_THIGH_AMPLITUDE },
  { time: 0.4, degrees: 0 },
  { time: 0.6, degrees: -sign * WALK_THIGH_AMPLITUDE },
  { time: 0.8, degrees: 0 },
];
// Torse : leger balancement en YAW (axe Y monde), contre-phase des cuisses —
// "épaules lourdes" plutot qu'un mouvement vif.
const WALK_TORSO_AXIS = new THREE.Vector3(0, 1, 0);
const WALK_TORSO_AMPLITUDE = 4;
const WALK_TORSO_KEYFRAMES: SwingKeyframe[] = [
  { time: 0, degrees: 0 },
  { time: 0.2, degrees: -WALK_TORSO_AMPLITUDE },
  { time: 0.4, degrees: 0 },
  { time: 0.6, degrees: WALK_TORSO_AMPLITUDE },
  { time: 0.8, degrees: 0 },
];
// Bouclier (bras gauche) : petit retard (dephasage) + amplitude faible —
// "le bouclier possede un petit retard... sensation d'inertie", "reste pres
// du corps".
const WALK_SHIELD_AXIS = new THREE.Vector3(1, 0, 0);
const WALK_SHIELD_AMPLITUDE = 6;
const WALK_SHIELD_KEYFRAMES: SwingKeyframe[] = [
  { time: 0, degrees: 0 },
  { time: 0.3, degrees: -WALK_SHIELD_AMPLITUDE },
  { time: 0.5, degrees: 0 },
  { time: 0.7, degrees: WALK_SHIELD_AMPLITUDE },
  { time: 0.8, degrees: 0 },
];

// --- Deux variantes d'attaque LOURDE (2026-08-14, refonte demandee par
// Antoine : "refaire proprement son animation d'attaque") ---------------
//
// UNE SEULE attaque GAMEPLAY (voir render/unitViews.ts, playAttack) choisit
// au hasard laquelle des deux JOUER visuellement — meme cooldown, memes
// degats, aucun changement de simulation. Les deux partagent la meme
// architecture generique (ProceduralAttackAnimator, deja utilisee par le
// coup d'epee du Fantassin et concue des le depart pour "Cavalier, Mage,
// futurs mini-boss") et la meme chronologie conceptuelle en 6 temps
// (repos -> windup -> anticipation -> impact -> follow-through ->
// recuperation), juste des timings/amplitudes/bones differents.

/** Coup d'epee (main DROITE) — chronologie 1.1s (fourchette 0.9-1.2s
 *  demandee), windup 35% (0.385s), anticipation courte, slash ACCELERE
 *  (easeInCubic) puis lourd follow-through/recuperation lente — reprend et
 *  etoffe la V1 (torse/bassin/epaule/bras/coude/poignet), ajoute la tete
 *  (contre-rotation, "surveille toujours l'ennemi") et les cuisses
 *  (micro-compression/extension, point 21 : "pas de saut, pas de pas en
 *  avant gameplay"). */
const SWORD_TIMING = { windupEnd: 0.39, anticipationEnd: 0.5, impact: 0.72, followThroughEnd: 0.9, duration: 1.1 };
const SWORD_KEYFRAME_TIMES = [0, SWORD_TIMING.windupEnd, SWORD_TIMING.anticipationEnd, SWORD_TIMING.impact, SWORD_TIMING.followThroughEnd, SWORD_TIMING.duration];
// [repos->windup (lent), windup->anticipation (bref temps d'arret),
//  anticipation->impact (LE SLASH, accelere), impact->follow-through (poids
//  qui accompagne, decelere), follow-through->recuperation (lent, retour en
//  garde)] — point 17 de la demande.
const SWORD_SEGMENT_EASINGS = [easeInOutCubic, smoothstepEase, easeInCubic, easeOutCubic, smoothstepEase];

const SENTINEL_SWORD_ATTACK_CONFIG: AttackAnimationConfig = {
  keyframeTimes: SWORD_KEYFRAME_TIMES,
  segmentEasings: SWORD_SEGMENT_EASINGS,
  bones: [
    // Bassin — reste relativement stable (point 19), micro-rotation
    // seulement (parent de tout le reste, doit etre liste en premier — voir
    // proceduralAttackAnimator.ts).
    {
      boneNames: [SENTINEL_HIPS_BONE],
      axes: [{ axis: new THREE.Vector3(0, 1, 0), degreesPerKeyframe: [0, -4, -4.5, 5, 3, 0] }],
    },
    // Torse — windup legerement droite, strike vers la cible (point 18).
    {
      boneNames: [SENTINEL_TORSO_BONE],
      axes: [{ axis: new THREE.Vector3(0, 1, 0), degreesPerKeyframe: [0, 22, 25, -16, -22, 0] }],
    },
    // Tete — contre-rotation FAIBLE pour continuer a regarder la cible
    // pendant que le torse tourne (point 20), amplitude ~35% du torse.
    {
      boneNames: [SENTINEL_HEAD_BONE],
      axes: [{ axis: new THREE.Vector3(0, 1, 0), degreesPerKeyframe: [0, -8, -9, 5, 7, 0] }],
    },
    // Bouclier / bras gauche — reste defensif, petite compensation
    // seulement (point 9), jamais abandonne.
    {
      boneNames: [SENTINEL_LEFT_SHOULDER_BONE],
      axes: [{ axis: new THREE.Vector3(1, 0, 0), degreesPerKeyframe: [0, 8, 9, -6, -4, 0] }],
    },
    // Epaule droite (canal DOMINANT) — bras+epee suit comme un seul bloc
    // rigide. Ordre X-avant-Z conserve (coherent avec le Fantassin, meme
    // repere de composition) : X = haut/bas (leve au-dessus de l'epaule
    // pendant le windup), Z = plan de la frappe (haut-droite -> bas-gauche).
    {
      boneNames: [SENTINEL_RIGHT_SHOULDER_BONE],
      axes: [
        { axis: new THREE.Vector3(1, 0, 0), degreesPerKeyframe: [0, -120, -128, 55, 15, 0] },
        { axis: new THREE.Vector3(0, 0, 1), degreesPerKeyframe: [0, 22, 26, -38, -78, 0] },
      ],
    },
    // Bras (accent de poids).
    {
      boneNames: [SENTINEL_RIGHT_UPPER_ARM_BONE],
      axes: [{ axis: new THREE.Vector3(1, 0, 0), degreesPerKeyframe: [0, -16, -20, 14, 6, 0] }],
    },
    // Coude — plie pendant l'armement, se deplie pendant le coup.
    {
      boneNames: [SENTINEL_RIGHT_ELBOW_BONE],
      axes: [{ axis: new THREE.Vector3(1, 0, 0), degreesPerKeyframe: [0, -32, -38, 22, 8, 0] }],
    },
    // Poignet — correction fine uniquement, amplitude la plus faible.
    {
      boneNames: [SENTINEL_RIGHT_WRIST_BONE],
      axes: [{ axis: new THREE.Vector3(1, 0, 0), degreesPerKeyframe: [0, -10, -12, 15, 5, 0] }],
    },
    // Cuisses (point 21) — micro-flexion pendant le windup, extension tres
    // legere a l'impact ; MEME signe pour les deux jambes (compression du
    // corps, pas une foulee) — jamais un vrai deplacement, purement
    // cosmetique par-dessus la position simulee.
    {
      boneNames: [SENTINEL_RIGHT_THIGH_BONE],
      axes: [{ axis: new THREE.Vector3(1, 0, 0), degreesPerKeyframe: [0, 5, 6, -3, -1, 0] }],
    },
    {
      boneNames: [SENTINEL_LEFT_THIGH_BONE],
      axes: [{ axis: new THREE.Vector3(1, 0, 0), degreesPerKeyframe: [0, 5, 6, -3, -1, 0] }],
    },
  ],
};

/** Coup de bouclier (bras GAUCHE) — chronologie plus COURTE/PUNCHY (1.0s) :
 *  windup bref (30%), anticipation quasi nulle, poussee TRES rapide
 *  (impact a 52%, le segment anticipation->impact ne dure que 0.14s) puis
 *  follow-through/recuperation. "THUMP" lourd plutot que la grande courbe de
 *  l'epee — silhouette du bouclier gardee lisible (point 13) : UN SEUL axe
 *  domine le mouvement de l'epaule gauche (X, deja celui utilise pour
 *  "avancer le bouclier" dans le geste de Provocation existant), jamais de
 *  rotation composee qui risquerait de le montrer de profil ou de le faire
 *  traverser le corps. */
const SHIELD_TIMING = { windupEnd: 0.3, anticipationEnd: 0.38, impact: 0.52, followThroughEnd: 0.75, duration: 1.0 };
const SHIELD_KEYFRAME_TIMES = [0, SHIELD_TIMING.windupEnd, SHIELD_TIMING.anticipationEnd, SHIELD_TIMING.impact, SHIELD_TIMING.followThroughEnd, SHIELD_TIMING.duration];
const SHIELD_SEGMENT_EASINGS = [easeInOutCubic, smoothstepEase, easeInCubic, easeOutCubic, smoothstepEase];

const SENTINEL_SHIELD_ATTACK_CONFIG: AttackAnimationConfig = {
  keyframeTimes: SHIELD_KEYFRAME_TIMES,
  segmentEasings: SHIELD_SEGMENT_EASINGS,
  bones: [
    // Bassin — "tres legerement" (point 11/12).
    {
      boneNames: [SENTINEL_HIPS_BONE],
      axes: [{ axis: new THREE.Vector3(0, 1, 0), degreesPerKeyframe: [0, -3, -3, 4, 2, 0] }],
    },
    // Torse — recul/rotation droite pendant l'armement, rotation RAPIDE
    // vers l'avant/la gauche pendant la poussee (point 18, amplitude un
    // peu plus grande que l'epee : "rotation rapide").
    {
      boneNames: [SENTINEL_TORSO_BONE],
      axes: [{ axis: new THREE.Vector3(0, 1, 0), degreesPerKeyframe: [0, 18, 20, -30, -22, 0] }],
    },
    // Tete — contre-rotation, reste vers la cible.
    {
      boneNames: [SENTINEL_HEAD_BONE],
      axes: [{ axis: new THREE.Vector3(0, 1, 0), degreesPerKeyframe: [0, -6, -7, 10, 8, 0] }],
    },
    // Epaule gauche (canal DOMINANT, bouclier) — MEME axe/convention de
    // signe que le geste de Provocation existant (X, negatif = avance) :
    // "revient legerement vers le torse" au windup (positif), poussee
    // brutale vers l'avant a l'impact (grand negatif), amplitude bien plus
    // large que la Provocation (vraie frappe, pas juste "avancer le
    // bouclier").
    {
      boneNames: [SENTINEL_LEFT_SHOULDER_BONE],
      axes: [{ axis: new THREE.Vector3(1, 0, 0), degreesPerKeyframe: [0, 12, 14, -55, -38, 0] }],
    },
    // Bras (accent de poids, suit l'epaule).
    {
      boneNames: [SENTINEL_LEFT_UPPER_ARM_BONE],
      axes: [{ axis: new THREE.Vector3(1, 0, 0), degreesPerKeyframe: [0, 10, 12, -30, -18, 0] }],
    },
    // Coude — "se plie legerement si le rig le permet" pendant l'armement,
    // se deplie a la poussee.
    {
      boneNames: [SENTINEL_LEFT_ELBOW_BONE],
      axes: [{ axis: new THREE.Vector3(1, 0, 0), degreesPerKeyframe: [0, -15, -18, 12, 6, 0] }],
    },
    // Poignet — correction TRES fine uniquement (point 13 : "évite... une
    // rotation complète absurde du bras", le bouclier doit rester lisible).
    {
      boneNames: [SENTINEL_LEFT_WRIST_BONE],
      axes: [{ axis: new THREE.Vector3(1, 0, 0), degreesPerKeyframe: [0, 4, 5, -6, -3, 0] }],
    },
    // Epee / bras droit — mouvement SECONDAIRE de contrepoids uniquement
    // (point 14 : "épée = mouvement secondaire", jamais l'impression d'une
    // double attaque) : amplitude nettement plus faible que le canal
    // dominant du coup d'epee (16° max ici contre 128° la-bas).
    {
      boneNames: [SENTINEL_RIGHT_SHOULDER_BONE],
      axes: [{ axis: new THREE.Vector3(1, 0, 0), degreesPerKeyframe: [0, -4, -5, -16, -10, 0] }],
    },
    // Cuisses — micro-compression, comme le coup d'epee.
    {
      boneNames: [SENTINEL_RIGHT_THIGH_BONE],
      axes: [{ axis: new THREE.Vector3(1, 0, 0), degreesPerKeyframe: [0, 5, 6, -4, -2, 0] }],
    },
    {
      boneNames: [SENTINEL_LEFT_THIGH_BONE],
      axes: [{ axis: new THREE.Vector3(1, 0, 0), degreesPerKeyframe: [0, 5, 6, -4, -2, 0] }],
    },
  ],
};

// --- Provocation (points 56-57) -------------------------------------------
// Geste bref (0.5s, dans la fourchette 0.4-0.6s demandee) : la Sentinelle se
// redresse (torse legerement vers l'avant puis retour), le bouclier avance,
// l'epee/bras droit s'ecarte. Le GAMEPLAY (forcer les cibles + gagner le
// Shield) est deja resolu au declenchement (voir sim/systems/abilities.ts,
// tryTriggerTaunt) — ce geste est PUREMENT cosmetique, jamais attendu par la
// simulation.
const TAUNT_TIMING = { hold: 0.2, recover: 0.5 };
const TAUNT_KEYFRAME_TIMES = [0, 0.15, TAUNT_TIMING.hold, TAUNT_TIMING.recover];
const TAUNT_SEGMENT_EASINGS = [easeOutCubic, smoothstepEase, smoothstepEase];

const SENTINEL_TAUNT_CONFIG: AttackAnimationConfig = {
  keyframeTimes: TAUNT_KEYFRAME_TIMES,
  segmentEasings: TAUNT_SEGMENT_EASINGS,
  bones: [
    // Torse : leger mouvement vers l'avant ("se redresse... torse vers
    // l'avant"), axe X monde (pitch).
    {
      boneNames: [SENTINEL_TORSO_BONE],
      axes: [{ axis: new THREE.Vector3(1, 0, 0), degreesPerKeyframe: [0, -12, -10, 0] }],
    },
    // Bouclier avance legerement.
    {
      boneNames: [SENTINEL_LEFT_SHOULDER_BONE],
      axes: [{ axis: new THREE.Vector3(1, 0, 0), degreesPerKeyframe: [0, -18, -14, 0] }],
    },
    // Bras/epee droit s'ecarte.
    {
      boneNames: [SENTINEL_RIGHT_SHOULDER_BONE],
      axes: [{ axis: new THREE.Vector3(0, 0, 1), degreesPerKeyframe: [0, -26, -20, 0] }],
    },
  ],
};

/** Taille — valeur de DEPART (0.85) choisie par Claude pour que la
 *  Sentinelle se lise "beaucoup plus large/massive, mais pas deux fois plus
 *  haute" (point 41 de la demande initiale) — legerement plus grande que le
 *  Fantassin (0.805) sans exageration. +10% (2026-08-14, demande explicite
 *  d'Antoine apres premier retour visuel : "grossit egalement la
 *  Sentinelle de 10%") — relatif a cette taille de DEPART, meme convention
 *  cumulative que MAGE_MODEL_SCALE/FANTASSIN_MODEL_SCALE ailleurs dans ce
 *  projet : 0.85 * 1.1 = 0.935. */
const SENTINEL_MODEL_SCALE = 0.85 * 1.1;

let bluePrototype: RiggedPrototype | null = null;
let redPrototype: RiggedPrototype | null = null;
let loading: Promise<void> | null = null;

/** Precharge les deux variantes (bleue/rouge) une seule fois — a appeler et
 *  ATTENDRE au demarrage du jeu (voir main.ts), comme les 3 autres unites
 *  riggees. `buildSentinelModel` reste SYNCHRONE ensuite. */
export async function preloadSentinelModel(): Promise<void> {
  if (bluePrototype && redPrototype) return;
  if (!loading) {
    loading = Promise.all([loadRiggedPrototype(BLUE_MESH_URL), loadRiggedPrototype(RED_MESH_URL)]).then(([blue, red]) => {
      for (const proto of [blue, red]) {
        proto.animations.push(
          buildMultiBoneClip(
            proto.scene,
            [
              { boneName: SENTINEL_RIGHT_THIGH_BONE, axis: WALK_AXIS, keyframes: walkThighKeyframes(1) },
              { boneName: SENTINEL_LEFT_THIGH_BONE, axis: WALK_AXIS, keyframes: walkThighKeyframes(-1) },
              { boneName: SENTINEL_TORSO_BONE, axis: WALK_TORSO_AXIS, keyframes: WALK_TORSO_KEYFRAMES },
              { boneName: SENTINEL_LEFT_SHOULDER_BONE, axis: WALK_SHIELD_AXIS, keyframes: WALK_SHIELD_KEYFRAMES },
            ],
            'Walking',
            WALK_DURATION,
          ),
        );
      }
      bluePrototype = blue;
      redPrototype = red;
    });
  }
  await loading;
}

/**
 * Clone une instance de la Sentinelle riggee — memes techniques que les 3
 * autres unites riggees (SkeletonUtils.clone obligatoire, materiau clone par
 * instance, metalness force a 0 / emissive baked-in desactivee — meme
 * "piege quasiment noir" deja rencontre a chaque modele Meshy AI de ce
 * projet). PAS de teinte appliquee ici (comme l'Archer/le Fantassin V3) :
 * chaque camp a deja SA PROPRE texture coloree dans son export (textures
 * NON verifiables par mon inspection headless — Node ne decode aucune image,
 * meme limite deja documentee pour toutes les autres unites riggees — mais
 * bien REFERENCEES dans le fichier, donc attendues fonctionnelles dans un
 * vrai navigateur).
 *
 * TROIS `ProceduralAttackAnimator` INDEPENDANTS par instance : coup d'epee,
 * coup de bouclier (2026-08-14, deux variantes de l'attaque normale — voir
 * render/unitViews.ts, playAttack : choix aleatoire d'UNE SEULE des deux a
 * chaque attaque, jamais les deux ensemble) et Provocation. Priorite geree
 * par UnitViews (playTaunt interrompt une attaque en cours, une attaque ne
 * demarre jamais par-dessus une Provocation deja en jeu, "Death >
 * Provocation > Attack > Walk > Idle" point 57 de la demande d'origine).
 */
export function buildSentinelModel(team: Team): THREE.Group {
  const prototype = team === 'player' ? bluePrototype : redPrototype;
  if (!prototype) {
    throw new Error('Sentinel model not preloaded — call preloadSentinelModel() before spawning a Sentinel.');
  }

  const group = cloneSkinned(prototype.scene) as THREE.Group;

  group.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;

    const material = (mesh.material as THREE.MeshStandardMaterial).clone();
    material.metalness = 0;
    material.emissive.setRGB(0, 0, 0);
    material.emissiveMap = null;
    material.emissiveIntensity = 0;

    mesh.material = material;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
  });

  // Correction d'orientation (meme hypothese que les 3 autres unites riggees
  // de ce projet, meme pipeline d'export) — NON VERIFIEE visuellement,
  // appliquee par prudence sur un groupe ENFANT (jamais la racine, ecrasee
  // chaque frame par UnitViews.sync).
  const facingFix = new THREE.Group();
  facingFix.rotation.y = Math.PI;
  facingFix.add(group);

  const root = new THREE.Group();
  root.add(facingFix);
  root.scale.setScalar(SENTINEL_MODEL_SCALE);

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

  // Construits sur `group` (le clone), APRES qu'il ait ete attache a
  // facingFix/root : les quaternions MONDE de repos captures a la
  // construction incluent donc la correction d'orientation.
  // Deux variantes d'attaque (2026-08-14) — voir render/unitViews.ts,
  // playAttack : choisit UNE SEULE des deux au hasard a chaque attaque,
  // jamais les deux (une seule attaque GAMEPLAY, un seul geste visuel).
  root.userData['proceduralAttackVariants'] = {
    sword: new ProceduralAttackAnimator(group, SENTINEL_SWORD_ATTACK_CONFIG),
    shield: new ProceduralAttackAnimator(group, SENTINEL_SHIELD_ATTACK_CONFIG),
  };
  root.userData['proceduralTaunt'] = new ProceduralAttackAnimator(group, SENTINEL_TAUNT_CONFIG);

  return root;
}
