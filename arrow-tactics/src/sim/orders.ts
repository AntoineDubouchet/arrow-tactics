import type { Entity } from './entity';

/**
 * Ordres manuels des unites (controle RTS pendant la bataille).
 *
 * Lu par targetingSystem et movementSystem :
 *  - `assault` : comportement autonome historique, inchange ;
 *  - `move` : pas de cible, deplacement vers le point, puis Garde a
 *    l'arrivee (voir movementSystem) ;
 *  - `attack` : la cible designee est imposee, quels que soient l'aggro et
 *    les autres ennemis ; Garde quand elle meurt ou devient inaccessible ;
 *  - `guard` : ciblage automatique normal, mais plus de marche neutre vers
 *    l'avant quand l'unite n'a pas de cible.
 *
 * Priorite : Provocation > ordre manuel > comportement autonome. La
 * Provocation agit uniquement sur `targetId` (voir targetingSystem) et ne
 * touche jamais `order` : elle SUSPEND un ordre sans l'effacer, et l'ordre
 * reprend a la fin de la Provocation s'il est encore valide.
 */

/** Ordre courant d'une entite. `assault` = comportement autonome actuel
 *  (valeur par defaut a la creation). `attackMove` et `hold` viendront plus
 *  tard. */
export type UnitOrder =
  | { type: 'assault' }
  | { type: 'move'; x: number; z: number }
  /** `targetEntityId` designe n'importe quelle entite hostile : une unite
   *  aujourd'hui, un batiment ennemi plus tard, sans changer le modele. */
  | { type: 'attack'; targetEntityId: number }
  | { type: 'guard' };

/** Commande envoyee par l'orchestration (voir World.issueCommand), appliquee
 *  au debut du prochain pas fixe. `stop` place les unites en Garde. */
export type PlayerCommand =
  | { kind: 'move'; entityIds: readonly number[]; x: number; z: number }
  | { kind: 'attack'; entityIds: readonly number[]; targetEntityId: number }
  | { kind: 'stop'; entityIds: readonly number[] };

export type CommandRejectionReason = 'no-commandable-entity' | 'invalid-destination' | 'invalid-target';

/** Resultat de l'application d'une commande — sert au retour visuel et a la
 *  verification. Une commande peut etre acceptee pour une partie seulement
 *  des entites designees (les autres sont listees dans rejectedEntityIds). */
export interface CommandResult {
  command: PlayerCommand;
  acceptedEntityIds: number[];
  rejectedEntityIds: number[];
  /** Raison du refus de la commande entiere, null si au moins une entite
   *  l'a recue. */
  rejection: CommandRejectionReason | null;
}

/** Raison de la fin d'un ordre manuel. `completed` : arrivee, cible tuee ou
 *  disparue. `failed` : destination ou cible inaccessible (aucune route), ou
 *  aucun progres pendant la fenetre de mesure. */
export type OrderEndReason = 'arrived' | 'target-lost' | 'unreachable' | 'no-progress';

/** Fin d'un ordre manuel pendant le dernier pas (voir World.orderEvents) —
 *  l'unite est passee en Garde. Distinct de CommandResult, qui ne concerne
 *  que l'acceptation ou le refus d'une commande au moment de l'appliquer. */
export interface OrderEndEvent {
  entityId: number;
  order: 'move' | 'attack';
  outcome: 'completed' | 'failed';
  reason: OrderEndReason;
}

type EntityLookup = (id: number) => Entity | undefined;

/** Seules les unites vivantes du joueur sont commandables : jamais un
 *  ennemi, un batiment ou une entite morte. */
export function isCommandable(entity: Entity | undefined): entity is Entity {
  return entity !== undefined && entity.alive && !entity.isBuilding && entity.team === 'player';
}

/** Cible valide pour un ordre d'attaque : une entite vivante d'un autre camp
 *  que celui des unites commandees (les batiments sont acceptes). */
export function isValidAttackTarget(target: Entity | undefined): target is Entity {
  return target !== undefined && target.alive && target.team !== 'player';
}

/** Demi-dimensions du plateau jouable (en cases), centre en (0, 0) — meme
 *  convention que le confinement de movementSystem. */
export interface BoardHalfExtents {
  halfW: number;
  halfH: number;
}

/** Remet a zero la mesure de progression d'un ordre (voir
 *  orderMadeNoProgress). La premiere fenetre ne peut pas echouer. */
export function resetOrderProgress(entity: Entity): void {
  entity.orderProgressTimer = 0;
  entity.orderProgressRef = Number.POSITIVE_INFINITY;
}

/**
 * Mesure de progression partagee par les ordres `move` et `attack` : vrai si
 * la distance restante (`remaining`) n'a pas diminue d'au moins
 * `minProgress` sur une fenetre de `windowSeconds`. Pendant le suivi d'un
 * chemin A*, la mesure est suspendue : un detour peut legitimement eloigner
 * l'unite de son but pendant un moment.
 */
export function orderMadeNoProgress(entity: Entity, remaining: number, dt: number, windowSeconds: number, minProgress: number): boolean {
  if (entity.path !== null && entity.path.length > 0) {
    entity.orderProgressTimer = 0;
    entity.orderProgressRef = remaining;
    return false;
  }
  entity.orderProgressTimer += dt;
  if (entity.orderProgressTimer < windowSeconds) return false;
  const failed = entity.orderProgressRef - remaining < minProgress;
  entity.orderProgressTimer = 0;
  entity.orderProgressRef = remaining;
  return failed;
}

/** Termine l'ordre manuel courant (`move` ou `attack`) : l'unite passe en
 *  Garde sur place et un evenement est ajoute pour l'interface. */
export function finishOrder(entity: Entity, events: OrderEndEvent[], outcome: OrderEndEvent['outcome'], reason: OrderEndReason): void {
  const type = entity.order.type;
  if (type === 'move' || type === 'attack') {
    events.push({ entityId: entity.id, order: type, outcome, reason });
  }
  entity.order = { type: 'guard' };
  entity.path = null;
  entity.steerX = null;
  entity.steerZ = null;
  resetOrderProgress(entity);
}

/**
 * Remet a zero la memoire de navigation d'une unite qui recoit un nouvel
 * ordre : chemin, point de contournement, manoeuvres de degagement et fenetre
 * de mesure de progres. Sans ca, un chemin calcule pour l'ancien
 * comportement serait suivi vers la mauvaise destination, et la premiere
 * mesure de progres comparerait une distance perimee.
 */
function resetNavigation(entity: Entity): void {
  entity.targetId = null;
  entity.path = null;
  entity.pathGoalTileX = null;
  entity.pathGoalTileZ = null;
  entity.steerX = null;
  entity.steerZ = null;
  entity.sidestepTimer = 0;
  entity.unstickTimer = 0;
  entity.stuckTimer = 0;
  entity.stuckCheckX = entity.x;
  entity.stuckCheckZ = entity.z;
  entity.orbitTimer = 0;
  entity.orbitCheckDist = Number.POSITIVE_INFINITY;
  entity.orbitCheckTargetId = null;
  resetOrderProgress(entity);
}

/**
 * Applique les commandes dans leur ordre d'emission. Deterministe : aucune
 * source de hasard, et une entite commandee plusieurs fois dans le meme pas
 * garde le dernier ordre recu. Une destination hors du plateau est refusee ;
 * une destination sur un obstacle est acceptee (l'unite s'en approche puis
 * passe en Garde, voir movementSystem).
 */
export function applyCommands(commands: readonly PlayerCommand[], lookup: EntityLookup, board: BoardHalfExtents): CommandResult[] {
  const results: CommandResult[] = [];

  for (const command of commands) {
    const accepted: Entity[] = [];
    const rejectedEntityIds: number[] = [];
    for (const id of new Set(command.entityIds)) {
      const entity = lookup(id);
      if (isCommandable(entity)) accepted.push(entity);
      else rejectedEntityIds.push(id);
    }

    const result: CommandResult = { command, acceptedEntityIds: [], rejectedEntityIds, rejection: null };
    results.push(result);

    if (accepted.length === 0) {
      result.rejection = 'no-commandable-entity';
      continue;
    }

    let order: UnitOrder;
    switch (command.kind) {
      case 'move':
        if (
          !Number.isFinite(command.x) ||
          !Number.isFinite(command.z) ||
          Math.abs(command.x) > board.halfW ||
          Math.abs(command.z) > board.halfH
        ) {
          result.rejection = 'invalid-destination';
          continue;
        }
        order = { type: 'move', x: command.x, z: command.z };
        break;
      case 'attack':
        if (!isValidAttackTarget(lookup(command.targetEntityId))) {
          result.rejection = 'invalid-target';
          continue;
        }
        order = { type: 'attack', targetEntityId: command.targetEntityId };
        break;
      case 'stop':
        order = { type: 'guard' };
        break;
    }

    for (const entity of accepted) {
      // Objet neuf par entite : aucun ordre n'est partage entre deux unites.
      entity.order = { ...order };
      resetNavigation(entity);
      result.acceptedEntityIds.push(entity.id);
    }
  }

  return results;
}

/**
 * Transitions automatiques des ordres, appelees a chaque pas apres
 * applyCommands : une attaque dont la cible est morte ou a disparu se termine
 * (Garde), y compris si la cible est morte pendant une Provocation.
 * L'arrivee d'un deplacement et les echecs (inaccessible, aucun progres) sont
 * detectes par movementSystem, qui connait la position atteinte.
 */
export function resolveOrders(entities: readonly Entity[], lookup: EntityLookup, events: OrderEndEvent[]): void {
  for (const entity of entities) {
    if (!entity.alive) continue;
    const order = entity.order;
    if (order.type === 'attack' && !isValidAttackTarget(lookup(order.targetEntityId))) {
      finishOrder(entity, events, 'completed', 'target-lost');
    }
  }
}
