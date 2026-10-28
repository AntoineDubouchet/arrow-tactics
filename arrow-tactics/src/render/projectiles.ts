import * as THREE from 'three';
import { COLORS } from '../config/constants';
import { lerp } from '../core/math';
import type { Team } from '../sim/entity';
import { surfaceY } from './terrainSurface';

const HEIGHT = 0.62;
const ARC_HEIGHT = 0.3;

/** Fleche SIMULEE d'un batiment defensif (Tour, voir
 *  sim/systems/buildingAttack.ts), telle que le rendu la lit. */
export interface SimulatedBolt {
  id: number;
  fromX: number;
  fromZ: number;
  /** Hauteur de depart et decalage vers la cible depuis le centre du
   *  batiment (BuildingAttackConfig.launchHeight / launchOutset). */
  fromY: number;
  fromOutset: number;
  targetId: number;
  prevElapsed: number;
  elapsed: number;
  duration: number;
  team: Team;
}

type Bolt = {
  mesh: THREE.Group;
  fromX: number;
  fromZ: number;
  toX: number;
  toZ: number;
  /** Id de la cible a SUIVRE pendant le vol (2026-08-14, correctif "les
   *  projectiles ne semblent pas toucher leur cible") — null pour un tir
   *  BLOQUE (toX/toZ est alors un point d'impact fixe sur un obstacle, qui
   *  ne bouge jamais). Voir Projectiles.sync. */
  targetId: number | null;
  elapsed: number;
  duration: number;
};

/**
 * Fleches d'archer purement visuelles : la simulation a deja applique dommages
 * et miss au moment du tir, ce vol n'est qu'un retour d'ecran. Trajectoire
 * simple (ligne droite + leger arc), en temps reel comme les autres animations
 * cosmetiques du rendu.
 *
 * `toX`/`toZ` sont RE-CALCULES a chaque frame pendant tout le vol si une
 * cible est fournie (2026-08-14, correctif "le projectile ne semble pas
 * toucher sa cible, ce n'est pas une question de raté") — le correctif du
 * 2026-08-13 ne corrigeait que la position CAPTUREE au moment du depart
 * (voir main.ts, pendingArrowSpawns), mais la cible peut encore bouger
 * PENDANT les ~0.22s de vol (frequent : une unite qui approche encore n'est
 * pas a l'arret) — sans ce suivi continu, la fleche visait un point deja
 * quitte par la cible a son arrivee, meme si les degats etaient deja bien
 * appliques en simulation. Ce leger "guidage" reste purement cosmetique
 * (les degats/le resultat du tir sont deja figes avant meme que la fleche
 * ne parte, voir pendingArrowSpawns) — il ne fait que faire correspondre ce
 * que le joueur VOIT a ce qui s'est REELLEMENT passe.
 */
export class Projectiles {
  readonly group = new THREE.Group();
  private readonly bolts: Bolt[] = [];
  /** Fleches simulees (Tour), par id de vol. */
  private readonly simulatedBolts = new Map<number, THREE.Group>();

  spawn(fromX: number, fromZ: number, toX: number, toZ: number, duration: number, team: Team, targetId: number | null = null): void {
    const mesh = buildBolt(team);
    this.group.add(mesh);
    this.bolts.push({ mesh, fromX, fromZ, toX, toZ, targetId, elapsed: 0, duration });
  }

  /** `resolveTargetPosition` optionnel : position ACTUELLE (idealement deja
   *  interpolee pour le rendu, voir main.ts) d'une entite par id — appele
   *  chaque frame pour chaque trait qui suit encore une cible vivante. */
  sync(realDt: number, resolveTargetPosition?: (id: number) => { x: number; z: number } | undefined): void {
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const b = this.bolts[i]!;
      if (b.targetId !== null && resolveTargetPosition) {
        const pos = resolveTargetPosition(b.targetId);
        if (pos) {
          b.toX = pos.x;
          b.toZ = pos.z;
        }
      }
      b.elapsed += realDt;
      const t = Math.min(1, b.elapsed / b.duration);

      // Relief : hauteur de vol au-dessus du sol de depart puis de la cible.
      b.mesh.position.set(
        lerp(b.fromX, b.toX, t),
        HEIGHT + lerp(surfaceY(b.fromX, b.fromZ), surfaceY(b.toX, b.toZ), t) + Math.sin(t * Math.PI) * ARC_HEIGHT,
        lerp(b.fromZ, b.toZ, t),
      );

      const dx = b.toX - b.fromX;
      const dz = b.toZ - b.fromZ;
      b.mesh.rotation.y = Math.atan2(-dx, -dz);

      if (t >= 1) {
        this.group.remove(b.mesh);
        this.bolts.splice(i, 1);
      }
    }
  }

  /** Fleches des batiments defensifs : meme modele que celles de l'Archer,
   *  mais l'avancement vient de la SIMULATION (elapsed / duration, interpole
   *  par `alpha` comme les unites) : l'impact visible coincide avec les
   *  degats, appliques a l'arrivee. Depart a `fromY` (creneaux), descente
   *  vers la hauteur de vol habituelle a la cible, suivie a sa position
   *  actuelle comme une fleche d'Archer ; inclinee selon la trajectoire. */
  syncSimulated(flights: readonly SimulatedBolt[], alpha: number, resolveTargetPosition: (id: number) => { x: number; z: number } | undefined): void {
    const alive = new Set<number>();
    for (const f of flights) {
      alive.add(f.id);
      let mesh = this.simulatedBolts.get(f.id);
      if (!mesh) {
        mesh = buildBolt(f.team);
        this.simulatedBolts.set(f.id, mesh);
        this.group.add(mesh);
      }
      const target = resolveTargetPosition(f.targetId);
      const toX = target?.x ?? f.fromX;
      const toZ = target?.z ?? f.fromZ;
      const t = Math.min(1, lerp(f.prevElapsed, f.elapsed, alpha) / f.duration);
      // Depart au bord du fut, du cote de la cible.
      const len = Math.hypot(toX - f.fromX, toZ - f.fromZ) || 1;
      const outset = Math.min(f.fromOutset, len);
      const startX = f.fromX + ((toX - f.fromX) / len) * outset;
      const startZ = f.fromZ + ((toZ - f.fromZ) / len) * outset;
      // Relief : creneaux au-dessus du sol de la tour, arrivee au-dessus du
      // sol de la cible.
      const fromY = f.fromY + surfaceY(f.fromX, f.fromZ);
      const toY = HEIGHT + surfaceY(toX, toZ);
      mesh.position.set(lerp(startX, toX, t), lerp(fromY, toY, t) + Math.sin(t * Math.PI) * ARC_HEIGHT, lerp(startZ, toZ, t));
      const dx = toX - startX;
      const dz = toZ - startZ;
      const dy = toY - fromY + Math.PI * Math.cos(t * Math.PI) * ARC_HEIGHT;
      mesh.rotation.set(Math.atan2(dy, Math.hypot(dx, dz)), Math.atan2(-dx, -dz), 0, 'YXZ');
    }
    for (const [id, mesh] of this.simulatedBolts) {
      if (alive.has(id)) continue;
      this.group.remove(mesh);
      this.simulatedBolts.delete(id);
    }
  }

  clear(): void {
    for (const b of this.bolts) this.group.remove(b.mesh);
    this.bolts.length = 0;
    for (const mesh of this.simulatedBolts.values()) this.group.remove(mesh);
    this.simulatedBolts.clear();
  }
}

function buildBolt(team: Team): THREE.Group {
  const accent = team === 'player' ? COLORS.playerHead : COLORS.enemyHead;
  const g = new THREE.Group();

  g.add(box(0.035, 0.035, 0.5, COLORS.blade, 0, 0, 0));
  g.add(box(0.06, 0.06, 0.08, COLORS.steelDark, 0, 0, -0.28)); // pointe
  g.add(box(0.14, 0.02, 0.08, accent, 0, 0, 0.22)); // empennage

  return g;
}

const materials = new Map<number, THREE.Material>();

function mat(color: number): THREE.Material {
  let m = materials.get(color);
  if (!m) {
    m = new THREE.MeshLambertMaterial({ color });
    materials.set(color, m);
  }
  return m;
}

function box(w: number, h: number, d: number, color: number, x: number, y: number, z: number): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
  mesh.position.set(x, y, z);
  return mesh;
}
