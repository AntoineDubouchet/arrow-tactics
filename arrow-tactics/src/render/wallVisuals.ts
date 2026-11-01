import * as THREE from 'three';
import type { ObstacleDef } from '../config/constants';
import { getBuilding } from '../data/buildings';
import { surfaceY } from './terrainSurface';

/**
 * Appariement VISUEL des murailles (2026-11-01). Dans les donnees, une case
 * = un segment de mur (core/wallTrace.ts) ; au rendu, deux cases voisines
 * d'une meme ligne (meme axe, meme orientation, meme camp) affichent ensemble
 * le modele droit KayKit a sa longueur native (deux cases) au lieu de deux
 * modeles comprimes. Une case seule garde le modele comprime a une case.
 *
 * Deterministe et independant de l'ordre de pose : chaque ligne est triee le
 * long de son axe, ses suites de cases contigues sont appariees depuis leur
 * debut (0-1, 2-3...). Rendu seul : emprise, PV, selection et destruction
 * restent ceux de chaque case (une paire dont une case tombe est
 * re-dessinee en deux cases seules).
 */
export interface WallPlaced {
  buildingId: string;
  x: number;
  z: number;
  rotationY?: number;
  team?: string;
}

export type WallVisualRole = { role: 'single' } | { role: 'lead'; partner: number } | { role: 'follower'; partner: number };

const quarterOf = (rotationY: number): number => (((Math.round(rotationY / (Math.PI / 2)) % 4) + 4) % 4);

/** Vrai pour une case de mur appariable (segment droit d'une case). */
function isWallCell(b: WallPlaced): boolean {
  const def = getBuilding(b.buildingId);
  return def.placementMode === 'line' && def.footprintTilesX === 1 && def.footprintTilesZ === 1;
}

/** Role visuel de chaque batiment de `placed` (meme ordre). `alive` : faux
 *  pour une case detruite (jamais appariee). */
export function wallVisualRoles(placed: readonly WallPlaced[], alive: (index: number) => boolean = () => true): WallVisualRole[] {
  const roles: WallVisualRole[] = placed.map(() => ({ role: 'single' }));
  const lines = new Map<string, { index: number; along: number }[]>();
  placed.forEach((b, index) => {
    if (!isWallCell(b) || !alive(index)) return;
    const quarter = quarterOf(b.rotationY ?? 0);
    const alongX = quarter % 2 === 0;
    const key = `${b.team ?? ''}|${quarter}|${alongX ? 'z' + Math.floor(b.z) : 'x' + Math.floor(b.x)}`;
    let line = lines.get(key);
    if (!line) lines.set(key, (line = []));
    line.push({ index, along: Math.floor(alongX ? b.x : b.z) });
  });
  for (const line of lines.values()) {
    line.sort((a, b) => a.along - b.along || a.index - b.index);
    let k = 0;
    while (k < line.length) {
      // Suite de cases contigues, appariee depuis son debut.
      let end = k + 1;
      while (end < line.length && line[end]!.along === line[end - 1]!.along + 1) end++;
      for (let p = k; p + 1 < end; p += 2) {
        roles[line[p]!.index] = { role: 'lead', partner: line[p + 1]!.index };
        roles[line[p + 1]!.index] = { role: 'follower', partner: line[p]!.index };
      }
      k = end;
    }
  }
  return roles;
}

/** Definition de RENDU d'une case de mur selon son role : `lead` -> modele
 *  long natif centre sur la paire ; `follower` -> rien (null : la paire est
 *  dessinee par sa case de tete) ; `single` (et tout autre batiment) ->
 *  `obstacle` tel quel. `obstacle` : definition de collision de la case. */
export function wallVisualObstacle(obstacle: ObstacleDef, role: WallVisualRole, partner: WallPlaced | null): ObstacleDef | null {
  if (role.role === 'follower') return null;
  if (role.role === 'single' || !partner) return obstacle;
  const alongX = quarterOf(obstacle.rotationY ?? 0) % 2 === 0;
  const { modelLengthScale: _squash, ...rest } = obstacle;
  return { ...rest, x: ((obstacle.x ?? 0) + partner.x) / 2, z: ((obstacle.z ?? 0) + partner.z) / 2, tilesX: alongX ? 2 : 1, tilesZ: alongX ? 1 : 2, footprintFollowsRotation: true };
}

/** Vue vide d'une case `follower` (sa paire est dessinee par la tete) :
 *  groupe pose au centre de la case, pour les effets (fumee) et la pose. */
export function emptyWallView(obstacle: ObstacleDef): THREE.Group {
  const group = new THREE.Group();
  group.position.set(obstacle.x ?? 0, surfaceY(obstacle.x ?? 0, obstacle.z ?? 0), obstacle.z ?? 0);
  return group;
}
