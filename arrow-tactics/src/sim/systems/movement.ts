import {
  COLLISION_ITERATIONS,
  NEUTRAL_STUCK_CHECK_DURATION,
  NEUTRAL_STUCK_PROGRESS_THRESHOLD,
  OBSTACLE_AVOIDANCE_MARGIN,
  OBSTACLE_LOOKAHEAD,
  ORBIT_CHECK_DURATION,
  ORBIT_PROGRESS_THRESHOLD,
  SEPARATION_STRENGTH,
  STUCK_DISTANCE_THRESHOLD,
  STUCK_DURATION,
  TILE,
  UNSTICK_DURATION,
  type ObstacleDef,
} from '../../config/constants';
import { clamp } from '../../core/math';
import {
  findBlockingObstacle,
  getObstacleBoundsList,
  getShrunkObstacleBoundsList,
  obstacleBounds,
  segmentIntersectsBox,
} from '../geometry';
import { forwardDir, type Entity } from '../entity';
import { finishOrder, orderMadeNoProgress, type OrderEndEvent, type UnitOrder } from '../orders';
import { buildPathGrid, findPath, type PathGrid } from '../pathfinding';
import { SpatialGrid } from '../spatialGrid';

/** Distance (cases) sous laquelle un point de cheminement est considere
 *  "atteint" — passe au suivant. Assez petit pour ne jamais laisser l'unite
 *  tourner autour du centre de case, assez grand pour ne pas exiger une
 *  precision irrealiste (separation/collision bougent l'unite un peu a
 *  chaque sous-passe). */
const PATH_WAYPOINT_REACHED_DIST = 0.2;

/** En dessous de ce nombre d'unites vivantes, la boucle O(n^2) directe reste
 *  plus rapide en pratique que la grille (cout d'allocation de la Map/des
 *  buckets par sous-passe superieur au gain) — mesure en headless (script
 *  temporaire, supprime apres usage) : le point de croisement reel se situe
 *  entre 120 et 150 entites, la grille perd nettement en dessous (ex. n=50,
 *  ~3.5x plus lente que la boucle directe). Cette valeur reste
 *  DELIBEREMENT superieure a la plupart des vagues actuelles (1-6) — elles
 *  continuent d'utiliser la boucle directe, inchangee. Au-dela, la grille
 *  elimine les paires trop eloignees pour interagir sans les tester une a
 *  une (voir CLAUDE.md, "Problemes connus" — vague 7 = 112 ennemis a elle
 *  seule avec la courbe de difficulte actuelle). */
const SEPARATION_GRID_THRESHOLD = 120;

/**
 * Comportement valide en pre-production :
 *   les deux camps avancent vers le centre jusqu'a ce qu'un ennemi entre dans
 *   l'aggro. Une fois une cible verrouillee (targetingSystem), l'unite devient
 *   prioritairement agressive envers elle : elle s'oriente et marche droit
 *   dessus (x et z), pas seulement vers l'avant, et s'immobilise a portee
 *   d'attaque sans jamais frapper en marchant.
 *
 * La marche neutre vers l'avant n'est que le comportement par defaut, avant
 * tout contact : c'est ce qui fait qu'une ligne de front se forme toute seule
 * a l'endroit ou les deux armees se rencontrent, sans avoir a coder de
 * formation. Des qu'une cible existe, elle prend le pas sur cette marche
 * neutre — sinon une unite qui vient d'abattre son adversaire continuerait
 * tout droit au lieu de poursuivre la suivante.
 *
 * Le CHOIX de la cible appartient a targetingSystem ; ce systeme se contente
 * de lire `targetId` pour decider ou aller et quand s'arreter.
 *
 * Si la ligne droite vers la cible traverse un obstacle, l'unite vise plutot
 * le coin de l'obstacle qui minimise le detour (elle -> coin -> cible) au
 * lieu de foncer tout droit et de rester plantee contre le mur : c'est ce qui
 * la fait vraiment contourner un rocher plutot que de s'arreter dessus.
 *
 * Poursuite, separation et collision sont resolues ensemble, en plusieurs
 * petits pas (voir COLLISION_ITERATIONS), plutot que poursuite d'abord puis
 * separation apres coup. Sans ca, une foule compacte tremble sur place : la
 * poursuite avance a pleine vitesse sans se soucier de la place disponible,
 * la separation la repousse tout aussi fort au tick suivant, et les deux
 * s'annulent en oscillant au lieu de se stabiliser. Avec des petits pas
 * entrelaces, une unite qui n'a physiquement pas la place d'avancer se fait
 * rattraper par la separation avant d'avoir pu accumuler un grand elan, et la
 * foule converge vers une position stable au lieu de vibrer indefiniment.
 *
 * Filet de secours : si malgre tout ca une unite ne progresse pas depuis
 * STUCK_DURATION (plusieurs allies qui se genent en visant des cibles
 * differentes, typiquement), elle declenche une manoeuvre de degagement en
 * deux temps — grand pas en arriere, puis pas de cote vers la zone la moins
 * encombree — plutot que de rester plantee indefiniment.
 *
 * Exception : une unite dont le dernier tir a ete bloque par un obstacle
 * (sidestepTimer > 0, pose par combatSystem) ignore la poursuite pendant
 * quelques instants pour se decaler lateralement, meme si sa cible est a
 * portee — sinon elle resterait plantee a tirer indefiniment dans le rocher.
 */
export function movementSystem(
  entities: Entity[],
  dt: number,
  obstacles: ObstacleDef[],
  boardWidth: number,
  boardHeight: number,
  /** Recoit les fins d'ordres manuels du pas (voir sim/orders.ts). */
  orderEvents: OrderEndEvent[] = [],
): void {
  const alive = entities.filter((e) => e.alive);
  const byId = new Map(alive.map((e) => [e.id, e]));
  // Batiments gameplay (Mine, Baliste — 2026-08-16, voir Entity.isBuilding) :
  // IMMOBILES par construction, exclus de TOUTES les etapes ci-dessous
  // (marche neutre, poursuite, separation, collision avec les obstacles,
  // confinement au plateau) — un seul filtre ici plutot que des
  // verifications "if isBuilding" eparpillees dans chaque etape. Restent en
  // revanche dans `alive`/`byId` : une unite doit toujours pouvoir VISER/
  // POURSUIVRE un batiment (target.x/target.z lus normalement via byId),
  // seul le mouvement du batiment LUI-MEME est court-circuite.
  const movable = alive.filter((e) => !e.isBuilding);
  const subDt = dt / COLLISION_ITERATIONS;

  // Root/movement lock (Nova de glace, 2026-08-14 — voir Entity.rootTimer) :
  // decompte UNE FOIS par tick (pas par sous-passe, comme les autres
  // minuteurs de ce module qui pilotent directement un deplacement). Expire
  // proprement via Math.max(0, ...) — jamais de blocage definitif possible.
  for (const e of movable) {
    if (e.rootTimer > 0) e.rootTimer = Math.max(0, e.rootTimer - dt);
  }

  // Grille de pathfinding (voir sim/pathfinding.ts) : reconstruite une fois
  // par appel, jamais par sous-passe/par unite — O(obstacles), negligeable a
  // cote de la frequence d'appel (30 Hz). Sert a la poursuite d'une cible
  // verrouillee (voir pursueTargetWithPathfinding) ET, depuis 2026-08-16, au
  // repli de la marche neutre quand l'evitement reactif local ne suffit plus
  // (voir pursueNeutralWithPathfinding, updateStuckState) — construite avant
  // updateStuckState, qui peut avoir besoin d'un premier calcul de chemin
  // des ce tick si un blocage prolonge vient d'etre detecte.
  const pathGrid = buildPathGrid(obstacles, boardWidth, boardHeight);

  updateStuckState(movable, byId, dt, obstacles, pathGrid, orderEvents);

  // Rayon max une seule fois (les rayons ne changent pas pendant la
  // resolution) : taille de cellule de la grille de separation — voir
  // applySeparationGrid, doit couvrir la plus grande distance d'interaction
  // possible (minDist = a.radius + b.radius <= 2 * maxRadius). Un batiment
  // ne participe jamais a la separation (voir `movable` ci-dessus), donc son
  // rayon n'a pas a etre pris en compte ici.
  let maxRadius = 0;
  for (const e of movable) if (e.stats.radius > maxRadius) maxRadius = e.stats.radius;
  const separationCellSize = Math.max(2 * maxRadius, 0.01);

  for (let iter = 0; iter < COLLISION_ITERATIONS; iter++) {
    // 1. Degagement, sidestep, poursuite (un petit pas) ou marche neutre
    for (const e of movable) {
      // Une ruee de capacite (Charge...) controle entierement x/z ce tick,
      // deja resolu par abilitySystem AVANT movementSystem (voir World.step) —
      // ne jamais superposer une pousuite normale par-dessus, sous peine de
      // se disputer la position avec elle sous-passe apres sous-passe.
      if (e.dash) continue;

      // Root/movement lock (Nova de glace) : arret INSTANTANE, aucun
      // glissement — on saute purement et simplement ce tour de boucle, donc
      // x/z restent EXACTEMENT ou ils etaient (voir CLAUDE.md, demande
      // explicite : "pas de glissement pendant encore 1 seconde"). Le
      // chemin en cache est vide pour forcer un recalcul complet a la
      // reprise (meme motif que la manoeuvre de degagement ci-dessous, qui
      // deplace aussi l'unite de facon abrupte). Le combat (combatSystem)
      // n'est jamais concerne : une unite rootee a portee continue
      // d'attaquer normalement.
      if (e.rootTimer > 0) {
        e.path = null;
        continue;
      }

      if (e.unstickTimer > 0) {
        // Le chemin en cache (voir plus bas) part d'une position qui vient
        // de sauter brusquement (recul + pas de cote) : le laisser tel quel
        // ferait viser un point desormais dans une direction incoherente —
        // force un recalcul complet a la reprise normale de la poursuite.
        e.path = null;
        e.unstickTimer -= subDt;
        if (e.unstickTimer > UNSTICK_DURATION / 2) {
          // Phase 1 : grand pas en arriere, oppose a la direction vers la cible actuelle.
          const target = e.targetId !== null ? byId.get(e.targetId) ?? null : null;
          if (target) {
            const bx = e.x - target.x;
            const bz = e.z - target.z;
            const blen = Math.hypot(bx, bz) || 1;
            e.x += (bx / blen) * e.stats.moveSpeed * subDt;
            e.z += (bz / blen) * e.stats.moveSpeed * subDt;
          }
        } else {
          // Phase 2 : de cote, vers la zone la moins encombree (choisie au declenchement).
          e.x += e.unstickSideX * e.stats.moveSpeed * subDt;
          e.z += e.unstickSideZ * e.stats.moveSpeed * subDt;
        }
        continue;
      }

      if (e.sidestepTimer > 0) {
        e.path = null;
        e.sidestepTimer -= subDt;
        e.x += e.sidestepX * e.stats.moveSpeed * subDt;
        e.z += e.sidestepZ * e.stats.moveSpeed * subDt;
        continue;
      }

      // Deplacement manuel (sim/orders.ts) : prioritaire sur la poursuite et la
      // marche neutre, sauf pendant une Provocation (tauntSourceId non nul),
      // qui suspend l'ordre sans l'effacer — l'unite poursuit alors la
      // Sentinelle normalement, et reprend son trajet ensuite.
      if (e.order.type === 'move' && e.tauntSourceId === null) {
        followMoveOrder(e, e.order, obstacles, pathGrid, subDt, orderEvents);
        continue;
      }

      const target = e.targetId !== null ? byId.get(e.targetId) ?? null : null;

      if (target === null) {
        // Garde sans cible : l'unite reste sur place au lieu de reprendre la
        // marche neutre vers l'avant. Elle repartira des que le ciblage lui
        // trouvera un ennemi dans son aggro.
        if (e.order.type === 'guard') {
          e.path = null;
          e.steerX = null;
          e.steerZ = null;
          continue;
        }
        pursueNeutralWithPathfinding(e, obstacles, subDt);
        continue;
      }

      const dx = target.x - e.x;
      const dz = target.z - e.z;
      const d = Math.hypot(dx, dz);
      const inAttackRange = d <= engagementStopDistance(e, target);

      if (inAttackRange) {
        e.steerX = null;
        e.steerZ = null;
        e.path = null;
        continue;
      }

      const routeFound = pursueTargetWithPathfinding(e, target, obstacles, pathGrid, subDt);
      // Attaque ciblee vers une cible sans aucune route (A* ne trouve rien,
      // plateau deconnecte) : l'ordre echoue au lieu de laisser l'unite
      // tourner indefiniment avec l'evitement local. Une poursuite autonome
      // garde son comportement d'avant (repli sur l'evitement local).
      if (!routeFound && e.order.type === 'attack' && e.tauntSourceId === null && e.order.targetEntityId === target.id) {
        finishOrder(e, orderEvents, 'failed', 'unreachable');
      }
    }

    // 2. Separation entre corps
    if (movable.length < SEPARATION_GRID_THRESHOLD) applySeparationDirect(movable, subDt);
    else applySeparationGrid(movable, separationCellSize, subDt);

    // 3. Collision avec les obstacles
    // Une unite est un cercle (rayon = stats.radius), un obstacle un
    // rectangle exact (voir OBSTACLES).
    for (const e of movable) resolveObstacleCollisions(e, obstacles);
  }

  // 4. Confinement au plateau
  // Sans ca, une unite qui n'a plus aucun ennemi dans son aggro avance tout droit
  // et sort de la carte. Detecte au test headless, pas a l'oeil.
  // boardWidth/boardHeight recus en parametre (pas des constantes globales) :
  // premiere etape du chantier editeur de maps, voir config/mapDef.ts.
  const halfW = (boardWidth * TILE) / 2;
  const halfH = (boardHeight * TILE) / 2;
  for (const e of movable) {
    const r = e.stats.radius;
    e.x = clamp(e.x, -halfW + r, halfW - r);
    e.z = clamp(e.z, -halfH + r, halfH - r);
  }
}

/** Boucle O(n^2) d'origine — conservee telle quelle pour les petits
 *  effectifs (voir SEPARATION_GRID_THRESHOLD), ou une grille coute plus
 *  cher qu'elle ne fait gagner. */
function applySeparationDirect(alive: Entity[], subDt: number): void {
  for (let i = 0; i < alive.length; i++) {
    for (let j = i + 1; j < alive.length; j++) {
      applySeparationPair(alive[i]!, alive[j]!, i, subDt);
    }
  }
}

/**
 * Meme resultat EXACT que applySeparationDirect (verifie en headless,
 * meme sequence de paires dans le meme ordre), mais n'evalue que les paires
 * dont la grille garantit qu'elles peuvent effectivement se toucher — voir
 * sim/spatialGrid.ts. Le tri par index `j` croissant a l'interieur du
 * voisinage de chaque entite est ce qui garantit l'equivalence : sans lui,
 * l'ORDRE de traitement des paires (et donc la trajectoire exacte, qui
 * depend de l'etat mute par la paire precedente) pourrait differer, meme si
 * l'ensemble des paires reste identique.
 */
function applySeparationGrid(alive: Entity[], cellSize: number, subDt: number): void {
  const indexById = new Map<number, number>();
  alive.forEach((e, i) => indexById.set(e.id, i));

  const grid = new SpatialGrid<Entity>(cellSize);
  for (const e of alive) grid.insert(e);

  for (let i = 0; i < alive.length; i++) {
    const a = alive[i]!;
    const neighborIndexes = grid
      .queryNeighborhood(a.x, a.z)
      .map((b) => indexById.get(b.id)!)
      .filter((j) => j > i)
      .sort((x, y) => x - y);
    for (const j of neighborIndexes) {
      applySeparationPair(a, alive[j]!, i, subDt);
    }
  }
}

/** Repousse deux corps qui se chevauchent — logique inchangee depuis la
 *  boucle O(n^2) d'origine, extraite pour etre partagee par les deux
 *  variantes ci-dessus. `i` sert uniquement a la direction deterministe de
 *  depart quand deux unites sont exactement superposees. */
function applySeparationPair(a: Entity, b: Entity, i: number, subDt: number): void {
  const minDist = a.stats.radius + b.stats.radius;

  let dx = b.x - a.x;
  let dz = b.z - a.z;
  let d = Math.hypot(dx, dz);

  if (d >= minDist) return;

  // Deux unites exactement superposees : on les separe dans une direction
  // arbitraire mais deterministe, pour ne pas casser la reproductibilite.
  if (d < 1e-4) {
    dx = (i % 2 === 0 ? 1 : -1) * 0.01;
    dz = 0;
    d = 0.01;
  }

  const overlap = (minDist - d) / d;
  const push = overlap * SEPARATION_STRENGTH * subDt * 0.5;

  a.x -= dx * push;
  a.z -= dz * push;
  b.x += dx * push;
  b.z += dz * push;
}

/**
 * Distance (centre a centre) en dessous de laquelle une unite n'a plus besoin
 * de se rapprocher de sa cible. Seule source de verite pour l'arret de la
 * poursuite, l'anti-blocage et la progression d'un ordre d'attaque : si ces
 * trois calculs divergent, une unite arretee volontairement est prise pour
 * une unite bloquee et oscille.
 *
 * - engageRange defini (voir data/units.ts, UnitStats — ajoute pour le
 *   Mage) : portee de son attaque PRINCIPALE (la Boule de feu), deja
 *   exprimee centre a centre comme maxRangeTiles. Retournee telle quelle :
 *   y ajouter le rayon de la cible arretait le Mage hors de portee de tir.
 * - Sinon : attackRange bord a bord, comportement historique inchange.
 */
function engagementStopDistance(e: Entity, target: Entity): number {
  if (e.stats.engageRange !== undefined) return e.stats.engageRange;
  return e.stats.attackRange + target.stats.radius;
}

/**
 * Detecte deux formes de blocage independantes et declenche la meme
 * manoeuvre de degagement pour l'une ou l'autre :
 *   - immobilite (STUCK_DURATION) : l'unite n'a quasiment pas bouge, typiquement
 *     plusieurs allies qui se genent en visant des cibles differentes.
 *   - orbite (ORBIT_CHECK_DURATION) : l'unite bouge bel et bien a chaque tick
 *     mais ne se rapproche jamais de sa cible sur une fenetre plus longue —
 *     typiquement deux unites qui contournent le meme obstacle chacune de son
 *     cote en poursuivant chacune une cible elle-meme mobile, et qui finissent
 *     par tourner indefiniment autour de l'obstacle sans jamais se rattraper.
 *     Ce cas ne bouge pas assez peu pour declencher le premier test, d'ou la
 *     fenetre separee et plus longue (un detour legitime peut eloigner
 *     temporairement de la cible sans etre un vrai blocage).
 * Doit tourner une seule fois par tick, sur la position de DEBUT de tick —
 * jamais a l'interieur des sous-passes, qui n'ont pas de sens en temps reel.
 */
function updateStuckState(
  movable: Entity[],
  byId: Map<number, Entity>,
  dt: number,
  obstacles: ObstacleDef[],
  grid: PathGrid,
  orderEvents: OrderEndEvent[],
): void {
  for (const e of movable) {
    if (e.rootTimer > 0) {
      // Rootee : ne bouge pas et ne peut rien y faire, inutile d'evaluer un
      // blocage — evite aussi qu'une manoeuvre de degagement se retrouve
      // "programmee" pour demarrer pile a l'expiration du Root.
      e.stuckTimer = 0;
      e.stuckCheckX = e.x;
      e.stuckCheckZ = e.z;
      e.orbitTimer = 0;
      e.neutralStuckTimer = 0;
      e.neutralProgressZ = e.z;
      continue;
    }

    // Deplacement manuel : les filets de secours de la poursuite et de la
    // marche neutre ne s'appliquent pas (ils viseraient la mauvaise
    // destination). Une seule mesure (sim/orders.ts, orderMadeNoProgress) :
    // si la distance a la destination ne diminue pas de
    // ORBIT_PROGRESS_THRESHOLD en ORBIT_CHECK_DURATION, hors suivi d'un chemin
    // A* (un detour peut eloigner temporairement), l'unite abandonne et passe
    // en Garde — destination occupee par un obstacle, ou unite bloquee.
    if (e.order.type === 'move' && e.tauntSourceId === null) {
      e.stuckTimer = 0;
      e.stuckCheckX = e.x;
      e.stuckCheckZ = e.z;
      e.orbitTimer = 0;
      e.neutralStuckTimer = 0;
      e.neutralProgressZ = e.z;
      const remaining = Math.hypot(e.order.x - e.x, e.order.z - e.z);
      if (orderMadeNoProgress(e, remaining, dt, ORBIT_CHECK_DURATION, ORBIT_PROGRESS_THRESHOLD)) {
        finishOrder(e, orderEvents, 'failed', 'no-progress');
      }
      continue;
    }

    const target = e.targetId !== null ? byId.get(e.targetId) ?? null : null;

    // Garde sans cible : immobile par choix, aucun blocage a detecter.
    if (target === null && e.order.type === 'guard') {
      e.stuckTimer = 0;
      e.stuckCheckX = e.x;
      e.stuckCheckZ = e.z;
      e.orbitTimer = 0;
      e.neutralStuckTimer = 0;
      e.neutralProgressZ = e.z;
      continue;
    }

    if (target === null) {
      // Marche neutre (2026-08-16, bug remonte par Antoine sur une grande
      // carte/une muraille — voir NEUTRAL_STUCK_CHECK_DURATION) : l'evitement
      // reactif local (pursueTowards) n'a aucune vue d'ensemble du plateau,
      // exactement la meme limite structurelle qui avait deja motive le
      // pathfinding en grille pour la POURSUITE d'une cible en 2026-08-10 —
      // jamais etendue a la marche neutre a l'epoque. Mesure le progres en Z
      // dans la direction d'avance de l'equipe (pas la distance a une cible,
      // qui n'existe pas ici) sur une fenetre volontairement large pour ne
      // jamais se declencher pendant un detour reactif normal (voir la
      // constante). Aucun effet tant qu'un chemin de repli est deja actif —
      // pursueNeutralWithPathfinding le suit tant qu'il n'est pas epuise,
      // inutile de re-detecter un blocage deja gere.
      e.stuckTimer = 0;
      e.stuckCheckX = e.x;
      e.stuckCheckZ = e.z;
      e.orbitTimer = 0;

      if (e.sidestepTimer > 0 || e.unstickTimer > 0 || (e.path && e.path.length > 0)) {
        e.neutralStuckTimer = 0;
        e.neutralProgressZ = e.z;
        continue;
      }

      e.neutralStuckTimer += dt;
      if (e.neutralStuckTimer >= NEUTRAL_STUCK_CHECK_DURATION) {
        const progressed = forwardDir(e.team) * (e.z - e.neutralProgressZ);
        if (progressed < NEUTRAL_STUCK_PROGRESS_THRESHOLD) {
          e.path = computeNeutralFallbackPath(e, grid);
        }
        e.neutralStuckTimer = 0;
        e.neutralProgressZ = e.z;
      }
      continue;
    }

    // Une cible est verrouillee : la fenetre de mesure de la marche neutre
    // n'a plus cours pour l'instant. Remise a zero INCONDITIONNELLE (pas
    // seulement dans les branches "ne veut pas bouger" plus bas) — sans ca,
    // une unite qui poursuit activement pendant plusieurs secondes garde une
    // reference `neutralProgressZ` perimee (position d'avant l'acquisition
    // de la cible) ; si elle perd ensuite sa cible (mort de l'ennemi) et
    // repasse en marche neutre, le premier calcul de progres comparerait sa
    // position ACTUELLE a cette reference perimee au lieu de repartir d'une
    // fenetre fraiche, pouvant declencher un repli pathfinding a tort des le
    // retour en marche neutre.
    e.neutralStuckTimer = 0;
    e.neutralProgressZ = e.z;

    // Attaque ciblee (sim/orders.ts) : meme mesure de progression que le
    // deplacement manuel, mais sur une fenetre plus longue
    // (NEUTRAL_STUCK_CHECK_DURATION) — la cible bouge, et la poursuite garde
    // ses propres filets de secours ci-dessous. Suspendue tant que l'unite est
    // a portee d'engagement (elle combat, sa distance n'a pas a diminuer) et
    // pendant le suivi d'un chemin A*. Echec : Garde.
    if (e.order.type === 'attack' && e.tauntSourceId === null && e.order.targetEntityId === target.id) {
      const distToTarget = Math.hypot(target.x - e.x, target.z - e.z);
      if (distToTarget <= engagementStopDistance(e, target)) {
        e.orderProgressTimer = 0;
        e.orderProgressRef = distToTarget;
      } else if (orderMadeNoProgress(e, distToTarget, dt, NEUTRAL_STUCK_CHECK_DURATION, ORBIT_PROGRESS_THRESHOLD)) {
        finishOrder(e, orderEvents, 'failed', 'no-progress');
        continue;
      }
    }

    const wantsToMove =
      e.sidestepTimer <= 0 &&
      e.unstickTimer <= 0 &&
      Math.hypot(target.x - e.x, target.z - e.z) > engagementStopDistance(e, target);

    if (!wantsToMove) {
      e.stuckTimer = 0;
      e.stuckCheckX = e.x;
      e.stuckCheckZ = e.z;
      e.orbitTimer = 0;
      e.orbitCheckDist = Math.hypot(target.x - e.x, target.z - e.z);
      e.neutralStuckTimer = 0;
      e.neutralProgressZ = e.z;
      continue;
    }

    const currentDist = Math.hypot(target.x - e.x, target.z - e.z);
    let unstuck = false;

    e.stuckTimer += dt;
    if (e.stuckTimer >= STUCK_DURATION) {
      const moved = Math.hypot(e.x - e.stuckCheckX, e.z - e.stuckCheckZ);
      if (moved < STUCK_DISTANCE_THRESHOLD) {
        triggerUnstick(e, target, movable, obstacles);
        unstuck = true;
      }
      e.stuckTimer = 0;
      e.stuckCheckX = e.x;
      e.stuckCheckZ = e.z;
    }

    e.orbitTimer += dt;
    if (e.orbitTimer >= ORBIT_CHECK_DURATION) {
      const progressed = e.orbitCheckDist - currentDist;
      // 2026-08-16, bug remonte par Antoine sur une grande carte ("unites
      // pres du bord"/"muraille avec corridor lateral") : ce test mesure le
      // "progres" comme la distance a VOL D'OISEAU vers la cible — valide
      // pour l'ancien evitement reactif local (detours de quelques cases
      // autour d'UN obstacle), mais un vrai detour A* (sim/pathfinding.ts,
      // 2026-08-10) peut legitimement exiger de s'ELOIGNER d'abord pour
      // rejoindre un corridor lointain (ex. 50+ cases pour longer une
      // muraille jusqu'a son unique ouverture) — la distance a vol d'oiseau
      // ne diminue alors pas pendant BIEN plus que ORBIT_CHECK_DURATION,
      // declenchant ce filet de secours a tort. La manoeuvre de degagement
      // qu'il declenche (recul + pas de cote, sans rapport avec le chemin
      // calcule) efface le chemin en cache (voir plus haut,
      // `e.unstickTimer > 0` -> `e.path = null`) et peut repousser l'unite
      // dans la direction opposee au corridor, declenchant a nouveau le
      // meme filet au tick suivant — observe en test : une unite finit
      // "pinned" dans le coin du plateau le plus eloigne du corridor,
      // jamais rattrapee. Tant qu'un chemin CALCULE est actif (e.path,
      // voir pursueTargetWithPathfinding), on FAIT CONFIANCE a A* (deja
      // verifie correct et rapide, voir CLAUDE.md) plutot qu'a cette
      // heuristique a vol d'oiseau — le detecteur d'IMMOBILITE
      // (STUCK_DURATION, base sur le deplacement REEL, pas la distance a la
      // cible) reste actif sans changement et continue d'attraper une unite
      // vraiment coincee (ex. genee par des allies) meme en train de suivre
      // un chemin.
      const pathFollowing = e.path !== null && e.path.length > 0;
      if (!unstuck && !pathFollowing && progressed < ORBIT_PROGRESS_THRESHOLD) triggerUnstick(e, target, movable, obstacles);
      e.orbitTimer = 0;
      e.orbitCheckDist = currentDist;
    }
  }
}

/** Vrai si avancer de `probeDist` depuis (x, z) dans la direction (dirX, dirZ)
 *  amenerait le cercle de rayon `radius` a chevaucher un obstacle — sert a
 *  triggerUnstick pour eviter de choisir un cote de degagement qui fonce
 *  droit dans l'arbre/rocher meme qui a cause le blocage. */
function sideBlockedByObstacle(
  x: number,
  z: number,
  dirX: number,
  dirZ: number,
  probeDist: number,
  radius: number,
  obstacles: ObstacleDef[],
): boolean {
  const px = x + dirX * probeDist;
  const pz = z + dirZ * probeDist;
  return obstacles.some((o) => {
    const b = obstacleBounds(o);
    const closestX = clamp(px, b.minX, b.maxX);
    const closestZ = clamp(pz, b.minZ, b.maxZ);
    return Math.hypot(px - closestX, pz - closestZ) < radius;
  });
}

/**
 * Choisit le cote (perpendiculaire a la direction vers la cible) sur lequel
 * se degager, et lance la manoeuvre dessus. Priorite absolue a l'evitement
 * d'obstacle : si un des deux cotes foncerait droit dans un arbre/rocher
 * (voir sideBlockedByObstacle) et l'autre non, le cote degage l'emporte
 * TOUJOURS, quel que soit l'encombrement d'allies — sans ca (bug remonte par
 * Antoine avec la carte "vague1-20", 2026-08-10, dont plusieurs bosquets
 * sont denses), une unite pouvait choisir le seul cote "moins encombre
 * d'allies" alors que ce cote fonçait justement dans l'arbre a l'origine du
 * blocage, echouait a se degager, redeclenchait le meme blocage au tick
 * suivant, et restait ainsi coincee indefiniment pres d'un bosquet malgre
 * plusieurs tentatives. Si les deux cotes sont degages ou les deux bloques,
 * retombe sur l'ancien critere (cote le moins encombre d'allies proches).
 */
function triggerUnstick(e: Entity, target: Entity, pool: Entity[], obstacles: ObstacleDef[]): void {
  const fx = target.x - e.x;
  const fz = target.z - e.z;
  const len = Math.hypot(fx, fz) || 1;
  const perpX = -fz / len;
  const perpZ = fx / len;

  let positiveSide = 0;
  let negativeSide = 0;
  const checkRadius = 2;

  for (const other of pool) {
    if (other === e || other.team !== e.team || !other.alive) continue;
    const dx = other.x - e.x;
    const dz = other.z - e.z;
    if (Math.hypot(dx, dz) > checkRadius) continue;
    if (perpX * dx + perpZ * dz > 0) positiveSide++;
    else negativeSide++;
  }

  // Distance reellement parcourue pendant la phase 2 (cote) de la manoeuvre —
  // voir movementSystem, la phase de sidestep dure UNSTICK_DURATION / 2.
  const probeDist = (e.stats.moveSpeed * UNSTICK_DURATION) / 2;
  const positiveBlocked = sideBlockedByObstacle(e.x, e.z, perpX, perpZ, probeDist, e.stats.radius, obstacles);
  const negativeBlocked = sideBlockedByObstacle(e.x, e.z, -perpX, -perpZ, probeDist, e.stats.radius, obstacles);

  let sign: number;
  if (positiveBlocked && !negativeBlocked) sign = -1;
  else if (negativeBlocked && !positiveBlocked) sign = 1;
  else sign = positiveSide <= negativeSide ? 1 : -1;

  e.unstickTimer = UNSTICK_DURATION;
  e.unstickSideX = perpX * sign;
  e.unstickSideZ = perpZ * sign;
  e.steerX = null;
  e.steerZ = null;
}

/** Avance directement vers (aimX, aimZ), sans aucun contournement — partagee
 *  par pursueTowards (dernier pas vers la cible/le coin) et
 *  pursueTargetWithPathfinding (pas vers le prochain point de cheminement). */
function moveStraightTowards(e: Entity, aimX: number, aimZ: number, subDt: number): void {
  const dx = aimX - e.x;
  const dz = aimZ - e.z;
  const d = Math.hypot(dx, dz);
  if (d > 1e-4) {
    e.x += (dx / d) * e.stats.moveSpeed * subDt;
    e.z += (dz / d) * e.stats.moveSpeed * subDt;
  }
}

/**
 * Poursuite d'une cible VERROUILLEE (targetId) via pathfinding en grille
 * (sim/pathfinding.ts) — remplace l'evitement reactif coin-par-coin pour ce
 * cas precis (2026-08-10, voir CLAUDE.md "vrai pathfinding" : l'evitement
 * local butait sur les bosquets denses de la carte "vague1-20", une unite
 * pouvait rester bloquee toute la manche pres d'un groupe d'arbres).
 *
 * Chemin direct degage : cas MAJORITAIRE (la plupart des combats n'ont
 * aucun obstacle entre attaquant et cible), aucun calcul de grille,
 * identique en cout a l'ancien comportement.
 *
 * Chemin direct bloque : suit un chemin en cases calcule par A* sur toute
 * la carte, jamais recalcule tant qu'il reste valide (voir `e.path`) — ni a
 * chaque tick ni a chaque sous-passe, seulement quand il est absent, epuise,
 * ou que la cible a change de case depuis le dernier calcul. Contrairement a
 * l'evitement reactif, un chemin en grille ne peut pas se retrouver "dans
 * une impasse" au milieu d'un bosquet : A* a une vue complete du plateau.
 */
/** Renvoie false uniquement quand A* ne trouve AUCUNE route vers la cible
 *  (plateau deconnecte) — utilise pour faire echouer une attaque ciblee. Le
 *  deplacement de repli de ce cas reste celui d'avant. */
function pursueTargetWithPathfinding(e: Entity, target: Entity, obstacles: ObstacleDef[], grid: PathGrid, subDt: number): boolean {
  // target.footprintObstacle (2026-08-16) : meme correctif que combatSystem —
  // un batiment cible ne doit jamais se declarer bloquant envers lui-meme.
  if (findBlockingObstacle(e.x, e.z, target.x, target.z, obstacles, target.footprintObstacle) === null) {
    e.path = null;
    moveStraightTowards(e, target.x, target.z, subDt);
    return true;
  }

  const goalTileX = Math.floor(target.x + grid.halfW);
  const goalTileZ = Math.floor(target.z + grid.halfH);
  const stale = e.pathGoalTileX !== goalTileX || e.pathGoalTileZ !== goalTileZ;

  if (!e.path || e.path.length === 0 || stale) {
    e.path = findPath(grid, e.x, e.z, target.x, target.z);
    e.pathGoalTileX = goalTileX;
    e.pathGoalTileZ = goalTileZ;
  }

  if (!e.path || e.path.length === 0) {
    // Aucune route trouvee (cas degrade rarissime, ex. cible totalement
    // enfermee) : repli sur l'ancien evitement reactif plutot que de ne rien
    // faire — moins bon qu'un vrai chemin, mais jamais pire qu'avant.
    // `[]` (deja sur la case de la cible) n'est pas une absence de route.
    const routeFound = e.path !== null;
    pursueTowards(e, target.x, target.z, obstacles, subDt);
    return routeFound;
  }

  let next = e.path[0]!;
  if (Math.hypot(next.x - e.x, next.z - e.z) < PATH_WAYPOINT_REACHED_DIST) {
    e.path.shift();
    if (e.path.length === 0) {
      moveStraightTowards(e, target.x, target.z, subDt);
      return true;
    }
    next = e.path[0]!;
  }

  moveStraightTowards(e, next.x, next.z, subDt);
  return true;
}

/**
 * Ordre de deplacement manuel (sim/orders.ts) : meme logique que la poursuite
 * d'une cible (pursueTargetWithPathfinding), avec un point fixe a la place de
 * la cible. Ligne droite si elle est degagee, sinon chemin A* calcule une
 * fois et suivi point par point. Arrivee : centre de l'unite a moins de son
 * propre rayon de la destination (au moins PATH_WAYPOINT_REACHED_DIST) — la
 * separation et les collisions empechent souvent d'atteindre le point exact.
 * Aucune route : l'unite passe directement en Garde (echec signale).
 */
function followMoveOrder(
  e: Entity,
  order: Extract<UnitOrder, { type: 'move' }>,
  obstacles: ObstacleDef[],
  grid: PathGrid,
  subDt: number,
  orderEvents: OrderEndEvent[],
): void {
  const arrivalDist = Math.max(PATH_WAYPOINT_REACHED_DIST, e.stats.radius);
  if (Math.hypot(order.x - e.x, order.z - e.z) <= arrivalDist) {
    finishOrder(e, orderEvents, 'completed', 'arrived');
    return;
  }

  if (findBlockingObstacle(e.x, e.z, order.x, order.z, obstacles) === null) {
    e.path = null;
    moveStraightTowards(e, order.x, order.z, subDt);
    return;
  }

  const goalTileX = Math.floor(order.x + grid.halfW);
  const goalTileZ = Math.floor(order.z + grid.halfH);
  if (e.path === null || e.pathGoalTileX !== goalTileX || e.pathGoalTileZ !== goalTileZ) {
    e.path = findPath(grid, e.x, e.z, order.x, order.z);
    e.pathGoalTileX = goalTileX;
    e.pathGoalTileZ = goalTileZ;
    if (e.path === null) {
      finishOrder(e, orderEvents, 'failed', 'unreachable');
      return;
    }
  }

  // Chemin epuise : approche finale en ligne droite (la destination peut se
  // trouver dans un obstacle, voir la mesure de progres dans updateStuckState).
  if (e.path.length === 0) {
    moveStraightTowards(e, order.x, order.z, subDt);
    return;
  }

  let next = e.path[0]!;
  if (Math.hypot(next.x - e.x, next.z - e.z) < PATH_WAYPOINT_REACHED_DIST) {
    e.path.shift();
    if (e.path.length === 0) {
      moveStraightTowards(e, order.x, order.z, subDt);
      return;
    }
    next = e.path[0]!;
  }
  moveStraightTowards(e, next.x, next.z, subDt);
}

/**
 * Calcule le chemin de repli de la marche neutre (2026-08-16, voir
 * NEUTRAL_STUCK_CHECK_DURATION) : loin dans la direction d'avance de
 * l'equipe (au-dela meme du bord oppose du plateau), meme X qu'au moment du
 * declenchement — n'importe quel point stable "loin devant" convient, A* se
 * charge de trouver une vraie route jusque-la. Pas besoin de borner farZ aux
 * limites exactes du plateau : worldToTileZ (pathfinding.ts) clampe deja
 * toute coordonnee hors limites sur la case valide la plus proche.
 */
function computeNeutralFallbackPath(e: Entity, grid: PathGrid): { x: number; z: number }[] | null {
  const farZ = forwardDir(e.team) * grid.halfH * 2;
  return findPath(grid, e.x, e.z, e.x, farZ);
}

/**
 * Marche neutre (aucune cible verrouillee) : par defaut, evitement reactif
 * local INCHANGE (sonde quelques cases devant, voir pursueTowards juste
 * en dessous) — cas majoritaire (decor clairseme), cout identique a avant.
 *
 * Si updateStuckState a detecte un blocage prolonge (aucun progres reel en Z
 * depuis NEUTRAL_STUCK_CHECK_DURATION — typiquement une muraille ou un bord
 * de carte que l'evitement local ne peut pas contourner faute de vue
 * d'ensemble) et pose un chemin de repli dans `e.path`, le suit plutot —
 * meme logique de consommation de points de cheminement que
 * pursueTargetWithPathfinding. Une fois epuise, redevient une marche neutre
 * normale (la fenetre de mesure repart de zero au prochain tick).
 */
function pursueNeutralWithPathfinding(e: Entity, obstacles: ObstacleDef[], subDt: number): void {
  if (e.path && e.path.length > 0) {
    let next = e.path[0]!;
    if (Math.hypot(next.x - e.x, next.z - e.z) < PATH_WAYPOINT_REACHED_DIST) {
      e.path.shift();
      if (e.path.length === 0) {
        const probeZ = e.z + forwardDir(e.team) * OBSTACLE_LOOKAHEAD;
        pursueTowards(e, e.x, probeZ, obstacles, subDt);
        return;
      }
      next = e.path[0]!;
    }
    moveStraightTowards(e, next.x, next.z, subDt);
    return;
  }

  const probeZ = e.z + forwardDir(e.team) * OBSTACLE_LOOKAHEAD;
  pursueTowards(e, e.x, probeZ, obstacles, subDt);
}

/**
 * Avance vers (aimX, aimZ) en contournant tout obstacle sur le chemin —
 * evitement reactif LOCAL (pas de vue d'ensemble du plateau), utilise
 * desormais par defaut pour la MARCHE NEUTRE (aucune cible verrouillee,
 * "aimX, aimZ" est un point sonde quelques cases devant, pas une vraie
 * destination) et comme repli si pursueTargetWithPathfinding ne trouve
 * aucune route. Pour la poursuite d'une cible verrouillee normale, voir
 * pursueTargetWithPathfinding ci-dessus (pathfinding en grille complet).
 *
 * Le coin choisi reste fixe tant qu'il n'est pas atteint et que le chemin
 * direct reste bloque : sans cette memoire, deux coins aussi bons l'un que
 * l'autre peuvent alterner d'un tick a l'autre au moindre micro-mouvement, ce
 * qui fait trembler l'unite sur place au lieu de la faire avancer.
 */
function pursueTowards(e: Entity, aimX: number, aimZ: number, obstacles: ObstacleDef[], subDt: number): void {
  const reachedSteer = e.steerX !== null && Math.hypot(e.steerX - e.x, e.steerZ! - e.z) < 0.15;
  if (e.steerX === null || reachedSteer) {
    const steer = findSteeringPoint(e, aimX, aimZ, obstacles);
    e.steerX = steer?.x ?? null;
    e.steerZ = steer?.z ?? null;
  } else if (findSteeringPoint(e, aimX, aimZ, obstacles) === null) {
    // Toujours en route vers l'ancien coin, mais le chemin direct vient de se
    // degager (la cible a bouge, ou l'unite a suffisamment contourne) : plus
    // la peine de finir le detour.
    e.steerX = null;
    e.steerZ = null;
  }

  const finalX = e.steerX ?? aimX;
  const finalZ = e.steerZ ?? aimZ;
  const dx = finalX - e.x;
  const dz = finalZ - e.z;
  const d = Math.hypot(dx, dz);

  if (d > 1e-4) {
    e.x += (dx / d) * e.stats.moveSpeed * subDt;
    e.z += (dz / d) * e.stats.moveSpeed * subDt;
  }
}

/**
 * Si le segment unite -> cible traverse un obstacle, renvoie le coin (parmi
 * ceux de TOUS les obstacles qui bloquent le trajet, pas seulement le
 * premier) qui minimise le detour total (unite -> coin -> cible). Renvoie
 * null si la voie est libre : dans ce cas l'appelant vise la cible directement.
 *
 * Raisonner sur un seul obstacle a la fois etait le bug : quand deux
 * obstacles sont proches (un arbre a cote du gros rocher, par exemple), le
 * meilleur coin pour contourner LE ROCHER seul peut tres bien tomber en
 * plein dans la zone de l'ARBRE, sans que rien ne le detecte — l'unite
 * hesite alors entre les deux, ou reste collee entre les deux, incapable de
 * choisir une route qui les evite vraiment tous les deux.
 *
 * Seuls les coins d'ou la cible est directement visible SANS retraverser
 * AUCUN des obstacles (pas juste celui dont le coin est issu) sont retenus.
 * Sans ce filtre, quand la cible est a peu pres alignee derriere l'obstacle,
 * les deux distances totales (unite -> coin -> cible) sont presque egales
 * des deux cotes, et le "meilleur" coin peut tres bien etre celui qui oblige
 * a retraverser un obstacle pour rejoindre la cible — l'unite s'y rend, se
 * retrouve encore bloquee, et reste collee pres de ce coin au lieu de
 * vraiment contourner.
 *
 * Le test de visibilite se fait contre l'emprise RELLE de l'obstacle (a peine
 * retrecie, VISIBILITY_MARGIN), jamais contre l'emprise elargie de la marge
 * d'evitement : une cible peut tres bien se battre a l'arret tout pres d'un
 * obstacle (dans sa marge d'evitement, donc), auquel cas tester contre
 * l'emprise elargie la ferait apparaitre "a l'interieur du bloc" depuis
 * n'importe quel coin, rejetant TOUS les coins comme non valides — l'unite
 * retombe alors sur le repli "coin le plus proche", qui change au moindre
 * micro-mouvement et fait boucler l'unite indefiniment sans jamais se
 * rapprocher (observe en test : une unite tournant sans fin pres d'un allie
 * qui combat juste a cote du rocher). L'emprise reelle (a peine retrecie pour
 * ignorer le contact de bord : un coin est par definition sur la frontiere de
 * sa propre boite, donc tester "le segment coin -> cible traverse-t-il cette
 * meme boite" y detecte toujours une intersection au tout premier instant
 * (t=0) sans la retrecir un peu) ne souffre pas de ce probleme.
 *
 * Les coins eux-memes sont places a radius + OBSTACLE_AVOIDANCE_MARGIN, pas
 * juste radius : exactement au bord de collision physique
 * (resolveObstacleCollisions clampe aussi a radius), le coin vise et le point
 * ou la collision repousse l'unite coincident, et les deux systemes entrent
 * en resonance — l'unite "atteint" le coin, recalcule, se fait immediatement
 * recoller au meme endroit par la collision, et boucle indefiniment sans
 * jamais deborder assez pour que la ligne vers la cible se degage vraiment.
 * La meme marge genereuse sert aussi a DECIDER de contourner (pas seulement a
 * placer le coin) : un declenchement pile au ras de l'obstacle se lit comme
 * "elle fonce dedans puis se corrige au dernier moment", pas comme un vrai
 * contournement.
 */
function findSteeringPoint(
  e: Entity,
  targetX: number,
  targetZ: number,
  obstacles: ObstacleDef[],
): { x: number; z: number } | null {
  const dx = targetX - e.x;
  const dz = targetZ - e.z;
  const clearance = e.stats.radius + OBSTACLE_AVOIDANCE_MARGIN;

  // Bornes brutes en cache (voir geometry.ts) : seul "blockedBoxes"
  // (l'emprise elargie de la marge d'evitement, qui depend du rayon de
  // CETTE entite) doit vraiment etre recalcule a chaque appel.
  const rawBoxes = getObstacleBoundsList(obstacles);
  const blockedBoxes = rawBoxes.map((bounds) => ({
    minX: bounds.minX - clearance,
    maxX: bounds.maxX + clearance,
    minZ: bounds.minZ - clearance,
    maxZ: bounds.maxZ + clearance,
  }));

  const blockingIndexes = blockedBoxes
    .map((box, i) => (segmentIntersectsBox(e.x, e.z, dx, dz, box) !== null ? i : -1))
    .filter((i) => i !== -1);

  if (blockingIndexes.length === 0) return null;

  // Coins de TOUS les obstacles bloquants : la meilleure route peut passer
  // par le coin de n'importe lequel d'entre eux, pas forcement le premier trouve.
  const corners: { x: number; z: number }[] = [];
  for (const i of blockingIndexes) {
    const b = blockedBoxes[i]!;
    corners.push({ x: b.minX, z: b.minZ }, { x: b.minX, z: b.maxZ }, { x: b.maxX, z: b.minZ }, { x: b.maxX, z: b.maxZ });
  }

  // Un coin n'est valide que si la cible EST l'unite elle-meme peuvent
  // toutes deux l'atteindre en ligne droite sans retraverser AUCUN obstacle
  // du plateau (pas juste celui d'origine). Le test "coin -> cible" seul
  // suffisait pour un decor clairseme (les rochers/arbres du plateau
  // d'origine, isoles les uns des autres) : avec un decor DENSE (bosquets de
  // plusieurs arbres 1x1 quasi adjacents, voir carte "vague1-20", 2026-08-10)
  // le meilleur coin au sens de la distance pouvait tres bien n'etre
  // atteignable QUE depuis l'autre cote d'un arbre voisin — l'unite visait
  // alors un point qu'elle ne pouvait pas rejoindre en ligne droite, se
  // heurtait a cet arbre voisin, se faisait repousser par
  // resolveObstacleCollisions, et recalculait le meme coin inatteignable au
  // tick suivant : blocage apparent au milieu d'un bosquet. Le test
  // symetrique "unite -> coin" corrige ce cas sans rien changer au
  // comportement deja valide sur un decor clairseme (un coin proche y est
  // presque toujours directement atteignable de toute facon).
  // Bornes retrecies en cache (voir geometry.ts, getShrunkObstacleBoundsList,
  // 2026-08-13) : cette fonction tourne par couple (coin candidat x obstacle
  // du plateau), potentiellement jusqu'a plusieurs milliers de fois PAR
  // APPEL sur une carte dense — calculer "shrunk" une seule fois par
  // reference de tableau plutot qu'a chaque paire elimine une source
  // massive d'allocations ephemeres (meme motif que le correctif du
  // 2026-08-10 sur obstacleBounds/resolveObstacleCollisions).
  const shrunkBoxes = getShrunkObstacleBoundsList(obstacles);
  const validExits = corners.filter((c) => {
    const toCornerX = c.x - e.x;
    const toCornerZ = c.z - e.z;
    return shrunkBoxes.every((shrunk) => {
      return (
        segmentIntersectsBox(c.x, c.z, targetX - c.x, targetZ - c.z, shrunk) === null &&
        segmentIntersectsBox(e.x, e.z, toCornerX, toCornerZ, shrunk) === null
      );
    });
  });
  // Repli si aucun coin ne degage completement la vue (cluster d'obstacles
  // tres dense, rare) : autant progresser vers le plus proche plutot que de
  // ne rien faire.
  const candidates = validExits.length > 0 ? validExits : corners;

  let best = candidates[0]!;
  let bestScore = Infinity;
  for (const corner of candidates) {
    const score = Math.hypot(corner.x - e.x, corner.z - e.z) + Math.hypot(corner.x - targetX, corner.z - targetZ);
    if (score < bestScore) {
      bestScore = score;
      best = corner;
    }
  }
  return best;
}

/** Ressort une unite hors d'un obstacle si son cercle le penetre, en la
 *  poussant vers le bord le plus proche du rectangle. */
function resolveObstacleCollisions(e: Entity, obstacles: ObstacleDef[]): void {
  const r = e.stats.radius;

  // Bornes en cache (voir geometry.ts, getObstacleBoundsList) : cette
  // fonction tourne pour CHAQUE entite vivante a CHAQUE sous-passe (jusqu'a
  // N * COLLISION_ITERATIONS fois par tick) — recalculer les bornes de tous
  // les obstacles a chaque appel etait la principale source d'allocations
  // du "FPS chuté" remonte par Antoine a la vague 6.
  const boundsList = getObstacleBoundsList(obstacles);
  for (const { minX, maxX, minZ, maxZ } of boundsList) {

    const closestX = clamp(e.x, minX, maxX);
    const closestZ = clamp(e.z, minZ, maxZ);
    const dx = e.x - closestX;
    const dz = e.z - closestZ;
    const d = Math.hypot(dx, dz);

    if (d >= r) continue;

    if (d < 1e-4) {
      // Centre tombe pile dans le rectangle (ex : pousse dedans par la
      // separation) : on ressort par le bord le plus proche plutot que par
      // une direction arbitraire, qui pourrait retraverser tout le rocher.
      const penLeft = e.x - minX;
      const penRight = maxX - e.x;
      const penDown = e.z - minZ;
      const penUp = maxZ - e.z;
      const minPen = Math.min(penLeft, penRight, penDown, penUp);

      if (minPen === penLeft) e.x = minX - r;
      else if (minPen === penRight) e.x = maxX + r;
      else if (minPen === penDown) e.z = minZ - r;
      else e.z = maxZ + r;
      continue;
    }

    const push = (r - d) / d;
    e.x += dx * push;
    e.z += dz * push;
  }
}
