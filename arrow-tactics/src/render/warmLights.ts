import * as THREE from 'three';
import type { StartingBaseLayout } from '../config/startingBase';
import type { WallSegment } from '../core/wallLine';
import { surfaceY } from './terrainSurface';
import type { MistLightSource } from './groundMist';
import { buildCampfire, disposeFireProp, tickFlames } from './fireProps';

/**
 * SOURCES CHAUDES DU CAMP DU JOUEUR (rendu officiel 2026-11-07, Graphic Lab « ancrage et lumiere »
 * clos, DESIGN_DECISIONS.md A5 ; vrais supports et budget de lumieres le 2026-11-08, EN COURS DE
 * VALIDATION) : les « poches de chaleur » d'un monde froid.
 * - FEU DE CAMP devant l'Hotel de ville (render/fireProps.ts, buildCampfire) : position derivee de
 *   l'orientation reelle du batiment (+Z local = facade et marches), un peu de cote pour laisser
 *   l'axe de la porte aux unites ; UNE PointLight ancree sur le coeur des flammes ;
 * - TORCHES des portes de palissade : les torches elles-memes (une par montant) font partie du
 *   modele de porte (render/palisade.ts, toute porte en porte deux) ; ici, les LUMIERES : un
 *   reservoir de GATE_LIGHT_POOL PointLight partagees, chacune posee au centre d'une paire de torches,
 *   sur les portes les plus proches du point vise par la camera (fondu a la reassignation), jamais
 *   une PointLight par torche. Les portes vivantes sont fournies chaque image par main.ts
 *   (syncGates : toute porte du joueur, camp de depart ou construite, retiree quand elle tombe).
 * Toutes les sources (feu + chaque porte) alimentent la brume et les nappes (sources(),
 * render/groundMist.ts setMistLights, 4 au plus en shader : les plus proches du point vise).
 * PointLight courte a decroissance quadratique, sans ombre. Rendu seulement, aucun gameplay.
 * Valeurs PROVISOIRES.
 *
 * Budget : la scene compte deja une PointLight par camp neutre ; ce module en ajoute
 * 1 + GATE_LIGHT_POOL, quel que soit le nombre de portes (nombre constant : aucune recompilation des
 * materiaux). Si le nombre de sources augmente encore, passer par l'approximation shader (A5).
 */
const LIGHT_COLOR = 0xffa040;
const LIGHT_INTENSITY = 9;
const LIGHT_DISTANCE = 7;
const LIGHT_DECAY = 2;
/** Feu de camp : position locale devant l'Hotel de ville (+Z local = facade ; emprise 4 x 4, bord a
 *  2) : 1 case devant le bord, 1,9 case de cote (hors de l'axe de la porte et des marches, a une
 *  case du point d'apparition du Heros, hors de l'ombre de la Baliste qui couvre le cote oppose). */
const CAMPFIRE_LOCAL = { x: -1.9, z: 3.0 };
/** Lumiere d'une porte : centre de la paire de torches, hauteur de leurs flammes (render/palisade.ts :
 *  base a 1,0 + coeur de flamme 0,85). */
const GATE_LIGHT_HEIGHT = 1.85;
/** Rayon (monde) de la brume eclairee (render/groundMist.ts, setMistLights). */
const MIST_RADIUS = 5;
/** Reservoir de lumieres de portes et vitesse du fondu (par seconde). */
const GATE_LIGHT_POOL = 2;
const GATE_FADE_SPEED = 3;

interface GateLight {
  light: THREE.PointLight;
  /** Indice de la porte eclairee dans `gates`, ou -1. */
  anchor: number;
  fade: number;
}

export class WarmLights {
  readonly group = new THREE.Group();
  private campfire: { root: THREE.Group; light: THREE.PointLight; phase: number } | null = null;
  /** Portes vivantes : centre monde et hauteur de la lumiere. */
  private gates: { x: number; y: number; z: number }[] = [];
  private gatesKey = '';
  private readonly gateLights: GateLight[] = [];
  private focus = { x: 0, z: 0 };
  private time = 0;
  private flicker = 1;

  constructor() {
    for (let i = 0; i < GATE_LIGHT_POOL; i++) {
      const light = new THREE.PointLight(LIGHT_COLOR, 0, LIGHT_DISTANCE, LIGHT_DECAY);
      light.castShadow = false;
      // Toujours dans la scene (intensite nulle au repos) : nombre de lumieres constant.
      this.group.add(light);
      this.gateLights.push({ light, anchor: -1, fade: 0 });
    }
  }

  /** Pose le feu de camp pour la disposition du camp de depart ; rien sans Hotel de ville. */
  place(layout: StartingBaseLayout | null): void {
    this.clear();
    const townhall = layout?.buildings.find((b) => b.buildingId === 'townhall');
    if (!townhall) return;
    // Point local (lx, lz) d'un batiment en monde (convention core/orientedBox.ts).
    const x = townhall.x + CAMPFIRE_LOCAL.x * Math.cos(townhall.rotationY) + CAMPFIRE_LOCAL.z * Math.sin(townhall.rotationY);
    const z = townhall.z - CAMPFIRE_LOCAL.x * Math.sin(townhall.rotationY) + CAMPFIRE_LOCAL.z * Math.cos(townhall.rotationY);
    const fire = buildCampfire();
    fire.group.position.set(x, surfaceY(x, z), z);
    fire.group.rotation.y = townhall.rotationY;
    const light = new THREE.PointLight(LIGHT_COLOR, LIGHT_INTENSITY, LIGHT_DISTANCE, LIGHT_DECAY);
    light.castShadow = false;
    light.position.y = fire.flameY;
    fire.group.add(light);
    this.group.add(fire.group);
    // Scintillement cosmetique (Math.random permis cote rendu).
    this.campfire = { root: fire.group, light, phase: Math.random() * 6.28 };
  }

  /** Portes de palissade vivantes du joueur (segments A -> B), chaque image (main.ts) : ancres des
   *  lumieres et sources de brume. Rien a faire si la liste n'a pas change. */
  syncGates(gates: readonly WallSegment[]): void {
    const key = gates.map((s) => `${s.ax.toFixed(2)},${s.az.toFixed(2)},${s.bx.toFixed(2)},${s.bz.toFixed(2)}`).join('|');
    if (key === this.gatesKey) return;
    this.gatesKey = key;
    this.gates = gates.map((s) => {
      const x = (s.ax + s.bx) / 2;
      const z = (s.az + s.bz) / 2;
      return { x, z, y: surfaceY(x, z) + GATE_LIGHT_HEIGHT };
    });
    for (const gl of this.gateLights) if (gl.anchor >= this.gates.length) { gl.anchor = -1; gl.fade = 0; }
  }

  /** Point vise par la camera (choix des portes eclairees). */
  setFocus(x: number, z: number): void {
    this.focus.x = x;
    this.focus.z = z;
  }

  /** Scintillement, horloge des flammes, affectation des lumieres de portes (rendu seulement). */
  animate(realDt: number): void {
    this.time += realDt;
    tickFlames(realDt);
    this.flicker = 0.88 + 0.1 * Math.sin(this.time * 10) + Math.random() * 0.04;
    if (this.campfire) this.campfire.light.intensity = LIGHT_INTENSITY * (0.88 + 0.1 * Math.sin(this.time * 10 + this.campfire.phase) + Math.random() * 0.04);
    // Portes par distance au point vise ; une lumiere garde sa porte tant qu'elle reste parmi les
    // GATE_LIGHT_POOL + 1 plus proches (hysteresis), puis s'eteint en fondu avant d'etre reaffectee.
    const ranked = this.gates.map((g, i) => ({ i, d: Math.hypot(g.x - this.focus.x, g.z - this.focus.z) })).sort((a, b) => a.d - b.d);
    const rank = new Map(ranked.map((r, k) => [r.i, k]));
    const wanted = ranked.slice(0, GATE_LIGHT_POOL).map((r) => r.i);
    const held = new Set<number>();
    for (const gl of this.gateLights) {
      if (gl.anchor < 0) continue;
      if ((rank.get(gl.anchor) ?? Infinity) <= GATE_LIGHT_POOL) {
        gl.fade = Math.min(1, gl.fade + realDt * GATE_FADE_SPEED);
        held.add(gl.anchor);
      } else {
        gl.fade -= realDt * GATE_FADE_SPEED;
        if (gl.fade <= 0) { gl.fade = 0; gl.anchor = -1; } else held.add(gl.anchor);
      }
    }
    for (const gl of this.gateLights) {
      if (gl.anchor >= 0) continue;
      const next = wanted.find((i) => !held.has(i));
      if (next === undefined) continue;
      gl.anchor = next;
      gl.fade = 0;
      held.add(next);
    }
    for (const gl of this.gateLights) {
      const g = gl.anchor >= 0 ? this.gates[gl.anchor] : undefined;
      if (g) gl.light.position.set(g.x, g.y, g.z);
      gl.light.intensity = g ? LIGHT_INTENSITY * this.flicker * gl.fade : 0;
    }
  }

  /** Sources pour la brume et les nappes (render/groundMist.ts, setMistLights) : feu de camp et
   *  chaque porte vivante (qu'elle porte une PointLight ou non). */
  sources(): MistLightSource[] {
    const color = new THREE.Color(LIGHT_COLOR);
    const out: MistLightSource[] = [];
    if (this.campfire) {
      const p = new THREE.Vector3();
      this.campfire.light.getWorldPosition(p);
      out.push({ x: p.x, y: p.y, z: p.z, radius: MIST_RADIUS, color, level: this.campfire.light.intensity / LIGHT_INTENSITY });
    }
    for (const g of this.gates) out.push({ x: g.x, y: g.y, z: g.z, radius: MIST_RADIUS, color, level: this.flicker });
    return out;
  }

  /** Comptes pour les controles : PointLight presentes et allumees, portes connues. */
  stats(): { pointLights: number; litLights: number; gates: number; campfire: boolean } {
    const lights = [...this.gateLights.map((g) => g.light), ...(this.campfire ? [this.campfire.light] : [])];
    return { pointLights: lights.length, litLights: lights.filter((l) => l.intensity > 0).length, gates: this.gates.length, campfire: !!this.campfire };
  }

  clear(): void {
    if (this.campfire) {
      this.group.remove(this.campfire.root);
      disposeFireProp(this.campfire.root);
      this.campfire = null;
    }
    this.gates = [];
    this.gatesKey = '';
    for (const gl of this.gateLights) { gl.anchor = -1; gl.fade = 0; gl.light.intensity = 0; }
  }
}
