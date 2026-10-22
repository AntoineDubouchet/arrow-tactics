/**
 * Limite du point vise par la camera : il ne peut pas s'eloigner de plus de
 * `maxDistance` de la case de terrain existante la plus proche. Fonctionne
 * pour toute forme de carte (trous, contours irreguliers, agrandissements),
 * contrairement a un rectangle largeur × hauteur.
 *
 * Fonction pure, sans Three.js : les cases sont des carres d'une unite,
 * repérés par leur coin (convention de `MapDef.cells`).
 */
export interface CellCorner {
  x: number;
  z: number;
}

/**
 * Renvoie le point (x, z) s'il est a moins de `maxDistance` d'une case, sinon
 * le point le plus proche situe exactement a `maxDistance` de la case la plus
 * proche : la camera glisse le long de cette limite au lieu de s'y bloquer.
 * Sans case, le point est renvoye tel quel.
 */
export function clampToCellsDistance(cells: readonly CellCorner[], x: number, z: number, maxDistance: number): { x: number; z: number } {
  let bestSq = Infinity;
  let nearestX = x;
  let nearestZ = z;
  for (const cell of cells) {
    const px = Math.min(Math.max(x, cell.x), cell.x + 1);
    const pz = Math.min(Math.max(z, cell.z), cell.z + 1);
    const dSq = (x - px) ** 2 + (z - pz) ** 2;
    if (dSq < bestSq) {
      bestSq = dSq;
      nearestX = px;
      nearestZ = pz;
    }
  }
  const distance = Math.sqrt(bestSq);
  if (!Number.isFinite(distance) || distance <= maxDistance) return { x, z };
  const k = maxDistance / distance;
  return { x: nearestX + (x - nearestX) * k, z: nearestZ + (z - nearestZ) * k };
}
