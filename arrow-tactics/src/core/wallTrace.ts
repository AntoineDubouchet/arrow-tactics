/**
 * Trace continu d'une enceinte de murailles (pose en preparation et dans
 * l'editeur) : chaque clic ajoute une PORTION droite (axe dominant, jamais de
 * diagonale) depuis l'ancre courante ; son extremite devient la nouvelle
 * ancre ; un clic sur la case de depart (ou a cote, si l'ancre lui est
 * alignee) ferme l'enceinte.
 *
 * Le pack KayKit n'a aucun coin a 90° (ses angles font 120° et 60°) : les
 * virages sont faits de segments DROITS 2 x 1. Les cases du trace sont
 * appariees deux a deux dans l'ordre du chemin ; une paire qui enjambe un
 * virage donne un segment dans le sens de la portion suivante, qui couvre
 * la case du coin. Deux segments voisins partagent donc toujours une arete
 * entiere (jamais un simple coin) : l'enceinte est etanche. Une case
 * restee seule en fin de portion est EN ATTENTE (`pending`) : construite
 * avec la premiere case de la portion suivante. Une boucle fermee sur la
 * grille a toujours un nombre pair de cases, la fermeture n'en laisse donc
 * aucune.
 *
 * Pur (aucun etat global, aucun rendu) : coordonnees de CASE entieres
 * (Math.floor du point au sol), comme les coins d'emprise de la pose.
 */

export interface TraceCell {
  x: number;
  z: number;
}

/** Segment 2 x 1 du trace : coin de grille, emprise et rotation (0 = axe X,
 *  pi/2 = axe Z, meme convention que buildingFootprintTiles). */
export interface WallTracePiece {
  cornerX: number;
  cornerZ: number;
  tilesX: number;
  tilesZ: number;
  rotationY: number;
}

export interface WallTrace {
  /** Case du premier clic : un clic dessus ferme l'enceinte. */
  first: TraceCell;
  /** Extremite de la derniere portion validee (case du premier clic avant). */
  anchor: TraceCell;
  /** Case du trace pas encore construite (toujours l'ancre si non nulle). */
  pending: TraceCell | null;
  /** Portions validees depuis le premier clic. */
  legs: number;
  /** Sommets du trace (case de depart puis extremite de chaque portion) :
   *  le polygone de l'enceinte une fois fermee. */
  vertices: TraceCell[];
  /** Segments deja construits par ce trace (orientes a la fermeture). */
  pieces: WallTracePiece[];
}

/** Portion proposee de l'ancre au curseur. */
export interface WallTraceLeg {
  /** Extremite de la portion (nouvelle ancre si elle est validee). */
  end: TraceCell;
  horizontal: boolean;
  /** Vrai si la portion revient sur la case de depart et ferme l'enceinte. */
  closes: boolean;
  /** Segments a construire (toutes les paires completes). */
  pieces: WallTracePiece[];
  /** Case laissee en attente apres la portion. */
  pending: TraceCell | null;
  /** Faux si la portion ne peut pas etre validee : longueur nulle, ou
   *  fermeture qui laisserait une case seule (boucle degeneree). */
  usable: boolean;
}

export function traceCellAt(x: number, z: number): TraceCell {
  return { x: Math.floor(x), z: Math.floor(z) };
}

export function startWallTrace(cell: TraceCell): WallTrace {
  return { first: { ...cell }, anchor: { ...cell }, pending: { ...cell }, legs: 0, vertices: [{ ...cell }], pieces: [] };
}

const sameCell = (a: TraceCell, b: TraceCell): boolean => a.x === b.x && a.z === b.z;

/** Segment couvrant deux cases voisines. */
function pieceFor(a: TraceCell, b: TraceCell): WallTracePiece {
  const horizontal = a.z === b.z;
  return {
    cornerX: Math.min(a.x, b.x),
    cornerZ: Math.min(a.z, b.z),
    tilesX: horizontal ? 2 : 1,
    tilesZ: horizontal ? 1 : 2,
    rotationY: horizontal ? 0 : Math.PI / 2,
  };
}

/** Portion de l'ancre vers le curseur (x, z) — voir le commentaire du
 *  module. Fermeture : au moins deux portions validees, curseur sur la case
 *  de depart ou une case voisine (8-voisinage), ancre alignee avec elle. */
export function planWallTraceLeg(trace: WallTrace, cursorX: number, cursorZ: number): WallTraceLeg {
  const cursor = traceCellAt(cursorX, cursorZ);
  const { anchor, first } = trace;
  const nearFirst = Math.max(Math.abs(cursor.x - first.x), Math.abs(cursor.z - first.z)) <= 1;
  const closes = trace.legs >= 2 && nearFirst && !sameCell(anchor, first) && (anchor.x === first.x || anchor.z === first.z);

  let end: TraceCell;
  let horizontal: boolean;
  if (closes) {
    end = { ...first };
    horizontal = anchor.z === first.z;
  } else {
    const dx = cursor.x - anchor.x;
    const dz = cursor.z - anchor.z;
    horizontal = Math.abs(dx) >= Math.abs(dz);
    end = horizontal ? { x: cursor.x, z: anchor.z } : { x: anchor.x, z: cursor.z };
  }

  // Cases nouvelles, de l'ancre (exclue) a l'extremite (incluse, sauf la
  // case de depart d'une fermeture, deja construite).
  const cells: TraceCell[] = [];
  const stepX = Math.sign(end.x - anchor.x);
  const stepZ = Math.sign(end.z - anchor.z);
  const length = Math.abs(end.x - anchor.x) + Math.abs(end.z - anchor.z);
  for (let k = 1; k <= length; k++) cells.push({ x: anchor.x + stepX * k, z: anchor.z + stepZ * k });
  if (closes) cells.pop();

  const ordered = trace.pending ? [trace.pending, ...cells] : cells;
  const pieces: WallTracePiece[] = [];
  for (let k = 0; k + 1 < ordered.length; k += 2) pieces.push(pieceFor(ordered[k]!, ordered[k + 1]!));
  const pending = ordered.length % 2 === 1 ? ordered[ordered.length - 1]! : null;

  return { end, horizontal, closes, pieces, pending, usable: length > 0 && !(closes && pending !== null) };
}

/** Emprise d'un segment de muraille deja pose (coin et taille en cases). */
export interface WallJoinPiece {
  cornerX: number;
  cornerZ: number;
  tilesX: number;
  tilesZ: number;
}

/** Extremites d'un segment qui butent contre le FLANC d'un segment
 *  perpendiculaire (virage, jonction en T) : la case juste au-dela de
 *  l'extremite appartient a un segment de l'autre axe. `minEnd` = extremite
 *  du cote des coordonnees basses le long du segment, `maxEnd` = l'autre.
 *  Sert au raccord VISUEL des virages (render/buildings.ts) : le modele,
 *  plus etroit que sa case, laisserait sinon un petit decroche au coin. */
export function wallEndJoins(piece: WallJoinPiece, others: readonly WallJoinPiece[]): { minEnd: boolean; maxEnd: boolean } {
  const horizontal = piece.tilesX >= piece.tilesZ;
  const covers = (p: WallJoinPiece, x: number, z: number): boolean => x >= p.cornerX && x < p.cornerX + p.tilesX && z >= p.cornerZ && z < p.cornerZ + p.tilesZ;
  const perpendicularAt = (x: number, z: number): boolean => others.some((p) => p !== piece && p.tilesX >= p.tilesZ !== horizontal && covers(p, x, z));
  return horizontal
    ? { minEnd: perpendicularAt(piece.cornerX - 1, piece.cornerZ), maxEnd: perpendicularAt(piece.cornerX + piece.tilesX, piece.cornerZ) }
    : { minEnd: perpendicularAt(piece.cornerX, piece.cornerZ - 1), maxEnd: perpendicularAt(piece.cornerX, piece.cornerZ + piece.tilesZ) };
}

/** Trace apres validation de `leg` : null si l'enceinte est fermee (trace
 *  termine), sinon la portion suivante part de son extremite. */
export function advanceWallTrace(trace: WallTrace, leg: WallTraceLeg): WallTrace | null {
  if (leg.closes) return null;
  return {
    first: trace.first,
    anchor: { ...leg.end },
    pending: leg.pending ? { ...leg.pending } : null,
    legs: trace.legs + 1,
    vertices: [...trace.vertices, { ...leg.end }],
    pieces: [...trace.pieces, ...leg.pieces],
  };
}

/** Point (x, z) strictement dans le polygone (regle pair-impair). */
function insidePolygon(x: number, z: number, polygon: readonly { x: number; z: number }[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]!;
    const b = polygon[j]!;
    if (a.z > z !== b.z > z && x < ((b.x - a.x) * (z - a.z)) / (b.z - a.z) + a.x) inside = !inside;
  }
  return inside;
}

/** Enceinte qui vient d'etre FERMEE par `leg` : pour chacun de ses segments
 *  (deja construits et ceux de la portion de fermeture), la direction de
 *  l'EXTERIEUR (vecteur unitaire sur X ou Z), perpendiculaire au segment.
 *  Le polygone passe par le centre des cases des sommets ; on sonde une
 *  demi-case de part et d'autre du centre du segment : le cote hors du
 *  polygone est l'exterieur. Independant du sens de dessin (horaire ou non)
 *  et de toute notion de camp ou de nord/sud. Vide si `leg` ne ferme pas. */
export function closedEnclosureFacings(trace: WallTrace, leg: WallTraceLeg): { piece: WallTracePiece; outwardX: number; outwardZ: number }[] {
  if (!leg.closes) return [];
  const polygon = trace.vertices.map((v) => ({ x: v.x + 0.5, z: v.z + 0.5 }));
  return [...trace.pieces, ...leg.pieces].map((piece) => {
    const cx = piece.cornerX + piece.tilesX / 2;
    const cz = piece.cornerZ + piece.tilesZ / 2;
    const horizontal = piece.tilesX >= piece.tilesZ;
    const nx = horizontal ? 0 : 1;
    const nz = horizontal ? 1 : 0;
    const plusInside = insidePolygon(cx + nx * 0.5, cz + nz * 0.5, polygon);
    return { piece, outwardX: plusInside ? -nx : nx, outwardZ: plusInside ? -nz : nz };
  });
}
