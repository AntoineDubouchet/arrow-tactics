import type { ObstacleDef } from './constants';
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
 *
 * GISEMENTS ET BOSQUET GARANTIS (2026-11-05, decision d'Antoine) : le preset
 * place dans l'enceinte au moins un gisement de pierre, un gisement d'or
 * (`deposits`) et un bosquet d'au moins six arbres groupes (`trees`), vers
 * la peripherie interieure, hors batiments, Baliste, porte, places
 * d'apparition et axe de la porte, a plus d'une case de l'enceinte (aucun
 * passage d'une case, KI-65), en laissant la cour libre pour construire. Ce
 * sont des sources ORDINAIRES (obstacles `rock` 2 x 2, pierre ou `ore:
 * 'gold'` ; `tree` 1 x 1) : memes quantites (data/resources.ts), meme cargo,
 * meme epuisement et memes gravats que celles de la carte. Derives du preset
 * comme le reste (une seule source de verite) : ajoutes a la carte a sa
 * consommation (expandStartingBase : run, « Tester le scénario »), jamais
 * ecrits dans une MapDef ni sauvegardes ; l'editeur les montre dans son
 * apercu et les deplace avec le Depart.
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
  /** Gisements garantis dans l'enceinte : centre relatif de l'emprise 2 x 2
   *  (demi-cases impaires : l'emprise tombe sur des cases entieres). */
  deposits: readonly { resource: 'stone' | 'gold'; dx: number; dz: number }[];
  /** Bosquet garanti : centres relatifs d'arbres 1 x 1 (entiers depuis la
   *  Baliste, elle-meme centree sur une case), au moins six, groupes. */
  trees: readonly { dx: number; dz: number }[];
  /** Ressource proche garantie HORS de l'enceinte (generateur) : un gisement
   *  d'or a `distance` cases de la Baliste, visible au depart. */
  nearbyGold: { distance: number };
}

/** Marge (cases) autour de l'enceinte reservee au camp de depart : ni camp,
 *  ni gisement, ni arbre, ni eau, ni relief (generateur, editeur). */
export const STARTING_BASE_MARGIN = 2;

export const STARTING_BASE_PRESETS: Readonly<Record<string, StartingBasePreset>> = {
  /** Camp de depart (2026-11-05, G46 : nettement agrandi, rayon 10,5 -> 15) :
   *  Baliste au centre, deux Maisons (A au nord-ouest, B a l'ouest) et
   *  l'Auberge a l'est repoussees contre l'enceinte, cour au sud ou
   *  apparaissent le Heros et deux Villageois ; enceinte de Palissade V2 en
   *  dodecagone de rayon 15 (apotheme 14,5, diametre 30, environ 650 cases
   *  dedans, deux fois la surface d'avant), porte ouverte de 2,4 cases au
   *  milieu du cote sud. Grande cour centrale libre pour construire. */
  'basic-camp': {
    id: 'basic-camp',
    name: 'Petit camp',
    buildings: [
      { buildingId: 'house', dx: -8.5, dz: -6.5, faceX: 1, faceZ: 0, modelVariant: 0 },
      { buildingId: 'house', dx: -10.5, dz: 0.5, faceX: 1, faceZ: 0, modelVariant: 1 },
      { buildingId: 'tavern', dx: 11.5, dz: -0.5, faceX: -1, faceZ: 0 },
    ],
    enclosure: { type: 'palisade', sides: 12, radius: 15, gateLength: 2.4 },
    units: [
      { unitId: 'villageois', dx: -2.5, dz: 3.5 },
      { unitId: 'villageois', dx: 2.5, dz: 3.5 },
    ],
    hero: { dx: 0, dz: 3 },
    // Pierre au nord-est (cote oppose a la porte), or au sud-ouest (a
    // l'ecart de l'axe de la porte et des places d'apparition), tous deux
    // vers la peripherie interieure (coins a ~12,7 cases du centre, ~2 cases
    // libres devant l'enceinte). PROVISOIRE.
    deposits: [
      { resource: 'stone', dx: 7.5, dz: -8.5 },
      { resource: 'gold', dx: -7.5, dz: 8.5 },
    ],
    // Bosquet de 7 arbres au nord (cote oppose a la porte), contre
    // l'enceinte (~2 cases libres), loin de la Maison A et de la pierre :
    // amas compact de deux rangs decales, sans case libre enclavee ni passage
    // d'une case (KI-65) ; la cour reste libre. PROVISOIRE.
    trees: [
      { dx: -2, dz: -12 }, { dx: -1, dz: -12 }, { dx: 0, dz: -12 }, { dx: 1, dz: -12 },
      { dx: -2, dz: -11 }, { dx: -1, dz: -11 }, { dx: 0, dz: -11 },
    ],
    // Or proche garanti (2026-11-05, G46 : au moins deux gisements d'or
    // visibles au depart, celui de l'enceinte et un second dehors) : centre
    // a cette distance de la Baliste, hors murs (>= rayon + 2), hors de
    // l'axe de la porte, dans la vision initiale de la Baliste
    // (data/vision.ts VISION_RADIUS.ballista 21 > 18,5 + 1,5). Pose par le
    // generateur (config/maps/proceduralSurvival.ts) ; une carte dessinee
    // sans or visible dehors recoit un avertissement de l'editeur.
    nearbyGold: { distance: 18.5 },
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
  /** Gisements garantis (centre monde de l'emprise 2 x 2). */
  deposits: { resource: 'stone' | 'gold'; x: number; z: number }[];
  /** Arbres du bosquet garanti (centre monde, case entiere). */
  trees: { x: number; z: number }[];
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
    deposits: p.deposits.map((d) => ({ resource: d.resource, ...at(d.dx, d.dz) })),
    trees: p.trees.map((t) => at(t.dx, t.dz)),
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

/** Gisements et bosquet garantis d'un camp derive, sous forme d'obstacles
 *  ordinaires de carte (`rock` 2 x 2, `ore: 'gold'` pour l'or, coin =
 *  centre - 1 ; `tree` 1 x 1 au centre de sa case) : memes sources que
 *  celles generees (config/resourceNodes.ts, quantites de data/resources.ts). */
export function startingBaseObstacles(layout: StartingBaseLayout): ObstacleDef[] {
  return [
    ...layout.deposits.map((d): ObstacleDef => ({ kind: 'rock', tilesX: 2, tilesZ: 2, cornerX: Math.round(d.x - 1), cornerZ: Math.round(d.z - 1), ...(d.resource === 'gold' ? { ore: 'gold' as const } : {}) })),
    ...layout.trees.map((t): ObstacleDef => ({ kind: 'tree', tilesX: 1, tilesZ: 1, x: t.x, z: t.z })),
  ];
}

/** Carte prete pour le jeu : l'enceinte du camp de depart est ajoutee aux
 *  murs concrets (World / spawnMapWalls), ses gisements et son bosquet
 *  garantis aux obstacles (sources de ressources, plateau), une fois, a la
 *  consommation ;
 *  les batiments et les unites de depart sont crees par l'orchestration
 *  (run : batiments possedes et armee ; « Tester le scénario » : batiments
 *  de scenario). La carte d'origine n'est pas modifiee ; rien n'est
 *  sauvegarde (aucun doublon au rechargement d'une carte). */
export function expandStartingBase(map: MapDef): MapDef {
  const layout = startingBaseLayoutOf(map);
  if (!layout) return map;
  return { ...map, obstacles: [...map.obstacles, ...startingBaseObstacles(layout)], walls: [...(map.walls ?? []), ...layout.walls] };
}
