import * as THREE from 'three';
import { buildToonUnitModel, ensureToonUnitPrototype, type ToonPaletteId, type ToonUnitKind } from './toonUnitRig';

/**
 * Vignette (image PNG en data URL) d'une unite Toon RTS en pose de garde,
 * vue de trois quarts face : apercus du bestiaire de l'editeur. Rendu hors
 * ecran par un petit renderer dedie, cree a la demande et libere des que la
 * file est vide (aucun contexte WebGL garde en plus du jeu). Une vignette
 * par unite et palette, mise en cache. Rejette si le modele est absent
 * (assets commerciaux hors Git).
 *
 * Portrait (2026-11-02, HUD et choix du Heros) : meme rendu, cadre carre sur
 * la tete et le haut du corps, fond transparent (le cercle gris est du CSS).
 */
type Framing = 'full' | 'portrait';
const SIZES: Record<Framing, { width: number; height: number }> = { full: { width: 120, height: 150 }, portrait: { width: 128, height: 128 } };

let renderer: THREE.WebGLRenderer | null = null;
let queue: Promise<unknown> = Promise.resolve();
let pending = 0;
const cache = new Map<string, Promise<string>>();

export function toonUnitThumbnail(kind: ToonUnitKind, palette: ToonPaletteId = 'red'): Promise<string> {
  return cachedRender(kind, palette, 'full');
}

/** Portrait (tete et epaules) : HUD du Heros, ecran de choix. */
export function toonUnitPortrait(kind: ToonUnitKind, palette: ToonPaletteId = 'blue'): Promise<string> {
  return cachedRender(kind, palette, 'portrait');
}

function cachedRender(kind: ToonUnitKind, palette: ToonPaletteId, framing: Framing): Promise<string> {
  const key = `${kind}:${palette}:${framing}`;
  let url = cache.get(key);
  if (!url) {
    pending++;
    url = queue.then(() => renderThumbnail(kind, palette, framing)).finally(() => {
      if (--pending === 0) releaseRenderer();
    });
    queue = url.catch(() => undefined);
    cache.set(key, url);
  }
  return url;
}

async function renderThumbnail(kind: ToonUnitKind, palette: ToonPaletteId, framing: Framing): Promise<string> {
  if (!(await ensureToonUnitPrototype(kind))) throw new Error(`Modele Toon RTS ${kind} absent.`);
  const { width: WIDTH, height: HEIGHT } = SIZES[framing];
  if (!renderer) {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(2);
  }
  renderer.setSize(WIDTH, HEIGHT, false);
  const model = buildToonUnitModel(kind, 'enemy', palette);
  const actions = model.userData['riggedActions'] as Record<string, THREE.AnimationAction>;
  const mixer = model.userData['riggedMixer'] as THREE.AnimationMixer;
  // Garde de combat, un peu entree dans le clip : silhouette plus lisible
  // que le repos.
  actions['idle']?.stop();
  actions['combatIdle']?.play();
  mixer.update(0.4);

  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a7a66, 2.2));
  const sun = new THREE.DirectionalLight(0xffffff, 2.4);
  sun.position.set(-1.5, 3, -2.5);
  scene.add(sun);
  // Avant de l'unite (rotation nulle) : -Z, comme en jeu (UnitViews).
  scene.add(model);
  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model);
  const height = box.max.y - box.min.y;
  const camera = new THREE.PerspectiveCamera(30, WIDTH / HEIGHT, 0.05, 20);
  // Os de la tete (Bip001_Head...), a defaut le haut de la silhouette.
  let head: THREE.Object3D | null = null;
  model.traverse((obj) => {
    if (!head && /head$/i.test(obj.name)) head = obj;
  });
  if (framing === 'portrait') {
    const at = new THREE.Vector3(0, box.min.y + height * 0.85, 0);
    if (head) (head as THREE.Object3D).getWorldPosition(at);
    // Centre un peu sous la tete : visage et epaules.
    at.y -= height * 0.08;
    const distance = (height * 0.24) / Math.tan(THREE.MathUtils.degToRad(15));
    const dir = new THREE.Vector3(0.42, 0.12, -0.9).normalize();
    camera.position.copy(at).addScaledVector(dir, distance);
    camera.lookAt(at);
  } else {
    const distance = (height * 0.62) / Math.tan(THREE.MathUtils.degToRad(15));
    camera.position.set(distance * 0.45, box.min.y + height * 0.62, -distance * 0.9);
    camera.lookAt(0, box.min.y + height * 0.5, 0);
  }
  renderer.render(scene, camera);
  const url = renderer.domElement.toDataURL('image/png');
  mixer.stopAllAction();
  mixer.uncacheRoot(mixer.getRoot());
  model.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.isMesh) (mesh.material as THREE.Material).dispose();
  });
  return url;
}

function releaseRenderer(): void {
  renderer?.dispose();
  renderer?.forceContextLoss();
  renderer = null;
}
