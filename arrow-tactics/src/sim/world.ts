import { BOARD_H, BOARD_W, isBlockingMapObstacle, obstacleBounds, OBSTACLES, TILE, type ObstacleDef } from '../config/constants';
import { buildCellIndex, cellKey, computeMapCellBounds, resolveMapCells, type MapBounds, type MapDef } from '../config/mapDef';
import { waterCellKeys } from '../config/groundSurfaces';
import { resourceNodeCellKeys, resourceNodeCells, resourceNodesOf, type ResourceNode } from '../config/resourceNodes';
import { computeCliffObstacles, resolveMapHeightField } from '../config/terrainElevation';
import { Rng, randomSeed } from '../core/rng';
import { getBuilding, type BuildingDef } from '../data/buildings';
import { getUnit, withEffectiveMoveSpeed, type UnitStats } from '../data/units';
import { NO_EQUIPMENT_BONUS, type ConstructionState, type Entity, type HeroEquipmentBonus, type ProductionOrder, type Team } from './entity';
import { CONSTRUCTION_START_HP_FRACTION, heroStatsForLevel } from '../data/hero';
import { areAllied } from './relations';
import { ENEMY_LOOT_TABLES, LOOT_TABLES, rollLoot } from '../data/loot';
import { applyInventoryAction, createHeroInventory, resolveEquipmentBonus, type HeroInventory, type InventoryAction } from './inventory';
import { DESTRUCTIBLE_LOOT, ENEMY_GOLD_DROPS } from '../data/loot';
import { CARGO_CAPACITY, createCargo, STARTING_HARVEST_PERMISSIONS, type HarvestPermissions, type PileResource } from '../data/resources';
import type { NodeResource } from '../config/resourceNodes';
import { campClearSystem, campSystem, isChestLocked, type CampEvent, type CampSpec, type CampState, type Chest, type LootDropEvent } from './systems/camps';
import { heroDeathSystem, heroRespawnSystem, heroSpellSystem, heroWhirlwindSystem, heroWorkSystem, interruptHeroSpells, refreshHeroStats, type HeroEvent, type HeroWorkContext, type ItemDrop, type ResourcePile } from './systems/hero';
import { loseCargoOnDeath, type CargoEvent } from './systems/cargo';
import { workerSystem } from './systems/workers';
import { DEFAULT_HERO_ID, heroKit, type HeroKit } from '../data/heroes';
import { DEFAULT_UNIT_LEVEL, normalizeUnitLevel } from '../data/unitLevels';
import { canHarvestResource, HARVEST_NODE_KINDS } from '../data/resources';
import { applyCommands, resolveOrders, type CommandResult, type OrderEndEvent, type PlayerCommand } from './orders';
import {
  createPlayerArrowState,
  fireArrowVolley,
  stepPlayerArrow,
  type ArrowShotSpec,
  type PlayerArrowEvent,
  type PlayerArrowState,
} from './playerArrow';
import { abilitySystem, type AbilityEvent, type BlastProjectile } from './systems/abilities';
import { buildingProductionSystem, tickProductionOrders, type ProductionSpawnEvent, type ProductionUpgradeEvent } from './systems/buildingProduction';
import { PRODUCTION_QUEUE_MAX } from '../data/production';
import { buildingAttackSystem, type BuildingAttackEvent, type BuildingProjectile } from './systems/buildingAttack';
import { combatSystem, type CombatEvent } from './systems/combat';
import { deathSystem } from './systems/death';
import { doorSystem } from './systems/doors';
import { segmentWallLine, wallLength, wallSegmentObstacle, type WallSegment } from '../core/wallLine';
import { getWallType, wallPieceBuildTime, wallPieceMaxHp } from '../data/walls';
import {
  createEnemyReinforcementState,
  pendingEnemyGroupCount,
  stepEnemyReinforcements,
  type EnemyReinforcementPlan,
  type EnemyReinforcementSpawn,
  type EnemyReinforcementState,
} from './systems/enemyReinforcements';
import { movementSystem, type PathFailure } from './systems/movement';
import { cachedPathGrid, isReachable, reachableTiles } from './pathfinding';
import { terrainObstacles } from './geometry';
import { targetingSystem } from './systems/targeting';

/**
 * Cases d'une grille en obstacles synthetiques FUSIONNES par rangee
 * (2026-11-02, KI-40) : les cases contigues d'une meme rangee (z) satisfaisant
 * `isCell` deviennent un seul rectangle (meme union, donc memes cases
 * bloquees et memes trajets, mais bien moins d'obstacles a parcourir par la
 * collision et la ligne droite). Ordre deterministe : rangees par z croissant,
 * puis x croissant. Regle UNIQUE du vide, de l'eau et des arbres.
 */
function rowSpanObstacles(bounds: MapBounds, isCell: (x: number, z: number) => boolean, make: (cornerX: number, cornerZ: number, tilesX: number) => ObstacleDef): ObstacleDef[] {
  const out: ObstacleDef[] = [];
  for (let z = bounds.minZ; z < bounds.maxZ; z++) {
    for (let x = bounds.minX; x < bounds.maxX; x++) {
      if (!isCell(x, z)) continue;
      let end = x + 1;
      while (end < bounds.maxX && isCell(end, z)) end++;
      out.push(make(x, z, end - x));
      x = end - 1;
    }
  }
  return out;
}

/**
 * Cellules "vides" (absentes de la map) a l'interieur d'une emprise donnee —
 * synthetisees comme des obstacles COLLIDABLES factices (jamais rendus,
 * jamais presents dans `map.obstacles` — uniquement injectes dans
 * `World.obstacles`, voir World.setMap) : reutilise ainsi TEL QUEL tout le
 * pipeline de collision/ligne de tir/pathfinding deja existant sans lui
 * apprendre la notion de "cellule" — un trou dans la map bloque exactement
 * comme un rocher, gratuitement. `kind: 'rock'` choisi arbitrairement (valeur
 * jamais lue pour le rendu, ces obstacles ne sortent jamais de
 * World.obstacles, qui n'est lu que par la simulation). Fusionnees par
 * rangee depuis le 2026-11-02 (rowSpanObstacles) : ~2 050 cases 1 x 1 de la
 * carte generee -> 174 rectangles.
 */
function computeVoidObstacles(cellIndex: Map<string, unknown>, bounds: MapBounds): ObstacleDef[] {
  return rowSpanObstacles(bounds, (x, z) => !cellIndex.has(cellKey(x, z)), (cornerX, cornerZ, tilesX) => ({ kind: 'rock', cornerX, cornerZ, tilesX, tilesZ: 1 }));
}

/**
 * Cases d'eau (MapDef.surfaceCells, voir isWaterSurface) en obstacles
 * synthetiques `terrainWater`, transparents aux tirs : meme principe que
 * computeVoidObstacles, meme fusion par rangee.
 */
function computeWaterObstacles(water: ReadonlySet<string>, cellIndex: Map<string, unknown>, bounds: MapBounds): ObstacleDef[] {
  if (water.size === 0) return [];
  return rowSpanObstacles(
    bounds,
    (x, z) => water.has(cellKey(x, z)) && cellIndex.has(cellKey(x, z)),
    (cornerX, cornerZ, tilesX) => ({ kind: 'rock', cornerX, cornerZ, tilesX, tilesZ: 1, terrainWater: true, blocksShots: false }),
  );
}

/**
 * Sources de ressources debout de la carte (arbres, bosquets, gros gisements
 * de pierre et d'or) en obstacles synthetiques `terrainResource` (arbres :
 * 2026-11-02 ; gisements : 2026-11-02, remplace KI-41) : chaque case d'une
 * source (resourceNodeCellKeys) bloque le deplacement et les trajets des
 * unites terrestres, jamais les tirs. Le decor reste rendu tel quel
 * (map.obstacles). Cases hors carte ou d'eau ignorees (deja bloquees). Meme
 * fusion par rangee.
 */
function computeResourceObstacles(obstacles: readonly ObstacleDef[], water: ReadonlySet<string>, cellIndex: Map<string, unknown>, bounds: MapBounds): ObstacleDef[] {
  const cells = resourceNodeCellKeys(obstacles);
  if (cells.size === 0) return [];
  return rowSpanObstacles(
    bounds,
    (x, z) => cells.has(cellKey(x, z)) && cellIndex.has(cellKey(x, z)) && !water.has(cellKey(x, z)),
    (cornerX, cornerZ, tilesX) => ({ kind: 'tree', cornerX, cornerZ, tilesX, tilesZ: 1, terrainResource: true, blocksShots: false }),
  );
}

/**
 * Le monde de simulation. Il ne connait rien du rendu : aucun import de Three.js
 * ne doit jamais apparaitre dans ce dossier. C'est cette frontiere qui nous
 * permettra plus tard de simuler des batailles sans affichage.
 */
export class World {
  entities: Entity[] = [];
  tick = 0;
  time = 0;
  /** Graine du tour en cours, affichee en debug pour pouvoir rejouer une bataille precise. */
  seed: number;
  /** Evenements de combat du dernier step (touche/rate). Vide et repeuple a chaque tick. */
  combatEvents: CombatEvent[] = [];
  /** Evenements de capacites du dernier step (debut/impact de charge...).
   *  Vide et repeuple a chaque tick, voir sim/systems/abilities.ts. */
  abilityEvents: AbilityEvent[] = [];
  /** Projectiles de zone EN VOL (Boule de feu du Mage...) — persiste d'un
   *  tick a l'autre (contrairement a abilityEvents), INDEPENDANT du cycle de
   *  vie de leur lanceur : doit survivre a sa mort (voir CLAUDE.md, point
   *  18/19 de la demande sur le Mage). Voir sim/systems/abilities.ts,
   *  BlastProjectile/advanceBlasts. */
  blasts: BlastProjectile[] = [];
  /** Fleche du joueur : cooldown + vols en cours, voir sim/playerArrow.ts. */
  playerArrow: PlayerArrowState = createPlayerArrowState();
  /** Fleches des batiments defensifs (Tour) EN VOL — voir
   *  sim/systems/buildingAttack.ts. Persistent d'un tick a l'autre. */
  buildingProjectiles: BuildingProjectile[] = [];
  /** Tirs et impacts des batiments defensifs au dernier step — vide et
   *  repeuple a chaque tick, comme combatEvents. */
  buildingAttackEvents: BuildingAttackEvent[] = [];
  private nextBuildingProjectileId = 1;
  /** Evenements de resolution d'impact du dernier step (touche/rate) — 0 a N
   *  (2026-08-14, generalise de "PlayerArrowEvent | null" : talent
   *  "Mitraillette" peut faire resoudre plusieurs carreaux le meme tick, ou
   *  a des ticks differents si leurs vols ont des durees differentes). Vide
   *  si aucun trait ne vient de terminer son vol ce tick. */
  playerArrowEvents: PlayerArrowEvent[] = [];
  /** Unites sorties des files de production au dernier step (Caserne,
   *  Auberge...) — vide et repeuple a chaque tick, comme combatEvents.
   *  Voir sim/systems/buildingProduction.ts — consomme par main.ts pour
   *  appeler le vrai World.spawn avec les stats effectives (sim/ ne les
   *  connait pas). */
  productionSpawnEvents: ProductionSpawnEvent[] = [];
  /** Ameliorations terminees dans une file de production pendant ce pas
   *  (sim/systems/buildingProduction.ts) : le niveau est applique par
   *  l'orchestration. */
  productionUpgradeEvents: ProductionUpgradeEvent[] = [];
  /** Prochain id de commande de production (World.queueProduction). */
  private nextProductionOrderId = 1;
  /** Evenements du Heros du dernier step (XP, niveau, mort, resurrection,
   *  recolte, chantier termine), voir sim/systems/hero.ts. */
  heroEvents: HeroEvent[] = [];
  /** Sources de ressources de la carte (decors exploitables par le Heros,
   *  config/resourceNodes.ts), par id. */
  resourceNodes: ReadonlyMap<number, ResourceNode> = new Map();
  /** Quantite restante de chaque source (id -> quantite) : bois d'un arbre,
   *  pierre d'un gros gisement (data/resources.ts, HARVEST_NODE_KINDS) au
   *  chargement de la carte, decomptee par la recolte (2026-11-02). */
  readonly resourceNodeAmounts = new Map<number, number>();
  /** Sources epuisees (arbres abattus, gisements vides), id de source : plus
   *  d'obstacle, cases constructibles ; vide au chargement d'une carte. */
  readonly depletedResourceNodes = new Set<number>();
  /** Cases encore occupees par une source debout (arbre, gros gisement ;
   *  cles cellKey) : deplacement (obstacles `terrainResource`) et
   *  construction (main.ts). */
  resourceCells: ReadonlySet<string> = new Set();
  /** Sources epuisees pendant ce pas : ressource, position et cases liberees
   *  (rendu : souche a la place d'un arbre, gravats a la place d'un gisement). */
  resourceDepletedEvents: { nodeId: number; resource: NodeResource; x: number; z: number; cells: { x: number; z: number }[] }[] = [];
  /** Donnees de la carte pour recalculer les obstacles des sources. */
  private resourceContext: { obstacles: readonly ObstacleDef[]; water: ReadonlySet<string>; cellIndex: Map<string, unknown>; bounds: MapBounds } | null = null;
  /** Sources arrivees a 0 pendant le pas en cours (travail du Heros, des
   *  Villageois). */
  private depletedThisStep: number[] = [];
  /** Or extrait d'un gisement pendant ce pas (monnaie, 2026-11-02) : credite
   *  par l'orchestration (RunState.gold), jamais mis dans un sac. */
  /** Cargo economique (2026-11-03, sim/systems/cargo.ts) : depots au point
   *  de collecte, or de butin ramasse, tas entames, cargo plein sans point,
   *  cargo perdu a la mort ; lus par l'orchestration apres chaque pas. */
  cargoEvents: CargoEvent[] = [];
  /** Petits tas au sol de la carte (MapDef.resourcePiles), indice = id ;
   *  `amount` baisse au ramassage. Remis a plein par setMap ; la run
   *  reapplique ses quantites (applyResourcePileAmounts). */
  resourcePiles: ResourcePile[] = [];
  /** Items au sol (butin, 2026-11-02), indice = id ; vides a chaque carte. */
  itemDrops: ItemDrop[] = [];
  /** Camps neutres (sim/systems/camps.ts, World.addCamp), indice = id. */
  camps: CampState[] = [];
  /** Coffres (camps, plus tard coffres isoles), indice = id. */
  chests: Chest[] = [];
  /** Evenements des camps du dernier pas (alerte, nettoyage). */
  campEvents: CampEvent[] = [];
  /** Items tombes au sol au dernier pas (coffre, ennemi abattu). */
  lootEvents: LootDropEvent[] = [];
  /** Outils de recolte deja RESOLUS par l'orchestration (run/
   *  harvestPermissions.ts) : la simulation ne sait pas d'ou ils viennent
   *  (outils de depart, Forge). Par defaut : les outils de depart (hache et
   *  pioche, 2026-11-04). */
  harvestPermissions: HarvestPermissions = STARTING_HARVEST_PERMISSIONS;
  /** Visibilite du camp du joueur, deja RESOLUE par l'orchestration depuis
   *  le brouillard de guerre du jeu (main.ts, avant chaque pas) : la
   *  simulation ne sait pas d'ou elle vient. null = tout visible (aucun
   *  brouillard : tests, « Tester le scénario »). Lue par l'autonomie des
   *  Villageois (2026-11-05). */
  visibility: ((x: number, z: number) => boolean) | null = null;
  /** Renforts ennemis de la vague en cours (mini-vagues du Mode survie),
   *  null hors Mode survie (« Tester le scénario ») — voir
   *  sim/systems/enemyReinforcements.ts. */
  enemyReinforcements: EnemyReinforcementState | null = null;
  /** Ennemis a faire apparaitre au dernier step (un groupe entier), vide
   *  sinon. Consomme par main.ts, qui appelle World.spawn avec les stats de
   *  la vague. */
  enemyReinforcementSpawns: EnemyReinforcementSpawn[] = [];
  /** Resultats des commandes appliquees au debut du dernier step (voir
   *  issueCommand, sim/orders.ts). Vide et repeuple a chaque tick, comme
   *  combatEvents. */
  commandResults: CommandResult[] = [];
  /** But de marche des vagues (2026-11-02, Survie sur carte generee : la
   *  Baliste) : une unite ennemie en assaut sans cible s'y rend par le
   *  terrain (sim/systems/movement.ts, marchToGoal) ; ses apparitions
   *  n'utilisent que des cases reliees a ce point. null : marche neutre
   *  historique. Pose par l'appelant, remis a null par clear(). */
  assaultGoal: { x: number; z: number } | null = null;
  /** Diagnostics du pas (developpement) : unites de vague sans aucun chemin
   *  vers le camp, groupe de renfort sans case reliee au camp. */
  pathFailures: PathFailure[] = [];
  blockedReinforcementGroup: number | null = null;
  /** Cases reliees au but (en cache par liste d'obstacles et but). */
  private reachCache: { obstacles: ObstacleDef[]; goal: string; test: (x: number, z: number) => boolean } | null = null;
  /** Ordres manuels termines pendant le dernier step (arrivee, cible perdue,
   *  inaccessible, aucun progres) — voir sim/orders.ts, OrderEndEvent. Vide
   *  et repeuple a chaque tick. Permet a l'interface de signaler un echec. */
  orderEvents: OrderEndEvent[] = [];
  /** Obstacles et dimensions du plateau actuellement charge (voir setMap) —
   *  distinct de l'etat de bataille : clear() ne les reinitialise PAS, changer
   *  de map ne doit pas forcement passer par la remise a zero d'une bataille
   *  en cours. Par defaut, la map codee en dur historique (voir
   *  config/mapDef.ts) — premiere etape du chantier editeur de maps.
   *  FILTRE aux obstacles BLOQUANTS uniquement (voir isBlockingMapObstacle,
   *  2026-10-28) : les decors (purement visuels) ne font jamais partie de
   *  cette liste, donc aucun systeme de simulation (mouvement, ligne de
   *  tir, pathfinding, capacites) n'a besoin de connaitre `kind` — c'est la
   *  liste elle-meme qui est deja la bonne. */
  obstacles: ObstacleDef[] = OBSTACLES.filter(isBlockingMapObstacle);
  boardWidth: number = BOARD_W;
  boardHeight: number = BOARD_H;

  private rng: Rng;
  private nextId = 1;
  /** Index par id (2026-08-13, chantier optimisation) — les entites ne sont
   *  JAMAIS retirees de `entities` (mortes = alive:false, voir spawn/deathSystem),
   *  donc cette Map n'a besoin d'etre alimentee qu'a la creation (spawn) : pas
   *  de reconstruction par tick necessaire. Remplace les `entities.find(e =>
   *  e.id === x)` lineaires cote rendu (main.ts) par un lookup O(1) — mesure
   *  utile a mesure que le nombre d'evenements de combat par tick grandit
   *  avec la taille des vagues. */
  private readonly entityById = new Map<number, Entity>();

  /** Empreinte-obstacle d'un bâtiment gameplay SPAWNÉ (Mine, Baliste — voir
   *  spawnBuilding), mappée par id d'entité — sert UNIQUEMENT à la retirer de
   *  `this.obstacles` au moment précis de sa destruction (voir step(),
   *  releaseDeadBuildingFootprints : "mettre à jour navigation/occupancy
   *  IMMÉDIATEMENT à destruction", demande explicite d'Antoine). Vide pour
   *  toute bataille sans bâtiment gameplay détruit — coût nul dans ce cas. */
  private readonly buildingFootprints = new Map<number, ObstacleDef>();

  /** Cases d'eau (cellKey) de la carte chargee (World.setMap) : refus des
   *  destinations sur l'eau (sim/orders.ts, applyCommands). */
  private waterCells: ReadonlySet<string> = new Set();

  /** Commandes du joueur en attente, appliquees au debut du prochain step. */
  private commandQueue: PlayerCommand[] = [];
  /** Changements d'equipement des Heros, appliques au debut du prochain pas. */
  private equipmentQueue: { entityId: number; bonus: HeroEquipmentBonus }[] = [];
  private inventoryQueue: { entityId: number; action: InventoryAction }[] = [];
  private rallyQueue: { entityId: number; point: { x: number; z: number } | null }[] = [];
  /** Or en plus sur chaque tas lache par un ennemi (talent, resolu par
   *  l'orchestration). */
  goldDropBonus = 0;

  constructor(seed: number = randomSeed()) {
    this.seed = seed;
    this.rng = new Rng(seed);
  }

  /**
   * Charge une map : obstacles + dimensions du plateau, lus par step()
   * ensuite. N'affecte pas les entites deja en jeu — a appeler avant de
   * peupler une nouvelle bataille (voir main.ts). Filtre les decors (voir
   * isBlockingMapObstacle) — le RENDU, lui, continue de lire `map.obstacles`
   * non filtre (voir render/board.ts) : un decor reste visible, juste sans
   * collision cote simulation.
   *
   * 2026-08-16 (chantier map irreguliere) : `boardWidth`/`boardHeight` ne
   * sont plus lus directement depuis `map.width`/`map.height`, mais DERIVES
   * de l'emprise REELLE des cellules de terrain (voir
   * config/mapDef.ts, resolveMapCells/computeMapCellBounds) — un "PADDING"
   * symetrique autour de l'origine englobe cette emprise (potentiellement
   * asymetrique si des cellules ont ete ajoutees au-dela du rectangle
   * d'origine, voir Part AK) SANS avoir a reecrire movementSystem/
   * abilitySystem/sim/pathfinding.ts en coordonnees asymetriques — ces
   * systemes continuent de lire un simple boardWidth/boardHeight symetrique,
   * inchange dans sa forme. Pour une map RECTANGULAIRE classique (toutes les
   * maps actuelles), l'emprise est deja symetrique : ce padding ne change
   * RIEN, boardWidth/boardHeight retombent exactement sur map.width/height.
   *
   * Chaque case ABSENTE de l'emprise PADDEE devient un obstacle "vide"
   * synthetique (voir computeVoidObstacles), injecte dans `this.obstacles`
   * au meme titre qu'un rocher — TOUT le pipeline de collision/ligne de
   * tir/pathfinding deja existant (resolveObstacleCollisions,
   * findBlockingObstacle, buildPathGrid...) traite donc un "trou" dans la
   * map exactement comme un obstacle physique, sans qu'aucun de ces systemes
   * n'ait besoin d'apprendre la notion de cellule.
   */
  setMap(map: MapDef): void {
    const cells = resolveMapCells(map);
    const bounds = computeMapCellBounds(cells);
    const cellIndex = buildCellIndex(cells);

    const paddedHalfW = Math.max(Math.abs(bounds.minX), Math.abs(bounds.maxX), 1);
    const paddedHalfH = Math.max(Math.abs(bounds.minZ), Math.abs(bounds.maxZ), 1);
    this.boardWidth = paddedHalfW * 2;
    this.boardHeight = paddedHalfH * 2;

    const paddedBounds: MapBounds = { minX: -paddedHalfW, maxX: paddedHalfW, minZ: -paddedHalfH, maxZ: paddedHalfH };
    // Relief (config/terrainElevation.ts) : chaque arete entre deux niveaux
    // devient une falaise fine, infranchissable a pied mais pas aux tirs.
    // Carte plate : aucune falaise, liste identique a avant le relief.
    const cliffs = computeCliffObstacles(resolveMapHeightField(map), (x, z) => cellIndex.has(cellKey(x, z)), cells);
    // Decors exclus (isBlockingMapObstacle) : purement visuels, ignores par
    // toute la simulation ; seuls les « Obstacles / structures » restent.
    // Eau (2026-11-01) : infranchissable a pied, transparente aux tirs.
    // Arbres (2026-11-02) : leurs cases aussi (computeTreeObstacles).
    this.resourceNodes = new Map(resourceNodesOf(map.obstacles).map((n) => [n.id, n]));
    this.resourceNodeAmounts.clear();
    for (const n of this.resourceNodes.values()) this.resourceNodeAmounts.set(n.id, HARVEST_NODE_KINDS[n.resource].amount);
    this.depletedResourceNodes.clear();
    this.resourcePiles = (map.resourcePiles ?? []).map((p, id) => ({ id, x: p.x, z: p.z, resource: p.resource, amount: p.amount }));
    this.itemDrops = [];
    this.camps = [];
    this.chests = [];
    this.waterCells = waterCellKeys(map.surfaceCells);
    const water = computeWaterObstacles(this.waterCells, cellIndex, paddedBounds);
    const sources = computeResourceObstacles(map.obstacles, this.waterCells, cellIndex, paddedBounds);
    this.obstacles = [...map.obstacles.filter(isBlockingMapObstacle), ...computeVoidObstacles(cellIndex, paddedBounds), ...cliffs, ...water, ...sources];
    this.resourceContext = { obstacles: map.obstacles, water: this.waterCells, cellIndex, bounds: paddedBounds };
    this.resourceCells = resourceNodeCellKeys(map.obstacles);
  }

  /**
   * Source epuisee (arbre abattu, gisement de pierre ou d'or vide,
   * 2026-11-02) : plus de ressource, ses cases ne bloquent plus (sauf celles
   * d'une autre source debout) et redeviennent constructibles. Les obstacles
   * des sources sont recalcules et `this.obstacles` remplace : grille de
   * pathfinding, collisions et cases reliees au camp suivent des le pas
   * suivant (caches par tableau). Volontaire : vider un gisement ou abattre
   * une foret peut ouvrir un chemin, aux vagues aussi. Evenement pour le
   * rendu (souche, gravats).
   */
  depleteResourceNode(nodeId: number): void {
    const ctx = this.resourceContext;
    const node = this.resourceNodes.get(nodeId);
    const source = ctx?.obstacles[nodeId];
    if (!ctx || !node || !source || this.depletedResourceNodes.has(nodeId)) return;
    this.depletedResourceNodes.add(nodeId);
    this.resourceNodeAmounts.set(nodeId, 0);
    const standing = ctx.obstacles.filter((_, i) => !this.depletedResourceNodes.has(i));
    const sources = computeResourceObstacles(standing, ctx.water, ctx.cellIndex, ctx.bounds);
    this.obstacles = [...this.obstacles.filter((o) => !o.terrainResource), ...sources];
    const before = this.resourceCells;
    this.resourceCells = resourceNodeCellKeys(standing);
    const cells = resourceNodeCells(source).filter((c) => before.has(cellKey(c.x, c.z)) && !this.resourceCells.has(cellKey(c.x, c.z)));
    this.resourceDepletedEvents.push({ nodeId, resource: node.resource, x: node.x, z: node.z, cells });
  }

  /** Vrai si le point (x, z) est sur une case d'eau de la carte chargee. */
  isWaterAt(x: number, z: number): boolean {
    return this.waterCells.size > 0 && this.waterCells.has(cellKey(Math.floor(x), Math.floor(z)));
  }

  /** `hp` optionnel : par defaut pleins PV (`def.stats.maxHp`), mais la
   *  phase de placement passe les PV ACTUELS d'une unite survivante d'une
   *  vague precedente (voir run/runState.ts, OwnedUnit.hp — confirme par
   *  Antoine : une unite blessee reste blessee tant qu'elle n'est pas
   *  soignee en boutique, elle ne doit pas reapparaitre a pleins PV).
   *  `statOverrides` optionnel : patch applique PAR-DESSUS les stats de base
   *  (voir Entity.stats, "pipeline base -> talents -> achats -> buffs") — la
   *  simulation ne sait pas POURQUOI une stat differe de la base (talent
   *  permanent, achat de run...), elle recoit juste le nombre final. Utilise
   *  pour l'instant par le talent "Réflexes de vétéran" (voir main.ts).
   *  `abilityDamageBonus` optionnel (defaut 0) : voir Entity.abilityDamageBonus
   *  — meme principe que statOverrides, mais pour le damage d'une CAPACITE
   *  (Boule de feu du Mage...) plutot qu'une UnitStats classique (2026-08-13,
   *  boutique d'amelioration permanente — voir run/playerUnitStats.ts).
   *  `tauntShieldBonus` optionnel (defaut 0) : voir Entity.tauntShieldBonus —
   *  meme principe, bonus PERMANENT du JOUEUR sur le bouclier gagne par
   *  ennemi provoque (Sentinelle, 2026-08-14 — voir
   *  run/playerUnitStats.ts), toujours 0 pour un ennemi. */
  spawn(
    unitId: string,
    team: Team,
    x: number,
    z: number,
    hp?: number,
    statOverrides?: Partial<UnitStats>,
    abilityDamageBonus = 0,
    tauntShieldBonus = 0,
  ): Entity {
    const def = getUnit(unitId);
    const entity: Entity = {
      id: this.nextId++,
      team,
      unitId,
      // Niveau 1 par defaut ; l'appelant pose le niveau resolu (carte,
      // amelioration, vague) juste apres, voir data/unitLevels.ts.
      level: DEFAULT_UNIT_LEVEL,
      x,
      z,
      prevX: x,
      prevZ: z,
      // 2026-08-13, correctif "PV vides malgre l'amelioration ennemie par
      // vague" : quand `hp` est omis, repli sur le maxHp DEJA PATCHE par
      // statOverrides (s'il en fournit un) plutot que le maxHp de BASE —
      // sinon une unite (joueur EN TEST via setupTestBattle, ou ENNEMI via
      // enemyStatOverrides) dont statOverrides.maxHp a ete augmente
      // apparaissait avec des PV ACTUELS a l'ancien plafond, donc des pips
      // vides des le spawn malgre des PV pleins. Sans effet sur les spawns
      // qui passent deja `hp` explicitement (ex. survivants de placement,
      // qui gerent eux-memes leurs PV actuels).
      hp: hp ?? statOverrides?.maxHp ?? def.stats.maxHp,
      alive: true,
      targetId: null,
      order: { type: 'assault' },
      orderProgressTimer: 0,
      orderProgressRef: Number.POSITIVE_INFINITY,
      attackTimer: 0,
      pendingAttack: null,
      sidestepTimer: 0,
      sidestepX: 0,
      sidestepZ: 0,
      steerX: null,
      steerZ: null,
      path: null,
      pathGoalTileX: null,
      pathGoalTileZ: null,
      stuckCheckX: x,
      stuckCheckZ: z,
      stuckTimer: 0,
      orbitCheckDist: 0,
      orbitTimer: 0,
      orbitCheckTargetId: null,
      unstickTimer: 0,
      unstickSideX: 0,
      unstickSideZ: 0,
      // Vitesse effective (x1,4, data/units.ts) sur la vitesse finale.
      stats: withEffectiveMoveSpeed({ ...def.stats, ...statOverrides }),
      abilityCooldowns: {},
      dash: null,
      cast: null,
      onHit: null,
      campGuard: null,
      huntZone: null,
      // Butin a la mort (data/loot.ts) : par type d'ennemi.
      lootTableId: team === 'enemy' ? ENEMY_LOOT_TABLES[unitId] ?? null : null,
      goldDrop: team === 'enemy' ? ENEMY_GOLD_DROPS[unitId] ?? null : null,
      lootPending: team === 'enemy',
      destructible: null,
      rally: null,
      abilityDamageBonus,
      rootTimer: 0,
      tauntTimer: 0,
      tauntSourceId: null,
      shield: 0,
      shieldTimer: 0,
      tauntShieldBonus,
      neutralProgressZ: z,
      neutralStuckTimer: 0,
      hero: null,
      worker: def.worker ? { working: null, workTimer: 0, idleSeconds: 0, autoRetryIn: 0, autoNodeId: null, autoWorked: false } : null,
      // Cargo economique : Villageois des sa creation ; Heros dans spawnHero.
      cargo: def.worker ? { ...createCargo(CARGO_CAPACITY.villageois), returnTo: null, auto: false } : null,
      construction: null,
      isBuilding: false,
      // Une unite normale compte TOUJOURS pour la survie de sa faction —
      // jamais configurable (voir Entity.countsForDefeat).
      countsForDefeat: true,
      // Une unite normale n'a jamais de footprint de collision propre (voir
      // Entity.footprintObstacle, seul spawnBuilding en pose un).
      footprintObstacle: null,
      // Une unite normale ne produit jamais rien (voir
      // Entity.productionQueue).
      productionQueue: [],
      productionOrders: [],
      productionWaitingForPopulation: false,
      buildingAttack: null,
      wall: null,
    };
    this.entities.push(entity);
    this.entityById.set(entity.id, entity);
    return entity;
  }

  /**
   * Spawn d'un BATIMENT GAMEPLAY (Mine, Baliste — 2026-08-16, voir
   * data/buildings.ts) : contrairement a spawn() ci-dessus, ne passe JAMAIS
   * par getUnit()/data/units.ts — un batiment n'est pas une unite (pas de
   * deplacement ; un batiment defensif tire via `buildingAttack`, jamais via
   * le ciblage ou le combat des unites), voir BuildingDef pour le detail des
   * champs consommes. `stats` est construit
   * directement ici avec des valeurs neutres (aggroRange=0 garantit qu'il ne
   * verrouille jamais de cible lui-meme, moveSpeed=0 combine au filtre
   * `isBuilding` de movementSystem garantit l'immobilite) — targetingSystem/
   * combatSystem/deathSystem restent, eux, entierement GENERIQUES : un
   * batiment est cible et endommage exactement comme une unite, sans le
   * moindre `if` special dans ces systemes.
   *
   * `footprint` optionnel : si fourni, injecte immediatement cette empreinte
   * dans `this.obstacles` (bloque mouvement/ligne de tir/pathfinding comme
   * n'importe quel obstacle) ET retient l'association id -> obstacle pour la
   * retirer automatiquement des que le batiment meurt (voir
   * releaseDeadBuildingFootprints) — sans ca, detruire une Mine laisserait
   * sa case bloquee pour toujours malgre l'Entity morte.
   */
  /**
   * `maxHpOverride` (2026-08-16, amelioration permanente "+10 PV/niveau" de
   * la Baliste — voir run/ballistaUpgradeEffects.ts, effectiveBallistaMaxHp) :
   * plafond de PV REELLEMENT applique, `def.maxHp` restant la valeur de BASE
   * inchangee (jamais mutee) — absent/undefined pour tout batiment sans
   * amelioration de PV (la Mine aujourd'hui). Meme motif exact que
   * World.spawn(), `statOverrides.maxHp` : `hp` retombe sur ce plafond
   * EFFECTIF (jamais `def.maxHp` seul) quand il est omis, pour qu'un
   * batiment ameliore apparaisse toujours a PLEINS PV effectifs plutot que
   * blesse des le spawn (meme classe de bug que "je commence a 5/9" deja
   * corrigee pour les unites, voir CLAUDE.md).
   */
  /**
   * Un batiment apparait sans aucune unite a produire : la production passe
   * uniquement par sa file temps reel (queueProduction), payee par le joueur
   * (2026-11-04 ; l'ancien quota gratuit de debut de manche, BuildingDef
   * .production, a ete retire).
   */
  spawnBuilding(
    def: BuildingDef,
    team: Team,
    x: number,
    z: number,
    footprint?: ObstacleDef,
    hp?: number,
    maxHpOverride?: number,
    attackDamageOverride?: number,
    /** Chantier (Entity.construction) : avancement et duree, ou absent
     *  (batiment construit). */
    construction?: ConstructionState,
  ): Entity {
    const effectiveMaxHp = maxHpOverride ?? def.maxHp;
    const entity: Entity = {
      id: this.nextId++,
      team,
      unitId: def.id,
      level: DEFAULT_UNIT_LEVEL,
      x,
      z,
      prevX: x,
      prevZ: z,
      hp: hp ?? effectiveMaxHp,
      alive: true,
      targetId: null,
      // Un batiment n'est jamais commandable (voir sim/orders.ts,
      // isCommandable) : cette valeur par defaut n'est jamais modifiee.
      order: { type: 'assault' },
      orderProgressTimer: 0,
      orderProgressRef: Number.POSITIVE_INFINITY,
      attackTimer: 0,
      pendingAttack: null,
      sidestepTimer: 0,
      sidestepX: 0,
      sidestepZ: 0,
      steerX: null,
      steerZ: null,
      path: null,
      pathGoalTileX: null,
      pathGoalTileZ: null,
      stuckCheckX: x,
      stuckCheckZ: z,
      stuckTimer: 0,
      orbitCheckDist: 0,
      orbitTimer: 0,
      orbitCheckTargetId: null,
      unstickTimer: 0,
      unstickSideX: 0,
      unstickSideZ: 0,
      stats: {
        maxHp: effectiveMaxHp,
        damage: 0,
        attackRange: 0,
        // 0 = ne verrouille JAMAIS de cible lui-meme (targetingSystem,
        // findNearestEnemy commence a bestDist=aggroRange, donc aucune
        // distance >= 0 ne peut jamais faire mieux) — un batiment ne "joue"
        // pas, il encaisse. Rien ne l'empeche en revanche d'ETRE la cible
        // d'un ennemi (targetingSystem ne discrimine jamais par type,
        // seulement par equipe/distance/portee).
        aggroRange: 0,
        moveSpeed: 0,
        attackCooldown: Number.POSITIVE_INFINITY,
        missChance: 0,
        dodgeChance: 0,
        radius: def.radius,
        canAttackWhileMoving: false,
      },
      abilityCooldowns: {},
      dash: null,
      cast: null,
      onHit: null,
      campGuard: null,
      huntZone: null,
      lootTableId: null,
      goldDrop: null,
      lootPending: false,
      destructible: null,
      rally: null,
      abilityDamageBonus: 0,
      rootTimer: 0,
      tauntTimer: 0,
      tauntSourceId: null,
      shield: 0,
      shieldTimer: 0,
      tauntShieldBonus: 0,
      neutralProgressZ: z,
      neutralStuckTimer: 0,
      hero: null,
      worker: null,
      cargo: null,
      construction: construction ? { ...construction } : null,
      isBuilding: true,
      // Un chantier ne compte jamais pour la defaite (sim/systems/hero.ts).
      countsForDefeat: construction ? false : def.countsForDefeat,
      // Meme reference que celle poussee dans this.obstacles juste en
      // dessous (jamais une copie) — voir Entity.footprintObstacle pour le
      // correctif que ca permet (un batiment ne bloque plus sa propre ligne
      // de tir/poursuite vers lui-meme).
      footprintObstacle: footprint ?? null,
      // Unites terminees en attente de sortie (voir Entity.productionQueue) :
      // aucune a l'apparition, seule la file temps reel en ajoute.
      productionQueue: [],
      productionOrders: [],
      productionWaitingForPopulation: false,
      // Batiment defensif (Tour) : degats EFFECTIFS du niveau propre du
      // batiment (attackDamageOverride), base sinon. Premier tir des qu'une
      // cible est a portee.
      buildingAttack: def.attack
        ? {
            damage: attackDamageOverride ?? def.attack.damage,
            rangeTiles: def.attack.rangeTiles,
            cooldownSeconds: def.attack.cooldownSeconds,
            projectileSpeed: def.attack.projectileSpeed,
            timer: 0,
            targetId: null,
          }
        : null,
      // Piece de mur V2 : renseignee par spawnWallPiece.
      wall: null,
    };
    this.entities.push(entity);
    this.entityById.set(entity.id, entity);
    if (footprint) {
      // Nouveau tableau (jamais une mutation en place) : les bornes des
      // obstacles sont mises en cache par identite de tableau (sim/geometry.ts,
      // KI-01).
      this.obstacles = [...this.obstacles, footprint];
      this.buildingFootprints.set(entity.id, footprint);
    }
    return entity;
  }

  /** Prochain identifiant de ligne de mur (Entity.wall.lineId). */
  private nextWallLineId = 1;

  /** Pose une ligne de mur V2 de A a B (data/walls.ts, core/wallLine.ts) :
   *  segments internes egaux, chacun une entite (PV selon sa longueur,
   *  emprise en capsule), dans l'ordre depuis A. `gates` : rangs des
   *  segments poses en porte. `construction` : chaque piece est un chantier
   *  (le Heros les bâtit, de A vers B) ; sinon elles sont bâties (cartes).
   *  `openGates` : portes bâties posees ouvertes. */
  spawnWallLine(team: Team, wallType: string, line: WallSegment, opts: { construction?: boolean; gates?: readonly number[]; openGates?: boolean } = {}): Entity[] {
    const type = getWallType(wallType);
    const lineId = this.nextWallLineId++;
    return segmentWallLine(line, type.segmentLength).map((s, index) => this.spawnWallPiece(team, wallType, lineId, index, s, opts.gates?.includes(index) === true, opts.construction === true, opts.openGates === true));
  }

  /** Piece d'une ligne de mur : segment ou porte, chantier ou bâtie. */
  private spawnWallPiece(team: Team, wallType: string, lineId: number, index: number, s: WallSegment, gate: boolean, construction: boolean, open: boolean): Entity {
    const type = getWallType(wallType);
    const role = gate ? 'gate' : 'segment';
    const def = getBuilding(gate ? type.gateBuildingId : type.segmentBuildingId);
    const length = wallLength(s);
    const maxHp = wallPieceMaxHp(type, role, length);
    const site = construction ? { progress: 0, buildTime: wallPieceBuildTime(type, role, length) } : undefined;
    const hp = construction ? Math.max(1, Math.round(maxHp * CONSTRUCTION_START_HP_FRACTION)) : maxHp;
    const footprint = wallSegmentObstacle(s, type.halfWidth);
    // Porte : son etat est partage par l'entite et son emprise (toujours
    // dans World.obstacles ; ouverte, elle ne laisse passer que les allies).
    const opened = gate && open && !construction;
    const door = gate ? { owner: team, open: opened, wantOpen: opened } : null;
    if (door) footprint.door = door;
    const e = this.spawnBuilding(def, team, (s.ax + s.bx) / 2, (s.az + s.bz) / 2, footprint, hp, maxHp, undefined, site);
    e.wall = { wallType, lineId, index, ax: s.ax, az: s.az, bx: s.bx, bz: s.bz, door };
    return e;
  }

  /** Remplace le segment `entityId` (bati ou chantier) par une PORTE de
   *  meme geometrie, en chantier (porte de palissade, pose en jeu). Le
   *  segment quitte la partie sans etre "detruit" (aucun PV a 0) ; renvoie
   *  la porte, ou null si `entityId` n'est pas un segment vivant. */
  replaceWallSegmentWithGate(entityId: number): Entity | null {
    const old = this.entityById.get(entityId);
    if (!old || !old.alive || !old.wall || old.wall.door) return null;
    const w = old.wall;
    old.alive = false;
    this.releaseDeadBuildingFootprints();
    return this.spawnWallPiece(old.team, w.wallType, w.lineId, w.index, w, true, true, false);
  }

  /** Porte : etat voulu par le camp `issuer` (allie du proprietaire,
   *  sim/relations.ts), applique au prochain pas (sim/systems/doors.ts ; une
   *  fermeture attend que l'ouverture soit libre). Faux si `entityId` n'est
   *  pas une porte vivante de ce camp ou d'un allie. */
  setDoorWanted(entityId: number, open: boolean, issuer: Team): boolean {
    const e = this.entityById.get(entityId);
    const door = e?.wall?.door;
    if (!e || !door || !e.alive || !areAllied(issuer, door.owner)) return false;
    door.wantOpen = open;
    return true;
  }

  /** Une porte s'est ouverte ou fermee : NOUVEAU tableau d'obstacles (meme
   *  contenu), pour que les listes par camp, leurs bornes et les grilles A*,
   *  en cache par identite de tableau (sim/geometry.ts, KI-01), suivent son
   *  etat. */
  private refreshDoorPassages(): void {
    this.obstacles = [...this.obstacles];
  }

  /** Lookup O(1) par id — voir `entityById`. `undefined` si l'id n'existe
   *  pas (ne devrait arriver que pour un id perime d'une bataille precedente,
   *  jamais en cours de bataille reelle). */
  getById(id: number): Entity | undefined {
    return this.entityById.get(id);
  }

  /** Retire du pipeline de collision/ligne de tir/pathfinding l'empreinte de
   *  tout batiment gameplay qui vient de mourir CE tick (voir spawnBuilding) —
   *  appelee juste apres deathSystem dans step(). O(batiments gameplay
   *  encore trackes), jamais O(obstacles) : `buildingFootprints` ne contient
   *  jamais que les quelques batiments gameplay reellement spawnes (0-2
   *  aujourd'hui), pas les dizaines d'obstacles de decor. */
  private releaseDeadBuildingFootprints(): void {
    if (this.buildingFootprints.size === 0) return;
    const released = new Set<ObstacleDef>();
    for (const [id, obstacle] of this.buildingFootprints) {
      const entity = this.entityById.get(id);
      if (!entity || entity.alive) continue;
      released.add(obstacle);
      this.buildingFootprints.delete(id);
    }
    // Nouveau tableau plutot qu'un splice : un tableau modifie en place
    // garderait ses bornes en cache (sim/geometry.ts), et l'emprise d'un
    // batiment detruit continuerait de bloquer le deplacement (KI-01).
    if (released.size > 0) this.obstacles = this.obstacles.filter((o) => !released.has(o));
  }

  /** Nombre d'entites VIVANTES d'une equipe qui COMPTENT pour sa survie
   *  (voir Entity.countsForDefeat) — source UNIQUE de la condition de
   *  victoire/defaite (voir main.ts, run/runState.ts applyBattleOutcome) :
   *  une unite compte toujours, un batiment gameplay selon sa BuildingDef.
   *  Distinct de countAlive() ci-dessous (compte BRUT, utilise par le
   *  panneau de debug — y voir un batiment gameplay est deja l'info utile
   *  la, pas besoin d'y filtrer). */
  /** Heros (data/hero.ts) du camp `team` : fiche du niveau, progression de
   *  la run (XP, niveau, morts, sac, mana). `hp` : PV actuels, pleins par
   *  defaut. `kit` : mana et sorts deja resolus (data/heroes.ts, heroKit) ;
   *  mana plein par defaut. */
  spawnHero(team: Team, x: number, z: number, progress: { xp: number; level: number; deaths: number; inventory?: HeroInventory; mana?: number }, hp?: number, kit: HeroKit = heroKit(DEFAULT_HERO_ID), equipment?: HeroEquipmentBonus): Entity {
    const inventory = progress.inventory ?? createHeroInventory();
    // Bonus des items portes (sim/inventory.ts), sauf bonus impose (essais).
    equipment ??= progress.inventory ? resolveEquipmentBonus(inventory) : NO_EQUIPMENT_BONUS;
    const e = this.spawn('hero', team, x, z, hp, heroStatsForLevel(progress.level));
    e.level = normalizeUnitLevel(progress.level);
    e.cargo = { ...createCargo(CARGO_CAPACITY.hero), returnTo: null, auto: false };
    e.hero = {
      xp: progress.xp,
      level: progress.level,
      deaths: progress.deaths,
      respawnTimer: 0,
      working: null,
      workTimer: 0,
      inventory,
      repairJob: null,
      heroId: kit.heroId,
      mana: Math.min(kit.maxMana, progress.mana ?? kit.maxMana),
      maxMana: kit.maxMana,
      manaRegen: kit.manaRegen,
      spells: kit.spells,
      spellCast: null,
      whirlwind: null,
      pendingWhirlwind: null,
      spellCooldowns: {},
      baseMaxMana: kit.maxMana,
      baseManaRegen: kit.manaRegen,
      equipment: { ...equipment },
    };
    // Equipement porte des l'apparition : stats finales (meme proportion).
    if (Object.values(equipment).some((v) => v !== 0)) refreshHeroStats(e, 'ratio');
    return e;
  }

  /** Pose un item au sol (butin d'un ennemi, d'un coffre, d'un camp ; sac
   *  plein). Renvoie son id. Deterministe : ordre d'appel. */
  dropItem(itemId: string, x: number, z: number): number {
    const id = this.itemDrops.length;
    this.itemDrops.push({ id, x, z, itemId, taken: false });
    return id;
  }

  /** Camp neutre (2026-11-02) : gardes de l'equipe adverse a leurs postes
   *  (ordre Garde, hors du compte de fin de vague, lies au camp) et son
   *  coffre, verrouille tant qu'ils vivent. Deterministe : ordre d'appel. */
  addCamp(spec: CampSpec): CampState {
    const camp: CampState = {
      id: this.camps.length,
      kind: spec.kind,
      x: spec.x,
      z: spec.z,
      detectRadius: spec.detectRadius,
      leashRadius: spec.leashRadius,
      regenPerSecond: spec.regenPerSecond,
      clearGold: spec.clearGold,
      guardIds: [],
      state: 'active',
      alerted: false,
    };
    for (const g of spec.guards) {
      const e = this.spawn(g.unitId, 'enemy', g.x, g.z);
      e.level = normalizeUnitLevel(g.level);
      e.order = { type: 'guard' };
      e.countsForDefeat = false;
      e.campGuard = { campId: camp.id, postX: g.x, postZ: g.z, returning: false, lastHp: e.hp, calm: true };
      camp.guardIds.push(e.id);
    }
    this.camps.push(camp);
    if (spec.chest) this.chests.push({ id: this.chests.length, x: spec.chest.x, z: spec.chest.z, rotationY: spec.chest.rotationY, campId: camp.id, lootTableId: spec.chest.lootTableId, opened: false });
    return camp;
  }

  /** Ouvre un coffre : tirage de sa table avec la RNG du monde, item pose
   *  devant lui. Une seule fois. */
  private lootChest(chest: Chest): { itemId: string | null; dropId: number | null } {
    chest.opened = true;
    const table = LOOT_TABLES[chest.lootTableId];
    const itemId = table ? rollLoot(table, () => this.rng.next()) : null;
    if (!itemId) return { itemId: null, dropId: null };
    const dropId = this.dropItem(itemId, chest.x + Math.sin(chest.rotationY) * 0.9, chest.z + Math.cos(chest.rotationY) * 0.9);
    this.lootEvents.push({ source: 'chest', sourceId: chest.id, itemId, dropId });
    return { itemId, dropId };
  }

  /** Apres les morts du pas, une fois par ennemi tombe (ordre des
   *  entites, RNG du monde) : son or au sol (ENEMY_GOLD_DROPS + bonus) et sa
   *  table de butin (item pose a cote). */
  private rollDeathLoot(): void {
    for (const e of this.entities) {
      if (e.alive || !e.lootPending) continue;
      e.lootPending = false;
      if (e.destructible) {
        // Objet destructible : `chance` d'une ressource (1..2) au sol, sinon rien.
        const loot = DESTRUCTIBLE_LOOT[e.destructible];
        if (loot && this.rng.next() < loot.chance && loot.entries.length > 0) {
          const entry = loot.entries[Math.min(loot.entries.length - 1, Math.floor(this.rng.next() * loot.entries.length))]!;
          const amount = entry.min + Math.floor(this.rng.next() * (entry.max - entry.min + 1));
          const dropId = entry.resource === 'gold' ? this.dropGold(e.x, e.z, amount) : this.dropResource(entry.resource, e.x, e.z, amount);
          this.lootEvents.push({ source: 'destructible', sourceId: e.id, itemId: entry.resource, dropId, amount });
        }
        continue;
      }
      const gold = e.goldDrop;
      if (gold) {
        const amount = gold.min + Math.floor(this.rng.next() * (gold.max - gold.min + 1)) + this.goldDropBonus;
        if (amount > 0) this.dropGold(e.x + 0.25, e.z - 0.2, amount);
      }
      const table = e.lootTableId ? LOOT_TABLES[e.lootTableId] : undefined;
      e.lootTableId = null;
      const itemId = table ? rollLoot(table, () => this.rng.next()) : null;
      if (itemId) this.lootEvents.push({ source: 'enemy', sourceId: e.id, itemId, dropId: this.dropItem(itemId, e.x, e.z) });
    }
  }

  /** Camp nettoye : son or en tas de 5 au plus autour du feu (ordre fixe). */
  private dropCampGold(): void {
    for (const ev of this.campEvents) {
      if (ev.type !== 'campCleared' || ev.gold <= 0) continue;
      const camp = this.camps[ev.campId]!;
      const piles = Math.ceil(ev.gold / 5);
      for (let i = 0; i < piles; i++) {
        const a = (i / piles) * Math.PI * 2 + 0.6;
        this.dropGold(camp.x + Math.cos(a) * 1.1, camp.z + Math.sin(a) * 1.1, Math.min(5, ev.gold - i * 5));
      }
    }
  }

  /** Action de l'interface sur l'inventaire d'un Heros (deplacer, equiper,
   *  retirer, ajouter) : appliquee au debut du prochain pas fixe, dans
   *  l'ordre d'appel ; une action impossible est ignoree. */
  queueInventoryAction(entityId: number, action: InventoryAction): void {
    this.inventoryQueue.push({ entityId, action: { ...action } });
  }

  /** Point de ralliement d'un batiment allie producteur (null : retire),
   *  applique au debut du prochain pas fixe, dans l'ordre d'appel. */
  queueRallyPoint(entityId: number, point: { x: number; z: number } | null): void {
    this.rallyQueue.push({ entityId, point: point ? { x: point.x, z: point.z } : null });
  }

  /** Tas d'or au sol (ennemi abattu, camp nettoye, baril). L'or est une
   *  MONNAIE : le Heros va le ramasser (ordre pickup, 2026-11-03), il est
   *  credite au stock, jamais au sac. Renvoie son id. */
  dropGold(x: number, z: number, amount: number): number {
    const id = this.resourcePiles.length;
    this.resourcePiles.push({ id, x, z, resource: 'gold', amount });
    return id;
  }

  /** Tas de ressource physique au sol (butin : bois, pierre), pris dans le
   *  cargo d'une unite economique (ordre pickup). Renvoie son id. */
  dropResource(resource: Exclude<PileResource, 'gold'>, x: number, z: number, amount: number): number {
    const id = this.resourcePiles.length;
    this.resourcePiles.push({ id, x, z, resource, amount });
    return id;
  }

  /** Objet neutre destructible (baril) sur la case de (x, z) : une case
   *  bloquante, aucune attaque, jamais cible automatiquement, hors du compte
   *  de fin de vague. Deterministe : ordre d'appel. */
  addDestructible(kind: string, x: number, z: number): Entity {
    const def = getBuilding(kind);
    const cx = Math.floor(x) + 0.5;
    const cz = Math.floor(z) + 0.5;
    const footprint: ObstacleDef = { kind: 'building', tilesX: def.footprintTilesX ?? 1, tilesZ: def.footprintTilesZ ?? 1, x: cx, z: cz };
    const e = this.spawnBuilding(def, 'enemy', cx, cz, footprint);
    e.destructible = kind;
    e.countsForDefeat = false;
    e.lootPending = true;
    return e;
  }

  /** Equipement d'un Heros change (bonus deja resolus) : applique au debut
   *  du prochain pas fixe, dans l'ordre d'appel (deterministe). */
  queueHeroEquipment(entityId: number, bonus: HeroEquipmentBonus): void {
    this.equipmentQueue.push({ entityId, bonus: { ...bonus } });
  }

  /** File de production temps reel (2026-11-02) : ajoute en fin de file du
   *  batiment `entityId` une unite, son amelioration ou une recherche
   *  (2026-11-05, `techId` opaque pour la simulation), `seconds` s de
   *  simulation, apres les commandes deja en file. Renvoie l'id de la
   *  commande, ou null si refusee : pas un batiment vivant et bati du joueur,
   *  ou file pleine (PRODUCTION_QUEUE_MAX). Cout, unites autorisees,
   *  amelioration ou recherche unique restent a l'orchestration. */
  queueProduction(entityId: number, order: { kind: 'unit'; unitId: string } | { kind: 'upgrade' } | { kind: 'research'; techId: string }, seconds: number): number | null {
    const e = this.entityById.get(entityId);
    if (!e || !e.alive || !e.isBuilding || e.construction || e.team !== 'player' || e.productionOrders.length >= PRODUCTION_QUEUE_MAX) return null;
    const id = this.nextProductionOrderId++;
    if (order.kind === 'unit') e.productionOrders.push({ id, kind: 'unit', unitId: order.unitId, remaining: seconds, total: seconds });
    else if (order.kind === 'upgrade') e.productionOrders.push({ id, kind: 'upgrade', remaining: seconds, total: seconds });
    else e.productionOrders.push({ id, kind: 'research', techId: order.techId, remaining: seconds, total: seconds });
    return id;
  }

  /** Reapplique a une UNITE vivante des stats effectives recalculees par
   *  l'orchestration (2026-11-05 : technologies et niveaux de producteurs,
   *  retroactifs) — meme forme que World.spawn (patch par-dessus la base,
   *  vitesse effective), la simulation ne sait pas D'OU viennent ces
   *  nombres. PV actuels a la MEME FRACTION du maximum (10 / 20 -> 11 / 22,
   *  comme l'equipement du Heros), jamais au-dessus du nouveau maximum.
   *  Jamais pour le Heros (refreshHeroStats) ni un batiment. */
  applyUnitStats(entity: Entity, statOverrides: Partial<UnitStats> | undefined, abilityDamageBonus = 0, tauntShieldBonus = 0): void {
    if (entity.hero || entity.isBuilding) return;
    const def = getUnit(entity.unitId);
    const prevMaxHp = entity.stats.maxHp;
    entity.stats = withEffectiveMoveSpeed({ ...def.stats, ...statOverrides });
    const maxHp = entity.stats.maxHp;
    if (maxHp !== prevMaxHp) entity.hp = prevMaxHp > 0 ? Math.min(maxHp, Math.round((entity.hp * maxHp) / prevMaxHp)) : maxHp;
    entity.abilityDamageBonus = abilityDamageBonus;
    entity.tauntShieldBonus = tauntShieldBonus;
  }

  /** Reapplique a un BATIMENT vivant ses PV max et, s'il attaque, ses degats
   *  (niveau du batiment, Baliste amelioree). PV actuels augmentes du MEME
   *  ECART que le maximum : les PV manquants restent les memes (convention
   *  des batiments), jamais au-dessus du nouveau maximum. */
  applyBuildingStats(entity: Entity, maxHp: number, attackDamage?: number): void {
    if (!entity.isBuilding) return;
    const delta = maxHp - entity.stats.maxHp;
    entity.stats = { ...entity.stats, maxHp };
    entity.hp = Math.min(maxHp, entity.hp + Math.max(0, delta));
    if (attackDamage !== undefined && entity.buildingAttack) entity.buildingAttack = { ...entity.buildingAttack, damage: attackDamage };
  }

  /** Annule la commande `orderId` de la file du batiment `entityId` (la
   *  suivante prend sa place) ; la renvoie, ou null si elle n'y est plus. */
  cancelProduction(entityId: number, orderId: number): ProductionOrder | null {
    const e = this.entityById.get(entityId);
    const index = e ? e.productionOrders.findIndex((o) => o.id === orderId) : -1;
    if (!e || index < 0) return null;
    return e.productionOrders.splice(index, 1)[0]!;
  }

  /** Quantites restantes des tas deja entames (run : id -> quantite). */
  applyResourcePileAmounts(amounts: Readonly<Record<number, number>>): void {
    for (const [id, amount] of Object.entries(amounts)) {
      const pile = this.resourcePiles[Number(id)];
      if (pile) pile.amount = amount;
    }
  }

  /** Contexte du travail du Heros (sources et tas). */
  private heroWork(): HeroWorkContext {
    return {
      nodes: this.resourceNodes,
      nodeAmounts: this.resourceNodeAmounts,
      depleted: this.depletedThisStep,
      canHarvest: (resource) => canHarvestResource(this.harvestPermissions, resource),
      isVisible: (x, z) => this.visibility === null || this.visibility(x, z),
      piles: this.resourcePiles,
      drops: this.itemDrops,
      chests: this.chests,
      chestLocked: (chest) => isChestLocked(chest, this.camps),
      openChest: (chest) => this.lootChest(chest),
    };
  }

  /** Point de resurrection d'un Heros : pres de la Baliste vivante de son
   *  camp (premier emplacement libre d'obstacle et d'eau, ordre fixe), ou
   *  null si elle est detruite. */
  private heroSpawnPoint(hero: Entity): { x: number; z: number } | null {
    const ballista = this.entities.find((e) => e.alive && e.team === hero.team && e.unitId === 'ballista');
    if (!ballista) return null;
    const d = ballista.stats.radius + hero.stats.radius + 0.4;
    const halfW = (this.boardWidth * TILE) / 2 - hero.stats.radius;
    const halfH = (this.boardHeight * TILE) / 2 - hero.stats.radius;
    const free = (x: number, z: number): boolean =>
      Math.abs(x) <= halfW && Math.abs(z) <= halfH && !this.isWaterAt(x, z) && !this.obstacles.some((o) => {
        const b = obstacleBounds(o);
        return x > b.minX - hero.stats.radius && x < b.maxX + hero.stats.radius && z > b.minZ - hero.stats.radius && z < b.maxZ + hero.stats.radius;
      });
    for (const ring of [1, 1.6, 2.4]) {
      for (const [dx, dz] of [[0, 1], [1, 0], [-1, 0], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]] as const) {
        const len = Math.hypot(dx, dz);
        const x = ballista.x + (dx / len) * d * ring;
        const z = ballista.z + (dz / len) * d * ring;
        if (free(x, z)) return { x, z };
      }
    }
    return { x: ballista.x, z: ballista.z + d };
  }

  /** Defaite (2026-11-02, decision d'Antoine) : la Baliste du camp, coeur de
   *  la base, est detruite — que le Heros soit vivant ou mort (il ne revient
   *  que tant qu'elle tient, heroSpawnPoint). Faux pour un camp sans Baliste. */
  isBaseLost(team: Team): boolean {
    let had = false;
    for (const e of this.entities) {
      if (e.team !== team || e.unitId !== 'ballista') continue;
      if (e.alive) return false;
      had = true;
    }
    return had;
  }

  countCombatants(team: Team): number {
    let n = 0;
    for (const e of this.entities) if (e.alive && e.team === team && e.countsForDefeat) n++;
    return n;
  }

  /** Demarre les renforts ennemis de la vague : le premier groupe est du
   *  immediatement et ses apparitions sont renvoyees a l'appelant, qui doit
   *  les creer avant le premier step ; les suivants arrivent pendant les
   *  steps (enemyReinforcementSpawns). */
  startEnemyReinforcements(plan: EnemyReinforcementPlan): EnemyReinforcementSpawn[] {
    this.enemyReinforcements = createEnemyReinforcementState(plan, this.tick);
    return stepEnemyReinforcements(this.enemyReinforcements, this.tick, this.entities, this.obstacles, this.reachableFromGoal());
  }

  /** Groupes ennemis pas encore apparus (0 sans renforts). */
  pendingEnemyGroups(): number {
    return this.enemyReinforcements ? pendingEnemyGroupCount(this.enemyReinforcements) : 0;
  }

  /** Vrai quand tous les ennemis prevus ont ete crees : condition de la
   *  victoire, avec l'absence d'ennemi vivant. */
  allEnemyGroupsSpawned(): boolean {
    return this.pendingEnemyGroups() === 0;
  }

  clear(seed: number = randomSeed()): void {
    this.entities.length = 0;
    this.entityById.clear();
    this.tick = 0;
    this.time = 0;
    this.combatEvents = [];
    this.abilityEvents = [];
    this.blasts = [];
    this.playerArrow = createPlayerArrowState();
    this.playerArrowEvents = [];
    this.buildingProjectiles = [];
    this.buildingAttackEvents = [];
    this.nextBuildingProjectileId = 1;
    this.productionSpawnEvents = [];
    this.productionUpgradeEvents = [];
    this.resourceDepletedEvents = [];
    this.enemyReinforcements = null;
    this.enemyReinforcementSpawns = [];
    this.assaultGoal = null;
    this.pathFailures = [];
    this.blockedReinforcementGroup = null;
    this.equipmentQueue = [];
    this.inventoryQueue = [];
    this.rallyQueue = [];
    this.goldDropBonus = 0;
    this.camps = [];
    this.chests = [];
    this.campEvents = [];
    this.lootEvents = [];
    this.reachCache = null;
    this.commandQueue = [];
    this.commandResults = [];
    this.orderEvents = [];
    this.buildingFootprints.clear();
    this.seed = seed;
    this.rng = new Rng(seed);
  }

  /** Tente de tirer une VOLEE de 1 a N carreaux de la fleche du joueur (voir
   *  sim/playerArrow.ts, ArrowShotSpec) sous un seul cooldown partage ;
   *  renvoie false sans effet si le cooldown n'est pas ecoule ou si des
   *  carreaux d'une volee precedente sont encore en vol. Generalise depuis
   *  fireArrowAt (2026-08-14, talent "Mitraillette" — voir main.ts,
   *  buildBallistaVolleyShots) : le cas normal (pas de Mitraillette) reste
   *  un appel avec un tableau a 1 seul element, comportement identique a
   *  avant. `cooldown`/`speed` optionnels : valeurs EFFECTIVES (deja
   *  modifiees par d'eventuels talents, voir main.ts) — fireArrowVolley()
   *  retombe sur les constantes de base si omis. */
  fireArrowVolley(shots: ArrowShotSpec[], cooldown?: number, speed?: number): boolean {
    return fireArrowVolley(this.playerArrow, shots, cooldown, speed);
  }

  /** Met une commande du joueur en file (voir sim/orders.ts). Elle n'est pas
   *  appliquee tout de suite mais au debut du prochain step, comme tout
   *  changement d'etat de la simulation. La liste d'ids est copiee :
   *  l'appelant peut modifier sa propre selection ensuite sans effet. */
  issueCommand(command: PlayerCommand): void {
    this.commandQueue.push({ ...command, entityIds: [...command.entityIds] });
  }

  step(dt: number): void {
    for (const e of this.entities) {
      e.prevX = e.x;
      e.prevZ = e.z;
    }
    // Heros : vivants au debut du pas (morts du pas, XP en zone).
    const hasHero = this.entities.some((e) => e.hero);
    // Vivants au debut du pas : Heros (XP, mort) et unites a cargo (cargo perdu a la mort).
    const aliveBefore = hasHero || this.entities.some((e) => e.cargo) ? new Set(this.entities.filter((e) => e.alive).map((e) => e.id)) : null;
    this.heroEvents = [];
    this.resourceDepletedEvents = [];
    this.cargoEvents = [];

    // Ordres manuels (sim/orders.ts) : appliques a une frontiere de pas fixe,
    // jamais au moment de l'evenement d'entree. Une unite sans ordre manuel
    // (`assault`) garde exactement son comportement d'avant.
    const lookup = (id: number): Entity | undefined => this.entityById.get(id);
    this.commandResults = applyCommands(
      this.commandQueue,
      lookup,
      {
        halfW: (this.boardWidth * TILE) / 2,
        halfH: (this.boardHeight * TILE) / 2,
      },
      (x, z) => this.isWaterAt(x, z),
      {
        node: (id) => {
          const node = this.resourceNodes.get(id);
          // Arbre epuise : plus rien a couper.
          if (!node || (this.resourceNodeAmounts.get(id) ?? 1) <= 0) return 'missing';
          return canHarvestResource(this.harvestPermissions, node.resource) ? 'ok' : 'locked';
        },
        hasPile: (id) => (this.resourcePiles[id]?.amount ?? 0) > 0,
        hasDrop: (id) => this.itemDrops[id]?.taken === false,
        chest: (id) => {
          const chest = this.chests[id];
          if (!chest || chest.opened) return 'missing';
          return isChestLocked(chest, this.camps) ? 'locked' : 'ok';
        },
        // Point de collecte bati (BuildingDef.dropOff, 2026-11-03).
        isDepot: (entity) => entity.isBuilding && entity.construction === null && (getBuilding(entity.unitId).dropOff?.length ?? 0) > 0,
      },
    );
    this.commandQueue = [];
    this.orderEvents = [];
    resolveOrders(this.entities, lookup, this.orderEvents);
    // Equipement des Heros (bonus resolus, file du pas) : stats finales
    // recalculees, jamais cumulees.
    for (const change of this.equipmentQueue) {
      const hero = this.entityById.get(change.entityId);
      if (!hero?.hero) continue;
      hero.hero.equipment = change.bonus;
      refreshHeroStats(hero, 'ratio');
    }
    this.equipmentQueue = [];
    // Inventaire (interface) : deplacer, equiper, retirer ; bonus d'equipement
    // recalcules d'un bloc si les items portes changent.
    for (const change of this.inventoryQueue) {
      const hero = this.entityById.get(change.entityId);
      if (!hero?.hero) continue;
      const next = applyInventoryAction(hero.hero.inventory, change.action);
      if (!next) continue;
      const equippedChanged = JSON.stringify(next.equipped) !== JSON.stringify(hero.hero.inventory.equipped);
      hero.hero.inventory = next;
      if (equippedChanged) {
        hero.hero.equipment = resolveEquipmentBonus(next);
        refreshHeroStats(hero, 'ratio');
      }
    }
    this.inventoryQueue = [];
    // Points de ralliement : batiment vivant du joueur qui produit des unites.
    for (const r of this.rallyQueue) {
      const b = this.entityById.get(r.entityId);
      // Tout batiment producteur (file temps reel : Caserne, Auberge,
      // Sanctuaire, Eglise, Ecurie...). 2026-11-04 : la regle lisait l'ancien
      // quota par manche (BuildingDef.production), que seuls la Caserne et le
      // Camp d'archerie avaient — le ralliement des autres producteurs etait
      // refuse en silence.
      if (b?.alive && b.isBuilding && b.team === 'player' && getBuilding(b.unitId).recruitmentUnlock) b.rally = r.point;
    }
    this.rallyQueue = [];
    // Sorts des Heros : un nouvel ordre (ou la mort, une Provocation) annule
    // l'incantation AVANT qu'abilitySystem ne puisse donner son effet.
    if (hasHero) interruptHeroSpells(this.entities, this.heroEvents);

    // Camps neutres : alerte, zones de chasse, retours au poste (avant le ciblage).
    this.campEvents = [];
    this.lootEvents = [];
    campSystem(this.camps, this.entities, this.entityById, dt, this.campEvents);
    targetingSystem(this.entities, dt);
    // Portes des murs V2 : ouverture / fermeture demandee, avant tout deplacement.
    doorSystem(this.entities, (door) => getWallType(door.wall!.wallType).halfWidth, () => this.refreshDoorPassages());
    // Avant movementSystem : une charge qui vient de se declencher (ou qui se
    // poursuit) doit controler entierement x/z ce tick — movementSystem se
    // contente ensuite de l'ignorer (voir son garde-fou `if (e.dash) continue`).
    // this.time = temps ecoule AVANT ce tick (l'incrementation a lieu en fin
    // de step(), voir plus bas) — sert de "battleElapsedTime" au verrou
    // initial de Provocation (2026-08-14, voir sim/systems/abilities.ts).
    this.abilityEvents = abilitySystem(this.entities, dt, this.obstacles, this.boardWidth, this.boardHeight, this.blasts, this.time);
    if (hasHero) heroSpellSystem(this.entities, this.abilityEvents, dt, this.heroEvents);
    this.pathFailures = [];
    movementSystem(this.entities, dt, this.obstacles, this.boardWidth, this.boardHeight, this.orderEvents, this.heroWork(), this.assaultGoal ? { goal: this.assaultGoal, failures: this.pathFailures } : null);
    // Tourbillon (2026-11-03) : frappes a la position du pas, AVANT le travail
    // (un Tourbillon lance pendant ce pas ne compte pas ce pas).
    if (hasHero) heroWhirlwindSystem(this.entities, dt, this.heroEvents);
    if (hasHero) heroWorkSystem(this.entities, this.heroWork(), dt, this.heroEvents, this.cargoEvents);
    if (this.entities.some((e) => e.worker)) workerSystem(this.entities, this.heroWork(), dt, this.cargoEvents);
    // Sources epuisees pendant ce pas : retirees (arbre abattu : passage
    // ouvert des le pas suivant).
    if (this.depletedThisStep.length > 0) {
      for (const id of this.depletedThisStep) this.depleteResourceNode(id);
      this.depletedThisStep.length = 0;
    }
    this.combatEvents = combatSystem(this.entities, dt, this.rng, this.obstacles);
    this.buildingAttackEvents = buildingAttackSystem(this.entities, lookup, this.buildingProjectiles, dt, () => this.nextBuildingProjectileId++);
    this.playerArrowEvents = stepPlayerArrow(this.playerArrow, dt, this.entities);
    this.productionUpgradeEvents = tickProductionOrders(this.entities, dt);
    this.productionSpawnEvents = buildingProductionSystem(this.entities, this.obstacles);
    deathSystem(this.entities);
    // Cargo perdu a la mort (2026-11-03, PROVISOIRE : pas de sac au sol).
    for (const e of this.entities) if (e.cargo && !e.alive && aliveBefore?.has(e.id)) loseCargoOnDeath(e, this.cargoEvents);
    campClearSystem(this.camps, this.entityById, this.campEvents);
    this.dropCampGold();
    this.rollDeathLoot();
    if (aliveBefore && hasHero) {
      heroDeathSystem(this.entities, aliveBefore, this.heroEvents);
      heroRespawnSystem(this.entities, dt, (hero) => this.heroSpawnPoint(hero), this.heroEvents);
    }
    this.releaseDeadBuildingFootprints();
    // Apres les morts du tick : un terrain vide se constate ici.
    this.enemyReinforcementSpawns = this.enemyReinforcements
      ? stepEnemyReinforcements(this.enemyReinforcements, this.tick, this.entities, this.obstacles, this.reachableFromGoal())
      : [];
    this.blockedReinforcementGroup = this.enemyReinforcements?.blockedGroupIndex ?? null;

    this.tick++;
    this.time += dt;
  }

  /** Test « case reliee a pied au but de marche » sur le TERRAIN (sans
   *  emprises de batiments), toujours vrai sans but. */
  private reachableFromGoal(): (x: number, z: number) => boolean {
    const goal = this.assaultGoal;
    if (!goal) return () => true;
    const key = `${goal.x},${goal.z}`;
    if (this.reachCache?.obstacles !== this.obstacles || this.reachCache.goal !== key) {
      const grid = cachedPathGrid(terrainObstacles(this.obstacles, this.entities), this.boardWidth, this.boardHeight);
      const reach = reachableTiles(grid, goal.x, goal.z);
      this.reachCache = { obstacles: this.obstacles, goal: key, test: reach ? (x, z) => isReachable(grid, reach, x, z) : () => false };
    }
    return this.reachCache.test;
  }

  countAlive(team: Team): number {
    let n = 0;
    for (const e of this.entities) if (e.alive && e.team === team) n++;
    return n;
  }
}
