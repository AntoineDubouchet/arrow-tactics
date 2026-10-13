import type { AbilityDef } from '../data/abilities';
import type { ObstacleDef } from '../config/constants';
import type { UnitStats } from '../data/units';
import type { UnitOrder } from './orders';

export type Team = 'player' | 'enemy';

/**
 * Ruee scriptee en cours (voir sim/systems/abilities.ts) — GENERIQUE, pas
 * specifique a la Charge du Cavalier : n'importe quelle future capacite de
 * type "se precipiter en ligne droite vers une cible et frapper a l'arrivee"
 * (un futur Chevalier lourd, un mini-boss...) reutilisera cette meme forme.
 * Deplacement direct fromX/fromZ -> toX/toZ sur `duration` secondes ; les
 * degats sont appliques a `targetId` des que `elapsed >= duration`, PUIS
 * l'etat est efface (dash redevient null) pour rendre la main aux systemes
 * normaux (ciblage/poursuite/attaque).
 */
export interface DashState {
  targetId: number;
  fromX: number;
  fromZ: number;
  toX: number;
  toZ: number;
  elapsed: number;
  duration: number;
  damage: number;
}

/**
 * Incantation en cours d'une capacite de type 'area-blast' (voir
 * data/abilities.ts, sim/systems/abilities.ts) — GENERIQUE, pas specifique
 * au Mage : toute future capacite "incante -> position verrouillee ->
 * projectile -> degats de zone" (catapulte, mini-boss...) reutilise cette
 * meme forme. `targetX`/`targetZ` sont VERROUILLES au declenchement et ne
 * bougent plus jamais pendant l'incantation, meme si les cibles a l'origine
 * du choix de zone continuent de se deplacer — mecanique centrale de
 * l'unite (voir CLAUDE.md, "la position est verrouillee au debut de
 * l'incantation"). Interrompue SANS projectile si l'entite meurt pendant
 * l'incantation (voir abilitySystem, `if (!e.alive) e.cast = null`) —
 * distinct du projectile lui-meme (voir World.blasts), qui lui doit au
 * contraire SURVIVRE a la mort du lanceur une fois lance.
 */
export interface CastState {
  targetX: number;
  targetZ: number;
  elapsed: number;
  duration: number;
  /** Copies depuis l'AreaBlastAbility au declenchement (pas relues depuis
   *  UnitDef a l'issue de l'incantation) : un futur changement de talent/
   *  equipement en cours de bataille ne doit jamais modifier une incantation
   *  deja engagee. */
  projectileSpeed: number;
  damage: number;
  radiusTiles: number;
  knockbackTiles?: number;
}

export interface Entity {
  id: number;
  team: Team;
  unitId: string;

  /** Position courante dans le plan de simulation. */
  x: number;
  z: number;
  /** Position au tick precedent, utilisee par le rendu pour interpoler. */
  prevX: number;
  prevZ: number;

  hp: number;
  alive: boolean;

  /** Cible verrouillee. Seul targetingSystem l'ecrit ; les autres systemes se
   *  contentent de la lire. Gardee tant qu'elle est vivante et dans l'aggro,
   *  pour que deux unites se fixent jusqu'a la mort de l'une au lieu de
   *  changer d'adversaire a chaque tick. */
  targetId: number | null;
  /** Ordre manuel courant (voir sim/orders.ts). `assault` par defaut. Seules
   *  les unites vivantes du joueur peuvent en recevoir un autre. Aucun
   *  systeme ne le lit encore : il n'a pas d'effet sur le comportement. */
  order: UnitOrder;
  /** Secondes avant la prochaine attaque possible. Descend sous zero pendant
   *  l'approche ; l'attaque part des le premier tick a portee. */
  attackTimer: number;

  /** Secondes restantes de contournement d'obstacle. Tant que positif,
   *  movementSystem se deplace selon (sidestepX, sidestepZ) au lieu de
   *  poursuivre normalement sa cible — pose par combatSystem quand un tir est
   *  bloque par un obstacle. */
  sidestepTimer: number;
  sidestepX: number;
  sidestepZ: number;

  /** Coin d'obstacle vise pour contourner pendant la MARCHE NEUTRE (pas de
   *  cible verrouillee, null = chemin direct) — evitement reactif local,
   *  voir movement.ts findSteeringPoint. Reste fixe tant qu'il n'est pas
   *  atteint et que le chemin direct reste bloque, meme si un autre coin
   *  deviendrait legerement meilleur entre-temps — sans cette memoire,
   *  l'unite hesite entre deux coins d'un tick a l'autre et tremble sur
   *  place au lieu d'avancer. Pour la poursuite d'une cible VERROUILLEE,
   *  voir `path` ci-dessous a la place (pathfinding en grille, 2026-08-10). */
  steerX: number | null;
  steerZ: number | null;

  /** Chemin en cases calcule par pathfinding (sim/pathfinding.ts) — liste de
   *  points MONDE (centres de case), le prochain pas etant toujours
   *  l'element 0. null = pas de chemin en cours. Sert a DEUX usages
   *  distincts qui ne se chevauchent jamais (une entite n'a qu'un seul
   *  targetId a la fois, donc n'est jamais dans les deux etats en meme
   *  temps) :
   *    - poursuite d'une cible VERROUILLEE quand le trajet direct est
   *      bloque (2026-08-10, voir CLAUDE.md "vrai pathfinding" — l'evitement
   *      reactif coin-par-coin butait sur les bosquets denses) ;
   *    - repli de la MARCHE NEUTRE quand l'evitement reactif local ne
   *      progresse plus depuis NEUTRAL_STUCK_CHECK_DURATION (2026-08-16,
   *      voir movement.ts pursueNeutralWithPathfinding — grandes cartes,
   *      murailles dont l'unique ouverture est loin sur le cote). */
  path: { x: number; z: number }[] | null;
  /** Case du but au moment ou `path` a ete calcule — sert a detecter qu'il
   *  faut recalculer. Pour la poursuite, c'est la case de la cible (qui peut
   *  bouger) ; pour le repli de marche neutre, c'est une case FIXE (choisie
   *  une fois au declenchement), donc jamais consideree perimee tant que le
   *  chemin n'est pas epuise. */
  pathGoalTileX: number | null;
  pathGoalTileZ: number | null;

  /** Position de reference et chrono pour detecter un blocage prolonge :
   *  une unite qui essaie d'avancer sans progres significatif depuis
   *  STUCK_DURATION (typiquement des allies qui se genent mutuellement en
   *  visant des cibles differentes). */
  stuckCheckX: number;
  stuckCheckZ: number;
  stuckTimer: number;

  /** Distance de reference a la cible et chrono pour detecter un blocage "en
   *  orbite" : une unite peut tres bien bouger en continu (donc jamais vue
   *  par stuckTimer, qui ne regarde que la position) sans jamais se
   *  rapprocher de sa cible — typiquement deux unites qui contournent le meme
   *  obstacle chacune de son cote, poursuivant chacune une cible elle-meme en
   *  mouvement, et qui finissent par tourner indefiniment en cercle autour de
   *  l'obstacle sans jamais se rattraper. Fenetre volontairement plus longue
   *  que STUCK_DURATION : un detour legitime peut temporairement eloigner de
   *  la cible sur une courte duree sans que ce soit un vrai blocage. */
  orbitCheckDist: number;
  orbitTimer: number;

  /** Manoeuvre de degagement en deux temps (grand pas en arriere puis pas de
   *  cote vers la zone la moins encombree) declenchee par un blocage detecte.
   *  unstickTimer decompte depuis UNSTICK_DURATION ; la premiere moitie du
   *  temps est la phase recul, la seconde la phase cote (unstickSideX/Z,
   *  choisie une fois au declenchement). */
  unstickTimer: number;
  unstickSideX: number;
  unstickSideZ: number;

  /** Copie des stats de base. Plus tard, c'est ici qu'atterriront les stats
   *  calculees par le pipeline base -> talents -> achats -> buffs. */
  stats: UnitStats;

  /** Cooldowns restants par TYPE de capacite (voir data/abilities.ts) —
   *  generique : n'importe quelle unite avec des `abilities` en a une entree
   *  par type possede, jamais un champ special par capacite. 0 ou absent =
   *  prete. */
  abilityCooldowns: Partial<Record<AbilityDef['type'], number>>;
  /** Ruee en cours (Charge...), ou null si aucune. Voir DashState. */
  dash: DashState | null;
  /** Incantation en cours (Boule de feu...), ou null si aucune. Voir
   *  CastState. Le PROJECTILE resultant n'est PAS stocke ici une fois lance
   *  (voir World.blasts) : il doit survivre a la mort de cette entite. */
  cast: CastState | null;

  /** Statut ROOT/MOVEMENT LOCK generique (2026-08-14, Nova de glace — voir
   *  sim/world.ts, applyIceNovaRoot) : secondes RESTANTES avant expiration,
   *  0 = pas immobilise. Decompte dans movementSystem, comme sidestepTimer/
   *  unstickTimer. Gate UNIQUEMENT le mouvement volontaire (marche neutre,
   *  poursuite, degagement, declenchement d'une nouvelle Charge) — jamais le
   *  combat (combatSystem est entierement independant du mouvement) ni les
   *  capacites qui ne demandent aucun deplacement (Boule de feu du Mage) :
   *  une unite rootee peut donc continuer d'attaquer une cible deja a
   *  portee, subir des degats et mourir normalement. Concu explicitement
   *  pour etre generique/reutilisable (pieges, gel, mini-boss, autres
   *  sorts...), pas specifique a la Nova de glace. */
  rootTimer: number;

  /** Bonus de degats AJOUTE au `damage` d'une capacite generique (voir
   *  sim/systems/abilities.ts, AreaBlastAbility/ChargeAbility) au moment de
   *  son declenchement — 0 par defaut, TOUJOURS 0 pour les ennemis (voir
   *  World.spawn). Pipeline "base -> talents -> achats -> buffs" (voir
   *  `stats` ci-dessus) applique aux capacites : la sim ne sait pas D'OU
   *  vient ce nombre (boutique d'amelioration permanente du joueur, voir
   *  run/unitUpgradeEffects.ts, 2026-08-13 — le Mage l'utilise pour sa
   *  Boule de feu), elle l'ajoute juste. */
  abilityDamageBonus: number;

  /** Statut TAUNT (Provocation, Sentinelle — 2026-08-14, voir
   *  data/abilities.ts, TauntAbility) : secondes RESTANTES avant expiration,
   *  0 = pas provoque. `tauntSourceId` = l'id de la Sentinelle qui a le
   *  DERNIER provoque cette unite — un nouveau Taunt REMPLACE toujours
   *  l'ancien ("dernier Taunt valide = priorite actuelle", pas de systeme de
   *  menace). Decompte et applique par targetingSystem, PRIORITAIRE sur le
   *  ciblage normal tant que la source est vivante et le timer > 0 —
   *  n'affecte JAMAIS directement le mouvement (voir rootTimer : une unite
   *  provoquee ET rootee change bien de cible mais reste immobile, les deux
   *  systemes sont independants). Abandonne immediatement (retour au
   *  ciblage normal) si la source meurt. */
  tauntTimer: number;
  tauntSourceId: number | null;

  /** Reserve de bouclier temporaire (Provocation, Sentinelle) — absorbe les
   *  degats AVANT hp, voir sim/damage.ts, applyDamageToEntity. Echelle
   *  INTERNE (x10) comme hp/maxHp. Systeme GENERIQUE, pas exclusif a la
   *  Sentinelle (pourra servir plus tard a un sort de protection, un
   *  Paladin, un objet...). `shieldTimer` : secondes RESTANTES avant
   *  expiration — retombe a 0 (shield remis a 0 avec) meme si tout n'a pas
   *  ete consomme par des degats (voir sim/systems/abilities.ts). Un
   *  NOUVEAU Taunt REMPLACE (jamais n'additionne) le shield existant plutot
   *  que de cumuler plusieurs sources — architecture volontairement simple
   *  pour cette V1 (cooldown 12s > duree 10s, aucun chevauchement reel en
   *  pratique). */
  shield: number;
  shieldTimer: number;

  /** Bonus AJOUTE au bouclier gagne PAR ENNEMI PROVOQUE (voir
   *  TauntAbility.baseShieldPerTarget) — meme pipeline "base -> talents ->
   *  achats -> buffs" que abilityDamageBonus ci-dessus, TOUJOURS 0 pour un
   *  ennemi (voir World.spawn). Echelle interne (x10). */
  tauntShieldBonus: number;

  /** Reference de progres pour le repli pathfinding de la MARCHE NEUTRE
   *  (2026-08-16, voir movement.ts pursueNeutralWithPathfinding) : position Z
   *  au debut de la fenetre de mesure courante, et chrono associe. Non
   *  utilise du tout tant qu'une cible est verrouillee ou qu'un chemin de
   *  repli est deja actif (voir `path` ci-dessus) — reinitialise a chaque
   *  fois qu'un progres suffisant est constate, comme orbitCheckDist/orbitTimer. */
  neutralProgressZ: number;
  neutralStuckTimer: number;

  /** Vrai pour un BATIMENT gameplay (Mine, Baliste — 2026-08-16, voir
   *  data/buildings.ts, World.spawnBuilding), jamais pour une unite. Capacite
   *  GENERIQUE et explicite plutot que des verifications eparpillees
   *  ("if entity.isBuilding then velocity=0" dans movementSystem, etc.) :
   *  un seul filtre au sommet de movementSystem (marche neutre, poursuite,
   *  separation, collision, confinement au plateau — un batiment ne
   *  participe a AUCUNE de ces etapes) suffit a rendre un batiment
   *  entierement immobile, sans toucher targetingSystem/combatSystem/
   *  deathSystem qui restent, eux, entierement generiques (un batiment est
   *  cible et endommage exactement comme une unite). */
  isBuilding: boolean;
  /** Compte comme un combattant dont la survie maintient sa faction "en vie"
   *  pour la condition de victoire/defaite (voir World.countCombatants,
   *  run/runState.ts applyBattleOutcome) — TOUJOURS vrai pour une unite
   *  normale (voir World.spawn), configurable par BuildingDef pour un
   *  batiment (voir data/buildings.ts). Remplace tout `if (unitId ===
   *  'mine')` disperse par une propriete generique lue une seule fois. */
  countsForDefeat: boolean;
  /** L'obstacle de collision injecte dans World.obstacles pour CE batiment
   *  (voir World.spawnBuilding) — `null` pour toute unite normale ou tout
   *  batiment sans footprint. 2026-08-16, bug remonte par Antoine : "les
   *  unites adverses n'arrivent pas a attaquer les batiments du joueur" —
   *  un batiment avec footprint bloque sa PROPRE ligne de tir vers
   *  lui-meme (le segment attaquant->cible se termine au CENTRE de la
   *  cible, qui se trouve toujours a l'interieur de son propre rectangle de
   *  collision), donc findBlockingObstacle(..., obstacles) le trouvait
   *  TOUJOURS "bloque" — jamais un vrai hit, seulement des tentatives
   *  'blocked' en boucle. Reference PARTAGEE avec l'entree poussee dans
   *  World.obstacles (meme objet, jamais une copie) pour permettre aux 3
   *  appelants de findBlockingObstacle (combatSystem, la poursuite en
   *  pathfinding, la trajectoire de Charge) d'exclure explicitement CETTE
   *  entree precise par egalite de reference lors d'un tir/une poursuite
   *  VERS ce batiment. */
  footprintObstacle: ObstacleDef | null;

  /** Production automatique d'unites (2026-08-17, Caserne — voir
   *  data/buildings.ts, BuildingDef.spawner, sim/systems/barracksSystem.ts) —
   *  GENERIQUE, jamais reserve a un Fantassin precis : `null` pour toute
   *  entite qui ne produit rien (unites normales, Mine, Baliste). Secondes
   *  restantes avant la PROCHAINE tentative de production ; decompte par
   *  barracksSystem, jamais par Date.now()/setTimeout (temps de SIMULATION
   *  uniquement, voir World.step). Reste a 0 (jamais negatif) tant qu'aucune
   *  case libre n'est trouvee autour du batiment — "le Fantassin est deja
   *  pret", retente chaque tick suivant SANS reinitialiser a l'intervalle
   *  complet (voir barracksSystem). */
  spawnTimer: number | null;
  /** Intervalle EFFECTIF (secondes) auquel `spawnTimer` est reinitialise
   *  apres CHAQUE production reussie — fige au moment du spawn du batiment
   *  (World.spawnBuilding), reflete deja le niveau d'amelioration permanente
   *  a cet instant (voir run/barracksUpgradeEffects.ts) : ne change plus en
   *  cours de bataille, meme convention que le reste des ameliorations
   *  permanentes (achetables uniquement entre les runs, jamais en cours). */
  spawnIntervalSeconds: number | null;
  /** Id de l'unite produite (voir data/units.ts) — generique (pas hardcode
   *  "fantassin" dans le systeme sim, voir data/buildings.ts,
   *  SpawnerBuildingConfig.unitId) : une future Ecurie pourra produire des
   *  Cavaliers sans toucher a sim/systems/barracksSystem.ts. */
  spawnUnitId: string | null;
  /** Nombre d'unites produites PAR PRODUCTION REUSSIE (2026-08-17, refonte
   *  de l'amelioration permanente de la Caserne — voir
   *  run/barracksUpgradeEffects.ts, effectiveBarracksSpawnCount) — fige au
   *  moment du spawn du batiment (World.spawnBuilding), meme convention que
   *  spawnIntervalSeconds. `null` pour toute entite qui ne produit rien. */
  spawnCount: number | null;
}

/** Direction d'avance : le joueur part du bas (+z) et monte vers -z. */
export function forwardDir(team: Team): number {
  return team === 'player' ? -1 : 1;
}
