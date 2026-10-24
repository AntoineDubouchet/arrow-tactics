/**
 * Trace continu d'une enceinte de murailles (pose en preparation et dans
 * l'editeur) : chaque clic ajoute une PORTION droite (axe dominant, jamais de
 * diagonale) depuis l'ancre courante, exactement de la longueur demandee ;
 * son extremite devient la nouvelle ancre ; un clic sur la case de depart
 * (ou a cote, si l'ancre lui est alignee) ferme l'enceinte.
 *
 * Structure : une suite de troncons DROITS et de VIRAGES (une case, piece de
 * coin KayKit) a chaque changement de direction. Un troncon droit est fait
 * de segments 2 x 1 et, s'il a un nombre impair de cases, d'un DEMI-SEGMENT
 * d'une case (de preference a une extremite ouverte, sinon contre un
 * virage).
 *
 * La disposition complete est une fonction PURE du trace (`traceLayout`) :
 * valider une portion = passer de la disposition d'avant a celle d'apres.
 * Pendant un trace ouvert, les cases dont la nature n'est pas encore connue
 * restent EN ATTENTE (non construites) : l'ancre (virage ou prolongement
 * droit au clic suivant), la case de depart (virage a la fermeture), et au
 * plus une case de leur troncon (appariee plus tard). Quand le trace est
 * termine sans etre ferme (`final`), ces cases deviennent de vraies pieces
 * droites : une ligne ouverte reste une ligne complete.
 *
 * Tous les segments et virages se touchent par une arete entiere : le trace
 * est etanche.
 *
 * REPRISE d'une muraille existante (`wallNetPiece`, `openWallEnds`,
 * `wallChainTo`, `resumeWallTrace`) : chaque piece posee a deux CONNECTEURS
 * (case + direction de sortie) ; un connecteur sans vis-a-vis est une
 * extremite ouverte. Reprendre une extremite reconstruit la chaine jusqu'a
 * son autre bout et en fait un trace ordinaire dont l'etat courant est fait
 * des pieces reelles : la portion suivante est disposee par `traceLayout` sur
 * le chemin COMPLET, et la difference avec l'existant donne la recomposition
 * (demi-segment ou segment devenu virage, troncon re-apparie). A geometrie
 * egale, le resultat est donc celui d'un trace fait en une seule fois.
 *
 * Pur (aucun etat global, aucun rendu) : coordonnees de CASE entieres
 * (Math.floor du point au sol), comme les coins d'emprise de la pose.
 */

export interface TraceCell {
  x: number;
  z: number;
}

/** Direction d'une portion : un pas d'une case sur X ou sur Z. */
export interface TraceDir {
  x: number;
  z: number;
}

/** Piece du trace. `straight` : segment 2 x 1 parcouru dans le sens `dir`.
 *  `half` : demi-segment d'une case, meme sens. `corner` : virage d'une case,
 *  entree `inDir`, sortie `outDir`. Coin de grille et emprise en cases. */
export type WallTracePiece =
  | { kind: 'straight'; cornerX: number; cornerZ: number; tilesX: number; tilesZ: number; dir: TraceDir }
  | { kind: 'half'; cornerX: number; cornerZ: number; tilesX: 1; tilesZ: 1; dir: TraceDir }
  | { kind: 'corner'; cornerX: number; cornerZ: number; tilesX: 1; tilesZ: 1; inDir: TraceDir; outDir: TraceDir };

export interface WallTrace {
  /** Case du premier clic : un clic dessus ferme l'enceinte. */
  first: TraceCell;
  /** Extremite de la derniere portion validee (case du premier clic avant). */
  anchor: TraceCell;
  /** Sommets du trace (case de depart puis extremite de chaque portion). */
  vertices: TraceCell[];
  /** Direction de chaque portion validee (une portion de longueur nulle
   *  porte la direction d'un connecteur, voir chainPath). */
  dirs: TraceDir[];
  /** Etat courant : pieces deja posees par le trace (ou reprises d'une
   *  muraille existante) et cases en attente. */
  current: TraceLayout;
  /** Vrai pour une muraille reprise : la case de depart est une extremite
   *  deja construite (jamais en attente). */
  startFixed: boolean;
}

/** Disposition d'un trace : pieces construites et cases en attente.
 *  `conflict` : deux virages tomberaient sur la meme case (raccord
 *  impossible, par exemple tourner sur un virage existant). */
export interface TraceLayout {
  pieces: WallTracePiece[];
  waiting: TraceCell[];
  conflict?: boolean;
}

/** `open` : trace en cours (extremites en attente). `final` : trace termine
 *  sans fermeture (tout est construit). `closed` : enceinte fermee. */
export type TraceLayoutMode = 'open' | 'final' | 'closed';

/** Portion proposee de l'ancre au curseur. */
export interface WallTraceLeg {
  /** Extremite de la portion (nouvelle ancre si elle est validee). */
  end: TraceCell;
  dir: TraceDir;
  /** Vrai si la portion revient sur la case de depart et ferme l'enceinte. */
  closes: boolean;
  /** Disposition du trace avant et apres la portion. */
  before: TraceLayout;
  after: TraceLayout;
  /** Faux si la portion ne peut pas etre validee : longueur nulle (hors
   *  muraille d'une case), retour en arriere, ou fermeture sans virage a la
   *  case de depart. */
  usable: boolean;
  /** Vrai pour une muraille d'UNE case (second clic sur la case de depart,
   *  avant toute portion) : un demi-segment, et le trace est termine. */
  single: boolean;
  /** Vrai si la portion rejoint l'extremite d'une AUTRE muraille : les deux
   *  chaines n'en font plus qu'une, et le trace est termine. */
  joins: boolean;
}

export function traceCellAt(x: number, z: number): TraceCell {
  return { x: Math.floor(x), z: Math.floor(z) };
}

export function startWallTrace(cell: TraceCell): WallTrace {
  return { first: { ...cell }, anchor: { ...cell }, vertices: [{ ...cell }], dirs: [], current: { pieces: [], waiting: [] }, startFixed: false };
}

const sameCell = (a: TraceCell, b: TraceCell): boolean => a.x === b.x && a.z === b.z;
const sameDir = (a: TraceDir, b: TraceDir): boolean => a.x === b.x && a.z === b.z;
const cellDistance = (a: TraceCell, b: TraceCell): number => Math.abs(a.x - b.x) + Math.abs(a.z - b.z);

function straightFor(a: TraceCell, b: TraceCell, dir: TraceDir): WallTracePiece {
  const horizontal = a.z === b.z;
  return { kind: 'straight', cornerX: Math.min(a.x, b.x), cornerZ: Math.min(a.z, b.z), tilesX: horizontal ? 2 : 1, tilesZ: horizontal ? 1 : 2, dir };
}

/**
 * Disposition complete d'un trace (`vertices` : sommets, `dirs` : direction
 * de chaque portion ; en mode `closed`, la derniere portion revient sur le
 * premier sommet, qui n'est pas repete). Voir le commentaire du module.
 */
export function traceLayout(vertices: readonly TraceCell[], dirs: readonly TraceDir[], mode: TraceLayoutMode, startFixed = false): TraceLayout {
  if (dirs.length === 0) return { pieces: [], waiting: [] };
  const closed = mode === 'closed';
  // Cases du chemin dans l'ordre, avec la direction de leur portion.
  const path: { cell: TraceCell; dir: TraceDir }[] = [{ cell: vertices[0]!, dir: dirs[0]! }];
  const vertexIndex: number[] = [0];
  for (let i = 0; i < dirs.length; i++) {
    const from = vertices[i]!;
    const to = closed && i === dirs.length - 1 ? vertices[0]! : vertices[i + 1]!;
    const d = dirs[i]!;
    const n = cellDistance(from, to);
    for (let k = 1; k <= n; k++) path.push({ cell: { x: from.x + d.x * k, z: from.z + d.z * k }, dir: d });
    vertexIndex.push(path.length - 1);
  }
  if (closed) path.pop(); // la case de depart n'est pas repetee
  const count = path.length;

  // Virages : sommets ou la direction change (et la case de depart d'une
  // enceinte fermee).
  const corners = new Map<number, WallTracePiece>();
  let conflict = false;
  const addCorner = (index: number, inDir: TraceDir, outDir: TraceDir): void => {
    if (sameDir(inDir, outDir)) return;
    if (corners.has(index) || (inDir.x === -outDir.x && inDir.z === -outDir.z)) conflict = true;
    const c = path[index]!.cell;
    corners.set(index, { kind: 'corner', cornerX: c.x, cornerZ: c.z, tilesX: 1, tilesZ: 1, inDir, outDir });
  };
  for (let i = 1; i < dirs.length; i++) addCorner(vertexIndex[i]!, dirs[i - 1]!, dirs[i]!);
  if (closed) addCorner(0, dirs[dirs.length - 1]!, dirs[0]!);

  const pieces: WallTracePiece[] = [...corners.values()];
  const waiting: TraceCell[] = [];
  // Troncons droits : cases entre deux virages (ou extremites du chemin).
  const stops = [...corners.keys()].sort((a, b) => a - b);
  const runs: { cells: { cell: TraceCell; dir: TraceDir }[]; startOpen: boolean; endOpen: boolean }[] = [];
  if (closed) {
    for (let s = 0; s < stops.length; s++) {
      const a = stops[s]!;
      const b = s + 1 < stops.length ? stops[s + 1]! : stops[0]! + count;
      const cells = [];
      for (let k = a + 1; k < b; k++) cells.push(path[k % count]!);
      runs.push({ cells, startOpen: false, endOpen: false });
    }
  } else {
    const bounds = [-1, ...stops, count];
    for (let s = 0; s + 1 < bounds.length; s++) {
      const cells = path.slice(bounds[s]! + 1, bounds[s + 1]!);
      if (cells.length > 0) runs.push({ cells, startOpen: s === 0, endOpen: s + 1 === bounds.length - 1 });
    }
  }

  const pair = (cells: { cell: TraceCell; dir: TraceDir }[]): void => {
    for (let k = 0; k + 1 < cells.length; k += 2) pieces.push(straightFor(cells[k]!.cell, cells[k + 1]!.cell, cells[k]!.dir));
  };
  const half = (c: { cell: TraceCell; dir: TraceDir }): void => {
    pieces.push({ kind: 'half', cornerX: c.cell.x, cornerZ: c.cell.z, tilesX: 1, tilesZ: 1, dir: c.dir });
  };

  for (const run of runs) {
    let cells = run.cells;
    if (mode === 'open') {
      // Extremites du chemin en attente, et au plus une case de leur troncon
      // (appariee plus tard) : les segments partent du cote deja connu.
      // Muraille reprise : la case de depart est deja construite.
      const startPending = run.startOpen && !startFixed;
      if (startPending) {
        waiting.push(cells[0]!.cell);
        cells = cells.slice(1);
      }
      if (run.endOpen && cells.length > 0) {
        waiting.push(cells[cells.length - 1]!.cell);
        cells = cells.slice(0, -1);
      }
      if (cells.length % 2 === 1 && (startPending || run.endOpen)) {
        if (run.endOpen) {
          waiting.push(cells[cells.length - 1]!.cell);
          cells = cells.slice(0, -1);
        } else {
          waiting.push(cells[0]!.cell);
          cells = cells.slice(1);
        }
      }
    }
    if (cells.length % 2 === 0) {
      pair(cells);
    } else if (run.endOpen || !run.startOpen) {
      // Demi-segment a l'extremite ouverte de fin, sinon contre le virage
      // suivant.
      pair(cells.slice(0, -1));
      half(cells[cells.length - 1]!);
    } else {
      half(cells[0]!);
      pair(cells.slice(1));
    }
  }
  return { pieces, waiting, ...(conflict ? { conflict: true } : {}) };
}

/** Portion de l'ancre vers le curseur (x, z), exactement de la longueur
 *  demandee — voir le commentaire du module. Fermeture : au moins deux
 *  portions validees, curseur sur la case de depart ou une case voisine
 *  (8-voisinage), ancre alignee avec elle. */
export function planWallTraceLeg(trace: WallTrace, cursorX: number, cursorZ: number, join: WallPath | null = null): WallTraceLeg {
  const cursor = traceCellAt(cursorX, cursorZ);
  const { anchor, first } = trace;
  const prev = trace.dirs[trace.dirs.length - 1] ?? null;
  const nearFirst = Math.max(Math.abs(cursor.x - first.x), Math.abs(cursor.z - first.z)) <= 1;
  const closes = !join && trace.dirs.length >= 2 && nearFirst && !sameCell(anchor, first) && (anchor.x === first.x || anchor.z === first.z);

  let dir: TraceDir;
  let length: number;
  if (join) {
    // Jonction : la portion finit sur l'extremite de l'autre muraille.
    const target = join.vertices[0]!;
    const aligned = anchor.x === target.x || anchor.z === target.z;
    dir = { x: Math.sign(target.x - anchor.x), z: Math.sign(target.z - anchor.z) };
    length = aligned ? cellDistance(anchor, target) : 0;
    const end = { ...target };
    const backwards = prev !== null && prev.x === -dir.x && prev.z === -dir.z;
    const after = traceLayout([...trace.vertices, ...join.vertices], [...trace.dirs, dir, ...join.dirs], 'final', trace.startFixed);
    return {
      end,
      dir,
      closes: false,
      single: false,
      joins: true,
      before: { pieces: [...trace.current.pieces, ...join.current.pieces], waiting: trace.current.waiting },
      after,
      usable: aligned && length > 0 && !backwards && !after.conflict,
    };
  }
  if (closes) {
    dir = { x: Math.sign(first.x - anchor.x), z: Math.sign(first.z - anchor.z) };
    length = cellDistance(anchor, first);
  } else {
    const dx = cursor.x - anchor.x;
    const dz = cursor.z - anchor.z;
    const horizontal = Math.abs(dx) >= Math.abs(dz);
    dir = horizontal ? { x: Math.sign(dx) || 1, z: 0 } : { x: 0, z: Math.sign(dz) || 1 };
    length = Math.abs(horizontal ? dx : dz);
  }

  const end: TraceCell = { x: anchor.x + dir.x * length, z: anchor.z + dir.z * length };
  const backwards = prev !== null && prev.x === -dir.x && prev.z === -dir.z;
  const firstDir = trace.dirs[0] ?? null;
  // Fermeture : virage a la case de depart (la derniere portion ne prolonge
  // pas la premiere).
  const closeOk = !closes || (firstDir !== null && dir.x * firstDir.x + dir.z * firstDir.z === 0);
  const dirs = [...trace.dirs, dir];
  if (length === 0 && trace.dirs.length === 0) {
    // Muraille d'une case : demi-segment sur la case de depart.
    return { end, dir, closes: false, single: true, joins: false, usable: true, before: { pieces: [], waiting: [] }, after: { pieces: [{ kind: 'half', cornerX: first.x, cornerZ: first.z, tilesX: 1, tilesZ: 1, dir }], waiting: [] } };
  }
  const after = closes ? traceLayout(trace.vertices, dirs, 'closed') : traceLayout([...trace.vertices, end], dirs, 'open', trace.startFixed);
  return {
    single: false,
    joins: false,
    end,
    dir,
    closes,
    before: trace.current,
    after,
    usable: length > 0 && !backwards && closeOk && !after.conflict,
  };
}

/** Trace apres validation de `leg` : null si l'enceinte est fermee (trace
 *  termine), sinon la portion suivante part de son extremite. */
export function advanceWallTrace(trace: WallTrace, leg: WallTraceLeg): WallTrace | null {
  if (leg.closes || leg.single || leg.joins) return null;
  return { first: trace.first, anchor: { ...leg.end }, vertices: [...trace.vertices, { ...leg.end }], dirs: [...trace.dirs, leg.dir], current: leg.after, startFixed: trace.startFixed };
}

/** Trace termine sans fermeture (Echap, clic droit, changement d'outil) :
 *  passage de la disposition en cours a la disposition finale, ou les cases
 *  en attente deviennent des pieces droites. */
export function finalizeWallTrace(trace: WallTrace): { before: TraceLayout; after: TraceLayout } {
  return { before: trace.current, after: traceLayout(trace.vertices, trace.dirs, 'final') };
}

// --- Reseau de murailles existant : connecteurs, extremites, chaines --------

/** Connecteur d'une piece : case et direction de sortie. */
export interface WallConnector {
  cell: TraceCell;
  dir: TraceDir;
}

/** Piece de muraille deja posee vue par ses deux connecteurs. `gate` : porte
 *  (connecteurs d'un segment droit, jamais recomposee). */
export interface WallNetPiece {
  kind: 'straight' | 'half' | 'corner' | 'gate';
  cornerX: number;
  cornerZ: number;
  tilesX: number;
  tilesZ: number;
  connectors: [WallConnector, WallConnector];
}

const DIRS: Readonly<Record<string, TraceDir>> = { W: { x: -1, z: 0 }, E: { x: 1, z: 0 }, N: { x: 0, z: -1 }, S: { x: 0, z: 1 } };
/** Bras d'un virage selon son quart de tour (inverse de
 *  CORNER_ROTATION_BY_ARMS). */
const CORNER_ARMS_BY_QUARTER: readonly (readonly [string, string])[] = [['W', 'S'], ['S', 'E'], ['E', 'N'], ['N', 'W']];

/** Connecteurs d'une piece posee, d'apres son emprise et sa `rotationY` :
 *  segment / porte / demi-segment = deux connecteurs opposes sur son axe,
 *  virage = ses deux bras. */
export function wallNetPiece(kind: WallNetPiece['kind'], cornerX: number, cornerZ: number, tilesX: number, tilesZ: number, rotationY: number): WallNetPiece {
  const quarter = (((Math.round(rotationY / (Math.PI / 2)) % 4) + 4) % 4);
  const c0 = { x: cornerX, z: cornerZ };
  let connectors: [WallConnector, WallConnector];
  if (kind === 'corner') {
    const [a, b] = CORNER_ARMS_BY_QUARTER[quarter]!;
    connectors = [{ cell: c0, dir: DIRS[a]! }, { cell: c0, dir: DIRS[b]! }];
  } else if (kind === 'half') {
    connectors = quarter % 2 === 0 ? [{ cell: c0, dir: DIRS.W! }, { cell: c0, dir: DIRS.E! }] : [{ cell: c0, dir: DIRS.N! }, { cell: c0, dir: DIRS.S! }];
  } else if (tilesX >= tilesZ) {
    connectors = [{ cell: c0, dir: DIRS.W! }, { cell: { x: cornerX + tilesX - 1, z: cornerZ }, dir: DIRS.E! }];
  } else {
    connectors = [{ cell: c0, dir: DIRS.N! }, { cell: { x: cornerX, z: cornerZ + tilesZ - 1 }, dir: DIRS.S! }];
  }
  return { kind, cornerX, cornerZ, tilesX, tilesZ, connectors };
}

/** Extremite ouverte du reseau : piece (index), et son connecteur libre. */
export interface WallEnd {
  piece: number;
  cell: TraceCell;
  dir: TraceDir;
}

/** Piece qui presente un connecteur face a `c` (case voisine, direction
 *  opposee), ou -1. */
function facingPiece(pieces: readonly WallNetPiece[], c: WallConnector, self: number): number {
  const nx = c.cell.x + c.dir.x;
  const nz = c.cell.z + c.dir.z;
  return pieces.findIndex((p, i) => i !== self && p.connectors.some((k) => k.cell.x === nx && k.cell.z === nz && k.dir.x === -c.dir.x && k.dir.z === -c.dir.z));
}

/** Toutes les extremites ouvertes : connecteurs sans vis-a-vis compatible. */
export function openWallEnds(pieces: readonly WallNetPiece[]): WallEnd[] {
  const ends: WallEnd[] = [];
  pieces.forEach((p, i) => {
    for (const c of p.connectors) if (facingPiece(pieces, c, i) < 0) ends.push({ piece: i, cell: { ...c.cell }, dir: { ...c.dir } });
  });
  return ends;
}

/** Chaine reliee a une extremite ouverte, de son AUTRE bout jusqu'a elle :
 *  cases dans l'ordre, pieces (index), direction d'entree a l'autre bout et
 *  direction de sortie a l'extremite. Null si la chaine forme une boucle. */
export interface WallChain {
  cells: TraceCell[];
  pieces: number[];
  startDir: TraceDir;
  endDir: TraceDir;
}

export function wallChainTo(pieces: readonly WallNetPiece[], end: WallEnd): WallChain | null {
  const cells: TraceCell[] = [];
  const order: number[] = [];
  let current = end.piece;
  let entry: WallConnector = { cell: end.cell, dir: end.dir };
  for (let guard = 0; guard <= pieces.length; guard++) {
    if (order.includes(current)) return null;
    const p = pieces[current]!;
    order.push(current);
    const exit = p.connectors.find((k) => !(sameCell(k.cell, entry.cell) && sameDir(k.dir, entry.dir)))!;
    // Cases de la piece, de son connecteur d'entree vers sa sortie.
    if (sameCell(entry.cell, exit.cell)) cells.push({ ...entry.cell });
    else cells.push({ ...entry.cell }, { ...exit.cell });
    const next = facingPiece(pieces, exit, current);
    if (next < 0) {
      return { cells: cells.reverse(), pieces: order.reverse(), startDir: { x: -exit.dir.x, z: -exit.dir.z }, endDir: { ...end.dir } };
    }
    entry = { cell: { x: exit.cell.x + exit.dir.x, z: exit.cell.z + exit.dir.z }, dir: { x: -exit.dir.x, z: -exit.dir.z } };
    current = next;
  }
  return null;
}

/** Chemin d'un trace (sommets, directions) pour une suite de cases, avec la
 *  direction d'entree dans la premiere et de sortie de la derniere : un
 *  virage a une extremite (connecteur perpendiculaire au chemin) devient une
 *  portion de longueur nulle, comme une muraille d'une seule case. */
export interface WallPath {
  vertices: TraceCell[];
  dirs: TraceDir[];
  current: TraceLayout;
}

export function chainPath(cells: readonly TraceCell[], startDir: TraceDir, endDir: TraceDir, existing: readonly WallTracePiece[]): WallPath {
  const c0 = cells[0]!;
  const vertices: TraceCell[] = [{ ...c0 }];
  const dirs: TraceDir[] = [];
  const steps: TraceDir[] = [];
  for (let k = 1; k < cells.length; k++) steps.push({ x: cells[k]!.x - cells[k - 1]!.x, z: cells[k]!.z - cells[k - 1]!.z });
  if (steps.length === 0 || !sameDir(startDir, steps[0]!)) {
    dirs.push({ ...startDir });
    vertices.push({ ...c0 });
  }
  for (let k = 0; k < steps.length; k++) {
    if (k + 1 < steps.length && sameDir(steps[k]!, steps[k + 1]!)) continue;
    dirs.push({ ...steps[k]! });
    vertices.push({ ...cells[k + 1]! });
  }
  const last = dirs[dirs.length - 1]!;
  if (!sameDir(last, endDir)) {
    dirs.push({ ...endDir });
    vertices.push({ ...cells[cells.length - 1]! });
  }
  return { vertices, dirs, current: { pieces: [...existing], waiting: [] } };
}

/** Trace qui REPREND la muraille `chain` a son extremite (premier clic sur
 *  une extremite ouverte) : la portion suivante part de cette extremite,
 *  avec la direction de la muraille existante. */
export function resumeWallTrace(chain: WallChain, existing: readonly WallTracePiece[]): WallTrace {
  const path = chainPath(chain.cells, chain.startDir, chain.endDir, existing);
  return { first: { ...path.vertices[0]! }, anchor: { ...path.vertices[path.vertices.length - 1]! }, vertices: path.vertices, dirs: path.dirs, current: path.current, startFixed: true };
}

/** Chemin d'une AUTRE muraille vu depuis son extremite `chain` (jonction) :
 *  de cette extremite vers son autre bout. */
export function joinWallPath(chain: WallChain, existing: readonly WallTracePiece[]): WallPath {
  const reversed = [...chain.cells].reverse();
  return chainPath(reversed, { x: -chain.endDir.x, z: -chain.endDir.z }, { x: -chain.startDir.x, z: -chain.startDir.z }, existing);
}

// --- Orientation : cote interieur, creneaux dehors ---------------------------

/** Produit vectoriel (plan XZ) : positif quand `p` est du cote "+" de `d`. */
const cross = (d: TraceDir, px: number, pz: number): number => d.x * pz - d.z * px;

/**
 * Cote INTERIEUR du trace, le meme pour toutes ses pieces (continuite) : +1
 * ou -1 selon le signe du produit vectoriel direction x (point - trace).
 * - Enceinte fermee : interieur du polygone des sommets (signe de son aire,
 *   independant du sens de dessin).
 * - Trace ouvert : cote de `reference` (la Baliste du joueur) par rapport a
 *   la portion la plus proche d'elle.
 * - Sans reference (ou reference sur la ligne) : +1, deterministe.
 * `vertices`/`dirs` : sommets et directions du trace, portion en cours
 * comprise.
 */
export function traceInteriorSign(vertices: readonly TraceCell[], dirs: readonly TraceDir[], closed: boolean, reference: { x: number; z: number } | null): number {
  if (closed) {
    let area = 0;
    for (let i = 0; i < vertices.length; i++) {
      const a = vertices[i]!;
      const b = vertices[(i + 1) % vertices.length]!;
      area += a.x * b.z - b.x * a.z;
    }
    return area >= 0 ? 1 : -1;
  }
  if (!reference || dirs.length === 0) return 1;
  let best = Infinity;
  let sign = 0;
  for (let i = 0; i < dirs.length; i++) {
    const a = vertices[i]!;
    const b = vertices[i + 1]!;
    const ax = a.x + 0.5, az = a.z + 0.5, bx = b.x + 0.5, bz = b.z + 0.5;
    const len2 = (bx - ax) ** 2 + (bz - az) ** 2;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((reference.x - ax) * (bx - ax) + (reference.z - az) * (bz - az)) / len2));
    const d = Math.hypot(reference.x - (ax + t * (bx - ax)), reference.z - (az + t * (bz - az)));
    if (d < best) {
      best = d;
      sign = Math.sign(cross(dirs[i]!, reference.x - ax, reference.z - az));
    }
  }
  return sign === 0 ? 1 : sign;
}

/** Variante et rotation d'un virage : table de correspondance indexee par ses
 *  deux BRAS (directions des cases voisines : retour vers la portion
 *  entrante, depart de la portion sortante). Pose de reference (rotation 0) :
 *  bras vers -X (W) et +Z (S), arc bombe vers le quart nord-est. */
const CORNER_ROTATION_BY_ARMS: Readonly<Record<string, number>> = {
  'S|W': 0,
  'E|S': Math.PI / 2,
  'E|N': Math.PI,
  'N|W': (3 * Math.PI) / 2,
};

const dirName = (d: TraceDir): string => (d.x < 0 ? 'W' : d.x > 0 ? 'E' : d.z < 0 ? 'N' : 'S');

/**
 * Orientation d'une piece pour un cote interieur `interiorSign` :
 * - segment droit (ou demi-segment) : direction de l'EXTERIEUR (creneaux),
 *   perpendiculaire ;
 * - virage : variante `outside` quand le trace tourne vers l'interieur (cote
 *   concave = interieur : creneaux sur le cote bombe, dehors), `inside`
 *   sinon (virage rentrant : creneaux du cote concave, dehors), et rotation
 *   de la table ci-dessus.
 */
export function wallPieceFacing(piece: WallTracePiece, interiorSign: number):
  | { kind: 'straight'; outwardX: number; outwardZ: number }
  | { kind: 'corner'; variant: 'outside' | 'inside'; rotationY: number } {
  if (piece.kind !== 'corner') {
    // Normale "+" de d : (-d.z, d.x) ; l'interieur est du cote interiorSign.
    return { kind: 'straight', outwardX: interiorSign * piece.dir.z, outwardZ: -interiorSign * piece.dir.x };
  }
  const turn = Math.sign(cross(piece.inDir, piece.outDir.x, piece.outDir.z));
  const arms = [dirName({ x: -piece.inDir.x, z: -piece.inDir.z }), dirName(piece.outDir)].sort().join('|');
  return { kind: 'corner', variant: turn === interiorSign ? 'outside' : 'inside', rotationY: CORNER_ROTATION_BY_ARMS[arms] ?? 0 };
}

/** Emprise d'un segment de muraille deja pose (coin et taille en cases). */
export interface WallJoinPiece {
  cornerX: number;
  cornerZ: number;
  tilesX: number;
  tilesZ: number;
}

/** Extremites d'un segment qui butent contre le FLANC d'un segment
 *  perpendiculaire (virage fait de deux segments droits, anciennes cartes) :
 *  la case juste au-dela de l'extremite appartient a un segment de l'autre
 *  axe. `minEnd` = extremite du cote des coordonnees basses le long du
 *  segment, `maxEnd` = l'autre. Sert au raccord VISUEL (render/buildings.ts) :
 *  le modele, plus etroit que sa case, laisserait sinon un petit decroche. */
export function wallEndJoins(piece: WallJoinPiece, others: readonly WallJoinPiece[]): { minEnd: boolean; maxEnd: boolean } {
  const horizontal = piece.tilesX >= piece.tilesZ;
  const covers = (p: WallJoinPiece, x: number, z: number): boolean => x >= p.cornerX && x < p.cornerX + p.tilesX && z >= p.cornerZ && z < p.cornerZ + p.tilesZ;
  const perpendicularAt = (x: number, z: number): boolean => others.some((p) => p !== piece && p.tilesX >= p.tilesZ !== horizontal && covers(p, x, z));
  return horizontal
    ? { minEnd: perpendicularAt(piece.cornerX - 1, piece.cornerZ), maxEnd: perpendicularAt(piece.cornerX + piece.tilesX, piece.cornerZ) }
    : { minEnd: perpendicularAt(piece.cornerX, piece.cornerZ - 1), maxEnd: perpendicularAt(piece.cornerX, piece.cornerZ + piece.tilesZ) };
}
