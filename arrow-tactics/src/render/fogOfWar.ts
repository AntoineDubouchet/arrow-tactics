import * as THREE from 'three';

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
export class FogOfWarPass {
  private target: THREE.WebGLRenderTarget | null = null;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly material: THREE.ShaderMaterial;

  constructor() {
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        tColor: { value: null },
        tDepth: { value: null },
        tFog: { value: null },
        projectionInverse: { value: new THREE.Matrix4() },
        cameraWorld: { value: new THREE.Matrix4() },
        fogRect: { value: new THREE.Vector4() },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position.xy, 0.0, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D tColor;
        uniform sampler2D tDepth;
        uniform sampler2D tFog;
        uniform mat4 projectionInverse;
        uniform mat4 cameraWorld;
        uniform vec4 fogRect;
        varying vec2 vUv;
        void main() {
          vec4 color = texture2D(tColor, vUv);
          float depth = texture2D(tDepth, vUv).x;
          if (depth < 1.0) {
            vec4 view = projectionInverse * vec4(vUv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
            vec3 world = (cameraWorld * vec4(view.xyz / view.w, 1.0)).xyz;
            vec2 fogUv = (world.xz - fogRect.xy) / fogRect.zw;
            bool inside = fogUv.x >= 0.0 && fogUv.x <= 1.0 && fogUv.y >= 0.0 && fogUv.y <= 1.0;
            float seen = inside ? texture2D(tFog, fogUv).r : 0.0;
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
    this.scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material));
  }

  render(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, fog: FogOfWar): void {
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    if (!this.target || this.target.width !== size.x || this.target.height !== size.y) {
      this.target?.dispose();
      this.target = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4, depthTexture: new THREE.DepthTexture(size.x, size.y) });
    }
    renderer.setRenderTarget(this.target);
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);
    const u = this.material.uniforms;
    u['tColor']!.value = this.target.texture;
    u['tDepth']!.value = this.target.depthTexture;
    u['tFog']!.value = fog.texture;
    (u['projectionInverse']!.value as THREE.Matrix4).copy(camera.projectionMatrixInverse);
    (u['cameraWorld']!.value as THREE.Matrix4).copy(camera.matrixWorld);
    (u['fogRect']!.value as THREE.Vector4).set(fog.minX, fog.minZ, fog.width, fog.height);
    renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    this.target?.dispose();
    this.material.dispose();
  }
}
