import { dist } from '../../core/math';
import type { Entity } from '../entity';
import { resetOrderProgress } from '../orders';
import { SpatialGrid } from '../spatialGrid';

/** Meme famille de probleme que la separation (movement.ts,
 *  SEPARATION_GRID_THRESHOLD) : ce systeme scannait tout le pool vivant DES
 *  DEUX camps pour chaque entite (O(n^2)), un risque deja identifie dans
 *  CLAUDE.md ("Problemes connus") mais jamais corrige jusqu'ici — vague 7 =
 *  112 ennemis a elle seule avec la courbe de difficulte actuelle. Meme
 *  valeur de seuil que la separation par defaut (mesure specifique a ce
 *  systeme non refaite : le profil d'appel differe legerement — un seul
 *  scan par tick ici, pas 5 sous-passes comme la separation — donc le vrai
 *  point de croisement grille/boucle directe pourrait differer un peu ;
 *  a ajuster si un jour mesure precisement). */
const TARGETING_GRID_THRESHOLD = 120;

/**
 * Assigne et rafraichit `targetId`. Une cible est gardee tant qu'elle est
 * vivante et dans l'aggro ; sinon on en cherche une nouvelle.
 *
 * C'est ce verrouillage qui rend un combat lisible : deux unites se fixent
 * jusqu'a la mort de l'une, au lieu de changer d'adversaire a chaque tick des
 * qu'un ennemi plus proche passe a portee.
 *
 * Exception prioritaire : si un ennemi (different de la cible actuelle) est
 * DEJA a portee d'attaque, on bascule dessus immediatement. Sans ca, une
 * unite peut continuer a pourchasser une cible plus loin ou bloquee par la
 * foule alors qu'un autre adversaire est juste devant elle, prete a etre
 * frappee — attaquer prime toujours sur se deplacer.
 *
 * Exception ENCORE PLUS prioritaire (2026-08-14, Provocation de la
 * Sentinelle — voir Entity.tauntTimer/tauntSourceId, data/abilities.ts
 * TauntAbility) : une unite provoquee force `targetId` sur la Sentinelle qui
 * l'a provoquee et SAUTE ENTIEREMENT le reste de la logique de ciblage
 * normale ce tick, tant que la source est vivante et le minuteur > 0 —
 * "pendant le Taunt, sa cible prioritaire devient la Sentinelle", sans
 * exception. Le minuteur est decompte ICI (pas dans movementSystem comme
 * rootTimer : c'est le ciblage, pas le mouvement, que la Provocation
 * affecte) ; a expiration ou si la source meurt, le Taunt est abandonne
 * IMMEDIATEMENT (meme tick) et le ciblage normal reprend la main sans
 * attendre un tick de plus — aucune unite ne reste jamais bloquee avec un
 * `targetId` invalide.
 *
 * Ordres manuels (sim/orders.ts) : priorite Provocation > ordre manuel >
 * comportement autonome. Une unite en deplacement manuel (`move`) n'a pas de
 * cible ; une attaque ciblee (`attack`) impose sa cible. Les ordres `assault`
 * et `guard` utilisent le ciblage normal.
 */
export function targetingSystem(entities: Entity[], dt: number): void {
  const alive = entities.filter((e) => e.alive);
  const byId = new Map(alive.map((e) => [e.id, e]));

  // Separer par camp une fois ici : chaque entite ne doit chercher que dans
  // le camp OPPOSE, jamais le sien — scanner `alive` en entier (comme avant)
  // gaspillait deja la moitie du travail sur des entites systematiquement
  // rejetees par le filtre d'equipe interne a findAttackableEnemy/findNearestEnemy.
  const playerAlive: Entity[] = [];
  const enemyAlive: Entity[] = [];
  for (const e of alive) (e.team === 'player' ? playerAlive : enemyAlive).push(e);

  // Grille spatiale seulement au-dela du seuil (voir SEPARATION_GRID_THRESHOLD
  // pour le raisonnement complet) : en dessous, la boucle directe sur le
  // camp oppose deja separe reste la plus rapide.
  const useGrid = alive.length >= TARGETING_GRID_THRESHOLD;
  let playerGrid: SpatialGrid<Entity> | null = null;
  let enemyGrid: SpatialGrid<Entity> | null = null;
  if (useGrid) {
    // Le rayon de recherche varie par UNITE (aggroRange), contrairement au
    // rayon quasi uniforme de la separation — la cellule doit couvrir la
    // plus grande porte possible sur TOUT le pool vivant pour ne jamais
    // manquer un voisin valide (voir SpatialGrid.queryNeighborhood : une
    // cellule trop petite ferait manquer des candidats reels, une cellule
    // trop grande renvoie juste des candidats en trop, refiltres ensuite
    // par distance exacte comme avant).
    let maxAggroRange = 0;
    for (const e of alive) if (e.stats.aggroRange > maxAggroRange) maxAggroRange = e.stats.aggroRange;
    const cellSize = Math.max(maxAggroRange, 0.01);

    playerGrid = new SpatialGrid<Entity>(cellSize);
    for (const e of playerAlive) playerGrid.insert(e);
    enemyGrid = new SpatialGrid<Entity>(cellSize);
    for (const e of enemyAlive) enemyGrid.insert(e);
  }

  for (const e of alive) {
    // Provocation (2026-08-14) : decompte du minuteur, PUIS forcage de cible
    // si toujours actif et la source vivante — voir le commentaire de
    // fonction pour le detail. Ecrit AVANT tout le reste du ciblage normal,
    // qu'il court-circuite entierement via `continue`.
    if (e.tauntTimer > 0) {
      e.tauntTimer = Math.max(0, e.tauntTimer - dt);
    }
    if (e.tauntSourceId !== null) {
      const source = e.tauntTimer > 0 ? byId.get(e.tauntSourceId) : undefined;
      if (source && source.alive) {
        e.targetId = source.id;
        continue;
      }
      // Timer expire OU source introuvable/morte : abandon IMMEDIAT du
      // Taunt, retour au ciblage normal ce MEME tick (pas de tick de
      // latence, pas de targetId perime).
      e.tauntSourceId = null;
      e.tauntTimer = 0;
      // Un ordre manuel suspendu par la Provocation reprend : sa mesure de
      // progression (sim/orders.ts) repart de zero, la distance mesuree
      // pendant la Provocation n'a plus de sens.
      if (e.order.type === 'move' || e.order.type === 'attack') resetOrderProgress(e);
    }

    // Ordres manuels (sim/orders.ts), APRES la Provocation, qui reste
    // prioritaire et suspend l'ordre sans l'effacer.
    // Deplacement : aucune cible, donc ni combat ni capacite en chemin.
    if (e.order.type === 'move') {
      e.targetId = null;
      continue;
    }
    // Attaque ciblee : la cible designee est imposee, quels que soient l'aggro
    // et les autres ennemis (meme plus proches ou deja a portee). Si elle a
    // disparu ce pas-ci, resolveOrders terminera l'ordre au pas suivant ; en
    // attendant, ciblage normal.
    if (e.order.type === 'attack') {
      const ordered = byId.get(e.order.targetEntityId);
      if (ordered) {
        e.targetId = ordered.id;
        continue;
      }
    }

    const isPlayer = e.team === 'player';
    const opposingGrid = isPlayer ? enemyGrid : playerGrid;
    const candidates = opposingGrid ? opposingGrid.queryNeighborhood(e.x, e.z) : isPlayer ? enemyAlive : playerAlive;

    const attackable = findAttackableEnemy(e, candidates);
    if (attackable && attackable.id !== e.targetId) {
      e.targetId = attackable.id;
      continue;
    }

    const current = e.targetId !== null ? byId.get(e.targetId) : undefined;

    if (current && isInAggro(e, current)) continue;

    e.targetId = findNearestEnemy(e, candidates)?.id ?? null;
  }
}

function isInAggro(self: Entity, target: Entity): boolean {
  return dist(self.x, self.z, target.x, target.z) <= self.stats.aggroRange;
}

/** Ennemi le plus proche deja a portee d'attaque (pas seulement d'aggro). */
function findAttackableEnemy(self: Entity, pool: Entity[]): Entity | null {
  let best: Entity | null = null;
  let bestDist = Infinity;

  for (const other of pool) {
    if (other.team === self.team || !other.alive) continue;
    const d = dist(self.x, self.z, other.x, other.z);
    if (d <= self.stats.attackRange + other.stats.radius && d < bestDist) {
      bestDist = d;
      best = other;
    }
  }
  return best;
}

export function findNearestEnemy(self: Entity, pool: Entity[]): Entity | null {
  let best: Entity | null = null;
  let bestDist = self.stats.aggroRange;

  for (const other of pool) {
    if (other.team === self.team || !other.alive) continue;
    const d = dist(self.x, self.z, other.x, other.z);
    if (d < bestDist) {
      bestDist = d;
      best = other;
    }
  }
  return best;
}
