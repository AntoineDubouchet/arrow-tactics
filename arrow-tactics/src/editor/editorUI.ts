import { obstacleCenter } from '../config/constants';
import type { TerrainType } from '../config/mapDef';
import type { TerritoryTeam } from '../config/territory';
import { UNITS } from '../data/units';
import type { EditorObstacle, EditorUnit, PlacementTemplate } from './editorState';

export interface EditorUIHandlers {
  onSelectTemplate: (template: PlacementTemplate) => void;
  /** Carte "Unités" choisie dans l'asset browser — le camp n'est pas transmis
   *  ici, il est deduit de la position au moment de la pose (voir
   *  EditorState.placeUnitAt). */
  onSelectUnit: (unitId: string) => void;
  /** Outil "Ajouter case" (2026-08-16, chantier map irrégulière) — reste
   *  actif après chaque clic (tampon répétable), contrairement au placement
   *  d'obstacle/unité (voir EditorState.addCell). */
  onSelectAddCellTool: (terrain: TerrainType) => void;
  onSelectRemoveCellTool: () => void;
  /** Pinceau de territoire : `team` peint pour ce camp, `null` efface
   *  (case neutre). Reste actif apres chaque trait, comme "Ajouter case". */
  onSelectTerritoryTool: (team: TerritoryTeam | null) => void;
  onRotate: () => void;
  onDelete: () => void;
  onExit: () => void;
  /** Bouton "Enregistrer" de la barre d'outils (etape 3 du chantier
   *  editeur) : declenche le telechargement du fichier .json, voir
   *  editor/mapSerializer.ts. */
  onSave: () => void;
  /** Fichier choisi via le bouton "Charger une carte" — le parsing/la
   *  validation restent dans mapSerializer.ts, l'UI ne fait que relayer le
   *  File choisi par Antoine. */
  onLoad: (file: File) => void;
  /** Bouton "Appliquer" du controle de taille — largeur/hauteur en cases,
   *  deja validees comme des entiers positifs par l'UI (voir constructor). */
  onResizeMap: (width: number, height: number) => void;
  /** Bouton "Tester le scénario" — lance une vraie bataille avec la
   *  configuration actuelle de l'éditeur (voir main.ts, testScenario). */
  onTestScenario: () => void;
}

interface AssetEntry {
  label: string;
  template: PlacementTemplate;
}

/** Rochers proposes dans l'asset browser : les deux empreintes deja
 *  utilisees sur la map actuelle. La composition interne (masse principale/
 *  secondaire/debris) est entierement automatique, voir render/rocks.ts —
 *  rien d'autre a choisir pour un rocher. */
const ROCK_ASSETS: AssetEntry[] = [
  { label: 'Rocher (2×2)', template: { kind: 'rock', tilesX: 2, tilesZ: 2 } },
  { label: 'Rocher (3×3)', template: { kind: 'rock', tilesX: 3, tilesZ: 3 } },
];

/** Un bouton par modele d'arbre reellement disponible (voir
 *  render/assetLibrary.ts, TREE_MODELS + EXTRA_TREE_MODELS) — jamais de faux
 *  asset. Liste elargie le 2026-08-08 (demande d'Antoine : "importer un
 *  maximum d'elements interessants") avec les formes du Kenney Nature Kit
 *  complet ; les variantes de teinte "_dark"/"_fall" ont ete ecartees pour
 *  rester sur la palette d'ete actuelle. */
function tree(label: string, treeModel: string): AssetEntry {
  return { label, template: { kind: 'tree', tilesX: 1, tilesZ: 1, treeModel } };
}

const TREE_ASSETS: AssetEntry[] = [
  tree('Arbre — défaut', 'tree_default'),
  tree('Arbre — détaillé', 'tree_detailed'),
  tree('Arbre — chêne', 'tree_oak'),
  tree('Arbre — trapu', 'tree_fat'),
  tree('Arbre — blocs', 'tree_blocks'),
  tree('Arbre — conique', 'tree_cone'),
  tree('Arbre — plateau', 'tree_plateau'),
  tree('Arbre — simple', 'tree_simple'),
  tree('Arbre — petit', 'tree_small'),
  tree('Arbre — haut', 'tree_tall'),
  tree('Arbre — fin', 'tree_thin'),
  tree('Palmier', 'tree_palm'),
  tree('Palmier — courbé', 'tree_palmBend'),
  tree('Palmier — court détaillé', 'tree_palmDetailedShort'),
  tree('Palmier — haut détaillé', 'tree_palmDetailedTall'),
  tree('Palmier — court', 'tree_palmShort'),
  tree('Palmier — haut', 'tree_palmTall'),
  tree('Pin — défaut A', 'tree_pineDefaultA'),
  tree('Pin — défaut B', 'tree_pineDefaultB'),
  tree('Pin — bas A', 'tree_pineGroundA'),
  tree('Pin — bas B', 'tree_pineGroundB'),
  tree('Pin — rond A', 'tree_pineRoundA'),
  tree('Pin — rond B', 'tree_pineRoundB'),
  tree('Pin — rond C', 'tree_pineRoundC'),
  tree('Pin — rond D', 'tree_pineRoundD'),
  tree('Pin — rond E', 'tree_pineRoundE'),
  tree('Pin — rond F', 'tree_pineRoundF'),
  tree('Pin — petit A', 'tree_pineSmallA'),
  tree('Pin — petit B', 'tree_pineSmallB'),
  tree('Pin — petit C', 'tree_pineSmallC'),
  tree('Pin — petit D', 'tree_pineSmallD'),
  tree('Pin — haut A', 'tree_pineTallA'),
  tree('Pin — haut A détaillé', 'tree_pineTallA_detailed'),
  tree('Pin — haut B', 'tree_pineTallB'),
  tree('Pin — haut B détaillé', 'tree_pineTallB_detailed'),
  tree('Pin — haut C', 'tree_pineTallC'),
  tree('Pin — haut C détaillé', 'tree_pineTallC_detailed'),
  tree('Pin — haut D', 'tree_pineTallD'),
  tree('Pin — haut D détaillé', 'tree_pineTallD_detailed'),
];

/**
 * Props independants (voir render/props.ts, PROP_MODELS) : un seul modele
 * .glb chacun, pas de composition en grappe. `scale` calibre le rendu sur les
 * VRAIES proportions du modele — mesurees directement dans les .glb (script
 * Node lisant les accessors, meme methode que pour les rochers), pas devinees.
 * Necessaire car createPropObstacle met tout a l'echelle sur une empreinte
 * fixe (1 case) : sans ce `scale` relatif, une fleur et une tente sortaient
 * a peu pres a la MEME taille de rendu (bug trouve en repondant a la demande
 * d'Antoine d'afficher la taille a cote du nom — 2026-08-08). `scale` = 1
 * pour le plus grand prop mesure (log_large), les autres proportionnellement
 * plus petits. Le chiffre affiche entre parentheses est l'empreinte au sol
 * REELLEMENT rendue, en cases (0.85 × scale, voir props.ts) — exact, pas une
 * estimation, puisque rien d'aleatoire n'intervient dans la taille d'un prop
 * (contrairement aux arbres, volontairement laisses recales a une hauteur
 * commune malgre l'essence — voir tree() ci-dessus, pas de taille affichee
 * pour eux pour la meme raison : le chiffre serait quasi identique partout). */
function prop(label: string, propModel: string, scale: number): AssetEntry {
  return { label, template: { kind: 'prop', tilesX: 1, tilesZ: 1, propModel, scale } };
}

const MUSHROOM_ASSETS: AssetEntry[] = [
  prop('Champignons rouges (0.2 case)', 'mushroom_red', 0.2),
  prop('Champignons rouges — groupe (0.2 case)', 'mushroom_redGroup', 0.27),
  prop('Champignons rouges — hauts (0.1 case)', 'mushroom_redTall', 0.14),
  prop('Champignons bruns (0.2 case)', 'mushroom_tan', 0.22),
  prop('Champignons bruns — groupe (0.2 case)', 'mushroom_tanGroup', 0.27),
  prop('Champignons bruns — hauts (0.1 case)', 'mushroom_tanTall', 0.14),
];

const BUSH_ASSETS: AssetEntry[] = [
  prop('Buisson (0.3 case)', 'plant_bush', 0.4),
  prop('Buisson — détaillé (0.5 case)', 'plant_bushDetailed', 0.6),
  prop('Buisson — grand (0.3 case)', 'plant_bushLarge', 0.37),
  prop('Buisson — grand triangulaire (0.4 case)', 'plant_bushLargeTriangle', 0.47),
  prop('Buisson — petit (0.3 case)', 'plant_bushSmall', 0.38),
  prop('Buisson — triangulaire (0.3 case)', 'plant_bushTriangle', 0.41),
  prop('Plante basse (0.2 case)', 'plant_flatShort', 0.28),
  prop('Plante haute (0.2 case)', 'plant_flatTall', 0.27),
];

const FLOWER_ASSETS: AssetEntry[] = [
  prop('Fleurs violettes A (0.2 case)', 'flower_purpleA', 0.18),
  prop('Fleurs violettes B (0.2 case)', 'flower_purpleB', 0.24),
  prop('Fleurs violettes C (0.2 case)', 'flower_purpleC', 0.18),
  prop('Fleurs rouges A (0.2 case)', 'flower_redA', 0.18),
  prop('Fleurs rouges B (0.2 case)', 'flower_redB', 0.24),
  prop('Fleurs rouges C (0.2 case)', 'flower_redC', 0.18),
  prop('Fleurs jaunes A (0.2 case)', 'flower_yellowA', 0.18),
  prop('Fleurs jaunes B (0.2 case)', 'flower_yellowB', 0.24),
  prop('Fleurs jaunes C (0.2 case)', 'flower_yellowC', 0.18),
];

const WOOD_ASSETS: AssetEntry[] = [
  prop('Bûche (0.6 case)', 'log', 0.71),
  prop('Bûche — grande (0.9 case)', 'log_large', 1),
  prop('Tas de bûches (0.6 case)', 'log_stack', 0.71),
  prop('Tas de bûches — grand (0.6 case)', 'log_stackLarge', 0.71),
  prop('Souche — vieille (0.3 case)', 'stump_old', 0.37),
  prop('Souche — vieille haute (0.3 case)', 'stump_oldTall', 0.37),
  prop('Souche — ronde (0.3 case)', 'stump_round', 0.37),
  prop('Souche — ronde détaillée (0.3 case)', 'stump_roundDetailed', 0.37),
  prop('Souche — carrée (0.3 case)', 'stump_square', 0.36),
  prop('Souche — carrée détaillée (0.4 case)', 'stump_squareDetailed', 0.44),
  prop('Souche — carrée large détaillée (0.5 case)', 'stump_squareDetailedWide', 0.64),
];

const MISC_DECOR_ASSETS: AssetEntry[] = [
  prop('Cactus — court (0.3 case)', 'cactus_short', 0.34),
  prop('Cactus — haut (0.3 case)', 'cactus_tall', 0.4),
  prop('Feu de camp — briques (0.4 case)', 'campfire_bricks', 0.47),
  prop('Feu de camp — bûches (0.2 case)', 'campfire_logs', 0.29),
  prop('Feu de camp — planches (0.3 case)', 'campfire_planks', 0.35),
  prop('Feu de camp — pierres (0.5 case)', 'campfire_stones', 0.54),
  prop('Statue — bloc (0.3 case)', 'statue_block', 0.4),
  prop('Statue — colonne (0.3 case)', 'statue_column', 0.3),
  prop('Statue — colonne endommagée (0.3 case)', 'statue_columnDamaged', 0.3),
  prop('Statue — tête (0.6 case)', 'statue_head', 0.73),
  prop('Statue — obélisque (0.3 case)', 'statue_obelisk', 0.31),
  prop('Statue — anneau (0.5 case)', 'statue_ring', 0.6),
  prop('Pot — grand (0.5 case)', 'pot_large', 0.56),
  prop('Pot — petit (0.3 case)', 'pot_small', 0.32),
  prop('Panneau (0.3 case)', 'sign', 0.3),
  prop('Tente détaillée — fermée (0.7 case)', 'tent_detailedClosed', 0.87),
  prop('Tente détaillée — ouverte (0.7 case)', 'tent_detailedOpen', 0.87),
  prop('Tente simple — fermée (0.5 case)', 'tent_smallClosed', 0.64),
  prop('Tente simple — ouverte (0.6 case)', 'tent_smallOpen', 0.67),
];

/**
 * Premiere selection du pack KayKit "Medieval Hexagon Pack" (2026-08-14,
 * CC0 — voir render/assetLibrary.ts, KAYKIT_MODELS pour le detail complet
 * de ce qui a ete inclus/ecarte dans cette passe). Meme helper `prop()`
 * que les decors Kenney ci-dessus, meme methode de calibration (`scale`
 * mesure directement dans les .gltf, pas devine) — cle prefixee `kaykit_`
 * pour matcher assetLibrary.ts. Antoine a prevenu que cette bibliotheque
 * sera retravaillee bientot : selection volontairement pragmatique pour
 * l'instant (props/nature qui tiennent dans une case), pas les batiments
 * (echelle multi-cases, pas encore de support pour ca) ni les tuiles
 * hexagonales (systeme de terrain, hors sujet).
 */
const KAYKIT_NATURE_ASSETS: AssetEntry[] = [
  prop('KayKit — Rocher A (0.35 case)', 'kaykit_rock_single_A', 0.414),
  prop('KayKit — Rocher B (0.34 case)', 'kaykit_rock_single_B', 0.398),
  prop('KayKit — Rocher C (0.41 case)', 'kaykit_rock_single_C', 0.478),
  prop('KayKit — Rocher D (0.34 case)', 'kaykit_rock_single_D', 0.398),
  prop('KayKit — Rocher E (0.58 case)', 'kaykit_rock_single_E', 0.678),
  prop('KayKit — Arbre A (0.68 case)', 'kaykit_tree_single_A', 0.797),
  prop('KayKit — Arbre A coupé (0.20 case)', 'kaykit_tree_single_A_cut', 0.236),
  prop('KayKit — Arbre B (0.85 case)', 'kaykit_tree_single_B', 1),
  prop('KayKit — Arbre B coupé (0.22 case)', 'kaykit_tree_single_B_cut', 0.264),
  prop('KayKit — Nénuphar A (0.17 case)', 'kaykit_waterlily_A', 0.202),
  prop('KayKit — Nénuphar B (0.25 case)', 'kaykit_waterlily_B', 0.294),
  prop('KayKit — Plante aquatique A (0.26 case)', 'kaykit_waterplant_A', 0.3),
  prop('KayKit — Plante aquatique B (0.19 case)', 'kaykit_waterplant_B', 0.219),
  prop('KayKit — Plante aquatique C (0.26 case)', 'kaykit_waterplant_C', 0.3),
];

const KAYKIT_PROP_ASSETS: AssetEntry[] = [
  prop('KayKit — Tonneau (0.24 case)', 'kaykit_barrel', 0.28),
  prop('KayKit — Seau à flèches (0.17 case)', 'kaykit_bucket_arrows', 0.198),
  prop('KayKit — Seau vide (0.17 case)', 'kaykit_bucket_empty', 0.194),
  prop('KayKit — Seau d’eau (0.17 case)', 'kaykit_bucket_water', 0.194),
  prop('KayKit — Caisse A grande (0.25 case)', 'kaykit_crate_A_big', 0.292),
  prop('KayKit — Caisse A petite (0.17 case)', 'kaykit_crate_A_small', 0.194),
  prop('KayKit — Caisse B grande (0.25 case)', 'kaykit_crate_B_big', 0.292),
  prop('KayKit — Caisse B petite (0.17 case)', 'kaykit_crate_B_small', 0.194),
  prop('KayKit — Caisse longue A (0.47 case)', 'kaykit_crate_long_A', 0.555),
  prop('KayKit — Caisse longue B (0.47 case)', 'kaykit_crate_long_B', 0.555),
  prop('KayKit — Caisse longue C (0.47 case)', 'kaykit_crate_long_C', 0.555),
  prop('KayKit — Caisse longue vide (0.47 case)', 'kaykit_crate_long_empty', 0.555),
  prop('KayKit — Caisse ouverte (0.39 case)', 'kaykit_crate_open', 0.46),
  prop('KayKit — Drapeau bleu (0.31 case)', 'kaykit_flag_blue', 0.367),
  prop('KayKit — Drapeau vert (0.31 case)', 'kaykit_flag_green', 0.367),
  prop('KayKit — Drapeau rouge (0.31 case)', 'kaykit_flag_red', 0.367),
  prop('KayKit — Drapeau jaune (0.31 case)', 'kaykit_flag_yellow', 0.367),
  prop('KayKit — Échelle (0.30 case)', 'kaykit_ladder', 0.352),
  prop('KayKit — Palette (0.35 case)', 'kaykit_pallet', 0.417),
  prop('KayKit — Bois de ressource (0.81 case)', 'kaykit_resource_lumber', 0.953),
  prop('KayKit — Pierre de ressource (0.50 case)', 'kaykit_resource_stone', 0.585),
  prop('KayKit — Sac (0.19 case)', 'kaykit_sack', 0.222),
  prop('KayKit — Cible d’entraînement (0.28 case)', 'kaykit_target', 0.332),
  prop('KayKit — Tente (0.61 case)', 'kaykit_tent', 0.717),
  prop('KayKit — Râtelier d’armes (0.24 case)', 'kaykit_weaponrack', 0.278),
  prop('KayKit — Brouette (0.60 case)', 'kaykit_wheelbarrow', 0.702),
];

/**
 * Batiments KayKit "Medieval Hexagon Pack" (2026-08-14, demande d'Antoine :
 * "intègre tout ce qu'il y a ici pour l'éditeur de map... tu devrais
 * trouver l'équivalent version rouge pour l'adversaire") — voir
 * render/assetLibrary.ts, TEAM_BUILDING_FAMILIES/NEUTRAL_BUILDING_FAMILIES
 * pour le detail des fichiers .obj/.mtl charges par famille.
 *
 * `tilesX`/`tilesZ` mesures par script (lecture directe des lignes "v x y z"
 * de chaque .obj, PAS a l'oeil, arrondis a l'entier superieur) — DIFFERENT
 * du `scale` des props ci-dessus : un batiment est mis a l'echelle pour
 * tenir dans un rectangle `tilesX x tilesZ` (voir render/buildings.ts,
 * cloneScaledToFootprint), calcule au CHARGEMENT depuis la vraie boite
 * englobante du modele — aucun facteur d'echelle a deviner/mesurer a la
 * main ici, contrairement aux props (mis a l'echelle sur leur seule
 * largeur). `kind: 'building'` reste COLLIDABLE (voir config/constants.ts,
 * isCollidableObstacle) — contrairement a un prop, un batiment bloque
 * mouvement ET ligne de tir, exactement comme un rocher/arbre.
 *
 * Trois catalogues distincts : BLUE/RED (18 batiments chacun, memes types,
 * juste la couleur — "l'équivalent rouge pour l'adversaire") et NEUTRAL (10
 * elements sans camp : ponts, ruine, échafaudage, estrades, parcelles de
 * terre/céréales, projectile de catapulte — "ils sont neutres ceux-là").
 * Murs et clôtures du meme dossier source (`wall_*`/`fence_*`) EXCLUS de
 * cette passe : systeme de pieces connectables (segments/coins/portes
 * devant s'aligner bord a bord), pas un obstacle a emprise unique — memes
 * raisons deja documentees pour les tuiles de terrain (etape 5 du chantier
 * editeur, pas encore construite).
 */
function building(label: string, buildingModel: string, tilesX: number, tilesZ: number): AssetEntry {
  return { label, template: { kind: 'building', tilesX, tilesZ, buildingModel } };
}

const BLUE_BUILDING_ASSETS: AssetEntry[] = [
  building('Champ de tir à l’arc (bleu)', 'blue_archeryrange', 2, 2),
  building('Caserne (bleu)', 'blue_barracks', 2, 2),
  building('Forge (bleu)', 'blue_blacksmith', 2, 2),
  building('Château (bleu)', 'blue_castle', 2, 3),
  building('Église (bleu)', 'blue_church', 2, 2),
  building('Maison A (bleu)', 'blue_home_A', 1, 1),
  building('Maison B (bleu)', 'blue_home_B', 1, 2),
  building('Scierie (bleu)', 'blue_lumbermill', 2, 2),
  building('Marché (bleu)', 'blue_market', 2, 2),
  building('Mine (bleu)', 'blue_mine', 2, 2),
  building('Taverne (bleu)', 'blue_tavern', 2, 2),
  building('Tour A (bleu)', 'blue_tower_A', 1, 2),
  building('Tour B (bleu)', 'blue_tower_B', 2, 2),
  building('Tour — base (bleu)', 'blue_tower_base', 1, 2),
  building('Tour à catapulte (bleu)', 'blue_tower_catapult', 1, 2),
  building('Moulin à eau (bleu)', 'blue_watermill', 2, 2),
  building('Puits (bleu)', 'blue_well', 1, 1),
  building('Moulin à vent (bleu)', 'blue_windmill', 2, 1),
];

const RED_BUILDING_ASSETS: AssetEntry[] = [
  building('Champ de tir à l’arc (rouge)', 'red_archeryrange', 2, 2),
  building('Caserne (rouge)', 'red_barracks', 2, 2),
  building('Forge (rouge)', 'red_blacksmith', 2, 2),
  building('Château (rouge)', 'red_castle', 2, 3),
  building('Église (rouge)', 'red_church', 2, 2),
  building('Maison A (rouge)', 'red_home_A', 1, 1),
  building('Maison B (rouge)', 'red_home_B', 1, 2),
  building('Scierie (rouge)', 'red_lumbermill', 2, 2),
  building('Marché (rouge)', 'red_market', 2, 2),
  building('Mine (rouge)', 'red_mine', 2, 2),
  building('Taverne (rouge)', 'red_tavern', 2, 2),
  building('Tour A (rouge)', 'red_tower_A', 1, 2),
  building('Tour B (rouge)', 'red_tower_B', 2, 2),
  building('Tour — base (rouge)', 'red_tower_base', 1, 2),
  building('Tour à catapulte (rouge)', 'red_tower_catapult', 1, 2),
  building('Moulin à eau (rouge)', 'red_watermill', 2, 2),
  building('Puits (rouge)', 'red_well', 1, 1),
  building('Moulin à vent (rouge)', 'red_windmill', 2, 1),
];

/** `dirt`/`grain` mesures quasi plats (hauteur native 0.09/0.39) — probablement
 *  penses a l'origine comme des PATCHES DE SOL plutot que de vrais obstacles
 *  verticaux. Laisses `kind: 'building'` (donc collidables) par coherence
 *  avec le reste du lot plutot que deviner un traitement special non demande
 *  — a reclasser en `kind: 'prop'` (traversable) si Antoine juge que ces
 *  deux-la ne devraient pas bloquer le mouvement. */
const NEUTRAL_BUILDING_ASSETS: AssetEntry[] = [
  building('Pont A', 'neutral_bridge_A', 2, 2),
  building('Pont B', 'neutral_bridge_B', 2, 2),
  building('Bâtiment en ruine', 'neutral_destroyed', 2, 2),
  building('Parcelle de terre', 'neutral_dirt', 2, 2),
  building('Parcelle de céréales', 'neutral_grain', 2, 3),
  building('Échafaudage', 'neutral_scaffolding', 2, 3),
  building('Estrade A', 'neutral_stage_A', 1, 1),
  building('Estrade B', 'neutral_stage_B', 1, 2),
  building('Estrade C', 'neutral_stage_C', 2, 2),
  building('Projectile de catapulte', 'neutral_catapult_projectile', 1, 1),
];

interface AssetCategory {
  label: string;
  assets: AssetEntry[];
}

interface AssetGroup {
  label: string;
  categories: AssetCategory[];
}

/**
 * Deux groupes plutot qu'une liste plate de categories (demande d'Antoine,
 * 2026-08-08) : « Obstacles » pour ce qui bloque deja le jeu comme prevu
 * (rochers, arbres — voir OBSTACLE_LOOKAHEAD, resolveObstacleCollisions),
 * « Décors » pour le reste (champignons, buissons, fleurs...). Purement une
 * question de RANGEMENT dans l'asset browser pour l'instant : un décor
 * occupe encore une case entiere et bloque pas/ligne de tir exactement comme
 * un obstacle (ObstacleDef ne distingue pas encore les deux cote simulation)
 * — Antoine a prevenu que d'autres changements sur cette partie du jeu
 * arrivent, a traiter separement le moment venu.
 */
const ASSET_GROUPS: AssetGroup[] = [
  {
    label: 'Obstacles',
    categories: [
      { label: 'Rochers', assets: ROCK_ASSETS },
      { label: 'Arbres', assets: TREE_ASSETS },
    ],
  },
  {
    label: 'Décors',
    categories: [
      { label: 'Champignons', assets: MUSHROOM_ASSETS },
      { label: 'Buissons & plantes', assets: BUSH_ASSETS },
      { label: 'Fleurs', assets: FLOWER_ASSETS },
      { label: 'Bois (bûches, souches)', assets: WOOD_ASSETS },
      { label: 'Divers', assets: MISC_DECOR_ASSETS },
    ],
  },
  {
    // Groupe SEPARE (2026-08-14, demande d'Antoine) plutot que fondu dans
    // « Décors » ci-dessus : la provenance (KayKit, pack a retravailler
    // bientot) reste evidente d'un coup d'œil dans l'asset browser.
    label: 'KayKit (médiéval)',
    categories: [
      { label: 'Nature', assets: KAYKIT_NATURE_ASSETS },
      { label: 'Props', assets: KAYKIT_PROP_ASSETS },
    ],
  },
  {
    // Groupe SEPARE de "KayKit (médiéval)" ci-dessus (2026-08-14, demande
    // d'Antoine) : format .obj/.mtl different, echelle/emprise multi-cases
    // et collision reelle (contrairement aux props/nature, traversables) —
    // suffisamment distinct pour meriter son propre groupe plutot que de se
    // fondre dans les categories existantes.
    label: 'Bâtiments (KayKit)',
    categories: [
      { label: 'Bleu (joueur)', assets: BLUE_BUILDING_ASSETS },
      { label: 'Rouge (adversaire)', assets: RED_BUILDING_ASSETS },
      { label: 'Neutres', assets: NEUTRAL_BUILDING_ASSETS },
    ],
  },
];

interface UnitAssetEntry {
  label: string;
  unitId: string;
}

/**
 * Bestiaire du jeu (voir data/units.ts) : une carte par unite REELLEMENT
 * jouable, construite dynamiquement depuis UNITS plutot qu'une liste codee en
 * dur — une nouvelle unite ajoutee a data/units.ts apparait ici sans toucher
 * a l'editeur (meme principe que "creer une unite = une entree dans
 * data/units.ts, rien d'autre", voir CLAUDE.md). Pas de camp choisi ici : la
 * couleur depend d'ou l'unite est posee sur le plateau (voir EditorUIHandlers
 * .onSelectUnit, EditorState.placeUnitAt) — demande explicite d'Antoine,
 * 2026-08-08, pour pouvoir composer des vagues d'ennemis directement dans
 * l'editeur et me renvoyer le JSON resultant.
 */
const UNIT_ASSETS: UnitAssetEntry[] = Object.values(UNITS).map((def) => ({ label: def.name, unitId: def.id }));

/**
 * Interface HTML/CSS de l'editeur, par-dessus le canvas (regle du projet,
 * jamais dessine dans la scene 3D) : asset browser a gauche, panneau
 * proprietes a droite, barre d'etat en bas. Etape 2 du chantier (voir
 * CLAUDE.md) — pas de miniatures pour l'instant (juste le nom, l'asset
 * browser prevoit deja la place pour en ajouter plus tard sans tout
 * reecrire), pas d'onglets Terrain/Gameplay/Environment (viendront avec
 * leurs outils respectifs).
 */
export class EditorUI {
  readonly root: HTMLElement;
  private readonly propertiesPanel: HTMLElement;
  private readonly propertiesBody: HTMLElement;
  private readonly rotateButton: HTMLButtonElement;
  private readonly deleteButton: HTMLButtonElement;
  private readonly widthInput: HTMLInputElement;
  private readonly heightInput: HTMLInputElement;

  constructor(handlers: EditorUIHandlers) {
    this.root = document.createElement('div');
    this.root.className = 'editor-ui';
    this.root.style.display = 'none';

    const toolbar = document.createElement('div');
    toolbar.className = 'editor-toolbar';
    const exitButton = document.createElement('button');
    exitButton.type = 'button';
    exitButton.className = 'editor-button';
    exitButton.textContent = '← Retour au menu';
    exitButton.addEventListener('click', handlers.onExit);
    toolbar.appendChild(exitButton);

    const saveButton = document.createElement('button');
    saveButton.type = 'button';
    saveButton.className = 'editor-button';
    saveButton.textContent = 'Enregistrer';
    saveButton.addEventListener('click', handlers.onSave);
    toolbar.appendChild(saveButton);

    const loadButton = document.createElement('button');
    loadButton.type = 'button';
    loadButton.className = 'editor-button';
    loadButton.textContent = 'Charger une carte';
    const loadInput = document.createElement('input');
    loadInput.type = 'file';
    loadInput.accept = '.json,application/json';
    loadInput.style.display = 'none';
    loadInput.addEventListener('change', () => {
      const file = loadInput.files?.[0];
      if (file) handlers.onLoad(file);
      loadInput.value = '';
    });
    loadButton.addEventListener('click', () => loadInput.click());
    toolbar.appendChild(loadButton);
    toolbar.appendChild(loadInput);

    const sizeLabel = document.createElement('span');
    sizeLabel.className = 'editor-toolbar-title';
    sizeLabel.textContent = 'Taille :';
    toolbar.appendChild(sizeLabel);

    this.widthInput = document.createElement('input');
    this.widthInput.type = 'number';
    this.widthInput.min = '1';
    this.widthInput.className = 'editor-size-input';
    toolbar.appendChild(this.widthInput);

    const sizeSeparator = document.createElement('span');
    sizeSeparator.className = 'editor-toolbar-title';
    sizeSeparator.textContent = '×';
    toolbar.appendChild(sizeSeparator);

    this.heightInput = document.createElement('input');
    this.heightInput.type = 'number';
    this.heightInput.min = '1';
    this.heightInput.className = 'editor-size-input';
    toolbar.appendChild(this.heightInput);

    const applySizeButton = document.createElement('button');
    applySizeButton.type = 'button';
    applySizeButton.className = 'editor-button';
    applySizeButton.textContent = 'Appliquer';
    applySizeButton.addEventListener('click', () => {
      const width = parseInt(this.widthInput.value, 10);
      const height = parseInt(this.heightInput.value, 10);
      if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
        handlers.onResizeMap(width, height);
      }
    });
    toolbar.appendChild(applySizeButton);

    // Outil "Ajouter/Supprimer case" (2026-08-16, chantier map irrégulière,
    // Part X-AI) : deux boutons de type de terrain + un bouton suppression,
    // regroupés visuellement (même conteneur que Taille, pas un onglet à
    // part pour rester simple — voir CLAUDE.md, "ne pas sur-abstraire").
    const cellLabel = document.createElement('span');
    cellLabel.className = 'editor-toolbar-title';
    cellLabel.textContent = 'Terrain :';
    toolbar.appendChild(cellLabel);

    const addGrassButton = document.createElement('button');
    addGrassButton.type = 'button';
    addGrassButton.className = 'editor-button';
    addGrassButton.textContent = '+ Case (Herbe)';
    addGrassButton.addEventListener('click', () => handlers.onSelectAddCellTool('grass'));
    toolbar.appendChild(addGrassButton);

    const addDirtButton = document.createElement('button');
    addDirtButton.type = 'button';
    addDirtButton.className = 'editor-button';
    addDirtButton.textContent = '+ Case (Terre)';
    addDirtButton.addEventListener('click', () => handlers.onSelectAddCellTool('dirt'));
    toolbar.appendChild(addDirtButton);

    const removeCellButton = document.createElement('button');
    removeCellButton.type = 'button';
    removeCellButton.className = 'editor-button editor-button--danger';
    removeCellButton.textContent = '− Supprimer case';
    removeCellButton.addEventListener('click', handlers.onSelectRemoveCellTool);
    toolbar.appendChild(removeCellButton);

    const testButton = document.createElement('button');
    testButton.type = 'button';
    testButton.className = 'editor-button';
    testButton.textContent = 'Tester le scénario';
    testButton.addEventListener('click', handlers.onTestScenario);
    toolbar.appendChild(testButton);

    const title = document.createElement('span');
    title.className = 'editor-toolbar-title editor-toolbar-title--main';
    title.textContent = 'Éditeur de maps';
    toolbar.appendChild(title);
    this.root.appendChild(toolbar);

    const browser = document.createElement('div');
    browser.className = 'editor-asset-browser';
    browser.appendChild(this.groupHeader('Territoire'));
    for (const [label, team] of [
      ['Bleu (joueur)', 'player'],
      ['Rouge (ennemi)', 'enemy'],
      ['Effacer (neutre)', null],
    ] as const) {
      browser.appendChild(this.toolCard(label, () => handlers.onSelectTerritoryTool(team)));
    }
    browser.appendChild(this.groupHeader('Unités'));
    browser.appendChild(this.categoryHeader('Bestiaire'));
    for (const unit of UNIT_ASSETS) browser.appendChild(this.unitAssetCard(unit, handlers.onSelectUnit));
    for (const group of ASSET_GROUPS) {
      browser.appendChild(this.groupHeader(group.label));
      for (const category of group.categories) {
        browser.appendChild(this.categoryHeader(category.label));
        for (const asset of category.assets) browser.appendChild(this.assetCard(asset, handlers.onSelectTemplate));
      }
    }
    this.root.appendChild(browser);

    this.propertiesPanel = document.createElement('div');
    this.propertiesPanel.className = 'editor-properties';
    this.propertiesPanel.style.display = 'none';
    const propertiesTitle = document.createElement('div');
    propertiesTitle.className = 'editor-properties-title';
    propertiesTitle.textContent = 'Objet sélectionné';
    this.propertiesPanel.appendChild(propertiesTitle);
    this.propertiesBody = document.createElement('div');
    this.propertiesBody.className = 'editor-properties-body';
    this.propertiesPanel.appendChild(this.propertiesBody);

    this.rotateButton = document.createElement('button');
    this.rotateButton.type = 'button';
    this.rotateButton.className = 'editor-button';
    this.rotateButton.textContent = 'Tourner 90° (R)';
    this.rotateButton.addEventListener('click', handlers.onRotate);
    this.propertiesPanel.appendChild(this.rotateButton);

    this.deleteButton = document.createElement('button');
    this.deleteButton.type = 'button';
    this.deleteButton.className = 'editor-button editor-button--danger';
    this.deleteButton.textContent = 'Supprimer (Suppr)';
    this.deleteButton.addEventListener('click', handlers.onDelete);
    this.propertiesPanel.appendChild(this.deleteButton);

    this.root.appendChild(this.propertiesPanel);

    // Simplifie (2026-08-16, demande explicite d'Antoine : le paragraphe
    // unique precedent "devient difficile a lire") — meme information
    // essentielle, en raccourcis courts sur 2 lignes plutot qu'une phrase
    // continue. Le detail (unite alignee sur la grille, decor libre,
    // "Tester le scenario"...) reste dans les tooltips/le reste de
    // l'interface, pas duplique ici.
    const status = document.createElement('div');
    status.className = 'editor-status';
    const statusLine1 = document.createElement('div');
    statusLine1.textContent =
      'Clic : sélectionner / placer — Clic droit : annuler / désélectionner — Glisser les flèches : déplacer — Glisser l’anneau : tourner';
    const statusLine2 = document.createElement('div');
    statusLine2.textContent = 'Ctrl+molette : rotation 15° (Maj : 1°) — R : +90° — Ctrl+Z / Ctrl+Y : annuler / rétablir — Suppr : supprimer';
    status.appendChild(statusLine1);
    status.appendChild(statusLine2);
    this.root.appendChild(status);

    document.body.appendChild(this.root);
  }

  setVisible(visible: boolean): void {
    this.root.style.display = visible ? '' : 'none';
  }

  /** Synchronise les champs largeur/hauteur avec l'etat reel — appele en
   *  entrant dans l'editeur et apres le chargement d'une carte, pour ne
   *  jamais laisser les champs afficher une taille perimee. */
  setMapSize(width: number, height: number): void {
    this.widthInput.value = String(width);
    this.heightInput.value = String(height);
  }

  showObstacleProperties(obstacle: EditorObstacle): void {
    this.propertiesPanel.style.display = '';
    this.rotateButton.style.display = '';
    // Toujours affiche entre 0 et 359 (un arrondi de 359.6° donnerait sinon 360).
    const rotationDeg = ((Math.round(((obstacle.rotationY ?? 0) * 180) / Math.PI) % 360) + 360) % 360;
    this.propertiesBody.innerHTML = '';
    const kindLabel =
      obstacle.kind === 'tree' ? 'arbre' : obstacle.kind === 'prop' ? 'prop' : obstacle.kind === 'building' ? 'bâtiment' : 'rocher';
    // Position CONTINUE (2026-08-16, placement libre — voir obstacleCenter) :
    // toujours affichée via le centre résolu, jamais cornerX/cornerZ
    // directement (undefined pour tout obstacle posé librement).
    const center = obstacleCenter(obstacle);
    const lines = [
      `Type : ${kindLabel}`,
      obstacle.treeModel ? `Modèle : ${obstacle.treeModel}` : null,
      obstacle.propModel ? `Modèle : ${obstacle.propModel}` : null,
      obstacle.buildingModel ? `Modèle : ${obstacle.buildingModel}` : null,
      `Position : (${center.x.toFixed(2)}, ${center.z.toFixed(2)})`,
      `Emprise : ${obstacle.tilesX}×${obstacle.tilesZ}`,
      `Rotation : ${rotationDeg}°`,
    ].filter((l): l is string => l !== null);
    this.renderPropertyLines(lines);
    // Rend la rotation a la molette decouvrable sans lire l'aide du bas
    // (objets rotatifs uniquement : showUnitProperties ne l'affiche pas).
    const hint = document.createElement('div');
    hint.className = 'editor-properties-hint';
    hint.textContent = 'Ctrl + molette : ±15° • Maj : ±1°';
    this.propertiesBody.appendChild(hint);
  }

  /** Panneau proprietes pour une unite selectionnee — pas de rotation
   *  possible (les unites n'en ont pas), le bouton Tourner est masque. */
  showUnitProperties(unit: EditorUnit): void {
    this.propertiesPanel.style.display = '';
    this.rotateButton.style.display = 'none';
    this.propertiesBody.innerHTML = '';
    const teamLabel = unit.team === 'player' ? 'bleu (joueur)' : 'rouge (ennemi)';
    const def = UNITS[unit.unitId];
    this.renderPropertyLines([
      `Type : unité — ${def?.name ?? unit.unitId}`,
      `Camp : ${teamLabel}`,
      `Position : (${unit.x.toFixed(1)}, ${unit.z.toFixed(1)})`,
    ]);
  }

  private renderPropertyLines(lines: string[]): void {
    for (const line of lines) {
      const p = document.createElement('div');
      p.className = 'editor-properties-line';
      p.textContent = line;
      this.propertiesBody.appendChild(p);
    }
  }

  hideProperties(): void {
    this.propertiesPanel.style.display = 'none';
  }

  private groupHeader(label: string): HTMLElement {
    const h = document.createElement('div');
    h.className = 'editor-asset-group';
    h.textContent = label;
    return h;
  }

  private categoryHeader(label: string): HTMLElement {
    const h = document.createElement('div');
    h.className = 'editor-asset-category';
    h.textContent = label;
    return h;
  }

  private assetCard(asset: AssetEntry, onSelect: (template: PlacementTemplate) => void): HTMLElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'editor-asset-card';
    button.textContent = asset.label;
    button.addEventListener('click', () => onSelect(asset.template));
    return button;
  }

  private toolCard(label: string, onSelect: () => void): HTMLElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'editor-asset-card';
    button.textContent = label;
    button.addEventListener('click', onSelect);
    return button;
  }

  private unitAssetCard(unit: UnitAssetEntry, onSelect: (unitId: string) => void): HTMLElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'editor-asset-card';
    button.textContent = unit.label;
    button.addEventListener('click', () => onSelect(unit.unitId));
    return button;
  }
}
