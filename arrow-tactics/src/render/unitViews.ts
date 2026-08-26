import * as THREE from 'three';
import {
  ATTACK_ANIM_DURATION,
  ATTACK_LUNGE_DISTANCE,
  ATTACK_SWING_ANGLE,
  DEATH_FADE_DURATION,
  DEATH_FALL_DURATION,
  HIT_FLASH_DURATION,
  MAGE_CAST_RELEASE_FRACTION,
  RIGGED_ANIM_FADE_SECONDS,
  WALK_CYCLE_SPEED,
  WALK_MOVE_THRESHOLD,
  WALK_SWING_AMPLITUDE,
} from '../config/constants';
import { clamp, dist, lerp } from '../core/math';
import { forwardDir, type Entity } from '../sim/entity';
import type { RiggedActions } from './riggedGltf';
import type { ProceduralAttackAnimator } from './proceduralAttackAnimator';
import { buildUnit } from './unitMesh';

/**
 * Fait le pont entre la simulation et l'ecran. La simulation ne sait pas que
 * cette classe existe : elle se contente de bouger des nombres, et le rendu vient
 * lire ces nombres apres coup.
 *
 * L'interpolation est ce qui rend une simulation a 30 Hz fluide sur un ecran
 * 144 Hz : on affiche l'unite quelque part entre sa position au tick precedent et
 * sa position au tick courant.
 */
export class UnitViews {
  readonly group = new THREE.Group();
  private readonly views = new Map<number, THREE.Group>();
  /** Secondes ecoulees depuis la mort, uniquement pour les unites mortes. En
   *  temps reel (pas en temps de simulation) : c'est une animation d'ecran,
   *  pas une regle de jeu, elle n'a pas besoin d'etre determinite ni
   *  pausable. Deux phases sequentielles (demande d'Antoine, 2026-08-08) :
   *  chute en arriere (DEATH_FALL_DURATION) puis fondu (DEATH_FADE_DURATION),
   *  memes pour toutes les unites — pas d'animation par kit pour l'instant. */
  private readonly deathElapsed = new Map<number, number>();
  /** Secondes restantes d'amorce d'attaque, declenchee par un evenement de
   *  combat (touche ou rate). Meme logique : purement cosmetique, temps reel. */
  private readonly attackAnim = new Map<number, number>();
  /** Phase (radians) du cycle de marche, purement cosmetique. Repart de zero
   *  des que l'unite s'arrete (voir tickWalkAnim) — pas de memoire entre deux
   *  phases de marche. */
  private readonly walkPhase = new Map<number, number>();
  /** Secondes restantes du flash d'impact (voir playHit/HIT_FLASH_DURATION),
   *  purement cosmetique comme attackAnim. */
  private readonly hitFlash = new Map<number, number>();
  /** Nom du clip d'animation RIGGEE actuellement actif par entite (Mage,
   *  Fantassin — toute unite avec un squelette anime, voir
   *  tickRiggedAnimation) — `null` = aucun (pose de repos). Sert uniquement
   *  a detecter un CHANGEMENT d'etat d'un appel a l'autre, pour ne
   *  fondre-enchainer que lorsque necessaire. Vide pour toute unite sans
   *  squelette anime (view.userData.riggedMixer absent). */
  private readonly riggedActionState = new Map<number, string | null>();
  /** Variante de chute CHOISIE (cle dans `riggedActions`, ex. 'knockdownBack')
   *  pour une entite qui vient de mourir — tiree au hasard UNE FOIS au
   *  premier tick de sa mort (voir sync()) parmi toutes les cles prefixees
   *  "knockdown" disponibles, puis reutilisee telle quelle sur les frames
   *  suivantes (Archer, 3 variantes ; Fantassin, 1 seule — le tirage au sort
   *  n'a alors qu'un seul candidat, comportement inchange). Carte SEPAREE de
   *  `riggedActionState` : celle-ci est videe INCONDITIONNELLEMENT a chaque
   *  frame pour une entite morte (voir plus bas), ce qui effacerait ce choix
   *  aussitot pose si elle etait reutilisee ici. */
  private readonly deathActionChoice = new Map<number, string>();
  /** Position (monde) figee au moment ou une unite RIGGEE declenche son
   *  attaque (voir playAttack) — 2026-08-11, demande d'Antoine : "il faut
   *  que les archers, lorsqu'ils font une animation d'attaque, soient
   *  immobiles". Sans ca, si la cible sort de portee PENDANT le clip
   *  d'attaque (desormais jusqu'a 2s pour l'Archer, contre 0.22s pour
   *  l'ancienne amorce en boites — largement assez pour devenir visible),
   *  movementSystem fait deja repartir la position SIMULEE de l'unite avant
   *  que le clip (purement cosmetique, indifferent a la simulation) n'ait
   *  fini de jouer — la silhouette glisse alors au sol tout en montrant une
   *  pose de tir statique. Tant que `riggedActionState` vaut 'attack', la
   *  position RENDUE reste ancree ici plutot que suivre entity.x/z ; des
   *  que l'attaque cede la main (marche/repos), l'interpolation normale
   *  reprend. */
  private readonly attackAnchor = new Map<number, { x: number; z: number }>();
  /** ProceduralAttackAnimator ACTUELLEMENT associe a l'attaque de chaque
   *  entite (2026-08-14, generalise pour la Sentinelle — deux variantes,
   *  voir sentinelRig.ts, `userData.proceduralAttackVariants`) — pour une
   *  unite a variante UNIQUE (Fantassin, `userData.proceduralAttack`),
   *  reste simplement fixe sur ce meme animateur d'un appel a l'autre. Pour
   *  une unite a PLUSIEURS variantes, `playAttack` y ecrit celui tire au
   *  hasard pour CETTE attaque — `sync()`/l'ancrage de position le relisent
   *  ensuite sans avoir a savoir combien de variantes l'unite possede. */
  private readonly activeProceduralAttack = new Map<number, ProceduralAttackAnimator>();

  /** `simulationFrozen` (2026-08-13, correctif "les jambes continuent de
   *  marcher dans le vide lors de la victoire/défaite d'une manche") : vrai
   *  quand `loop.timeScale === 0` (pause manuelle OU rideau de transition de
   *  fin de vague — les deux figent la simulation, voir main.ts). Sans ce
   *  drapeau, `isMoving` (voir plus bas) restait figé sur sa valeur au tout
   *  DERNIER tick de simulation reellement execute : si une unite etait
   *  mi-foulee (entity.x != entity.prevX) au moment exact du gel, ce
   *  decalage ne bougeait plus jamais tant que world.step() ne tournait pas
   *  — `isMoving` calculait alors la MEME distance non-nulle a CHAQUE frame
   *  de rendu suivante (realDt continue de s'ecouler, lui), faisant
   *  tourner le cycle de marche indefiniment sur une position par ailleurs
   *  bien figee a l'ecran (view.position, lui, s'appuie sur `alpha`,
   *  egalement gele — d'ou "marche sur place"). */
  sync(entities: Entity[], alpha: number, realDt: number, simulationFrozen = false): void {
    const byId = new Map(entities.map((e) => [e.id, e]));

    for (const entity of entities) {
      let view = this.views.get(entity.id);

      if (!view) {
        view = this.createView(entity);
        this.views.set(entity.id, view);
        this.group.add(view);
      }

      const facing = this.computeFacing(entity, byId);
      view.rotation.y = facing;

      if (entity.alive) {
        this.deathElapsed.delete(entity.id);
        this.deathActionChoice.delete(entity.id);
        view.visible = true;
        view.rotation.x = 0;
        this.setOpacity(view, 1);
      } else {
        this.attackAnim.delete(entity.id);
        const isFirstDeathFrame = !this.deathElapsed.has(entity.id);
        const elapsed = (this.deathElapsed.get(entity.id) ?? 0) + realDt;
        this.deathElapsed.set(entity.id, elapsed);

        const mixer = view.userData['riggedMixer'] as THREE.AnimationMixer | undefined;
        const riggedActions = view.userData['riggedActions'] as RiggedActions | undefined;

        if (isFirstDeathFrame && riggedActions) {
          // Choix AU HASARD parmi toutes les variantes de chute disponibles
          // (cles prefixees "knockdown" — Archer : 3 variantes fournies par
          // Antoine pour varier la lecture des morts ; Fantassin : 1 seule,
          // le tirage n'a alors qu'un candidat). Cosmetique pur, hors
          // simulation : `Math.random()` est sans risque ici, contrairement
          // au RNG deterministe de bataille.
          const candidates = Object.keys(riggedActions).filter((key) => key.startsWith('knockdown'));
          if (candidates.length > 0) {
            this.deathActionChoice.set(entity.id, candidates[Math.floor(Math.random() * candidates.length)]!);
          }
        }
        const deathAction = riggedActions?.[this.deathActionChoice.get(entity.id) ?? ''];

        if (mixer && deathAction) {
          // Unite RIGGEE avec un clip de chute dedie (Fantassin,
          // "Knock_Down_1", Archer, 3 variantes — 2026-08-11) : joue ce clip
          // UNE FOIS au lieu de la bascule procedurale ci-dessous — le clip
          // anime deja tout le corps qui tombe, superposer une rotation.x en
          // plus doublerait le mouvement. `mixer.stopAllAction()` avant de
          // le lancer : coupe net toute action en cours (marche/attaque),
          // une mort n'a pas besoin d'un fondu enchaine comme les
          // transitions normales.
          if (isFirstDeathFrame) {
            this.riggedActionState.delete(entity.id);
            mixer.stopAllAction();
            deathAction.reset().play();
          }
          mixer.update(realDt);
          const fallDuration = deathAction.getClip().duration;
          const fadeProgress = clamp((elapsed - fallDuration) / DEATH_FADE_DURATION, 0, 1);
          this.setOpacity(view, 1 - fadeProgress);
          view.visible = fadeProgress < 1;
        } else {
          // Phase 1 : bascule en arriere sur l'axe X LOCAL, avant que le yaw
          // (rotation.y, facing) ne soit applique — la chute part donc toujours
          // vers l'arriere de l'unite, quelle que soit la direction ou elle
          // regardait au moment de mourir (voir composition intrinseque des
          // angles d'Euler de Three.js, ordre XYZ par defaut).
          const fallProgress = Math.min(1, elapsed / DEATH_FALL_DURATION);
          view.rotation.x = fallProgress * (Math.PI / 2);

          // Phase 2 : fondu, seulement une fois la chute terminee.
          const fadeProgress = Math.min(1, Math.max(0, (elapsed - DEATH_FALL_DURATION) / DEATH_FADE_DURATION));
          this.setOpacity(view, 1 - fadeProgress);
          view.visible = fadeProgress < 1;
        }
      }

      this.tickHitFlash(entity.id, realDt, view);
      this.tickCastGlow(entity, view);

      const lunge = entity.alive ? this.tickAttackAnim(entity.id, realDt, view) : 0;
      const forwardX = -Math.sin(facing);
      const forwardZ = -Math.cos(facing);

      const proceduralAttack = this.resolveActiveAttackAnimator(entity.id, view);
      // Provocation (Sentinelle, 2026-08-14) : DEUXIEME ProceduralAttackAnimator
      // independant sur la meme unite (voir sentinelRig.ts) — priorite geree
      // dans playAttack/playTaunt (Provocation interrompt une attaque en
      // cours, une attaque ne demarre jamais par-dessus une Provocation deja
      // en jeu), jamais ici : les deux mecanismes sont juste mis a jour
      // ensemble, absent (undefined) pour toute unite sans geste de
      // Provocation.
      const proceduralTaunt = view.userData['proceduralTaunt'] as ProceduralAttackAnimator | undefined;

      if (entity.alive) {
        const isMoving = !simulationFrozen && dist(entity.x, entity.z, entity.prevX, entity.prevZ) > WALK_MOVE_THRESHOLD;
        this.tickWalkAnim(entity.id, realDt, view, isMoving);
        this.tickRiggedAnimation(entity, realDt, view, isMoving);
        // APRES le mixer (voir proceduralAttackAnimator.ts) : l'attaque
        // procedurale (Fantassin, 2026-08-12) s'applique par-dessus la pose
        // ecrite par AnimationMixer.update ci-dessus, jamais avant.
        proceduralAttack?.update(realDt);
        proceduralTaunt?.update(realDt);
      } else {
        this.walkPhase.delete(entity.id);
        this.riggedActionState.delete(entity.id);
      }

      const isAttackingRigged = this.riggedActionState.get(entity.id) === 'attack';
      const isAttackingProcedural = (proceduralAttack?.isPlaying() ?? false) || (proceduralTaunt?.isPlaying() ?? false);
      const anchor = isAttackingRigged || isAttackingProcedural ? this.attackAnchor.get(entity.id) : undefined;
      if (anchor) {
        view.position.x = anchor.x;
        view.position.z = anchor.z;
      } else {
        view.position.x = lerp(entity.prevX, entity.x, alpha) + forwardX * lunge;
        view.position.z = lerp(entity.prevZ, entity.z, alpha) + forwardZ * lunge;
      }
    }
  }

  /** Declenche l'amorce d'attaque d'une unite ; a appeler une fois par
   *  evenement de combat. `x`/`z` : position REELLE de l'entite au moment du
   *  declenchement (voir attackAnchor) — ancre la silhouette d'une unite
   *  riggee pour toute la duree du clip d'attaque. */
  playAttack(entityId: number, x: number, z: number): void {
    const view = this.views.get(entityId);

    // Priorite Death > Provocation > Attack > Walk > Idle (Sentinelle,
    // 2026-08-14, point 57 de la demande) : si un geste de Provocation est
    // en cours sur cette unite, l'attaque ne demarre PAS par-dessus — sans
    // effet pour toute unite sans Provocation (proceduralTaunt absent).
    // Purement cosmetique : les degats/le cooldown de l'attaque en
    // SIMULATION restent inchanges, seul le retour visuel est saute.
    const existingTaunt = view?.userData['proceduralTaunt'] as ProceduralAttackAnimator | undefined;
    if (existingTaunt?.isPlaying()) return;

    this.attackAnim.set(entityId, ATTACK_ANIM_DURATION);
    let anchored = false;

    // Unite RIGGEE avec un clip d'attaque baked (Mage, Archer...) : declenche
    // directement le clip ici, jusqu'a sa completion naturelle —
    // tickRiggedAnimation se contente ensuite de suivre
    // `actions.attack.isRunning()` pour savoir quand lui succeder
    // (marche/repos). Pas de ruade/rotation procedurale a superposer
    // par-dessus (voir tickAttackAnim, court-circuite pour les unites
    // riggees).
    const actions = view?.userData['riggedActions'] as RiggedActions | undefined;
    if (actions?.['attack']) {
      // Coupe NET l'action precedente (2026-08-11, bug remonte par Antoine :
      // "l'animation des jambes de l'archer doit etre stoppee pendant
      // l'attaque") — cette methode ecrase `riggedActionState` directement
      // sur 'attack' SANS jamais arreter l'action qui tournait avant (ex.
      // 'walk'), et comme tickRiggedAnimation ne fait fondre-enchainer que
      // sur un CHANGEMENT par rapport a `riggedActionState`, il ne
      // detectait plus jamais ce changement (l'etat affichait deja 'attack'
      // au tick suivant) : l'action de marche restait donc active
      // INDEFINIMENT en parallele, ses jambes continuant de bouger,
      // melangees au clip d'attaque. Arret IMMEDIAT (pas de fondu) plutot
      // qu'un `fadeOut` : Antoine demande une coupure nette, pas un
      // enchainement progressif qui laisserait les jambes bouger encore
      // brievement.
      const previous = this.riggedActionState.get(entityId);
      if (previous && previous !== 'attack') actions[previous]?.stop();

      actions['attack'].reset().play();
      this.riggedActionState.set(entityId, 'attack');
      anchored = true;
    }

    // Attaque PROCEDURALE — independante du mixer, voir proceduralAttackAnimator.ts.
    // Une unite a soit UNE seule variante (Fantassin, `proceduralAttack`),
    // soit PLUSIEURS (Sentinelle, 2026-08-14 — `proceduralAttackVariants`,
    // voir sentinelRig.ts) : dans ce dernier cas, une SEULE est choisie AU
    // HASARD ici, une fois par attaque — jamais recalculee en cours
    // d'animation (le choix ne se refait qu'au PROCHAIN appel de
    // playAttack, donc a la prochaine attaque gameplay). Choix purement
    // COSMETIQUE (Math.random(), pas le RNG deterministe de la bataille) —
    // meme principe deja etabli dans ce projet pour la variante de chute de
    // l'Archer. Ces mecanismes restent mutuellement exclusifs avec un clip
    // 'attack' baked (Mage/Archer/Fantassin riggé) : chacun est simplement
    // absent si inutilise.
    const variants = view?.userData['proceduralAttackVariants'] as Record<string, ProceduralAttackAnimator> | undefined;
    let proceduralAttack: ProceduralAttackAnimator | undefined;
    if (variants) {
      const keys = Object.keys(variants);
      const chosenKey = keys[Math.floor(Math.random() * keys.length)]!;
      proceduralAttack = variants[chosenKey];
    } else {
      proceduralAttack = view?.userData['proceduralAttack'] as ProceduralAttackAnimator | undefined;
    }
    if (proceduralAttack) {
      // Coupe net l'ancienne variante active si elle jouait encore (garde-fou
      // defensif : le cooldown gameplay depasse toujours la duree de
      // l'animation en pratique, mais jamais deux animateurs actifs en meme
      // temps sur la meme entite) avant de demarrer la nouvelle.
      const previousAttack = this.activeProceduralAttack.get(entityId);
      if (previousAttack && previousAttack !== proceduralAttack) previousAttack.stop();

      proceduralAttack.startAttack();
      this.activeProceduralAttack.set(entityId, proceduralAttack);
      anchored = true;
    }

    if (anchored) this.attackAnchor.set(entityId, { x, z });
  }

  /** Declenche le geste de Provocation d'une unite (Sentinelle, 2026-08-14) —
   *  a appeler une fois par evenement 'taunt' (voir sim/systems/abilities.ts).
   *  Priorite ABSOLUE sur l'attaque (point 57 de la demande, "Death >
   *  Provocation > Attack > Walk > Idle") : interrompt net une attaque en
   *  cours si besoin, jamais l'inverse (voir playAttack, qui refuse de
   *  demarrer par-dessus une Provocation deja en jeu). Sans effet pour toute
   *  unite sans geste de Provocation (`proceduralTaunt` absent, voir
   *  sentinelRig.ts). `x`/`z` : position REELLE de l'entite au declenchement,
   *  meme convention que playAttack (immobilise la silhouette le temps du
   *  geste). */
  playTaunt(entityId: number, x: number, z: number): void {
    const view = this.views.get(entityId);
    const proceduralTaunt = view?.userData['proceduralTaunt'] as ProceduralAttackAnimator | undefined;
    if (!proceduralTaunt) return;

    // Coupe net l'attaque ACTIVE (quelle que soit la variante en cours,
    // epee ou bouclier — voir activeProceduralAttack) plutot que de lire
    // directement `userData.proceduralAttack`, absent depuis que la
    // Sentinelle a plusieurs variantes (2026-08-14).
    this.activeProceduralAttack.get(entityId)?.stop();

    proceduralTaunt.startAttack();
    this.attackAnchor.set(entityId, { x, z });
  }

  /** Declenche le flash d'impact d'une unite qui vient d'encaisser un HIT
   *  (jamais un miss, voir HIT_FLASH_DURATION) ; a appeler une fois par coup
   *  qui touche, cote unites comme fleche du joueur. Un recul cosmetique a
   *  ete essaye puis retire (2026-08-09, jugement d'Antoine apres coup d'oeil :
   *  le flash seul est plus sympa visuellement) — ne pas le reintroduire sans
   *  qu'il le redemande explicitement. */
  playHit(entityId: number): void {
    this.hitFlash.set(entityId, HIT_FLASH_DURATION);
  }

  /** Position ecran-monde REELLE de la silhouette (ruade d'attaque incluse) —
   *  a utiliser par tout ce qui doit s'ancrer visuellement sur l'unite (PV,
   *  texte de miss), plutot que de relire prevX/x et reinterpoler a cote :
   *  sinon la barre de PV se detache visiblement du modele a chaque attaque. */
  getPosition(entityId: number): { x: number; z: number } | null {
    const view = this.views.get(entityId);
    return view ? { x: view.position.x, z: view.position.z } : null;
  }

  clear(): void {
    this.views.clear();
    this.deathElapsed.clear();
    this.deathActionChoice.clear();
    this.attackAnim.clear();
    this.walkPhase.clear();
    this.hitFlash.clear();
    this.riggedActionState.clear();
    this.attackAnchor.clear();
    this.activeProceduralAttack.clear();
    this.group.clear();
  }

  /** Resout le ProceduralAttackAnimator ACTUELLEMENT associe a l'attaque
   *  d'une entite (voir activeProceduralAttack) — pour une unite a variante
   *  UNIQUE (`userData.proceduralAttack`), le fixe une fois puis le
   *  reutilise tel quel a chaque frame suivante ; pour une unite a
   *  PLUSIEURS variantes (`userData.proceduralAttackVariants`, Sentinelle,
   *  2026-08-14), ne renvoie que celle choisie par le dernier `playAttack`
   *  — `undefined` tant qu'aucune attaque n'a encore eu lieu (rien a mettre
   *  a jour avant la premiere attaque). */
  private resolveActiveAttackAnimator(entityId: number, view: THREE.Group): ProceduralAttackAnimator | undefined {
    const cached = this.activeProceduralAttack.get(entityId);
    if (cached) return cached;

    const single = view.userData['proceduralAttack'] as ProceduralAttackAnimator | undefined;
    if (single) {
      this.activeProceduralAttack.set(entityId, single);
      return single;
    }
    return undefined;
  }

  /** Applique une opacite a tous les materiaux de la silhouette — mis en
   *  cache a la creation (voir createView, userData.materials) pour ne pas
   *  retraverser toute la hierarchie a chaque frame de fondu. Sans risque de
   *  materiau partage ici (contrairement aux rochers/arbres .glb) : chaque
   *  appel a buildFantassin/buildArcher (unitMesh.ts) utilise son PROPRE
   *  cache de materiaux local, jamais un cache au niveau du module — bug
   *  corrige le 2026-08-09 en preparant le flash d'impact (voir setEmissive) :
   *  un cache module aurait fait muter les memes instances de materiau pour
   *  TOUTES les unites de meme couleur (steel, tissu d'equipe...), donc
   *  fondre/flasher une unite en aurait fondu/flashe d'autres au passage. */
  private setOpacity(view: THREE.Group, opacity: number): void {
    const materials = view.userData['materials'] as THREE.Material[] | undefined;
    if (!materials) return;
    for (const mat of materials) {
      mat.transparent = true;
      mat.opacity = opacity;
    }
  }

  /** Fait decroitre le flash d'impact en cours (le cas echeant) et applique
   *  l'intensite emissive correspondante (voir setEmissive) — s'arrete de
   *  lui-meme en remettant l'emissive a zero des que le chrono est ecoule. */
  private tickHitFlash(entityId: number, realDt: number, view: THREE.Group): number {
    const remaining = this.hitFlash.get(entityId);
    if (remaining === undefined) return 0;

    const next = remaining - realDt;
    if (next <= 0) {
      this.hitFlash.delete(entityId);
      this.setEmissive(view, 0);
      return 0;
    }

    this.hitFlash.set(entityId, next);
    const intensity = next / HIT_FLASH_DURATION;
    this.setEmissive(view, intensity);
    return intensity;
  }

  /** Teinte emissive blanche uniforme sur tous les materiaux de la silhouette
   *  (voir setOpacity pour le meme motif de cache) — 0 = aucune, 1 = flash
   *  maximal.
   *
   *  Correctif 2026-08-14 (flash blanc de degats invisible, remonte par
   *  Antoine) : les 4 modeles riggés (fantassinRig.ts/archerRig.ts/
   *  mageRig.ts/sentinelRig.ts) verrouillent tous `material.emissiveIntensity
   *  = 0` au chargement, pour neutraliser une lueur emissive BAKED-IN dans
   *  leur texture d'origine (voir le commentaire de chacun) — c'etait deja
   *  le cas avant ce correctif. Or `emissive.setScalar(intensity)` seul ne
   *  fait que changer la COULEUR emissive ; le rendu final reste
   *  `emissiveColor * emissiveIntensity` = blanc * 0 = invisible tant que
   *  `emissiveIntensity` reste bloque a 0. Sans le remonter ICI PENDANT le
   *  flash (et le redescendre a 0 avec lui), le flash de degats ne pouvait
   *  plus jamais se voir sur AUCUNE unite depuis le passage aux 4 modeles
   *  riggés — regression silencieuse, jamais un flash "retire" volontaire. */
  private setEmissive(view: THREE.Group, intensity: number): void {
    const materials = view.userData['materials'] as THREE.Material[] | undefined;
    if (!materials) return;
    for (const mat of materials) {
      const material = mat as THREE.MeshStandardMaterial;
      if (!material.emissive) continue;
      material.emissive.setScalar(intensity);
      if ('emissiveIntensity' in material) {
        material.emissiveIntensity = intensity > 0 ? 1 : 0;
      }
    }
  }

  /**
   * Retour visuel d'incantation (2026-08-11, Boule de feu du Mage, demande
   * d'Antoine point 8 : "légère lumière orange... pas besoin d'un système
   * complexe pour V1") — allume l'emissive de l'orbe au bout du baton
   * (userData.castGlow, voir unitMesh.ts buildMage) UNIQUEMENT pendant
   * `entity.cast`, avec une intensite qui monte progressivement jusqu'a
   * l'impact (elapsed/duration) plutot qu'un simple on/off — donne une
   * impression de "charge" sans animation dediee. Lu directement depuis
   * l'etat de simulation (pas de minuteur cote rendu, contrairement au
   * flash d'impact) : `entity.cast` porte deja son propre elapsed/duration.
   * Sans effet pour toute unite sans orbe (userData.castGlow absent). */
  private tickCastGlow(entity: Entity, view: THREE.Group): void {
    const orb = view.userData['castGlow'] as THREE.Mesh | undefined;
    if (!orb) return;
    const material = orb.material as THREE.MeshLambertMaterial;
    if (!material.emissive) return;

    const intensity = entity.cast ? clamp(entity.cast.elapsed / entity.cast.duration, 0.15, 1) : 0;
    material.emissive.setScalar(intensity);
  }

  /**
   * Anime les jambes (leftLeg/rightLeg, voir buildLeg dans unitMesh.ts) en
   * balancement alterne pendant que l'unite bouge vraiment — avancer ou
   * reculer (ex. la manoeuvre de degagement) declenchent la meme animation,
   * seul "l'unite change de position" compte. Purement cosmetique : la
   * vitesse du cycle (WALK_CYCLE_SPEED) est fixe, pas asservie a la vraie
   * vitesse de deplacement, volontairement simple ("ne pas trop compliquer",
   * demande d'Antoine). La phase repart de zero des l'arret, ce qui remet
   * aussi les jambes au repos (sin(0) = 0) sans a-coup a gerer separement.
   */
  private tickWalkAnim(entityId: number, realDt: number, view: THREE.Group, isMoving: boolean): void {
    const leftLeg = view.userData.leftLeg as THREE.Object3D | undefined;
    const rightLeg = view.userData.rightLeg as THREE.Object3D | undefined;
    if (!leftLeg || !rightLeg) return;

    const phase = isMoving ? (this.walkPhase.get(entityId) ?? 0) + realDt * WALK_CYCLE_SPEED : 0;
    this.walkPhase.set(entityId, phase);

    const swing = Math.sin(phase) * WALK_SWING_AMPLITUDE;
    leftLeg.rotation.x = swing;
    rightLeg.rotation.x = -swing;
  }

  /**
   * Avance le chrono d'amorce d'attaque. Si l'unite a un bras anime
   * (attackArm, voir buildFantassin), fait pivoter ce bras en un coup rapide
   * (leve puis rabattu, via la meme courbe en sinus 0 -> pic -> 0 que l'ancienne
   * ruade) et renvoie 0 ; sinon renvoie une distance de ruade a l'ancienne,
   * en repli pour toute future unite au corps a corps sans bras anime.
   */
  private tickAttackAnim(entityId: number, realDt: number, view: THREE.Group): number {
    const arm = view.userData.attackArm as THREE.Object3D | undefined;
    const remaining = this.attackAnim.get(entityId);
    if (remaining === undefined) return 0;

    // Unite RIGGEE (Mage, Fantassin...) : le clip d'attaque (voir playAttack/
    // tickRiggedAnimation) fournit deja tout le mouvement du corps — pas de
    // ruade/rotation de bras procedurale a superposer, ce serait un double
    // mouvement incoherent. Le chrono `attackAnim` continue de decroitre
    // normalement (inoffensif, juste inutilise pour le rendu ici).
    if (view.userData['riggedMixer']) return 0;

    const next = remaining - realDt;
    if (next <= 0) {
      this.attackAnim.delete(entityId);
      if (arm) arm.rotation.x = 0;
      return 0;
    }

    this.attackAnim.set(entityId, next);
    const progress = 1 - next / ATTACK_ANIM_DURATION;
    const swing = Math.sin(progress * Math.PI);

    if (arm) {
      arm.rotation.x = -swing * ATTACK_SWING_ANGLE;
      return 0;
    }
    return swing * ATTACK_LUNGE_DISTANCE;
  }

  /**
   * Pilote le squelette anime d'une unite RIGGEE (Mage, Fantassin — voir
   * render/mageRig.ts et render/fantassinRig.ts) depuis l'etat de simulation
   * — l'equivalent, pour une unite avec un vrai AnimationMixer, de ce que
   * tickWalkAnim/tickAttackAnim font a la main pour les unites en boites.
   * Sans effet pour toute unite sans squelette (`view.userData.riggedMixer`
   * absent). Generique sur l'ENSEMBLE des cles d'`actions` presentes : le
   * Mage a {walk, attack, cast}, le Fantassin {walk, attack, knockdown} (la
   * mort est geree a part, voir sync()) — cette methode ne suppose que
   * 'walk'/'attack' toujours presents, 'cast' optionnel.
   *
   * Priorite d'etat : incantation (+ sa retombee, voir plus bas, uniquement
   * si l'unite a une capacite 'cast') > attaque > marche > repos. 'attack'
   * n'est JAMAIS (re)declenche ici (voir playAttack, seul point de
   * declenchement) — cette methode se contente de suivre
   * `actions.attack.isRunning()` pour savoir quand un clip d'attaque en
   * cours se termine tout seul et qu'il faut lui succeder.
   *
   * 'cast' (Mage uniquement) en DEUX temps (2026-08-11, deuxieme correctif
   * apres retour d'Antoine : le premier correctif — synchroniser
   * `action.time` sur `entity.cast.elapsed` — reglait bien une DERIVE
   * d'horloge reelle, mais pas le vrai probleme signale ensuite : "le mage
   * finit son geste, rien, puis la boule part". Cause : le clip source dure
   * 2,23s et contient vraisemblablement une retombee/un repos APRES le vrai
   * geste de lancer — en etirant tout le clip sur `castTime`, cette portion
   * immobile de fin de clip s'etirait aussi, lisible comme un temps mort
   * avant le tir. Antoine, invite a estimer : "vers les 2/3 du mouvement".
   *   1. PENDANT `entity.cast` (incantation reelle, ferme le jeu) :
   *      `action.time` synchronise sur `entity.cast.elapsed/duration`,
   *      projete UNIQUEMENT sur les 2 premiers tiers du clip
   *      (MAGE_CAST_RELEASE_FRACTION) — a la fin de l'incantation
   *      (elapsed >= duration, meme tick que le lancement du projectile),
   *      le clip est donc pile a l'image de "lacher".
   *   2. APRES (entity.cast redevenu null, projectile deja en vol) : plus
   *      aucune synchronisation forcee — `mixer.update` fait simplement
   *      avancer le clip normalement (vitesse native) sur le dernier tiers
   *      (la retombee), SANS bloquer le depart du projectile puisque celui-ci
   *      a deja eu lieu. `desired` reste 'cast' tant que
   *      `actions.cast.isRunning()` (meme mecanisme que 'attack') — le clip
   *      termine donc sa retombee avant de ceder la main a marche/repos.
   */
  private tickRiggedAnimation(entity: Entity, realDt: number, view: THREE.Group, isMoving: boolean): void {
    const mixer = view.userData['riggedMixer'] as THREE.AnimationMixer | undefined;
    const actions = view.userData['riggedActions'] as RiggedActions | undefined;
    if (!mixer || !actions) return;

    const previous = this.riggedActionState.get(entity.id) ?? null;
    const cast = actions['cast'];

    let desired: string | null = null;
    if (cast && entity.cast) desired = 'cast';
    else if (cast && previous === 'cast' && cast.isRunning()) desired = 'cast'; // retombee en cours
    else if (actions['attack']?.isRunning()) desired = 'attack';
    else if (isMoving) desired = 'walk';

    if (desired !== previous) {
      if (previous) actions[previous]?.fadeOut(RIGGED_ANIM_FADE_SECONDS);
      if (desired === 'cast' && cast) {
        cast.reset().fadeIn(RIGGED_ANIM_FADE_SECONDS).play();
      } else if (desired === 'walk') {
        actions['walk']?.reset().fadeIn(RIGGED_ANIM_FADE_SECONDS).play();
      }
      this.riggedActionState.set(entity.id, desired);
    }

    mixer.update(realDt);

    // Synchronisation forcee UNIQUEMENT pendant l'incantation reelle — une
    // fois `entity.cast` redevenu null (projectile lance), `mixer.update`
    // ci-dessus suffit a faire avancer naturellement la retombee, jamais
    // ecrasee ici.
    if (cast && entity.cast) {
      const clipDuration = cast.getClip().duration;
      const progress = clamp(entity.cast.elapsed / entity.cast.duration, 0, 1);
      cast.time = progress * MAGE_CAST_RELEASE_FRACTION * clipDuration;
    }
  }

  /** Position monde ACTUELLE d'un os nomme de la silhouette riggee d'une
   *  entite (ex. 'RightHand' de l'Archer) — voir main.ts, pendingArrowSpawns
   *  (origine visuelle de la fleche, plutot que le centre approximatif de
   *  l'unite). `null` si l'entite/l'os n'existe pas (unite non riggee, deja
   *  morte, etc.) — l'appelant retombe alors sur l'ancienne approximation. */
  getBoneWorldPosition(entityId: number, boneName: string): { x: number; z: number } | null {
    const view = this.views.get(entityId);
    if (!view) return null;
    const bone = view.getObjectByName(boneName);
    if (!bone) return null;
    const pos = new THREE.Vector3();
    bone.getWorldPosition(pos);
    return { x: pos.x, z: pos.z };
  }

  /** Angle (rotation.y) pour regarder vers la cible verrouillee, ou vers l'avant a defaut. */
  private computeFacing(entity: Entity, byId: Map<number, Entity>): number {
    const target = entity.targetId !== null ? byId.get(entity.targetId) : undefined;
    const dx = target ? target.x - entity.x : 0;
    const dz = target ? target.z - entity.z : forwardDir(entity.team);

    if (Math.hypot(dx, dz) < 1e-4) return entity.team === 'player' ? 0 : Math.PI;
    return Math.atan2(-dx, -dz);
  }

  private createView(entity: Entity): THREE.Group {
    const view = buildUnit(entity.unitId, entity.team);
    // Permet de retrouver l'entite depuis un raycast (voir main.ts, ciblage
    // d'objet d'inventaire en temps reel pendant la bataille) — meme motif
    // que findSlotIndex/findEditorObstacleId ailleurs dans le projet.
    view.userData['entityId'] = entity.id;

    // Cache une fois pour toutes la liste des materiaux (voir setOpacity) :
    // le fondu de mort n'a besoin que de les reparcourir, jamais de
    // retraverser toute la hierarchie de la silhouette.
    const materials: THREE.Material[] = [];
    view.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      for (const mat of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) materials.push(mat);
    });
    view.userData['materials'] = materials;

    return view;
  }
}
