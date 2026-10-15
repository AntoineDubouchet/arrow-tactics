/**
 * Deplacement d'un groupe d'unites sur la grille (editeur de maps et phase
 * de preparation) : calcul PUR et deterministe, sans hasard, sans rendu ni
 * DOM. L'appelant fournit les regles de validite de son contexte ; la meme
 * fonction sert a l'apercu et au clic, pour que l'apercu montre toujours
 * exactement ce que le clic appliquera.
 *
 * Principe :
 * 1. le centre de la formation actuelle vient se placer au point vise,
 *    arrondi a un decalage d'un nombre entier de cases (la formation est
 *    translatee telle quelle, l'ordre de selection n'a aucune influence) ;
 * 2. chaque unite dont la case souhaitee est valide et libre la garde ;
 * 3. les unites bloquees prennent ensuite la case valide et libre la plus
 *    proche de leur case souhaitee, dans un rayon borne ;
 * 4. une unite sans solution rend tout le plan invalide (tout ou rien).
 */

/** Unite deplacee : `key` est un identifiant stable (id ou index). */
export interface GridMoveMember {
  key: number;
  x: number;
  z: number;
}

export interface GridMoveDestination {
  key: number;
  x: number;
  z: number;
  /** Faux si aucune case valide n'a ete trouvee : (x, z) est alors la case
   *  souhaitee, a montrer comme invalide. */
  placed: boolean;
}

export interface GridGroupMovePlan {
  /** Dans l'ordre des membres fournis. */
  destinations: GridMoveDestination[];
  /** Vrai seulement si chaque membre a une destination. */
  valid: boolean;
  /** Decalage applique a la formation, en cases. */
  deltaX: number;
  deltaZ: number;
}

export interface GridGroupMoveRules {
  /** La case (x, z) est-elle valide pour ce membre, sans compter les
   *  positions ACTUELLES des membres du groupe (ils se deplacent) ? */
  isFree: (key: number, x: number, z: number) => boolean;
  /** Cases occupees par ce membre s'il etait en (x, z). Par defaut, la
   *  seule case (x, z). */
  footprint?: (key: number, x: number, z: number) => { x: number; z: number }[];
  /** Rayon de recherche (en cases) autour de la case souhaitee d'une unite
   *  bloquee. */
  searchRadius: number;
  /** Taille d'une case. */
  tile: number;
}

/** Centre de la case qui contient v (meme convention que le placement :
 *  floor + demi-case). */
export function gridTileCenter(v: number, tile: number): number {
  return Math.floor(v / tile) * tile + tile / 2;
}

/** Decalage, en multiple entier de cases, qui amene le centre de la
 *  formation au plus pres du point vise. Pour une unite seule, c'est la
 *  case sous le point vise. */
export function gridGroupMoveDelta(members: readonly GridMoveMember[], target: { x: number; z: number }, tile: number): { deltaX: number; deltaZ: number } {
  if (members.length === 0) return { deltaX: 0, deltaZ: 0 };
  let cx = 0;
  let cz = 0;
  for (const m of members) {
    cx += m.x;
    cz += m.z;
  }
  cx /= members.length;
  cz /= members.length;
  return { deltaX: Math.round((target.x - cx) / tile) * tile, deltaZ: Math.round((target.z - cz) / tile) * tile };
}

/** Offsets de recherche autour d'une case, du plus proche au plus loin
 *  (distance, puis z, puis x) : ordre fixe, independant des unites. */
function searchOffsets(radius: number): { dx: number; dz: number }[] {
  const out: { dx: number; dz: number }[] = [];
  for (let dz = -radius; dz <= radius; dz++) {
    for (let dx = -radius; dx <= radius; dx++) {
      if (dx !== 0 || dz !== 0) out.push({ dx, dz });
    }
  }
  return out.sort((a, b) => a.dx * a.dx + a.dz * a.dz - (b.dx * b.dx + b.dz * b.dz) || a.dz - b.dz || a.dx - b.dx);
}

export function planGridGroupMove(
  members: readonly GridMoveMember[],
  target: { x: number; z: number },
  rules: GridGroupMoveRules,
): GridGroupMovePlan {
  const { tile } = rules;
  const { deltaX, deltaZ } = gridGroupMoveDelta(members, target, tile);
  const footprint = rules.footprint ?? ((_key: number, x: number, z: number) => [{ x, z }]);
  const cellKey = (x: number, z: number) => `${Math.floor(x / tile)},${Math.floor(z / tile)}`;

  const desired = members.map((m) => ({
    key: m.key,
    x: gridTileCenter(m.x + deltaX, tile),
    z: gridTileCenter(m.z + deltaZ, tile),
  }));
  // Ordre de traitement stable et independant de l'ordre de selection : du
  // centre de la formation vers l'exterieur, puis z, x et cle.
  const tx = target.x;
  const tz = target.z;
  const order = desired
    .map((d, i) => ({ d, i }))
    .sort((a, b) => {
      const da = (a.d.x - tx) ** 2 + (a.d.z - tz) ** 2;
      const db = (b.d.x - tx) ** 2 + (b.d.z - tz) ** 2;
      return da - db || a.d.z - b.d.z || a.d.x - b.d.x || a.d.key - b.d.key;
    });

  const reserved = new Set<string>();
  const fits = (key: number, x: number, z: number) =>
    rules.isFree(key, x, z) && footprint(key, x, z).every((c) => !reserved.has(cellKey(c.x, c.z)));
  const reserve = (key: number, x: number, z: number) => {
    for (const c of footprint(key, x, z)) reserved.add(cellKey(c.x, c.z));
  };

  const result: GridMoveDestination[] = desired.map((d) => ({ ...d, placed: false }));

  // 1. Les cases souhaitees libres sont gardees (la formation d'abord).
  for (const { d, i } of order) {
    if (!fits(d.key, d.x, d.z)) continue;
    reserve(d.key, d.x, d.z);
    result[i]!.placed = true;
  }
  // 2. Les unites bloquees prennent la case libre la plus proche.
  const offsets = searchOffsets(rules.searchRadius);
  for (const { d, i } of order) {
    if (result[i]!.placed) continue;
    for (const o of offsets) {
      const x = d.x + o.dx * tile;
      const z = d.z + o.dz * tile;
      if (!fits(d.key, x, z)) continue;
      reserve(d.key, x, z);
      result[i] = { key: d.key, x, z, placed: true };
      break;
    }
  }

  return { destinations: result, valid: result.length > 0 && result.every((r) => r.placed), deltaX, deltaZ };
}

/** Le plan ne deplace aucune unite (chaque destination est sa position
 *  actuelle). */
export function isNoopGridMove(members: readonly GridMoveMember[], plan: GridGroupMovePlan): boolean {
  return plan.destinations.every((d, i) => d.x === members[i]!.x && d.z === members[i]!.z);
}
