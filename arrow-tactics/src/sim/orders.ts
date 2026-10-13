import type { Entity } from './entity';

/**
 * Ordres manuels des unites (controle RTS pendant la bataille).
 *
 * Etape 0 : modele et file de commandes seulement. AUCUN systeme de
 * simulation ne lit encore `Entity.order` — une unite continue de se
 * comporter exactement comme avant, qu'elle ait recu un ordre ou non.
 * Le deplacement et le ciblage s'y brancheront dans les etapes suivantes.
 *
 * Priorite visee a terme : Provocation > ordre manuel > comportement
 * autonome. La Provocation agit uniquement sur `targetId` (voir
 * targetingSystem) et ne touche jamais `order` : elle SUSPEND donc un ordre
 * sans l'effacer, et l'ordre peut reprendre a la fin de la Provocation.
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

type EntityLookup = (id: number) => Entity | undefined;

/** Seules les unites vivantes du joueur sont commandables : jamais un
 *  ennemi, un batiment ou une entite morte. */
export function isCommandable(entity: Entity | undefined): entity is Entity {
  return entity !== undefined && entity.alive && !entity.isBuilding && entity.team === 'player';
}

/** Cible valide pour un ordre d'attaque : une entite vivante d'un autre camp
 *  que celui des unites commandees (les batiments sont acceptes). */
function isValidAttackTarget(target: Entity | undefined): target is Entity {
  return target !== undefined && target.alive && target.team !== 'player';
}

/**
 * Applique les commandes dans leur ordre d'emission. Deterministe : aucune
 * source de hasard, et une entite commandee plusieurs fois dans le meme pas
 * garde le dernier ordre recu.
 */
export function applyCommands(commands: readonly PlayerCommand[], lookup: EntityLookup): CommandResult[] {
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
        if (!Number.isFinite(command.x) || !Number.isFinite(command.z)) {
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
      result.acceptedEntityIds.push(entity.id);
    }
  }

  return results;
}

/**
 * Transitions automatiques des ordres, appelees a chaque pas apres
 * applyCommands. Etape 0 : seule la fin d'une attaque ciblee (cible morte ou
 * disparue) est geree, l'unite passe alors en Garde. L'arrivee d'un
 * deplacement sera geree avec le mouvement.
 */
export function resolveOrders(entities: readonly Entity[], lookup: EntityLookup): void {
  for (const entity of entities) {
    if (!entity.alive) continue;
    const order = entity.order;
    if (order.type === 'attack' && !isValidAttackTarget(lookup(order.targetEntityId))) {
      entity.order = { type: 'guard' };
    }
  }
}
