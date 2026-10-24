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
  /** Direction de chaque portion validee. */
  dirs: TraceDir[];
}

/** Disposition d'un trace : pieces construites et cases en attente. */
export interface TraceLayout {
  pieces: WallTracePiece[];
  waiting: TraceCell[];
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
}

export function traceCellAt(x: number, z: number): TraceCell {
  return { x: Math.floor(x), z: Math.floor(z) };
}

export function startWallTrace(cell: TraceCell): WallTrace {
  return { first: { ...cell }, anchor: { ...cell }, vertices: [{ ...cell }], dirs: [] };
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
export function traceLayout(vertices: readonly TraceCell[], dirs: readonly TraceDir[], mode: TraceLayoutMode): TraceLayout {
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
  const addCorner = (index: number, inDir: TraceDir, outDir: TraceDir): void => {
    if (sameDir(inDir, outDir)) return;
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
      if (run.startOpen) {
        waiting.push(cells[0]!.cell);
        cells = cells.slice(1);
      }
      if (run.endOpen && cells.length > 0) {
        waiting.push(cells[cells.length - 1]!.cell);
        cells = cells.slice(0, -1);
      }
      if (cells.length % 2 === 1 && (run.startOpen || run.endOpen)) {
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
  return { pieces, waiting };
}

/** Portion de l'ancre vers le curseur (x, z), exactement de la longueur
 *  demandee — voir le commentaire du module. Fermeture : au moins deux
 *  portions validees, curseur sur la case de depart ou une case voisine
 *  (8-voisinage), ancre alignee avec elle. */
export function planWallTraceLeg(trace: WallTrace, cursorX: number, cursorZ: number): WallTraceLeg {
  const cursor = traceCellAt(cursorX, cursorZ);
  const { anchor, first } = trace;
  const prev = trace.dirs[trace.dirs.length - 1] ?? null;
  const nearFirst = Math.max(Math.abs(cursor.x - first.x), Math.abs(cursor.z - first.z)) <= 1;
  const closes = trace.dirs.length >= 2 && nearFirst && !sameCell(anchor, first) && (anchor.x === first.x || anchor.z === first.z);

  let dir: TraceDir;
  let length: number;
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
    return { end, dir, closes: false, single: true, usable: true, before: { pieces: [], waiting: [] }, after: { pieces: [{ kind: 'half', cornerX: first.x, cornerZ: first.z, tilesX: 1, tilesZ: 1, dir }], waiting: [] } };
  }
  return {
    single: false,
    end,
    dir,
    closes,
    before: traceLayout(trace.vertices, trace.dirs, 'open'),
    after: closes ? traceLayout(trace.vertices, dirs, 'closed') : traceLayout([...trace.vertices, end], dirs, 'open'),
    usable: length > 0 && !backwards && closeOk,
  };
}

/** Trace apres validation de `leg` : null si l'enceinte est fermee (trace
 *  termine), sinon la portion suivante part de son extremite. */
export function advanceWallTrace(trace: WallTrace, leg: WallTraceLeg): WallTrace | null {
  if (leg.closes || leg.single) return null;
  return { first: trace.first, anchor: { ...leg.end }, vertices: [...trace.vertices, { ...leg.end }], dirs: [...trace.dirs, leg.dir] };
}

/** Trace termine sans fermeture (Echap, clic droit, changement d'outil) :
 *  passage de la disposition en cours a la disposition finale, ou les cases
 *  en attente deviennent des pieces droites. */
export function finalizeWallTrace(trace: WallTrace): { before: TraceLayout; after: TraceLayout } {
  return { before: traceLayout(trace.vertices, trace.dirs, 'open'), after: traceLayout(trace.vertices, trace.dirs, 'final') };
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
