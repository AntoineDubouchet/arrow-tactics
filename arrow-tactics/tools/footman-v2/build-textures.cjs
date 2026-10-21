// Footman V2 : textures Meshy 4096 -> 2048. Redimensionnement par le navigateur
// (createImageBitmap, qualite haute, sans conversion de couleur ni premultiplication :
// valeurs brutes, donc sans effet sur les espaces de couleur), puis reencodage PNG
// dans Node avec le meme type que la source (niveaux de gris ou RVB).
// Usage (depuis arrow-tactics/) : node tools/footman-v2/build-textures.cjs [--source <dir>] [--out <dir>] [--channel msedge]
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { chromium } = require('playwright');

const SIZE = 2048;

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
function pngChunk(type, data) {
  const name = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, crc]);
}
/** PNG 8 bits, filtre adaptatif par ligne (somme des valeurs absolues minimale). */
function encodePng(width, height, channels, pixels) {
  const stride = width * channels;
  const raw = Buffer.alloc((stride + 1) * height);
  const emptyRow = Buffer.alloc(stride);
  const candidates = [0, 1, 2, 3, 4].map(() => Buffer.alloc(stride));
  for (let y = 0; y < height; y++) {
    const row = pixels.subarray(y * stride, (y + 1) * stride);
    const up = y ? pixels.subarray((y - 1) * stride, y * stride) : emptyRow;
    let best = 0;
    let bestSum = Infinity;
    for (let filter = 0; filter < 5; filter++) {
      const target = candidates[filter];
      let sum = 0;
      for (let i = 0; i < stride; i++) {
        const a = i >= channels ? row[i - channels] : 0;
        const b = up[i];
        const c = i >= channels ? up[i - channels] : 0;
        let predictor;
        if (filter === 0) predictor = 0;
        else if (filter === 1) predictor = a;
        else if (filter === 2) predictor = b;
        else if (filter === 3) predictor = (a + b) >> 1;
        else {
          const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c);
          predictor = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
        }
        const value = (row[i] - predictor) & 255;
        target[i] = value;
        sum += value < 128 ? value : 256 - value;
      }
      if (sum < bestSum) {
        bestSum = sum;
        best = filter;
      }
    }
    raw[y * (stride + 1)] = best;
    candidates[best].copy(raw, y * (stride + 1) + 1);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = channels === 1 ? 0 : 2;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

(async () => {
  const { parseArgs, textureJobs } = await import('./footman-config.mjs');
  const { source, out, channel } = parseArgs();
  fs.mkdirSync(out, { recursive: true });
  console.log(`Sources : ${source}\nSortie  : ${out}`);
  const browser = await chromium.launch(channel ? { channel } : {});
  const page = await browser.newPage();
  // Les PNG sont servis depuis le disque par interception : aucun serveur necessaire.
  await page.route('http://footman-textures.local/**', (route) => {
    const relative = decodeURIComponent(new URL(route.request().url()).pathname.slice(1));
    if (!relative) return route.fulfill({ body: '<html></html>', headers: { 'content-type': 'text/html' } });
    return route.fulfill({ body: fs.readFileSync(path.join(source, relative)), headers: { 'content-type': 'image/png' } });
  });
  await page.goto('http://footman-textures.local/');
  for (const job of textureJobs()) {
    const sourceFile = path.join(source, job.src);
    if (!fs.existsSync(sourceFile)) throw new Error(`Texture source introuvable : ${sourceFile}`);
    // Octet 25 de l'en-tete PNG : 0 = niveaux de gris, 2 = RVB.
    const channels = fs.readFileSync(sourceFile)[25] === 0 ? 1 : 3;
    const base64 = await page.evaluate(async ([url, size]) => {
      const blob = await (await fetch(url)).blob();
      const bitmap = await createImageBitmap(blob, { resizeWidth: size, resizeHeight: size, resizeQuality: 'high', colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
      const canvas = new OffscreenCanvas(size, size);
      const context = canvas.getContext('2d', { willReadFrequently: true });
      context.drawImage(bitmap, 0, 0);
      const data = context.getImageData(0, 0, size, size).data;
      let binary = '';
      for (let i = 0; i < data.length; i += 0x8000) binary += String.fromCharCode.apply(null, data.subarray(i, i + 0x8000));
      return btoa(binary);
    }, [`http://footman-textures.local/${encodeURI(job.src)}`, SIZE]);
    const rgba = Buffer.from(base64, 'base64');
    const pixels = Buffer.alloc(SIZE * SIZE * channels);
    for (let i = 0, j = 0; i < rgba.length; i += 4) {
      pixels[j++] = rgba[i];
      if (channels === 3) {
        pixels[j++] = rgba[i + 1];
        pixels[j++] = rgba[i + 2];
      }
    }
    const png = encodePng(SIZE, SIZE, channels, pixels);
    fs.writeFileSync(path.join(out, job.out), png);
    console.log(`${job.out.padEnd(28)} ${channels === 1 ? 'gris' : 'RVB '} ${(fs.statSync(sourceFile).size / 1048576).toFixed(1).padStart(5)} Mo -> ${(png.length / 1048576).toFixed(1).padStart(4)} Mo`);
  }
  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
