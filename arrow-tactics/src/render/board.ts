import * as THREE from 'three';
import { COLORS, obstacleCenter, PLACEMENT_ROWS, TILE } from '../config/constants';
import { cellKey, computeMapCellBounds, resolveMapCells, type MapDef, type TerrainCellDef } from '../config/mapDef';
import { buildSurfaceIndex } from '../config/groundSurfaces';
import { FLAT_TERRAIN, resolveMapHeightField, type TerrainHeightField } from '../config/terrainElevation';
import { resolveMapTerritory, type TerritoryCell, type TerritoryTeam } from '../config/territory';
import { ensureModels, loadEnvironmentAssets, obstacleModelKeys } from './assetLibrary';
import { box } from './meshHelpers';
import { buildObstacleMesh, placeObstacleMesh } from './obstacleFactory';
import { buildCellGridLines, buildTerrainCellsView } from './terrainCells';
import { appendCellSurfaceTriangles } from './terrainSurface';
import { teamColor } from './unitSelectionRing';

export interface Board {
  group: THREE.Group;
  /** Quadrillage : utile pour viser une case pendant le placement, inutile et
   *  bruyant une fois la bataille lancee — l'appelant bascule sa visibilite. */
  gridLines: THREE.LineSegments;
  /** Teintes bleue/rouge des zones de camp : utiles pour se reperer pendant le
   *  placement, hors-propos pendant la bataille ou le terrain redevient vert. */
  zones: THREE.Group;
  /** Rochers/arbres du plateau EN COURS (celui charge au demarrage, hors
   *  editeur) — sous-groupe expose separement au cas ou un appelant veuille
   *  un jour les masquer independamment du reste. L'editeur de maps, lui,
   *  masque desormais `group` en entier (voir main.ts, enterEditor) plutot
   *  que ce sous-groupe seul : depuis le redimensionnement, il dessine son
   *  propre sol/grille/zones/obstacles a une taille de brouillon
   *  independante, donc plus rien du plateau EN COURS ne doit rester visible
   *  pendant l'edition. */
  obstacles: THREE.Group;
}

/**
 * Le plateau est genere par le code (dalles de terrain, grille, zones,
 * debris de bois) ; les decors (rochers, arbres, props, structures) viennent
 * de vrais modeles (Kenney Nature Kit, KayKit, voir assetLibrary.ts) : pour
 * les rochers, deux tentatives de geometrie
 * procedurale (boites empilees, puis masses facettees par deplacement
 * aleatoire de sommets) ont ete jugees insatisfaisantes, la seconde
 * produisant du bruit geometrique plutot qu'une masse rocheuse lisible.
 * Chargement asynchrone (fetch des .glb) : createBoard doit etre attendu par
 * l'appelant (voir main.ts) avant d'ajouter le plateau a la scene.
 *
 * Prend une MapDef en parametre (largeur, hauteur, obstacles) plutot que de
 * lire des constantes globales : premiere etape du chantier editeur de maps
 * (voir config/mapDef.ts) — le jeu doit pouvoir charger n'importe quelle
 * MapDef, pas seulement celle codee en dur a l'origine.
 */
export async function createBoard(map: MapDef, spawnDepth?: number): Promise<Board> {
  const group = new THREE.Group();

  // Terrain PAR CELLULE (2026-08-16, chantier map irreguliere, voir
  // CLAUDE.md) — remplace l'ancien bloc de sol unique. `resolveMapCells`
  // retombe sur un rectangle plein "herbe" pour toute map SANS `cells`
  // explicite (toutes les maps actuelles) : visuellement equivalent a
  // avant, juste rendu en petites dalles instanciees plutot qu'une seule
  // grande boite.
  const cells = resolveMapCells(map);
  // Relief (config/terrainElevation.ts) : sol, grille, zones, debris et
  // decors suivent la hauteur de chaque case.
  const field = resolveMapHeightField(map);
  // Surfaces peintes (MapDef.surfaceCells) : purement visuelles.
  const terrain = buildTerrainCellsView(cells, field, buildSurfaceIndex(map.surfaceCells));
  group.add(terrain.group);

  // Zones de camp : le territoire de la map (config/territory.ts,
  // resolveMapTerritory — meme resolution que la validation du placement),
  // explicite ou, a defaut, les bandes historiques de profondeur
  // `spawnDepth` (2026-08-18, agrandissement progressif de la map : profondeur
  // REELLE pour la run en cours, voir run/mapExpansion.ts) — absent = retombe
  // sur PLACEMENT_ROWS (la constante de depart), pour l'editeur/testBoard, qui
  // n'ont aucun lien avec la progression d'une run reelle.
  const territory = resolveMapTerritory(map, spawnDepth ?? PLACEMENT_ROWS);

  // Grille UNIQUEMENT sur les cases colorees (territoire joueur et ennemi),
  // jamais sur le terrain neutre : memes cases que les zones, limitees aux
  // cellules de terrain existantes (aucun trait au-dessus d'un trou). Le
  // plateau est reconstruit a chaque agrandissement, la grille suit donc le
  // territoire.
  const cellKeys = new Set(cells.map((c) => cellKey(c.x, c.z)));
  const gridLines = buildCellGridLines(
    territory.filter((c) => cellKeys.has(cellKey(c.x, c.z))),
    COLORS.gridLine,
    field,
  );
  group.add(gridLines);

  const zones = createZonesGroup(territory, field);
  group.add(zones);

  // Obstacles : rochers et arbres bloquent la ligne de tir ET les pas en
  // simulation (voir combatSystem, movementSystem) ; leur position vient de
  // la meme MapDef que la simulation recoit (voir World.setMap), pour que le
  // rendu et le gameplay ne divergent jamais. Modeles precharges une seule
  // fois et reutilises (clones) pour chaque obstacle, jamais rechargee
  // individuellement.
  const environmentAssets = await loadEnvironmentAssets();
  // Modeles a la demande utilises par cette carte (pack KayKit complet).
  await ensureModels(obstacleModelKeys(map.obstacles));
  const obstacles = new THREE.Group();
  for (const obstacle of map.obstacles) {
    const mesh = buildObstacleMesh(obstacle, environmentAssets);
    const center = obstacleCenter(obstacle);
    placeObstacleMesh(mesh, obstacle, field.heightAt(center.x, center.z));
    obstacles.add(mesh);
  }
  group.add(obstacles);

  scatterDecoration(group, cells, field);

  return { group, gridLines, zones, obstacles };
}

/** Hauteur des zones au-dessus du sol (sous la grille, a 0.012). */
const ZONE_HEIGHT = 0.006;
/** Un materiau par camp, partage et jamais modifie ni libere. */
const zoneMaterials = new Map<TerritoryTeam, THREE.MeshBasicMaterial>();

function zoneMaterial(team: TerritoryTeam): THREE.MeshBasicMaterial {
  let material = zoneMaterials.get(team);
  if (!material) {
    material = new THREE.MeshBasicMaterial({ color: teamColor(team), transparent: true, opacity: 0.16, depthWrite: false });
    zoneMaterials.set(team, material);
  }
  return material;
}

/** Zones de camp, une case d'overlay par case de territoire (`x → x+1`,
 *  `z → z+1`) : trous, formes irregulieres et camps melanges sont rendus
 *  tels quels, une case neutre n'a aucun overlay. Une geometrie par camp
 *  present (deux triangles par case, sur la surface du relief), soit au plus
 *  deux draw calls. Chaque mesh est place au centre de ses cases : l'ordre de
 *  tri des objets transparents (zones, grille) reste celui des anciennes
 *  bandes. Recoit les cases deja resolues (resolveMapTerritory) — aucun
 *  calcul de zone ici. */
export function createZonesGroup(cells: readonly TerritoryCell[], field: TerrainHeightField = FLAT_TERRAIN): THREE.Group {
  const zones = new THREE.Group();
  for (const team of ['player', 'enemy'] as const) {
    const teamCells = cells.filter((c) => c.team === team);
    if (teamCells.length > 0) zones.add(buildZoneLayer(teamCells, zoneMaterial(team), field));
  }
  return zones;
}

function buildZoneLayer(cells: TerritoryCell[], material: THREE.MeshBasicMaterial, field: TerrainHeightField): THREE.Mesh {
  let cx = 0;
  let cz = 0;
  for (const c of cells) {
    cx += c.x + TILE / 2;
    cz += c.z + TILE / 2;
  }
  cx /= cells.length;
  cz /= cells.length;

  // Relief : chaque case epouse sa surface (memes triangles que le sol,
  // pente de coin comprise). Geometrie reconstruite avec le plateau.
  const positions: number[] = [];
  for (const c of cells) appendCellSurfaceTriangles(field, c.x, c.z, 0, positions, cx, cz);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(cx, ZONE_HEIGHT, cz);
  return mesh;
}

/** Densites calibrees sur le tout premier plateau (14x18) : le nombre
 *  d'elements suit desormais la surface, pour que le decor ne s'eclaircisse
 *  pas quand le plateau grandit. */
const REFERENCE_AREA = 14 * 18;
/** Divisee par 3 par rapport a l'ancienne densite de "plaques de terre"
 *  (7 / REFERENCE_AREA) : la silhouette en planches de bois (voir
 *  createWoodDebris) est plus marquante a l'oeil qu'un simple aplat brun,
 *  il en faut donc nettement moins pour ne pas surcharger le plateau —
 *  demande explicite d'Antoine. */
const WOOD_DEBRIS_DENSITY = 7 / REFERENCE_AREA / 3;

/**
 * Debris de bois : seul decor generique restant genere par le code (les
 * arbres/rochers/props, eux, sont des obstacles de la carte venant de vrais
 * modeles, voir render/obstacleFactory.ts) — jamais dans MapDef.obstacles,
 * donc jamais de collision avec les unites.
 *
 * Touffes d'herbe/buissons/cailloux en boites RETIRES ENTIEREMENT le
 * 2026-08-14 (demande explicite d'Antoine : "au tout debut du developpement
 * du jeu tu as mis des petits cubes verts pour faire des buissons et des
 * petits traits pour simuler de l'herbe, il faudrait les retirer... egalement
 * les petits cubes de pierre gris") — createGrassTuft/createBush/createPebble
 * et leurs constantes de densite (GRASS_DENSITY/BUSH_DENSITY/PEBBLE_DENSITY)
 * supprimes, pas juste desactives. La texture d'herbe peinte SUR le sol
 * (createGrassTexture, voir textures.ts — desormais une vraie image PNG,
 * plus un canvas procedural, voir CLAUDE.md 2026-08-14) est un mecanisme
 * totalement DIFFERENT (une texture appliquee au sol, pas des objets 3D
 * scatter) — non concernee par cette demande, laissee telle quelle.
 */
/** Marge (cases) autour d'un debris : ses planches ne depassent jamais de
 *  leur case vers une case absente. */
const WOOD_DEBRIS_MARGIN = 0.6;

/** Seme les debris UNIQUEMENT sur le terrain existant : un point est garde
 *  si les cases sous lui et a WOOD_DEBRIS_MARGIN autour existent. Avant, le
 *  tirage couvrait tout le rectangle `largeur x hauteur` (symetrique,
 *  decale d'une demi-case sur une largeur impaire) sans regarder les cases :
 *  sur une arene a trous, des planches flottaient au-dessus du vide. Nombre
 *  proportionnel aux cases reelles ; quelques essais par debris au plus. */
function scatterDecoration(group: THREE.Group, cells: TerrainCellDef[], field: TerrainHeightField): void {
  if (cells.length === 0) return;
  const present = new Set(cells.map((c) => cellKey(c.x, c.z)));
  const bounds = computeMapCellBounds(cells);
  const onTerrain = (x: number, z: number): boolean =>
    [-WOOD_DEBRIS_MARGIN, WOOD_DEBRIS_MARGIN].every((dx) =>
      [-WOOD_DEBRIS_MARGIN, WOOD_DEBRIS_MARGIN].every((dz) => present.has(cellKey(Math.floor(x + dx), Math.floor(z + dz)))),
    );

  const woodDebrisCount = Math.round(cells.length * TILE * TILE * WOOD_DEBRIS_DENSITY);
  for (let i = 0; i < woodDebrisCount; i++) {
    for (let attempt = 0; attempt < 8; attempt++) {
      const x = bounds.minX + WOOD_DEBRIS_MARGIN + Math.random() * (bounds.maxX - bounds.minX - 2 * WOOD_DEBRIS_MARGIN);
      const z = bounds.minZ + WOOD_DEBRIS_MARGIN + Math.random() * (bounds.maxZ - bounds.minZ - 2 * WOOD_DEBRIS_MARGIN);
      if (!onTerrain(x, z)) continue;
      // Relief : jamais sur une pente ni a cheval sur deux niveaux.
      const level = field.flatLevelOver(x - WOOD_DEBRIS_MARGIN, x + WOOD_DEBRIS_MARGIN, z - WOOD_DEBRIS_MARGIN, z + WOOD_DEBRIS_MARGIN);
      if (level === null) continue;
      const debris = createWoodDebris(x, z);
      debris.position.y = field.heightAt(x, z);
      group.add(debris);
      break;
    }
  }
}

/** Debris de planches de bois tombees au sol : 2 ou 3 planches paralleles,
 *  longueur et teinte legerement variees pour un aspect abandonne plutot
 *  qu'une plaque uniforme, l'ensemble tourne d'un angle aleatoire comme s'il
 *  etait tombe la. Remplace l'ancienne plaque de terre plate a la demande
 *  d'Antoine — la silhouette doit se lire comme du bois, pas comme un aplat
 *  de terre. */
function createWoodDebris(x: number, z: number): THREE.Group {
  const debris = new THREE.Group();
  const plankCount = 2 + Math.floor(Math.random() * 2);
  const plankWidth = 0.11 + Math.random() * 0.04;
  const gap = 0.03;

  for (let i = 0; i < plankCount; i++) {
    const length = 0.5 + Math.random() * 0.4;
    const color = Math.random() < 0.5 ? COLORS.wood : COLORS.bark;
    const offset = (i - (plankCount - 1) / 2) * (plankWidth + gap);
    const plank = box(length, 0.03, plankWidth, color, (Math.random() - 0.5) * 0.08, 0.016, offset);
    plank.rotation.y = (Math.random() - 0.5) * 0.2;
    plank.receiveShadow = true;
    debris.add(plank);
  }

  debris.position.set(x, 0, z);
  debris.rotation.y = Math.random() * Math.PI;
  return debris;
}
