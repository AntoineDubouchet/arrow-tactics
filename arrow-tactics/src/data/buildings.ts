import { HP_PER_PIP } from '../config/constants';
import type { ResourceKind } from '../config/resourceNodes';
import type { CargoResource, HarvestTool } from './resources';

/**
 * Architecture générique BUILDING (2026-08-16, demande d'Antoine) — un
 * bâtiment GAMEPLAY (Mine, Baliste) est une Entity comme une unité (voir
 * sim/entity.ts, Entity.isBuilding) mais configurée depuis CE fichier plutôt
 * que data/units.ts : il n'a ni déplacement, ni portée d'attaque, ni ciblage
 * propre — seulement des PV, un rayon (reach de l'attaque adverse), et deux
 * drapeaux qui pilotent son rôle dans la partie.
 *
 * Distinct des bâtiments DÉCORATIFS KayKit (voir editor/editorUI.ts,
 * DECOR_CATALOG, catégorie « Structures décoratives ») : ceux-là restent de purs `ObstacleDef`
 * (kind:'building') posés dans l'éditeur — jamais spawnés comme Entity,
 * jamais dans ce fichier. La distinction "gameplay vs décoratif" n'est donc
 * pas un champ à cocher sur un objet générique : c'est simplement le fait
 * qu'un bâtiment gameplay est réellement instancié via World.spawnBuilding,
 * un décor KayKit ne l'est jamais.
 */
/**
 * Batiment de production d'unites (Caserne -> Piquier, puis Fantassin au
 * Niv. 2 ; Camp d'archerie -> Archer), GENERIQUE : il en produit gratuitement un lot UNE FOIS PAR MANCHE,
 * au debut de la bataille (sim/systems/buildingProduction.ts).
 */
export interface UnitProductionConfig {
  /** Unites produites par manche, dans l'ordre, par niveau interne du
   *  batiment (index 0 = Niv. 1 ; voir aussi BuildingDef.maxUpgradeLevel).
   *  Les unites produites recoivent le niveau de production courant de leur
   *  type au moment de leur apparition (main.ts). */
  unitsByLevel: readonly (readonly string[])[];
}

/**
 * Recrutement debloque par un batiment (Caserne -> Piquier, puis Fantassin au
 * Niv. 2 ; Camp d'archerie -> Archer ; Eglise -> Mage, Oracle et Vengeur) : sans au moins un exemplaire
 * possede, l'unite ne se recrute pas en boutique (run/recruitment.ts). Les
 * unites deja possedees, dont l'armee de depart, ne sont jamais concernees.
 */
export interface RecruitmentUnlockConfig {
  /** Unites debloquees (une ou plusieurs : l'Eglise debloque Mage, Oracle et Vengeur). */
  unitIds: readonly string[];
  /** Niveau interne minimal du batiment pour certaines de ces unites (0 =
   *  Niv. 1, defaut) : la Caserne Niv. 2 debloque le Fantassin (PROVISOIRE). */
  minLevels?: Readonly<Record<string, number>>;
  /** Raison affichee quand ce batiment manque pour recruter l'unite. */
  missingBuildingHint: string;
}

/** Attaque automatique d'un batiment defensif (Tour) — voir
 *  sim/systems/buildingAttack.ts. Valeurs de NIVEAU 1 ; le gain par niveau
 *  propre au batiment s'ajoute (run/buildingUpgradeEffects.ts). */
export interface BuildingAttackConfig {
  /** Degats par fleche, echelle INTERNE (x10, comme UnitStats.damage). */
  damage: number;
  /** Degats ajoutes par niveau d'amelioration du batiment, echelle interne. */
  damagePerLevel: number;
  /** Portee (cases), meme convention que UnitStats.attackRange : a portee si
   *  distance <= portee + rayon de la cible. */
  rangeTiles: number;
  /** Temps entre deux tirs (secondes de simulation). */
  cooldownSeconds: number;
  /** Vitesse de la fleche (cases/s) : duree de vol = distance / vitesse. */
  projectileSpeed: number;
  /** Point de depart VISUEL de la fleche, jamais lu par la simulation :
   *  hauteur (monde) sous l'avant-toit du modele, et decalage horizontal
   *  depuis le centre du batiment vers la cible (bord du fut), pour qu'elle
   *  ne sorte ni du sol, ni du centre, ni du toit. */
  launchHeight: number;
  launchOutset: number;
}

/** Soin de l'armee contre de l'or (Eglise) — voir run/churchHeal.ts.
 *  Efficacite en PV AFFICHES (points) rendus par piece d'or. */
export interface ArmyHealConfig {
  /** PV rendus par or au niveau 1. */
  hpPerGold: number;
  /** PV par or ajoutes a chaque niveau d'amelioration du batiment. */
  hpPerGoldPerLevel: number;
}

export interface BuildingDef {
  id: string;
  displayName: string;
  /** PV max, échelle INTERNE (x10, comme UnitStats.maxHp). */
  maxHp: number;
  /** Rayon du corps — même rôle que UnitStats.radius : reach de l'attaque
   *  adverse (dist <= attackRange + target.stats.radius) et séparation. */
  radius: number;
  /** Peut être visé et endommagé par le combat automatique. Actuellement
   *  toujours vrai pour les 3 bâtiments gameplay existants (Mine, Baliste,
   *  Caserne) — champ conservé pour un futur bâtiment gameplay non ciblable
   *  plutôt que consommé activement par targetingSystem aujourd'hui (voir
   *  World.spawnBuilding, qui refuse de spawner une Entity si
   *  targetable=false : un bâtiment non ciblable qui reste une pure
   *  décoration collidante n'a jamais besoin d'exister comme Entity, il
   *  reste un simple ObstacleDef). */
  targetable: boolean;
  /** Compte comme un combattant dont la survie maintient sa faction "en vie"
   *  pour la condition de victoire/défaite (voir World.countCombatants,
   *  run/runState.ts applyBattleOutcome) — remplace tout `if (mine...)`/
   *  `if (ballista...)` disséminé par une propriété générique lue une seule
   *  fois. */
  countsForDefeat: boolean;
  /** Hauteur monde d'ancrage de la barre de PV — même rôle que
   *  UnitVisual.hpBarHeight. */
  hpBarHeight: number;
  /** Coût Gold en boutique de RUN (2026-08-17, chantier "bâtiments
   *  achetables") — ABSENT = jamais proposé à l'achat (la Baliste : toujours
   *  présente, jamais recrutée). SOURCE UNIQUE du prix, lue à la fois par
   *  l'affichage (ui/screens.ts) et la transaction réelle (main.ts). */
  cost?: number;
  /** Cout en BOIS / PIERRE (2026-11-01, direction Hero RTS), en plus de
   *  l'or. PROVISOIRE. Absent = aucun. */
  resourceCost?: Partial<Record<ResourceKind, number>>;
  /** Duree de construction (s) d'un chantier par le Heros (sim/systems/hero.ts).
   *  PROVISOIRE. Absent = DEFAULT_BUILD_TIME. */
  buildTime?: number;
  /** Clé du modèle KayKit (voir render/assetLibrary.ts, EnvironmentAssets.buildingsByName)
   *  — TOUJOURS teinté bleu (`blue_...`) : seul le camp JOUEUR peut acheter
   *  un bâtiment via ce système pour l'instant, même convention déjà établie
   *  pour la Mine avant cette refonte (jamais de bâtiment ennemi équivalent
   *  aujourd'hui). Requis si `cost` est présent. */
  buildingModel?: string;
  /** Empreinte de collision/placement — requis si `cost` est présent (voir
   *  main.ts, canPlaceBuildingAt/onValidatePlacement). */
  footprintTilesX?: number;
  footprintTilesZ?: number;
  /** Production d'unites une fois par manche — voir UnitProductionConfig.
   *  Absent pour les autres. */
  production?: UnitProductionConfig;
  /** Recrutement debloque — voir RecruitmentUnlockConfig. */
  recruitmentUnlock?: RecruitmentUnlockConfig;
  /** Population maximale ajoutee tant que le batiment existe (Maison, voir
   *  data/population.ts). Absent = aucun effet sur la population. */
  populationBonus?: number;
  /** Prix de base de l'amelioration PROPRE a chaque exemplaire (niveau 0 -> 1),
   *  double a chaque niveau (run/buildingUpgrades.ts). Absent = batiment non
   *  ameliorable depuis sa fiche. */
  upgradeGoldCostBase?: number;
  /** Niveau INTERNE maximal de cette amelioration (1 = Niv. 2 au plus).
   *  Absent = sans limite. */
  maxUpgradeLevel?: number;
  /** PV max ajoutes par niveau d'amelioration, echelle interne. Absent = 0. */
  hpPerLevel?: number;
  /** Attaque automatique (Tour). Absent = batiment passif. */
  attack?: BuildingAttackConfig;
  /** Soin de toute l'armee contre de l'or, en preparation (Eglise). */
  armyHeal?: ArmyHealConfig;
  /** Point de collecte (2026-11-03) : ressources de cargo acceptees par ce
   *  batiment TERMINE et allie (Heros et Villageois y vident leur sac, seul
   *  chemin vers le stock ; sim/systems/cargo.ts, nearestDropOff). Baliste :
   *  tout (point universel de depart) ; Scierie : bois ; Camp de mineur :
   *  pierre et or extrait. Aucune logique par id de batiment : seule cette
   *  liste compte. Absent : pas un point de collecte (Forge). */
  dropOff?: readonly CargoResource[];
  /** Outils de recolte donnes a tout le camp par ce batiment, une fois
   *  TERMINE, en plus des outils de depart (hache, pioche). Lu par
   *  run/harvestPermissions.ts. Aujourd'hui : la Forge (pioche de
   *  prospecteur, gisements d'or). */
  unlocksTools?: readonly HarvestTool[];
  /** Description courte du menu Construire. Absent : aucune. */
  description?: string;
  /** Facteur de taille VISUELLE du modele par rapport a son emprise (voir
   *  ObstacleDef.scale) ; l'emprise de collision et de placement ne change
   *  pas. Absent = 1. */
  modelScale?: number;
  /** Faux : l'emprise bloque le deplacement mais pas les tirs (piece de
   *  mur, voir ObstacleDef.blocksShots). Absent = bloque aussi les tirs. */
  blocksShots?: boolean;
  /** Piece d'un mur V2 (data/walls.ts, famille `wallType`) : segment ou
   *  porte. Emprise geometrique (ObstacleDef.line), jamais une grille ;
   *  posee par une ligne A -> B (core/wallLine.ts), jamais a l'unite ni
   *  achetee en boutique. Absent : batiment ordinaire. */
  wallPiece?: { wallType: string; role: 'segment' | 'gate' };
  /** Groupe du catalogue de l'editeur (« Murs »...). Absent :
   *  « Bâtiments ». */
  editorGroup?: string;
  /** Variantes VISUELLES alternees a la pose (Maison : A puis B, 2026-11-03) :
   *  le n-ieme exemplaire pose pendant la run prend
   *  `modelVariants[(n - 1) % longueur]` (OwnedBuilding.modelVariant), jamais
   *  au hasard. Meme batiment de jeu (cout, PV, population, emprise).
   *  Absent : toujours `buildingModel`. */
  modelVariants?: readonly string[];
  /** Ameliorations de run accessibles depuis la fiche de ce batiment
   *  (run/runUpgrades.ts, RunUpgradeSite) : la Forge (unites, Baliste) ou
   *  le Sanctuaire (parchemins, 2026-11-03). Absent : aucune. */
  runUpgradeSite?: 'forge' | 'shrine';
}

export const BUILDINGS: Record<string, BuildingDef> = {
  /** Baril (2026-11-02) : objet NEUTRE destructible, pas une unite ni un
   *  batiment du joueur. Jamais achete (pas de cout), jamais cible
   *  automatiquement : seulement sur ordre d'attaque. Peu de PV (le Paladin
   *  le casse en deux coups) ; butin : data/loot.ts, DESTRUCTIBLE_LOOT.
   *  Une case bloquante. Valeurs PROVISOIRES. */
  barrel: {
    id: 'barrel',
    displayName: 'Baril',
    maxHp: 4 * HP_PER_PIP,
    radius: 0.4,
    targetable: true,
    countsForDefeat: false,
    hpBarHeight: 0.9,
    footprintTilesX: 1,
    footprintTilesZ: 1,
  },
  // "15 HP" (Antoine) -> 150 interne, échelle x10 vérifiée comme partout
  // ailleurs (voir CLAUDE.md, "Échelle des nombres").
  mine: {
    id: 'mine',
    displayName: 'Mine',
    maxHp: 15 * HP_PER_PIP,
    // Comparable au footprint 3x3 de son ObstacleDef (voir
    // ownedBuildingObstacle, main.ts) sans être identique — juste le
    // reach d'attaque adverse, pas la hitbox de collision physique (gérée
    // séparément par l'obstacle). Valeur choisie par Claude, non donnée par
    // Antoine. 1,5 depuis l'emprise 3 x 3 (2026-11-02).
    radius: 1.5,
    targetable: true,
    countsForDefeat: true,
    hpBarHeight: 1.6,
    // Prix de base en Or (20 ; 100 avant la refonte economique autour de
    // la Forge). Remplace l'ancienne acquisition automatique
    // via le talent "Le temps, c'est de l'argent" (retiré, voir
    // data/talents.ts).
    cost: 20,
    resourceCost: { wood: 5 },
    buildTime: 6,
    buildingModel: 'blue_mine',
    // 3 x 3 cases (2026-11-02, demande d'Antoine : la Mine paraissait trop
    // petite) ; le modele suit l'emprise (cloneScaledToFootprint).
    footprintTilesX: 3,
    footprintTilesZ: 3,
    upgradeGoldCostBase: 25,
  },
  // "25 HP" (Antoine) -> 250 interne.
  ballista: {
    id: 'ballista',
    displayName: 'Baliste',
    // Coeur du camp initial : point de collecte UNIVERSEL de depart
    // (2026-11-03) ; accepte bois, pierre et or extrait (jamais le butin
    // RPG). La Scierie et le Camp de mineur s'y ajoutent sans le remplacer
    // (a decider plus tard si elle garde ce role).
    dropOff: ['wood', 'stone', 'minedGold'],
    maxHp: 25 * HP_PER_PIP,
    // Légèrement plus grand que la Mine — la baliste+tour est visuellement
    // plus imposante (voir render/ballista.ts, BALLISTA_TOWER_FOOTPRINT =
    // 2.4). Valeur choisie par Claude, non donnée par Antoine.
    radius: 1.2,
    targetable: true,
    countsForDefeat: true,
    hpBarHeight: 2.2,
    // Pas de `cost` : jamais achetable/replaçable, toujours présente une
    // fois pour toutes (voir main.ts, onValidatePlacement) — inchangé par ce
    // chantier.
  },
  // Caserne : debloque le recrutement des Fantassins et en produit
  // gratuitement 1 par manche (2 au Niv. 2), au debut de la bataille (voir
  // UnitProductionConfig). PV V1 choisis par Claude
  // (fourchette "20 à 30 HP" donnée par Antoine, "plus résistante qu'une
  // petite unité mais moins tanky qu'une Sentinelle très améliorée") : 25 HP,
  // à mi-chemin de la fourchette — ISOLÉE ici pour rééquilibrage ultérieur,
  // JAMAIS liée au fonctionnement de la production (voir CLAUDE.md, point 22
  // de la demande).
  barracks: {
    id: 'barracks',
    displayName: 'Caserne',
    maxHp: 25 * HP_PER_PIP,
    // Empreinte 3x3 (demande d'Antoine) : rayon d'atteinte et hauteur de
    // barre agrandis dans la meme proportion que le modele (x1,5, ajuste a
    // l'empreinte par cloneScaledToFootprint). Ancien 2x2 : 1.1 / 1.8.
    radius: 1.6,
    targetable: true,
    countsForDefeat: true,
    hpBarHeight: 2.7,
    cost: 15,
    resourceCost: { wood: 10 },
    buildTime: 8,
    buildingModel: 'blue_barracks',
    footprintTilesX: 3,
    footprintTilesZ: 3,
    // Une seule amelioration : Niv. 1 -> Niv. 2 pour 20 or.
    upgradeGoldCostBase: 20,
    maxUpgradeLevel: 1,
    // Piquier = recrue de base, Fantassin a la Caserne Niv. 2 (decision
    // d'Antoine, 2026-11-01) ; production : Niv. 1 un Piquier, Niv. 2 un
    // Piquier et un Fantassin.
    production: { unitsByLevel: [['piquier'], ['piquier', 'fantassin']] },
    recruitmentUnlock: { unitIds: ['piquier', 'fantassin'], minLevels: { fantassin: 1 }, missingBuildingHint: 'Nécessite une Caserne' },
  },
  // Camp d'archerie : meme role que la Caserne pour les Archers (memes PV,
  // emprise, prix et amelioration). Modele KayKit `blue_archeryrange`
  // (« Champ de tir à l'arc » de l'editeur), ajuste a l'emprise 3 × 3
  // (3,22 de haut, comme la Caserne).
  archery: {
    id: 'archery',
    displayName: 'Camp d’archerie',
    maxHp: 25 * HP_PER_PIP,
    radius: 1.6,
    targetable: true,
    countsForDefeat: true,
    hpBarHeight: 2.7,
    cost: 15,
    resourceCost: { wood: 8 },
    buildTime: 8,
    buildingModel: 'blue_archeryrange',
    footprintTilesX: 3,
    footprintTilesZ: 3,
    upgradeGoldCostBase: 20,
    maxUpgradeLevel: 1,
    production: { unitsByLevel: [['archer'], ['archer', 'archer']] },
    recruitmentUnlock: { unitIds: ['archer'], missingBuildingHint: 'Nécessite un Camp d’archerie' },
  },
  // Forge (refonte economique) — batiment allie achetable, sans production,
  // revenu ni effet passif pour l'instant : ciblable, destructible et
  // collidable comme la Mine. Plusieurs exemplaires possibles.
  forge: {
    id: 'forge',
    displayName: 'Forge',
    maxHp: 15 * HP_PER_PIP,
    // Modele (KayKit blacksmith) plus bas et plus compact que la Caserne :
    // meme rayon que la Mine.
    radius: 1.0,
    targetable: true,
    countsForDefeat: true,
    // Modele d'environ 1,5 de haut une fois ajuste a l'empreinte 2x2 :
    // barre juste au-dessus du toit, comme la Mine.
    hpBarHeight: 1.7,
    cost: 10,
    resourceCost: { wood: 5, stone: 5 },
    buildTime: 8,
    buildingModel: 'blue_blacksmith',
    footprintTilesX: 2,
    footprintTilesZ: 2,
    // 2026-11-02 : la premiere Forge terminee donnait la hache et la pioche ;
    // depuis le 2026-11-04, bois et pierre sont libres des le depart, la
    // Forge ne donne plus que la pioche de prospecteur (gisements d'or).
    unlocksTools: ['goldPickaxe'],
    description: 'Outils : pioche de prospecteur (gisements d’or)',
  },
  // Maison : +2 de population maximale tant qu'elle existe (voir
  // data/population.ts). Cout et PV PROVISOIRES, non encore fixes par le
  // design : a reequilibrer.
  house: {
    id: 'house',
    displayName: 'Maison',
    maxHp: 10 * HP_PER_PIP,
    // Emprise 2 × 2 (1 × 1 a l'origine, trop petite) : rayon aligne sur les
    // autres batiments 2 × 2 (Mine, Forge). Modele affiche a 0,8 de son
    // emprise (1,74 de haut au lieu de 2,18 : il paraissait trop gros), barre
    // de PV juste au-dessus du toit ; l'emprise reste 2 × 2.
    radius: 1.0,
    targetable: true,
    countsForDefeat: true,
    hpBarHeight: 2.1,
    cost: 5,
    resourceCost: { wood: 6 },
    buildTime: 5,
    buildingModel: 'blue_home_A',
    // 2026-11-03 (demande d'Antoine) : 1re Maison A, 2e B, 3e A...
    modelVariants: ['blue_home_A', 'blue_home_B'],
    footprintTilesX: 2,
    footprintTilesZ: 2,
    modelScale: 0.8,
    populationBonus: 2,
  },
  // Tour defensive : tire automatiquement des fleches sur l'unite ennemie la
  // plus proche a portee (sim/systems/buildingAttack.ts). Valeurs de
  // PLAYTEST, a reequilibrer :
  //  - portee 12 (8 a l'origine, +50 %) : defense de moyenne portee, au-dela
  //    des Archers (6) mais en deca de la Baliste (18, PLAYER_ARROW_RANGE) ;
  //  - 1 tir / 2,5 s : plus lent qu'un Archer (2,0 s) et que la Baliste
  //    (2,31 s), compense par des degats eleves (4, contre 1,2 et 2) ;
  //  - fleche a 18 cases/s : ~0,7 s de vol a portee max.
  tower: {
    id: 'tower',
    displayName: 'Tour',
    maxHp: 15 * HP_PER_PIP,
    radius: 1.0,
    targetable: true,
    countsForDefeat: true,
    hpBarHeight: 3.4,
    cost: 20,
    resourceCost: { wood: 5, stone: 10 },
    buildTime: 10,
    buildingModel: 'blue_tower_A',
    footprintTilesX: 2,
    footprintTilesZ: 2,
    // Ajuste a l'emprise 2 × 2, le modele ferait 3,8 de haut, plus haut que
    // la Caserne (3,14) et la tour de la Baliste (3,24) : ramene a ~3,0.
    modelScale: 0.8,
    upgradeGoldCostBase: 5,
    hpPerLevel: 5 * HP_PER_PIP,
    attack: {
      damage: 4 * HP_PER_PIP,
      damagePerLevel: 2 * HP_PER_PIP,
      rangeTiles: 12,
      cooldownSeconds: 2.5,
      projectileSpeed: 18,
      // Modele a l'echelle 0,8 : fut jusqu'a ~2,3, avant-toit vers 2,4-2,5,
      // pointe du toit vers 3,0 ; fut d'environ 1,2 de large.
      launchHeight: 2.15,
      launchOutset: 0.65,
    },
  },
  // Eglise : soigne toutes les unites du joueur contre de l'or (run/churchHeal.ts)
  // et produit l'Oracle et le Vengeur. Le Mage et les parchemins sont au
  // Sanctuaire depuis le 2026-11-03. Batiment plus tardif (35 or). Valeurs
  // PROVISOIRES.
  church: {
    id: 'church',
    displayName: 'Église',
    maxHp: 15 * HP_PER_PIP,
    radius: 1.0,
    targetable: true,
    countsForDefeat: true,
    // Modele ajuste a l'emprise 2 × 2 : 2,85 de haut (clocher), sous la
    // Caserne (3,14) ; barre juste au-dessus.
    hpBarHeight: 3.2,
    cost: 35,
    resourceCost: { wood: 10, stone: 10 },
    buildTime: 12,
    buildingModel: 'blue_church',
    footprintTilesX: 2,
    footprintTilesZ: 2,
    upgradeGoldCostBase: 5,
    hpPerLevel: 5 * HP_PER_PIP,
    armyHeal: { hpPerGold: 5, hpPerGoldPerLevel: 2 },
    recruitmentUnlock: { unitIds: ['oracle', 'vengeur'], missingBuildingHint: 'Nécessite une Église' },
  },
  // Sanctuaire (2026-11-03) : batiment de magie, producteur standard (file,
  // point de ralliement, amelioration par la file) ; produit le Mage et
  // donne acces aux parchemins (ameliorations de run, run/runUpgrades.ts).
  // Modele KayKit `blue_shrine`. Valeurs PROVISOIRES.
  shrine: {
    id: 'shrine',
    displayName: 'Sanctuaire',
    maxHp: 20 * HP_PER_PIP,
    radius: 1.0,
    targetable: true,
    countsForDefeat: true,
    hpBarHeight: 2.6,
    cost: 25,
    resourceCost: { wood: 8, stone: 8 },
    buildTime: 10,
    buildingModel: 'blue_shrine',
    footprintTilesX: 2,
    footprintTilesZ: 2,
    upgradeGoldCostBase: 15,
    maxUpgradeLevel: 1,
    hpPerLevel: 5 * HP_PER_PIP,
    recruitmentUnlock: { unitIds: ['mage'], missingBuildingHint: 'Nécessite un Sanctuaire' },
    runUpgradeSite: 'shrine',
    description: 'Produit le Mage ; parchemins',
  },
  // Auberge (2026-11-03) : producteur standard du Villageois, premiere unite
  // economique. Modele `blue_tavern` (taverne du pack). Valeurs PROVISOIRES.
  tavern: {
    id: 'tavern',
    displayName: 'Auberge',
    maxHp: 20 * HP_PER_PIP,
    radius: 1.0,
    targetable: true,
    countsForDefeat: true,
    hpBarHeight: 2.6,
    cost: 15,
    resourceCost: { wood: 8 },
    buildTime: 8,
    buildingModel: 'blue_tavern',
    footprintTilesX: 2,
    footprintTilesZ: 2,
    recruitmentUnlock: { unitIds: ['villageois'], missingBuildingHint: 'Nécessite une Auberge' },
    description: 'Produit le Villageois (récolte)',
  },
  // Ecurie (2026-11-03) : producteur standard (comme la Caserne) du Cavalier
  // leger (unite existante `cavalier`). Amelioration Niv. 2 par la file
  // (PV du batiment), surtout pour eprouver unite -> amelioration -> unite.
  // Modele KayKit `blue_stables` (2 x 3 dans l'editeur, ajuste a l'emprise
  // 3 x 3 des producteurs). Valeurs PROVISOIRES.
  stables: {
    id: 'stables',
    displayName: 'Écurie',
    maxHp: 25 * HP_PER_PIP,
    radius: 1.6,
    targetable: true,
    countsForDefeat: true,
    hpBarHeight: 2.6,
    cost: 20,
    resourceCost: { wood: 12 },
    buildTime: 10,
    buildingModel: 'blue_stables',
    footprintTilesX: 3,
    footprintTilesZ: 3,
    upgradeGoldCostBase: 20,
    maxUpgradeLevel: 1,
    hpPerLevel: 5 * HP_PER_PIP,
    recruitmentUnlock: { unitIds: ['cavalier'], missingBuildingHint: 'Nécessite une Écurie' },
    description: 'Produit le Cavalier léger',
  },
  // Scierie (2026-11-02) : ne controle plus la recolte (la Forge donne les
  // outils) ; point de collecte du BOIS depuis le 2026-11-03 (jamais la
  // pierre ni l'or). Emprise 3 x 3, modele KayKit de scierie. Valeurs
  // PROVISOIRES.
  sawmill: {
    id: 'sawmill',
    displayName: 'Scierie',
    dropOff: ['wood'],
    maxHp: 15 * HP_PER_PIP,
    radius: 1.5,
    targetable: true,
    countsForDefeat: true,
    hpBarHeight: 2.4,
    cost: 10,
    resourceCost: { wood: 8 },
    buildTime: 8,
    buildingModel: 'blue_lumbermill',
    footprintTilesX: 3,
    footprintTilesZ: 3,
  },
  // Camp de mineur (2026-11-02) : ne controle plus la recolte (la Forge donne
  // la pioche) ; point de collecte de la PIERRE et de l'OR EXTRAIT depuis le
  // 2026-11-03 (jamais le bois). Distinct de la Mine (or toutes les 60 s).
  // Valeurs PROVISOIRES.
  miner_camp: {
    id: 'miner_camp',
    displayName: 'Camp de mineur',
    dropOff: ['stone', 'minedGold'],
    maxHp: 15 * HP_PER_PIP,
    radius: 1.5,
    targetable: true,
    countsForDefeat: true,
    hpBarHeight: 2.4,
    cost: 10,
    resourceCost: { wood: 6, stone: 4 },
    buildTime: 8,
    buildingModel: 'blue_workshop',
    footprintTilesX: 3,
    footprintTilesZ: 3,
  },
  // Palissade V2 (2026-11-02) : pieces d'une ligne de palissade en bois
  // (data/walls.ts, famille 'palisade'). PV, cout et duree par LONGUEUR
  // (WALL_TYPES) : maxHp n'est que la valeur d'un segment nominal (fiche,
  // repli). Bloquent tout le monde, les tirs passent (blocksShots). Ne
  // comptent pas pour la defaite. Valeurs PROVISOIRES.
  palisade: {
    id: 'palisade',
    displayName: 'Palissade',
    maxHp: 30 * HP_PER_PIP,
    // Portee : mesuree jusqu'a la ligne du segment (sim/geometry.ts,
    // targetDistance), pas jusqu'a son centre.
    radius: 0.25,
    targetable: true,
    countsForDefeat: false,
    hpBarHeight: 1.4,
    blocksShots: false,
    wallPiece: { wallType: 'palisade', role: 'segment' },
    editorGroup: 'Murs',
  },
  palisade_gate: {
    id: 'palisade_gate',
    displayName: 'Porte de palissade',
    maxHp: 40 * HP_PER_PIP,
    radius: 0.25,
    targetable: true,
    countsForDefeat: false,
    hpBarHeight: 1.7,
    blocksShots: false,
    wallPiece: { wallType: 'palisade', role: 'gate' },
    editorGroup: 'Murs',
  },
};

/** Emprise (cases) du batiment `buildingId` : celle de ses donnees, quelle
 *  que soit sa rotation (rotation purement visuelle, par pas de 45°). */
export function buildingFootprintTiles(buildingId: string): { tilesX: number; tilesZ: number } {
  const def = getBuilding(buildingId);
  return { tilesX: def.footprintTilesX ?? 1, tilesZ: def.footprintTilesZ ?? 1 };
}

/** Pas de rotation d'un batiment en placement (rotation visuelle). */
export const BUILDING_ROTATION_STEP = Math.PI / 4;

/** Duree de construction d'un chantier sans BuildingDef.buildTime. */
export const DEFAULT_BUILD_TIME = 1.2;

/** Duree de construction (s) d'un chantier de `buildingId`. */
export function buildTimeOf(buildingId: string): number {
  return getBuilding(buildingId).buildTime ?? DEFAULT_BUILD_TIME;
}

/** Ids de bâtiments réellement ACHETABLES en boutique de run (2026-08-17) —
 *  filtre générique sur `cost !== undefined`, jamais une liste recopiée à la
 *  main (voir ui/screens.ts, l'onglet "Bâtiments") : un futur bâtiment avec
 *  un `cost` défini y apparaît automatiquement. */
export function listBuyableBuildingIds(): string[] {
  return Object.values(BUILDINGS)
    .filter((def) => def.cost !== undefined)
    .map((def) => def.id);
}

export function getBuilding(id: string): BuildingDef {
  const def = BUILDINGS[id];
  if (!def) throw new Error(`Bâtiment inconnu : ${id}`);
  return def;
}

/** Batiment requis pour recruter `unitId` (voir RecruitmentUnlockConfig),
 *  ou null si l'unite n'en exige aucun (Sentinelle). */
export function recruitmentBuildingFor(unitId: string): BuildingDef | null {
  return Object.values(BUILDINGS).find((def) => def.recruitmentUnlock?.unitIds.includes(unitId)) ?? null;
}

/** Unites produites par manche, dans l'ordre, par le batiment `buildingId` a
 *  son niveau interne `level` (borne au dernier niveau defini), aucune sans
 *  production. */
export function unitsProducedPerWave(buildingId: string, level: number): readonly string[] {
  const byLevel = BUILDINGS[buildingId]?.production?.unitsByLevel;
  if (!byLevel || byLevel.length === 0) return [];
  return byLevel[Math.min(Math.max(level, 0), byLevel.length - 1)]!;
}
