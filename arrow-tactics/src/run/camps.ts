import type { MapCampDef } from '../config/mapDef';
import { campLayoutOf } from '../data/campLayout';
import { getCampKind } from '../data/camps';
import { resolveUnitLevel } from '../data/unitLevels';
import type { CampSpec } from '../sim/systems/camps';

/** Parametres resolus d'un camp de la carte (2026-11-02) : objet semantique
 *  (MapDef.camps) + type de camp (data/camps.ts) + coffre et postes derives
 *  (data/campLayout.ts) -> World.addCamp. Un garde sans poste prevu garde le
 *  centre. Niveau de chaque garde : son override, sinon celui du camp, sinon
 *  1 (data/unitLevels.ts) : le niveau authored circule jusqu'aux unites. */
export function campSpecOf(def: MapCampDef): CampSpec {
  const kind = getCampKind(def.kind);
  const layout = campLayoutOf(def);
  return {
    kind: kind.id,
    x: def.x,
    z: def.z,
    detectRadius: kind.detectRadius,
    leashRadius: kind.leashRadius,
    regenPerSecond: kind.regenPerSecond,
    clearGold: kind.clearGold,
    guards: kind.guards.map((unitId, i) => ({
      unitId,
      x: layout.guardPosts[i]?.x ?? def.x,
      z: layout.guardPosts[i]?.z ?? def.z,
      level: resolveUnitLevel(def.guardOverrides?.[i]?.level, def.level),
    })),
    chest: { x: layout.chest.x, z: layout.chest.z, rotationY: layout.chest.rotationY, lootTableId: kind.chestLootTable },
  };
}
