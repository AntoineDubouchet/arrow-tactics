import { obstacleBounds } from '../../config/constants';
import type { Entity } from '../entity';

/**
 * Portes de muraille (BuildingDef.gate, Entity.gate) : ouverture automatique
 * a l'approche d'une unite ALLIEE, au pas fixe, avant movementSystem. La
 * simulation est la seule source de verite du passage ; le rendu se
 * contente d'animer les battants d'apres `openness`.
 *
 * - closed -> opening : une unite du camp de la porte est a moins de
 *   `triggerRangeTiles` de son emprise.
 * - opening -> open : ouverture complete en `openDurationSeconds`. Une
 *   ouverture commencee va toujours jusqu'au bout.
 * - open -> closing : plus aucun allie proche depuis `closeDelaySeconds`.
 * - closing -> opening : un allie revient (la porte se rouvre d'ou elle en
 *   est) ; closing -> closed sinon, en `openDurationSeconds`.
 *
 * Passage PHYSIQUE (World.setGatePassage) des que `openness` atteint
 * `passableOpenness` : en dessous, les battants bloquent encore. Une unite
 * alliee dans l'emprise compte toujours comme "proche" : la porte ne se
 * referme jamais sur elle. Les hostiles ne declenchent rien et ne franchissent
 * jamais la porte (sim/geometry.ts, obstaclesCollidingTeam).
 */
export function gateSystem(entities: Entity[], dt: number, setPassage: (gate: Entity, open: boolean) => void): void {
  for (const gate of entities) {
    const g = gate.gate;
    if (!g) continue;
    g.prevOpenness = g.openness;
    if (!gate.alive || !gate.footprintObstacle) continue;

    const b = obstacleBounds(gate.footprintObstacle);
    let allyNear = false;
    for (const e of entities) {
      if (!e.alive || e.isBuilding || e.team !== gate.team) continue;
      const dx = Math.max(b.minX - e.x, 0, e.x - b.maxX);
      const dz = Math.max(b.minZ - e.z, 0, e.z - b.maxZ);
      if (Math.hypot(dx, dz) <= g.triggerRangeTiles) {
        allyNear = true;
        break;
      }
    }

    const step = dt / g.openDurationSeconds;
    if (allyNear) {
      g.closeTimer = 0;
      g.openness = Math.min(1, g.openness + step);
      g.phase = g.openness >= 1 ? 'open' : 'opening';
    } else if (g.phase === 'opening') {
      g.openness = Math.min(1, g.openness + step);
      if (g.openness >= 1) g.phase = 'open';
    } else if (g.phase === 'open') {
      g.closeTimer += dt;
      if (g.closeTimer >= g.closeDelaySeconds) g.phase = 'closing';
    } else if (g.phase === 'closing') {
      g.openness = Math.max(0, g.openness - step);
      if (g.openness <= 0) g.phase = 'closed';
    }

    const passable = g.openness >= g.passableOpenness;
    if (passable !== g.passable) {
      g.passable = passable;
      setPassage(gate, passable);
    }
  }
}
