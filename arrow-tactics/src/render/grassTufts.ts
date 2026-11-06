import * as THREE from 'three';
import { obstacleBounds, type ObstacleBounds } from '../config/constants';
import { buildSurfaceIndex } from '../config/groundSurfaces';
import { CAMP_CLEAR_RADIUS, cellKey, type MapDef, type TerrainCellDef } from '../config/mapDef';
import { getStartingBasePreset, inGateApproach, startingBaseLayoutOf } from '../config/startingBase';
import type { TerrainHeightField } from '../config/terrainElevation';
import { Rng } from '../core/rng';
import { groundNoise } from './groundSurfaces';
import { hillHeightAt } from './hillShape';

/**
 * TOUFFES D'HERBE (2026-11-06, demande d'Antoine) : petits accents low-poly qui cassent le vide
 * du terrain herbeux. Purement visuel : ni la carte, ni la navigation, ni les collisions ne les
 * voient, et aucun pointage ne les touche. Deterministe : RNG a graine, propre a ce decor (celle
 * de la simulation n'est jamais lue), meme carte -> memes touffes. Valeurs PROVISOIRES.
 *
 * Deux geometries partagees (brins pointus, plante basse a trois feuilles), donc deux
 * InstancedMesh pour toute la carte, soit 2 draw calls, sans ombre projetee. Pas de morceaux : ils
 * ajouteraient des draw calls pour economiser quelques milliers de sommets. Au dezoom, seule une
 * partie des instances est dessinee (ordre melange a la construction, donc sans trou visible).
 *
 * Presence continue, sans alternance de zones nues et de zones decorees : le bruit de groupement
 * ne fait que moduler la densite. Trois tailles de brins (les hautes herbes restent minoritaires).
 *
 * Jamais sur l'eau, la terre, une pente, une falaise, un obstacle, une ressource, un camp neutre
 * ni aux abords d'une porte ; clairsemees dans la cour centrale du camp de depart, plus nombreuses
 * vers sa peripherie et contre les arbres. Les batiments, chantiers, murs et chemins apparaissent
 * en jeu : main.ts retire les touffes sous eux (clearFootprint, clearWall, clearCells).
 */

/** Part des cases qui portent un petit groupe de touffes, dans une zone fournie. */
const GROUP_DENSITY = 0.68;
/** Densite gardee sur les zones les moins fournies du bruit de groupement. */
const BALD_DENSITY = 0.5;
/** Facteur de densite contre un arbre (lisiere, bosquet). */
const NEAR_TREE_BOOST = 1.5;
/** Cour du camp : densite gardee au centre, rayons (cases) ou elle revient a 1, puis renfort sur la
 *  peripherie interieure, de ce rayon jusqu'aux murs (qui, avec les portes, y retirent deja
 *  beaucoup de touffes). */
const YARD_DENSITY = 0.3;
const YARD_RADII = [6, 12.5] as const;
const YARD_EDGE_BOOST = 1.5;
/** Part des groupes de plantes basses ; parts des hautes herbes et des herbes moyennes parmi les
 *  brins (le reste : petites touffes). */
const CLOVER_SHARE = 0.2;
const TALL_SHARE = 0.12;
const MEDIUM_SHARE = 0.43;
/** Ecart minimal (cases) d'une touffe a une case qui n'est pas de l'herbe, et rayon (cases) qui doit
 *  rester plat autour d'elle (pente, pied ou haut d'une falaise). */
const GRASS_MARGIN = 0.55;
const FLAT_RADIUS = 0.4;
/** Abords d'une porte du camp (cases) : demi-largeur, de part et d'autre de l'enceinte. */
const GATE_HALF_WIDTH = 3;
const GATE_REACH = 4;
/** Marges (cases) autour d'une emprise ; rayons autour d'un mur, d'une porte et d'un tas. */
const FOOTPRINT_MARGIN = 0.35;
const WALL_RADIUS = 0.7;
const DOOR_RADIUS = 2.2;
const PILE_RADIUS = 0.8;
/** Dessinees au dezoom : toutes jusqu'a LOD_FULL_VIEW (hauteur de vue), LOD_MIN_SHARE a LOD_FAR_VIEW. */
const LOD_FULL_VIEW = 22;
const LOD_FAR_VIEW = 31;
const LOD_MIN_SHARE = 0.75;

/** Teintes (lineaires) : pointe des brins ; la base est assombrie par la geometrie. Proches du sol
 *  affiche par `meadow` (render/groundLook.ts) : a remesurer si sa teinte change. */
const BLADE_TINTS: readonly (readonly [number, number, number])[] = [
  [0.17, 0.41, 0.09],
  [0.1, 0.3, 0.075],
  [0.21, 0.41, 0.09],
];
const CLOVER_TINTS: readonly (readonly [number, number, number])[] = [
  [0.075, 0.25, 0.07],
  [0.1, 0.3, 0.08],
];

interface Tuft {
  x: number;
  z: number;
  y: number;
  yaw: number;
  width: number;
  height: number;
  tint: readonly [number, number, number];
  shade: number;
}

/** Sommets d'un triangle, normale vers le haut : les brins prennent la lumiere du sol, vus de
 *  n'importe quel cote, plutot que de virer au noir sur une face a l'ombre. */
function tuftGeometry(tris: readonly (readonly (readonly [number, number, number, number])[])[]): THREE.BufferGeometry {
  const position: number[] = [];
  const normal: number[] = [];
  const color: number[] = [];
  for (const tri of tris) {
    for (const [x, y, z, light] of tri) {
      position.push(x, y, z);
      normal.push(0, 1, 0);
      color.push(light, light, light);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normal, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(color, 3));
  return geometry;
}

/** Quatre brins pointus (un triangle chacun), hauteur 1, largeur d'environ 1 : base sombre, pointe claire. */
function bladesGeometry(): THREE.BufferGeometry {
  const blades = [
    { angle: 0.5, height: 1, lean: 0.34, width: 0.3 },
    { angle: 2.2, height: 0.74, lean: 0.46, width: 0.34 },
    { angle: 3.7, height: 0.88, lean: 0.38, width: 0.28 },
    { angle: 5.3, height: 0.6, lean: 0.5, width: 0.32 },
  ];
  return tuftGeometry(blades.map(({ angle, height, lean, width }) => {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    const bx = c * 0.1;
    const bz = s * 0.1;
    return [
      [bx - s * width / 2, 0, bz + c * width / 2, 0.55],
      [bx + s * width / 2, 0, bz - c * width / 2, 0.55],
      [c * lean, height, s * lean, 1.05],
    ] as const;
  }));
}

/** Plante basse : trois feuilles en losange (deux triangles chacune), rayon 1, hauteur 1. */
function cloverGeometry(): THREE.BufferGeometry {
  const tris: (readonly (readonly [number, number, number, number])[])[] = [];
  for (const angle of [0.3, 2.4, 4.4]) {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    const inner = [0, 0.15, 0, 0.72] as const;
    const left = [c * 0.55 - s * 0.36, 1, s * 0.55 + c * 0.36, 1] as const;
    const right = [c * 0.55 + s * 0.36, 1, s * 0.55 - c * 0.36, 1] as const;
    const tip = [c, 0.75, s, 1.08] as const;
    tris.push([inner, left, right], [left, tip, right]);
  }
  return tuftGeometry(tris);
}

/** Partages par tous les plateaux, jamais liberes. */
let shared: { blades: THREE.BufferGeometry; clover: THREE.BufferGeometry; material: THREE.MeshLambertMaterial } | null = null;

/** Graphic Lab V2 (render/visualPreset.ts, main.ts) : multiplicateur lineaire des teintes de toutes
 *  les touffes (couleur du materiau partage) ; neutre sans preset. Ni geometrie ni densite. */
let tuftTint: readonly [number, number, number] = [1, 1, 1];

export function setTuftTint(tint: readonly [number, number, number]): void {
  tuftTint = tint;
  shared?.material.color.setRGB(tint[0], tint[1], tint[2], THREE.LinearSRGBColorSpace);
}

function sharedAssets(): NonNullable<typeof shared> {
  if (!shared) {
    const material = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
    material.color.setRGB(tuftTint[0], tuftTint[1], tuftTint[2], THREE.LinearSRGBColorSpace);
    // Deux faces sans retourner la normale (voir tuftGeometry).
    material.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\n\tnormal = normalize( vNormal );');
    };
    material.customProgramCacheKey = () => 'grass-tuft';
    shared = { blades: bladesGeometry(), clover: cloverGeometry(), material };
  }
  return shared;
}

/** Touffes de la carte `map`, dans un ordre melange (voir LOD). */
function scatterTufts(map: MapDef, cells: readonly TerrainCellDef[], field: TerrainHeightField): { blades: Tuft[]; clover: Tuft[] } {
  const rng = new Rng(((map.generator?.seed ?? 0) ^ 0x2f6e2b1d) >>> 0);
  const painted = buildSurfaceIndex(map.surfaceCells);
  const grass = new Set<string>();
  for (const c of cells) {
    const key = cellKey(c.x, c.z);
    const surface = painted.get(key);
    if (c.terrain === 'grass' && (!surface || surface.startsWith('herbe-'))) grass.add(key);
  }

  // Obstacles, ressources : rectangles rangees par case touchee.
  const blockedByCell = new Map<string, ObstacleBounds[]>();
  const block = (b: ObstacleBounds): void => {
    for (let z = Math.floor(b.minZ); z <= Math.floor(b.maxZ); z++) {
      for (let x = Math.floor(b.minX); x <= Math.floor(b.maxX); x++) {
        const key = cellKey(x, z);
        const list = blockedByCell.get(key);
        if (list) list.push(b);
        else blockedByCell.set(key, [b]);
      }
    }
  };
  const nearTree = new Set<string>();
  for (const o of map.obstacles) {
    const b = obstacleBounds(o);
    block({ minX: b.minX - FOOTPRINT_MARGIN, maxX: b.maxX + FOOTPRINT_MARGIN, minZ: b.minZ - FOOTPRINT_MARGIN, maxZ: b.maxZ + FOOTPRINT_MARGIN });
    if (o.kind !== 'tree') continue;
    const cx = Math.floor((b.minX + b.maxX) / 2);
    const cz = Math.floor((b.minZ + b.maxZ) / 2);
    for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) nearTree.add(cellKey(cx + dx, cz + dz));
  }
  for (const p of map.resourcePiles ?? []) block({ minX: p.x - PILE_RADIUS, maxX: p.x + PILE_RADIUS, minZ: p.z - PILE_RADIUS, maxZ: p.z + PILE_RADIUS });
  const isBlocked = (x: number, z: number): boolean => (blockedByCell.get(cellKey(Math.floor(x), Math.floor(z))) ?? []).some((b) => x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ);

  const layout = startingBaseLayoutOf(map);
  const campRadius = layout ? getStartingBasePreset(layout.preset).enclosure.radius : 0;
  const nearCamp = (x: number, z: number): boolean => (map.camps ?? []).some((c) => Math.hypot(x - c.x, z - c.z) <= CAMP_CLEAR_RADIUS + 1.5);
  const onGrass = (x: number, z: number): boolean => [-GRASS_MARGIN, GRASS_MARGIN].every((dx) => [-GRASS_MARGIN, GRASS_MARGIN].every((dz) => grass.has(cellKey(Math.floor(x + dx), Math.floor(z + dz)))));
  // Bruit de groupement, decale par la graine : des zones plus fournies que d'autres, jamais nues.
  const nx = rng.next() * 512;
  const nz = rng.next() * 512;

  const blades: Tuft[] = [];
  const clover: Tuft[] = [];
  for (const c of cells) {
    const cx = c.x + 0.5;
    const cz = c.z + 0.5;
    if (!grass.has(cellKey(c.x, c.z)) || nearCamp(cx, cz)) continue;
    let yard = 1;
    if (layout) {
      const ox = c.x - Math.floor(layout.origin.x);
      const oz = c.z - Math.floor(layout.origin.z);
      if (inGateApproach(ox, oz, campRadius - GATE_REACH + 1, GATE_HALF_WIDTH, campRadius + GATE_REACH)) continue;
      const d = Math.hypot(cx - layout.origin.x, cz - layout.origin.z);
      const t = (d - YARD_RADII[0]) / (YARD_RADII[1] - YARD_RADII[0]);
      yard = (YARD_DENSITY + (1 - YARD_DENSITY) * Math.min(1, Math.max(0, t))) * (d >= YARD_RADII[1] && d < campRadius ? YARD_EDGE_BOOST : 1);
    }
    const t = (groundNoise((c.x + nx) * 0.6, (c.z + nz) * 0.6) - 0.34) / 0.3;
    const clump = BALD_DENSITY + (1 - BALD_DENSITY) * Math.min(1, Math.max(0, t));
    const density = GROUP_DENSITY * clump * yard * (nearTree.has(cellKey(c.x, c.z)) ? NEAR_TREE_BOOST : 1);
    if (rng.next() >= density) continue;

    // Petit groupe : 1 a 3 touffes de meme nature, serrees autour d'un point de la case.
    const gx = c.x + 0.2 + rng.next() * 0.6;
    const gz = c.z + 0.2 + rng.next() * 0.6;
    const isClover = rng.next() < CLOVER_SHARE;
    const countRoll = rng.next();
    const count = countRoll < 0.5 ? 1 : countRoll < 0.85 ? 2 : 3;
    const tints = isClover ? CLOVER_TINTS : BLADE_TINTS;
    const tint = tints[Math.floor(rng.next() * tints.length)]!;
    for (let i = 0; i < count; i++) {
      const a = rng.next() * Math.PI * 2;
      const r = i === 0 ? 0 : 0.18 + rng.next() * 0.3;
      const x = gx + Math.cos(a) * r;
      const z = gz + Math.sin(a) * r;
      const yaw = rng.next() * Math.PI * 2;
      const size = 0.85 + rng.next() * 0.3;
      const shade = 0.9 + rng.next() * 0.2;
      const kind = rng.next();
      if (isBlocked(x, z) || !onGrass(x, z) || field.flatLevelOver(x - FLAT_RADIUS, x + FLAT_RADIUS, z - FLAT_RADIUS, z + FLAT_RADIUS) === null) continue;
      const y = hillHeightAt(field, x, z);
      if (isClover) clover.push({ x, z, y, yaw, width: 0.23 * size, height: 0.08 * size, tint, shade });
      else if (kind < TALL_SHARE) blades.push({ x, z, y, yaw, width: 0.24 * size, height: 0.52 * size, tint, shade });
      else if (kind < TALL_SHARE + MEDIUM_SHARE) blades.push({ x, z, y, yaw, width: 0.32 * size, height: 0.31 * size, tint, shade });
      else blades.push({ x, z, y, yaw, width: 0.25 * size, height: 0.19 * size, tint, shade });
    }
  }
  const shuffle = (list: Tuft[]): void => {
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(rng.next() * (i + 1));
      [list[i], list[j]] = [list[j]!, list[i]!];
    }
  };
  shuffle(blades);
  shuffle(clover);
  return { blades, clover };
}

const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0);

/** Part des touffes dessinee a cette camera (voir LOD_*). */
function lodShare(camera: THREE.Camera): number {
  if (!(camera instanceof THREE.OrthographicCamera)) return 1;
  const t = ((camera.top - camera.bottom) / camera.zoom - LOD_FULL_VIEW) / (LOD_FAR_VIEW - LOD_FULL_VIEW);
  return 1 + (LOD_MIN_SHARE - 1) * Math.min(1, Math.max(0, t));
}

export class GrassTufts {
  readonly group = new THREE.Group();
  private readonly layers: { mesh: THREE.InstancedMesh; tufts: Tuft[] }[] = [];

  constructor(map: MapDef, cells: readonly TerrainCellDef[], field: TerrainHeightField) {
    this.group.name = 'grassTufts';
    const { blades, clover } = scatterTufts(map, cells, field);
    const assets = sharedAssets();
    const matrix = new THREE.Matrix4();
    const rotation = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const position = new THREE.Vector3();
    const scale = new THREE.Vector3();
    const color = new THREE.Color();
    for (const [geometry, tufts] of [[assets.blades, blades], [assets.clover, clover]] as const) {
      if (tufts.length === 0) continue;
      const mesh = new THREE.InstancedMesh(geometry, assets.material, tufts.length);
      mesh.receiveShadow = true;
      mesh.raycast = () => {};
      tufts.forEach((t, i) => {
        matrix.compose(position.set(t.x, t.y, t.z), rotation.setFromAxisAngle(up, t.yaw), scale.set(t.width, t.height, t.width));
        mesh.setMatrixAt(i, matrix);
        mesh.setColorAt(i, color.setRGB(t.tint[0] * t.shade, t.tint[1] * t.shade, t.tint[2] * t.shade));
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
      const total = tufts.length;
      mesh.onBeforeRender = (_renderer, _scene, camera) => {
        mesh.count = Math.round(total * lodShare(camera));
      };
      this.group.add(mesh);
      this.layers.push({ mesh, tufts });
    }
  }

  /** Retire les touffes sur l'emprise (bornes monde) d'un batiment ou d'un chantier. */
  clearFootprint(b: ObstacleBounds): void {
    this.clearWhere((x, z) => x >= b.minX - FOOTPRINT_MARGIN && x <= b.maxX + FOOTPRINT_MARGIN && z >= b.minZ - FOOTPRINT_MARGIN && z <= b.maxZ + FOOTPRINT_MARGIN);
  }

  /** Retire les touffes contre un segment de mur, ou aux abords d'une porte. */
  clearWall(ax: number, az: number, bx: number, bz: number, door: boolean): void {
    const radius = door ? DOOR_RADIUS : WALL_RADIUS;
    const dx = bx - ax;
    const dz = bz - az;
    const lengthSq = dx * dx + dz * dz || 1;
    this.clearWhere((x, z) => {
      const t = Math.min(1, Math.max(0, ((x - ax) * dx + (z - az) * dz) / lengthSq));
      return Math.hypot(x - ax - dx * t, z - az - dz * t) <= radius;
    });
  }

  /** Retire les touffes des cases donnees (cles cellKey : terre battue du village, chemins). */
  clearCells(cells: ReadonlySet<string>): void {
    this.clearWhere((x, z) => cells.has(cellKey(Math.floor(x), Math.floor(z))));
  }

  private clearWhere(hit: (x: number, z: number) => boolean): void {
    for (const { mesh, tufts } of this.layers) {
      let changed = false;
      tufts.forEach((t, i) => {
        if (!hit(t.x, t.z)) return;
        mesh.setMatrixAt(i, HIDDEN);
        changed = true;
      });
      if (changed) mesh.instanceMatrix.needsUpdate = true;
    }
  }

  /** Libere les instances du plateau (geometries et materiau partages, jamais liberes). */
  dispose(): void {
    for (const { mesh } of this.layers) mesh.dispose();
  }
}
