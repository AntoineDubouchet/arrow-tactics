import type { ObstacleDef } from '../config/constants';

/**
 * Murs V2 (2026-11-02, Palissade) : geometrie PURE d'une ligne de mur posee
 * du point A au point B, a n'importe quel angle, sans grille ni directions
 * cardinales. Le Wall V1 (trace case par case, virages, portes KayKit) a ete
 * supprime : tout part d'ici.
 *
 * - Une ligne est decoupee en SEGMENTS internes egaux (segmentWallLine) :
 *   chacun est une entite (PV, chantier, destruction, reparation) ; le
 *   joueur voit une ligne continue.
 * - Chaque segment a une emprise en CAPSULE (wallSegmentObstacle,
 *   ObstacleDef.line) : deux segments voisins partagent leur extremite, leurs
 *   capsules se recouvrent donc toujours (barriere continue, quels que
 *   soient l'angle ou la jonction).
 * - La pose est verifiee par checkWallLine (carte, eau, obstacles,
 *   batiments, corps, croisements) ; les extremites s'aimantent aux murs
 *   existants (snapWallPoint) pour former des jonctions.
 *
 * Pur : aucun etat global, aucun rendu, aucune donnee de jeu (longueurs et
 * epaisseurs passees en parametres, voir data/walls.ts). Partage par la
 * simulation, la pose en jeu et l'editeur.
 */

export interface WallPoint {
  x: number;
  z: number;
}

export interface WallSegment {
  ax: number;
  az: number;
  bx: number;
  bz: number;
}

export interface WallBox {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export function wallLength(s: WallSegment): number {
  return Math.hypot(s.bx - s.ax, s.bz - s.az);
}

/** Decoupage interne d'une ligne : n = max(1, floor(L / nominal)) segments
 *  egaux, donc chacun au moins `nominal` (sauf une ligne plus courte, un seul
 *  segment) et moins de 2 x `nominal`. Ordre : de A vers B. */
export function segmentWallLine(line: WallSegment, nominal: number): WallSegment[] {
  const length = wallLength(line);
  const n = Math.max(1, Math.floor(length / nominal + 1e-9));
  const out: WallSegment[] = [];
  for (let i = 0; i < n; i++) {
    const t0 = i / n;
    const t1 = (i + 1) / n;
    out.push({
      ax: line.ax + (line.bx - line.ax) * t0,
      az: line.az + (line.bz - line.az) * t0,
      // Derniere extremite exactement B (pas d'erreur d'arrondi a la jonction).
      bx: i === n - 1 ? line.bx : line.ax + (line.bx - line.ax) * t1,
      bz: i === n - 1 ? line.bz : line.az + (line.bz - line.az) * t1,
    });
  }
  return out;
}

/** Emprise d'un segment : capsule de demi-epaisseur `halfWidth`
 *  (ObstacleDef.line) ; x/z/tilesX/tilesZ = sa boite englobante. Ne bloque
 *  pas les tirs (les fleches passent par-dessus une palissade). */
export function wallSegmentObstacle(s: WallSegment, halfWidth: number): ObstacleDef {
  const minX = Math.min(s.ax, s.bx) - halfWidth;
  const maxX = Math.max(s.ax, s.bx) + halfWidth;
  const minZ = Math.min(s.az, s.bz) - halfWidth;
  const maxZ = Math.max(s.az, s.bz) + halfWidth;
  return {
    kind: 'building',
    x: (minX + maxX) / 2,
    z: (minZ + maxZ) / 2,
    tilesX: maxX - minX,
    tilesZ: maxZ - minZ,
    blocksShots: false,
    line: { ax: s.ax, az: s.az, bx: s.bx, bz: s.bz, halfWidth },
  };
}

/** Point du segment le plus proche de (px, pz), et son parametre t (0 en A,
 *  1 en B). */
export function closestOnSegment(px: number, pz: number, s: WallSegment): { x: number; z: number; t: number } {
  const dx = s.bx - s.ax;
  const dz = s.bz - s.az;
  const len2 = dx * dx + dz * dz;
  const t = len2 < 1e-12 ? 0 : Math.max(0, Math.min(1, ((px - s.ax) * dx + (pz - s.az) * dz) / len2));
  return { x: s.ax + dx * t, z: s.az + dz * t, t };
}

export function distanceToSegment(px: number, pz: number, s: WallSegment): number {
  const c = closestOnSegment(px, pz, s);
  return Math.hypot(px - c.x, pz - c.z);
}

const cross = (ax: number, az: number, bx: number, bz: number): number => ax * bz - az * bx;

/** Intersection des deux segments : parametres (ta le long de `a`, tb le
 *  long de `b`), ou null s'ils ne se coupent pas (paralleles compris). */
export function segmentIntersection(a: WallSegment, b: WallSegment): { ta: number; tb: number } | null {
  const rx = a.bx - a.ax;
  const rz = a.bz - a.az;
  const sx = b.bx - b.ax;
  const sz = b.bz - b.az;
  const denom = cross(rx, rz, sx, sz);
  if (Math.abs(denom) < 1e-12) return null;
  const qx = b.ax - a.ax;
  const qz = b.az - a.az;
  const ta = cross(qx, qz, sx, sz) / denom;
  const tb = cross(qx, qz, rx, rz) / denom;
  if (ta < -1e-9 || ta > 1 + 1e-9 || tb < -1e-9 || tb > 1 + 1e-9) return null;
  return { ta, tb };
}

/** Distance minimale entre deux segments (0 s'ils se coupent). */
export function segmentDistance(a: WallSegment, b: WallSegment): number {
  if (segmentIntersection(a, b)) return 0;
  return Math.min(distanceToSegment(a.ax, a.az, b), distanceToSegment(a.bx, a.bz, b), distanceToSegment(b.ax, b.az, a), distanceToSegment(b.bx, b.bz, a));
}

/** Parametre d'entree du segment dans le rectangle (methode des tranches),
 *  ou null. */
function segmentEntersBox(s: WallSegment, b: WallBox): number | null {
  let tMin = 0;
  let tMax = 1;
  const d = [s.bx - s.ax, s.bz - s.az] as const;
  const o = [s.ax, s.az] as const;
  const lo = [b.minX, b.minZ] as const;
  const hi = [b.maxX, b.maxZ] as const;
  for (let k = 0; k < 2; k++) {
    if (Math.abs(d[k]!) < 1e-12) {
      if (o[k]! < lo[k]! || o[k]! > hi[k]!) return null;
      continue;
    }
    let t1 = (lo[k]! - o[k]!) / d[k]!;
    let t2 = (hi[k]! - o[k]!) / d[k]!;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
    if (tMin > tMax) return null;
  }
  return tMin;
}

/** Distance minimale entre un segment et un rectangle (0 s'ils se
 *  touchent) : atteinte a une extremite du segment ou a un coin du
 *  rectangle (formes convexes du plan). */
export function segmentBoxDistance(s: WallSegment, b: WallBox): number {
  if (segmentEntersBox(s, b) !== null) return 0;
  const pointBox = (x: number, z: number): number => Math.hypot(Math.max(b.minX - x, 0, x - b.maxX), Math.max(b.minZ - z, 0, z - b.maxZ));
  return Math.min(
    pointBox(s.ax, s.az),
    pointBox(s.bx, s.bz),
    distanceToSegment(b.minX, b.minZ, s),
    distanceToSegment(b.minX, b.maxZ, s),
    distanceToSegment(b.maxX, b.minZ, s),
    distanceToSegment(b.maxX, b.maxZ, s),
  );
}

/** Le segment (corps de rayon `radius`, 0 = ligne) touche-t-il la capsule ?
 *  Renvoie le parametre (le long du segment) du point le plus proche de la
 *  capsule, ou null. Sert a la ligne degagee (sim/geometry.ts). */
export function segmentHitsCapsule(path: WallSegment, capsule: WallSegment, halfWidth: number): number | null {
  const hit = segmentIntersection(path, capsule);
  if (hit) return hit.ta;
  if (segmentDistance(path, capsule) >= halfWidth) return null;
  // Point du trajet le plus proche de la capsule (approximation suffisante :
  // seule la presence du contact compte pour les appelants).
  const candidates = [0, 1, closestOnSegment(capsule.ax, capsule.az, path).t, closestOnSegment(capsule.bx, capsule.bz, path).t];
  let best = 0;
  let bestD = Infinity;
  for (const t of candidates) {
    const d = distanceToSegment(path.ax + (path.bx - path.ax) * t, path.az + (path.bz - path.az) * t, capsule);
    if (d < bestD) {
      bestD = d;
      best = t;
    }
  }
  return best;
}

/** Cases (x, z entiers, coin bas-gauche) couvertes par le segment : sa
 *  ligne centrale et, avec `halfWidth`, toute son epaisseur (rectangle,
 *  sans les bouts arrondis), extremites exclues d'un epsilon : une extremite
 *  posee pile sur un bord de case ne deborde pas sur la case voisine, et un
 *  segment detruit libere bien sa portion (breche). Echantillonnage fin et
 *  deterministe : deux cases consecutives se touchent par une arete ou un
 *  coin, et un A* sans coupe de coin (sim/pathfinding.ts) ne traverse donc
 *  jamais la ligne. L'epaisseur evite un couloir A* d'une case que le mur
 *  rogne (plus etroit qu'une unite). */
export function wallLineCells(s: WallSegment, halfWidth = 0): { x: number; z: number }[] {
  const length = wallLength(s);
  const eps = Math.min(0.01, length / 4);
  const steps = Math.max(1, Math.ceil(length / 0.05));
  const nx = length < 1e-9 ? 0 : -(s.bz - s.az) / length;
  const nz = length < 1e-9 ? 0 : (s.bx - s.ax) / length;
  const offsets = halfWidth > 0 ? [0, -halfWidth, halfWidth] : [0];
  const seen = new Set<string>();
  const cells: { x: number; z: number }[] = [];
  for (let i = 0; i <= steps; i++) {
    const d = eps + ((length - 2 * eps) * i) / steps;
    const t = length < 1e-9 ? 0 : d / length;
    for (const o of offsets) {
      const x = Math.floor(s.ax + (s.bx - s.ax) * t + nx * o);
      const z = Math.floor(s.az + (s.bz - s.az) * t + nz * o);
      const key = `${x},${z}`;
      if (seen.has(key)) continue;
      seen.add(key);
      cells.push({ x, z });
    }
  }
  return cells;
}

/** Jonction : point aimante sur un mur existant. `end` = extremite d'un
 *  segment existant ; `side` = point sur son flanc (jonction en T). */
export interface WallSnap {
  x: number;
  z: number;
  kind: 'end' | 'side';
}

/** Aimante (x, z) au mur existant le plus proche : une extremite a moins de
 *  `radius` d'abord, sinon le point le plus proche d'un flanc. Null si aucun
 *  mur n'est assez pres. */
export function snapWallPoint(x: number, z: number, walls: readonly WallSegment[], radius: number): WallSnap | null {
  let best: WallSnap | null = null;
  let bestD = radius;
  for (const w of walls) {
    for (const [px, pz] of [[w.ax, w.az], [w.bx, w.bz]] as const) {
      const d = Math.hypot(px - x, pz - z);
      if (d <= bestD) {
        bestD = d;
        best = { x: px, z: pz, kind: 'end' };
      }
    }
  }
  if (best) return best;
  bestD = radius;
  for (const w of walls) {
    const c = closestOnSegment(x, z, w);
    const d = Math.hypot(c.x - x, c.z - z);
    if (d <= bestD) {
      bestD = d;
      best = { x: c.x, z: c.z, kind: 'side' };
    }
  }
  return best;
}

/** Raison d'un refus de pose (aperçu, indication). */
export type WallPlacementIssue = 'too-short' | 'too-long' | 'out-of-map' | 'water' | 'cliff' | 'obstacle' | 'building' | 'unit' | 'crossing' | 'overlap';

/** Ce que la verification d'une ligne lit du monde (simulation, pose en jeu
 *  ou editeur : chacun fournit le sien). */
export interface WallPlacementContext {
  /** Case existante de la carte (ni hors carte, ni trou). */
  isCell(x: number, z: number): boolean;
  isWater(x: number, z: number): boolean;
  /** Vrai si le trajet A -> B franchit une falaise du relief. */
  crossesCliff(s: WallSegment): boolean;
  /** Decors bloquants (cases d'arbre, gros rochers, structures bloquantes). */
  obstacles: readonly WallBox[];
  /** Emprises des batiments et chantiers (Baliste comprise). */
  buildings: readonly WallBox[];
  /** Segments de mur deja poses (jonctions, croisements). */
  walls: readonly WallSegment[];
  /** Corps des unites vivantes. */
  bodies: readonly { x: number; z: number; r: number }[];
}

export interface WallPlacementRules {
  halfWidth: number;
  minLength: number;
  maxLength: number;
  /** Ecart minimal entre la capsule et l'emprise d'un batiment. */
  buildingClearance: number;
}

/** Longueur ecartee des verifications de proximite a une extremite qui
 *  forme une JONCTION (posee sur un mur existant) : la ligne y touche le mur
 *  par construction ; au-dela, elle doit s'en ecarter (angle d'environ 18°
 *  au moins avec une palissade de 0,3). */
const JUNCTION_CLEARANCE = 1;

/** Verifie une ligne A -> B (deja aimantee) : premiere raison de refus, ou
 *  null si elle se pose. `snappedA`/`snappedB` : extremite posee sur un mur
 *  existant (jonction autorisee). Tout ou rien. */
export function checkWallLine(line: WallSegment, snappedA: boolean, snappedB: boolean, rules: WallPlacementRules, ctx: WallPlacementContext): WallPlacementIssue | null {
  const length = wallLength(line);
  if (length < rules.minLength) return 'too-short';
  if (length > rules.maxLength + 1e-9) return 'too-long';
  const hw = rules.halfWidth;
  // Echantillons le long de la ligne (et de part et d'autre de l'epaisseur).
  const steps = Math.max(1, Math.ceil(length / 0.2));
  const nx = -(line.bz - line.az) / length;
  const nz = (line.bx - line.ax) / length;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const cx = line.ax + (line.bx - line.ax) * t;
    const cz = line.az + (line.bz - line.az) * t;
    for (const side of [0, -1, 1]) {
      const x = cx + nx * hw * side;
      const z = cz + nz * hw * side;
      if (!ctx.isCell(x, z)) return 'out-of-map';
      if (ctx.isWater(x, z)) return 'water';
    }
  }
  if (ctx.crossesCliff(line)) return 'cliff';
  for (const b of ctx.obstacles) if (segmentBoxDistance(line, b) < hw) return 'obstacle';
  for (const b of ctx.buildings) if (segmentBoxDistance(line, b) < hw + rules.buildingClearance) return 'building';
  for (const u of ctx.bodies) if (distanceToSegment(u.x, u.z, line) < u.r + hw) return 'unit';
  // Murs existants : croisement franc refuse ; jonction aux extremites
  // aimantees seulement ; ailleurs, la ligne doit rester a l'ecart.
  const trimA = snappedA ? Math.min(JUNCTION_CLEARANCE, length / 2) : 0;
  const trimB = snappedB ? Math.min(JUNCTION_CLEARANCE, length / 2) : 0;
  const ux = (line.bx - line.ax) / length;
  const uz = (line.bz - line.az) / length;
  const inner: WallSegment = { ax: line.ax + ux * trimA, az: line.az + uz * trimA, bx: line.bx - ux * trimB, bz: line.bz - uz * trimB };
  const innerLength = length - trimA - trimB;
  for (const w of ctx.walls) {
    const hit = segmentIntersection(line, w);
    if (hit && hit.ta > 1e-6 && hit.ta < 1 - 1e-6) return 'crossing';
    if (hit && ((hit.ta <= 1e-6 && !snappedA) || (hit.ta >= 1 - 1e-6 && !snappedB))) return 'crossing';
    if (innerLength > 1e-6 && segmentDistance(inner, w) < 2 * hw) return 'overlap';
  }
  return null;
}

/** Rayon d'aimantation (cases) d'une extremite sur un mur existant. */
export const WALL_SNAP_RADIUS = 0.6;

/** Ligne proposee de A au curseur B, aimantee, mesuree et verifiee : ce que
 *  l'apercu montre est exactement ce que le second clic pose (jeu et
 *  editeur). */
export interface WallLinePlan {
  line: WallSegment;
  length: number;
  snappedA: WallSnap | null;
  snappedB: WallSnap | null;
  issue: WallPlacementIssue | null;
}

export function planWallLine(a: WallPoint, b: WallPoint, rules: WallPlacementRules, ctx: WallPlacementContext): WallLinePlan {
  const snappedA = snapWallPoint(a.x, a.z, ctx.walls, WALL_SNAP_RADIUS);
  const snappedB = snapWallPoint(b.x, b.z, ctx.walls, WALL_SNAP_RADIUS);
  const line: WallSegment = { ax: snappedA?.x ?? a.x, az: snappedA?.z ?? a.z, bx: snappedB?.x ?? b.x, bz: snappedB?.z ?? b.z };
  return { line, length: wallLength(line), snappedA, snappedB, issue: checkWallLine(line, snappedA !== null, snappedB !== null, rules, ctx) };
}

/** Segment le plus proche de (x, z) a moins de `maxDistance` de sa ligne
 *  (pose d'une porte, selection), ou -1. */
export function wallSegmentAt(x: number, z: number, segments: readonly WallSegment[], maxDistance: number): number {
  let best = -1;
  let bestD = maxDistance;
  segments.forEach((s, i) => {
    const d = distanceToSegment(x, z, s);
    if (d <= bestD) {
      bestD = d;
      best = i;
    }
  });
  return best;
}

/** Libelle court d'un refus de pose (apercu). */
export const WALL_ISSUE_LABELS: Readonly<Record<WallPlacementIssue, string>> = {
  'too-short': 'trop court',
  'too-long': 'trop long',
  'out-of-map': 'hors de la carte',
  water: 'sur l’eau',
  cliff: 'franchit une falaise',
  obstacle: 'traverse un arbre ou un obstacle',
  building: 'trop près d’un bâtiment',
  unit: 'une unité est sur le tracé',
  crossing: 'croise un mur existant',
  overlap: 'chevauche un mur existant',
};
