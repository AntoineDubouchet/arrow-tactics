import type { MapCampDef } from '../config/mapDef';
import { getCampKind } from '../data/camps';
import type { CampSpec } from '../sim/systems/camps';

/** Parametres resolus d'un camp de la carte (2026-11-02) : emplacement
 *  (MapDef.camps) + type de camp (data/camps.ts) -> World.addCamp. Un garde
 *  sans poste prevu garde le centre. */
export function campSpecOf(def: MapCampDef): CampSpec {
  const kind = getCampKind(def.kind);
  return {
    kind: kind.id,
    x: def.x,
    z: def.z,
    detectRadius: kind.detectRadius,
    leashRadius: kind.leashRadius,
    regenPerSecond: kind.regenPerSecond,
    clearGold: kind.clearGold,
    guards: kind.guards.map((unitId, i) => ({ unitId, x: def.guardPosts[i]?.x ?? def.x, z: def.guardPosts[i]?.z ?? def.z })),
    chest: { x: def.chest.x, z: def.chest.z, rotationY: def.chest.rotationY, lootTableId: kind.chestLootTable },
  };
}
