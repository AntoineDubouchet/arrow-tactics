import { obstacleBounds, type ObstacleBounds, type ObstacleDef } from '../config/constants';

/**
 * Bornes de TOUS les obstacles d'une liste, mises en cache par REFERENCE de
 * tableau (2026-08-10, correctif de performance : "FPS chuté" remonte par
 * Antoine a la vague 6, ~50-100+ unites). Les obstacles d'une map sont
 * statiques pour toute la duree d'une bataille (World.obstacles n'est
 * reassigne que par setMap, entre deux batailles) — calculer ces bornes une
 * fois par reference de tableau plutot qu'a chaque appel de
 * findBlockingObstacle/resolveObstacleCollisions/findSteeringPoint (qui
 * tournent par ENTITE, par SOUS-PASSE, 30 fois par seconde) elimine une
 * source massive d'allocations d'objets ephemeres : avec ~100 unites, 5
 * sous-passes (COLLISION_ITERATIONS) et ~100 obstacles (carte
 * "vague1-20"), l'ancien code allouait potentiellement plusieurs MILLIONS
 * de petits objets par seconde rien que pour ce calcul — largement assez de
 * pression sur le ramasse-miettes pour provoquer des a-coups de FPS
 * perceptibles, independamment du cout de calcul brut (trivial). Un
 * WeakMap ne retient pas ses cles : une ancienne reference de tableau
 * (ex. une carte de test de l'editeur, remplacee a chaque essai) est
 * automatiquement liberee des qu'elle n'est plus utilisee ailleurs, aucune
 * fuite memoire possible.
 */
const boundsCache = new WeakMap<ObstacleDef[], ObstacleBounds[]>();

/** Listes filtrees par camp, mises en cache par reference de tableau (meme
 *  principe que boundsCache) : la liste reste stable tant que World.obstacles
 *  ne change pas, et ses bornes restent donc en cache elles aussi. */
const teamObstaclesCache = new WeakMap<ObstacleDef[], Map<string, ObstacleDef[]>>();

function cachedTeamList(obstacles: ObstacleDef[], key: string, isPassage: (o: ObstacleDef) => boolean): ObstacleDef[] {
  let byKey = teamObstaclesCache.get(obstacles);
  if (!byKey) {
    byKey = new Map();
    teamObstaclesCache.set(obstacles, byKey);
  }
  let list = byKey.get(key);
  if (!list) {
    list = obstacles.some(isPassage) ? obstacles.filter((o) => !isPassage(o)) : obstacles;
    byKey.set(key, list);
  }
  return list;
}

/** Obstacles dont les TRAJETS d'une unite du camp `team` doivent tenir
 *  compte (A*, ligne droite, contournement) : tous, sauf les portes de ce
 *  camp (`passableForTeam === team`), comptees comme un passage meme
 *  fermees — l'unite y va, la porte s'ouvre a son approche. Renvoie le
 *  tableau d'origine s'il n'y a rien a retirer. */
export function obstaclesBlockingTeam(obstacles: ObstacleDef[], team: string): ObstacleDef[] {
  return cachedTeamList(obstacles, 'path:' + team, (o) => o.passableForTeam === team);
}

/** Obstacles qui arretent PHYSIQUEMENT une unite du camp `team` (collision,
 *  ruee de Charge) : tous, sauf les portes de ce camp assez ouvertes
 *  (`passageOpen`). Une porte qui s'ouvre ou se ferme remplace
 *  World.obstacles (World.setGatePassage) : le cache reste exact. */
export function obstaclesCollidingTeam(obstacles: ObstacleDef[], team: string): ObstacleDef[] {
  return cachedTeamList(obstacles, 'body:' + team, (o) => o.passableForTeam === team && o.passageOpen === true);
}

export function getObstacleBoundsList(obstacles: ObstacleDef[]): ObstacleBounds[] {
  let cached = boundsCache.get(obstacles);
  if (!cached) {
    cached = obstacles.map(obstacleBounds);
    boundsCache.set(obstacles, cached);
  }
  return cached;
}

/** Marge de tolerance (cases) pour un test de visibilite degagee — retrecit
 *  legerement chaque obstacle pour qu'un rayon qui l'effleure a peine ne soit
 *  pas compte comme bloque. Deplacee ici (2026-08-13, chantier optimisation)
 *  depuis `movementSystem.findSteeringPoint`, qui la definissait localement —
 *  doit vivre a cote de `getShrunkObstacleBoundsList` pour que le cache
 *  ci-dessous reste correct si jamais cette valeur change un jour. */
export const VISIBILITY_MARGIN = 0.05;

const shrunkBoundsCache = new WeakMap<ObstacleDef[], ObstacleBounds[]>();

/**
 * Bornes RETRECIES de VISIBILITY_MARGIN, mises en cache par reference de
 * tableau — meme motif que `getObstacleBoundsList` (2026-08-13, chantier
 * optimisation, suite du correctif du 2026-08-10). `movementSystem.findSteeringPoint`
 * recalculait un objet "shrunk" par PAIRE (coin candidat x obstacle du
 * plateau) a CHAQUE appel — avec ~20 coins candidats et ~100 obstacles sur
 * la carte "vague1-20", ca faisait jusqu'a 2000 objets ephemeres par appel,
 * pour un calcul entierement INDEPENDANT de l'entite/de la cible (seule la
 * geometrie des obstacles compte). Ce calcul ne depend que des obstacles,
 * exactement comme `obstacleBounds` — meme eligibilite au cache.
 */
export function getShrunkObstacleBoundsList(obstacles: ObstacleDef[]): ObstacleBounds[] {
  let cached = shrunkBoundsCache.get(obstacles);
  if (!cached) {
    const raw = getObstacleBoundsList(obstacles);
    cached = raw.map((b) => ({
      minX: b.minX + VISIBILITY_MARGIN,
      maxX: b.maxX - VISIBILITY_MARGIN,
      minZ: b.minZ + VISIBILITY_MARGIN,
      maxZ: b.maxZ - VISIBILITY_MARGIN,
    }));
    shrunkBoundsCache.set(obstacles, cached);
  }
  return cached;
}

/** Intersection segment/rectangle par la methode des tranches (slab method).
 *  Renvoie le t d'entree dans [0, 1] le long du segment (a partir de (ax,az),
 *  direction (dx,dz)), ou null si aucune intersection ne se produit sur sa
 *  longueur reelle. Partage entre combatSystem (ligne de tir) et
 *  movementSystem (contournement pendant la poursuite). */
export function segmentIntersectsBox(
  ax: number,
  az: number,
  dx: number,
  dz: number,
  bounds: ObstacleBounds,
): number | null {
  let tMin = 0;
  let tMax = 1;

  if (Math.abs(dx) < 1e-9) {
    if (ax < bounds.minX || ax > bounds.maxX) return null;
  } else {
    let t1 = (bounds.minX - ax) / dx;
    let t2 = (bounds.maxX - ax) / dx;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
    if (tMin > tMax) return null;
  }

  if (Math.abs(dz) < 1e-9) {
    if (az < bounds.minZ || az > bounds.maxZ) return null;
  } else {
    let t1 = (bounds.minZ - az) / dz;
    let t2 = (bounds.maxZ - az) / dz;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
    if (tMin > tMax) return null;
  }

  return tMin;
}

/**
 * Premier obstacle dont l'emprise (un rectangle exact de tilesX x tilesZ
 * cases, jamais un cercle approximatif) coupe le segment a -> b. Renvoie
 * aussi le point d'entree dans le rectangle (utile pour viser un projectile
 * dessus plutot que sur la cible) et le centre (utile au contournement).
 *
 * Deplace ici depuis sim/systems/combat.ts (2026-08-10, chantier Cavalier
 * leger) : c'est exactement le test de "trajectoire libre" dont la capacite
 * Charge a besoin (voir sim/systems/abilities.ts) — aucune raison d'avoir une
 * deuxieme implementation du meme test de ligne degagee. Tous les appelants
 * (ligne de tir en combat, contournement en mouvement, trajectoire de charge)
 * partagent maintenant cette seule fonction.
 *
 * `ignore` (2026-08-16, correctif "un batiment se bloque lui-meme") : un
 * obstacle a exclure du test, par EGALITE DE REFERENCE — sert a passer
 * `target.footprintObstacle` quand `b` est le CENTRE d'une cible qui a
 * elle-meme un footprint de collision (Mine/Baliste, voir Entity.footprintObstacle) :
 * sans ca, le segment attaquant->cible se termine toujours a l'interieur du
 * propre rectangle de la cible, qui se declare donc "bloquant" pour
 * n'importe quel tir/poursuite qui la vise, empechant tout hit reel. `null`/
 * absent : comportement inchange, aucun obstacle exclu.
 *
 * `forShot` : test d'une LIGNE DE TIR (attaque, capacite) plutot que d'un
 * trajet ; les obstacles `blocksShots === false` (murailles) sont alors
 * transparents. Absent : tout obstacle bloque (deplacement, poursuite).
 */
export function findBlockingObstacle(
  ax: number,
  az: number,
  bx: number,
  bz: number,
  obstacles: ObstacleDef[],
  ignore?: ObstacleDef | null,
  forShot = false,
): { impactX: number; impactZ: number; centerX: number; centerZ: number } | null {
  const dx = bx - ax;
  const dz = bz - az;

  const boundsList = getObstacleBoundsList(obstacles);
  for (let i = 0; i < obstacles.length; i++) {
    if (ignore && obstacles[i] === ignore) continue;
    if (forShot && obstacles[i]!.blocksShots === false) continue;
    const bounds = boundsList[i]!;
    const hit = segmentIntersectsBox(ax, az, dx, dz, bounds);
    if (hit === null) continue;

    return {
      impactX: ax + dx * hit,
      impactZ: az + dz * hit,
      centerX: (bounds.minX + bounds.maxX) / 2,
      centerZ: (bounds.minZ + bounds.maxZ) / 2,
    };
  }

  return null;
}
