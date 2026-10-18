import { isCollidableObstacle, obstacleCenter, type ObstacleDef } from '../config/constants';
import type { TerrainType } from '../config/mapDef';
import type { TerritoryTeam } from '../config/territory';
import { UNITS } from '../data/units';
import { teamColor } from '../render/unitSelectionRing';
import type { EditorObstacle, EditorSelection, EditorTool, EditorUnit, PlacementTemplate } from './editorState';

export interface EditorUIHandlers {
  /** Bouton "Sélection" (outil par défaut) — même effet qu'Échap ou le clic
   *  droit quand un autre outil est actif. */
  onSelectSelectTool: () => void;
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
  /** Rotation du decor selectionne de `degrees` (boutons −15° / +15° du
   *  panneau) — meme operation que Ctrl+molette. */
  onRotateBy: (degrees: number) => void;
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

/** Partie d'une categorie du catalogue : un des tableaux d'assets ci-dessus,
 *  jamais une copie. */
interface CatalogSection {
  label?: string;
  assets: AssetEntry[];
  /** Teinte d'une structure decorative, ajoutee a son nom affiche pour ne
   *  jamais la confondre avec un batiment de jeu (Mine, Caserne, Forge
   *  achetes en run). Presentation seulement. */
  tint?: 'bleu' | 'rouge' | 'neutre';
}

interface CatalogCategory {
  label: string;
  /** Ouverte au premier affichage ; les autres sont repliees. */
  open: boolean;
  sections: CatalogSection[];
}

/**
 * Categories du catalogue des decors (E2). Rangement seulement : les donnees
 * restent les tableaux ci-dessus, et la collision affichee (Bloquant /
 * Traversable) vient de isCollidableObstacle, comme en jeu. Les
 * « Structures décoratives » (modeles KayKit) sont des obstacles bloquants
 * sans PV ni effet, jamais des batiments de jeu.
 */
const DECOR_CATALOG: CatalogCategory[] = [
  {
    label: 'Obstacles',
    open: true,
    sections: [
      { label: 'Rochers', assets: ROCK_ASSETS },
      { label: 'Arbres', assets: TREE_ASSETS },
    ],
  },
  {
    label: 'Végétation',
    open: false,
    sections: [
      { label: 'Buissons et plantes', assets: BUSH_ASSETS },
      { label: 'Champignons', assets: MUSHROOM_ASSETS },
    ],
  },
  { label: 'Fleurs', open: false, sections: [{ assets: FLOWER_ASSETS }] },
  { label: 'Bois', open: false, sections: [{ assets: WOOD_ASSETS }] },
  { label: 'Accessoires', open: false, sections: [{ assets: KAYKIT_PROP_ASSETS }] },
  { label: 'Nature', open: false, sections: [{ assets: KAYKIT_NATURE_ASSETS }] },
  {
    label: 'Structures décoratives',
    open: false,
    sections: [
      { label: 'Teinte bleue', assets: BLUE_BUILDING_ASSETS, tint: 'bleu' },
      { label: 'Teinte rouge', assets: RED_BUILDING_ASSETS, tint: 'rouge' },
      { label: 'Neutres', assets: NEUTRAL_BUILDING_ASSETS, tint: 'neutre' },
    ],
  },
  { label: 'Divers', open: false, sections: [{ assets: MISC_DECOR_ASSETS }] },
];

/** Minuscules sans accents, pour une recherche tolerante. */
function normalizeSearch(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

interface AssetPresentation {
  /** Nom affiche (lisible, sans taille ni prefixe de pack). */
  name: string;
  /** Ligne secondaire : taille ou emprise, puis collision. */
  size: string;
  blocking: boolean;
  /** Texte normalise ou chercher : nom, libelle d'origine, identifiant
   *  technique, categorie et section. */
  search: string;
}

/** Presentation d'une entree du catalogue, derivee de son libelle et de son
 *  gabarit existants (aucune donnee modifiee). La taille deja ecrite dans
 *  le libelle d'un prop ("(0.2 case)") passe sur la ligne secondaire ;
 *  sinon c'est l'emprise en cases. */
function presentAsset(asset: AssetEntry, section: CatalogSection, category: CatalogCategory): AssetPresentation {
  const template = asset.template;
  let name = asset.label;
  let size = `${template.tilesX}×${template.tilesZ}`;
  const caseSize = /\s*\(([\d.]+) case\)$/.exec(name);
  if (caseSize) {
    name = name.slice(0, caseSize.index);
    size = `${caseSize[1]!.replace('.', ',')} case`;
  }
  name = name.replace(/^KayKit — /, '');
  if (template.kind === 'rock') name = 'Rocher';
  if (section.tint) name = `${name.replace(/ \((bleu|rouge)\)$/, '')} — décor ${section.tint}`;
  const blocking = isCollidableObstacle(template as ObstacleDef);
  const id = template.treeModel ?? template.propModel ?? template.buildingModel ?? template.kind;
  return {
    name,
    size,
    blocking,
    search: normalizeSearch([name, asset.label, id, section.label ?? '', category.label].join(' ')),
  };
}

/** Ce que le panneau de proprietes sait d'un decor : la presentation du
 *  catalogue (meme nom, taille et collision) et sa categorie. */
interface DecorInfo {
  presentation: AssetPresentation;
  category: string;
  /** Structure decorative (modele KayKit bleu/rouge/neutre). */
  structure: boolean;
}

/** Cle d'un decor : son type et son modele (ou son emprise pour un rocher),
 *  commune aux gabarits du catalogue et aux obstacles poses ou charges. */
function decorKey(o: Pick<ObstacleDef, 'kind' | 'treeModel' | 'propModel' | 'buildingModel' | 'tilesX' | 'tilesZ'>): string {
  return `${o.kind}:${o.treeModel ?? o.propModel ?? o.buildingModel ?? `${o.tilesX}x${o.tilesZ}`}`;
}

/** Index des decors du catalogue, construit une fois depuis DECOR_CATALOG. */
const DECOR_INFO = new Map<string, DecorInfo>();
for (const category of DECOR_CATALOG) {
  for (const section of category.sections) {
    for (const asset of section.assets) {
      DECOR_INFO.set(decorKey(asset.template), {
        presentation: presentAsset(asset, section, category),
        category: section.label ? `${category.label} · ${section.label}` : category.label,
        structure: section.tint !== undefined,
      });
    }
  }
}

/** Presentation d'un obstacle pose ; un modele absent du catalogue (carte
 *  chargee) garde son identifiant comme nom. */
function describeDecor(obstacle: ObstacleDef): DecorInfo {
  const known = DECOR_INFO.get(decorKey(obstacle));
  if (known) return known;
  const id = obstacle.treeModel ?? obstacle.propModel ?? obstacle.buildingModel ?? obstacle.kind;
  const blocking = isCollidableObstacle(obstacle);
  return { presentation: { name: id, size: `${obstacle.tilesX}×${obstacle.tilesZ}`, blocking, search: '' }, category: 'Hors catalogue', structure: false };
}

/** Selection decrite par le panneau de proprietes (voir showProperties). */
export type PropertiesSubject =
  | { kind: 'none' }
  /** `rotationRad` : orientation reellement affichee (voir main.ts,
   *  currentObstacleRotation), pas seulement rotationY. */
  | { kind: 'obstacle'; obstacle: EditorObstacle; rotationRad: number }
  /** `territory` : proprietaire actuel de la case de chaque unite. */
  | { kind: 'units'; units: { unit: EditorUnit; territory: TerritoryTeam | null }[] }
  | { kind: 'ballista'; x: number; z: number };

interface PropertiesView {
  name: string;
  kind: string;
  /** Identifiant technique, en info-bulle seulement. */
  technicalId?: string;
  sections: { label: string; rows: [string, string][]; notes: string[] }[];
  actions: ('rotate' | 'delete')[];
}

function teamName(team: TerritoryTeam | null): string {
  return team === 'player' ? 'Joueur' : team === 'enemy' ? 'Ennemi' : 'Neutre';
}

/** Coordonnee lisible : au plus deux decimales, virgule decimale. */
function formatCoord(value: number): string {
  return String(Number(value.toFixed(2))).replace('.', ',');
}

/** Contenu du panneau pour une selection. */
function describeProperties(subject: PropertiesSubject): PropertiesView {
  const teamNote = 'Le camp est déterminé par le territoire lors de la pose ou du déplacement.';
  switch (subject.kind) {
    case 'none':
      return { name: 'Aucune sélection', kind: '', sections: [{ label: '', rows: [], notes: ['Sélectionnez un objet ou une unité sur la carte.'] }], actions: [] };
    case 'obstacle': {
      const o = subject.obstacle;
      const info = describeDecor(o);
      const center = obstacleCenter(o);
      // Toujours entre 0 et 359 (un arrondi de 359,6° donnerait sinon 360).
      const degrees = ((Math.round((subject.rotationRad * 180) / Math.PI) % 360) + 360) % 360;
      return {
        name: info.presentation.name,
        kind: info.structure ? 'Structure décorative' : 'Décor',
        technicalId: o.treeModel ?? o.propModel ?? o.buildingModel ?? o.kind,
        sections: [
          {
            label: info.structure ? 'Structure' : 'Décor',
            rows: [
              ['Catégorie', info.category],
              ['Taille', info.presentation.size],
              ['Collision', info.presentation.blocking ? 'Bloquant' : 'Traversable'],
            ],
            notes: info.structure ? ['Aucun effet de jeu : simple obstacle.'] : [],
          },
          { label: 'Position', rows: [['X', formatCoord(center.x)], ['Z', formatCoord(center.z)]], notes: [] },
          { label: 'Rotation', rows: [['Angle', `${degrees}°`]], notes: [] },
        ],
        actions: ['rotate', 'delete'],
      };
    }
    case 'units': {
      const units = subject.units;
      if (units.length === 1) {
        const { unit, territory } = units[0]!;
        const rows: [string, string][] = [['Camp', teamName(unit.team)]];
        if (territory !== unit.team) rows.push(['Territoire actuel', teamName(territory)]);
        return {
          name: UNITS[unit.unitId]?.name ?? unit.unitId,
          kind: 'Unité du scénario',
          sections: [
            { label: 'Camp', rows, notes: [teamNote] },
            { label: 'Position', rows: [['X', formatCoord(unit.x)], ['Z', formatCoord(unit.z)]], notes: [] },
          ],
          actions: ['delete'],
        };
      }
      const byType = new Map<string, number>();
      for (const { unit } of units) byType.set(unit.unitId, (byType.get(unit.unitId) ?? 0) + 1);
      const players = units.filter((u) => u.unit.team === 'player').length;
      const enemies = units.length - players;
      const campRows: [string, string][] =
        players === 0 || enemies === 0 ? [['Camp', players > 0 ? 'Joueur' : 'Ennemi']] : [['Joueur', `${players}`], ['Ennemi', `${enemies}`]];
      const misplaced = units.filter((u) => u.territory !== u.unit.team).length;
      if (misplaced > 0) campRows.push(['Hors de leur territoire', `${misplaced}`]);
      return {
        name: `${units.length} unités sélectionnées`,
        kind: 'Unités du scénario',
        sections: [
          { label: 'Composition', rows: [...byType].map(([id, n]) => [UNITS[id]?.name ?? id, `×${n}`] as [string, string]), notes: [] },
          { label: 'Camp', rows: campRows, notes: [teamNote] },
        ],
        actions: ['delete'],
      };
    }
    case 'ballista':
      return {
        name: 'Baliste',
        kind: 'Objectif gameplay',
        sections: [
          { label: 'Camp', rows: [['Camp', 'Joueur']], notes: [] },
          { label: 'Position', rows: [['X', formatCoord(subject.x)], ['Z', formatCoord(subject.z)]], notes: [] },
          { label: 'Emprise', rows: [['Placement', '3×3']], notes: ['Placement : l’empreinte entière doit être en territoire joueur.'] },
        ],
        actions: [],
      };
  }
}

/** Etat d'affichage d'une categorie du catalogue (voir applyCatalogFilter). */
interface CatalogCategoryView {
  category: CatalogCategory;
  toggle: HTMLButtonElement;
  count: HTMLElement;
  body: HTMLElement;
  total: number;
  /** Ouverte hors recherche (bascule par l'utilisateur). */
  open: boolean;
  /** Ouverte pendant la recherche en cours (toutes le sont a chaque
   *  nouvelle recherche ; l'utilisateur peut en replier une). */
  openInSearch: boolean;
  sections: { header: HTMLElement | null; entries: { button: HTMLButtonElement; search: string }[] }[];
}

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
  /** Contenu actuellement affiche par le panneau (evite de reconstruire le
   *  DOM a chaque rafraichissement, par exemple pendant un glisser). */
  private propertiesKey = '';
  private readonly handlers: EditorUIHandlers;
  private readonly widthInput: HTMLInputElement;
  private readonly heightInput: HTMLInputElement;
  private readonly statusLine: HTMLElement;

  // Boutons d'outils, pour la mise en surbrillance de l'outil actif (voir
  // syncTool) — l'etat de l'outil reste celui d'EditorState.tool.
  private readonly selectButton: HTMLButtonElement;
  private readonly addGrassButton: HTMLButtonElement;
  private readonly addDirtButton: HTMLButtonElement;
  private readonly removeCellButton: HTMLButtonElement;
  private readonly territoryButton: HTMLButtonElement;
  private readonly territoryValueButtons = new Map<TerritoryTeam | null, HTMLButtonElement>();
  private readonly unitCards = new Map<string, HTMLButtonElement>();
  private readonly assetCards = new Map<PlacementTemplate, { button: HTMLButtonElement; label: string }>();
  /** Camp que reprend le bouton "Peindre le territoire" : le dernier choisi. */
  private territoryValue: TerritoryTeam | null = 'player';
  private activeButtons: HTMLButtonElement[] = [];
  private testMode = false;
  /** Catalogue des decors : recherche et categories repliables (E2). Le
   *  filtrage ne touche qu'au DOM du catalogue. */
  private readonly searchInput: HTMLInputElement;
  private readonly catalogEmpty: HTMLElement;
  private readonly catalogViews: CatalogCategoryView[] = [];

  constructor(handlers: EditorUIHandlers) {
    this.handlers = handlers;
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

    // Outil Selection : toujours visible (colle en haut de la colonne, meme
    // quand le catalogue defile). Echap et clic droit y ramenent aussi.
    const pinned = document.createElement('div');
    pinned.className = 'editor-tools-pinned';
    this.selectButton = this.toolCard('Sélection', handlers.onSelectSelectTool);
    this.selectButton.title = 'V';
    pinned.appendChild(this.selectButton);
    browser.appendChild(pinned);

    // Carte : taille du plateau et cases de terrain (outils repetables).
    browser.appendChild(this.groupHeader('Carte'));
    browser.appendChild(this.categoryHeader('Taille'));
    const sizeRow = document.createElement('div');
    sizeRow.className = 'editor-size-row';
    this.widthInput = document.createElement('input');
    this.widthInput.type = 'number';
    this.widthInput.min = '1';
    this.widthInput.className = 'editor-size-input';
    this.widthInput.setAttribute('aria-label', 'Largeur');
    const sizeSeparator = document.createElement('span');
    sizeSeparator.className = 'editor-size-separator';
    sizeSeparator.textContent = '×';
    this.heightInput = document.createElement('input');
    this.heightInput.type = 'number';
    this.heightInput.min = '1';
    this.heightInput.className = 'editor-size-input';
    this.heightInput.setAttribute('aria-label', 'Hauteur');
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
    sizeRow.append(this.widthInput, sizeSeparator, this.heightInput, applySizeButton);
    browser.appendChild(sizeRow);
    browser.appendChild(this.categoryHeader('Cases'));
    this.addGrassButton = this.toolCard('+ Case (Herbe)', () => handlers.onSelectAddCellTool('grass'));
    this.addDirtButton = this.toolCard('+ Case (Terre)', () => handlers.onSelectAddCellTool('dirt'));
    this.removeCellButton = this.toolCard('− Supprimer case', handlers.onSelectRemoveCellTool);
    this.removeCellButton.classList.add('editor-asset-card--danger');
    browser.append(this.addGrassButton, this.addDirtButton, this.removeCellButton);

    // Territoire : UN outil (le pinceau) et une valeur (le camp peint).
    browser.appendChild(this.groupHeader('Territoire'));
    this.territoryButton = this.toolCard('Peindre le territoire', () => handlers.onSelectTerritoryTool(this.territoryValue));
    browser.appendChild(this.territoryButton);
    const segmented = document.createElement('div');
    segmented.className = 'editor-segmented';
    for (const [label, team] of [
      ['Joueur', 'player'],
      ['Ennemi', 'enemy'],
      ['Neutre', null],
    ] as const) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'editor-segment';
      const swatch = document.createElement('span');
      swatch.className = 'editor-swatch';
      if (team) swatch.style.background = `#${teamColor(team).toString(16).padStart(6, '0')}`;
      else swatch.classList.add('editor-swatch--neutral');
      button.append(swatch, label);
      button.addEventListener('click', () => handlers.onSelectTerritoryTool(team));
      this.territoryValueButtons.set(team, button);
      segmented.appendChild(button);
    }
    browser.appendChild(segmented);
    const legend = document.createElement('div');
    legend.className = 'editor-legend';
    legend.textContent = 'Bleu : unités joueur · Rouge : unités ennemies · Neutre : aucune unité · Baliste : 3×3 en territoire joueur';
    browser.appendChild(legend);

    browser.appendChild(this.groupHeader('Unités'));
    browser.appendChild(this.categoryHeader('Bestiaire'));
    for (const unit of UNIT_ASSETS) browser.appendChild(this.unitAssetCard(unit, handlers.onSelectUnit));

    // Decors (E2) : recherche + categories repliables.
    browser.appendChild(this.groupHeader('Décors'));
    this.searchInput = document.createElement('input');
    this.searchInput.type = 'search';
    this.searchInput.className = 'editor-search';
    this.searchInput.placeholder = 'Rechercher un décor…';
    this.searchInput.setAttribute('aria-label', 'Rechercher un décor');
    this.searchInput.addEventListener('input', () => {
      for (const view of this.catalogViews) view.openInSearch = true;
      this.applyCatalogFilter();
    });
    browser.appendChild(this.searchInput);
    for (const category of DECOR_CATALOG) browser.appendChild(this.catalogCategory(category, handlers.onSelectTemplate));
    this.catalogEmpty = document.createElement('div');
    this.catalogEmpty.className = 'editor-catalog-empty';
    this.catalogEmpty.hidden = true;
    browser.appendChild(this.catalogEmpty);
    this.applyCatalogFilter();
    this.root.appendChild(browser);

    // Proprietes (E3) : panneau toujours present, contenu selon la selection
    // (voir showProperties).
    this.propertiesPanel = document.createElement('div');
    this.propertiesPanel.className = 'editor-properties';
    const propertiesTitle = document.createElement('div');
    propertiesTitle.className = 'editor-properties-title';
    propertiesTitle.textContent = 'Propriétés';
    this.propertiesPanel.appendChild(propertiesTitle);
    this.propertiesBody = document.createElement('div');
    this.propertiesBody.className = 'editor-properties-body';
    this.propertiesPanel.appendChild(this.propertiesBody);
    this.root.appendChild(this.propertiesPanel);
    this.hideProperties();

    // Ligne d'etat CONTEXTUELLE : outil actif et gestes utiles (voir
    // syncTool), ou le test du scenario (voir setTestMode).
    const status = document.createElement('div');
    status.className = 'editor-status';
    this.statusLine = document.createElement('div');
    status.appendChild(this.statusLine);
    this.root.appendChild(status);

    document.body.appendChild(this.root);
  }

  setVisible(visible: boolean): void {
    this.root.style.display = visible ? '' : 'none';
  }

  /** Reflete l'outil actif (EditorState.tool) : surbrillance du bouton
   *  correspondant et ligne d'etat contextuelle. Appele apres chaque
   *  rafraichissement de l'editeur (voir main.ts, refreshEditorObjects). */
  syncTool(tool: EditorTool, selection: EditorSelection): void {
    if (this.testMode) return;
    if (tool.type === 'paint-territory') this.territoryValue = tool.team;
    const active: HTMLButtonElement[] = [];
    let status: string;
    switch (tool.type) {
      case 'select':
        active.push(this.selectButton);
        status = selectStatus(selection);
        break;
      case 'place-unit': {
        const card = this.unitCards.get(tool.unitId);
        if (card) active.push(card);
        status = `Outil : Unité — ${UNITS[tool.unitId]?.name ?? tool.unitId} · Clic : poser (camp = territoire de la case, neutre interdit) · Échap : Sélection`;
        break;
      }
      case 'place-obstacle': {
        const entry = this.assetCards.get(tool.template);
        if (entry) active.push(entry.button);
        status = `Outil : Décor — ${entry?.label ?? 'objet'} · Clic : poser · Échap : Sélection`;
        break;
      }
      case 'add-cell':
        active.push(tool.terrain === 'grass' ? this.addGrassButton : this.addDirtButton);
        status = `Outil : + Case — ${tool.terrain === 'grass' ? 'Herbe' : 'Terre'} · Clic : ajouter une case · Échap : Sélection`;
        break;
      case 'remove-cell':
        active.push(this.removeCellButton);
        status = 'Outil : − Case · Clic : supprimer une case · Échap : Sélection';
        break;
      case 'paint-territory': {
        active.push(this.territoryButton);
        const value = this.territoryValueButtons.get(tool.team);
        if (value) active.push(value);
        const name = tool.team === 'player' ? 'Joueur' : tool.team === 'enemy' ? 'Ennemi' : 'Neutre';
        status = `Outil : Territoire — ${name} · Clic / glisser : peindre · 1 / 2 / 3 : Joueur / Ennemi / Neutre · Échap : Sélection`;
        break;
      }
    }
    for (const button of this.activeButtons) {
      if (active.includes(button)) continue;
      button.classList.remove('is-active');
      button.setAttribute('aria-pressed', 'false');
    }
    for (const button of active) {
      button.classList.add('is-active');
      button.setAttribute('aria-pressed', 'true');
    }
    this.activeButtons = active;
    if (this.statusLine.textContent !== status) this.statusLine.textContent = status;
  }

  /** Pendant "Tester le scénario" : seule la ligne d'etat reste affichee,
   *  avec la facon de revenir a l'editeur. */
  setTestMode(active: boolean): void {
    this.testMode = active;
    this.root.classList.toggle('editor-ui--testing', active);
    if (active) this.statusLine.textContent = 'Test du scénario · Échap : revenir à l’éditeur';
  }

  /** Synchronise les champs largeur/hauteur avec l'etat reel — appele en
   *  entrant dans l'editeur et apres le chargement d'une carte, pour ne
   *  jamais laisser les champs afficher une taille perimee. */
  setMapSize(width: number, height: number): void {
    this.widthInput.value = String(width);
    this.heightInput.value = String(height);
  }

  /** Panneau de proprietes (E3) : toujours present, il decrit la selection
   *  courante. Appele a chaque rafraichissement de l'editeur (voir main.ts,
   *  refreshEditorObjects) ; le DOM n'est reconstruit que si le contenu
   *  change. Les actions appellent les operations existantes de l'editeur. */
  showProperties(subject: PropertiesSubject): void {
    const view = describeProperties(subject);
    const key = JSON.stringify(view);
    if (key === this.propertiesKey) return;
    this.propertiesKey = key;
    const body = this.propertiesBody;
    body.replaceChildren();

    const name = document.createElement('div');
    name.className = 'editor-prop-name';
    name.textContent = view.name;
    if (view.technicalId) name.title = view.technicalId;
    body.appendChild(name);
    if (view.kind) {
      const kind = document.createElement('div');
      kind.className = 'editor-prop-kind';
      kind.textContent = view.kind;
      body.appendChild(kind);
    }

    for (const section of view.sections) {
      const el = document.createElement('div');
      el.className = 'editor-prop-section';
      if (section.label) {
        const label = document.createElement('div');
        label.className = 'editor-prop-label';
        label.textContent = section.label;
        el.appendChild(label);
      }
      for (const [key, value] of section.rows) {
        const row = document.createElement('div');
        row.className = 'editor-prop-row';
        const k = document.createElement('span');
        k.className = 'editor-prop-key';
        k.textContent = key;
        const v = document.createElement('span');
        v.className = 'editor-prop-value';
        v.textContent = value;
        v.title = value;
        row.append(k, v);
        el.appendChild(row);
      }
      for (const note of section.notes) {
        const n = document.createElement('div');
        n.className = 'editor-prop-note';
        n.textContent = note;
        el.appendChild(n);
      }
      body.appendChild(el);
    }

    if (view.actions.length > 0) {
      const actions = document.createElement('div');
      actions.className = 'editor-prop-section';
      const label = document.createElement('div');
      label.className = 'editor-prop-label';
      label.textContent = 'Actions';
      actions.appendChild(label);
      if (view.actions.includes('rotate')) {
        const row = document.createElement('div');
        row.className = 'editor-prop-buttons';
        row.append(
          this.propertyButton('−15°', () => this.handlers.onRotateBy(-15)),
          this.propertyButton('+15°', () => this.handlers.onRotateBy(15)),
          this.propertyButton('+90° (R)', this.handlers.onRotate),
        );
        actions.appendChild(row);
      }
      if (view.actions.includes('delete')) {
        const del = this.propertyButton('Supprimer (Suppr)', this.handlers.onDelete);
        del.classList.add('editor-button--danger', 'editor-prop-delete');
        actions.appendChild(del);
      }
      body.appendChild(actions);
    }
  }

  /** Aucune selection (panneau toujours present). */
  hideProperties(): void {
    this.showProperties({ kind: 'none' });
  }

  private propertyButton(label: string, onClick: () => void): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'editor-button';
    button.textContent = label;
    button.addEventListener('click', onClick);
    return button;
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

  /** Categorie repliable du catalogue : en-tete (bascule) et contenu. */
  private catalogCategory(category: CatalogCategory, onSelect: (template: PlacementTemplate) => void): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.className = 'editor-catalog-category';
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'editor-catalog-toggle';
    const label = document.createElement('span');
    label.className = 'editor-catalog-label';
    label.textContent = category.label;
    const count = document.createElement('span');
    count.className = 'editor-catalog-count';
    toggle.append(label, count);
    const body = document.createElement('div');
    body.className = 'editor-catalog-body';
    const view: CatalogCategoryView = { category, toggle, count, body, total: 0, open: category.open, openInSearch: true, sections: [] };
    for (const section of category.sections) {
      const header = section.label ? this.categoryHeader(section.label) : null;
      if (header) body.appendChild(header);
      const entries = section.assets.map((asset) => {
        const presentation = presentAsset(asset, section, category);
        const button = this.assetCard(asset, presentation, onSelect);
        body.appendChild(button);
        return { button, search: presentation.search };
      });
      view.total += entries.length;
      view.sections.push({ header, entries });
    }
    toggle.addEventListener('click', () => {
      if (this.searchInput.value.trim()) view.openInSearch = !view.openInSearch;
      else view.open = !view.open;
      this.applyCatalogFilter();
    });
    this.catalogViews.push(view);
    wrapper.append(toggle, body);
    return wrapper;
  }

  /** Applique la recherche et l'etat replie/ouvert : sans recherche, chaque
   *  categorie suit sa bascule ; avec une recherche, seules les entrees qui
   *  correspondent restent, et les categories qui en contiennent s'ouvrent
   *  (sans changer leur etat hors recherche). Tous les mots doivent figurer
   *  dans le texte de l'entree. */
  private applyCatalogFilter(): void {
    const query = this.searchInput.value.trim();
    const words = normalizeSearch(query).split(/\s+/).filter(Boolean);
    let found = 0;
    for (const view of this.catalogViews) {
      let matches = 0;
      for (const section of view.sections) {
        let sectionMatches = 0;
        for (const entry of section.entries) {
          const match = words.every((w) => entry.search.includes(w));
          entry.button.hidden = !match;
          if (match) sectionMatches++;
        }
        if (section.header) section.header.hidden = sectionMatches === 0;
        matches += sectionMatches;
      }
      found += matches;
      const searching = words.length > 0;
      const expanded = searching ? matches > 0 && view.openInSearch : view.open;
      view.toggle.hidden = searching && matches === 0;
      view.body.hidden = !expanded;
      view.toggle.setAttribute('aria-expanded', String(expanded));
      view.toggle.classList.toggle('is-open', expanded);
      view.count.textContent = searching ? `${matches}` : `${view.total}`;
    }
    this.catalogEmpty.hidden = !(words.length > 0 && found === 0);
    this.catalogEmpty.textContent = `Aucun décor ne correspond à « ${query} ».`;
  }

  private assetCard(asset: AssetEntry, presentation: AssetPresentation, onSelect: (template: PlacementTemplate) => void): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'editor-asset-card editor-decor-card';
    const name = document.createElement('span');
    name.className = 'editor-asset-name';
    name.textContent = presentation.name;
    const meta = document.createElement('span');
    meta.className = 'editor-asset-meta';
    const badge = document.createElement('span');
    badge.className = presentation.blocking ? 'editor-badge editor-badge--blocking' : 'editor-badge';
    badge.textContent = presentation.blocking ? 'Bloquant' : 'Traversable';
    meta.append(`${presentation.size} · `, badge);
    button.append(name, meta);
    button.title = presentation.name;
    button.setAttribute('aria-label', `${presentation.name} — ${presentation.size} · ${badge.textContent}`);
    button.addEventListener('click', () => onSelect(asset.template));
    this.assetCards.set(asset.template, { button, label: `${presentation.name} (${presentation.size}, ${badge.textContent.toLowerCase()})` });
    return button;
  }

  private toolCard(label: string, onSelect: () => void): HTMLButtonElement {
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
    this.unitCards.set(unit.unitId, button);
    return button;
  }
}

/** Ligne d'etat de l'outil Selection, selon ce qui est selectionne. */
function selectStatus(selection: EditorSelection): string {
  if (!selection) return 'Outil : Sélection · Clic : sélectionner · Glisser : sélection multiple · Ctrl+Z / Ctrl+Y : annuler / rétablir · Maj+clic droit : tourner la vue';
  switch (selection.kind) {
    case 'obstacle':
      return 'Outil : Sélection — décor · Flèches : déplacer · Anneau ou Ctrl+molette : tourner · R : +90° · Suppr : supprimer · Échap : désélectionner';
    case 'unit':
    case 'unit-group': {
      const count = selection.kind === 'unit' ? 1 : selection.ids.length;
      return `Outil : Sélection — ${count} unité${count > 1 ? 's' : ''} · Clic au sol : déplacer (camp = territoire d'arrivée) · Suppr : supprimer · Échap : désélectionner`;
    }
    case 'ballista':
      return 'Outil : Sélection — Baliste · Clic au sol : déplacer (3×3 en territoire joueur) · Échap : désélectionner';
  }
}
