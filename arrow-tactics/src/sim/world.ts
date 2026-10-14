import { BOARD_H, BOARD_W, isCollidableObstacle, OBSTACLES, TILE, type ObstacleDef } from '../config/constants';
import { buildCellIndex, cellKey, computeMapCellBounds, resolveMapCells, type MapBounds, type MapDef } from '../config/mapDef';
import { dist } from '../core/math';
import { Rng, randomSeed } from '../core/rng';
import type { BuildingDef } from '../data/buildings';
import { getUnit, type UnitStats } from '../data/units';
import type { Entity, Team } from './entity';
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
import { barracksSystem, type BarracksSpawnEvent } from './systems/barracksSystem';
import { combatSystem, type CombatEvent } from './systems/combat';
import { deathSystem } from './systems/death';
import { movementSystem } from './systems/movement';
import { tickPersistentAreaEffects, type AreaEffectTickEvent, type PersistentAreaEffect } from './systems/persistentAreaEffects';
import { advanceShadowProjectiles, pickShadowTargets, type ShadowProjectile, type ShadowProjectileEvent } from './systems/shadowProjectiles';
import { targetingSystem } from './systems/targeting';

/**
 * Cellules "vides" (absentes de la map) a l'interieur d'une emprise donnee —
 * synthetisees comme des obstacles COLLIDABLES 1x1 factices (jamais rendus,
 * jamais presents dans `map.obstacles` — uniquement injectes dans
 * `World.obstacles`, voir World.setMap) : reutilise ainsi TEL QUEL tout le
 * pipeline de collision/ligne de tir/pathfinding deja existant sans lui
 * apprendre la notion de "cellule" — un trou dans la map bloque exactement
 * comme un rocher, gratuitement. `kind: 'rock'` choisi arbitrairement (valeur
 * jamais lue pour le rendu, ces obstacles ne sortent jamais de
 * World.obstacles, qui n'est lu que par la simulation).
 */
function computeVoidObstacles(cellIndex: Map<string, unknown>, bounds: { minX: number; maxX: number; minZ: number; maxZ: number }): ObstacleDef[] {
  const voids: ObstacleDef[] = [];
  for (let z = bounds.minZ; z < bounds.maxZ; z++) {
    for (let x = bounds.minX; x < bounds.maxX; x++) {
      if (cellIndex.has(cellKey(x, z))) continue;
      voids.push({ kind: 'rock', cornerX: x, cornerZ: z, tilesX: 1, tilesZ: 1 });
    }
  }
  return voids;
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
  /** Zones d'effet persistantes actives (Blizzard...) — voir
   *  sim/systems/persistentAreaEffects.ts. Persiste d'un tick a l'autre,
   *  comme `blasts`. */
  iceNovaZones: PersistentAreaEffect[] = [];
  /** Ticks de degats de zone REELLEMENT resolus au dernier step (Blizzard...)
   *  — vide et repeuple a chaque tick, comme combatEvents/abilityEvents. Voir
   *  sim/systems/persistentAreaEffects.ts, AreaEffectTickEvent — consomme par
   *  main.ts pour le flash blanc de degats (2026-08-14, demande d'Antoine). */
  areaEffectEvents: AreaEffectTickEvent[] = [];
  /** Fleche du joueur : cooldown + vols en cours, voir sim/playerArrow.ts. */
  playerArrow: PlayerArrowState = createPlayerArrowState();
  /** Projectiles d'ombre EN VOL (talent "Soins excédentaires", 2026-08-15) —
   *  voir sim/systems/shadowProjectiles.ts. Persiste d'un tick a l'autre,
   *  comme `blasts`/`iceNovaZones` : homing sur la position ACTUELLE de leur
   *  cible plutot qu'un point verrouille. */
  shadowProjectiles: ShadowProjectile[] = [];
  /** Impacts REELLEMENT resolus au dernier step — vide et repeuple a chaque
   *  tick, comme combatEvents/areaEffectEvents. Consomme par main.ts pour le
   *  flash blanc de degats + le VFX d'impact d'ombre. */
  shadowProjectileEvents: ShadowProjectileEvent[] = [];
  /** Evenements de resolution d'impact du dernier step (touche/rate) — 0 a N
   *  (2026-08-14, generalise de "PlayerArrowEvent | null" : talent
   *  "Mitraillette" peut faire resoudre plusieurs carreaux le meme tick, ou
   *  a des ticks differents si leurs vols ont des durees differentes). Vide
   *  si aucun trait ne vient de terminer son vol ce tick. */
  playerArrowEvents: PlayerArrowEvent[] = [];
  /** Productions d'unites REELLEMENT declenchees au dernier step (Caserne,
   *  2026-08-17) — vide et repeuple a chaque tick, comme combatEvents. Voir
   *  sim/systems/barracksSystem.ts, BarracksSpawnEvent — consomme par main.ts
   *  pour appeler le vrai World.spawn avec les stats/talents effectifs (sim/
   *  ne les connait pas). */
  barracksSpawnEvents: BarracksSpawnEvent[] = [];
  /** Resultats des commandes appliquees au debut du dernier step (voir
   *  issueCommand, sim/orders.ts). Vide et repeuple a chaque tick, comme
   *  combatEvents. */
  commandResults: CommandResult[] = [];
  /** Ordres manuels termines pendant le dernier step (arrivee, cible perdue,
   *  inaccessible, aucun progres) — voir sim/orders.ts, OrderEndEvent. Vide
   *  et repeuple a chaque tick. Permet a l'interface de signaler un echec. */
  orderEvents: OrderEndEvent[] = [];
  /** Obstacles et dimensions du plateau actuellement charge (voir setMap) —
   *  distinct de l'etat de bataille : clear() ne les reinitialise PAS, changer
   *  de map ne doit pas forcement passer par la remise a zero d'une bataille
   *  en cours. Par defaut, la map codee en dur historique (voir
   *  config/mapDef.ts) — premiere etape du chantier editeur de maps.
   *  FILTRE aux obstacles COLLIDABLES uniquement (voir isCollidableObstacle,
   *  2026-08-14) : les props (decor purement visuel) ne font jamais partie
   *  de cette liste, donc aucun systeme de simulation (mouvement, ligne de
   *  tir, pathfinding, capacites) n'a besoin de connaitre `kind` — ils
   *  restent inconditionnels comme avant, c'est la liste elle-meme qui est
   *  deja la bonne. */
  obstacles: ObstacleDef[] = OBSTACLES.filter(isCollidableObstacle);
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

  /** Commandes du joueur en attente, appliquees au debut du prochain step. */
  private commandQueue: PlayerCommand[] = [];

  constructor(seed: number = randomSeed()) {
    this.seed = seed;
    this.rng = new Rng(seed);
  }

  /**
   * Charge une map : obstacles + dimensions du plateau, lus par step()
   * ensuite. N'affecte pas les entites deja en jeu — a appeler avant de
   * peupler une nouvelle bataille (voir main.ts). Filtre les props (voir
   * isCollidableObstacle) — le RENDU, lui, continue de lire `map.obstacles`
   * non filtre (voir render/board.ts) : un prop reste visible, juste sans
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
    this.obstacles = [...map.obstacles.filter(isCollidableObstacle), ...computeVoidObstacles(cellIndex, paddedBounds)];
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
   *  boutique d'amelioration permanente — voir run/unitUpgradeEffects.ts).
   *  `tauntShieldBonus` optionnel (defaut 0) : voir Entity.tauntShieldBonus —
   *  meme principe, bonus PERMANENT du JOUEUR sur le bouclier gagne par
   *  ennemi provoque (Sentinelle, 2026-08-14 — voir
   *  run/sentinelUpgradeEffects.ts), toujours 0 pour un ennemi. */
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
      unstickTimer: 0,
      unstickSideX: 0,
      unstickSideZ: 0,
      stats: { ...def.stats, ...statOverrides },
      abilityCooldowns: {},
      dash: null,
      cast: null,
      abilityDamageBonus,
      rootTimer: 0,
      tauntTimer: 0,
      tauntSourceId: null,
      shield: 0,
      shieldTimer: 0,
      tauntShieldBonus,
      neutralProgressZ: z,
      neutralStuckTimer: 0,
      isBuilding: false,
      // Une unite normale compte TOUJOURS pour la survie de sa faction —
      // jamais configurable (voir Entity.countsForDefeat).
      countsForDefeat: true,
      // Une unite normale n'a jamais de footprint de collision propre (voir
      // Entity.footprintObstacle, seul spawnBuilding en pose un).
      footprintObstacle: null,
      // Une unite normale ne produit jamais rien (voir Entity.spawnTimer,
      // seul spawnBuilding avec un BuildingDef.spawner en initialise un).
      spawnTimer: null,
      spawnIntervalSeconds: null,
      spawnUnitId: null,
      spawnCount: null,
    };
    this.entities.push(entity);
    this.entityById.set(entity.id, entity);
    return entity;
  }

  /**
   * Spawn d'un BATIMENT GAMEPLAY (Mine, Baliste — 2026-08-16, voir
   * data/buildings.ts) : contrairement a spawn() ci-dessus, ne passe JAMAIS
   * par getUnit()/data/units.ts — un batiment n'est pas une unite (pas de
   * deplacement, pas de portee d'attaque, pas de ciblage propre), voir
   * BuildingDef pour le detail des champs consommes. `stats` est construit
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
   * `spawnIntervalOverride` (2026-08-17, amelioration permanente de la
   * Caserne — voir run/barracksUpgradeEffects.ts) : intervalle de production
   * REELLEMENT applique pour CETTE instance, `def.spawner?.baseIntervalSeconds`
   * restant la valeur de BASE inchangee — meme motif exact que
   * `maxHpOverride` ci-dessus. Sans effet pour un batiment sans `def.spawner`
   * (Mine, Baliste) : `spawnTimer`/`spawnIntervalSeconds`/`spawnUnitId`
   * restent tous `null`.
   *
   * `spawnCountOverride` (2026-08-17, meme jour — refonte de l'amelioration
   * permanente : "+1 Fantassin par achat") : nombre d'unites REELLEMENT
   * produites par production reussie, `1` par defaut (base) — meme motif
   * exact que `spawnIntervalOverride`.
   */
  spawnBuilding(
    def: BuildingDef,
    team: Team,
    x: number,
    z: number,
    footprint?: ObstacleDef,
    hp?: number,
    maxHpOverride?: number,
    spawnIntervalOverride?: number,
    spawnCountOverride?: number,
  ): Entity {
    const effectiveMaxHp = maxHpOverride ?? def.maxHp;
    const effectiveSpawnInterval = def.spawner ? (spawnIntervalOverride ?? def.spawner.baseIntervalSeconds) : null;
    const effectiveSpawnCount = def.spawner ? (spawnCountOverride ?? 1) : null;
    const entity: Entity = {
      id: this.nextId++,
      team,
      unitId: def.id,
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
      abilityDamageBonus: 0,
      rootTimer: 0,
      tauntTimer: 0,
      tauntSourceId: null,
      shield: 0,
      shieldTimer: 0,
      tauntShieldBonus: 0,
      neutralProgressZ: z,
      neutralStuckTimer: 0,
      isBuilding: true,
      countsForDefeat: def.countsForDefeat,
      // Meme reference que celle poussee dans this.obstacles juste en
      // dessous (jamais une copie) — voir Entity.footprintObstacle pour le
      // correctif que ca permet (un batiment ne bloque plus sa propre ligne
      // de tir/poursuite vers lui-meme).
      footprintObstacle: footprint ?? null,
      // Production automatique (Caserne, 2026-08-17) — voir Entity.spawnTimer.
      // `effectiveSpawnInterval` demarre le decompte a l'INTERVALLE COMPLET
      // (jamais 0) : le premier Fantassin apparait bien apres ce delai, pas
      // instantanement (demande explicite d'Antoine, point 24).
      spawnTimer: effectiveSpawnInterval,
      spawnIntervalSeconds: effectiveSpawnInterval,
      spawnUnitId: def.spawner?.unitId ?? null,
      spawnCount: effectiveSpawnCount,
    };
    this.entities.push(entity);
    this.entityById.set(entity.id, entity);
    if (footprint) {
      this.obstacles.push(footprint);
      this.buildingFootprints.set(entity.id, footprint);
    }
    return entity;
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
    for (const [id, obstacle] of this.buildingFootprints) {
      const entity = this.entityById.get(id);
      if (!entity || entity.alive) continue;
      const idx = this.obstacles.indexOf(obstacle);
      if (idx !== -1) this.obstacles.splice(idx, 1);
      this.buildingFootprints.delete(id);
    }
  }

  /** Nombre d'entites VIVANTES d'une equipe qui COMPTENT pour sa survie
   *  (voir Entity.countsForDefeat) — source UNIQUE de la condition de
   *  victoire/defaite (voir main.ts, run/runState.ts applyBattleOutcome) :
   *  une unite compte toujours, un batiment gameplay selon sa BuildingDef.
   *  Distinct de countAlive() ci-dessous (compte BRUT, utilise par le
   *  panneau de debug — y voir un batiment gameplay est deja l'info utile
   *  la, pas besoin d'y filtrer). */
  countCombatants(team: Team): number {
    let n = 0;
    for (const e of this.entities) if (e.alive && e.team === team && e.countsForDefeat) n++;
    return n;
  }

  clear(seed: number = randomSeed()): void {
    this.entities.length = 0;
    this.entityById.clear();
    this.tick = 0;
    this.time = 0;
    this.combatEvents = [];
    this.abilityEvents = [];
    this.blasts = [];
    this.iceNovaZones = [];
    this.areaEffectEvents = [];
    this.playerArrow = createPlayerArrowState();
    this.playerArrowEvents = [];
    this.shadowProjectiles = [];
    this.shadowProjectileEvents = [];
    this.barracksSpawnEvents = [];
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

  /**
   * Nova de glace (2026-08-14) : impact INSTANTANE, applique le statut Root
   * (voir Entity.rootTimer) a toute unite du camp OPPOSE a `casterTeam`
   * presente dans `radius` de (x, z) AU MOMENT de l'appel — jamais un
   * projectile, jamais de duree de vol, coherent avec "aucun cast long"
   * (demande explicite d'Antoine). Coupe net tout etat de mouvement en
   * cours (dash, sidestep, degagement, chemin en cache) pour un arret
   * IMMEDIAT, sans glissement — et pour interrompre proprement une Charge
   * de Cavalier deja engagee (preference V1 d'Antoine : "Nova interrompt
   * immediatement le deplacement de Charge").
   */
  applyIceNovaRoot(casterTeam: Team, x: number, z: number, radius: number, duration: number): void {
    for (const e of this.entities) {
      if (!e.alive || e.team === casterTeam) continue;
      if (dist(e.x, e.z, x, z) > radius) continue;
      e.rootTimer = duration;
      e.dash = null;
      e.sidestepTimer = 0;
      e.unstickTimer = 0;
      e.path = null;
      e.steerX = null;
      e.steerZ = null;
    }
  }

  /** Blizzard (talent, 2026-08-14) : cree une zone persistante — voir
   *  sim/systems/persistentAreaEffects.ts. INDEPENDANTE du Root ci-dessus :
   *  ne cible jamais les memes unites "figees a t=0", chaque tick re-scanne
   *  qui est REELLEMENT present dans la zone a cet instant. */
  createBlizzardZone(casterTeam: Team, x: number, z: number, radius: number, duration: number, tickInterval: number, damagePerTick: number): void {
    this.iceNovaZones.push({ casterTeam, x, z, radius, elapsed: 0, duration, tickInterval, damagePerTick, ticksFired: 0 });
  }

  /**
   * Talent "Soins excédentaires" (2026-08-15) : lance `count` projectiles
   * d'ombre reels depuis (x, z), chacun infligeant `damagePerProjectile` a un
   * ennemi VIVANT choisi (voir pickShadowTargets — preference de cibles
   * distinctes). Sans effet si `count <= 0` ou si aucun ennemi n'est vivant
   * (le soin excedentaire est alors simplement PERDU, pas d'erreur, pas de
   * projectile fantome) — voir main.ts, triggerShadowProjectiles.
   */
  spawnShadowProjectiles(x: number, z: number, casterTeam: Team, count: number, damagePerProjectile: number, speed: number): void {
    if (count <= 0) return;
    const livingEnemies = this.entities.filter((e) => e.alive && e.team !== casterTeam);
    if (livingEnemies.length === 0) return;

    for (const target of pickShadowTargets(livingEnemies, count, this.rng)) {
      this.shadowProjectiles.push({ x, z, casterTeam, targetId: target.id, damage: damagePerProjectile, speed });
    }
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

    // Ordres manuels (sim/orders.ts) : appliques a une frontiere de pas fixe,
    // jamais au moment de l'evenement d'entree. Une unite sans ordre manuel
    // (`assault`) garde exactement son comportement d'avant.
    const lookup = (id: number): Entity | undefined => this.entityById.get(id);
    this.commandResults = applyCommands(this.commandQueue, lookup, {
      halfW: (this.boardWidth * TILE) / 2,
      halfH: (this.boardHeight * TILE) / 2,
    });
    this.commandQueue = [];
    this.orderEvents = [];
    resolveOrders(this.entities, lookup, this.orderEvents);

    targetingSystem(this.entities, dt);
    // Avant movementSystem : une charge qui vient de se declencher (ou qui se
    // poursuit) doit controler entierement x/z ce tick — movementSystem se
    // contente ensuite de l'ignorer (voir son garde-fou `if (e.dash) continue`).
    // this.time = temps ecoule AVANT ce tick (l'incrementation a lieu en fin
    // de step(), voir plus bas) — sert de "battleElapsedTime" au verrou
    // initial de Provocation (2026-08-14, voir sim/systems/abilities.ts).
    this.abilityEvents = abilitySystem(this.entities, dt, this.obstacles, this.boardWidth, this.boardHeight, this.blasts, this.time);
    movementSystem(this.entities, dt, this.obstacles, this.boardWidth, this.boardHeight, this.orderEvents);
    this.combatEvents = combatSystem(this.entities, dt, this.rng, this.obstacles);
    this.areaEffectEvents = tickPersistentAreaEffects(this.iceNovaZones, dt, this.entities);
    this.playerArrowEvents = stepPlayerArrow(this.playerArrow, dt, this.entities);
    this.shadowProjectileEvents = advanceShadowProjectiles(this.shadowProjectiles, dt, this.entities, this.rng);
    this.barracksSpawnEvents = barracksSystem(this.entities, this.obstacles, dt);
    deathSystem(this.entities);
    this.releaseDeadBuildingFootprints();

    this.tick++;
    this.time += dt;
  }

  countAlive(team: Team): number {
    let n = 0;
    for (const e of this.entities) if (e.alive && e.team === team) n++;
    return n;
  }
}
