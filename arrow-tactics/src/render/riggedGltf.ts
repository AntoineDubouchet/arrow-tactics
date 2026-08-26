import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export interface RiggedPrototype {
  scene: THREE.Object3D;
  animations: THREE.AnimationClip[];
}

/** Actions d'un AnimationMixer par nom d'etat logique (ex. Mage :
 *  {walk, attack, cast} ; Fantassin : {walk, attack, knockdown}) — chaque
 *  unite riggee construit sa propre forme, consommee generiquement par
 *  UnitViews.tickRiggedAnimation (qui ne suppose que 'walk'/'attack'
 *  toujours presents, le reste optionnel). */
export type RiggedActions = Record<string, THREE.AnimationAction>;

export interface RiggedAnimationSource {
  /** Nom sous lequel retrouver ce clip ensuite (voir buildRiggedActions) —
   *  remplace le nom auto-genere par Meshy/Blender (souvent illisible, ex.
   *  "Armature|walking_man|baselayer"). */
  name: string;
  url: string;
}

/**
 * Charge un mesh riggé et y fusionne des clips d'animation venant de
 * fichiers .glb SEPARES (meme squelette, memes noms d'os — export Meshy AI
 * un fichier par animation, contrairement au Mage dont les 5 clips etaient
 * deja dans un seul .glb fusionne). Fonctionne parce que Three.js relie les
 * pistes d'un AnimationClip par NOM DE NOEUD, pas par identite d'objet : un
 * clip charge depuis un AUTRE fichier s'applique donc correctement au mesh
 * principal tant que la hierarchie de noeuds (squelette) est identique —
 * verifie en headless avant integration (voir CLAUDE.md, chantier Fantassin
 * riggé), pas besoin de fusionner les fichiers eux-memes au prealable.
 */
export async function loadRiggedPrototype(
  meshUrl: string,
  animationSources: RiggedAnimationSource[] = [],
): Promise<RiggedPrototype> {
  const loader = new GLTFLoader();
  const meshGltf = await loader.loadAsync(meshUrl);
  const animations = [...meshGltf.animations];

  for (const source of animationSources) {
    const animGltf = await loader.loadAsync(source.url);
    const clip = animGltf.animations[0];
    if (!clip) throw new Error(`aucun clip d'animation trouve dans ${source.url}`);
    clip.name = source.name;
    animations.push(clip);
  }

  return { scene: meshGltf.scene, animations };
}
