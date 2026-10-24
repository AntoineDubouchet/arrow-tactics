import { HP_PER_PIP } from '../config/constants';

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
 * Batiment de production d'unites (Caserne -> Fantassin, Camp d'archerie ->
 * Archer), GENERIQUE : il en produit gratuitement un lot UNE FOIS PAR MANCHE,
 * au debut de la bataille (sim/systems/buildingProduction.ts).
 */
export interface UnitProductionConfig {
  /** Unite produite (data/units.ts). Les unites produites recoivent le
   *  niveau de production courant de leur type au moment de leur apparition
   *  (main.ts). */
  unitId: string;
  /** Unites produites par manche, par niveau interne du batiment (index 0 =
   *  Niv. 1). Voir aussi BuildingDef.maxUpgradeLevel. */
  unitsPerWaveByLevel: number[];
}

/**
 * Recrutement debloque par un batiment (Caserne -> Fantassin, Camp
 * d'archerie -> Archer, Eglise -> Mage) : sans au moins un exemplaire
 * possede, l'unite ne se recrute pas en boutique (run/recruitment.ts). Les
 * unites deja possedees, dont l'armee de depart, ne sont jamais concernees.
 */
export interface RecruitmentUnlockConfig {
  unitId: string;
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

/** Porte de muraille fonctionnelle (voir sim/systems/gates.ts) : SOURCE
 *  UNIQUE des reglages d'ouverture automatique. Les unites du camp de la
 *  porte la comptent toujours comme un passage dans leurs trajets ; elles ne
 *  la franchissent physiquement qu'une fois assez ouverte. Les hostiles la
 *  trouvent toujours fermee. */
export interface GateConfig {
  /** Distance (cases) entre une unite alliee et l'emprise de la porte a
   *  partir de laquelle la porte s'ouvre (et reste ouverte). */
  triggerRangeTiles: number;
  /** Duree (secondes de simulation) d'une ouverture complete ; la fermeture
   *  prend la meme duree. */
  openDurationSeconds: number;
  /** Delai (secondes) sans allie proche avant que la porte se referme. */
  closeDelaySeconds: number;
  /** Ouverture (0 a 1) a partir de laquelle les allies traversent
   *  physiquement : en dessous, les battants bloquent encore. */
  passableOpenness: number;
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
  /** Facteur de taille VISUELLE du modele par rapport a son emprise (voir
   *  ObstacleDef.scale) ; l'emprise de collision et de placement ne change
   *  pas. Absent = 1. */
  modelScale?: number;
  /** Vrai : l'emprise tourne avec le batiment par quarts de tour (2x1 debout
   *  devient 1x2 a 90°) et la rotation se fait par pas de 90° ; voir
   *  buildingFootprintTiles. Absent : emprise fixe, rotation visuelle par pas
   *  de 45° (batiments carres). */
  footprintFollowsRotation?: boolean;
  /** Faux : l'emprise bloque le deplacement mais pas les tirs (muraille,
   *  voir ObstacleDef.blocksShots). Absent = bloque aussi les tirs. */
  blocksShots?: boolean;
  /** Porte fonctionnelle (wall_gate) : passage pour les unites de son camp,
   *  ouverture automatique (GateConfig). Absent : l'emprise bloque tout le
   *  monde (muraille et tous les autres batiments). */
  gate?: GateConfig;
  /** Vrai : la face +Z native du modele est sa face EXTERIEURE (creneaux de
   *  la muraille KayKit, chemin de ronde a l'arriere) ; elle est tournee vers
   *  le cote d'ou viennent les hostiles du camp proprietaire (forwardDir),
   *  voir ObstacleDef.modelFacingYaw. Purement visuel : emprise, collision et
   *  rotation enregistree inchangees. Absent : modele pose tel quel. */
  outerFaceTowardHostiles?: boolean;
  /** 'line' : pose par TRACE continu de segments (enceinte avec virages,
   *  core/wallTrace.ts), en preparation et dans l'editeur. Absent : pose a
   *  l'unite. */
  placementMode?: 'line';
  /** Peut se poser EXACTEMENT a la place d'un batiment de ce type (meme
   *  emprise, meme axe) : il le remplace (porte dans une ligne de murs). */
  placeOverBuildingId?: string;
  /** Muraille posee par trace : batiments VIRAGES (une case) choisis
   *  automatiquement a chaque changement de direction (core/wallTrace.ts) —
   *  `outside` quand le trace tourne autour de son interieur (creneaux sur
   *  le cote bombe), `inside` pour un virage rentrant. */
  traceCorners?: { outside: string; inside: string };
  /** Muraille posee par trace : batiment DEMI-SEGMENT (une case) qui complete
   *  un troncon droit de longueur impaire (core/wallTrace.ts). */
  traceHalf?: string;
  /** Longueur VISUELLE du modele le long de son axe X, rapportee a l'emprise :
   *  le modele est cale sur une emprise 1/k fois plus longue puis comprime
   *  de k (demi-segment : k = 0,5). Absent = 1. */
  modelLengthScale?: number;
  /** Modele pose a son echelle NATIVE (jamais cale sur l'emprise) : origine
   *  du modele a (offsetX, offsetZ) du centre de l'emprise, tourne de
   *  `yaw`, dans le repere du batiment avant `rotationY`. Virage de
   *  muraille : arc KayKit de 120° ajuste dans la case de coin. */
  nativeModelPose?: { yaw: number; offsetX: number; offsetZ: number };
  /** Groupe du catalogue de l'editeur (« Murailles »...). Absent :
   *  « Bâtiments ». */
  editorGroup?: string;
}

export const BUILDINGS: Record<string, BuildingDef> = {
  // "15 HP" (Antoine) -> 150 interne, échelle x10 vérifiée comme partout
  // ailleurs (voir CLAUDE.md, "Échelle des nombres").
  mine: {
    id: 'mine',
    displayName: 'Mine',
    maxHp: 15 * HP_PER_PIP,
    // Comparable au footprint 2x2 de son ObstacleDef (voir
    // ownedBuildingObstacle, main.ts) sans être identique — juste le
    // reach d'attaque adverse, pas la hitbox de collision physique (gérée
    // séparément par l'obstacle). Valeur choisie par Claude, non donnée par
    // Antoine.
    radius: 1.0,
    targetable: true,
    countsForDefeat: true,
    hpBarHeight: 1.6,
    // Prix de base en Or (20 ; 100 avant la refonte economique autour de
    // la Forge). Remplace l'ancienne acquisition automatique
    // via le talent "Le temps, c'est de l'argent" (retiré, voir
    // data/talents.ts).
    cost: 20,
    buildingModel: 'blue_mine',
    footprintTilesX: 2,
    footprintTilesZ: 2,
    upgradeGoldCostBase: 25,
  },
  // "25 HP" (Antoine) -> 250 interne.
  ballista: {
    id: 'ballista',
    displayName: 'Baliste',
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
    buildingModel: 'blue_barracks',
    footprintTilesX: 3,
    footprintTilesZ: 3,
    // Une seule amelioration : Niv. 1 -> Niv. 2 pour 20 or.
    upgradeGoldCostBase: 20,
    maxUpgradeLevel: 1,
    production: { unitId: 'fantassin', unitsPerWaveByLevel: [1, 2] },
    recruitmentUnlock: { unitId: 'fantassin', missingBuildingHint: 'Nécessite une Caserne' },
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
    buildingModel: 'blue_archeryrange',
    footprintTilesX: 3,
    footprintTilesZ: 3,
    upgradeGoldCostBase: 20,
    maxUpgradeLevel: 1,
    production: { unitId: 'archer', unitsPerWaveByLevel: [1, 2] },
    recruitmentUnlock: { unitId: 'archer', missingBuildingHint: 'Nécessite un Camp d’archerie' },
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
    buildingModel: 'blue_blacksmith',
    footprintTilesX: 2,
    footprintTilesZ: 2,
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
    buildingModel: 'blue_home_A',
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
  // Eglise : soigne toutes les unites du joueur contre de l'or (run/churchHeal.ts),
  // donne acces aux ameliorations de run des parchemins et de Soins
  // excedentaires (run/runUpgrades.ts, runUpgradeSite) et debloque le
  // recrutement du Mage. Batiment plus tardif (35 or). Valeurs PROVISOIRES.
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
    buildingModel: 'blue_church',
    footprintTilesX: 2,
    footprintTilesZ: 2,
    upgradeGoldCostBase: 5,
    hpPerLevel: 5 * HP_PER_PIP,
    armyHeal: { hpPerGold: 5, hpPerGoldPerLevel: 2 },
    recruitmentUnlock: { unitId: 'mage', missingBuildingHint: 'Nécessite une Église' },
  },
  // Muraille : construction d'un camp (modele KayKit du dossier « neutral »,
  // visuel neutre, jamais teinte). Seul role : bloquer le deplacement de
  // TOUTES les unites, son camp compris (on passe par une porte ou on
  // contourne ; les tirs passent, blocksShots). 50 PV, aucune attaque, aucun effet, aucune
  // population, aucune amelioration. Ne compte pas pour la defaite : un mur
  // seul ne maintient pas le camp en vie. Segment droit 2 x 1 a l'echelle
  // native du modele (2,0 x 0,8 x 1,1), pose par lignes (placementMode).
  // Cout PROVISOIRE (1 or par segment), a reequilibrer apres playtest.
  wall: {
    id: 'wall',
    displayName: 'Muraille',
    maxHp: 50 * HP_PER_PIP,
    radius: 1.0,
    targetable: true,
    countsForDefeat: false,
    hpBarHeight: 1.5,
    cost: 1,
    buildingModel: 'neutral_wall_straight',
    footprintTilesX: 2,
    footprintTilesZ: 1,
    footprintFollowsRotation: true,
    blocksShots: false,
    outerFaceTowardHostiles: true,
    traceCorners: { outside: 'wall_corner_outside', inside: 'wall_corner_inside' },
    traceHalf: 'wall_half',
    placementMode: 'line',
    editorGroup: 'Murailles',
  },
  // Porte de muraille : memes PV, cout et emprise que le segment droit, mais
  // PORTE fonctionnelle (gate) : les unites de son camp la franchissent (elle
  // s'ouvre a leur approche, battants du modele KayKit animes par le rendu),
  // les hostiles la trouvent toujours fermee et doivent la detruire. Pose a
  // l'unite (ou a la place d'un segment de mur), rotation par 90°.
  wall_gate: {
    id: 'wall_gate',
    displayName: 'Porte de muraille',
    maxHp: 50 * HP_PER_PIP,
    radius: 1.0,
    targetable: true,
    countsForDefeat: false,
    hpBarHeight: 1.8,
    cost: 1,
    buildingModel: 'neutral_wall_straight_gate',
    footprintTilesX: 2,
    footprintTilesZ: 1,
    footprintFollowsRotation: true,
    blocksShots: false,
    outerFaceTowardHostiles: true,
    placeOverBuildingId: 'wall',
    gate: {
      triggerRangeTiles: 1.5,
      openDurationSeconds: 0.5,
      closeDelaySeconds: 1.0,
      passableOpenness: 0.6,
    },
    editorGroup: 'Murailles',
  },
  // Demi-segment de muraille : pose UNIQUEMENT par le trace, pour qu'une
  // portion couvre exactement la longueur demandee (troncon de longueur
  // impaire, extremite d'un trace ouvert). Le pack n'a aucun mur d'une case :
  // segment droit KayKit comprime a la moitie de sa longueur (creneaux
  // tasses). Meme densite de PV qu'un segment (25 PV pour une case, 50 pour
  // les deux cases d'un segment) ; memes regles ; facture une demi-piece.
  wall_half: {
    id: 'wall_half',
    displayName: 'Muraille',
    maxHp: 25 * HP_PER_PIP,
    radius: 0.5,
    targetable: true,
    countsForDefeat: false,
    hpBarHeight: 1.5,
    buildingModel: 'neutral_wall_straight',
    footprintTilesX: 1,
    footprintTilesZ: 1,
    blocksShots: false,
    outerFaceTowardHostiles: true,
    modelLengthScale: 0.5,
  },
  // Virages de muraille : poses UNIQUEMENT par le trace (aucun cout propre,
  // donc ni en boutique ni dans le catalogue de l'editeur ; le trace les
  // facture comme un segment de mur). Memes PV et memes regles qu'un mur
  // (bloque les deux camps, tirs traversants, ne compte pas pour la defaite).
  // Emprise : la seule case de jonction. Modele : arc KayKit « B » (virage
  // de 120°, rayon 0,58) pose dans cette case, extremites a ±15° des segments
  // voisins et 0,2 case sous eux ; reference : bras vers -X et +Z, arc bombe
  // vers le nord-est (rotation 75°, origine a (sin 15°, -sin 15°) du centre).
  // `outside` : creneaux sur le cote bombe ; `inside` : cote concave.
  wall_corner_outside: {
    id: 'wall_corner_outside',
    displayName: 'Angle de muraille',
    maxHp: 50 * HP_PER_PIP,
    radius: 0.5,
    targetable: true,
    countsForDefeat: false,
    hpBarHeight: 1.5,
    buildingModel: 'neutral_wall_corner_B_outside',
    footprintTilesX: 1,
    footprintTilesZ: 1,
    blocksShots: false,
    nativeModelPose: { yaw: (75 * Math.PI) / 180, offsetX: Math.sin(Math.PI / 12), offsetZ: -Math.sin(Math.PI / 12) },
  },
  wall_corner_inside: {
    id: 'wall_corner_inside',
    displayName: 'Angle de muraille',
    maxHp: 50 * HP_PER_PIP,
    radius: 0.5,
    targetable: true,
    countsForDefeat: false,
    hpBarHeight: 1.5,
    buildingModel: 'neutral_wall_corner_B_inside',
    footprintTilesX: 1,
    footprintTilesZ: 1,
    blocksShots: false,
    nativeModelPose: { yaw: (75 * Math.PI) / 180, offsetX: Math.sin(Math.PI / 12), offsetZ: -Math.sin(Math.PI / 12) },
  },
};

/** Vrai si `rotationY` est un quart de tour impair (90°, 270°). */
function isOddQuarterTurn(rotationY: number): boolean {
  return Math.abs(Math.round(rotationY / (Math.PI / 2))) % 2 === 1;
}

/** Emprise reelle (cases) du batiment `buildingId` tourne de `rotationY` :
 *  inversee a 90° / 270° quand l'emprise suit la rotation
 *  (BuildingDef.footprintFollowsRotation), sinon toujours celle des donnees. */
export function buildingFootprintTiles(buildingId: string, rotationY = 0): { tilesX: number; tilesZ: number } {
  const def = getBuilding(buildingId);
  const tilesX = def.footprintTilesX ?? 1;
  const tilesZ = def.footprintTilesZ ?? 1;
  return def.footprintFollowsRotation && isOddQuarterTurn(rotationY) ? { tilesX: tilesZ, tilesZ: tilesX } : { tilesX, tilesZ };
}

/** Pas de rotation du batiment en placement : 90° si son emprise suit la
 *  rotation, sinon 45° (rotation visuelle). */
/** Vrai si deux batiments centres en (ax, az) et (bx, bz) ont exactement la
 *  meme emprise (memes cases) — remplacement d'un mur par une porte. */
export function sameBuildingFootprint(aId: string, ax: number, az: number, aRotationY: number, bId: string, bx: number, bz: number, bRotationY: number): boolean {
  const a = buildingFootprintTiles(aId, aRotationY);
  const b = buildingFootprintTiles(bId, bRotationY);
  return a.tilesX === b.tilesX && a.tilesZ === b.tilesZ && Math.abs(ax - bx) < 1e-6 && Math.abs(az - bz) < 1e-6;
}

export function buildingRotationStep(buildingId: string): number {
  return getBuilding(buildingId).footprintFollowsRotation ? Math.PI / 2 : Math.PI / 4;
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
  return Object.values(BUILDINGS).find((def) => def.recruitmentUnlock?.unitId === unitId) ?? null;
}

/** Unites produites par manche par le batiment `buildingId` a son niveau
 *  interne `level` (borne au dernier niveau defini), 0 sans production. */
export function unitsProducedPerWave(buildingId: string, level: number): number {
  const byLevel = BUILDINGS[buildingId]?.production?.unitsPerWaveByLevel;
  if (!byLevel || byLevel.length === 0) return 0;
  return byLevel[Math.min(Math.max(level, 0), byLevel.length - 1)]!;
}
