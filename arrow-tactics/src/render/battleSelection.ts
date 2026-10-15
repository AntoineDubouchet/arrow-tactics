import * as THREE from 'three';
import type { Entity } from '../sim/entity';
import { isCommandable } from '../sim/orders';
import { createUnitSelectionRing, placeUnitSelectionRing } from './unitSelectionRing';

/** Tolerance minimale du clic de selection, en pixels, quand l'unite parait
 *  tres petite a l'ecran (zoom arriere). */
const PICK_MIN_RADIUS_PX = 18;
/** Facteur applique au rayon projete de l'unite : la silhouette deborde
 *  largement de son rayon de collision au sol. */
const PICK_RADIUS_FACTOR = 1.8;
/** Taille de l'anneau de cible par rapport au rayon de l'entite visee. */
const MARKER_RADIUS_FACTOR = 1.4;

type ScreenProjector = (x: number, z: number) => { x: number; y: number };
type RenderedPosition = (entityId: number) => { x: number; z: number } | null;

/**
 * Entite vivante (unite ou batiment, des deux camps) la plus proche du point
 * clique a l'ecran, dans une tolerance qui suit le zoom. Le test se fait sur
 * la position RENDUE (celle que le joueur voit), projetee a l'ecran : pas de
 * raycast sur les modeles animes. L'appelant decide ensuite quoi faire de
 * l'entite trouvee (selectionner un allie, ignorer un ennemi...).
 */
export function pickEntityAtScreen(
  entities: readonly Entity[],
  clientX: number,
  clientY: number,
  project: ScreenProjector,
  renderedPosition: RenderedPosition,
): Entity | null {
  let best: Entity | null = null;
  let bestDist = Infinity;

  for (const e of entities) {
    if (!e.alive) continue;
    const pos = renderedPosition(e.id) ?? { x: e.x, z: e.z };
    const center = project(pos.x, pos.z);
    // Rayon a l'ecran mesure sur les deux axes du sol : la camera est
    // tournee, un seul axe serait raccourci selon l'angle de vue.
    const alongX = project(pos.x + e.stats.radius, pos.z);
    const alongZ = project(pos.x, pos.z + e.stats.radius);
    const projectedRadius = Math.max(Math.hypot(alongX.x - center.x, alongX.y - center.y), Math.hypot(alongZ.x - center.x, alongZ.y - center.y));
    const tolerance = Math.max(PICK_MIN_RADIUS_PX, projectedRadius * PICK_RADIUS_FACTOR);

    const d = Math.hypot(clientX - center.x, clientY - center.y);
    if (d <= tolerance && d < bestDist) {
      bestDist = d;
      best = e;
    }
  }
  return best;
}

/** Rectangle en pixels ecran (meme forme que SelectionBox.toRect). */
export interface ScreenRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** Point ecran dans le rectangle (bords inclus). Test commun des
 *  rectangles de selection et des double-clics "unites visibles" (le
 *  rectangle du canvas) en bataille, en preparation et dans l'editeur. */
export function isInScreenRect(p: { x: number; y: number }, rect: ScreenRect): boolean {
  return p.x >= rect.left && p.x <= rect.right && p.y >= rect.top && p.y <= rect.bottom;
}

/**
 * Unites selectionnables (unites vivantes du joueur, jamais un ennemi ni un
 * batiment) dont la position RENDUE, projetee a l'ecran, tombe dans `rect`.
 * Meme test que le rectangle de la phase de placement (selectUnitsInRect,
 * main.ts) ; sert aussi au double-clic avec le viewport comme rectangle.
 */
export function selectableUnitsInScreenRect(
  entities: readonly Entity[],
  rect: ScreenRect,
  project: ScreenProjector,
  renderedPosition: RenderedPosition,
): Entity[] {
  const inside: Entity[] = [];
  for (const e of entities) {
    if (!isCommandable(e)) continue;
    const pos = renderedPosition(e.id) ?? { x: e.x, z: e.z };
    if (isInScreenRect(project(pos.x, pos.z), rect)) inside.push(e);
  }
  return inside;
}

/**
 * Selection RTS pendant la bataille (prototype). Vit cote rendu/orchestration,
 * jamais dans la simulation : elle ne retient que des ids d'entites et des
 * anneaux, sans rien ecrire dans le World.
 *
 * Anneaux : une reserve d'objets crees a la demande, jamais detruits,
 * simplement masques quand ils ne servent plus. Sous chaque unite
 * selectionnee, l'anneau commun aux unites (render/unitSelectionRing.ts, a
 * la couleur de son camp) ; sous une cible d'ordre d'attaque, un clone du
 * modele fourni (geometrie et materiau partages).
 */
export class BattleSelection {
  /** A ajouter a la scene par l'appelant : contient tous les anneaux. */
  readonly group = new THREE.Group();
  private readonly selected = new Set<number>();
  private readonly rings: THREE.Mesh[] = [];
  private readonly targetRings: THREE.Object3D[] = [];

  /** `targetRingTemplate` : anneau de rayon 1 place sous la cible d'un ordre
   *  d'attaque d'une unite selectionnee (une seule fois par cible). */
  constructor(private readonly targetRingTemplate: THREE.Object3D) {}

  /** Ids selectionnes, dans l'ordre d'ajout. */
  get ids(): number[] {
    return [...this.selected];
  }

  get size(): number {
    return this.selected.size;
  }

  has(entityId: number): boolean {
    return this.selected.has(entityId);
  }

  /** Remplace toute la selection. */
  set(entityIds: Iterable<number>): void {
    this.selected.clear();
    for (const id of entityIds) this.selected.add(id);
    if (this.selected.size === 0) this.hideRings();
  }

  /** Ajoute l'unite si elle n'est pas selectionnee, la retire sinon. */
  toggle(entityId: number): void {
    if (!this.selected.delete(entityId)) this.selected.add(entityId);
  }

  clear(): void {
    this.set([]);
  }

  /** A appeler une fois par frame. Retire de la selection les entites
   *  disparues (World vide) ou mortes, puis place un anneau sous la position
   *  rendue de chaque unite restante. */
  sync(lookup: (id: number) => Entity | undefined, renderedPosition: RenderedPosition): void {
    const targetIds = new Set<number>();
    let used = 0;
    for (const id of this.selected) {
      const entity = lookup(id);
      if (!entity || !entity.alive) {
        this.selected.delete(id);
        continue;
      }
      const pos = renderedPosition(entity.id) ?? { x: entity.x, z: entity.z };
      placeUnitSelectionRing(this.selectionRingAt(used++), entity.team, pos.x, pos.z, entity.stats.radius);
      // Cible de l'ordre d'attaque en cours (lecture seule de l'etat de la
      // simulation) : visible tant que l'ordre existe, y compris pendant une
      // Provocation qui le suspend.
      if (entity.order.type === 'attack') targetIds.add(entity.order.targetEntityId);
    }
    for (let i = used; i < this.rings.length; i++) this.rings[i]!.visible = false;

    let usedTargets = 0;
    for (const id of targetIds) {
      const target = lookup(id);
      if (target && target.alive) placeRing(this.targetRingAt(usedTargets++), target, renderedPosition);
    }
    for (let i = usedTargets; i < this.targetRings.length; i++) this.targetRings[i]!.visible = false;
  }

  private selectionRingAt(index: number): THREE.Mesh {
    while (this.rings.length <= index) {
      // Le camp n'est qu'une valeur initiale : placeUnitSelectionRing
      // reassigne le materiau du camp de l'unite a chaque frame.
      const ring = createUnitSelectionRing('player');
      this.group.add(ring);
      this.rings.push(ring);
    }
    return this.rings[index]!;
  }

  private targetRingAt(index: number): THREE.Object3D {
    while (this.targetRings.length <= index) {
      const ring = this.targetRingTemplate.clone();
      this.group.add(ring);
      this.targetRings.push(ring);
    }
    return this.targetRings[index]!;
  }

  private hideRings(): void {
    for (const ring of this.rings) ring.visible = false;
    for (const ring of this.targetRings) ring.visible = false;
  }
}

function placeRing(ring: THREE.Object3D, entity: Entity, renderedPosition: RenderedPosition): void {
  const pos = renderedPosition(entity.id) ?? { x: entity.x, z: entity.z };
  ring.position.set(pos.x, 0.03, pos.z);
  ring.scale.setScalar(entity.stats.radius * MARKER_RADIUS_FACTOR);
  ring.visible = true;
}
