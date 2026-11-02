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
  | { type: 'guard' }
  /** Heros : recolter la source `nodeId` (World.resourceNodes), au contact,
   *  jusqu'a un autre ordre. */
  | { type: 'harvest'; nodeId: number }
  /** Heros : construire le chantier `targetEntityId`, au contact. */
  | { type: 'build'; targetEntityId: number }
  /** Heros : ramasser le petit tas au sol `pileId` (World.resourcePiles). */
  | { type: 'pickup'; pileId: number }
  /** Heros : deposer ce qu'il porte au depot `targetEntityId` (Baliste). */
  | { type: 'deposit'; targetEntityId: number }
  /** Heros : lancer le sort `spellId` (Entity.hero.spells) sur
   *  `targetEntityId` (lui-meme ou un allie) ; il s'approche a portee, puis
   *  incante sur place (sim/systems/hero.ts). */
  | { type: 'cast'; spellId: string; targetEntityId: number };

/** Commande envoyee par l'orchestration (voir World.issueCommand), appliquee
 *  au debut du prochain pas fixe. `stop` place les unites en Garde. */
export type PlayerCommand =
  /** `exact` : voir UnitOrder (pas d'ouverture de la bataille, main.ts). */
  | { kind: 'move'; entityIds: readonly number[]; x: number; z: number; exact?: boolean }
  | { kind: 'attack'; entityIds: readonly number[]; targetEntityId: number }
  | { kind: 'stop'; entityIds: readonly number[] }
  /** Heros seulement (les autres entites sont refusees). */
  | { kind: 'harvest'; entityIds: readonly number[]; nodeId: number }
  | { kind: 'build'; entityIds: readonly number[]; targetEntityId: number }
  | { kind: 'pickup'; entityIds: readonly number[]; pileId: number }
  | { kind: 'deposit'; entityIds: readonly number[]; targetEntityId: number }
  | { kind: 'cast'; entityIds: readonly number[]; spellId: string; targetEntityId: number };

/** `locked` : source (arbre, gros gisement) que le joueur n'a pas encore le
 *  droit d'exploiter (World.harvestPermissions). */
/** `no-mana` : sort connu, mana insuffisant. */
export type CommandRejectionReason = 'no-commandable-entity' | 'invalid-destination' | 'invalid-target' | 'locked' | 'no-mana';

/** Ordres de TRAVAIL du Heros (recolte, construction, ramassage, depot,
 *  sort) : comme un deplacement, ils suspendent le ciblage et l'attaque de
 *  base. */
export type WorkOrder = Extract<UnitOrder, { type: 'harvest' | 'build' | 'pickup' | 'deposit' | 'cast' }>;
export function isWorkOrder(order: UnitOrder): order is WorkOrder {
  return order.type === 'harvest' || order.type === 'build' || order.type === 'pickup' || order.type === 'deposit' || order.type === 'cast';
}

/** Ce que la validation des ordres de travail lit du monde (World). */
export interface WorkLookups {
  /** Source d'un arbre ou d'un rocher : exploitable, verrouillee (permission
   *  absente) ou inexistante. */
  node(id: number): 'ok' | 'locked' | 'missing';
  /** Petit tas au sol encore present. */
  hasPile(id: number): boolean;
  /** Depot de ressources (BuildingDef.resourceDepot) vivant. */
  isDepot(entity: Entity): boolean;
}

const NO_WORK: WorkLookups = { node: () => 'missing', hasPile: () => false, isDepot: () => false };

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

/** Vrai si le point (x, z) est sur une case d'eau (World.isWaterAt). */
export type WaterLookup = (x: number, z: number) => boolean;

/** Rayon de recherche (cases) d'un point sec pour une destination de groupe
 *  tombee dans l'eau. */
const DRY_POINT_SEARCH_RINGS = 6;

/**
 * Point SEC le plus proche de (x, z), pour une unite de rayon `radius` :
 * point le plus proche dans une case voisine hors de l'eau, en retrait du
 * bord de la case (rayon, au plus 0,45). Anneaux de cases croissants autour
 * de la case de (x, z), depart a egalite par z puis x : deterministe. Null
 * si aucune case seche dans DRY_POINT_SEARCH_RINGS anneaux ou sur le
 * plateau.
 */
function nearestDryPoint(x: number, z: number, radius: number, board: BoardHalfExtents, isWater: WaterLookup): { x: number; z: number } | null {
  const cellX = Math.floor(x);
  const cellZ = Math.floor(z);
  const inset = Math.min(radius, 0.45);
  let best: { x: number; z: number; d: number } | null = null;
  for (let ring = 1; ring <= DRY_POINT_SEARCH_RINGS; ring++) {
    // Un point d'un anneau plus eloigne ne peut plus battre le meilleur.
    if (best && best.d <= (ring - 1) ** 2) break;
    for (let dz = -ring; dz <= ring; dz++) {
      for (let dx = -ring; dx <= ring; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== ring) continue;
        const cx = cellX + dx;
        const cz = cellZ + dz;
        const px = Math.min(cx + 1 - inset, Math.max(cx + inset, x));
        const pz = Math.min(cz + 1 - inset, Math.max(cz + inset, z));
        if (Math.abs(px) > board.halfW - radius || Math.abs(pz) > board.halfH - radius) continue;
        if (isWater(px, pz)) continue;
        const d = (px - x) ** 2 + (pz - z) ** 2;
        if (!best || d < best.d || (d === best.d && (pz < best.z || (pz === best.z && px < best.x)))) best = { x: px, z: pz, d };
      }
    }
  }
  return best ? { x: best.x, z: best.z } : null;
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
 *
 * Eau (2026-11-01, `isWater`) : un point vise sur l'eau est refuse a chaque
 * unite sans `canTraverseWater` (rejectedEntityIds ; `invalid-destination`
 * si aucune ne reste). Une destination de groupe tombee dans l'eau, le
 * point vise etant sec, est ramenee au point sec le plus proche
 * (nearestDryPoint), a defaut au point vise.
 */
export function applyCommands(commands: readonly PlayerCommand[], lookup: EntityLookup, board: BoardHalfExtents, isWater: WaterLookup = () => false, work: WorkLookups = NO_WORK): CommandResult[] {
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
      case 'harvest':
      case 'build':
      case 'pickup':
      case 'deposit': {
        // Travail : Heros seulement ; source exploitable, chantier allie
        // vivant, tas encore present ou depot allie vivant.
        for (const e of accepted) if (e.hero === null) result.rejectedEntityIds.push(e.id);
        accepted.splice(0, accepted.length, ...accepted.filter((e) => e.hero !== null));
        if (accepted.length === 0) {
          result.rejection = 'no-commandable-entity';
          continue;
        }
        const target = command.kind === 'build' || command.kind === 'deposit' ? lookup(command.targetEntityId) : undefined;
        const allied = target !== undefined && target.alive && accepted.every((e) => e.team === target.team);
        const nodeState = command.kind === 'harvest' ? work.node(command.nodeId) : 'ok';
        const valid =
          command.kind === 'harvest' ? nodeState === 'ok'
          : command.kind === 'build' ? allied && target!.construction !== null
          : command.kind === 'pickup' ? work.hasPile(command.pileId)
          : allied && work.isDepot(target!);
        if (!valid) {
          result.rejection = nodeState === 'locked' ? 'locked' : 'invalid-target';
          continue;
        }
        order =
          command.kind === 'harvest' ? { type: 'harvest', nodeId: command.nodeId }
          : command.kind === 'build' ? { type: 'build', targetEntityId: command.targetEntityId }
          : command.kind === 'pickup' ? { type: 'pickup', pileId: command.pileId }
          : { type: 'deposit', targetEntityId: command.targetEntityId };
        break;
      }
      case 'cast': {
        // Sort : Heros connaissant le sort, mana suffisant ; cible : lui-meme
        // ou une unite alliee vivante (jamais un batiment).
        const target = lookup(command.targetEntityId);
        const knows = (e: Entity): boolean => e.hero !== null && e.hero.spells.some((s) => s.id === command.spellId);
        // Mana disponible : celui du Heros, plus celui d'une incantation en
        // cours, rendu quand ce nouvel ordre l'annulera (sim/systems/hero.ts).
        const affords = (e: Entity): boolean => e.hero!.mana + (e.hero!.spellCast?.manaSpent ?? 0) >= e.hero!.spells.find((s) => s.id === command.spellId)!.manaCost;
        const casters = accepted.filter((e) => knows(e) && affords(e) && target !== undefined && target.alive && !target.isBuilding && target.team === e.team);
        for (const e of accepted) if (!casters.includes(e)) result.rejectedEntityIds.push(e.id);
        const lacksMana = accepted.some((e) => knows(e) && !affords(e));
        accepted.splice(0, accepted.length, ...casters);
        if (accepted.length === 0) {
          result.rejection = lacksMana ? 'no-mana' : 'invalid-target';
          continue;
        }
        order = { type: 'cast', spellId: command.spellId, targetEntityId: command.targetEntityId };
        break;
      }
    }

    const crossesWater = (e: Entity): boolean => e.stats.canTraverseWater === true;
    if (command.kind === 'move' && isWater(command.x, command.z)) {
      for (const e of accepted) if (!crossesWater(e)) result.rejectedEntityIds.push(e.id);
      accepted.splice(0, accepted.length, ...accepted.filter(crossesWater));
      if (accepted.length === 0) {
        result.rejection = 'invalid-destination';
        continue;
      }
    }

    const groupDestinations = command.kind === 'move' && accepted.length > 1 ? assignGroupDestinations(accepted, command.x, command.z, board) : null;
    const moveDestinations: MoveDestination[] | null = command.kind === 'move' ? [] : null;

    for (const entity of accepted) {
      // Objet neuf par entite : aucun ordre n'est partage entre deux unites.
      let destination = groupDestinations?.get(entity.id);
      if (destination && command.kind === 'move' && !crossesWater(entity) && isWater(destination.x, destination.z)) {
        destination = nearestDryPoint(destination.x, destination.z, entity.stats.radius, board, isWater) ?? { x: command.x, z: command.z };
      }
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
