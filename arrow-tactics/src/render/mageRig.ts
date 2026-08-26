import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { COLORS } from '../config/constants';
import { loadRiggedPrototype, type RiggedActions, type RiggedPrototype } from './riggedGltf';
import type { Team } from '../sim/entity';

const MODEL_PATH = '/models/mage/mage_biped.glb';

/** Reduction de taille (2026-08-11, retour d'Antoine apres premier test : "un
 *  petit peu grand, il faudrait le reduire de 20%") — applique directement
 *  sur le groupe RACINE (contrairement a la correction d'orientation
 *  ci-dessous) : `scale`, contrairement a `rotation.y`, n'est jamais touche
 *  par UnitViews.sync a chaque frame, meme convention que CAVALIER_SCALE
 *  (unitMesh.ts). Deuxieme reduction le meme jour (0.8 -> 0.72, -10%
 *  supplementaires) — demande d'Antoine dans le meme message que les
 *  reductions du Fantassin/Archer ("le mage de 10%"), comprise comme un
 *  nouveau -10% relatif a la taille ACTUELLE (deja reduite), pas -10% sur
 *  la taille d'origine. Troisieme ajustement le meme jour, Antoine revenu
 *  sur ses reductions ("augmente finalement... le mage de 5%") — meme
 *  logique cumulative, +5% relatif a 0.72 (0.72 * 1.05 = 0.756). */
const MAGE_MODEL_SCALE = 0.8 * 0.9 * 1.05;

let prototype: RiggedPrototype | null = null;
let loading: Promise<RiggedPrototype> | null = null;

/**
 * Precharge le modele une seule fois (2026-08-11, modele fourni par Antoine :
 * Meshy AI "Emberhood Mage", squelette riggé + 5 animations baked dans un
 * seul .glb — `mage_soell_cast_4`, litteralement la "magespell 4" demandee,
 * sert a l'incantation de la Boule de feu). A appeler et ATTENDRE au
 * demarrage du jeu (voir main.ts, meme motif que `createBoard` pour les
 * rochers/arbres) : `buildMageModel` doit rester SYNCHRONE ensuite, comme
 * `buildUnit` pour toutes les autres unites (l'aperçu de placement et
 * l'editeur de maps appellent `buildUnit` de façon synchrone, sans savoir
 * qu'un Mage existe derriere).
 */
export async function preloadMageModel(): Promise<void> {
  if (prototype) return;
  if (!loading) {
    loading = loadRiggedPrototype(MODEL_PATH).then((loaded) => {
      prototype = loaded;
      return prototype;
    });
  }
  await loading;
}

/**
 * Clone une instance du Mage riggé — premiere unite du jeu a utiliser un vrai
 * squelette anime (AnimationMixer/AnimationClip) plutot que des rotations de
 * boites procedurales. Voir render/unitViews.ts, `tickRiggedAnimation` pour
 * le pilotage des clips depuis l'etat de simulation (marche/attaque/
 * incantation), et `playAttack` pour le declenchement du clip d'attaque.
 *
 * `SkeletonUtils.clone` est OBLIGATOIRE ici (pas `Object3D.clone()`) : un
 * clone naif d'un SkinnedMesh ne relie pas les os du squelette a la copie —
 * un `AnimationMixer` construit sur un clone naif animerait le squelette de
 * l'ORIGINAL (partage entre toutes les instances), jamais celui de la copie.
 * Piege classique documente de Three.js avec les meshes skinnés.
 */
export function buildMageModel(team: Team): THREE.Group {
  if (!prototype) {
    throw new Error('Mage model not preloaded — call preloadMageModel() before spawning a Mage.');
  }

  const group = cloneSkinned(prototype.scene) as THREE.Group;
  // Eclairci (2026-08-11, retour d'Antoine, deuxieme passage : "encore trop
  // sombre" apres un premier +15%) — SCOPE au Mage uniquement (melange
  // applique ici, pas sur COLORS.playerBody/enemyBody eux-memes) : les
  // autres unites en boites utilisent ces memes teintes directement, les
  // eclaircir globalement les aurait changees aussi, jamais demande.
  // `material.color` est un MULTIPLICATEUR sur la texture du modele : un
  // simple melange vers le blanc a une limite dure (a 100% blanc, la
  // texture passe telle quelle, sans jamais depasser sa propre luminosite —
  // si la texture source est sombre, aucun tint ne peut la rendre plus
  // claire que ca). Melange pousse plus fort (0.45, contre 0.15 avant) PLUS
  // un leger depassement au-dela de blanc pur (`multiplyScalar(1.15)`,
  // technique HDR standard : des canaux de couleur > 1 restent valides en
  // Three.js) pour depasser ce plafond si la texture elle-meme est sombre.
  const tint = new THREE.Color(team === 'player' ? COLORS.playerBody : COLORS.enemyBody)
    .lerp(new THREE.Color(0xffffff), 0.45)
    .multiplyScalar(1.15);

  group.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;

    // Materiau CLONE par instance (jamais partage) : setOpacity/setEmissive
    // (fondu de mort, flash d'impact — deja generiques pour toute unite via
    // userData.materials, voir UnitViews.createView) mutent directement le
    // materiau. Un cache partage ferait flasher/fondre TOUS les Mages a la
    // fois — meme bug deja corrige une fois pour les unites en boites
    // (2026-08-09, voir CLAUDE.md "Bug de materiaux partages entre unites").
    const material = (mesh.material as THREE.MeshStandardMaterial).clone();
    material.color = tint.clone();

    // Correctif "modele quasiment noir" (2026-08-11, retour d'Antoine apres
    // premier test). Cause : le materiau source ne precise pas de
    // `metallicFactor` dans le .glb (voir KHR_materials_specular sur ce
    // materiau) — la valeur PAR DEFAUT du format glTF est 1 (entierement
    // metallique). Un materiau metallique n'a presque aucune reponse
    // diffuse ; sans carte d'environnement (le jeu n'en a pas, voir
    // render/renderer.ts), seule la reflexion speculaire des lumieres
    // directionnelles reste — beaucoup trop faible pour se voir, d'ou un
    // rendu quasi noir. Force a 0 (reponse purement diffuse), coherent avec
    // le reste de la DA du jeu (materiaux Lambert, jamais metalliques).
    material.metalness = 0;

    // Le modele porte une lueur emissive baked-in (emissiveFactor + texture,
    // vraisemblablement des braises/yeux "Emberhood") — desactivee ici plutot
    // que preservee : `UnitViews.setEmissive` (flash d'impact, generique a
    // toute unite) suppose que `emissive = 0` est l'etat de REPOS neutre, et
    // y ecrit un blanc scalaire pendant le flash puis remet 0 a la fin. Sans
    // cette desactivation, la toute PREMIERE fois qu'un Mage encaisse un
    // coup effacerait definitivement sa lueur d'origine (setEmissive(0) la
    // remplacerait par du noir, sans jamais la restaurer). Pas d'acces visuel
    // de mon cote pour juger si cette lueur valait la peine d'etre gardee —
    // a rouvrir plus tard si Antoine la veut (demanderait de generaliser
    // setEmissive pour mixer vers une couleur de base au lieu de 0).
    material.emissive.setRGB(0, 0, 0);
    material.emissiveMap = null;
    material.emissiveIntensity = 0;

    mesh.material = material;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
  });

  const mixer = new THREE.AnimationMixer(group);
  const findClip = (name: string): THREE.AnimationAction => {
    const clip = prototype!.animations.find((c) => c.name === name);
    if (!clip) throw new Error(`clip d'animation introuvable dans mage_biped.glb: ${name}`);
    return mixer.clipAction(clip);
  };

  const walk = findClip('Walking');
  const attack = findClip('Attack');
  const cast = findClip('mage_soell_cast_4');

  // Attaque et incantation : jouees UNE FOIS jusqu'a completion puis figees
  // sur la derniere pose (clampWhenFinished) — c'est tickRiggedAnimation qui
  // decide quand y succeder (marche/repos). Marche : boucle tant que
  // l'unite avance, seule exception.
  for (const action of [attack, cast]) {
    action.setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = true;
  }
  walk.setLoop(THREE.LoopRepeat, Infinity);

  const actions: RiggedActions = { walk, attack, cast };

  // Correction d'orientation (2026-08-11, retour d'Antoine apres premier
  // test : "il tourne le dos a la bataille quand il se bat") — le modele
  // source regarde dans le sens OPPOSE a la convention du projet (unite
  // locale -Z = avant, voir CLAUDE.md/ballista.ts). Appliquee sur un groupe
  // ENFANT du groupe racine, jamais sur la racine elle-meme : UnitViews.sync
  // ecrase `view.rotation.y` (facing) a CHAQUE frame, un rotation.y pose
  // directement sur la racine serait donc silencieusement perdu au premier
  // tick — meme piege deja documente pour le Cavalier (voir buildCavalier,
  // `body`/`g` dans unitMesh.ts).
  const facingFix = new THREE.Group();
  facingFix.rotation.y = Math.PI;
  facingFix.add(group);

  const root = new THREE.Group();
  root.add(facingFix);
  // Reduction de taille : voir MAGE_MODEL_SCALE. Sur la racine directement
  // (contrairement a la rotation ci-dessus) : `scale` n'est jamais touche
  // par UnitViews.sync, aucun risque d'ecrasement.
  root.scale.setScalar(MAGE_MODEL_SCALE);

  root.userData['riggedMixer'] = mixer;
  root.userData['riggedActions'] = actions;
  return root;
}
