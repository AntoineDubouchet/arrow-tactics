/**
 * Rectangle oriente (2026-11-06, G48) : geometrie de l'empreinte CONTINUE d'un
 * batiment pose librement (x, z flottants, rotation quelconque). Pur, sans
 * dependance : partage par la validation de pose (run/buildingPlacement.ts),
 * la collision, la ligne de vue et la rasterisation de la grille (sim/).
 *
 * Convention : `rotationY` est celle de Three.js autour de l'axe vertical, pour
 * que l'empreinte suive exactement le modele. Un point local (lx, lz) est en
 * monde (x + lx cos + lz sin, z - lx sin + lz cos).
 */
export interface OrientedBox {
  x: number;
  z: number;
  /** Demi-largeur (axe X local), demi-profondeur (axe Z local). */
  halfW: number;
  halfD: number;
  cos: number;
  sin: number;
}

/** Empreinte d'un batiment pose : rectangle reel + marge de rasterisation sur
 *  la grille de navigation (BuildingFootprint.navigationPadding). */
export interface ContinuousFootprint extends OrientedBox {
  navigationPadding: number;
}

export interface BoxBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/** Rectangle de `width` x `depth` centre en (x, z), tourne de `rotationY`. Un
 *  quart de tour est exact : pas de bruit d'arrondi sur des bornes entieres. */
export function makeOrientedBox(x: number, z: number, width: number, depth: number, rotationY: number): OrientedBox {
  const snap = (v: number): number => (Math.abs(v) < 1e-9 ? 0 : Math.abs(Math.abs(v) - 1) < 1e-9 ? Math.sign(v) : v);
  return { x, z, halfW: width / 2, halfD: depth / 2, cos: snap(Math.cos(rotationY)), sin: snap(Math.sin(rotationY)) };
}

/** Boite englobante alignee sur les axes, elargie de `pad` de chaque cote local. */
export function orientedBoxBounds(b: OrientedBox, pad = 0): BoxBounds {
  const hw = b.halfW + pad;
  const hd = b.halfD + pad;
  const ex = Math.abs(b.cos) * hw + Math.abs(b.sin) * hd;
  const ez = Math.abs(b.sin) * hw + Math.abs(b.cos) * hd;
  return { minX: b.x - ex, maxX: b.x + ex, minZ: b.z - ez, maxZ: b.z + ez };
}

/** Distance d'un point au rectangle (0 a l'interieur). */
export function distanceToOrientedBox(b: OrientedBox, px: number, pz: number): number {
  const dx = px - b.x;
  const dz = pz - b.z;
  const ax = Math.abs(dx * b.cos - dz * b.sin) - b.halfW;
  const az = Math.abs(dx * b.sin + dz * b.cos) - b.halfD;
  return Math.hypot(Math.max(ax, 0), Math.max(az, 0));
}

/** Vrai si le point est dans le rectangle, bords compris. */
export function orientedBoxContains(b: OrientedBox, px: number, pz: number): boolean {
  const dx = px - b.x;
  const dz = pz - b.z;
  return Math.abs(dx * b.cos - dz * b.sin) <= b.halfW && Math.abs(dx * b.sin + dz * b.cos) <= b.halfD;
}

/** Parametre d'entree dans [0, 1] du segment A -> B dans le rectangle elargi de
 *  `inflate`, ou null s'il ne le touche pas (methode des tranches, en local). */
export function segmentEntersOrientedBox(b: OrientedBox, ax: number, az: number, bx: number, bz: number, inflate = 0): number | null {
  const sx = ax - b.x;
  const sz = az - b.z;
  const ex = bx - b.x;
  const ez = bz - b.z;
  const lax = sx * b.cos - sz * b.sin;
  const laz = sx * b.sin + sz * b.cos;
  const dx = ex * b.cos - ez * b.sin - lax;
  const dz = ex * b.sin + ez * b.cos - laz;
  const hw = b.halfW + inflate;
  const hd = b.halfD + inflate;
  let tMin = 0;
  let tMax = 1;
  if (Math.abs(dx) < 1e-9) {
    if (lax < -hw || lax > hw) return null;
  } else {
    let t1 = (-hw - lax) / dx;
    let t2 = (hw - lax) / dx;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
    if (tMin > tMax) return null;
  }
  if (Math.abs(dz) < 1e-9) {
    if (laz < -hd || laz > hd) return null;
  } else {
    let t1 = (-hd - laz) / dz;
    let t2 = (hd - laz) / dz;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
    if (tMin > tMax) return null;
  }
  return tMin;
}

/** Tolerance des tests de chevauchement : deux bords qui se touchent exactement
 *  ne se chevauchent pas. */
const OVERLAP_EPSILON = 1e-9;

/** Vrai si `a`, elargi de `padding` sur ses axes locaux, chevauche `b`
 *  (theoreme des axes separateurs, quatre axes). */
export function orientedBoxesOverlap(a: OrientedBox, b: OrientedBox, padding = 0): boolean {
  const ahw = a.halfW + padding;
  const ahd = a.halfD + padding;
  const tx = b.x - a.x;
  const tz = b.z - a.z;
  const axes: readonly (readonly [number, number])[] = [[a.cos, -a.sin], [a.sin, a.cos], [b.cos, -b.sin], [b.sin, b.cos]];
  for (const [lx, lz] of axes) {
    const ra = ahw * Math.abs(a.cos * lx - a.sin * lz) + ahd * Math.abs(a.sin * lx + a.cos * lz);
    const rb = b.halfW * Math.abs(b.cos * lx - b.sin * lz) + b.halfD * Math.abs(b.sin * lx + b.cos * lz);
    if (Math.abs(tx * lx + tz * lz) >= ra + rb - OVERLAP_EPSILON) return false;
  }
  return true;
}

/** Vrai si `a`, elargi de `padding`, chevauche un rectangle aligne sur les axes. */
export function orientedBoxOverlapsRect(a: OrientedBox, r: BoxBounds, padding = 0): boolean {
  return orientedBoxesOverlap(a, { x: (r.minX + r.maxX) / 2, z: (r.minZ + r.maxZ) / 2, halfW: (r.maxX - r.minX) / 2, halfD: (r.maxZ - r.minZ) / 2, cos: 1, sin: 0 }, padding);
}

/** Position d'un cercle de rayon `r` ressorti du rectangle (poussee radiale vers
 *  le point le plus proche ; centre dedans : par le bord le plus proche), ou
 *  null s'il ne le touche pas. */
export function pushCircleOutOfOrientedBox(b: OrientedBox, px: number, pz: number, r: number): { x: number; z: number } | null {
  const sx = px - b.x;
  const sz = pz - b.z;
  const lx = sx * b.cos - sz * b.sin;
  const lz = sx * b.sin + sz * b.cos;
  const cx = Math.max(-b.halfW, Math.min(b.halfW, lx));
  const cz = Math.max(-b.halfD, Math.min(b.halfD, lz));
  const dx = lx - cx;
  const dz = lz - cz;
  const d = Math.hypot(dx, dz);
  if (d >= r) return null;
  let outX: number;
  let outZ: number;
  if (d < 1e-4) {
    const left = lx + b.halfW;
    const right = b.halfW - lx;
    const down = lz + b.halfD;
    const up = b.halfD - lz;
    const min = Math.min(left, right, down, up);
    outX = min === left ? -b.halfW - r : min === right ? b.halfW + r : lx;
    outZ = min === down ? -b.halfD - r : min === up ? b.halfD + r : lz;
  } else {
    outX = cx + (dx / d) * r;
    outZ = cz + (dz / d) * r;
  }
  return { x: b.x + outX * b.cos + outZ * b.sin, z: b.z - outX * b.sin + outZ * b.cos };
}

/** Le segment dans le repere local du rectangle, et ses bornes locales : permet
 *  de reutiliser un calcul segment / rectangle aligne (core/wallLine.ts). */
export function segmentInBoxFrame(b: OrientedBox, s: { ax: number; az: number; bx: number; bz: number }): { segment: { ax: number; az: number; bx: number; bz: number }; rect: BoxBounds } {
  const local = (x: number, z: number): { x: number; z: number } => {
    const dx = x - b.x;
    const dz = z - b.z;
    return { x: dx * b.cos - dz * b.sin, z: dx * b.sin + dz * b.cos };
  };
  const a = local(s.ax, s.az);
  const c = local(s.bx, s.bz);
  return { segment: { ax: a.x, az: a.z, bx: c.x, bz: c.z }, rect: { minX: -b.halfW, maxX: b.halfW, minZ: -b.halfD, maxZ: b.halfD } };
}
