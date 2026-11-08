import * as THREE from 'three';
import { HIT_FLASH_DURATION } from '../config/constants';
import { BuildingDamageFx } from './buildingDamageFx';
import { applyContactShading } from './contactMap';

/**
 * Retour visuel d'un bâtiment GAMEPLAY (Mine, Baliste — 2026-08-16, voir
 * data/buildings.ts) : flash blanc au moment d'un coup encaissé (même
 * technique que UnitViews.setEmissive, mais un seul mesh unique par
 * bâtiment — pas besoin de la Map par entité qu'utilise UnitViews pour des
 * dizaines d'unités clonées), fumée selon les PV restants et effondrement à
 * la destruction (2026-11-01, voir buildingDamageFx.ts).
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
  /** Opacité de chantier appliquée (setConstruction), 1 = construit. */
  private constructionOpacity = 1;
  private destroyed = false;
  /** Fumée des dégâts et effondrement (rendu seul). */
  private readonly damageFx: BuildingDamageFx;
  /** Battants d'une porte (noeuds `*_door_left` / `*_door_right`, pivots
   *  sur les gonds : porte de palissade, render/palisade.ts) et leur lacet
   *  d'origine. */
  private readonly doorLeaves: { node: THREE.Object3D; baseY: number; sign: number }[] = [];

  constructor(
    private readonly mesh: THREE.Object3D,
    vfxGroup: THREE.Group,
  ) {
    this.damageFx = new BuildingDamageFx(mesh, vfxGroup);
    mesh.traverse((obj) => {
      // Battants tournes en sens opposes (ouverture vers -Z local).
      if (/_door_left$/.test(obj.name)) this.doorLeaves.push({ node: obj, baseY: obj.rotation.y, sign: -1 });
      else if (/_door_right$/.test(obj.name)) this.doorLeaves.push({ node: obj, baseY: obj.rotation.y, sign: 1 });
    });
    mesh.traverse((obj) => {
      const m = obj as THREE.Mesh;
      if (!m.isMesh) return;
      const wasArray = Array.isArray(m.material);
      const mats = wasArray ? (m.material as THREE.Material[]) : [m.material as THREE.Material];
      const cloned = mats.map((mat) => {
        const castable = mat as THREE.MeshStandardMaterial | THREE.MeshPhongMaterial;
        if (!('emissive' in castable)) return mat;
        const c = castable.clone() as THREE.MeshStandardMaterial | THREE.MeshPhongMaterial;
        // Ombre de contact et voile de brume (render/contactMap.ts, rendu officiel 2026-11-07).
        applyContactShading(c);
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

  /** À appeler une fois, au moment où l'Entity passe alive=false :
   *  effondrement (secousse, affaissement, poussière, débris), puis le
   *  modèle disparaît (BuildingDamageFx). La simulation a déjà retiré le
   *  bâtiment. */
  playDestroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.flashTimer = 0;
    this.damageFx.collapse();
  }

  /** Chantier (2026-11-01) : modèle translucide, de plus en plus opaque avec
   *  l'avancement (0..1) ; null = bâtiment construit, opaque. */
  setConstruction(progress: number | null): void {
    const opacity = progress === null ? 1 : 0.3 + 0.5 * Math.min(1, Math.max(0, progress));
    if (this.constructionOpacity === opacity) return;
    this.constructionOpacity = opacity;
    for (const mat of this.materials) {
      mat.transparent = opacity < 1;
      mat.opacity = opacity;
      mat.depthWrite = opacity >= 1;
    }
  }

  /** PV restants / PV max, à chaque image : niveau de fumée. */
  setHealthFraction(fraction: number): void {
    this.damageFx.setHealthFraction(fraction);
  }

  /** Niveau de fumée (0 aucune, 1 légère, 2 épaisse) et volutes en vol :
   *  contrôles et tests. */
  damageState(): { smoke: 0 | 1 | 2; particles: number; collapsed: boolean } {
    return { smoke: this.damageFx.smokeLevel(), particles: this.damageFx.liveParticles(), collapsed: this.damageFx.collapsed };
  }

  /** À appeler chaque frame de rendu (temps réel, comme le reste des
   *  animations cosmétiques du jeu). `frozen` : pause, fumée et
   *  effondrement figés. */
  tick(realDt: number, frozen = false): void {
    // Pause : flash, fumee et effondrement figes (temps de l'ecran a zero).
    const dt = frozen ? 0 : realDt;
    this.damageFx.tick(dt);
    if (this.flashTimer > 0 && dt > 0) {
      this.flashTimer = Math.max(0, this.flashTimer - dt);
      const intensity = this.flashTimer / HIT_FLASH_DURATION;
      for (const mat of this.materials) {
        mat.emissive.setScalar(intensity);
        mat.emissiveIntensity = intensity > 0 ? 1 : 0;
      }
    }
  }

  /** Porte : pose les battants d'apres une ouverture de 0 (fermee) a 1
   *  (grande ouverte), animee par le rendu vers l'etat de la simulation
   *  (Entity.wall.door). Quart de tour adouci ; la fermeture rejoue la meme
   *  courbe a l'envers. Sans effet sur un autre batiment. */
  setDoorOpenness(openness: number): void {
    const t = Math.min(1, Math.max(0, openness));
    const angle = t * t * (3 - 2 * t) * (Math.PI / 2);
    for (const leaf of this.doorLeaves) leaf.node.rotation.y = leaf.baseY + leaf.sign * angle;
  }

  /** Remet le bâtiment à son état visuel de départ — à appeler à chaque
   *  nouvelle bataille (le mesh unique est réutilisé d'une bataille à
   *  l'autre, jamais reconstruit). */
  reset(): void {
    this.setDoorOpenness(0);
    this.destroyed = false;
    this.damageFx.reset();
    this.mesh.visible = true;
    this.flashTimer = 0;
    for (const mat of this.materials) {
      mat.emissive.setScalar(0);
      mat.emissiveIntensity = 0;
    }
  }

  /** Vue abandonnee (batiment de run retire) : retire ses debris et libere
   *  ce qu'elle possede en propre — materiaux clones, fumee et debris. La geometrie
   *  du mesh, partagee par le cache d'assets, n'est jamais liberee ici. */
  dispose(): void {
    this.damageFx.dispose();
    for (const mat of this.materials) mat.dispose();
    this.materials.length = 0;
  }
}
