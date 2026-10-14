import './ui/style.css';

import * as THREE from 'three';
import {
  ARCHER_ATTACK_RELEASE_FRACTION,
  AUTO_HEAL_TRIGGER_RATIO,
  ARCHER_PROJECTILE_DURATION,
  BALLISTA_TOWER_FOOTPRINT,
  BLIZZARD_TICK_INTERVAL,
  CAMERA,
  COLORS,
  DOUBLE_CLICK_SAME_TYPE_MAX,
  HEAL_TARGET_RADIUS,
  HP_PER_PIP,
  isCollidableObstacle,
  obstacleCenter,
  MACHINE_GUN_FALLBACK_TARGET_OFFSET,
  MACHINE_GUN_ORIGIN_OFFSET,
  MACHINE_GUN_SECONDARY_TARGET_RADIUS,
  MOVE_CLICK_NEAREST_TILE_RADIUS,
  type ObstacleDef,
  PLACEMENT_GOLD_WARNING_RATIO,
  PLAYER_ARROW_COOLDOWN,
  PLAYER_ARROW_DAMAGE,
  PLAYER_ARROW_SPEED,
  SHADOW_PROJECTILE_SPEED,
  TALENT_FANTASSIN_DODGE_CHANCE,
  TALENT_FIRE_RATE_BONUS,
  TALENT_MACHINE_GUN_ATTACK_SPEED_MULTIPLIER,
  TALENT_PROJECTILE_DAMAGE_BONUS,
  TALENT_PROJECTILE_SPEED_BONUS,
  TILE,
} from './config/constants';
import {
  computeBallistaObstacle,
  computePlayerArrowOrigin,
  DEFAULT_MAP,
  type MapDef,
  type MapUnitPlacement,
} from './config/mapDef';
import { applyMapExpansionStep, expansionStepForCompletedWave } from './run/mapExpansion';
import { Loop } from './core/loop';
import { dist } from './core/math';
import { getBuilding } from './data/buildings';
import { getItem, type GamePhase, type IceNovaEffect } from './data/items';
import { getUnit, type UnitStats } from './data/units';
import { EditorState } from './editor/editorState';
import { EditorHistory } from './editor/history';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import {
  buildCellPreview,
  buildGhost,
  buildObstacleView,
  buildUnitGhost,
  buildUnitView,
  createSelectionRing as createEditorSelectionRing,
  createSelectionRingHitArea,
} from './editor/editorScene';
import { EditorUI } from './editor/editorUI';
import { downloadMapDef, exportMapDef, loadMapDefFromFile } from './editor/mapSerializer';
import { buildBallistaTowerPlatform, playBallistaShot, tickBallista } from './render/ballista';
import { BattleSelection, pickEntityAtScreen } from './render/battleSelection';
import { loadEnvironmentAssets, type EnvironmentAssets } from './render/assetLibrary';
import { createBoard, createZonesGroup, type Board } from './render/board';
import { BuildingView } from './render/buildingView';
import { buildObstacleMesh } from './render/obstacleFactory';
import { buildCellGridLines, buildTerrainCellsView } from './render/terrainCells';
import { PlacementHighlight } from './render/placementHighlight';
import { DEFAULT_LAUNCH_HEIGHT, PlayerArrowView, preloadPlayerArrowModel } from './render/playerArrowView';
import { Projectiles } from './render/projectiles';
import { Renderer } from './render/renderer';
import { buildUnit } from './render/unitMesh';
import { UnitViews } from './render/unitViews';
import { preloadMageModel } from './render/mageRig';
import { preloadFantassinModel } from './render/fantassinRig';
import { preloadArcherModel } from './render/archerRig';
import { preloadSentinelModel } from './render/sentinelRig';
import { TelegraphView } from './render/telegraph';
import { FireballView } from './render/fireballView';
import { IceNovaView } from './render/iceNova';
import { HealVfxView } from './render/healVfx';
import { RecyclageAuraView } from './render/recyclageAura';
import { TauntVfxView } from './render/tauntVfx';
import { ShadowProjectileView } from './render/shadowProjectileView';
import { VfxManager } from './render/vfx/VfxManager';
import {
  awardUpgradeRunesForWaveWin,
  canPlayerRecruitUnit,
  grantFirstRunPointIfNeeded,
  isTalentUnlocked,
  loadMetaProgress,
  purchaseUpgrade,
  registerEnemyDefeat,
  registerWaveReached,
  resetMetaProgress,
  resetTalentPoints,
  saveMetaProgress,
  unlockTalent,
  type MetaProgress,
} from './run/metaProgress';
import { computeStartingGoldBonus, computeTalentEconomyHooks } from './run/talentEffects';
import {
  computeEnemyUnitUpgradeEffects,
  computePlayerUnitUpgradeEffects,
  effectivePlayerUnitCost,
  effectivePlayerUnitMaxHp,
} from './run/unitUpgradeEffects';
import { BALLISTA_UPGRADE } from './data/ballistaUpgrade';
import { HEAL_SCROLL_UPGRADE } from './data/healScrollUpgrade';
import { ICE_NOVA_UPGRADE } from './data/iceNovaUpgrade';
import { getUnitUpgradeDef } from './data/unitUpgrades';
import { computePlayerBallistaUpgradeEffects, effectiveBallistaMaxHp } from './run/ballistaUpgradeEffects';
import { computePlayerIceNovaUpgradeEffects, effectiveIceNovaCost } from './run/iceNovaUpgradeEffects';
import { effectiveMineGoldPerSecond } from './run/mineUpgradeEffects';
import { getEffectiveBuildingCost } from './run/buildingUpgradeEffects';
import { MINE_UPGRADE } from './data/mineUpgrade';
import { SENTINEL_UPGRADE } from './data/sentinelUpgrade';
import { computePlayerSentinelUpgradeEffects } from './run/sentinelUpgradeEffects';
import { SHADOW_UPGRADE } from './data/shadowUpgrade';
import { computePlayerShadowEffects } from './run/shadowUpgradeEffects';
import { effectiveBarracksSpawnCount, effectiveBarracksSpawnInterval } from './run/barracksUpgradeEffects';
import { BARRACKS_UPGRADE } from './data/barracksUpgrade';
import {
  effectiveHealScrollCost,
  effectivePlayerHealAmount,
  effectivePlayerSecondaryHealAmount,
  healScrollUpgradeLevel,
  healSecondaryTargetCount,
} from './run/healScrollUpgradeEffects';
import {
  applyBattleOutcome,
  awardKillGold,
  canAddItemsToInventory,
  computeEnemyWaveComposition,
  createNewRun,
  KILL_REWARD,
  roundGold,
  type OwnedBuilding,
} from './run/runState';
import { forwardDir, type Entity, type Team } from './sim/entity';
import type { ArrowShotSpec } from './sim/playerArrow';
import { obstacleBounds } from './sim/geometry';
import { World } from './sim/world';
import { initAudio, persistAudioSettings } from './audio';
import { ArrowCooldownIndicator } from './ui/arrowCooldown';
import { BuildingRotationHint } from './ui/buildingRotationHint';
import { TowerPlacementBanner } from './ui/towerPlacementBanner';
import { WaveIndicator } from './ui/waveIndicator';
import { BattleModeIndicator, type BattleControlMode } from './ui/battleModeIndicator';
import { GoldHud } from './ui/goldHud';
import { CombatOverlay } from './ui/combatOverlay';
import { spawnCoinPopup } from './ui/coinPopup';
import { DebugPanel } from './ui/debug';
import { InventoryBar } from './ui/inventoryBar';
import { PlacementPanel } from './ui/placementPanel';
import { Screens, type WaveResult } from './ui/screens';
import { SellZone } from './ui/sellZone';
import { SelectionBox } from './ui/selectionBox';
import { TalentPointToast } from './ui/talentPointToast';
import { UnitUnlockToast } from './ui/unitUnlockToast';
import { WaveTransition } from './ui/waveTransition';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const renderer = new Renderer(canvas);
const world = new World();
const unitViews = new UnitViews();
const combatOverlay = new CombatOverlay(renderer);
const projectiles = new Projectiles();
const playerArrowView = new PlayerArrowView();
const arrowCooldown = new ArrowCooldownIndicator();
const waveIndicator = new WaveIndicator();
const buildingRotationHint = new BuildingRotationHint();
const towerPlacementBanner = new TowerPlacementBanner();

// Prototype RTS, etape 1 : deux contextes de controle pendant la bataille.
// En mode Baliste, le clic gauche tire comme avant ; en mode Commandement, il
// selectionne une unite alliee (aucun ordre n'est encore envoye). Bascule
// provisoire avec la touche B (voir toggleBattleControlMode).
const battleModeIndicator = new BattleModeIndicator();
let battleControlMode: BattleControlMode = 'ballista';
const battleSelectionMarker = createEditorSelectionRing(1);
// Couleur du camp joueur plutot que l'or par defaut de l'anneau : l'or est deja
// celui du reticule de visee de la Baliste, les deux se confondraient.
(battleSelectionMarker.material as THREE.MeshBasicMaterial).color.set(COLORS.playerZone);
renderer.scene.add(battleSelectionMarker);
const battleSelection = new BattleSelection(battleSelectionMarker);
const goldHud = new GoldHud();
const telegraphView = new TelegraphView();
const fireballView = new FireballView();
const iceNovaView = new IceNovaView();
const healVfxView = new HealVfxView();
const recyclageAuraView = new RecyclageAuraView();
const tauntVfxView = new TauntVfxView();
const shadowProjectileView = new ShadowProjectileView();
const vfxManager = new VfxManager(fireballView, shadowProjectileView);

// Map actuellement chargee : premiere etape du chantier editeur (voir
// config/mapDef.ts) — le jeu lit desormais une MapDef plutot que des
// constantes codees en dur, pour qu'une map produite par un futur editeur
// soit directement chargeable ici sans rien changer d'autre. `let` (pas
// `const`) depuis "Tester le scenario" (voir testScenario) : le temps du
// test, currentMap devient temporairement la map en cours d'edition, puis
// revient a DEFAULT_MAP au retour dans l'editeur — le flux normal (menu ->
// Jouer) ne doit jamais voir la map de test.
let currentMap = DEFAULT_MAP;
world.setMap(currentMap);

// Chargement asynchrone : les rochers/arbres viennent de vrais modeles .glb
// (voir render/assetLibrary.ts), pas de geometrie generee — le reste de
// l'initialisation attend que le plateau soit pret (top-level await, natif
// aux modules ES que Vite sert). Le Mage et le Fantassin riggés (voir
// render/mageRig.ts, render/fantassinRig.ts) sont precharges EN PARALLELE
// ici : `buildUnit`/`buildMage`/`buildFantassin` doivent rester synchrones
// ensuite (l'apercu de placement ET l'editeur de maps les appellent sans
// savoir qu'un chargement reseau est en jeu), donc ce chargement doit etre
// termine avant que le menu principal ne devienne interactif.
// `board` reste mutable (2026-08-18) : reassigne par applyMapExpansionForCompletedWave
// quand le plateau grandit entre deux vagues (agrandissement progressif de
// la map, voir run/mapExpansion.ts) — le tout premier plateau charge ici
// reste toujours a la taille de DEPART (aucune run n'existe encore a ce
// stade du chargement du module).
let [board] = await Promise.all([
  createBoard(currentMap),
  preloadMageModel(),
  preloadFantassinModel(),
  preloadArcherModel(),
  preloadSentinelModel(),
  preloadPlayerArrowModel(),
]);
renderer.scene.add(board.group);
renderer.scene.add(unitViews.group);
renderer.scene.add(projectiles.group);
renderer.scene.add(playerArrowView.group);
renderer.scene.add(telegraphView.group);
renderer.scene.add(fireballView.group);
renderer.scene.add(iceNovaView.group);
renderer.scene.add(healVfxView.group);
renderer.scene.add(recyclageAuraView.group);
renderer.scene.add(tauntVfxView.group);
renderer.scene.add(shadowProjectileView.group);

// Baliste du joueur : postee au coin du plateau d'ou part la fleche (voir
// computePlayerArrowOrigin — calculee depuis la taille REELLE de currentMap,
// pas une coordonnee fixe, pour rester dans le coin si la map est agrandie),
// orientee vers le centre du plateau. Meme convention de cap que le reste du
// rendu (voir UnitViews.computeFacing) : l'unite locale -Z est "l'avant" de
// la baliste.
let playerArrowOrigin = computePlayerArrowOrigin(currentMap);
// Essai "baliste sur tour" (2026-08-14, demande d'Antoine — voir
// render/ballista.ts, buildBallistaTowerPlatform) : la baliste est posee au
// sommet d'une tour KayKit agrandie plutot que directement au sol.
// `ballistaPlatform` (tour + baliste, ne tourne JAMAIS) est ce qui se
// positionne/s'ajoute a la scene desormais ; `ballista` (la baliste seule,
// meme groupe qu'avant) reste ce que vise/anime le reste du code
// (tickBallista/playBallistaShot/rotation de visee) — voir le commentaire de
// BallistaTowerPlatform pour pourquoi la rotation locale de la baliste reste
// valide sans changement.
const environmentAssets = await loadEnvironmentAssets();
const { platform: ballistaPlatform, ballista, mountHeight } = await buildBallistaTowerPlatform(environmentAssets);
// Correctif (2026-08-14, Antoine : "le tir de la baliste semble partir de la
// base de la tour... il faut que cela parte bien de la baliste") : le trait
// visuel du tir (render/playerArrowView.ts) partait toujours d'une hauteur
// FIXE pensee pour une baliste au sol — desormais relevee de `mountHeight`
// (le sommet de la tour, voir buildBallistaTowerPlatform) en plus de la
// hauteur de mecanisme d'origine, pour que le trait parte visuellement de
// la VRAIE position (surelevee) de la baliste.
playerArrowView.setLaunchHeight(mountHeight + DEFAULT_LAUNCH_HEIGHT);

/** Replace/reoriente la plateforme baliste+tour sur playerArrowOrigin —
 *  appelee au demarrage et chaque fois que currentMap change de taille (voir
 *  testScenario, returnToEditorAfterTest), puisque le coin du plateau bouge
 *  avec elle. Seule la baliste (pas la tour) s'oriente : la plateforme
 *  elle-meme ne tourne jamais. */
function repositionBallista(): void {
  ballistaPlatform.position.set(playerArrowOrigin.x, 0, playerArrowOrigin.z);
  ballista.rotation.y = Math.atan2(playerArrowOrigin.x, playerArrowOrigin.z);
}

/**
 * Placement OBLIGATOIRE de la tour/Baliste au tout début d'une run
 * (2026-08-18, demande explicite d'Antoine : "la PREMIÈRE CHOSE à faire...
 * doit être PLACER SA TOUR" — remplace l'ancienne position FIXE dans le
 * coin, voir CLAUDE.md). Reprend les mêmes primitives que le placement d'un
 * bâtiment acheté (case verte/rouge, `isValidPlacementTile`) — jamais
 * `buildingPlacementMode`/`requestPlaceBuilding` directement, dont la
 * sémantique suppose soit un ACHAT (jamais le cas ici, la tour n'a pas de
 * cout) soit un OwnedBuilding déjà existant à déplacer (la Baliste n'en est
 * jamais un, voir RunState.ballistaPosition).
 *
 * Actif UNIQUEMENT dans la fenêtre étroite entre startNewRun() et la
 * confirmation d'un emplacement valide : `inPlacementPhase` reste FALSE
 * pendant tout ce temps, donc rien du flow normal (unités, boutique,
 * "Prêt pour la bataille") n'est même accessible — bloque naturellement
 * toute progression tant que la tour n'est pas posée (demande explicite,
 * point 19), sans garde supplémentaire à écrire ailleurs.
 */
let towerPlacementActive = false;

/** Empreinte de placement en cases ENTIÈRES — BALLISTA_TOWER_FOOTPRINT (2.4)
 *  est une taille CONTINUE pensée pour la collision fine (voir
 *  computeBallistaObstacle), arrondie au-dessus ici pour un alignement de
 *  grille cohérent avec le reste du placement (Mine/Caserne, toujours des
 *  cases entières). */
const TOWER_PLACEMENT_FOOTPRINT_TILES = Math.ceil(BALLISTA_TOWER_FOOTPRINT);

function beginTowerPlacement(): void {
  // BUG CORRIGE (2026-08-18, trouve en testant en direct) : startPlacement()
  // masquait deja l'ecran actif (screens.hideAll()) comme SA toute premiere
  // action — en l'appelant desormais APRES la confirmation de la tour au
  // lieu d'AU DEMARRAGE, plus rien ne fermait jamais le menu principal (ou
  // l'ecran de fin de vague) en entrant dans cette phase : son overlay HTML
  // plein ecran restait au-dessus du canvas et interceptait tous les clics,
  // rendant le placement de la tour impossible a valider.
  screens.hideAll();
  towerPlacementActive = true;
  towerPlacementBanner.setVisible(true);
  board.gridLines.visible = true;
  board.zones.visible = true;
  waveIndicator.update(currentRun.waveNumber);
  waveIndicator.setVisible(true);
}

/** Valide si TOUTES les cases qu'occuperait la tour sont valides — réutilise
 *  isValidPlacementTile telle quelle (mêmes règles qu'un bâtiment acheté :
 *  zone du joueur, aucun obstacle/bâtiment/unité déjà présent). Aucun
 *  `excludeBuildingIndex` : la tour n'est jamais dans currentRun.buildings. */
function isTowerPlacementValid(cornerX: number, cornerZ: number): boolean {
  return buildingFootprintCells(cornerX, cornerZ, TOWER_PLACEMENT_FOOTPRINT_TILES, TOWER_PLACEMENT_FOOTPRINT_TILES).every((c) =>
    isValidPlacementTile(c.x, c.z, []),
  );
}

/** Fait suivre le curseur par l'aperçu de cases (vert/rouge) ET par le VRAI
 *  modèle de la tour (pas un fantôme cloné semi-transparent — la plateforme
 *  n'a pas d'équivalent dans le catalogue buildGhost/buildObstacleMesh, voir
 *  render/ballista.ts ; le joueur voit ainsi directement sa vraie tour se
 *  déplacer, à pleine opacité). */
function updateTowerPlacementGhost(x: number, z: number): void {
  if (!towerPlacementActive) return;
  const { cornerX, cornerZ } = computeBuildingFootprintCorner(x, z, TOWER_PLACEMENT_FOOTPRINT_TILES, TOWER_PLACEMENT_FOOTPRINT_TILES);
  const valid = isTowerPlacementValid(cornerX, cornerZ);
  buildingPlacementGroup.clear();
  for (let dz = 0; dz < TOWER_PLACEMENT_FOOTPRINT_TILES; dz++) {
    for (let dx = 0; dx < TOWER_PLACEMENT_FOOTPRINT_TILES; dx++) buildingPlacementGroup.add(buildCellPreview(cornerX + dx, cornerZ + dz, valid));
  }
  const previewX = cornerX + TOWER_PLACEMENT_FOOTPRINT_TILES / 2;
  const previewZ = cornerZ + TOWER_PLACEMENT_FOOTPRINT_TILES / 2;
  ballistaPlatform.position.set(previewX, 0, previewZ);
  ballista.rotation.y = Math.atan2(previewX, previewZ);
}

/** Valide le placement sur la case survolée — no-op silencieux si invalide
 *  (même convention que confirmBuildingPlacement/un clic de placement
 *  d'unité qui échoue) : le joueur reste dans l'état "tour à placer" tant
 *  qu'il n'a pas cliqué sur une case valide, jamais de bâtiment perdu ni
 *  d'état cassé (demande explicite, points 19/28). */
function confirmTowerPlacement(event: MouseEvent): void {
  if (!towerPlacementActive) return;
  setRaycasterFromEvent(event);
  if (!raycaster.ray.intersectPlane(groundPlane, groundHit)) return;
  const { cornerX, cornerZ } = computeBuildingFootprintCorner(groundHit.x, groundHit.z, TOWER_PLACEMENT_FOOTPRINT_TILES, TOWER_PLACEMENT_FOOTPRINT_TILES);
  if (!isTowerPlacementValid(cornerX, cornerZ)) return;

  const x = cornerX + TOWER_PLACEMENT_FOOTPRINT_TILES / 2;
  const z = cornerZ + TOWER_PLACEMENT_FOOTPRINT_TILES / 2;
  currentRun.ballistaPosition = { x, z };
  playerArrowOrigin = { x, z };
  ballistaObstacleDef = computeBallistaObstacle(playerArrowOrigin);
  repositionBallista();

  towerPlacementActive = false;
  towerPlacementBanner.setVisible(false);
  buildingPlacementGroup.clear();

  // Flow normal (demande explicite, point 23 : "valider le placement ->
  // créer la tour -> ensuite passer au flow normal de préparation").
  startPlacement();
}

canvas.addEventListener('mousedown', (event) => {
  if (event.button !== 0 || !towerPlacementActive || dragging) return;
  confirmTowerPlacement(event);
});

window.addEventListener('mousemove', (event) => {
  if (!towerPlacementActive) return;
  setRaycasterFromEvent(event);
  if (!raycaster.ray.intersectPlane(groundPlane, groundHit)) return;
  updateTowerPlacementGhost(groundHit.x, groundHit.z);
});

repositionBallista();
renderer.scene.add(ballistaPlatform);

/**
 * Architecture BUILDING (2026-08-16, demande d'Antoine) : Mine, Caserne et
 * Baliste sont des bâtiments GAMEPLAY (voir data/buildings.ts) — de vraies
 * Entity destructibles (World.spawnBuilding), pas seulement des obstacles
 * visuels. `ballistaObstacleDef` est PUREMENT une empreinte de collision
 * (jamais passée au rendu, contrairement au visuel de la baliste qui existe
 * déjà séparément, voir ballistaPlatform ci-dessus) : source unique
 * partagée avec buildBallistaTowerPlatform (voir config/constants.ts,
 * BALLISTA_TOWER_FOOTPRINT). La Baliste reste un SINGLETON (toujours
 * présente, jamais achetée) — inchangée par le chantier ci-dessous.
 *
 * REFONTE 2026-08-17 (demande explicite d'Antoine — "je ne veux plus que des
 * bâtiments soient posés automatiquement par des talents, je veux en faire
 * une vraie catégorie d'achat") : la Mine perd sa position FIXE et son
 * talent — comme la nouvelle Caserne, elle est désormais achetée puis posée
 * MANUELLEMENT par le joueur dans sa zone de placement (voir
 * run/runState.ts, RunState.buildings/OwnedBuilding). Contrairement à
 * l'ancien mesh UNIQUE de la Mine (réutilisé d'une bataille à l'autre), le
 * NOMBRE de bâtiments possédés varie au fil d'une run : `ownedBuildingViews`
 * est entièrement RECONSTRUIT (jamais patché) à chaque changement (achat,
 * retour au menu, début de placement) — leur nombre reste toujours petit
 * (quelques unités), une reconstruction complète reste largement assez
 * rapide (même principe déjà accepté pour playerPreview).
 */
// `let` (2026-08-18) : recalculee par rebuildGameBoardVisuals des que la
// tour est reellement placee par le joueur (voir confirmTowerPlacement) ou
// que la map s'agrandit — valeur de repli ici (avant meme qu'un run existe)
// sans consequence, voir computeBallistaObstacle.
let ballistaObstacleDef: ObstacleDef = computeBallistaObstacle(computePlayerArrowOrigin(currentMap));
// Groupe dedie aux debris de destruction (voir render/buildingView.ts) —
// meme convention que les autres vues VFX du jeu (fireballView.group, etc.).
const buildingVfxGroup = new THREE.Group();
renderer.scene.add(buildingVfxGroup);
const ballistaBuildingView = new BuildingView(ballistaPlatform, buildingVfxGroup);
let ballistaEntityId: number | null = null;

interface OwnedBuildingView {
  mesh: THREE.Object3D;
  view: BuildingView;
}
/** Un mesh + BuildingView par entree de `currentRun.buildings`, MEME ORDRE
 *  (index i <-> index i) — voir refreshOwnedBuildingViews. Existe aussi bien
 *  pendant le PLACEMENT (le joueur voit ses bâtiments déjà construits) que
 *  pendant la BATAILLE (une fois wire a une Entity reelle, voir
 *  buildingViewsByEntityId plus bas). */
const ownedBuildingViews: OwnedBuildingView[] = [];

function clearOwnedBuildingViews(): void {
  for (const b of ownedBuildingViews) renderer.scene.remove(b.mesh);
  ownedBuildingViews.length = 0;
}

/** ObstacleDef d'UN bâtiment possédé — position CONTINUE (x/z, voir
 *  config/constants.ts, ObstacleDef, chantier "placement libre") derivee de
 *  OwnedBuilding.x/z, jamais cornerX/cornerZ (le joueur choisit une position
 *  quelconque dans sa zone, pas necessairement alignee sur un coin de bloc
 *  pair). */
function ownedBuildingObstacle(owned: OwnedBuilding): ObstacleDef {
  const def = getBuilding(owned.buildingId);
  return {
    kind: 'building',
    buildingModel: def.buildingModel,
    tilesX: def.footprintTilesX ?? 1,
    tilesZ: def.footprintTilesZ ?? 1,
    x: owned.x,
    z: owned.z,
    rotationY: owned.rotationY ?? 0,
  };
}

/** Toutes les empreintes de collision actives pour la bataille/le placement
 *  REEL en cours — TOUS les bâtiments possédés (Mine, Caserne — voir
 *  currentRun.buildings) PLUS la plateforme Baliste (toujours presente).
 *  Utilisee par isValidPlacementTile (placement d'UNITE, evite de poser une
 *  unite dans un bâtiment) ET par onValidatePlacement (avant que
 *  World.spawnBuilding n'injecte lui-meme chaque empreinte). Jamais utilisee
 *  par setupTestBattle/testScenario (carte d'editeur, sans lien avec la
 *  progression d'une run reelle). */
/** `excludeBuildingIndex` (2026-08-17, "il faut pouvoir rebouger ses
 *  bâtiments pendant la phase de placement") : exclut UN bâtiment possédé
 *  (par index dans currentRun.buildings) de sa PROPRE empreinte de
 *  collision — indispensable pendant un DEPLACEMENT, sinon un bâtiment ne
 *  pourrait jamais valider une case proche de sa position d'ORIGINE
 *  (toujours "occupée" par lui-même). Absent = comportement inchangé
 *  (toutes les empreintes actives, y compris celle du bâtiment qu'on
 *  regarde). */
function activeBuildingObstacles(excludeBuildingIndex?: number): ObstacleDef[] {
  const owned = currentRun.buildings.filter((_, i) => i !== excludeBuildingIndex);
  // Pendant le placement OBLIGATOIRE de la tour (2026-08-18, voir
  // towerPlacementActive), `ballistaObstacleDef` pointe encore vers une
  // position de REPLI (voir rebuildGameBoardVisuals) — aucune vraie tour
  // n'existe encore a cet endroit, l'exclure evite un faux blocage qui
  // rendrait UNE case invalide sans raison reelle.
  if (towerPlacementActive) return owned.map(ownedBuildingObstacle);
  return [...owned.map(ownedBuildingObstacle), ballistaObstacleDef];
}

/** Reconstruit un mesh + BuildingView par bâtiment REELLEMENT possédé (voir
 *  currentRun.buildings) — a appeler apres CHAQUE changement (achat en
 *  placement, retour au menu principal, debut d'une nouvelle phase de
 *  placement). */
function refreshOwnedBuildingViews(): void {
  clearOwnedBuildingViews();
  currentRun.buildings.forEach((owned, i) => {
    const obstacle = ownedBuildingObstacle(owned);
    const mesh = buildObstacleMesh(obstacle, environmentAssets);
    // Index dans currentRun.buildings (2026-08-17, "rebouger ses bâtiments"),
    // meme convention que placementSlots/userData['slotIndex'] pour les
    // unites (voir findSlotIndex) — permet de retrouver quel bâtiment un
    // clic vise, voir findOwnedBuildingIndex.
    mesh.userData['ownedBuildingIndex'] = i;
    renderer.scene.add(mesh);
    ownedBuildingViews.push({ mesh, view: new BuildingView(mesh, buildingVfxGroup) });
  });
}

/** Meme patron que findSlotIndex (unites) — remonte les parents jusqu'a
 *  trouver un mesh tagge `ownedBuildingIndex` (2026-08-17). */
function findOwnedBuildingIndex(object: THREE.Object3D | null): number | null {
  let current = object;
  while (current) {
    const index = current.userData['ownedBuildingIndex'];
    if (typeof index === 'number') return index;
    current = current.parent;
  }
  return null;
}

/** Retrouve, sous le curseur, l'index d'un bâtiment DEJA POSSEDE — utilise
 *  par le clic simple pendant le placement (voir requestMoveBuilding), meme
 *  patron que findHoveredSlot pour les unites. */
function findHoveredOwnedBuilding(event: MouseEvent): number | null {
  setRaycasterFromEvent(event);
  const hit = raycaster.intersectObjects(
    ownedBuildingViews.map((v) => v.mesh),
    true,
  )[0];
  return hit ? findOwnedBuildingIndex(hit.object) : null;
}
// PAS d'appel eager ici : `currentRun` n'est declare que plus bas dans ce
// fichier (TDZ — provoquait "Cannot access 'currentRun' before
// initialization" au chargement de la page, trouve en testant en direct).
// `refreshOwnedBuildingViews()` est deja appelee explicitement partout ou
// c'est necessaire (startPlacement, onValidatePlacement,
// returnToEditorAfterTest, startNewRun) — currentRun.buildings est de toute
// facon toujours vide au tout premier chargement (createNewRun()).

/**
 * Reconstruit le plateau visuel REEL (sol/grille/zones/obstacles) et
 * repositionne la Baliste, a partir de `currentMap`/`spawnDepth` ACTUELS
 * (2026-08-18) — factorise entre applyMapExpansionForCompletedWave
 * (agrandissement en cours de run) et resetGameBoardToDefaultMap (retour a
 * la carte de depart pour une run neuve, voir startNewRun) : les deux
 * situations impliquent exactement la meme reconstruction. N'appelle
 * JAMAIS world.setMap()/refreshOwnedBuildingViews() elle-meme — les
 * appelants savent chacun ce qui est necessaire en plus (ex. translater
 * currentRun.buildings AVANT de rafraichir leurs meshes, pertinent
 * seulement pour une vraie expansion, jamais pour un reset).
 */
async function rebuildGameBoardVisuals(spawnDepth: number): Promise<void> {
  // Position REELLE de la tour (2026-08-18, placement libre au debut de run —
  // voir currentRun.ballistaPosition) si elle a deja ete choisie par le
  // joueur, sinon repli sur l'ancienne formule de coin fixe — ce repli ne
  // sert que juste AVANT que le joueur ne place sa tour (resetGameBoardToDefaultMap,
  // appelee par startNewRun avant beginTowerPlacement) ; une fois la tour
  // placee, ce meme appel (depuis applyMapExpansionForCompletedWave)
  // preserve desormais sa VRAIE position au lieu de la faire sauter au coin.
  playerArrowOrigin = currentRun.ballistaPosition ?? computePlayerArrowOrigin(currentMap);
  ballistaObstacleDef = computeBallistaObstacle(playerArrowOrigin);
  repositionBallista();

  // gridLines/zones masques par defaut : startPlacement() (qui s'execute
  // juste apres, une fois le joueur sorti de l'ecran de fin de vague/la
  // boutique OU d'un retour au menu) les rend visibles inconditionnellement
  // de toute facon — pas besoin de reproduire un etat de visibilite ici.
  renderer.scene.remove(board.group);
  board = await createBoard(currentMap, spawnDepth);
  board.gridLines.visible = false;
  board.zones.visible = false;
  renderer.scene.add(board.group);
}

/**
 * Agrandissement progressif du champ de bataille (2026-08-18, demande
 * d'Antoine) — appelee UNE FOIS PAR BATAILLE REELLEMENT GAGNEE, depuis le
 * callback `onBlackout` de la sequence de victoire (voir plus bas,
 * `waveTransition.play`) : "après validation réelle de Victory et avant
 * Placement" — donc derriere le rideau noir, jamais pendant un combat
 * (aucune Entity n'existe a ce moment, `world.entities` deja vide par
 * `world.clear()`, appele juste avant dans le meme callback).
 *
 * `completedWave` : le numero de la vague qui vient REELLEMENT d'etre
 * gagnee (1-indexe, celui affiche au joueur — `waveBeingFought`, capture
 * AVANT l'increment de `waveNumber` par `applyBattleOutcome`).
 *
 * Idempotence (demande explicite d'Antoine : "une vague ne doit jamais
 * appliquer deux fois son expansion") : si cette vague a deja declenche son
 * expansion (reload/callback relance), ne fait RIEN — voir
 * `currentRun.mapExpansion.lastExpandedWave`.
 */
async function applyMapExpansionForCompletedWave(completedWave: number): Promise<void> {
  if (completedWave <= currentRun.mapExpansion.lastExpandedWave) return;

  const step = expansionStepForCompletedWave(completedWave);
  const result = applyMapExpansionStep(currentMap, currentRun.mapExpansion, step);
  currentMap = result.map;
  currentRun.mapExpansion = { ...result.state, lastExpandedWave: completedWave };

  // Batiments POSSEDES par le joueur (2026-08-17) : translates SEULEMENT par
  // l'ETAPE C (offsetForZ vaut toujours 0 pour spawnBack/sides — voir
  // run/mapExpansion.ts) — le camp joueur reste fixe par construction (tout
  // bâtiment possede est deja dans la zone joueur), mais on applique la MEME
  // fonction centralisee plutot que de supposer/exclure a la main.
  for (const owned of currentRun.buildings) owned.z += result.offsetForZ(owned.z);

  await rebuildGameBoardVisuals(currentRun.mapExpansion.spawnDepth);

  // Pathfinding/occupancy (demande explicite : "recalculer navigation/
  // occupancy si necessaire") : World.setMap reconstruit obstacles/bounds
  // depuis currentMap — sera de toute facon rappelee au debut de la
  // PROCHAINE bataille (onValidatePlacement), mais appelee ici aussi pour
  // qu'aucun code entre ces deux moments ne puisse lire un World perime.
  world.setMap(currentMap);

  // Meshes des batiments possedes reconstruits a leur NOUVELLE position
  // (pertinent seulement apres l'ETAPE C, qui vient de muter owned.z
  // ci-dessus) — startPlacement() le referait de toute facon un peu plus
  // tard, mais evite tout etat visuel perime avant meme que le joueur
  // n'atteigne l'ecran de fin de vague/la boutique.
  refreshOwnedBuildingViews();
}

/**
 * Remet le plateau REEL a la carte de depart (2026-08-18) — necessaire
 * uniquement si une run PRECEDENTE avait agrandi `currentMap` (voir
 * applyMapExpansionForCompletedWave ci-dessus) : `currentMap` est un module
 * partage entre runs, `currentRun.mapExpansion` vient deja d'etre
 * reinitialise par `createNewRun` (voir startNewRun) au moment ou cette
 * fonction est appelee, mais `currentMap`/le rendu/la Baliste ne le savent
 * pas encore sans cet appel explicite — sans lui, une nouvelle run
 * demarrerait avec un plateau visuel/une simulation encore a l'ancienne
 * taille agrandie, desynchronises de `currentRun.mapExpansion` (repartie a
 * zero).
 */
async function resetGameBoardToDefaultMap(): Promise<void> {
  currentMap = DEFAULT_MAP;
  await rebuildGameBoardVisuals(currentRun.mapExpansion.spawnDepth);
  world.setMap(currentMap);
}

/** Id d'Entity gameplay -> BuildingView, pour LA BATAILLE en cours — regroupe
 *  Mine/Caserne (voir ownedBuildingViews) ET la Baliste (singleton) dans un
 *  SEUL point de dispatch generique (2026-08-17) : remplace les anciens
 *  `if (target.id === mineEntityId) ... else if (target.id === ballistaEntityId) ...`
 *  codes en dur, desormais inadaptes puisque le nombre de bâtiments varie.
 *  Vide pendant le placement (aucune Entity n'existe encore). */
const buildingViewsByEntityId = new Map<number, BuildingView>();

/** Flash blanc de degats pour n'importe quelle entite touchee : batiment
 *  gameplay (BuildingView) ou unite (UnitViews, qui ne connait pas les
 *  batiments). Point d'entree unique pour toutes les sources de degats. */
function playHitFlash(entityId: number): void {
  const buildingView = buildingViewsByEntityId.get(entityId);
  if (buildingView) buildingView.playHit();
  else unitViews.playHit(entityId);
}

/** Vrai tant qu'aucun camp n'a encore ete elimine sur la bataille en cours. */
let battleOver = false;

/** Ids d'ennemis deja recompenses en or (voir la boucle de jeu, or en temps
 *  reel a chaque kill, 2026-08-11) — evite de recompenser deux fois la
 *  meme mort si plusieurs coups visaient la meme unite au meme tick.
 *  Videe a chaque `world.clear()` (voir les sites d'appel) : les ids
 *  d'entite ne sont jamais reutilises (World.nextId ne revient jamais en
 *  arriere), donc ce n'est pas necessaire pour l'exactitude, seulement pour
 *  eviter une croissance non bornee sur une longue session. */
const rewardedEnemyDeaths = new Set<number>();

/** Ids d'entites JOUEUR actuellement EN DESSOUS du seuil "Aux petits
 *  oignons" (voir AUTO_HEAL_TRIGGER_RATIO) — 2026-08-15, demande explicite
 *  d'Antoine : "je ne veux surtout pas qu'un allie reste sous 30% et
 *  consomme un parchemin chaque tick... je veux un comportement de
 *  FRANCHISSEMENT de seuil". Un id present ici signifie "le proc a deja ete
 *  consomme pour ce franchissement" — retire UNIQUEMENT quand l'unite
 *  repasse STRICTEMENT au-dessus du seuil (voir applyPlayerHeal, la SEULE
 *  facon dont les PV remontent), jamais sur un simple hit. Videe a chaque
 *  `world.clear()` (memes 5 sites que rewardedEnemyDeaths) : les ids
 *  d'entite ne sont jamais reutilises au sein d'une bataille, mais chaque
 *  nouvelle bataille recree des entites fraiches sans rapport avec l'etat
 *  de la precedente. */
const belowAutoHealThreshold = new Set<number>();

/** Accumulateur d'or de la mine (talent "Le temps, c'est de l'argent",
 *  2026-08-14) — voir la boucle de jeu plus bas. Necessaire parce qu'un
 *  taux de 1 or/seconde, applique par pas de simulation FIXE (dt ~= 1/30s,
 *  voir SIM_STEP), ne represente que ~0.033 or par tick : un premier essai
 *  qui arrondissait directement `currentRun.gold` au dixieme le PLUS PROCHE
 *  a CHAQUE tick effacait cet increment a chaque fois (0.033 arrondi au
 *  dixieme = 0), empechant l'or de la mine de jamais s'accumuler — bug
 *  remonte par Antoine ("il ne s'affiche pas en direct"). Corrige en
 *  accumulant le montant BRUT ici, et en ne versant dans `currentRun.gold`
 *  que par paliers de 0.1 des qu'ils sont atteints (le reste, jamais perdu,
 *  reste dans l'accumulateur pour le tick suivant). Remis a 0 a chaque
 *  debut de bataille reelle (onValidatePlacement). */
let mineIncomeAccumulator = 0;

/** Fleche visuelle en attente de depart, retardee pour se caler sur le clip
 *  d'attaque riggé de l'Archer ("tir a l'arc", voir render/archerRig.ts) —
 *  2026-08-11, demande explicite d'Antoine : "fais en sorte que son
 *  projectile se calibre bien sur l'animation". Les degats sont DEJA
 *  resolus au tick de simulation ou l'evenement de combat est survenu
 *  (combatSystem, instantane) — ce delai est purement cosmetique, en temps
 *  REEL, et ne retarde jamais l'application des degats, seulement
 *  l'apparition visuelle de la fleche. */
interface PendingArrowSpawn {
  elapsed: number;
  delay: number;
  /** Id de l'archer, pour retrouver la position REELLE de sa main au moment
   *  du depart (voir UnitViews.getBoneWorldPosition, 2026-08-11 — corrige
   *  "le projectile ne part pas de l'archer, il part un metre devant") —
   *  x/z ci-dessous ne servent plus que de repli si l'os/l'entite a disparu
   *  d'ici la (mort, fin de bataille). */
  attackerId: number;
  x: number;
  z: number;
  /** Id de la CIBLE a suivre jusqu'au depart reel de la fleche (2026-08-13,
   *  correctif "les archers ratent presque toujours leur cible") — `null`
   *  pour un tir BLOQUE (le point vise est un point d'impact fixe sur un
   *  obstacle, voir plus bas, jamais une entite a suivre). Voir
   *  targetX/targetZ pour le pourquoi de ce champ. */
  targetId: number | null;
  /** Position de la cible CAPTUREE au moment de la resolution du combat
   *  (instantanee) — sert de secours si `targetId` est null (tir bloque) ou
   *  si l'entite a disparu d'ici la ; sinon REMPLACEE par la position REELLE
   *  et ACTUELLE de la cible au moment ou la fleche part vraiment (voir
   *  plus bas) : le delai cosmetique avant depart (ARCHER_ATTACK_RELEASE_FRACTION,
   *  jusqu'a ~1.2s) laissait largement le temps a la cible de deriver (force
   *  de separation entre corps) voire de mourir et disparaitre — viser une
   *  position vieille d'une seconde+ faisait rater visuellement la plupart
   *  des tirs pourtant bien resolus en combat. */
  targetX: number;
  targetZ: number;
  team: Team;
}
const pendingArrowSpawns: PendingArrowSpawn[] = [];

/** Progression PERMANENTE (chantier sauvegarde, 2026-08-09) — chargee une
 *  seule fois au demarrage, contrairement a currentRun qui se recree a
 *  chaque nouvelle run. Voir run/metaProgress.ts. */
const metaProgress = loadMetaProgress();

/** Moteur audio (2026-08-12, DESACTIVE le 2026-08-13 — voir CLAUDE.md,
 *  demande d'Antoine : "retire tout les sons pour l'instant... on verra plus
 *  tard"). `audio` reste construit (l'ecran Parametres, onglet Son, garde
 *  ses handlers onSetMasterVolume etc. qui ecrivent dans `AudioSettings` et
 *  sauvegardent — inoffensif) mais AUCUN AudioContext n'est jamais cree :
 *  `unlock()` n'est plus appele nulle part, donc `AudioManager.play()`
 *  reste un no-op garanti (`if (!this.ctx) return;`) quel que soit
 *  l'appelant. Rien n'a ete supprime (catalogue de sons, moteur, ecran
 *  Parametres) — juste debranche, pour pouvoir reprendre facilement plus
 *  tard sans repartir de zero. */
const audio = initAudio();

/** Vrai si le talent permanent `id` est debloque (voir data/talents.ts,
 *  run/metaProgress.ts) — raccourci lisible pour les sites d'application
 *  d'effet ci-dessous, tous groupes ici plutot que disperses pres de chaque
 *  usage individuel. */
function isTalentActive(id: string): boolean {
  return isTalentUnlocked(metaProgress, id);
}

/** Patch de stats a appliquer a une unite JOUEUR fraichement spawnee (voir
 *  World.spawn, statOverrides) — fusionne DEUX sources independantes :
 *  1. les talents (pour l'instant, seul "Réflexes de vétéran", esquive des
 *     fantassins) ;
 *  2. la boutique d'amelioration PERMANENTE (2026-08-13, voir
 *     run/unitUpgradeEffects.ts) : PV/degats bonus derives du niveau
 *     d'amelioration de l'unite. `undefined` de la aussi si l'unite n'a
 *     aucune amelioration definie (statOverrides vide, voir
 *     computePlayerUnitUpgradeEffects).
 *  JAMAIS appelee pour une unite ENNEMIE — c'est cet appel conditionnel
 *  (uniquement aux 2 sites qui spawnent des unites JOUEUR, voir plus bas)
 *  qui garantit que les ennemis gardent leurs stats de base (point 20/21 de
 *  la demande d'Antoine sur la boutique d'amelioration). */
function playerStatOverrides(unitId: string): Partial<UnitStats> | undefined {
  const overrides: Partial<UnitStats> = {};
  if (unitId === 'fantassin' && isTalentActive('reflexes_fantassin')) {
    overrides.dodgeChance = TALENT_FANTASSIN_DODGE_CHANCE;
  }
  Object.assign(overrides, computePlayerUnitUpgradeEffects(unitId, metaProgress).statOverrides);
  // Sentinelle (2026-08-14) : amelioration permanente DEDIEE (voir
  // data/sentinelUpgrade.ts), pas enregistree dans UNIT_UPGRADES — sans ce
  // cas special, computePlayerUnitUpgradeEffects ci-dessus renvoie toujours
  // un statOverrides vide pour 'sentinel'.
  if (unitId === 'sentinel') {
    Object.assign(overrides, computePlayerSentinelUpgradeEffects(metaProgress).statOverrides);
  }
  return Object.keys(overrides).length > 0 ? overrides : undefined;
}

/** Bonus de bouclier PAR ENNEMI PROVOQUE (voir Entity.tauntShieldBonus,
 *  data/abilities.ts TauntAbility.baseShieldPerTarget) a appliquer a une
 *  Sentinelle JOUEUR fraichement spawnee — boutique d'amelioration
 *  permanente (voir run/sentinelUpgradeEffects.ts). 0 pour toute autre
 *  unite, jamais appelee pour un ennemi (meme garantie que
 *  playerStatOverrides/playerAbilityDamageBonus ci-dessous). */
function playerTauntShieldBonus(unitId: string): number {
  return unitId === 'sentinel' ? computePlayerSentinelUpgradeEffects(metaProgress).tauntShieldBonusInternal : 0;
}

/** Bonus de degats de CAPACITE (voir Entity.abilityDamageBonus,
 *  sim/systems/abilities.ts) a appliquer a une unite JOUEUR fraichement
 *  spawnee — boutique d'amelioration permanente, Mage/Boule de feu pour
 *  l'instant (voir data/unitUpgrades.ts, primaryDamageTarget: 'ability').
 *  0 par defaut, jamais appelee pour une unite ennemie (meme garantie que
 *  playerStatOverrides ci-dessus). */
function playerAbilityDamageBonus(unitId: string): number {
  return computePlayerUnitUpgradeEffects(unitId, metaProgress).abilityDamageBonus;
}

/** Patch de stats a appliquer a une unite ENNEMIE fraichement spawnee —
 *  buff de difficulte PAR VAGUE (2026-08-13, demande d'Antoine : "les
 *  unités ennemies doivent être améliorées, même buff que boutique
 *  améliorations, une fois toutes les 3 vagues") — MEMES formules que la
 *  boutique d'amelioration du joueur, mais jamais lues depuis metaProgress
 *  (voir run/unitUpgradeEffects.ts, computeEnemyUnitUpgradeEffects). Vagues
 *  1 a 3 : statOverrides vide (undefined), comportement STRICTEMENT
 *  inchange. Uniquement branchee sur le spawn de bataille REEL
 *  (onValidatePlacement, currentRun.waveNumber) — jamais sur setupTestBattle
 *  (raccourci de dev / "Tester le scenario" de l'editeur, qui lit
 *  currentMap.enemyUnits sans lien avec une progression de run reelle, voir
 *  CLAUDE.md). */
function enemyStatOverrides(unitId: string, waveNumber: number): Partial<UnitStats> | undefined {
  const overrides = computeEnemyUnitUpgradeEffects(unitId, waveNumber).statOverrides;
  return Object.keys(overrides).length > 0 ? overrides : undefined;
}

function enemyAbilityDamageBonus(unitId: string, waveNumber: number): number {
  return computeEnemyUnitUpgradeEffects(unitId, waveNumber).abilityDamageBonus;
}

/** Somme de TOUS les bonus de VITESSE D'ATTAQUE (cadence) de la Baliste,
 *  TOUS ADDITIFS entre eux — talent "Tir rapide" (bonus FIXE) + amelioration
 *  permanente "Baliste" (voir run/ballistaUpgradeEffects.ts, bonus CROISSANT
 *  avec le niveau achete en runes) + tout futur bonus qui s'ajouterait ici.
 *  SOURCE UNIQUE reutilisee par effectivePlayerArrowCooldown ET par le
 *  talent "Mitraillette" (2026-08-14, voir data/talents.ts) : Mitraillette
 *  multiplie ce TOTAL par TALENT_MACHINE_GUN_ATTACK_SPEED_MULTIPLIER,
 *  JAMAIS la cadence de base ni un bonus pris isolement — demande explicite
 *  d'Antoine ("je ne veux pas cadence de base x3, je veux BONUS DE VITESSE
 *  D'ATTAQUE x3"). Jamais composes multiplicativement l'un avec l'autre ni
 *  d'un niveau de Baliste a l'autre (deja garanti avant Mitraillette : "pas
 *  baseRate × 1.2 × 1.2 × 1.2..."). */
function totalBallistaAttackSpeedBonus(): number {
  const talentBonus = isTalentActive('tir_rapide') ? TALENT_FIRE_RATE_BONUS : 0;
  const ballistaBonus = computePlayerBallistaUpgradeEffects(metaProgress).attackSpeedBonus;
  return talentBonus + ballistaBonus;
}

/** Cooldown EFFECTIF de la fleche du joueur — une seule etape claire :
 *  collecter tous les bonus (totalBallistaAttackSpeedBonus) puis, SI
 *  Mitraillette est debloque, multiplier ce TOTAL par 3 avant de calculer
 *  la cadence finale (jamais une double application : le bonus boutique et
 *  le bonus Tir rapide ne sont JAMAIS multiplies individuellement, seule
 *  leur SOMME l'est, une seule fois). A 0 bonus actif (aucun talent/aucune
 *  amelioration), 0 x 3 = 0 : la cadence de base reste strictement
 *  inchangee, aucune regression. Calcule une fois par tir plutot que
 *  stocke, puisque talents/ameliorations peuvent theoriquement changer
 *  entre deux tirs (boutiques/arbre accessibles en cours de run ou entre
 *  les runs). */
function effectivePlayerArrowCooldown(): number {
  const totalBonus = totalBallistaAttackSpeedBonus();
  const effectiveBonus = isTalentActive('mitraillette') ? totalBonus * TALENT_MACHINE_GUN_ATTACK_SPEED_MULTIPLIER : totalBonus;
  return PLAYER_ARROW_COOLDOWN / (1 + effectiveBonus);
}
function effectivePlayerArrowSpeed(): number {
  // PROJECTILE SPEED : uniquement le talent "Tir rapide" — l'amelioration
  // permanente "Baliste" ne touche JAMAIS cette valeur (demande explicite
  // d'Antoine, point 8 : ne pas confondre cadence/vitesse de projectile/degats).
  return isTalentActive('tir_rapide') ? PLAYER_ARROW_SPEED * (1 + TALENT_PROJECTILE_SPEED_BONUS) : PLAYER_ARROW_SPEED;
}
/** "Tir rapide" ajoute +2 degats affiches (+20 internes, TALENT_PROJECTILE_DAMAGE_BONUS)
 *  et l'amelioration "Baliste" ajoute +1 tous les 3 niveaux (voir
 *  run/ballistaUpgradeEffects.ts) — deux bonus INTERNES qui s'additionnent
 *  simplement sur la base. */
function effectivePlayerArrowDamage(): number {
  const talentBonus = isTalentActive('tir_rapide') ? TALENT_PROJECTILE_DAMAGE_BONUS : 0;
  const ballistaBonus = computePlayerBallistaUpgradeEffects(metaProgress).damageBonusInternal;
  return PLAYER_ARROW_DAMAGE + talentBonus + ballistaBonus;
}

// --- Economie / progression de run (chantier en cours — voir CLAUDE.md) -
//
// L'or et l'armee possedee survivent d'une vague a l'autre TANT QUE le
// joueur reste dans la meme run (roguelite classique, confirme par Antoine :
// une unite blessee reste blessee jusqu'au soin, une unite morte est perdue
// pour de bon). Une nouvelle run (reset complet) ne demarre qu'au clic sur
// "Jouer" depuis le menu principal (voir startNewRun) — continuer apres la
// boutique reutilise la MEME run, juste la vague suivante.
let currentRun = createNewRun(computeStartingGoldBonus(metaProgress), effectivePlayerUnitMaxHp('fantassin', metaProgress));
/** Or gagne a la derniere bataille (kills + bonus de vague) — retenu entre
 *  applyBattleOutcome et l'ouverture de la boutique pour y jouer l'animation
 *  de gain (voir onContinueAfterWave), l'ecran boutique n'existant pas
 *  encore visuellement au moment ou l'or est calcule. */
let lastBattleGoldEarned = 0;

/** Dernier achat d'UNITE fait en boutique de run (2026-08-13, demande
 *  d'Antoine : "un bouton retour dans la boutique au cas où une unité ait
 *  été achetée par hasard") — `null` si rien a annuler. Alimente le bouton
 *  "Annuler le dernier achat" (voir ScreenHandlers.onUndoLastUnitPurchase) :
 *  un filet de secours pour un misclic, pas un historique general — remis a
 *  `null` a l'ouverture de CHAQUE nouvelle phase de placement (voir
 *  startPlacement) et des qu'une unite est vendue (voir sellUnit, pour
 *  eviter un double-remboursement si l'unite juste achetee est ensuite
 *  vendue). Suppose l'invariant deja etabli ailleurs (voir addUnitToPlacement) :
 *  un achat pousse TOUJOURS currentRun.army/placementSlots au MEME index, en
 *  DERNIERE position — annuler revient donc a retirer le DERNIER element des
 *  deux tableaux. */
let lastUnitPurchase: { unitId: string; cost: number } | null = null;

/** Scene de test directe (raccourci clavier Entree) : bataille immediate,
 *  sans passer par la phase de placement, pour iterer vite sur le combat. */
function setupTestBattle(): void {
  resetBattleControls();
  world.clear();
  rewardedEnemyDeaths.clear();
  belowAutoHealThreshold.clear();
  mineIncomeAccumulator = 0;
  pendingArrowSpawns.length = 0;
  unitViews.clear();
  combatOverlay.clear();
  projectiles.clear();
  playerArrowView.clear();
  telegraphView.clear();
  fireballView.clear();
  iceNovaView.clear();
  healVfxView.clear();
  tauntVfxView.clear();
  shadowProjectileView.clear();
  battleOver = false;

  for (const pos of currentMap.playerUnits) {
    world.spawn(
      pos.unitId,
      'player',
      pos.x,
      pos.z,
      undefined,
      playerStatOverrides(pos.unitId),
      playerAbilityDamageBonus(pos.unitId),
      playerTauntShieldBonus(pos.unitId),
    );
  }
  for (const pos of currentMap.enemyUnits) world.spawn(pos.unitId, 'enemy', pos.x, pos.z);
}

// --- Phase de placement -----------------------------------------------
//
// L'armee du joueur vient desormais de la run en cours (voir run/runState.ts,
// currentRun.army) plutot que d'un roster fixe : elle grandit avec les achats
// en boutique et retrecit avec les pertes. Le choix reste avant tout un choix
// de POSITION — c'est deja le coeur du gameplay tactique vise.
//
// Interaction : clic gauche sur une unite pour la selectionner (surbrillance
// aux couleurs du camp), clic gauche sur une case libre de la zone pour l'y
// deplacer. Pas de bandeau de jetons a cliquer a cote du plateau — tout se
// passe directement sur les unites, comme dans un vrai jeu de tactique.

/** Distingue melee (rangees avant) de distance (rangees arriere), voir
 *  layoutFormation — demande d'Antoine, 2026-08-10. Base sur la portee
 *  d'attaque plutot qu'une liste d'id codee en dur : un futur chevalier
 *  (melee) tombera naturellement du bon cote tant que sa portee reste
 *  courte comme celle du fantassin, sans rien a maintenir ici.
 *  `engageRange` (2026-08-11, voir data/units.ts) prime sur `attackRange`
 *  quand present : le Mage a un `attackRange` de repli au corps a corps
 *  (0.95, comme le fantassin) mais une portee d'ENGAGEMENT de 6 (sa Boule
 *  de feu) — sans ce champ, il tomberait a tort dans les rangees avant. */
function isRangedUnit(unitId: string): boolean {
  const stats = getUnit(unitId).stats;
  return (stats.engageRange ?? stats.attackRange) > 2;
}

/**
 * Range `unitIds` en rangees successives centrees sur x=0, MELEE D'ABORD
 * (rangees les plus proches de `frontZ`) puis DISTANCE ENSUITE (rangees
 * suivantes, plus loin du front) — demande d'Antoine, 2026-08-10 : "les
 * fantassins doivent apparaitre sur les lignes avant, les archers sur les
 * lignes plutot arriere", pour les achats du joueur ET la generation
 * ennemie. `rowStep` porte le signe de la direction "reculer" (TILE pour le
 * joueur, qui recule vers +Z ; -TILE pour l'ennemi, qui recule vers -Z).
 * Position renvoyee dans le MEME ORDRE que `unitIds` (pas l'ordre de tri
 * melee/distance interne), pour rester directement zippable avec le tableau
 * d'origine par l'appelant.
 *
 * Purement une disposition de DEPART — le joueur peut toujours deplacer
 * chaque unite avant de valider.
 */
function layoutFormation(unitIds: string[], frontZ: number, rowStep: number, perRow: number): { x: number; z: number }[] {
  const meleeIndices: number[] = [];
  const rangedIndices: number[] = [];
  unitIds.forEach((id, i) => (isRangedUnit(id) ? rangedIndices : meleeIndices).push(i));

  const positions: { x: number; z: number }[] = new Array(unitIds.length);
  let row = 0;

  for (const indices of [meleeIndices, rangedIndices]) {
    for (let i = 0; i < indices.length; ) {
      const rowCount = Math.min(perRow, indices.length - i);
      // Centres de case (demi-entiers, meme convention que handleEmptyTileClick,
      // tileX = floor(x) + 0.5) : `col - (rowCount-1)/2` tombait exactement sur
      // une ligne de grille des que rowCount etait IMPAIR (ex. un seul
      // fantassin) — (rowCount-1)/2 devient alors un entier au lieu d'un
      // demi-entier. Repartir d'une case entiere de gauche (floor(rowCount/2))
      // puis ajouter +0.5 garantit un demi-entier quelle que soit la parite.
      const leftTile = -Math.floor(rowCount / 2);
      for (let col = 0; col < rowCount; col++, i++) {
        positions[indices[i]!] = { x: leftTile + col + 0.5, z: frontZ + row * rowStep };
      }
      row++;
    }
  }

  return positions;
}

/**
 * Positions de depart pour l'armee du joueur (variable, plus un roster fixe
 * a 6 emplacements) — voir layoutFormation pour la logique melee/distance.
 */
function computeArmyFormation(unitIds: string[], map: MapDef): { x: number; z: number }[] {
  const halfH = (map.height * TILE) / 2;
  // spawnDepth DYNAMIQUE (2026-08-18, agrandissement progressif de la map) —
  // remplace la constante globale PLACEMENT_ROWS pour le jeu REEL : voir
  // run/mapExpansion.ts, MapExpansionState.spawnDepth (demarre a
  // PLACEMENT_ROWS, +1 a chaque application de l'ETAPE A). Cette fonction
  // n'est jamais appelee par l'editeur/setupTestBattle (voir leurs propres
  // docstrings), donc `currentRun` existe toujours ici.
  const frontZ = halfH - currentRun.mapExpansion.spawnDepth * TILE + 0.5;
  const perRow = Math.max(1, map.width - 2);
  return layoutFormation(unitIds, frontZ, TILE, perRow);
}

/**
 * Composition ET positions du camp ennemi pour la vague N (demande
 * d'Antoine, 2026-08-10 : le camp rouge commence a 1 fantassin comme le
 * joueur, gagne 1 fantassin par vague jusqu'a 3, puis 1 archer par vague a
 * partir de la vague 4 — voir run/runState.ts, computeEnemyWaveComposition
 * pour les effectifs). Meme logique melee-devant/distance-derriere que
 * computeArmyFormation (layoutFormation), miroir cote z (le front ennemi est
 * le z le MOINS negatif de sa zone, donc on recule vers z plus negatif).
 * Remplace `currentMap.enemyUnits` (fixe) dans le flux de jeu REEL —
 * `setupTestBattle` (raccourci de dev/test map de l'editeur) continue lui de
 * lire `currentMap.enemyUnits` tel quel, sans lien avec la progression d'une
 * run.
 */
function computeEnemyWavePlacements(waveNumber: number, map: MapDef): MapUnitPlacement[] {
  const composition = computeEnemyWaveComposition(waveNumber);
  const unitIds = [
    ...Array<string>(composition.fantassin).fill('fantassin'),
    ...Array<string>(composition.archer).fill('archer'),
    // Mage (2026-08-13) : classe automatiquement en rangee arriere par
    // layoutFormation (isRangedUnit se base sur engageRange > 2, deja vrai
    // pour le Mage, aucun cas special necessaire ici).
    ...Array<string>(composition.mage).fill('mage'),
    // Sentinelle ennemie (2026-08-15) : melee (attackRange 0.95, engageRange
    // absent), classee automatiquement en rangee AVANT par layoutFormation —
    // meme mecanisme generique, aucun cas special necessaire ici non plus.
    ...Array<string>(composition.sentinel).fill('sentinel'),
  ];

  const halfH = (map.height * TILE) / 2;
  // spawnDepth DYNAMIQUE — voir computeArmyFormation ci-dessus, meme raisonnement.
  const enemyFrontZ = -halfH + currentRun.mapExpansion.spawnDepth * TILE - 0.5;
  const perRow = Math.max(1, map.width - 2);
  const positions = layoutFormation(unitIds, enemyFrontZ, -TILE, perRow);

  return unitIds.map((unitId, i) => ({ unitId, x: positions[i]!.x, z: positions[i]!.z }));
}

interface PlacementSlot {
  unitId: string;
  x: number | null;
  z: number | null;
  /** PV actuels a spawner (voir World.spawn) — une unite blessee survivante
   *  d'une vague precedente reste blessee tant qu'elle n'est pas soignee. */
  hp: number;
}

let placementSlots: PlacementSlot[] = [];
/** Selection courante pendant la phase de placement — indices dans
 *  `placementSlots` (2026-08-14, refonte demandee par Antoine : "évite de
 *  conserver selectedUnit dans dix endroits différents"). REMPLACE l'ancien
 *  couple selectedSlot/selectedGroup (deux variables mutuellement exclusives
 *  qu'il fallait synchroniser a la main partout) par UNE seule source de
 *  verite : tableau vide = rien de selectionne, 1 element = selection
 *  simple, 2+ = selection de groupe — plus aucune distinction de CAS entre
 *  les deux, chaque appelant lit juste `.length`. Jamais de doublon (voir
 *  setSelection). Fonctions dediees juste en dessous (clearSelection/
 *  setSelection/isSelected) plutot qu'une mutation directe eparpillee. */
let selectedIndices: number[] = [];

function clearSelection(): void {
  selectedIndices = [];
}

/** Remplace ENTIEREMENT la selection courante (jamais un ajout) — source
 *  unique pour les 3 façons de selectionner (clic simple, double-clic meme
 *  type, rectangle glisse). Deduplique par securite (aucun appelant actuel
 *  n'en produit, mais un tableau selectionne doit rester un ensemble). */
function setSelection(indices: number[]): void {
  selectedIndices = Array.from(new Set(indices));
}

function isSelected(index: number): boolean {
  return selectedIndices.includes(index);
}

let inPlacementPhase = false;

/** Or possede au tout DEBUT de la phase de placement en cours (capture au
 *  sommet de startPlacement, avant l'ouverture automatique de la boutique) —
 *  sert de reference a la barriere de securite "il vous reste de l'or", voir
 *  requestValidatePlacement. */
let goldAtPlacementStart = 0;

/** Glisser une unite en main vers l'onglet "Vendre" (demande d'Antoine,
 *  2026-08-08) : clic maintenu sur une unite, puis glisser au-dessus de la
 *  zone pour la vendre. `dragging` ne passe a vrai qu'apres avoir depasse
 *  un petit seuil de deplacement ecran (voir UNIT_DRAG_THRESHOLD_PX) — sinon
 *  un simple clic (sans bouger) serait interprete comme un glisser manque et
 *  ne selectionnerait jamais l'unite. */
interface UnitDragState {
  slotIndex: number;
  /** Non-null si le slot glisse fait partie du groupe actuellement
   *  selectionne (voir selectedIndices) : on deplace ou on vend alors tout
   *  le groupe d'un bloc plutot que ce seul slot — meme delta que
   *  handleGroupMoveClick, slotIndex sert d'ancre. */
  groupIndices: number[] | null;
  startClientX: number;
  startClientY: number;
  dragging: boolean;
}
let unitDrag: UnitDragState | null = null;
const UNIT_DRAG_THRESHOLD_PX = 6;

/** Double-clic MANUEL sur une unite en placement (voir le listener
 *  mousedown correspondant) — pas de mecanisme base sur l'evenement natif
 *  'dblclick', abandonne le 2026-08-10 apres un bug remonte par Antoine (le
 *  premier clic selectionnait puis le second desselectionnait, la selection
 *  de groupe n'apparaissait jamais). */
let lastUnitClickSlot: number | null = null;
let lastUnitClickTime = 0;
const DOUBLE_CLICK_WINDOW_MS = 400;

/** Meme detection manuelle, pour l'editeur de maps (2026-08-11, demande
 *  d'Antoine : "double clic pour selectionner une unite" — comprendre
 *  "toutes celles du meme type", voir EditorState.selectSameTypeUnits).
 *  Etat separe de lastUnitClickSlot/lastUnitClickTime : placement et
 *  editeur ne sont jamais actifs en meme temps, mais partagent le meme id
 *  d'objet (nextId commun, voir EditorState) — reutiliser le meme etat
 *  risquerait une collision accidentelle entre les deux contextes. */
let lastEditorUnitClickId: number | null = null;
let lastEditorUnitClickTime = 0;

/** Selectionne TOUTES les unites du MEME TYPE que `hoveredSlot` presentes
 *  dans la phase de placement — devient une selection de groupe normale,
 *  sauf s'il n'y a qu'UNE seule unite de ce type (simple selection dans ce
 *  cas, meme convention que selectUnitsInRect avec un seul resultat).
 *  **Plus de plafond** (2026-08-14, demande explicite d'Antoine, point 18 :
 *  "je préfère désormais une vraie sélection cohérente de toutes les unités
 *  du même type... sauf problème réel de performance") — l'ancien plafond
 *  DOUBLE_CLICK_SAME_TYPE_MAX n'avait aucune justification technique reelle
 *  ici : ce n'est qu'un index/quelques anneaux de selection HTML, sans
 *  rapport avec les couts O(n²) de la simulation (separation/ciblage, voir
 *  CLAUDE.md) qui ne tournent que PENDANT la bataille, jamais pendant le
 *  placement. Toujours utilise par l'editeur de maps (EditorState.
 *  selectSameTypeUnits), contexte distinct non concerne par cette demande —
 *  laisse intact. Trie par distance au point de reference par pure
 *  coherence visuelle (le groupe le plus proche d'abord), sans consequence
 *  fonctionnelle puisque tous les elements sont desormais retenus. */
function selectSameTypeGroup(hoveredSlot: number): void {
  const origin = placementSlots[hoveredSlot]!;
  const sameType = placementSlots
    .map((slot, i) => ({ i, slot }))
    .filter(({ slot }) => slot.unitId === origin.unitId && slot.x !== null && slot.z !== null)
    .sort((a, b) => {
      const da = (a.slot.x! - origin.x!) ** 2 + (a.slot.z! - origin.z!) ** 2;
      const db = (b.slot.x! - origin.x!) ** 2 + (b.slot.z! - origin.z!) ** 2;
      return da - db;
    })
    .map(({ i }) => i);

  setSelection(sameType.length <= 1 ? [hoveredSlot] : sameType);
  refreshPlayerPreview();
}

function cancelUnitDrag(): void {
  unitDrag = null;
  sellZone.hideGhost();
  sellZone.setArmed(false);
  placementHighlight.hide();
}

/** Glisser sur le SOL (pas sur une unite) pendant le placement : au-dela du
 *  seuil, dessine un rectangle de selection (voir SelectionBox) plutot que
 *  de deplacer quoi que ce soit. Resolu au relachement (voir le listener
 *  mouseup plus bas, selectUnitsInRect). */
interface GroundDragState {
  startClientX: number;
  startClientY: number;
  dragging: boolean;
}
let groundDrag: GroundDragState | null = null;

function cancelGroundDrag(): void {
  groundDrag = null;
  selectionBox.hide();
}

const playerPreview = new THREE.Group();
const enemyPreview = new THREE.Group();
renderer.scene.add(playerPreview);
renderer.scene.add(enemyPreview);

/** Aperçu de destination pendant un glisser en placement (voir
 *  render/placementHighlight.ts) — un ou plusieurs cadres bleus selon qu'on
 *  glisse une unite seule ou un groupe. */
const placementHighlight = new PlacementHighlight();
renderer.scene.add(placementHighlight.group);

/** Reticule de vise au sol pour la fleche du joueur : suit la souris pendant
 *  la bataille, s'assombrit pendant le cooldown pour signaler qu'un tir n'est
 *  pas encore possible (voir updateAimReticle). */
function createAimReticle(): THREE.Mesh {
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.28, 0.4, 24),
    new THREE.MeshBasicMaterial({ color: COLORS.playerArrowAccent, transparent: true, opacity: 0.9, side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.02;
  ring.visible = false;
  return ring;
}

/** Anneau plat aux couleurs du camp, pose sous l'unite selectionnee. */
function createSelectionRing(): THREE.Mesh {
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.34, 0.44, 24),
    new THREE.MeshBasicMaterial({ color: COLORS.playerHead, transparent: true, opacity: 0.9, side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.02;
  return ring;
}

/** Une unite posee est-elle eligible au bonus de revente du talent
 *  "Recyclage" (2026-08-14, voir data/talents.ts, sellUnit) — sous 50% de
 *  ses PV maximum EFFECTIFS (avec ameliorations permanentes, coherent avec
 *  le calcul de revente reel). Sans effet si le talent n'est pas
 *  deverrouille. */
function isRecyclageEligible(slot: PlacementSlot): boolean {
  if (!isTalentActive('recyclage')) return false;
  return slot.hp < 0.5 * effectivePlayerUnitMaxHp(slot.unitId, metaProgress);
}

/** Anneau de PREVISUALISATION de la cible de soin (2026-08-11, demande
 *  d'Antoine : "le curseur n'est pas tres clair quant a l'unite soignee") —
 *  reutilise createSelectionRing telle quelle (meme rendu que la selection
 *  de placement), mais un objet INDEPENDANT ajoute une seule fois a la
 *  scene et simplement repositionne/masque a chaque survol, plutot qu'un
 *  enfant reconstruit avec le reste de playerPreview. Voir
 *  updateHealTargetPreview. */
const healTargetRing = createSelectionRing();
healTargetRing.visible = false;
renderer.scene.add(healTargetRing);

/** Met a jour (ou masque) l'anneau de previsualisation de la cible de soin
 *  selon la position actuelle du curseur — utilise EXACTEMENT la meme
 *  resolution de cible que le clic reel (findHealTargetEntity/
 *  findHealTargetSlotIndex), pour que ce que le joueur voit corresponde
 *  toujours a ce qui se passera vraiment au clic. */
function updateHealTargetPreview(event: MouseEvent): void {
  healTargetRing.visible = false;
  if (armedItemIndex === null) return;
  const owned = currentRun.inventory[armedItemIndex];
  if (!owned || getItem(owned.itemId).effect.type !== 'heal') return;

  const point = computeGroundPoint(event);
  if (!point) return;

  if (inBattlePhase()) {
    const target = findHealTargetEntity(point.x, point.z);
    if (!target) return;
    const pos = unitViews.getPosition(target.id) ?? { x: target.x, z: target.z };
    healTargetRing.position.set(pos.x, 0.02, pos.z);
    healTargetRing.visible = true;
  } else if (inPlacementPhase) {
    const slotIndex = findHealTargetSlotIndex(point.x, point.z);
    if (slotIndex === null) return;
    const slot = placementSlots[slotIndex]!;
    healTargetRing.position.set(slot.x ?? 0, 0.02, slot.z ?? 0);
    healTargetRing.visible = true;
  }
}

/**
 * Anneau de PREVISUALISATION de la Nova de glace (2026-08-14, meme motif
 * qu'updateHealTargetPreview ci-dessus) — suit le point du sol sous le
 * curseur tant que l'objet est arme, a EXACTEMENT le rayon gameplay reel
 * (voir data/items.ts, IceNovaEffect.radiusTiles) : le joueur voit toujours
 * precisement qui sera touche avant de cliquer. Contrairement au soin, aucun
 * ciblage de cible n'est resolu ici — un point du sol suffit, la zone
 * touchera qui s'y trouvera au moment du clic.
 */
function updateIceNovaTargetPreview(event: MouseEvent): void {
  iceNovaView.hideTargetPreview();
  if (armedItemIndex === null || !inBattlePhase()) return;
  const owned = currentRun.inventory[armedItemIndex];
  if (!owned) return;
  const def = getItem(owned.itemId);
  if (def.effect.type !== 'ice-nova') return;

  const point = computeGroundPoint(event);
  if (!point) return;
  iceNovaView.showTargetPreview(point.x, point.z, def.effect.radiusTiles);
}

/**
 * Orchestration de la Nova de glace (2026-08-14) — impact INSTANTANE : Root
 * sur les ennemis presents dans la zone A CET INSTANT, VFX, PUIS (et
 * SEULEMENT si le talent Blizzard est debloque) une zone persistante en
 * PLUS — jamais a la place. Voir data/talents.ts, blizzard : "Nova de glace
 * crée en plus un Blizzard", jamais "remplace par". Les deux effets
 * (Root et Blizzard) sont totalement INDEPENDANTS cote simulation (voir
 * World.applyIceNovaRoot / World.createBlizzardZone / sim/systems/
 * persistentAreaEffects.ts) : le Root ne regarde que t=0, le Blizzard
 * re-scanne la zone a chaque tick — jamais la meme liste de cibles figee.
 */
function castIceNova(x: number, z: number, effect: IceNovaEffect): void {
  // Duree du Root/du Blizzard et degats de tick : valeurs EFFECTIVES (base +
  // amelioration permanente, voir run/iceNovaUpgradeEffects.ts), jamais les
  // valeurs de base de l'objet (effect.rootDuration) ni les constantes brutes
  // (BLIZZARD_DURATION/BLIZZARD_DAMAGE_PER_TICK) directement — 2026-08-14,
  // demande d'Antoine : "la durée doit augmenter de 0.5 par amélioration...
  // tous les 3 achats augmente les dégâts du tick de 1".
  const upgrade = computePlayerIceNovaUpgradeEffects(metaProgress);
  world.applyIceNovaRoot('player', x, z, effect.radiusTiles, upgrade.rootDuration);
  iceNovaView.spawnImpact(x, z, effect.radiusTiles);

  if (isTalentActive('blizzard')) {
    world.createBlizzardZone('player', x, z, effect.radiusTiles, upgrade.blizzardDuration, BLIZZARD_TICK_INTERVAL, upgrade.damagePerTickInternal);
  }
}

/**
 * Talent "Soins excédentaires" (2026-08-15) : `totalOverhealInternal`
 * (échelle interne x10) est la somme du soin REELLEMENT excedentaire
 * (demande - reellement applique, plafonne au maxHp) sur TOUTES les cibles
 * d'une meme action de soin (voir applyPlayerHeal) — appelee depuis les 2
 * usages manuels du parchemin de soin (bataille) ET le declenchement
 * automatique d'"Aux petits oignons", jamais depuis le placement (aucun
 * ennemi n'existe encore, voir useArmedItemOnPlacementClick).
 *
 * GATE sur le talent lui-meme EN PREMIER (pas seulement l'amelioration
 * permanente) : sans "Soins excédentaires" débloqué, le mecanisme entier
 * n'existe pas, meme a 0 degat de base — un niveau d'amelioration deja
 * achete (jamais supprime par un reset des talents, voir
 * run/shadowUpgradeEffects.ts) redevient donc automatiquement actif des que
 * le talent est re-debloque, sans code supplementaire : ce gate est
 * reevalue A CHAQUE appel, jamais mis en cache.
 *
 * `baseProjectileCount` = 1 projectile par point de soin EXCEDENTAIRE
 * AFFICHE (HP_PER_PIP) — floor() : un total fractionnaire (soins secondaires
 * a 0.5 pres) ne produit jamais un projectile "a moitie". Le bonus de
 * l'amelioration permanente (`bonusProjectileCount`) ne s'ajoute JAMAIS a un
 * overheal nul (demande explicite : "0 overheal → 0 projectiles, meme au
 * niveau 30").
 */
function triggerShadowProjectiles(x: number, z: number, totalOverhealInternal: number): void {
  if (!isTalentActive('soins_excedentaires')) return;

  const baseProjectileCount = Math.floor(totalOverhealInternal / HP_PER_PIP);
  if (baseProjectileCount <= 0) return;

  const { damagePerProjectileInternal, bonusProjectileCount } = computePlayerShadowEffects(metaProgress);
  const count = baseProjectileCount + bonusProjectileCount;
  world.spawnShadowProjectiles(x, z, 'player', count, damagePerProjectileInternal, SHADOW_PROJECTILE_SPEED);
}

function refreshPlayerPreview(): void {
  playerPreview.clear();
  placementSlots.forEach((slot, index) => {
    if (slot.x === null || slot.z === null) return;
    const mesh = buildUnit(slot.unitId, 'player');
    mesh.position.set(slot.x, 0, slot.z);
    mesh.userData['slotIndex'] = index;
    if (isSelected(index)) mesh.add(createSelectionRing());
    // Talent "Recyclage" : la surbrillance n'est PLUS un enfant statique du
    // mesh ici (voir recyclageAuraView, une aura de particules animee en
    // continu, synchronisee separement chaque frame dans la boucle de rendu
    // — 2026-08-14, "on ne voit vraiment pas quand un soldat peut être
    // recyclé... n'hésite pas").
    playerPreview.add(mesh);
  });
  // Bouton "Vendre" cliquable (2026-08-14, demande d'Antoine, point 28-29) :
  // reflete la selection courante a CHAQUE rafraichissement de l'apercu —
  // refreshPlayerPreview tourne deja apres tout changement de selection ET
  // apres toute vente/achat, donc un seul point d'appel suffit, jamais besoin
  // de le repeter a chaque site qui modifie selectedIndices.
  sellZone.setSelection(selectedIndices.length, computeSellValue(selectedIndices));
}

/** Valeur de revente EFFECTIVE d'un lot d'unites (somme des valeurs
 *  individuelles, jamais un montant approxime "count * valeur unique") —
 *  SOURCE PARTAGEE entre l'affichage du bouton "Vendre" (ci-dessus) et la
 *  vente reelle (voir sellUnits) : la meme formule par unite (Recyclage vs
 *  bareme normal) ne doit jamais diverger entre "ce qui est annonce" et "ce
 *  qui est effectivement credite". */
function computeSellValue(indices: number[]): number {
  let total = 0;
  for (const index of indices) {
    const slot = placementSlots[index];
    if (!slot) continue;
    total += isRecyclageEligible(slot) ? Math.round(3 * effectivePlayerUnitCost(slot.unitId, metaProgress)) : (KILL_REWARD[slot.unitId] ?? 0);
  }
  return total;
}

/** Remonte la hierarchie Three.js depuis l'objet touche par le raycast
 *  jusqu'au groupe racine d'une unite, qui seul porte `slotIndex`. */
function findSlotIndex(object: THREE.Object3D | null): number | null {
  let current = object;
  while (current) {
    const index = current.userData['slotIndex'];
    if (typeof index === 'number') return index;
    current = current.parent;
  }
  return null;
}

/** Clic simple sur une unite : selection UNIQUE (remplace toujours une
 *  eventuelle selection de groupe en cours, point 16 de la demande) — sauf
 *  si CETTE unite etait deja la SEULE selectionnee, auquel cas le clic la
 *  desselectionne (toggle, comportement d'origine preserve). */
function selectSlot(index: number): void {
  setSelection(selectedIndices.length === 1 && selectedIndices[0] === index ? [] : [index]);
  refreshPlayerPreview();
}

/** Barriere de securite (2026-08-10, demande d'Antoine) : si l'or restant
 *  depasse PLACEMENT_GOLD_WARNING_RATIO de l'or possede au tout DEBUT de
 *  cette phase de placement (voir goldAtPlacementStart, capture dans
 *  startPlacement), affiche un popup de confirmation plutot que de lancer la
 *  bataille tout de suite — evite de partir au combat en oubliant de
 *  depenser l'or accumule. En dessous du seuil, valide directement sans rien
 *  demander. */
function requestValidatePlacement(): void {
  const threshold = goldAtPlacementStart * PLACEMENT_GOLD_WARNING_RATIO;
  if (currentRun.gold > threshold) {
    screens.showPlacementGoldWarning(currentRun.gold);
  } else {
    onValidatePlacement();
  }
}

function onValidatePlacement(): void {
  resetBattleControls();
  inPlacementPhase = false;
  placementPanel.hide();
  // Reste visible mais desactive pendant la bataille (2026-08-14, demande
  // d'Antoine : "laisse les visible ils sont simplement censes etre
  // inutilisables") — plus de setVisible(false) ici.
  sellZone.setEnabled(false);
  // inventoryBar reste visible : c'est justement pendant la bataille qui
  // commence qu'on peut utiliser les objets (voir armInventorySlot).
  disarmItem();
  cancelUnitDrag();
  cancelGroundDrag();
  // Deselectionne/annule tout ce qui touche aux bâtiments possedes
  // (2026-08-18) : la selection/le deplacement n'ont plus de sens une fois
  // la bataille commencee. cancelBuildingPlacement() efface deja
  // buildingClickCandidate au passage (voir son commentaire), inconditionnel
  // et sans effet si aucun placement n'etait en cours.
  cancelBuildingPlacement();
  selectedBuildingIndex = null;
  updateBuildingSelectionRing();
  clearSelection();
  playerPreview.clear();
  enemyPreview.clear();
  board.gridLines.visible = false;
  board.zones.visible = false;

  world.clear();
  rewardedEnemyDeaths.clear();
  belowAutoHealThreshold.clear();
  mineIncomeAccumulator = 0;
  pendingArrowSpawns.length = 0;
  unitViews.clear();
  combatOverlay.clear();
  projectiles.clear();
  playerArrowView.clear();
  telegraphView.clear();
  fireballView.clear();
  iceNovaView.clear();
  healVfxView.clear();
  tauntVfxView.clear();
  shadowProjectileView.clear();
  battleOver = false;

  // world.setMap n'injecte plus l'obstacle de la Mine lui-meme depuis le
  // 2026-08-16 (architecture BUILDING) : World.spawnBuilding s'en charge
  // desormais lui-meme (voir plus bas), ce qui lui permet de retirer cette
  // meme empreinte automatiquement des que le batiment meurt (voir
  // World.releaseDeadBuildingFootprints) — un obstacle injecte ici, sans
  // Entity associee, resterait bloque pour toujours meme apres destruction.
  world.setMap(currentMap);

  for (const slot of placementSlots) {
    if (slot.x === null || slot.z === null) continue;
    world.spawn(
      slot.unitId,
      'player',
      slot.x,
      slot.z,
      slot.hp,
      playerStatOverrides(slot.unitId),
      playerAbilityDamageBonus(slot.unitId),
      playerTauntShieldBonus(slot.unitId),
    );
  }
  for (const pos of computeEnemyWavePlacements(currentRun.waveNumber, currentMap)) {
    world.spawn(
      pos.unitId,
      'enemy',
      pos.x,
      pos.z,
      undefined,
      enemyStatOverrides(pos.unitId, currentRun.waveNumber),
      enemyAbilityDamageBonus(pos.unitId, currentRun.waveNumber),
    );
  }

  // Batiments POSSEDES par le joueur (2026-08-17, Mine/Caserne achetables —
  // voir run/runState.ts, RunState.buildings) : les meshes existent deja
  // (visibles pendant tout le placement, voir refreshOwnedBuildingViews) —
  // reconstruits ici pour repartir d'un etat visuel propre (flash eteint),
  // PUIS une vraie Entity est spawnee pour chacun, dans le MEME ORDRE que
  // currentRun.buildings (invariant requis par applyBattleOutcome, voir son
  // commentaire de fonction). PV ACTUELS reels (owned.hp, jamais pleins PV a
  // chaque bataille — un bâtiment blesse le reste jusqu'a la fin de la run,
  // meme convention que les unites). buildingViewsByEntityId (dispatch
  // generique du flash/de la destruction, voir plus haut) regroupe Mine/
  // Caserne ET la Baliste dans la MEME Map.
  buildingViewsByEntityId.clear();
  refreshOwnedBuildingViews();
  currentRun.buildings.forEach((owned, i) => {
    // Intervalle/nombre de production EFFECTIFS (2026-08-17, amelioration
    // permanente de la Caserne) — undefined pour tout bâtiment sans spawner
    // (Mine), World.spawnBuilding retombe alors sur la base (sans effet).
    const spawnIntervalOverride = owned.buildingId === 'barracks' ? effectiveBarracksSpawnInterval(metaProgress) : undefined;
    const spawnCountOverride = owned.buildingId === 'barracks' ? effectiveBarracksSpawnCount(metaProgress) : undefined;
    const entity = world.spawnBuilding(
      getBuilding(owned.buildingId),
      'player',
      owned.x,
      owned.z,
      ownedBuildingObstacle(owned),
      owned.hp,
      undefined,
      spawnIntervalOverride,
      spawnCountOverride,
    );
    const view = ownedBuildingViews[i]!.view;
    view.reset();
    buildingViewsByEntityId.set(entity.id, view);
  });

  // La Baliste est TOUJOURS presente (jamais achetee, contrairement a la
  // Mine/la Caserne ci-dessus). PV max EFFECTIFS (2026-08-16, amelioration
  // permanente "+10 PV/niveau" — voir run/ballistaUpgradeEffects.ts) : `hp`
  // (5e param apres le footprint) omis expres pour retomber sur ce plafond
  // EFFECTIF (voir World.spawnBuilding) — sans ca, une Baliste amelioree
  // apparaitrait avec plus de PV MAX mais pas plus de PV ACTUELS.
  ballistaBuildingView.reset();
  ballistaEntityId = world.spawnBuilding(
    getBuilding('ballista'),
    'player',
    playerArrowOrigin.x,
    playerArrowOrigin.z,
    ballistaObstacleDef,
    undefined,
    effectiveBallistaMaxHp(metaProgress),
  ).id;
  buildingViewsByEntityId.set(ballistaEntityId, ballistaBuildingView);

  loop.timeScale = 1;
}

function startPlacement(): void {
  goldAtPlacementStart = currentRun.gold;
  // Le bouton "Annuler le dernier achat" ne doit valoir que pour CETTE
  // session de boutique (voir lastUnitPurchase) — un achat de la vague
  // precedente n'a plus de sens a annuler une fois une nouvelle phase de
  // placement commencee.
  lastUnitPurchase = null;
  // Reconstruit les meshes des batiments POSSEDES (Mine, Caserne...) depuis
  // currentRun.buildings — reflete immediatement un achat fait pendant la
  // vague precedente (voir requestPlaceBuilding/confirmBuildingPlacement).
  refreshOwnedBuildingViews();

  screens.hideAll();
  inPlacementPhase = true;
  board.gridLines.visible = true;
  board.zones.visible = true;
  waveIndicator.update(currentRun.waveNumber);
  waveIndicator.setVisible(true);
  goldHud.setVisible(true);

  const formation = computeArmyFormation(currentRun.army.map((u) => u.unitId), currentMap);
  placementSlots = currentRun.army.map((unit, i) => ({
    unitId: unit.unitId,
    x: formation[i]!.x,
    z: formation[i]!.z,
    hp: unit.hp,
  }));
  clearSelection();
  refreshPlayerPreview();

  enemyPreview.clear();
  for (const pos of computeEnemyWavePlacements(currentRun.waveNumber, currentMap)) {
    const mesh = buildUnit(pos.unitId, 'enemy');
    mesh.position.set(pos.x, 0, pos.z);
    mesh.rotation.y = Math.PI;
    enemyPreview.add(mesh);
  }

  placementPanel.show();
  sellZone.setVisible(true);
  sellZone.setEnabled(true);
  inventoryBar.setVisible(true);
  inventoryBar.refresh(currentRun.inventory);

  // La boutique s'ouvre desormais automatiquement a CHAQUE debut de phase de
  // placement (demande d'Antoine, 2026-08-10 : "dès le début... et à chaque
  // début de phase de placement"), y compris le tout premier placement d'une
  // run (voir startNewRun) — plus besoin de cliquer sur "Boutique" pour la
  // voir au moins une fois. L'ancien ecran boutique "intermediaire" separe
  // (entre l'ecran de fin de vague et le placement) a disparu : il n'existe
  // plus qu'UNE facon d'ouvrir la boutique, celle-ci, que ce soit ici ou via
  // le bouton "Boutique" pendant le placement (voir openShopFromPlacement).
  openShopFromPlacement();
  if (lastBattleGoldEarned !== 0) {
    spawnCoinPopup(screens.shopGoldElement, lastBattleGoldEarned);
    lastBattleGoldEarned = 0;
  }
}

/** Remet a zero l'etat de placement/occupation qui vit hors de RunState, pour
 *  qu'une nouvelle run (et d'abord le placement de la tour, qui passe par
 *  isValidPlacementTile) n'herite d'aucune case occupee par la run
 *  precedente. A appeler apres `currentRun = createNewRun(...)` :
 *  refreshOwnedBuildingViews reconstruit depuis la nouvelle run. */
function resetRunPlacementState(): void {
  placementSlots = [];
  clearSelection();
  lastUnitClickSlot = null;
  lastUnitPurchase = null;
  cancelUnitDrag();
  cancelGroundDrag();
  cancelBuildingPlacement();
  selectedBuildingIndex = null;
  updateBuildingSelectionRing();
  disarmItem();
  playerPreview.clear();
  enemyPreview.clear();
  refreshOwnedBuildingViews();
}

/** Clic sur "Jouer" au menu principal : demarre une run TOUTE NEUVE (or et
 *  armee reinitialises, voir createNewRun) avant d'entrer en placement —
 *  contrairement a "Continuer" depuis la boutique, qui reutilise la run en
 *  cours pour passer a la vague suivante (voir startPlacement seul). */
function startNewRun(): void {
  currentRun = createNewRun(computeStartingGoldBonus(metaProgress), effectivePlayerUnitMaxHp('fantassin', metaProgress));
  resetRunPlacementState();
  // Une run PRECEDENTE peut avoir agrandi le plateau (2026-08-18, voir
  // applyMapExpansionForCompletedWave) — currentMap est un module partage
  // entre runs, currentRun.mapExpansion vient de repartir de zero ci-dessus
  // mais currentMap/le rendu ne le savent pas encore : resynchronise AVANT
  // de commencer le placement obligatoire de la tour (jamais en parallele —
  // beginTowerPlacement() lirait sinon un plateau perime le temps de la
  // reconstruction async). Reste synchrone (`() => void`, signature exigee
  // par ScreenHandlers.onPlay) : le cas courant (aucune expansion a defaire)
  // demarre immediatement, seul le cas rare (retour d'une run avancee)
  // attend la reconstruction avant de le faire.
  //
  // Placement OBLIGATOIRE de la tour (2026-08-18, demande explicite
  // d'Antoine : "la première chose à faire... doit être PLACER SA TOUR") —
  // remplace l'ancien appel direct a startPlacement() : currentRun.ballistaPosition
  // est TOUJOURS null ici (createNewRun ci-dessus), beginTowerPlacement()
  // appelle elle-meme startPlacement() une fois la tour reellement posee
  // (voir confirmTowerPlacement).
  if (currentMap === DEFAULT_MAP) {
    beginTowerPlacement();
  } else {
    void resetGameBoardToDefaultMap().then(beginTowerPlacement);
  }
}

/**
 * Ouvre la boutique PAR-DESSUS le placement en cours, sans l'interrompre —
 * la seule facon d'ouvrir la boutique desormais (2026-08-10) : soit
 * automatiquement a chaque debut de placement (voir startPlacement), soit via
 * le bouton "Boutique" au-dessus de "Vendre" pendant le placement. "Continuer"
 * dans la boutique (onContinueAfterShop) se contente donc toujours de la
 * refermer (screens.hideAll()) — plus jamais de relancer startPlacement()
 * depuis ce bouton, qui reinitialiserait les positions deja ajustees par
 * Antoine. Un achat modifie `currentRun.army`/`inventory` ET `placementSlots`
 * tout de suite (voir addUnitToPlacement) : utilisable immediatement pour LA
 * bataille sur le point de commencer, pas seulement la suivante.
 *
 * BASCULE ouvrir/fermer (2026-08-10, demande d'Antoine : "on doit cliquer sur
 * Boutique pour entrer, mais appuyer sur Continuer dans un autre encart pour
 * sortir, je voudrais pouvoir continuer a appuyer sur Boutique pour sortir
 * rapidement") : si la boutique est deja ouverte, ce meme bouton la referme —
 * voir aussi ui/style.css, .sell-zone-container remonte au-dessus de
 * .screen-overlay pour que le bouton reste cliquable une fois la boutique
 * affichee par-dessus.
 */
function openShopFromPlacement(): void {
  if (screens.isShopOpen()) {
    screens.hideAll();
    return;
  }
  screens.showShop(currentRun, metaProgress, lastUnitPurchase !== null);
}

// --- Editeur de maps (chantier en cours — voir CLAUDE.md) ---------------
//
// Accessible depuis le menu principal. A son PROPRE sol/grille/zones/
// obstacles (editorBoardGroup/editorObjectsGroup), independants de ceux de
// la partie en cours (board), depuis l'ajout du redimensionnement — mais
// construits avec les memes fonctions de rendu que le jeu reel (createBoard,
// createRock/createTreeObstacle, via board.ts/editorScene.ts) : ce qu'on
// voit dans l'editeur reste exactement ce qu'on verra en jeu.

let inEditorMode = false;
/** Vrai pendant une bataille lancee depuis "Tester le scenario" (voir
 *  testScenario) : la sim/le rendu de bataille tournent normalement (memes
 *  regles, meme flux que le jeu reel), seule la reaction a la fin de la
 *  bataille change (retour a l'editeur plutot que l'ecran de fin de vague,
 *  voir la boucle plus bas). Distinct de inEditorMode : les deux ne sont
 *  jamais vrais en meme temps (le clic editeur est desactive pendant le test,
 *  exactement comme pendant une bataille normale). */
let inTestMode = false;
let editorState: EditorState | null = null;
let editorAssets: EnvironmentAssets | null = null;
let editorGhost: THREE.Object3D | null = null;
// Map d'origine de la session d'edition en cours : DEFAULT_MAP par defaut,
// remplacee par le fichier charge via "Charger une carte" (voir onLoad) —
// c'est elle qui fournit la taille/les unites de depart au moment
// d'exporter (voir mapSerializer.ts, exportMapDef), puisque l'editeur
// n'edite encore que les obstacles.
let editorBaseMap: MapDef = DEFAULT_MAP;

// Plateau visuel de la bataille de test ("Tester le scenario") — separe de
// `board` (le plateau du jeu reel, jamais touche par un test) pour ne pas
// avoir a le reconstruire a chaque aller-retour. Construit a l'entree du
// test, retire de la scene au retour dans l'editeur.
let testBoard: Board | null = null;

// Mesh par id d'obstacle deja construit, pour eviter de rappeler
// createRock/createTreeObstacle (qui tirent leur composition/orientation au
// hasard a CHAQUE appel) sur un objet que rien n'a modifie — voir
// refreshEditorObjects. Sans ce cache, n'importe quel clic ailleurs sur le
// plateau faisait "sauter" tous les arbres/rochers deja poses (bug remonte
// par Antoine).
const editorMeshes = new Map<number, THREE.Group>();

// Meme principe pour les unites, plus une trace du dernier camp rendu par id :
// une unite trainee de l'autre cote du plateau doit changer de couleur, ce
// qui n'est possible qu'en reconstruisant son mesh (buildUnit fabrique des
// boites deja teintees, la couleur n'est pas une propriete qu'on peut changer
// en place) — mais seulement quand son camp a REELLEMENT change, pas a
// chaque frame.
const editorUnitMeshes = new Map<number, THREE.Group>();
const editorUnitMeshTeams = new Map<number, Team>();
/** Anneau de selection par unite du GROUPE selectionne (2026-08-11, voir
 *  EditorState.selectSameTypeUnits) — distinct de editorSelectionRing (un
 *  seul anneau partage pour une selection SIMPLE d'obstacle/unite) : un
 *  groupe a besoin d'un anneau par membre, ajoute comme enfant du mesh de
 *  cette unite (meme principe que refreshPlayerPreview en phase de
 *  placement) plutot qu'un objet unique repositionne. */
const editorGroupRings = new Map<number, THREE.Mesh>();

const editorObjectsGroup = new THREE.Group();
const editorUnitsGroup = new THREE.Group();
const editorGhostGroup = new THREE.Group();
renderer.scene.add(editorObjectsGroup, editorUnitsGroup, editorGhostGroup);

// Sol/grille/zones PROPRES a l'editeur, distincts de ceux de la partie en
// cours (board.group) : necessaire pour le redimensionnement (Antoine,
// 2026-08-08) — changer la taille d'un brouillon dans l'editeur ne doit pas
// changer la taille du plateau reellement en jeu tant que la carte n'est pas
// explicitement testee/chargee (fonctionnalite pas encore construite). Toute
// la partie en cours (board.group, qui inclut son sol/grille/zones/obstacles/
// decor) est masquee en entrant dans l'editeur et reaffichee en sortant.
const editorBoardGroup = new THREE.Group();
editorBoardGroup.visible = false;
renderer.scene.add(editorBoardGroup);

/** Reconstruit entierement le sol/la grille/les zones de l'editeur a la
 *  taille courante de editorState — pas de mise a jour incrementale
 *  (meme logique que refreshEditorObjects pour les obstacles : la taille ne
 *  change pas a chaque frame, reconstruire au clic sur "Appliquer" est bien
 *  assez rare pour rester simple). */
function rebuildEditorBoard(): void {
  if (!editorState) return;
  editorBoardGroup.clear();
  // Terrain PAR CELLULE (2026-08-16, chantier map irreguliere) : reflete
  // exactement editorState.cells, y compris les trous crees via l'outil
  // Supprimer case — jamais un simple rectangle width x height.
  const cells = editorState.cells;
  editorBoardGroup.add(buildTerrainCellsView(cells).group);
  editorBoardGroup.add(buildCellGridLines(cells, COLORS.gridLine));
  editorBoardGroup.add(createZonesGroup(editorState));
}

// Anneau reutilise pour toute selection : construit une fois a rayon unite,
// puis mis a l'echelle selon l'emprise de l'objet selectionne (voir
// refreshEditorObjects) plutot que de reconstruire la geometrie a chaque fois.
const editorSelectionRing = createEditorSelectionRing(1);
editorSelectionRing.visible = false;
renderer.scene.add(editorSelectionRing);
// Zone de saisie (invisible, plus large que le trait) qui fait de l'anneau la
// poignee de rotation d'un decor selectionne — voir tryStartRingRotate.
const editorRingHitArea = createSelectionRingHitArea();
editorSelectionRing.add(editorRingHitArea);

/**
 * Historique d'annulation de l'éditeur (2026-08-16, Part U de la demande) —
 * voir editor/history.ts. Vidé à chaque changement de carte (entrer dans
 * l'éditeur, charger un fichier) : annuler vers une carte qui n'est plus
 * celle en cours d'édition n'aurait aucun sens. Scope actuel (V1) :
 * déplacement/rotation libres d'un obstacle via TransformControls
 * ci-dessous — la demande d'Antoine porte explicitement sur "le déplacement
 * précis" et "la rotation", pas sur la placement/suppression, laissés
 * inchangés pour cette passe.
 */
const editorHistory = new EditorHistory();

/**
 * Déplacement/rotation précis des décors (2026-08-16, Part M/N de la
 * demande — "si TransformControls est déjà disponible/facile à intégrer,
 * utilise-le proprement"). Attaché UNIQUEMENT à l'obstacle sélectionné (voir
 * refreshEditorObjects) — jamais à une unité, qui reste grid-snappée par
 * clic. Toujours en translation, plan XZ seulement (les décors restent au
 * sol, jamais soulevés) : la rotation passe par l'anneau de sélection (voir
 * ringRotateDrag) et Ctrl+molette, pas par un mode du gizmo.
 */
const transformControls = new TransformControls(renderer.camera, canvas);
transformControls.size = 0.65;
transformControls.showY = false;
transformControls.showXY = false;
transformControls.showYZ = false;
renderer.scene.add(transformControls.getHelper());

/** Vrai tant qu'un glisser de gizmo est en cours (voir 'dragging-changed') —
 *  garde nos propres listeners de clic/pan (qui tournent sur le MEME
 *  canvas) de reagir au clic qui sert a saisir une poignee du gizmo. Le
 *  navigateur livre 'pointerdown' (ecoute en interne par TransformControls)
 *  AVANT 'mousedown' (nos propres listeners) pour un meme clic physique,
 *  donc ce flag est deja a jour au moment ou nos listeners s'executent. */
let transformDragging = false;

/** Transform capture au dernier 'mouseDown' du gizmo — sert a construire UNE
 *  SEULE commande d'annulation au relachement (Part U : "pendant un drag de
 *  2 secondes, ne cree pas 300 entrees Undo"), jamais une par 'objectChange'. */
let transformDragStart: { id: number; x: number; z: number; rotationY: number } | null = null;

transformControls.addEventListener('dragging-changed', (event) => {
  transformDragging = Boolean(event.value);
});

transformControls.addEventListener('mouseDown', () => {
  const obstacle = editorState?.selectedObstacle;
  if (!obstacle) return;
  const center = obstacleCenter(obstacle);
  transformDragStart = { id: obstacle.id, x: center.x, z: center.z, rotationY: obstacle.rotationY ?? 0 };
});

transformControls.addEventListener('objectChange', () => {
  const obstacle = editorState?.selectedObstacle;
  const object = transformControls.object;
  if (!editorState || !obstacle || !object) return;
  // Les decors restent au sol, jamais de hauteur — defensif en plus du
  // masquage des poignees Y/XY/YZ (showY=false ci-dessus n'empeche pas
  // absolument tout, une securite directe est plus sure qu'un raisonnement
  // implicite sur les poignees visibles). Le gizmo ne fait que deplacer : il
  // n'ecrit jamais rotationY.
  object.position.y = 0;
  editorState.moveSelected(object.position.x, object.position.z);
  refreshEditorObjects();
});

transformControls.addEventListener('mouseUp', () => {
  const start = transformDragStart;
  transformDragStart = null;
  const obstacle = editorState?.selectedObstacle;
  if (!start || !editorState || !obstacle || obstacle.id !== start.id) return;

  const end = { id: obstacle.id, x: obstacle.x ?? start.x, z: obstacle.z ?? start.z, rotationY: obstacle.rotationY ?? 0 };
  // Rien n'a reellement bouge (un simple clic sur une poignee sans glisser) :
  // ne pousse aucune commande vide dans l'historique.
  if (end.x === start.x && end.z === start.z && end.rotationY === start.rotationY) return;

  editorHistory.push({
    undo: () => {
      editorState?.setObstacleTransform(start.id, start.x, start.z, start.rotationY);
      refreshEditorObjects();
    },
    redo: () => {
      editorState?.setObstacleTransform(end.id, end.x, end.z, end.rotationY);
      refreshEditorObjects();
    },
  });
});

/**
 * Rotation d'un decor par l'anneau de selection : clic gauche maintenu sur
 * l'anneau, puis glisser autour de l'objet. L'angle est toujours calcule
 * depuis le repere capture au clic (jamais accumule), donc aucun saut au
 * passage 0°/360°. Une seule commande d'historique par glisser, poussee au
 * relachement (voir endRingRotateDrag).
 */
interface RingRotateDrag {
  id: number;
  startRotation: number;
  startPointerAngle: number;
  currentRotation: number;
}
let ringRotateDrag: RingRotateDrag | null = null;

/** Orientation actuelle d'un decor : rotationY si elle a ete fixee, sinon
 *  l'orientation aleatoire tiree a sa creation, portee par la racine de son
 *  mesh — partir de 0 le ferait sauter au premier mouvement. */
function currentObstacleRotation(obstacle: { id: number; rotationY?: number }): number {
  return obstacle.rotationY ?? editorMeshes.get(obstacle.id)?.rotation.y ?? 0;
}

/** Angle du curseur autour de (cx, cz) sur le plan du sol, dans la meme
 *  convention que rotation.y (tourner de +θ ajoute θ a atan2(x, z)). */
function pointerAngleAround(event: MouseEvent, cx: number, cz: number): number | null {
  setRaycasterFromEvent(event);
  if (!raycaster.ray.intersectPlane(groundPlane, groundHit)) return null;
  return Math.atan2(groundHit.x - cx, groundHit.z - cz);
}

/** Demarre un glisser de rotation si le clic touche l'anneau d'un DECOR
 *  selectionne (jamais une unite) en outil selection. Renvoie true si le
 *  clic est consomme. Les fleches du gizmo restent prioritaires : un clic
 *  sur une fleche n'arrive jamais ici (transformDragging deja vrai). */
function tryStartRingRotate(event: MouseEvent): boolean {
  if (!editorState || editorState.tool.type !== 'select') return false;
  const obstacle = editorState.selectedObstacle;
  if (!obstacle) return false;
  setRaycasterFromEvent(event);
  editorSelectionRing.updateMatrixWorld(true);
  if (raycaster.intersectObject(editorRingHitArea, false).length === 0) return false;
  const center = obstacleCenter(obstacle);
  const pointerAngle = pointerAngleAround(event, center.x, center.z);
  if (pointerAngle === null) return false;
  const startRotation = currentObstacleRotation(obstacle);
  ringRotateDrag = { id: obstacle.id, startRotation, startPointerAngle: pointerAngle, currentRotation: startRotation };
  return true;
}

function updateRingRotateDrag(event: MouseEvent): void {
  if (!ringRotateDrag || !editorState) return;
  const drag = ringRotateDrag;
  const obstacle = editorState.obstacles.find((o) => o.id === drag.id);
  if (!obstacle) return;
  const center = obstacleCenter(obstacle);
  const pointerAngle = pointerAngleAround(event, center.x, center.z);
  if (pointerAngle === null) return;
  editorState.setObstacleRotation(drag.id, drag.startRotation + pointerAngle - drag.startPointerAngle);
  drag.currentRotation = obstacle.rotationY ?? drag.startRotation;
  refreshEditorObjects();
}

/** Valide le glisser en cours : UNE seule commande d'historique, et seulement
 *  si l'angle a reellement change (un simple clic sur l'anneau ne pousse rien). */
function endRingRotateDrag(): void {
  const drag = ringRotateDrag;
  ringRotateDrag = null;
  if (!drag || drag.currentRotation === drag.startRotation) return;
  pushObstacleRotationCommand(drag.id, drag.startRotation, drag.currentRotation);
}

function pushObstacleRotationCommand(id: number, from: number, to: number): void {
  editorHistory.push({
    undo: () => {
      editorState?.setObstacleRotation(id, from);
      refreshEditorObjects();
    },
    redo: () => {
      editorState?.setObstacleRotation(id, to);
      refreshEditorObjects();
    },
  });
}

/** Ctrl+molette (±15°) / Ctrl+Maj+molette (±1°) sur le decor selectionne —
 *  une commande d'historique par cran. */
function rotateSelectedObstacleBy(deltaRad: number): void {
  const obstacle = editorState?.selectedObstacle;
  if (!editorState || !obstacle) return;
  const from = currentObstacleRotation(obstacle);
  editorState.setObstacleRotation(obstacle.id, from + deltaRad);
  pushObstacleRotationCommand(obstacle.id, from, obstacle.rotationY ?? from);
  refreshEditorObjects();
}

window.addEventListener('mousemove', (event) => {
  if (ringRotateDrag) updateRingRotateDrag(event);
});
window.addEventListener('mouseup', (event) => {
  if (event.button === 0 && ringRotateDrag) endRingRotateDrag();
});
window.addEventListener('blur', () => {
  if (ringRotateDrag) endRingRotateDrag();
});

const editorUI = new EditorUI({
  onSelectTemplate: (template) => {
    if (!editorState) return;
    editorState.setTool({ type: 'place-obstacle', template });
    clearEditorGhost();
    // Bug corrige (2026-08-16, "les batiments KayKit ne peuvent plus etre
    // places") : setTool() vide bien editorState.selection en interne, mais
    // le GIZMO VISUEL (transformControls) restait attache a l'ancien objet
    // selectionne jusqu'au PROCHAIN refreshEditorObjects() — qui n'etait
    // jamais appele ici. Choisir un nouvel asset juste apres avoir place le
    // precedent (deja auto-selectionne, voir EditorState.placeAt) laissait
    // donc un gizmo fantome pleinement interactif superpose au plateau : un
    // clic de placement qui atterrissait dessus etait intercepte par
    // TransformControls (deplacement/rotation de l'ANCIEN objet) au lieu de
    // poser le nouveau — reproduit et confirme en isolant exactement cette
    // sequence. refreshEditorObjects() detache immediatement le gizmo des
    // que selectedObstacle redevient null.
    refreshEditorObjects();
  },
  onSelectUnit: (unitId) => {
    if (!editorState) return;
    editorState.setTool({ type: 'place-unit', unitId });
    clearEditorGhost();
    refreshEditorObjects();
  },
  onSelectAddCellTool: (terrain) => {
    if (!editorState) return;
    editorState.setTool({ type: 'add-cell', terrain });
    clearEditorGhost();
    refreshEditorObjects();
  },
  onSelectRemoveCellTool: () => {
    if (!editorState) return;
    editorState.setTool({ type: 'remove-cell' });
    clearEditorGhost();
    refreshEditorObjects();
  },
  onRotate: () => {
    editorState?.rotateSelected(Math.PI / 2);
    refreshEditorObjects();
  },
  onDelete: () => {
    editorState?.deleteSelected();
    refreshEditorObjects();
  },
  onExit: () => exitEditor(),
  onSave: () => {
    if (!editorState) return;
    downloadMapDef(exportMapDef(editorState, editorBaseMap));
  },
  onLoad: async (file) => {
    try {
      const map = await loadMapDefFromFile(file);
      editorBaseMap = map;
      ringRotateDrag = null;
      editorState = new EditorState(map);
      editorObjectsGroup.clear();
      editorMeshes.clear();
      editorUnitsGroup.clear();
      editorUnitMeshes.clear();
      editorUnitMeshTeams.clear();
      clearEditorGhost();
      transformControls.detach();
      editorHistory.clear();
      rebuildEditorBoard();
      editorUI.setMapSize(editorState.width, editorState.height);
      refreshEditorObjects();
    } catch (err) {
      // Pas de systeme de notification dans l'UI de l'editeur pour l'instant
      // (voir CLAUDE.md, etapes 2-3) : une alerte navigateur suffit pour un
      // outil de dev utilise par Antoine seul, tant qu'un fichier invalide
      // reste rare.
      alert(`Impossible de charger cette carte : ${err instanceof Error ? err.message : String(err)}`);
    }
  },
  onResizeMap: (width, height) => {
    if (!editorState) return;
    editorState.setSize(width, height);
    rebuildEditorBoard();
    editorUI.setMapSize(editorState.width, editorState.height);
  },
  onTestScenario: () => testScenario(),
});

function clearEditorGhost(): void {
  if (!editorGhost) return;
  editorGhostGroup.remove(editorGhost);
  editorGhost = null;
}

function refreshEditorObjects(): void {
  if (!editorState || !editorAssets) return;

  const liveIds = new Set(editorState.obstacles.map((o) => o.id));
  for (const [id, mesh] of editorMeshes) {
    if (liveIds.has(id)) continue;
    editorObjectsGroup.remove(mesh);
    editorMeshes.delete(id);
  }

  for (const o of editorState.obstacles) {
    const cached = editorMeshes.get(o.id);
    if (!cached) {
      const mesh = buildObstacleView(o, editorAssets);
      editorMeshes.set(o.id, mesh);
      editorObjectsGroup.add(mesh);
      continue;
    }
    // Objet deja construit : on retransforme le meme mesh (deplacement)
    // plutot que d'en reconstruire un, et on ne touche a la rotation que si
    // elle a ete explicitement fixee (voir EditorState.rotateSelected) —
    // sinon on ecraserait l'orientation aleatoire tiree une seule fois a la
    // creation.
    const center = obstacleCenter(o);
    cached.position.set(center.x, 0, center.z);
    if (o.rotationY !== undefined) cached.rotation.y = o.rotationY;
  }

  const liveUnitIds = new Set(editorState.units.map((u) => u.id));
  for (const [id, mesh] of editorUnitMeshes) {
    if (liveUnitIds.has(id)) continue;
    editorUnitsGroup.remove(mesh);
    editorUnitMeshes.delete(id);
    editorUnitMeshTeams.delete(id);
  }

  for (const u of editorState.units) {
    const cached = editorUnitMeshes.get(u.id);
    // Un changement de camp (unite trainee de l'autre cote du plateau) doit
    // reconstruire le mesh : buildUnit fabrique des boites deja teintees a la
    // couleur du camp, ce n'est pas une propriete qu'on peut basculer en
    // place comme la position.
    if (!cached || editorUnitMeshTeams.get(u.id) !== u.team) {
      if (cached) editorUnitsGroup.remove(cached);
      const mesh = buildUnitView(u);
      editorUnitMeshes.set(u.id, mesh);
      editorUnitMeshTeams.set(u.id, u.team);
      editorUnitsGroup.add(mesh);
      // L'ancien anneau de groupe (le cas echeant) etait un enfant du mesh
      // qu'on vient de retirer — invalide l'entree pour que la synchro
      // ci-dessous en recree un sur le NOUVEAU mesh dans cette meme passe.
      editorGroupRings.delete(u.id);
    }
    editorUnitMeshes.get(u.id)!.position.set(u.x, 0, u.z);
  }

  // Anneaux de la selection de GROUPE (voir EditorState.selectSameTypeUnits)
  // — un par unite membre, enfant de son mesh (meme principe que
  // refreshPlayerPreview en phase de placement). Distinct de
  // editorSelectionRing, qui gere les selections SIMPLES juste en dessous.
  const groupIds = editorState.selection?.kind === 'unit-group' ? new Set(editorState.selection.ids) : new Set<number>();
  for (const [id, ring] of editorGroupRings) {
    if (groupIds.has(id)) continue;
    ring.removeFromParent();
    editorGroupRings.delete(id);
  }
  for (const id of groupIds) {
    if (editorGroupRings.has(id)) continue;
    const unitMesh = editorUnitMeshes.get(id);
    if (!unitMesh) continue;
    const ring = createSelectionRing();
    unitMesh.add(ring);
    editorGroupRings.set(id, ring);
  }

  const selectedObstacle = editorState.selectedObstacle;
  const selectedUnit = editorState.selectedUnit;
  editorSelectionRing.visible = selectedObstacle !== null || selectedUnit !== null;
  if (selectedObstacle) {
    const center = obstacleCenter(selectedObstacle);
    editorSelectionRing.position.set(center.x, 0.02, center.z);
    editorSelectionRing.scale.setScalar(Math.max(selectedObstacle.tilesX, selectedObstacle.tilesZ) * 0.7);
    editorUI.showObstacleProperties(selectedObstacle);
  } else if (selectedUnit) {
    editorSelectionRing.position.set(selectedUnit.x, 0.02, selectedUnit.z);
    editorSelectionRing.scale.setScalar(0.5);
    editorUI.showUnitProperties(selectedUnit);
  } else {
    editorUI.hideProperties();
  }

  // TransformControls (2026-08-16, Part N de la demande) : attache
  // UNIQUEMENT a l'obstacle/decor selectionne — jamais a une unite, qui
  // reste deplacee par clic + snap sur la grille (Part Q : "ne permets pas
  // accidentellement a une unite de rester entre deux cases"). Detache dans
  // tous les autres cas.
  if (selectedObstacle) {
    const mesh = editorMeshes.get(selectedObstacle.id);
    if (mesh && transformControls.object !== mesh) transformControls.attach(mesh);
  } else if (transformControls.object) {
    transformControls.detach();
  }
}

async function enterEditor(): Promise<void> {
  screens.hideAll();
  inEditorMode = true;
  // Le plateau du jeu (sol/grille/zones/obstacles/decor) est entierement
  // masque : l'editeur affiche sa PROPRE copie (editorBoardGroup +
  // editorObjectsGroup), a la taille du brouillon en cours, independante de
  // la taille de la partie reellement en jeu (currentMap/board ne changent
  // que le temps d'un "Tester le scenario", voir testScenario).
  board.group.visible = false;
  editorBoardGroup.visible = true;
  editorUI.setVisible(true);

  if (!editorAssets) editorAssets = await loadEnvironmentAssets();
  editorBaseMap = DEFAULT_MAP;
  editorState = new EditorState(editorBaseMap);
  editorHistory.clear();
  rebuildEditorBoard();
  editorUI.setMapSize(editorState.width, editorState.height);
  refreshEditorObjects();
}

function exitEditor(): void {
  inEditorMode = false;
  ringRotateDrag = null;
  editorState = null;
  editorObjectsGroup.clear();
  editorMeshes.clear();
  editorUnitsGroup.clear();
  editorUnitMeshes.clear();
  editorUnitMeshTeams.clear();
  editorGroupRings.clear();
  editorBoardGroup.clear();
  editorBoardGroup.visible = false;
  clearEditorGhost();
  transformControls.detach();
  editorHistory.clear();
  editorSelectionRing.visible = false;
  editorUI.setVisible(false);
  editorUI.hideProperties();
  board.group.visible = true;
  screens.show('menu');
}

/**
 * "Tester le scenario" (demande d'Antoine, 2026-08-08) : lance une bataille
 * REELLE (memes systemes, memes regles que le jeu normal — pas une
 * simulation a part) a partir de la configuration actuelle de l'editeur
 * (obstacles + unites + taille), sans quitter l'editeur pour de bon. Le
 * brouillon (`editorState`) n'est ni efface ni remplace pendant le test — on
 * y revient tel quel (voir returnToEditorAfterTest), exactement la demande
 * d'Antoine : "en memoire la configuration de depart".
 */
async function testScenario(): Promise<void> {
  if (!editorState || !editorAssets) return;
  const testMap = exportMapDef(editorState, editorBaseMap);

  // Masque l'editeur (mais garde editorState intact) et bascule dans les
  // memes conditions qu'une bataille normale : inEditorMode a false laisse
  // inBattlePhase() (voir plus bas) redevenir vrai naturellement, donc vise/
  // tir/baliste marchent sans code special.
  editorBoardGroup.visible = false;
  editorObjectsGroup.visible = false;
  editorUnitsGroup.visible = false;
  editorGhostGroup.visible = false;
  clearEditorGhost();
  editorSelectionRing.visible = false;
  transformControls.detach();
  editorUI.setVisible(false);
  editorUI.hideProperties();
  inEditorMode = false;
  inTestMode = true;
  // Bâtiments possédés (Mine/Caserne) jamais injectés pendant "Tester le
  // scénario" — une carte d'éditeur n'a aucun lien avec la progression d'une
  // run réelle (voir setupTestBattle, qui ne spawne aucun bâtiment).

  currentMap = testMap;
  world.setMap(currentMap);

  if (testBoard) renderer.scene.remove(testBoard.group);
  testBoard = await createBoard(testMap);
  testBoard.gridLines.visible = false;
  testBoard.zones.visible = false;
  renderer.scene.add(testBoard.group);

  playerArrowOrigin = computePlayerArrowOrigin(currentMap);
  repositionBallista();

  setupTestBattle();
  loop.timeScale = 1;
}

/** Retour a l'editeur declenche par la fin de bataille (derniere unite d'un
 *  camp abattue, voir la boucle plus bas) ou par Echap pendant le test (voir
 *  le listener clavier plus bas) — jamais par exitEditor/le menu, pour ne pas
 *  perdre editorState. */
function returnToEditorAfterTest(): void {
  if (!inTestMode) return;
  inTestMode = false;
  battleOver = false;

  world.clear();
  rewardedEnemyDeaths.clear();
  belowAutoHealThreshold.clear();
  mineIncomeAccumulator = 0;
  pendingArrowSpawns.length = 0;
  unitViews.clear();
  combatOverlay.clear();
  projectiles.clear();
  playerArrowView.clear();
  telegraphView.clear();
  fireballView.clear();
  iceNovaView.clear();
  healVfxView.clear();
  tauntVfxView.clear();
  shadowProjectileView.clear();

  // La partie REELLE (menu -> Jouer) ne doit jamais heriter de la map de
  // test : on revient a DEFAULT_MAP comme si le test n'avait pas eu lieu.
  currentMap = DEFAULT_MAP;
  world.setMap(currentMap);
  playerArrowOrigin = computePlayerArrowOrigin(currentMap);
  repositionBallista();
  refreshOwnedBuildingViews();

  if (testBoard) {
    renderer.scene.remove(testBoard.group);
    testBoard = null;
  }

  inEditorMode = true;
  editorBoardGroup.visible = true;
  editorObjectsGroup.visible = true;
  editorUnitsGroup.visible = true;
  editorUI.setVisible(true);
  // editorState n'a jamais ete touche pendant le test : on retrouve
  // exactement la configuration de depart, comme demande.
  refreshEditorObjects();
}

/** Remonte la hierarchie Three.js depuis l'objet touche jusqu'au groupe qui
 *  porte le tag pose par buildObstacleView (meme principe que findSlotIndex
 *  plus haut pour la phase de placement). */
function findEditorObstacleId(object: THREE.Object3D | null): number | null {
  let current = object;
  while (current) {
    const id = current.userData['editorId'];
    if (typeof id === 'number') return id;
    current = current.parent;
  }
  return null;
}

/** Meme principe que findEditorObstacleId, pour les unites (tag distinct —
 *  voir buildUnitView, editorUnitId). */
function findEditorUnitId(object: THREE.Object3D | null): number | null {
  let current = object;
  while (current) {
    const id = current.userData['editorUnitId'];
    if (typeof id === 'number') return id;
    current = current.parent;
  }
  return null;
}

/** Centre de la case sous (x, z) — meme convention que la phase de placement
 *  en jeu (voir handlePlacementClick, tileX = floor(x) + 0.5) : une unite
 *  posee dans l'editeur doit tomber sur la meme grille que celle du jeu reel. */
function snapToTileCenter(v: number): number {
  return Math.floor(v) + 0.5;
}

function updateEditorGhost(x: number, z: number): void {
  if (!editorState || !editorAssets) return;
  clearEditorGhost();
  if (editorState.tool.type === 'place-obstacle') {
    // Placement LIBRE (2026-08-16, demande d'Antoine — decors/props/rochers/
    // arbres/batiments, placementMode "free") : le fantome suit exactement
    // l'intersection raycaster -> terrain, aucun arrondi vers une case.
    editorGhost = buildGhost(editorState.tool.template, x, z, editorAssets);
    editorGhostGroup.add(editorGhost);
  } else if (editorState.tool.type === 'place-unit') {
    // Le camp du fantome suit deja la moitie du plateau survolee : Antoine
    // voit la couleur AVANT de cliquer, pas seulement apres.
    const unitX = snapToTileCenter(x);
    const unitZ = snapToTileCenter(z);
    const team: Team = unitZ >= 0 ? 'player' : 'enemy';
    // Preview de case (2026-08-16, demande explicite d'Antoine : "je veux
    // désormais matérialiser clairement LA CASE sur laquelle elle sera
    // posée... case verte/rouge translucide") — meme buildCellPreview que
    // les outils Ajouter/Supprimer case ci-dessous, meme source de verite
    // que le clic reel (EditorState.canPlaceUnitAt, jamais un second calcul
    // qui pourrait diverger). Regroupe avec le fantome 3D de l'unite dans un
    // seul Group : editorGhost reste un objet UNIQUE (voir clearEditorGhost),
    // les deux disparaissent donc toujours ensemble.
    const cellX = Math.floor(unitX);
    const cellZ = Math.floor(unitZ);
    const valid = editorState.canPlaceUnitAt(unitX, unitZ);
    const combined = new THREE.Group();
    combined.add(buildCellPreview(cellX, cellZ, valid));
    combined.add(buildUnitGhost(editorState.tool.unitId, team, unitX, unitZ));
    editorGhost = combined;
    editorGhostGroup.add(editorGhost);
  } else if (editorState.tool.type === 'add-cell') {
    // Toujours alignee sur la grille (Part AG) : coin de case le plus
    // proche, jamais une position continue comme les obstacles/props.
    const cellX = Math.floor(x);
    const cellZ = Math.floor(z);
    editorGhost = buildCellPreview(cellX, cellZ, editorState.canAddCell(cellX, cellZ));
    editorGhostGroup.add(editorGhost);
  } else if (editorState.tool.type === 'remove-cell') {
    const cellX = Math.floor(x);
    const cellZ = Math.floor(z);
    editorGhost = buildCellPreview(cellX, cellZ, editorState.canRemoveCell(cellX, cellZ));
    editorGhostGroup.add(editorGhost);
  }
}

function handleEditorClick(event: MouseEvent): void {
  if (!editorState || !editorAssets) return;
  setRaycasterFromEvent(event);
  if (!raycaster.ray.intersectPlane(groundPlane, groundHit)) return;

  if (editorState.tool.type === 'place-obstacle') {
    // Placement LIBRE : position exacte du clic, jamais arrondie a une case
    // (voir updateEditorGhost, meme regle pour l'apercu).
    editorState.placeAt(groundHit.x, groundHit.z);
    clearEditorGhost();
    refreshEditorObjects();
    return;
  }

  if (editorState.tool.type === 'place-unit') {
    editorState.placeUnitAt(snapToTileCenter(groundHit.x), snapToTileCenter(groundHit.z));
    clearEditorGhost();
    refreshEditorObjects();
    return;
  }

  if (editorState.tool.type === 'add-cell') {
    // Outil REPETABLE (Part Y : "puis autre clic -> une autre cellule") :
    // contrairement au placement d'obstacle/unite, ne revient JAMAIS a
    // l'outil selection tout seul — reste actif pour poser plusieurs cases
    // de suite, jusqu'a ce qu'Antoine choisisse autre chose (Echap, un autre
    // outil, clic droit).
    const cellX = Math.floor(groundHit.x);
    const cellZ = Math.floor(groundHit.z);
    const terrain = editorState.tool.terrain;
    if (editorState.addCell(cellX, cellZ, terrain)) {
      editorHistory.push({
        undo: () => {
          editorState?.removeCell(cellX, cellZ);
          rebuildEditorBoard();
        },
        redo: () => {
          editorState?.addCell(cellX, cellZ, terrain);
          rebuildEditorBoard();
        },
      });
      rebuildEditorBoard();
    }
    updateEditorGhost(groundHit.x, groundHit.z);
    return;
  }

  if (editorState.tool.type === 'remove-cell') {
    const cellX = Math.floor(groundHit.x);
    const cellZ = Math.floor(groundHit.z);
    const removed = editorState.cells.find((c) => c.x === cellX && c.z === cellZ);
    if (removed && editorState.removeCell(cellX, cellZ)) {
      editorHistory.push({
        undo: () => {
          editorState?.addCell(removed.x, removed.z, removed.terrain);
          rebuildEditorBoard();
        },
        redo: () => {
          editorState?.removeCell(removed.x, removed.z);
          rebuildEditorBoard();
        },
      });
      rebuildEditorBoard();
    }
    updateEditorGhost(groundHit.x, groundHit.z);
    return;
  }

  // Outil selection : un clic sur un objet/unite pose le selectionne ; un
  // clic sur le sol avec quelque chose deja selectionne le deplace ; un clic
  // dans le vide deselectionne.
  const obstacleHit = raycaster.intersectObjects(editorObjectsGroup.children, true)[0];
  const unitHit = raycaster.intersectObjects(editorUnitsGroup.children, true)[0];
  // En cas de double hit (rare, objets tres proches), on garde le plus proche
  // de la camera plutot qu'une priorite arbitraire obstacle/unite.
  const hit =
    obstacleHit && unitHit ? (obstacleHit.distance <= unitHit.distance ? obstacleHit : unitHit) : (obstacleHit ?? unitHit);
  const clickedObstacleId = hit ? findEditorObstacleId(hit.object) : null;
  const clickedUnitId = clickedObstacleId === null && hit ? findEditorUnitId(hit.object) : null;

  if (clickedObstacleId !== null) {
    editorState.select({ kind: 'obstacle', id: clickedObstacleId });
  } else if (clickedUnitId !== null) {
    // Double-clic MANUEL (2026-08-11, meme technique que la phase de
    // placement, voir lastUnitClickSlot plus haut) : deux clics sur la MEME
    // unite en moins de DOUBLE_CLICK_WINDOW_MS selectionnent toutes les
    // unites du meme type au lieu de cette seule unite.
    const now = performance.now();
    if (clickedUnitId === lastEditorUnitClickId && now - lastEditorUnitClickTime < DOUBLE_CLICK_WINDOW_MS) {
      lastEditorUnitClickId = null;
      editorState.selectSameTypeUnits(clickedUnitId, DOUBLE_CLICK_SAME_TYPE_MAX);
    } else {
      lastEditorUnitClickId = clickedUnitId;
      lastEditorUnitClickTime = now;
      editorState.select({ kind: 'unit', id: clickedUnitId });
    }
  } else if (editorState.selectedUnit) {
    editorState.moveSelectedUnit(snapToTileCenter(groundHit.x), snapToTileCenter(groundHit.z));
  } else if (editorState.selection?.kind === 'unit-group') {
    editorState.moveSelectedGroup(snapToTileCenter(groundHit.x), snapToTileCenter(groundHit.z));
  } else {
    editorState.select(null);
  }
  refreshEditorObjects();
}

// Raycast souris : sert a la fois a detecter un clic sur une unite et, a
// defaut, a trouver la case du sol vise (plan y=0).
const raycaster = new THREE.Raycaster();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const groundHit = new THREE.Vector3();

function setRaycasterFromEvent(event: MouseEvent): void {
  const rect = canvas.getBoundingClientRect();
  const ndc = new THREE.Vector2(
    ((event.clientX - rect.left) / rect.width) * 2 - 1,
    -((event.clientY - rect.top) / rect.height) * 2 + 1,
  );
  raycaster.setFromCamera(ndc, renderer.camera);
}

// --- Vise et tir de la fleche du joueur ---------------------------------
//
// Vise libre au sol (decision d'Antoine) : la souris deplace un reticule sur
// le plateau pendant la bataille, le clic gauche tire vers ce point exact —
// pas un verrouillage sur une unite, la cible peut donc bouger et esquiver un
// tir mal anticipe. Le clic gauche etait deja reserve a cet usage (voir plus
// bas, "clic gauche reste libre pour le placement puis... le tir").

const aimReticle = createAimReticle();
renderer.scene.add(aimReticle);
let playerAimX = 0;
let playerAimZ = 0;

/** Vrai uniquement pendant une bataille en cours (ni menu, ni placement, ni
 *  ecran de fin de vague) : c'est la seule phase ou viser/tirer a un sens. */
function inBattlePhase(): boolean {
  return !inPlacementPhase && !inEditorMode && !battleOver && world.entities.length > 0;
}

/** Phase de jeu actuelle du point de vue des objets d'inventaire (voir
 *  data/items.ts, usablePhases) — null si aucune des deux ne s'applique
 *  (menu, editeur, ecran de fin de vague...). */
function currentPhase(): GamePhase | null {
  if (inPlacementPhase) return 'placement';
  if (inBattlePhase()) return 'battle';
  return null;
}

function updateAimFromEvent(event: MouseEvent): void {
  if (!inBattlePhase()) return;
  setRaycasterFromEvent(event);
  if (!raycaster.ray.intersectPlane(groundPlane, groundHit)) return;
  playerAimX = groundHit.x;
  playerAimZ = groundHit.z;
}

/** Les 2 ennemis vivants les plus proches de (cursorX, cursorZ), dans
 *  MACHINE_GUN_SECONDARY_TARGET_RADIUS — talent "Mitraillette" (2026-08-14),
 *  voir buildBallistaVolleyShots. Deterministe (jamais aleatoire) : filtre
 *  par camp/vie/rayon, trie par distance CROISSANTE au curseur (pas a la
 *  Baliste), tie-break stable par id croissant, puis les 2 premiers — donc
 *  toujours 2 ENTITES DISTINCTES (jamais deux fois la meme, un tableau
 *  d'entites ne contient pas de doublons). Un simple filtre/tri lineaire
 *  sur world.entities suffit ici plutot que la SpatialGrid du projet : cette
 *  recherche ne tourne qu'UNE FOIS PAR TIR (cooldown de plusieurs secondes),
 *  jamais par tick/par entite comme la separation ou le ciblage automatique
 *  qui justifient la grille — l'overhead de construire une grille pour une
 *  seule requete depasserait le cout d'un scan direct. */
function findMachineGunSecondaryTargets(cursorX: number, cursorZ: number): Entity[] {
  return world.entities
    .filter((e) => e.alive && e.team === 'enemy' && dist(cursorX, cursorZ, e.x, e.z) <= MACHINE_GUN_SECONDARY_TARGET_RADIUS)
    .sort((a, b) => {
      const da = dist(cursorX, cursorZ, a.x, a.z);
      const db = dist(cursorX, cursorZ, b.x, b.z);
      return da !== db ? da - db : a.id - b.id;
    })
    .slice(0, 2);
}

/** Construit les carreaux d'une volee de la Baliste (origine + cible de
 *  CHAQUE carreau) depuis le point de tir (originX, originZ) et le point
 *  vise (cursorX, cursorZ) — SOURCE UNIQUE de "combien de carreaux et vers
 *  ou" (demande explicite d'Antoine, point 25 : pas de logique dispersee
 *  entre input/renderer/combat/talents). Sans "Mitraillette" : un seul
 *  carreau, vers le curseur, comportement STRICTEMENT identique a avant ce
 *  talent (aucune regression, voir CLAUDE.md point 32 de la demande).
 *
 *  Avec "Mitraillette" : le carreau PRINCIPAL vise toujours le curseur, sans
 *  aucun changement (ne modifie pas le feeling du tir principal, demande
 *  explicite). Les 2 carreaux SECONDAIRES visent chacun l'un des 2 ennemis
 *  les plus proches du curseur (findMachineGunSecondaryTargets) — position
 *  VERROUILLEE au moment du tir (fromX/fromZ/toX/toZ figes dans l'ArrowFlight
 *  des la creation, jamais recalcules ensuite) : voir sim/playerArrow.ts,
 *  stepPlayerArrow, qui resout chaque vol EXACTEMENT comme le carreau
 *  principal (ennemi le plus proche du point vise A L'ARRIVEE) — donc "pas
 *  de tracking" en decoule naturellement de la reutilisation de cette meme
 *  logique, sans code de resolution separe pour les secondaires. Si un slot
 *  secondaire n'a pas d'ennemi disponible (0 ou 1 ennemi trouve — jamais la
 *  meme entite utilisee deux fois), il vise un petit decalage lateral autour
 *  du curseur (MACHINE_GUN_FALLBACK_TARGET_OFFSET) plutot qu'un point
 *  redondant : "dispersion extremement faible", jamais un vrai second point
 *  de visee independant.
 *
 *  Petit decalage lateral egalement applique au point de DEPART des 2
 *  carreaux secondaires (MACHINE_GUN_ORIGIN_OFFSET, perpendiculaire a l'axe
 *  de tir) — purement visuel, pour que les 3 carreaux se lisent comme
 *  partant de la meme arme sans etre parfaitement superposes au depart. */
function buildBallistaVolleyShots(originX: number, originZ: number, cursorX: number, cursorZ: number): { originX: number; originZ: number; targetX: number; targetZ: number }[] {
  const primary = { originX, originZ, targetX: cursorX, targetZ: cursorZ };
  if (!isTalentActive('mitraillette')) return [primary];

  const dx = cursorX - originX;
  const dz = cursorZ - originZ;
  const len = Math.hypot(dx, dz) || 1;
  const perpX = -dz / len;
  const perpZ = dx / len;
  const secondaryOrigins = [
    { originX: originX + perpX * MACHINE_GUN_ORIGIN_OFFSET, originZ: originZ + perpZ * MACHINE_GUN_ORIGIN_OFFSET },
    { originX: originX - perpX * MACHINE_GUN_ORIGIN_OFFSET, originZ: originZ - perpZ * MACHINE_GUN_ORIGIN_OFFSET },
  ];
  const fallbackTargets = [
    { targetX: cursorX + perpX * MACHINE_GUN_FALLBACK_TARGET_OFFSET, targetZ: cursorZ + perpZ * MACHINE_GUN_FALLBACK_TARGET_OFFSET },
    { targetX: cursorX - perpX * MACHINE_GUN_FALLBACK_TARGET_OFFSET, targetZ: cursorZ - perpZ * MACHINE_GUN_FALLBACK_TARGET_OFFSET },
  ];

  const secondaries = findMachineGunSecondaryTargets(cursorX, cursorZ);
  const shots = [primary];
  for (let i = 0; i < 2; i++) {
    const enemy = secondaries[i];
    const target = enemy ? { targetX: enemy.x, targetZ: enemy.z } : fallbackTargets[i]!;
    shots.push({ ...secondaryOrigins[i]!, ...target });
  }
  return shots;
}

/** Tente un tir vers le point de visee ACTUEL (playerAimX/Z, deja tenu a
 *  jour par chaque mousemove, voir updateAimFromEvent) — SOURCE UNIQUE de
 *  "tirer maintenant", partagee par le clic manuel (handleBattleFireClick)
 *  ET le tir automatique en maintien de clic (voir attemptAutoFire
 *  ci-dessous, 2026-08-13). `World.fireArrowVolley` reste la seule autorite
 *  sur "l'arme peut-elle tirer" (cooldown ecoule, aucun carreau d'une volee
 *  precedente deja en vol) — ni le clic ni la boucle de tir auto ne
 *  dupliquent cette verification, aucun risque de double tir/double volee.
 *  UN SEUL appel a fireArrowVolley par tir (jamais 3 appels independants
 *  a fireArrow) : "Une attaque = un declenchement", un seul cooldown pour
 *  toute la volee, meme avec Mitraillette. */
function fireArrowIfReady(): void {
  // Baliste detruite (2026-08-16, architecture BUILDING) : un batiment
  // gameplay a 0 PV ne peut plus tirer — verifie AVANT tout calcul de tir.
  // `ballistaEntityId === null` (hors bataille, ex. "Tester le scenario" —
  // setupTestBattle ne spawne jamais de batiment gameplay) laisse le tir
  // fonctionner comme avant cette architecture, sans regression.
  if (ballistaEntityId !== null && world.getById(ballistaEntityId)?.alive === false) return;
  // Meme valeur de degats EFFECTIVE pour les 3 carreaux (talent Tir rapide +
  // amelioration Baliste deja inclus) — jamais reduite/partagee entre eux
  // (demande explicite : "chaque carreau = degats normaux de la Baliste").
  const damage = effectivePlayerArrowDamage();
  const shots: ArrowShotSpec[] = buildBallistaVolleyShots(playerArrowOrigin.x, playerArrowOrigin.z, playerAimX, playerAimZ).map((s) => ({
    ...s,
    damage,
  }));
  const fired = world.fireArrowVolley(shots, effectivePlayerArrowCooldown(), effectivePlayerArrowSpeed());
  // Anime le modele de la baliste (2026-08-13, nouveau modele FBX riggé —
  // voir render/ballista.ts) UNIQUEMENT sur un tir REELLEMENT parti (jamais
  // sur une tentative bloquee par le cooldown), meme garde-fou que le reste
  // de ce systeme : World.fireArrowVolley reste la seule autorite. Un seul
  // declenchement d'animation par VOLEE, jamais un par carreau.
  if (fired) playBallistaShot(ballista);
}

function handleBattleFireClick(event: MouseEvent): void {
  if (!inBattlePhase()) return;
  if (useArmedItemOnClick(event)) return;
  updateAimFromEvent(event);
  fireArrowIfReady();
}

/** Maintien du clic pour tirer en rafale (2026-08-13, demande d'Antoine :
 *  "Tir rapide" accorde desormais "le joueur peut maintenir le clic enfoncé
 *  pour continuer à tirer automatiquement"). `true` tant que le bouton
 *  gauche est physiquement enfonce sur le canvas — l'INTENTION de tir
 *  seulement, jamais un minuteur/compteur de tirs : le RYTHME reel reste
 *  entierement determine par World.fireArrowAt/effectivePlayerArrowCooldown
 *  (voir attemptAutoFire, appelee depuis le PAS DE SIMULATION FIXE — jamais
 *  depuis le rendu variable, pour qu'aucun tir ne depende du framerate). */
let fireButtonHeld = false;

/** A appeler UNE FOIS PAR PAS DE SIMULATION (voir la boucle de jeu,
 *  `loop`, callback onStep) — no-op si Tir rapide n'est pas debloque (le
 *  maintien du clic ne doit JAMAIS accorder cet avantage sans le talent,
 *  demande explicite d'Antoine, point 13), si le bouton n'est pas
 *  maintenu, ou hors phase de bataille (couvre implicitement pause/
 *  placement/editeur : inBattlePhase() est deja false dans tous ces cas).
 *  Un objet arme (parchemin) a priorite sur le tir, meme logique que le
 *  clic manuel (useArmedItemOnClick avant fireArrowIfReady) — par
 *  construction, `armedItemIndex` redevient deja null des la resolution du
 *  premier clic (consommation ou desarmement), donc ce garde-fou ne
 *  bloque jamais un tir automatique legitime en pratique. */
function attemptAutoFire(): void {
  if (!fireButtonHeld || !isTalentActive('tir_rapide') || !inBattlePhase() || armedItemIndex !== null) return;
  fireArrowIfReady();
}

/** Bascule Baliste <-> Commandement (prototype RTS, touche B provisoire).
 *  Seulement pendant une bataille en cours, jamais depuis le menu pause.
 *  Coupe le maintien de tir en cours pour qu'aucune rafale ne continue en
 *  mode Commandement, et abandonne la selection en revenant en mode Baliste. */
function toggleBattleControlMode(): void {
  if (!inBattlePhase() || pauseMenuOpen) return;
  battleControlMode = battleControlMode === 'ballista' ? 'command' : 'ballista';
  fireButtonHeld = false;
  if (battleControlMode === 'ballista') battleSelection.clear();
}

/** Clic gauche en mode Commandement : selectionne l'unite alliee vivante sous
 *  le curseur ; un clic sur le terrain, un ennemi ou un batiment deselectionne.
 *  Ne transmet aucun ordre a la simulation. */
function handleCommandModeClick(event: MouseEvent): void {
  const picked = pickEntityAtScreen(world.entities, event.clientX, event.clientY, worldToScreen, (id) => unitViews.getPosition(id));
  const selectable = picked !== null && picked.team === 'player' && !picked.isBuilding ? picked : null;
  battleSelection.select(selectable?.id ?? null);
}

/** Debut de chaque bataille (reelle ou "Tester le scenario") : retour
 *  provisoire au mode Baliste, sans selection ni ordre au clic droit en
 *  attente. A reevaluer apres playtest. */
function resetBattleControls(): void {
  battleControlMode = 'ballista';
  battleSelection.clear();
  pendingRightClickOrder = null;
}

/** Un ordre RTS ne peut etre emis que pendant un combat actif, temps en
 *  marche : jamais en pause (menu ou timeScale 0), pendant la transition de
 *  fin de vague (timeScale 0, battleOver) ni hors bataille. Empeche de mettre
 *  le jeu en pause pour programmer un ordre execute a la reprise. */
function canIssueRtsOrder(): boolean {
  return battleControlMode === 'command' && inBattlePhase() && !pauseMenuOpen && loop.timeScale > 0;
}

/** Clic droit en mode Commandement, en attente de son relachement : un clic
 *  court devient un ordre de deplacement, un glisser au-dela du seuil
 *  devient une rotation de camera et n'emet jamais d'ordre. */
let pendingRightClickOrder: { startClientX: number; startClientY: number } | null = null;

/** Ordre de deplacement de l'unite selectionnee vers le point du sol sous le
 *  curseur. La simulation valide encore la commande (unite vivante du
 *  joueur, destination dans le plateau) au debut du prochain pas. */
function issueMoveOrderAt(event: MouseEvent): void {
  const selectedId = battleSelection.selectedEntityId;
  if (selectedId === null || !canIssueRtsOrder()) return;
  const point = computeGroundPoint(event);
  if (!point) return;
  world.issueCommand({ kind: 'move', entityIds: [selectedId], x: point.x, z: point.z });
}

/** S en mode Commandement : interrompt l'ordre de l'unite selectionnee, qui
 *  passe en Garde. */
function issueStopOrder(): void {
  const selectedId = battleSelection.selectedEntityId;
  if (selectedId === null || !canIssueRtsOrder()) return;
  world.issueCommand({ kind: 'stop', entityIds: [selectedId] });
}

/** Vrai si le focus clavier est dans un champ de saisie : un raccourci de
 *  jeu ne doit pas se declencher pendant une frappe (voir KI-19). */
function isTypingInField(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement || target.isContentEditable;
}

// --- Inventaire (chantier en cours, 2026-08-09) -------------------------
//
// Premier objet : le parchemin de soin (voir data/items.ts), utilisable en
// temps reel PENDANT la bataille — clic sur un emplacement pour "l'armer",
// puis clic sur une unite du joueur pour la cibler. Distinct du "Soigner" de
// la boutique (qui restaure une unite entre deux vagues, sans ciblage).

/** Emplacement d'inventaire actuellement arme (pret a etre utilise sur la
 *  prochaine cible cliquee), ou null si aucun. */
let armedItemIndex: number | null = null;

function disarmItem(): void {
  armedItemIndex = null;
  inventoryBar.setArmed(null);
  healTargetRing.visible = false;
  iceNovaView.hideTargetPreview();
}

/** Clic sur un emplacement d'inventaire : ne fait rien si la phase actuelle
 *  n'est pas dans `usablePhases` de l'objet (voir data/items.ts — le soin
 *  s'utilise en bataille ET en placement, un futur sort de bataille pourra
 *  etre plus restrictif) — re-cliquer sur le meme emplacement desarme. */
function armInventorySlot(index: number): void {
  const phase = currentPhase();
  const owned = currentRun.inventory[index];
  if (!owned || !phase) return;
  const def = getItem(owned.itemId);
  if (!def.usablePhases.includes(phase)) return;
  armedItemIndex = armedItemIndex === index ? null : index;
  inventoryBar.setArmed(armedItemIndex, armedItemIndex !== null ? owned.itemId : undefined);
  if (armedItemIndex === null) {
    healTargetRing.visible = false;
  } else {
    // Entree en mode de ciblage d'un objet de bataille (Nova, parchemin...) :
    // suspend PROPREMENT une intention de tir de Baliste deja en cours
    // (2026-08-15, demande d'Antoine, point 11 : "si le joueur était en
    // train de maintenir le bouton avant de sélectionner Nova, le système
    // ne doit pas reprendre un tir fantôme pendant le clic de validation").
    // Filet de securite en plus du garde-fou pose au mousedown ci-dessous
    // (armedItemIndex !== null) — couvre aussi le cas ou fireButtonHeld
    // etait deja vrai AVANT l'armement.
    fireButtonHeld = false;
  }
}

/** Point du sol (position REELLE du clic, pas alignee sur une case) sous le
 *  curseur, ou null si le rayon ne touche pas le plan — voir
 *  computeHoveredTile pour la variante alignee sur les cases (placement). */
function computeGroundPoint(event: MouseEvent): { x: number; z: number } | null {
  setRaycasterFromEvent(event);
  if (!raycaster.ray.intersectPlane(groundPlane, groundHit)) return null;
  return { x: groundHit.x, z: groundHit.z };
}

/**
 * Cible de soin resolue depuis un point du sol (2026-08-11, demande
 * d'Antoine : "le soin doit etre plus simple a utiliser, le curseur n'est
 * pas tres clair... en cas de doute il faut soigner l'unite avec le moins
 * d'hp") — remplace l'ancien raycast EXACT sur le mesh d'une unite precise
 * (trop punitif a l'echelle d'une silhouette) par une recherche generreuse
 * dans HEAL_TARGET_RADIUS autour du point vise. Parmi les unites VIVANTES
 * du joueur blessees (hp < maxHp) a portee, renvoie celle la plus blessee
 * EN PROPORTION de ses PV max — meme convention que l'ancien bouton
 * "Soigner" de la boutique (voir CLAUDE.md, chantier economie), pas la plus
 * proche du curseur ni la plus basse en PV absolus (qui favoriserait
 * injustement les unites a faible PV max, ex. l'archer, meme a pleine vie).
 * Null si aucune unite blessee n'est a portee : l'appelant desarme sans
 * effet, comme pour toute cible invalide ailleurs dans le projet.
 */
function findHealTargetEntity(x: number, z: number): Entity | null {
  let best: Entity | null = null;
  let bestRatio = Infinity;
  for (const e of world.entities) {
    // !e.isBuilding (2026-08-16) : un batiment gameplay (Mine, Baliste)
    // n'est jamais soigne par un parchemin — il n'a pas de mecanisme de
    // reparation dans cette architecture, seulement des PV/une destruction.
    if (!e.alive || e.team !== 'player' || e.isBuilding || e.hp >= e.stats.maxHp) continue;
    if (dist(x, z, e.x, e.z) > HEAL_TARGET_RADIUS) continue;
    const ratio = e.hp / e.stats.maxHp;
    if (ratio < bestRatio) {
      bestRatio = ratio;
      best = e;
    }
  }
  return best;
}

/** Equivalent de findHealTargetEntity pour la phase de PLACEMENT (des
 *  PlacementSlot, pas des Entity de bataille) — voir
 *  useArmedItemOnPlacementClick. Renvoie un INDEX de placementSlots, pas le
 *  slot lui-meme, pour que l'appelant puisse aussi ecrire dans
 *  currentRun.army au meme index. */
function findHealTargetSlotIndex(x: number, z: number): number | null {
  let best: number | null = null;
  let bestRatio = Infinity;
  placementSlots.forEach((slot, i) => {
    if (slot.x === null || slot.z === null) return;
    const maxHp = effectivePlayerUnitMaxHp(slot.unitId, metaProgress);
    if (slot.hp >= maxHp) return;
    if (dist(x, z, slot.x, slot.z) > HEAL_TARGET_RADIUS) return;
    const ratio = slot.hp / maxHp;
    if (ratio < bestRatio) {
      bestRatio = ratio;
      best = i;
    }
  });
  return best;
}

/**
 * Cibles SECONDAIRES du parchemin de soin (2026-08-13, boutique
 * d'amelioration "Parchemin de soin", voir data/healScrollUpgrade.ts) —
 * jusqu'a `count` allies du MEME camp que `primary`, VIVANTS, BLESSES,
 * DIFFERENTS de `primary`, dans `radius` cases de sa position. Tri par
 * DISTANCE a la cible principale (pas au curseur), egalite tranchee par id
 * croissant (tie-break STABLE, jamais aleatoire — demande explicite,
 * point 24). `count <= 0` renvoie toujours un tableau vide sans parcourir
 * `entities`. Si moins de `count` allies blesses sont a portee, renvoie
 * simplement ce qui existe (point 25 : "ne consomme pas, ne reporte pas").
 */
function findSecondaryHealTargets(primary: Entity, count: number, radius: number, entities: Entity[]): Entity[] {
  if (count <= 0) return [];
  // !e.isBuilding (2026-08-16) : meme regle que findHealTargetEntity, un
  // batiment gameplay n'est jamais soigne, meme comme cible SECONDAIRE.
  const candidates = entities.filter(
    (e) =>
      e.alive && e.team === primary.team && e !== primary && !e.isBuilding && e.hp < e.stats.maxHp && dist(primary.x, primary.z, e.x, e.z) <= radius,
  );
  candidates.sort((a, b) => {
    const da = dist(primary.x, primary.z, a.x, a.z);
    const db = dist(primary.x, primary.z, b.x, b.z);
    return da !== db ? da - db : a.id - b.id;
  });
  return candidates.slice(0, count);
}

/** Equivalent de findSecondaryHealTargets pour la phase de PLACEMENT — voir
 *  findHealTargetSlotIndex pour le meme rapport a findHealTargetEntity.
 *  Renvoie des INDEX de placementSlots (tie-break sur l'index lui-meme,
 *  stable comme un id d'entite). `null` si la cible principale n'a pas de
 *  position sur le plateau (ne devrait pas arriver : deja valide par
 *  findHealTargetSlotIndex avant l'appel). */
function findSecondaryHealSlotIndices(primaryIndex: number, count: number, radius: number): number[] {
  if (count <= 0) return [];
  const primary = placementSlots[primaryIndex];
  if (!primary || primary.x === null || primary.z === null) return [];
  const px = primary.x;
  const pz = primary.z;

  const candidates: { index: number; d: number }[] = [];
  placementSlots.forEach((slot, i) => {
    if (i === primaryIndex || slot.x === null || slot.z === null) return;
    const maxHp = effectivePlayerUnitMaxHp(slot.unitId, metaProgress);
    if (slot.hp >= maxHp) return;
    const d = dist(px, pz, slot.x, slot.z);
    if (d > radius) return;
    candidates.push({ index: i, d });
  });
  candidates.sort((a, b) => (a.d !== b.d ? a.d - b.d : a.index - b.index));
  return candidates.slice(0, count).map((c) => c.index);
}

/** Resultat d'une application de soin — voir applyPlayerHeal. */
interface HealApplication {
  actualHeal: number;
  overheal: number;
}

/**
 * SOURCE UNIQUE d'application d'un soin a une unite JOUEUR (2026-08-15,
 * demande d'Antoine pour le talent "Soins excédentaires", point 41 : "Je
 * veux utiliser le VRAI OVERHEAL... requestedHeal - actualHeal"). Utilisee
 * par les 3 sites qui soignent reellement une unite (clic manuel en
 * bataille, clic manuel en placement, declenchement automatique "Aux petits
 * oignons") — jamais un calcul duplique/approxime par site.
 *
 * Centralise AUSSI le FRANCHISSEMENT du seuil "Aux petits oignons" (voir
 * belowAutoHealThreshold, AUTO_HEAL_TRIGGER_RATIO) : un soin qui fait
 * repasser l'unite STRICTEMENT au-dessus du seuil retire son id du Set,
 * autorisant un futur re-proc — les PV ne remontent JAMAIS ailleurs que par
 * un soin, donc c'est le SEUL endroit ou ce franchissement peut etre
 * detecte. `entityId` optionnel : `null` pendant le PLACEMENT (aucune
 * Entity/aucun combat en cours, la notion de "seuil deja consomme" n'a pas
 * de sens tant qu'aucune bataille n'a commence).
 */
function applyPlayerHeal(target: { hp: number }, maxHp: number, requestedHeal: number, entityId: number | null): HealApplication {
  const before = target.hp;
  const after = Math.min(maxHp, before + requestedHeal);
  target.hp = after;
  if (entityId !== null && maxHp > 0 && after / maxHp > AUTO_HEAL_TRIGGER_RATIO) {
    belowAutoHealThreshold.delete(entityId);
  }
  return { actualHeal: after - before, overheal: requestedHeal - (after - before) };
}

/**
 * Resout un clic de bataille alors qu'un objet est arme : soigne la cible
 * resolue par findHealTargetEntity si c'en est une, sinon desarme sans
 * effet — un clic sans cible valide a portee ANNULE l'armement plutot que
 * de rester en attente indefiniment (meme principe que la deselection de
 * groupe en placement). Retourne true si le clic a ete consomme par
 * l'objet : l'appelant (handleBattleFireClick) ne doit alors pas tirer la
 * fleche en plus.
 *
 * Cibles SECONDAIRES (2026-08-13, boutique d'amelioration "Parchemin de
 * soin") : appliquees UNIQUEMENT ici et dans la version placement
 * ci-dessous (usage MANUEL/deliberer du parchemin) — jamais sur le
 * declenchement automatique du talent "Aux petits oignons" (voir plus bas
 * dans la boucle de jeu), qui reste volontairement mono-cible.
 */
function useArmedItemOnClick(event: MouseEvent): boolean {
  if (armedItemIndex === null) return false;
  const index = armedItemIndex;
  disarmItem();

  const owned = currentRun.inventory[index];
  if (!owned) return true;
  const def = getItem(owned.itemId);

  if (def.effect.type === 'heal') {
    const point = computeGroundPoint(event);
    const target = point ? findHealTargetEntity(point.x, point.z) : null;
    if (!target) return true;
    const healAmount = effectivePlayerHealAmount(metaProgress);
    const { overheal } = applyPlayerHeal(target, target.stats.maxHp, healAmount, target.id);
    // Texte en PV AFFICHES (amount est en interne, x10, comme partout ailleurs
    // — voir data/items.ts, HealEffect.amount) : sans cette division, "+30"
    // s'afficherait pour un soin de "3 PV", incoherent avec le reste de
    // l'interface (pips, degats de la fleche du joueur, etc.).
    combatOverlay.spawnHealText(target.x, target.z, healAmount / HP_PER_PIP);
    // VFX du parchemin (2026-08-14, voir render/healVfx.ts) — position REELLEMENT
    // RENDUE (interpolee si l'unite est riggee), meme convention que healTargetRing.
    {
      const pos = unitViews.getPosition(target.id) ?? { x: target.x, z: target.z };
      healVfxView.spawnHeal(pos.x, pos.z);
    }

    let totalOverheal = overheal;
    const secondaryCount = healSecondaryTargetCount(healScrollUpgradeLevel(metaProgress));
    if (secondaryCount > 0) {
      const secondaryAmount = effectivePlayerSecondaryHealAmount(metaProgress);
      const secondaries = findSecondaryHealTargets(target, secondaryCount, HEAL_SCROLL_UPGRADE.secondaryTargetRadius, world.entities);
      for (const ally of secondaries) {
        const secondaryResult = applyPlayerHeal(ally, ally.stats.maxHp, secondaryAmount, ally.id);
        totalOverheal += secondaryResult.overheal;
        // Feedback DISCRET (point 29 de la demande : "légèrement plus petit")
        // — meme fabrique, variante CSS plus petite (voir combatOverlay.spawnHealText).
        combatOverlay.spawnHealText(ally.x, ally.z, secondaryAmount / HP_PER_PIP, true);
        const allyPos = unitViews.getPosition(ally.id) ?? { x: ally.x, z: ally.z };
        healVfxView.spawnHeal(allyPos.x, allyPos.z);
      }
    }
    // Talent "Soins excédentaires" (2026-08-15) — voir triggerShadowProjectiles.
    triggerShadowProjectiles(target.x, target.z, totalOverheal);
  } else if (def.effect.type === 'ice-nova') {
    // Impact INSTANTANE sur un point du sol, pas une unite ciblee — aucune
    // condition sur la presence d'un ennemi dans la zone (contrairement au
    // soin, qui annule sans consommer si aucune cible n'est trouvee) : tout
    // clic sur le champ de bataille est une utilisation valide, meme sur une
    // zone vide (voir CLAUDE.md, section "Test consommation"). Seul un rayon
    // qui ne touche pas le sol du tout (cas degrade quasi impossible en jeu
    // reel) annule sans consommer, comme partout ailleurs dans ce fichier.
    const point = computeGroundPoint(event);
    if (!point) return true;
    castIceNova(point.x, point.z, def.effect);
  }

  currentRun.inventory.splice(index, 1);
  inventoryBar.refresh(currentRun.inventory);
  return true;
}

/**
 * Version placement de useArmedItemOnClick : cible un PlacementSlot (voir
 * findHealTargetSlotIndex) plutot qu'une Entity de bataille. Aucune
 * bataille n'est en cours pour re-synchroniser les PV a la fin, donc cette
 * fonction met a jour placementSlots ET currentRun.army directement — les
 * deux partagent les memes indices tant qu'on est en placement (voir
 * l'invariant documente pres de onBuyFantassin/sellUnit). Cibles
 * secondaires : voir useArmedItemOnClick, meme logique via
 * findSecondaryHealSlotIndices.
 */
function useArmedItemOnPlacementClick(event: MouseEvent): boolean {
  if (armedItemIndex === null) return false;
  const index = armedItemIndex;
  disarmItem();

  const owned = currentRun.inventory[index];
  if (!owned) return true;
  const def = getItem(owned.itemId);

  if (def.effect.type === 'heal') {
    const point = computeGroundPoint(event);
    const slotIndex = point ? findHealTargetSlotIndex(point.x, point.z) : null;
    if (slotIndex === null) return true;
    const slot = placementSlots[slotIndex]!;
    const maxHp = effectivePlayerUnitMaxHp(slot.unitId, metaProgress);
    const healAmount = effectivePlayerHealAmount(metaProgress);
    // entityId=null : aucune Entity/bataille en cours pendant le placement,
    // la notion de "seuil Aux petits oignons deja consomme" ne s'applique
    // pas ici (voir applyPlayerHeal) — de meme, aucun ennemi n'existe encore
    // pendant le placement (enemyPreview n'est qu'un apercu visuel, pas de
    // vraies Entity), donc l'overheal n'est PAS remonte vers Soins
    // excedentaires ici : le declenchement ne se ferait de toute facon
    // jamais sur aucune cible (voir triggerShadowProjectiles, "si aucun
    // ennemi n'existe, l'effet est simplement perdu") — pas la peine de
    // l'appeler pour rien.
    applyPlayerHeal(slot, maxHp, healAmount, null);
    currentRun.army[slotIndex]!.hp = slot.hp;
    // Voir useArmedItemOnClick : texte en PV affiches, pas en interne.
    combatOverlay.spawnHealText(slot.x ?? 0, slot.z ?? 0, healAmount / HP_PER_PIP);
    healVfxView.spawnHeal(slot.x ?? 0, slot.z ?? 0);

    const secondaryCount = healSecondaryTargetCount(healScrollUpgradeLevel(metaProgress));
    if (secondaryCount > 0) {
      const secondaryAmount = effectivePlayerSecondaryHealAmount(metaProgress);
      const secondaryIndices = findSecondaryHealSlotIndices(slotIndex, secondaryCount, HEAL_SCROLL_UPGRADE.secondaryTargetRadius);
      for (const i of secondaryIndices) {
        const s = placementSlots[i]!;
        const sMaxHp = effectivePlayerUnitMaxHp(s.unitId, metaProgress);
        applyPlayerHeal(s, sMaxHp, secondaryAmount, null);
        currentRun.army[i]!.hp = s.hp;
        combatOverlay.spawnHealText(s.x ?? 0, s.z ?? 0, secondaryAmount / HP_PER_PIP, true);
        healVfxView.spawnHeal(s.x ?? 0, s.z ?? 0);
      }
    }
  }

  currentRun.inventory.splice(index, 1);
  inventoryBar.refresh(currentRun.inventory);
  return true;
}

/** Retrouve, sous le curseur, l'index de slot d'une unite du joueur posee —
 *  utilise a la fois par le clic simple (selection) et par le debut d'un
 *  glisser (vente potentielle), voir les listeners mousedown plus bas. */
function findHoveredSlot(event: MouseEvent): number | null {
  setRaycasterFromEvent(event);
  const unitHit = raycaster.intersectObjects(playerPreview.children, true)[0];
  return unitHit ? findSlotIndex(unitHit.object) : null;
}

/** Case (centre) survolee par la souris sur le sol, ou null si le rayon ne
 *  touche pas le plan — meme convention de case (floor(x)+0.5) que le reste
 *  du placement. Partagee par le glisser-deplacer et les clics existants. */
function computeHoveredTile(event: MouseEvent): { x: number; z: number } | null {
  setRaycasterFromEvent(event);
  if (!raycaster.ray.intersectPlane(groundPlane, groundHit)) return null;
  return { x: Math.floor(groundHit.x) + 0.5, z: Math.floor(groundHit.z) + 0.5 };
}

/** Cases occupees par une unite depuis sa case d'ANCRE (la case de FRONT —
 *  meme convention que toute autre unite, portee d'attaque/ciblage/rendu y
 *  compris) : 1x1 pour la grande majorite des unites, plus pour celles qui
 *  declarent un `footprint` (voir data/units.ts — aucune actuellement,
 *  mecanisme conserve generique pour une future unite qui en aurait besoin).
 *  S'etend UNIQUEMENT vers l'arriere du camp joueur
 *  (jamais vers l'avant ni lateralement — `footprint.tilesX` n'est pas
 *  gere ici, aucune unite n'en a encore besoin). Ces fonctions ne servent
 *  qu'a la phase de placement du JOUEUR (`placementSlots`), toujours cote
 *  'player' — la formation ennemie (computeEnemyWavePlacements) est un
 *  calcul de mise en page separe, sans validation d'occupation. */
function getFootprintTiles(unitId: string, anchorX: number, anchorZ: number): { x: number; z: number }[] {
  const depth = getUnit(unitId).footprint?.tilesZ ?? 1;
  if (depth <= 1) return [{ x: anchorX, z: anchorZ }];

  const backStep = -forwardDir('player') * TILE;
  const tiles: { x: number; z: number }[] = [];
  for (let i = 0; i < depth; i++) tiles.push({ x: anchorX, z: anchorZ + backStep * i });
  return tiles;
}

/** Version de isValidPlacementTile consciente du gabarit d'une unite precise
 *  (voir getFootprintTiles) : valide seulement si TOUTES les cases qu'elle
 *  occuperait le sont — jamais de "moitie" d'unite hors zone ou sur un
 *  obstacle. A utiliser a la place de isValidPlacementTile des qu'on
 *  connait l'id de l'unite deplacee/posee. */
function isValidPlacementForUnit(unitId: string, anchorX: number, anchorZ: number, excludeIndices: number[]): boolean {
  return getFootprintTiles(unitId, anchorX, anchorZ).every((t) => isValidPlacementTile(t.x, t.z, excludeIndices));
}

/** Une case est valide pour recevoir une unite si elle n'est deja prise par
 *  aucun AUTRE slot — y compris l'emprise ETENDUE d'un slot a footprint (un
 *  Cavalier deja pose bloque aussi sa case arriere, voir getFootprintTiles),
 *  pas seulement son ancre (voir excludeIndices — le/les slots qu'on est
 *  justement en train de deplacer ne comptent pas contre eux-memes) — pas
 *  sur un obstacle, et a l'interieur de la zone de placement du joueur.
 *  Partagee par le deplacement simple et le deplacement de groupe. */
function isValidPlacementTile(tileX: number, tileZ: number, excludeIndices: number[], excludeBuildingIndex?: number): boolean {
  const occupied = placementSlots.some((s, i) => {
    if (excludeIndices.includes(i) || s.x === null || s.z === null) return false;
    return getFootprintTiles(s.unitId, s.x, s.z).some((t) => t.x === tileX && t.z === tileZ);
  });
  if (occupied) return false;

  // Une case occupee par un obstacle COLLIDABLE (rocher, arbre) ne peut pas
  // recevoir d'unite : sans ce test, l'unite se retrouverait plantee dans
  // l'obstacle au placement, puis rejetee au demarrage de la bataille
  // (resolveObstacleCollisions), ce qui se voit comme un petit saut. Les
  // props (decor purement visuel) sont explicitement EXCLUS de ce test
  // depuis le 2026-08-14 (voir config/constants.ts, isCollidableObstacle) —
  // une unite peut desormais etre deplacee librement sur un champignon/une
  // fleur/un buisson decoratif, demande explicite d'Antoine.
  // La mine (talent "Le temps, c'est de l'argent") ET la plateforme Baliste
  // (2026-08-16, TOUJOURS presente — voir activeBuildingObstacles) sont
  // fusionnees ici aussi : sans ca, une unite pourrait se retrouver placee
  // visuellement DANS un batiment gameplay pendant le placement, puis
  // rejetee au debut de la bataille reelle (meme World.spawnBuilding, voir
  // onValidatePlacement) — meme desagrement de "petit saut" que pour un
  // rocher/arbre. `excludeBuildingIndex` (2026-08-17) : voir
  // activeBuildingObstacles, indispensable pour DEPLACER un bâtiment deja
  // possede sans qu'il se bloque lui-meme.
  const onObstacle = [...currentMap.obstacles, ...activeBuildingObstacles(excludeBuildingIndex)].some((o) => {
    if (!isCollidableObstacle(o)) return false;
    const b = obstacleBounds(o);
    return tileX > b.minX && tileX < b.maxX && tileZ > b.minZ && tileZ < b.maxZ;
  });
  if (onObstacle) return false;

  const halfW = (currentMap.width * TILE) / 2;
  const halfH = (currentMap.height * TILE) / 2;
  // spawnDepth DYNAMIQUE — voir computeArmyFormation, meme raisonnement.
  const zoneMinZ = halfH - currentRun.mapExpansion.spawnDepth * TILE;
  return tileX > -halfW && tileX < halfW && tileZ > zoneMinZ && tileZ < halfH;
}

// --- Achat/placement de batiments (2026-08-17, chantier "batiments
// achetables") -----------------------------------------------------------
//
// Cliquer sur un batiment en boutique n'achete plus rien immediatement : ca
// entre en mode de PLACEMENT (fantome + apercu vert/rouge qui suit le
// curseur), l'or n'est deduit qu'au clic de CONFIRMATION sur une case
// valide — annuler (Echap/clic droit) ne coute donc jamais rien, puisque
// rien n'a encore ete depense. Reutilise entierement l'infrastructure de
// l'editeur de maps (buildGhost/buildCellPreview, editor/editorScene.ts) et
// la validation de case DEJA existante (isValidPlacementTile — memes regles
// exactes que pour poser une unite : dans la zone du joueur, jamais sur un
// obstacle/batiment/unite deja presente), plutot que de dupliquer une
// deuxieme logique de validite.

interface BuildingPlacementMode {
  buildingId: string;
  /** Orientation VISUELLE courante (radians) — Ctrl+molette fait tourner par
   *  pas de 45°, voir rotateBuildingPlacement. PUREMENT cosmetique, jamais
   *  lue par canPlaceBuildingAt/l'empreinte de collision (voir
   *  OwnedBuilding.rotationY). */
  rotationY: number;
  /** Index dans currentRun.buildings du bâtiment EN COURS DE DEPLACEMENT
   *  (2026-08-17, "il faut pouvoir rebouger ses bâtiments pendant la phase
   *  de placement") — `null` pour un ACHAT tout neuf (voir
   *  requestPlaceBuilding), un index reel pour un DEPLACEMENT d'un
   *  bâtiment deja possede (voir requestMoveBuilding). Distingue les deux
   *  seulement au moment de CONFIRMER (gratuit + met a jour en place vs
   *  payant + ajoute une nouvelle entree). */
  movingIndex: number | null;
}

/** Mode de placement de batiment actif, ou null. Mutuellement exclusif avec
 *  l'armement d'un objet d'inventaire (voir requestPlaceBuilding, qui
 *  desarme systematiquement) — les deux modes de "clic sur cible" du jeu ne
 *  doivent jamais etre actifs en meme temps. */
let buildingPlacementMode: BuildingPlacementMode | null = null;

/** Seuil (px ecran) au-dela duquel un clic maintenu sur un bâtiment DEJA
 *  POSSEDE devient un vrai deplacement plutot qu'une simple selection
 *  (2026-08-18, retour d'Antoine : "le bâtiment disparaît temporairement...
 *  puis réapparaît sous le curseur" — un simple mousedown entrait
 *  auparavant IMMEDIATEMENT en mode deplacement, masquant le mesh AVANT
 *  meme qu'un fantome n'existe, voir requestMoveBuilding plus bas). Meme
 *  valeur/meme patron que UNIT_DRAG_THRESHOLD_PX (glisser-vendre une unite). */
const BUILDING_DRAG_THRESHOLD_PX = UNIT_DRAG_THRESHOLD_PX;

interface BuildingClickCandidate {
  index: number;
  startClientX: number;
  startClientY: number;
}

/** Pose au mousedown sur un bâtiment possede — PAS ENCORE un deplacement,
 *  voir BUILDING_DRAG_THRESHOLD_PX. Un simple clic (relache sans depasser le
 *  seuil) ne fait que selectionner (voir selectedBuildingIndex), le
 *  bâtiment reste EXACTEMENT ou il etait tant que le seuil n'est pas
 *  franchi. */
let buildingClickCandidate: BuildingClickCandidate | null = null;

/** Index (dans currentRun.buildings) du bâtiment mis en surbrillance par un
 *  simple clic sans glisser — voir updateBuildingSelectionRing. Distinct de
 *  buildingPlacementMode.movingIndex : la selection ne deplace jamais rien. */
let selectedBuildingIndex: number | null = null;
let buildingSelectionRing: THREE.Mesh | null = null;

/** Reconstruit l'anneau de selection d'un bâtiment (2026-08-18) — un objet
 *  FRAIS a chaque changement de selection plutot qu'un objet persistant
 *  reutilise (geste rare, taille variable selon l'empreinte du bâtiment
 *  selectionne — RingGeometry ne se redimensionne pas sans reconstruire sa
 *  geometrie). Reutilise createEditorSelectionRing (meme style que la
 *  selection d'objet dans l'editeur de maps), ajoute directement a la scene
 *  (pas un enfant du mesh du bâtiment, pour rester independant de
 *  refreshOwnedBuildingViews qui reconstruit ces meshes a chaque changement). */
function updateBuildingSelectionRing(): void {
  if (buildingSelectionRing) {
    renderer.scene.remove(buildingSelectionRing);
    buildingSelectionRing.geometry.dispose();
    (buildingSelectionRing.material as THREE.Material).dispose();
    buildingSelectionRing = null;
  }
  if (selectedBuildingIndex === null) return;
  const owned = currentRun.buildings[selectedBuildingIndex];
  if (!owned) {
    selectedBuildingIndex = null;
    return;
  }
  const def = getBuilding(owned.buildingId);
  const tilesX = def.footprintTilesX ?? 1;
  const tilesZ = def.footprintTilesZ ?? 1;
  buildingSelectionRing = createEditorSelectionRing(Math.hypot(tilesX, tilesZ) / 2 + 0.2);
  buildingSelectionRing.position.set(owned.x, 0.02, owned.z);
  renderer.scene.add(buildingSelectionRing);
}

/** Derniere position (sol) connue du fantome de placement — memorisee a
 *  chaque appel de updateBuildingPlacementGhost pour pouvoir rafraichir
 *  IMMEDIATEMENT le fantome apres une rotation Ctrl+molette (qui n'a pas de
 *  coordonnees monde propres, contrairement a un mousemove), sans attendre
 *  que la souris rebouge. */
let lastBuildingGhostGroundX = 0;
let lastBuildingGhostGroundZ = 0;

/** Fantome 3D + apercu de cases (vert/rouge) du batiment en cours de
 *  placement — un seul groupe, vide tant qu'aucun placement n'est en cours.
 *  Ajoute a la scene une fois pour toutes, comme buildingVfxGroup. */
const buildingPlacementGroup = new THREE.Group();
renderer.scene.add(buildingPlacementGroup);

/** Coin de grille (case entiere) du batiment de `tilesX`x`tilesZ` dont le
 *  CENTRE tomberait sur (x, z) — meme convention de case que le reste du
 *  placement (floor + 0.5 = centre de case). */
function computeBuildingFootprintCorner(x: number, z: number, tilesX: number, tilesZ: number): { cornerX: number; cornerZ: number } {
  return { cornerX: Math.round(x - tilesX / 2), cornerZ: Math.round(z - tilesZ / 2) };
}

/** Centres de case (floor+0.5) occupes par un batiment de `tilesX`x`tilesZ`
 *  dont le coin de grille est (cornerX, cornerZ). */
function buildingFootprintCells(cornerX: number, cornerZ: number, tilesX: number, tilesZ: number): { x: number; z: number }[] {
  const cells: { x: number; z: number }[] = [];
  for (let dz = 0; dz < tilesZ; dz++) {
    for (let dx = 0; dx < tilesX; dx++) cells.push({ x: cornerX + dx + 0.5, z: cornerZ + dz + 0.5 });
  }
  return cells;
}

/** Valide si TOUTES les cases qu'occuperait ce batiment sont valides —
 *  reutilise isValidPlacementTile telle quelle (memes regles qu'une unite :
 *  zone de placement du joueur, aucun obstacle/batiment/unite deja present),
 *  jamais une deuxieme regle de validite dupliquee. `excludeBuildingIndex`
 *  (2026-08-17) : voir activeBuildingObstacles — passe tel quel pendant un
 *  DEPLACEMENT (voir requestMoveBuilding), absent pour un ACHAT (rien a
 *  exclure, le bâtiment n'existe pas encore). */
function canPlaceBuildingAt(buildingId: string, cornerX: number, cornerZ: number, excludeBuildingIndex?: number): boolean {
  const def = getBuilding(buildingId);
  const tilesX = def.footprintTilesX ?? 1;
  const tilesZ = def.footprintTilesZ ?? 1;
  return buildingFootprintCells(cornerX, cornerZ, tilesX, tilesZ).every((c) => isValidPlacementTile(c.x, c.z, [], excludeBuildingIndex));
}

/** Clic sur un bouton "Bâtiments" de la boutique : entre en mode de
 *  placement — AUCUN or depense ici (voir confirmBuildingPlacement). Refuse
 *  silencieusement si l'or est insuffisant (garde-fou en plus du bouton deja
 *  desactive cote UI, voir ui/screens.ts refreshShop). */
function requestPlaceBuilding(buildingId: string): void {
  // Cout EFFECTIF (2026-08-18, Mine/Caserne desormais plus cheres a chaque
  // amelioration permanente — voir getEffectiveBuildingCost, SOURCE UNIQUE
  // partagee avec l'affichage boutique ET confirmBuildingPlacement plus bas).
  if (currentRun.gold < getEffectiveBuildingCost(buildingId, metaProgress)) return;
  disarmItem();
  buildingPlacementMode = { buildingId, rotationY: 0, movingIndex: null };
  buildingRotationHint.setVisible(true);
  // Referme la boutique pour degager la vue sur la zone de placement (point
  // 48 de la demande d'Antoine) — retour a l'etat normal du placement des
  // qu'on confirme/annule, comme apres n'importe quelle fermeture de
  // boutique pendant le placement.
  screens.hideAll();
}

/** Clic sur un bâtiment DEJA POSSEDE pendant le placement (2026-08-17,
 *  demande explicite d'Antoine : "il faut pouvoir rebouger ses bâtiments
 *  pendant la phase de placement") — reutilise EXACTEMENT le meme mode de
 *  placement qu'un achat (fantome + apercu vert/rouge + rotation
 *  Ctrl+molette), seul `movingIndex` distingue les deux au moment de
 *  confirmer (voir confirmBuildingPlacement : gratuit + deplace en place,
 *  jamais un nouvel achat). Le mesh d'ORIGINE est masque le temps du
 *  deplacement (sinon il resterait visible en double avec le fantome, ET
 *  bloquerait sa propre case via activeBuildingObstacles) — restaure par
 *  cancelBuildingPlacement si annule, remplace par un mesh frais
 *  (refreshOwnedBuildingViews) si confirme.
 *
 * N'est plus appelee directement au mousedown depuis le 2026-08-18 (voir
 * BUILDING_DRAG_THRESHOLD_PX) — uniquement une fois le seuil de glisser
 * REELLEMENT franchi. Ordre CRITIQUE a l'interieur de cette fonction (retour
 * d'Antoine : "clic -> bâtiment disparaît -> petit vide -> la souris bouge
 * -> il réapparaît sous le curseur") : le fantome est pose sur la TRANSFORM
 * ACTUELLE du bâtiment (owned.x/owned.z, deja le centre exact de son
 * empreinte) AVANT de masquer le mesh d'origine — aucune frame ou rien n'est
 * visible. Le mousemove qui a declenche ce seuil continue ensuite d'etre
 * traite par l'autre listener deja existant (voir plus bas, meme evenement
 * 'mousemove', dispatch JS synchrone) : il repositionne aussitot ce meme
 * fantome sous le VRAI curseur, sans le moindre repaint entre les deux. */
function requestMoveBuilding(index: number): void {
  const owned = currentRun.buildings[index];
  if (!owned) return;
  disarmItem();
  selectedBuildingIndex = null;
  updateBuildingSelectionRing();
  buildingPlacementMode = { buildingId: owned.buildingId, rotationY: owned.rotationY ?? 0, movingIndex: index };
  buildingRotationHint.setVisible(true);
  updateBuildingPlacementGhost(owned.x, owned.z);
  const view = ownedBuildingViews[index];
  if (view) view.mesh.visible = false;
}

/** Ctrl+molette pendant un placement de batiment : tourne le fantome par pas
 *  de 45° (2026-08-17, demande explicite d'Antoine) — jamais la rotation par
 *  pas de 90° de l'editeur de maps (bouton "Tourner"/R, systeme distinct).
 *  Rafraichit le fantome IMMEDIATEMENT via la derniere position sol connue,
 *  sans attendre un mousemove. */
function rotateBuildingPlacement(direction: number): void {
  if (!buildingPlacementMode) return;
  const step = Math.PI / 4;
  buildingPlacementMode.rotationY = (buildingPlacementMode.rotationY + direction * step + Math.PI * 2) % (Math.PI * 2);
  updateBuildingPlacementGhost(lastBuildingGhostGroundX, lastBuildingGhostGroundZ);
}

/** Annule un placement de batiment en cours (Echap/clic droit) — pour un
 *  ACHAT, aucun or n'a jamais ete depense, rien a rembourser ; pour un
 *  DEPLACEMENT (2026-08-17, movingIndex non null), le bâtiment n'a jamais
 *  bouge dans `currentRun.buildings` — seul son mesh d'origine, masque par
 *  requestMoveBuilding, doit redevenir visible.
 *  Efface aussi buildingClickCandidate (2026-08-18) : purement defensif,
 *  au cas ou Echap/clic droit survienne pendant qu'un clic est maintenu sur
 *  un bâtiment SANS avoir encore franchi le seuil de glisser. */
function cancelBuildingPlacement(): void {
  buildingClickCandidate = null;
  if (buildingPlacementMode?.movingIndex !== null && buildingPlacementMode?.movingIndex !== undefined) {
    const view = ownedBuildingViews[buildingPlacementMode.movingIndex];
    if (view) view.mesh.visible = true;
  }
  buildingPlacementMode = null;
  buildingPlacementGroup.clear();
  buildingRotationHint.setVisible(false);
}

/** Repositionne le fantome + l'apercu vert/rouge sous le curseur — appele a
 *  chaque mousemove tant qu'un placement de batiment est en cours. */
function updateBuildingPlacementGhost(x: number, z: number): void {
  if (!buildingPlacementMode) return;
  lastBuildingGhostGroundX = x;
  lastBuildingGhostGroundZ = z;
  buildingPlacementGroup.clear();
  const def = getBuilding(buildingPlacementMode.buildingId);
  const tilesX = def.footprintTilesX ?? 1;
  const tilesZ = def.footprintTilesZ ?? 1;
  const { cornerX, cornerZ } = computeBuildingFootprintCorner(x, z, tilesX, tilesZ);
  const valid = canPlaceBuildingAt(buildingPlacementMode.buildingId, cornerX, cornerZ, buildingPlacementMode.movingIndex ?? undefined);
  for (let dz = 0; dz < tilesZ; dz++) {
    for (let dx = 0; dx < tilesX; dx++) buildingPlacementGroup.add(buildCellPreview(cornerX + dx, cornerZ + dz, valid));
  }
  if (def.buildingModel) {
    const ghost = buildGhost(
      { kind: 'building', buildingModel: def.buildingModel, tilesX, tilesZ, rotationY: buildingPlacementMode.rotationY },
      cornerX + tilesX / 2,
      cornerZ + tilesZ / 2,
      environmentAssets,
    );
    buildingPlacementGroup.add(ghost);
  }
}

/** Clic de confirmation pendant un placement de batiment : deduit l'or
 *  SEULEMENT si la case visee est valide (sinon, no-op silencieux — meme
 *  convention qu'un clic de placement d'unite qui echoue). Pour un
 *  DEPLACEMENT (2026-08-17, movingIndex non null) : GRATUIT, met a jour la
 *  position/rotation de l'entree EXISTANTE au lieu d'en ajouter une
 *  nouvelle — le bâtiment est deja possede, on ne fait que le repositionner.
 *
 *  Renvoie desormais un booleen (2026-08-18, "je prefere que ca revienne
 *  automatiquement a sa position d'origine" sur un drop invalide) : `true`
 *  si un achat/deplacement a REELLEMENT ete commis, `false` sinon (case
 *  invalide, or insuffisant...). Le site d'appel au CLIC (achat, mode
 *  "armer puis re-cliquer") ignore cette valeur — laisser le mode ARME en
 *  attente d'un nouvel essai reste le bon comportement pour un clic. Le
 *  nouveau site d'appel au RELACHEMENT d'un glisser (voir plus bas,
 *  mouseup) l'utilise en revanche pour appeler cancelBuildingPlacement()
 *  lui-meme sur `false` — laisser le mode arme en attente d'un TROISIEME
 *  clic n'aurait aucun sens une fois le glisser termine. */
function confirmBuildingPlacement(event: MouseEvent): boolean {
  if (!buildingPlacementMode) return false;
  setRaycasterFromEvent(event);
  if (!raycaster.ray.intersectPlane(groundPlane, groundHit)) return false;
  const def = getBuilding(buildingPlacementMode.buildingId);
  const tilesX = def.footprintTilesX ?? 1;
  const tilesZ = def.footprintTilesZ ?? 1;
  const { cornerX, cornerZ } = computeBuildingFootprintCorner(groundHit.x, groundHit.z, tilesX, tilesZ);
  if (!canPlaceBuildingAt(buildingPlacementMode.buildingId, cornerX, cornerZ, buildingPlacementMode.movingIndex ?? undefined)) return false;

  if (buildingPlacementMode.movingIndex !== null) {
    const owned = currentRun.buildings[buildingPlacementMode.movingIndex];
    if (!owned) {
      cancelBuildingPlacement();
      return false;
    }
    owned.x = cornerX + tilesX / 2;
    owned.z = cornerZ + tilesZ / 2;
    owned.rotationY = buildingPlacementMode.rotationY;
    cancelBuildingPlacement();
    refreshOwnedBuildingViews();
    return true;
  }

  // Cout EFFECTIF (2026-08-18) — voir requestPlaceBuilding, meme source
  // unique (getEffectiveBuildingCost) : le prix retire ICI doit toujours
  // correspondre exactement a celui affiche/verifie en boutique.
  const cost = getEffectiveBuildingCost(buildingPlacementMode.buildingId, metaProgress);
  if (currentRun.gold < cost) {
    cancelBuildingPlacement();
    return false;
  }
  currentRun.gold = Math.max(0, roundGold(currentRun.gold - cost));
  currentRun.buildings.push({
    buildingId: def.id,
    x: cornerX + tilesX / 2,
    z: cornerZ + tilesZ / 2,
    hp: def.maxHp,
    rotationY: buildingPlacementMode.rotationY,
  });
  spawnCoinPopup(screens.shopGoldElement, -cost);
  cancelBuildingPlacement();
  refreshOwnedBuildingViews();
  return true;
}

/** Case valide la PLUS PROCHE de (targetX, targetZ), dans un petit rayon
 *  fixe (voir MOVE_CLICK_NEAREST_TILE_RADIUS) — distincte de
 *  findFreePlacementTile (rayon illimite, pensee pour un achat qui doit
 *  trouver N'IMPORTE QUELLE case libre meme loin) : ici, un clic/glisser de
 *  deplacement legerement a cote de la case visee (parallaxe de la camera
 *  inclinee pres d'un bord de case) doit quand meme deplacer l'unite,
 *  jamais echouer en silence — mais rester un vrai refus (case occupee,
 *  hors zone) au-dela de ce petit rayon. Renvoie la case visee telle quelle
 *  si elle est deja valide (cas normal, aucune recherche necessaire). */
function findNearestValidTile(
  unitId: string,
  targetX: number,
  targetZ: number,
  excludeIndices: number[],
): { x: number; z: number } | null {
  if (isValidPlacementForUnit(unitId, targetX, targetZ, excludeIndices)) return { x: targetX, z: targetZ };

  let best: { x: number; z: number } | null = null;
  let bestDistSq = Infinity;
  const r = MOVE_CLICK_NEAREST_TILE_RADIUS;
  for (let dx = -r; dx <= r; dx++) {
    for (let dz = -r; dz <= r; dz++) {
      if (dx === 0 && dz === 0) continue;
      const x = targetX + dx * TILE;
      const z = targetZ + dz * TILE;
      if (!isValidPlacementForUnit(unitId, x, z, excludeIndices)) continue;
      const distSq = dx * dx + dz * dz;
      if (distSq < bestDistSq) {
        bestDistSq = distSq;
        best = { x, z };
      }
    }
  }
  return best;
}

/** Clic sur une case vide de la zone : deplace l'unite en main (selectedIndices,
 *  1 element) jusque-la, si la case (ou a defaut la case valide la plus
 *  proche, voir findNearestValidTile) est libre, hors obstacle et dans la
 *  zone — ou, si un GROUPE est selectionne (2+ elements), deplace tout le
 *  groupe (voir handleGroupMoveClick). Ne gere plus la selection elle-meme
 *  (voir findHoveredSlot/le listener mousedown) — separee pour laisser la
 *  place au geste de glisser-vendre. */
function handleEmptyTileClick(event: MouseEvent): void {
  if (selectedIndices.length > 1) {
    handleGroupMoveClick(event);
    return;
  }
  const index = selectedIndices[0];
  if (index === undefined) return;
  const tile = computeHoveredTile(event);
  if (!tile) return;
  const target = findNearestValidTile(placementSlots[index]!.unitId, tile.x, tile.z, [index]);
  if (!target) return;

  placementSlots[index]!.x = target.x;
  placementSlots[index]!.z = target.z;
  clearSelection();
  refreshPlayerPreview();
}

/** Calcule les nouvelles positions du groupe si `anchorIndex` (un de ses
 *  membres) atterrissait sur `targetTile` — le meme delta (en cases entieres)
 *  s'applique a tous les autres membres, pour preserver la formation
 *  relative. Partage entre le clic (handleGroupMoveClick) et le glisser
 *  (voir listeners mousemove/mouseup plus bas), pour ne calculer cette
 *  logique qu'a un seul endroit. */
function computeGroupPreview(
  anchorIndex: number,
  group: number[],
  targetTile: { x: number; z: number },
): { positions: { i: number; x: number; z: number }[]; allValid: boolean } {
  const anchor = placementSlots[anchorIndex]!;
  const deltaX = targetTile.x - anchor.x!;
  const deltaZ = targetTile.z - anchor.z!;

  const positions = group.map((i) => ({ i, x: placementSlots[i]!.x! + deltaX, z: placementSlots[i]!.z! + deltaZ }));
  const allValid = positions.every((p) => isValidPlacementForUnit(placementSlots[p.i]!.unitId, p.x, p.z, group));
  return { positions, allValid };
}

/** Deplace tout le groupe selectionne d'un seul bloc : le premier membre du
 *  groupe sert d'ancre (son deplacement exact, en cases entieres, est
 *  applique tel quel a tous les autres — preserve la formation relative).
 *  Si la nouvelle position d'UN SEUL membre est invalide, tout le
 *  deplacement est annule (pas de deplacement partiel). Un clic qui ne mene
 *  a aucun deplacement valide DESELECTIONNE le groupe (demande d'Antoine,
 *  2026-08-08 : "clic gauche dans le vide" pour desselectionner) —
 *  contrairement au deplacement simple, qui laisse l'unite selectionnee pour
 *  reessayer. */
function handleGroupMoveClick(event: MouseEvent): void {
  const group = selectedIndices;
  if (group.length === 0) return;

  const targetTile = computeHoveredTile(event);
  if (!targetTile) {
    clearSelection();
    refreshPlayerPreview();
    return;
  }

  const { positions, allValid } = computeGroupPreview(group[0]!, group, targetTile);

  if (allValid) {
    for (const p of positions) {
      placementSlots[p.i]!.x = p.x;
      placementSlots[p.i]!.z = p.z;
    }
  }

  clearSelection();
  refreshPlayerPreview();
}

/** Projette une position monde (sol) vers des coordonnees ecran (pixels),
 *  pour tester quelles unites tombent dans le rectangle de selection glisse
 *  a la souris (voir selectUnitsInRect). Vise un point legerement au-dessus
 *  du sol (le corps de l'unite, pas ses pieds) pour rester intuitif : encadrer
 *  la silhouette a l'ecran doit suffire, pas viser precisement sa base. */
function worldToScreen(x: number, z: number): { x: number; y: number } {
  const v = new THREE.Vector3(x, 0.5, z);
  v.project(renderer.camera);
  const rect = canvas.getBoundingClientRect();
  return {
    x: rect.left + (v.x * 0.5 + 0.5) * rect.width,
    y: rect.top + (-v.y * 0.5 + 0.5) * rect.height,
  };
}

/** Resout le rectangle de selection glisse a la souris (voir SelectionBox) en
 *  determinant quelles unites du joueur y tombent, a l'ecran — uniquement
 *  parmi `placementSlots` (2026-08-14, demande d'Antoine, point 21 : "pas
 *  les ennemis, pas le decor, pas les corps morts") : ce tableau ne contient
 *  QUE l'armee du joueur pendant la phase de placement, jamais les ennemis
 *  (previsualises separement dans `enemyPreview`, jamais teste ici) ni le
 *  decor — cette garantie decoule directement de la structure des donnees,
 *  aucun filtre supplementaire necessaire. 0 resultat : deselectionne tout.
 *  1 resultat : selection simple, comme un clic normal. 2+ : selection de
 *  groupe — `setSelection` ne fait plus de distinction de cas, seul le
 *  NOMBRE d'elements change le comportement des appelants (voir isSelected/
 *  handleEmptyTileClick). */
function selectUnitsInRect(rect: { left: number; top: number; right: number; bottom: number }): void {
  const indices: number[] = [];
  placementSlots.forEach((slot, i) => {
    if (slot.x === null || slot.z === null) return;
    const p = worldToScreen(slot.x, slot.z);
    if (p.x >= rect.left && p.x <= rect.right && p.y >= rect.top && p.y <= rect.bottom) indices.push(i);
  });

  setSelection(indices);
  refreshPlayerPreview();
}

/** Vend un LOT d'unites d'un coup (2026-08-14, refonte demandee par Antoine,
 *  points 26/36 : "la vente multiple doit utiliser EXACTEMENT la logique de
 *  revente actuelle unite par unite... crée une fonction UNIQUE sellUnits(),
 *  le clic sur le bouton Vendre ET le drop sur la zone Vendre doivent tous
 *  deux appeler la MEME logique") — remplace l'ancien `sellUnit(slotIndex)`
 *  a un seul element ; tout appelant qui ne vend qu'UNE unite passe desormais
 *  un tableau a un seul element (voir les sites d'appel plus bas). Bareme
 *  PAR UNITE inchange (voir computeSellValue, PARTAGE avec l'affichage du
 *  bouton "Vendre" — jamais un montant approxime "count * valeur unique",
 *  point 26 de la demande). */
function sellUnits(indices: number[]): void {
  // Deduplique et ignore tout index deja invalide (defensif) — puis TRIE
  // DESCENDANT : supprimer du plus grand index au plus petit via
  // Array.splice ne decale jamais un index pas encore traite, contrairement
  // a l'ordre croissant (ou chaque suppression decalerait tous les suivants).
  const unique = Array.from(new Set(indices)).filter((i) => placementSlots[i] !== undefined);
  if (unique.length === 0) return;
  const sortedDesc = [...unique].sort((a, b) => b - a);

  const totalValue = computeSellValue(sortedDesc);
  for (const index of sortedDesc) {
    currentRun.army.splice(index, 1);
    placementSlots.splice(index, 1);
  }
  currentRun.gold = roundGold(currentRun.gold + totalValue);
  // Evite un double-remboursement si une unite vendue est justement celle du
  // dernier achat (voir lastUnitPurchase) — apres une vente, "annuler le
  // dernier achat" n'a plus de sens fiable, quelle que soit l'unite vendue.
  lastUnitPurchase = null;

  // Reindexe toute selection RESTANTE (des unites vendues n'en faisaient pas
  // forcement partie — un glisser peut vendre une seule unite hors groupe
  // sans toucher a une selection de groupe sans rapport, voir le listener
  // mouseup plus bas) : retire les index vendus, decale les autres du nombre
  // d'index vendus strictement inferieurs a eux. Meme principe que l'ancien
  // reindexage a un seul element, generalise a plusieurs suppressions d'un
  // coup.
  const sold = new Set(sortedDesc);
  selectedIndices = selectedIndices.filter((i) => !sold.has(i)).map((i) => i - sortedDesc.filter((s) => s < i).length);

  refreshPlayerPreview();
  spawnCoinPopup(sellZone.element, totalValue);
}

// --- Boucle et systemes de combat --------------------------------------

let lastRealTime = performance.now();

const loop = new Loop(
  (dt) => {
    world.step(dt);
    // Tir automatique en maintien de clic (2026-08-13, "Tir rapide") — DANS
    // le pas de simulation FIXE, jamais dans le rendu (variable) : le rythme
    // reel des tirs reste cadence a SIM_STEP pres, jamais au framerate.
    attemptAutoFire();

    for (const event of world.combatEvents) {
      // Lookup O(1) (World.getById, 2026-08-13) plutot qu'une recherche
      // lineaire dans world.entities — cout croissant avec le nombre
      // d'evenements de combat par tick sur les grosses vagues.
      const attacker = world.getById(event.attackerId);
      const target = world.getById(event.targetId);
      if (!attacker || !target) continue;

      // Le geste d'attaque se joue qu'il touche, rate ou finisse dans un
      // obstacle. Un arc ne se brandit pas comme une epee : l'archer tire une
      // fleche (visant le point d'impact si le tir est bloque), le fantassin frappe.
      const aimX = event.result === 'blocked' ? event.impactX : target.x;
      const aimZ = event.result === 'blocked' ? event.impactZ : target.z;

      // playAttack declenche le clip d'attaque du modele riggé s'il en a un
      // (voir UnitViews.playAttack — sans effet pour une unite sans
      // squelette anime) — appele INCONDITIONNELLEMENT desormais (2026-08-11,
      // Archer riggé) : avant, seule la branche "non-archer" l'appelait,
      // puisque l'archer en boites n'avait pas de bras anime a declencher.
      // Le tir de fleche visuel (projectile separe) reste EN PLUS, pas a la
      // place — les deux effets sont independants.
      unitViews.playAttack(attacker.id, attacker.x, attacker.z);
      if (getUnit(attacker.unitId).visual.kit === 'archer') {
        // Retarde le depart VISUEL de la fleche pour le caler sur le clip
        // d'attaque riggé (voir pendingArrowSpawns) — les degats sont deja
        // resolus a cet instant (combatSystem, plus haut dans world.step),
        // ce delai ne change rien au resultat du combat.
        pendingArrowSpawns.push({
          elapsed: 0,
          delay: ARCHER_ATTACK_RELEASE_FRACTION * getUnit('archer').stats.attackCooldown,
          attackerId: attacker.id,
          x: attacker.x,
          z: attacker.z,
          // null sur un tir BLOQUE : `aimX/aimZ` est deja le point d'impact
          // fixe sur l'obstacle dans ce cas, jamais une entite a suivre.
          targetId: event.result === 'blocked' ? null : target.id,
          targetX: aimX,
          targetZ: aimZ,
          team: attacker.team,
        });
      }

      // Ni un miss ni une esquive ne changent de PV : sans ce texte, rien
      // d'autre ne le signalerait. Libelles distincts (2026-08-10) : "raté"
      // est un echec DE L'ATTAQUANT, "esquivé" une reaction DE LA CIBLE
      // (talent "Réflexes de vétéran").
      if (event.result === 'miss') combatOverlay.spawnMissText(target.x, target.z);
      if (event.result === 'dodge') combatOverlay.spawnDodgeText(target.x, target.z);
      // "Game feel" (2026-08-09) : flash sur la cible qui vient d'encaisser
      // un coup, sans quoi un hit ne se voit qu'a la baisse (lente, par pips
      // de HP_PER_PIP) de la barre de PV. Batiments gameplay (2026-08-16) :
      // routes vers BuildingView plutot que UnitViews (qui ne les connait
      // pas — pas d'effet, pas d'erreur, simple id absent de sa propre Map).
      if (event.result === 'hit') playHitFlash(target.id);

      // Talent "Aux petits oignons" (specialisation Soigneur, 2026-08-11 —
      // seuil refondu le 2026-08-15, demande explicite d'Antoine) : declenche
      // sur FRANCHISSEMENT du seuil AUTO_HEAL_TRIGGER_RATIO (30% des PV
      // maximum, toujours calcule en RATIO — jamais une valeur de PV
      // hardcodee, fonctionne donc identiquement sur un Fantassin ou une
      // Sentinelle a 500 PV internes). "Franchissement" = l'unite N'ETAIT PAS
      // deja marquee dans belowAutoHealThreshold avant CE coup — le marquage
      // a lieu ICI, REGARDLESS du talent/de la disponibilite d'un parchemin
      // (point 6 de la demande : "le proc est deja consomme pour ce
      // franchissement", meme si le soin qui suit ne suffit pas a repasser
      // au-dessus de 30%) : l'unite ne pourra re-proc qu'apres etre repassee
      // STRICTEMENT au-dessus du seuil (voir applyPlayerHeal, seul endroit ou
      // ce retour au-dessus peut etre detecte, les PV ne remontant jamais
      // ailleurs que par un soin). target.alive verifie APRES deathSystem
      // (deja execute dans ce meme world.step()) : jamais de proc sur un coup
      // fatal. !target.isBuilding (2026-08-16) : un batiment gameplay
      // (Mine, Baliste) ne doit jamais consommer un parchemin de soin — ce
      // talent ne concerne que les vraies unites.
      if (event.result === 'hit' && target.team === 'player' && target.alive && !target.isBuilding) {
        const ratio = target.hp / target.stats.maxHp;
        if (ratio <= AUTO_HEAL_TRIGGER_RATIO && !belowAutoHealThreshold.has(target.id)) {
          belowAutoHealThreshold.add(target.id);
          if (isTalentUnlocked(metaProgress, 'aux_petits_oignons')) {
            const scrollIndex = currentRun.inventory.findIndex((i) => i.itemId === 'heal_scroll_minor');
            if (scrollIndex !== -1) {
              // Meme montant EFFECTIF que l'usage manuel (2026-08-13, boutique
              // d'amelioration "Parchemin de soin") — c'est le MEME parchemin,
              // le bonus permanent s'applique partout ou il est consomme. Pas
              // de cibles secondaires ici (declenchement automatique reactif,
              // volontairement mono-cible — voir useArmedItemOnClick).
              const healAmount = effectivePlayerHealAmount(metaProgress);
              const { overheal } = applyPlayerHeal(target, target.stats.maxHp, healAmount, target.id);
              currentRun.inventory.splice(scrollIndex, 1);
              inventoryBar.refresh(currentRun.inventory);
              combatOverlay.spawnHealText(target.x, target.z, healAmount / HP_PER_PIP);
              const pos = unitViews.getPosition(target.id) ?? { x: target.x, z: target.z };
              healVfxView.spawnHeal(pos.x, pos.z);
              // Talent "Soins excédentaires" (2026-08-15) — voir
              // triggerShadowProjectiles ; synergise naturellement avec Aux
              // petits oignons (point 66 de la demande), aucun code special.
              triggerShadowProjectiles(target.x, target.z, overheal);
            }
          }
        }
      }
    }

    // Capacites (Charge du Cavalier leger...) — voir sim/systems/abilities.ts.
    // Le "petit effet d'impact" demande par Antoine reutilise directement le
    // flash existant (playHit) : aucun nouveau systeme VFX necessaire, la
    // ruee elle-meme (deplacement direct, deja tres rapide) fait l'essentiel
    // du travail de lisibilite ("accélération très nette").
    for (const event of world.abilityEvents) {
      if (event.type === 'charge-impact') playHitFlash(event.targetId);
      // Boule de feu du Mage (2026-08-11) : meme flash blanc que tout autre
      // impact, applique a CHAQUE cible touchee dans le rayon (pas seulement
      // la position visee) + l'onde/flash au sol (voir FireballView).
      if (event.type === 'blast-impact') {
        vfxManager.spawn('fireballImpact', { x: event.x, z: event.z, radiusTiles: event.radiusTiles });
        for (const id of event.hitIds) playHitFlash(id);
      }
      // Provocation de la Sentinelle (2026-08-14) : geste procedural sur la
      // Sentinelle elle-meme (voir UnitViews.playTaunt — priorite sur une
      // attaque en cours) + onde au sol + petit flash au moment ou le
      // Shield est gagne (visible meme si `targetIds` est vide en pratique,
      // impossible ici puisque tryTriggerTaunt ne declenche jamais sans au
      // moins une cible reelle) — voir sim/systems/abilities.ts.
      if (event.type === 'taunt') {
        unitViews.playTaunt(event.entityId, event.x, event.z);
        tauntVfxView.spawnTauntWave(event.x, event.z, event.radiusTiles);
        tauntVfxView.spawnShieldGain(event.x, event.z);
      }
    }

    // Projectiles d'ombre (talent "Soins excédentaires", 2026-08-15) — meme
    // flash blanc que tout autre impact + petit impact violet SOBRE (voir
    // ShadowProjectileView, "pas de grosse explosion").
    for (const event of world.shadowProjectileEvents) {
      playHitFlash(event.targetId);
      vfxManager.spawn('shadowImpact', { x: event.x, z: event.z });
    }

    // Zones d'effet persistantes (Blizzard...) — 2026-08-14, demande
    // d'Antoine : "il faut qu'il y ait un flash blanc de dégâts sur chaque
    // tick du Blizzard". Meme flash que tout autre impact (playHit),
    // applique a CHAQUE cible REELLEMENT touchee par CE tick precis (voir
    // sim/systems/persistentAreaEffects.ts, AreaEffectTickEvent.hitIds) —
    // jamais a toutes les unites presentes dans la zone au moment de sa
    // creation. Un tick sans aucune cible dans le rayon ne declenche aucun
    // flash (hitIds vide).
    for (const event of world.areaEffectEvents) {
      for (const id of event.hitIds) playHitFlash(id);
    }

    // Mine (talent "Le temps, c'est de l'argent", 2026-08-14) : or genere en
    // CONTINU tant qu'une bataille REELLE est en cours — jamais pendant
    // "Tester le scenario" (inTestMode, sans lien avec une run reelle) meme
    // si le talent est deverrouille. Accru dans le pas de simulation FIXE
    // (dt), meme principe que le reste des systemes de jeu — pas le rendu a
    // framerate variable. CORRECTIF (2026-08-14, bug remonte par Antoine :
    // "il ne s'affiche pas en direct") : un premier essai arrondissait
    // `currentRun.gold` au dixieme le PLUS PROCHE a CHAQUE tick, ce qui
    // effacait systematiquement le petit increment reel (~0.033 or/tick a
    // 1 or/seconde et 30Hz) avant qu'il n'ait jamais pu s'accumuler — l'or
    // de la mine n'augmentait donc JAMAIS. Corrige via mineIncomeAccumulator
    // (voir sa declaration) : le montant BRUT s'accumule d'abord, puis n'est
    // verse dans currentRun.gold que par paliers de 0.1 des qu'ils sont
    // atteints — jamais de perte, et le HUD (String(gold) brut) n'affiche
    // jamais de bruit flottant puisque seuls des multiples exacts de 0.1
    // sont ajoutes a currentRun.gold.
    // 2026-08-17 (chantier "batiments achetables") : la Mine n'est plus
    // liee a un talent — chaque Mine VIVANTE du joueur genere son propre
    // revenu, additionne (2 Mines = 2x, comme demande explicitement par
    // Antoine). Compte les vraies Entity plutot que RunState.buildings :
    // une Mine detruite en bataille arrete immediatement de generer, sans
    // attendre la fin de la vague (World.entities est deja la source de
    // verite temps reel utilisee partout ailleurs dans ce fichier).
    if (inBattlePhase() && !inTestMode) {
      let livingMineCount = 0;
      for (const e of world.entities) {
        if (e.team === 'player' && e.alive && e.isBuilding && e.unitId === 'mine') livingMineCount++;
      }
      if (livingMineCount > 0) {
        mineIncomeAccumulator += effectiveMineGoldPerSecond(metaProgress) * livingMineCount * dt;
        const wholeTenths = Math.floor(mineIncomeAccumulator * 10 + 1e-9);
        if (wholeTenths > 0) {
          currentRun.gold = roundGold(currentRun.gold + wholeTenths / 10);
          mineIncomeAccumulator -= wholeTenths / 10;
        }
      }
    }

    // Production de la Caserne (2026-08-17) : le sim pousse un evenement par
    // Fantassin reellement produit (voir sim/systems/barracksSystem.ts,
    // brancle dans World.step) — consomme ici pour spawner une VRAIE Entity
    // Fantassin (statOverrides joueur/ennemi selon le camp, memes ameliorations
    // permanentes/talents qu'un Fantassin achete normalement, jamais un
    // "BarracksFootman" special).
    for (const event of world.barracksSpawnEvents) {
      world.spawn(
        event.unitId,
        event.team,
        event.x,
        event.z,
        undefined,
        event.team === 'player' ? playerStatOverrides(event.unitId) : enemyStatOverrides(event.unitId, currentRun.waveNumber),
        event.team === 'player' ? playerAbilityDamageBonus(event.unitId) : enemyAbilityDamageBonus(event.unitId, currentRun.waveNumber),
      );
    }

    // Or en TEMPS REEL a chaque kill (2026-08-11, demande d'Antoine : "dès
    // que nous tuons une unité un gold apparait dans notre petite fenêtre à
    // gold") — remplace l'ancien calcul groupe en fin de bataille (voir
    // run/runState.ts, awardKillGold/applyBattleOutcome). Detecte les morts
    // par TRANSITION (rewardedEnemyDeaths) plutot qu'en reagissant a
    // combatEvents : une mort peut venir de trois sources distinctes (combat
    // automatique, fleche du joueur, Charge du Cavalier), et cette methode
    // les couvre toutes uniformement sans risquer de compter deux fois la
    // meme unite si plusieurs coups la visaient au meme tick.
    for (const e of world.entities) {
      if (e.team === 'enemy' && !e.alive && !rewardedEnemyDeaths.has(e.id)) {
        rewardedEnemyDeaths.add(e.id);
        const amount = awardKillGold(currentRun, e.unitId, computeTalentEconomyHooks(metaProgress));
        combatOverlay.spawnGoldText(e.x, e.z, amount);

        // Deblocage generique des unites (2026-08-15, demande d'Antoine,
        // remplace l'ancien deblocage du Mage a la vague 8) : une unite
        // ennemie vaincue au moins une fois enregistre le FAIT de facon
        // permanente (voir run/metaProgress.ts, registerEnemyDefeat) — pas
        // besoin de gagner la vague (point 23 de la demande), juste que
        // l'unite meure REELLEMENT. Jamais pendant "Tester le scenario"
        // (inTestMode, sans lien avec une run reelle) — meme convention que
        // registerWaveReached/le buff de difficulte par vague.
        if (!inTestMode && registerEnemyDefeat(metaProgress, e.unitId)) {
          saveMetaProgress(metaProgress);
          // Toast NON BLOQUANT (point 26 de la demande) — uniquement pour
          // une unite dont ce fait debloque reellement quelque chose (pas de
          // "NOUVELLE UNITÉ DÉBLOQUÉE : FANTASSIN" absurde pour une unite
          // deja 'starter').
          if (getUnit(e.unitId).playerUnlockMode === 'defeatEnemy') {
            unitUnlockToast.show(getUnit(e.unitId).name);
          }
        }
      }
    }

    // Vague terminee des qu'un camp est elimine. Avec le ciblage verrouille,
    // les survivants n'ont deja plus personne a combattre a ce moment-la.
    // countCombatants (2026-08-16, architecture BUILDING) plutot que
    // countAlive : une Mine/Baliste encore vivante (voir Entity.countsForDefeat)
    // maintient le camp joueur "en vie" au meme titre qu'une unite — meme
    // semantique que applyBattleOutcome (run/runState.ts), une seule
    // definition de "combattant" dans tout le jeu.
    if (!battleOver && world.entities.length > 0) {
      const playerAlive = world.countCombatants('player');
      const enemyAlive = world.countCombatants('enemy');
      if (playerAlive === 0 || enemyAlive === 0) {
        battleOver = true;
        loop.timeScale = 0;
        // Fin de combat (2026-08-13) : n'importe quel tir automatique en
        // cours doit s'arreter net, meme si le bouton est reste enfonce.
        fireButtonHeld = false;
        if (inTestMode) {
          // Demande d'Antoine : "Tester le scenario" revient a l'editeur des
          // que la derniere unite tombe, PAS a l'ecran de fin de vague normal
          // — raccourci de dev, pas concerne par la sequence ci-dessous.
          returnToEditorAfterTest();
        } else {
          // Sequence de transition (2026-08-09, demande d'Antoine : la
          // bascule etait instantanee, "trop brusque") : le champ de bataille
          // reste visible (figé par timeScale=0 ci-dessus) pendant que la
          // banniere apparait, PUIS le rideau se ferme — c'est seulement au
          // moment ou l'ecran est plein noir (onBlackout) qu'on fait le
          // menage qui etait avant instantane et visible. Voir
          // ui/waveTransition.ts.
          // currentRun.waveNumber n'a pas encore ete incremente ici (ca
          // n'arrive que dans applyBattleOutcome, plus bas) : c'est bien le
          // numero de la vague qu'on vient de jouer.
          const label = `Vague ${currentRun.waveNumber} — ${playerAlive > 0 ? 'Victoire !' : 'Défaite'}`;
          waveTransition.play(label, async () => {
            // Bonus de fin de vague (si victoire) et armee mise a jour (PV
            // des survivants, morts retires) — LIT world.entities, donc doit
            // s'executer AVANT de le vider juste apres. L'or des KILLS n'est
            // plus calcule ici depuis le 2026-08-11 (voir awardKillGold,
            // deja verse en temps reel pendant la bataille) — goldEarned ne
            // reflete donc plus que le bonus de vague, gardee de cote pour
            // l'animation "gain de piece" jouee a l'OUVERTURE de la boutique
            // (voir plus bas) — pas ici, l'ecran boutique n'existe pas
            // encore a l'ecran a cet instant (getBoundingClientRect y
            // renverrait un rectangle vide).
            // Capture AVANT applyBattleOutcome : cette fonction incremente
            // waveNumber en cas de victoire, donc c'est le numero de la vague
            // qu'on vient reellement de jouer, pas la suivante.
            const waveBeingFought = currentRun.waveNumber;
            const outcome = applyBattleOutcome(currentRun, world.entities);
            lastBattleGoldEarned = outcome.goldEarned;

            // Runes d'amelioration permanente (2026-08-13, boutique
            // d'amelioration — voir CLAUDE.md) : par vague REELLEMENT
            // GAGNEE (point 4 de la demande), jamais sur une defaite. Montant
            // MIS A L'ECHELLE par palier de 10 vagues depuis le 2026-08-15
            // (chantier polish/equilibrage, voir run/metaProgress.ts,
            // upgradeRunesRewardForWave) — `waveBeingFought` (capture avant
            // increment, la vague REELLEMENT jouee/gagnee, 1-indexee comme
            // affichee au joueur) est le bon numero a lui passer, jamais
            // `currentRun.waveNumber` post-increment. Ce callback ne
            // s'execute QU'UNE SEULE FOIS par bataille resolue (voir
            // `battleOver`, pose juste avant `waveTransition.play`, et jamais
            // rejoue au reload puisque rien ne persiste une run en cours —
            // voir CLAUDE.md, "Pas encore fait"), donc aucun risque de double
            // recompense (point 5) sans mecanisme de garde supplementaire :
            // c'est le MEME point de verite deja utilise pour
            // WAVE_CLEAR_BONUS/registerWaveReached juste au-dessus.
            const runesEarnedThisBattle = outcome.won ? awardUpgradeRunesForWaveWin(metaProgress, waveBeingFought) : 0;
            if (runesEarnedThisBattle > 0) saveMetaProgress(metaProgress);

            // Le deblocage du Mage/de la Sentinelle cote JOUEUR ne depend
            // PLUS d'un numero de vague depuis le 2026-08-15 (voir
            // data/units.ts, UnitDef.playerUnlockMode) : il a deja eu lieu,
            // le cas echeant, au moment REEL ou l'unite ennemie est morte
            // (voir la boucle "or en temps reel a chaque kill" plus haut,
            // registerEnemyDefeat) — rien a faire ici.

            // Points de talent gagnes CETTE bataille, toutes sources
            // confondues (voir plus bas) — sert uniquement a piloter le
            // toast "point de talent disponible" (demande d'Antoine,
            // 2026-08-10), aucun impact sur le calcul lui-meme.
            const talentPointsBefore = metaProgress.talentPoints;

            // Record de vague + points de talent par seuil (refonte
            // 2026-08-10, voir CLAUDE.md et run/metaProgress.ts) : utilise
            // currentRun.waveNumber APRES l'increment de applyBattleOutcome
            // (pas waveBeingFought) — sur une VICTOIRE de la vague 4,
            // waveNumber passe a 5, ce qui est bien > 4 : le point se debloque
            // seulement une fois la vague 4 REELLEMENT GAGNEE ("après avoir
            // terminé la vague 4", pas juste atteinte). Sur une defaite,
            // waveNumber n'a pas bouge, donc pas de point meme si la vague 4
            // a ete jouee jusqu'au bout. Verifie a CHAQUE bataille reelle, pas
            // seulement en fin de run.
            if (registerWaveReached(metaProgress, currentRun.waveNumber)) saveMetaProgress(metaProgress);

            // Bug remonte par Antoine : les survivants restaient rendus a
            // leur position de fin de combat (unitViews/world.entities)
            // PENDANT que startPlacement() les faisait deja apparaitre a leur
            // position de placement (playerPreview) — deux representations
            // visuelles de la meme unite logique en meme temps. On vide donc
            // la vue de combat ICI, derriere le rideau noir (invisible),
            // plutot qu'a onValidatePlacement() (le debut de la PROCHAINE
            // bataille) comme avant ce correctif.
            world.clear();
            rewardedEnemyDeaths.clear();
            belowAutoHealThreshold.clear();
            pendingArrowSpawns.length = 0;
            unitViews.clear();
            combatOverlay.clear();
            projectiles.clear();
            playerArrowView.clear();
            telegraphView.clear();
            fireballView.clear();
            iceNovaView.clear();
            healVfxView.clear();
            tauntVfxView.clear();
            shadowProjectileView.clear();
            disarmItem();

            // Defaite TOTALE (2026-08-16, corrige apres l'architecture
            // BUILDING) : `outcome.won` — pas `currentRun.army.length === 0`
            // comme avant — est la SOURCE UNIQUE de ce qu'est une "run
            // terminee". `applyBattleOutcome` calcule deja `won` a partir de
            // `countsForDefeat` (vrai pour une unite ET pour un batiment
            // comme la Mine/la Baliste, voir World.spawnBuilding) : gagner
            // exige seulement qu'au moins un COMBATTANT joueur (unite OU
            // batiment) survive au moment ou le dernier ennemi tombe. Bug
            // remonte par Antoine : avec l'ancienne condition, une victoire
            // ou TOUTES les unites etaient mortes mais ou la Mine/la Baliste
            // tenait encore ("il me reste des batiments") declenchait a tort
            // l'ecran "Partie terminee" — alors que le joueur peut tres bien
            // continuer (racheter des unites en boutique au placement
            // suivant, or/talents/batiments deja acquis intacts). `army`
            // peut desormais legitimement etre vide sur une VRAIE victoire
            // (armee entiere sacrifiee, la Baliste du joueur finissant seule
            // les derniers ennemis) — ce cas retombe normalement dans la
            // branche "Continuer" plus bas, `startPlacement()` reconstruit
            // simplement un placement a 0 unite, boutique auto-ouverte.
            // Sur une VRAIE defaite totale (aucun combattant joueur, unite ou
            // batiment, ne survit), demande d'Antoine, 2026-08-09 : la run
            // s'arrete la, retour au menu principal, pas de boutique ni de
            // vague suivante. C'est aussi la SEULE fin de run qui sauvegarde
            // la progression permanente (chantier sauvegarde, 2026-08-09) :
            // un abandon manuel (Echap -> Quitter) n'incremente ni ne
            // sauvegarde rien, voir quitToMenu.
            if (!outcome.won) {
              // Precision d'Antoine (2026-08-10, apres une premiere run
              // terminee vague 2 sans recevoir de point) : le tout PREMIER
              // point de talent d'une sauvegarde ne depend d'aucun palier de
              // vague, il est du des la toute premiere run terminee — voir
              // run/metaProgress.ts, grantFirstRunPointIfNeeded. Independant
              // et cumulable avec registerWaveReached ci-dessus.
              if (grantFirstRunPointIfNeeded(metaProgress)) saveMetaProgress(metaProgress);
              talentPointToast.show(metaProgress.talentPoints - talentPointsBefore);
              waveIndicator.setVisible(false);
              goldHud.setVisible(false);
              screens.showGameOver(metaProgress.highestWaveReached);
            } else {
              // Agrandissement progressif du champ de bataille (2026-08-18,
              // demande d'Antoine) — voir run/mapExpansion.ts et
              // applyMapExpansionForCompletedWave : "après validation réelle
              // de Victory et avant Placement", donc ICI, derriere le rideau
              // (invisible), APRES world.clear() (deja fait plus haut) mais
              // AVANT que le joueur ne voie l'ecran de fin de vague/la
              // boutique. waveBeingFought = la vague REELLEMENT gagnee.
              await applyMapExpansionForCompletedWave(waveBeingFought);
              talentPointToast.show(metaProgress.talentPoints - talentPointsBefore);
              const result: WaveResult = playerAlive > 0 ? 'victoire' : 'defaite';
              screens.showWaveComplete(waveBeingFought, result, runesEarnedThisBattle);
            }
          });
        }
      }
    }

    // Un trait qui vient d'atterrir sans toucher personne merite le meme
    // retour visuel qu'un coup rate ordinaire : sans ce texte, un tir mal
    // vise ne se distinguerait pas d'un tir qui a simplement touche dans le
    // vide sans consequence visible.
    // 2026-08-14 : world.playerArrowEvents est desormais un TABLEAU (0 a N,
    // talent "Mitraillette" peut faire resoudre plusieurs carreaux le meme
    // tick) — boucle plutot qu'un seul evenement, meme traitement par
    // carreau qu'avant.
    for (const event of world.playerArrowEvents) {
      if (event.hit) {
        // Meme flash que le combat automatique (voir plus haut) — ici la
        // resolution EST au moment de l'arrivee visuelle du trait
        // (stepPlayerArrow attend la fin du vol simule), donc pas de
        // decalage a corriger contrairement au combat automatique.
        playHitFlash(event.targetId);
      } else {
        combatOverlay.spawnMissText(event.x, event.z);
      }
    }
  },
  (alpha) => {
    const now = performance.now();
    const realDt = (now - lastRealTime) / 1000;
    lastRealTime = now;

    // Bug corrige (2026-08-16, remonte par Antoine : "le bon montant de gold
    // ne s'affiche pas dans mon encart" apres une vente) : cet appel vivait
    // auparavant dans le callback onStep (pas de simulation FIXE, voir
    // core/loop.ts) — or `onStep` ne s'execute QUE si `loop.timeScale > 0`
    // (l'accumulateur n'avance jamais a `timeScale === 0`). La bataille pose
    // `loop.timeScale = 0` des qu'un camp est elimine et ne le remet a 1 qu'a
    // la VALIDATION du placement suivant — donc pendant TOUTE la sequence
    // boutique + phase de placement (exactement le moment ou l'on vend/achete
    // des unites), goldHud n'etait plus jamais rafraichi : le HUD restait
    // fige sur sa derniere valeur d'avant la fin de bataille. Deplace ici,
    // dans le callback de RENDU (tourne a chaque frame, quel que soit
    // `timeScale` — voir Loop.frame, onRender toujours appele) : lit
    // `currentRun.gold` INCONDITIONNELLEMENT, comme documente a l'origine
    // (CLAUDE.md, "mis a jour a chaque frame depuis currentRun.gold, pas sur
    // evenement") — plus aucun site d'appel a se souvenir d'ajouter apres un
    // achat/une vente.
    goldHud.update(currentRun.gold);

    // Batiments gameplay (Mine, Baliste) EXCLUS des systemes de rendu qui
    // supposent une vraie unite (getUnit(entity.unitId), voir data/units.ts)
    // — 2026-08-16, bug reel trouve en testant : UnitViews.sync appelle
    // buildUnit()/getUnit() pour toute entite qu'elle n'a encore jamais vue,
    // ce qui levait "Unite inconnue : ballista" en boucle des la premiere
    // bataille reelle. Calcule UNE FOIS par frame, reutilise par
    // combatOverlay.sync plus bas (voir render/buildingView.ts +
    // combatOverlay.syncBuildings pour le rendu/les PV des batiments,
    // gere separement).
    const nonBuildingEntities = world.entities.filter((e) => !e.isBuilding);

    // simulationFrozen (2026-08-13, correctif "les jambes continuent de
    // marcher dans le vide" a la victoire/defaite) : loop.timeScale === 0
    // couvre a la fois la pause manuelle (Echap) et le rideau de transition
    // de fin de vague (voir waveTransition.play, qui pose timeScale=0 avant
    // meme de jouer sa sequence) — les deux figent world.step() sans figer
    // ce rendu (realDt continu), voir UnitViews.sync pour le detail du bug.
    unitViews.sync(nonBuildingEntities, alpha, realDt, loop.timeScale === 0);

    // Selection RTS (prototype) : APRES unitViews.sync pour suivre la position
    // rendue de ce frame. Hors bataille en cours, aucune selection ne survit
    // (fin de vague, placement, menu, editeur). Une entite morte ou disparue
    // apres world.clear() est abandonnee par sync() lui-meme.
    if (inBattlePhase()) battleSelection.sync((id) => world.getById(id), (id) => unitViews.getPosition(id));
    else battleSelection.clear();
    battleModeIndicator.update(inBattlePhase() && !pauseMenuOpen, battleControlMode);

    // Fait avancer les fleches en attente de depart (voir pendingArrowSpawns) :
    // temps REEL, independant de la simulation — une fleche part des que son
    // delai cosmetique s'ecoule, meme si la bataille est mise en pause entre
    // temps (coherent avec le reste du rendu, deja pilote par realDt).
    // APRES unitViews.sync (2026-08-11, correctif "le projectile ne part pas
    // de l'archer, il part un metre devant") : l'origine reelle vient
    // desormais de la main qui tient la corde (RightHand, voir
    // UnitViews.getBoneWorldPosition/archerRig.ts) au lieu du centre
    // approximatif de l'unite — ca suppose que la pose de CE frame (mixer +
    // correction de visee) a deja ete calculee, donc sync() doit tourner
    // avant cette boucle, pas apres comme precedemment.
    for (let i = pendingArrowSpawns.length - 1; i >= 0; i--) {
      const pending = pendingArrowSpawns[i]!;
      pending.elapsed += realDt;
      if (pending.elapsed < pending.delay) continue;
      const hand = unitViews.getBoneWorldPosition(pending.attackerId, 'RightHand');
      const fromX = hand?.x ?? pending.x;
      const fromZ = hand?.z ?? pending.z;
      // Vise la position ACTUELLE de la cible au moment ou la fleche part
      // vraiment, pas celle capturee ~1.2s plus tot a la resolution du
      // combat (2026-08-13, correctif "les archers ratent presque toujours
      // leur cible") — l'entite n'est jamais retiree de world.entities
      // (morte = alive:false, position figee a l'endroit ou elle est
      // tombee), donc ce lookup reste valable meme sur une cible deja morte ;
      // repli sur la position capturee UNIQUEMENT pour un tir bloque
      // (targetId null, point d'impact fixe sur un obstacle).
      const liveTarget = pending.targetId !== null ? world.getById(pending.targetId) : undefined;
      const toX = liveTarget?.x ?? pending.targetX;
      const toZ = liveTarget?.z ?? pending.targetZ;
      projectiles.spawn(fromX, fromZ, toX, toZ, ARCHER_PROJECTILE_DURATION, pending.team, pending.targetId);
      pendingArrowSpawns.splice(i, 1);
    }

    // Suit la cible en vol (2026-08-14, voir render/projectiles.ts) — position
    // idealement INTERPOLEE (unitViews.getPosition), meme convention que le
    // reste du rendu (combatOverlay, indicateurs de givre...), avec repli sur
    // la position brute de simulation si l'unite riggee n'a pas de vue.
    projectiles.sync(realDt, (id) => {
      const entity = world.getById(id);
      if (!entity) return undefined;
      return unitViews.getPosition(id) ?? { x: entity.x, z: entity.z };
    });
    playerArrowView.sync(world.playerArrow.flights, alpha);
    telegraphView.sync(world.entities);
    fireballView.sync(world.blasts, realDt);
    shadowProjectileView.sync(world.shadowProjectiles, realDt);
    iceNovaView.sync(world.iceNovaZones, realDt);
    // Cristaux de glace aux pieds des unites immobilisees (2026-08-14,
    // demande d'Antoine) — meme resolution de position que combatOverlay
    // (interpolee si disponible), pour suivre l'unite meme si elle est
    // bousculee par la separation pendant qu'elle est rootee.
    iceNovaView.syncFrostIndicators(world.entities, (e) => unitViews.getPosition(e.id) ?? { x: e.x, z: e.z });
    // VFX du parchemin de soin (2026-08-14) — voir render/healVfx.ts.
    healVfxView.sync(realDt);
    // VFX de Provocation (Sentinelle, 2026-08-14) — voir render/tauntVfx.ts.
    // Meme resolution de position que les cristaux de givre ci-dessus, pour
    // que l'indicateur au-dessus d'une unite provoquee la suive meme si
    // elle est bousculee par la separation.
    tauntVfxView.sync(realDt);
    tauntVfxView.syncTauntIndicators(world.entities, (e) => unitViews.getPosition(e.id) ?? { x: e.x, z: e.z });
    // Le rendu doit avoir lieu avant la projection ecran de la barre de PV :
    // c'est ce qui met a jour la matrice de la camera pour CE frame. Sinon,
    // pendant qu'on bouge la camera, la barre se projette avec la matrice du
    // frame precedent et se decale visiblement de l'unite.
    renderer.render();
    // Batiments gameplay (Mine, Baliste) EXCLUS de sync() : cette methode
    // suppose une vraie unite (getUnit(entity.unitId) pour hpBarHeight) —
    // voir syncBuildings juste en dessous, qui prend radius/hpBarHeight
    // directement depuis BuildingDef. Reutilise nonBuildingEntities (deja
    // filtre plus haut pour UnitViews.sync), pas un second filtre.
    combatOverlay.sync(nonBuildingEntities, (e) => unitViews.getPosition(e.id) ?? { x: e.x, z: e.z });
    // Batiments gameplay (2026-08-17, generalise depuis l'ancien couple
    // Mine/Baliste code en dur) : un seul point de dispatch sur
    // buildingViewsByEntityId, quel que soit le nombre reel de Mines/
    // Casernes possedees par le joueur ce combat-la. playDestroy() est
    // idempotent (BuildingView.destroyed), donc l'appeler chaque frame pour
    // une Entity deja morte ne rejoue jamais le VFX de destruction.
    {
      const buildings: { entity: Entity; radius: number; hpBarHeight: number }[] = [];
      for (const [entityId, view] of buildingViewsByEntityId) {
        const entity = world.getById(entityId);
        if (!entity) continue;
        const def = getBuilding(entity.unitId);
        // TOUJOURS pousser l'entite, morte ou vivante (correctif 2026-08-17,
        // "sa barre de vie vide reste affichee") : syncBuildings gere deja
        // elle-meme le cas !entity.alive (masque la barre, meme mecanisme
        // que sync() pour les unites) — mais seulement pour une entite qui
        // lui est REELLEMENT passee. Filtrer les mortes ICI les excluait de
        // ce garde-fou, laissant leur barre figee a son dernier etat affiche
        // (quasi vide juste avant la mort) pour toujours, jamais masquee.
        buildings.push({ entity, radius: def.radius, hpBarHeight: def.hpBarHeight });
        view.tick(realDt);
        if (!entity.alive) view.playDestroy();
      }
      combatOverlay.syncBuildings(buildings, (e) => ({ x: e.x, z: e.z }));
    }
    // Barres de PV pendant le placement (demande d'Antoine, 2026-08-09) : le
    // joueur doit voir l'etat de sante de son armee avant de valider, pas
    // seulement pendant la bataille.
    if (inPlacementPhase) {
      const placedSlots = placementSlots.filter(
        (s): s is PlacementSlot & { x: number; z: number } => s.x !== null && s.z !== null,
      );
      combatOverlay.syncPlacement(placedSlots, (unitId) => effectivePlayerUnitMaxHp(unitId, metaProgress));
      // Aura de particules du talent "Recyclage" (2026-08-14) — voir
      // render/recyclageAura.ts. `key` = index REEL dans placementSlots (pas
      // dans placedSlots, filtre a part) pour rester stable avec le reste du
      // code de placement, qui aligne deja tout par index.
      recyclageAuraView.sync(
        placementSlots
          .map((slot, key) => ({ slot, key }))
          .filter(({ slot }) => slot.x !== null && slot.z !== null && isRecyclageEligible(slot))
          .map(({ slot, key }) => ({ key, x: slot.x!, z: slot.z! })),
        realDt,
      );
    } else {
      // Hors placement (bataille, menus...) : vide l'ensemble au frame
      // suivant, sans site de nettoyage separe a maintenir a chaque
      // transition de phase.
      recyclageAuraView.sync([], realDt);
    }
    debugPanel.update(realDt);

    const inBattle = inBattlePhase();
    // Prototype RTS : en mode Commandement, le clic gauche ne tire plus — le
    // reticule et l'orientation de la Baliste vers le curseur sont suspendus.
    // En mode Baliste, comportement identique a avant.
    const aiming = inBattle && battleControlMode === 'ballista';
    aimReticle.visible = aiming;
    if (aiming) {
      aimReticle.position.x = playerAimX;
      aimReticle.position.z = playerAimZ;
      const ready = world.playerArrow.cooldown <= 0 && world.playerArrow.flights.length === 0;
      (aimReticle.material as THREE.MeshBasicMaterial).opacity = ready ? 0.9 : 0.35;

      // La baliste suit le curseur en continu pendant la bataille, meme
      // convention de cap que le reste du rendu (voir UnitViews.computeFacing) :
      // l'unite locale -Z est "l'avant", donc atan2(-dx, -dz) regarde vers
      // (playerAimX, playerAimZ).
      const dx = playerAimX - playerArrowOrigin.x;
      const dz = playerAimZ - playerArrowOrigin.z;
      if (Math.hypot(dx, dz) > 1e-4) ballista.rotation.y = Math.atan2(-dx, -dz);
    }
    arrowCooldown.setVisible(inBattle);
    arrowCooldown.update(world.playerArrow.cooldown);
    // Anime le modele de la baliste (2026-08-13, FBX riggé) — temps REEL,
    // comme le reste des animations cosmetiques (UnitViews, Projectiles) ;
    // inconditionnel (pas seulement pendant `aiming`) pour laisser le clip
    // "apres-tir" se terminer proprement meme si le joueur a cesse de viser
    // juste apres avoir tire.
    tickBallista(ballista, realDt);
  },
);

const debugPanel = new DebugPanel(loop, world, renderer);

// --- Pause (Echap) ------------------------------------------------------
//
// Demande d'Antoine : pouvoir mettre la bataille en cours en pause via Echap
// (menu avec un bouton Continuer), et pouvoir Quitter pour revenir au menu
// principal — l'etat "au lancement du jeu", d'ou "Jouer" repart directement
// a la vague 1 puisqu'il n'existe pas encore de sauvegarde de run entre deux
// vagues (voir CLAUDE.md, boutique/talents encore des stubs).

let pauseMenuOpen = false;

/** Contexte de retour de l'ecran Parametres (2026-08-12) — fixe par
 *  onOpenSettingsFromMenu/onOpenSettingsFromPause juste avant d'afficher
 *  l'ecran, lu par onCloseSettings ET par le routage Echap ci-dessous. */
let settingsReturnTo: 'menu' | 'pause' = 'menu';

/** Fonctionne aussi PENDANT LE PLACEMENT (2026-08-10, demande d'Antoine —
 *  Echap ne faisait rien avant la validation du placement, aucune facon
 *  d'abandonner la run sans recharger la page). `sellZone`/`placementPanel`
 *  sont explicitement masques : leur conteneur a un z-index volontairement
 *  SUPERIEUR a .screen-overlay (voir ui/style.css, pour rester cliquable
 *  quand la BOUTIQUE est ouverte par-dessus le placement) — sans ce
 *  masquage explicite, "Vendre"/"Pret pour la bataille" resteraient visibles
 *  et cliquables par-dessus le menu pause. `inventoryBar` n'a pas ce
 *  probleme (z-index plus bas que .screen-overlay, deja correctement
 *  recouverte). loop.timeScale=0 est sans effet reel en placement (aucune
 *  simulation ne tourne), inoffensif. */
function openPauseMenu(): void {
  if (inEditorMode || pauseMenuOpen || (!inBattlePhase() && !inPlacementPhase)) return;
  pauseMenuOpen = true;
  loop.timeScale = 0;
  fireButtonHeld = false;
  if (inPlacementPhase) {
    sellZone.setVisible(false);
    placementPanel.hide();
  }
  screens.show('pause');
}

function resumeFromPause(): void {
  pauseMenuOpen = false;
  screens.hideAll();
  loop.timeScale = 1;
  if (inPlacementPhase) {
    sellZone.setVisible(true);
    placementPanel.show();
  }
}

/** Garde-fou d'idempotence (2026-08-16, demande explicite d'Antoine, point
 *  5 : "evite qu'un double clic puisse appeler plusieurs fois la
 *  destruction de la run / navigation") pour confirmQuitRun ci-dessous —
 *  remis a false a chaque nouvelle demande de confirmation (requestQuitRun),
 *  pas seulement une fois pour toute la session, pour qu'une future run
 *  puisse a nouveau declencher une confirmation normalement. */
let quitRunConfirmationInFlight = false;

/** Bouton "Quitter" du menu Pause (2026-08-16, demande d'Antoine : "une
 *  vraie confirmation avant de quitter une run en cours") — ouvre la
 *  confirmation au lieu d'appeler quitToMenu directement. Le menu Pause
 *  n'etant accessible QUE depuis une bataille/un placement en cours (voir
 *  openPauseMenu), ce bouton represente toujours "quitter une run en
 *  cours" : aucune verification de contexte supplementaire necessaire (le
 *  menu principal/l'arbre de talents/la boutique d'amelioration n'ont pas ce
 *  bouton, voir point 6 de la demande). */
function requestQuitRun(): void {
  quitRunConfirmationInFlight = false;
  screens.showQuitRunConfirm();
}

/** "Annuler" de la confirmation — retourne au menu PAUSE (pas une reprise du
 *  jeu, point 7 de la demande explicite : la partie doit rester en pause
 *  jusqu'a un vrai clic sur "Continuer"). `loop.timeScale`/`pauseMenuOpen`
 *  restent inchanges tout du long (deja poses par openPauseMenu avant que
 *  cette confirmation n'ait jamais pu s'ouvrir) — rien a re-appliquer ici. */
function cancelQuitRun(): void {
  screens.show('pause');
}

/** "Quitter" (rouge) de la confirmation — appelle reellement quitToMenu.
 *  Garde par quitRunConfirmationInFlight : un double-clic sur ce bouton (ou
 *  un Entree qui suivrait un premier clic avant que l'ecran ne change)
 *  n'appelle jamais quitToMenu une seconde fois. */
function confirmQuitRun(): void {
  if (quitRunConfirmationInFlight) return;
  quitRunConfirmationInFlight = true;
  quitToMenu();
}

function quitToMenu(): void {
  pauseMenuOpen = false;
  inPlacementPhase = false;
  placementPanel.hide();
  sellZone.setVisible(false);
  inventoryBar.setVisible(false);
  disarmItem();
  cancelBuildingPlacement();
  fireButtonHeld = false;
  cancelUnitDrag();
  cancelGroundDrag();
  clearSelection();
  // L'occupation de la run abandonnee ne doit pas survivre au retour menu.
  placementSlots = [];
  playerPreview.clear();
  enemyPreview.clear();
  world.clear();
  rewardedEnemyDeaths.clear();
  belowAutoHealThreshold.clear();
  mineIncomeAccumulator = 0;
  pendingArrowSpawns.length = 0;
  unitViews.clear();
  combatOverlay.clear();
  projectiles.clear();
  playerArrowView.clear();
  telegraphView.clear();
  fireballView.clear();
  iceNovaView.clear();
  healVfxView.clear();
  tauntVfxView.clear();
  shadowProjectileView.clear();
  battleOver = false;
  loop.timeScale = 1;
  board.gridLines.visible = false;
  board.zones.visible = false;
  waveIndicator.setVisible(false);
  goldHud.setVisible(false);
  screens.show('menu');
}

/** Soigne l'unite la plus blessee de l'armee (en proportion de ses PV max) —
 *  pas de selection manuelle pour cette premiere version de la boutique, un
 *  seul bouton "Soigner" suffit tant qu'il n'y a pas d'interface pour choisir
 *  une unite precise. Retourne false si personne n'est blesse (l'appelant ne
 *  doit alors pas debiter d'or — le bouton est normalement deja desactive
 *  dans ce cas, voir Screens.refreshShop, mais ne pas en dependre ici). */
/** Cherche une case libre pour une nouvelle unite en partant d'une position
 *  preferee et en elargissant case par case (anneaux concentriques) —
 *  necessaire car la position "ideale" (voir addUnitToPlacement) est
 *  calculee comme si toute l'armee etait reformee a neuf, sans savoir que
 *  les unites deja posees n'ont PAS bouge : elle peut tomber exactement sur
 *  une unite existante (bug remonte par Antoine — deux unites ne peuvent
 *  jamais partager une case). isValidPlacementTile verifie contre les
 *  positions REELLES actuelles (placementSlots), pas la formation theorique. */
function findFreePlacementTile(unitId: string, preferredX: number, preferredZ: number): { x: number; z: number } {
  if (isValidPlacementForUnit(unitId, preferredX, preferredZ, [])) return { x: preferredX, z: preferredZ };

  for (let radius = 1; radius < 50; radius++) {
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dz = -radius; dz <= radius; dz++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== radius) continue; // anneau exterieur seulement
        const x = preferredX + dx;
        const z = preferredZ + dz;
        if (isValidPlacementForUnit(unitId, x, z, [])) return { x, z };
      }
    }
  }
  return { x: preferredX, z: preferredZ }; // repli improbable (zone saturee)
}

/** Ajoute une unite fraichement achetee a LA phase de placement en cours
 *  (demande d'Antoine, 2026-08-09 : achetee en placement, elle doit pouvoir
 *  etre utilisee tout de suite, pas seulement a la prochaine vague — la
 *  bataille en cours n'a pas encore commence, il n'y a pas de raison de la
 *  lui refuser). Position par defaut calculee comme si l'armee entiere etait
 *  reformee (voir computeArmyFormation), mais seule la nouvelle unite est
 *  effectivement ajoutee — les autres, deja potentiellement deplacees a la
 *  main par le joueur, restent intactes, d'ou findFreePlacementTile pour
 *  eviter de tomber pile sur l'une d'elles. */
function addUnitToPlacement(unitId: string, hp: number): void {
  const unitIds = [...placementSlots.map((s) => s.unitId), unitId];
  const formation = computeArmyFormation(unitIds, currentMap);
  const preferred = formation[formation.length - 1]!;
  const pos = findFreePlacementTile(unitId, preferred.x, preferred.z);
  placementSlots.push({ unitId, x: pos.x, z: pos.z, hp });
  refreshPlayerPreview();
}

/** Achete une unite (Fantassin/Archer/Mage/Sentinelle...) en boutique de
 *  run — partage par tous les handlers onBuy* (voir ScreenHandlers). Ne fait
 *  rien si l'or est insuffisant OU si l'unite est encore verrouillee
 *  (2026-08-15, systeme GENERIQUE — voir data/units.ts, playerUnlockMode et
 *  run/metaProgress.ts, canPlayerRecruitUnit ; garde-fou en plus du bouton
 *  masque cote UI, jamais la seule protection, aucun `if unitId === '...'`
 *  ici). Retient l'achat dans `lastUnitPurchase` pour le bouton "Annuler le
 *  dernier achat" (voir undoLastUnitPurchase). */
function buyUnit(unitId: string): void {
  if (!canPlayerRecruitUnit(metaProgress, unitId)) return;
  const cost = effectivePlayerUnitCost(unitId, metaProgress);
  if (currentRun.gold < cost) return;
  // Math.max(0, ...) : filet de securite defensif contre tout bruit de
  // virgule flottante residuel (2026-08-14, bug remonte par Antoine : "il
  // est possible de déclencher un résultat négatif") — rend un solde
  // negatif mathematiquement IMPOSSIBLE ici, pas seulement improbable,
  // meme si le garde-fou `gold < cost` ci-dessus est deja cense l'empecher
  // dans le cas normal.
  currentRun.gold = Math.max(0, roundGold(currentRun.gold - cost));
  const hp = effectivePlayerUnitMaxHp(unitId, metaProgress);
  currentRun.army.push({ unitId, hp });
  if (inPlacementPhase) addUnitToPlacement(unitId, hp);
  lastUnitPurchase = { unitId, cost };
  screens.refreshShop(currentRun, metaProgress, lastUnitPurchase !== null);
  spawnCoinPopup(screens.shopGoldElement, -cost);
}

/** Bouton "×5" (2026-08-13, demande d'Antoine : "plus confortable pour
 *  acheter plusieurs unités") — achete jusqu'a 5 exemplaires DE SUITE, en
 *  reutilisant buyUnit() tel quel (chaque appel verifie deja l'or/le
 *  verrouillage) : s'arrete tout seul des que l'un des 5 echoue, achetant
 *  donc "jusqu'a 5" plutot que "5 ou rien" — plus tolerant qu'un
 *  tout-ou-rien si le joueur n'a l'or que pour 2 ou 3. `lastUnitPurchase`
 *  finit sur le DERNIER des achats reussis (un seul niveau d'annulation,
 *  comme un achat simple — annuler les 5 d'un coup n'est pas demande). */
function buyUnitFive(unitId: string): void {
  for (let i = 0; i < 5; i++) buyUnit(unitId);
}

/** Annule le dernier achat d'unite fait en boutique de run (2026-08-13,
 *  demande d'Antoine : "un bouton retour dans la boutique au cas où une
 *  unité ait été achetée par hasard") — rembourse EXACTEMENT le cout paye
 *  (voir lastUnitPurchase, capture au moment de l'achat : le cout effectif
 *  peut varier avec le niveau d'amelioration permanente, mais celui-ci n'est
 *  modifiable que depuis le menu titre, jamais en cours de run — la valeur
 *  figee reste donc toujours exacte), retire l'unite de currentRun.army ET
 *  de placementSlots si le placement est en cours (meme invariant que
 *  sellUnits : les deux tableaux restent alignes par index, l'achat etant
 *  TOUJOURS pousse en DERNIERE position des deux cotes). Ne fait rien si
 *  rien n'est a annuler (voir lastUnitPurchase, remis a null a chaque
 *  nouvelle phase de placement et a chaque vente). */
/** Achete `quantity` exemplaires DE SUITE d'un consommable (Parchemin de
 *  soin/Nova de glace...) en boutique de RUN (2026-08-15, chantier polish/
 *  equilibrage, demande explicite d'Antoine : "ACHAT x5", ATOMIQUE — jamais
 *  un achat partiel silencieux de 2 ou 3 sur 5). Contrairement a
 *  `buyUnitFive` (qui tolere un arret en cours de route, unite par unite),
 *  celui-ci verifie le cout TOTAL (prix EFFECTIF unitaire x quantite,
 *  `effectiveCost` deja calcule AVANT la multiplication — jamais
 *  `baseCost*quantity + bonusUneFois`) ET la capacite d'inventaire pour
 *  TOUTE la quantite d'un coup, AVANT la moindre mutation — refuse purement
 *  et simplement si l'un des deux manque, sans rien acheter du tout.
 *  `effectiveCost` est la MEME fonction que celle utilisee pour l'affichage
 *  du prix (ui/screens.ts, refreshShop) — source de verite unique. */
function buyConsumable(itemId: string, quantity: number, effectiveCost: (progress: MetaProgress) => number): void {
  const unitPrice = effectiveCost(metaProgress);
  const totalCost = roundGold(unitPrice * quantity);
  if (currentRun.gold < totalCost) return;
  if (!canAddItemsToInventory(currentRun.inventory, itemId, quantity)) return;

  currentRun.gold = Math.max(0, roundGold(currentRun.gold - totalCost));
  for (let i = 0; i < quantity; i++) currentRun.inventory.push({ itemId });
  screens.refreshShop(currentRun, metaProgress, lastUnitPurchase !== null);
  inventoryBar.refresh(currentRun.inventory);
  spawnCoinPopup(screens.shopGoldElement, -totalCost);
}

function undoLastUnitPurchase(): void {
  const purchase = lastUnitPurchase;
  if (!purchase) return;
  lastUnitPurchase = null;

  currentRun.army.pop();
  if (inPlacementPhase) placementSlots.pop();
  currentRun.gold = roundGold(currentRun.gold + purchase.cost);

  selectedIndices = selectedIndices.filter((i) => i < placementSlots.length);

  refreshPlayerPreview();
  screens.refreshShop(currentRun, metaProgress, lastUnitPurchase !== null);
  spawnCoinPopup(screens.shopGoldElement, purchase.cost);
}

const screens = new Screens({
  onPlay: startNewRun,
  onOpenTalents: () => screens.showTalents(metaProgress),
  onCloseTalents: () => screens.show('menu'),
  onUnlockTalent: (id) => {
    if (unlockTalent(metaProgress, id)) {
      saveMetaProgress(metaProgress);
      screens.refreshTalents(metaProgress);
    }
  },
  // Boutique d'AMELIORATION PERMANENTE des unites (2026-08-13, demande
  // d'Antoine) — accessible UNIQUEMENT depuis le menu titre, DISTINCTE de la
  // boutique de run et de l'arbre de talents (voir CLAUDE.md). Meme motif
  // que onUnlockTalent : le handler verifie/mute lui-meme via
  // purchaseUnitUpgrade (canPurchaseUnitUpgrade en interne), sauvegarde
  // IMMEDIATEMENT si l'achat a reussi (point 11.4 de la demande), puis
  // rafraichit l'ecran.
  onOpenUnitUpgradeShop: () => screens.showUnitUpgradeShop(metaProgress),
  onCloseUnitUpgradeShop: () => screens.show('menu'),
  // Dispatch GENERIQUE par id (2026-08-13, extension Baliste/Parchemin de
  // soin ; 2026-08-14, extension Nova de glace) : `getUnitUpgradeDef` couvre
  // Fantassin/Archer/Mage, BALLISTA_UPGRADE/HEAL_SCROLL_UPGRADE/
  // ICE_NOVA_UPGRADE couvrent les 3 autres ameliorations — un SEUL point
  // d'achat generique (purchaseUpgrade, run/metaProgress.ts) pour les 6,
  // jamais un if par id disperse. Runes insuffisantes : purchaseUpgrade ne
  // fait rien (point 11 de la demande initiale, "si non : ne rien acheter")
  // — aucun feedback sonore/visuel dedie (systeme audio globalement
  // desactive, voir CLAUDE.md), le bouton reste simplement desactive
  // (refreshUnitUpgradeShop) des que les runes ne suffisent plus, ce qui
  // empeche deja concretement ce cas via un clic normal.
  onPurchaseUnitUpgrade: (id) => {
    const costDef =
      getUnitUpgradeDef(id) ??
      (id === BALLISTA_UPGRADE.id
        ? BALLISTA_UPGRADE
        : id === HEAL_SCROLL_UPGRADE.id
          ? HEAL_SCROLL_UPGRADE
          : id === ICE_NOVA_UPGRADE.id
            ? ICE_NOVA_UPGRADE
            : id === MINE_UPGRADE.id
              ? MINE_UPGRADE
              : id === SENTINEL_UPGRADE.id
                ? SENTINEL_UPGRADE
                : id === SHADOW_UPGRADE.id
                  ? SHADOW_UPGRADE
                  : id === BARRACKS_UPGRADE.id
                    ? BARRACKS_UPGRADE
                    : undefined);
    if (costDef && purchaseUpgrade(metaProgress, id, costDef)) {
      saveMetaProgress(metaProgress);
      screens.refreshUnitUpgradeShop(metaProgress);
    }
  },
  // Reset des talents (2026-08-11, demande d'Antoine : "rajoute également
  // une option reset point de talent") — rembourse les points depenses
  // (respec), ne touche a rien d'autre. Sauvegarde IMMEDIATE, meme motif
  // qu'un achat de talent.
  onRequestResetTalents: () => screens.show('resetTalentsConfirm'),
  onCancelResetTalents: () => screens.showTalents(metaProgress),
  onConfirmResetTalents: () => {
    resetTalentPoints(metaProgress);
    saveMetaProgress(metaProgress);
    screens.showTalents(metaProgress);
  },
  // Bouton de DEBUG (2026-08-14, demande explicite d'Antoine : "rajoute moi
  // un bouton pour m'auto attribuer un point de talent... ce bouton sera
  // retiré, c'est juste pour tester les talents") — accorde 1 point
  // IMMEDIATEMENT, sans passer par une run/un palier de vague, meme motif
  // de sauvegarde immediate qu'un achat de talent. A RETIRER (ce handler,
  // le bouton dans ui/screens.ts, et le style .talent-debug-button) une
  // fois les tests termines.
  onDebugGrantTalentPoint: () => {
    metaProgress.talentPoints += 1;
    saveMetaProgress(metaProgress);
    screens.refreshTalents(metaProgress);
  },
  // Bouton de DEBUG "+100 or" (2026-08-17, demande explicite d'Antoine :
  // "ce bouton sera retiré plus tard") — n'a de sens que pendant une run
  // (currentRun.gold), jamais sauvegarde de facon permanente (contrairement
  // au point de talent ci-dessus). A RETIRER (ce handler, le bouton dans
  // ui/screens.ts, et le style .shop-debug-button) une fois les tests
  // termines.
  onDebugAddGold: () => {
    currentRun.gold = roundGold(currentRun.gold + 100);
    screens.refreshShop(currentRun, metaProgress, lastUnitPurchase !== null);
  },
  // La boutique n'est plus un ecran intermediaire separe : "Continuer" sur
  // l'annonce de fin de vague mene directement au placement, qui ouvre lui
  // meme la boutique automatiquement (voir startPlacement).
  onContinueAfterWave: () => startPlacement(),
  // Toujours ouverte PAR-DESSUS un placement deja en cours desormais (voir
  // openShopFromPlacement) : la refermer ne fait jamais plus que revenir a ce
  // placement, jamais recommencer startPlacement() depuis zero.
  onContinueAfterShop: () => screens.hideAll(),
  onOpenEditor: () => enterEditor(),
  onResume: resumeFromPause,
  onQuit: quitToMenu,
  onRequestQuitRun: requestQuitRun,
  onCancelQuitRun: cancelQuitRun,
  onConfirmQuitRun: confirmQuitRun,
  // Cout EN OR desormais EFFECTIF (2026-08-13, boutique d'amelioration
  // permanente — voir run/unitUpgradeEffects.ts, effectivePlayerUnitCost) :
  // baseCost + goldCostBonus (chaque palier d'attaque achete en runes
  // renchérit le recrutement de cette unite pendant les runs, point 16/22/23
  // de la demande d'Antoine). `hp` (PV de depart de l'OwnedUnit) lit de meme
  // le maxHp EFFECTIF (base + bonus PV permanent) — sans ca, une unite tout
  // juste achetee apparaitrait avec plus de PV MAX (statOverrides) mais pas
  // plus de PV ACTUELS, un ecart illogique pour une unite jamais blessee.
  // Les 3 handlers partagent desormais buyUnit() (voir plus bas) — extrait
  // en meme temps que l'ajout de lastUnitPurchase (2026-08-13, "bouton
  // retour... au cas où une unité ait été achetée par hasard").
  onBuyFantassin: () => buyUnit('fantassin'),
  onBuyArcher: () => buyUnit('archer'),
  onBuyMage: () => buyUnit('mage'),
  onBuySentinel: () => buyUnit('sentinel'),
  onBuyFive: buyUnitFive,
  onUndoLastUnitPurchase: undoLastUnitPurchase,
  // Consommables (2026-08-15, chantier polish/equilibrage) : x1 ET x5
  // partagent desormais TOUS LES DEUX buyConsumable (voir plus haut) — plus
  // aucune logique d'achat dupliquee, prix EFFECTIF (base + bonus
  // d'amelioration permanente) lu depuis la MEME fonction que celle affichee
  // par le bouton (ui/screens.ts, refreshShop).
  onBuyHealScroll: () => buyConsumable('heal_scroll_minor', 1, effectiveHealScrollCost),
  onBuyIceNova: () => buyConsumable('ice_nova', 1, effectiveIceNovaCost),
  onBuyItemFive: (itemId) => {
    const effectiveCost = itemId === 'heal_scroll_minor' ? effectiveHealScrollCost : effectiveIceNovaCost;
    buyConsumable(itemId, 5, effectiveCost);
  },
  // Batiments (2026-08-17) : le clic n'achete rien, il ARME le mode de
  // placement — voir requestPlaceBuilding, l'or n'est deduit qu'a la
  // confirmation d'une case valide (confirmBuildingPlacement).
  onRequestPlaceBuilding: (buildingId) => requestPlaceBuilding(buildingId),
  onRequestResetSave: () => screens.show('resetConfirm'),
  onCancelResetSave: () => screens.show('menu'),
  onConfirmResetSave: () => {
    resetMetaProgress(metaProgress);
    screens.show('menu');
  },
  onConfirmPlacementWithGold: () => {
    screens.hideAll();
    onValidatePlacement();
  },
  onCancelPlacementGoldWarning: () => screens.hideAll(),
  // Ecran Parametres (2026-08-12) — voir settingsReturnTo, plus bas, pour le
  // routage Echap/"Retour" selon le contexte d'ouverture.
  onOpenSettingsFromMenu: () => {
    settingsReturnTo = 'menu';
    screens.showSettings(audio.getSettings());
  },
  onOpenSettingsFromPause: () => {
    settingsReturnTo = 'pause';
    screens.showSettings(audio.getSettings());
  },
  onCloseSettings: () => screens.show(settingsReturnTo === 'pause' ? 'pause' : 'menu'),
  onSetMasterVolume: (v) => {
    audio.setMasterVolume(v);
    persistAudioSettings(audio);
  },
  onSetMusicVolume: (v) => {
    audio.setMusicVolume(v);
    persistAudioSettings(audio);
  },
  onSetSfxVolume: (v) => {
    audio.setSfxVolume(v);
    persistAudioSettings(audio);
  },
  onSetMuted: (m) => {
    audio.setMuted(m);
    persistAudioSettings(audio);
  },
}, {
  click: () => audio.play('ui.click'),
  hover: () => audio.play('ui.hover'),
});

const placementPanel = new PlacementPanel({
  onValidate: requestValidatePlacement,
});

const sellZone = new SellZone({ onOpenShop: () => openShopFromPlacement(), onSellSelection: () => sellUnits(selectedIndices) });
const selectionBox = new SelectionBox();
const inventoryBar = new InventoryBar({ onSelectSlot: (i) => armInventorySlot(i) });
const waveTransition = new WaveTransition();
const talentPointToast = new TalentPointToast();
const unitUnlockToast = new UnitUnlockToast();

window.addEventListener('keydown', (event) => {
  // Undo/Redo de l'editeur (2026-08-16, Part U) — Ctrl+Z / Ctrl+Y (et
  // Ctrl+Maj+Z, convention alternative courante), UNIQUEMENT en mode
  // editeur : pas de conflit possible avec le reste du jeu, qui n'a pas de
  // notion d'annulation. Verifie AVANT le switch principal (combinaison de
  // touches, pas une simple touche seule).
  if (inEditorMode && (event.ctrlKey || event.metaKey) && !event.altKey) {
    if (event.key === 'z' || event.key === 'Z') {
      event.preventDefault();
      if (event.shiftKey) editorHistory.redo();
      else editorHistory.undo();
      return;
    }
    if (event.key === 'y' || event.key === 'Y') {
      event.preventDefault();
      editorHistory.redo();
      return;
    }
  }

  switch (event.key) {
    case 'ArrowLeft':
      renderer.adjustYaw(-5);
      break;
    case 'ArrowRight':
      renderer.adjustYaw(5);
      break;
    case 'ArrowUp':
      renderer.adjustPitch(2);
      break;
    case 'ArrowDown':
      renderer.adjustPitch(-2);
      break;
    case 'a':
    case 'A':
      renderer.adjustZoom(-2);
      break;
    case 'e':
    case 'E':
      renderer.adjustZoom(2);
      break;
    case 'r':
    case 'R':
      // En mode editeur, R tourne l'objet selectionne plutot que de
      // reinitialiser la camera (voir CLAUDE.md, conflit identifie des
      // l'etape 2) — la camera reste pilotable normalement par ailleurs.
      if (inEditorMode) {
        editorState?.rotateSelected(Math.PI / 2);
        refreshEditorObjects();
      } else {
        renderer.resetCamera();
      }
      break;
    case ' ':
      // Espace (2026-08-13, demande d'Antoine) : reinitialise la camera,
      // meme action que R hors editeur — Espace n'a aucun autre role dans le
      // jeu depuis le retrait de la pause au clavier (voir CLAUDE.md,
      // "Panneau de debug allege, pause a l'espace retiree"), donc pas de
      // conflit a gerer meme en mode editeur.
      renderer.resetCamera();
      break;
    case 'Delete':
    case 'Backspace':
      if (inEditorMode) {
        editorState?.deleteSelected();
        refreshEditorObjects();
      }
      break;
    case 'Escape':
      if (inTestMode) {
        // Sortie rapide du test, sans passer par le menu pause normal (qui
        // renverrait au menu principal et romprait le cycle editer/tester) —
        // le brouillon reste intact (voir returnToEditorAfterTest).
        returnToEditorAfterTest();
      } else if (inEditorMode && editorState) {
        if (editorState.tool.type !== 'select') {
          editorState.setTool({ type: 'select' });
          clearEditorGhost();
          refreshEditorObjects();
        } else {
          editorState.select(null);
          refreshEditorObjects();
        }
      } else if (armedItemIndex !== null) {
        disarmItem();
      } else if (towerPlacementActive) {
        // Placement OBLIGATOIRE de la tour (2026-08-18, demande explicite,
        // points 19/28) : Echap ne fait RIEN de plus que consommer la
        // touche — pas d'annulation possible (rien à restaurer, aucune
        // tour n'existe encore), pas de progression, le joueur reste dans
        // l'état "tour à placer" jusqu'à un clic sur une case valide.
      } else if (buildingPlacementMode || buildingClickCandidate) {
        // Mode placement d'un BATIMENT achete (2026-08-17, point 10 de la
        // demande : "Escape ou clic droit -> annule le placement, aucun
        // Gold dépensé"). Couvre aussi buildingClickCandidate (2026-08-18) :
        // un clic maintenu sur un bâtiment mais PAS ENCORE promu en glisser
        // (seuil non franchi) — Echap l'annule tout pareil, meme si rien n'a
        // encore visuellement bouge.
        cancelBuildingPlacement();
      } else if (screens.isQuitRunConfirmOpen()) {
        // Echap dans la confirmation "Quitter" (2026-08-16, point 28 de la
        // demande d'Antoine) : toujours equivalent a "Annuler", jamais une
        // reprise du jeu — meme routage prioritaire que Parametres
        // ci-dessous, verifie AVANT pauseMenuOpen (qui reste vrai pendant
        // que cette confirmation est affichee par-dessus le menu Pause).
        cancelQuitRun();
      } else if (screens.isSettingsOpen()) {
        // Ferme Parametres en PREMIER (retour au menu Pause s'il etait
        // ouvert depuis la, jamais une reprise accidentelle du combat — voir
        // CLAUDE.md, demande explicite d'Antoine sur ce point precis).
        screens.show(settingsReturnTo === 'pause' ? 'pause' : 'menu');
      } else if (pauseMenuOpen) {
        resumeFromPause();
      } else {
        openPauseMenu();
      }
      break;
    case 'x':
    case 'X':
      loop.timeScale = loop.timeScale === 2 ? 1 : 2;
      break;
    case 'b':
    case 'B':
      toggleBattleControlMode();
      break;
    case 's':
    case 'S':
      if (!isTypingInField(event.target)) issueStopOrder();
      break;
  }
});

// Camera a la souris : clic droit maintenu pour pivoter/incliner, molette pour
// zoomer. Le clic gauche reste libre pour le placement puis, pendant la
// bataille, le ciblage/tir de la fleche du joueur.
//
// Menu contextuel du navigateur supprime PARTOUT dans l'interface (2026-08-15,
// chantier polish/equilibrage, demande explicite d'Antoine) — pas seulement
// sur le canvas comme avant : `document.body` sert de racine (ce projet n'a
// pas de conteneur `<div id="game-root">` dedie, voir index.html — chaque
// overlay HTML s'attache directement a `document.body`, voir ui/screens.ts et
// consorts), donc un seul listener couvre le menu titre, tous les
// `.screen-panel` (Parametres, Pause, arbre de talents, boutique
// d'amelioration, "Effacer la sauvegarde", boutique de run...), l'inventaire
// ET l'editeur de maps en une seule fois. Intercepte UNIQUEMENT l'evenement
// `contextmenu` (menu du navigateur) — n'a AUCUN effet sur `mousedown`/
// `pointerdown` (event.button === 2), le mecanisme completement independant
// dont depend deja tout le clic droit du JEU lui-meme (pan de camera,
// annulation du ciblage d'un objet arme, clic droit de l'editeur qui annule
// un placement en cours — voir plus bas) : preventDefault() sur contextmenu
// ne bloque jamais la DELIVRANCE d'un autre type d'evenement.
document.body.addEventListener('contextmenu', (event) => event.preventDefault());

let dragging = false;
let lastMouseX = 0;
let lastMouseY = 0;

canvas.addEventListener('mousedown', (event) => {
  if (event.button !== 2) return;
  dragging = true;
  lastMouseX = event.clientX;
  lastMouseY = event.clientY;

  // Clic droit = annule le ciblage d'un objet d'inventaire arme (2026-08-14,
  // demande explicite d'Antoine : "on est obligé de l'utiliser pour retirer
  // le curseur de visée, il faut pouvoir appuyer sur clic droit pour sortir
  // de la visée du parchemin") — meme effet que Echap (disarmItem, ne
  // consomme JAMAIS l'objet), le pan de camera demarre normalement juste
  // apres en plus (les deux ne s'excluent pas).
  const disarmedItem = armedItemIndex !== null;
  if (disarmedItem) disarmItem();

  // Prototype RTS : en mode Commandement, avec une unite selectionnee, ce clic
  // droit devient un ordre de deplacement s'il est relache sans avoir glisse
  // (voir le mousemove camera et le mouseup plus bas). Jamais si ce clic
  // vient de desarmer un objet, ni s'il s'ajoute a un clic gauche (pan).
  pendingRightClickOrder =
    !disarmedItem && !(event.buttons & 1) && battleSelection.selectedEntityId !== null && canIssueRtsOrder()
      ? { startClientX: event.clientX, startClientY: event.clientY }
      : null;

  // Mode placement d'un BATIMENT achete (2026-08-17, demande explicite
  // d'Antoine, point 10 : "Escape ou clic droit -> annule le placement,
  // aucun Gold dépensé") — meme priorite que armedItemIndex ci-dessus.
  // buildingClickCandidate efface INCONDITIONNELLEMENT (2026-08-18) : un
  // clic maintenu sur un bâtiment, PAS ENCORE promu en glisser (seuil non
  // franchi, buildingPlacementMode donc toujours null), ne doit pas non
  // plus survivre a un clic droit — sinon un mousemove ulterieur sans
  // rapport pourrait a tort declencher un deplacement.
  buildingClickCandidate = null;
  if (buildingPlacementMode) cancelBuildingPlacement();

  // Editeur de maps (2026-08-16, demande d'Antoine) : clic droit dans le vide
  // annule d'abord le PLACEMENT en cours ("objet/unité/prop en main"), sinon
  // désélectionne l'objet actuellement sélectionné — même règle, même ordre
  // de priorité que la touche Échap en mode éditeur (voir plus haut, listener
  // clavier) : ne supprime jamais rien, le pan de caméra démarre normalement
  // juste après (les deux gestes ne s'excluent pas, voir armedItemIndex
  // ci-dessus pour le même principe). Le menu contextuel du navigateur est
  // déjà empêché sur toute l'interface (2026-08-15, voir le listener
  // `contextmenu` sur `document.body` plus haut), donc rien de plus à faire
  // ici pour "ne pas ouvrir le menu contextuel".
  if (inEditorMode && editorState) {
    if (editorState.tool.type !== 'select') {
      editorState.setTool({ type: 'select' });
      clearEditorGhost();
      refreshEditorObjects();
    } else if (editorState.selection !== null) {
      editorState.select(null);
      refreshEditorObjects();
    }
  }

  // Ordre inverse du geste de pan (2026-08-11, bug remonte par Antoine :
  // "si je clique gauche en premier puis droit... la grille de multi
  // selection apparait") : le gauche etait deja enfonce (`event.buttons`,
  // masque des boutons ACTUELLEMENT enfonces) quand le droit demarre —
  // un geste gauche (rectangle de selection au sol, ou glisser d'unite)
  // etait donc deja en cours. On l'annule net des que le pan s'active,
  // plutot que de le laisser continuer en parallele : sans ca, le cadre de
  // selection/le fantome de vente restaient actifs et suivaient le curseur
  // pendant tout le pan, puisque leurs propres listeners `mousemove` ne
  // regardent que leur etat (`groundDrag`/`unitDrag`), jamais `dragging`.
  if (event.buttons & 1) {
    if (groundDrag) {
      selectionBox.hide();
      groundDrag = null;
    }
    if (unitDrag) {
      sellZone.hideGhost();
      placementHighlight.hide();
      unitDrag = null;
    }
  }
});

canvas.addEventListener('mousedown', (event) => {
  // Clic droit deja maintenu (voir plus haut) : le clic gauche qui s'ajoute
  // sert exclusivement au geste de glisser la camera (pan), jamais a une
  // action de placement normale — voir le mousemove plus bas.
  if (event.button !== 0 || !inPlacementPhase || inEditorMode || dragging) return;
  // Mode placement d'un BATIMENT achete (2026-08-17, demande explicite
  // d'Antoine) : ce clic CONFIRME (ou refuse silencieusement, si invalide —
  // meme convention qu'un clic de placement d'unite raté) l'emplacement
  // survole, court-circuitant ENTIEREMENT la selection/le glisser d'unite
  // normaux ci-dessous tant que ce mode est actif.
  if (buildingPlacementMode) {
    confirmBuildingPlacement(event);
    return;
  }
  if (useArmedItemOnPlacementClick(event)) return;

  // Clic sur un bâtiment DEJA POSSEDE (2026-08-17, "il faut pouvoir rebouger
  // ses bâtiments pendant la phase de placement") — court-circuite la
  // selection d'unite ci-dessous. Verifie APRES useArmedItemOnPlacementClick
  // (un parchemin arme prime, meme priorite que pour une unite) mais AVANT
  // findHoveredSlot (unites et bâtiments n'occupent jamais le meme espace,
  // l'ordre n'a donc pas d'impact pratique, garde juste la lecture logique
  // "objets d'abord, cibles ensuite").
  // 2026-08-18 : ne demarre PLUS le deplacement immediatement — pose
  // seulement un CANDIDAT (voir BUILDING_DRAG_THRESHOLD_PX/requestMoveBuilding) :
  // un simple clic sans bouger doit laisser le bâtiment EXACTEMENT en place
  // (retour d'Antoine : "clic -> bâtiment disparaît -> petit vide -> la
  // souris bouge -> il réapparaît"), seul un vrai glisser (voir le mousemove
  // dedie plus bas) declenche desormais requestMoveBuilding.
  const hoveredBuilding = findHoveredOwnedBuilding(event);
  if (hoveredBuilding !== null) {
    buildingClickCandidate = { index: hoveredBuilding, startClientX: event.clientX, startClientY: event.clientY };
    return;
  }
  // Clic ailleurs qu'un bâtiment possede : deselectionne l'anneau de
  // selection actif s'il y en a un (2026-08-18) — ne court-circuite jamais
  // la suite (selection d'unite normale ci-dessous).
  if (selectedBuildingIndex !== null) {
    selectedBuildingIndex = null;
    updateBuildingSelectionRing();
  }

  const hoveredSlot = findHoveredSlot(event);
  if (hoveredSlot !== null) {
    // Double-clic MANUEL (2026-08-10) : deux mousedown sur la MEME unite en
    // moins de DOUBLE_CLICK_WINDOW_MS. Remplace un listener 'dblclick' natif
    // essaye d'abord (retire) : Antoine a remonte que le premier clic
    // selectionnait puis le second desselectionnait (toggle simple deux fois
    // de suite), sans que la selection de groupe n'apparaisse jamais —
    // signe que l'evenement 'dblclick' du navigateur ne se declenchait pas
    // de facon fiable par-dessus notre propre logique mousedown/mouseup.
    // Detection manuelle par horodatage, integree directement ici : le 2e
    // mousedown court-circuite l'armement du glisser (pas de unitDrag pose),
    // donc le mouseup qui suit ne fait rien et n'annule plus la selection de
    // groupe qu'on vient de poser.
    const now = performance.now();
    if (hoveredSlot === lastUnitClickSlot && now - lastUnitClickTime < DOUBLE_CLICK_WINDOW_MS) {
      lastUnitClickSlot = null;
      selectSameTypeGroup(hoveredSlot);
      return;
    }
    lastUnitClickSlot = hoveredSlot;
    lastUnitClickTime = now;

    // Ne selectionne pas tout de suite : un glisser (voir le mousemove plus
    // bas) doit pouvoir prendre le dessus pour vendre l'unite ou la deplacer.
    // La selection normale se resout au relachement si le curseur n'a pas
    // assez bouge (voir le mouseup plus bas). Si l'unite survolee fait deja
    // partie d'un groupe selectionne (2+ elements), le glisser deplacera OU
    // vendra tout le groupe (voir groupIndices, points 24-27/33-34 de la
    // demande) plutot que ce seul slot.
    const groupIndices = selectedIndices.length > 1 && selectedIndices.includes(hoveredSlot) ? selectedIndices : null;
    unitDrag = { slotIndex: hoveredSlot, groupIndices, startClientX: event.clientX, startClientY: event.clientY, dragging: false };
    return;
  }

  // Pas sur une unite : meme logique differee que ci-dessus, mais pour le
  // rectangle de selection multiple (voir GroundDragState) — un simple clic
  // (sans glisser) reste resolu comme avant (handleEmptyTileClick) au
  // relachement.
  groundDrag = { startClientX: event.clientX, startClientY: event.clientY, dragging: false };
});

canvas.addEventListener('mousedown', (event) => {
  if (event.button !== 0 || inEditorMode || dragging) return;
  // PRIORITE explicite (2026-08-15, bug remonte par Antoine : Nova de glace
  // declenchait aussi une salve fantome de Baliste) — UI > mode de ciblage
  // d'un objet de bataille > tir de Baliste. Un objet arme CONSOMME
  // ENTIEREMENT ce clic : `fireButtonHeld` ne doit meme pas etre pose pour
  // ce clic, sinon le tick de simulation SUIVANT (voir attemptAutoFire)
  // verrait `armedItemIndex` deja redevenu null (l'objet vient d'etre
  // consomme par handleBattleFireClick/useArmedItemOnClick sur CE MEME
  // clic) et `fireButtonHeld` toujours vrai — un tir de Baliste "fantome" se
  // declenchait alors au tick suivant, meme sur un simple clic (pas
  // seulement un clic maintenu), des que le talent "Tir rapide" est
  // debloque. Cause racine : l'ancien code posait `fireButtonHeld = true`
  // INCONDITIONNELLEMENT avant meme de savoir si le clic serait consomme.
  if (armedItemIndex !== null) {
    handleBattleFireClick(event);
    return;
  }
  // Mode Commandement (prototype RTS) : le clic gauche selectionne au lieu de
  // tirer — fireButtonHeld n'est pas pose, donc Tir rapide ne tire pas non
  // plus. Un objet arme garde la priorite (branche ci-dessus).
  if (battleControlMode === 'command' && inBattlePhase()) {
    handleCommandModeClick(event);
    return;
  }
  // Maintien du clic (2026-08-13, "Tir rapide") : pose l'INTENTION de tir
  // AVANT le tir immediat ci-dessous — sans consequence sur ce tir (deja
  // gere par handleBattleFireClick/fireArrowIfReady), mais garantit que le
  // relais automatique (attemptAutoFire, boucle de simulation) prend le
  // relais des le tick suivant si le bouton reste enfonce.
  fireButtonHeld = true;
  handleBattleFireClick(event);
});

// Relachement du clic gauche N'IMPORTE OU sur la fenetre (pas seulement sur
// le canvas) : arrete immediatement le tir automatique, sans tir
// supplementaire "en attente" (demande explicite d'Antoine, point 15).
// pointercancel/blur ci-dessous couvrent les cas ou aucun mouseup n'arrive
// du tout (alt-tab, geste tactile interrompu...).
window.addEventListener('mouseup', (event) => {
  if (event.button === 0) fireButtonHeld = false;
});
window.addEventListener('pointercancel', () => {
  fireButtonHeld = false;
  buildingClickCandidate = null;
  if (buildingPlacementMode) cancelBuildingPlacement();
});
window.addEventListener('blur', () => {
  fireButtonHeld = false;
  pendingRightClickOrder = null;
  buildingClickCandidate = null;
  if (buildingPlacementMode) cancelBuildingPlacement();
});

canvas.addEventListener('mousedown', (event) => {
  // transformDragging : le clic sert a saisir une poignee du gizmo
  // TransformControls (voir plus haut) — ne pas interferer avec la
  // selection/le placement/le deplacement normal de l'editeur pendant ce
  // temps (le navigateur livre 'pointerdown' avant 'mousedown' pour un
  // meme clic, ce flag est donc deja a jour ici, voir son commentaire).
  if (event.button !== 0 || !inEditorMode || dragging || transformDragging) return;
  if (tryStartRingRotate(event)) return;
  handleEditorClick(event);
});

window.addEventListener('mouseup', (event) => {
  if (event.button === 2) {
    dragging = false;
    // Clic droit relache sans glisser (prototype RTS) : ordre de deplacement.
    // Un glisser a deja annule pendingRightClickOrder (camera seulement).
    const pending = pendingRightClickOrder;
    pendingRightClickOrder = null;
    if (pending && !(event.buttons & 1)) issueMoveOrderAt(event);
  }
  if (event.button !== 0 || !unitDrag) return;

  const drag = unitDrag;
  unitDrag = null;

  if (!drag.dragging) {
    // Pas assez bouge pour compter comme un glisser : clic simple, selection
    // normale (meme comportement qu'avant l'ajout du glisser-vendre).
    selectSlot(drag.slotIndex);
    return;
  }

  placementHighlight.hide();
  sellZone.hideGhost();
  sellZone.setArmed(false);

  // Relache au-dessus de "Vendre" (2026-08-14, points 24-27/33-34 de la
  // demande) : vend le GROUPE entier si le glisser en deplacait un, sinon la
  // seule unite saisie — verifie AVANT toute logique de deplacement, pour
  // les deux cas de glisser (seul et groupe).
  if (sellZone.isPointOver(event.clientX, event.clientY)) {
    sellUnits(drag.groupIndices ?? [drag.slotIndex]);
    return;
  }

  if (drag.groupIndices) {
    // Glisser de GROUPE qui ne tombe pas sur "Vendre" : deplacement, voir
    // computeGroupPreview, meme logique que handleGroupMoveClick. Un essai
    // qui n'aboutit a aucun deplacement valide deselectionne quand meme le
    // groupe (meme convention que la version au clic).
    const tile = computeHoveredTile(event);
    if (tile) {
      const { positions, allValid } = computeGroupPreview(drag.slotIndex, drag.groupIndices, tile);
      if (allValid) {
        for (const p of positions) {
          placementSlots[p.i]!.x = p.x;
          placementSlots[p.i]!.z = p.z;
        }
      }
    }
    clearSelection();
    refreshPlayerPreview();
    return;
  }

  // Glisser-deplacer une unite SEULE (demande d'Antoine, 2026-08-10) : si le
  // point de relachement tombe sur une case valide (ou a defaut la plus
  // proche, voir findNearestValidTile), l'unite s'y deplace, sinon elle
  // reste ou elle etait.
  const tile = computeHoveredTile(event);
  const target = tile && findNearestValidTile(placementSlots[drag.slotIndex]!.unitId, tile.x, tile.z, [drag.slotIndex]);
  if (target) {
    placementSlots[drag.slotIndex]!.x = target.x;
    placementSlots[drag.slotIndex]!.z = target.z;
    if (selectedIndices.length === 1 && selectedIndices[0] === drag.slotIndex) clearSelection();
    refreshPlayerPreview();
  }
});

window.addEventListener('mouseup', (event) => {
  if (event.button !== 0 || !groundDrag) return;

  const drag = groundDrag;
  groundDrag = null;

  if (!drag.dragging) {
    // Pas assez bouge pour compter comme un rectangle de selection : clic
    // simple, comportement inchange (deplacement de l'unite/du groupe en
    // main, voir handleEmptyTileClick).
    handleEmptyTileClick(event);
    return;
  }

  selectionBox.hide();
  selectUnitsInRect(selectionBox.toRect(drag.startClientX, drag.startClientY, event.clientX, event.clientY));
});

window.addEventListener('mousemove', (event) => {
  updateAimFromEvent(event);
});

window.addEventListener('mousemove', (event) => {
  if (armedItemIndex === null) return;
  inventoryBar.moveCursorIcon(event.clientX, event.clientY);
  // Anneau de previsualisation de la cible de soin (2026-08-11) — voir
  // updateHealTargetPreview, meme geste que le curseur qui suit l'objet
  // arme juste au-dessus.
  updateHealTargetPreview(event);
  // Anneau de previsualisation de la Nova de glace (2026-08-14) — meme
  // motif, ne fait rien si l'objet arme n'est pas la Nova.
  updateIceNovaTargetPreview(event);
});

window.addEventListener('mousemove', (event) => {
  if (!groundDrag) return;

  if (!groundDrag.dragging) {
    const dx = event.clientX - groundDrag.startClientX;
    const dy = event.clientY - groundDrag.startClientY;
    if (Math.hypot(dx, dy) < UNIT_DRAG_THRESHOLD_PX) return;
    groundDrag.dragging = true;
    selectionBox.show();
  }

  selectionBox.update(groundDrag.startClientX, groundDrag.startClientY, event.clientX, event.clientY);
});

window.addEventListener('mousemove', (event) => {
  if (!unitDrag) return;

  if (!unitDrag.dragging) {
    const dx = event.clientX - unitDrag.startClientX;
    const dy = event.clientY - unitDrag.startClientY;
    if (Math.hypot(dx, dy) < UNIT_DRAG_THRESHOLD_PX) return;
    unitDrag.dragging = true;
    // Fantome de vente (2026-08-14, points 24-27 de la demande : un glisser
    // de GROUPE peut desormais aussi etre vendu) — un seul texte-libelle
    // pour l'unite seule, un decompte pour un groupe.
    sellZone.showGhost(unitDrag.groupIndices ? `${unitDrag.groupIndices.length} unités` : (placementSlots[unitDrag.slotIndex]?.unitId ?? ''));
  }

  sellZone.moveGhost(event.clientX, event.clientY);
  const overSellZone = sellZone.isPointOver(event.clientX, event.clientY);
  sellZone.setArmed(overSellZone);

  // Apercu de destination (demande d'Antoine, 2026-08-10 : "le tour de la
  // case ... s'illuminerait en bleu pour prevenir le joueur d'ou il place son
  // unite") — masque au-dessus de la zone de vente, ou les deux retours
  // visuels se contrediraient (vendre vs deplacer). Vaut aussi pour un
  // glisser de GROUPE depuis 2026-08-14 (auparavant seul le glisser simple
  // regardait `overSellZone`).
  if (overSellZone) {
    placementHighlight.hide();
    return;
  }

  if (unitDrag.groupIndices) {
    // Apercu de GROUPE (demande d'Antoine, 2026-08-10) : un cadre bleu par
    // membre a sa destination prevue, seulement si le deplacement ENTIER est
    // valide (meme tout-ou-rien que le deplacement au clic) — sinon aucun
    // cadre, pour signaler clairement "pas la".
    const tile = computeHoveredTile(event);
    if (tile) {
      const { positions, allValid } = computeGroupPreview(unitDrag.slotIndex, unitDrag.groupIndices, tile);
      // Un cadre par case occupee (voir getFootprintTiles) : un membre a
      // empreinte previsualise ses DEUX cases, pas seulement son ancre.
      if (allValid) placementHighlight.show(positions.flatMap((p) => getFootprintTiles(placementSlots[p.i]!.unitId, p.x, p.z)));
      else placementHighlight.hide();
    } else {
      placementHighlight.hide();
    }
    return;
  }

  const tile = computeHoveredTile(event);
  const draggedUnitId = placementSlots[unitDrag.slotIndex]!.unitId;
  // findNearestValidTile (pas juste isValidPlacementForUnit) : l'aperçu doit
  // refléter EXACTEMENT ce qui se passera au relâchement (voir plus bas),
  // sinon un clic pres d'un bord de case se solderait par un aperçu masqué
  // suivi d'un deplacement qui reussit quand meme — incohérent.
  const target = tile && findNearestValidTile(draggedUnitId, tile.x, tile.z, [unitDrag.slotIndex]);
  if (target) {
    // Un cadre par case occupee (voir getFootprintTiles) : une unite a
    // empreinte (Cavalier leger) previsualise ses DEUX cases, pas seulement
    // celle sous le curseur.
    placementHighlight.show(getFootprintTiles(draggedUnitId, target.x, target.z));
  } else {
    placementHighlight.hide();
  }
});

window.addEventListener('mousemove', (event) => {
  if (!inEditorMode || !editorState || editorState.tool.type === 'select') return;
  setRaycasterFromEvent(event);
  if (!raycaster.ray.intersectPlane(groundPlane, groundHit)) return;
  updateEditorGhost(groundHit.x, groundHit.z);
});

// Seuil de glisser sur un bâtiment DEJA POSSEDE (2026-08-18) : promeut un
// simple clic maintenu en VRAI deplacement des que le curseur s'est assez
// eloigne — voir requestMoveBuilding pour la mise en scene (fantome pose
// AVANT le masquage du mesh original). Enregistre AVANT le listener suivant
// (fantome qui suit le curseur) : les deux listeners 'mousemove' tournent
// l'un apres l'autre pour le MEME evenement, de facon synchrone (JS,
// jamais de repaint entre les deux) — une fois buildingPlacementMode pose
// ici, le listener suivant le voit deja et repositionne aussitot le
// fantome sous le VRAI curseur, sans attendre un DEUXIEME mousemove.
window.addEventListener('mousemove', (event) => {
  if (!buildingClickCandidate) return;
  const dx = event.clientX - buildingClickCandidate.startClientX;
  const dy = event.clientY - buildingClickCandidate.startClientY;
  if (Math.hypot(dx, dy) < BUILDING_DRAG_THRESHOLD_PX) return;
  const index = buildingClickCandidate.index;
  buildingClickCandidate = null;
  requestMoveBuilding(index);
});

// Fantome de placement d'un BATIMENT achete (2026-08-17) — meme technique
// que le fantome de l'editeur juste au-dessus (raycast sur le sol), mais un
// mode ENTIEREMENT distinct (buildingPlacementMode, jamais inEditorMode).
window.addEventListener('mousemove', (event) => {
  if (!buildingPlacementMode) return;
  setRaycasterFromEvent(event);
  if (!raycaster.ray.intersectPlane(groundPlane, groundHit)) return;
  updateBuildingPlacementGhost(groundHit.x, groundHit.z);
});

// Relachement en fin de glisser d'un bâtiment DEJA POSSEDE (2026-08-18) —
// deux cas distincts, mutuellement exclusifs par construction :
// (1) buildingClickCandidate encore present : le seuil n'a JAMAIS ete
//     franchi (simple clic) — bascule la selection (anneau), le bâtiment
//     n'a jamais bouge d'un pixel, comme demande explicitement.
// (2) buildingPlacementMode.movingIndex non-null : un vrai glisser vient de
//     se terminer — commit sur la case survolee si valide (confirmBuildingPlacement,
//     renvoie desormais un booleen), SINON annule explicitement (retour
//     automatique a la position d'origine, jamais de bâtiment perdu ni de
//     Gold perdu — laisser le mode arme en attente d'un TROISIEME clic
//     n'aurait pas de sens une fois le bouton relache).
window.addEventListener('mouseup', (event) => {
  if (event.button !== 0) return;

  if (buildingClickCandidate) {
    const index = buildingClickCandidate.index;
    buildingClickCandidate = null;
    selectedBuildingIndex = selectedBuildingIndex === index ? null : index;
    updateBuildingSelectionRing();
    return;
  }

  if (buildingPlacementMode?.movingIndex !== null && buildingPlacementMode?.movingIndex !== undefined) {
    const committed = confirmBuildingPlacement(event);
    if (!committed) cancelBuildingPlacement();
  }
});

window.addEventListener('mousemove', (event) => {
  if (!dragging) return;
  // Clic droit en attente d'ordre (prototype RTS) : tant que le curseur reste
  // sous le seuil de glisser, la camera ne bouge pas. Au-dela (ou si le clic
  // gauche s'y ajoute pour un pan), le geste devient une rotation de camera
  // et ne produira jamais d'ordre. lastMouseX/Y ne sont pas mis a jour avant
  // le seuil : le mouvement deja fait est applique d'un coup ensuite.
  if (pendingRightClickOrder) {
    const moved = Math.hypot(event.clientX - pendingRightClickOrder.startClientX, event.clientY - pendingRightClickOrder.startClientY);
    if (moved < UNIT_DRAG_THRESHOLD_PX && !(event.buttons & 1)) return;
    pendingRightClickOrder = null;
  }
  const dx = event.clientX - lastMouseX;
  const dy = event.clientY - lastMouseY;
  lastMouseX = event.clientX;
  lastMouseY = event.clientY;
  // Clic droit + gauche maintenus (2026-08-11, demande d'Antoine : "pouvoir
  // deplacer la camera... pour aller admirer certains details de la
  // bataille") : glisser la camera (pan) au lieu de pivoter/incliner.
  // `event.buttons` est un masque de bits des boutons ACTUELLEMENT enfonces,
  // independant du bouton qui a declenche cet evenement — le seul moyen fiable
  // de detecter que le gauche est *aussi* enfonce pendant un glisser deja en
  // cours au clic droit.
  if (event.buttons & 1) {
    renderer.pan(dx, dy);
  } else {
    renderer.adjustYaw(dx * CAMERA.mouseYawSensitivity);
    renderer.adjustPitch(-dy * CAMERA.mousePitchSensitivity);
  }
});

canvas.addEventListener(
  'wheel',
  (event) => {
    event.preventDefault();
    // Ctrl+molette pendant un placement de batiment (2026-08-17, demande
    // explicite d'Antoine) : tourne le fantome par pas de 45° au lieu de
    // zoomer — voir rotateBuildingPlacement. Direction du signe alignee sur
    // le zoom existant (deltaY > 0 = "vers le bas/loin" -> un sens de
    // rotation constant, arbitraire mais previsible).
    if (buildingPlacementMode && event.ctrlKey) {
      rotateBuildingPlacement(Math.sign(event.deltaY));
      return;
    }
    // Editeur : Ctrl+molette tourne le decor selectionne (±15°, ±1° avec Maj)
    // au lieu de zoomer — preventDefault ci-dessus empeche aussi le zoom du
    // navigateur. Avec Maj, Windows transforme le defilement en horizontal
    // (deltaY = 0, valeur dans deltaX), d'ou le repli sur deltaX.
    if (inEditorMode && event.ctrlKey && !ringRotateDrag && editorState?.selectedObstacle) {
      const wheelDelta = event.deltaY || event.deltaX;
      if (wheelDelta !== 0) rotateSelectedObstacleBy(-Math.sign(wheelDelta) * THREE.MathUtils.degToRad(event.shiftKey ? 1 : 15));
      return;
    }
    renderer.adjustZoom(Math.sign(event.deltaY) * CAMERA.wheelZoomStep);
  },
  { passive: false },
);

// Le menu principal s'affiche par defaut (voir constructeur de Screens) ;
// aucune bataille tant que le joueur n'a pas clique sur Jouer.
loop.start();
