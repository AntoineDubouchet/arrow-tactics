// Textures de sol (herbe, terre, mixte ; paves, sable, roche, volcan, lave, eau) : generation procedurale
// deterministe (graine fixe par texture, aucun Math.random), toutes
// raccordables (bruit periodique, traits dessines en boucle sur les bords).
// Ecrit les PNG dans public/textures/ground/variants/ (lus par
// src/render/groundSurfaces.ts) et, avec --sheet <fichier.png>, une planche
// de comparaison (chaque texture repetee 2 × 2, pour juger le raccord).
// Usage (depuis arrow-tactics/) : node tools/ground-textures/generate.mjs [--sheet <png>]
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT_DIR = path.join(ROOT, 'public/textures/ground/variants');

// ---------------------------------------------------------------------------
// PNG (RGB 8 bits, sans filtre de ligne), CRC et morceaux standard.

const CRC_TABLE = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
function crc32(buffer) {
  let c = -1;
  for (const b of buffer) c = CRC_TABLE[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const name = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, crc]);
}
function encodePng(width, height, rgb) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 3 + 1)] = 0;
    rgb.copy(raw, y * (width * 3 + 1) + 1, y * width * 3, (y + 1) * width * 3);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------------------
// Outils de dessin : graine (mulberry32, comme src/core/rng.ts), bruit de
// valeur periodique, image flottante RGB (sRGB 0..255) avec melange en boucle.

function rngOf(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const smooth = (t) => t * t * (3 - 2 * t);

/** Bruit de valeur periodique sur une image `size` : `cells` noeuds par cote. */
function valueNoise(rand, size, cells) {
  const lattice = Array.from({ length: cells * cells }, () => rand());
  const at = (i, j) => lattice[(((j % cells) + cells) % cells) * cells + (((i % cells) + cells) % cells)];
  return (x, y) => {
    const fx = (x / size) * cells;
    const fy = (y / size) * cells;
    const i = Math.floor(fx);
    const j = Math.floor(fy);
    const tx = smooth(fx - i);
    const ty = smooth(fy - j);
    const top = at(i, j) + (at(i + 1, j) - at(i, j)) * tx;
    const bottom = at(i, j + 1) + (at(i + 1, j + 1) - at(i, j + 1)) * tx;
    return top + (bottom - top) * ty;
  };
}

/** Somme d'octaves periodiques, normalisee dans [0, 1]. */
function fbm(rand, size, baseCells, octaves) {
  const layers = Array.from({ length: octaves }, (_, k) => valueNoise(rand, size, baseCells << k));
  return (x, y) => {
    let sum = 0;
    let norm = 0;
    layers.forEach((n, k) => {
      const w = 1 / (1 << k);
      sum += n(x, y) * w;
      norm += w;
    });
    return sum / norm;
  };
}

class Image {
  constructor(size, base) {
    this.size = size;
    this.data = new Float32Array(size * size * 3);
    for (let i = 0; i < size * size; i++) this.data.set(base, i * 3);
  }
  index(x, y) {
    const s = this.size;
    return ((((Math.floor(y) % s) + s) % s) * s + (((Math.floor(x) % s) + s) % s)) * 3;
  }
  get(x, y) {
    const i = this.index(x, y);
    return [this.data[i], this.data[i + 1], this.data[i + 2]];
  }
  /** Melange `color` au pixel (x, y), en boucle sur les bords. */
  blend(x, y, color, alpha) {
    if (alpha <= 0) return;
    const i = this.index(x, y);
    for (let c = 0; c < 3; c++) this.data[i + c] += (color[c] - this.data[i + c]) * Math.min(1, alpha);
  }
  /** Multiplie chaque pixel par f(x, y) (variation de luminosite). */
  shade(f) {
    for (let y = 0; y < this.size; y++) {
      for (let x = 0; x < this.size; x++) {
        const k = f(x, y);
        const i = (y * this.size + x) * 3;
        for (let c = 0; c < 3; c++) this.data[i + c] *= k;
      }
    }
  }
  /** Disque plein a bord adouci (1 pixel). */
  disc(cx, cy, r, color, alpha) {
    const reach = Math.ceil(r + 1);
    for (let y = Math.floor(cy) - reach; y <= Math.floor(cy) + reach; y++) {
      for (let x = Math.floor(cx) - reach; x <= Math.floor(cx) + reach; x++) {
        const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
        this.blend(x, y, color, alpha * Math.max(0, Math.min(1, r + 0.5 - d)));
      }
    }
  }
  /** Brin : trait effile de la base (x, y) vers son extremite. */
  blade(x, y, length, angle, width, color, alpha) {
    const steps = Math.max(2, Math.ceil(length * 2));
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      this.disc(x + Math.sin(angle) * length * t, y - Math.cos(angle) * length * t, (width / 2) * (1 - t * 0.85), color, alpha);
    }
  }
  toRgb() {
    const out = Buffer.alloc(this.size * this.size * 3);
    for (let i = 0; i < out.length; i++) out[i] = Math.max(0, Math.min(255, Math.round(this.data[i])));
    return out;
  }
}

const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const scale = (c, k) => c.map((v) => v * k);

/** Voronoi periodique (pierres, dalles, croute) : `n` × `n` cellules, un point
 *  par cellule decale de `jitter`. Pour (x, y) : distances au point le plus
 *  proche et au suivant, indice et position du plus proche. */
function voronoi(rand, size, n, jitter) {
  const step = size / n;
  const pts = Array.from({ length: n * n }, (_, k) => [((k % n) + 0.5 + (rand() - 0.5) * jitter) * step, (Math.floor(k / n) + 0.5 + (rand() - 0.5) * jitter) * step]);
  return (x, y) => {
    const ci = Math.floor(x / step);
    const cj = Math.floor(y / step);
    let d1 = Infinity;
    let d2 = Infinity;
    let id = 0;
    let px = 0;
    let py = 0;
    for (let dj = -2; dj <= 2; dj++) {
      for (let di = -2; di <= 2; di++) {
        const i = ci + di;
        const j = cj + dj;
        const wi = ((i % n) + n) % n;
        const wj = ((j % n) + n) % n;
        const p = pts[wj * n + wi];
        const qx = p[0] + (i - wi) * step;
        const qy = p[1] + (j - wj) * step;
        const d = Math.hypot(x - qx, y - qy);
        if (d < d1) {
          d2 = d1;
          d1 = d;
          id = wj * n + wi;
          px = qx;
          py = qy;
        } else if (d < d2) d2 = d;
      }
    }
    return { d1, d2, id, px, py, step };
  };
}

/** Pierres jointives (paves, dalles, croute) : couleur par pierre (`tone`),
 *  joint de largeur `joint` (pixels) couleur `mortar`, bord de pierre assombri
 *  (`rim`, sans direction de lumiere : la scene eclaire). `fade` (0..1) :
 *  part des joints effacee par endroits (roche d'un seul tenant, fissures
 *  interrompues). */
function stones(size, seed, { n, jitter, joint, mortar, tone, rim, grain, fade = 0 }) {
  const rand = rngOf(seed);
  const v = voronoi(rand, size, n, jitter);
  const g = fbm(rand, size, 8, 2);
  const tones = Array.from({ length: n * n }, () => [rand(), rand()]);
  const gaps = fbm(rand, size, 3, 2);
  const img = new Image(size, mortar);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const c = v(x + 0.5, y + 0.5);
      const edge = (c.d2 - c.d1) / 2;
      const open = fade > 0 ? smooth(Math.max(0, Math.min(1, (gaps(x, y) - fade * 0.6 - 0.2) / 0.12))) : 1;
      const inside = 1 - (1 - smooth(Math.max(0, Math.min(1, (edge - joint) / 1.5)))) * open;
      const [a, b] = tones[c.id];
      const stone = scale(tone(a, b), 1 - rim * (1 - smooth(Math.min(1, (edge - joint) / (c.step * 0.22)))));
      const k = 1 + (g(x, y) - 0.5) * grain;
      img.data.set(scale(mix(mortar, stone, inside), k), (y * size + x) * 3);
    }
  }
  return { img, v, rand };
}

// ---------------------------------------------------------------------------
// Teintes communes (sRGB), centrees sur l'herbe actuelle (ground_grass.png,
// moyenne 67, 115, 52) et sa terre (119, 82, 43) : un lot coherent entre lui
// et avec le jeu.

const GRASS = [68, 116, 52];
const GRASS_LIGHT = [84, 134, 60];
const GRASS_DARK = [54, 96, 43];
const DIRT = [121, 86, 52];
const DIRT_LIGHT = [146, 112, 76];
const DIRT_DARK = [94, 66, 41];

/** Herbe de base : aplat, plaques douces, brins courts. */
function grassField(size, seed, { base, light, dark, patch, blades, length, width, alpha }) {
  const rand = rngOf(seed);
  const img = new Image(size, base);
  const n = fbm(rand, size, 2, 3);
  img.shade((x, y) => 1 + (n(x, y) - 0.5) * patch);
  for (let k = 0; k < blades; k++) {
    const x = rand() * size;
    const y = rand() * size;
    const c = rand() < 0.5 ? light : dark;
    img.blade(x, y, length * (0.7 + rand() * 0.6), (rand() - 0.5) * 0.9, width, c, alpha * (0.6 + rand() * 0.4));
  }
  return img;
}

/** Plaques de terre couvrant environ `coverage` de l'image (seuil pris sur
 *  la distribution du bruit), bord adouci sur `edge`. */
function dirtPatches(img, seed, coverage, edge) {
  const rand = rngOf(seed);
  const n = fbm(rand, img.size, 2, 4);
  const grain = fbm(rand, img.size, 8, 2);
  const values = [];
  for (let y = 0; y < img.size; y += 4) for (let x = 0; x < img.size; x += 4) values.push(n(x, y));
  values.sort((a, b) => a - b);
  const threshold = values[Math.floor(values.length * (1 - coverage))];
  const mask = new Float32Array(img.size * img.size);
  for (let y = 0; y < img.size; y++) {
    for (let x = 0; x < img.size; x++) {
      const t = smooth(Math.max(0, Math.min(1, (n(x, y) - threshold) / edge + 0.5)));
      mask[y * img.size + x] = t;
      const dirt = scale(DIRT, 0.94 + grain(x, y) * 0.12);
      img.blend(x, y, dirt, t);
    }
  }
  return mask;
}

// ---------------------------------------------------------------------------
// Le lot : 6 herbes, 2 terres, 2 mixtes, puis le catalogue elargi.

const TEXTURES = [
  {
    file: 'herbe-classique.png',
    size: 256,
    draw: (size) => grassField(size, 0x1a2b3c4d, { base: GRASS, light: GRASS_LIGHT, dark: GRASS_DARK, patch: 0.12, blades: 1400, length: 6, width: 1.6, alpha: 0.45 }),
  },
  {
    file: 'herbe-prairie.png',
    size: 256,
    draw: (size) => grassField(size, 0x2c3d4e5f, { base: [78, 126, 56], light: [98, 148, 66], dark: [62, 106, 48], patch: 0.18, blades: 1700, length: 5, width: 1.5, alpha: 0.5 }),
  },
  {
    file: 'herbe-dense.png',
    size: 256,
    draw: (size) => {
      const rand = rngOf(0x3e4f5a6b);
      const img = grassField(size, 0x3e4f5a6c, { base: [60, 106, 47], light: [76, 126, 56], dark: [46, 84, 38], patch: 0.2, blades: 900, length: 7, width: 1.7, alpha: 0.45 });
      // Touffes : ombre a la base, brins en eventail, quelques pointes claires.
      for (let k = 0; k < 70; k++) {
        const x = rand() * size;
        const y = rand() * size;
        img.disc(x, y + 1, 4 + rand() * 2, [40, 74, 34], 0.35);
        const count = 9 + Math.floor(rand() * 8);
        for (let b = 0; b < count; b++) {
          const c = mix([54, 96, 43], [92, 142, 62], rand());
          img.blade(x + (rand() - 0.5) * 5, y, 8 + rand() * 6, (rand() - 0.5) * 1.4, 1.8, c, 0.8);
        }
      }
      return img;
    },
  },
  {
    file: 'herbe-stylisee.png',
    size: 256,
    draw: (size) => {
      const rand = rngOf(0x4a5b6c7d);
      const img = new Image(size, GRASS);
      // Trois aplats (bruit quantifie, transitions d'un pixel), puis petites
      // touffes en V a la facon d'un rendu peint simplifie.
      const n = fbm(rand, size, 4, 2);
      const tones = [[63, 109, 49], GRASS, [74, 123, 55]];
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const v = n(x, y) * 3;
          const i = Math.min(2, Math.floor(v));
          const f = v - i;
          const next = Math.min(2, i + 1);
          const t = f > 0.9 ? (f - 0.9) / 0.1 : 0;
          img.data.set(mix(tones[i], tones[next], t * 0.5), (y * size + x) * 3);
        }
      }
      for (let k = 0; k < 150; k++) {
        const x = rand() * size;
        const y = rand() * size;
        const tone = rand();
        const body = mix([62, 108, 48], [86, 138, 60], tone);
        const tip = mix(body, [110, 160, 70], 0.55);
        for (const a of [-0.55, 0, 0.55]) {
          const len = (a === 0 ? 9 : 7) + rand() * 2;
          img.blade(x, y, len, a + (rand() - 0.5) * 0.15, 2.6, body, 0.95);
          img.blade(x + Math.sin(a) * len * 0.45, y - Math.cos(a) * len * 0.45, len * 0.5, a, 1.4, tip, 0.9);
        }
      }
      return img;
    },
  },
  {
    file: 'herbe-pixel-net.png',
    size: 32,
    nearest: true,
    draw: (size) => {
      // 16 texels par case : plaques de blocs 2 × 2, cinq teintes proches.
      const rand = rngOf(0x2545f491);
      const img = new Image(size, GRASS);
      const n = valueNoise(rand, size, 4);
      const shades = [[57, 100, 44], [62, 108, 48], [68, 117, 52], [74, 125, 55], [81, 134, 59]];
      const blocks = size / 2;
      const jitter = Array.from({ length: blocks * blocks }, () => rand() - 0.5);
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const v = n(Math.floor(x / 2) * 2 + 1, Math.floor(y / 2) * 2 + 1) + jitter[Math.floor(y / 2) * blocks + Math.floor(x / 2)] * 0.35;
          img.data.set(shades[v < 0.22 ? 0 : v < 0.4 ? 1 : v < 0.62 ? 2 : v < 0.8 ? 3 : 4], (y * size + x) * 3);
        }
      }
      return img;
    },
  },
  {
    file: 'herbe-pixel-touffes.png',
    size: 64,
    nearest: true,
    draw: (size) => {
      // 32 texels par case : grandes plaques a trois teintes, petites touffes
      // (brin clair sur un pixel d'ombre), quelques brins doubles.
      const rand = rngOf(0x9e3779b9);
      const img = new Image(size, GRASS);
      const n = valueNoise(rand, size, 4);
      const shades = [[54, 96, 43], [63, 109, 49], [68, 117, 52], [74, 124, 55], [88, 140, 62]];
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const v = n(x, y);
          img.data.set(shades[v < 0.38 ? 1 : v < 0.66 ? 2 : 3], (y * size + x) * 3);
        }
      }
      const put = (x, y, s) => img.data.set(shades[s], img.index(x, y));
      for (let k = 0; k < 70; k++) {
        const x = Math.floor(rand() * size);
        const y = Math.floor(rand() * size);
        put(x, y + 1, 0);
        put(x, y, 4);
        if (rand() < 0.5) put(x + 1, y, 3);
        if (rand() < 0.3) put(x - 1, y + 1, 1);
      }
      return img;
    },
  },
  {
    file: 'terre-battue.png',
    size: 256,
    draw: (size) => {
      const rand = rngOf(0x5c6d7e8f);
      const img = new Image(size, DIRT);
      const n = fbm(rand, size, 2, 4);
      img.shade((x, y) => 1 + (n(x, y) - 0.5) * 0.18);
      // Zones plus claires (terre tassee), cailloux clairs a ombre portee.
      const flat = fbm(rand, size, 3, 2);
      for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) img.blend(x, y, DIRT_LIGHT, Math.max(0, flat(x, y) - 0.62) * 0.9);
      for (let k = 0; k < 90; k++) {
        const x = rand() * size;
        const y = rand() * size;
        const r = 1.2 + rand() * 2;
        img.disc(x + 0.6, y + 0.8, r, DIRT_DARK, 0.4);
        img.disc(x, y, r, mix(DIRT_LIGHT, [160, 130, 96], rand()), 0.7);
      }
      return img;
    },
  },
  {
    file: 'terre-strates.png',
    size: 256,
    draw: (size) => {
      // Pour les flancs (UV : le long du bord, hauteur) : strates horizontales
      // ondulees, pierres enchassees, plus sombre que la terre battue.
      const rand = rngOf(0x6e7f8091);
      const base = [100, 72, 46];
      const img = new Image(size, base);
      const wave = valueNoise(rand, size, 4);
      const band = valueNoise(rand, size, 6);
      const grain = fbm(rand, size, 4, 3);
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const v = band(0, y + (wave(x, 0) - 0.5) * 18);
          const tone = mix([90, 64, 42], [120, 88, 58], smooth(v));
          img.data.set(scale(tone, 0.92 + grain(x, y) * 0.16), (y * size + x) * 3);
        }
      }
      for (let k = 0; k < 60; k++) {
        const x = rand() * size;
        const y = rand() * size;
        const r = 2 + rand() * 3;
        img.disc(x + 0.8, y + 1, r, [66, 48, 34], 0.55);
        img.disc(x, y, r, mix([118, 104, 88], [140, 126, 108], rand()), 0.8);
      }
      return img;
    },
  },
  {
    file: 'mixte-taches.png',
    size: 512,
    draw: (size) => {
      // Herbe classique et quelques plaques de terre nue (environ 15 %).
      const rand = rngOf(0x7a8b9cad);
      const img = grassField(size, 0x1a2b3c4d, { base: GRASS, light: GRASS_LIGHT, dark: GRASS_DARK, patch: 0.12, blades: 5600, length: 6, width: 1.6, alpha: 0.45 });
      const mask = dirtPatches(img, 0x7a8b9cae, 0.15, 0.05);
      // Brins qui debordent sur le bord des plaques.
      for (let k = 0; k < 6000; k++) {
        const x = rand() * size;
        const y = rand() * size;
        const m = mask[Math.floor(y) * size + Math.floor(x)];
        if (m < 0.05 || m > 0.6) continue;
        img.blade(x, y, 5 + rand() * 3, (rand() - 0.5) * 0.9, 1.5, rand() < 0.5 ? GRASS : GRASS_DARK, 0.8);
      }
      return img;
    },
  },
  {
    file: 'mixte-usee.png',
    size: 512,
    draw: (size) => {
      // Herbe usee : terre nue sur pres de la moitie, touffes d'herbe dessus.
      const rand = rngOf(0x8b9cadbe);
      const img = grassField(size, 0x8b9cadbf, { base: [64, 110, 50], light: GRASS_LIGHT, dark: GRASS_DARK, patch: 0.14, blades: 4000, length: 6, width: 1.6, alpha: 0.45 });
      const mask = dirtPatches(img, 0x8b9cadc0, 0.45, 0.06);
      for (let k = 0; k < 260; k++) {
        const x = rand() * size;
        const y = rand() * size;
        if (mask[Math.floor(y) * size + Math.floor(x)] < 0.5) continue;
        img.disc(x, y + 1, 3, DIRT_DARK, 0.3);
        for (let b = 0; b < 6; b++) img.blade(x + (rand() - 0.5) * 4, y, 5 + rand() * 4, (rand() - 0.5) * 1.3, 1.5, mix(GRASS_DARK, GRASS_LIGHT, rand()), 0.85);
      }
      for (let k = 0; k < 120; k++) {
        const x = rand() * size;
        const y = rand() * size;
        if (mask[Math.floor(y) * size + Math.floor(x)] < 0.7) continue;
        img.disc(x, y, 1.2 + rand() * 1.3, DIRT_LIGHT, 0.8);
      }
      return img;
    },
  },
  // ---- Catalogue elargi (2026-10-31) : paves, sable, sol rocheux, sol
  // volcanique, lave, eau. Teintes naturelles (le preset `?look=` les accorde).
  {
    file: 'paves-gris.png',
    size: 256,
    draw: (size) => {
      // Paves gris irreguliers (environ 0,2 case), joints terreux.
      const { img } = stones(size, 0x91a2b3c4, {
        n: 10,
        jitter: 0.75,
        joint: 1.4,
        mortar: [92, 84, 72],
        tone: (a, b) => mix(mix([142, 140, 136], [168, 164, 156], a), [150, 140, 124], b * 0.5),
        rim: 0.16,
        grain: 0.1,
      });
      return img;
    },
  },
  {
    file: 'sable.png',
    size: 256,
    draw: (size) => {
      // Sable clair : grain fin, rides douces, quelques grains plus sombres.
      const rand = rngOf(0xa2b3c4d5);
      const img = new Image(size, [218, 196, 150]);
      const grain = fbm(rand, size, 16, 2);
      const warp = valueNoise(rand, size, 3);
      const patch = fbm(rand, size, 2, 3);
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const ripple = Math.sin(((y + (warp(x, y) - 0.5) * 40) / size) * Math.PI * 2 * 6);
          const k = 1 + (grain(x, y) - 0.5) * 0.08 + ripple * 0.025 + (patch(x, y) - 0.5) * 0.08;
          img.data.set(scale([218, 196, 150], k), (y * size + x) * 3);
        }
      }
      for (let k = 0; k < 160; k++) img.disc(rand() * size, rand() * size, 0.6 + rand() * 0.6, rand() < 0.6 ? [176, 150, 112] : [236, 222, 190], 0.6);
      return img;
    },
  },
  {
    file: 'roche-sol.png',
    size: 256,
    draw: (size) => {
      // Sol rocheux : grandes dalles grises chaudes (environ 0,5 case),
      // fissures sombres, graviers.
      const { img, rand } = stones(size, 0xb3c4d5e6, {
        n: 4,
        jitter: 0.9,
        joint: 0.9,
        mortar: [78, 72, 64],
        tone: (a, b) => mix(mix([128, 122, 112], [162, 154, 140], a), [126, 128, 130], b * 0.7),
        rim: 0.1,
        grain: 0.2,
        fade: 0.55,
      });
      for (let k = 0; k < 120; k++) {
        const x = rand() * size;
        const y = rand() * size;
        const r = 0.8 + rand() * 1.6;
        img.disc(x + 0.6, y + 0.8, r, [80, 74, 66], 0.35);
        img.disc(x, y, r, mix([150, 144, 132], [176, 170, 158], rand()), 0.7);
      }
      return img;
    },
  },
  {
    file: 'sol-volcanique.png',
    size: 256,
    draw: (size) => {
      // Basalte sombre : cendre plus claire par plaques, taches rouille, pores.
      const rand = rngOf(0xc4d5e6f7);
      const base = [64, 58, 56];
      const img = new Image(size, base);
      const ash = fbm(rand, size, 2, 4);
      const rust = fbm(rand, size, 3, 3);
      const grain = fbm(rand, size, 12, 2);
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          let c = scale(base, 0.9 + grain(x, y) * 0.2);
          c = mix(c, [100, 94, 90], smooth(Math.max(0, Math.min(1, (ash(x, y) - 0.45) / 0.3))) * 0.55);
          c = mix(c, [112, 66, 48], smooth(Math.max(0, Math.min(1, (rust(x, y) - 0.66) / 0.1))) * 0.45);
          img.data.set(c, (y * size + x) * 3);
        }
      }
      for (let k = 0; k < 260; k++) img.disc(rand() * size, rand() * size, 0.6 + rand() * 0.9, rand() < 0.7 ? [36, 32, 32] : [120, 112, 106], 0.7);
      return img;
    },
  },
  {
    file: 'lave.png',
    size: 256,
    draw: (size) => {
      // Croute sombre en plaques (environ 0,4 case), fissures incandescentes ;
      // le shader tire la lueur du rouge (render/groundLook.ts).
      const rand = rngOf(0xd5e6f708);
      const v = voronoi(rand, size, 5, 0.85);
      const g = fbm(rand, size, 6, 3);
      const heat = fbm(rand, size, 2, 2);
      const tones = Array.from({ length: 25 }, () => rand());
      const img = new Image(size, [40, 30, 28]);
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const c = v(x + 0.5, y + 0.5);
          const edge = (c.d2 - c.d1) / 2 + (g(x, y) - 0.5) * 3;
          const crust = scale(mix([38, 30, 28], [62, 46, 40], tones[c.id]), 0.85 + g(x, y) * 0.3);
          const hot = mix([255, 214, 96], [228, 84, 24], smooth(Math.max(0, Math.min(1, edge / 2.5))));
          const glow = (1 - smooth(Math.max(0, Math.min(1, (edge - 1.2) / 5)))) * (0.25 + 0.75 * smooth(Math.max(0, Math.min(1, (heat(x, y) - 0.3) / 0.35))));
          img.data.set(mix(crust, hot, glow), (y * size + x) * 3);
        }
      }
      return img;
    },
  },
  {
    file: 'eau.png',
    size: 256,
    draw: (size) => {
      // Eau stylisee : bleu-vert, reflets en mailles douces (cellules), le
      // shader les fait glisser (render/groundLook.ts).
      const rand = rngOf(0xe6f70819);
      const v = voronoi(rand, size, 4, 0.9);
      const body = fbm(rand, size, 2, 3);
      const img = new Image(size, [52, 128, 150]);
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const c = v(x + 0.5, y + 0.5);
          const line = 1 - smooth(Math.max(0, Math.min(1, (c.d2 - c.d1) / 4)));
          const base = mix([46, 118, 142], [66, 146, 160], body(x, y));
          img.data.set(mix(base, [140, 206, 210], line * 0.35), (y * size + x) * 3);
        }
      }
      return img;
    },
  },
];

// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const sheetPath = args.includes('--sheet') ? args[args.indexOf('--sheet') + 1] : null;

fs.mkdirSync(OUT_DIR, { recursive: true });
const rendered = [];
for (const t of TEXTURES) {
  const img = t.draw(t.size);
  const rgb = img.toRgb();
  fs.writeFileSync(path.join(OUT_DIR, t.file), encodePng(t.size, t.size, rgb));
  rendered.push({ ...t, rgb });
  // Raccord : ecart moyen entre la derniere et la premiere colonne / ligne,
  // compare a l'ecart moyen entre deux colonnes voisines a l'interieur.
  const px = (x, y, c) => rgb[(y * t.size + x) * 3 + c];
  let seam = 0;
  let inner = 0;
  for (let i = 0; i < t.size; i++) {
    for (let c = 0; c < 3; c++) {
      seam += Math.abs(px(t.size - 1, i, c) - px(0, i, c)) + Math.abs(px(i, t.size - 1, c) - px(i, 0, c));
      inner += Math.abs(px(t.size / 2, i, c) - px(t.size / 2 - 1, i, c)) + Math.abs(px(i, t.size / 2, c) - px(i, t.size / 2 - 1, c));
    }
  }
  console.log(`${t.file.padEnd(26)} ${t.size}×${t.size}  raccord ${(seam / inner).toFixed(2)} (1 = comme a l'interieur)`);
}

if (sheetPath) {
  // Planche : 5 colonnes × 2 lignes, chaque texture repetee 2 × 2 sur 256 px
  // (pixelisees agrandies au plus proche), 8 px de marge.
  const cell = 256;
  const gap = 8;
  const cols = 5;
  const rows = Math.ceil(rendered.length / cols);
  const width = cols * cell + (cols + 1) * gap;
  const height = rows * cell + (rows + 1) * gap;
  const sheet = Buffer.alloc(width * height * 3, 40);
  rendered.forEach((t, k) => {
    const ox = gap + (k % cols) * (cell + gap);
    const oy = gap + Math.floor(k / cols) * (cell + gap);
    for (let y = 0; y < cell; y++) {
      for (let x = 0; x < cell; x++) {
        const sx = Math.floor(((x * 2) / cell) * t.size) % t.size;
        const sy = Math.floor(((y * 2) / cell) * t.size) % t.size;
        t.rgb.copy(sheet, ((oy + y) * width + ox + x) * 3, (sy * t.size + sx) * 3, (sy * t.size + sx) * 3 + 3);
      }
    }
  });
  fs.writeFileSync(sheetPath, encodePng(width, height, sheet));
  console.log('planche', sheetPath);
}
