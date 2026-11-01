import { Rng } from '../../core/rng';
import type { ObstacleDef } from '../constants';
import type { SurfaceCellDef } from '../groundSurfaces';
import type { MapDef, TerrainCellDef } from '../mapDef';
import type { ResourcePileDef } from '../resourceNodes';
import type { SlopeDirection, TerrainElevationCellDef } from '../terrainElevation';
import type { TerritoryCell } from '../territory';

/**
 * Carte de Survie PROCEDURALE (2026-11-01, direction Hero RTS) : disque de
 * 96 x 96 cases, Heros et Baliste au centre, plaine centrale plate et seche,
 * monde de plus en plus sauvage en s'eloignant (forets, collines a rampe,
 * mares, rochers, petits tas de bois et de pierre a ramasser). Deterministe :
 * une meme graine donne exactement la meme carte (aucun Math.random).
 *
 * Valeurs PROVISOIRES (rayons, densites, nombres), voir
 * docs/DESIGN_DECISIONS.md G6. Pas de camp PvE dans cette passe.
 */
export const PROCEDURAL_MAP_SIZE = 96;

/** Rayon (cases) du disque de la carte, depuis le centre de la Baliste. */
const MAP_RADIUS = 46.5;
/** Plaine centrale garantie : sans relief, eau, arbre ni rocher. */
const CLEAR_RADIUS = 11;
/** Territoire du joueur (pose des batiments et de l'armee). */
const TERRITORY_RADIUS = 8;
/** Anneau des apparitions ennemies (main.ts, computeEnemyWavePlan) : sans
 *  colline ni eau, pour qu'un groupe trouve toujours ses cases. */
export const ENEMY_SPAWN_RING_RADIUS = 22;
const SPAWN_RING_CLEARANCE = 4;

/** Arbres Kenney (meme melange que le pinceau Foret « Mixte » de l'editeur). */
const TREE_MODELS = ['tree_default', 'tree_oak', 'tree_detailed', 'tree_fat', 'tree_pineDefaultA', 'tree_pineRoundA', 'tree_pineTallA', 'tree_cone'];
/** Petits decors (echelles de l'arene officielle). */
const PROPS: readonly { model: string; scale: number }[] = [
  { model: 'plant_bush', scale: 0.4 },
  { model: 'plant_bushDetailed', scale: 0.6 },
  { model: 'plant_flatShort', scale: 0.28 },
  { model: 'flower_purpleA', scale: 0.18 },
  { model: 'flower_yellowA', scale: 0.18 },
  { model: 'stump_round', scale: 0.37 },
];

/** Bruit de valeur lisse, deterministe (graine, coordonnees continues). */
function hash2(seed: number, x: number, z: number): number {
  let h = (seed ^ Math.imul(x | 0, 374761393) ^ Math.imul(z | 0, 668265263)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function valueNoise(seed: number, x: number, z: number): number {
  const x0 = Math.floor(x), z0 = Math.floor(z);
  const fx = x - x0, fz = z - z0;
  const sx = fx * fx * (3 - 2 * fx), sz = fz * fz * (3 - 2 * fz);
  const a = hash2(seed, x0, z0), b = hash2(seed, x0 + 1, z0), c = hash2(seed, x0, z0 + 1), d = hash2(seed, x0 + 1, z0 + 1);
  return a + (b - a) * sx + (c - a) * sz + (a - b - c + d) * sx * sz;
}

function fbm(seed: number, x: number, z: number): number {
  return 0.65 * valueNoise(seed, x, z) + 0.35 * valueNoise(seed + 101, x * 2.1, z * 2.1);
}

/** Distance (cases) du centre de la case (x, z) au centre de la Baliste. */
function centerDistance(x: number, z: number): number {
  return Math.hypot(x, z);
}

const NEIGHBORS: readonly [number, number, SlopeDirection][] = [
  // Case voisine de la colline, et pente qui monte VERS la colline (N = -z, E = +x).
  [1, 0, 'W'],
  [-1, 0, 'E'],
  [0, 1, 'N'],
  [0, -1, 'S'],
];

export function generateSurvivalMap(seed: number): MapDef {
  const rng = new Rng(seed);
  const half = PROCEDURAL_MAP_SIZE / 2;
  const key = (x: number, z: number) => `${x},${z}`;

  // ---- Forme : disque de cases.
  const cells: TerrainCellDef[] = [];
  const inMap = new Set<string>();
  for (let z = -half; z < half; z++) {
    for (let x = -half; x < half; x++) {
      const d = centerDistance(x, z);
      if (d > MAP_RADIUS) continue;
      // Terre battue par plaques, seulement dans le monde exterieur.
      const dirt = d > CLEAR_RADIUS + 3 && fbm(seed + 7, x / 7, z / 7) > 0.72;
      cells.push({ x, z, terrain: dirt ? 'dirt' : 'grass' });
      inMap.add(key(x, z));
    }
  }
  const free = (x: number, z: number) => inMap.has(key(x, z));
  const inSpawnRing = (d: number) => Math.abs(d - ENEMY_SPAWN_RING_RADIUS) < SPAWN_RING_CLEARANCE;

  // ---- Collines (niveau 1) avec une rampe tournee vers le centre.
  const hill = new Set<string>();
  const elevationCells: TerrainElevationCellDef[] = [];
  const hillCenters: { x: number; z: number; r: number }[] = [];
  for (let attempt = 0; attempt < 200 && hillCenters.length < 10; attempt++) {
    const a = rng.next() * Math.PI * 2;
    const d = 16 + rng.next() * 26;
    const r = 2 + rng.next() * 1.8;
    const cx = Math.round(Math.cos(a) * d), cz = Math.round(Math.sin(a) * d);
    if (Math.abs(d - ENEMY_SPAWN_RING_RADIUS) < SPAWN_RING_CLEARANCE + r) continue;
    if (d + r > MAP_RADIUS - 2 || d - r < CLEAR_RADIUS + 3) continue;
    if (hillCenters.some((h) => Math.hypot(h.x - cx, h.z - cz) < h.r + r + 5)) continue;
    hillCenters.push({ x: cx, z: cz, r });
  }
  for (const h of hillCenters) {
    const own: { x: number; z: number }[] = [];
    for (let z = Math.floor(h.z - h.r); z <= Math.ceil(h.z + h.r); z++) {
      for (let x = Math.floor(h.x - h.r); x <= Math.ceil(h.x + h.r); x++) {
        if (free(x, z) && Math.hypot(x - h.x, z - h.z) <= h.r) own.push({ x, z });
      }
    }
    for (const c of own) {
      hill.add(key(c.x, c.z));
      elevationCells.push({ x: c.x, z: c.z, level: 1 });
    }
    // Rampe : case basse voisine, la plus proche du centre, dont les deux
    // voisines laterales et l'arriere restent basses (pente lisible).
    let best: { x: number; z: number; slope: SlopeDirection; d: number } | null = null;
    for (const c of own) {
      for (const [dx, dz, slope] of NEIGHBORS) {
        const x = c.x + dx, z = c.z + dz;
        if (!free(x, z) || hill.has(key(x, z)) || hill.has(key(x + dx, z + dz))) continue;
        if (hill.has(key(x + dz, z + dx)) || hill.has(key(x - dz, z - dx))) continue;
        const d = centerDistance(x, z);
        if (!best || d < best.d) best = { x, z, slope, d };
      }
    }
    if (best) elevationCells.push({ x: best.x, z: best.z, level: 0, slope: best.slope });
  }
  const ramps = new Set(elevationCells.filter((c) => c.slope).map((c) => key(c.x, c.z)));

  // ---- Mares (eau infranchissable), loin du camp et des collines.
  const water = new Set<string>();
  const ponds: { x: number; z: number; r: number }[] = [];
  for (let attempt = 0; attempt < 200 && ponds.length < 6; attempt++) {
    const a = rng.next() * Math.PI * 2;
    const d = 18 + rng.next() * 25;
    const r = 1.4 + rng.next() * 1.6;
    const cx = Math.round(Math.cos(a) * d), cz = Math.round(Math.sin(a) * d);
    if (Math.abs(d - ENEMY_SPAWN_RING_RADIUS) < SPAWN_RING_CLEARANCE + r) continue;
    if (d + r > MAP_RADIUS - 2) continue;
    if (hillCenters.some((h) => Math.hypot(h.x - cx, h.z - cz) < h.r + r + 3)) continue;
    if (ponds.some((p) => Math.hypot(p.x - cx, p.z - cz) < p.r + r + 8)) continue;
    ponds.push({ x: cx, z: cz, r });
  }
  for (const p of ponds) {
    for (let z = Math.floor(p.z - p.r); z <= Math.ceil(p.z + p.r); z++) {
      for (let x = Math.floor(p.x - p.r); x <= Math.ceil(p.x + p.r); x++) {
        const k = key(x, z);
        if (free(x, z) && !hill.has(k) && !ramps.has(k) && Math.hypot(x - p.x, z - p.z) <= p.r) water.add(k);
      }
    }
  }
  const surfaceCells: SurfaceCellDef[] = [...water].map((k) => {
    const [x, z] = k.split(',').map(Number) as [number, number];
    return { x, z, surface: 'eau' };
  });

  // ---- Arbres (forets par plaques, plus denses en s'eloignant), rochers
  // (gros gisements de pierre), petits decors.
  const obstacles: ObstacleDef[] = [];
  const occupied = new Set<string>();
  const blockedForDecor = (x: number, z: number) => water.has(key(x, z)) || ramps.has(key(x, z));
  for (const c of cells) {
    const d = centerDistance(c.x, c.z);
    if (d <= CLEAR_RADIUS || blockedForDecor(c.x, c.z)) continue;
    const wild = Math.min(1, (d - CLEAR_RADIUS) / 28);
    const forest = fbm(seed + 31, c.x / 9, c.z / 9);
    const inForest = forest > 0.66 - 0.16 * wild;
    const p = inForest ? 0.28 + 0.3 * wild : 0.025 * wild;
    if (hash2(seed + 41, c.x, c.z) >= p) continue;
    const a = hash2(seed + 43, c.x, c.z) * Math.PI * 2;
    const r = 0.15 + hash2(seed + 47, c.x, c.z) * 0.2;
    obstacles.push({
      kind: 'tree',
      tilesX: 1,
      tilesZ: 1,
      treeModel: TREE_MODELS[Math.floor(hash2(seed + 53, c.x, c.z) * TREE_MODELS.length)]!,
      x: c.x + 0.5 + Math.cos(a) * r,
      z: c.z + 0.5 + Math.sin(a) * r,
      rotationY: hash2(seed + 59, c.x, c.z) * Math.PI * 2,
      scale: 0.9 + hash2(seed + 61, c.x, c.z) * 0.25,
    });
    occupied.add(key(c.x, c.z));
  }
  let rocks = 0;
  for (let attempt = 0; attempt < 400 && rocks < 26; attempt++) {
    const a = rng.next() * Math.PI * 2;
    const d = CLEAR_RADIUS + 5 + rng.next() * (MAP_RADIUS - CLEAR_RADIUS - 8);
    const x = Math.round(Math.cos(a) * d), z = Math.round(Math.sin(a) * d);
    const foot = [key(x, z), key(x + 1, z), key(x, z + 1), key(x + 1, z + 1)];
    if (foot.some((k) => !inMap.has(k) || water.has(k) || ramps.has(k) || hill.has(k) || occupied.has(k))) continue;
    if (inSpawnRing(d)) continue;
    obstacles.push({ kind: 'rock', tilesX: 2, tilesZ: 2, cornerX: x, cornerZ: z });
    for (const k of foot) occupied.add(k);
    rocks++;
  }
  for (const c of cells) {
    const d = centerDistance(c.x, c.z);
    if (d <= 3 || blockedForDecor(c.x, c.z) || occupied.has(key(c.x, c.z))) continue;
    if (hash2(seed + 71, c.x, c.z) >= 0.035) continue;
    const prop = PROPS[Math.floor(hash2(seed + 73, c.x, c.z) * PROPS.length)]!;
    obstacles.push({ kind: 'prop', tilesX: 1, tilesZ: 1, propModel: prop.model, scale: prop.scale, x: c.x + 0.3 + hash2(seed + 79, c.x, c.z) * 0.4, z: c.z + 0.3 + hash2(seed + 83, c.x, c.z) * 0.4 });
  }

  // ---- Petits tas de bois et de pierre (finis, ramasses par le Heros).
  // Quelques-uns pres du camp (5 a 12 cases, jamais colles a la Baliste),
  // le reste disperse, un peu plus fournis au loin.
  const resourcePiles: ResourcePileDef[] = [];
  const pileCells = new Set<string>();
  const placePile = (resource: ResourcePileDef['resource'], dMin: number, dMax: number): boolean => {
    for (let attempt = 0; attempt < 60; attempt++) {
      const a = rng.next() * Math.PI * 2;
      const d = dMin + rng.next() * (dMax - dMin);
      const x = Math.floor(Math.cos(a) * d), z = Math.floor(Math.sin(a) * d);
      const k = key(x, z);
      if (!inMap.has(k) || water.has(k) || ramps.has(k) || hill.has(k) || occupied.has(k) || pileCells.has(k)) continue;
      const far = d > 24;
      const amount = (far ? 2 : 1) + Math.floor(rng.next() * 3);
      resourcePiles.push({ x: x + 0.3 + rng.next() * 0.4, z: z + 0.3 + rng.next() * 0.4, resource, amount });
      pileCells.add(k);
      return true;
    }
    return false;
  };
  for (let i = 0; i < 4; i++) placePile('wood', 5, 12);
  for (let i = 0; i < 3; i++) placePile('stone', 5, 12);
  for (let i = 0; i < 60; i++) placePile('wood', 12, MAP_RADIUS - 1.5);
  for (let i = 0; i < 44; i++) placePile('stone', 12, MAP_RADIUS - 1.5);

  // ---- Territoire du joueur : disque central.
  const territory: TerritoryCell[] = cells.filter((c) => centerDistance(c.x, c.z) <= TERRITORY_RADIUS).map((c) => ({ x: c.x, z: c.z, team: 'player' }));

  return {
    name: `Survie procédurale (graine ${seed})`,
    version: 1,
    width: PROCEDURAL_MAP_SIZE,
    height: PROCEDURAL_MAP_SIZE,
    cells,
    obstacles,
    playerUnits: [],
    enemyUnits: [],
    ballista: { x: 0.5, z: 0.5 },
    territory,
    elevationCells,
    surfaceCells,
    resourcePiles,
    generator: { kind: 'survival-procedural', seed },
  };
}
