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
  /** `exact` : arrivee au point pres (voir followMoveOrder), sans la
   *  tolerance du rayon de l'unite d'un ordre de deplacement ordinaire. */
  | { type: 'move'; x: number; z: number; exact?: boolean }
  /** `targetEntityId` designe n'importe quelle entite hostile : une unite
   *  aujourd'hui, un batiment ennemi plus tard, sans changer le modele. */
  | { type: 'attack'; targetEntityId: number }
  | { type: 'guard' };

/** Commande envoyee par l'orchestration (voir World.issueCommand), appliquee
 *  au debut du prochain pas fixe. `stop` place les unites en Garde. */
export type PlayerCommand =
  /** `exact` : voir UnitOrder (pas d'ouverture de la bataille, main.ts). */
  | { kind: 'move'; entityIds: readonly number[]; x: number; z: number; exact?: boolean }
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
  /** Commande `move` acceptee : destination reellement attribuee a chaque
   *  entite acceptee (point du groupe, voir assignGroupDestinations, ou point
   *  vise pour une unite seule), dans l'ordre de `acceptedEntityIds`. Simple
   *  copie du resultat deja calcule, pour le retour visuel : l'ordre lui-meme
   *  peut deja etre termine a la fin du meme pas. Absent sinon. */
  destinations?: MoveDestination[];
}

/** Destination d'une entite pour un ordre `move`. */
export interface MoveDestination {
  entityId: number;
  x: number;
  z: number;
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

/** Ecart libre entre deux destinations voisines d'un groupe, en plus du
 *  diametre de la plus grosse unite : sans lui, la separation entre corps
 *  repousserait une unite deja arrivee hors de son point. */
const GROUP_MOVE_GAP = 0.3;

/**
 * Repartit un deplacement de groupe autour du point vise (`x`, `z`) : une
 * destination distincte par unite, sur une grille compacte centree sur le
 * point. Deterministe et sans hasard — le resultat ne depend que des
 * positions et des ids des unites.
 *
 *  - Grille : ceil(sqrt(n)) colonnes, autant de rangees que necessaire, la
 *    derniere rangee incomplete centree. Pas = diametre de la plus grosse
 *    unite + GROUP_MOVE_GAP. Pas de rotation : rangees alignees sur X.
 *  - Attribution : unites triees par Z (puis X, puis id) et reparties par
 *    rangees, chaque rangee triee par X (puis id). Chaque unite garde a peu
 *    pres sa place relative dans le groupe, ce qui evite que les trajets se
 *    croisent.
 *  - Bords : la grille entiere est decalee vers l'interieur si elle deborde
 *    du plateau, puis chaque point est borne au plateau (rayon compris).
 *    Une destination secondaire peut tomber sur un obstacle : meme regle
 *    qu'un deplacement simple (l'unite s'en approche puis passe en Garde).
 */
export function assignGroupDestinations(
  entities: readonly Entity[],
  x: number,
  z: number,
  board: BoardHalfExtents,
): Map<number, { x: number; z: number }> {
  const n = entities.length;
  const destinations = new Map<number, { x: number; z: number }>();
  if (n === 0) return destinations;

  let maxRadius = 0;
  for (const e of entities) maxRadius = Math.max(maxRadius, e.stats.radius);
  const spacing = 2 * maxRadius + GROUP_MOVE_GAP;
  const cols = Math.ceil(Math.sqrt(n));
  const rows = Math.ceil(n / cols);

  // Decalage du centre pour que la grille tienne dans le plateau (si elle
  // est plus large que le plateau lui-meme, centre du plateau).
  const fitCentre = (c: number, halfSpan: number, halfBoard: number): number =>
    halfSpan >= halfBoard ? 0 : Math.min(halfBoard - halfSpan, Math.max(-halfBoard + halfSpan, c));
  const cx = fitCentre(x, ((cols - 1) / 2) * spacing + maxRadius, board.halfW);
  const cz = fitCentre(z, ((rows - 1) / 2) * spacing + maxRadius, board.halfH);

  const byId = (a: Entity, b: Entity): number => a.id - b.id;
  const ranked = [...entities].sort((a, b) => a.z - b.z || a.x - b.x || byId(a, b));

  for (let r = 0; r < rows; r++) {
    const row = ranked.slice(r * cols, (r + 1) * cols).sort((a, b) => a.x - b.x || byId(a, b));
    for (let c = 0; c < row.length; c++) {
      const e = row[c]!;
      const px = cx + (c - (row.length - 1) / 2) * spacing;
      const pz = cz + (r - (rows - 1) / 2) * spacing;
      const rad = e.stats.radius;
      destinations.set(e.id, {
        x: Math.min(board.halfW - rad, Math.max(-board.halfW + rad, px)),
        z: Math.min(board.halfH - rad, Math.max(-board.halfH + rad, pz)),
      });
    }
  }
  return destinations;
}

/**
 * Applique les commandes dans leur ordre d'emission. Deterministe : aucune
 * source de hasard, et une entite commandee plusieurs fois dans le meme pas
 * garde le dernier ordre recu. Une destination hors du plateau est refusee ;
 * une destination sur un obstacle est acceptee (l'unite s'en approche puis
 * passe en Garde, voir movementSystem). Un deplacement de plusieurs unites
 * exprime une intention ("aller autour de ce point") : chaque unite recoit sa
 * propre destination (voir assignGroupDestinations).
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
        order = command.exact ? { type: 'move', x: command.x, z: command.z, exact: true } : { type: 'move', x: command.x, z: command.z };
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

    const groupDestinations = command.kind === 'move' && accepted.length > 1 ? assignGroupDestinations(accepted, command.x, command.z, board) : null;
    const moveDestinations: MoveDestination[] | null = command.kind === 'move' ? [] : null;

    for (const entity of accepted) {
      // Objet neuf par entite : aucun ordre n'est partage entre deux unites.
      const destination = groupDestinations?.get(entity.id);
      entity.order = destination ? { type: 'move', x: destination.x, z: destination.z } : { ...order };
      resetNavigation(entity);
      result.acceptedEntityIds.push(entity.id);
      if (moveDestinations && entity.order.type === 'move') moveDestinations.push({ entityId: entity.id, x: entity.order.x, z: entity.order.z });
    }
    if (moveDestinations) result.destinations = moveDestinations;
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
