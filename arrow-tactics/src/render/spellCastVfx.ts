import * as THREE from 'three';
import type { Entity } from '../sim/entity';
import { loadVfxTexture } from './vfxTextures';
import { surfaceY } from './terrainSurface';

/**
 * Incantation d'un sort de Heros en cours (2026-11-02, Soin du Paladin) :
 * cercle magique au sol sous le lanceur, qui tourne et s'eclaire jusqu'a la
 * fin de l'incantation, et petit anneau sous la cible (si ce n'est pas le
 * lanceur). Lu chaque frame depuis Entity.cast et Entity.hero.spellCast
 * (aucun minuteur cote rendu) ; disparait des que l'incantation se termine
 * ou est annulee. L'impact du soin lui-meme reste HealVfxView.
 */
const magicCircleTexture = loadVfxTexture('magic_02.png');
/** Cercle en melange normal, teinte au-dela de 1 (texture en niveaux de gris) :
 *  lisible sur l'herbe claire, ou un cercle additif vert disparaissait. */
const CIRCLE_COLOR = new THREE.Color(1.7, 1.6, 1.05);
const CAST_COLOR = 0x9ff0b0;

interface CastView {
  circle: THREE.Mesh;
  targetRing: THREE.Mesh;
}

export class SpellCastVfxView {
  readonly group = new THREE.Group();
  private readonly views = new Map<number, CastView>();
  private spin = 0;

  /** `position` : position rendue d'une entite (interpolee). */
  sync(entities: readonly Entity[], position: (id: number) => { x: number; z: number } | null, realDt: number): void {
    this.spin += realDt;
    const active = new Set<number>();
    for (const e of entities) {
      const cast = e.cast;
      if (!e.alive || !e.hero?.spellCast || !cast?.heal) continue;
      active.add(e.id);
      let view = this.views.get(e.id);
      if (!view) {
        view = this.createView();
        this.views.set(e.id, view);
      }
      const progress = Math.min(1, cast.elapsed / Math.max(cast.duration, 1e-6));
      const at = position(e.id) ?? { x: e.x, z: e.z };
      view.circle.position.set(at.x, 0.05 + surfaceY(at.x, at.z), at.z);
      view.circle.rotation.z = this.spin * 1.4;
      view.circle.scale.setScalar(0.9 + 0.35 * progress);
      (view.circle.material as THREE.MeshBasicMaterial).opacity = 0.55 + 0.4 * progress;
      const target = cast.heal.targetId !== e.id ? position(cast.heal.targetId) : null;
      view.targetRing.visible = target !== null;
      if (target) {
        view.targetRing.position.set(target.x, 0.04 + surfaceY(target.x, target.z), target.z);
        (view.targetRing.material as THREE.MeshBasicMaterial).opacity = 0.45 + 0.25 * Math.sin(this.spin * 6);
      }
    }
    for (const [id, view] of this.views) {
      if (active.has(id)) continue;
      this.group.remove(view.circle, view.targetRing);
      (view.circle.material as THREE.Material).dispose();
      (view.targetRing.material as THREE.Material).dispose();
      view.circle.geometry.dispose();
      view.targetRing.geometry.dispose();
      this.views.delete(id);
    }
  }

  clear(): void {
    this.sync([], () => null, 0);
  }

  private createView(): CastView {
    const circle = new THREE.Mesh(
      new THREE.PlaneGeometry(2.1, 2.1),
      new THREE.MeshBasicMaterial({ map: magicCircleTexture, color: CIRCLE_COLOR, transparent: true, opacity: 0.55, depthWrite: false }),
    );
    circle.rotation.x = -Math.PI / 2;
    circle.renderOrder = 3;
    const targetRing = new THREE.Mesh(
      new THREE.RingGeometry(0.42, 0.52, 32),
      new THREE.MeshBasicMaterial({ color: CAST_COLOR, transparent: true, opacity: 0.6, depthWrite: false }),
    );
    targetRing.rotation.x = -Math.PI / 2;
    targetRing.renderOrder = 3;
    this.group.add(circle, targetRing);
    return { circle, targetRing };
  }
}
