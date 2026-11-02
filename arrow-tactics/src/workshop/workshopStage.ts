import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

/**
 * Scene d'apercu des outils de conception (Atelier de personnage, Editeur
 * d'items, 2026-11-02) : fond, lumieres, petit sol, camera orbitale, rendu a
 * la taille du canevas. Le renderer est cree a la premiere ouverture.
 */
export class WorkshopStage {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(32, 1, 0.05, 100);
  renderer: THREE.WebGLRenderer | null = null;
  controls: OrbitControls | null = null;

  constructor(readonly canvas: HTMLCanvasElement) {
    this.scene.background = new THREE.Color(0x2b3139);
    this.scene.add(new THREE.HemisphereLight(0xdfe9ff, 0x3a3328, 1.6));
    const sun = new THREE.DirectionalLight(0xfff1d8, 2.4);
    sun.position.set(3, 6, 4);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    this.scene.add(sun);
    const fill = new THREE.DirectionalLight(0xc8d8ff, 0.6);
    fill.position.set(-4, 3, -3);
    this.scene.add(fill);
    const ground = new THREE.Mesh(new THREE.CircleGeometry(2.2, 48), new THREE.MeshStandardMaterial({ color: 0x55604a, roughness: 1 }));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);
    this.camera.position.set(0, 1.3, 4.2);
  }

  /** Renderer et camera orbitale, a la premiere ouverture. */
  ensureRenderer(): void {
    if (this.renderer) return;
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.controls = new OrbitControls(this.camera, this.canvas);
    this.controls.target.set(0, 0.85, 0);
    this.controls.enableDamping = true;
    this.controls.minDistance = 1.2;
    this.controls.maxDistance = 9;
  }

  /** Une image : camera, taille du canevas, rendu. */
  render(): void {
    if (!this.renderer) return;
    this.controls!.update();
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    const ratio = this.renderer.getPixelRatio();
    if (this.canvas.width !== Math.floor(w * ratio) || this.canvas.height !== Math.floor(h * ratio)) {
      this.renderer.setSize(w, h, false);
      this.camera.aspect = w / Math.max(1, h);
      this.camera.updateProjectionMatrix();
    }
    this.renderer.render(this.scene, this.camera);
  }
}
