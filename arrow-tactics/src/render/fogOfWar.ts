import * as THREE from 'three';
import { FOG_EDGE_ANIM_BAND, FOG_EDGE_GLSL, FOG_EDGE_RANGE, FOG_EDGE_SCALE, FOG_EDGE_TIMING, fogEdgeUniforms } from './fogEdge';
import { MIST_CLOUDS_GLSL, mistCloudsHalfRes, mistCloudsMode, mistCloudUniforms, tickMistClouds } from './mistClouds';

/**
 * Brouillard de guerre (2026-11-01, Hero RTS) : systeme de PRESENTATION et
 * d'information, jamais lu par la simulation (determinisme intact). Trois
 * etats par case : jamais exploree (noir), exploree hors vision (terrain
 * memorise, assombri ; unites adverses masquees), visible (normal).
 *
 * Grille calculee a partir des positions des sources de vision du joueur
 * (Heros, Baliste, unites, batiments) ; rendue par une passe plein ecran qui
 * relit la profondeur (FogOfWarPass), donc pour tout le decor sans toucher
 * aux materiaux.
 *
 * Lisiere (2026-11-09, render/fogEdge.ts) : la texture de la grille porte,
 * en plus de l'etat (R), la distance signee de chaque case a la lisiere du
 * visible (G) et a celle de l'explore (B). La passe et les Mist Clouds lisent
 * ces distances, deplacees par un bruit en espace monde, au lieu de l'etat
 * lu en bilineaire : la frontiere visuelle est continue et irreguliere au
 * lieu de suivre les bords des cases. L'etat (FogOfWar.state, isVisible) reste
 * seul juge de la visibilite gameplay.
 *
 * Mouvement (2026-11-09, durees FOG_EDGE_TIMING VALIDEES en jeu, voir
 * docs/DESIGN_DECISIONS.md A6) : la texture porte le
 * champ AFFICHE, anime par case vers sa cible. Cible recalculee seulement
 * quand un ensemble de cases change ; animation a chaque image tant qu'une
 * case n'a pas rejoint sa cible. L'etat de jeu, lui, change instantanement.
 */
export const FOG_UNSEEN = 0;
export const FOG_EXPLORED = 1;
export const FOG_VISIBLE = 2;

/** Rayons de vision : data/vision.ts (partages avec la vision gameplay). */
export { VISION_RADIUS } from '../data/vision';

/** Marge (cases) de la grille autour de la carte : le fond sous brume y suit la vision, de part et
 *  d'autre du bord (assez large pour tout rayon de VISION_RADIUS). Hors de la carte, jamais lue par
 *  le jeu ni par une unite. */
export const FOG_GRID_MARGIN = 24;

/** Couche (THREE.Layers) des reperes de jeu prioritaires (plaque de placement, anneaux de selection
 *  et de depot, marqueurs de ralliement) : rendus par FogOfWarPass APRES la composition brouillard +
 *  nappes, donc jamais voiles ni assombris. Sans la passe (editeur, test de scenario), la camera a
 *  aussi cette couche activee (Renderer) et ces objets se rendent comme les autres. Un objet marque
 *  ici doit etre un repere non eclaire (materiau basic ou ligne) : son materiau recoit le test de
 *  profondeur contre la scene opaque deja rendue (overlayDepthUniforms), pas de lumiere. */
export const GAMEPLAY_OVERLAY_LAYER = 1;

/** Profondeur opaque de la scene pour les reperes prioritaires : la DepthTexture que la passe a deja
 *  resolue pour reconstruire les positions monde, relue par chaque fragment de repere (meme camera,
 *  meme projection : comparaison directe en profondeur fenetre avec gl_FragCoord.z, aucune
 *  reconstruction). (x) test actif 0/1 : hors de la passe (editeur, scenario), 0, et le materiau se
 *  comporte comme un materiau basic ordinaire ; (y) biais en profondeur fenetre. */
export const overlayDepthUniforms = {
  tOverlayDepth: { value: null as THREE.Texture | null },
  uOverlayDepthSize: { value: new THREE.Vector2(1, 1) },
  uOverlayDepthTest: { value: new THREE.Vector2(0, 0) },
};

/** Biais du test (unites monde le long de la ligne de vue, camera orthographique : profondeur
 *  lineaire). Un repere est pose 0,03 au-dessus du sol, soit ~0,025 devant le sol sur la ligne de
 *  vue (inclinaison 55°) : ce biais de reference, 0,01, garde une plaque ou un marqueur net au sol ;
 *  une facade entre la camera et le repere l'ecarte de bien plus, donc il est masque des le pied du
 *  mur. Chaque materiau applique un FACTEUR a ce biais (makeOverlayDepthAware) : les anneaux d'unite
 *  en prennent une fraction (render/unitSelectionRing.ts), car l'arc avant de l'anneau et les pieds
 *  de l'unite ne sont separes que de quelques millimetres de profondeur : avec 0,01 entier, les
 *  pieds ne masquaient plus l'anneau, qui semblait peint devant les jambes (2026-11-08). */
export const OVERLAY_DEPTH_BIAS = 0.01;

const overlayDepthMaterials = new WeakSet<THREE.Material>();

/** Le materiau relit la profondeur opaque de la scene (overlayDepthUniforms) et abandonne tout
 *  fragment situe derriere elle, a `biasScale` x OVERLAY_DEPTH_BIAS pres. Idempotent ; un clone du
 *  materiau est a marquer a son tour. */
export function makeOverlayDepthAware(material: THREE.Material, biasScale = 1): void {
  if (overlayDepthMaterials.has(material)) return;
  overlayDepthMaterials.add(material);
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, overlayDepthUniforms, { uOverlayBiasScale: { value: biasScale } });
    shader.fragmentShader = shader.fragmentShader.replace(
      'void main() {',
      /* glsl */ `uniform sampler2D tOverlayDepth;
        uniform vec2 uOverlayDepthSize;
        uniform vec2 uOverlayDepthTest;
        uniform float uOverlayBiasScale;
        void main() {
          if (uOverlayDepthTest.x > 0.5 && gl_FragCoord.z > texture2D(tOverlayDepth, gl_FragCoord.xy / uOverlayDepthSize).x + uOverlayDepthTest.y * uOverlayBiasScale) discard;`,
    );
  };
  material.customProgramCacheKey = () => 'overlayDepth';
}

export function isOverlayDepthAware(material: THREE.Material): boolean {
  return overlayDepthMaterials.has(material);
}

/** Place `object` et ses descendants dans la couche des reperes prioritaires et rend leurs
 *  materiaux sensibles a la profondeur de la scene (makeOverlayDepthAware, facteur de biais
 *  `biasScale`). */
export function markGameplayOverlay(object: THREE.Object3D, biasScale = 1): void {
  object.traverse((o) => {
    o.layers.set(GAMEPLAY_OVERLAY_LAYER);
    const material = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
    if (!material) return;
    for (const m of Array.isArray(material) ? material : [material]) makeOverlayDepthAware(m, biasScale);
  });
}

export interface VisionSource {
  x: number;
  z: number;
  radius: number;
}

export class FogOfWar {
  /** Taille de la grille (cases) et coin (monde) de la case (0, 0). */
  readonly width: number;
  readonly height: number;
  readonly minX: number;
  readonly minZ: number;
  /** Etat par case (FOG_*). */
  readonly state: Uint8Array;
  /** Texture de la grille, RGBA par case, valeurs AFFICHEES (animees) : R etat (0, 128, 255) ; G et B
   *  distances signees (cases, 128 + d * FOG_EDGE_SCALE, bornees a +-FOG_EDGE_RANGE) a la lisiere du
   *  visible et a celle de l'explore, positives a l'interieur (render/fogEdge.ts). Une fois le
   *  mouvement termine, valeurs exactes de la vision reelle. Lue par la passe plein ecran et la
   *  Ground Mist ; jamais par le gameplay (state, isVisible, isExplored). */
  readonly texture: THREE.DataTexture;
  private readonly pixels: Uint8Array;
  /** Tampons de la transformee de distance (reutilises a chaque mise a jour). */
  private readonly mask: Uint8Array;
  private readonly distIn: Float32Array;
  private readonly distOut: Float32Array;
  /** Vision RETENUE, rendu seulement : case visible maintenant ou depuis moins de
   *  FOG_EDGE_TIMING.hold secondes (holdLeft : temps restant). La lisiere du visible AFFICHEE est
   *  calculee sur cet ensemble ; le gameplay ne le lit jamais. */
  private readonly held: Uint8Array;
  private readonly holdLeft: Float32Array;
  /** Case revenue en vision depuis moins de FOG_EDGE_TIMING.hold secondes (temps restant) : elle ne
   *  se referme pas devant la source qui revient, alors que sa cible est encore en train de monter. */
  private readonly graceLeft: Float32Array;
  /** Case deja connue (etat non inexplore). */
  private readonly known: Uint8Array;
  /** Par canal : cible, valeur affichee, vitesse de la rampe en cours (0 : a calculer). */
  private readonly targetVis: Float32Array;
  private readonly shownVis: Float32Array;
  private readonly rateVis: Float32Array;
  private readonly targetKnown: Float32Array;
  private readonly shownKnown: Float32Array;
  private readonly rateKnown: Float32Array;
  private readonly targetState: Float32Array;
  private readonly shownState: Float32Array;
  private readonly rateState: Float32Array;
  private initialized = false;
  private animating = false;
  private lastTime = -1;
  /** Horloge du mouvement arretee (partie en pause) : rien ne s'ouvre ni ne se referme. */
  paused = false;
  /** Duree (ms) du calcul des distances a la derniere image (0 si aucun ensemble n'a change). */
  lastEdgeMs = 0;
  /** Duree (ms) de l'animation a la derniere image (0 si tout est stabilise). */
  lastAnimMs = 0;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.minX = -width / 2;
    this.minZ = -height / 2;
    this.state = new Uint8Array(width * height);
    this.pixels = new Uint8Array(width * height * 4);
    this.mask = new Uint8Array(width * height);
    this.distIn = new Float32Array(width * height);
    this.distOut = new Float32Array(width * height);
    const n = width * height;
    this.held = new Uint8Array(n);
    this.holdLeft = new Float32Array(n);
    this.graceLeft = new Float32Array(n);
    this.known = new Uint8Array(n);
    this.targetVis = new Float32Array(n);
    this.shownVis = new Float32Array(n);
    this.rateVis = new Float32Array(n);
    this.targetKnown = new Float32Array(n);
    this.shownKnown = new Float32Array(n);
    this.rateKnown = new Float32Array(n);
    this.targetState = new Float32Array(n);
    this.shownState = new Float32Array(n);
    this.rateState = new Float32Array(n);
    this.texture = new THREE.DataTexture(this.pixels, width, height, THREE.RGBAFormat, THREE.UnsignedByteType);
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.needsUpdate = true;
  }

  /** Distance (cases) de chaque case marquee (mask = 1) a la case non marquee la plus proche
   *  (chamfer 1 / racine de 2, deux balayages ; hors grille = non marque). 0 pour une case non
   *  marquee. */
  private chamfer(dist: Float32Array): void {
    const { width: w, height: h, mask } = this;
    const SQ = Math.SQRT2;
    for (let i = 0; i < dist.length; i++) dist[i] = mask[i] ? 1e6 : 0;
    for (let z = 0; z < h; z++) {
      for (let x = 0; x < w; x++) {
        const i = z * w + x;
        let d = dist[i]!;
        if (d === 0) continue;
        if (x === 0 || z === 0) d = Math.min(d, 1);
        if (x > 0) d = Math.min(d, dist[i - 1]! + 1);
        if (z > 0) {
          d = Math.min(d, dist[i - w]! + 1);
          if (x > 0) d = Math.min(d, dist[i - w - 1]! + SQ);
          if (x < w - 1) d = Math.min(d, dist[i - w + 1]! + SQ);
        }
        dist[i] = d;
      }
    }
    for (let z = h - 1; z >= 0; z--) {
      for (let x = w - 1; x >= 0; x--) {
        const i = z * w + x;
        let d = dist[i]!;
        if (d === 0) continue;
        if (x === w - 1 || z === h - 1) d = Math.min(d, 1);
        if (x < w - 1) d = Math.min(d, dist[i + 1]! + 1);
        if (z < h - 1) {
          d = Math.min(d, dist[i + w]! + 1);
          if (x < w - 1) d = Math.min(d, dist[i + w + 1]! + SQ);
          if (x > 0) d = Math.min(d, dist[i + w - 1]! + SQ);
        }
        dist[i] = d;
      }
    }
  }

  /** Distance signee (cases, bornee) a la lisiere de l'ensemble `inside`, ecrite dans `target` :
   *  positive dedans, negative dehors. Une case dont la cible change DANS la bande visible repart de
   *  ce qui est affiche ; hors de la bande, la rampe en cours garde sa vitesse (sa duree reste exacte). */
  private edgeField(inside: Uint8Array, target: Float32Array, rate: Float32Array): void {
    const { mask, distIn, distOut } = this;
    mask.set(inside);
    this.chamfer(distIn);
    for (let i = 0; i < mask.length; i++) mask[i] = 1 - mask[i]!;
    this.chamfer(distOut);
    const range = FOG_EDGE_RANGE;
    const { lo, hi } = FOG_EDGE_ANIM_BAND;
    for (let i = 0; i < mask.length; i++) {
      const d = inside[i] ? distIn[i]! : -distOut[i]!;
      const c = d > range ? range : d < -range ? -range : d;
      const old = target[i]!;
      if (old === c) continue;
      target[i] = c;
      const oldBand = old < lo ? lo : old > hi ? hi : old;
      const newBand = c < lo ? lo : c > hi ? hi : c;
      if (oldBand !== newBand) rate[i] = 0;
    }
  }

  /** Cibles recalculees seulement si l'ensemble des cases retenues ou connues a change. */
  private refreshTargets(heldChanged: boolean, knownChanged: boolean): void {
    this.lastEdgeMs = 0;
    if (!heldChanged && !knownChanged && this.initialized) return;
    const t0 = performance.now();
    const { held, known, targetState, rateState } = this;
    if (heldChanged || !this.initialized) this.edgeField(held, this.targetVis, this.rateVis);
    if (knownChanged || !this.initialized) this.edgeField(known, this.targetKnown, this.rateKnown);
    for (let i = 0; i < held.length; i++) {
      const v = held[i] ? 255 : known[i] ? 128 : 0;
      if (targetState[i] !== v) { targetState[i] = v; rateState[i] = 0; }
    }
    this.lastEdgeMs = performance.now() - t0;
    this.animating = true;
  }

  /** Rampe d'un canal vers sa cible : ouverture en FOG_EDGE_TIMING.open secondes, fermeture en
   *  .close. Vitesse fixee a chaque changement de cible, depuis la valeur affichee : le mouvement se
   *  poursuit sans a-coup, et devient regulier quand la cible avance par pas reguliers. La rampe se
   *  fait dans la bande [lo, hi] ou la valeur change l'image ; hors de cette bande elle est sautee.
   *  `blockClosing` : une case quittee pendant son delai, ou revenue en vision depuis peu, ne se
   *  referme pas. Vrai si le canal bouge encore. */
  private animateChannel(channel: number, shown: Float32Array, target: Float32Array, rate: Float32Array, lo: number, hi: number, offset: number, scale: number, dt: number, blockClosing: boolean): boolean {
    const { held, state, pixels, graceLeft } = this;
    let active = false;
    for (let i = 0; i < shown.length; i++) {
      const t = target[i]!;
      let d = shown[i]!;
      if (d === t) continue;
      if (blockClosing && t < d && ((held[i] && state[i] !== FOG_VISIBLE) || graceLeft[i]! > 0)) { active = true; continue; }
      const from = d < lo ? lo : d > hi ? hi : d;
      const to = t < lo ? lo : t > hi ? hi : t;
      const gap = Math.abs(to - from);
      if (rate[i] === 0 && gap > 0) rate[i] = gap / (to > from ? FOG_EDGE_TIMING.open : FOG_EDGE_TIMING.close);
      const step = rate[i]! * dt;
      if (gap <= step || gap === 0) { d = t; rate[i] = 0; } else { d = from + (to > from ? step : -step); active = true; }
      shown[i] = d;
      pixels[i * 4 + channel] = Math.round(offset + d * scale);
    }
    return active;
  }

  private animate(dt: number): void {
    this.lastAnimMs = 0;
    if (!this.animating) return;
    const t0 = performance.now();
    const { lo, hi } = FOG_EDGE_ANIM_BAND;
    const a = this.animateChannel(0, this.shownState, this.targetState, this.rateState, 0, 255, 0, 1, dt, false);
    const b = this.animateChannel(1, this.shownVis, this.targetVis, this.rateVis, lo, hi, 128, FOG_EDGE_SCALE, dt, true);
    const c = this.animateChannel(2, this.shownKnown, this.targetKnown, this.rateKnown, lo, hi, 128, FOG_EDGE_SCALE, dt, false);
    this.animating = a || b || c;
    this.texture.needsUpdate = true;
    this.lastAnimMs = performance.now() - t0;
  }

  /** Premiere image : les valeurs affichees sont directement les cibles, sans animation. */
  private snapToTargets(): void {
    const { pixels, shownVis, targetVis, shownKnown, targetKnown, shownState, targetState } = this;
    shownVis.set(targetVis);
    shownKnown.set(targetKnown);
    shownState.set(targetState);
    for (let i = 0; i < shownVis.length; i++) {
      pixels[i * 4] = Math.round(shownState[i]!);
      pixels[i * 4 + 1] = Math.round(128 + shownVis[i]! * FOG_EDGE_SCALE);
      pixels[i * 4 + 2] = Math.round(128 + shownKnown[i]! * FOG_EDGE_SCALE);
      pixels[i * 4 + 3] = 255;
    }
    this.initialized = true;
    this.animating = false;
    this.texture.needsUpdate = true;
  }

  private index(x: number, z: number): number {
    const cx = Math.floor(x - this.minX);
    const cz = Math.floor(z - this.minZ);
    if (cx < 0 || cz < 0 || cx >= this.width || cz >= this.height) return -1;
    return cz * this.width + cx;
  }

  stateAt(x: number, z: number): number {
    const i = this.index(x, z);
    return i < 0 ? FOG_UNSEEN : this.state[i]!;
  }

  isVisible(x: number, z: number): boolean {
    return this.stateAt(x, z) === FOG_VISIBLE;
  }

  isExplored(x: number, z: number): boolean {
    return this.stateAt(x, z) !== FOG_UNSEEN;
  }

  /** Marque EXPLOREES (pas visibles) les cases jamais vues dont le centre est
   *  a `radius` de (x, z) : abords du camp au lancement d'une run. */
  exploreDisc(x: number, z: number, radius: number): void {
    const { state, width, height } = this;
    const r2 = radius * radius;
    for (let cz = 0; cz < height; cz++) {
      const dz = cz + this.minZ + 0.5 - z;
      for (let cx = 0; cx < width; cx++) {
        const dx = cx + this.minX + 0.5 - x;
        const i = cz * width + cx;
        if (state[i] === FOG_UNSEEN && dx * dx + dz * dz <= r2) state[i] = FOG_EXPLORED;
      }
    }
  }

  /** Vision du moment : le visible precedent redevient explore, puis chaque
   *  source rend visibles les cases dont le centre est dans son rayon. L'etat est exact a l'image
   *  pres ; le champ affiche suit (retenue, puis rampes). `dt` : pas impose (controles), sinon
   *  horloge du rendu. */
  update(sources: readonly VisionSource[], dt?: number): void {
    const now = performance.now();
    const elapsed = dt ?? (this.lastTime < 0 || this.paused ? 0 : Math.min((now - this.lastTime) / 1000, 0.5));
    this.lastTime = now;
    const { state, width, height, held, holdLeft, graceLeft, known, rateVis } = this;
    for (let i = 0; i < state.length; i++) if (state[i] === FOG_VISIBLE) state[i] = FOG_EXPLORED;
    for (const s of sources) {
      const r = s.radius;
      const x0 = Math.max(0, Math.floor(s.x - r - this.minX));
      const x1 = Math.min(width - 1, Math.floor(s.x + r - this.minX));
      const z0 = Math.max(0, Math.floor(s.z - r - this.minZ));
      const z1 = Math.min(height - 1, Math.floor(s.z + r - this.minZ));
      const r2 = r * r;
      for (let cz = z0; cz <= z1; cz++) {
        const dz = cz + this.minZ + 0.5 - s.z;
        for (let cx = x0; cx <= x1; cx++) {
          const dx = cx + this.minX + 0.5 - s.x;
          if (dx * dx + dz * dz <= r2) state[cz * width + cx] = FOG_VISIBLE;
        }
      }
    }
    let heldChanged = false;
    let knownChanged = false;
    for (let i = 0; i < state.length; i++) {
      const s = state[i]!;
      if (graceLeft[i]! > 0) {
        graceLeft[i] = graceLeft[i]! - elapsed;
        if (graceLeft[i]! <= 0) { graceLeft[i] = 0; rateVis[i] = 0; }
        this.animating = true;
      }
      if (s === FOG_VISIBLE) {
        // Case qui revient en vision (elle n'y etait pas a l'image precedente).
        if (this.initialized && holdLeft[i]! < FOG_EDGE_TIMING.hold) { graceLeft[i] = FOG_EDGE_TIMING.hold; rateVis[i] = 0; this.animating = true; }
        holdLeft[i] = FOG_EDGE_TIMING.hold;
        if (!held[i]) { held[i] = 1; heldChanged = true; }
      } else if (held[i]) {
        holdLeft[i] = holdLeft[i]! - elapsed;
        if (holdLeft[i]! <= 0) { held[i] = 0; holdLeft[i] = 0; heldChanged = true; rateVis[i] = 0; }
        this.animating = true;
      }
      if (s !== FOG_UNSEEN && !known[i]) { known[i] = 1; knownChanged = true; }
    }
    this.refreshTargets(heldChanged, knownChanged);
    if (!this.initialized) this.snapToTargets();
    else this.animate(elapsed);
  }

  dispose(): void {
    this.texture.dispose();
  }
}

/**
 * Passe plein ecran du brouillard : la scene est rendue dans une cible (avec
 * sa profondeur), puis chaque pixel retrouve sa position monde (camera
 * courante) et lit l'etat de sa case. Ciel (profondeur maximale) intact.
 */
const FULLSCREEN_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }`;

export class FogOfWarPass {
  private target: THREE.WebGLRenderTarget | null = null;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly quad: THREE.Mesh;
  /** Composition pleine resolution (nappes evaluees par pixel si actives). */
  readonly material: THREE.ShaderMaterial;
  /** Uniforms de la scene rendue, partages par les materiaux de la passe. */
  private readonly sceneUniforms = {
    tColor: { value: null as THREE.Texture | null },
    tDepth: { value: null as THREE.Texture | null },
    tFog: { value: null as THREE.Texture | null },
    projectionInverse: { value: new THREE.Matrix4() },
    cameraWorld: { value: new THREE.Matrix4() },
    fogRect: { value: new THREE.Vector4() },
    fogBackground: { value: false },
  };

  /** Mist Clouds (render/mistClouds.ts, rendu officiel, `?mistClouds=off` pour comparer) : nappes
   *  composees dans cette passe avant l'assombrissement ; en `off`, shader historique identique. */
  private readonly clouds = mistCloudsMode() !== 'off';

  /** Nappes a demi-resolution (defaut quand les nappes sont actives ; `?mistCloudsRes=full` pour la
   *  comparaison) : les couches sont evaluees dans une cible de la moitie de la taille (cloudMaterial :
   *  couleur premultipliee + couverture, a partir de la profondeur de la scene ; un draw call, une
   *  cible HalfFloat de 1/4 de l'ecran), puis recomposees par halfMaterial avec un
   *  surechantillonnage bilineaire pondere par la similarite de profondeur, et une evaluation exacte
   *  sur les seuls pixels de contour (aucun halo sur les silhouettes). Commutable a chaud
   *  (cloudsHalfRes) ; sans nappes, sans effet. */
  cloudsHalfRes = mistCloudsHalfRes();
  readonly cloudMaterial: THREE.ShaderMaterial | null = null;
  readonly halfMaterial: THREE.ShaderMaterial | null = null;
  private cloudTarget: THREE.WebGLRenderTarget | null = null;
  private readonly cloudUniforms = { tClouds: { value: null as THREE.Texture | null }, cloudsTexel: { value: new THREE.Vector2(1, 1) } };

  /** Test de profondeur des reperes prioritaires contre la scene opaque (overlayDepthUniforms).
   *  `?overlayDepth=off` : comparaison (les reperes passent alors a travers les batiments). */
  overlayDepthTest = typeof location === 'undefined' || new URLSearchParams(location.search).get('overlayDepth') !== 'off';
  overlayDepthBias = OVERLAY_DEPTH_BIAS;

  /** Cible demi-resolution des nappes (couleur premultipliee, couverture en alpha), pour les
   *  controles et les tests ; null sans nappes ou avant le premier rendu. */
  get cloudCoverage(): THREE.WebGLRenderTarget | null {
    return this.cloudTarget;
  }

  constructor() {
    this.material = this.compositeMaterial(this.clouds ? 'full' : 'off');
    if (this.clouds) {
      this.halfMaterial = this.compositeMaterial('half');
      this.cloudMaterial = new THREE.ShaderMaterial({
        uniforms: { ...this.sceneUniforms, ...fogEdgeUniforms, ...mistCloudUniforms },
        vertexShader: FULLSCREEN_VERTEX,
        fragmentShader: /* glsl */ `
          uniform sampler2D tDepth;
          uniform mat4 projectionInverse;
          uniform mat4 cameraWorld;
          uniform bool fogBackground;
          varying vec2 vUv;${FOG_EDGE_GLSL}${MIST_CLOUDS_GLSL}
          void main() {
            float depth = texture2D(tDepth, vUv).x;
            vec4 cl = vec4(0.0);
            if (depth < 1.0 || fogBackground) {
              vec4 view = projectionInverse * vec4(vUv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
              vec3 world = (cameraWorld * vec4(view.xyz / view.w, 1.0)).xyz;
              vec3 forward = (cameraWorld * vec4(0.0, 0.0, -1.0, 0.0)).xyz;
              if (depth >= 1.0) world -= forward * (world.y / forward.y);
              cl = mistCloudsLayers(world, forward);
            }
            gl_FragColor = cl;
          }`,
        depthTest: false,
        depthWrite: false,
      });
    }
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
    this.scene.add(this.quad);
  }

  /** Composition plein ecran : `off` (shader historique), `full` (nappes evaluees par pixel), `half`
   *  (nappes relues dans la cible demi-resolution, evaluation exacte sur les pixels de contour).
   *  Nappes et brouillard de guerre : les nappes sont composees sur la scene AVANT l'assombrissement
   *  (assombries en zone exploree comme le sol) ; en zone inexploree, elles sont posees, attenuees
   *  (uCloudUnseen), sur le noir opaque : matiere atmospherique au-dessus de l'inconnu, qui ne laisse
   *  rien deviner (render/mistClouds.ts : densite par niveau de visibilite, surface ignoree). */
  private compositeMaterial(clouds: 'off' | 'full' | 'half'): THREE.ShaderMaterial {
    const cloudsEval = clouds === 'full'
      ? /* glsl */ `
            vec4 cl = mistCloudsLayers(world, forward);`
      : clouds === 'half'
        ? /* glsl */ `
            float ddMin;
            vec4 cl = cloudsUpsample(vUv, depth, ddMin);
            // Contour (aucun texel voisin a moins d'une unite de profondeur) : evaluation exacte.
            if (ddMin > 0.0025) cl = mistCloudsLayers(world, forward);`
        : '';
    const cloudsOver = clouds === 'off' ? '' : /* glsl */ `
            color.rgb = color.rgb * (1.0 - cl.a) + cl.rgb;`;
    const cloudsUnseen = clouds === 'off' ? '' : /* glsl */ `
            unseen = unseen * (1.0 - cl.a) + cl.rgb * uCloudUnseen;`;
    const upsample = /* glsl */ `
        uniform sampler2D tClouds;
        uniform vec2 cloudsTexel;
        // Quatre texels demi-resolution autour du pixel, poids bilineaires attenues par l'ecart de
        // profondeur (meme texel de profondeur que celui lu par la passe des nappes) : une nappe
        // calculee sur le sol ne bave pas sur une cime ou un toit voisin. \`ddMin\` : plus petit ecart
        // de profondeur rencontre (l'appelant evalue la nappe en pleine resolution si aucun texel
        // n'est compatible : pixels de contour seulement).
        vec4 cloudsUpsample(vec2 uv, float depth, out float ddMin) {
          vec2 st = uv / cloudsTexel - 0.5;
          vec2 i = floor(st);
          vec2 f = st - i;
          vec4 sum = vec4(0.0);
          float wsum = 0.0;
          ddMin = 1.0;
          for (int y = 0; y < 2; y++) {
            for (int x = 0; x < 2; x++) {
              vec2 tuv = (i + vec2(float(x), float(y)) + 0.5) * cloudsTexel;
              float bw = (x == 0 ? 1.0 - f.x : f.x) * (y == 0 ? 1.0 - f.y : f.y);
              float dd = abs(texture2D(tDepth, tuv).x - depth);
              ddMin = min(ddMin, dd);
              // Texel a plus d'une unite de profondeur (0,0025 sur 400) : quasi exclu.
              float w = bw * (dd < 0.0025 ? 1.0 : 0.001);
              sum += texture2D(tClouds, tuv) * w;
              wsum += w;
            }
          }
          return sum / wsum;
        }`;
    return new THREE.ShaderMaterial({
      uniforms: { ...this.sceneUniforms, ...fogEdgeUniforms, ...(clouds !== 'off' ? mistCloudUniforms : {}), ...(clouds === 'half' ? this.cloudUniforms : {}) },
      vertexShader: FULLSCREEN_VERTEX,
      fragmentShader: /* glsl */ `
        uniform sampler2D tColor;
        uniform sampler2D tDepth;
        uniform sampler2D tFog;
        uniform mat4 projectionInverse;
        uniform mat4 cameraWorld;
        uniform vec4 fogRect;
        uniform bool fogBackground;
        varying vec2 vUv;${FOG_EDGE_GLSL}${clouds === 'full' ? MIST_CLOUDS_GLSL : clouds === 'half' ? MIST_CLOUDS_GLSL + upsample : ''}
        void main() {
          vec4 color = texture2D(tColor, vUv);
          float depth = texture2D(tDepth, vUv).x;
          if (depth < 1.0 || fogBackground) {
            vec4 view = projectionInverse * vec4(vUv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
            vec3 world = (cameraWorld * vec4(view.xyz / view.w, 1.0)).xyz;
            vec3 forward = (cameraWorld * vec4(0.0, 0.0, -1.0, 0.0)).xyz;
            // Fond sous brume : traite comme le sol sur sa ligne de vue (plan y = 0).
            if (depth >= 1.0) world -= forward * (world.y / forward.y);
            vec2 fogUv = (world.xz - fogRect.xy) / fogRect.zw;
            bool inside = fogUv.x >= 0.0 && fogUv.x <= 1.0 && fogUv.y >= 0.0 && fogUv.y <= 1.0;
            // Lisiere (render/fogEdge.ts) : distances signees aux lisieres du visible (x) et de
            // l'explore (y), deplacees par le bruit de lisiere (ancre au monde, biaise vers
            // l'interieur) : frontiere continue et irreguliere, plus de marches de cases ; le
            // terrain hors vision n'est jamais eclairci, l'inexplore jamais devoile. Fondu de
            // l'assombrissement asymetrique (uFogEdgeFade : court vers l'exterieur, etire vers
            // l'interieur, dans la bande ou la densite des nappes decroit) ; fondu du noir
            // asymetrique lui aussi (uFogEdgeBlack : court vers l'inconnu, etire vers l'explore),
            // avec une courbe en puissance (melange en lumiere lineaire : sans elle, tout le
            // changement percu se concentre pres du noir). Hors grille : inexplore.
            vec2 fd = inside ? fogEdgeDistances(texture2D(tFog, fogUv)) + fogEdgeShift(world.xz) : vec2(-100.0);
            float seenT = smoothstep(-uFogEdgeFade.x, uFogEdgeFade.y, fd.x);
            float knownT = pow(smoothstep(-uFogEdgeBlack.x, uFogEdgeBlack.y, fd.y), uFogEdgeBlack.z);${cloudsEval}${cloudsOver}
            float luma = dot(color.rgb, vec3(0.299, 0.587, 0.114));
            vec3 explored = mix(color.rgb, vec3(luma), 0.45) * 0.55;
            vec3 unseen = vec3(0.012, 0.014, 0.02);${cloudsUnseen}
            color.rgb = mix(unseen, mix(explored, color.rgb, seenT), knownT);
          }
          gl_FragColor = color;
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      depthTest: false,
      depthWrite: false,
    });
  }

  /** `background` : fond clair de la brume atmospherique, soumis aux trois etats comme le sol, pour
   *  qu'il ne dessine jamais la silhouette d'une carte encore inexploree. Sinon, fond intact. */
  render(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, fog: FogOfWar, background = false): void {
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    if (!this.target || this.target.width !== size.x || this.target.height !== size.y) {
      this.target?.dispose();
      this.target = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4, depthTexture: new THREE.DepthTexture(size.x, size.y) });
    }
    // Scene sans les reperes prioritaires (GAMEPLAY_OVERLAY_LAYER), rendus apres la composition.
    const layersMask = camera.layers.mask;
    camera.layers.set(0);
    renderer.setRenderTarget(this.target);
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);
    const u = this.sceneUniforms;
    u.tColor.value = this.target.texture;
    u.tDepth.value = this.target.depthTexture;
    u.tFog.value = fog.texture;
    u.fogBackground.value = background;
    u.projectionInverse.value.copy(camera.projectionMatrixInverse);
    u.cameraWorld.value.copy(camera.matrixWorld);
    u.fogRect.value.set(fog.minX, fog.minZ, fog.width, fog.height);
    if (this.clouds) {
      tickMistClouds();
      // Densite des nappes par etat de visibilite : la meme grille que l'assombrissement.
      mistCloudUniforms.tCloudFog.value = fog.texture;
      mistCloudUniforms.uCloudFogRect.value.set(fog.minX, fog.minZ, fog.width, fog.height);
    }
    const half = this.cloudsHalfRes && this.cloudMaterial && this.halfMaterial;
    if (half) {
      const w = Math.ceil(size.x / 2);
      const h = Math.ceil(size.y / 2);
      if (!this.cloudTarget || this.cloudTarget.width !== w || this.cloudTarget.height !== h) {
        this.cloudTarget?.dispose();
        this.cloudTarget = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, depthBuffer: false, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
        this.cloudUniforms.tClouds.value = this.cloudTarget.texture;
        this.cloudUniforms.cloudsTexel.value.set(1 / w, 1 / h);
      }
      this.quad.material = this.cloudMaterial!;
      renderer.setRenderTarget(this.cloudTarget);
      renderer.render(this.scene, this.camera);
      renderer.setRenderTarget(null);
      this.quad.material = this.halfMaterial!;
    } else {
      this.quad.material = this.material;
    }
    renderer.render(this.scene, this.camera);
    // Reperes prioritaires par-dessus la composition : pas d'effacement (fond retire le temps du
    // rendu, sinon un fond de couleur force un clear), aucune lumiere necessaire (materiaux non
    // eclaires). Profondeur : chaque fragment relit la DepthTexture de la scene deja rendue
    // (makeOverlayDepthAware) ; aucune passe ni texture supplementaire. Biais converti en profondeur
    // fenetre (orthographique : lineaire entre near et far).
    camera.layers.set(GAMEPLAY_OVERLAY_LAYER);
    const sceneBackground = scene.background;
    const autoClear = renderer.autoClear;
    scene.background = null;
    renderer.autoClear = false;
    const ortho = camera as THREE.OrthographicCamera;
    const depthRange = ortho.isOrthographicCamera ? ortho.far - ortho.near : 1;
    overlayDepthUniforms.tOverlayDepth.value = this.target.depthTexture;
    overlayDepthUniforms.uOverlayDepthSize.value.set(size.x, size.y);
    overlayDepthUniforms.uOverlayDepthTest.value.set(this.overlayDepthTest ? 1 : 0, this.overlayDepthBias / depthRange);
    renderer.render(scene, camera);
    overlayDepthUniforms.uOverlayDepthTest.value.x = 0;
    overlayDepthUniforms.tOverlayDepth.value = null;
    renderer.autoClear = autoClear;
    scene.background = sceneBackground;
    camera.layers.mask = layersMask;
  }

  dispose(): void {
    this.target?.dispose();
    this.cloudTarget?.dispose();
    this.material.dispose();
    this.halfMaterial?.dispose();
    this.cloudMaterial?.dispose();
  }
}
