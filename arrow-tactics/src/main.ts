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
  HEAL_TARGET_RADIUS,
  HP_PER_PIP,
  isBlockingMapObstacle,
  obstacleCenter,
  MACHINE_GUN_FALLBACK_TARGET_OFFSET,
  MACHINE_GUN_ORIGIN_OFFSET,
  MACHINE_GUN_SECONDARY_TARGET_RADIUS,
  PLAYER_ARROW_RANGE,
  GRID_MOVE_SEARCH_RADIUS,
  type ObstacleDef,
  PLACEMENT_GOLD_WARNING_RATIO,
  SHADOW_PROJECTILE_SPEED,
  TILE,
  obstacleBounds,
} from './config/constants';
import {
  BALLISTA_PLACEMENT_TILES,
  computeBallistaObstacle,
  cellKey,
  computeMapCellBounds,
  resolveMapCells,
  DEFAULT_MAP,
  resolveBallistaOrigin,
  snapBallistaOrigin,
  type MapDef,
} from './config/mapDef';
import { SURVIVAL_ARENA_MAP, SURVIVAL_BASE_MAP } from './config/maps/survivalArena';
import { buildTerritoryIndex, resolveMapTerritory, territoryOwnerAtPoint, type TerritoryCell, type TerritoryIndex } from './config/territory';
import { applyMapExpansionStep, expansionStepForCompletedWave } from './run/mapExpansion';
import { Loop } from './core/loop';
import { dist } from './core/math';
import { clampToCellsDistance, type CellCorner } from './core/cameraBounds';
import { populationOfEntities } from './data/population';
import { canRecruitWithinPopulation, runPopulation } from './run/population';
import { PopulationHud } from './ui/populationHud';
import { isNoopGridMove, planGridGroupMove, type GridGroupMovePlan, type GridMoveMember } from './core/gridGroupMove';
import {
  advanceWallTrace,
  finalizeWallTrace,
  joinWallPath,
  openWallEnds,
  planWallTraceLeg,
  resumeWallTrace,
  startWallTrace,
  wallChainTo,
  wallNetPiece,
  type WallEnd,
  type WallNetPiece,
  type WallPath,
  traceCellAt,
  traceInteriorSign,
  wallEndJoins,
  wallPieceFacing,
  type TraceCell,
  type TraceLayout,
  type WallJoinPiece,
  type WallTrace,
  type WallTraceLeg,
  type WallTracePiece,
} from './core/wallTrace';
import { BUILDINGS, buildingFootprintTiles, buildingRotationStep, getBuilding, sameBuildingFootprint, unitsProducedPerWave } from './data/buildings';
import { hasRecruitmentBuilding } from './run/recruitment';
import { getItem, type GamePhase, type IceNovaEffect } from './data/items';
import { getUnit, type UnitStats } from './data/units';
import {
  EDITOR_BALLISTA_OWNER,
  EditorState,
  type ReliefStrokeStart,
  buildingBoundsAt,
  snapBuildingCenter,
  type EditorBuilding,
  type EditorMapShapeSnapshot,
  type EditorObjectsSnapshot,
  type EditorTool,
} from './editor/editorState';
import { EditorHistory } from './editor/history';
import { surfaceBrushOrigin, type GroundTextureId, type SurfaceBrushSize, type SurfaceCellDef } from './config/groundSurfaces';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import {
  buildCellPreview,
  buildReliefBrushPreview,
  buildSurfaceBrushPreview,
  buildWallEndMarker,
  buildGhost,
  buildObstacleView,
  buildUnitGhost,
  buildUnitView,
  createSelectionRing as createEditorSelectionRing,
  createSelectionRingHitArea,
  TERRITORY_ERASE_PREVIEW_COLOR,
} from './editor/editorScene';
import { EditorUI, type PropertiesSubject } from './editor/editorUI';
import { downloadMapDef, exportMapDef, loadMapDefFromFile } from './editor/mapSerializer';
import { buildBallistaTowerPlatform, playBallistaShot, tickBallista } from './render/ballista';
import { BattleSelection, isInScreenRect, pickEntityAtScreen, selectableUnitsInScreenRect, type ScreenRect } from './render/battleSelection';
import { attachUnitSelectionRing, teamColor } from './render/unitSelectionRing';
import { ensureModels, loadEnvironmentAssets, obstacleModelKeys, type EnvironmentAssets } from './render/assetLibrary';
import { createBoard, createZonesGroup, type Board } from './render/board';
import { BuildingView } from './render/buildingView';
import { buildObstacleMesh, obstaclePlacementOffset, placeObstacleMesh } from './render/obstacleFactory';
import { GROUND_PALETTES, setGroundPalette } from './render/groundSurfaces';
import { buildCellGridLines, buildTerrainCellsView } from './render/terrainCells';
import { activeTerrain, intersectSculptSurface, intersectTerrain, setActiveTerrain, surfaceY } from './render/terrainSurface';
import { reliefBrushCore, reliefBrushOrigin, resolveMapHeightField, type ReliefBrushSize, type ReliefDelta, type TerrainElevationCellDef, type TerrainHeightField } from './config/terrainElevation';
import { UnitMovePreview, type UnitMovePreviewItem } from './render/unitMovePreview';
import { DEFAULT_LAUNCH_HEIGHT, PlayerArrowView, preloadPlayerArrowModel } from './render/playerArrowView';
import { Projectiles } from './render/projectiles';
import { Renderer, type CameraViewState } from './render/renderer';
import { buildUnit } from './render/unitMesh';
import { UnitViews } from './render/unitViews';
import { preloadMageModel } from './render/mageRig';
import { preloadFantassinModel } from './render/fantassinRig';
import { preloadFantassinV2Model } from './render/fantassinV2Rig';
import { preloadArcherModel } from './render/archerRig';
import { preloadSentinelModel } from './render/sentinelRig';
import { TelegraphView } from './render/telegraph';
import { FireballView } from './render/fireballView';
import { IceNovaView } from './render/iceNova';
import { HealVfxView } from './render/healVfx';
import { MoveOrderFeedback } from './render/moveOrderFeedback';
import { AttackOrderFeedback } from './render/attackOrderFeedback';
import { RecyclageAuraView } from './render/recyclageAura';
import { TauntVfxView } from './render/tauntVfx';
import { ShadowProjectileView } from './render/shadowProjectileView';
import { VfxManager } from './render/vfx/VfxManager';
import {
  canPlayerRecruitUnit,
  grantFirstRunPointIfNeeded,
  isTalentUnlocked,
  loadMetaProgress,
  registerEnemyDefeat,
  registerWaveReached,
  resetMetaProgress,
  resetTalentPoints,
  saveMetaProgress,
  unlockTalent,
} from './run/metaProgress';
import { computeStartingGoldBonus, computeTalentEconomyHooks } from './run/talentEffects';
import {
  computeEnemyUnitUpgradeEffects,
  currentProductionLevel,
  effectivePlayerUnitCost,
  enemyUnitUpgradeLevel,
  playerUnitMaxHp,
  playerUnitProductionCost,
} from './run/unitUpgradeEffects';
import { HEAL_SCROLL_UPGRADE } from './data/healScrollUpgrade';
import { effectiveBallistaMaxHp } from './run/ballistaUpgradeEffects';
import { computePlayerIceNovaUpgradeEffects, effectiveIceNovaCost } from './run/iceNovaUpgradeEffects';
import { mineMaxProductionsPerWave, mineProductionIntervalSeconds, rollMineGold } from './run/mineUpgradeEffects';
import { ownedBuildingLevel, upgradeOwnedBuilding } from './run/buildingUpgrades';
import { createBattleSummary, defeatedLines, recordEnemyDefeated, recordGoldEarned } from './run/battleSummary';
import { Rng } from './core/rng';
import { effectiveBuildingAttackDamage, effectiveBuildingMaxHp, getEffectiveBuildingCost } from './run/buildingUpgradeEffects';
import { playerUnitAbilityDamageBonus, playerUnitStatOverrides, playerUnitTauntShieldBonus } from './run/playerUnitStats';
import {
  effectivePlayerArrowCooldown,
  effectivePlayerArrowDamage,
  effectivePlayerArrowSpeed,
  playerArrowBoltsPerVolley,
  type BallistaFireMode,
} from './run/ballistaStats';
import { predictBallistaAimPoint, selectBallistaAutoTarget } from './sim/ballistaAuto';
import {
  battleBallistaInfo,
  type EntityInfoAction,
  battleBuildingInfo,
  battleGroupInfo,
  battleUnitInfo,
  placementBallistaInfo,
  placementBuildingInfo,
  placementGroupInfo,
  placementUnitInfo,
  type EntityInfoViewModel,
} from './run/entityInfo';
import { computePlayerShadowEffects } from './run/shadowUpgradeEffects';
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
  formatGold,
  roundGold,
  type OwnedBuilding,
  type RunState,
} from './run/runState';
import { purchaseRunUpgrade, runUpgradeSite, type PlayerProgression, type RunUpgradeLevels, type RunUpgradeSite } from './run/runUpgrades';
import { armyMissingHp, healArmyAtChurch } from './run/churchHeal';
import { forwardDir, type Entity, type Team } from './sim/entity';
import type { ArrowShotSpec } from './sim/playerArrow';
import { World } from './sim/world';
import type { EnemyReinforcementPlan, EnemyReinforcementSpawn } from './sim/systems/enemyReinforcements';
import { enemyEmptyFieldSpawnTicks, enemyGroupDelayTicks, splitEnemyWaveComposition } from './run/enemyWaveGroups';
import { initAudio, persistAudioSettings } from './audio';
import { BuildingRotationHint } from './ui/buildingRotationHint';
import { WaveIndicator } from './ui/waveIndicator';
import { BallistaIndicator, type BallistaStatus } from './ui/ballistaIndicator';
import { EntityInfoPanel } from './ui/entityInfoPanel';
import { GoldHud } from './ui/goldHud';
import { CombatOverlay, type PlacementBuildingHpSubject } from './ui/combatOverlay';
import { spawnCoinPopup } from './ui/coinPopup';
import { DebugPanel } from './ui/debug';
import { InventoryBar, inventoryShortcutSlot } from './ui/inventoryBar';
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
const waveIndicator = new WaveIndicator();
const buildingRotationHint = new BuildingRotationHint();

// Pendant la bataille, le joueur est toujours en controle RTS : clic gauche
// pour selectionner, clic droit pour ordonner. La Baliste tire avec Q (voir
// fireBallistaFromKey) ; un seul HUD affiche son etat, sa recharge et la
// selection.
const ballistaIndicator = new BallistaIndicator();
const entityInfoPanel = new EntityInfoPanel((id) => onEntityInfoAction(id));
// Les unites selectionnees ont l'anneau commun (render/unitSelectionRing.ts).
const battleSelection = new BattleSelection();
renderer.scene.add(battleSelection.group);
// Unites ENNEMIES inspectees (clic ou rectangle sans allie) : meme mecanique
// d'ids et d'anneaux que la selection, mais une instance a part, jamais lue
// par un ordre RTS (clic droit, S, groupe : tous lisent battleSelection).
// Jamais active en meme temps que battleSelection.
const battleEnemyInspection = new BattleSelection();
renderer.scene.add(battleEnemyInspection.group);
const goldHud = new GoldHud();
const populationHud = new PopulationHud();
const telegraphView = new TelegraphView();
const fireballView = new FireballView();
const iceNovaView = new IceNovaView();
const healVfxView = new HealVfxView();
// Retour visuel des ordres de deplacement acceptes (voir le consommateur de
// world.commandResults dans onStep).
const moveOrderFeedback = new MoveOrderFeedback();
// Ordre d'attaque accepte : anneau d'unite commun qui clignote brievement
// sous la cible (meme taille que la selection et l'inspection).
const attackOrderFeedback = new AttackOrderFeedback();
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
// revient a la map d'avant le test au retour dans l'editeur — le Mode survie
// ne doit jamais voir la map de test. Carte de depart du Mode survie :
// SURVIVAL_BASE_MAP (config/maps/survivalArena.ts), jamais mutee (l'expansion
// produit de nouvelles MapDef).
let currentMap: MapDef = SURVIVAL_BASE_MAP;
world.setMap(currentMap);

/** Relief de la carte en jeu (currentMap), pour les regles de pose de la
 *  preparation. */
function gameTerrain(): TerrainHeightField {
  return resolveMapHeightField(currentMap);
}

/** Surface active du rendu (render/terrainSurface.ts) : le brouillon dans
 *  l'editeur, sinon la carte en jeu (y compris pendant « Tester le
 *  scénario »). Appelee a chaque frame et apres chaque changement de carte
 *  ou de relief, avant de (re)construire des meshes poses au sol. */
function syncActiveTerrain(): void {
  setActiveTerrain(inEditorMode && editorState ? editorState.heightField() : gameTerrain());
}

// Limite du deplacement de la camera en jeu : le point vise reste a moins de
// CAMERA.maxTargetDistanceFromTerrain cases du terrain de la carte courante
// (agrandissements compris). Ni dans l'editeur ni pendant son test.
let cameraBoundsMap: MapDef | null = null;
let cameraBoundsCells: readonly CellCorner[] = [];
renderer.setTargetConstraint((x, z) => {
  if (inEditorMode || inTestMode) return null;
  if (cameraBoundsMap !== currentMap) {
    cameraBoundsMap = currentMap;
    cameraBoundsCells = resolveMapCells(currentMap);
  }
  return clampToCellsDistance(cameraBoundsCells, x, z, CAMERA.maxTargetDistanceFromTerrain);
});

// Sol : herbe classique par defaut ; `?sol=<palette>` pour comparer les
// variantes visuelles (render/groundSurfaces.ts : variee, stylisee, pixel,
// catalogue, ou une texture du lot seule, ex. `?sol=herbe-dense`), en
// attendant le choix d'Antoine. Avant toute construction de plateau.
const groundParam = new URLSearchParams(location.search).get('sol');
const groundPalette = GROUND_PALETTES.find((p) => p === groundParam);
if (groundPalette) setGroundPalette(groundPalette);

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
const footmanParam = new URLSearchParams(location.search).get('footman');
let [board] = await Promise.all([
  createBoard(currentMap),
  preloadMageModel(),
  preloadFantassinModel(),
  // Footman V2 par defaut ; `?footman=v1` revient explicitement a l'ancien
  // Fantassin. Ne rejette jamais (repli V1 si un asset manque, voir
  // fantassinV2Rig.ts).
  footmanParam === 'v1' ? Promise.resolve() : preloadFantassinV2Model(),
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
renderer.scene.add(moveOrderFeedback.group);
renderer.scene.add(attackOrderFeedback.group);
renderer.scene.add(recyclageAuraView.group);
renderer.scene.add(tauntVfxView.group);
renderer.scene.add(shadowProjectileView.group);

// Baliste du joueur : a la position definie par la carte (MapDef.ballista,
// voir resolveBallistaOrigin — sinon repli historique du coin), orientee vers
// le centre du plateau. Meme convention de cap que le reste du
// rendu (voir UnitViews.computeFacing) : l'unite locale -Z est "l'avant" de
// la baliste.
let playerArrowOrigin = resolveBallistaOrigin(currentMap);
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
// Modeles des batiments gameplay charges a la demande (murailles KayKit) :
// necessaires des la premiere preparation, charges une fois au demarrage.
await ensureModels(Object.values(BUILDINGS).flatMap((def) => (def.buildingModel ? [def.buildingModel] : [])));
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
function repositionBallista(origin: { x: number; z: number } = playerArrowOrigin): void {
  ballistaPlatform.position.set(origin.x, surfaceY(origin.x, origin.z), origin.z);
  ballista.rotation.y = Math.atan2(origin.x, origin.z);
}

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
let ballistaObstacleDef: ObstacleDef = computeBallistaObstacle(playerArrowOrigin);
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
  for (const b of ownedBuildingViews) {
    renderer.scene.remove(b.mesh);
    b.view.dispose();
  }
  ownedBuildingViews.length = 0;
}

/** ObstacleDef d'UN bâtiment possédé — position CONTINUE (x/z, voir
 *  config/constants.ts, ObstacleDef, chantier "placement libre") derivee de
 *  OwnedBuilding.x/z, jamais cornerX/cornerZ (le joueur choisit une position
 *  quelconque dans sa zone, pas necessairement alignee sur un coin de bloc
 *  pair). */
function ownedBuildingObstacle(owned: OwnedBuilding): ObstacleDef {
  return gameplayBuildingObstacle(owned.buildingId, owned.x, owned.z, owned.rotationY ?? 0, 'player', currentRun.buildings);
}

/** Lacet visuel de camp d'une muraille (BuildingDef.outerFaceTowardHostiles) :
 *  face exterieure vers les hostiles tant qu'aucune enceinte fermee n'a fixe
 *  son orientation. */
function teamFacingYaw(team: Team): number {
  return forwardDir(team) < 0 ? Math.PI : 0;
}

/** `rotationY` qui tourne la face exterieure (creneaux, +Z natif) d'un
 *  segment de muraille vers (outwardX, outwardZ). Le lacet de camp s'ajoute
 *  au rendu : il est compense ici. Toujours un quart de tour exact de meme
 *  parite que l'axe du segment : emprise, collision et position inchangees
 *  (un demi-tour garde la meme emprise). */
function outwardRotationY(outwardX: number, outwardZ: number, team: Team): number {
  const quarter = Math.PI / 2;
  const turns = Math.round((Math.atan2(outwardX, outwardZ) - teamFacingYaw(team)) / quarter);
  return (((turns % 4) + 4) % 4) * quarter;
}

/** Piece de trace devenue batiment concret : mur, demi-segment
 *  (BuildingDef.traceHalf) ou variante de virage (BuildingDef.traceCorners),
 *  coin de grille et rotation enregistree. */
interface TracedWallPiece {
  kind: WallTracePiece['kind'];
  buildingId: string;
  cornerX: number;
  cornerZ: number;
  tilesX: number;
  tilesZ: number;
  rotationY: number;
}

/** Oriente une piece du trace `wallId` pour son cote interieur
 *  (core/wallTrace.ts, wallPieceFacing) : creneaux dehors. */
function tracedWallPiece(wallId: string, piece: WallTracePiece, interiorSign: number, team: Team): TracedWallPiece {
  const facing = wallPieceFacing(piece, interiorSign);
  const base = { kind: piece.kind, cornerX: piece.cornerX, cornerZ: piece.cornerZ, tilesX: piece.tilesX, tilesZ: piece.tilesZ };
  const def = getBuilding(wallId);
  if (facing.kind === 'corner') {
    return { ...base, buildingId: def.traceCorners ? def.traceCorners[facing.variant] : wallId, rotationY: facing.rotationY };
  }
  return { ...base, buildingId: piece.kind === 'half' ? def.traceHalf ?? wallId : wallId, rotationY: outwardRotationY(facing.outwardX, facing.outwardZ, team) };
}

/** Passage d'une disposition de trace a une autre (core/wallTrace.ts) :
 *  pieces retirees (troncon re-apparie), pieces posees, orientation de TOUTES
 *  les pieces apres (le cote interieur peut changer), cases en attente
 *  (contour d'apercu) et cout. */
interface WallTraceStep {
  removed: TracedWallPiece[];
  added: TracedWallPiece[];
  all: TracedWallPiece[];
  waiting: TraceCell[];
  cost: number;
  /** Part du cout qui paie la recomposition de pieces existantes (reprise,
   *  jonction) au-dela du prix des cases nouvellement couvertes. */
  joinCost: number;
}

/** Cout d'une disposition, en segments de mur : une case droite vaut un
 *  demi-segment (segment 2 x 1 = 1, demi-segment = 1/2, case EN ATTENTE =
 *  1/2, payee des que sa portion est validee), un virage compte comme un
 *  segment. La finalisation d'un trace ouvert ne coute donc rien de plus. */
function wallLayoutCost(layout: TraceLayout): number {
  let units = layout.waiting.length / 2;
  for (const p of layout.pieces) units += p.kind === 'half' ? 0.5 : 1;
  return units;
}

/** Cases d'une piece de trace. */
function tracePieceCells(p: { cornerX: number; cornerZ: number; tilesX: number; tilesZ: number }): string[] {
  const cells: string[] = [];
  for (let dz = 0; dz < p.tilesZ; dz++) for (let dx = 0; dx < p.tilesX; dx++) cells.push(`${p.cornerX + dx},${p.cornerZ + dz}`);
  return cells;
}

function wallTraceStep(wallId: string, before: TraceLayout, after: TraceLayout, interiorSign: number, team: Team): WallTraceStep {
  const orient = (p: WallTracePiece): TracedWallPiece => tracedWallPiece(wallId, p, interiorSign, team);
  const key = (p: WallTracePiece): string => `${p.kind}:${p.cornerX},${p.cornerZ},${p.tilesX},${p.tilesZ}`;
  const beforeKeys = new Set(before.pieces.map(key));
  const afterKeys = new Set(after.pieces.map(key));
  const unitCost = getEffectiveBuildingCost(wallId);
  const cost = roundGold(unitCost * (wallLayoutCost(after) - wallLayoutCost(before)));
  // Prix "neuf" des seules cases nouvellement couvertes (½ par case droite,
  // 1 par virage) : le reste du cout paie la recomposition de l'existant.
  const beforeCells = new Set([...before.pieces.flatMap(tracePieceCells), ...before.waiting.map((c) => `${c.x},${c.z}`)]);
  let freshUnits = after.waiting.filter((c) => !beforeCells.has(`${c.x},${c.z}`)).length / 2;
  for (const p of after.pieces) {
    const fresh = tracePieceCells(p).filter((c) => !beforeCells.has(c)).length;
    freshUnits += p.kind === 'corner' ? fresh : fresh / 2;
  }
  return {
    removed: before.pieces.filter((p) => !afterKeys.has(key(p))).map(orient),
    added: after.pieces.filter((p) => !beforeKeys.has(key(p))).map(orient),
    all: after.pieces.map(orient),
    waiting: after.waiting,
    cost,
    joinCost: Math.max(0, roundGold(cost - unitCost * freshUnits)),
  };
}

/** Portion de trace vers le curseur, orientee. Interieur : polygone si la
 *  portion ferme l'enceinte, sinon cote de `reference` (la Baliste du
 *  joueur). */
function planTracedWallLeg(wallId: string, trace: WallTrace, x: number, z: number, reference: { x: number; z: number } | null, team: Team, join: WallPath | null = null): { leg: WallTraceLeg; step: WallTraceStep } {
  const leg = planWallTraceLeg(trace, x, z, join);
  const vertices = join ? [...trace.vertices, ...join.vertices] : leg.closes ? trace.vertices : [...trace.vertices, leg.end];
  const dirs = join ? [...trace.dirs, leg.dir, ...join.dirs] : [...trace.dirs, leg.dir];
  const sign = traceInteriorSign(vertices, dirs, leg.closes, reference);
  return { leg, step: wallTraceStep(wallId, leg.before, leg.after, sign, team) };
}

/** Trace termine sans fermeture : ses cases en attente deviennent des
 *  pieces droites (meme orientation que le reste du trace). */
function finalizeTracedWall(wallId: string, trace: WallTrace, reference: { x: number; z: number } | null, team: Team): WallTraceStep {
  const { before, after } = finalizeWallTrace(trace);
  return wallTraceStep(wallId, before, after, traceInteriorSign(trace.vertices, trace.dirs, false, reference), team);
}

/** Batiment pose qui porte une piece de trace : meme emprise, meme famille
 *  (virage, demi-segment, ou segment droit — mur ou porte posee a sa place). */
function isTracedBuildingFor(b: PlacedBuildingRef, p: TracedWallPiece): boolean {
  const def = getBuilding(b.buildingId);
  const family = def.nativeModelPose ? 'corner' : def.modelLengthScale ? 'half' : 'straight';
  return family === p.kind && sameBuildingFootprint(p.buildingId, p.cornerX + p.tilesX / 2, p.cornerZ + p.tilesZ / 2, p.rotationY, b.buildingId, b.x, b.z, b.rotationY ?? 0);
}

/** Reoriente les batiments deja poses d'un trace (nouvelle liste, jamais une
 *  mutation : les instantanes d'historique de l'editeur partagent les
 *  anciens objets). Un mur ou une porte a la meme emprise qu'un segment prend
 *  sa rotation ; un virage peut changer de variante. */
function reorientTracedBuildings<T extends PlacedBuildingRef>(placed: readonly T[], pieces: readonly TracedWallPiece[]): T[] {
  return placed.map((b) => {
    const p = pieces.find((q) => isTracedBuildingFor(b, q));
    if (!p) return b;
    const buildingId = getBuilding(b.buildingId).nativeModelPose ? p.buildingId : b.buildingId;
    if (buildingId === b.buildingId && (b.rotationY ?? 0) === p.rotationY) return b;
    return { ...b, buildingId, rotationY: p.rotationY };
  });
}

/** Batiments a retirer pour un passage de disposition (pieces re-appariees). */
function tracedBuildingsToRemove<T extends PlacedBuildingRef>(placed: readonly T[], step: WallTraceStep): T[] {
  return step.removed.flatMap((p) => placed.filter((b) => isTracedBuildingFor(b, p)));
}

/** Vrai si l'etape devrait recomposer une PORTE : jamais (raccord refuse,
 *  il faut prolonger droit d'abord). */
function wallStepTouchesGate(placed: readonly PlacedBuildingRef[], step: WallTraceStep): boolean {
  return tracedBuildingsToRemove(placed, step).some((b) => getBuilding(b.buildingId).gate);
}

/** Famille de reseau d'un batiment pose (murailles), ou null. */
function wallNetKind(buildingId: string): WallNetPiece['kind'] | null {
  const def = getBuilding(buildingId);
  if (def.nativeModelPose) return 'corner';
  if (def.modelLengthScale) return 'half';
  if (def.gate) return 'gate';
  return def.placementMode === 'line' ? 'straight' : null;
}

/** Reseau de murailles (core/wallTrace.ts) d'une liste de batiments poses :
 *  connecteurs DERIVES de leur emprise et de leur rotation (aucun etat de
 *  session : marche apres un rechargement). */
function wallNetworkOf(placed: readonly PlacedBuildingRef[]): WallNetPiece[] {
  return placed.flatMap((b) => {
    const kind = wallNetKind(b.buildingId);
    if (!kind) return [];
    const { tilesX, tilesZ } = buildingFootprintTiles(b.buildingId, b.rotationY ?? 0);
    return [wallNetPiece(kind, b.x - tilesX / 2, b.z - tilesZ / 2, tilesX, tilesZ, b.rotationY ?? 0)];
  });
}

/** Piece de trace equivalente a une piece posee (etat courant d'une reprise ;
 *  une porte compte comme un segment droit). */
function netTracePiece(p: WallNetPiece): WallTracePiece {
  const base = { cornerX: p.cornerX, cornerZ: p.cornerZ };
  if (p.kind === 'corner') return { kind: 'corner', ...base, tilesX: 1, tilesZ: 1, inDir: { x: -p.connectors[0].dir.x, z: -p.connectors[0].dir.z }, outDir: p.connectors[1].dir };
  if (p.kind === 'half') return { kind: 'half', ...base, tilesX: 1, tilesZ: 1, dir: p.connectors[1].dir };
  return { kind: 'straight', ...base, tilesX: p.tilesX, tilesZ: p.tilesZ, dir: p.connectors[1].dir };
}

/** Extremites ouvertes raccordables, hors pieces du trace en cours. */
function joinableWallEnds(net: readonly WallNetPiece[], trace: WallTrace | null): WallEnd[] {
  const own = new Set((trace?.current.pieces ?? []).map((p) => `${p.cornerX},${p.cornerZ},${p.tilesX},${p.tilesZ}`));
  return openWallEnds(net).filter((e) => {
    const p = net[e.piece]!;
    return !own.has(`${p.cornerX},${p.cornerZ},${p.tilesX},${p.tilesZ}`);
  });
}

/** Extremite sur laquelle le curseur s'aimante : sa case, ou la case libre
 *  juste apres son connecteur. La plus proche du curseur. */
function wallEndNear(ends: readonly WallEnd[], x: number, z: number): WallEnd | null {
  const cell = traceCellAt(x, z);
  let best: WallEnd | null = null;
  let bestDistance = Infinity;
  for (const e of ends) {
    const onEnd = cell.x === e.cell.x && cell.z === e.cell.z;
    const beyond = cell.x === e.cell.x + e.dir.x && cell.z === e.cell.z + e.dir.z;
    if (!onEnd && !beyond) continue;
    const d = Math.hypot(x - (e.cell.x + 0.5 + e.dir.x * 0.5), z - (e.cell.z + 0.5 + e.dir.z * 0.5));
    if (d < bestDistance) {
      bestDistance = d;
      best = e;
    }
  }
  return best;
}

/** Trace qui reprend la muraille de l'extremite `end`. */
function resumeTraceAt(net: readonly WallNetPiece[], end: WallEnd): WallTrace | null {
  const chain = wallChainTo(net, end);
  return chain ? resumeWallTrace(chain, chain.pieces.map((i) => netTracePiece(net[i]!))) : null;
}

/** Jonction possible : extremite d'une AUTRE muraille sous le curseur,
 *  alignee avec l'ancre du trace. */
function wallJoinAt(net: readonly WallNetPiece[], trace: WallTrace, x: number, z: number): { end: WallEnd; path: WallPath } | null {
  const end = wallEndNear(joinableWallEnds(net, trace), x, z);
  if (!end || (end.cell.x !== trace.anchor.x && end.cell.z !== trace.anchor.z)) return null;
  const chain = wallChainTo(net, end);
  return chain ? { end, path: joinWallPath(chain, chain.pieces.map((i) => netTracePiece(net[i]!))) } : null;
}

/** Reperes des extremites raccordables, l'extremite aimantee en evidence. */
function addWallEndMarkers(group: THREE.Group, ends: readonly WallEnd[], snapped: WallEnd | null): void {
  for (const e of ends) group.add(buildWallEndMarker(e.cell.x, e.cell.z, e.dir.x, e.dir.z, e === snapped));
}

/** Batiment pose (possede, de scenario ou de l'editeur) : ce qu'il faut pour
 *  raccorder visuellement les virages de murailles. */
interface PlacedBuildingRef {
  buildingId: string;
  x: number;
  z: number;
  rotationY?: number;
}

function wallJoinPiece(buildingId: string, x: number, z: number, rotationY: number): WallJoinPiece {
  const { tilesX, tilesZ } = buildingFootprintTiles(buildingId, rotationY);
  return { cornerX: x - tilesX / 2, cornerZ: z - tilesZ / 2, tilesX, tilesZ };
}

/** Emprise de collision et modele d'un batiment GAMEPLAY centre en (x, z) :
 *  la meme pour un batiment possede, un batiment de scenario de l'editeur
 *  et son instance dans « Tester le scénario ». `team` (camp proprietaire)
 *  ne sert qu'a orienter la face exterieure d'une muraille vers les
 *  hostiles (outerFaceTowardHostiles) ; il ne change jamais l'emprise. */
function gameplayBuildingObstacle(
  buildingId: string,
  x: number,
  z: number,
  rotationY = 0,
  team: Team = 'player',
  /** Batiments poses du meme ensemble (run, scenario, brouillon) : un segment
   *  de muraille y cherche ses virages (ObstacleDef.wallJoin). Absent : aucun
   *  raccord (fantomes de pose). */
  neighbors?: readonly PlacedBuildingRef[],
): ObstacleDef {
  const def = getBuilding(buildingId);
  // Emprise tournee par quarts de tour pour une muraille (voir
  // buildingFootprintTiles), fixe pour les autres batiments.
  const { tilesX, tilesZ } = buildingFootprintTiles(buildingId, rotationY);
  return {
    kind: 'building',
    buildingModel: def.buildingModel,
    tilesX,
    tilesZ,
    x,
    z,
    rotationY,
    scale: def.modelScale,
    ...(def.footprintFollowsRotation ? { footprintFollowsRotation: true } : {}),
    ...(def.blocksShots === false ? { blocksShots: false } : {}),
    ...(def.nativeModelPose ? { nativeModelPose: def.nativeModelPose } : {}),
    ...(def.modelLengthScale ? { modelLengthScale: def.modelLengthScale } : {}),
    // Face exterieure (+Z natif du modele) vers les hostiles : -Z pour le
    // joueur (demi-tour), +Z pour l'ennemi (modele tel quel).
    ...(def.outerFaceTowardHostiles ? { modelFacingYaw: teamFacingYaw(team) } : {}),
    // Segments de muraille (emprise qui suit la rotation) : raccord visuel
    // des virages avec les segments perpendiculaires voisins.
    ...(def.footprintFollowsRotation && neighbors
      ? {
          wallJoin: wallEndJoins(
            wallJoinPiece(buildingId, x, z, rotationY),
            neighbors.filter((n) => getBuilding(n.buildingId).footprintFollowsRotation).map((n) => wallJoinPiece(n.buildingId, n.x, n.z, n.rotationY ?? 0)),
          ),
        }
      : {}),
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
/** Le curseur vise-t-il la base de la Baliste en preparation ? Seule son
 *  empreinte au sol compte (ballistaObstacleDef : la meme collision que celle
 *  qui bloque le placement des unites), jamais la silhouette haute de la
 *  tour : un clic sur sa partie haute dont le point au sol tombe ailleurs
 *  reste un geste normal (rectangle, deplacement). Un modele d'unite touche
 *  par le rayon garde la priorite. */
function isBallistaHoveredInPlacement(event: MouseEvent): boolean {
  const point = computeGroundPoint(event);
  if (!point) return false;
  const b = obstacleBounds(ballistaObstacleDef);
  if (!(point.x > b.minX && point.x < b.maxX && point.z > b.minZ && point.z < b.maxZ)) return false;
  return findHoveredSlot(event) === null;
}

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
 * (agrandissement en cours de run) et resetGameBoardToSurvivalMap (retour a
 * la carte de depart pour une run neuve, voir startNewRun) : les deux
 * situations impliquent exactement la meme reconstruction. N'appelle
 * JAMAIS world.setMap()/refreshOwnedBuildingViews() elle-meme — les
 * appelants savent chacun ce qui est necessaire en plus (ex. translater
 * currentRun.buildings AVANT de rafraichir leurs meshes, pertinent
 * seulement pour une vraie expansion, jamais pour un reset).
 */
async function rebuildGameBoardVisuals(spawnDepth: number): Promise<void> {
  // Position de la Baliste de la run (currentRun.ballistaPosition, fixee au
  // demarrage depuis la carte, voir startNewRun, puis reculee avec le camp
  // joueur a chaque etape C) ; hors run, celle de la carte.
  playerArrowOrigin = currentRun.ballistaPosition ?? resolveBallistaOrigin(currentMap);
  ballistaObstacleDef = computeBallistaObstacle(playerArrowOrigin);
  repositionBallista();

  // Grille masquee par defaut : startPlacement() (qui s'execute juste apres,
  // une fois le joueur sorti de l'ecran de fin de vague/la boutique) la rend
  // visible. Les zones de territoire restent affichees sans interruption,
  // en preparation comme en bataille : le nouveau plateau les montre deja.
  renderer.scene.remove(board.group);
  board = await createBoard(currentMap, spawnDepth);
  board.gridLines.visible = false;
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
  rebuildCurrentTerritoryIndex();

  // Batiments POSSEDES et Baliste de la run : translates SEULEMENT par
  // l'ETAPE C (offsetForZ vaut toujours 0 pour spawnBack/sides — voir
  // run/mapExpansion.ts), avec le camp joueur qui recule d'une case. MEME
  // fonction centralisee que le terrain et les decors.
  for (const owned of currentRun.buildings) owned.z += result.offsetForZ(owned.z);
  if (currentRun.ballistaPosition) {
    const ballista = currentRun.ballistaPosition;
    currentRun.ballistaPosition = { x: ballista.x, z: ballista.z + result.offsetForZ(ballista.z) };
  }

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
async function resetGameBoardToSurvivalMap(): Promise<void> {
  currentMap = SURVIVAL_BASE_MAP;
  rebuildCurrentTerritoryIndex();
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

/** Bilan de la manche en cours (run/battleSummary.ts) : ennemis vaincus par
 *  type et or GAGNE pendant la manche (morts ennemies, productions des
 *  Mines, bonus de victoire), affiche sur l'ecran de fin de vague. Remis a
 *  zero au lancement de chaque vraie bataille (onValidatePlacement). */
let battleSummary = createBattleSummary();

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

/** Production des Mines pendant une vraie bataille (voir la boucle de jeu) :
 *  temps de bataille ecoule depuis la derniere production de chaque Mine,
 *  par id d'entite. Vide a chaque world.clear() (memes sites que
 *  rewardedEnemyDeaths). */
const mineProductionTimers = new Map<number, number>();
/** Productions deja faites par chaque Mine pendant la bataille en cours, par
 *  id d'entite (plafond mineMaxProductionsPerWave). Videe avec
 *  mineProductionTimers : le compteur repart de 0 a chaque manche. */
const mineProductionCounts = new Map<number, number>();
/** Tirage du montant de chaque production : RNG a graine, re-semee a chaque
 *  debut de bataille reelle depuis la graine du World (deterministe), jamais
 *  Math.random. */
let mineGoldRng = new Rng(1);

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

/** Niveau propre a chaque unite de la bataille en cours, par id d'entite,
 *  pour la fiche d'inspection (l'Entity ne le porte pas) : niveau de vague
 *  d'un ennemi (rempli aux memes spawns que enemyStatOverrides, donc jamais
 *  en "Tester le scenario"), niveau de production d'une unite du joueur.
 *  Absent pour un type sans amelioration. Vide a chaque world.clear()
 *  (forgetBattleBuildings). */
const battleUnitLevels = new Map<number, number>();

function rememberEnemyUnitLevel(entity: Entity, waveNumber: number): void {
  const level = enemyUnitUpgradeLevel(entity.unitId, waveNumber);
  if (level !== null) battleUnitLevels.set(entity.id, level);
}

/** Unite du joueur : son niveau de production, fige a sa creation. */
function rememberPlayerUnitLevel(entity: Entity, productionLevel: number): void {
  battleUnitLevels.set(entity.id, productionLevel);
}

// --- Economie / progression de run (chantier en cours — voir CLAUDE.md) -
//
// L'or et l'armee possedee survivent d'une vague a l'autre TANT QUE le
// joueur reste dans la meme run (roguelite classique, confirme par Antoine :
// une unite blessee reste blessee jusqu'au soin, une unite morte est perdue
// pour de bon). Une nouvelle run (reset complet) ne demarre qu'au clic sur
// "Jouer" depuis le menu principal (voir startNewRun) — continuer apres la
// boutique reutilise la MEME run, juste la vague suivante.
let currentRun = createFreshRun();

/** Territoire courant du jeu (config/territory.ts) : SOURCE UNIQUE de la zone
 *  de placement du joueur, lue par isValidPlacementTile. Territoire
 *  explicite de currentMap s'il existe, sinon bandes historiques derivees de
 *  currentMap + spawnDepth de la run (resolveMapTerritory). Un territoire
 *  explicite ne suit pas encore l'expansion de la carte. Reconstruit par
 *  rebuildCurrentTerritoryIndex a chaque changement de l'une de ces deux sources, jamais par validation ni
 *  par image. `map`/`spawnDepth` memorisent les sources de l'index, pour
 *  detecter un index perime (voir currentTerritoryIndex). */
interface CurrentTerritory {
  index: TerritoryIndex;
  map: MapDef;
  spawnDepth: number;
}
let currentTerritory = deriveCurrentTerritory();

function deriveCurrentTerritory(): CurrentTerritory {
  const spawnDepth = currentRun.mapExpansion.spawnDepth;
  return { index: buildTerritoryIndex(resolveMapTerritory(currentMap, spawnDepth)), map: currentMap, spawnDepth };
}

/** A appeler juste apres tout changement de currentMap ou de
 *  currentRun.mapExpansion.spawnDepth. */
function rebuildCurrentTerritoryIndex(): void {
  currentTerritory = deriveCurrentTerritory();
}

/** Index du territoire courant. Garde-fou : si un changement de source a
 *  oublie de reconstruire l'index, il est reconstruit ici (avec un
 *  avertissement en console) plutot que de valider contre une zone perimee. */
function currentTerritoryIndex(): TerritoryIndex {
  if (currentTerritory.map !== currentMap || currentTerritory.spawnDepth !== currentRun.mapExpansion.spawnDepth) {
    console.warn('Index de territoire perime : reconstruit.');
    rebuildCurrentTerritoryIndex();
  }
  return currentTerritory.index;
}

/** Nouvelle run : aucune amelioration (elles s'achetent en Or a la Forge
 *  pendant la run) ; aucun niveau n'est conserve d'une run a l'autre. */
function createFreshRun(): RunState {
  const upgrades: RunUpgradeLevels = {};
  return createNewRun(computeStartingGoldBonus(metaProgress), playerUnitMaxHp('fantassin', 0), upgrades);
}

/** SOURCE UNIQUE de la progression du joueur pour les statistiques
 *  effectives : talents permanents (metaProgress) et niveaux d'amelioration
 *  de la run (currentRun.upgrades). "Tester le scenario", qui n'est pas une
 *  run, se joue sans amelioration. Toujours relue : currentRun change a
 *  chaque nouvelle run. */
function playerProgression(): PlayerProgression {
  return { talents: metaProgress, upgrades: inTestMode ? {} : currentRun.upgrades };
}
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

/** Bataille de "Tester le scenario" : bataille immediate, sans phase de
 *  placement, avec les unites de la carte et une VRAIE Baliste (batiment de
 *  simulation : PV, collision, condition de defaite), exactement comme en
 *  vraie bataille. `playerArrowOrigin` et `ballistaObstacleDef` doivent avoir
 *  ete calcules par l'appelant (voir testScenario), apres world.setMap. */
function setupTestBattle(): void {
  resetBattleControls();
  world.clear();
  forgetBattleBuildings();
  rewardedEnemyDeaths.clear();
  belowAutoHealThreshold.clear();
  mineProductionTimers.clear();
  mineProductionCounts.clear();
  pendingArrowSpawns.length = 0;
  unitViews.clear();
  combatOverlay.clear();
  projectiles.clear();
  playerArrowView.clear();
  telegraphView.clear();
  fireballView.clear();
  iceNovaView.clear();
  healVfxView.clear();
  moveOrderFeedback.clear();
  tauntVfxView.clear();
  shadowProjectileView.clear();
  battleOver = false;

  for (const pos of currentMap.playerUnits) {
    const level = currentProductionLevel(playerProgression().upgrades, pos.unitId);
    const spawned = world.spawn(
      pos.unitId,
      'player',
      pos.x,
      pos.z,
      undefined,
      playerUnitStatOverrides(pos.unitId, level, playerProgression()),
      playerUnitAbilityDamageBonus(pos.unitId, level),
      playerUnitTauntShieldBonus(pos.unitId, level),
    );
    rememberPlayerUnitLevel(spawned, level);
  }
  for (const pos of currentMap.enemyUnits) world.spawn(pos.unitId, 'enemy', pos.x, pos.z);
  // Batiments gameplay du scenario (editeur, MapDef.buildings) : de VRAIES
  // entites au niveau 1 (PV, collision, fonction), apres les unites comme
  // les batiments possedes en vraie bataille.
  clearScenarioBuildingMeshes();
  for (const placed of currentMap.buildings ?? []) {
    const obstacle = gameplayBuildingObstacle(placed.buildingId, placed.x, placed.z, placed.rotationY ?? 0, placed.team, currentMap.buildings);
    const entity = world.spawnBuilding(getBuilding(placed.buildingId), placed.team, placed.x, placed.z, obstacle);
    const mesh = buildObstacleMesh(obstacle, environmentAssets);
    renderer.scene.add(mesh);
    scenarioBuildingMeshes.push(mesh);
    buildingViewsByEntityId.set(entity.id, new BuildingView(mesh, buildingVfxGroup));
    scenarioBuildingEntityIds.add(entity.id);
  }
  // Apres les unites, comme en vraie bataille (voir onValidatePlacement).
  spawnBallistaBuilding();
  // Apres la Baliste : son empreinte compte dans le pas d'ouverture.
  openBattleWithFormationStep();
}

/** Unites du joueur en Garde (commande `stop`, appliquee au prochain pas) :
 *  elles restent sur place et ne reagissent qu'a un ennemi entrant dans leur
 *  aggro, ou a un ordre. Les ennemis gardent leur avance autonome
 *  (`assault`). Sans `entityIds`, toutes les unites vivantes du joueur. */
function holdPlayerUnitsInGuard(entityIds?: readonly number[]): void {
  const ids = entityIds ?? world.entities.filter((e) => e.alive && e.team === 'player' && !e.isBuilding).map((e) => e.id);
  if (ids.length > 0) world.issueCommand({ kind: 'stop', entityIds: ids });
}

/** Unites ayant recu le pas d'ouverture de la bataille en cours : leur
 *  ordre de deplacement n'affiche pas de retour visuel (ce n'est pas un ordre
 *  du joueur). Vide au premier pas, ou les commandes sont appliquees. */
const openingStepEntityIds = new Set<number>();

/**
 * Debut de bataille (vraie ou "Tester le scenario") : toute la formation du
 * joueur avance d'exactement une case vers l'ennemi (forwardDir), offsets
 * conserves, puis passe en Garde a l'arrivee (fin normale d'un ordre
 * `move`). Une courte mise en mouvement, jamais une charge : aucune cible
 * ennemie n'est assignee. Tout ou rien, pour ne jamais deformer la
 * formation : si une seule case d'arrivee est invalide (hors terrain,
 * obstacle bloquant — decor, batiment, Baliste — ou unite immobile), tout
 * le groupe reste en place et passe directement en Garde. Un ordre `move`
 * `exact` par unite vers SA case : un ordre de groupe redistribuerait les
 * places, un ordre ordinaire s'arreterait a la tolerance du rayon.
 * Les unites produites ensuite par une Caserne n'en font pas partie.
 */
function openBattleWithFormationStep(): void {
  openingStepEntityIds.clear();
  const group = world.entities.filter((e) => e.alive && e.team === 'player' && !e.isBuilding);
  if (group.length === 0) return;
  const dz = forwardDir('player') * TILE;
  const groupIds = new Set(group.map((e) => e.id));
  const cells = new Set(resolveMapCells(currentMap).map((c) => cellKey(c.x, c.z)));
  const blockers = world.obstacles.map(obstacleBounds);
  const others = world.entities.filter((e) => e.alive && !e.isBuilding && !groupIds.has(e.id));
  const canEndAt = (x: number, z: number): boolean =>
    cells.has(cellKey(Math.floor(x), Math.floor(z))) &&
    !blockers.some((b) => x > b.minX && x < b.maxX && z > b.minZ && z < b.maxZ) &&
    !others.some((e) => Math.floor(e.x) === Math.floor(x) && Math.floor(e.z) === Math.floor(z));
  if (!group.every((e) => canEndAt(e.x, e.z + dz))) {
    holdPlayerUnitsInGuard(group.map((e) => e.id));
    return;
  }
  for (const e of group) {
    openingStepEntityIds.add(e.id);
    world.issueCommand({ kind: 'move', entityIds: [e.id], x: e.x, z: e.z + dz, exact: true });
  }
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
function computeEnemyWavePlan(waveNumber: number, map: MapDef): EnemyReinforcementPlan {
  // Mini-vagues : composition inchangee, decoupee en groupes de 5 au plus
  // (run/enemyWaveGroups.ts). Chaque groupe garde sa propre formation
  // centree au front de la zone ennemie (melee devant, distance derriere,
  // voir layoutFormation) ; la simulation decale une unite sur la case libre
  // la plus proche si sa place est prise (sim/systems/enemyReinforcements.ts).
  const groups = splitEnemyWaveComposition(computeEnemyWaveComposition(waveNumber));
  const halfW = (map.width * TILE) / 2;
  const halfH = (map.height * TILE) / 2;
  // spawnDepth DYNAMIQUE — voir computeArmyFormation ci-dessus, meme raisonnement.
  const spawnDepth = currentRun.mapExpansion.spawnDepth;
  const enemyFrontZ = -halfH + spawnDepth * TILE - 0.5;
  const perRow = Math.max(1, map.width - 2);
  return {
    groups: groups.map((unitIds) => {
      const positions = layoutFormation(unitIds, enemyFrontZ, -TILE, perRow);
      return unitIds.map((unitId, i) => ({ unitId, x: positions[i]!.x, z: positions[i]!.z }));
    }),
    delayTicks: enemyGroupDelayTicks(groups.length),
    emptyFieldTicks: enemyEmptyFieldSpawnTicks(),
    zone: { minX: -halfW, maxX: halfW, minZ: -halfH, maxZ: -halfH + spawnDepth * TILE },
  };
}

/** Cree les ennemis d'un groupe de renfort avec les stats de la vague en
 *  cours — meme traitement que l'ancien spawn d'un bloc de la vague. */
function spawnEnemyReinforcements(spawns: EnemyReinforcementSpawn[]): void {
  for (const spawn of spawns) {
    const enemy = world.spawn(
      spawn.unitId,
      'enemy',
      spawn.x,
      spawn.z,
      undefined,
      enemyStatOverrides(spawn.unitId, currentRun.waveNumber),
      enemyAbilityDamageBonus(spawn.unitId, currentRun.waveNumber),
    );
    rememberEnemyUnitLevel(enemy, currentRun.waveNumber);
  }
}

/** Indicateur de vague : total et nombre de groupes en preparation, groupes
 *  restants en bataille. */
function refreshWaveIndicator(): void {
  if (inPlacementPhase) {
    const plan = computeEnemyWavePlan(currentRun.waveNumber, currentMap);
    const total = plan.groups.reduce((sum, group) => sum + group.length, 0);
    waveIndicator.update(currentRun.waveNumber, plan.groups.length > 1 ? `${total} ennemis · ${plan.groups.length} groupes` : `${total} ennemis`);
    return;
  }
  const pending = world.pendingEnemyGroups();
  waveIndicator.update(currentRun.waveNumber, pending > 0 ? `Renforts : ${pending} groupe${pending > 1 ? 's' : ''}` : undefined);
}

interface PlacementSlot {
  unitId: string;
  x: number | null;
  z: number | null;
  /** PV actuels a spawner (voir World.spawn) — une unite blessee survivante
   *  d'une vague precedente reste blessee tant qu'elle n'est pas soignee. */
  hp: number;
  /** Niveau de production de l'unite (OwnedUnit.productionLevel), fige. */
  productionLevel: number;
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
   *  le groupe d'un bloc plutot que ce seul slot — le slot saisi arrive
   *  sous le curseur, le groupe suit (voir placementDragProposal). */
  groupIndices: number[] | null;
  startClientX: number;
  startClientY: number;
  dragging: boolean;
  /** Maj enfoncee a l'appui : un clic sans glisser ajoute ou retire l'unite
   *  de la selection (toggleSlotSelection) au lieu de la selection simple. */
  shift: boolean;
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
 *  "toutes celles du meme type", voir selectVisibleSameTypeEditorUnits).
 *  Etat separe de lastUnitClickSlot/lastUnitClickTime : placement et
 *  editeur ne sont jamais actifs en meme temps, mais partagent le meme id
 *  d'objet (nextId commun, voir EditorState) — reutiliser le meme etat
 *  risquerait une collision accidentelle entre les deux contextes. */
let lastEditorUnitClickId: number | null = null;
let lastEditorUnitClickTime = 0;

/** Double-clic : selectionne toutes les unites du MEME TYPE que
 *  `hoveredSlot` VISIBLES a l'ecran (projetees dans le canvas), comme en
 *  bataille et dans l'editeur — jamais celles hors champ. Sans plafond.
 *  Devient une selection de groupe normale, sauf s'il n'y a qu'UNE seule
 *  unite de ce type (simple selection dans ce cas, meme convention que
 *  selectUnitsInRect avec un seul resultat). Trie par distance au point de
 *  reference par pure coherence visuelle (le groupe le plus proche
 *  d'abord). */
function selectSameTypeGroup(hoveredSlot: number): void {
  const origin = placementSlots[hoveredSlot]!;
  const viewport = canvas.getBoundingClientRect();
  const sameType = placementSlots
    .map((slot, i) => ({ i, slot }))
    .filter(({ slot }) => slot.unitId === origin.unitId && slot.x !== null && slot.z !== null)
    .filter(({ slot }) => isInScreenRect(worldToScreen(slot.x!, slot.z!), viewport))
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
  unitMovePreview.hide();
}

/** Glisser sur le SOL (pas sur une unite) pendant le placement : au-dela du
 *  seuil, dessine un rectangle de selection (voir SelectionBox) plutot que
 *  de deplacer quoi que ce soit. Resolu au relachement (voir le listener
 *  mouseup plus bas, selectUnitsInRect). */
interface GroundDragState {
  startClientX: number;
  startClientY: number;
  dragging: boolean;
  /** Maj enfoncee a l'appui : un clic sans glisser ne fait rien (ni
   *  deplacement ni deselection), comme Maj + clic dans le vide en bataille. */
  shift: boolean;
  /** Unite occupant la case sous le curseur a l'appui, quand le rayon a
   *  manque son modele (voir findFallbackSlot) : un clic sans glisser la
   *  selectionne ; un glisser reste un rectangle. */
  fallbackSlot: number | null;
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

/** Apercu de deplacement d'unites sur la grille (empreintes vertes/rouges et
 *  silhouettes translucides), partage par la preparation et l'editeur : voir
 *  updateMovePreview. */
const unitMovePreview = new UnitMovePreview();
renderer.scene.add(unitMovePreview.group);

/** Reticule de vise au sol pour la fleche du joueur : suit la souris pendant
 *  la bataille, s'assombrit pendant le cooldown pour signaler qu'un tir n'est
 *  pas encore possible (voir updateAimReticle). */
/** Vrai si le point (x, z) est a portee de la Baliste (PLAYER_ARROW_RANGE). */
function isBallistaAimInRange(x: number, z: number): boolean {
  return dist(playerArrowOrigin.x, playerArrowOrigin.z, x, z) <= PLAYER_ARROW_RANGE;
}

/** Teinte du reticule quand le point vise est hors de portee. */
const AIM_RETICLE_OUT_OF_RANGE_COLOR = 0xd9534f;

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

/** Anneau plat de la cible de soin (voir healTargetRing). Distinct de
 *  l'anneau de selection des unites (render/unitSelectionRing.ts). */
function createHealTargetRing(): THREE.Mesh {
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
  return slot.hp < 0.5 * playerUnitMaxHp(slot.unitId, slot.productionLevel);
}

/** Anneau de PREVISUALISATION de la cible de soin (2026-08-11, demande
 *  d'Antoine : "le curseur n'est pas tres clair quant a l'unite soignee") —
 *  un objet INDEPENDANT ajoute une seule fois a la scene et simplement
 *  repositionne/masque a chaque survol, plutot qu'un enfant reconstruit avec
 *  le reste de playerPreview. Voir updateHealTargetPreview. */
const healTargetRing = createHealTargetRing();
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
    healTargetRing.position.set(pos.x, 0.02 + surfaceY(pos.x, pos.z), pos.z);
    healTargetRing.visible = true;
  } else if (inPlacementPhase) {
    const slotIndex = findHealTargetSlotIndex(point.x, point.z);
    if (slotIndex === null) return;
    const slot = placementSlots[slotIndex]!;
    healTargetRing.position.set(slot.x ?? 0, 0.02 + surfaceY(slot.x ?? 0, slot.z ?? 0), slot.z ?? 0);
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
  const upgrade = computePlayerIceNovaUpgradeEffects(playerProgression().upgrades);
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

  const { damagePerProjectileInternal, bonusProjectileCount } = computePlayerShadowEffects(playerProgression().upgrades);
  const count = baseProjectileCount + bonusProjectileCount;
  world.spawnShadowProjectiles(x, z, 'player', count, damagePerProjectileInternal, SHADOW_PROJECTILE_SPEED);
}

function refreshPlayerPreview(): void {
  playerPreview.clear();
  placementSlots.forEach((slot, index) => {
    if (slot.x === null || slot.z === null) return;
    const mesh = buildUnit(slot.unitId, 'player');
    mesh.position.set(slot.x, surfaceY(slot.x, slot.z), slot.z);
    mesh.userData['slotIndex'] = index;
    if (isSelected(index)) attachUnitSelectionRing(mesh, 'player', getUnit(slot.unitId).stats.radius);
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
  refreshMovePreview();
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
    total += isRecyclageEligible(slot) ? Math.round(3 * playerUnitProductionCost(slot.unitId, slot.productionLevel)) : (KILL_REWARD[slot.unitId] ?? 0);
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

/** Enregistre un clic sur l'unite `index` pour la detection manuelle du
 *  double-clic, commune au clic sur le modele (a l'appui) et au clic par sa
 *  case (au relachement, voir findFallbackSlot). Renvoie vrai si ce clic
 *  complete un double-clic. Maj + clic n'est jamais un double-clic. */
function registerSlotClick(index: number, shift: boolean, now: number): boolean {
  if (shift) {
    lastUnitClickSlot = null;
    return false;
  }
  if (index === lastUnitClickSlot && now - lastUnitClickTime < DOUBLE_CLICK_WINDOW_MS) {
    lastUnitClickSlot = null;
    return true;
  }
  lastUnitClickSlot = index;
  lastUnitClickTime = now;
  return false;
}

/** Clic simple sur une unite : selection UNIQUE (remplace toujours une
 *  eventuelle selection de groupe en cours, point 16 de la demande) — sauf
 *  si CETTE unite etait deja la SEULE selectionnee, auquel cas le clic la
 *  desselectionne (toggle, comportement d'origine preserve). */
function selectSlot(index: number): void {
  setSelection(selectedIndices.length === 1 && selectedIndices[0] === index ? [] : [index]);
  refreshPlayerPreview();
}

/** Maj + clic sur une unite : l'ajoute a la selection si elle n'y est pas,
 *  l'en retire sinon (meme geste qu'en bataille et dans l'editeur). */
function toggleSlotSelection(index: number): void {
  setSelection(isSelected(index) ? selectedIndices.filter((i) => i !== index) : [...selectedIndices, index]);
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
  placementBallistaSelected = false;
  updateBuildingSelectionRing();
  clearSelection();
  playerPreview.clear();
  enemyPreview.clear();
  // La grille disparait en bataille ; les zones de territoire restent
  // affichees (meme filtre discret qu'en preparation).
  board.gridLines.visible = false;

  world.clear();
  forgetBattleBuildings();
  rewardedEnemyDeaths.clear();
  belowAutoHealThreshold.clear();
  mineProductionTimers.clear();
  mineProductionCounts.clear();
  mineGoldRng = new Rng((world.seed ^ 0x9e3779b9) >>> 0);
  battleSummary = createBattleSummary();
  pendingArrowSpawns.length = 0;
  unitViews.clear();
  combatOverlay.clear();
  projectiles.clear();
  playerArrowView.clear();
  telegraphView.clear();
  fireballView.clear();
  iceNovaView.clear();
  healVfxView.clear();
  moveOrderFeedback.clear();
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
    const spawned = world.spawn(
      slot.unitId,
      'player',
      slot.x,
      slot.z,
      slot.hp,
      playerUnitStatOverrides(slot.unitId, slot.productionLevel, playerProgression()),
      playerUnitAbilityDamageBonus(slot.unitId, slot.productionLevel),
      playerUnitTauntShieldBonus(slot.unitId, slot.productionLevel),
    );
    rememberPlayerUnitLevel(spawned, slot.productionLevel);
  }
  // Mini-vagues : seul le premier groupe apparait maintenant ; les suivants
  // sont crees a leur arrivee (enemyReinforcementSpawns, boucle de jeu).
  spawnEnemyReinforcements(world.startEnemyReinforcements(computeEnemyWavePlan(currentRun.waveNumber, currentMap)));
  refreshWaveIndicator();

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
    // PV max, degats (Tour) et quota de production de la manche (Caserne,
    // Camp d'archerie) du niveau PROPRE au batiment.
    const level = ownedBuildingLevel(owned);
    const entity = world.spawnBuilding(
      getBuilding(owned.buildingId),
      'player',
      owned.x,
      owned.z,
      ownedBuildingObstacle(owned),
      owned.hp,
      effectiveBuildingMaxHp(owned.buildingId, level),
      unitsProducedPerWave(owned.buildingId, level),
      effectiveBuildingAttackDamage(owned.buildingId, level),
    );
    const view = ownedBuildingViews[i]!.view;
    view.reset();
    buildingViewsByEntityId.set(entity.id, view);
    ownedBuildingIndexByEntityId.set(entity.id, i);
  });

  // La Baliste est TOUJOURS presente (jamais achetee, contrairement a la
  // Mine/la Caserne ci-dessus).
  spawnBallistaBuilding();
  // Apres les batiments et la Baliste : leurs empreintes comptent dans le
  // pas d'ouverture de la formation.
  openBattleWithFormationStep();

  loop.timeScale = 1;
}

/** Cree le batiment de simulation de la Baliste pour la bataille en cours —
 *  SOURCE UNIQUE partagee par une vraie bataille (onValidatePlacement) et
 *  "Tester le scenario" (setupTestBattle). A `playerArrowOrigin`, avec
 *  l'empreinte `ballistaObstacleDef` (meme position que le modele visuel et
 *  l'origine du tir : les trois doivent avoir ete calcules juste avant).
 *  PV max EFFECTIFS (2026-08-16, amelioration permanente "+10 PV/niveau" —
 *  voir run/ballistaUpgradeEffects.ts) : `hp` omis expres pour retomber sur
 *  ce plafond EFFECTIF (voir World.spawnBuilding) — sans ca, une Baliste
 *  amelioree apparaitrait avec plus de PV MAX mais pas plus de PV ACTUELS.
 *  Remet aussi le visuel a neuf (une Baliste detruite lors d'une bataille
 *  precedente redevient visible). */
function spawnBallistaBuilding(): void {
  ballistaBuildingView.reset();
  ballistaEntityId = world.spawnBuilding(
    getBuilding('ballista'),
    'player',
    playerArrowOrigin.x,
    playerArrowOrigin.z,
    ballistaObstacleDef,
    undefined,
    effectiveBallistaMaxHp(playerProgression().upgrades),
  ).id;
  buildingViewsByEntityId.set(ballistaEntityId, ballistaBuildingView);
}

/** A appeler a chaque `world.clear()` : les ids d'entites repartent de 1
 *  dans la bataille suivante, donc aucune reference a un batiment de la
 *  bataille videe ne doit survivre (l'ancien id de la Baliste ou d'une Mine
 *  pourrait designer une tout autre entite du test suivant), ni aucun niveau
 *  d'unite memorise (battleUnitLevels). Remet aussi le
 *  visuel de la Baliste dans son etat normal : detruite pendant la bataille
 *  videe, elle doit reapparaitre des la preparation suivante (ou le
 *  depart d'une nouvelle run, ou l'editeur), pas seulement au
 *  lancement de la prochaine bataille. Visuel seulement : l'entite et sa
 *  collision ne sont recreees que par spawnBallistaBuilding. */
/** Index dans currentRun.buildings de chaque batiment possede spawne pour la
 *  bataille en cours, par id d'entite (meme ordre de spawn, voir
 *  onValidatePlacement) : relie une Mine ou une Caserne de la bataille a son
 *  niveau propre (OwnedBuilding.level). */
const ownedBuildingIndexByEntityId = new Map<number, number>();

/** Niveau propre d'un batiment possede de la bataille en cours, ou null
 *  (Baliste, batiment hors run). */
function battleOwnedBuildingLevel(entity: Entity): number | null {
  if (scenarioBuildingEntityIds.has(entity.id)) return 0;
  const index = ownedBuildingIndexByEntityId.get(entity.id);
  const owned = index !== undefined ? currentRun.buildings[index] : undefined;
  return owned ? ownedBuildingLevel(owned) : null;
}

/** Batiments de scenario (MapDef.buildings) de « Tester le scénario » : ids
 *  d'entite (niveau 1 dans la fiche) et maillages, retires au retour a
 *  l'editeur. */
const scenarioBuildingEntityIds = new Set<number>();
const scenarioBuildingMeshes: THREE.Object3D[] = [];

function clearScenarioBuildingMeshes(): void {
  for (const mesh of scenarioBuildingMeshes) renderer.scene.remove(mesh);
  scenarioBuildingMeshes.length = 0;
}

function forgetBattleBuildings(): void {
  ballistaEntityId = null;
  buildingViewsByEntityId.clear();
  ownedBuildingIndexByEntityId.clear();
  scenarioBuildingEntityIds.clear();
  battleUnitLevels.clear();
  ballistaBuildingView.reset();
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
  waveIndicator.setVisible(true);
  goldHud.setVisible(true);
  populationHud.setVisible(true);

  const formation = computeArmyFormation(currentRun.army.map((u) => u.unitId), currentMap);
  placementSlots = currentRun.army.map((unit, i) => ({
    unitId: unit.unitId,
    x: formation[i]!.x,
    z: formation[i]!.z,
    hp: unit.hp,
    productionLevel: unit.productionLevel,
  }));
  clearSelection();
  refreshPlayerPreview();

  // Apercu : seulement le premier groupe, la menace presente au lancement ;
  // le total et le nombre de groupes sont dans l'indicateur de vague.
  refreshWaveIndicator();
  enemyPreview.clear();
  for (const pos of computeEnemyWavePlan(currentRun.waveNumber, currentMap).groups[0] ?? []) {
    const mesh = buildUnit(pos.unitId, 'enemy');
    mesh.position.set(pos.x, surfaceY(pos.x, pos.z), pos.z);
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
 *  qu'une nouvelle run (sa premiere preparation passe par
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
  placementBallistaSelected = false;
  updateBuildingSelectionRing();
  disarmItem();
  playerPreview.clear();
  enemyPreview.clear();
  refreshOwnedBuildingViews();
}

/** Clic sur "Mode survie" au menu principal : demarre une run TOUTE NEUVE (or et
 *  armee reinitialises, voir createNewRun) avant d'entrer en placement —
 *  contrairement a "Continuer" depuis la boutique, qui reutilise la run en
 *  cours pour passer a la vague suivante (voir startPlacement seul). */
function startNewRun(): void {
  currentRun = createFreshRun();
  // Baliste native (Mode survie) : creee directement a la position definie
  // par la carte officielle (MapDef.ballista), sans placement par le joueur.
  currentRun.ballistaPosition = resolveBallistaOrigin(SURVIVAL_BASE_MAP);
  rebuildCurrentTerritoryIndex();
  resetRunPlacementState();
  // Une run PRECEDENTE peut avoir agrandi le plateau (2026-08-18, voir
  // applyMapExpansionForCompletedWave) — currentMap est un module partage
  // entre runs, currentRun.mapExpansion vient de repartir de zero ci-dessus
  // mais currentMap/le rendu ne le savent pas encore : resynchronise AVANT
  // la preparation (jamais en parallele — startPlacement() lirait sinon un
  // plateau perime le temps de la reconstruction async). Reste synchrone
  // (`() => void`, signature exigee par ScreenHandlers.onPlay) : le cas
  // courant (carte de depart deja en place) demarre immediatement, seul le
  // retour d'une run agrandie attend la reconstruction. Plus de placement de
  // la tour : la preparation commence directement.
  if (currentMap === SURVIVAL_BASE_MAP) {
    applyRunBallistaPosition();
    frameRunCamera();
    startPlacement();
  } else {
    void resetGameBoardToSurvivalMap().then(() => {
      frameRunCamera();
      startPlacement();
    });
  }
}

/** Cadrage de la carte en jeu (debut de run, Espace) : angle par defaut,
 *  carte courante entiere dans la zone visible, entre les marges du HUD
 *  (l'arene du Mode survie, 21 × 36, depasse le zoom par defaut). */
function frameRunCamera(): void {
  renderer.resetCamera();
  renderer.frameBox({ ...computeMapCellBounds(resolveMapCells(currentMap)), height: 2 }, CAMERA.gameFrameMarginsPx);
}

/** Place la Baliste (modele, origine des tirs, collision) a la position de
 *  la run en cours, sans reconstruire le plateau. */
function applyRunBallistaPosition(): void {
  playerArrowOrigin = currentRun.ballistaPosition ?? resolveBallistaOrigin(currentMap);
  ballistaObstacleDef = computeBallistaObstacle(playerArrowOrigin);
  repositionBallista();
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

/** Batiment possede (Forge ou Eglise) donnant acces aux ameliorations de
 *  run de ce site (run/runUpgrades.ts, runUpgradeSite). Un batiment detruit
 *  a deja ete retire de currentRun.buildings (applyBattleOutcome). Plusieurs
 *  exemplaires ouvrent les MEMES ameliorations, sur les memes niveaux de run. */
function hasRunUpgradeSite(site: RunUpgradeSite): boolean {
  return currentRun.buildings.some((b) => b.buildingId === site);
}

/** Site de l'ecran d'ameliorations actuellement ouvert (Forge ou Eglise). */
let openRunUpgradeSite: RunUpgradeSite = 'forge';

/** Action de la fiche d'entite (ui/entityInfoPanel.ts). */
function onEntityInfoAction(id: EntityInfoAction['id']): void {
  if (id === 'toggleBallistaMode') {
    setBallistaFireMode(ballistaFireMode === 'auto' ? 'manual' : 'auto');
    return;
  }
  if (id === 'upgradeBuilding') {
    upgradeSelectedBuilding();
    return;
  }
  if (id === 'healArmy') {
    healArmyAtSelectedChurch();
    return;
  }
  const selected = selectedBuildingIndex !== null ? currentRun.buildings[selectedBuildingIndex] : undefined;
  if (id === 'openForge' && selected?.buildingId === 'forge') openForge('forge');
  if (id === 'openChurchUpgrades' && selected?.buildingId === 'church') openForge('church');
}

/** "Soigner l'armée" depuis la fiche d'une Eglise : preparation uniquement,
 *  avec l'efficacite de CETTE Eglise (run/churchHeal.ts). Les PV des
 *  emplacements de preparation suivent ceux de l'armee (memes index). */
function healArmyAtSelectedChurch(): void {
  if (!inPlacementPhase || pauseMenuOpen || buildingPlacementMode || selectedBuildingIndex === null) return;
  const result = healArmyAtChurch(currentRun, selectedBuildingIndex);
  if (!result) return;
  currentRun.army.forEach((unit, i) => {
    const slot = placementSlots[i];
    if (slot) slot.hp = unit.hp;
  });
  spawnCoinPopup(screens.shopGoldElement, -result.cost);
  refreshPlayerPreview();
  entityInfoSelectionKey = '';
}

/** "Ameliorer la mine / la caserne" depuis la fiche : preparation
 *  uniquement, n'ameliore que le batiment selectionne. La fiche est relue
 *  aussitot (niveau, production et prix suivants). */
function upgradeSelectedBuilding(): void {
  if (!inPlacementPhase || pauseMenuOpen || buildingPlacementMode || selectedBuildingIndex === null) return;
  const goldBefore = currentRun.gold;
  if (!upgradeOwnedBuilding(currentRun, selectedBuildingIndex)) return;
  spawnCoinPopup(screens.shopGoldElement, -roundGold(goldBefore - currentRun.gold));
  entityInfoSelectionKey = '';
}

/** Ouvre la boutique de la Forge : preparation uniquement, jamais en
 *  bataille, pendant la pause ni pendant un placement de bâtiment. Masque
 *  les controles de preparation qui passent au-dessus des overlays
 *  ("Vendre"/"Boutique", "Pret pour la bataille"), comme le menu pause. La
 *  selection de la Forge est conservee : sa fiche revient a la fermeture. */
function openForge(site: RunUpgradeSite): void {
  if (!inPlacementPhase || pauseMenuOpen || buildingPlacementMode || !hasRunUpgradeSite(site)) return;
  disarmItem();
  sellZone.setVisible(false);
  placementPanel.hide();
  openRunUpgradeSite = site;
  screens.showForge(currentRun, metaProgress, site);
}

/** "Retour" ou Echap : retour a la preparation. */
function closeForge(): void {
  if (!screens.isForgeOpen()) return;
  screens.hideAll();
  sellZone.setVisible(true);
  placementPanel.show();
}

/** Achat d'un niveau a la Forge (Or de la run, voir run/runUpgrades.ts). Une
 *  amelioration d'unite n'eleve que le niveau de production des PROCHAINES
 *  unites : les unites deja possedees gardent leurs PV et leurs stats
 *  (OwnedUnit.productionLevel, jamais retroactif). */
function purchaseForgeUpgrade(id: string): void {
  // Seulement une amelioration du site ouvert (Forge ou Eglise), tant qu'un
  // batiment de ce site est possede.
  if (!screens.isForgeOpen() || !inPlacementPhase || runUpgradeSite(id) !== openRunUpgradeSite || !hasRunUpgradeSite(openRunUpgradeSite)) return;
  if (!purchaseRunUpgrade(currentRun, id)) return;
  refreshPlayerPreview();
  screens.refreshForge(currentRun, metaProgress);
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
// Map d'origine de la session d'edition en cours : l'arene officielle du Mode
// survie complete (SURVIVAL_ARENA_MAP, unites de scenario comprises) par defaut,
// remplacee par le fichier charge via "Charger une carte" (voir onLoad) —
// c'est elle qui fournit le nom et la version au moment d'exporter (voir
// mapSerializer.ts, exportMapDef) ; tout le reste vient de l'EditorState.
let editorBaseMap: MapDef = SURVIVAL_ARENA_MAP;

/** Brouillon de l'editeur "propre" (E5) : export canonique de la carte au
 *  dernier etat ouvert, charge ou enregistre — null pour une carte jamais
 *  enregistree (Nouvelle carte). La carte est "non enregistree" des que son
 *  export actuel en differe : seule compte la donnee reellement sauvegardee
 *  (pas la selection, la camera, l'outil, la recherche...), et un Ctrl+Z
 *  qui revient a cet etat la rend propre de nouveau. */
let editorCleanExport: string | null = null;

/** Export de la carte en cours, cellules et territoire tries : deux etats
 *  egaux ne different jamais par le seul ordre de ces listes (une case
 *  supprimee puis restauree par Ctrl+Z revient a la fin de la liste). */
function editorExportKey(): string | null {
  if (!editorState) return null;
  const map = exportMapDef(editorState, editorBaseMap);
  const byZX = (a: { x: number; z: number }, b: { x: number; z: number }) => a.z - b.z || a.x - b.x;
  return JSON.stringify({ ...map, cells: [...(map.cells ?? [])].sort(byZX), territory: map.territory ? [...map.territory].sort(byZX) : undefined });
}

function isEditorDirty(): boolean {
  if (!editorState) return false;
  return editorCleanExport === null || editorExportKey() !== editorCleanExport;
}

/** La carte en cours devient l'etat propre (ouverture, chargement,
 *  enregistrement). */
function markEditorClean(): void {
  editorCleanExport = editorExportKey();
  updateEditorMapStatus();
}

function updateEditorMapStatus(): void {
  if (editorState) editorUI.setMapStatus(editorBaseMap.name, isEditorDirty());
}

/** Indicateur de la barre du haut recalcule une fois par image au plus
 *  (les rafraichissements de l'editeur peuvent s'enchainer, par exemple
 *  pendant un glisser). */
let editorMapStatusPending = false;
function scheduleEditorMapStatus(): void {
  if (editorMapStatusPending) return;
  editorMapStatusPending = true;
  requestAnimationFrame(() => {
    editorMapStatusPending = false;
    updateEditorMapStatus();
  });
}

/** Protection du brouillon, commune a Retour au menu, Charger une carte et
 *  Nouvelle carte : vrai si l'action peut continuer (carte propre, ou
 *  abandon confirme). `action` complete la question. */
function confirmDiscardEditorDraft(action: string): boolean {
  if (!isEditorDirty()) return true;
  return window.confirm(`Des modifications ne sont pas enregistrées.
${action} et les perdre ?`);
}

/** Carte vierge pour "Nouvelle carte" : taille de la carte de reference
 *  (DEFAULT_MAP), aucune cellule explicite (rectangle d'herbe par
 *  resolveMapCells), aucun objet, aucune unite, Baliste et territoire
 *  absents (repli historique). */
function createBlankEditorMap(): MapDef {
  return { name: 'Nouvelle carte', version: 1, width: DEFAULT_MAP.width, height: DEFAULT_MAP.height, obstacles: [], playerUnits: [], enemyUnits: [] };
}

/** Remplace la carte de l'editeur (chargement, nouvelle carte) : etat,
 *  maillages et historique repartent de zero. */
function resetEditorWithMap(map: MapDef): void {
  editorBaseMap = map;
  ringRotateDrag = null;
  editorState = new EditorState(map);
  editorObjectsGroup.clear();
  editorMeshes.clear();
  retiredEditorMeshes.clear();
  editorUnitsGroup.clear();
  editorUnitMeshes.clear();
  editorUnitMeshTeams.clear();
  editorBuildingsGroup.clear();
  editorBuildingMeshes.clear();
  clearEditorGhost();
  transformControls.detach();
  editorHistory.clear();
  rebuildEditorBoard();
  editorUI.setMapSize(editorState.width, editorState.height);
  refreshEditorObjects();
  frameEditorMap();
}

// Fermeture / rechargement de l'onglet avec un brouillon non enregistre
// (editeur ou test du scenario) : avertissement standard du navigateur.
window.addEventListener('beforeunload', (event) => {
  if ((inEditorMode || inTestMode) && isEditorDirty()) {
    event.preventDefault();
    event.returnValue = '';
  }
});

// Plateau visuel de la bataille de test ("Tester le scenario") — separe de
// `board` (le plateau du jeu reel, jamais touche par un test) pour ne pas
// avoir a le reconstruire a chaque aller-retour. Construit a l'entree du
// test, retire de la scene au retour dans l'editeur.
let testBoard: Board | null = null;
/** Map REELLE active juste avant "Tester le scenario" (voir testScenario),
 *  restauree au retour : le plateau visuel du jeu (`board`, masque mais
 *  jamais reconstruit pendant le test) a ete construit pour elle. */
let mapBeforeTest: MapDef = SURVIVAL_BASE_MAP;

// Mesh par id d'obstacle deja construit, pour eviter de rappeler
// createRock/createTreeObstacle (qui tirent leur composition/orientation au
// hasard a CHAQUE appel) sur un objet que rien n'a modifie — voir
// refreshEditorObjects. Sans ce cache, n'importe quel clic ailleurs sur le
// plateau faisait "sauter" tous les arbres/rochers deja poses (bug remonte
// par Antoine).
const editorMeshes = new Map<number, THREE.Group>();
/** Maillages des decors retires de la carte (suppression, pose annulee),
 *  gardes pour etre reutilises si l'historique les remet : un decor sans
 *  rotationY garde ainsi l'orientation aleatoire tiree a sa creation.
 *  Vide en meme temps que editorMeshes (chargement, sortie de l'editeur). */
const retiredEditorMeshes = new Map<number, THREE.Group>();

// Meme principe pour les unites, plus une trace du dernier camp rendu par id :
// une unite trainee de l'autre cote du plateau doit changer de couleur, ce
// qui n'est possible qu'en reconstruisant son mesh (buildUnit fabrique des
// boites deja teintees, la couleur n'est pas une propriete qu'on peut changer
// en place) — mais seulement quand son camp a REELLEMENT change, pas a
// chaque frame.
const editorUnitMeshes = new Map<number, THREE.Group>();
const editorUnitMeshTeams = new Map<number, Team>();
/** Anneau de selection de chaque unite selectionnee, seule ou en groupe
 *  (voir EditorState.selectUnits) : l'anneau commun aux unites
 *  (render/unitSelectionRing.ts), a la couleur de son camp, ajoute comme
 *  enfant du mesh de cette unite (meme principe que refreshPlayerPreview en
 *  phase de placement). Distinct de editorSelectionRing, reserve aux decors
 *  et a la Baliste. */
const editorUnitRings = new Map<number, THREE.Mesh>();

const editorObjectsGroup = new THREE.Group();
const editorUnitsGroup = new THREE.Group();
const editorGhostGroup = new THREE.Group();
/** Batiments gameplay du scenario (onglet « Bâtiments ») : groupe et
 *  maillages propres, distincts des decors (editorObjectsGroup). */
const editorBuildingsGroup = new THREE.Group();
const editorBuildingMeshes = new Map<number, THREE.Object3D>();
renderer.scene.add(editorObjectsGroup, editorUnitsGroup, editorBuildingsGroup, editorGhostGroup);

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
  syncActiveTerrain();
  // Les dalles et la grille sont reconstruites a chaque changement de case
  // (y compris pendant un trait de pinceau) : leurs geometries et materiaux
  // sont liberes. Les textures du sol sont partagees (render/textures.ts) et
  // les zones utilisent des ressources partagees : jamais liberees ici.
  for (const child of editorBoardGroup.children) {
    if (child === editorZonesGroup) continue;
    child.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.geometry) return;
      mesh.geometry.dispose();
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const material of materials) material?.dispose();
    });
  }
  editorBoardGroup.clear();
  // Terrain PAR CELLULE (2026-08-16, chantier map irreguliere) : reflete
  // exactement editorState.cells, y compris les trous crees via l'outil
  // Supprimer case — jamais un simple rectangle width x height.
  const cells = editorState.cells;
  const field = editorState.heightField();
  editorTerrainGroup = buildTerrainCellsView(cells, field, editorState.surfaceIndex).group;
  editorBoardGroup.add(editorTerrainGroup);
  editorBoardGroup.add(buildCellGridLines(cells, COLORS.gridLine, field));
  editorZonesGroup = null;
  refreshEditorZones();
  // Hauteur des objets derivee de la surface : apres tout changement du
  // relief (pinceau, annuler / retablir), les decors suivent leur case.
  refreshEditorObjects();
}

/** Zones de l'editeur actuellement affichees (enfant de editorBoardGroup). */
let editorZonesGroup: THREE.Group | null = null;
/** Sol de l'editeur actuellement affiche (enfant de editorBoardGroup). */
let editorTerrainGroup: THREE.Group | null = null;

/** Remplace seulement le sol de l'editeur (dessus et flancs) — apres un coup
 *  de pinceau Surface, purement visuel : ni grille, ni zones, ni objets, ni
 *  relief, ni rien de la simulation ne sont recalcules. */
function refreshEditorTerrainSurfaces(): void {
  if (!editorState || !editorTerrainGroup) return;
  editorBoardGroup.remove(editorTerrainGroup);
  editorTerrainGroup.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.geometry) return;
    mesh.geometry.dispose();
    (mesh.material as THREE.Material).dispose();
  });
  editorTerrainGroup = buildTerrainCellsView(editorState.cells, editorState.heightField(), editorState.surfaceIndex).group;
  editorBoardGroup.add(editorTerrainGroup);
  scheduleEditorMapStatus();
}

/** Remplace seulement les zones de l'editeur — apres un coup de pinceau de
 *  territoire, sans reconstruire sol ni grille. Territoire explicite du
 *  brouillon, sinon repli historique (EditorState.resolvedTerritory).
 *  Le camp des unites posees ou deplacees suit ce meme territoire
 *  (EditorState.territoryOwnerAt). */
function refreshEditorZones(): void {
  if (!editorState) return;
  if (editorZonesGroup) editorBoardGroup.remove(editorZonesGroup);
  editorZonesGroup = createZonesGroup(editorState.resolvedTerritory(), editorState.heightField());
  editorBoardGroup.add(editorZonesGroup);
  scheduleEditorMapStatus();
}

// Anneau reutilise pour toute selection : construit une fois a rayon unite,
// puis mis a l'echelle selon l'emprise de l'objet selectionne (voir
// refreshEditorObjects) plutot que de reconstruire la geometrie a chaque fois.
const editorSelectionRing = createEditorSelectionRing(1);
editorSelectionRing.visible = false;
renderer.scene.add(editorSelectionRing);
// Materiau propre a cet anneau (createEditorSelectionRing en cree un par
// anneau) : sa couleur peut changer sans toucher aux autres. Dore pour un
// decor (neutre) ; couleur du camp proprietaire pour la Baliste, meme source
// que l'anneau des unites (render/unitSelectionRing.ts, teamColor).
const editorSelectionRingMaterial = editorSelectionRing.material as THREE.MeshBasicMaterial;
const EDITOR_DECOR_RING_COLOR = editorSelectionRingMaterial.color.getHex();
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
/** `rotationY` absent = decor jamais tourne (orientation fixee par sa graine
 *  d'aspect) : l'annulation remet cette absence, jamais un 0 (KI-05). */
let transformDragStart: { id: number; x: number; z: number; rotationY: number | undefined } | null = null;

transformControls.addEventListener('dragging-changed', (event) => {
  transformDragging = Boolean(event.value);
});

transformControls.addEventListener('mouseDown', () => {
  const obstacle = editorState?.selectedObstacle;
  if (!obstacle) return;
  const center = obstacleCenter(obstacle);
  transformDragStart = { id: obstacle.id, x: center.x, z: center.z, rotationY: obstacle.rotationY };
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
  // La racine du mesh porte le decalage de pose du modele (recentrage) :
  // le centre du decor est sa position moins ce decalage. Centre au-dessus du
  // vide : le decor reste a sa derniere position valide. Repose ensuite sur
  // la surface (refreshEditorObjects, placeObstacleMesh).
  const offset = obstaclePlacementOffset(object);
  editorState.moveSelected(object.position.x - offset.x, object.position.z - offset.z);
  refreshEditorObjects();
});

transformControls.addEventListener('mouseUp', () => {
  const start = transformDragStart;
  transformDragStart = null;
  const obstacle = editorState?.selectedObstacle;
  if (!start || !editorState || !obstacle || obstacle.id !== start.id) return;

  const end = { id: obstacle.id, x: obstacle.x ?? start.x, z: obstacle.z ?? start.z, rotationY: obstacle.rotationY };
  // Rien n'a reellement bouge (un simple clic sur une poignee sans glisser) :
  // ne pousse aucune commande vide dans l'historique.
  if (end.x === start.x && end.z === start.z && end.rotationY === start.rotationY) return;

  editorHistory.push({
    undo: () => {
      applyEditorObstacleTransform(start);
      rebuildEditorObstacleMesh(start.id);
      refreshEditorObjects();
    },
    redo: () => {
      applyEditorObstacleTransform(end);
      rebuildEditorObstacleMesh(end.id);
      refreshEditorObjects();
    },
  });
  rebuildEditorObstacleMesh(end.id);
  refreshEditorObjects();
});

/** Position et rotation d'un decor pour annuler / retablir un deplacement :
 *  une rotation absente reste absente. */
function applyEditorObstacleTransform(t: { id: number; x: number; z: number; rotationY: number | undefined }): void {
  if (!editorState) return;
  editorState.setObstacleTransform(t.id, t.x, t.z, t.rotationY ?? 0);
  if (t.rotationY === undefined) editorState.clearObstacleRotation(t.id);
}

/** L'aspect d'un decor depend de sa position (obstacleAppearanceSeed) : apres
 *  un deplacement, son mesh est reconstruit au prochain rafraichissement pour
 *  montrer exactement l'aspect qu'il aura en jeu. */
function rebuildEditorObstacleMesh(id: number): void {
  const mesh = editorMeshes.get(id);
  if (mesh) {
    editorObjectsGroup.remove(mesh);
    editorMeshes.delete(id);
  }
  retiredEditorMeshes.delete(id);
}

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
  /** rotationY du decor au debut du glisser (undefined : orientation
   *  aleatoire jamais fixee), restauree telle quelle par l'annulation. */
  startRotationY: number | undefined;
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
  if (!intersectTerrain(raycaster.ray, groundHit)) return null;
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
  ringRotateDrag = { id: obstacle.id, startRotation, startRotationY: obstacle.rotationY, startPointerAngle: pointerAngle, currentRotation: startRotation };
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
  pushObstacleRotationCommand(drag.id, drag.startRotation, drag.startRotationY, drag.currentRotation);
}

/** Rotation deja appliquee : UNE entree d'historique. Annuler restaure
 *  exactement l'etat d'avant — un decor qui n'avait pas de rotationY (angle
 *  aleatoire tire a la creation de son mesh) la perd de nouveau, et son mesh
 *  reprend l'angle affiche avant (`from`) : l'export redevient identique. */
function pushObstacleRotationCommand(id: number, from: number, fromRotationY: number | undefined, to: number): void {
  editorHistory.push({
    undo: () => {
      if (fromRotationY === undefined) {
        editorState?.clearObstacleRotation(id);
        const mesh = editorMeshes.get(id);
        if (mesh) mesh.rotation.y = from;
      } else {
        editorState?.setObstacleRotation(id, fromRotationY);
      }
      refreshEditorObjects();
    },
    redo: () => {
      editorState?.setObstacleRotation(id, to);
      refreshEditorObjects();
    },
  });
}

/** Pose ou suppression deja appliquee : UNE entree d'historique qui
 *  restaure les objets et la selection d'avant / d'apres (voir
 *  EditorState.objectsSnapshot) — memes objets, jamais une nouvelle pose. */
function pushEditorObjectsCommand(before: EditorObjectsSnapshot, after: EditorObjectsSnapshot): void {
  editorHistory.push({
    undo: () => {
      editorState?.restoreObjects(before);
      refreshEditorObjects();
    },
    redo: () => {
      editorState?.restoreObjects(after);
      refreshEditorObjects();
    },
  });
}

/** Supprime la selection (decor, unite ou groupe) — Suppr, Retour arriere et
 *  le bouton du panneau : une seule entree d'historique, meme pour un groupe ;
 *  annuler restaure aussi la selection. */
function deleteEditorSelection(): void {
  if (!editorState) return;
  const before = editorState.objectsSnapshot();
  editorState.deleteSelected();
  if (
    editorState.obstacles.length !== before.obstacles.length ||
    editorState.units.length !== before.units.length ||
    editorState.buildings.length !== before.buildings.length
  ) {
    pushEditorObjectsCommand(before, editorState.objectsSnapshot());
  }
  refreshEditorObjects();
}

/** Applique un etat de taille (changement de taille, annuler, retablir). */
function applyEditorMapShape(shape: EditorMapShapeSnapshot): void {
  if (!editorState) return;
  editorState.restoreMapShape(shape);
  rebuildEditorBoard();
  editorUI.setMapSize(editorState.width, editorState.height);
  // Une Baliste jamais deplacee suit le coin du nouveau plateau.
  refreshEditorObjects();
}

/** Ctrl+molette (±15°) / Ctrl+Maj+molette (±1°) sur le decor selectionne —
 *  une commande d'historique par cran. */
function rotateSelectedObstacleBy(deltaRad: number): void {
  const obstacle = editorState?.selectedObstacle;
  if (!editorState || !obstacle) return;
  const from = currentObstacleRotation(obstacle);
  const fromRotationY = obstacle.rotationY;
  editorState.setObstacleRotation(obstacle.id, from + deltaRad);
  pushObstacleRotationCommand(obstacle.id, from, fromRotationY, obstacle.rotationY ?? from);
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
  onSelectSelectTool: () => {
    if (!editorState) return;
    if (editorState.tool.type !== 'select') editorState.setTool({ type: 'select' });
    clearEditorGhost();
    refreshEditorObjects();
  },
  onSelectTemplate: (template) => {
    if (!editorState) return;
    editorState.setTool({ type: 'place-obstacle', template });
    clearEditorGhost();
    // Modele a la demande : charge au premier choix, puis fantome rafraichi.
    void ensureModels(obstacleModelKeys([template])).then(() => {
      if (editorState?.tool.type === 'place-obstacle' && editorState.tool.template === template) updateEditorGhost(lastEditorGhostX, lastEditorGhostZ);
    });
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
  onSelectBuilding: (buildingId) => {
    if (!editorState) return;
    editorState.setTool({ type: 'place-building', buildingId });
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
  onSelectReliefBrushTool: (delta: ReliefDelta) => {
    if (!editorState) return;
    editorState.setTool({ type: 'relief-brush', delta, size: editorReliefSize });
    clearEditorGhost();
    refreshEditorObjects();
  },
  onSelectReliefBrushSize: (size: ReliefBrushSize) => {
    editorReliefSize = size;
    editorUI.setReliefBrushSize(size);
    if (!editorState || editorState.tool.type !== 'relief-brush') return;
    editorState.setTool({ ...editorState.tool, size });
    refreshEditorObjects();
    updateEditorGhost(lastEditorGhostX, lastEditorGhostZ);
  },
  onSelectTerritoryTool: (team) => {
    if (!editorState) return;
    editorState.setTool({ type: 'paint-territory', team });
    clearEditorGhost();
    refreshEditorObjects();
  },
  onSelectSurfaceTool: (surface) => {
    if (!editorState) return;
    editorState.setTool({ type: 'paint-surface', surface, size: editorSurfaceSize });
    clearEditorGhost();
    refreshEditorObjects();
  },
  onSelectSurfaceBrushSize: (size) => {
    editorSurfaceSize = size;
    editorUI.setSurfaceBrushSize(size);
    if (!editorState || editorState.tool.type !== 'paint-surface') return;
    editorState.setTool({ ...editorState.tool, size });
    refreshEditorObjects();
    updateEditorGhost(lastEditorGhostX, lastEditorGhostZ);
  },
  onRotate: () => rotateSelectedObstacleBy(Math.PI / 2),
  onRotateBy: (degrees) => rotateSelectedObstacleBy(THREE.MathUtils.degToRad(degrees)),
  onDelete: () => deleteEditorSelection(),
  onExit: () => {
    if (confirmDiscardEditorDraft('Quitter l’éditeur')) exitEditor();
  },
  onSave: () => {
    if (!editorState) return;
    downloadMapDef(exportMapDef(editorState, editorBaseMap));
    // Enregistre : la carte actuelle devient l'etat propre. L'historique est
    // conserve (annuler apres un enregistrement reste possible).
    markEditorClean();
  },
  onRequestLoad: () => confirmDiscardEditorDraft('Charger une autre carte'),
  onLoad: async (file) => {
    try {
      const map = await loadMapDefFromFile(file);
      // Modeles a la demande de la carte (pack KayKit complet) avant tout rendu.
      await ensureModels(obstacleModelKeys(map.obstacles));
      resetEditorWithMap(map);
      markEditorClean();
    } catch (err) {
      // Pas de systeme de notification dans l'UI de l'editeur pour l'instant
      // (voir CLAUDE.md, etapes 2-3) : une alerte navigateur suffit pour un
      // outil de dev utilise par Antoine seul, tant qu'un fichier invalide
      // reste rare.
      alert(`Impossible de charger cette carte : ${err instanceof Error ? err.message : String(err)}`);
    }
  },
  onNewMap: () => {
    if (!confirmDiscardEditorDraft('Créer une nouvelle carte')) return;
    resetEditorWithMap(createBlankEditorMap());
    // Jamais enregistree : non enregistree tant qu'elle ne l'a pas ete.
    editorCleanExport = null;
    updateEditorMapStatus();
  },
  onResizeMap: (width, height) => {
    if (!editorState) return;
    const before = editorState.mapShapeSnapshot();
    editorState.setSize(width, height);
    const after = editorState.mapShapeSnapshot();
    // Historise exactement ce que fait setSize (taille, cases ajoutees,
    // Baliste jamais deplacee qui suit le coin), seulement si quelque chose
    // a change.
    if (JSON.stringify(before) !== JSON.stringify(after)) {
      editorHistory.push({ undo: () => applyEditorMapShape(before), redo: () => applyEditorMapShape(after) });
    }
    applyEditorMapShape(after);
  },
  onTestScenario: () => testScenario(),
  onLayoutChange: () => {
    if (inEditorMode) updateEditorViewport();
  },
});

// --- Cadrage de l'editeur (E6) ---
// La camera de l'editeur cadre le plateau dans la zone laissee libre par les
// barres et les panneaux (mesuree sur le DOM, voir EditorUI.getViewportInsets),
// jamais dans toute la fenetre. Le jeu garde son propre cadrage : il est
// sauvegarde a l'entree et restaure a la sortie de l'editeur.
let cameraBeforeEditor: CameraViewState | null = null;

/** Recalcule la zone libre : ouverture, repli d'un panneau, redimensionnement
 *  de la fenetre, retour d'un test. Jamais pendant le test (UI masquee). */
function updateEditorViewport(): void {
  renderer.setViewportInsets(editorUI.getViewportInsets());
}

/** Cadre toute la carte de l'editeur dans la zone libre, sans changer
 *  l'orientation ni l'inclinaison de la camera. */
function frameEditorMap(): void {
  if (!editorState) return;
  const cells = editorState.cells;
  const bounds = cells.length > 0
    ? computeMapCellBounds(cells)
    : { minX: -editorState.width / 2, maxX: editorState.width / 2, minZ: -editorState.height / 2, maxZ: editorState.height / 2 };
  // height : marge pour les decors hauts (arbres) du fond de la carte.
  renderer.frameBox({ ...bounds, height: 2 });
}

/** Espace dans l'editeur (et pendant son test) : angle par defaut, carte
 *  entiere recadree dans la zone libre actuelle. */
function resetEditorCamera(): void {
  renderer.resetCamera();
  frameEditorMap();
}

window.addEventListener('resize', () => {
  if (inEditorMode) updateEditorViewport();
});

function clearEditorGhost(): void {
  // Plus de case survolee : la ligne d'etat du pinceau de relief se vide.
  editorUI.setReliefBrushInfo(null);
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
    retiredEditorMeshes.set(id, mesh);
  }

  for (const o of editorState.obstacles) {
    const cached = editorMeshes.get(o.id);
    if (!cached) {
      const mesh = retiredEditorMeshes.get(o.id) ?? buildObstacleView(o, editorAssets);
      retiredEditorMeshes.delete(o.id);
      editorMeshes.set(o.id, mesh);
      editorObjectsGroup.add(mesh);
      continue;
    }
    // Objet deja construit : on retransforme le meme mesh (deplacement)
    // plutot que d'en reconstruire un, et on ne touche a la rotation que si
    // elle a ete explicitement fixee (voir rotateSelectedObstacleBy) —
    // sinon on ecraserait l'orientation aleatoire tiree une seule fois a la
    // creation.
    // Centre et surface actuels (relief compris), decalage de pose du
    // modele conserve : meme pose que sur le plateau du jeu.
    placeObstacleMesh(cached, o);
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
      // L'ancien anneau (le cas echeant) etait un enfant du mesh qu'on vient
      // de retirer — invalide l'entree pour que la synchro ci-dessous en
      // recree un, a la couleur du nouveau camp, sur le NOUVEAU mesh dans
      // cette meme passe.
      editorUnitRings.delete(u.id);
    }
    editorUnitMeshes.get(u.id)!.position.set(u.x, surfaceY(u.x, u.z), u.z);
  }

  // Anneaux des unites selectionnees, seules ou en groupe — un par unite,
  // enfant de son mesh.
  const selection = editorState.selection;
  const selectedUnitIds = new Set<number>(
    selection?.kind === 'unit' ? [selection.id] : selection?.kind === 'unit-group' ? selection.ids : [],
  );
  for (const [id, ring] of editorUnitRings) {
    if (selectedUnitIds.has(id)) continue;
    ring.removeFromParent();
    editorUnitRings.delete(id);
  }
  for (const id of selectedUnitIds) {
    if (editorUnitRings.has(id)) continue;
    const unitMesh = editorUnitMeshes.get(id);
    const unit = editorState.units.find((u) => u.id === id);
    if (!unitMesh || !unit) continue;
    editorUnitRings.set(id, attachUnitSelectionRing(unitMesh, unit.team, getUnit(unit.unitId).stats.radius));
  }

  // Batiments gameplay du scenario : un maillage par batiment (le modele du
  // jeu), tague pour le clic (findEditorBuildingId).
  const liveBuildingIds = new Set(editorState.buildings.map((b) => b.id));
  for (const [id, mesh] of editorBuildingMeshes) {
    if (liveBuildingIds.has(id)) continue;
    editorBuildingsGroup.remove(mesh);
    editorBuildingMeshes.delete(id);
  }
  for (const b of editorState.buildings) {
    // Un segment de muraille dont les virages changent (voisin pose ou
    // retire) est reconstruit : son raccord visuel en depend.
    const obstacle = gameplayBuildingObstacle(b.buildingId, b.x, b.z, b.rotationY ?? 0, b.team, editorState.buildings);
    const joinKey = JSON.stringify([obstacle.wallJoin ?? null, b.buildingId, b.rotationY ?? 0]);
    const existing = editorBuildingMeshes.get(b.id);
    if (existing && existing.userData['wallJoinKey'] === joinKey) continue;
    if (existing) editorBuildingsGroup.remove(existing);
    const mesh = buildObstacleMesh(obstacle, editorAssets);
    mesh.userData['wallJoinKey'] = joinKey;
    mesh.userData['editorBuildingId'] = b.id;
    editorBuildingMeshes.set(b.id, mesh);
    editorBuildingsGroup.add(mesh);
  }

  // Baliste du brouillon : le modele (partage avec le jeu, voir
  // ballistaPlatform) suit la position de l'editeur, la seule enregistree.
  repositionBallista(editorState.ballista);

  const selectedObstacle = editorState.selectedObstacle;
  const selectedBuilding = editorState.selectedBuilding;
  const ballistaSelected = editorState.selection?.kind === 'ballista';
  editorSelectionRing.visible = selectedObstacle !== null || ballistaSelected || selectedBuilding !== null;
  if (selectedBuilding) {
    // Meme convention d'echelle que les decors, sur l'emprise reelle.
    const def = getBuilding(selectedBuilding.buildingId);
    editorSelectionRing.position.set(selectedBuilding.x, 0.02 + surfaceY(selectedBuilding.x, selectedBuilding.z), selectedBuilding.z);
    editorSelectionRing.scale.setScalar(Math.max(def.footprintTilesX ?? 1, def.footprintTilesZ ?? 1) * 0.7);
    editorSelectionRingMaterial.color.setHex(teamColor(selectedBuilding.team));
  }
  if (selectedObstacle) {
    const center = obstacleCenter(selectedObstacle);
    editorSelectionRing.position.set(center.x, 0.02 + surfaceY(center.x, center.z), center.z);
    editorSelectionRing.scale.setScalar(Math.max(selectedObstacle.tilesX, selectedObstacle.tilesZ) * 0.7);
    editorSelectionRingMaterial.color.setHex(EDITOR_DECOR_RING_COLOR);
  } else if (ballistaSelected) {
    // Meme convention d'echelle que les decors, sur l'empreinte reelle.
    editorSelectionRing.position.set(editorState.ballista.x, 0.02 + surfaceY(editorState.ballista.x, editorState.ballista.z), editorState.ballista.z);
    editorSelectionRing.scale.setScalar(BALLISTA_TOWER_FOOTPRINT * 0.7);
    editorSelectionRingMaterial.color.setHex(teamColor(EDITOR_BALLISTA_OWNER));
  }
  // Panneau de proprietes (toujours present) : decrit la selection courante.
  editorUI.showProperties(editorPropertiesSubject(editorState));

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
  // Outil actif et ligne d'etat de l'interface (surbrillance, aide).
  editorUI.syncTool(editorState.tool, editorState.selection);
  scheduleEditorMapStatus();
  refreshMovePreview();
}

/** Selection courante telle que la decrit le panneau de proprietes : le
 *  decor (avec son orientation reellement affichee), les unites (avec le
 *  proprietaire actuel de leur case) ou la Baliste. */
function editorPropertiesSubject(state: EditorState): PropertiesSubject {
  const obstacle = state.selectedObstacle;
  if (obstacle) return { kind: 'obstacle', obstacle, rotationRad: currentObstacleRotation(obstacle) };
  const ids = state.selectedUnitIds;
  if (ids.length > 0) {
    const units = ids.map((id) => state.units.find((u) => u.id === id)).filter((u): u is NonNullable<typeof u> => u !== undefined);
    return { kind: 'units', units: units.map((unit) => ({ unit, territory: state.territoryOwnerAt(unit.x, unit.z) })) };
  }
  if (state.selection?.kind === 'ballista') return { kind: 'ballista', x: state.ballista.x, z: state.ballista.z };
  const building = state.selectedBuilding;
  if (building) return { kind: 'building', building };
  return { kind: 'none' };
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
  cameraBeforeEditor = renderer.getViewState();

  if (!editorAssets) editorAssets = await loadEnvironmentAssets();
  await ensureModels(obstacleModelKeys(SURVIVAL_ARENA_MAP.obstacles));
  // Ouverture sur l'arene officielle complete (terrain, decors, territoire,
  // unites de scenario, Baliste) ; DEFAULT_MAP ne sert plus qu'aux
  // dimensions de "Nouvelle carte".
  editorBaseMap = SURVIVAL_ARENA_MAP;
  editorState = new EditorState(editorBaseMap);
  editorHistory.clear();
  rebuildEditorBoard();
  editorUI.setMapSize(editorState.width, editorState.height);
  refreshEditorObjects();
  markEditorClean();
  updateEditorViewport();
  frameEditorMap();
}

function exitEditor(): void {
  inEditorMode = false;
  ringRotateDrag = null;
  editorState = null;
  syncActiveTerrain();
  editorCleanExport = null;
  editorObjectsGroup.clear();
  editorMeshes.clear();
  retiredEditorMeshes.clear();
  editorUnitsGroup.clear();
  editorUnitMeshes.clear();
  editorUnitMeshTeams.clear();
  editorUnitRings.clear();
  editorBuildingsGroup.clear();
  editorBuildingMeshes.clear();
  editorBoardGroup.clear();
  editorBoardGroup.visible = false;
  clearEditorGhost();
  transformControls.detach();
  editorHistory.clear();
  editorSelectionRing.visible = false;
  editorUI.setVisible(false);
  editorUI.hideProperties();
  renderer.setViewportInsets(null);
  if (cameraBeforeEditor) renderer.setViewState(cameraBeforeEditor);
  cameraBeforeEditor = null;
  board.group.visible = true;
  // Le modele de la Baliste suivait la position de l'editeur : retour a
  // celle du jeu.
  repositionBallista();
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
  finishEditorWallTrace();
  const testMap = exportMapDef(editorState, editorBaseMap);

  // Masque l'editeur (mais garde editorState intact) et bascule dans les
  // memes conditions qu'une bataille normale : inEditorMode a false laisse
  // inBattlePhase() (voir plus bas) redevenir vrai naturellement, donc vise/
  // tir/baliste marchent sans code special.
  editorBoardGroup.visible = false;
  editorObjectsGroup.visible = false;
  editorUnitsGroup.visible = false;
  editorBuildingsGroup.visible = false;
  editorGhostGroup.visible = false;
  clearEditorGhost();
  editorSelectionRing.visible = false;
  transformControls.detach();
  // Seule la ligne d'etat reste visible : elle indique comment revenir.
  editorUI.setTestMode(true);
  editorUI.hideProperties();
  inEditorMode = false;
  inTestMode = true;
  // Bâtiments possédés (Mine/Caserne) jamais injectés pendant "Tester le
  // scénario" — une carte d'éditeur n'a aucun lien avec la progression d'une
  // run réelle. Seule la Baliste, toujours présente, est créée (voir
  // setupTestBattle).

  mapBeforeTest = currentMap;
  currentMap = testMap;
  rebuildCurrentTerritoryIndex();
  world.setMap(currentMap);
  syncActiveTerrain();

  if (testBoard) renderer.scene.remove(testBoard.group);
  testBoard = await createBoard(testMap);
  testBoard.gridLines.visible = false;
  testBoard.zones.visible = false;
  renderer.scene.add(testBoard.group);

  // Origine de tir, modele visuel et collision de la Baliste a la meme
  // position, calculee comme en vraie bataille (voir spawnBallistaBuilding) :
  // celle posee dans l'editeur, sinon le repli historique du coin.
  playerArrowOrigin = resolveBallistaOrigin(currentMap);
  ballistaObstacleDef = computeBallistaObstacle(playerArrowOrigin);
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
  clearScenarioBuildingMeshes();
  // Remet aussi le modele de la Baliste a neuf si elle a ete detruite pendant
  // le test (voir forgetBattleBuildings).
  forgetBattleBuildings();
  rewardedEnemyDeaths.clear();
  belowAutoHealThreshold.clear();
  mineProductionTimers.clear();
  mineProductionCounts.clear();
  pendingArrowSpawns.length = 0;
  unitViews.clear();
  combatOverlay.clear();
  projectiles.clear();
  playerArrowView.clear();
  telegraphView.clear();
  fireballView.clear();
  iceNovaView.clear();
  healVfxView.clear();
  moveOrderFeedback.clear();
  tauntVfxView.clear();
  shadowProjectileView.clear();

  // La partie REELLE (menu -> Jouer) ne doit jamais heriter de la map de
  // test : on revient a la map active AVANT le test, comme si le test
  // n'avait pas eu lieu. Pas SURVIVAL_BASE_MAP : apres une run agrandie, le
  // plateau visuel resterait a la taille agrandie, et startNewRun (qui ne
  // reinitialise le plateau que si currentMap !== SURVIVAL_BASE_MAP) ne le
  // reconstruirait jamais.
  currentMap = mapBeforeTest;
  rebuildCurrentTerritoryIndex();
  world.setMap(currentMap);
  syncActiveTerrain();
  playerArrowOrigin = resolveBallistaOrigin(currentMap);
  ballistaObstacleDef = computeBallistaObstacle(playerArrowOrigin);
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
  editorBuildingsGroup.visible = true;
  // Masque par testScenario : sans cette ligne, plus aucun apercu de
  // l'editeur (fantomes, cases, pinceau, Baliste) ne s'affichait apres un test.
  editorGhostGroup.visible = true;
  editorUI.setTestMode(false);
  editorUI.setVisible(true);
  // La fenetre a pu changer de taille pendant le test.
  updateEditorViewport();
  // editorState n'a jamais ete touche pendant le test : on retrouve
  // exactement la configuration de depart, comme demande. Surface active =
  // le brouillon (inEditorMode vient de repasser a vrai) AVANT de reposer
  // decors et unites, sinon ils retombent a la hauteur de la carte de jeu.
  syncActiveTerrain();
  refreshEditorObjects();
}

/** Id du batiment de scenario de l'editeur dont fait partie l'objet touche
 *  (tag pose par refreshEditorObjects), ou null. */
function findEditorBuildingId(object: THREE.Object3D | null): number | null {
  for (let current = object; current; current = current.parent) {
    const id = current.userData['editorBuildingId'];
    if (typeof id === 'number') return id;
  }
  return null;
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

/** Derniere position du fantome de l'editeur : R (rotation de l'outil
 *  Muraille) le rafraichit sans attendre un mouvement de souris. */
let lastEditorGhostX = 0;
let lastEditorGhostZ = 0;

function updateEditorGhost(x: number, z: number): void {
  if (!editorState || !editorAssets) return;
  lastEditorGhostX = x;
  lastEditorGhostZ = z;
  clearEditorGhost();
  if (editorState.tool.type === 'place-obstacle') {
    // Placement LIBRE (2026-08-16, demande d'Antoine — decors/props/rochers/
    // arbres/batiments, placementMode "free") : le fantome suit exactement
    // l'intersection raycaster -> terrain, aucun arrondi vers une case.
    // Case sous le centre du decor : verte si la pose est possible, rouge
    // au-dessus du vide (meme regle que le clic, canPlaceObstacleAt).
    const combined = new THREE.Group();
    combined.add(buildCellPreview(Math.floor(x), Math.floor(z), editorState.canPlaceObstacleAt(x, z)));
    combined.add(buildGhost(editorState.tool.template, x, z, editorAssets));
    editorGhost = combined;
    editorGhostGroup.add(editorGhost);
  } else if (editorState.tool.type === 'place-unit') {
    // Le camp du fantome est celui de la case survolee dans le territoire :
    // Antoine voit la couleur AVANT de cliquer. Case neutre : pose
    // impossible, seul l'apercu de case rouge (invalide) est montre.
    const unitX = snapToTileCenter(x);
    const unitZ = snapToTileCenter(z);
    const team = editorState.territoryOwnerAt(unitX, unitZ);
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
    if (team) combined.add(buildUnitGhost(editorState.tool.unitId, team, unitX, unitZ));
    editorGhost = combined;
    editorGhostGroup.add(editorGhost);
  } else if (editorState.tool.type === 'place-building') {
    // Emprise REELLE du batiment (BuildingDef), centre cale sur la grille :
    // chaque case verte si la pose est possible, rouge sinon (meme regle que
    // le clic, canPlaceBuildingAt), plus le modele du jeu en fantome.
    const buildingId = editorState.tool.buildingId;
    const rotationY = editorState.tool.rotationY ?? 0;
    const trace = activeEditorWallTrace();
    if (trace || getBuilding(buildingId).placementMode === 'line') {
      // Trace de murailles : segment au repos avant le premier clic, puis la
      // portion de l'ancre au curseur (segments, virage, case en attente).
      const net = wallNetworkOf(editorWallBuildings());
      const ends = joinableWallEnds(net, trace);
      const join = trace ? wallJoinAt(net, trace, x, z) : null;
      const snapped = trace ? join?.end ?? null : wallEndNear(ends, x, z);
      const plan = trace ? planTracedWallLeg(buildingId, trace, x, z, editorState.ballista, 'player', join?.path ?? null) : null;
      const pieces = plan ? plan.step.added : snapped ? [] : [wallRestPiece(buildingId, x, z, rotationY)];
      const centers = editorTracePieceCenters(pieces);
      const halfId = getBuilding(buildingId).traceHalf ?? buildingId;
      const valid = plan
        ? plan.leg.usable && !wallStepTouchesGate(editorState.buildings, plan.step) && !wallStepSplitsLevels(plan.step, editorState.heightField()) && editorState.canReplaceBuildingPieces(tracedBuildingsToRemove(editorState.buildings, plan.step).map((b) => b.id), centers, editorTracePieceCenters(waitingHalfPieces(buildingId, plan.step)))
        : snapped !== null || editorState.canPlaceBuildingAt(halfId, traceCellAt(x, z).x + 0.5, traceCellAt(x, z).z + 0.5, undefined, 0);
      const group = new THREE.Group();
      addWallEndMarkers(group, ends, snapped);
      for (const r of plan?.step.removed ?? []) for (const c of tracePieceCells(r)) group.add(buildCellPreview(+c.split(',')[0]!, +c.split(',')[1]!, valid));
      const assets = editorAssets;
      pieces.forEach((p, i) => {
        for (let dz = 0; dz < p.tilesZ; dz++) for (let dx = 0; dx < p.tilesX; dx++) group.add(buildCellPreview(p.cornerX + dx, p.cornerZ + dz, valid));
        group.add(buildGhost(gameplayBuildingObstacle(p.buildingId, centers[i]!.x, centers[i]!.z, p.rotationY), centers[i]!.x, centers[i]!.z, assets));
      });
      for (const c of plan?.step.waiting ?? []) group.add(buildCellPreview(c.x, c.z, valid));
      editorGhost = group;
      editorGhostGroup.add(editorGhost);
      return;
    }
    const center = snapBuildingCenter(buildingId, x, z, rotationY);
    const replaced = editorState.replaceableBuildingAt(buildingId, center.x, center.z, rotationY);
    const valid = editorState.canPlaceBuildingAt(buildingId, center.x, center.z, replaced?.id, rotationY);
    const bounds = buildingBoundsAt(buildingId, center.x, center.z, rotationY);
    const combined = new THREE.Group();
    for (let cz = Math.floor(bounds.minZ); cz < bounds.maxZ; cz++) {
      for (let cx = Math.floor(bounds.minX); cx < bounds.maxX; cx++) combined.add(buildCellPreview(cx, cz, valid));
    }
    combined.add(buildGhost(gameplayBuildingObstacle(buildingId, center.x, center.z, rotationY), center.x, center.z, editorAssets));
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
  } else if (editorState.tool.type === 'relief-brush') {
    // Surface finale de tout le trait (cases deja peintes + ce tampon,
    // mesurees sur le terrain du debut du trait) en vert ; liaisons
    // diagonales en orange ; tampon refuse ou a la limite : son carre (dans
    // la carte) en rouge, raison dans la ligne d'etat. Hors carte : coupe ;
    // entierement dans le vide : rien (jamais rouge).
    const stroke = reliefStroke;
    const plan = editorState.reliefBrushPlan(x, z, editorState.tool.delta, editorState.tool.size, stroke?.painted ?? new Set(), stroke?.start ?? editorState.reliefStrokeStart());
    editorGhost = buildReliefBrushPreview(plan.cells, plan.status.ok, new Set(plan.bridged));
    editorGhostGroup.add(editorGhost);
    editorUI.setReliefBrushInfo({ levels: plan.levels, refusal: plan.status.ok ? null : plan.status.reason, bridged: plan.bridged.length });
  } else if (editorState.tool.type === 'paint-surface') {
    // Cases qui seront peintes (contour leger, la texture actuelle reste
    // visible) ; hors carte et trous : rien.
    const cells = editorState.surfaceBrushCells(editorState.tool.size, x, z);
    if (cells.length === 0) return;
    editorGhost = buildSurfaceBrushPreview(cells, editorState.tool.surface === null);
    editorGhostGroup.add(editorGhost);
  } else if (editorState.tool.type === 'paint-territory') {
    // Case qui sera peinte, teintee de la couleur du pinceau (gris pour
    // Effacer) ; aucun apercu sur une case absente, impossible a peindre.
    const cellX = Math.floor(x);
    const cellZ = Math.floor(z);
    if (!editorState.canPaintTerritoryAt(cellX, cellZ)) return;
    const team = editorState.tool.team;
    editorGhost = buildCellPreview(cellX, cellZ, true, team ? teamColor(team) : TERRITORY_ERASE_PREVIEW_COLOR);
    editorGhostGroup.add(editorGhost);
  }
}

/** Trait de pinceau en cours (bouton gauche maintenu) des outils
 *  repetables sur les cases : peindre le territoire, ajouter ou supprimer
 *  une case. Chaque case survolee est traitee au plus une fois ; tout le
 *  trait forme UNE entree d'historique, creee au relachement s'il a change
 *  quelque chose. `before` : territoire (et forme de la carte pour les
 *  outils de case) a l'appui. */

/** Trait d'un pinceau de relief (Surelever / Abaisser, bouton gauche
 *  maintenu) : union des coeurs des tampons valides (`painted`), relief
 *  recalcule a CHAQUE tampon depuis le terrain du debut du trait (`start`) :
 *  une case repassee dans le meme trait ne change qu'une fois d'une couche.
 *  Applique en direct (les decors suivent), une seule entree d'historique au
 *  relachement. `applied` : resultat applique ; `last` : coin du dernier
 *  tampon, pour interpoler. */
interface ReliefStroke {
  before: EditorMapShapeSnapshot;
  start: ReliefStrokeStart;
  delta: ReliefDelta;
  size: ReliefBrushSize;
  painted: Set<string>;
  applied: TerrainElevationCellDef[];
  last: { x: number; z: number } | null;
  changed: boolean;
}
let reliefStroke: ReliefStroke | null = null;

/** Taille des pinceaux Surelever / Abaisser (selection « Taille »). */
let editorReliefSize: ReliefBrushSize = 4;

/** Hauteur du plan de travail des pinceaux de relief loin de toute case :
 *  celle du dernier point vise (terrain ou plan de travail), pour qu'en
 *  s'eloignant de la carte le pinceau continue sans sauter. */
let reliefPlaneY = 0;

/** Pointage des pinceaux de relief (raycaster deja place) : le terrain du
 *  debut du trait en cours (sinon le terrain affiche), prolonge dans le vide
 *  par le plan de travail (intersectSculptSurface) — le pinceau garde une
 *  case de grille partout, meme hors de la carte. Ecrit dans groundHit. */
function pickReliefPoint(): boolean {
  if (!editorState) return false;
  const state = editorState;
  const hit = intersectSculptSurface(raycaster.ray, groundHit, reliefStroke?.start.field ?? activeTerrain(), (cx, cz) => state.hasCellAt(cx, cz), reliefPlaneY);
  if (hit !== null) reliefPlaneY = groundHit.y;
  return hit !== null;
}

function startReliefStroke(delta: ReliefDelta, size: ReliefBrushSize): void {
  if (!editorState) return;
  if (reliefStroke) endReliefStroke();
  reliefStroke = { before: editorState.mapShapeSnapshot(), start: editorState.reliefStrokeStart(), delta, size, painted: new Set(), applied: [], last: null, changed: false };
}

/** Ajoute au trait le tampon sous (x, z) et, si la souris a saute plusieurs
 *  cases, tous les tampons intermediaires de la grille (aucun trou). Un
 *  tampon refuse (case a changer bloquee : objet, unite…) ou entierement
 *  dans le vide est ignore : le reste du trait est conserve. */
function reliefStrokeAt(x: number, z: number): void {
  const stroke = reliefStroke;
  if (!editorState || !stroke) return;
  const target = reliefBrushOrigin(stroke.size, x, z);
  const origins = strokeOriginsBetween(stroke.last, target);
  stroke.last = target;
  let next: { cells: TerrainElevationCellDef[]; logic: Map<string, number> } | null = null;
  for (const o of origins) {
    const core = reliefBrushCore(stroke.size, o.x, o.z);
    if (core.every((key) => stroke.painted.has(key))) continue;
    // Meme validation que l'apercu (reliefBrushPlanAt) : refus et limite
    // atteinte sautent le tampon ; la partie hors carte est coupee.
    const plan = editorState.reliefBrushPlanAt(o.x, o.z, stroke.delta, stroke.size, stroke.painted, stroke.start);
    if (!plan.status.ok) continue;
    for (const key of plan.core) stroke.painted.add(key);
    next = { cells: plan.cells, logic: plan.logic };
  }
  if (!next) return;
  // Champ logique : change meme quand la surface ne bouge pas (historique).
  editorState.setReliefLogic(next.logic);
  stroke.changed = true;
  if (editorState.applyReliefCells(stroke.start.field, stroke.applied, next.cells)) rebuildEditorBoard();
  stroke.applied = next.cells;
}

/** Fin du trait : une seule entree d'historique s'il a change le relief. */
function endReliefStroke(): void {
  const stroke = reliefStroke;
  reliefStroke = null;
  if (!editorState || !stroke?.changed) return;
  const before = stroke.before;
  const after = editorState.mapShapeSnapshot();
  editorHistory.push({ undo: () => applyEditorMapShape(before), redo: () => applyEditorMapShape(after) });
}

/** Coins de tampon d'un trait de pinceau entre le tampon precedent `from`
 *  (null : debut du trait) et `target`, `target` compris : un par case de
 *  grille parcourue, pour qu'une souris rapide ne laisse aucun trou. */
function strokeOriginsBetween(from: { x: number; z: number } | null, target: { x: number; z: number }): { x: number; z: number }[] {
  const start = from ?? target;
  const steps = Math.max(Math.abs(target.x - start.x), Math.abs(target.z - start.z));
  if (steps === 0) return [target];
  const origins: { x: number; z: number }[] = [];
  for (let k = 1; k <= steps; k++) origins.push({ x: start.x + Math.round(((target.x - start.x) * k) / steps), z: start.z + Math.round(((target.z - start.z) * k) / steps) });
  return origins;
}

/** Taille du pinceau Surface (1×1 : details, 4×4 : grandes zones). */
let editorSurfaceSize: SurfaceBrushSize = 4;

/** Trait du pinceau Surface (bouton gauche maintenu) : purement visuel,
 *  applique en direct (seul le sol est reconstruit), une seule entree
 *  d'historique au relachement. Hors carte et trous ignores sans
 *  interrompre le trait. `before` : surfaces a l'appui ; `last` : coin du
 *  dernier tampon, pour interpoler. */
interface SurfaceStroke {
  before: SurfaceCellDef[];
  surface: GroundTextureId | null;
  size: SurfaceBrushSize;
  last: { x: number; z: number } | null;
  changed: boolean;
}
let surfaceStroke: SurfaceStroke | null = null;

function startSurfaceStroke(surface: GroundTextureId | null, size: SurfaceBrushSize): void {
  if (!editorState) return;
  if (surfaceStroke) endSurfaceStroke();
  surfaceStroke = { before: editorState.surfaceCells, surface, size, last: null, changed: false };
}

/** Peint le tampon sous (x, z) et les tampons intermediaires si la souris a
 *  saute des cases ; seul le sol est reconstruit, et seulement si une case
 *  a change. */
function surfaceStrokeAt(x: number, z: number): void {
  const stroke = surfaceStroke;
  if (!editorState || !stroke) return;
  const target = surfaceBrushOrigin(stroke.size, x, z);
  let changed = false;
  for (const o of strokeOriginsBetween(stroke.last, target)) {
    for (const c of editorState.surfaceBrushCellsAt(stroke.size, o.x, o.z)) {
      if (editorState.paintSurfaceCell(c.x, c.z, stroke.surface)) changed = true;
    }
  }
  stroke.last = target;
  if (!changed) return;
  stroke.changed = true;
  refreshEditorTerrainSurfaces();
}

/** Fin du trait : une seule entree d'historique, qui restaure toutes les
 *  surfaces d'avant (annuler) ou d'apres (retablir) le trait. */
function endSurfaceStroke(): void {
  const stroke = surfaceStroke;
  surfaceStroke = null;
  if (!editorState || !stroke?.changed) return;
  const before = stroke.before;
  const after = editorState.surfaceCells;
  const apply = (surfaces: SurfaceCellDef[]) => {
    editorState?.restoreSurfaces(surfaces);
    refreshEditorTerrainSurfaces();
  };
  editorHistory.push({ undo: () => apply(before), redo: () => apply(after) });
}

type BrushTool = 'paint-territory' | 'add-cell' | 'remove-cell';
interface BrushStroke {
  tool: BrushTool;
  visited: Set<string>;
  changed: boolean;
  beforeTerritory: TerritoryCell[] | undefined;
  beforeShape: EditorMapShapeSnapshot | null;
}
let brushStroke: BrushStroke | null = null;

function isBrushTool(type: EditorTool['type']): type is BrushTool {
  return type === 'paint-territory' || type === 'add-cell' || type === 'remove-cell';
}

/** Commence un trait avec l'outil actif (appui gauche au sol). */
function startBrushStroke(tool: BrushTool): void {
  if (!editorState) return;
  brushStroke = {
    tool,
    visited: new Set(),
    changed: false,
    beforeTerritory: editorState.territorySnapshot(),
    beforeShape: tool === 'paint-territory' ? null : editorState.mapShapeSnapshot(),
  };
}

/** Applique l'outil du trait a la case sous (x, z), une seule fois par case
 *  pendant le trait. Le plateau n'est reconstruit que si la case change
 *  reellement. */
function brushAt(x: number, z: number): void {
  const stroke = brushStroke;
  if (!editorState || !stroke || editorState.tool.type !== stroke.tool) return;
  const cellX = Math.floor(x);
  const cellZ = Math.floor(z);
  const key = `${cellX},${cellZ}`;
  if (stroke.visited.has(key)) return;
  stroke.visited.add(key);
  const tool = editorState.tool;
  if (tool.type === 'paint-territory') {
    if (editorState.paintTerritoryCell(cellX, cellZ, tool.team)) {
      stroke.changed = true;
      refreshEditorZones();
    }
    return;
  }
  // Memes regles qu'un clic isole (addCell / removeCell, qui retire aussi le
  // territoire explicite de la case supprimee), chaque case une seule fois
  // par trait.
  const changed = tool.type === 'add-cell' ? editorState.addCell(cellX, cellZ, tool.terrain) : editorState.removeCell(cellX, cellZ);
  if (!changed) return;
  stroke.changed = true;
  rebuildEditorBoard();
  updateEditorGhost(x, z);
}

/** Trace de murailles en cours dans l'editeur (outil de pose d'un batiment
 *  'line', core/wallTrace.ts), ou null. Une entree d'historique par portion
 *  validee ; Echap / clic droit, annuler / retablir et tout changement
 *  d'outil abandonnent la portion non construite. */
let editorWallTrace: { buildingId: string; trace: WallTrace } | null = null;

/** Trace de l'editeur s'il correspond encore a l'outil actif (sinon il est
 *  termine : changement d'outil). */
function activeEditorWallTrace(): WallTrace | null {
  const tool = editorState?.tool;
  if (editorWallTrace && (tool?.type !== 'place-building' || tool.buildingId !== editorWallTrace.buildingId)) finishEditorWallTrace();
  return editorWallTrace?.trace ?? null;
}

/** Termine le trace de l'editeur sans le fermer (Echap, clic droit,
 *  changement d'outil, Tester le scenario) : ses cases en attente deviennent
 *  des pieces droites, en une entree d'historique. */
function finishEditorWallTrace(): void {
  const current = editorWallTrace;
  editorWallTrace = null;
  if (!current || !editorState || current.trace.current.waiting.length === 0) return;
  const step = finalizeTracedWall(current.buildingId, current.trace, editorState.ballista, 'player');
  if (step.added.length === 0 && step.removed.length === 0) return;
  const before = editorState.objectsSnapshot();
  const removedIds = tracedBuildingsToRemove(editorState.buildings, step).map((b) => b.id);
  const placeable = step.added.filter((p) => editorState!.canReplaceBuildingPieces(removedIds, editorTracePieceCenters([p]), []));
  if (!editorState.replaceBuildingPieces(removedIds, editorTracePieceCenters(placeable), [])) return;
  editorState.buildings = reorientTracedBuildings(editorState.buildings, step.all);
  pushEditorObjectsCommand(before, editorState.objectsSnapshot());
  refreshEditorObjects();
}

/** Centres des segments d'une portion de trace (pose de l'editeur). */
function editorTracePieceCenters(pieces: readonly TracedWallPiece[]): { buildingId: string; x: number; z: number; rotationY: number }[] {
  return pieces.map((p) => ({ buildingId: p.buildingId, x: p.cornerX + p.tilesX / 2, z: p.cornerZ + p.tilesZ / 2, rotationY: p.rotationY }));
}

/** Murailles du brouillon raccordables par le trace de l'editeur (camp
 *  joueur, comme les pieces qu'il pose). */
function editorWallBuildings(): EditorBuilding[] {
  return (editorState?.buildings ?? []).filter((b) => b.team === 'player');
}

/** Cases en attente d'une etape, vues comme des demi-segments (elles le
 *  deviendront si le trace s'arrete) : elles doivent etre posables. */
function waitingHalfPieces(wallId: string, step: WallTraceStep): TracedWallPiece[] {
  const halfId = getBuilding(wallId).traceHalf ?? wallId;
  return step.waiting.map((c) => ({ kind: 'half', buildingId: halfId, cornerX: c.x, cornerZ: c.z, tilesX: 1, tilesZ: 1, rotationY: 0 }));
}

/** Termine le trait en cours : une entree d'historique s'il a change quelque
 *  chose. Annuler revient exactement a l'etat d'avant le trait (cases et
 *  territoire, y compris "aucun territoire explicite" pour une ancienne
 *  map) ; retablir rejoue le trait entier. */
function endBrushStroke(): void {
  const stroke = brushStroke;
  brushStroke = null;
  if (!editorState || !stroke?.changed) return;
  const beforeTerritory = stroke.beforeTerritory;
  const afterTerritory = editorState.territorySnapshot();
  const beforeShape = stroke.beforeShape;
  if (!beforeShape) {
    editorHistory.push({
      undo: () => {
        editorState?.restoreTerritory(beforeTerritory);
        refreshEditorZones();
      },
      redo: () => {
        editorState?.restoreTerritory(afterTerritory);
        refreshEditorZones();
      },
    });
    return;
  }
  const afterShape = editorState.mapShapeSnapshot();
  editorHistory.push({
    undo: () => {
      editorState?.restoreMapShape(beforeShape);
      editorState?.restoreTerritory(beforeTerritory);
      rebuildEditorBoard();
    },
    redo: () => {
      editorState?.restoreMapShape(afterShape);
      editorState?.restoreTerritory(afterTerritory);
      rebuildEditorBoard();
    },
  });
}

window.addEventListener('mousemove', (event) => {
  if ((!brushStroke && !reliefStroke && !surfaceStroke) || !inEditorMode) return;
  setRaycasterFromEvent(event);
  // Trait de sculpture : on vise le terrain du DEBUT du trait, sinon le
  // relief qui monte sous le curseur intercepte le rayon et le pinceau
  // derive vers la camera a chaque mouvement ; le vide prolonge ce terrain
  // (pickReliefPoint), le trait n'est jamais interrompu.
  // Pinceau Surface : meme pointage (le trait traverse trous et bord).
  if (!(reliefStroke || surfaceStroke ? pickReliefPoint() : intersectTerrain(raycaster.ray, groundHit))) return;
  if (reliefStroke) {
    reliefStrokeAt(groundHit.x, groundHit.z);
    updateEditorGhost(groundHit.x, groundHit.z);
  } else if (surfaceStroke) {
    surfaceStrokeAt(groundHit.x, groundHit.z);
    updateEditorGhost(groundHit.x, groundHit.z);
  } else {
    brushAt(groundHit.x, groundHit.z);
  }
});
window.addEventListener('mouseup', (event) => {
  if (event.button === 0 && brushStroke) endBrushStroke();
  if (event.button === 0 && reliefStroke) endReliefStroke();
  if (event.button === 0 && surfaceStroke) endSurfaceStroke();
});
window.addEventListener('blur', () => {
  if (brushStroke) endBrushStroke();
  if (reliefStroke) endReliefStroke();
  if (surfaceStroke) endSurfaceStroke();
});

function handleEditorClick(event: MouseEvent): void {
  if (!editorState || !editorAssets) return;
  setRaycasterFromEvent(event);
  // Pinceaux de relief : un trait peut commencer dans le vide.
  if (!(editorState.tool.type === 'relief-brush' || editorState.tool.type === 'paint-surface' ? pickReliefPoint() : intersectTerrain(raycaster.ray, groundHit))) return;

  if (editorState.tool.type === 'place-obstacle') {
    // Placement LIBRE : position exacte du clic, jamais arrondie a une case
    // (voir updateEditorGhost, meme regle pour l'apercu).
    const before = editorState.objectsSnapshot();
    if (editorState.placeAt(groundHit.x, groundHit.z)) pushEditorObjectsCommand(before, editorState.objectsSnapshot());
    clearEditorGhost();
    refreshEditorObjects();
    return;
  }

  // Pose CONTINUE (unites, batiments de scenario) : l'outil et son apercu
  // restent actifs apres chaque pose ; clic droit ou Echap reviennent a la
  // Selection.
  if (editorState.tool.type === 'place-unit') {
    const before = editorState.objectsSnapshot();
    if (editorState.placeUnitAt(snapToTileCenter(groundHit.x), snapToTileCenter(groundHit.z))) pushEditorObjectsCommand(before, editorState.objectsSnapshot());
    refreshEditorObjects();
    updateEditorGhost(groundHit.x, groundHit.z);
    return;
  }

  if (editorState.tool.type === 'place-building' && getBuilding(editorState.tool.buildingId).placementMode === 'line') {
    // Trace de murailles : premier clic = case de depart, puis une portion
    // par clic (tout ou rien, une entree d'historique), jusqu'a la fermeture.
    const buildingId = editorState.tool.buildingId;
    const trace = activeEditorWallTrace();
    const net = wallNetworkOf(editorWallBuildings());
    if (!trace) {
      // Premier clic : reprise d'une extremite existante, ou depart sur une
      // case libre.
      const snapped = wallEndNear(joinableWallEnds(net, null), groundHit.x, groundHit.z);
      const cell = traceCellAt(groundHit.x, groundHit.z);
      const resumed = snapped ? resumeTraceAt(net, snapped) : null;
      if (resumed) editorWallTrace = { buildingId, trace: resumed };
      else if (!snapped && editorState.canPlaceBuildingAt(getBuilding(buildingId).traceHalf ?? buildingId, cell.x + 0.5, cell.z + 0.5, undefined, 0)) editorWallTrace = { buildingId, trace: startWallTrace(cell) };
    } else {
      const join = wallJoinAt(net, trace, groundHit.x, groundHit.z);
      const plan = planTracedWallLeg(buildingId, trace, groundHit.x, groundHit.z, editorState.ballista, 'player', join?.path ?? null);
      const leg = plan.leg;
      const before = editorState.objectsSnapshot();
      const removedIds = tracedBuildingsToRemove(editorState.buildings, plan.step).map((b) => b.id);
      if (leg.usable && !wallStepTouchesGate(editorState.buildings, plan.step) && !wallStepSplitsLevels(plan.step, editorState.heightField()) && editorState.replaceBuildingPieces(removedIds, editorTracePieceCenters(plan.step.added), editorTracePieceCenters(waitingHalfPieces(buildingId, plan.step)))) {
        // Creneaux de tout le trace vers l'exterieur (meme entree d'historique).
        editorState.buildings = reorientTracedBuildings(editorState.buildings, plan.step.all);
        pushEditorObjectsCommand(before, editorState.objectsSnapshot());
        const next = advanceWallTrace(trace, leg);
        editorWallTrace = next ? { buildingId, trace: next } : null;
      }
    }
    refreshEditorObjects();
    updateEditorGhost(groundHit.x, groundHit.z);
    return;
  }

  if (editorState.tool.type === 'place-building') {
    const before = editorState.objectsSnapshot();
    if (editorState.placeBuildingAt(groundHit.x, groundHit.z)) pushEditorObjectsCommand(before, editorState.objectsSnapshot());
    refreshEditorObjects();
    updateEditorGhost(groundHit.x, groundHit.z);
    return;
  }

  // Pinceaux de relief : l'appui commence un trait (premier tampon), le
  // glisser l'etend (mousemove), le relachement le termine (une entree
  // d'historique) ; les decors suivent la surface en direct.
  if (editorState.tool.type === 'relief-brush') {
    startReliefStroke(editorState.tool.delta, editorState.tool.size);
    reliefStrokeAt(groundHit.x, groundHit.z);
    updateEditorGhost(groundHit.x, groundHit.z);
    return;
  }

  // Pinceau Surface : meme geste (appui, glisser, relachement : une entree
  // d'historique) ; jamais bloque par un objet pose sur la case.
  if (editorState.tool.type === 'paint-surface') {
    startSurfaceStroke(editorState.tool.surface, editorState.tool.size);
    surfaceStrokeAt(groundHit.x, groundHit.z);
    updateEditorGhost(groundHit.x, groundHit.z);
    return;
  }

  // Outils REPETABLES (+ Case, - Case, Territoire) : ne reviennent jamais
  // seuls a l'outil Selection. L'appui commence un trait, le glisser traite
  // les cases survolees, le relachement le termine (un seul Ctrl+Z).
  if (isBrushTool(editorState.tool.type)) {
    if (brushStroke) endBrushStroke();
    startBrushStroke(editorState.tool.type);
    brushAt(groundHit.x, groundHit.z);
    updateEditorGhost(groundHit.x, groundHit.z);
    return;
  }

  // Outil selection : un clic sur un objet/unite pose le selectionne ; un
  // clic sur le sol avec quelque chose deja selectionne le deplace ; un clic
  // dans le vide deselectionne.
  const picked = pickEditorObjectAt(event);

  if (picked?.kind === 'ballista') {
    editorState.select({ kind: 'ballista' });
  } else if (picked?.kind === 'building') {
    editorState.select({ kind: 'building', id: picked.id });
  } else if (picked?.kind === 'obstacle') {
    editorState.select({ kind: 'obstacle', id: picked.id });
  } else if (picked === null && !event.shiftKey && editorState.selection?.kind === 'ballista') {
    // Baliste selectionnee + appui au sol : tentative de deplacement des
    // l'appui, jamais un rectangle de selection. Resolu au relachement, un
    // leger mouvement de la souris pendant le clic (au-dela du seuil du
    // rectangle) vidait la selection sans deplacer la Baliste.
    moveEditorBallista(groundHit.x, groundHit.z);
  } else {
    // Unite ou sol : resolu au relachement, clic simple ou rectangle de
    // selection selon le deplacement (voir resolveEditorPointerClick).
    editorPointer = {
      startClientX: event.clientX,
      startClientY: event.clientY,
      dragging: false,
      shift: event.shiftKey,
      unitId: picked?.kind === 'unit' ? picked.id : null,
      groundX: groundHit.x,
      groundZ: groundHit.z,
    };
    return;
  }
  refreshEditorObjects();
}

/** Objet de l'editeur sous le curseur (decor, unite ou Baliste), ou null
 *  pour le sol : ce qu'un clic de l'outil selection viserait. En cas de
 *  double hit (rare, objets tres proches), le plus proche de la camera
 *  plutot qu'une priorite arbitraire. */
function pickEditorObjectAt(
  event: MouseEvent,
): { kind: 'ballista' } | { kind: 'obstacle'; id: number } | { kind: 'unit'; id: number } | { kind: 'building'; id: number } | null {
  setRaycasterFromEvent(event);
  const obstacleHit = raycaster.intersectObjects(editorObjectsGroup.children, true)[0];
  const unitHit = raycaster.intersectObjects(editorUnitsGroup.children, true)[0];
  const buildingHit = raycaster.intersectObjects(editorBuildingsGroup.children, true)[0];
  // La Baliste (modele partage avec le jeu, voir ballistaPlatform) est aussi
  // cliquable directement.
  const ballistaHit = raycaster.intersectObject(ballistaPlatform, true)[0];
  const hit = [obstacleHit, unitHit, buildingHit, ballistaHit].reduce<THREE.Intersection | undefined>(
    (best, h) => (h && (!best || h.distance < best.distance) ? h : best),
    undefined,
  );
  if (!hit) return null;
  if (hit === ballistaHit) return { kind: 'ballista' };
  if (hit === buildingHit) {
    const buildingId = findEditorBuildingId(hit.object);
    if (buildingId !== null) return { kind: 'building', id: buildingId };
  }
  const obstacleId = findEditorObstacleId(hit.object);
  if (obstacleId !== null) return { kind: 'obstacle', id: obstacleId };
  const unitId = findEditorUnitId(hit.object);
  return unitId !== null ? { kind: 'unit', id: unitId } : null;
}

/** Plan de deplacement des unites selectionnees de l'editeur, le centre de
 *  la formation venant au point `target`. Regles de l'editeur
 *  (canPlaceUnitAt : case existante, hors Baliste, sans obstacle bloquant ni
 *  autre unite, case non neutre), sans compter les cases actuelles des unites
 *  deplacees. Le camp montre est celui que le deplacement donnera : le
 *  proprietaire de la case d'arrivee (EditorState.territoryOwnerAt). */
function editorUnitMoveProposal(target: { x: number; z: number }): UnitMoveProposal | null {
  if (!editorState) return null;
  const state = editorState;
  const ids = new Set(state.selectedUnitIds);
  const units = state.units.filter((u) => ids.has(u.id));
  if (units.length === 0) return null;
  const members = units.map((u) => ({ key: u.id, x: u.x, z: u.z }));
  const plan = planGridGroupMove(members, target, {
    isFree: (_id, x, z) => state.canPlaceUnitAt(x, z, ids),
    searchRadius: GRID_MOVE_SEARCH_RADIUS,
    tile: TILE,
  });
  const items = plan.destinations.map((d, i) => ({ unitId: units[i]!.unitId, team: state.territoryOwnerAt(d.x, d.z) ?? units[i]!.team, x: d.x, z: d.z, valid: d.placed }));
  return { members, plan, items };
}

/** Deplacement propose par le curseur dans l'editeur, ou null si un clic a
 *  cet endroit ne deplacerait pas d'unites (outil de pose, aucune unite
 *  selectionnee, curseur sur un objet qu'un clic selectionnerait, rectangle,
 *  gizmo ou rotation en cours). */
function editorHoverMoveProposal(event: MouseEvent): UnitMoveProposal | null {
  if (!inEditorMode || !editorState || editorState.tool.type !== 'select') return null;
  if (editorPointer?.dragging || transformDragging || ringRotateDrag) return null;
  if (editorState.selectedUnitIds.length === 0) return null;
  if (pickEditorObjectAt(event) !== null) return null;
  const point = computeGroundPoint(event);
  return point ? editorUnitMoveProposal(point) : null;
}

/** Applique un plan de l'editeur valide : une seule entree d'historique pour
 *  tout le groupe, avec la position et le camp de chaque unite avant et
 *  apres. La selection est ensuite videe et l'apercu masque : l'etat redevient
 *  neutre (annuler / retablir ne restaure pas la selection). */
function applyEditorUnitMove(proposal: UnitMoveProposal): void {
  if (!editorState || !proposal.plan.valid) return;
  const { before, after } = editorState.moveUnits(proposal.plan.destinations.map((d) => ({ id: d.key, x: d.x, z: d.z })));
  editorHistory.push({
    undo: () => {
      editorState?.setUnitStates(before);
      refreshEditorObjects();
    },
    redo: () => {
      editorState?.setUnitStates(after);
      refreshEditorObjects();
    },
  });
  editorState.select(null);
  unitMovePreview.hide();
}

/** Appui gauche de l'outil selection sur une unite ou sur le sol de
 *  l'editeur, en attente de son relachement : sous UNIT_DRAG_THRESHOLD_PX
 *  c'est un clic (resolveEditorPointerClick), au-dela un rectangle de
 *  selection d'unites (meme SelectionBox qu'en bataille et en preparation),
 *  jamais les deux. Decors et Baliste restent selectionnes des l'appui. */
interface EditorPointerState {
  startClientX: number;
  startClientY: number;
  dragging: boolean;
  shift: boolean;
  /** Unite sous le curseur a l'appui, null pour le sol. */
  unitId: number | null;
  /** Point du sol vise a l'appui : destination d'un deplacement au clic. */
  groundX: number;
  groundZ: number;
}
let editorPointer: EditorPointerState | null = null;

function cancelEditorPointer(): void {
  if (editorPointer?.dragging) selectionBox.hide();
  editorPointer = null;
}

/** Clic (sans glisser) de l'outil selection de l'editeur. Sur une unite :
 *  sans Maj elle devient l'unique selection, un double-clic selectionne les
 *  unites visibles du meme type et du meme camp, Maj l'ajoute ou la retire.
 *  Sur le sol : Maj ne fait rien ; sans Maj, comportement inchange (la
 *  selection d'unites ou la Baliste s'y deplace, sinon deselection). */
function resolveEditorPointerClick(pointer: EditorPointerState, event: MouseEvent): void {
  if (!editorState) return;
  if (pointer.unitId !== null) {
    if (pointer.shift) {
      editorState.toggleUnitSelection(pointer.unitId);
      lastEditorUnitClickId = null;
      return;
    }
    const now = performance.now();
    if (pointer.unitId === lastEditorUnitClickId && now - lastEditorUnitClickTime < DOUBLE_CLICK_WINDOW_MS) {
      lastEditorUnitClickId = null;
      selectVisibleSameTypeEditorUnits(pointer.unitId);
    } else {
      lastEditorUnitClickId = pointer.unitId;
      lastEditorUnitClickTime = now;
      editorState.selectUnits([pointer.unitId]);
    }
    return;
  }

  if (pointer.shift) return;
  if (editorState.selectedUnitIds.length > 0) {
    // Deplacement selon le plan montre par l'apercu, au point de
    // relachement (meme calcul). Reussite : selection videe (voir
    // applyEditorUnitMove). Echec : rien ne bouge, la selection reste.
    const proposal = editorHoverMoveProposal(event);
    if (proposal && proposal.plan.valid && !isNoopGridMove(proposal.members, proposal.plan)) applyEditorUnitMove(proposal);
  } else {
    editorState.select(null);
  }
}

/** Double-clic sur une unite de l'editeur : toutes les unites du meme type
 *  ET du meme camp visibles a l'ecran (projetees dans le canvas), comme en
 *  bataille et en preparation. */
function selectVisibleSameTypeEditorUnits(anchorId: number): void {
  if (!editorState) return;
  const anchor = editorState.units.find((u) => u.id === anchorId);
  if (!anchor) return;
  const viewport = canvas.getBoundingClientRect();
  const visible = editorState.units.filter(
    (u) => u.unitId === anchor.unitId && u.team === anchor.team && isInScreenRect(worldToScreen(u.x, u.z), viewport),
  );
  editorState.selectUnits([anchorId, ...visible.map((u) => u.id)]);
}

/** Rectangle de selection relache dans l'editeur : remplace la selection
 *  par les unites (des deux camps) encadrees a l'ecran ; jamais un decor ni
 *  la Baliste. */
function selectEditorUnitsInRect(rect: ScreenRect): void {
  if (!editorState) return;
  editorState.selectUnits(editorState.units.filter((u) => isInScreenRect(worldToScreen(u.x, u.z), rect)).map((u) => u.id));
}

window.addEventListener('mousemove', (event) => {
  if (!editorPointer) return;
  if (!editorPointer.dragging) {
    const moved = Math.hypot(event.clientX - editorPointer.startClientX, event.clientY - editorPointer.startClientY);
    if (moved < UNIT_DRAG_THRESHOLD_PX) return;
    editorPointer.dragging = true;
    selectionBox.show();
  }
  selectionBox.update(editorPointer.startClientX, editorPointer.startClientY, event.clientX, event.clientY);
});

window.addEventListener('mouseup', (event) => {
  if (event.button !== 0 || !editorPointer) return;
  const pointer = editorPointer;
  cancelEditorPointer();
  if (!inEditorMode || !editorState) return;
  if (pointer.dragging) selectEditorUnitsInRect(selectionBox.toRect(pointer.startClientX, pointer.startClientY, event.clientX, event.clientY));
  else resolveEditorPointerClick(pointer, event);
  refreshEditorObjects();
});

/** Baliste selectionnee + clic au sol : deplacement cale sur sa grille 3×3
 *  s'il est valide (voir EditorState.moveBallista, canPlaceBallistaAt) ;
 *  sinon rien ne change et la Baliste reste selectionnee. Un deplacement
 *  reussi entre dans l'historique, statut explicite compris (meme patron que
 *  le deplacement d'un decor, voir le 'mouseUp' de transformControls). */
function moveEditorBallista(x: number, z: number): void {
  if (!editorState) return;
  const from = { position: { ...editorState.ballista }, explicit: editorState.ballistaExplicit };
  if (!editorState.moveBallista(x, z)) return;
  const to = { position: { ...editorState.ballista }, explicit: editorState.ballistaExplicit };
  editorHistory.push({
    undo: () => {
      editorState?.setBallista(from.position, from.explicit);
      refreshEditorObjects();
    },
    redo: () => {
      editorState?.setBallista(to.position, to.explicit);
      refreshEditorObjects();
    },
  });
}

// Raycast souris : sert a la fois a detecter un clic sur une unite et, a
// defaut, a trouver la case du sol vise — la surface VISIBLE du relief
// (intersectTerrain, render/terrainSurface.ts), le plan y = 0 sur une carte
// plate.
const raycaster = new THREE.Raycaster();
const groundHit = new THREE.Vector3();

function setRaycasterFromEvent(event: MouseEvent): void {
  setRaycasterFromClient(event.clientX, event.clientY);
}

function setRaycasterFromClient(clientX: number, clientY: number): void {
  const rect = canvas.getBoundingClientRect();
  const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
  raycaster.setFromCamera(ndc, renderer.camera);
}

// --- Vise et tir de la fleche du joueur ---------------------------------
//
// Vise libre au sol (decision d'Antoine) : le point vise est le sol sous le
// curseur, Q tire vers ce point exact — pas un verrouillage sur une unite, la
// cible peut donc bouger et esquiver un tir mal anticipe.

const aimReticle = createAimReticle();
renderer.scene.add(aimReticle);
let playerAimX = 0;
let playerAimZ = 0;

/** Derniere position ecran connue du curseur (tout mousemove, quelle que
 *  soit la phase), null tant que la souris n'a jamais bouge. La visee est
 *  recalculee depuis elle (voir aimAtPointer) plutot que figee au dernier
 *  mousemove : une rotation ou un deplacement de camera sans mouvement de
 *  souris change le point du sol sous le curseur. */
let lastPointerClient: { x: number; y: number } | null = null;

/** Recalcule playerAimX/Z : rayon camera -> sol sous la derniere position
 *  connue du curseur, ou sous le centre du canvas si la souris n'a jamais
 *  bouge. Appelee a chaque frame de bataille (reticule, orientation de la
 *  Baliste) et juste avant chaque tir. */
function aimAtPointer(): void {
  const rect = canvas.getBoundingClientRect();
  const x = lastPointerClient?.x ?? rect.left + rect.width / 2;
  const y = lastPointerClient?.y ?? rect.top + rect.height / 2;
  setRaycasterFromClient(x, y);
  if (!intersectTerrain(raycaster.ray, groundHit)) return;
  playerAimX = groundHit.x;
  playerAimZ = groundHit.z;
}

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
  if (playerArrowBoltsPerVolley(metaProgress) === 1) return [primary];

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

/** Baliste detruite (2026-08-16, architecture BUILDING) : le batiment
 *  gameplay de la bataille en cours est a 0 PV. `ballistaEntityId === null`
 *  (aucune bataille en cours, voir forgetBattleBuildings) : jamais
 *  detruite. Verifie en plus que l'entite est bien la Baliste, par
 *  prudence. */
function isBallistaDestroyed(): boolean {
  if (ballistaEntityId === null) return false;
  const entity = world.getById(ballistaEntityId);
  return entity !== undefined && entity.isBuilding && entity.unitId === 'ballista' && !entity.alive;
}

/** Tente un tir vers le point de visee ACTUEL (playerAimX/Z) — SOURCE UNIQUE
 *  de "tirer maintenant", partagee par l'appui sur Q (fireBallistaFromKey)
 *  ET le tir automatique en maintien de Q (voir attemptAutoFire ci-dessous,
 *  2026-08-13). `World.fireArrowVolley` reste la seule autorite
 *  sur "l'arme peut-elle tirer" (cooldown ecoule, aucun carreau d'une volee
 *  precedente deja en vol) — ni l'appui ni la boucle de tir auto ne
 *  dupliquent cette verification, aucun risque de double tir/double volee.
 *  UN SEUL appel a fireArrowVolley par tir (jamais 3 appels independants
 *  a fireArrow) : "Une attaque = un declenchement", un seul cooldown pour
 *  toute la volee, meme avec Mitraillette. */
function fireArrowIfReady(aimX: number = playerAimX, aimZ: number = playerAimZ): void {
  // Baliste detruite : verifie AVANT tout calcul de tir.
  if (isBallistaDestroyed()) return;
  // Hors de portee (AUTO comme MANUEL) : tir refuse, la recharge n'est ni
  // consommee ni remise a zero. En AUTO, un point anticipe au-dela de la
  // portee attend simplement le pas suivant.
  if (!isBallistaAimInRange(aimX, aimZ)) return;
  // Meme valeur de degats EFFECTIVE pour les 3 carreaux (talent Tir rapide +
  // amelioration Baliste deja inclus) — jamais reduite/partagee entre eux
  // (demande explicite : "chaque carreau = degats normaux de la Baliste").
  const damage = effectivePlayerArrowDamage(playerProgression());
  const shots: ArrowShotSpec[] = buildBallistaVolleyShots(playerArrowOrigin.x, playerArrowOrigin.z, aimX, aimZ).map((s) => ({
    ...s,
    damage,
  }));
  const fired = world.fireArrowVolley(shots, effectivePlayerArrowCooldown(playerProgression()), effectivePlayerArrowSpeed(metaProgress));
  // Anime le modele de la baliste (2026-08-13, nouveau modele FBX riggé —
  // voir render/ballista.ts) UNIQUEMENT sur un tir REELLEMENT parti (jamais
  // sur une tentative bloquee par le cooldown), meme garde-fou que le reste
  // de ce systeme : World.fireArrowVolley reste la seule autorite. Un seul
  // declenchement d'animation par VOLEE, jamais un par carreau.
  if (fired) playBallistaShot(ballista);
}

/** Combat actif, temps en marche : ni pause (menu ou timeScale 0), ni
 *  transition de fin de vague (battleOver, timeScale 0), ni hors bataille
 *  (placement, editeur, menu). Seul etat ou une commande clavier du joueur
 *  (tir, ordre, vitesse) peut agir sur la simulation. */
function isBattleTimeRunning(): boolean {
  return inBattlePhase() && !pauseMenuOpen && loop.timeScale > 0;
}

/** La Baliste ne tire que pendant un combat actif, temps en marche : jamais en
 *  pause (menu ou timeScale 0), pendant la transition de fin de vague
 *  (battleOver) ni hors bataille (placement, editeur, menu). Le clavier
 *  n'etant pas bloque par l'overlay de pause, contrairement a la souris, ce
 *  garde-fou est indispensable : sans lui, une volee preparee pendant la
 *  pause partirait a la reprise. */
function canFireBallista(): boolean {
  return isBattleTimeRunning();
}

/** Q maintenu (2026-08-13, talent "Tir rapide" : "le joueur peut maintenir
 *  [la commande de tir] pour continuer a tirer automatiquement"). L'INTENTION
 *  de tir seulement, jamais un minuteur/compteur de tirs : le RYTHME reel
 *  reste entierement determine par World.fireArrowVolley/
 *  effectivePlayerArrowCooldown (voir attemptAutoFire, appelee depuis le PAS
 *  DE SIMULATION FIXE — jamais depuis le rendu variable, pour qu'aucun tir ne
 *  depende du framerate). Remis a false au relachement de Q, a la perte de
 *  focus, en pause, en fin de bataille et a chaque nouvelle bataille. */
let fireKeyHeld = false;

/** Appui sur Q (hors repetition automatique du clavier, voir le listener
 *  keydown) : tir immediat vers le sol sous le curseur, rayon recalcule a
 *  cet instant (la camera a pu bouger depuis le dernier mousemove). Ne
 *  touche ni a la selection RTS, ni a un rectangle en cours, ni a un objet
 *  arme, qui reste arme. */
function fireBallistaFromKey(): void {
  // Q est inactif en AUTO (decision d'Antoine) : passer en MANUEL depuis la
  // fiche de la Baliste pour tirer au curseur.
  if (!canFireBallista() || ballistaFireMode !== 'manual') return;
  fireKeyHeld = true;
  aimAtPointer();
  fireArrowIfReady();
}

/** A appeler UNE FOIS PAR PAS DE SIMULATION (voir la boucle de jeu,
 *  `loop`, callback onStep) — no-op si Tir rapide n'est pas debloque (le
 *  maintien ne doit JAMAIS accorder cet avantage sans le talent, demande
 *  explicite d'Antoine, point 13), si Q n'est pas maintenu, ou si la
 *  Baliste ne peut pas tirer (voir canFireBallista). Pas de double tir avec
 *  l'appui initial : fireArrowVolley refuse tant que la recharge court. */
function attemptAutoFire(): void {
  if (!fireKeyHeld || ballistaFireMode !== 'manual' || !isTalentActive('tir_rapide') || !canFireBallista()) return;
  aimAtPointer();
  fireArrowIfReady();
}

/** Mode de tir de la Baliste (voir BallistaFireMode) : remis a `auto` au
 *  debut de chaque bataille (resetBattleControls), quel que soit le mode de
 *  la bataille precedente. */
let ballistaFireMode: BallistaFireMode = 'auto';
/** Cible AUTO courante (id d'entite), conservee tant qu'elle reste valide
 *  (voir selectBallistaAutoTarget). null hors bataille ou sans cible. */
let ballistaAutoTargetId: number | null = null;

/** Bascule AUTO / MANUEL demandee depuis la fiche de la Baliste. Ne touche
 *  JAMAIS a la recharge (World.playerArrow) : basculer ne permet aucun tir
 *  supplementaire. */
function setBallistaFireMode(mode: BallistaFireMode): void {
  if (!inBattlePhase() || ballistaFireMode === mode) return;
  ballistaFireMode = mode;
  ballistaAutoTargetId = null;
  fireKeyHeld = false;
  entityInfoSelectionKey = '';
}

/** Tir AUTOMATIQUE, une fois par pas de simulation fixe (comme
 *  attemptAutoFire) : cible = unite ennemie valide la plus proche, conservee
 *  tant qu'elle reste valide ; point vise anticipe (sim/ballistaAuto.ts).
 *  La cadence reste entierement celle de World.fireArrowVolley (recharge et
 *  volee en vol), via le meme fireArrowIfReady que le tir manuel. */
function attemptBallistaAutoFire(dt: number): void {
  if (ballistaFireMode !== 'auto' || !canFireBallista() || isBallistaDestroyed()) return;
  const current = ballistaAutoTargetId !== null ? world.getById(ballistaAutoTargetId) : undefined;
  const target = selectBallistaAutoTarget(world.entities, playerArrowOrigin.x, playerArrowOrigin.z, current, PLAYER_ARROW_RANGE);
  ballistaAutoTargetId = target?.id ?? null;
  if (!target) return;
  const arrow = world.playerArrow;
  if (arrow.cooldown > 0 || arrow.flights.length > 0) return;
  const aim = predictBallistaAimPoint(playerArrowOrigin.x, playerArrowOrigin.z, target, effectivePlayerArrowSpeed(metaProgress), dt);
  fireArrowIfReady(aim.x, aim.z);
}

/** Etat affiche par le HUD de la Baliste (voir ui/ballistaIndicator.ts) —
 *  "prete" exactement quand fireArrowVolley accepterait un tir : recharge
 *  terminee et aucune volee precedente encore en vol. La duree totale de la
 *  recharge est la recharge EFFECTIVE (bonus de cadence compris), celle-la
 *  meme qui a ete posee au dernier tir (voir fireArrowIfReady). */
function currentBallistaStatus(): BallistaStatus {
  if (isBallistaDestroyed()) return { kind: 'destroyed' };
  const arrow = world.playerArrow;
  if (arrow.cooldown > 0) return { kind: 'reloading', cooldownSeconds: arrow.cooldown, totalSeconds: effectivePlayerArrowCooldown(playerProgression()) };
  if (arrow.flights.length > 0) return { kind: 'inFlight' };
  return { kind: 'ready' };
}

/** Fiche d'entite (ui/entityInfoPanel.ts) : visible seulement pendant la
 *  preparation et la bataille, hors editeur, menus, pause, boutique (qui la
 *  recouvre), placement d'un bâtiment et transition de fin de vague
 *  (inBattlePhase est faux des que battleOver). */
function isEntityInfoContextActive(): boolean {
  if (inEditorMode || pauseMenuOpen) return false;
  if (inBattlePhase()) return true;
  return inPlacementPhase && buildingPlacementMode === null && !screens.isShopOpen() && !screens.isForgeOpen();
}

/** Modele de la fiche pour la selection courante, ou null sans selection.
 *  Bataille : lit les entites de simulation (stats deja effectives). Une
 *  unite morte a deja ete retiree de battleSelection par sync(). */
/** Niveau memorise d'une unite de la bataille en cours (battleUnitLevels). */
function battleUnitLevelOf(entity: Entity): number | null {
  return battleUnitLevels.get(entity.id) ?? null;
}

function currentEntityInfo(): EntityInfoViewModel | null {
  if (inBattlePhase()) {
    if (battleInspectedEntityId !== null) {
      const inspected = world.getById(battleInspectedEntityId);
      if (!inspected) return null;
      if (inspected.id === ballistaEntityId) return battleBallistaInfo(inspected, currentBallistaStatus(), playerProgression(), ballistaFireMode);
      // Productions de la Mine dans cette manche (aucune en « Tester le scénario »).
      const mineProductions = inspected.unitId === 'mine' && !inTestMode ? (mineProductionCounts.get(inspected.id) ?? 0) : null;
      return battleBuildingInfo(inspected, playerProgression(), battleOwnedBuildingLevel(inspected), mineProductions);
    }
    const aliveEntities = (ids: number[]): Entity[] => ids.map((id) => world.getById(id)).filter((e): e is Entity => e !== undefined && e.alive);
    // Ennemis inspectes (jamais dans battleSelection, donc jamais commandes) :
    // memes fiches qu'une selection alliee, stats de simulation, niveau
    // memorise au spawn.
    const enemies = aliveEntities(battleEnemyInspection.ids);
    if (enemies.length > 0) {
      return enemies.length === 1 ? battleUnitInfo(enemies[0]!, world.time, battleUnitLevelOf(enemies[0]!)) : battleGroupInfo(enemies, battleUnitLevelOf);
    }
    const units = aliveEntities(battleSelection.ids);
    if (units.length === 0) return null;
    return units.length === 1 ? battleUnitInfo(units[0]!, world.time, battleUnitLevelOf(units[0]!)) : battleGroupInfo(units, battleUnitLevelOf);
  }
  if (placementBallistaSelected) return placementBallistaInfo(playerProgression());
  if (selectedBuildingIndex !== null) {
    const owned = currentRun.buildings[selectedBuildingIndex];
    return owned ? placementBuildingInfo(owned, playerProgression(), currentRun.gold, armyMissingHp(currentRun)) : null;
  }
  const slots = selectedIndices.map((i) => placementSlots[i]).filter((slot): slot is PlacementSlot => slot !== undefined);
  if (slots.length === 0) return null;
  return slots.length === 1 ? placementUnitInfo(slots[0]!, playerProgression()) : placementGroupInfo(slots, playerProgression());
}

/** Cadence de la fiche : PV, recharges et minuteries n'ont pas besoin d'etre
 *  relus a chaque image ; un changement de selection, lui, est immediat. */
const ENTITY_INFO_REFRESH_MS = 100;
let entityInfoSelectionKey = '';
let entityInfoLastRefresh = 0;

function updateEntityInfoPanel(now: number): void {
  if (!isEntityInfoContextActive()) {
    entityInfoSelectionKey = '';
    entityInfoPanel.update(null);
    return;
  }
  const key = inBattlePhase()
    ? `b:${battleSelection.ids.join(',')}:${battleEnemyInspection.ids.join(',')}:${battleInspectedEntityId}`
    : `p:${selectedIndices.join(',')}:${selectedBuildingIndex}:${placementBallistaSelected}`;
  if (key === entityInfoSelectionKey && now - entityInfoLastRefresh < ENTITY_INFO_REFRESH_MS) return;
  entityInfoSelectionKey = key;
  entityInfoLastRefresh = now;
  entityInfoPanel.update(currentEntityInfo());
}

/** Clic gauche maintenu en bataille, en attente de son relachement :
 *  sous UNIT_DRAG_THRESHOLD_PX c'est un clic (voir resolveBattleSelectionClick),
 *  au-dela un rectangle de selection (meme SelectionBox que le placement),
 *  jamais les deux. */
interface CommandDragState {
  startClientX: number;
  startClientY: number;
  dragging: boolean;
}
let commandDrag: CommandDragState | null = null;

function cancelCommandDrag(): void {
  if (commandDrag?.dragging) selectionBox.hide();
  commandDrag = null;
}

/** Double-clic MANUEL en bataille, meme patron que lastUnitClickSlot en
 *  placement (deux clics sur la meme unite en moins de
 *  DOUBLE_CLICK_WINDOW_MS) ; etat separe, les ids d'entites n'ont rien a voir
 *  avec les index de placement. */
let lastBattleUnitClickId: number | null = null;
let lastBattleUnitClickTime = 0;

/** Clic gauche (sans glisser) en bataille. Sans Shift : l'unite
 *  alliee vivante sous le curseur devient l'unique selection, un clic
 *  ailleurs (terrain, ennemi, batiment) vide la selection, un double-clic
 *  selectionne les unites visibles du meme type. Une unite ennemie ou un
 *  bâtiment allie cliques sont inspectes (bascule), jamais selectionnes.
 *  Avec Shift : ajoute ou retire l'unite, ne change rien ailleurs. Aucun
 *  ordre n'est transmis. */
function resolveBattleSelectionClick(event: MouseEvent): void {
  const picked = pickEntityAtScreen(world.entities, event.clientX, event.clientY, worldToScreen, (id) => unitViews.getPosition(id));
  // Une unite cliquee garde la priorite sur un bâtiment proche (la Baliste
  // notamment, dont le rayon de selection a l'ecran est large).
  const pickedUnit = picked !== null && picked.isBuilding ? pickEntityAtScreen(world.entities.filter((e) => !e.isBuilding), event.clientX, event.clientY, worldToScreen, (id) => unitViews.getPosition(id)) : picked;
  const unit = pickedUnit !== null && pickedUnit.team === 'player' ? pickedUnit : null;

  if (event.shiftKey) {
    if (unit) {
      battleSelection.toggle(unit.id);
      battleEnemyInspection.clear();
      battleInspectedEntityId = null;
    }
    lastBattleUnitClickId = null;
    return;
  }
  if (!unit) {
    lastBattleUnitClickId = null;
    // Unite ennemie sous le curseur : inspection seule ; un second clic sur
    // l'ennemi deja seul inspecte la retire.
    const enemyUnit = pickedUnit !== null && pickedUnit.team !== 'player' && !pickedUnit.isBuilding ? pickedUnit : null;
    if (enemyUnit) {
      const alreadyAlone = battleEnemyInspection.size === 1 && battleEnemyInspection.has(enemyUnit.id);
      setBattleEnemyInspection(alreadyAlone ? [] : [enemyUnit.id]);
      return;
    }
    // Bâtiment allie ou Baliste : meme bascule qu'en preparation.
    const building = pickBattleInspectableBuilding(event, picked);
    const next = building !== null && building.id !== battleInspectedEntityId ? building.id : null;
    setBattleSelection([]);
    battleInspectedEntityId = next;
    return;
  }

  const now = performance.now();
  if (unit.id === lastBattleUnitClickId && now - lastBattleUnitClickTime < DOUBLE_CLICK_WINDOW_MS) {
    lastBattleUnitClickId = null;
    // Unites du meme type visibles a l'ecran : le viewport sert de rectangle.
    const visible = selectableUnitsInScreenRect(world.entities, canvas.getBoundingClientRect(), worldToScreen, (id) => unitViews.getPosition(id));
    setBattleSelection(visible.filter((e) => e.unitId === unit.unitId).map((e) => e.id));
    return;
  }
  lastBattleUnitClickId = unit.id;
  lastBattleUnitClickTime = now;
  setBattleSelection([unit.id]);
}

/** Rectangle de selection relache en bataille. Priorite au joueur, quel
 *  que soit l'ordre des entites : s'il encadre au moins une unite alliee,
 *  il selectionne toutes les unites alliees encadrees et ignore les
 *  ennemis ; sinon il inspecte tous les ennemis encadres ; vide, il
 *  efface tout. */
function selectBattleUnitsInRect(rect: ScreenRect): void {
  const renderedPosition = (e: Entity): { x: number; z: number } => unitViews.getPosition(e.id) ?? { x: e.x, z: e.z };
  const players = selectableUnitsInScreenRect(world.entities, rect, worldToScreen, (id) => unitViews.getPosition(id));
  if (players.length > 0) {
    setBattleSelection(players.map((e) => e.id));
    return;
  }
  const enemies = world.entities.filter((e) => {
    if (!e.alive || e.isBuilding || e.team === 'player') return false;
    const pos = renderedPosition(e);
    return isInScreenRect(worldToScreen(pos.x, pos.z), rect);
  });
  if (enemies.length > 0) setBattleEnemyInspection(enemies.map((e) => e.id));
  else setBattleSelection([]);
}

/** Remplace toute selection et toute inspection de bataille par la
 *  selection commandable des unites alliees `entityIds` (vide : plus rien). */
function setBattleSelection(entityIds: Iterable<number>): void {
  battleSelection.set(entityIds);
  battleEnemyInspection.clear();
  battleInspectedEntityId = null;
}

/** Remplace toute selection et toute inspection de bataille par
 *  l'inspection des unites ennemies `entityIds` : jamais commandable. */
function setBattleEnemyInspection(entityIds: Iterable<number>): void {
  battleEnemyInspection.set(entityIds);
  battleSelection.clear();
  battleInspectedEntityId = null;
}

/** Bâtiment allie (Mine, Caserne) ou Baliste inspecte en bataille : sa fiche
 *  est affichee, mais il n'entre jamais dans battleSelection, donc dans
 *  aucun ordre RTS (clic droit, S). Exclusif avec la selection d'unites et
 *  l'inspection d'ennemis (battleEnemyInspection). Id d'entite de la
 *  bataille en cours : abandonne quand l'entite disparait (world.clear())
 *  et a la destruction d'une Mine ou d'une Caserne, voir
 *  syncBattleInspection. */
let battleInspectedEntityId: number | null = null;
let battleInspectionRing: THREE.Mesh | null = null;
let battleInspectionRingEntityId: number | null = null;

/** Bâtiment allie vivant sous le curseur : la Mine ou la Caserne pointee,
 *  sinon celui dont l'empreinte au sol contient le point vise. La Baliste
 *  n'est retenue que par son empreinte au sol, jamais par sa silhouette :
 *  meme test qu'en preparation (isBallistaHoveredInPlacement). */
function pickBattleInspectableBuilding(event: MouseEvent, picked: Entity | null): Entity | null {
  if (picked !== null && picked.team === 'player' && picked.isBuilding && picked.id !== ballistaEntityId) return picked;
  const point = computeGroundPoint(event);
  if (!point) return null;
  for (const e of world.entities) {
    if (!e.alive || !e.isBuilding || e.team !== 'player' || !e.footprintObstacle) continue;
    const b = obstacleBounds(e.footprintObstacle);
    if (point.x >= b.minX && point.x <= b.maxX && point.z >= b.minZ && point.z <= b.maxZ) return e;
  }
  return null;
}

/** A chaque image : abandonne une inspection devenue invalide (entite
 *  disparue apres world.clear(), Mine ou Caserne detruite — la Baliste
 *  detruite reste inspectable, son etat DÉTRUITE etant deja celui du HUD) et
 *  place l'anneau d'inspection, meme taille et meme couleur qu'en
 *  preparation (updateBuildingSelectionRing). L'inspection survit a la
 *  transition de fin de vague, comme la barre de PV qui en depend. */
function syncBattleInspection(): void {
  if (battleInspectedEntityId !== null) {
    const entity = world.getById(battleInspectedEntityId);
    if (!entity || (!entity.alive && entity.id !== ballistaEntityId)) battleInspectedEntityId = null;
  }
  if (battleInspectionRingEntityId === battleInspectedEntityId) return;

  if (battleInspectionRing) {
    renderer.scene.remove(battleInspectionRing);
    battleInspectionRing.geometry.dispose();
    (battleInspectionRing.material as THREE.Material).dispose();
    battleInspectionRing = null;
  }
  battleInspectionRingEntityId = battleInspectedEntityId;
  const entity = battleInspectedEntityId !== null ? world.getById(battleInspectedEntityId) : undefined;
  if (!entity) return;
  const def = getBuilding(entity.unitId);
  const radius = entity.id === ballistaEntityId ? BALLISTA_TOWER_FOOTPRINT * 0.7 : Math.hypot(def.footprintTilesX ?? 1, def.footprintTilesZ ?? 1) / 2 + 0.2;
  battleInspectionRing = createEditorSelectionRing(radius);
  battleInspectionRing.position.set(entity.x, 0.02 + surfaceY(entity.x, entity.z), entity.z);
  (battleInspectionRing.material as THREE.MeshBasicMaterial).color.setHex(teamColor(entity.team));
  renderer.scene.add(battleInspectionRing);
}

/** Debut de chaque bataille (reelle ou "Tester le scenario") : aucune
 *  selection, aucun ordre au clic droit en attente, Q relache, visee
 *  recalculee sous le curseur. */
function resetBattleControls(): void {
  setBattleSelection([]);
  cancelCommandDrag();
  lastBattleUnitClickId = null;
  pendingRightClickOrder = false;
  fireKeyHeld = false;
  ballistaFireMode = 'auto';
  ballistaAutoTargetId = null;
  aimAtPointer();
}

/** Un ordre RTS ne peut etre emis que pendant un combat actif, temps en
 *  marche : jamais en pause (menu ou timeScale 0), pendant la transition de
 *  fin de vague (timeScale 0, battleOver) ni hors bataille. Empeche de mettre
 *  le jeu en pause pour programmer un ordre execute a la reprise. */
function canIssueRtsOrder(): boolean {
  return isBattleTimeRunning();
}

/** Clic droit seul en bataille, en attente de son relachement : il
 *  devient un ordre au relachement, quel que soit le mouvement de la souris
 *  entre-temps. Annule si un clic gauche s'y ajoute (pan, voir cameraDrag) ;
 *  jamais pose pour Maj + clic droit (rotation). */
let pendingRightClickOrder = false;

/** Clic droit court en bataille, pour toute la selection : attaque
 *  ciblee de la meme entite si une entite hostile vivante est sous le curseur
 *  (unite ou batiment ennemi), sinon deplacement de groupe autour du point du
 *  sol — l'orchestration n'envoie que ce point, la simulation repartit les
 *  destinations (voir assignGroupDestinations, sim/orders.ts). La simulation
 *  valide encore la commande (unites vivantes du joueur, cible hostile
 *  vivante ou destination dans le plateau) au debut du prochain pas. */
function issueRightClickOrder(event: MouseEvent): void {
  const entityIds = battleSelection.ids;
  if (entityIds.length === 0 || !canIssueRtsOrder()) return;

  const picked = pickEntityAtScreen(world.entities, event.clientX, event.clientY, worldToScreen, (id) => unitViews.getPosition(id));
  if (picked !== null && picked.team !== 'player') {
    world.issueCommand({ kind: 'attack', entityIds, targetEntityId: picked.id });
    return;
  }

  const point = computeGroundPoint(event);
  if (!point) return;
  world.issueCommand({ kind: 'move', entityIds, x: point.x, z: point.z });
}

/** S en bataille : interrompt l'ordre de toutes les unites
 *  selectionnees, qui passent en Garde. */
function issueStopOrder(): void {
  const entityIds = battleSelection.ids;
  if (entityIds.length === 0 || !canIssueRtsOrder()) return;
  world.issueCommand({ kind: 'stop', entityIds });
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
  // Le tir de Baliste est sur Q, independant du clic gauche qui utilise
  // l'objet : armer un objet n'interrompt plus un tir maintenu.
  if (armedItemIndex === null) healTargetRing.visible = false;
}

/** Point du sol (position REELLE du clic, pas alignee sur une case) sous le
 *  curseur, ou null si le rayon ne touche pas le plan — voir
 *  computeHoveredTile pour la variante alignee sur les cases (placement). */
function computeGroundPoint(event: MouseEvent): { x: number; z: number } | null {
  setRaycasterFromEvent(event);
  if (!intersectTerrain(raycaster.ray, groundHit)) return null;
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
    const maxHp = playerUnitMaxHp(slot.unitId, slot.productionLevel);
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
    const maxHp = playerUnitMaxHp(slot.unitId, slot.productionLevel);
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
 * l'objet (toujours le cas des qu'un objet est arme).
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
    const healAmount = effectivePlayerHealAmount(playerProgression().upgrades);
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
    const secondaryCount = healSecondaryTargetCount(healScrollUpgradeLevel(playerProgression().upgrades));
    if (secondaryCount > 0) {
      const secondaryAmount = effectivePlayerSecondaryHealAmount(playerProgression().upgrades);
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
    const maxHp = playerUnitMaxHp(slot.unitId, slot.productionLevel);
    const healAmount = effectivePlayerHealAmount(playerProgression().upgrades);
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

    const secondaryCount = healSecondaryTargetCount(healScrollUpgradeLevel(playerProgression().upgrades));
    if (secondaryCount > 0) {
      const secondaryAmount = effectivePlayerSecondaryHealAmount(playerProgression().upgrades);
      const secondaryIndices = findSecondaryHealSlotIndices(slotIndex, secondaryCount, HEAL_SCROLL_UPGRADE.secondaryTargetRadius);
      for (const i of secondaryIndices) {
        const s = placementSlots[i]!;
        const sMaxHp = playerUnitMaxHp(s.unitId, s.productionLevel);
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
  if (!intersectTerrain(raycaster.ray, groundHit)) return null;
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
/** Slot pose dont l'empreinte (getFootprintTiles, meme regle d'occupation
 *  que isValidPlacementTile) contient la case (tileX, tileZ), hors
 *  `exclude`. Au plus un en pratique (la validation interdit deux unites
 *  sur une case) ; dans un etat anormal, le plus petit index, toujours le
 *  meme. */
function findSlotAtTile(tileX: number, tileZ: number, exclude: readonly number[]): number | null {
  const index = placementSlots.findIndex((s, i) => {
    if (exclude.includes(i) || s.x === null || s.z === null) return false;
    return getFootprintTiles(s.unitId, s.x, s.z).some((t) => t.x === tileX && t.z === tileZ);
  });
  return index >= 0 ? index : null;
}

/** Repli de la selection au clic quand le rayon manque le modele d'une
 *  unite : l'unite qui occupe la case sous le curseur. Les unites deja
 *  selectionnees sont exclues (un clic sur leur case deplace le groupe, ce
 *  qui permet de decaler une formation compacte d'une case), sauf l'unite
 *  qui vient d'etre cliquee, pendant la fenetre du double-clic et sans Maj :
 *  un second clic sur sa case complete alors le double-clic. */
function findFallbackSlot(event: MouseEvent, shift: boolean): number | null {
  const tile = computeHoveredTile(event);
  if (!tile) return null;
  const recentClick = !shift && lastUnitClickSlot !== null && performance.now() - lastUnitClickTime < DOUBLE_CLICK_WINDOW_MS ? lastUnitClickSlot : null;
  return findSlotAtTile(tile.x, tile.z, selectedIndices.filter((i) => i !== recentClick));
}

function isValidPlacementTile(tileX: number, tileZ: number, excludeIndices: number[], excludeBuildingIndex?: number): boolean {
  const occupied = placementSlots.some((s, i) => {
    if (excludeIndices.includes(i) || s.x === null || s.z === null) return false;
    return getFootprintTiles(s.unitId, s.x, s.z).some((t) => t.x === tileX && t.z === tileZ);
  });
  if (occupied) return false;

  // Une case occupee par un obstacle BLOQUANT (« Obstacles / structures »)
  // ne peut pas recevoir d'unite : sans ce test, l'unite se retrouverait
  // plantee dans l'obstacle au placement, puis rejetee au demarrage de la
  // bataille (resolveObstacleCollisions), ce qui se voit comme un petit
  // saut. Les DECORS (arbres, rochers, vegetation, structures decoratives…)
  // sont purement visuels depuis le 2026-10-28 (voir config/constants.ts,
  // isBlockingMapObstacle) : une unite ou un batiment se pose dessus.
  // Les batiments possedes (Mine, Caserne, Forge) ET la plateforme Baliste
  // (2026-08-16, TOUJOURS presente — voir activeBuildingObstacles) sont
  // fusionnees ici aussi : sans ca, une unite pourrait se retrouver placee
  // visuellement DANS un batiment gameplay pendant le placement, puis
  // rejetee au debut de la bataille reelle (meme World.spawnBuilding, voir
  // onValidatePlacement) — meme desagrement de "petit saut" que pour un
  // rocher/arbre. `excludeBuildingIndex` (2026-08-17) : voir
  // activeBuildingObstacles, indispensable pour DEPLACER un bâtiment deja
  // possede sans qu'il se bloque lui-meme.
  // Decors : jamais bloquants (isBlockingMapObstacle) ; batiments et Baliste : toujours.
  const onObstacle = [...currentMap.obstacles.filter(isBlockingMapObstacle), ...activeBuildingObstacles(excludeBuildingIndex)].some((o) => {
    const b = obstacleBounds(o);
    return tileX > b.minX && tileX < b.maxX && tileZ > b.minZ && tileZ < b.maxZ;
  });
  if (onObstacle) return false;

  // Zone de placement : la case doit appartenir au joueur dans le territoire
  // courant (voir currentTerritoryIndex) — plus aucun calcul de bande ici.
  return territoryOwnerAtPoint(currentTerritoryIndex(), tileX, tileZ) === 'player';
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
  /** Mode Muraille (BuildingDef.placementMode 'line') : trace en cours
   *  (core/wallTrace.ts) apres le premier clic, null avant et apres une
   *  enceinte fermee. Toujours null pour un batiment pose a l'unite. */
  trace: WallTrace | null;
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

/** Baliste selectionnee en preparation (simple clic sur la tour) : meme
 *  bascule et meme anneau que la selection d'un bâtiment possede, mais elle
 *  ne se deplace jamais pendant la preparation. Exclusive avec
 *  selectedBuildingIndex. */
let placementBallistaSelected = false;

/** Camp du joueur de la run : proprietaire des bâtiments possedes et de la
 *  Baliste, dont l'anneau de selection prend la couleur (teamColor). */
const RUN_OWNER_TEAM: Team = 'player';
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
  if (placementBallistaSelected) {
    // Meme taille que l'anneau de la Baliste dans l'editeur.
    buildingSelectionRing = createEditorSelectionRing(BALLISTA_TOWER_FOOTPRINT * 0.7);
    buildingSelectionRing.position.set(playerArrowOrigin.x, 0.02 + surfaceY(playerArrowOrigin.x, playerArrowOrigin.z), playerArrowOrigin.z);
  } else {
    if (selectedBuildingIndex === null) return;
    const owned = currentRun.buildings[selectedBuildingIndex];
    if (!owned) {
      selectedBuildingIndex = null;
      return;
    }
    const { tilesX, tilesZ } = buildingFootprintTiles(owned.buildingId, owned.rotationY ?? 0);
    buildingSelectionRing = createEditorSelectionRing(Math.hypot(tilesX, tilesZ) / 2 + 0.2);
    buildingSelectionRing.position.set(owned.x, 0.02 + surfaceY(owned.x, owned.z), owned.z);
  }
  // Materiau propre a cet anneau (recree a chaque selection) : couleur du
  // camp proprietaire, jamais l'or reserve aux objets neutres.
  (buildingSelectionRing.material as THREE.MeshBasicMaterial).color.setHex(teamColor(RUN_OWNER_TEAM));
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
function canPlaceBuildingAt(buildingId: string, cornerX: number, cornerZ: number, excludeBuildingIndex?: number, rotationY = 0): boolean {
  const { tilesX, tilesZ } = buildingFootprintTiles(buildingId, rotationY);
  // Relief : emprise entierement plate, a un seul niveau.
  if (gameTerrain().flatLevelOver(cornerX, cornerX + tilesX, cornerZ, cornerZ + tilesZ) === null) return false;
  return buildingFootprintCells(cornerX, cornerZ, tilesX, tilesZ).every((c) => isValidPlacementTile(c.x, c.z, [], excludeBuildingIndex));
}

/** Relief : vrai si une etape de trace ne tient pas sur UN seul niveau
 *  plat (pieces du trace et cases en attente) — une portion de muraille ne
 *  franchit jamais une falaise ni une pente. */
function wallStepSplitsLevels(step: WallTraceStep, field: TerrainHeightField): boolean {
  if (field.isFlat) return false;
  const levels = new Set<number | null>();
  for (const p of step.all) levels.add(field.flatLevelOver(p.cornerX, p.cornerX + p.tilesX, p.cornerZ, p.cornerZ + p.tilesZ));
  for (const c of step.waiting) levels.add(field.flatLevelOver(c.x, c.x + 1, c.z, c.z + 1));
  return levels.has(null) || levels.size > 1;
}

/** Segment de muraille sous le curseur avant le premier clic du trace,
 *  oriente selon `restRotationY` (Ctrl+molette). Partage par la preparation
 *  et l'editeur. */
function wallRestPiece(buildingId: string, x: number, z: number, restRotationY: number): TracedWallPiece {
  const { tilesX, tilesZ } = buildingFootprintTiles(buildingId, restRotationY);
  const cell = traceCellAt(x, z);
  return { kind: 'straight', buildingId, cornerX: cell.x, cornerZ: cell.z, tilesX, tilesZ, rotationY: tilesX >= tilesZ ? 0 : Math.PI / 2 };
}

/** Execute `check` comme si les batiments `removed` n'existaient plus (piece
 *  re-appariee par le trace), puis les remet en place. */
function withoutOwnedBuildings<R>(removed: readonly OwnedBuilding[], check: () => R): R {
  if (removed.length === 0) return check();
  const saved = [...currentRun.buildings];
  currentRun.buildings.splice(0, saved.length, ...saved.filter((b) => !removed.includes(b)));
  try {
    return check();
  } finally {
    currentRun.buildings.splice(0, currentRun.buildings.length, ...saved);
  }
}

/** Etape de trace posable : or suffisant (cout de l'etape, voir
 *  wallLayoutCost) et chaque nouvelle piece ET chaque case en attente
 *  valides selon la regle de toute construction du joueur
 *  (canPlaceBuildingAt : territoire joueur, cases existantes, ni obstacle,
 *  ni batiment, ni unite). Tout ou rien. */
function wallLineStatus(buildingId: string, step: WallTraceStep): { cost: number; affordable: boolean; placeable: boolean } {
  const halfId = getBuilding(buildingId).traceHalf ?? buildingId;
  const placeable =
    !wallStepTouchesGate(currentRun.buildings, step) &&
    !wallStepSplitsLevels(step, gameTerrain()) &&
    withoutOwnedBuildings(tracedBuildingsToRemove(currentRun.buildings, step), () =>
      step.added.every((s) => canPlaceBuildingAt(s.buildingId, s.cornerX, s.cornerZ, undefined, s.rotationY)) && step.waiting.every((c) => canPlaceBuildingAt(halfId, c.x, c.z, undefined, 0)),
    );
  return { cost: step.cost, affordable: currentRun.gold >= step.cost, placeable };
}

/** Applique une etape de trace aux batiments du joueur : retire les pieces
 *  re-appariees, pose les nouvelles, reoriente tout le trace, debite (ou
 *  rembourse) l'or. */
function applyOwnedWallStep(step: WallTraceStep): void {
  const removed = tracedBuildingsToRemove(currentRun.buildings, step);
  const kept = currentRun.buildings.filter((b) => !removed.includes(b));
  // Jamais de reparation gratuite : une piece recomposee garde le
  // pourcentage de PV des cases qu'elle reprend (moyenne par case) ; une case
  // nouvellement construite part a 100 %.
  const cellHealth = new Map<string, number>();
  for (const b of removed) {
    const { tilesX, tilesZ } = buildingFootprintTiles(b.buildingId, b.rotationY ?? 0);
    const ratio = b.hp / getBuilding(b.buildingId).maxHp;
    for (const c of tracePieceCells({ cornerX: b.x - tilesX / 2, cornerZ: b.z - tilesZ / 2, tilesX, tilesZ })) cellHealth.set(c, ratio);
  }
  for (const s of step.added) {
    const cells = tracePieceCells(s);
    const ratio = cells.reduce((sum, c) => sum + (cellHealth.get(c) ?? 1), 0) / cells.length;
    const maxHp = getBuilding(s.buildingId).maxHp;
    kept.push({ buildingId: s.buildingId, x: s.cornerX + s.tilesX / 2, z: s.cornerZ + s.tilesZ / 2, hp: Math.max(1, Math.round(maxHp * ratio)), rotationY: s.rotationY });
  }
  currentRun.buildings.splice(0, currentRun.buildings.length, ...reorientTracedBuildings(kept, step.all));
  currentRun.gold = Math.max(0, roundGold(currentRun.gold - step.cost));
  if (step.cost > 0) spawnCoinPopup(screens.shopGoldElement, -step.cost);
}

/** Termine le trace en cours de la preparation (Echap, clic droit, sortie du
 *  mode) : ses cases en attente, deja payees, deviennent des pieces droites.
 *  Une case devenue invalide entre-temps reste vide et est remboursee. */
function finishOwnedWallTrace(): void {
  const mode = buildingPlacementMode;
  if (!mode?.trace) return;
  const trace = mode.trace;
  mode.trace = null;
  // Muraille reprise sans nouvelle portion : rien a finaliser.
  if (trace.current.waiting.length === 0) return;
  const step = finalizeTracedWall(mode.buildingId, trace, playerArrowOrigin, 'player');
  const placeable = withoutOwnedBuildings(tracedBuildingsToRemove(currentRun.buildings, step), () =>
    step.added.filter((s) => canPlaceBuildingAt(s.buildingId, s.cornerX, s.cornerZ, undefined, s.rotationY)),
  );
  const refundUnits = step.added.filter((s) => !placeable.includes(s)).reduce((sum, s) => sum + (s.kind === 'half' ? 0.5 : 1), 0);
  applyOwnedWallStep({ ...step, added: placeable, cost: roundGold(step.cost - getEffectiveBuildingCost(mode.buildingId) * refundUnits) });
  refreshOwnedBuildingViews();
}

/** Clic sur un bouton "Bâtiments" de la boutique : entre en mode de
 *  placement — AUCUN or depense ici (voir confirmBuildingPlacement). Refuse
 *  silencieusement si l'or est insuffisant (garde-fou en plus du bouton deja
 *  desactive cote UI, voir ui/screens.ts refreshShop). */
function requestPlaceBuilding(buildingId: string): void {
  // Cout EFFECTIF (2026-08-18, Mine/Caserne desormais plus cheres a chaque
  // amelioration permanente — voir getEffectiveBuildingCost, SOURCE UNIQUE
  // partagee avec l'affichage boutique ET confirmBuildingPlacement plus bas).
  if (currentRun.gold < getEffectiveBuildingCost(buildingId)) return;
  disarmItem();
  // Changement d'outil pendant un trace de murailles : ses extremites deja
  // payees sont construites.
  finishOwnedWallTrace();
  buildingPlacementMode = { buildingId, rotationY: 0, movingIndex: null, trace: null };
  buildingRotationHint.setText(placementHintText(buildingId, null));
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
  finishOwnedWallTrace();
  selectedBuildingIndex = null;
  placementBallistaSelected = false;
  updateBuildingSelectionRing();
  buildingPlacementMode = { buildingId: owned.buildingId, rotationY: owned.rotationY ?? 0, movingIndex: index, trace: null };
  buildingRotationHint.setText(placementHintText(owned.buildingId, null));
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
  // 90° pour une emprise qui suit la rotation (muraille), 45° sinon.
  const step = buildingRotationStep(buildingPlacementMode.buildingId);
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
  // Trace de murailles en cours : ses extremites deja payees sont construites.
  finishOwnedWallTrace();
  if (buildingPlacementMode?.movingIndex !== null && buildingPlacementMode?.movingIndex !== undefined) {
    const view = ownedBuildingViews[buildingPlacementMode.movingIndex];
    if (view) view.mesh.visible = true;
  }
  buildingPlacementMode = null;
  buildingPlacementGroup.clear();
  buildingRotationHint.setVisible(false);
}

/** Termine le trace de murailles en cours (Echap / clic droit) : l'apercu
 *  de la portion suivante disparait ; les cases en attente des portions
 *  validees (deja payees) deviennent des pieces droites — une ligne ouverte
 *  reste complete. Le mode Muraille reste actif pour un nouveau trace. */
function cancelWallTrace(): void {
  if (!buildingPlacementMode) return;
  finishOwnedWallTrace();
  updateBuildingPlacementGhost(lastBuildingGhostGroundX, lastBuildingGhostGroundZ);
}

/** Repositionne le fantome + l'apercu vert/rouge sous le curseur — appele a
 *  chaque mousemove tant qu'un placement de batiment est en cours. */
function updateBuildingPlacementGhost(x: number, z: number): void {
  if (!buildingPlacementMode) return;
  lastBuildingGhostGroundX = x;
  lastBuildingGhostGroundZ = z;
  buildingPlacementGroup.clear();
  const mode = buildingPlacementMode;
  const def = getBuilding(mode.buildingId);
  if (isLinePlacement(mode)) {
    // Mode Muraille : avant le premier clic, un segment sous le curseur ;
    // ensuite la PORTION de l'ancre au curseur (segments futurs, virage
    // compris, et case en attente), verte si toute la portion est posable.
    const net = wallNetworkOf(currentRun.buildings);
    if (!mode.trace) {
      // Extremites existantes raccordables : le curseur s'y aimante pour
      // reprendre la muraille ; ailleurs, le depart doit etre une case libre.
      const ends = joinableWallEnds(net, null);
      const snapped = wallEndNear(ends, x, z);
      addWallEndMarkers(buildingPlacementGroup, ends, snapped);
      if (!snapped) {
        const piece = wallRestPiece(mode.buildingId, x, z, mode.rotationY);
        addBuildingPreview(mode.buildingId, piece.cornerX, piece.cornerZ, piece.rotationY, canPlaceBuildingAt(getBuilding(mode.buildingId).traceHalf ?? mode.buildingId, piece.cornerX, piece.cornerZ, undefined, 0));
      }
      buildingRotationHint.setText(placementHintText(mode.buildingId, null, snapped !== null));
      return;
    }
    const join = wallJoinAt(net, mode.trace, x, z);
    addWallEndMarkers(buildingPlacementGroup, joinableWallEnds(net, mode.trace), join?.end ?? null);
    const plan = planTracedWallLeg(mode.buildingId, mode.trace, x, z, playerArrowOrigin, 'player', join?.path ?? null);
    const status = wallLineStatus(mode.buildingId, plan.step);
    const valid = plan.leg.usable && status.placeable && status.affordable;
    // Pieces existantes qui seront recomposees : leurs cases, puis le
    // resultat (virage, segments) en fantome.
    for (const r of plan.step.removed) for (const c of tracePieceCells(r)) buildingPlacementGroup.add(buildCellPreview(+c.split(',')[0]!, +c.split(',')[1]!, valid));
    for (const s of plan.step.added) addBuildingPreview(s.buildingId, s.cornerX, s.cornerZ, s.rotationY, valid);
    for (const c of plan.step.waiting) buildingPlacementGroup.add(buildCellPreview(c.x, c.z, valid));
    buildingRotationHint.setText(placementHintText(mode.buildingId, { leg: plan.leg, cells: wallLegCellCount(mode.trace, plan.leg), joinCost: plan.step.joinCost, ...status }));
    return;
  }
  const { tilesX, tilesZ } = buildingFootprintTiles(mode.buildingId, mode.rotationY);
  const { cornerX, cornerZ } = computeBuildingFootprintCorner(x, z, tilesX, tilesZ);
  const replaced = replaceableBuildingIndex(mode, cornerX, cornerZ);
  const valid = canPlaceBuildingAt(mode.buildingId, cornerX, cornerZ, replaced ?? mode.movingIndex ?? undefined, mode.rotationY);
  if (def.buildingModel) addBuildingPreview(mode.buildingId, cornerX, cornerZ, mode.rotationY, valid);
}

/** Index du batiment possede que l'achat en cours REMPLACERAIT
 *  (BuildingDef.placeOverBuildingId : porte posee exactement sur un segment
 *  de mur), ou null. Jamais pendant un deplacement. */
function replaceableBuildingIndex(mode: BuildingPlacementMode, cornerX: number, cornerZ: number): number | null {
  const over = getBuilding(mode.buildingId).placeOverBuildingId;
  if (!over || mode.movingIndex !== null) return null;
  const { tilesX, tilesZ } = buildingFootprintTiles(mode.buildingId, mode.rotationY);
  const x = cornerX + tilesX / 2;
  const z = cornerZ + tilesZ / 2;
  const index = currentRun.buildings.findIndex((b) => b.buildingId === over && sameBuildingFootprint(mode.buildingId, x, z, mode.rotationY, b.buildingId, b.x, b.z, b.rotationY ?? 0));
  return index >= 0 ? index : null;
}

/** Vrai pour un achat en mode Muraille (pose par lignes). */
function isLinePlacement(mode: BuildingPlacementMode): boolean {
  return mode.movingIndex === null && getBuilding(mode.buildingId).placementMode === 'line';
}

/** Apercu d'un batiment de placement : cases vertes/rouges de son emprise
 *  (tournee) et modele du jeu en fantome. */
function addBuildingPreview(buildingId: string, cornerX: number, cornerZ: number, rotationY: number, valid: boolean): void {
  const obstacle = gameplayBuildingObstacle(buildingId, 0, 0, rotationY);
  for (let dz = 0; dz < obstacle.tilesZ; dz++) {
    for (let dx = 0; dx < obstacle.tilesX; dx++) buildingPlacementGroup.add(buildCellPreview(cornerX + dx, cornerZ + dz, valid));
  }
  const centerX = cornerX + obstacle.tilesX / 2;
  const centerZ = cornerZ + obstacle.tilesZ / 2;
  buildingPlacementGroup.add(buildGhost(gameplayBuildingObstacle(buildingId, centerX, centerZ, rotationY), centerX, centerZ, environmentAssets));
}

/** Cases nouvellement couvertes par une portion de trace : sa longueur, plus
 *  la case de depart pour la premiere portion, moins la case de depart deja
 *  couverte pour la fermeture. */
function wallLegCellCount(trace: WallTrace, leg: WallTraceLeg): number {
  if (leg.single) return 1;
  const length = Math.abs(leg.end.x - trace.anchor.x) + Math.abs(leg.end.z - trace.anchor.z);
  return trace.dirs.length === 0 ? length + 1 : leg.closes || leg.joins ? length - 1 : length;
}

/** Texte de l'indication de placement : rotation pour un batiment pose a
 *  l'unite ; en mode Muraille, etape du trace, nombre de cases couvertes par
 *  la portion et son cout. */
function placementHintText(buildingId: string, line: { leg: WallTraceLeg; cells: number; joinCost: number; cost: number; affordable: boolean; placeable: boolean } | null, resume = false): string {
  const def = getBuilding(buildingId);
  const rotate = `Ctrl + molette — tourner (${def.footprintFollowsRotation ? 90 : 45}°)`;
  if (def.placementMode !== 'line') return rotate;
  if (!line) return resume ? `${def.displayName} : clic — reprendre la muraille ici · clic droit / Échap — quitter` : `${def.displayName} : clic — début du tracé · ${rotate} · clic droit / Échap — quitter`;
  const count = line.cells;
  const issue = !line.leg.usable || !line.placeable ? ' · emplacement invalide' : !line.affordable ? ' · or insuffisant' : '';
  const close = line.leg.closes ? ' · ferme l’enceinte' : line.leg.joins ? ' · relie les murailles' : '';
  const join = line.joinCost > 0 ? ` (dont ${formatGold(line.joinCost)} or de raccord)` : '';
  return `${def.displayName} : ${count} case${count > 1 ? 's' : ''} — ${formatGold(line.cost)} or${join}${issue}${close} · clic — construire · clic droit / Échap — annuler le tracé`;
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
  if (!intersectTerrain(raycaster.ray, groundHit)) return false;
  if (isLinePlacement(buildingPlacementMode)) return confirmWallLine(groundHit.x, groundHit.z);
  const def = getBuilding(buildingPlacementMode.buildingId);
  const { tilesX, tilesZ } = buildingFootprintTiles(buildingPlacementMode.buildingId, buildingPlacementMode.rotationY);
  const { cornerX, cornerZ } = computeBuildingFootprintCorner(groundHit.x, groundHit.z, tilesX, tilesZ);
  const replaced = replaceableBuildingIndex(buildingPlacementMode, cornerX, cornerZ);
  if (!canPlaceBuildingAt(buildingPlacementMode.buildingId, cornerX, cornerZ, replaced ?? buildingPlacementMode.movingIndex ?? undefined, buildingPlacementMode.rotationY)) return false;

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
  const cost = getEffectiveBuildingCost(buildingPlacementMode.buildingId);
  if (currentRun.gold < cost) {
    cancelBuildingPlacement();
    return false;
  }
  currentRun.gold = Math.max(0, roundGold(currentRun.gold - cost));
  // Porte posee sur un segment de mur : elle le remplace (prix de la porte,
  // mur retire sans remboursement).
  // La porte reprend l'orientation du mur remplace (meme exterieur).
  const rotationY = replaced !== null ? currentRun.buildings[replaced]!.rotationY ?? buildingPlacementMode.rotationY : buildingPlacementMode.rotationY;
  if (replaced !== null) currentRun.buildings.splice(replaced, 1);
  currentRun.buildings.push({
    buildingId: def.id,
    x: cornerX + tilesX / 2,
    z: cornerZ + tilesZ / 2,
    hp: def.maxHp,
    rotationY,
  });
  spawnCoinPopup(screens.shopGoldElement, -cost);
  cancelBuildingPlacement();
  refreshOwnedBuildingViews();
  return true;
}

/** Clic en mode Muraille (trace continu, core/wallTrace.ts) : le premier
 *  fixe la case de depart ; chacun des suivants construit la PORTION de
 *  l'ancre au curseur si elle est posable et payable (tout ou rien : une
 *  portion invalide ne pose rien, le reste du trace reste intact), puis son
 *  extremite devient la nouvelle ancre. Un clic sur la case de depart ferme
 *  l'enceinte et termine le trace ; le mode reste actif pour la suivante. */
function confirmWallLine(x: number, z: number): boolean {
  const mode = buildingPlacementMode;
  if (!mode) return false;
  const net = wallNetworkOf(currentRun.buildings);
  if (!mode.trace) {
    // Premier clic : sur une extremite existante, reprise de cette muraille ;
    // sinon, depart sur une case libre seulement.
    const snapped = wallEndNear(joinableWallEnds(net, null), x, z);
    const cell = traceCellAt(x, z);
    if (snapped) mode.trace = resumeTraceAt(net, snapped);
    else if (canPlaceBuildingAt(getBuilding(mode.buildingId).traceHalf ?? mode.buildingId, cell.x, cell.z, undefined, 0)) mode.trace = startWallTrace(cell);
    updateBuildingPlacementGhost(x, z);
    return false;
  }
  const join = wallJoinAt(net, mode.trace, x, z);
  const plan = planTracedWallLeg(mode.buildingId, mode.trace, x, z, playerArrowOrigin, 'player', join?.path ?? null);
  const status = wallLineStatus(mode.buildingId, plan.step);
  if (!plan.leg.usable || !status.placeable || !status.affordable) return false;
  // Pieces nouvelles et re-appariees, creneaux de TOUT le trace vers
  // l'exterieur (seules rotation et variante de virage changent pour les
  // pieces deja posees), or de l'etape.
  applyOwnedWallStep(plan.step);
  mode.trace = advanceWallTrace(mode.trace, plan.leg);
  refreshOwnedBuildingViews();
  updateBuildingPlacementGhost(x, z);
  return true;
}

/** Deplacement d'unites sur la grille, pret a etre affiche (apercu) ou
 *  applique (clic, relachement d'un glisser) : les deux passent toujours par
 *  le meme calcul (core/gridGroupMove.ts), l'apercu montre donc exactement
 *  ce que le clic fera. */
interface UnitMoveProposal {
  members: GridMoveMember[];
  plan: GridGroupMovePlan;
  items: UnitMovePreviewItem[];
}

/** Plan de deplacement des slots `indices` en preparation, le centre de la
 *  formation venant au point `target`. Regles de la preparation
 *  (isValidPlacementForUnit : zone, obstacles, batiments dont la Baliste,
 *  autres unites), sans compter les cases actuelles du groupe deplace. */
function placementMoveProposal(indices: readonly number[], target: { x: number; z: number }): UnitMoveProposal | null {
  const moving = indices.filter((i) => placementSlots[i]?.x !== null && placementSlots[i]?.z !== null);
  if (moving.length === 0) return null;
  const members = moving.map((i) => ({ key: i, x: placementSlots[i]!.x!, z: placementSlots[i]!.z! }));
  const plan = planGridGroupMove(members, target, {
    isFree: (i, x, z) => isValidPlacementForUnit(placementSlots[i]!.unitId, x, z, moving),
    footprint: (i, x, z) => getFootprintTiles(placementSlots[i]!.unitId, x, z),
    searchRadius: GRID_MOVE_SEARCH_RADIUS,
    tile: TILE,
  });
  const items = plan.destinations.map((d) => {
    const unitId = placementSlots[d.key]!.unitId;
    return { unitId, team: 'player' as const, x: d.x, z: d.z, valid: d.placed, footprint: getFootprintTiles(unitId, d.x, d.z) };
  });
  return { members, plan, items };
}

/** Glisser d'une unite (ou de son groupe) en preparation : l'unite saisie
 *  arrive sur la case survolee, le reste de la formation suit avec le meme
 *  decalage ; meme calcul que le clic, seul le point vise change. */
function placementDragProposal(drag: UnitDragState, event: MouseEvent): UnitMoveProposal | null {
  const tile = computeHoveredTile(event);
  const grabbed = placementSlots[drag.slotIndex];
  if (!tile || !grabbed || grabbed.x === null || grabbed.z === null) return null;
  const group = drag.groupIndices ?? [drag.slotIndex];
  const placed = group.filter((i) => placementSlots[i]?.x !== null && placementSlots[i]?.z !== null);
  const cx = placed.reduce((sum, i) => sum + placementSlots[i]!.x!, 0) / placed.length;
  const cz = placed.reduce((sum, i) => sum + placementSlots[i]!.z!, 0) / placed.length;
  return placementMoveProposal(group, { x: tile.x + cx - grabbed.x, z: tile.z + cz - grabbed.z });
}

/** Deplacement propose par le curseur en preparation, ou null si un clic a
 *  cet endroit ne deplacerait rien (aucune selection, curseur sur une unite
 *  ou un batiment qu'un clic selectionnerait, autre geste prioritaire). */
function placementHoverMoveProposal(event: MouseEvent): UnitMoveProposal | null {
  if (!inPlacementPhase || buildingPlacementMode || armedItemIndex !== null || groundDrag?.dragging) return null;
  // Au-dessus de "Vendre", le relachement vendrait : aucun apercu de
  // deplacement (la zone laisse passer les evenements jusqu'au canvas).
  if (unitDrag) return unitDrag.dragging && !sellZone.isPointOver(event.clientX, event.clientY) ? placementDragProposal(unitDrag, event) : null;
  if (selectedIndices.length === 0) return null;
  if (findHoveredSlot(event) !== null || findHoveredOwnedBuilding(event) !== null || isBallistaHoveredInPlacement(event)) return null;
  if (findFallbackSlot(event, event.shiftKey) !== null) return null;
  const point = computeGroundPoint(event);
  return point ? placementMoveProposal(selectedIndices, point) : null;
}

/** Applique un plan de preparation valide ; renvoie faux (rien ne bouge)
 *  si une seule unite n'a pas de destination. */
function applyPlacementMove(proposal: UnitMoveProposal): boolean {
  if (!proposal.plan.valid) return false;
  for (const d of proposal.plan.destinations) {
    placementSlots[d.key]!.x = d.x;
    placementSlots[d.key]!.z = d.z;
  }
  return true;
}

/** Clic sur le sol de la zone avec une selection : la deplace selon le plan
 *  affiche par l'apercu (meme calcul, meme point). Une unite seule est un
 *  groupe d'un membre. Reussite : la selection est videe et l'apercu
 *  masque. Echec (une unite sans destination) : rien ne bouge et la
 *  selection est conservee, pour corriger la destination aussitot. */
function handleEmptyTileClick(event: MouseEvent): void {
  if (selectedIndices.length === 0) return;
  const proposal = placementHoverMoveProposal(event);
  if (!proposal || isNoopGridMove(proposal.members, proposal.plan)) return;
  if (!applyPlacementMove(proposal)) {
    unitMovePreview.show(proposal.items);
    return;
  }
  clearSelection();
  unitMovePreview.hide();
  refreshPlayerPreview();
}

/** Dernier evenement souris, pour recalculer l'apercu quand l'etat change
 *  sans que la souris bouge (selection, deplacement, annuler, zoom). */
let movePreviewPointer: MouseEvent | null = null;
/** L'apercu est recalcule une fois par image, juste APRES le rendu (voir la
 *  boucle) : les modeles reconstruits (refreshPlayerPreview,
 *  refreshEditorObjects) doivent avoir ete rendus avant tout lancer de
 *  rayon. Avant le premier rendu, les os d'un modele anime ont des matrices
 *  nulles ; un rayon lance a ce moment calcule et garde en cache une sphere
 *  englobante de rayon nul, et l'unite ne serait plus jamais cliquable. */
let movePreviewDirty = false;

/** Apercu de deplacement sous le curseur (preparation ou editeur) : le meme
 *  calcul que le clic qui suivrait. Masque si un clic n'y deplacerait rien,
 *  si le plan ne change aucune position, pendant un geste camera ou au-dessus
 *  de l'interface. */
function updateMovePreview(event: MouseEvent): void {
  let proposal: UnitMoveProposal | null = null;
  if (event.target === canvas && cameraDrag === null) {
    if (inEditorMode) proposal = editorHoverMoveProposal(event);
    else if (inPlacementPhase) proposal = placementHoverMoveProposal(event);
  }
  if (!proposal || isNoopGridMove(proposal.members, proposal.plan)) unitMovePreview.hide();
  else unitMovePreview.show(proposal.items);
}

/** Demande un recalcul de l'apercu apres le prochain rendu. */
function refreshMovePreview(): void {
  movePreviewDirty = true;
}

window.addEventListener('mousemove', (event) => {
  movePreviewPointer = event;
  movePreviewDirty = true;
});

/** Projette une position monde (sol) vers des coordonnees ecran (pixels),
 *  pour tester quelles unites tombent dans le rectangle de selection glisse
 *  a la souris (voir selectUnitsInRect). Vise un point legerement au-dessus
 *  du sol (le corps de l'unite, pas ses pieds) pour rester intuitif : encadrer
 *  la silhouette a l'ecran doit suffire, pas viser precisement sa base. */
function worldToScreen(x: number, z: number): { x: number; y: number } {
  const v = new THREE.Vector3(x, 0.5 + surfaceY(x, z), z);
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
    if (isInScreenRect(worldToScreen(slot.x, slot.z), rect)) indices.push(i);
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
    // Ordres acceptes pendant CE pas : commandResults est remplace a chaque
    // pas (plusieurs pas peuvent s'enchainer par image), il est donc lu ici
    // et jamais depuis le rendu. Un ordre refuse n'affiche rien.
    for (const result of world.commandResults) {
      if (result.command.kind === 'attack' && result.rejection === null) attackOrderFeedback.spawn(result.command.targetEntityId);
      if (result.command.kind !== 'move' || result.rejection !== null || !result.destinations) continue;
      // Pas d'ouverture de la bataille : pas un ordre du joueur, aucun retour.
      if (result.command.entityIds.length === 1 && openingStepEntityIds.delete(result.command.entityIds[0]!)) continue;
      const owner = result.acceptedEntityIds.map((id) => world.getById(id)).find((e) => e !== undefined);
      if (!owner) continue;
      moveOrderFeedback.spawn(result.command.x, result.command.z, result.destinations, owner.team);
    }
    // Tir automatique en maintien de clic (2026-08-13, "Tir rapide") — DANS
    // le pas de simulation FIXE, jamais dans le rendu (variable) : le rythme
    // reel des tirs reste cadence a SIM_STEP pres, jamais au framerate.
    attemptAutoFire();
    attemptBallistaAutoFire(dt);

    // Fleches des batiments defensifs (Tour) : flash sur la cible touchee a
    // l'impact, comme un coup d'Archer.
    for (const event of world.buildingAttackEvents) {
      if (event.kind === 'impact' && event.hit) playHitFlash(event.targetId);
    }

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
              const healAmount = effectivePlayerHealAmount(playerProgression().upgrades);
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

    // Production des Mines : chaque Mine VIVANTE du joueur produit, toutes
    // les mineProductionIntervalSeconds() de bataille, un montant tire dans
    // la tranche de SON niveau (run/mineUpgradeEffects.ts), affiche
    // au-dessus d'elle comme l'or d'un ennemi abattu. Jamais pendant "Tester
    // le scenario" (sans lien avec une run reelle). Dans le pas FIXE (dt),
    // comme le reste du jeu ; une Mine detruite s'arrete aussitot.
    // Mini-vagues : aucun ennemi en vie mais des renforts attendus -> temps
    // mort, la minuterie de la Mine est en pause (rien n'est produit ni perdu).
    const waitingForReinforcements =
      world.countCombatants('enemy') === 0 && world.enemyReinforcementSpawns.length === 0 && !world.allEnemyGroupsSpawned();
    if (inBattlePhase() && !inTestMode && !waitingForReinforcements) {
      for (const e of world.entities) {
        if (e.team !== 'player' || !e.alive || !e.isBuilding || e.unitId !== 'mine') continue;
        // Plafond par Mine et par manche : une Mine qui a tout produit reste
        // inactive jusqu'a la bataille suivante.
        const produced = mineProductionCounts.get(e.id) ?? 0;
        if (produced >= mineMaxProductionsPerWave()) continue;
        const elapsed = (mineProductionTimers.get(e.id) ?? 0) + dt;
        if (elapsed < mineProductionIntervalSeconds()) {
          mineProductionTimers.set(e.id, elapsed);
          continue;
        }
        mineProductionTimers.set(e.id, elapsed - mineProductionIntervalSeconds());
        mineProductionCounts.set(e.id, produced + 1);
        const amount = rollMineGold(battleOwnedBuildingLevel(e) ?? 0, () => mineGoldRng.next());
        currentRun.gold = roundGold(currentRun.gold + amount);
        combatOverlay.spawnGoldText(e.x, e.z, amount);
        recordGoldEarned(battleSummary, amount);
      }
    }

    // Renforts ennemis (mini-vagues) : un groupe entier arrive ce tick.
    if (world.enemyReinforcementSpawns.length > 0) {
      spawnEnemyReinforcements(world.enemyReinforcementSpawns);
      refreshWaveIndicator();
      waveIndicator.flash('Renforts ennemis');
    }

    // Production de la manche (Caserne, Camp d'archerie) : le sim pousse un
    // evenement par unite reellement produite (voir
    // sim/systems/buildingProduction.ts) — consomme ici pour spawner une
    // VRAIE Entity (memes stats et ameliorations qu'une unite recrutee).
    for (const event of world.productionSpawnEvents) {
      // Niveau de production lu ICI, au spawn : les unites deja produites
      // gardent le leur (voir rememberPlayerUnitLevel).
      const level = currentProductionLevel(playerProgression().upgrades, event.unitId);
      const isPlayer = event.team === 'player';
      const spawned = world.spawn(
        event.unitId,
        event.team,
        event.x,
        event.z,
        undefined,
        isPlayer ? playerUnitStatOverrides(event.unitId, level, playerProgression()) : enemyStatOverrides(event.unitId, currentRun.waveNumber),
        isPlayer ? playerUnitAbilityDamageBonus(event.unitId, level) : enemyAbilityDamageBonus(event.unitId, currentRun.waveNumber),
        isPlayer ? playerUnitTauntShieldBonus(event.unitId, level) : undefined,
      );
      if (!isPlayer) rememberEnemyUnitLevel(spawned, currentRun.waveNumber);
      else {
        rememberPlayerUnitLevel(spawned, level);
        // Unite produite du joueur : en Garde des son apparition, comme
        // le reste de l'armee en debut de bataille.
        holdPlayerUnitsInGuard([spawned.id]);
      }
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
        recordEnemyDefeated(battleSummary, e.unitId);
        recordGoldEarned(battleSummary, amount);

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
      // Mini-vagues : aucun ennemi vivant ne suffit pas, tous les groupes
      // doivent etre apparus. La defaite reste immediate.
      if (playerAlive === 0 || (enemyAlive === 0 && world.allEnemyGroupsSpawned())) {
        battleOver = true;
        loop.timeScale = 0;
        // Fin de combat (2026-08-13) : n'importe quel tir automatique en
        // cours doit s'arreter net, meme si Q est reste enfonce.
        fireKeyHeld = false;
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
            const outcome = applyBattleOutcome(currentRun, world.entities, world.pendingEnemyGroups());
            lastBattleGoldEarned = outcome.goldEarned;
            // Bonus de victoire : fait partie de l'or gagne par la manche.
            recordGoldEarned(battleSummary, outcome.goldEarned);


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
            forgetBattleBuildings();
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
            moveOrderFeedback.clear();
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
              populationHud.setVisible(false);
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
              screens.showWaveComplete(waveBeingFought, result, { defeated: defeatedLines(battleSummary), goldEarned: battleSummary.goldEarned });
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
    // Relief : surface active du rendu (brouillon de l'editeur ou carte en
    // jeu) avant tout placement vertical de la frame.
    syncActiveTerrain();
    // Population : armee et batiments de la run en preparation, entites
    // vivantes de la bataille sinon (unite morte, Caserne, Maison detruite).
    const population = inPlacementPhase ? runPopulation(currentRun) : populationOfEntities(world.entities);
    populationHud.update(population.used, population.max);

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
    // Synchronisees aussi pendant la transition de fin de vague : une unite
    // tuee au dernier pas quitte la selection ou l'inspection, avec son
    // anneau, au lieu de rester figee jusqu'a la preparation.
    battleSelection.sync((id) => world.getById(id), (id) => unitViews.getPosition(id));
    battleEnemyInspection.sync((id) => world.getById(id), (id) => unitViews.getPosition(id));
    // L'apercu de deplacement n'existe qu'en preparation et dans l'editeur.
    if (!inPlacementPhase && !inEditorMode) unitMovePreview.hide();
    else setBattleSelection([]);
    ballistaIndicator.update(inBattlePhase() && !pauseMenuOpen, currentBallistaStatus(), battleSelection.size, ballistaFireMode);
    syncBattleInspection();
    updateEntityInfoPanel(now);

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
    projectiles.syncSimulated(
      world.buildingProjectiles.map((p) => {
        const attacker = world.getById(p.attackerId);
        const attack = attacker ? getBuilding(attacker.unitId).attack : undefined;
        return { ...p, fromY: attack?.launchHeight ?? 0, fromOutset: attack?.launchOutset ?? 0, team: attacker?.team ?? 'player' };
      }),
      alpha,
      (id) => {
        const entity = world.getById(id);
        if (!entity) return undefined;
        return unitViews.getPosition(id) ?? { x: entity.x, z: entity.z };
      },
    );
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
    moveOrderFeedback.sync(realDt);
    attackOrderFeedback.sync(realDt, (id) => world.getById(id), (id) => unitViews.getPosition(id));
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
    if (movePreviewDirty) {
      movePreviewDirty = false;
      if (movePreviewPointer) updateMovePreview(movePreviewPointer);
      else unitMovePreview.hide();
    }
    // Batiments gameplay (Mine, Baliste) EXCLUS de sync() : cette methode
    // suppose une vraie unite (getUnit(entity.unitId) pour hpBarHeight) —
    // voir syncBuildings juste en dessous, qui prend radius/hpBarHeight
    // directement depuis BuildingDef. Reutilise nonBuildingEntities (deja
    // filtre plus haut pour UnitViews.sync), pas un second filtre.
    // Regle unique des barres de PV (unites, bâtiments, Baliste, deux camps) :
    // visible si l'entite est blessee (condition dynamique, rien a memoriser)
    // ou selectionnee / inspectee. Les morts sont deja masquees par
    // l'overlay ; selection et inspection sont nettoyees plus haut.
    const isHealthBarShown = (e: Entity): boolean =>
      e.hp < e.stats.maxHp || battleSelection.has(e.id) || battleEnemyInspection.has(e.id) || e.id === battleInspectedEntityId;
    combatOverlay.sync(nonBuildingEntities, (e) => unitViews.getPosition(e.id) ?? { x: e.x, z: e.z }, isHealthBarShown);
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
        // Porte de muraille : battants d'apres l'etat de la simulation.
        if (entity.gate) view.setGateOpenness(entity.gate.prevOpenness + (entity.gate.openness - entity.gate.prevOpenness) * alpha);
        view.tick(realDt);
        if (!entity.alive) view.playDestroy();
      }
      combatOverlay.syncBuildings(buildings, (e) => ({ x: e.x, z: e.z }), isHealthBarShown);
    }
    // Barres de PV pendant le placement (demande d'Antoine, 2026-08-09) : le
    // joueur doit voir l'etat de sante de son armee avant de valider, pas
    // seulement pendant la bataille. Meme regle qu'en bataille : blesse, ou
    // selectionne (unites, bâtiments possedes, Baliste).
    if (inPlacementPhase) {
      const upgrades = playerProgression().upgrades;
      const selectedSlots = new Set(selectedIndices);
      const placedSlots = placementSlots
        .filter(
          (s, i): s is PlacementSlot & { x: number; z: number } =>
            s.x !== null && s.z !== null && (selectedSlots.has(i) || s.hp < playerUnitMaxHp(s.unitId, s.productionLevel)),
        )
        .map((s) => ({ unitId: s.unitId, x: s.x, z: s.z, hp: s.hp, maxHp: playerUnitMaxHp(s.unitId, s.productionLevel) }));
      const shownBuildings: PlacementBuildingHpSubject[] = [];
      currentRun.buildings.forEach((owned, i) => {
        // Bâtiment en cours de deplacement : son modele suit le curseur, sa
        // position enregistree n'est plus la bonne.
        if (buildingPlacementMode?.movingIndex === i) return;
        const def = getBuilding(owned.buildingId);
        const maxHp = effectiveBuildingMaxHp(owned.buildingId, ownedBuildingLevel(owned));
        if (i !== selectedBuildingIndex && owned.hp >= maxHp) return;
        shownBuildings.push({ x: owned.x, z: owned.z, hp: owned.hp, maxHp, radius: def.radius, hpBarHeight: def.hpBarHeight });
      });
      // La Baliste repart toujours a pleins PV (spawnBallistaBuilding) :
      // en preparation, sa barre n'apparait que si elle est selectionnee.
      if (placementBallistaSelected) {
        const def = getBuilding('ballista');
        const maxHp = effectiveBallistaMaxHp(upgrades);
        shownBuildings.push({ x: playerArrowOrigin.x, z: playerArrowOrigin.z, hp: maxHp, maxHp, radius: def.radius, hpBarHeight: def.hpBarHeight });
      }
      combatOverlay.syncPlacement(placedSlots, shownBuildings);
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
    // Visee permanente pendant la bataille (tir sur Q) : point du sol sous le
    // curseur recalcule a chaque frame, la camera ayant pu bouger sans
    // mouvement de souris. Reticule discret pour ne pas gener la selection
    // RTS : plus visible quand la Baliste est prete, presque transparent
    // pendant la recharge, masque si elle est detruite.
    const aiming = inBattle && !isBallistaDestroyed();
    // AUTO : pas de reticule (Q inactif), la Baliste regarde sa cible.
    const manualAiming = aiming && ballistaFireMode === 'manual';
    aimReticle.visible = manualAiming;
    if (aiming && !manualAiming) {
      const target = ballistaAutoTargetId !== null ? world.getById(ballistaAutoTargetId) : undefined;
      if (target?.alive) {
        const dx = target.x - playerArrowOrigin.x;
        const dz = target.z - playerArrowOrigin.z;
        if (Math.hypot(dx, dz) > 1e-4) ballista.rotation.y = Math.atan2(-dx, -dz);
      }
    }
    if (manualAiming) {
      aimAtPointer();
      aimReticle.position.x = playerAimX;
      aimReticle.position.z = playerAimZ;
      aimReticle.position.y = 0.02 + surfaceY(playerAimX, playerAimZ);
      const ready = world.playerArrow.cooldown <= 0 && world.playerArrow.flights.length === 0;
      const reticleMaterial = aimReticle.material as THREE.MeshBasicMaterial;
      reticleMaterial.opacity = ready ? 0.55 : 0.15;
      // Hors de portee : reticule rouge, le tir sera refuse.
      reticleMaterial.color.setHex(isBallistaAimInRange(playerAimX, playerAimZ) ? COLORS.playerArrowAccent : AIM_RETICLE_OUT_OF_RANGE_COLOR);

      // La baliste suit le curseur en continu pendant la bataille, meme
      // convention de cap que le reste du rendu (voir UnitViews.computeFacing) :
      // l'unite locale -Z est "l'avant", donc atan2(-dx, -dz) regarde vers
      // (playerAimX, playerAimZ).
      const dx = playerAimX - playerArrowOrigin.x;
      const dz = playerAimZ - playerArrowOrigin.z;
      if (Math.hypot(dx, dz) > 1e-4) ballista.rotation.y = Math.atan2(-dx, -dz);
    }
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
  fireKeyHeld = false;
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
  fireKeyHeld = false;
  cancelUnitDrag();
  cancelGroundDrag();
  clearSelection();
  // L'occupation de la run abandonnee ne doit pas survivre au retour menu.
  placementSlots = [];
  playerPreview.clear();
  enemyPreview.clear();
  world.clear();
  forgetBattleBuildings();
  rewardedEnemyDeaths.clear();
  belowAutoHealThreshold.clear();
  mineProductionTimers.clear();
  mineProductionCounts.clear();
  pendingArrowSpawns.length = 0;
  unitViews.clear();
  combatOverlay.clear();
  projectiles.clear();
  playerArrowView.clear();
  telegraphView.clear();
  fireballView.clear();
  iceNovaView.clear();
  healVfxView.clear();
  moveOrderFeedback.clear();
  tauntVfxView.clear();
  shadowProjectileView.clear();
  battleOver = false;
  loop.timeScale = 1;
  // La run abandonnee (ou perdue) se termine ici : sans cela, ses batiments
  // (meshes ajoutes a la scene, hors du plateau) restaient visibles dans le
  // menu et l'editeur, et un retour de "Tester le scenario" les
  // reconstruisait depuis currentRun. Une run vierge les remplace ;
  // resetRunPlacementState retire leurs vues et l'anneau de selection.
  currentRun = createFreshRun();
  rebuildCurrentTerritoryIndex();
  resetRunPlacementState();
  board.gridLines.visible = false;
  board.zones.visible = false;
  waveIndicator.setVisible(false);
  goldHud.setVisible(false);
  populationHud.setVisible(false);
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
function addUnitToPlacement(unitId: string, hp: number, productionLevel: number): void {
  const unitIds = [...placementSlots.map((s) => s.unitId), unitId];
  const formation = computeArmyFormation(unitIds, currentMap);
  const preferred = formation[formation.length - 1]!;
  const pos = findFreePlacementTile(unitId, preferred.x, preferred.z);
  placementSlots.push({ unitId, x: pos.x, z: pos.z, hp, productionLevel });
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
  // Fantassin / Archer : Caserne / Camp d'archerie requis (bouton deja
  // desactive avec sa raison, voir Screens.refreshShop ; garde-fou ici).
  if (!hasRecruitmentBuilding(currentRun, unitId)) return;
  // Population pleine : refus avant tout debit (bouton deja desactive avec
  // sa raison, voir Screens.refreshShop ; garde-fou ici aussi).
  if (!canRecruitWithinPopulation(currentRun, unitId)) return;
  // Niveau de production courant : fixe une fois pour toutes pour CETTE
  // unite (stats, PV, cout ; jamais retroactif). Cout et PV en derivent.
  const productionLevel = currentProductionLevel(currentRun.upgrades, unitId);
  const cost = effectivePlayerUnitCost(unitId, currentRun.upgrades);
  if (currentRun.gold < cost) return;
  // Math.max(0, ...) : filet de securite defensif contre tout bruit de
  // virgule flottante residuel (2026-08-14, bug remonte par Antoine : "il
  // est possible de déclencher un résultat négatif") — rend un solde
  // negatif mathematiquement IMPOSSIBLE ici, pas seulement improbable,
  // meme si le garde-fou `gold < cost` ci-dessus est deja cense l'empecher
  // dans le cas normal.
  currentRun.gold = Math.max(0, roundGold(currentRun.gold - cost));
  const hp = playerUnitMaxHp(unitId, productionLevel);
  currentRun.army.push({ unitId, hp, productionLevel });
  if (inPlacementPhase) addUnitToPlacement(unitId, hp, productionLevel);
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
 *  (voir lastUnitPurchase, capture au moment de l'achat : le cout de
 *  production peut augmenter ensuite avec une amelioration de Forge, le
 *  remboursement reste celui du prix reellement paye), retire l'unite de currentRun.army ET
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
function buyConsumable(itemId: string, quantity: number, effectiveCost: () => number): void {
  const unitPrice = effectiveCost();
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
  // Forge (ameliorations de la run, en Or) : voir openForge/purchaseForgeUpgrade.
  onCloseForge: () => closeForge(),
  onPurchaseRunUpgrade: (id) => purchaseForgeUpgrade(id),
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
  // Cout EN OR EFFECTIF (voir run/unitUpgradeEffects.ts,
  // effectivePlayerUnitCost : cout du niveau de production courant). `hp`
  // (PV de depart de l'OwnedUnit) lit de meme le maxHp de ce niveau — sans
  // ca, une unite tout juste achetee apparaitrait avec plus de PV MAX
  // (statOverrides) que de PV ACTUELS.
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
  // Saisie dans un champ (recherche du catalogue, Taille de l'editeur,
  // Parametres) : aucun raccourci du jeu ni de l'editeur ne s'applique — la
  // touche reste au champ (KI-19). Seul Echap fait sortir du champ, puis
  // garde son role habituel (outil Selection, fermeture d'un ecran...).
  if (isTypingInField(event.target)) {
    if (event.key !== 'Escape') return;
    (event.target as HTMLElement).blur();
  }

  // Raccourcis 1 a 6 : premiere ligne de l'inventaire, meme action qu'un clic
  // sur l'emplacement (armInventorySlot verifie objet et phase). Seulement
  // quand l'inventaire est affiche et qu'aucun ecran ne le recouvre ; un
  // appui maintenu n'agit qu'une fois.
  const inventorySlot = inventoryShortcutSlot(event.code);
  if (inventorySlot !== null && !event.ctrlKey && !event.altKey && !event.metaKey && !event.shiftKey && !inEditorMode && inventoryBar.isVisible() && !screens.hasVisibleOverlay()) {
    if (!event.repeat) inventoryBar.activateSlot(inventorySlot);
    return;
  }

  // Undo/Redo de l'editeur (2026-08-16, Part U) — Ctrl+Z / Ctrl+Y (et
  // Ctrl+Maj+Z, convention alternative courante), UNIQUEMENT en mode
  // editeur : pas de conflit possible avec le reste du jeu, qui n'a pas de
  // notion d'annulation. Verifie AVANT le switch principal (combinaison de
  // touches, pas une simple touche seule).
  if (inEditorMode && (event.ctrlKey || event.metaKey) && !event.altKey) {
    // Un trait de territoire en cours est d'abord enregistre : annuler /
    // retablir agit toujours sur un historique complet.
    if (brushStroke) endBrushStroke();
    if (surfaceStroke) endSurfaceStroke();
    if ((event.key === 'z' || event.key === 'Z' || event.key === 'y' || event.key === 'Y') && editorWallTrace) {
      editorWallTrace = null;
      clearEditorGhost();
    }
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

  // Raccourcis de l'editeur (E1) : V -> outil Selection ; 1 / 2 / 3 -> camp
  // du pinceau quand l'outil Territoire est actif. Jamais pendant une saisie
  // dans un champ (Taille), ni avec un modificateur.
  if (inEditorMode && editorState && !event.ctrlKey && !event.metaKey && !event.altKey && !isTypingInField(event.target)) {
    if (event.key === 'v' || event.key === 'V') {
      if (editorState.tool.type !== 'select') editorState.setTool({ type: 'select' });
      clearEditorGhost();
      refreshEditorObjects();
      return;
    }
    const team = ({ '1': 'player', '2': 'enemy', '3': null } as const)[event.key as '1' | '2' | '3'];
    if (team !== undefined && editorState.tool.type === 'paint-territory') {
      editorState.setTool({ type: 'paint-territory', team });
      clearEditorGhost();
      refreshEditorObjects();
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
        if (editorState?.rotateBuildingTool()) updateEditorGhost(lastEditorGhostX, lastEditorGhostZ);
        else rotateSelectedObstacleBy(Math.PI / 2);
      } else {
        renderer.resetCamera();
      }
      break;
    case ' ':
      // Espace (2026-08-13, demande d'Antoine) : reinitialise la camera,
      // meme action que R hors editeur — Espace n'a aucun autre role dans le
      // jeu depuis le retrait de la pause au clavier (voir CLAUDE.md,
      // "Panneau de debug allege, pause a l'espace retiree"), donc pas de
      // conflit a gerer meme en mode editeur. Dans l'editeur (E6), la carte
      // est recadree dans la zone libre ; en jeu, la carte courante est
      // recadree dans la zone visible (frameRunCamera), R garde le simple
      // retour a la camera par defaut.
      // preventDefault : Espace ne doit pas EN PLUS activer le bouton qui a
      // le focus (ex. « Boutique » apres un clic, qui se rouvrait).
      event.preventDefault();
      if (inEditorMode || inTestMode) resetEditorCamera();
      else frameRunCamera();
      break;
    case 'Delete':
    case 'Backspace':
      if (inEditorMode) deleteEditorSelection();
      break;
    case 'Escape':
      if (inTestMode) {
        // Sortie rapide du test, sans passer par le menu pause normal (qui
        // renverrait au menu principal et romprait le cycle editer/tester) —
        // le brouillon reste intact (voir returnToEditorAfterTest).
        returnToEditorAfterTest();
      } else if (inEditorMode && editorState && activeEditorWallTrace()) {
        // Trace de murailles en cours : Echap le termine (extremites
        // construites) ; l'outil reste actif.
        finishEditorWallTrace();
        clearEditorGhost();
      } else if (inEditorMode && editorState) {
        if (editorState.tool.type !== 'select') {
          editorState.setTool({ type: 'select' });
          clearEditorGhost();
          refreshEditorObjects();
        } else {
          editorState.select(null);
          refreshEditorObjects();
        }
      } else if (screens.isForgeOpen()) {
        closeForge();
      } else if (armedItemIndex !== null) {
        disarmItem();
      } else if (buildingPlacementMode?.trace) {
        // Trace de murailles en cours : Echap n'annule que la portion
        // non construite (apercu, case en attente) ; le mode reste actif.
        cancelWallTrace();
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
      // Vitesse x2 / x1 seulement quand le temps de bataille avance deja :
      // jamais une reprise apres la fin de bataille, en pause ou hors combat.
      if (isBattleTimeRunning()) loop.timeScale = loop.timeScale === 2 ? 1 : 2;
      break;
    case 'q':
    case 'Q':
      // Tir de la Baliste : jamais dans un champ de saisie (voir KI-19),
      // jamais sur la repetition automatique du clavier — le maintien de Q
      // est gere par attemptAutoFire (talent Tir rapide).
      if (!event.repeat && !isTypingInField(event.target)) fireBallistaFromKey();
      break;
    case 's':
    case 'S':
      if (!isTypingInField(event.target)) issueStopOrder();
      break;
  }
});

// Relachement de Q : fin du tir maintenu (Tir rapide). Majuscule ou non
// selon l'etat de Maj au relachement, d'ou les deux valeurs.
window.addEventListener('keyup', (event) => {
  if (event.key === 'q' || event.key === 'Q') fireKeyHeld = false;
});

// Camera a la souris, trois intentions distinguees par les boutons et Maj au
// moment de l'appui (jamais par un seuil de deplacement) :
//  - clic droit seul : action ponctuelle (ordre RTS en bataille, desarmer un
//    objet, annuler un placement, annuler/deselectionner dans l'editeur),
//    jamais de mouvement de camera ;
//  - Maj + clic droit maintenu : rotation/inclinaison ;
//  - clic gauche + clic droit maintenus : deplacement (pan).
// Molette : zoom. Le bouton du milieu n'est pas utilise.
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
// dont depend deja tout le clic droit du JEU lui-meme (ordre RTS,
// annulation du ciblage d'un objet arme, clic droit de l'editeur qui annule
// un placement en cours — voir plus bas) : preventDefault() sur contextmenu
// ne bloque jamais la DELIVRANCE d'un autre type d'evenement.
document.body.addEventListener('contextmenu', (event) => event.preventDefault());

/** Geste camera en cours, decide une fois pour toutes au mousedown qui le
 *  demarre (voir plus bas) : `rotate` (Maj + clic droit) ou `pan` (clic
 *  gauche + clic droit). Tant qu'il est actif, aucun clic gauche ne demarre
 *  de geste de jeu (placement, selection, tir, editeur) et aucun ordre n'est
 *  emis. */
let cameraDrag: 'rotate' | 'pan' | null = null;
let lastMouseX = 0;
let lastMouseY = 0;

function startCameraDrag(mode: 'rotate' | 'pan', event: MouseEvent): void {
  cameraDrag = mode;
  unitMovePreview.hide();
  lastMouseX = event.clientX;
  lastMouseY = event.clientY;
  pendingRightClickOrder = false;
}

/** Vrai si un clic gauche doit etre ignore par les gestes de jeu : un geste
 *  camera est en cours, ou le clic droit est deja enfonce (ce clic gauche
 *  demarre alors un pan, voir le mousedown camera). */
function leftClickReservedForCamera(event: MouseEvent): boolean {
  return cameraDrag !== null || (event.buttons & 2) !== 0;
}

/** Abandonne net tout geste du clic gauche en cours (rectangle de selection
 *  en placement ou en bataille, glisser d'unite) : un autre bouton qui
 *  s'ajoute ne doit jamais laisser le cadre de selection ou le fantome de
 *  vente suivre le curseur en parallele. */
function cancelLeftPointerGestures(): void {
  if (groundDrag) {
    selectionBox.hide();
    groundDrag = null;
  }
  cancelCommandDrag();
  cancelEditorPointer();
  if (unitDrag) {
    sellZone.hideGhost();
    unitDrag = null;
  }
  unitMovePreview.hide();
}

// Clic droit deja enfonce, puis clic gauche : pan. Le clic droit en attente
// n'emettra plus d'ordre (voir startCameraDrag) ; les gestes de jeu du clic
// gauche l'ignorent (voir leftClickReservedForCamera).
canvas.addEventListener('mousedown', (event) => {
  if (event.button !== 0 || !(event.buttons & 2)) return;
  startCameraDrag('pan', event);
});

canvas.addEventListener('mousedown', (event) => {
  if (event.button !== 2) return;

  // Clic gauche deja enfonce (`event.buttons`, masque des boutons
  // ACTUELLEMENT enfonces) : pan. Le geste gauche en cours (rectangle de
  // selection, glisser d'unite) est abandonne d'abord
  // (2026-08-11, bug remonte par Antoine : "si je clique gauche en premier
  // puis droit... la grille de multi selection apparait") ; aucune action
  // ponctuelle du clic droit.
  if (event.buttons & 1) {
    cancelLeftPointerGestures();
    startCameraDrag('pan', event);
    return;
  }
  // Maj + clic droit : rotation, decidee ici pour tout le geste (relacher ou
  // appuyer Maj ensuite ne change rien) ; aucune action ponctuelle.
  if (event.shiftKey) {
    startCameraDrag('rotate', event);
    return;
  }

  // Clic droit = annule le ciblage d'un objet d'inventaire arme (2026-08-14,
  // demande explicite d'Antoine : "on est obligé de l'utiliser pour retirer
  // le curseur de visée, il faut pouvoir appuyer sur clic droit pour sortir
  // de la visée du parchemin") — meme effet que Echap (disarmItem, ne
  // consomme JAMAIS l'objet).
  const disarmedItem = armedItemIndex !== null;
  if (disarmedItem) disarmItem();

  // Prototype RTS : en bataille, avec au moins une unite selectionnee,
  // ce clic droit devient un ordre (attaque ou deplacement) a son relachement
  // (voir le mouseup plus bas), meme si la souris a un peu bouge. Jamais si
  // ce clic vient de desarmer un objet, ni si un clic gauche s'y ajoute
  // ensuite (pan).
  pendingRightClickOrder = !disarmedItem && battleSelection.size > 0 && canIssueRtsOrder();

  // Mode placement d'un BATIMENT achete (2026-08-17, demande explicite
  // d'Antoine, point 10 : "Escape ou clic droit -> annule le placement,
  // aucun Gold dépensé") — meme priorite que armedItemIndex ci-dessus.
  // buildingClickCandidate efface INCONDITIONNELLEMENT (2026-08-18) : un
  // clic maintenu sur un bâtiment, PAS ENCORE promu en glisser (seuil non
  // franchi, buildingPlacementMode donc toujours null), ne doit pas non
  // plus survivre a un clic droit — sinon un mousemove ulterieur sans
  // rapport pourrait a tort declencher un deplacement.
  buildingClickCandidate = null;
  if (buildingPlacementMode?.trace) cancelWallTrace();
  else if (buildingPlacementMode) cancelBuildingPlacement();

  // Editeur de maps (2026-08-16, demande d'Antoine) : clic droit dans le vide
  // annule d'abord le PLACEMENT en cours ("objet/unité/prop en main"), sinon
  // désélectionne l'objet actuellement sélectionné — même règle, même ordre
  // de priorité que la touche Échap en mode éditeur (voir plus haut, listener
  // clavier) : ne supprime jamais rien. Le menu contextuel du navigateur est
  // déjà empêché sur toute l'interface (2026-08-15, voir le listener
  // `contextmenu` sur `document.body` plus haut), donc rien de plus à faire
  // ici pour "ne pas ouvrir le menu contextuel".
  if (inEditorMode && editorState) {
    if (activeEditorWallTrace()) {
      finishEditorWallTrace();
      clearEditorGhost();
    } else if (editorState.tool.type !== 'select') {
      editorState.setTool({ type: 'select' });
      clearEditorGhost();
      refreshEditorObjects();
    } else if (editorState.selection !== null) {
      editorState.select(null);
      refreshEditorObjects();
    }
  }
});

canvas.addEventListener('mousedown', (event) => {
  // Geste camera (voir plus haut) : le clic gauche qui s'ajoute n'est jamais
  // une action de placement.
  if (event.button !== 0 || !inPlacementPhase || inEditorMode || leftClickReservedForCamera(event)) return;
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
    placementBallistaSelected = false;
    buildingClickCandidate = { index: hoveredBuilding, startClientX: event.clientX, startClientY: event.clientY };
    return;
  }
  // Clic sur la tour de la Baliste : selection seule, meme bascule qu'un
  // bâtiment possede. Aucun glisser ni deplacement pendant la preparation.
  if (isBallistaHoveredInPlacement(event)) {
    placementBallistaSelected = !placementBallistaSelected;
    selectedBuildingIndex = null;
    updateBuildingSelectionRing();
    if (placementBallistaSelected && selectedIndices.length > 0) {
      clearSelection();
      refreshPlayerPreview();
    }
    return;
  }
  // Clic ailleurs qu'un bâtiment possede : deselectionne l'anneau de
  // selection actif s'il y en a un (2026-08-18) — ne court-circuite jamais
  // la suite (selection d'unite normale ci-dessous).
  if (selectedBuildingIndex !== null || placementBallistaSelected) {
    selectedBuildingIndex = null;
    placementBallistaSelected = false;
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
    // Maj + clic : ajout/retrait, jamais un double-clic (meme regle qu'en
    // bataille).
    if (registerSlotClick(hoveredSlot, event.shiftKey, performance.now())) {
      selectSameTypeGroup(hoveredSlot);
      return;
    }

    // Ne selectionne pas tout de suite : un glisser (voir le mousemove plus
    // bas) doit pouvoir prendre le dessus pour vendre l'unite ou la deplacer.
    // La selection normale se resout au relachement si le curseur n'a pas
    // assez bouge (voir le mouseup plus bas). Si l'unite survolee fait deja
    // partie d'un groupe selectionne (2+ elements), le glisser deplacera OU
    // vendra tout le groupe (voir groupIndices, points 24-27/33-34 de la
    // demande) plutot que ce seul slot.
    const groupIndices = selectedIndices.length > 1 && selectedIndices.includes(hoveredSlot) ? selectedIndices : null;
    unitDrag = { slotIndex: hoveredSlot, groupIndices, startClientX: event.clientX, startClientY: event.clientY, dragging: false, shift: event.shiftKey };
    return;
  }

  // Pas sur une unite : meme logique differee que ci-dessus, mais pour le
  // rectangle de selection multiple (voir GroundDragState) — un simple clic
  // (sans glisser) reste resolu comme avant (handleEmptyTileClick) au
  // relachement.
  groundDrag = {
    startClientX: event.clientX,
    startClientY: event.clientY,
    dragging: false,
    shift: event.shiftKey,
    fallbackSlot: findFallbackSlot(event, event.shiftKey),
  };
});

canvas.addEventListener('mousedown', (event) => {
  if (event.button !== 0 || inEditorMode || leftClickReservedForCamera(event) || !inBattlePhase()) return;
  // Clic gauche en bataille : un objet arme (parchemin, Nova...) CONSOMME
  // ENTIEREMENT ce clic (2026-08-15, PRIORITE explicite d'Antoine : UI > mode
  // de ciblage d'un objet > reste) ; sinon selection RTS, resolue au
  // relachement : clic simple ou rectangle selon le deplacement (voir le
  // mousemove et le mouseup plus bas). Le tir de Baliste est sur Q.
  if (armedItemIndex !== null) {
    useArmedItemOnClick(event);
    return;
  }
  commandDrag = { startClientX: event.clientX, startClientY: event.clientY, dragging: false };
});

// pointercancel/blur : cas ou aucun mouseup/keyup n'arrive du tout (alt-tab,
// geste tactile interrompu...) — aucun tir maintenu ne doit survivre.
window.addEventListener('pointercancel', () => {
  fireKeyHeld = false;
  buildingClickCandidate = null;
  if (buildingPlacementMode) cancelBuildingPlacement();
});
window.addEventListener('blur', () => {
  fireKeyHeld = false;
  pendingRightClickOrder = false;
  cameraDrag = null;
  cancelCommandDrag();
  cancelEditorPointer();
  buildingClickCandidate = null;
  if (buildingPlacementMode) cancelBuildingPlacement();
});

canvas.addEventListener('mousedown', (event) => {
  // transformDragging : le clic sert a saisir une poignee du gizmo
  // TransformControls (voir plus haut) — ne pas interferer avec la
  // selection/le placement/le deplacement normal de l'editeur pendant ce
  // temps (le navigateur livre 'pointerdown' avant 'mousedown' pour un
  // meme clic, ce flag est donc deja a jour ici, voir son commentaire).
  if (event.button !== 0 || !inEditorMode || leftClickReservedForCamera(event) || transformDragging) return;
  if (tryStartRingRotate(event)) return;
  handleEditorClick(event);
});

window.addEventListener('mouseup', (event) => {
  if (event.button === 2) {
    // Fin d'un geste camera (rotation ou pan), sinon clic droit seul relache
    // (prototype RTS) : attaque ou deplacement, au point de relachement.
    const pending = pendingRightClickOrder;
    pendingRightClickOrder = false;
    if (cameraDrag !== null) cameraDrag = null;
    else if (pending && !(event.buttons & 1)) issueRightClickOrder(event);
  }
  // Le pan exige les deux boutons : relacher le gauche y met fin.
  if (event.button === 0 && cameraDrag === 'pan') cameraDrag = null;
  if (event.button !== 0 || !unitDrag) return;

  const drag = unitDrag;
  unitDrag = null;

  if (!drag.dragging) {
    // Pas assez bouge pour compter comme un glisser : clic simple, selection
    // normale (meme comportement qu'avant l'ajout du glisser-vendre), ou
    // ajout/retrait avec Maj.
    if (drag.shift) toggleSlotSelection(drag.slotIndex);
    else selectSlot(drag.slotIndex);
    return;
  }

  unitMovePreview.hide();
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

  // Sinon, deplacement selon le plan montre par l'apercu pendant le glisser
  // (placementDragProposal, meme calcul) ; relache sur l'interface : rien.
  // Reussite : selection videe, apercu masque. Echec : rien ne bouge, la
  // selection est conservee.
  if (event.target !== canvas) return;
  const proposal = placementDragProposal(drag, event);
  if (!proposal || !applyPlacementMove(proposal)) return;
  clearSelection();
  unitMovePreview.hide();
  refreshPlayerPreview();
});

window.addEventListener('mouseup', (event) => {
  if (event.button !== 0 || !groundDrag) return;

  const drag = groundDrag;
  groundDrag = null;

  if (!drag.dragging) {
    // Pas assez bouge pour compter comme un rectangle de selection : clic
    // simple. Sur la case d'une unite (rayon qui a manque son modele, voir
    // findFallbackSlot) : meme resolution qu'un clic sur le modele. Sinon,
    // comportement inchange du sol (deplacement de l'unite/du groupe en
    // main, voir handleEmptyTileClick) ; Maj + clic dans le vide : rien.
    if (drag.fallbackSlot !== null) {
      const index = drag.fallbackSlot;
      if (registerSlotClick(index, drag.shift, performance.now())) selectSameTypeGroup(index);
      else if (drag.shift) toggleSlotSelection(index);
      else selectSlot(index);
      return;
    }
    if (!drag.shift) handleEmptyTileClick(event);
    return;
  }

  selectionBox.hide();
  selectUnitsInRect(selectionBox.toRect(drag.startClientX, drag.startClientY, event.clientX, event.clientY));
});

// Clic gauche relache en bataille (selection RTS) : clic simple sous
// le seuil, rectangle de selection au-dela — un vrai glisser ne produit
// jamais de clic. Abandonne si la bataille s'est terminee entre-temps.
window.addEventListener('mouseup', (event) => {
  if (event.button !== 0 || !commandDrag) return;
  const drag = commandDrag;
  cancelCommandDrag();
  if (!inBattlePhase()) return;
  if (drag.dragging) selectBattleUnitsInRect(selectionBox.toRect(drag.startClientX, drag.startClientY, event.clientX, event.clientY));
  else resolveBattleSelectionClick(event);
});

window.addEventListener('mousemove', (event) => {
  if (!commandDrag) return;
  if (!commandDrag.dragging) {
    const moved = Math.hypot(event.clientX - commandDrag.startClientX, event.clientY - commandDrag.startClientY);
    if (moved < UNIT_DRAG_THRESHOLD_PX) return;
    commandDrag.dragging = true;
    selectionBox.show();
  }
  selectionBox.update(commandDrag.startClientX, commandDrag.startClientY, event.clientX, event.clientY);
});

// Derniere position du curseur, lue par aimAtPointer (visee de la Baliste).
window.addEventListener('mousemove', (event) => {
  lastPointerClient = { x: event.clientX, y: event.clientY };
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

  // Apercu de destination (empreintes et silhouettes) : voir
  // updateMovePreview, masque au-dessus de la zone de vente.
});

window.addEventListener('mousemove', (event) => {
  if (!inEditorMode || !editorState) return;
  if (editorState.tool.type === 'select') {
    updateEditorBallistaMovePreview(event);
    return;
  }
  setRaycasterFromEvent(event);
  // Pinceaux de relief : meme pointage que le trait (terrain de son debut,
  // prolonge dans le vide) ; l'apercu suit le curseur hors de la carte.
  if (!(editorState.tool.type === 'relief-brush' || editorState.tool.type === 'paint-surface' ? pickReliefPoint() : intersectTerrain(raycaster.ray, groundHit))) return;
  updateEditorGhost(groundHit.x, groundHit.z);
});

/** Baliste selectionnee, outil selection : apercu (vert/rouge) des cases de
 *  placement 3×3 ou un clic au sol la deplacerait — meme regle que le clic
 *  (EditorState.canMoveBallistaTo : geometrie + territoire joueur). Rien si
 *  le curseur vise un objet, qu'un clic selectionnerait au lieu de deplacer. */
function updateEditorBallistaMovePreview(event: MouseEvent): void {
  clearEditorGhost();
  if (!editorState || editorState.selection?.kind !== 'ballista' || event.target !== canvas) return;
  if (pickEditorObjectAt(event) !== null) return;
  setRaycasterFromEvent(event);
  if (!intersectTerrain(raycaster.ray, groundHit)) return;
  const target = snapBallistaOrigin(groundHit.x, groundHit.z);
  const valid = editorState.canMoveBallistaTo(target.x, target.z);
  const cornerX = Math.round(target.x - BALLISTA_PLACEMENT_TILES / 2);
  const cornerZ = Math.round(target.z - BALLISTA_PLACEMENT_TILES / 2);
  const group = new THREE.Group();
  for (let dz = 0; dz < BALLISTA_PLACEMENT_TILES; dz++) {
    for (let dx = 0; dx < BALLISTA_PLACEMENT_TILES; dx++) group.add(buildCellPreview(cornerX + dx, cornerZ + dz, valid));
  }
  editorGhost = group;
  editorGhostGroup.add(editorGhost);
}

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
  if (!intersectTerrain(raycaster.ray, groundHit)) return;
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
    // Une seule famille selectionnee a la fois (unites OU bâtiment OU
    // Baliste) : selectionner un bâtiment vide la selection d'unites.
    if (selectedBuildingIndex !== null && selectedIndices.length > 0) {
      clearSelection();
      refreshPlayerPreview();
    }
    return;
  }

  if (buildingPlacementMode?.movingIndex !== null && buildingPlacementMode?.movingIndex !== undefined) {
    const committed = confirmBuildingPlacement(event);
    if (!committed) cancelBuildingPlacement();
  }
});

window.addEventListener('mousemove', (event) => {
  if (cameraDrag === null) return;
  // Bouton relache hors de la fenetre (aucun mouseup recu) : `event.buttons`
  // (masque des boutons ACTUELLEMENT enfonces) ne contient plus les boutons
  // du geste, il s'arrete.
  const required = cameraDrag === 'pan' ? 3 : 2;
  if ((event.buttons & required) !== required) {
    cameraDrag = null;
    return;
  }
  const dx = event.clientX - lastMouseX;
  const dy = event.clientY - lastMouseY;
  lastMouseX = event.clientX;
  lastMouseY = event.clientY;
  // Clic gauche + droit (pan, 2026-08-11, demande d'Antoine : "pouvoir
  // deplacer la camera... pour aller admirer certains details de la
  // bataille") ; Maj + clic droit : rotation/inclinaison.
  if (cameraDrag === 'pan') {
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
    refreshMovePreview();
  },
  { passive: false },
);

// Le menu principal s'affiche par defaut (voir constructeur de Screens) ;
// aucune bataille tant que le joueur n'a pas clique sur Jouer.
loop.start();
