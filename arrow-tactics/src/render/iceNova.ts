import * as THREE from 'three';
import { COLORS, TILE } from '../config/constants';
import type { Entity } from '../sim/entity';
import type { PersistentAreaEffect } from '../sim/systems/persistentAreaEffects';
import { loadVfxTexture } from './vfxTextures';

/**
 * Rendu de la Nova de glace / du Blizzard (2026-08-14) — style low-poly
 * sobre demande explicitement par Antoine : "évite néon sci-fi, énorme
 * bloom, détails qui masquent les unités". Deux volets INDEPENDANTS :
 *
 *  - `spawnImpact` : VFX PONCTUEL a l'instant du clic (flash + anneau au sol
 *    + petite poussee de cristaux) — jamais lu depuis l'etat de simulation,
 *    contrairement au telegraphe du Mage : la Nova est instantanee, il n'y a
 *    pas d'etat "en cours" a suivre pour l'impact lui-meme. Dure quelques
 *    centaines de ms puis se nettoie tout seul ; l'effet GAMEPLAY (Root,
 *    voir World.applyIceNovaRoot) est deja applique de son cote, cette
 *    fonction ne fait que le montrer.
 *  - `sync` : zone Blizzard PERSISTANTE, lue chaque frame depuis
 *    `World.iceNovaZones` (meme principe que TelegraphView pour le Mage) —
 *    une entree tant que la zone existe dans le tableau, retiree des qu'elle
 *    en disparait (expiree, voir sim/systems/persistentAreaEffects.ts). Un
 *    petit "pulse" (opacite/echelle) se declenche a CHAQUE tick de degats
 *    reellement resolu (voir PersistentAreaEffect.ticksFired) — synchronise
 *    le ressenti visuel sur les vrais impacts, pas un cycle decoratif
 *    independant.
 *  - `syncFrostIndicators` : petit amas de cristaux aux pieds de CHAQUE
 *    unite avec `rootTimer > 0` (2026-08-14, demande d'Antoine — voir
 *    Entity.rootTimer) — se superpose visuellement, ne recolore JAMAIS les
 *    materiaux de faction (mesh separe, jamais applique sur l'unite
 *    elle-meme). Une entree par id d'entite immobilisee, retiree des que le
 *    Root se termine ou que l'unite meurt.
 *
 * Pas de PointLight ici (contrairement a FireballView) : la Nova est un
 * evenement frequent (objet d'inventaire, pas un cooldown d'IA rare), et le
 * projet a deja rencontre un vrai cout de recompilation de shader en
 * ajoutant/retirant des lumieres a la volee (voir CLAUDE.md, correctif de
 * performance Boule de feu) — plus simple d'eviter le probleme que de
 * reproduire un second LightPool pour un effet qui n'en a pas besoin.
 */

const IMPACT_FLASH_DURATION = 0.18;
const IMPACT_RING_DURATION = 0.35;
const SHARD_COUNT = 8;
const SHARD_LIFETIME = 0.4;
const SHARD_SPEED = 1.6;
const SHARD_GRAVITY = 3.5;
/** Retouche 2026-08-14 (retour d'Antoine : "ça neige joyeusement plutôt
 *  qu'un réel blizzard dévastateur") — nettement plus dense/rapide/anguleux
 *  qu'une premiere version trop proche d'une neige tranquille verticale. */
const BLIZZARD_FLAKE_COUNT = 24;
/** Vent fixe (direction horizontale de la derive, normalisee) — donne
 *  l'impression d'une tempete qui souffle plutot qu'une neige qui tombe
 *  droit, sans faire une vraie simulation de vent. */
const BLIZZARD_WIND = new THREE.Vector2(0.6, 0.32).normalize();
/** Duree de fondu entree/sortie de la zone Blizzard (secondes) — pour ne
 *  jamais la voir apparaitre/disparaitre d'un coup sec. */
const BLIZZARD_FADE = 0.3;
/** Duree du "pulse" visuel (opacite/echelle) declenche a chaque tick de
 *  degats REELLEMENT resolu (voir PersistentAreaEffect.ticksFired) — donne
 *  un ressenti d'impact rythme sur les vrais degats plutot qu'un decor
 *  purement decoratif. */
const BLIZZARD_TICK_PULSE_DURATION = 0.3;
/** Traits de vent tournant autour de la zone (2026-08-14, retour d'Antoine :
 *  "encore un peu mou... un effet de petit trait tournant autour de la
 *  zone, quelque chose qui donne une impression de vent") — des arcs fins
 *  (segments de RingGeometry, pas des particules) qui balaient la
 *  circonference a vitesse variable, chacun avec un court "sillage" qui le
 *  suit pour lire comme un trait en mouvement plutot qu'une forme statique
 *  qui tourne. */
const WIND_STREAK_COUNT = 6;
const WIND_STREAK_ARC_LENGTH = 0.5;
/** Longueur du sillage, en radians, DERRIERE le trait principal. */
const WIND_STREAK_TRAIL_ARC = 0.35;
/** Particules qui tourbillonnent EN L'AIR (2026-08-14, retour d'Antoine :
 *  "rajoute un autre effet tourbillonnant en petite particule différente...
 *  qui tournoie en l'air et pas au sol") — distinct des traits de vent au
 *  sol (WindStreak) : orbitent a des HAUTEURS variees au-dessus de la zone,
 *  plus vite pres du centre (effet "tornade"), avec un leger bobbing
 *  vertical pour ne pas paraitre figees sur un cercle parfait. */
const AIR_SWIRL_COUNT = 18;

/**
 * Interrupteur de style pour la zone Blizzard (2026-08-14, demande
 * d'Antoine : "vois ce que tu peux faire pour le blizzard avec les vfx,
 * garde la version actuelle au cas ou"). 'procedural' est la version
 * Box/Ring geometrique deja en place ci-dessus (voir
 * buildBlizzardFxProcedural, INTACTE, jamais modifiee) ; 'textured'
 * construit les MEMES elements (flocons, traits de vent, tourbillon aerien,
 * teinte au sol, contour) a partir de vraies textures (Kenney "Particle
 * Pack", CC0 — meme pack et meme licence que healVfx.ts) plutot que des
 * formes procedurales pures. Le code de mouvement/anim (`sync`) est
 * ENTIEREMENT PARTAGE entre les deux styles (voir `setOpacity`, duck-typing
 * sur `.material`) — seule la CONSTRUCTION differe (buildBlizzardFxProcedural
 * vs buildBlizzardFxTextured), jamais dupliquee deux fois. Repasser cette
 * constante a 'procedural' restaure l'ancien rendu SANS aucun autre
 * changement de code.
 */
const BLIZZARD_VFX_STYLE: 'procedural' | 'textured' = 'textured';

/** Textures utilisees par la variante 'textured' du Blizzard — chargees une
 *  seule fois (cache partage, voir vfxTextures.ts). circle_05/circle_02
 *  remplacent les decalques au sol (CircleGeometry/RingGeometry unis) ;
 *  twirl_02 remplace les arcs de RingGeometry des traits de vent ; star_01/
 *  star_04 (deja chargees par healVfx.ts, meme instance de Texture grace au
 *  cache) remplacent les cubes des flocons/du tourbillon aerien. */
const blizzardGroundTexture = loadVfxTexture('circle_05.png');
const blizzardOutlineTexture = loadVfxTexture('circle_02.png');
const blizzardStreakTexture = loadVfxTexture('twirl_02.png');
const blizzardFlakeTextureA = loadVfxTexture('star_01.png');
const blizzardFlakeTextureB = loadVfxTexture('star_04.png');

/** Amplification du style 'textured' (2026-08-14, retour d'Antoine :
 *  "amplifie les effets de particule que tu viens de rajouter, il faut que
 *  tout ce que tu viens d'ajouter soit plus visible") — s'applique
 *  UNIQUEMENT a la variante texture (voir BlizzardFx.intensityScale, utilise
 *  par sync() ; la variante procedurale garde `intensityScale: 1`, donc un
 *  comportement mathematiquement IDENTIQUE a avant cette retouche). Compte
 *  de particules et tailles egalement montes, mais SEULEMENT dans
 *  buildBlizzardFxTextured — les constantes partagees BLIZZARD_FLAKE_COUNT/
 *  AIR_SWIRL_COUNT/WIND_STREAK_COUNT (utilisees par la version procedurale)
 *  restent inchangees. */
const TEXTURED_INTENSITY = 1.8;
const BLIZZARD_FLAKE_COUNT_TEXTURED = 34;
const AIR_SWIRL_COUNT_TEXTURED = 26;
const WIND_STREAK_COUNT_TEXTURED = 9;

/** Duck-typing sur `.material` (present sur THREE.Mesh ET THREE.Sprite) —
 *  permet au MEME code de sync() de piloter indifferemment un element
 *  procedural (Mesh/MeshBasicMaterial) ou texture (Sprite/SpriteMaterial),
 *  sans dupliquer toute la logique de mouvement par style. */
function setOpacity(obj: THREE.Object3D, value: number): void {
  const material = (obj as THREE.Mesh | THREE.Sprite).material as THREE.Material & { opacity: number };
  material.opacity = value;
}

/** Epaisseur du rond bleu de bordure, en fraction du rayon (2026-08-14,
 *  demande d'Antoine : "affiche bien un rond bleu au sol indiquant la zone
 *  de radius") — cree en reponse au fait que le contour texture
 *  (`outline`, circle_02) et la teinte au sol peuvent se faire manger par
 *  les particules desormais amplifiees, sans plus donner une lecture
 *  immediate et fiable du RAYON EXACT de la zone. Ce nouvel element est
 *  volontairement SIMPLE (couleur plate, pas de texture, pas d'additif) et
 *  IDENTIQUE dans les deux styles (procedural ET texture, voir
 *  buildBoundaryRing) — jamais concerne par BLIZZARD_VFX_STYLE ni par
 *  intensityScale, pour garantir une lecture du rayon toujours fiable quel
 *  que soit le reste du visuel. */
// Retouche 2026-08-14 (retour d'Antoine : "sa bordure est un peu large") —
// 0.08 -> 0.035, un trait net plutot qu'un large ruban.
const BOUNDARY_RING_THICKNESS_FRAC = 0.035;

/** Rond bleu simple et net marquant l'EXACT rayon de la zone — voir
 *  BOUNDARY_RING_THICKNESS_FRAC. Couleur plate (iceGlow, deja le "anneau/
 *  teinte principale" documente dans COLORS), fondu NORMAL (pas additif —
 *  doit rester un trait net, pas un glow qui se delave, meme lecon
 *  additif/normal que le reste du fichier). */
function buildBoundaryRing(worldRadius: number): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.RingGeometry(worldRadius * (1 - BOUNDARY_RING_THICKNESS_FRAC), worldRadius, 48),
    new THREE.MeshBasicMaterial({ color: COLORS.iceGlow, transparent: true, opacity: 0, side: THREE.DoubleSide }),
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.045;
  return mesh;
}

/** Remplissage bleu PALE et transparent de l'interieur du rond de bordure
 *  (2026-08-14, retour d'Antoine : "il faudrait que l'interieur de ce
 *  cercle soit teinte d'un bleu pale et transparent") — un disque plein
 *  sous le rond de bordure (voir buildBoundaryRing), MEME philosophie :
 *  couleur plate, fondu NORMAL, opacite FORTEMENT FIXE et independante du
 *  style/de intensityScale, pour que la zone reste lisible quel que soit
 *  le reste du visuel. Distinct de `groundTint` (teinte plus sombre,
 *  "ombre de tempete" — reste inchangee, ce remplissage est un ajout, pas
 *  un remplacement). */
function buildBoundaryFill(worldRadius: number): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.CircleGeometry(worldRadius, 40),
    new THREE.MeshBasicMaterial({ color: COLORS.iceGlow, transparent: true, opacity: 0, side: THREE.DoubleSide }),
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.04;
  return mesh;
}

/** Glow additif (flocons, tourbillon aerien, traits de vent texture) —
 *  meme convention que healVfx.ts : un fondu ADDITIF convient a un eclat/
 *  une lueur qui s'ajoute a la scene, jamais a une forme censee se lire
 *  comme une icone pleine (voir la lecon "additif vs normal" documentee
 *  dans CLAUDE.md, decouverte sur le parchemin de soin le meme jour). */
function buildGlowSprite(texture: THREE.Texture, color: number): THREE.Sprite {
  return new THREE.Sprite(
    new THREE.SpriteMaterial({ map: texture, color, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
}

/** Impression d'IMPACT de la Nova (2026-08-14, retour d'Antoine : "dis-moi
 *  ce que tu peux faire pour ça") — trois elements AJOUTES au flash/anneau/
 *  eclats deja existants (voir spawnImpact) :
 *   - une onde de choc qui explose du centre vers l'exterieur (au-dela du
 *     rayon reel, pour une sensation de force qui se propage) ;
 *   - quelques fissures de givre qui jaillissent du point d'impact le long
 *     du sol, comme des eclairs de glace ;
 *   - un dome d'energie qui gonfle brievement vers le haut (le seul element
 *     vraiment "3D" du visuel — flash/anneau/fissures restent plats au sol).
 *  Tout reste des formes simples (Ring/Box/Sphere), aucun vrai systeme de
 *  particules, cohérent avec le reste du fichier. */
const IMPACT_SHOCKWAVE_DURATION = 0.3;
const IMPACT_BURST_DOME_DURATION = 0.25;
const IMPACT_CRACK_DURATION = 0.4;
const CRACK_RAY_COUNT = 7;

interface ImpactFx {
  flash: THREE.Mesh;
  ring: THREE.Mesh;
  shockwave: THREE.Mesh;
  burstDome: THREE.Mesh;
  crackRays: { mesh: THREE.Mesh; length: number }[];
  shards: { mesh: THREE.Mesh; velocity: THREE.Vector3 }[];
  elapsed: number;
}

interface BlizzardFlake {
  /** THREE.Mesh (style 'procedural', cube tournant) OU THREE.Sprite (style
   *  'textured', toujours face camera) — voir setOpacity/BLIZZARD_VFX_STYLE. */
  mesh: THREE.Object3D;
  speed: number;
  baseY: number;
  originX: number;
  originZ: number;
  driftDist: number;
  /** Vitesse de rotation — pilote `.rotation.x`/`.rotation.z` en style
   *  procedural (tumbling 3D), ou `material.rotation` (roulis 2D) en style
   *  texture, voir sync(). */
  spinX: number;
  spinZ: number;
  phase: number;
}

/** Un trait de vent = un pivot (tourne autour du centre de la zone, voir
 *  buildBlizzardFx*) portant DEUX elements plats : le trait principal
 *  (`mesh`) et un sillage plus faible juste derriere (`trailMesh`), pour
 *  lire comme un coup de vent qui balaie plutot qu'une forme figee en
 *  rotation. Mesh (arcs de RingGeometry) en procedural, Mesh a plat avec
 *  texture twirl en 'textured' — jamais un Sprite ici (doit rester plaque
 *  au sol, pas face camera). */
interface WindStreak {
  pivot: THREE.Group;
  mesh: THREE.Mesh;
  trailMesh: THREE.Mesh;
  angularSpeed: number;
}

/** Une particule qui orbite EN L'AIR autour du centre de la zone, a une
 *  hauteur qui oscille doucement (bobbing) — voir AIR_SWIRL_COUNT. Mesh
 *  (cube) en procedural, Sprite (texture, face camera) en 'textured'. */
interface AirSwirlParticle {
  mesh: THREE.Object3D;
  angle: number;
  angularSpeed: number;
  radius: number;
  baseY: number;
  bobAmplitude: number;
  bobSpeed: number;
  bobPhase: number;
}

interface BlizzardFx {
  group: THREE.Group;
  groundTint: THREE.Mesh;
  outline: THREE.Mesh;
  /** Rond bleu simple et net marquant l'exact rayon — voir buildBoundaryRing.
   *  Identique construction dans les deux styles, jamais concerne par
   *  BLIZZARD_VFX_STYLE/intensityScale. */
  boundaryRing: THREE.Mesh;
  /** Remplissage bleu pale transparent de l'interieur — voir buildBoundaryFill.
   *  Meme statut que boundaryRing. */
  boundaryFill: THREE.Mesh;
  flakes: BlizzardFlake[];
  windStreaks: WindStreak[];
  airSwirls: AirSwirlParticle[];
  /** Nombre de ticks deja "vus" par le rendu — sert a detecter une
   *  transition (voir sync) pour declencher le pulse. */
  lastTicksFired: number;
  /** 1 juste apres un tick, decroit vers 0 sur BLIZZARD_TICK_PULSE_DURATION. */
  pulse: number;
  /** Multiplicateur d'opacite applique par sync() a TOUS les elements de la
   *  zone (2026-08-14, retour d'Antoine : "amplifie les effets de particule
   *  que tu viens de rajouter, il faut que ce soit plus visible") — 1 pour
   *  le style procedural (donc math IDENTIQUE a avant, voir sync : chaque
   *  formule d'opacite etait deja <=1, `Math.min(1, x*1)` reste
   *  strictement egal a l'ancienne valeur), plus eleve pour le style
   *  texture. Permet d'amplifier UN SEUL style via une seule constante,
   *  sans dupliquer sync() ni toucher au fallback procedural. */
  intensityScale: number;
}

export class IceNovaView {
  readonly group = new THREE.Group();
  private readonly impacts: ImpactFx[] = [];
  private readonly zones = new Map<PersistentAreaEffect, BlizzardFx>();
  /** Amas de cristaux aux pieds des unites immobilisees (voir
   *  syncFrostIndicators) — cle par id d'ENTITE (pas par objet, contrairement
   *  aux zones : une entite garde le meme id toute la bataille). */
  private readonly frostIndicators = new Map<number, THREE.Group>();
  /** Anneau de PREVISUALISATION du mode de ciblage (2026-08-14) — un seul
   *  objet PERMANENT ajoute une seule fois (meme principe que
   *  main.ts, healTargetRing), simplement repositionne/redimensionne/masque
   *  a chaque survol plutot que reconstruit. Rayon TOUJOURS EXACTEMENT
   *  `ICE_NOVA_RADIUS` (voir showTargetPreview) — jamais une approximation
   *  visuelle, demande explicite d'Antoine. */
  private readonly targetRing: THREE.Mesh;
  /** Remplissage pale de la previsualisation — meme principe que
   *  buildBoundaryFill, voir showTargetPreview. */
  private readonly targetFill: THREE.Mesh;

  constructor() {
    // Meme epaisseur/opacite que buildBoundaryRing (2026-08-14, "affiche
    // bien un rond bleu au sol indiquant la zone de radius") — coherence
    // visuelle entre le rond de PREVISUALISATION (avant clic) et celui de
    // la zone ACTIVE (Blizzard, voir buildBoundaryRing).
    this.targetRing = new THREE.Mesh(
      new THREE.RingGeometry(1 - BOUNDARY_RING_THICKNESS_FRAC, 1, 48),
      new THREE.MeshBasicMaterial({ color: COLORS.iceGlow, transparent: true, opacity: 0.9, side: THREE.DoubleSide }),
    );
    this.targetRing.rotation.x = -Math.PI / 2;
    this.targetRing.visible = false;
    this.group.add(this.targetRing);

    // Remplissage bleu pale (2026-08-14, "l'interieur de ce cercle [doit
    // etre] teinte d'un bleu pale et transparent") — meme rayon unitaire (1)
    // que targetRing, mis a l'echelle de la meme facon dans showTargetPreview.
    this.targetFill = new THREE.Mesh(
      new THREE.CircleGeometry(1, 40),
      new THREE.MeshBasicMaterial({ color: COLORS.iceGlow, transparent: true, opacity: 0.22, side: THREE.DoubleSide }),
    );
    this.targetFill.rotation.x = -Math.PI / 2;
    this.targetFill.visible = false;
    this.group.add(this.targetFill);
  }

  /** `radius` en CASES — l'anneau/le remplissage sont construits a rayon
   *  UNITAIRE (1) puis mis a l'echelle par ce rayon, donc le rendu
   *  correspond TOUJOURS exactement au rayon gameplay reel, jamais une
   *  valeur redessinee a la main. */
  showTargetPreview(x: number, z: number, radius: number): void {
    this.targetRing.position.set(x, 0.031, z);
    this.targetRing.scale.setScalar(radius * TILE);
    this.targetRing.visible = true;
    this.targetFill.position.set(x, 0.029, z);
    this.targetFill.scale.setScalar(radius * TILE);
    this.targetFill.visible = true;
  }

  hideTargetPreview(): void {
    this.targetRing.visible = false;
    this.targetFill.visible = false;
  }

  /** A appeler chaque frame — un petit amas de cristaux de glace apparait
   *  aux pieds de CHAQUE unite `alive` avec `rootTimer > 0` (voir
   *  Entity.rootTimer), suit sa position REELLEMENT rendue (`resolvePosition`,
   *  meme convention que CombatOverlay.sync — interpolee si l'unite est
   *  riggee/animee), disparait des que le Root se termine ou que l'unite
   *  meurt. Jamais de recoloration de l'unite elle-meme — un mesh
   *  entierement separe qui se superpose. */
  syncFrostIndicators(entities: Entity[], resolvePosition: (e: Entity) => { x: number; z: number }): void {
    const activeIds = new Set<number>();

    for (const e of entities) {
      if (!e.alive || e.rootTimer <= 0) continue;
      activeIds.add(e.id);

      let fx = this.frostIndicators.get(e.id);
      if (!fx) {
        fx = buildFrostShards();
        this.frostIndicators.set(e.id, fx);
        this.group.add(fx);
      }
      const pos = resolvePosition(e);
      fx.position.set(pos.x, 0, pos.z);
    }

    for (const [id, fx] of this.frostIndicators) {
      if (activeIds.has(id)) continue;
      this.group.remove(fx);
      this.frostIndicators.delete(id);
    }
  }

  /** Flash bleu/cyan + anneau glace + petite poussee de cristaux vers le
   *  haut — voir l'en-tete de fichier. `radius` en CASES (meme convention
   *  que TILE ailleurs dans le rendu), toujours EXACTEMENT le rayon
   *  gameplay (voir data/items.ts, ICE_NOVA_RADIUS) — jamais une
   *  approximation visuelle. */
  spawnImpact(x: number, z: number, radius: number): void {
    const worldRadius = radius * TILE;

    const flash = new THREE.Mesh(
      new THREE.CircleGeometry(worldRadius, 24),
      new THREE.MeshBasicMaterial({ color: COLORS.iceCore, transparent: true, opacity: 0.85, side: THREE.DoubleSide }),
    );
    flash.rotation.x = -Math.PI / 2;
    flash.position.set(x, 0.04, z);
    this.group.add(flash);

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(worldRadius * 0.85, worldRadius, 32),
      new THREE.MeshBasicMaterial({ color: COLORS.iceGlow, transparent: true, opacity: 0.9, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, 0.05, z);
    this.group.add(ring);

    // Onde de choc : part TOUTE PETITE et explose au-dela du rayon reel
    // avant de s'estomper — contrairement a `ring` (marque le rayon
    // gameplay exact et bouge peu), celle-ci vend la SENSATION de force qui
    // se propage, jamais lue comme la vraie zone d'effet.
    const shockwave = new THREE.Mesh(
      new THREE.RingGeometry(worldRadius * 0.92, worldRadius, 32),
      new THREE.MeshBasicMaterial({ color: COLORS.iceCore, transparent: true, opacity: 1, side: THREE.DoubleSide }),
    );
    shockwave.rotation.x = -Math.PI / 2;
    shockwave.position.set(x, 0.06, z);
    shockwave.scale.setScalar(0.15);
    this.group.add(shockwave);

    // Dome d'energie : seul element vraiment volumique du visuel (flash/
    // anneau/fissures restent plats au sol) — gonfle bref vers le haut pour
    // donner un vrai "boum" en 3D. Hemisphere (thetaLength = PI/2), fondu
    // additif comme la coque de FireballView (meme technique deja utilisee
    // dans ce projet pour un glow bon marche, pas de nouveau shader).
    // Rayon x0.55 -> x0.85 (2026-08-14, demande explicite d'Antoine : "au
    // moins 50% plus grand") — +54,5% exactement, applique sur la
    // GEOMETRIE elle-meme donc toute la courbe d'animation (scale 0.3 a
    // 1.15) grossit uniformement, sans y retoucher.
    const burstDome = new THREE.Mesh(
      new THREE.SphereGeometry(worldRadius * 0.85, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshBasicMaterial({
        color: COLORS.iceGlow,
        transparent: true,
        opacity: 0.55,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    burstDome.position.set(x, 0.02, z);
    burstDome.scale.setScalar(0.3);
    this.group.add(burstDome);

    // Fissures de givre : jaillissent du point d'impact vers l'exterieur,
    // pivot de la geometrie deplace sur le bord "proche" (translate(0.5,0,0))
    // pour que la croissance de scale.x parte VRAIMENT du centre plutot que
    // de grandir dans les deux sens a la fois.
    const crackRays: ImpactFx['crackRays'] = [];
    for (let i = 0; i < CRACK_RAY_COUNT; i++) {
      const angle = (i / CRACK_RAY_COUNT) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
      const dirX = Math.cos(angle);
      const dirZ = Math.sin(angle);
      const length = worldRadius * (0.45 + Math.random() * 0.45);
      const geometry = new THREE.BoxGeometry(1, 0.015, 0.035 + Math.random() * 0.02);
      geometry.translate(0.5, 0, 0);
      const mesh = new THREE.Mesh(
        geometry,
        new THREE.MeshBasicMaterial({ color: i % 2 === 0 ? COLORS.iceDeep : COLORS.iceCore, transparent: true, opacity: 0.9 }),
      );
      mesh.position.set(x, 0.035, z);
      mesh.rotation.y = Math.atan2(-dirZ, dirX);
      mesh.scale.x = 0.001;
      this.group.add(mesh);
      crackRays.push({ mesh, length });
    }

    const shards: ImpactFx['shards'] = [];
    for (let i = 0; i < SHARD_COUNT; i++) {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.08, 0.16, 0.08),
        new THREE.MeshBasicMaterial({ color: i % 2 === 0 ? COLORS.iceCore : COLORS.iceGlow, transparent: true, opacity: 0.95 }),
      );
      const angle = (i / SHARD_COUNT) * Math.PI * 2;
      const r = Math.random() * worldRadius * 0.6;
      mesh.position.set(x + Math.cos(angle) * r, 0.1, z + Math.sin(angle) * r);
      mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
      this.group.add(mesh);
      shards.push({
        mesh,
        velocity: new THREE.Vector3(Math.cos(angle) * 0.4, SHARD_SPEED * (0.7 + Math.random() * 0.6), Math.sin(angle) * 0.4),
      });
    }

    this.impacts.push({ flash, ring, shockwave, burstDome, crackRays, shards, elapsed: 0 });
  }

  /** A appeler chaque frame (temps reel, comme TelegraphView/FireballView) —
   *  fait avancer le VFX d'impact ponctuel ET synchronise les zones Blizzard
   *  persistantes sur `zones` (voir World.iceNovaZones). */
  sync(zones: PersistentAreaEffect[], dt: number): void {
    const active = new Set(zones);

    for (const zone of zones) {
      let fx = this.zones.get(zone);
      if (!fx) {
        fx = this.buildBlizzardFx(zone.radius);
        this.zones.set(zone, fx);
        this.group.add(fx.group);
      }
      fx.group.position.set(zone.x, 0, zone.z);

      const fadeIn = Math.min(1, zone.elapsed / BLIZZARD_FADE);
      const fadeOut = Math.min(1, (zone.duration - zone.elapsed) / BLIZZARD_FADE);
      const alpha = Math.max(0, Math.min(fadeIn, fadeOut));

      // Pulse a chaque tick de degats REELLEMENT resolu (voir
      // PersistentAreaEffect.ticksFired, incremente par
      // sim/systems/persistentAreaEffects.ts) — un "coup" visuel synchronise
      // sur les vrais impacts plutot qu'un cycle decoratif independant.
      if (zone.ticksFired > fx.lastTicksFired) {
        fx.lastTicksFired = zone.ticksFired;
        fx.pulse = 1;
      }
      fx.pulse = Math.max(0, fx.pulse - dt / BLIZZARD_TICK_PULSE_DURATION);

      (fx.groundTint.material as THREE.MeshBasicMaterial).opacity = Math.min(1, (0.3 + fx.pulse * 0.22) * fx.intensityScale) * alpha;
      (fx.outline.material as THREE.MeshBasicMaterial).opacity = Math.min(1, (0.62 + fx.pulse * 0.35) * fx.intensityScale) * alpha;
      fx.outline.scale.setScalar(1 + fx.pulse * 0.06);

      // Remplissage pale de l'interieur (2026-08-14, "l'interieur de ce
      // cercle [doit etre] teinte d'un bleu pale et transparent") — opacite
      // FAIBLE et FIXE (jamais multipliee par intensityScale, meme
      // philosophie que le rond de bordure ci-dessous), ne bouge PAS avec le
      // pulse (contrairement au rond de bordure : seule la BORDURE grossit a
      // chaque tick, demande explicite d'Antoine — "l'idee d'agrandir la
      // bordure... est une tres bonne idee").
      (fx.boundaryFill.material as THREE.MeshBasicMaterial).opacity = Math.min(1, 0.22 + fx.pulse * 0.06) * alpha;

      // Rond bleu de bordure (2026-08-14, "affiche bien un rond bleu au sol
      // indiquant la zone de radius") — opacite FORTE et FIXE, jamais
      // multipliee par intensityScale : reste tout aussi net dans les deux
      // styles, ne se fait jamais eclipser par les particules amplifiees.
      (fx.boundaryRing.material as THREE.MeshBasicMaterial).opacity = Math.min(1, 0.9 + fx.pulse * 0.1) * alpha;
      fx.boundaryRing.scale.setScalar(1 + fx.pulse * 0.05);

      for (const flake of fx.flakes) {
        flake.phase = (flake.phase + dt * flake.speed) % 1;
        // Chute + DERIVE laterale (vent fixe, voir BLIZZARD_WIND) : une
        // tempete qui souffle plutot qu'une neige qui tombe droit.
        flake.mesh.position.y = flake.baseY * (1 - flake.phase);
        flake.mesh.position.x = flake.originX + BLIZZARD_WIND.x * flake.driftDist * flake.phase;
        flake.mesh.position.z = flake.originZ + BLIZZARD_WIND.y * flake.driftDist * flake.phase;
        if (flake.mesh instanceof THREE.Sprite) {
          // Style 'textured' : un Sprite n'a qu'un roulis 2D (material.rotation),
          // jamais de rotation.x/y/z (toujours face camera par definition).
          flake.mesh.material.rotation += flake.spinX * dt;
        } else {
          flake.mesh.rotation.x += flake.spinX * dt;
          flake.mesh.rotation.z += flake.spinZ * dt;
        }
        setOpacity(flake.mesh, Math.min(1, 0.85 * fx.intensityScale * alpha * (1 - flake.phase * 0.2)));
      }

      // Traits de vent tournant autour de la zone (voir WIND_STREAK_COUNT) —
      // chaque pivot tourne a sa propre vitesse (rotation.y), le sillage
      // reste un ENFANT du meme pivot donc suit automatiquement sans calcul
      // supplementaire. Opacite boostee legerement par le pulse de tick,
      // comme le reste de la zone, pour rester coherent avec le "coup" visuel.
      const streakOpacityBoost = 1 + fx.pulse * 0.3;
      for (const streak of fx.windStreaks) {
        streak.pivot.rotation.y += streak.angularSpeed * dt;
        (streak.mesh.material as THREE.MeshBasicMaterial).opacity = Math.min(1, 0.75 * fx.intensityScale * alpha * streakOpacityBoost);
        (streak.trailMesh.material as THREE.MeshBasicMaterial).opacity = Math.min(1, 0.32 * fx.intensityScale * alpha * streakOpacityBoost);
      }

      // Tourbillon AERIEN (2026-08-14, distinct des traits de vent au sol) —
      // orbite a hauteur variable au-dessus de la zone, plus vite pres du
      // centre (effet "tornade"), avec un bobbing vertical doux.
      for (const swirl of fx.airSwirls) {
        swirl.angle += swirl.angularSpeed * dt;
        swirl.bobPhase += swirl.bobSpeed * dt;
        const y = swirl.baseY + Math.sin(swirl.bobPhase) * swirl.bobAmplitude;
        swirl.mesh.position.set(Math.cos(swirl.angle) * swirl.radius, y, Math.sin(swirl.angle) * swirl.radius);
        if (swirl.mesh instanceof THREE.Sprite) {
          swirl.mesh.material.rotation += dt * 2;
        } else {
          swirl.mesh.rotation.x += dt * 2;
          swirl.mesh.rotation.y += dt * 1.4;
        }
        setOpacity(swirl.mesh, Math.min(1, 0.7 * fx.intensityScale * alpha * streakOpacityBoost));
      }
    }

    for (const [zone, fx] of this.zones) {
      if (active.has(zone)) continue;
      this.disposeBlizzardFx(fx);
      this.zones.delete(zone);
    }

    this.tickImpacts(dt);
  }

  private tickImpacts(dt: number): void {
    for (let i = this.impacts.length - 1; i >= 0; i--) {
      const fx = this.impacts[i]!;
      fx.elapsed += dt;

      const flashT = Math.min(1, fx.elapsed / IMPACT_FLASH_DURATION);
      (fx.flash.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.85 * (1 - flashT));
      fx.flash.scale.setScalar(1 + flashT * 0.4);

      const ringT = Math.min(1, fx.elapsed / IMPACT_RING_DURATION);
      (fx.ring.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.9 * (1 - ringT));
      fx.ring.scale.setScalar(1 + ringT * 0.5);

      // Onde de choc : croissance RAPIDE (ease-out) au-dela du rayon reel
      // puis fondu — c'est elle qui porte la sensation de "boum qui se
      // propage", jamais lue comme la vraie zone d'effet (voir `ring`
      // ci-dessus pour ca).
      const shockT = Math.min(1, fx.elapsed / IMPACT_SHOCKWAVE_DURATION);
      const shockEase = 1 - (1 - shockT) * (1 - shockT);
      fx.shockwave.scale.setScalar(0.15 + shockEase * 1.35);
      (fx.shockwave.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 1 - shockT);

      // Dome d'energie : gonfle puis retombe en opacite, seul element
      // vraiment volumique du visuel.
      const domeT = Math.min(1, fx.elapsed / IMPACT_BURST_DOME_DURATION);
      const domeEase = 1 - (1 - domeT) * (1 - domeT);
      fx.burstDome.scale.setScalar(0.3 + domeEase * 0.85);
      (fx.burstDome.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.55 * (1 - domeT));

      // Fissures : jaillissent vite (ease-out sur la longueur) puis
      // s'estompent sur le reste de leur duree.
      const crackT = Math.min(1, fx.elapsed / IMPACT_CRACK_DURATION);
      const crackGrowth = 1 - (1 - Math.min(1, crackT * 1.8)) * (1 - Math.min(1, crackT * 1.8));
      for (const crack of fx.crackRays) {
        crack.mesh.scale.x = Math.max(0.001, crack.length * crackGrowth);
        (crack.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.9 * (1 - crackT));
      }

      for (const shard of fx.shards) {
        shard.velocity.y -= SHARD_GRAVITY * dt;
        shard.mesh.position.addScaledVector(shard.velocity, dt);
        const t = fx.elapsed / SHARD_LIFETIME;
        (shard.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.95 * (1 - t));
      }

      const maxDuration = Math.max(
        IMPACT_FLASH_DURATION,
        IMPACT_RING_DURATION,
        IMPACT_SHOCKWAVE_DURATION,
        IMPACT_BURST_DOME_DURATION,
        IMPACT_CRACK_DURATION,
        SHARD_LIFETIME,
      );
      if (fx.elapsed >= maxDuration) {
        this.group.remove(
          fx.flash,
          fx.ring,
          fx.shockwave,
          fx.burstDome,
          ...fx.crackRays.map((c) => c.mesh),
          ...fx.shards.map((s) => s.mesh),
        );
        this.impacts.splice(i, 1);
      }
    }
  }

  /** Dispatcher de style — voir BLIZZARD_VFX_STYLE en tete de fichier.
   *  AUCUNE autre logique ici : le choix se fait une seule fois, a la
   *  CONSTRUCTION de la zone (le style ne change jamais en cours de vol). */
  private buildBlizzardFx(radius: number): BlizzardFx {
    return BLIZZARD_VFX_STYLE === 'textured' ? buildBlizzardFxTextured(radius) : buildBlizzardFxProcedural(radius);
  }

  private disposeBlizzardFx(fx: BlizzardFx): void {
    this.group.remove(fx.group);
  }

  /** Nettoyage complet (fin de bataille...) — jamais de zone/particule
   *  fantome apres un changement de vague. */
  clear(): void {
    for (const fx of this.impacts) {
      this.group.remove(
        fx.flash,
        fx.ring,
        fx.shockwave,
        fx.burstDome,
        ...fx.crackRays.map((c) => c.mesh),
        ...fx.shards.map((s) => s.mesh),
      );
    }
    this.impacts.length = 0;
    for (const fx of this.zones.values()) this.disposeBlizzardFx(fx);
    this.zones.clear();
    for (const fx of this.frostIndicators.values()) this.group.remove(fx);
    this.frostIndicators.clear();
    this.hideTargetPreview();
  }
}

/** Zone Blizzard, style 'procedural' — retouchee le 2026-08-14 (retour
 *  d'Antoine : "ça neige joyeusement plutôt qu'un réel blizzard
 *  dévastateur") : plus dense, plus rapide, derive au vent, eclats anguleux
 *  (pas des cubes uniformes) en palette contrastee (glace vive + glace
 *  sombre), teinte au sol et contour plus marques, avec un "coup" visuel a
 *  chaque tick de degats reel (voir sync). Reste dans les memes garde-fous
 *  qu'avant : pas de brouillard opaque, pas d'effet qui masque les unites,
 *  pas de neon. INTACTE depuis le passage au style 'textured' (voir
 *  BLIZZARD_VFX_STYLE) — extraite de la classe telle quelle, aucune ligne
 *  modifiee, immediatement restaurable. */
function buildBlizzardFxProcedural(radius: number): BlizzardFx {
    const worldRadius = radius * TILE;
    const group = new THREE.Group();

    const groundTint = new THREE.Mesh(
      new THREE.CircleGeometry(worldRadius, 28),
      new THREE.MeshBasicMaterial({ color: COLORS.iceDeep, transparent: true, opacity: 0, side: THREE.DoubleSide }),
    );
    groundTint.rotation.x = -Math.PI / 2;
    groundTint.position.y = 0.02;
    group.add(groundTint);

    const outline = new THREE.Mesh(
      new THREE.RingGeometry(worldRadius * 0.94, worldRadius, 40),
      new THREE.MeshBasicMaterial({ color: COLORS.iceGlow, transparent: true, opacity: 0, side: THREE.DoubleSide }),
    );
    outline.rotation.x = -Math.PI / 2;
    outline.position.y = 0.03;
    group.add(outline);

    const boundaryFill = buildBoundaryFill(worldRadius);
    group.add(boundaryFill);
    const boundaryRing = buildBoundaryRing(worldRadius);
    group.add(boundaryRing);

    const flakes: BlizzardFlake[] = [];
    for (let i = 0; i < BLIZZARD_FLAKE_COUNT; i++) {
      // Alterne petits eclats cubiques et debris allonges (pas de vrai
      // systeme de particules, juste deux formes simples melangees) — melange
      // de glace vive (iceCore) et de glace plus sombre/turbulente (iceDeep),
      // avec quelques accents iceGlow, pour une lecture plus "eclats de
      // tempete" qu'une neige uniformement blanche.
      const elongated = i % 3 === 0;
      const size = 0.05 + Math.random() * 0.05;
      const geometry = elongated ? new THREE.BoxGeometry(size * 0.5, size * 2.4, size * 0.5) : new THREE.BoxGeometry(size, size, size);
      const colorRoll = Math.random();
      const color = colorRoll < 0.4 ? COLORS.iceCore : colorRoll < 0.75 ? COLORS.iceDeep : COLORS.iceGlow;
      const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0 }));

      const angle = Math.random() * Math.PI * 2;
      const r = Math.random() * worldRadius * 0.9;
      const originX = Math.cos(angle) * r;
      const originZ = Math.sin(angle) * r;
      const baseY = 1.3 + Math.random() * 0.9;
      mesh.position.set(originX, baseY, originZ);
      mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
      group.add(mesh);
      flakes.push({
        mesh,
        // Chute nettement plus rapide qu'avant (0.4-0.7 -> 1.1-1.9) : un
        // cycle de ~0.5-0.9s au lieu de ~1.4-2.5s, ca "rushe" plutot que de
        // deriver tranquillement.
        speed: 1.1 + Math.random() * 0.8,
        baseY,
        originX,
        originZ,
        driftDist: worldRadius * (0.25 + Math.random() * 0.35),
        spinX: (Math.random() - 0.5) * 6,
        spinZ: (Math.random() - 0.5) * 6,
        phase: Math.random(),
      });
    }

    // Traits de vent (2026-08-14, retour d'Antoine : "encore un peu mou...
    // un effet de petit trait tournant autour de la zone") — des arcs fins
    // (segments de RingGeometry a des rayons etages) portes par un pivot
    // qui tourne autour du centre de la zone, TOUS dans le meme sens pour
    // lire comme un vent qui souffle en tourbillon plutot qu'un chaos.
    const windStreaks: WindStreak[] = [];
    for (let i = 0; i < WIND_STREAK_COUNT; i++) {
      const radiusFrac = 0.3 + (i / Math.max(1, WIND_STREAK_COUNT - 1)) * 0.6;
      const midR = worldRadius * radiusFrac;
      const bandHalfWidth = worldRadius * 0.035;
      const innerR = Math.max(0.01, midR - bandHalfWidth);
      const outerR = midR + bandHalfWidth;
      const color = i % 2 === 0 ? COLORS.iceGlow : COLORS.iceCore;
      const mainThetaStart = Math.random() * Math.PI * 2;

      const pivot = new THREE.Group();
      pivot.rotation.y = Math.random() * Math.PI * 2;

      const mesh = new THREE.Mesh(
        new THREE.RingGeometry(innerR, outerR, 20, 1, mainThetaStart, WIND_STREAK_ARC_LENGTH),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, side: THREE.DoubleSide }),
      );
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.y = 0.06 + i * 0.004;
      pivot.add(mesh);

      // Sillage : meme bande, juste "derriere" en angle LOCAL — comme TOUT le
      // pivot tourne ensemble dans un seul sens (angularSpeed > 0 pour tous),
      // un decalage negatif fixe reste toujours en retrait du trait principal.
      const trailMesh = new THREE.Mesh(
        new THREE.RingGeometry(innerR, outerR, 20, 1, mainThetaStart - WIND_STREAK_TRAIL_ARC, WIND_STREAK_TRAIL_ARC),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, side: THREE.DoubleSide }),
      );
      trailMesh.rotation.x = -Math.PI / 2;
      trailMesh.position.y = mesh.position.y;
      pivot.add(trailMesh);

      group.add(pivot);
      windStreaks.push({ pivot, mesh, trailMesh, angularSpeed: 1.8 + Math.random() * 1.8 });
    }

    // Tourbillon AERIEN (2026-08-14, retour d'Antoine : "un autre effet
    // tourbillonnant en petite particule différente... qui tournoie en
    // l'air et pas au sol") — distinct des traits de vent (au sol, sur des
    // arcs) : de petits eclats qui orbitent a des HAUTEURS variees
    // au-dessus de la zone, plus vite pres du centre (effet "tornade").
    const airSwirls: AirSwirlParticle[] = [];
    for (let i = 0; i < AIR_SWIRL_COUNT; i++) {
      const radiusFrac = 0.1 + Math.random() * 0.75;
      const radius = worldRadius * radiusFrac;
      const size = 0.045 + Math.random() * 0.03;
      const color = Math.random() < 0.6 ? COLORS.iceCore : COLORS.iceGlow;
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(size, size, size),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0 }),
      );
      mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
      group.add(mesh);
      airSwirls.push({
        mesh,
        angle: Math.random() * Math.PI * 2,
        // Plus rapide pres du centre (1 - radiusFrac) : lecture "tornade"
        // plutot qu'un simple carrousel a vitesse uniforme.
        angularSpeed: 1.2 + (1 - radiusFrac) * 2.2 + Math.random() * 0.6,
        radius,
        baseY: 0.5 + Math.random() * 1.7,
        bobAmplitude: 0.1 + Math.random() * 0.15,
        bobSpeed: 1 + Math.random() * 1.5,
        bobPhase: Math.random() * Math.PI * 2,
      });
    }

  return { group, groundTint, outline, boundaryRing, boundaryFill, flakes, windStreaks, airSwirls, lastTicksFired: 0, pulse: 0, intensityScale: 1 };
}

/** Zone Blizzard, style 'textured' (2026-08-14, demande d'Antoine : "vois ce
 *  que tu peux faire pour le blizzard avec les vfx") — memes elements que la
 *  version procedurale (groundTint/outline/flakes/windStreaks/airSwirls),
 *  batis a partir de vraies textures plutot que des formes Box/Ring pures.
 *  Meme "pulse"/fondu entree-sortie/derive au vent — c'est `sync()` (au-dessus
 *  dans la classe, ENTIEREMENT PARTAGE entre les deux styles) qui anime les
 *  deux de la meme facon. */
function buildBlizzardFxTextured(radius: number): BlizzardFx {
  const worldRadius = radius * TILE;
  const group = new THREE.Group();

  // Teinte au sol : circle_05 (vignette radiale douce), fondu NORMAL —
  // se lit comme une ombre de tempete qui assombrit le sol, pas un glow
  // (voir la lecon additif/normal documentee dans CLAUDE.md).
  const groundTint = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({
      map: blizzardGroundTexture,
      color: COLORS.iceDeep,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  groundTint.rotation.x = -Math.PI / 2;
  groundTint.position.y = 0.02;
  groundTint.scale.setScalar(worldRadius * 2);
  group.add(groundTint);

  // Contour : circle_02 (anneau net), fondu NORMAL aussi — une icone de
  // rim doit rester crisp, l'additif la delaverait (meme lecon).
  const outline = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({
      map: blizzardOutlineTexture,
      color: COLORS.iceGlow,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  outline.rotation.x = -Math.PI / 2;
  outline.position.y = 0.03;
  outline.scale.setScalar(worldRadius * 2.05);
  group.add(outline);

  // Remplissage bleu pale + rond de bordure — voir buildBoundaryFill/
  // buildBoundaryRing en tete de fichier. MEME construction que le style
  // procedural (partagee, jamais concernee par le texture/l'amplification) :
  // garantit que le rayon reste toujours lisible malgre les particules
  // amplifiees.
  const boundaryFill = buildBoundaryFill(worldRadius);
  group.add(boundaryFill);
  const boundaryRing = buildBoundaryRing(worldRadius);
  group.add(boundaryRing);

  // Flocons : Sprite (toujours face camera) au lieu de cubes — star_01/
  // star_04 en alternance, glow additif (petits eclats lumineux, la
  // convention additive convient bien ici, contrairement a une icone pleine).
  const flakes: BlizzardFlake[] = [];
  for (let i = 0; i < BLIZZARD_FLAKE_COUNT_TEXTURED; i++) {
    const texture = i % 2 === 0 ? blizzardFlakeTextureA : blizzardFlakeTextureB;
    const colorRoll = Math.random();
    const color = colorRoll < 0.4 ? COLORS.iceCore : colorRoll < 0.75 ? COLORS.iceDeep : COLORS.iceGlow;
    const mesh = buildGlowSprite(texture, color);
    // Taille quasi doublee (2026-08-14, "amplifie... plus visible") —
    // 0.16-0.30 -> 0.32-0.56.
    const size = 0.32 + Math.random() * 0.24;
    mesh.scale.setScalar(size);

    const angle = Math.random() * Math.PI * 2;
    const r = Math.random() * worldRadius * 0.9;
    const originX = Math.cos(angle) * r;
    const originZ = Math.sin(angle) * r;
    const baseY = 1.3 + Math.random() * 0.9;
    mesh.position.set(originX, baseY, originZ);
    group.add(mesh);
    flakes.push({
      mesh,
      speed: 1.1 + Math.random() * 0.8,
      baseY,
      originX,
      originZ,
      driftDist: worldRadius * (0.25 + Math.random() * 0.35),
      // Roulis 2D (material.rotation) — voir sync(), spinZ inutilise ici.
      spinX: (Math.random() - 0.5) * 6,
      spinZ: 0,
      phase: Math.random(),
    });
  }

  // Traits de vent : plans texturees (twirl_02, un vrai motif de tourbillon)
  // au lieu d'arcs de RingGeometry — meme pivot tournant, positionnes a un
  // rayon fixe en LOCAL (au lieu d'un theta d'arc) : le pivot les entraine
  // en cercle exactement comme la version procedurale.
  const windStreaks: WindStreak[] = [];
  for (let i = 0; i < WIND_STREAK_COUNT_TEXTURED; i++) {
    const radiusFrac = 0.3 + (i / Math.max(1, WIND_STREAK_COUNT_TEXTURED - 1)) * 0.6;
    const midR = worldRadius * radiusFrac;
    // Icone de tourbillon nettement plus grande (2026-08-14, "plus visible")
    // — 0.42 -> 0.62 du rayon de la zone.
    const size = worldRadius * 0.62;
    const color = i % 2 === 0 ? COLORS.iceGlow : COLORS.iceCore;
    const meshY = 0.06 + i * 0.004;

    const pivot = new THREE.Group();
    pivot.rotation.y = Math.random() * Math.PI * 2;

    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        map: blizzardStreakTexture,
        color,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(midR, meshY, 0);
    mesh.scale.setScalar(size);
    pivot.add(mesh);

    // Sillage : meme texture, plus petit/faible, decale en angle LOCAL fixe
    // "derriere" (angle negatif, oppose au sens de rotation positif du
    // pivot) — comme tout le pivot tourne ensemble, ce decalage reste
    // TOUJOURS en retrait, meme principe que la version procedurale mais
    // via une position plutot qu'un theta d'arc.
    const trailAngle = -WIND_STREAK_TRAIL_ARC * 1.6;
    const trailMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        map: blizzardStreakTexture,
        color,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    trailMesh.rotation.x = -Math.PI / 2;
    trailMesh.position.set(midR * Math.cos(trailAngle), meshY, midR * Math.sin(trailAngle));
    trailMesh.scale.setScalar(size * 0.8);
    pivot.add(trailMesh);

    group.add(pivot);
    windStreaks.push({ pivot, mesh, trailMesh, angularSpeed: 1.8 + Math.random() * 1.8 });
  }

  // Tourbillon aerien : Sprite (face camera) au lieu de cubes, memes
  // trajectoires (orbite + bobbing) que la version procedurale.
  const airSwirls: AirSwirlParticle[] = [];
  for (let i = 0; i < AIR_SWIRL_COUNT_TEXTURED; i++) {
    const radiusFrac = 0.1 + Math.random() * 0.75;
    const swirlRadius = worldRadius * radiusFrac;
    const texture = i % 2 === 0 ? blizzardFlakeTextureB : blizzardFlakeTextureA;
    const color = Math.random() < 0.6 ? COLORS.iceCore : COLORS.iceGlow;
    const mesh = buildGlowSprite(texture, color);
    // Taille quasi doublee (2026-08-14, "amplifie... plus visible") —
    // 0.14-0.24 -> 0.28-0.46.
    const size = 0.28 + Math.random() * 0.18;
    mesh.scale.setScalar(size);
    group.add(mesh);
    airSwirls.push({
      mesh,
      angle: Math.random() * Math.PI * 2,
      angularSpeed: 1.2 + (1 - radiusFrac) * 2.2 + Math.random() * 0.6,
      radius: swirlRadius,
      baseY: 0.5 + Math.random() * 1.7,
      bobAmplitude: 0.1 + Math.random() * 0.15,
      bobSpeed: 1 + Math.random() * 1.5,
      bobPhase: Math.random() * Math.PI * 2,
    });
  }

  return { group, groundTint, outline, boundaryRing, boundaryFill, flakes, windStreaks, airSwirls, lastTicksFired: 0, pulse: 0, intensityScale: TEXTURED_INTENSITY };
}

/** Petit anneau de givre au sol + quelques eclats de glace anguleux plantes
 *  autour des pieds — volontairement modeste ("petit cristal/givre",
 *  demande d'Antoine), jamais plus large que la silhouette d'une unite. */
function buildFrostShards(): THREE.Group {
  const group = new THREE.Group();

  // Agrandis le 2026-08-14 (demande explicite d'Antoine : "plus volumineux,
  // plus encombrant") — anneau, nombre, epaisseur et hauteur des eclats tous
  // revus a la hausse par rapport a la premiere version, trop discrete.
  const ring = new THREE.Mesh(
    new THREE.CircleGeometry(0.52, 20),
    new THREE.MeshBasicMaterial({ color: COLORS.iceGlow, transparent: true, opacity: 0.4, side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.015;
  group.add(ring);

  const shardCount = 7;
  for (let i = 0; i < shardCount; i++) {
    const height = 0.22 + Math.random() * 0.16;
    const width = 0.09 + Math.random() * 0.04;
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(width, height, width),
      new THREE.MeshBasicMaterial({ color: i % 2 === 0 ? COLORS.iceCore : COLORS.iceGlow }),
    );
    const angle = (i / shardCount) * Math.PI * 2 + Math.random() * 0.4;
    const r = 0.22 + Math.random() * 0.2;
    mesh.position.set(Math.cos(angle) * r, height / 2, Math.sin(angle) * r);
    mesh.rotation.set((Math.random() - 0.5) * 0.6, Math.random() * Math.PI, (Math.random() - 0.5) * 0.6);
    group.add(mesh);
  }

  return group;
}
