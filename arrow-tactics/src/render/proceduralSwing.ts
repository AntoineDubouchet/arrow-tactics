import * as THREE from 'three';

/**
 * Anime des os (rotation) en exprimant chaque image-cle comme un angle
 * MONDE relatif a la pose de repos, plutot que des quaternions locaux bruts
 * — plus facile a raisonner sans acces visuel (voir fantassinRig.ts/
 * archerRig.ts pour l'usage : coup d'epee et marche du Fantassin, tir a
 * l'arc de l'Archer). Necessaire quand un modele riggé n'a AUCUNE animation
 * source fournie (voir CLAUDE.md, 2026-08-11) — construit les
 * AnimationClip nous-memes plutot que d'en charger un.
 *
 * Technique (verifiee headless, script jetable, contre un VRAI
 * THREE.AnimationMixer avant integration) : pour chaque image-cle, on
 * calcule le quaternion MONDE desire (`delta * restWorld`, "applique le
 * delta PAR-DESSUS la pose de repos"), puis on le reconvertit en quaternion
 * LOCAL via le quaternion MONDE du parent (`inverse(parentWorld) * desiredWorld`)
 * — c'est ce qui garantit une rotation qui a un sens dans l'espace du monde
 * (ex. "leve le bras vers le haut") independamment de l'orientation propre
 * de l'os dans le squelette source, plutot qu'un `bone.quaternion` pre-
 * multiplie naif qui melangerait les deux espaces.
 *
 * Limite assumee : suppose que chaque os anime et son PARENT restent a leur
 * pose de repos au moment de l'appel (aucune autre piste ne les anime deja)
 * — vrai pour tous les cas actuels (les os animes ensemble, ex. les deux
 * hanches de la marche, n'ont jamais de relation parent/enfant entre eux).
 */
export interface SwingKeyframe {
  /** Secondes depuis le debut du clip. */
  time: number;
  /** Angle de rotation MONDE relatif au repos, autour de `axis`. */
  degrees: number;
}

export interface BoneSwingSpec {
  boneName: string;
  axis: THREE.Vector3;
  keyframes: SwingKeyframe[];
}

function buildBoneTrack(scene: THREE.Object3D, spec: BoneSwingSpec): THREE.QuaternionKeyframeTrack {
  const bone = scene.getObjectByName(spec.boneName) as THREE.Bone | undefined;
  if (!bone || !bone.parent) {
    throw new Error(`Os introuvable ou sans parent pour l'animation procedurale : ${spec.boneName}`);
  }

  const restWorldQuat = new THREE.Quaternion();
  bone.getWorldQuaternion(restWorldQuat);
  const parentWorldQuatInverse = new THREE.Quaternion();
  bone.parent.getWorldQuaternion(parentWorldQuatInverse);
  parentWorldQuatInverse.invert();

  const times: number[] = [];
  const values: number[] = [];
  for (const kf of spec.keyframes) {
    const delta = new THREE.Quaternion().setFromAxisAngle(spec.axis, THREE.MathUtils.degToRad(kf.degrees));
    const desiredWorld = delta.multiply(restWorldQuat);
    const localQuat = parentWorldQuatInverse.clone().multiply(desiredWorld);
    times.push(kf.time);
    values.push(localQuat.x, localQuat.y, localQuat.z, localQuat.w);
  }

  return new THREE.QuaternionKeyframeTrack(`${spec.boneName}.quaternion`, times, values);
}

/** Un seul os anime (coup d'epee, tir a l'arc) — voir fantassinRig.ts/archerRig.ts. */
export function buildSingleBoneSwingClip(
  scene: THREE.Object3D,
  boneName: string,
  axis: THREE.Vector3,
  keyframes: SwingKeyframe[],
  clipName: string,
): THREE.AnimationClip {
  scene.updateMatrixWorld(true);
  const track = buildBoneTrack(scene, { boneName, axis, keyframes });
  const duration = keyframes[keyframes.length - 1]!.time;
  return new THREE.AnimationClip(clipName, duration, [track]);
}

/** Plusieurs os animes ENSEMBLE dans un seul clip (ex. les deux hanches
 *  d'un cycle de marche, en phase opposee) — voir fantassinRig.ts. */
export function buildMultiBoneClip(
  scene: THREE.Object3D,
  bones: BoneSwingSpec[],
  clipName: string,
  duration: number,
): THREE.AnimationClip {
  scene.updateMatrixWorld(true);
  const tracks = bones.map((spec) => buildBoneTrack(scene, spec));
  return new THREE.AnimationClip(clipName, duration, tracks);
}
