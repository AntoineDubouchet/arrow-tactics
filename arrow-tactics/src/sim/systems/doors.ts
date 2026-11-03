import type { Entity } from '../entity';
import { distanceToSegment } from '../../core/wallLine';
import { areAllied } from '../relations';

/**
 * Portes des murs V2 (2026-11-02, Entity.wall.door) : ouvertes ou fermees sur
 * demande de leur camp (World.setDoorWanted), au pas fixe, avant tout
 * deplacement. La simulation est la seule source de verite du passage ; le
 * rendu anime les battants d'apres `door.open`.
 *
 * - Ouverture : immediate ; l'emprise reste dans World.obstacles, mais le
 *   proprietaire et ses allies la franchissent (sim/relations.ts,
 *   canUnitPassGate) ; elle bloque toujours les hostiles.
 * - Fermeture : seulement quand aucun corps n'occupe l'ouverture (unite
 *   alliee du proprietaire, seule a pouvoir s'y trouver, dont le cercle
 *   entre dans la capsule) ; sinon elle ATTEND, sans jamais ecraser ni
 *   pousser personne, et se fait au premier pas libre. Un hostile plaque
 *   contre la porte (il ne la franchit pas) n'empeche pas de la fermer.
 * - Chantier : porte fermee, rien a ouvrir tant qu'elle n'est pas bâtie.
 */
export function doorSystem(entities: readonly Entity[], halfWidthOf: (door: Entity) => number, onChange: () => void): void {
  for (const e of entities) {
    const door = e.wall?.door;
    if (!door || !e.alive || e.construction) continue;
    if (door.wantOpen === door.open) continue;
    if (door.wantOpen) {
      door.open = true;
      onChange();
      continue;
    }
    const w = e.wall!;
    const hw = halfWidthOf(e);
    const occupied = entities.some((u) => u.alive && !u.isBuilding && areAllied(u.team, door.owner) && distanceToSegment(u.x, u.z, w) < u.stats.radius + hw - 1e-3);
    if (occupied) continue;
    door.open = false;
    onChange();
  }
}
