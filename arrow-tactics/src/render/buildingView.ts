import * as THREE from 'three';
import { HIT_FLASH_DURATION } from '../config/constants';
import { spawnRadialParticles, tickRadialParticles, type RadialParticle } from './vfx/radialBurst';

/**
 * Retour visuel d'un bâtiment GAMEPLAY (Mine, Baliste — 2026-08-16, voir
 * data/buildings.ts) : flash blanc au moment d'un coup encaissé (même
 * technique que UnitViews.setEmissive, mais un seul mesh unique par
 * bâtiment — pas besoin de la Map par entité qu'utilise UnitViews pour des
 * dizaines d'unités clonées) + destruction (petit VFX poussière/débris,
 * V1 acceptable selon Antoine, puis suppression du modèle).
 *
 * Matériaux CLONÉS par instance avant tout flash (même précaution déjà
 * appliquée aux unités/rochers, voir CLAUDE.md "Bug de matériaux partagés
 * entre unités corrigé au passage") : le mesh gameplay (mineView/
 * ballistaPlatform, uniques dans tout le jeu) partage potentiellement ses
 * matériaux PAR RÉFÉRENCE avec un bâtiment purement DÉCORATIF du même modèle
 * placé sur la map via l'éditeur (Three.js Object3D.clone() ne clone jamais
 * les matériaux par défaut) — sans ce clonage, faire flasher la Mine
 * gameplay au combat ferait aussi flasher toute "Mine (bleu)" décorative
 * affichée sur le même plateau.
 */
export class BuildingView {
  private readonly materials: (THREE.MeshStandardMaterial | THREE.MeshPhongMaterial)[] = [];
  private flashTimer = 0;
  private destroyed = false;
  private readonly debris: RadialParticle[] = [];

  constructor(
    private readonly mesh: THREE.Object3D,
    private readonly vfxGroup: THREE.Group,
  ) {
    mesh.traverse((obj) => {
      const m = obj as THREE.Mesh;
      if (!m.isMesh) return;
      const wasArray = Array.isArray(m.material);
      const mats = wasArray ? (m.material as THREE.Material[]) : [m.material as THREE.Material];
      const cloned = mats.map((mat) => {
        const castable = mat as THREE.MeshStandardMaterial | THREE.MeshPhongMaterial;
        if (!('emissive' in castable)) return mat;
        const c = castable.clone() as THREE.MeshStandardMaterial | THREE.MeshPhongMaterial;
        this.materials.push(c);
        return c;
      });
      m.material = wasArray ? cloned : cloned[0]!;
    });
  }

  /** À appeler sur CombatEvent 'hit' visant ce bâtiment. */
  playHit(): void {
    if (this.destroyed) return;
    this.flashTimer = HIT_FLASH_DURATION;
  }

  /** À appeler une fois, au moment où l'Entity passe alive=false. */
  playDestroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.mesh.visible = false;
    const box = new THREE.Box3().setFromObject(this.mesh);
    const center = box.getCenter(new THREE.Vector3());
    const debrisMaterial = new THREE.MeshBasicMaterial({ color: 0x6b5a4a, transparent: true });
    this.debris.push(
      ...spawnRadialParticles(this.vfxGroup, {
        count: 10,
        x: center.x,
        y: 0.1,
        z: center.z,
        buildParticle: () => new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, 0.18), debrisMaterial.clone()),
        speedMin: 1.2,
        speedMax: 2.6,
        liftMin: 1.5,
        liftMax: 3,
      }),
    );
  }

  /** À appeler chaque frame de rendu (temps réel, comme le reste des
   *  animations cosmétiques du jeu). */
  tick(dt: number): void {
    if (this.flashTimer > 0) {
      this.flashTimer = Math.max(0, this.flashTimer - dt);
      const intensity = this.flashTimer / HIT_FLASH_DURATION;
      for (const mat of this.materials) {
        mat.emissive.setScalar(intensity);
        mat.emissiveIntensity = intensity > 0 ? 1 : 0;
      }
    }
    if (this.debris.length > 0) tickRadialParticles(this.debris, this.vfxGroup, dt, 0.7, 4, 0.9);
  }

  /** Remet le bâtiment à son état visuel de départ — à appeler à chaque
   *  nouvelle bataille (le mesh unique est réutilisé d'une bataille à
   *  l'autre, jamais reconstruit). */
  reset(): void {
    this.destroyed = false;
    this.mesh.visible = true;
    this.flashTimer = 0;
    for (const mat of this.materials) {
      mat.emissive.setScalar(0);
      mat.emissiveIntensity = 0;
    }
    for (const p of this.debris) this.vfxGroup.remove(p.mesh);
    this.debris.length = 0;
  }

  /** Vue abandonnee (batiment de run retire) : retire ses debris et libere
   *  ce qu'elle possede en propre — materiaux clones et debris. La geometrie
   *  du mesh, partagee par le cache d'assets, n'est jamais liberee ici. */
  dispose(): void {
    for (const p of this.debris) {
      this.vfxGroup.remove(p.mesh);
      const debris = p.mesh as THREE.Mesh;
      debris.geometry?.dispose();
      (debris.material as THREE.Material | undefined)?.dispose();
    }
    this.debris.length = 0;
    for (const mat of this.materials) mat.dispose();
    this.materials.length = 0;
  }
}
