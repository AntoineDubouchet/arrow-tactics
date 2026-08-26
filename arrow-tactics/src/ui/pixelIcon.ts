/**
 * Icônes en "pixel art" générées par code (2026-08-11, demande d'Antoine :
 * "fais quelque chose dans un style pixélisé, c'est une patte artistique que
 * nous prendrons pour certains sprites") — même règle "aucun asset
 * graphique" que le reste du projet (voir itemIcons.ts pour les icônes SVG
 * existantes) : chaque icône est une grille de petits carrés (`<rect>` SVG
 * de 1×1 unité), jamais une image importée. Contrairement à itemIcons.ts
 * (traits fins, arrondis), ce style est délibérément BLOC — pas
 * d'anti-aliasing, des couleurs plates, un contour sombre net — pour lire
 * comme un sprite 8-bit même à petite taille.
 *
 * Premier essai (pièce d'or, voir createCoinIcon) : Antoine a fourni deux
 * images de référence et une préférence explicite pour la seconde (contour
 * noir net, plus simple à reproduire) — voir CLAUDE.md. Aucune vérification
 * visuelle possible de mon côté : à confirmer/ajuster une fois vu dans le
 * navigateur.
 */

/** Grille de couleurs CSS (chaîne vide = transparent) — un élément par
 *  "pixel", indexé [y][x]. */
export type PixelGrid = string[][];

/** Construit un SVG a partir d'une grille de pixels : un <rect> de 1x1 par
 *  case non-transparente, dans un viewBox de la taille de la grille — le
 *  redimensionnement (voir `size`) se fait donc par mise a l'echelle
 *  entiere de tout le SVG, jamais par un rendu flou. */
export function buildPixelIcon(grid: PixelGrid, size: number): SVGSVGElement {
  const height = grid.length;
  const width = grid[0]?.length ?? 0;
  const svgNs = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNs, 'svg');
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('width', `${size}`);
  svg.setAttribute('height', `${size}`);
  svg.classList.add('pixel-icon');

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const color = grid[y]![x];
      if (!color) continue;
      const rect = document.createElementNS(svgNs, 'rect');
      rect.setAttribute('x', String(x));
      rect.setAttribute('y', String(y));
      rect.setAttribute('width', '1');
      rect.setAttribute('height', '1');
      rect.setAttribute('fill', color);
      svg.appendChild(rect);
    }
  }

  return svg;
}

const COIN_SIZE = 13;
const COIN_CENTER = 6; // (COIN_SIZE - 1) / 2, taille impaire pour un centre entier.
const COIN_RADIUS = 6.3;

const COIN_COLORS = {
  outline: '#2b1d0e',
  highlight: '#fff3b0',
  fill: '#f6c445',
  shadow: '#c9861f',
};

/** Glyphe "$" en coordonnees relatives au centre de la piece — trace a la
 *  main (voir en-tete de fichier), pas procedural : un signe dollar ne se
 *  deduit pas d'une formule de distance comme le contour rond. */
const DOLLAR_GLYPH: ReadonlyArray<readonly [number, number]> = [
  [0, -3],
  [-1, -2],
  [0, -2],
  [1, -2],
  [-1, -1],
  [-1, 0],
  [0, 0],
  [1, 1],
  [-1, 2],
  [0, 2],
  [1, 2],
  [0, 3],
];

function buildCoinGrid(): PixelGrid {
  const grid: PixelGrid = [];
  for (let y = 0; y < COIN_SIZE; y++) {
    const row: string[] = [];
    for (let x = 0; x < COIN_SIZE; x++) {
      const dx = x - COIN_CENTER;
      const dy = y - COIN_CENTER;
      const dist = Math.hypot(dx, dy);

      if (dist > COIN_RADIUS) {
        row.push('');
        continue;
      }
      if (DOLLAR_GLYPH.some(([gx, gy]) => gx === dx && gy === dy)) {
        row.push(COIN_COLORS.outline);
        continue;
      }
      if (dist > COIN_RADIUS - 1.1) {
        row.push(COIN_COLORS.outline);
      } else if (dx + dy <= -4) {
        row.push(COIN_COLORS.highlight);
      } else if (dx + dy >= 5) {
        row.push(COIN_COLORS.shadow);
      } else {
        row.push(COIN_COLORS.fill);
      }
    }
    grid.push(row);
  }
  return grid;
}

/** Exportee pour verification headless (grille pure, sans DOM) — voir
 *  scripts de test temporaires. */
export const coinGrid = buildCoinGrid();

/** Icône de pièce d'or, style pixel art — voir en-tête de fichier. `size`
 *  en pixels CSS (l'icône reste carrée). */
export function createCoinIcon(size: number): SVGSVGElement {
  return buildPixelIcon(coinGrid, size);
}

/** Icône "Rune d'amélioration" (2026-08-13, boutique d'amélioration
 *  permanente des unités — voir CLAUDE.md) — même technique que la pièce
 *  ci-dessus, teinte VIOLETTE pour se distinguer nettement de l'or (jaune) à
 *  l'écran : un losange (contour "diamant" par distance de Chebyshev
 *  tournée à 45°, même principe que le cercle de la pièce) avec un petit
 *  glyphe anguleux tracé à la main au centre (une rune ne se déduit pas
 *  d'une formule géométrique, comme le "$" de la pièce). */
const RUNE_SIZE = 13;
const RUNE_CENTER = 6;

const RUNE_COLORS = {
  outline: '#241636',
  highlight: '#c9a6ff',
  fill: '#8a4fe0',
  shadow: '#5a2fa0',
};

/** Glyphe trace a la main, coordonnees relatives au centre — une forme en
 *  eclair anguleux, lisible meme a petite taille. */
const RUNE_GLYPH: ReadonlyArray<readonly [number, number]> = [
  [1, -3],
  [0, -2],
  [1, -2],
  [0, -1],
  [-1, 0],
  [0, 0],
  [-1, 1],
  [0, 2],
  [-1, 3],
];

function buildRuneGrid(): PixelGrid {
  const grid: PixelGrid = [];
  for (let y = 0; y < RUNE_SIZE; y++) {
    const row: string[] = [];
    for (let x = 0; x < RUNE_SIZE; x++) {
      const dx = x - RUNE_CENTER;
      const dy = y - RUNE_CENTER;
      // Distance "losange" (Manhattan) plutot qu'euclidienne (piece) — donne
      // un contour en diamant au lieu d'un cercle.
      const diamondDist = Math.abs(dx) + Math.abs(dy);

      if (diamondDist > RUNE_CENTER) {
        row.push('');
        continue;
      }
      if (RUNE_GLYPH.some(([gx, gy]) => gx === dx && gy === dy)) {
        row.push(RUNE_COLORS.outline);
        continue;
      }
      if (diamondDist > RUNE_CENTER - 1.6) {
        row.push(RUNE_COLORS.outline);
      } else if (dx - dy <= -3) {
        row.push(RUNE_COLORS.highlight);
      } else if (dx - dy >= 4) {
        row.push(RUNE_COLORS.shadow);
      } else {
        row.push(RUNE_COLORS.fill);
      }
    }
    grid.push(row);
  }
  return grid;
}

/** Exportee pour verification headless (grille pure, sans DOM). */
export const runeGrid = buildRuneGrid();

/** Icône de rune d'amélioration, style pixel art — voir en-tête de fichier.
 *  `size` en pixels CSS (l'icône reste carrée). */
export function createRuneIcon(size: number): SVGSVGElement {
  return buildPixelIcon(runeGrid, size);
}
