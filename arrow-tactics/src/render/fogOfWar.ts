import * as THREE from 'three';
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
 *  lineaire). Un anneau ou une plaque est pose 0,03 au-dessus du sol, soit ~0,037 devant le sol sur
 *  la ligne de vue (inclinaison 55°) : 0,01 le garde net au sol ; une facade entre la camera et le
 *  repere l'ecarte de bien plus, donc il est masque des le pied du mur (aucune transparence). */
export const OVERLAY_DEPTH_BIAS = 0.01;

const overlayDepthMaterials = new WeakSet<THREE.Material>();

/** Le materiau relit la profondeur opaque de la scene (overlayDepthUniforms) et abandonne tout
 *  fragment situe derriere elle. Idempotent ; un clone du materiau est a marquer a son tour. */
export function makeOverlayDepthAware(material: THREE.Material): void {
  if (overlayDepthMaterials.has(material)) return;
  overlayDepthMaterials.add(material);
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, overlayDepthUniforms);
    shader.fragmentShader = shader.fragmentShader.replace(
      'void main() {',
      /* glsl */ `uniform sampler2D tOverlayDepth;
        uniform vec2 uOverlayDepthSize;
        uniform vec2 uOverlayDepthTest;
        void main() {
          if (uOverlayDepthTest.x > 0.5 && gl_FragCoord.z > texture2D(tOverlayDepth, gl_FragCoord.xy / uOverlayDepthSize).x + uOverlayDepthTest.y) discard;`,
    );
  };
  material.customProgramCacheKey = () => 'overlayDepth';
}

export function isOverlayDepthAware(material: THREE.Material): boolean {
  return overlayDepthMaterials.has(material);
}

/** Place `object` et ses descendants dans la couche des reperes prioritaires et rend leurs
 *  materiaux sensibles a la profondeur de la scene (makeOverlayDepthAware). */
export function markGameplayOverlay(object: THREE.Object3D): void {
  object.traverse((o) => {
    o.layers.set(GAMEPLAY_OVERLAY_LAYER);
    const material = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
    if (!material) return;
    for (const m of Array.isArray(material) ? material : [material]) makeOverlayDepthAware(m);
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
  /** Texture de la grille (0, 128, 255), lue par la passe plein ecran. */
  readonly texture: THREE.DataTexture;
  private readonly pixels: Uint8Array;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.minX = -width / 2;
    this.minZ = -height / 2;
    this.state = new Uint8Array(width * height);
    this.pixels = new Uint8Array(width * height);
    this.texture = new THREE.DataTexture(this.pixels, width, height, THREE.RedFormat, THREE.UnsignedByteType);
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.minFilter = THREE.LinearFilter;
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
        if (state[i] === FOG_UNSEEN && dx * dx + dz * dz <= r2) {
          state[i] = FOG_EXPLORED;
          this.pixels[i] = 128;
        }
      }
    }
    this.texture.needsUpdate = true;
  }

  /** Vision du moment : le visible precedent redevient explore, puis chaque
   *  source rend visibles les cases dont le centre est dans son rayon. */
  update(sources: readonly VisionSource[]): void {
    const { state, width, height } = this;
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
    for (let i = 0; i < state.length; i++) this.pixels[i] = state[i] === FOG_VISIBLE ? 255 : state[i] === FOG_EXPLORED ? 128 : 0;
    this.texture.needsUpdate = true;
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

  constructor() {
    this.material = this.compositeMaterial(this.clouds ? 'full' : 'off');
    if (this.clouds) {
      this.halfMaterial = this.compositeMaterial('half');
      this.cloudMaterial = new THREE.ShaderMaterial({
        uniforms: { ...this.sceneUniforms, ...mistCloudUniforms },
        vertexShader: FULLSCREEN_VERTEX,
        fragmentShader: /* glsl */ `
          uniform sampler2D tDepth;
          uniform mat4 projectionInverse;
          uniform mat4 cameraWorld;
          uniform bool fogBackground;
          varying vec2 vUv;${MIST_CLOUDS_GLSL}
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

  /** Composition plein ecran : `off` (shader historique), `full` (nappes evaluees par pixel, avant
   *  l'assombrissement), `half` (nappes relues dans la cible demi-resolution : la lecture du
   *  brouillard est faite d'abord pour ne rien relire sur un pixel jamais explore, resultat identique). */
  private compositeMaterial(clouds: 'off' | 'full' | 'half'): THREE.ShaderMaterial {
    const fogRead = /* glsl */ `
            vec2 fogUv = (world.xz - fogRect.xy) / fogRect.zw;
            bool inside = fogUv.x >= 0.0 && fogUv.x <= 1.0 && fogUv.y >= 0.0 && fogUv.y <= 1.0;
            float seen = inside ? texture2D(tFog, fogUv).r : 0.0;`;
    const cloudsCall = clouds === 'full'
      ? '\n            mistClouds(color.rgb, world, (cameraWorld * vec4(0.0, 0.0, -1.0, 0.0)).xyz);' + fogRead
      : clouds === 'half'
        ? fogRead + /* glsl */ `
            if (seen > 0.0) {
              float ddMin;
              vec4 cl = cloudsUpsample(vUv, depth, ddMin);
              // Contour (aucun texel voisin a moins d'une unite de profondeur) : evaluation exacte.
              if (ddMin > 0.0025) cl = mistCloudsLayers(world, (cameraWorld * vec4(0.0, 0.0, -1.0, 0.0)).xyz);
              color.rgb = color.rgb * (1.0 - cl.a) + cl.rgb;
            }`
        : fogRead;
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
      uniforms: { ...this.sceneUniforms, ...(clouds !== 'off' ? mistCloudUniforms : {}), ...(clouds === 'half' ? this.cloudUniforms : {}) },
      vertexShader: FULLSCREEN_VERTEX,
      fragmentShader: /* glsl */ `
        uniform sampler2D tColor;
        uniform sampler2D tDepth;
        uniform sampler2D tFog;
        uniform mat4 projectionInverse;
        uniform mat4 cameraWorld;
        uniform vec4 fogRect;
        uniform bool fogBackground;
        varying vec2 vUv;${clouds === 'full' ? MIST_CLOUDS_GLSL : clouds === 'half' ? MIST_CLOUDS_GLSL + upsample : ''}
        void main() {
          vec4 color = texture2D(tColor, vUv);
          float depth = texture2D(tDepth, vUv).x;
          if (depth < 1.0 || fogBackground) {
            vec4 view = projectionInverse * vec4(vUv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
            vec3 world = (cameraWorld * vec4(view.xyz / view.w, 1.0)).xyz;
            // Fond sous brume : traite comme le sol sur sa ligne de vue (plan y = 0).
            if (depth >= 1.0) {
              vec3 forward = (cameraWorld * vec4(0.0, 0.0, -1.0, 0.0)).xyz;
              world -= forward * (world.y / forward.y);
            }${cloudsCall}
            float luma = dot(color.rgb, vec3(0.299, 0.587, 0.114));
            vec3 explored = mix(color.rgb, vec3(luma), 0.45) * 0.55;
            vec3 unseen = vec3(0.012, 0.014, 0.02);
            color.rgb = seen < 0.5 ? mix(unseen, explored, seen * 2.0) : mix(explored, color.rgb, (seen - 0.5) * 2.0);
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
    if (this.clouds) tickMistClouds();
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
