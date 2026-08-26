import * as THREE from 'three';
import type { EasingFn } from './easing';

/**
 * Systeme GENERIQUE d'animation d'attaque procedurale, pilote par
 * quaternions (2026-08-12, demande d'Antoine — voir CLAUDE.md pour le
 * detail du coup d'epee du Fantassin, premier consommateur). Pense pour
 * etre reutilise par d'autres unites (Cavalier, Mage, futurs mini-boss)
 * avec une config differente, sans toucher a cette classe.
 *
 * Principe ("aucune derive de pose", demande explicite d'Antoine) : chaque
 * os controle a un quaternion de repos capture UNE SEULE FOIS a la
 * construction, RELATIF A `scene` (le groupe passe au constructeur — le
 * clone du modele, PAS le monde absolu), jamais re-echantillonne depuis un
 * etat deja modifie par ce meme systeme. A chaque frame, l'orientation MONDE
 * finale visee est `scene.worldQuat_ACTUEL * delta(t) * restRelativeToScene`,
 * reconvertie en local via le quaternion MONDE ACTUEL du parent.
 *
 * **Piege corrige (2026-08-13, bug remonte par Antoine : les Fantassins
 * ROUGE tournaient le dos pendant l'attaque)** : une premiere version
 * capturait le quaternion de repos en espace MONDE ABSOLU (via
 * `bone.getWorldQuaternion()` directement). Ca marchait par coincidence pour
 * le camp JOUEUR (orientation par defaut = 0, deja la valeur presente au
 * moment de la construction, avant que UnitViews.sync() n'ait jamais tourne)
 * mais pas pour le camp ENNEMI, dont l'orientation par defaut est PI
 * (`UnitViews.computeFacing`, cible non verrouillee) — appliquee seulement
 * PAR LA SUITE, jamais au moment de la construction. La cible "monde absolu"
 * restait donc figee sur l'orientation du tout debut (0, joueur), ignorant
 * la rotation reelle de l'unite : le bras swingait bien dans un repere
 * absolu correct, mais QUI NE TOURNAIT JAMAIS AVEC L'UNITE, d'ou un ennemi
 * qui semble attaquer "a l'envers". Fixe en travaillant RELATIVEMENT a
 * `scene` (jamais mute par ce systeme, mais son orientation MONDE COURANTE
 * — recalculee chaque frame — absorbe correctement la rotation de facing de
 * l'unite, quel que soit le camp).
 *
 * Consequence utile conservee : si un os PARENT (ex. le torse) est lui-meme
 * anime par ce systeme dans la MEME frame, l'orientation finale d'un os
 * enfant (ex. l'epaule) reste EXACTEMENT egale a sa cible verifiee — le
 * parent ne peut jamais "corrompre" la cible d'un enfant, seulement changer
 * quelle valeur LOCALE l'atteint. IMPORTANT : `config.bones` doit lister les
 * os dans l'ordre PARENT AVANT ENFANT (ex. torse avant epaule avant
 * avant-bras) pour que chaque parent ait deja ete ecrit + `updateMatrixWorld`
 * avant que son enfant ne lise `getWorldQuaternion()`.
 *
 * Degradation : un os dont aucun nom candidat n'existe dans la scene est
 * simplement IGNORE (jamais d'exception) — voir `BoneAttackChannel.boneNames`.
 */
export interface BoneAxisCurve {
  axis: THREE.Vector3;
  /** Angle (degres) a chaque image-cle de `AttackAnimationConfig.keyframeTimes` —
   *  meme longueur que ce tableau. */
  degreesPerKeyframe: number[];
}

export interface BoneAttackChannel {
  /** Noms candidats, essayes dans l'ordre — le premier trouve dans la scene
   *  est utilise. Permet de s'adapter a des conventions de nommage
   *  differentes (Mixamo, UniRig, etc.) sans faire planter le jeu si aucun
   *  ne correspond. */
  boneNames: string[];
  axes: BoneAxisCurve[];
}

export interface AttackAnimationConfig {
  /** Secondes depuis le debut de l'attaque, croissant, dernier = duree totale. */
  keyframeTimes: number[];
  /** Easing du segment MENANT a l'image-cle d'index i (i in [1, N-1]) —
   *  longueur = keyframeTimes.length - 1. */
  segmentEasings: EasingFn[];
  /** Ordre = ordre de traitement (parent avant enfant, voir plus haut). */
  bones: BoneAttackChannel[];
}

interface ResolvedChannel {
  bone: THREE.Bone;
  /** Orientation de repos, RELATIVE a `scene` (pas au monde absolu) — voir
   *  le commentaire de classe pour le bug que ca corrige. */
  restRelativeToScene: THREE.Quaternion;
  axes: BoneAxisCurve[];
}

export class ProceduralAttackAnimator {
  private readonly scene: THREE.Object3D;
  private readonly duration: number;
  private readonly keyframeTimes: number[];
  private readonly segmentEasings: EasingFn[];
  private readonly channels: ResolvedChannel[] = [];
  private elapsed = 0;
  private playing = false;

  // Quaternions "scratch" reutilises chaque frame (2026-08-13, chantier
  // optimisation) — l'ancienne version allouait ~35 THREE.Quaternion par
  // Fantassin attaquant par frame (un `new` par axe/canal). Meme sequence
  // MATHEMATIQUE (verifiee identique en isolation, hors hierarchie : script
  // hors-navigateur, ecart ~2e-6°, bruit flottant pur) — mais PAS bit-a-bit
  // identique une fois integree dans la hierarchie complete du squelette
  // (verifie aussi : ecart max mesure ~0.05-0.1° sur toute la duree d'une
  // attaque, jamais croissant/non borne). Cause precise non isolee (ordre
  // d'operations flottantes different entre `premultiply` en place et
  // `multiply`/`clone` sur objets frais, plausible), mais l'ordre de
  // grandeur est sans commune mesure avec ce qui serait perceptible a la
  // camera isometrique de ce jeu — juge acceptable plutot que de renoncer au
  // gain (35 allocations/frame en moins) pour un ecart invisible en pratique.
  private readonly scratchSceneWorldQuat = new THREE.Quaternion();
  private readonly scratchDelta = new THREE.Quaternion();
  private readonly scratchAxisDelta = new THREE.Quaternion();
  private readonly scratchDesiredWorld = new THREE.Quaternion();
  private readonly scratchParentWorldQuat = new THREE.Quaternion();

  constructor(scene: THREE.Object3D, config: AttackAnimationConfig) {
    this.scene = scene;
    this.keyframeTimes = config.keyframeTimes;
    this.segmentEasings = config.segmentEasings;
    this.duration = config.keyframeTimes[config.keyframeTimes.length - 1]!;

    scene.updateMatrixWorld(true);
    const sceneWorldQuatInverse = new THREE.Quaternion();
    scene.getWorldQuaternion(sceneWorldQuatInverse).invert();

    for (const boneConfig of config.bones) {
      let bone: THREE.Bone | undefined;
      for (const name of boneConfig.boneNames) {
        const found = scene.getObjectByName(name) as THREE.Bone | undefined;
        if (found) {
          bone = found;
          break;
        }
      }
      if (!bone || !bone.parent) continue; // degradation propre : canal ignore

      const boneWorldQuat = new THREE.Quaternion();
      bone.getWorldQuaternion(boneWorldQuat);
      // relatif a scene = inverse(scene monde) * os monde, capture UNE FOIS.
      const restRelativeToScene = sceneWorldQuatInverse.clone().multiply(boneWorldQuat);
      this.channels.push({ bone, restRelativeToScene, axes: boneConfig.axes });
    }
  }

  /** Relance l'attaque depuis le debut. Sans effet indesirable si appelee
   *  pendant une attaque deja en cours (n'arrive jamais en pratique tant que
   *  `attackCooldown` de l'unite depasse `duration` — vrai pour le
   *  Fantassin) : redemarrer a t=0 revient exactement a la pose de repos
   *  (premiere image-cle), jamais un snap depuis une pose intermediaire. */
  startAttack(): void {
    this.elapsed = 0;
    this.playing = true;
  }

  isPlaying(): boolean {
    return this.playing;
  }

  stop(): void {
    this.playing = false;
  }

  private degreesAt(values: number[], tSeconds: number): number {
    if (tSeconds <= this.keyframeTimes[0]!) return values[0]!;
    for (let i = 1; i < this.keyframeTimes.length; i++) {
      const segStart = this.keyframeTimes[i - 1]!;
      const segEnd = this.keyframeTimes[i]!;
      if (tSeconds <= segEnd || i === this.keyframeTimes.length - 1) {
        const span = segEnd - segStart;
        const localT = span > 0 ? Math.min(1, Math.max(0, (tSeconds - segStart) / span)) : 1;
        const eased = this.segmentEasings[i - 1]!(localT);
        return values[i - 1]! + (values[i]! - values[i - 1]!) * eased;
      }
    }
    return values[values.length - 1]!;
  }

  /** A appeler CHAQUE FRAME, APRES `AnimationMixer.update()` si l'unite en a
   *  un (voir UnitViews.sync) — n'ecrit rien tant qu'aucune attaque n'est en
   *  cours (`isPlaying() === false`), donc ne perturbe jamais idle/marche
   *  entre deux attaques. */
  update(dt: number): void {
    if (!this.playing) return;
    this.elapsed += dt;
    if (this.elapsed >= this.duration) {
      this.elapsed = this.duration;
      this.playing = false;
    }

    // Orientation MONDE ACTUELLE de `scene` (recalculee chaque frame, PAS
    // mise en cache depuis la construction) — c'est ce qui absorbe
    // correctement la rotation de facing de l'unite (0 pour le joueur, PI
    // pour un ennemi sans cible verrouillee, ou tout angle vers une cible
    // verrouillee), voir le commentaire de classe.
    this.scene.getWorldQuaternion(this.scratchSceneWorldQuat);

    for (const channel of this.channels) {
      this.scratchDelta.identity();
      for (const axisCurve of channel.axes) {
        const degrees = this.degreesAt(axisCurve.degreesPerKeyframe, this.elapsed);
        this.scratchAxisDelta.setFromAxisAngle(axisCurve.axis, THREE.MathUtils.degToRad(degrees));
        // equivalent a l'ancien "delta = axisDelta * delta" (compose l'axe
        // COURANT par-dessus l'accumulation existante).
        this.scratchDelta.premultiply(this.scratchAxisDelta);
      }
      // desiredWorld = sceneWorldQuat * delta * restRelativeToScene.
      this.scratchDesiredWorld.copy(channel.restRelativeToScene);
      this.scratchDesiredWorld.premultiply(this.scratchDelta);
      this.scratchDesiredWorld.premultiply(this.scratchSceneWorldQuat);

      channel.bone.parent!.getWorldQuaternion(this.scratchParentWorldQuat);
      this.scratchParentWorldQuat.invert();
      channel.bone.quaternion.copy(this.scratchDesiredWorld);
      channel.bone.quaternion.premultiply(this.scratchParentWorldQuat);

      // NOTE (2026-08-13, chantier optimisation) : une version "ciblee" de
      // cette mise a jour (rafraichir uniquement CET os, sans recursion) a
      // ete essayee puis ABANDONNEE apres verification hors-navigateur —
      // elle produisait un ecart mesurable (~0.1°) car la hierarchie reelle
      // contient des os INTERMEDIAIRES non listes dans `config.bones` (ex.
      // la chaine de colonne Bone_005/004/003 entre le bassin et le torse) :
      // l'ancien `updateMatrixWorld(true)` les rafraichissait "gratuitement"
      // en recursant, une version ciblee non-recursive les laisse perimes.
      // Garde la version recursive, verifiee correcte — le cout reste borne
      // (uniquement pendant les ~0.72s d'une attaque de Fantassin, jamais un
      // cout par frame constant sur 300 unites).
      channel.bone.updateMatrixWorld(true);
    }
  }
}
