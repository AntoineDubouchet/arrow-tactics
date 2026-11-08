import * as THREE from 'three';
import { applyContactShading } from './contactMap';

/**
 * FEU DE CAMP ET TORCHES (2026-11-08, suite du Graphic Lab « Mist Clouds », EN COURS DE VALIDATION) :
 * vrais petits supports low-poly pour les sources chaudes du camp du joueur, a la place des cones
 * de flamme flottants :
 * - feu de camp (devant l'Hotel de ville, pose par render/warmLights.ts) : cercle de pierres, quatre
 *   buches, braises, flammes ; diametre ~1 case, flammes ~0,7 de haut ;
 * - torche de palissade (un exemplaire par montant de porte, render/palisade.ts) : manche, bague de
 *   fer, tete charbonneuse, flammes ; ~1,05 de haut.
 * Flammes : les memes cones additifs que le feu des camps neutres (render/campViews.ts), fusionnes
 * en UN mesh par foyer et animes dans le vertex shader (horloge partagee, tickFlames : scintillement
 * et rotation par cone, phase tiree de la position monde) : aucun travail CPU par torche, aucun
 * registre, les flammes vivent partout ou la piece est dessinee (jeu, editeur, apercu). Parties
 * eclairees : UN mesh par objet (geometrie fusionnee, couleurs par sommet, materiau partage avec
 * ombre de contact et voile de brume). Rendu seulement : aucune collision, aucune interaction, aucun
 * effet sur le pathfinding. Valeurs PROVISOIRES.
 */

/** Horloge des flammes (secondes reelles), avancee par WarmLights.animate (main.ts, chaque image). */
const flameUniforms = { uTime: { value: 0 } };
export function tickFlames(realDt: number): void {
  flameUniforms.uTime.value = (flameUniforms.uTime.value + realDt) % 10000;
}

/** Nom des meshes de flammes (controles et tests). */
export const FLAME_MESH_NAME = 'fire_flames';

/** Un seul materiau pour toutes les flammes : couleur, opacite, centre et parametres par sommet. */
const flameMaterial = new THREE.ShaderMaterial({
  uniforms: flameUniforms,
  vertexShader: /* glsl */ `
    uniform float uTime;
    attribute vec3 aColor;
    attribute vec3 aCenter;
    // phase, cadence du scintillement, opacite, vitesse de rotation.
    attribute vec4 aFlame;
    varying vec3 vColor;
    varying float vOpacity;
    void main() {
      // Phase propre a chaque foyer (position monde), pour que deux torches ne battent pas ensemble.
      float ph = aFlame.x + fract(sin(dot(modelMatrix[3].xz, vec2(12.9898, 78.233))) * 43758.5453) * 6.2832;
      vec3 p = position - aCenter;
      p.y *= 0.85 + 0.2 * sin(uTime * aFlame.y + ph);
      float ang = uTime * aFlame.w + ph;
      float c = cos(ang);
      float s = sin(ang);
      p.xz = vec2(c * p.x - s * p.z, s * p.x + c * p.z);
      vColor = aColor;
      vOpacity = aFlame.z;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(p + aCenter, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    varying vec3 vColor;
    varying float vOpacity;
    void main() {
      gl_FragColor = vec4(vColor, vOpacity);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  side: THREE.DoubleSide,
});

/** Materiau des parties eclairees (pierres, buches, manche, bague), couleurs par sommet. */
const litMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true });
applyContactShading(litMaterial);
/** Braises : disque non eclaire, lumineux par lui-meme. */
const emberMaterial = new THREE.MeshBasicMaterial({ color: 0xff5a1a, transparent: true, opacity: 0.85, depthWrite: false });

/** Fusion de geometries (sans index) en une seule, avec une couleur par piece ; chaque piece est
 *  transformee par sa matrice. */
function mergeLit(parts: { geometry: THREE.BufferGeometry; color: THREE.Color; matrix: THREE.Matrix4 }[]): THREE.BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  const v = new THREE.Vector3();
  const nm = new THREE.Matrix3();
  for (const part of parts) {
    const g = part.geometry.index ? part.geometry.toNonIndexed() : part.geometry;
    const pos = g.getAttribute('position');
    const nor = g.getAttribute('normal');
    nm.getNormalMatrix(part.matrix);
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(part.matrix);
      positions.push(v.x, v.y, v.z);
      v.fromBufferAttribute(nor, i).applyMatrix3(nm).normalize();
      normals.push(v.x, v.y, v.z);
      colors.push(part.color.r, part.color.g, part.color.b);
    }
    if (g !== part.geometry) g.dispose();
    part.geometry.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  out.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  return out;
}

const compose = (x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1): THREE.Matrix4 =>
  new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));

interface FlameCone {
  color: number;
  opacity: number;
  /** Decalage horizontal du cone (monde local du foyer). */
  dx: number;
  dz: number;
  /** Echelle du cone (rayon et hauteur). */
  scale: number;
}

/** Un mesh de flammes : cones ouverts (base a `baseY`), un par entree, animes par flameMaterial. */
function buildFlames(radius: number, height: number, baseY: number, cones: readonly FlameCone[]): THREE.Mesh {
  const positions: number[] = [];
  const colors: number[] = [];
  const centers: number[] = [];
  const flame: number[] = [];
  const v = new THREE.Vector3();
  cones.forEach((cone, i) => {
    const h = height * cone.scale;
    const g = new THREE.ConeGeometry(radius * cone.scale, h, 7, 1, true).toNonIndexed();
    const pos = g.getAttribute('position');
    const c = new THREE.Color(cone.color);
    for (let k = 0; k < pos.count; k++) {
      v.fromBufferAttribute(pos, k);
      positions.push(v.x + cone.dx, v.y + h / 2 + baseY, v.z + cone.dz);
      colors.push(c.r, c.g, c.b);
      centers.push(cone.dx, baseY, cone.dz);
      flame.push(i * 2.1, 8 + i * 2.3, cone.opacity, 0.6 + i * 0.3);
    }
    g.dispose();
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('aColor', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute('aCenter', new THREE.Float32BufferAttribute(centers, 3));
  geometry.setAttribute('aFlame', new THREE.Float32BufferAttribute(flame, 4));
  const mesh = new THREE.Mesh(geometry, flameMaterial);
  mesh.name = FLAME_MESH_NAME;
  // Materiau partage : ne jamais le liberer avec la piece (voir disposeFireProp).
  mesh.userData['sharedMaterial'] = true;
  mesh.frustumCulled = false;
  return mesh;
}

/** Feu de camp : groupe pose au sol (origine au centre, y = sol) ; `flameY` : hauteur du coeur des
 *  flammes, ou ancrer la lumiere. */
export function buildCampfire(): { group: THREE.Group; flameY: number } {
  const group = new THREE.Group();
  group.name = 'campfire';
  const parts: { geometry: THREE.BufferGeometry; color: THREE.Color; matrix: THREE.Matrix4 }[] = [];
  // Cercle de pierres : sept blocs irreguliers (deterministes), rayon ~0,42.
  const stoneColors = [0x6c6d72, 0x7b7c80, 0x5e5f66, 0x74757a];
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + 0.35 * Math.sin(i * 2.7);
    const r = 0.4 + 0.05 * Math.cos(i * 1.9);
    const s = 0.85 + 0.3 * Math.abs(Math.sin(i * 3.3));
    parts.push({ geometry: new THREE.DodecahedronGeometry(0.11, 0), color: new THREE.Color(stoneColors[i % stoneColors.length]!), matrix: compose(Math.cos(a) * r, 0.06 * s, Math.sin(a) * r, i * 0.7, a, i * 0.4, s, 0.65 * s, 0.8 * s) });
  }
  // Quatre buches dressees en faisceau autour du centre, bout exterieur au sol.
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4;
    const m = new THREE.Matrix4().makeRotationY(-a).multiply(compose(0.13, 0.15, 0, 0, 0, -1.05));
    parts.push({ geometry: new THREE.CylinderGeometry(0.045, 0.06, 0.5, 6), color: new THREE.Color(i % 2 ? 0x5a3a20 : 0x6b4526), matrix: m });
  }
  // Coeur charbonneux.
  parts.push({ geometry: new THREE.DodecahedronGeometry(0.12, 0), color: new THREE.Color(0x1a1210), matrix: compose(0, 0.08, 0, 0.3, 0.2, 0, 1, 0.6, 1) });
  const body = new THREE.Mesh(mergeLit(parts), litMaterial);
  body.castShadow = true;
  body.receiveShadow = true;
  body.userData['sharedMaterial'] = true;
  group.add(body);
  // Braises : disque chaud sous les buches.
  const embers = new THREE.Mesh(new THREE.CircleGeometry(0.2, 10), emberMaterial);
  embers.rotation.x = -Math.PI / 2;
  embers.position.y = 0.045;
  embers.userData['sharedMaterial'] = true;
  group.add(embers);
  // Flammes : trois cones (famille du feu des camps neutres), base a 0,18, sommet ~0,9.
  group.add(buildFlames(0.16, 0.55, 0.18, [
    { color: 0xff5a1a, opacity: 0.75, dx: 0.0, dz: 0.0, scale: 1.3 },
    { color: 0xff9a2e, opacity: 0.63, dx: 0.06, dz: 0.03, scale: 1.0 },
    { color: 0xffd25a, opacity: 0.51, dx: -0.05, dz: 0.05, scale: 0.75 },
  ]));
  return { group, flameY: 0.55 };
}

/** Torche : origine a la base du manche, manche le long de +Y (0,6), tete et flammes au-dessus
 *  (sommet des flammes ~1,05). A fixer a un support (render/palisade.ts) ; `flameY` : coeur des
 *  flammes. */
export function buildTorch(): { group: THREE.Group; flameY: number } {
  const group = new THREE.Group();
  group.name = 'torch';
  const body = new THREE.Mesh(mergeLit([
    { geometry: new THREE.CylinderGeometry(0.036, 0.042, 0.6, 6), color: new THREE.Color(0x6e4826), matrix: compose(0, 0.3, 0) },
    { geometry: new THREE.CylinderGeometry(0.055, 0.055, 0.06, 6), color: new THREE.Color(0x3a3a42), matrix: compose(0, 0.57, 0) },
    { geometry: new THREE.CylinderGeometry(0.062, 0.048, 0.12, 6), color: new THREE.Color(0x2a1a10), matrix: compose(0, 0.65, 0) },
  ]), litMaterial);
  body.castShadow = true;
  body.userData['sharedMaterial'] = true;
  group.add(body);
  group.add(buildFlames(0.11, 0.38, 0.68, [
    { color: 0xff7a2a, opacity: 0.7, dx: 0, dz: 0, scale: 1.0 },
    { color: 0xffd25a, opacity: 0.5, dx: 0.015, dz: -0.01, scale: 0.7 },
  ]));
  return { group, flameY: 0.85 };
}

/** Libere ce qu'un feu ou une torche possede en propre (geometries) ; les materiaux sont partages
 *  et restent en place. */
export function disposeFireProp(root: THREE.Object3D): void {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh) mesh.geometry.dispose();
  });
}
