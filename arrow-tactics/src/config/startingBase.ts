import type { MapDef, WallLineDef } from './mapDef';

/**
 * Camp de depart du joueur (2026-11-04, demande d'Antoine) : la partie
 * commence dans un petit camp PRECONSTRUIT organise autour du Depart Survie
 * (la Baliste principale). La carte ne decrit que le Depart (MapDef.ballista)
 * et le preset (MapDef.startingBase) ; batiments, enceinte, porte et unites
 * de depart sont DERIVES ici, par la meme fonction pour le generateur (zone
 * reservee), l'editeur (apercu, validation), la vraie run et « Tester le
 * scénario » — meme philosophie que les camps neutres (data/campLayout.ts).
 * Dans config/ (et non data/) : le generateur (config/maps) en a besoin ;
 * identifiants de batiments et d'unites en chaines, sans import de data/.
 *
 * Repere LOCAL d'un preset : origine au centre de la Baliste, porte de
 * l'enceinte vers +z. `rotation` (quarts de tour) tourne tout le camp ; le
 * generateur et l'editeur choisissent la rotation qui ouvre la porte sur le
 * cote le plus degage (startingBaseRotationFor). Offsets des batiments en
 * demi-cases : la Baliste est centree sur une case (x.5), les emprises 2 x 2
 * tombent sur les bords de case. Valeurs PROVISOIRES.
 *
 * Enceinte ARRONDIE (addendum du 2026-11-04) : un polygone regulier de
 * `sides` cotes inscrit dans le cercle de rayon `radius` (cases), centre sur
 * la Baliste, lu comme un enclos rond ; le cote centre sur +z porte la porte
 * (ligne dediee de `gateLength` cases, posee ouverte), flanquee de deux bouts
 * de mur. `sides` multiple de 4 : un quart de tour ramene le polygone sur
 * lui-meme, seule la porte tourne. Zone reservee = disque de `radius` +
 * STARTING_BASE_MARGIN, identique pour toute rotation.
 */
export interface StartingBasePreset {
  id: string;
  name: string;
  /** Batiments TERMINES (data/buildings.ts) : centre relatif, direction de
   *  la facade (vers la cour) et variante visuelle (Maison A / B). */
  buildings: readonly { buildingId: string; dx: number; dz: number; faceX: number; faceZ: number; modelVariant?: number }[];
  /** Enceinte polygonale (voir en-tete) : type de mur V2 (data/walls.ts). */
  enclosure: { type: string; sides: number; radius: number; gateLength: number };
  /** Unites de depart en plus du Heros (data/units.ts), relatives. */
  units: readonly { unitId: string; dx: number; dz: number }[];
  /** Apparition du Heros, relative. */
  hero: { dx: number; dz: number };
}

/** Marge (cases) autour de l'enceinte reservee au camp de depart : ni camp,
 *  ni gisement, ni arbre, ni eau, ni relief (generateur, editeur). */
export const STARTING_BASE_MARGIN = 2;

export const STARTING_BASE_PRESETS: Readonly<Record<string, StartingBasePreset>> = {
  /** Petit camp de depart : Baliste au centre, deux Maisons (A au nord-ouest,
   *  B a l'ouest), l'Auberge a l'est, tous contre l'enceinte pour laisser le
   *  milieu libre ; cour au sud ou apparaissent le Heros et deux Villageois ;
   *  enceinte de Palissade V2 en dodecagone de rayon 10,5 (diametre 21,
   *  environ 330 cases dedans), porte ouverte de 2,4 cases au milieu du cote
   *  sud. 25 pieces (22 segments de 2,7, 2 bouts de 1,5, 1 porte). */
  'basic-camp': {
    id: 'basic-camp',
    name: 'Petit camp',
    buildings: [
      { buildingId: 'house', dx: -5.5, dz: -4.5, faceX: 1, faceZ: 0, modelVariant: 0 },
      { buildingId: 'house', dx: -7.5, dz: 0.5, faceX: 1, faceZ: 0, modelVariant: 1 },
      { buildingId: 'tavern', dx: 7.5, dz: -0.5, faceX: -1, faceZ: 0 },
    ],
    enclosure: { type: 'palisade', sides: 12, radius: 10.5, gateLength: 2.4 },
    units: [
      { unitId: 'villageois', dx: -2.5, dz: 3.5 },
      { unitId: 'villageois', dx: 2.5, dz: 3.5 },
    ],
    hero: { dx: 0, dz: 3 },
  },
};

/** Preset d'une carte de Survie sans `startingBase` explicite. */
export const DEFAULT_STARTING_BASE_PRESET = 'basic-camp';

export function getStartingBasePreset(id: string): StartingBasePreset {
  const preset = STARTING_BASE_PRESETS[id];
  if (!preset) throw new Error(`Camp de depart inconnu : ${id}`);
  return preset;
}

/** Rectangle (monde) : boite englobante de l'enceinte. */
export interface StartingBaseRect {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/** Disque (monde) : zone reservee au camp de depart. */
export interface StartingBaseDisc {
  x: number;
  z: number;
  radius: number;
}

/** Camp de depart derive, en coordonnees monde. */
export interface StartingBaseLayout {
  preset: string;
  rotation: number;
  origin: { x: number; z: number };
  buildings: { buildingId: string; x: number; z: number; rotationY: number; modelVariant?: number }[];
  walls: WallLineDef[];
  units: { unitId: string; x: number; z: number }[];
  hero: { x: number; z: number };
  /** Boite englobante de l'enceinte (sans marge). */
  bounds: StartingBaseRect;
  /** Zone reservee : enceinte + STARTING_BASE_MARGIN. */
  reserved: StartingBaseDisc;
}

/** Quart de tour `r` (0..3) d'un vecteur du repere local. */
function rotate(x: number, z: number, r: number): { x: number; z: number } {
  switch (((r % 4) + 4) % 4) {
    case 1:
      return { x: -z, z: x };
    case 2:
      return { x: -x, z: -z };
    case 3:
      return { x: z, z: -x };
    default:
      return { x, z };
  }
}

const round3 = (v: number): number => Math.round(v * 1000) / 1000;

/** Lignes de mur (repere local) de l'enceinte polygonale : sommets a
 *  (k + 1/2) x 360° / sides depuis +z, donc un cote centre sur +z ; ce cote
 *  est decoupe en bout, porte (ouverte) et bout ; les autres cotes sont une
 *  ligne chacun. Lignes voisines partagent leur extremite (jonctions). */
function enclosureLines(e: StartingBasePreset['enclosure']): { ax: number; az: number; bx: number; bz: number; gates?: number[]; openGates?: boolean }[] {
  const step = (2 * Math.PI) / e.sides;
  const vertex = (k: number) => {
    const a = (k + 0.5) * step;
    return { x: round3(e.radius * Math.sin(a)), z: round3(e.radius * Math.cos(a)) };
  };
  const left = vertex(e.sides - 1);
  const right = vertex(0);
  const half = e.gateLength / 2;
  const lines = [
    { ax: left.x, az: left.z, bx: -half, bz: left.z },
    { ax: -half, az: left.z, bx: half, bz: left.z, gates: [0], openGates: true },
    { ax: half, az: left.z, bx: right.x, bz: right.z },
  ];
  for (let k = 0; k < e.sides - 1; k++) {
    const p = vertex(k);
    const q = vertex(k + 1);
    lines.push({ ax: p.x, az: p.z, bx: q.x, bz: q.z });
  }
  return lines;
}

/** Camp de depart `presetId` autour du Depart `origin` (centre de la
 *  Baliste), tourne de `rotation` quarts de tour. Pur et deterministe. */
export function startingBaseLayoutAt(origin: { x: number; z: number }, presetId: string, rotation = 0): StartingBaseLayout {
  const p = getStartingBasePreset(presetId);
  const at = (dx: number, dz: number) => {
    const v = rotate(dx, dz, rotation);
    return { x: origin.x + v.x, z: origin.z + v.z };
  };
  const r = p.enclosure.radius;
  return {
    preset: p.id,
    rotation,
    origin: { x: origin.x, z: origin.z },
    buildings: p.buildings.map((b) => {
      const face = rotate(b.faceX, b.faceZ, rotation);
      return { buildingId: b.buildingId, ...at(b.dx, b.dz), rotationY: Math.atan2(face.x, face.z), ...(b.modelVariant !== undefined ? { modelVariant: b.modelVariant } : {}) };
    }),
    walls: enclosureLines(p.enclosure).map((w) => {
      const a = at(w.ax, w.az);
      const b = at(w.bx, w.bz);
      return { type: p.enclosure.type, ax: a.x, az: a.z, bx: b.x, bz: b.z, ...(w.gates ? { gates: [...w.gates] } : {}), ...(w.openGates ? { openGates: true } : {}) };
    }),
    units: p.units.map((u) => ({ unitId: u.unitId, ...at(u.dx, u.dz) })),
    hero: at(p.hero.dx, p.hero.dz),
    bounds: { minX: origin.x - r, maxX: origin.x + r, minZ: origin.z - r, maxZ: origin.z + r },
    reserved: startingBaseReservedAt(origin, presetId),
  };
}

/** Zone reservee (disque) du camp de depart `presetId` centre en `origin`,
 *  la meme pour toute rotation : le generateur la degage AVANT de choisir la
 *  rotation. */
export function startingBaseReservedAt(origin: { x: number; z: number }, presetId: string): StartingBaseDisc {
  return { x: origin.x, z: origin.z, radius: getStartingBasePreset(presetId).enclosure.radius + STARTING_BASE_MARGIN };
}

/** Vrai si le centre de la case (x, z) est dans le disque. */
export function reservedContainsCell(d: StartingBaseDisc, x: number, z: number): boolean {
  return Math.hypot(x + 0.5 - d.x, z + 0.5 - d.z) < d.radius;
}

/** Cases (coordonnees entieres) dont le centre est dans le disque. */
export function reservedCells(d: StartingBaseDisc): { x: number; z: number }[] {
  const out: { x: number; z: number }[] = [];
  for (let z = Math.floor(d.z - d.radius); z < d.z + d.radius; z++) for (let x = Math.floor(d.x - d.radius); x < d.x + d.radius; x++) if (reservedContainsCell(d, x, z)) out.push({ x, z });
  return out;
}

/** Vrai si le disque (cx, cz, r) chevauche la zone reservee. */
export function reservedOverlapsDisc(d: StartingBaseDisc, cx: number, cz: number, r: number): boolean {
  return Math.hypot(cx - d.x, cz - d.z) < d.radius + r;
}

/** Rotation (quart de tour) qui ouvre la porte sur le cote le plus degage :
 *  cases ouvertes (`isOpen`) d'une fenetre 9 x 9 centree juste au-dela de
 *  la zone reservee, dans la direction de la porte. Egalite : la plus petite
 *  rotation (porte au sud par defaut). Deterministe. */
export function startingBaseRotationFor(origin: { x: number; z: number }, presetId: string, isOpen: (x: number, z: number) => boolean): number {
  const reach = startingBaseReservedAt(origin, presetId).radius + 5;
  let best = 0;
  let bestOpen = -1;
  for (let r = 0; r < 4; r++) {
    const g = rotate(0, 1, r);
    const cx = Math.floor(origin.x + g.x * reach);
    const cz = Math.floor(origin.z + g.z * reach);
    let open = 0;
    for (let z = cz - 4; z <= cz + 4; z++) for (let x = cx - 4; x <= cx + 4; x++) if (isOpen(x, z)) open++;
    if (open > bestOpen) {
      bestOpen = open;
      best = r;
    }
  }
  return best;
}

/** Camp de depart d'une carte (preset et rotation de MapDef.startingBase,
 *  autour de MapDef.ballista), ou null : carte sans Depart Survie, sans les
 *  regles de la Survie Hero RTS, ou preset `none`. Sans `startingBase`, une
 *  carte de Survie prend DEFAULT_STARTING_BASE_PRESET, rotation 0. */
export function startingBaseLayoutOf(map: Pick<MapDef, 'ballista' | 'survivalRules' | 'startingBase'>): StartingBaseLayout | null {
  if (!map.ballista || map.survivalRules !== 'hero-rts') return null;
  const preset = map.startingBase?.preset ?? DEFAULT_STARTING_BASE_PRESET;
  if (preset === 'none' || !STARTING_BASE_PRESETS[preset]) return null;
  return startingBaseLayoutAt(map.ballista, preset, map.startingBase?.rotation ?? 0);
}

/** Carte prete pour le jeu : l'enceinte du camp de depart est ajoutee aux
 *  murs concrets (World / spawnMapWalls), une fois, a la consommation ; les
 *  batiments et les unites de depart sont crees par l'orchestration (run :
 *  batiments possedes et armee ; « Tester le scénario » : batiments de
 *  scenario). La carte d'origine n'est pas modifiee. */
export function expandStartingBaseWalls(map: MapDef): MapDef {
  const layout = startingBaseLayoutOf(map);
  if (!layout) return map;
  return { ...map, walls: [...(map.walls ?? []), ...layout.walls] };
}
