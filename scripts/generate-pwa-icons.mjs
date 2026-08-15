/**
 * Gera os ícones do PWA (PNG) sem dependências externas.
 * Uso: node scripts/generate-pwa-icons.mjs
 * Saída: apps/dashboard/public/icons/{icon,maskable,apple-touch-icon}-*.png
 */
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'apps', 'dashboard', 'public', 'icons');

// Paleta (tema claro do dashboard)
const BG = hexToRgb('#ffffff'); // fundo branco
const DISC = hexToRgb('#059669'); // emerald-600 — radar
const RING = hexToRgb('#059669');
const DOT = hexToRgb('#ffffff');

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** SDF anti-aliased: desenha com supersampling 3x3 por pixel. */
class Canvas {
  constructor(size) {
    this.size = size;
    this.px = new Float64Array(size * size * 4); // RGBA floats, CSS alpha compositing
  }
  fillRect(x0, y0, x1, y1, color) {
    for (let y = Math.max(0, Math.floor(y0)); y <= Math.min(this.size - 1, Math.ceil(y1)); y++) {
      for (let x = Math.max(0, Math.floor(x0)); x <= Math.min(this.size - 1, Math.ceil(x1)); x++) {
        this.blend(x, y, color, 1);
      }
    }
  }
  fillCircle(cx, cy, r, color, inner = false) {
    const inv = inner ? -1 : 1;
    for (let y = 0; y < this.size; y++) {
      for (let x = 0; x < this.size; x++) {
        const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
        const edge = d - r;
        let a;
        if (inner) a = edge < -1 ? 1 : edge < 1 ? 0.5 - (inv * edge) / 2 : 0;
        else a = edge <= 0 ? 1 : edge < 1 ? 1 - edge : 0;
        if (a > 0) this.blend(x, y, color, a);
      }
    }
  }
  ring(cx, cy, rIn, rOut, color) {
    for (let y = 0; y < this.size; y++) {
      for (let x = 0; x < this.size; x++) {
        const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
        if (d >= rIn - 1 && d <= rOut + 1) {
          const a = d < rIn ? d - (rIn - 1) : d > rOut ? rOut + 1 - d : 1;
          this.blend(x, y, color, Math.max(0, Math.min(1, a)));
        }
      }
    }
  }
  blend(x, y, color, alpha) {
    if (alpha <= 0) return;
    const i = (y * this.size + x) * 4;
    const a = alpha * (color[3] ?? 1);
    this.px[i] = color[0] * a + this.px[i] * (1 - a);
    this.px[i + 1] = color[1] * a + this.px[i + 1] * (1 - a);
    this.px[i + 2] = color[2] * a + this.px[i + 2] * (1 - a);
    this.px[i + 3] = (this.px[i + 3] || 0) + (1 - (this.px[i + 3] || 0)) * a;
  }
  /** Rounded-rect centrado */
  roundedRect(cx, cy, half, radius) {
    for (let y = 0; y < this.size; y++) {
      for (let x = 0; x < this.size; x++) {
        const dx = Math.abs(x + 0.5 - cx) - (half - radius);
        const dy = Math.abs(y + 0.5 - cy) - (half - radius);
        const dist = Math.max(Math.max(dx, 0), Math.max(dy, 0)) ? Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) : Math.min(Math.max(dx, dy), 0);
        const edge = dist;
        const alpha = edge <= 0 ? 1 : edge < 1 ? 1 - edge : 0;
        if (alpha > 0) this.blend(x, y, BG, alpha);
      }
    }
  }
  toPNG() {
    const { size, px } = this;
    const raw = Buffer.alloc((size * 4 + 1) * size);
    for (let y = 0; y < size; y++) {
      raw[y * (size * 4 + 1)] = 0; // filter none
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4;
        const o = y * (size * 4 + 1) + 1 + x * 4;
        raw[o] = Math.round(px[i]);
        raw[o + 1] = Math.round(px[i + 1]);
        raw[o + 2] = Math.round(px[i + 2]);
        raw[o + 3] = Math.round(px[i + 3] * 255); // alpha vai de 0..1
      }
    }
    const IHDR = Buffer.alloc(13);
    IHDR.writeUInt32BE(size, 0);
    IHDR.writeUInt32BE(size, 4);
    IHDR[8] = 8; // bit depth
    IHDR[9] = 6; // color type RGBA
    const idat = deflateSync(raw, { level: 9 });
    return Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk('IHDR', IHDR),
      chunk('IDAT', idat),
      chunk('IEND', Buffer.alloc(0)),
    ]);
  }
  encode() {
    return this.toPNG();
  }
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  return Buffer.concat([len, Buffer.from(type, 'ascii'), data, crc32(Buffer.concat([Buffer.from(type, 'ascii'), data]))]);
}

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  const out = Buffer.alloc(4);
  out.writeUInt32BE((c ^ 0xffffffff) >>> 0, 0);
  return out;
}

function drawIcon(size, { maskable = false } = {}) {
  const cv = new Canvas(size);
  const c = size / 2;

  // Fundo: rounded-rect (ícones regulares) ou full-bleed (maskable)
  if (maskable) {
    cv.fillRect(0, 0, size, size, BG);
  } else {
    cv.roundedRect(c, c, size * 0.5, size * 0.22);
  }

  // Escala proporcional (maskable usa área segura)
  const s = maskable ? 0.5 : 0.6;
  const discR = size * s * 0.5;
  const ringR = discR * 0.78;
  const dotR = discR * 0.22;

  cv.fillCircle(c, c, discR, DISC);
  cv.ring(c, c, ringR * 0.75, ringR, RING);
  cv.fillCircle(c, c, dotR, DOT);

  return cv.toPNG();
}

mkdirSync(OUT_DIR, { recursive: true });

const specs = [
  { name: 'icon-192.png', size: 192 },
  { name: 'icon-512.png', size: 512 },
  { name: 'apple-touch-icon-180.png', size: 180 },
  { name: 'maskable-192.png', size: 192, maskable: true },
  { name: 'maskable-512.png', size: 512, maskable: true },
];

for (const spec of specs) {
  const png = drawIcon(spec.size, { maskable: spec.maskable });
  const path = join(OUT_DIR, spec.name);
  writeFileSync(path, png);
  console.log(`Gerado ${path} (${png.length} bytes)`);
}

const manifest = JSON.stringify(
  [
    { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: '/icons/maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
    { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
  null,
  2
);
writeFileSync(join(OUT_DIR, 'manifest.icons.json'), manifest);
console.log('Ícones PWA gerados.');