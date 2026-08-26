import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { loadRiggedPrototype, type RiggedActions, type RiggedPrototype } from './riggedGltf';
import { buildSingleBoneSwingClip, type SwingKeyframe } from './proceduralSwing';
import type { Team } from '../sim/entity';

/**
 * Tir a l'arc procedural (2026-08-12, demande d'Antoine : "tu penses pouvoir
 * faire un truc pour les animations d'attaque... les modeles sont rigés, tu
 * peux prendre la main a partir de ça") — remplace le clip "Archery_Shot"
 * retire la veille ("c'est horrible"). Meme technique que le Fantassin (voir
 * proceduralSwing.ts), sur "RightShoulder" (squelette Mixamo, noms lisibles
 * — voir CLAUDE.md pour le detail de visee mesure sur cette meme unite) :
 * rotation MONDE autour de l'axe Y (un pivot horizontal, pas vertical comme
 * le coup d'epee) — calibree par script hors-navigateur (VRAI
 * AnimationMixer) pour tirer la main d'archer VERS L'ARRIERE (encoche/
 * tension) puis la relacher VERS L'AVANT (relachement), a hauteur constante
 * — la encoche/tension d'un tir a l'arc reel ne varie quasiment pas en
 * hauteur, contrairement a un coup d'epee.
 */
const ARCHER_RIGHT_SHOULDER_BONE = 'RightShoulder';
const BOW_DRAW_AXIS = new THREE.Vector3(0, 1, 0);
const BOW_DRAW_KEYFRAMES: SwingKeyframe[] = [
  { time: 0, degrees: 0 }, // repos
  { time: 0.18, degrees: 55 }, // tension : main tiree vers l'arriere
  { time: 0.32, degrees: -35 }, // relachement : main projetee vers l'avant
  { time: 0.45, degrees: 0 }, // retour au repos
];

/** Taille (2026-08-11) : d'abord reduite de 30% ("rends les fantassins et
 *  les archers 30% plus petits d'aspect visuel", 0.7), puis Antoine est
 *  revenu dessus le meme jour ("augmente finalement la taille... de 20%
 *  pour l'archer") — compris comme +20% relatif a cette taille DEJA
 *  reduite (0.7 * 1.20 = 0.84), pas +20% sur la taille d'origine (meme
 *  logique cumulative que MAGE_MODEL_SCALE, mageRig.ts). Applique sur la
 *  racine directement (jamais touche par UnitViews.sync). */
const ARCHER_MODEL_SCALE = 0.7 * 1.2;

// Deux exports COMPLETS et INDEPENDANTS (mesh + toutes ses animations),
// un par camp — contrairement au Fantassin/Mage (un seul mesh neutre teint
// par code), Antoine a fourni ici deux modeles DEJA teints chacun de son
// cote (bleu et rouge), voir buildArcherModel. Chaque camp garde son PROPRE
// jeu d'animations plutot que de partager celui de l'autre camp : rien ne
// garantit que les deux exports Meshy partagent exactement le meme
// squelette au pixel pres, plus sur de ne jamais melanger.
const BLUE_MESH_URL = '/models/archer/archer_blue_base.glb';
const BLUE_WALK_URL = '/models/archer/archer_blue_walk.glb';
const BLUE_DEATH_BACK_URL = '/models/archer/archer_blue_death.glb';
const BLUE_DEATH_FORWARD_URL = '/models/archer/archer_blue_death_forward.glb';
const BLUE_DEATH_SLOW_URL = '/models/archer/archer_blue_death_slow.glb';

const RED_MESH_URL = '/models/archer/archer_red_base.glb';
const RED_WALK_URL = '/models/archer/archer_red_walk.glb';
const RED_DEATH_BACK_URL = '/models/archer/archer_red_death.glb';
const RED_DEATH_FORWARD_URL = '/models/archer/archer_red_death_forward.glb';
const RED_DEATH_SLOW_URL = '/models/archer/archer_red_death_slow.glb';

let bluePrototype: RiggedPrototype | null = null;
let redPrototype: RiggedPrototype | null = null;
let loading: Promise<void> | null = null;

/**
 * Precharge les DEUX variantes (bleue/rouge) une seule fois (2026-08-11,
 * troisieme unite du jeu a sortir des boites procedurales apres le Mage et
 * le Fantassin — modele fourni par Antoine, Meshy AI "Azure Sentinel
 * Archer", deja teint des deux cotes).
 *
 * Choix d'animations :
 *  - Attaque -> clip PROCEDURAL "tension puis relachement" (voir
 *    BOW_DRAW_KEYFRAMES plus haut, 2026-08-12) — remplace "Archery_Shot"
 *    (retire le 2026-08-11, "c'est horrible, on va la faire nous-meme" ;
 *    Antoine a ensuite demande le lendemain d'essayer une version
 *    procedurale plutot que d'attendre son propre clip).
 *  - Marche -> "Walking" (verifiee sans root motion, meme choix que le
 *    Fantassin apres son incident "rollback").
 *  - Mort -> TROIS variantes fournies par Antoine ("tir et chute lente en
 *    arrière", "tir et tomber en avant", "tirer et reculer" — mappees
 *    respectivement sur Shot_and_Slow_Fall_Backward, Shot_and_Fall_Forward,
 *    Shot_and_Fall_Backward), choisie AU HASARD a chaque mort (voir
 *    UnitViews.sync, cle generique `knockdown*`) pour varier la lecture des
 *    chutes plutot qu'une seule pose repetee. Conservees telles quelles :
 *    Antoine n'a rien dit de mal des morts, seulement de l'attaque.
 *
 * A appeler et ATTENDRE au demarrage du jeu (voir main.ts) : `buildArcherModel`
 * doit rester SYNCHRONE ensuite, comme toutes les autres unites.
 */
export async function preloadArcherModel(): Promise<void> {
  if (bluePrototype && redPrototype) return;
  if (!loading) {
    loading = Promise.all([
      loadRiggedPrototype(BLUE_MESH_URL, [
        { name: 'Walking', url: BLUE_WALK_URL },
        { name: 'DeathBack', url: BLUE_DEATH_BACK_URL },
        { name: 'DeathForward', url: BLUE_DEATH_FORWARD_URL },
        { name: 'DeathSlow', url: BLUE_DEATH_SLOW_URL },
      ]),
      loadRiggedPrototype(RED_MESH_URL, [
        { name: 'Walking', url: RED_WALK_URL },
        { name: 'DeathBack', url: RED_DEATH_BACK_URL },
        { name: 'DeathForward', url: RED_DEATH_FORWARD_URL },
        { name: 'DeathSlow', url: RED_DEATH_SLOW_URL },
      ]),
    ]).then(([blue, red]) => {
      for (const proto of [blue, red]) {
        proto.animations.push(
          buildSingleBoneSwingClip(proto.scene, ARCHER_RIGHT_SHOULDER_BONE, BOW_DRAW_AXIS, BOW_DRAW_KEYFRAMES, 'Attack'),
        );
      }
      bluePrototype = blue;
      redPrototype = red;
    });
  }
  await loading;
}

/**
 * Clone une instance de l'Archer riggé — memes techniques que le Mage/le
 * Fantassin (SkeletonUtils.clone obligatoire, materiau clone par instance).
 * PAS de teinte appliquee ici (contrairement aux deux autres) : chaque camp
 * a deja SA PROPRE texture correctement coloree dans son export.
 *
 * L'attaque est le clip procedural construit dans preloadArcherModel.
 */
export function buildArcherModel(team: Team): THREE.Group {
  const prototype = team === 'player' ? bluePrototype : redPrototype;
  if (!prototype) {
    throw new Error('Archer model not preloaded — call preloadArcherModel() before spawning an Archer.');
  }

  const group = cloneSkinned(prototype.scene) as THREE.Group;

  group.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;

    // Materiau CLONE par instance (jamais partage) — meme raison que le
    // Mage/le Fantassin : setOpacity/setEmissive (fondu de mort, flash
    // d'impact) mutent directement le materiau.
    const material = (mesh.material as THREE.MeshStandardMaterial).clone();

    // Meme correctif "quasiment noir" que le Mage/le Fantassin (voir leurs
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

  const mixer = new THREE.AnimationMixer(group);
  const findClip = (name: string): THREE.AnimationAction => {
    const clip = prototype.animations.find((c) => c.name === name);
    if (!clip) throw new Error(`clip d'animation introuvable pour l'Archer: ${name}`);
    return mixer.clipAction(clip);
  };

  const walk = findClip('Walking');
  const attack = findClip('Attack');
  const deathBack = findClip('DeathBack');
  const deathForward = findClip('DeathForward');
  const deathSlow = findClip('DeathSlow');

  // Attaque et morts : jouees UNE FOIS jusqu'a completion puis figees sur la
  // derniere pose (clampWhenFinished) — voir tickRiggedAnimation pour
  // l'attaque, UnitViews.sync (branche mort) pour la chute. Marche : boucle
  // tant que l'unite avance, seule exception.
  for (const action of [attack, deathBack, deathForward, deathSlow]) {
    action.setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = true;
  }
  walk.setLoop(THREE.LoopRepeat, Infinity);

  // Cles 'knockdown*' (prefixe commun, pas juste 'knockdown') : UnitViews.sync
  // choisit AU HASARD parmi toutes les actions dont la cle commence par
  // "knockdown" au moment de la mort — generalisation du mecanisme deja
  // utilise par le Fantassin (une seule variante) pour varier les chutes
  // (demande d'Antoine, 3 clips fournis expres pour ca).
  const actions: RiggedActions = {
    walk,
    attack,
    knockdownBack: deathBack,
    knockdownForward: deathForward,
    knockdownSlow: deathSlow,
  };

  // Correction d'orientation (2026-08-11) — meme hypothese que pour le
  // Mage/le Fantassin (meme pipeline d'export Meshy AI + Blender qui avait
  // produit un modele "tournant le dos" pour les deux) : NON VERIFIEE
  // visuellement de mon cote, appliquee par prudence sur un groupe ENFANT
  // du groupe racine (jamais la racine elle-meme, ecrasee chaque frame par
  // UnitViews.sync) — a retirer d'une ligne si besoin.
  const facingFix = new THREE.Group();
  facingFix.rotation.y = Math.PI;
  facingFix.add(group);

  const root = new THREE.Group();
  root.add(facingFix);
  root.scale.setScalar(ARCHER_MODEL_SCALE);

  root.userData['riggedMixer'] = mixer;
  root.userData['riggedActions'] = actions;

  return root;
}
