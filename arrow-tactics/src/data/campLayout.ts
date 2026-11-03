import type { ObstacleDef } from '../config/constants';
import { CAMP_CLEAR_RADIUS, type MapCampDef, type MapDef } from '../config/mapDef';
import { getCampKind } from './camps';

/**
 * Camp = objet semantique (2026-11-03, demande d'Antoine) : la carte ne
 * decrit qu'un camp par son type, sa position, son niveau et son
 * orientation (MapCampDef). TOUT le reste — coffre, postes de garde, feu,
 * tente, bannieres, caisses, rateliers, barils — est DERIVE ici, par la meme
 * fonction pour le generateur procedural, l'editeur (apercu, selection,
 * deplacement, suppression d'un bloc) et le jeu (expandMapCamps avant
 * World.setMap). Deplacer un camp = changer (x, z) ; rien d'autre a suivre.
 *
 * Repere du camp : `facing` = direction du DOS du camp (radians, atan2(z, x)) ;
 * on arrive par l'avant. Le generateur oriente le dos vers l'exterieur de la
 * carte ; l'editeur, a l'oppose du Depart Survie. Les positions relatives
 * sont celles du generateur du 2026-11-02 (inchangees).
 */
export interface CampLayout {
  /** Rayon degage (cases) : ni arbre, ni eau, ni relief. */
  radius: number;
  chest: { x: number; z: number; rotationY: number };
  /** Postes de garde (monde) ; les N premiers servent, N = gardes du type. */
  guardPosts: { x: number; z: number }[];
  /** Decor du camp (props traversables), possede par le camp. */
  props: ObstacleDef[];
  /** Barils destructibles du camp, possedes par le camp. */
  barrels: { kind: 'barrel'; x: number; z: number }[];
}

/** Orientation par defaut du dos d'un camp en (x, z) : a l'oppose de
 *  `origin` (le Depart Survie ; le generateur : le centre de la carte). */
export function campFacingFrom(x: number, z: number, origin: { x: number; z: number } = { x: 0, z: 0 }): number {
  const dx = x - origin.x;
  const dz = z - origin.z;
  return Math.hypot(dx, dz) < 1e-6 ? 0 : Math.atan2(dz, dx);
}

/** Petit hachage deterministe (aspect du feu), sans RNG. */
function hashXZ(x: number, z: number): number {
  let h = (Math.imul(Math.round(x * 4) | 0, 374761393) ^ Math.imul(Math.round(z * 4) | 0, 668265263)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Coffre, postes, decor et barils d'un camp, en coordonnees monde. */
export function campLayoutOf(def: MapCampDef): CampLayout {
  const kind = getCampKind(def.kind);
  const large = kind.layout === 'large';
  const C = { x: def.x, z: def.z };
  const f = def.facing ?? campFacingFrom(def.x, def.z);
  const b = { x: Math.cos(f), z: Math.sin(f) };
  const p = { x: -b.z, z: b.x };
  const at = (back: number, side: number) => ({ x: C.x + b.x * back + p.x * side, z: C.z + b.z * back + p.z * side });
  const facing = (from: { x: number; z: number }) => Math.atan2(C.x - from.x, C.z - from.z);
  const props: ObstacleDef[] = [];
  const prop = (model: string, pos: { x: number; z: number }, tiles: number, scale: number, rotationY: number) => props.push({ kind: 'prop', tilesX: tiles, tilesZ: tiles, propModel: model, x: pos.x, z: pos.z, scale, rotationY });
  const tent = at(2.5, 0);
  prop('campfire_stones', C, 1, 1, hashXZ(C.x, C.z) * Math.PI * 2);
  prop('tent_detailedOpen', tent, 2, 1.1, facing(tent));
  prop('kaykit_flag_red', at(1.7, -2.3), 1, 1.3, facing(at(1.7, -2.3)));
  prop('kaykit_crate_A_big', at(1.6, 2.3), 1, 0.9, 0.3);
  prop('kaykit_crate_B_small', at(0.8, 2.9), 1, 0.7, 1.1);
  prop('log_stack', at(0.2, -2.7), 1, 0.9, facing(at(0.2, -2.7)) + Math.PI / 2);
  prop('kaykit_weaponrack', at(-0.6, -2.8), 1, 0.9, facing(at(-0.6, -2.8)));
  if (large) {
    // Grand camp : seconde tente et seconde banniere, sur les cotes.
    prop('tent_smallClosed', at(1.2, -3.0), 1, 1.2, facing(at(1.2, -3.0)));
    prop('kaykit_flag_red', at(1.9, 2.9), 1, 1.3, facing(at(1.9, 2.9)));
  }
  const chest = at(1.3, 1.2);
  const guardPosts = [at(-1.5, 0.9), at(-1.5, -0.9), at(0.2, -1.7), at(0.2, 1.8), at(-0.5, 2.6), at(-0.5, -2.6)];
  // Barils (PROVISOIRE : 2 au petit camp, 3 au grand) : sur des cases du
  // camp libres de coffre et de poste de garde.
  const key = (q: { x: number; z: number }) => `${Math.floor(q.x)},${Math.floor(q.z)}`;
  const taken = new Set([chest, ...guardPosts].map(key));
  const barrels: CampLayout['barrels'] = [];
  for (const spot of large ? [at(2.7, 1.7), at(-2.0, 2.2), at(-2.1, -2.0)] : [at(2.7, 1.7), at(-2.0, 2.2)]) {
    if (taken.has(key(spot))) continue;
    taken.add(key(spot));
    barrels.push({ kind: 'barrel', x: spot.x, z: spot.z });
  }
  return { radius: CAMP_CLEAR_RADIUS, chest: { ...chest, rotationY: facing(chest) }, guardPosts, props, barrels };
}

/** Carte prete pour le jeu : le decor et les barils de chaque camp sont
 *  ajoutes aux listes concretes (World.setMap, plateau, destructibles). A
 *  appeler une seule fois, sur une carte qui ne les contient pas encore
 *  (generateur, editeur, fichier). La carte d'origine n'est pas modifiee. */
export function expandMapCamps(map: MapDef): MapDef {
  const camps = map.camps ?? [];
  if (camps.length === 0) return map;
  const obstacles = [...map.obstacles];
  const destructibles = [...(map.destructibles ?? [])];
  for (const camp of camps) {
    const layout = campLayoutOf(camp);
    obstacles.push(...layout.props);
    destructibles.push(...layout.barrels);
  }
  return { ...map, obstacles, destructibles };
}
