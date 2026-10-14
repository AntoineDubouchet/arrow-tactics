import type * as THREE from 'three';
import type { Entity } from '../sim/entity';

/** Tolerance minimale du clic de selection, en pixels, quand l'unite parait
 *  tres petite a l'ecran (zoom arriere). */
const PICK_MIN_RADIUS_PX = 18;
/** Facteur applique au rayon projete de l'unite : la silhouette deborde
 *  largement de son rayon de collision au sol. */
const PICK_RADIUS_FACTOR = 1.8;
/** Taille de l'anneau par rapport au rayon de l'unite. */
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

/**
 * Selection RTS pendant la bataille (prototype, selection simple). Vit cote
 * rendu/orchestration, jamais dans la simulation : elle ne retient qu'un id
 * d'entite et un anneau, sans rien ecrire dans le World.
 */
export class BattleSelection {
  private selectedId: number | null = null;

  /** `marker` : anneau de rayon 1 deja ajoute a la scene par l'appelant,
   *  mis a l'echelle ici selon l'unite selectionnee. */
  constructor(private readonly marker: THREE.Object3D) {
    this.marker.visible = false;
  }

  get selectedEntityId(): number | null {
    return this.selectedId;
  }

  select(entityId: number | null): void {
    this.selectedId = entityId;
    if (entityId === null) this.marker.visible = false;
  }

  clear(): void {
    this.select(null);
  }

  /** A appeler une fois par frame. Abandonne la selection si l'entite a
   *  disparu (World vide) ou est morte ; sinon place l'anneau sous sa
   *  position rendue. */
  sync(lookup: (id: number) => Entity | undefined, renderedPosition: RenderedPosition): void {
    if (this.selectedId === null) return;
    const entity = lookup(this.selectedId);
    if (!entity || !entity.alive) {
      this.clear();
      return;
    }
    const pos = renderedPosition(entity.id) ?? { x: entity.x, z: entity.z };
    this.marker.position.set(pos.x, 0.03, pos.z);
    this.marker.scale.setScalar(entity.stats.radius * MARKER_RADIUS_FACTOR);
    this.marker.visible = true;
  }
}
