/**
 * Generates the e2e fixtures (synthetic, so no licensing concerns and identical on every OS).
 * Photos are drawn and encoded by Chromium's canvas; byte-level tweaks (EXIF, corrupt, HEIC) happen here.
 */
import { chromium } from '@playwright/test';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { deflateSync } from 'node:zlib';
import { FIXTURES, fixture } from './helpers.ts';

/** Bump when the generated files change so stale local copies are rebuilt. */
const VERSION = '3';

export default async function globalSetup() {
  const stamp = fixture('.version');
  if (existsSync(stamp) && readFileSync(stamp, 'utf8') === VERSION) return;
  mkdirSync(FIXTURES, { recursive: true });
  // Committed: a 1600×1066 HEIC of the same synthetic scene (made once with macOS `sips -s format heic`).
  copyFileSync(resolve(import.meta.dirname, 'assets/landscape.heic'), fixture('landscape.heic'));

  const browser = await chromium.launch();
  const page = await browser.newPage();
  const out = await page.evaluate(async () => {
    // A photo-like 2400×1600 scene: gradients, soft shapes and grain (so it compresses like a real photo),
    // with orientation markers: red block top-left, blue block top-right.
    const W = 2400;
    const H = 1600;
    const scene = new OffscreenCanvas(W, H);
    const c = scene.getContext('2d')!;
    const sky = c.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#7fb2e5');
    sky.addColorStop(0.55, '#f2d7a6');
    sky.addColorStop(1, '#4b6b3a');
    c.fillStyle = sky;
    c.fillRect(0, 0, W, H);
    let seed = 42;
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
    for (let i = 0; i < 160; i++) {
      const x = rnd() * W;
      const y = rnd() * H;
      const r = 20 + rnd() * 180;
      const g = c.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `hsla(${rnd() * 360},60%,${30 + rnd() * 40}%,0.55)`);
      g.addColorStop(1, 'hsla(0,0%,50%,0)');
      c.fillStyle = g;
      c.fillRect(x - r, y - r, r * 2, r * 2);
    }
    const img = c.getImageData(0, 0, W, H);
    for (let i = 0; i < img.data.length; i += 4) {
      const n = (rnd() - 0.5) * 6;
      img.data[i] += n;
      img.data[i + 1] += n;
      img.data[i + 2] += n;
    }
    c.putImageData(img, 0, 0);
    c.fillStyle = '#ff0000';
    c.fillRect(0, 0, 300, 300);
    c.fillStyle = '#0000ff';
    c.fillRect(W - 300, 0, 300, 300);

    // Same scene, pixels stored rotated 90° clockwise (EXIF orientation 8 is added in Node).
    const rotated = new OffscreenCanvas(H, W);
    const rc = rotated.getContext('2d')!;
    rc.translate(H, 0);
    rc.rotate(Math.PI / 2);
    rc.drawImage(scene, 0, 0);

    const small = new OffscreenCanvas(600, 400);
    small.getContext('2d')!.drawImage(scene, 0, 0, 600, 400);

    const b64 = async (blob: Blob) => {
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let s = '';
      for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      return btoa(s);
    };
    return {
      landscape: await b64(await scene.convertToBlob({ type: 'image/jpeg', quality: 0.92 })),
      rotated: await b64(await rotated.convertToBlob({ type: 'image/jpeg', quality: 0.92 })),
      photoPng: await b64(await small.convertToBlob({ type: 'image/png' })),
      smallWebp: await b64(await small.convertToBlob({ type: 'image/webp', quality: 0.5 })),
    };
  });
  await browser.close();

  const landscape = Buffer.from(out.landscape, 'base64');
  writeFileSync(fixture('landscape.jpg'), landscape);
  writeFileSync(fixture('photo.jfif'), landscape);
  writeFileSync(fixture('jpeg-renamed.png'), landscape);
  writeFileSync(fixture('rotated-exif.jpg'), withOrientation(Buffer.from(out.rotated, 'base64'), 8));
  // Opaque PNG that still has an alpha channel (RGBA): the optimizer must notice it's opaque.
  writeFileSync(fixture('opaque-rgba.png'), Buffer.from(out.photoPng, 'base64'));
  writeFileSync(fixture('already-small.webp'), Buffer.from(out.smallWebp, 'base64'));
  writeFileSync(fixture('logo-transparent.png'), logoPng(800));
  writeFileSync(fixture('corrupt.jpg'), Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), pseudoRandom(20_000)]));
  // Valid HEIC signature, garbage body.
  writeFileSync(fixture('broken.heic'), Buffer.concat([ftyp('heic', ['mif1', 'heic']), pseudoRandom(2_000)]));
  writeFileSync(stamp, VERSION);
}

/** Inserts an APP1 EXIF segment holding only the orientation tag right after SOI. */
function withOrientation(jpeg: Buffer, orientation: number): Buffer {
  const tiff = Buffer.alloc(26);
  tiff.write('II*\0', 0, 'latin1');
  tiff.writeUInt32LE(8, 4); // IFD0 offset
  tiff.writeUInt16LE(1, 8); // one entry
  tiff.writeUInt16LE(0x0112, 10); // Orientation
  tiff.writeUInt16LE(3, 12); // SHORT
  tiff.writeUInt32LE(1, 14); // count
  tiff.writeUInt16LE(orientation, 18);
  tiff.writeUInt32LE(0, 22); // no next IFD
  const body = Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), tiff]);
  const app1 = Buffer.alloc(4);
  app1.writeUInt16BE(0xffe1, 0);
  app1.writeUInt16BE(body.length + 2, 2);
  return Buffer.concat([jpeg.subarray(0, 2), app1, body, jpeg.subarray(2)]);
}

/** Flat two-colour logo on a transparent background (≤256 colours), stored uncompressed like a careless export. */
function logoPng(size: number): Buffer {
  const rows: Buffer[] = [];
  const c = size / 2;
  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(1 + size * 4);
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x - c, y - c);
      const px =
        d < size * 0.42
          ? (Math.floor(x / 80) + Math.floor(y / 80)) % 2
            ? [220, 40, 60, 255]
            : [30, 90, 200, 255]
          : d < size * 0.46
            ? [20, 20, 20, 128]
            : [0, 0, 0, 0];
      row.set(px, 1 + x * 4);
    }
    rows.push(row);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr.set([8, 6, 0, 0, 0], 8); // 8-bit RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('tEXt', Buffer.from('Comment\0fixture logo', 'latin1')),
    pngChunk('IDAT', deflateSync(Buffer.concat(rows), { level: 0 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function pngChunk(type: string, data: Buffer): Buffer {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'latin1');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, crc]);
}

function crc32(buf: Buffer): number {
  let c = ~0;
  for (const b of buf) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function ftyp(major: string, compatible: string[]): Buffer {
  const box = Buffer.alloc(16 + compatible.length * 4);
  box.writeUInt32BE(box.length, 0);
  box.write('ftyp', 4, 'latin1');
  box.write(major, 8, 'latin1');
  compatible.forEach((b, i) => box.write(b, 16 + i * 4, 'latin1'));
  return box;
}

function pseudoRandom(n: number): Buffer {
  const b = Buffer.alloc(n);
  let s = 7;
  for (let i = 0; i < n; i++) b[i] = (s = (s * 1103515245 + 12345) >>> 0) >>> 24;
  return b;
}
