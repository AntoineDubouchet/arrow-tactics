import type { Entity } from '../entity';
import { cargoWork, type CargoEvent } from './cargo';
import { workGoal, type HeroWorkContext } from './hero';

/**
 * Villageois (2026-11-03, unite economique) : apres movementSystem, sa
 * recolte, ses tas et ses depots passent par le cargo economique partage
 * avec le Heros (sim/systems/cargo.ts) ; tout autre ordre de travail lui est
 * refuse (sim/orders.ts). Un Villageois mort perd son cargo (deathSystem du
 * monde). Aucune attaque : degats 0, aggro 0 (data/units.ts).
 */
export function workerSystem(entities: Entity[], work: HeroWorkContext, dt: number, events: CargoEvent[]): void {
  const byId = new Map(entities.map((e) => [e.id, e]));
  for (const e of entities) {
    const w = e.worker;
    if (!w || !e.alive) continue;
    const goal = workGoal(e, work, byId);
    if (!cargoWork(e, goal, work, entities, dt, events)) {
      w.working = null;
      w.workTimer = 0;
    }
  }
}
