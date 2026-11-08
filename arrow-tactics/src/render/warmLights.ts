import * as THREE from 'three';
import type { StartingBaseLayout } from '../config/startingBase';
import { surfaceY } from './terrainSurface';
import type { MistLightSource } from './groundMist';

/**
 * SOURCES CHAUDES DU CAMP DU JOUEUR (rendu officiel 2026-11-07, Graphic Lab « ancrage et lumiere »
 * clos, DESIGN_DECISIONS.md A5) : deux petites lumieres ambrees qui font les « poches de chaleur »
 * d'un monde froid : devant la porte de l'Hotel de ville (marches, sol et tonneau rechauffes) et sur
 * un montant de la porte de palissade la plus proche du Heros (bois chaud, contraste avec
 * l'exterieur). PointLight courte a decroissance quadratique, sans ombre, et deux petits cones de
 * flamme additifs (meme famille que le feu de camp, render/campViews.ts) comme simple indicateur :
 * un vrai asset de torche ou de lanterne reste en parking (ROADMAP.md §7). Elles alimentent aussi
 * la brume (sources(), render/groundMist.ts). Positions derivees de la disposition du camp
 * (config/startingBase.ts) ; rien si la carte n'a pas de camp de depart. Rendu seulement, aucun
 * gameplay. Valeurs PROVISOIRES.
 *
 * Contrainte : la scene compte deja une PointLight par camp neutre ; ce module n'est pas prevu
 * pour une lumiere par batiment (voir A5 : approximation shader si leur nombre augmente).
 */
const LIGHT_COLOR = 0xffa040;
const LIGHT_INTENSITY = 9;
const LIGHT_DISTANCE = 7;
const LIGHT_DECAY = 2;
/** Hauteur de la source devant l'Hotel de ville (monde). */
const LIGHT_HEIGHT = 1.0;
/** Hauteur de la source sur le montant de la porte (GATE_POST_HEIGHT 2,2 dans render/palisade.ts). */
const GATE_LIGHT_HEIGHT = 1.5;
/** Rayon (monde) de la brume eclairee (render/groundMist.ts, setMistLights). */
const MIST_RADIUS = 5;

const flameGeometry = new THREE.ConeGeometry(0.09, 0.3, 6, 1, true);
flameGeometry.translate(0, 0.15, 0);

interface WarmLight {
  root: THREE.Group;
  light: THREE.PointLight;
  flames: THREE.Mesh[];
  phase: number;
}

export class WarmLights {
  readonly group = new THREE.Group();
  private items: WarmLight[] = [];
  private time = 0;

  /** Place les sources pour la disposition du camp de depart ; vide sans disposition. */
  place(layout: StartingBaseLayout | null): void {
    this.clear();
    if (!layout) return;
    const spots: { x: number; z: number; y: number }[] = [];
    // Point local (lx, lz) d'un batiment en monde (convention core/orientedBox.ts).
    const local = (b: { x: number; z: number; rotationY: number }, lx: number, lz: number) => ({ x: b.x + lx * Math.cos(b.rotationY) + lz * Math.sin(b.rotationY), z: b.z - lx * Math.sin(b.rotationY) + lz * Math.cos(b.rotationY) });
    // Source A : devant la porte de l'Hotel de ville (+Z local).
    const townhall = layout.buildings.find((b) => b.buildingId === 'townhall');
    if (townhall) spots.push({ ...local(townhall, 0, 2.6), y: LIGHT_HEIGHT });
    // Source B : porte de palissade la plus proche du Heros, sur un montant (bout de la ligne de
    // porte), un peu en dedans, a mi-hauteur du montant.
    let best: { x: number; z: number; d: number } | null = null;
    for (const line of layout.walls) {
      if (!line.gates?.length) continue;
      const d = Math.hypot((line.ax + line.bx) / 2 - layout.hero.x, (line.az + line.bz) / 2 - layout.hero.z);
      if (!best || d < best.d) best = { x: line.ax, z: line.az, d };
    }
    if (best) {
      const ox = layout.origin.x - best.x;
      const oz = layout.origin.z - best.z;
      const n = Math.hypot(ox, oz) || 1;
      spots.push({ x: best.x + (ox / n) * 0.35, z: best.z + (oz / n) * 0.35, y: GATE_LIGHT_HEIGHT });
    }
    for (const s of spots) this.items.push(this.create(s.x, s.y, s.z));
  }

  private create(x: number, y: number, z: number): WarmLight {
    const root = new THREE.Group();
    root.position.set(x, surfaceY(x, z) + y, z);
    const flames = [0xff7a2a, 0xffd25a].map((color, i) => {
      const flame = new THREE.Mesh(flameGeometry, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.7 - i * 0.2, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
      flame.scale.setScalar(1 - i * 0.3);
      root.add(flame);
      return flame;
    });
    const light = new THREE.PointLight(LIGHT_COLOR, LIGHT_INTENSITY, LIGHT_DISTANCE, LIGHT_DECAY);
    light.castShadow = false;
    root.add(light);
    this.group.add(root);
    // Scintillement cosmetique (Math.random permis cote rendu).
    return { root, light, flames, phase: Math.random() * 6.28 };
  }

  /** Scintillement cosmetique (rendu seulement). */
  animate(realDt: number): void {
    this.time += realDt;
    for (const it of this.items) {
      it.light.intensity = LIGHT_INTENSITY * (0.88 + 0.1 * Math.sin(this.time * 10 + it.phase) + Math.random() * 0.04);
      it.flames.forEach((flame, i) => {
        flame.scale.y = (1 - i * 0.3) * (0.85 + 0.2 * Math.sin(this.time * (8 + i * 2) + it.phase));
        flame.rotation.y += realDt * (0.8 + i * 0.4);
      });
    }
  }

  /** Sources pour la brume (render/groundMist.ts, setMistLights). */
  sources(): MistLightSource[] {
    return this.items.map((it) => ({ x: it.root.position.x, y: it.root.position.y, z: it.root.position.z, radius: MIST_RADIUS, color: it.light.color, level: it.light.intensity / LIGHT_INTENSITY }));
  }

  clear(): void {
    for (const it of this.items) {
      this.group.remove(it.root);
      for (const f of it.flames) (f.material as THREE.Material).dispose();
    }
    this.items = [];
  }
}
