/**
 * La simulation vit dans un plan 2D (x, z). La hauteur y est purement decorative
 * et n'appartient qu'au rendu : aucune unite ne vole, aucun terrain n'a de relief.
 */

export function dist(ax: number, az: number, bx: number, bz: number): number {
  return Math.hypot(bx - ax, bz - az);
}

export function distSq(ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax;
  const dz = bz - az;
  return dx * dx + dz * dz;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

export function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}
