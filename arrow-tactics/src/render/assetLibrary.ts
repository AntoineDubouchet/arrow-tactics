import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MTLLoader } from 'three/addons/loaders/MTLLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import type { ObstacleDef } from '../config/constants';

/**
 * Chargement des modeles de decor (rochers, arbres) : de vrais fichiers .glb,
 * pas de la geometrie generee par code. Revirement assume et documente dans
 * CLAUDE.md ("Décor : assets .glb importés") — deux tentatives procedurales
 * (boites empilees, puis masses facettees par deplacement aleatoire de
 * sommets) ont ete jugees insatisfaisantes par Antoine : la premiere restait
 * trop "Minecraft", la seconde produisait du bruit geometrique (un tas de
 * debris) plutot qu'une masse rocheuse lisible. Plutot que d'ecrire un
 * troisieme algorithme de modelisation procedurale a l'aveugle (je n'ai pas
 * d'acces visuel au rendu pendant que je code), on utilise de vrais modeles
 * low-poly deja concus par un artiste.
 *
 * Source : Kenney "Nature Kit" (kenney.nl/assets/nature-kit), licence CC0
 * (domaine public, aucune attribution requise). Fichiers copies tels quels
 * (deja au format .glb) dans public/models/nature/. Aucun autre asset
 * graphique n'est utilise ailleurs dans le jeu (unites, sol, textures restent
 * generes par le code).
 */

// Active le cache global Three.js (2026-08-14, chantier batiments) : les
// ~64 fichiers .mtl des batiments (voir BUILDINGS_BASE_PATH plus bas)
// referencent tous la MEME texture partagee `hexagons_medieval.png` — sans
// ce cache, MTLLoader relancerait un fetch/decodage independant pour
// chaque .mtl charge au demarrage. Cache par URL, partage par TOUS les
// loaders (Texture/GLTF/MTL...), sans effet negatif sur ce qui etait deja
// charge avant.
THREE.Cache.enabled = true;

const MODEL_BASE_PATH = '/models/nature/';
/** Deuxieme source de decor (2026-08-14, demande d'Antoine : "j'ai mis une
 *  grosse library d'asset et de texture ici... intègre de la meilleure
 *  façon cela pour l'instant" — le pack complet sera retravaille plus tard,
 *  cette premiere passe se limite aux props/elements nature qui tiennent
 *  naturellement dans une case, voir KAYKIT_MODELS ci-dessous). Format
 *  .gltf (JSON) + .bin + texture partagee `hexagons_medieval.png`
 *  referencee en chemin RELATIF depuis chaque .gltf — d'ou l'obligation de
 *  copier la texture dans le MEME dossier que les .gltf/.bin (voir
 *  public/models/kaykit/), contrairement au Nature Kit (.glb autonomes). */
const KAYKIT_BASE_PATH = '/models/kaykit/';

const loader = new GLTFLoader();
const rawCache = new Map<string, Promise<THREE.Group>>();

function loadModel(name: string): Promise<THREE.Group> {
  let pending = rawCache.get(name);
  if (!pending) {
    pending = loader.loadAsync(`${MODEL_BASE_PATH}${name}.glb`).then((gltf) => gltf.scene);
    rawCache.set(name, pending);
  }
  return pending;
}

/** Meme principe que loadModel, mais `.gltf` (pas `.glb`) et un dossier
 *  distinct (voir KAYKIT_BASE_PATH) — mis en cache separement (cle prefixee
 *  `kaykit:`) pour ne jamais entrer en collision avec un nom Kenney identique. */
function loadKaykitModel(name: string): Promise<THREE.Group> {
  const cacheKey = `kaykit:${name}`;
  let pending = rawCache.get(cacheKey);
  if (!pending) {
    pending = loader.loadAsync(`${KAYKIT_BASE_PATH}${name}.gltf`).then((gltf) => gltf.scene);
    rawCache.set(cacheKey, pending);
  }
  return pending;
}

/**
 * Masses principales/secondaires d'un rocher : UNIQUEMENT des modeles
 * effectivement larges et bas (voir rocks.ts). Verifie par mesure directe
 * des boites englobantes de chaque fichier .glb (pas a l'oeil) : rock_largeA-F
 * ont un ratio largeur/hauteur de 1.9 a 3.9 (bas et etales), alors que
 * rock_tallA-J ont un ratio de 0.6 a 1.2 (aussi hauts que larges, voire plus
 * hauts) — inclure ces derniers dans la meme banque produisait exactement le
 * look "totem/empilement vertical" reproche par Antoine. Ne jamais remettre
 * les rock_tall* dans cette liste sans reverifier leurs proportions.
 */
const ROCK_MASS_MODELS = ['rock_largeA', 'rock_largeB', 'rock_largeC', 'rock_largeD', 'rock_largeE', 'rock_largeF'];

/**
 * Sous-ensemble de ROCK_MASS_MODELS naturellement le plus haut (ratio
 * largeur/hauteur mesure) : rock_largeD (0.53), rock_largeF (0.44),
 * rock_largeB (0.42) — les trois autres (A 0.26, C 0.30, E 0.26) restent trop
 * plats pour la masse PRINCIPALE une fois mis a l'echelle sur la largeur.
 * Cible d'Antoine : hauteur visuelle finale autour de 40-60 % de la largeur
 * de la masse principale. Reservee a la masse principale et, si choisie, a
 * la secondaire — jamais de scale non-uniforme sur un .glb pour "forcer" la
 * hauteur, ca le deformerait ; on choisit plutot le bon modele des le depart.
 */
const ROCK_TALL_MASS_MODELS = ['rock_largeB', 'rock_largeD', 'rock_largeF'];

/** Dalles tres plates (ratio 6.6 a 7.6), utilisees en accent secondaire pour
 *  renforcer la lecture "grande face horizontale" a cote de la masse
 *  principale — jamais comme masse principale, trop fines pour ca. */
const ROCK_FLAT_ACCENT_MODELS = ['rock_smallFlatA', 'rock_smallFlatB', 'rock_smallFlatC'];

/** Petites pierres eparpillees au pied d'un rocher. */
const ROCK_DEBRIS_MODELS = [
  'rock_smallA',
  'rock_smallB',
  'rock_smallC',
  'rock_smallD',
  'rock_smallE',
  'rock_smallF',
  'rock_smallG',
  'rock_smallH',
  'rock_smallI',
];

/** Un seul modele complet par arbre (tronc + cime deja composes par
 *  l'artiste) — plus besoin de fabriquer tronc/branches/cime separement.
 *  Reste le pool utilise par le tirage ALEATOIRE (pickRandom, voir
 *  createTreeObstacle) pour les obstacles sans `treeModel` explicite : ne
 *  JAMAIS y ajouter les variantes ci-dessous sans revalider avec Antoine —
 *  un obstacle deja place sur DEFAULT_MAP sans modele impose changerait
 *  d'apparence au hasard des qu'on elargit ce pool. */
const TREE_MODELS = ['tree_default', 'tree_detailed', 'tree_oak', 'tree_fat', 'tree_blocks'];

/**
 * Variantes d'arbres supplementaires importees du Kenney Nature Kit complet
 * (2026-08-08, demande d'Antoine : "importer un maximum d'elements
 * interessants") — jamais ajoutees a TREE_MODELS/pickRandom (voir note
 * ci-dessus), seulement a `treesByName` : accessibles uniquement en les
 * designant explicitement (asset browser de l'editeur, ou `treeModel` a la
 * main). Les variantes de teinte "_dark"/"_fall" du kit ont ete ecartees
 * (palette d'ete coherente avec les textures de sol actuelles) — seules les
 * formes differentes ont ete gardees ; a reconsiderer si Antoine veut un
 * decor d'automne plus tard.
 */
const EXTRA_TREE_MODELS = [
  'tree_cone',
  'tree_plateau',
  'tree_simple',
  'tree_small',
  'tree_tall',
  'tree_thin',
  'tree_palm',
  'tree_palmBend',
  'tree_palmDetailedShort',
  'tree_palmDetailedTall',
  'tree_palmShort',
  'tree_palmTall',
  'tree_pineDefaultA',
  'tree_pineDefaultB',
  'tree_pineGroundA',
  'tree_pineGroundB',
  'tree_pineRoundA',
  'tree_pineRoundB',
  'tree_pineRoundC',
  'tree_pineRoundD',
  'tree_pineRoundE',
  'tree_pineRoundF',
  'tree_pineSmallA',
  'tree_pineSmallB',
  'tree_pineSmallC',
  'tree_pineSmallD',
  'tree_pineTallA',
  'tree_pineTallA_detailed',
  'tree_pineTallB',
  'tree_pineTallB_detailed',
  'tree_pineTallC',
  'tree_pineTallC_detailed',
  'tree_pineTallD',
  'tree_pineTallD_detailed',
];

/**
 * Props independants (un seul modele .glb chacun, mis a l'echelle sur sa
 * largeur comme un rocher plutot que sur sa hauteur comme un arbre — voir
 * render/props.ts) : buches, souches, champignons, buissons, fleurs, cactus,
 * feux de camp, statues, pots, panneau, tentes. Meme provenance/licence que
 * le reste (Kenney Nature Kit, CC0). Cliffs, ponts, cultures, chemins/
 * rivieres et plateformes du kit ecartes : ce sont des systemes de tuiles de
 * terrain, pas des obstacles a emprise unique — hors sujet tant que la
 * peinture de terrain (etape 5 du chantier editeur) n'existe pas.
 */
const PROP_MODELS = [
  'log',
  'log_large',
  'log_stack',
  'log_stackLarge',
  'stump_old',
  'stump_oldTall',
  'stump_round',
  'stump_roundDetailed',
  'stump_square',
  'stump_squareDetailed',
  'stump_squareDetailedWide',
  'mushroom_red',
  'mushroom_redGroup',
  'mushroom_redTall',
  'mushroom_tan',
  'mushroom_tanGroup',
  'mushroom_tanTall',
  'plant_bush',
  'plant_bushDetailed',
  'plant_bushLarge',
  'plant_bushLargeTriangle',
  'plant_bushSmall',
  'plant_bushTriangle',
  'plant_flatShort',
  'plant_flatTall',
  'flower_purpleA',
  'flower_purpleB',
  'flower_purpleC',
  'flower_redA',
  'flower_redB',
  'flower_redC',
  'flower_yellowA',
  'flower_yellowB',
  'flower_yellowC',
  'cactus_short',
  'cactus_tall',
  'campfire_bricks',
  'campfire_logs',
  'campfire_planks',
  'campfire_stones',
  'statue_block',
  'statue_column',
  'statue_columnDamaged',
  'statue_head',
  'statue_obelisk',
  'statue_ring',
  'pot_large',
  'pot_small',
  'sign',
  'tent_detailedClosed',
  'tent_detailedOpen',
  'tent_smallClosed',
  'tent_smallOpen',
];

/**
 * Premiere selection dans le pack KayKit "Medieval Hexagon Pack" (2026-08-14,
 * CC0, kaylousberg.com ; licence non archivee dans le depot, voir
 * docs/KNOWN_ISSUES.md KI-21). Traites
 * comme des props GENERIQUES (kind: 'prop', mis a l'echelle sur leur largeur
 * comme les props Kenney, voir render/props.ts) plutot que d'etendre les
 * systemes 'rock'/'tree' existants (composition en grappe, tirage aleatoire
 * protege — voir ROCK_MASS_MODELS/TREE_MODELS ci-dessus) : plus simple, sans
 * risque de perturber l'existant, et suffisant pour de la decoration
 * individuelle. Cle prefixee `kaykit_` dans propsByName pour que la
 * provenance reste evidente en lisant un ObstacleDef/JSON exporte.
 *
 * Explicitement ECARTES de cette premiere passe (mesures reelles, script
 * jetable) : les BATIMENTS (scaffolding/dirt/grain/stage...) — 1 a 2 metres
 * de large nativement, une toute AUTRE echelle que les props ci-dessous
 * (0.14-0.72 m) ; les melanger dans la meme normalisation de `scale`
 * (editor/editorUI.ts) aurait ecrase les petits props a une taille
 * quasi invisible. Les batiments demanderaient une emprise MULTI-CASES
 * (comme les rochers) plutot qu'un simple prop 1x1 — a construire separement
 * si Antoine le demande. Ecartes aussi : les tuiles hexagonales elles-memes
 * (base/coast/rivers/roads) — systeme de terrain, hors sujet tant que la
 * peinture de terrain (etape 5 du chantier editeur) n'existe pas, memes
 * raisons que pour Kenney.
 */
const KAYKIT_MODELS = [
  'rock_single_A',
  'rock_single_B',
  'rock_single_C',
  'rock_single_D',
  'rock_single_E',
  'tree_single_A',
  'tree_single_A_cut',
  'tree_single_B',
  'tree_single_B_cut',
  'waterlily_A',
  'waterlily_B',
  'waterplant_A',
  'waterplant_B',
  'waterplant_C',
  'barrel',
  'bucket_arrows',
  'bucket_empty',
  'bucket_water',
  'crate_A_big',
  'crate_A_small',
  'crate_B_big',
  'crate_B_small',
  'crate_long_A',
  'crate_long_B',
  'crate_long_C',
  'crate_long_empty',
  'crate_open',
  'flag_blue',
  'flag_green',
  'flag_red',
  'flag_yellow',
  'ladder',
  'pallet',
  'resource_lumber',
  'resource_stone',
  'sack',
  'target',
  'tent',
  'weaponrack',
  'wheelbarrow',
];

/**
 * Batiments KayKit "Medieval Hexagon Pack" (2026-08-14, demande d'Antoine :
 * "intègre tout ce qu'il y a ici pour l'éditeur de map... tu devrais trouver
 * l'équivalent version rouge pour l'adversaire") — EXPLICITEMENT ecartes de
 * la premiere passe KayKit (voir KAYKIT_MODELS ci-dessus, "les BATIMENTS...
 * demanderaient une emprise MULTI-CASES") : chaque famille occupe desormais
 * plusieurs cases (voir render/buildings.ts, cloneScaledToFootprint) et
 * `kind: 'building'` reste COLLIDABLE (voir config/constants.ts,
 * isCollidableObstacle — seul `'prop'` est traversable), contrairement aux
 * props/decor nature.
 *
 * Format DIFFERENT du reste du decor : `.obj`/`.mtl` (export Blender
 * classique), pas `.glb`/`.gltf` — d'ou OBJLoader/MTLLoader plutot que
 * GLTFLoader, voir loadBuildingFamily. Certaines familles sont composees de
 * PLUSIEURS fichiers .obj (base + piece(s) mobile(s) dans l'outil d'origine
 * — toit de tour rotatif, pales de moulin, roue de moulin a eau, bras de
 * catapulte) : chaque partie garde ses coordonnees ABSOLUES telles
 * qu'exportees (contrairement a .gltf, .obj n'a aucune notion de hierarchie/
 * transform parent-enfant) — les charger tous en enfants d'un meme Group SANS
 * offset supplementaire reproduit donc fidelement la composition d'origine.
 *
 * Trois provenances, memes fichiers .obj/.mtl copies tels quels dans
 * public/models/buildings/ (une SEULE texture partagee `hexagons_medieval.png`,
 * verifiee bit-a-bit identique entre les dossiers blue/red source — copiee
 * une seule fois) :
 *  - BLUE_BUILDING_FAMILIES / RED_BUILDING_FAMILIES (18 familles chacune,
 *    memes noms) : batiments d'EQUIPE, cle finale prefixee `blue_`/`red_`.
 *  - NEUTRAL_BUILDING_FAMILIES (10 elements) : pont, ruine, echafaudage,
 *    scenes de marche, tas de terre/grain, projectile de catapulte — "ils
 *    sont neutres ceux-la" (Antoine), aucune couleur, cle prefixee `neutral_`.
 *
 * Murs (`wall_*`) et clotures (`fence_*`) du dossier `neutral` : absents de
 * cette passe .obj, ajoutes depuis en .gltf (pack EXTRA) et charges a la
 * demande, voir LAZY_KAYKIT_BUILDINGS.
 *
 * Empreintes (tilesX/tilesZ) mesurees par script (lecture directe des lignes
 * "v x y z" de chaque .obj, PAS a l'oeil — meme methode que pour les rochers/
 * props), arrondies a l'entier superieur : voir editor/editorUI.ts,
 * BUILDING_ASSETS pour le detail par batiment. `dirt`/`grain` (dossier
 * neutre) sont mesures quasi plats (hauteur 0.09/0.39) — probablement pensés
 * a l'origine comme des PATCHES DE SOL plutot que de vrais obstacles
 * verticaux ; laisses `kind: 'building'` (donc collidables) par coherence
 * avec le reste du lot plutot que devine un traitement special non demande —
 * a reclasser en `kind: 'prop'` (traversable) si Antoine juge que ces deux-la
 * ne devraient pas bloquer le mouvement.
 */
interface BuildingFamily {
  /** Cle SANS prefixe de couleur — voir loadBuildingFamily pour le prefixage
   *  final (`blue_`/`red_`/`neutral_`). */
  id: string;
  /** Noms de fichier (sans extension), un par piece a charger et regrouper.
   *  Le jeton `{c}` est remplace par la couleur ('blue'/'red') — absent pour
   *  les familles neutres. */
  parts: string[];
}

const TEAM_BUILDING_FAMILIES: BuildingFamily[] = [
  { id: 'archeryrange', parts: ['building_archeryrange_{c}'] },
  { id: 'barracks', parts: ['building_barracks_{c}'] },
  { id: 'blacksmith', parts: ['building_blacksmith_{c}'] },
  { id: 'castle', parts: ['building_castle_{c}'] },
  { id: 'church', parts: ['building_church_{c}'] },
  { id: 'home_A', parts: ['building_home_A_{c}'] },
  { id: 'home_B', parts: ['building_home_B_{c}'] },
  {
    id: 'lumbermill',
    parts: ['building_lumbermill_{c}', 'building_lumbermill_{c}_building_lumbermill_saw_{c}', 'building_lumbermill_{c}_building_lumbermill_top_{c}'],
  },
  { id: 'market', parts: ['building_market_{c}'] },
  { id: 'mine', parts: ['building_mine_{c}'] },
  { id: 'tavern', parts: ['building_tavern_{c}'] },
  { id: 'tower_A', parts: ['building_tower_A_{c}', 'building_tower_A_{c}_building_tower_A_top_{c}'] },
  { id: 'tower_B', parts: ['building_tower_B_{c}', 'building_tower_B_{c}_building_tower_B_top_{c}'] },
  { id: 'tower_base', parts: ['building_tower_base_{c}'] },
  {
    id: 'tower_catapult',
    parts: [
      'building_tower_catapult_{c}',
      'building_tower_catapult_{c}_catapult_turret_{c}',
      'building_tower_catapult_{c}_catapult_turret_{c}_catapult_arm_{c}',
    ],
  },
  { id: 'watermill', parts: ['building_watermill_{c}', 'building_watermill_{c}_building_watermill_wheel_{c}'] },
  { id: 'well', parts: ['building_well_{c}'] },
  {
    id: 'windmill',
    parts: [
      'building_windmill_{c}',
      'building_windmill_{c}_building_windmill_top_{c}',
      'building_windmill_{c}_building_windmill_top_{c}_building_windmill_top_fan_{c}',
    ],
  },
];

const NEUTRAL_BUILDING_FAMILIES: BuildingFamily[] = [
  { id: 'bridge_A', parts: ['building_bridge_A'] },
  { id: 'bridge_B', parts: ['building_bridge_B'] },
  { id: 'destroyed', parts: ['building_destroyed'] },
  { id: 'dirt', parts: ['building_dirt'] },
  { id: 'grain', parts: ['building_grain'] },
  { id: 'scaffolding', parts: ['building_scaffolding'] },
  { id: 'stage_A', parts: ['building_stage_A'] },
  { id: 'stage_B', parts: ['building_stage_B'] },
  { id: 'stage_C', parts: ['building_stage_C'] },
  { id: 'catapult_projectile', parts: ['projectile_catapult'] },
];

const BUILDINGS_BASE_PATH = '/models/buildings/';

/** `MaterialCreator` n'est pas exporte separement par le module MTLLoader —
 *  type derive de la promesse de retour de `loadAsync` plutot qu'importe. */
type MtlMaterials = Awaited<ReturnType<MTLLoader['loadAsync']>>;

const mtlLoader = new MTLLoader();
mtlLoader.setResourcePath(BUILDINGS_BASE_PATH);
const objMaterialsCache = new Map<string, Promise<MtlMaterials>>();

/** Charge (une seule fois par nom, cache par fichier) le materiau d'une
 *  PIECE de batiment — chaque .obj a son propre .mtl compagnon (meme nom de
 *  base), meme s'il pointe vers la meme texture partagee. */
function loadBuildingMaterials(fileBase: string): Promise<MtlMaterials> {
  let pending = objMaterialsCache.get(fileBase);
  if (!pending) {
    pending = mtlLoader.loadAsync(`${BUILDINGS_BASE_PATH}${fileBase}.mtl`).then((materials) => {
      materials.preload();
      return materials;
    });
    objMaterialsCache.set(fileBase, pending);
  }
  return pending;
}

/** Charge une PIECE individuelle (.obj + son .mtl) — voir loadBuildingFamily
 *  pour le regroupement de plusieurs pieces en un seul batiment. Une
 *  instance FRAICHE d'OBJLoader par appel (voir CLAUDE.md, lecon deja tiree
 *  pour les textures VFX : reutiliser un loader configure avec
 *  setMaterials n'est pas un probleme ici puisque chaque appel est
 *  independant et attend sa propre promesse, contrairement au piege de clone
 *  de texture mi-chargee). Corrige le colorSpace de la texture (MTLLoader ne
 *  le fait jamais automatiquement, meme lecon que le reste du rendu). */
async function loadBuildingPart(fileBase: string): Promise<THREE.Group> {
  const materials = await loadBuildingMaterials(fileBase);
  const partLoader = new OBJLoader();
  partLoader.setMaterials(materials);
  const part = await partLoader.loadAsync(`${BUILDINGS_BASE_PATH}${fileBase}.obj`);
  part.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    const material = mesh.material as THREE.MeshPhongMaterial;
    if (material.map) material.map.colorSpace = THREE.SRGBColorSpace;
  });
  return part;
}

/** Charge TOUTES les pieces d'une famille de batiment et les regroupe dans
 *  un seul Group — voir le commentaire au-dessus de TEAM_BUILDING_FAMILIES
 *  pour pourquoi aucun offset relatif n'est necessaire entre les pieces
 *  (coordonnees .obj deja absolues). `color` vide pour les familles
 *  neutres (aucun jeton `{c}` a remplacer dans ce cas). */
async function loadBuildingFamily(family: BuildingFamily, color: string): Promise<THREE.Group> {
  const parts = await Promise.all(family.parts.map((p) => loadBuildingPart(p.replace(/\{c\}/g, color))));
  const group = new THREE.Group();
  group.add(...parts);
  return group;
}

export interface EnvironmentAssets {
  rockMasses: THREE.Group[];
  /** Sous-ensemble de rockMasses naturellement plus haut, voir
   *  ROCK_TALL_MASS_MODELS — a utiliser pour la masse principale d'un rocher. */
  rockTallMasses: THREE.Group[];
  rockFlatAccents: THREE.Group[];
  rockDebris: THREE.Group[];
  trees: THREE.Group[];
  /** Modeles de TREE_MODELS + EXTRA_TREE_MODELS, indexes par nom de fichier :
   *  sert quand Antoine designe un arbre par son apparence et veut forcer ce
   *  modele precis ailleurs (ObstacleDef.treeModel), plutot que de laisser le
   *  tirage aleatoire habituel (qui ne pioche, lui, que dans `trees`) decider. */
  treesByName: Record<string, THREE.Group>;
  /** Props independants (voir PROP_MODELS), indexes par nom de fichier —
   *  toujours choisis explicitement (ObstacleDef.propModel), jamais de tirage
   *  aleatoire pour un prop. */
  propsByName: Record<string, THREE.Group>;
  /** Batiments (voir TEAM_BUILDING_FAMILIES/NEUTRAL_BUILDING_FAMILIES),
   *  indexes par cle PREFIXEE couleur (`blue_archeryrange`, `red_castle`,
   *  `neutral_bridge_A`...) — toujours choisis explicitement
   *  (ObstacleDef.buildingModel), jamais de tirage aleatoire. */
  buildingsByName: Record<string, THREE.Group>;
}

let cachedAssets: Promise<EnvironmentAssets> | null = null;

/** Precharge tous les modeles de decor une seule fois (partages par toute la
 *  session) ; chaque instance placee sur le plateau en est ensuite un clone
 *  (voir cloneScaledTo) — jamais le meme Object3D ajoute deux fois a la scene.
 *  loadModel() met en cache par nom de fichier : rockTallMasses recoupe
 *  rockMasses sans re-telecharger/re-parser ces fichiers deux fois. */
export function loadEnvironmentAssets(): Promise<EnvironmentAssets> {
  if (!cachedAssets) {
    const allTreeNames = [...TREE_MODELS, ...EXTRA_TREE_MODELS];
    cachedAssets = Promise.all([
      Promise.all(ROCK_MASS_MODELS.map(loadModel)),
      Promise.all(ROCK_TALL_MASS_MODELS.map(loadModel)),
      Promise.all(ROCK_FLAT_ACCENT_MODELS.map(loadModel)),
      Promise.all(ROCK_DEBRIS_MODELS.map(loadModel)),
      Promise.all(TREE_MODELS.map(loadModel)),
      Promise.all(allTreeNames.map(loadModel)),
      Promise.all(PROP_MODELS.map(loadModel)),
      Promise.all(KAYKIT_MODELS.map(loadKaykitModel)),
      Promise.all(TEAM_BUILDING_FAMILIES.map((f) => loadBuildingFamily(f, 'blue'))),
      Promise.all(TEAM_BUILDING_FAMILIES.map((f) => loadBuildingFamily(f, 'red'))),
      Promise.all(NEUTRAL_BUILDING_FAMILIES.map((f) => loadBuildingFamily(f, ''))),
    ]).then(
      ([rockMasses, rockTallMasses, rockFlatAccents, rockDebris, trees, allTrees, props, kaykitProps, blueBuildings, redBuildings, neutralBuildings]) => ({
        rockMasses,
        rockTallMasses,
        rockFlatAccents,
        rockDebris,
        trees,
        treesByName: Object.fromEntries(allTreeNames.map((name, i) => [name, allTrees[i]!])),
        // Fusionne Kenney + KayKit dans le MEME repertoire (cle `kaykit_` prefixee
        // pour les seconds, voir KAYKIT_MODELS) : render/props.ts n'a besoin
        // d'aucun changement, un ObstacleDef.propModel reste une simple cle.
        propsByName: {
          ...Object.fromEntries(PROP_MODELS.map((name, i) => [name, props[i]!])),
          ...Object.fromEntries(KAYKIT_MODELS.map((name, i) => [`kaykit_${name}`, kaykitProps[i]!])),
        },
        // Cle prefixee par couleur (voir EnvironmentAssets.buildingsByName) —
        // aucune collision possible entre les 3 groupes (id de famille distincts
        // par prefixe).
        buildingsByName: {
          ...Object.fromEntries(TEAM_BUILDING_FAMILIES.map((f, i) => [`blue_${f.id}`, blueBuildings[i]!])),
          ...Object.fromEntries(TEAM_BUILDING_FAMILIES.map((f, i) => [`red_${f.id}`, redBuildings[i]!])),
          ...Object.fromEntries(NEUTRAL_BUILDING_FAMILIES.map((f, i) => [`neutral_${f.id}`, neutralBuildings[i]!])),
        },
      }),
    );
  }
  return cachedAssets;
}

/**
 * Pack KayKit complet (Medieval Hexagon Pack EXTRA, CC0) : modeles .gltf
 * copies dans public/models/kaykit/ (a cote de la texture partagee) et
 * charges A LA DEMANDE, jamais au demarrage — un modele jamais utilise n'a
 * aucune instance Three.js. Cle (ObstacleDef.buildingModel / propModel) ->
 * nom de fichier. Les murailles (`neutral_wall_*`) servent aussi aux
 * murailles jouables (data/buildings.ts), chargees par main.ts au demarrage
 * via ensureModels. Voir docs/ASSETS.md pour l'inventaire et les exclusions.
 */
const LAZY_KAYKIT_BUILDINGS: Readonly<Record<string, string>> = {
  // Murailles et clotures (dossier « neutral » du pack : visuel neutre).
  neutral_wall_straight: 'wall_straight',
  neutral_wall_straight_gate: 'wall_straight_gate',
  neutral_wall_corner_A_gate: 'wall_corner_A_gate',
  neutral_wall_corner_A_inside: 'wall_corner_A_inside',
  neutral_wall_corner_A_outside: 'wall_corner_A_outside',
  neutral_wall_corner_B_inside: 'wall_corner_B_inside',
  neutral_wall_corner_B_outside: 'wall_corner_B_outside',
  neutral_fence_stone_straight: 'fence_stone_straight',
  neutral_fence_stone_straight_gate: 'fence_stone_straight_gate',
  neutral_fence_wood_straight: 'fence_wood_straight',
  neutral_fence_wood_straight_gate: 'fence_wood_straight_gate',
  // Batiments d'equipe absents du pack FREE.
  ...Object.fromEntries(
    ['docks', 'shipyard', 'shrine', 'stables', 'tent', 'tower_cannon', 'townhall', 'watchtower', 'workshop'].flatMap((family) =>
      ['blue', 'red'].map((color) => [`${color}_${family}`, `building_${family}_${color}`]),
    ),
  ),
  // Relief et forets (pieces de la taille d'une tuile hexagonale).
  ...Object.fromEntries(
    [
      'hill_single_A', 'hill_single_B', 'hill_single_C', 'hills_A', 'hills_B', 'hills_C', 'hills_A_trees', 'hills_B_trees', 'hills_C_trees',
      'mountain_A', 'mountain_B', 'mountain_C', 'mountain_A_grass', 'mountain_B_grass', 'mountain_C_grass',
      'mountain_A_grass_trees', 'mountain_B_grass_trees', 'mountain_C_grass_trees',
      'trees_A_large', 'trees_A_medium', 'trees_A_small', 'trees_B_large', 'trees_B_medium', 'trees_B_small',
      // Materiel militaire (dossier « units/neutral » du pack, modeles statiques).
      'cart', 'cart_merchant', 'catapult', 'cannon', 'ship',
    ].map((name) => [`neutral_${name}`, name]),
  ),
};

const LAZY_KAYKIT_PROPS: Readonly<Record<string, string>> = Object.fromEntries(
  ['anchor', 'boat', 'boatrack', 'cannonball_pallet', 'haybale', 'trough', 'trough_long', 'trees_A_cut', 'trees_B_cut', 'banner'].map((name) => [`kaykit_${name}`, name]),
);

/** Vrai si `key` designe un modele charge a la demande. */
export function isLazyModel(key: string): boolean {
  return key in LAZY_KAYKIT_BUILDINGS || key in LAZY_KAYKIT_PROPS;
}

/** Charge (une seule fois) les modeles a la demande designes par `keys` et
 *  les range dans les memes repertoires que le reste du decor
 *  (buildingsByName / propsByName) : le rendu reste synchrone ensuite. Les
 *  cles inconnues ou deja chargees sont ignorees. */
export async function ensureModels(keys: Iterable<string>): Promise<void> {
  const assets = await loadEnvironmentAssets();
  await Promise.all(
    [...new Set(keys)].map(async (key) => {
      const building = LAZY_KAYKIT_BUILDINGS[key];
      if (building && !assets.buildingsByName[key]) assets.buildingsByName[key] = await loadKaykitModel(building);
      const prop = LAZY_KAYKIT_PROPS[key];
      if (prop && !assets.propsByName[key]) assets.propsByName[key] = await loadKaykitModel(prop);
    }),
  );
}

/** Cles de modele (batiment ou prop) utilisees par des obstacles. */
export function obstacleModelKeys(obstacles: readonly Pick<ObstacleDef, 'buildingModel' | 'propModel'>[]): string[] {
  const keys: string[] = [];
  for (const o of obstacles) {
    if (o.buildingModel) keys.push(o.buildingModel);
    if (o.propModel) keys.push(o.propModel);
  }
  return keys;
}

/** Remplacant visuel (boite translucide de l'emprise) d'un modele a la
 *  demande pas encore charge : jamais d'erreur au rendu si un appelant n'a
 *  pas attendu ensureModels. */
export function createMissingModelPlaceholder(width: number, depth: number): THREE.Group {
  const group = new THREE.Group();
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(width * 0.9, 0.4, depth * 0.9),
    new THREE.MeshStandardMaterial({ color: 0x8b8577, transparent: true, opacity: 0.4 }),
  );
  mesh.position.y = 0.2;
  group.add(mesh);
  return group;
}

export function pickRandom<T>(items: T[], random: () => number = Math.random): T {
  return items[Math.floor(random() * items.length)]!;
}

/**
 * Clone un modele prechargue et le met a l'echelle pour que sa dimension
 * `axis` corresponde a `targetSize`, sans distordre ses proportions (une
 * echelle non-uniforme casserait un modele concu par un artiste — a la
 * difference de la geometrie procedurale precedente, on ne "etire" plus les
 * assets). Recentre ensuite sur X/Z et pose son point le plus bas a y=0
 * (repere local) pour que l'appelant n'ait qu'a positionner le resultat par
 * son "pied", comme un Group ordinaire.
 */
export function cloneScaledTo(prototype: THREE.Group, targetSize: number, axis: 'width' | 'height'): THREE.Group {
  const instance = prototype.clone(true);

  const box = new THREE.Box3().setFromObject(instance);
  const size = new THREE.Vector3();
  box.getSize(size);
  const natural = axis === 'width' ? Math.max(size.x, size.z) : size.y;
  const scale = targetSize / (natural || 1);
  instance.scale.setScalar(scale);

  return recenterOnFootprint(instance);
}

/** Recentre X/Z sur l'origine et pose le point le plus bas a y=0 (repere
 *  local) — extrait de cloneScaledTo/cloneScaledToFootprint, partage par les
 *  deux, pour que l'appelant n'ait qu'a positionner le resultat par son
 *  "pied", comme un Group ordinaire. */
function recenterOnFootprint(instance: THREE.Group): THREE.Group {
  const scaledBox = new THREE.Box3().setFromObject(instance);
  const center = new THREE.Vector3();
  scaledBox.getCenter(center);
  instance.position.x -= center.x;
  instance.position.z -= center.z;
  instance.position.y -= scaledBox.min.y;

  instance.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.isMesh) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    }
  });

  return instance;
}

/**
 * Variante de cloneScaledTo (2026-08-14, chantier batiments) : au lieu de
 * caler UN axe sur une taille cible (largeur OU hauteur), fait tenir le
 * modele dans une emprise RECTANGULAIRE `targetWidth x targetDepth`
 * (largeur/profondeur en cases, voir render/buildings.ts) — echelle
 * UNIFORME (meme facteur sur X/Y/Z, jamais une deformation non-uniforme)
 * calculee comme le plus petit des deux ratios largeur/profondeur, pour que
 * le batiment ne deborde JAMAIS de son emprise dans un sens comme dans
 * l'autre, quelles que soient ses proportions natives.
 */
export function cloneScaledToFootprint(prototype: THREE.Group, targetWidth: number, targetDepth: number): THREE.Group {
  const instance = prototype.clone(true);

  const box = new THREE.Box3().setFromObject(instance);
  const size = new THREE.Vector3();
  box.getSize(size);
  const scaleX = targetWidth / (size.x || 1);
  const scaleZ = targetDepth / (size.z || 1);
  instance.scale.setScalar(Math.min(scaleX, scaleZ));

  return recenterOnFootprint(instance);
}
