import * as THREE from 'three';
import { COLORS, PLACEMENT_ROWS, TILE } from '../config/constants';
import { resolveMapCells, type MapDef } from '../config/mapDef';
import { loadEnvironmentAssets } from './assetLibrary';
import { box } from './meshHelpers';
import { buildObstacleMesh } from './obstacleFactory';
import { buildCellGridLines, buildTerrainCellsView } from './terrainCells';

/** Ce dont le sol/la grille/les zones ont besoin — juste la taille, pas toute
 *  une MapDef : sert a l'editeur de maps, qui doit pouvoir reconstruire ces
 *  trois pieces pour une taille de BROUILLON qui n'a pas encore d'obstacles/
 *  unites/nom valides (voir editorState.ts, EditorState.width/height). */
export interface MapSize {
  width: number;
  height: number;
}

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
 * Le plateau est genere par le code (sol, grille, zones, decor leger) —
 * seuls les rochers et les arbres viennent de vrais modeles .glb (Kenney
 * Nature Kit, CC0, voir assetLibrary.ts) : deux tentatives de geometrie
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

  const halfW = (map.width * TILE) / 2;
  const halfH = (map.height * TILE) / 2;

  // Terrain PAR CELLULE (2026-08-16, chantier map irreguliere, voir
  // CLAUDE.md) — remplace l'ancien bloc de sol unique. `resolveMapCells`
  // retombe sur un rectangle plein "herbe" pour toute map SANS `cells`
  // explicite (toutes les maps actuelles) : visuellement equivalent a
  // avant, juste rendu en petites dalles instanciees plutot qu'une seule
  // grande boite.
  const cells = resolveMapCells(map);
  const terrain = buildTerrainCellsView(cells);
  group.add(terrain.group);

  const gridLines = buildCellGridLines(cells, COLORS.gridLine);
  group.add(gridLines);

  // Zones de placement. Pas encore interactives : elles servent a verifier
  // que les deux camps se lisent au premier coup d'oeil pendant le placement.
  // `spawnDepth` (2026-08-18, agrandissement progressif de la map) : profondeur
  // REELLE de la zone pour la run en cours (voir run/mapExpansion.ts,
  // MapExpansionState.spawnDepth) — absent = retombe sur PLACEMENT_ROWS (la
  // constante de depart), comportement inchange pour l'editeur/testBoard, qui
  // n'ont aucun lien avec la progression d'une run reelle.
  const zones = createZonesGroup(map, spawnDepth);
  group.add(zones);

  // Obstacles : rochers et arbres bloquent la ligne de tir ET les pas en
  // simulation (voir combatSystem, movementSystem) ; leur position vient de
  // la meme MapDef que la simulation recoit (voir World.setMap), pour que le
  // rendu et le gameplay ne divergent jamais. Modeles precharges une seule
  // fois et reutilises (clones) pour chaque obstacle, jamais rechargee
  // individuellement.
  const environmentAssets = await loadEnvironmentAssets();
  const obstacles = new THREE.Group();
  for (const obstacle of map.obstacles) {
    obstacles.add(buildObstacleMesh(obstacle, environmentAssets));
  }
  group.add(obstacles);

  scatterDecoration(group, halfW, halfH);

  return { group, gridLines, zones, obstacles };
}

/** Zones bleue/rouge seules — extraite pour etre reconstruite par l'editeur
 *  de maps a une taille de brouillon (voir MapSize) sans reconstruire tout
 *  le plateau. Pas encore consciente des cellules (voir terrainCells.ts) :
 *  reste un simple rectangle plein base sur width/height, simplification
 *  assumee — un "trou" de terrain garde quand meme sa teinte de zone, sans
 *  consequence gameplay (le placement y reste de toute facon impossible,
 *  voir Part AL). */
export function createZonesGroup(map: MapSize, spawnDepth: number = PLACEMENT_ROWS): THREE.Group {
  const halfH = (map.height * TILE) / 2;
  const zones = new THREE.Group();
  zones.add(createZone(map, COLORS.playerZone, halfH - (spawnDepth * TILE) / 2, spawnDepth));
  zones.add(createZone(map, COLORS.enemyZone, -halfH + (spawnDepth * TILE) / 2, spawnDepth));
  return zones;
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
 * arbres/rochers/props, eux, sont des obstacles a part entiere venant de
 * vrais modeles .glb, voir OBSTACLES et createTreeObstacle) — jamais
 * enregistres dans OBSTACLES, donc jamais de collision avec les unites.
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
function scatterDecoration(group: THREE.Group, halfW: number, halfH: number): void {
  const area = halfW * 2 * (halfH * 2);

  const woodDebrisCount = Math.round(area * WOOD_DEBRIS_DENSITY);
  for (let i = 0; i < woodDebrisCount; i++) {
    const x = (Math.random() * 2 - 1) * (halfW - 0.6);
    const z = (Math.random() * 2 - 1) * (halfH - 0.6);
    group.add(createWoodDebris(x, z));
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

function createZone(map: MapSize, color: number, centerZ: number, spawnDepth: number): THREE.Mesh {
  const zone = new THREE.Mesh(
    new THREE.PlaneGeometry(map.width * TILE, spawnDepth * TILE),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.16, depthWrite: false }),
  );
  zone.rotation.x = -Math.PI / 2;
  zone.position.set(0, 0.006, centerZ);
  return zone;
}
