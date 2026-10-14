import { isCollidableObstacle, obstacleBounds, type ObstacleDef } from '../../config/constants';
import { forwardDir, type Entity, type Team } from '../entity';

/**
 * Production automatique d'unites par un batiment "spawner" (Caserne — voir
 * data/buildings.ts, BuildingDef.spawner) — 2026-08-17, demande explicite
 * d'Antoine. Systeme SIM PUR : decide QUAND et OU une unite doit apparaitre,
 * jamais QUELLES STATS elle recoit (talents/ameliorations permanentes — sim/
 * ne connait pas MetaProgress, voir CLAUDE.md). L'appelant (main.ts) consomme
 * World.barracksSpawnEvents chaque tick et appelle le VRAI World.spawn avec
 * les stats effectives, exactement comme pour CombatEvent/AbilityEvent.
 */
export interface BarracksSpawnEvent {
  /** Id du batiment producteur — sans usage direct aujourd'hui, retenu pour
   *  un futur retour visuel (ex. petit effet sur la Caserne au moment de la
   *  production). */
  entityId: number;
  /** Unite a produire (voir SpawnerBuildingConfig.unitId) — jamais hardcode
   *  "fantassin" ici, voir data/buildings.ts. */
  unitId: string;
  team: Team;
  x: number;
  z: number;
}

/**
 * Decompte le timer de chaque batiment producteur vivant ; a 0, tente de
 * trouver `e.spawnCount` cases libres AUTOUR de son footprint et pousse UN
 * evenement de spawn PAR case trouvee (2026-08-17, refonte demandee par
 * Antoine : "toutes les 3 amélioration réduit le délai... l'amélioration
 * augmente le nombre de fantassin invoqué"). Production ATOMIQUE : si MOINS
 * de `spawnCount` cases sont libres, RIEN n'est spawne ce tick (jamais un
 * lot partiel) — meme philosophie "file d'attente jamais perdue" que
 * l'ancien comportement a 1 seule unite : le timer reste a 0 (JAMAIS remis a
 * l'intervalle complet) tant que la production complete n'a pas pu avoir
 * lieu, retente au tick suivant. Le timer n'est reinitialise qu'au moment
 * d'une production REELLEMENT reussie (le lot ENTIER).
 */
export function barracksSystem(entities: Entity[], obstacles: ObstacleDef[], dt: number): BarracksSpawnEvent[] {
  const events: BarracksSpawnEvent[] = [];

  for (const e of entities) {
    if (!e.alive || e.spawnTimer === null || e.spawnUnitId === null) continue;

    e.spawnTimer = Math.max(0, e.spawnTimer - dt);
    if (e.spawnTimer > 0) continue;

    const count = e.spawnCount ?? 1;
    const cells = findFreeAdjacentCells(e, entities, obstacles, count);
    if (cells.length < count) continue;

    for (const cell of cells) events.push({ entityId: e.id, unitId: e.spawnUnitId, team: e.team, x: cell.x, z: cell.z });
    e.spawnTimer = e.spawnIntervalSeconds ?? 0;
  }

  return events;
}

/**
 * Anneau de cases entourant le footprint du batiment (footprint agrandi
 * d'une case dans chaque direction, footprint lui-meme exclu) — genere pour
 * N'IMPORTE QUELLE taille de footprint, pas seulement 2x2. Filtre : aucun
 * obstacle COLLIDABLE dessus (rocher, arbre, un AUTRE batiment, ou une case
 * "vide" synthetique hors de la map — voir World.setMap, computeVoidObstacles,
 * qui couvre deja implicitement le cas "hors des limites du plateau") ni
 * aucune entite VIVANTE deja positionnee sur cette case. Ordre DETERMINISTE
 * (jamais aleatoire, demande explicite) : priorite aux cases les plus
 * "avancees" dans la direction d'attaque de l'equipe du batiment (vers le
 * champ de bataille), puis x croissant, puis z croissant en tie-break.
 *
 * Renvoie JUSQU'A `count` cases DISTINCTES (2026-08-17, production en LOT —
 * plusieurs Fantassins a la fois, voir data/barracksUpgrade.ts) — moins de
 * `count` si l'anneau n'a pas assez de place libre, jamais plus. L'appelant
 * (barracksSystem) decide si un lot INCOMPLET doit quand meme etre spawne ou
 * non (actuellement : non, tout ou rien).
 */
function findFreeAdjacentCells(building: Entity, entities: Entity[], obstacles: ObstacleDef[], count: number): { x: number; z: number }[] {
  const footprint = building.footprintObstacle;
  if (!footprint) return [];
  const bounds = obstacleBounds(footprint);

  const minTileX = Math.floor(bounds.minX) - 1;
  const maxTileX = Math.ceil(bounds.maxX);
  const minTileZ = Math.floor(bounds.minZ) - 1;
  const maxTileZ = Math.ceil(bounds.maxZ);

  const candidates: { x: number; z: number }[] = [];
  for (let tz = minTileZ; tz <= maxTileZ; tz++) {
    for (let tx = minTileX; tx <= maxTileX; tx++) {
      const cx = tx + 0.5;
      const cz = tz + 0.5;
      // Exclut les cases a l'INTERIEUR du footprint lui-meme (ne fait
      // qu'agrandir l'anneau autour, jamais retester le batiment lui-meme).
      if (cx > bounds.minX && cx < bounds.maxX && cz > bounds.minZ && cz < bounds.maxZ) continue;
      candidates.push({ x: cx, z: cz });
    }
  }

  const dir = forwardDir(building.team);
  candidates.sort((a, b) => {
    const scoreA = a.z * dir;
    const scoreB = b.z * dir;
    if (scoreA !== scoreB) return scoreB - scoreA; // plus "avance" vers le champ de bataille d'abord
    if (a.x !== b.x) return a.x - b.x;
    return a.z - b.z;
  });

  const chosen: { x: number; z: number }[] = [];
  for (const c of candidates) {
    if (chosen.length >= count) break;
    if (isCellFree(c.x, c.z, entities, obstacles)) chosen.push(c);
  }
  return chosen;
}

function isCellFree(cx: number, cz: number, entities: Entity[], obstacles: ObstacleDef[]): boolean {
  for (const o of obstacles) {
    if (!isCollidableObstacle(o)) continue;
    const b = obstacleBounds(o);
    if (cx > b.minX && cx < b.maxX && cz > b.minZ && cz < b.maxZ) return false;
  }
  for (const e of entities) {
    if (!e.alive) continue;
    const tileX = Math.floor(e.x) + 0.5;
    const tileZ = Math.floor(e.z) + 0.5;
    if (Math.abs(tileX - cx) < 1e-6 && Math.abs(tileZ - cz) < 1e-6) return false;
  }
  return true;
}
