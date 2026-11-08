import type { Entity } from '../entity';
import { distanceToSegment } from '../../core/wallLine';
import { DOOR_ALLY_OPEN_RANGE, DOOR_ENEMY_CLOSE_RANGE } from '../../data/walls';
import { areAllied } from '../relations';

/**
 * Portes des murs V2 (2026-11-02, Entity.wall.door) : entierement automatiques
 * (doorDemandSystem) ; le joueur n'a plus de bouton, World.setDoorWanted ne sert plus
 * qu'aux tests. Au pas fixe, avant tout deplacement. La simulation est la seule source de verite ; le
 * rendu anime les battants d'apres `door.open`.
 *
 * - Passage : l'emprise reste dans World.obstacles ; le proprietaire et ses allies
 *   franchissent une porte batie (sim/relations.ts, canUnitPassGate), elle bloque
 *   toujours les hostiles. L'etat ouvert ou ferme ne change donc plus les chemins :
 *   seule la fin du chantier remplace la liste d'obstacles (onChange).
 * - Ouverture : immediate.
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
    if (!door.built) {
      door.built = true;
      onChange();
    }
    if (door.wantOpen === door.open) continue;
    if (door.wantOpen) {
      door.open = true;
      continue;
    }
    const w = e.wall!;
    const hw = halfWidthOf(e);
    const occupied = entities.some((u) => u.alive && !u.isBuilding && areAllied(u.team, door.owner) && distanceToSegment(u.x, u.z, w) < u.stats.radius + hw - 1e-3);
    if (occupied) continue;
    door.open = false;
  }
}

/**
 * Portes automatiques (2026-11-06, decision d'Antoine), apres les deplacements du pas
 * (Entity.prevX, prevZ) ; doorSystem applique au pas suivant. Une unite alliee qui se
 * rapproche d'une porte (DOOR_ALLY_OPEN_RANGE) l'ouvre ; sinon, un hostile proche
 * (DOOR_ENEMY_CLOSE_RANGE) la ferme. L'allie passe en premier : un hostile ne franchit
 * jamais une porte, meme ouverte, alors qu'un allie laisse dehors resterait coince.
 * Sans personne : elle reste comme elle est. Deterministe.
 *
 * Verrouillee fermee par le joueur (2026-11-08, `door.locked`, World.setDoorLocked) :
 * aucune ouverture automatique, l'etat voulu reste « fermee » (doorSystem la ferme des
 * que l'ouverture est libre) ; retour en mode automatique : ces regles reprennent.
 */
export function doorDemandSystem(entities: readonly Entity[]): void {
  for (const e of entities) {
    const door = e.wall?.door;
    if (!door || !e.alive || e.construction) continue;
    if (door.locked) {
      door.wantOpen = false;
      continue;
    }
    const w = e.wall!;
    let allyApproaching = false;
    let enemyNear = false;
    for (const u of entities) {
      if (!u.alive || u.isBuilding) continue;
      const d = distanceToSegment(u.x, u.z, w);
      if (!areAllied(u.team, door.owner)) {
        if (d <= DOOR_ENEMY_CLOSE_RANGE) enemyNear = true;
      } else if (d <= DOOR_ALLY_OPEN_RANGE && d < distanceToSegment(u.prevX, u.prevZ, w) - 1e-4) {
        allyApproaching = true;
        break;
      }
    }
    if (allyApproaching) door.wantOpen = true;
    else if (enemyNear) door.wantOpen = false;
  }
}
