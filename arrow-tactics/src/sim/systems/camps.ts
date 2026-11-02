import type { Entity } from '../entity';

/**
 * Camps neutres (2026-11-02, premiere boucle d'exploration) : gardes lies a
 * leur camp, coffre verrouille tant qu'ils vivent. Parametres deja resolus
 * (data/camps.ts, par l'orchestration) ; aucune notion de brouillard ici (la
 * decouverte d'un camp est une affaire de presentation). Valeurs PROVISOIRES.
 *
 * Comportement des gardes :
 *  - au calme, ils restent a leur poste (ordre Garde) et ne ciblent qu'un
 *    adversaire entre dans la zone de DETECTION du camp (Entity.huntZone) ;
 *  - un adversaire dans cette zone, ou un garde blesse, met le camp en ALERTE :
 *    la zone de chasse devient la LAISSE (tous les gardes s'engagent) ;
 *  - l'alerte retombe quand plus aucun adversaire n'est dans la laisse ; un
 *    garde sans cible, ou trop loin du camp, rentre alors a son poste (ordre
 *    de deplacement, adversaires ignores en chemin) et s'y regenere ;
 *  - le camp est NETTOYE quand tous ses gardes sont morts : pas de retour des
 *    gardes, coffre ouvrable.
 * Camp au calme : ses gardes ne sont jamais cibles automatiquement par les
 * unites du joueur (un Heros en Garde qui voit un camp ne fonce pas dessus) ;
 * un ordre d'attaque, une entree dans la zone de detection ou un garde blesse
 * declenchent le combat. PROVISOIRE.
 * Les gardes ne comptent pas pour la fin d'une vague (countsForDefeat faux)
 * et ne marchent jamais vers la Baliste (ordre Garde, jamais `assault`).
 */
export interface CampState {
  id: number;
  /** Type de camp (data/camps.ts). */
  kind: string;
  /** Centre du camp (monde). */
  x: number;
  z: number;
  detectRadius: number;
  leashRadius: number;
  /** Fraction des PV max rendue par seconde a un garde a son poste, au calme. */
  regenPerSecond: number;
  /** Or verse au nettoyage (lu par l'orchestration via l'evenement). */
  clearGold: number;
  guardIds: number[];
  state: 'active' | 'cleared';
  alerted: boolean;
}

/** Coffre (2026-11-02) : ouvert une fois par le Heros (ordre `openChest`),
 *  verrouille tant que le camp `campId` n'est pas nettoye. Son butin (table
 *  `lootTableId`, data/loot.ts) tombe au sol a cote de lui. */
export interface Chest {
  id: number;
  x: number;
  z: number;
  rotationY: number;
  campId: number | null;
  lootTableId: string;
  opened: boolean;
}

/** Camp a creer (World.addCamp), parametres resolus par l'orchestration
 *  (emplacement de la carte + type de camp). */
export interface CampSpec {
  kind: string;
  x: number;
  z: number;
  detectRadius: number;
  leashRadius: number;
  regenPerSecond: number;
  clearGold: number;
  /** Gardes, leurs postes (monde) et leur niveau d'unite deja resolu
   *  (data/unitLevels.ts). */
  guards: readonly { unitId: string; x: number; z: number; level: number }[];
  chest: { x: number; z: number; rotationY: number; lootTableId: string } | null;
}

/** Item tombe au sol (World.lootEvents) : coffre ou ennemi abattu. */
export interface LootDropEvent {
  /** `destructible` : ressource (itemId = bois / pierre / or, tas = dropId
   *  dans World.resourcePiles, `amount`). */
  source: 'chest' | 'enemy' | 'destructible';
  amount?: number;
  /** Coffre ou entite d'origine. */
  sourceId: number;
  itemId: string;
  dropId: number;
}

export type CampEvent =
  | { type: 'campAlert'; campId: number }
  | { type: 'campCleared'; campId: number; gold: number };

/** Marge (cases) au-dela de la laisse avant qu'un garde engage ne soit
 *  rappele (un archer tire de loin, un fantassin poursuit jusqu'au bord). */
const LEASH_SLACK = 3;
/** Distance a son poste en dessous de laquelle un garde y est « rentre ». */
const POST_REACHED = 0.6;

/** Avant targetingSystem : alerte, zones de chasse, retours au poste, regeneration. */
export function campSystem(camps: readonly CampState[], entities: readonly Entity[], byId: ReadonlyMap<number, Entity>, dt: number, events: CampEvent[]): void {
  if (camps.length === 0) return;
  const foes: Entity[] = [];
  for (const e of entities) if (e.alive && e.team === 'player') foes.push(e);
  for (const camp of camps) {
    if (camp.state === 'cleared') continue;
    const guards: Entity[] = [];
    for (const id of camp.guardIds) {
      const g = byId.get(id);
      if (g && g.alive && g.campGuard) guards.push(g);
    }
    const within = (e: Entity, r: number) => Math.hypot(e.x - camp.x, e.z - camp.z) <= r;
    const foeInLeash = foes.some((f) => within(f, camp.leashRadius));
    const intruder = foeInLeash && foes.some((f) => within(f, camp.detectRadius));
    const hurt = guards.some((g) => g.hp < g.campGuard!.lastHp);
    const engaged = guards.some((g) => g.targetId !== null && !g.campGuard!.returning);
    const alerted = foeInLeash && (intruder || hurt || (camp.alerted && engaged));
    if (alerted && !camp.alerted) events.push({ type: 'campAlert', campId: camp.id });
    camp.alerted = alerted;
    for (const g of guards) {
      const post = g.campGuard!;
      post.calm = !camp.alerted;
      if (post.returning) {
        // Arrive (ou chemin introuvable) : l'ordre de deplacement est fini.
        if (g.order.type !== 'move') post.returning = false;
        else {
          g.huntZone = null;
          post.lastHp = g.hp;
          continue;
        }
      }
      const fromPost = Math.hypot(g.x - post.postX, g.z - post.postZ);
      const tooFar = !within(g, camp.leashRadius + LEASH_SLACK);
      if (tooFar || (!camp.alerted && g.targetId === null && fromPost > POST_REACHED)) {
        post.returning = true;
        g.order = { type: 'move', x: post.postX, z: post.postZ, exact: true };
        g.targetId = null;
        g.pendingAttack = null;
        g.path = null;
        g.orderProgressTimer = 0;
        g.orderProgressRef = fromPost;
        g.huntZone = null;
        post.lastHp = g.hp;
        continue;
      }
      g.huntZone = { x: camp.x, z: camp.z, radius: camp.alerted ? camp.leashRadius : camp.detectRadius };
      // Jamais un garde a 0 PV (mort au pas en cours, avant deathSystem).
      if (!camp.alerted && g.targetId === null && g.hp > 0 && g.hp < g.stats.maxHp) {
        g.hp = Math.min(g.stats.maxHp, g.hp + g.stats.maxHp * camp.regenPerSecond * dt);
      }
      post.lastHp = g.hp;
    }
  }
}

/** Apres deathSystem : un camp dont tous les gardes sont morts est nettoye. */
export function campClearSystem(camps: readonly CampState[], byId: ReadonlyMap<number, Entity>, events: CampEvent[]): void {
  for (const camp of camps) {
    if (camp.state === 'cleared') continue;
    if (camp.guardIds.some((id) => byId.get(id)?.alive)) continue;
    camp.state = 'cleared';
    camp.alerted = false;
    for (const id of camp.guardIds) {
      const g = byId.get(id);
      if (g?.campGuard) g.campGuard.calm = false;
    }
    events.push({ type: 'campCleared', campId: camp.id, gold: camp.clearGold });
  }
}

/** Vrai si le coffre est encore verrouille (camp pas nettoye). */
export function isChestLocked(chest: Chest, camps: readonly CampState[]): boolean {
  if (chest.campId === null) return false;
  const camp = camps[chest.campId];
  return camp !== undefined && camp.state !== 'cleared';
}
