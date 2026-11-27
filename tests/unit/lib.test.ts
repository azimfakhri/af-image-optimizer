import { describe, expect, it } from 'vitest';
import { computeGeometry, formatAspect, parseAspect } from '../../src/lib/geometry';
import { settingsFromParams } from '../../src/lib/params';
import { pastedName, outputName, uniquePath } from '../../src/lib/naming';
import { chooseFormat, countColorsUpTo, hasTransparency } from '../../src/lib/pixels';
import { searchSmart, searchTarget } from '../../src/lib/search';
import { ssim, toLuma } from '../../src/lib/ssim';
import { exifOrientation, stripJpeg, stripPng } from '../../src/lib/strip';

describe('geometry', () => {
  it('fits inside without upscaling', () => {
    expect(computeGeometry(6000, 4000, 'inside', 2400)).toMatchObject({ width: 2400, height: 1600 });
    expect(computeGeometry(800, 600, 'inside', 2400)).toMatchObject({ width: 800, height: 600 });
    expect(computeGeometry(3000, 4000, 'inside', 2048, 2048)).toMatchObject({ width: 1536, height: 2048 });
  });
  it('cover-crops to aspect and flags small sources', () => {
    const g = computeGeometry(4000, 3000, 'cover', 1200, 630);
    expect(g).toMatchObject({ width: 1200, height: 630, sw: 4000, belowTarget: false });
    expect(g.sh).toBe(2100);
    const small = computeGeometry(800, 800, 'cover', 1200, 630);
    expect(small).toMatchObject({ width: 800, belowTarget: true });
    expect(small.height).toBe(420);
  });
  it('minAspect crops only images taller than the ratio', () => {
    // Portrait 3000×4000 with minAspect 4:3 → centre crop 3000×2250 → 1600×1200.
    const portrait = computeGeometry(3000, 4000, 'inside', 1600, undefined, { minAspect: 4 / 3 });
    expect(portrait).toMatchObject({ sx: 0, sy: 875, sw: 3000, sh: 2250, width: 1600, height: 1200, clampedTo: 4 / 3 });
    // Wide 16:9 and 3:2 are untouched.
    expect(computeGeometry(4000, 2250, 'inside', 1600, undefined, { minAspect: 4 / 3 })).toMatchObject({ sh: 2250, width: 1600, height: 900 });
    expect(computeGeometry(6000, 4000, 'inside', 1600, undefined, { minAspect: 4 / 3 }).clampedTo).toBeUndefined();
    // Square counts as taller than 4:3.
    expect(computeGeometry(2000, 2000, 'inside', 1600, undefined, { minAspect: 4 / 3 })).toMatchObject({ sh: 1500, width: 1600, height: 1200 });
  });
  it('maxAspect crops wide images; crop position picks the kept part', () => {
    const pano = computeGeometry(9000, 3000, 'inside', undefined, undefined, { maxAspect: 16 / 9 });
    expect(pano).toMatchObject({ sw: 5333, sh: 3000, sx: 1833, width: 5333 });
    expect(computeGeometry(9000, 3000, 'inside', undefined, undefined, { maxAspect: 16 / 9, position: 'left' }).sx).toBe(0);
    expect(computeGeometry(9000, 3000, 'inside', undefined, undefined, { maxAspect: 16 / 9, position: 'right' }).sx).toBe(3667);
    expect(computeGeometry(3000, 4000, 'inside', undefined, undefined, { minAspect: 4 / 3, position: 'top' }).sy).toBe(0);
    expect(computeGeometry(3000, 4000, 'inside', undefined, undefined, { minAspect: 4 / 3, position: 'bottom' }).sy).toBe(1750);
    // Position also applies to cover.
    expect(computeGeometry(3000, 4000, 'cover', 1080, 1080, { position: 'top' })).toMatchObject({ sy: 0, sw: 3000, sh: 3000 });
  });
  it('parses and formats aspect ratios', () => {
    expect(parseAspect(4 / 3)).toBeCloseTo(1.3333);
    expect(parseAspect('4:3')).toBeCloseTo(1.3333);
    expect(parseAspect(' 16 / 9 ')).toBeCloseTo(1.7778);
    expect(parseAspect('1.5')).toBe(1.5);
    for (const bad of ['', 'wide', '4:0', '-1', 0, NaN]) expect(() => parseAspect(bad)).toThrow(TypeError);
    expect(formatAspect(4 / 3)).toBe('4:3');
    expect(formatAspect(16 / 9)).toBe('16:9');
    expect(formatAspect(1)).toBe('1:1');
    expect(formatAspect(1.4142)).toBe('1.41');
  });
});

describe('settingsFromParams', () => {
  const from = (o: Record<string, string>) => settingsFromParams((n) => o[n] ?? null);
  it('parses attributes / URL parameters', () => {
    expect(from({ 'max-width': '1600', 'min-aspect': '4:3', 'crop-position': 'top', format: 'jpeg', 'target-kb': '150' }).settings).toEqual({
      maxWidth: 1600,
      minAspect: 4 / 3,
      cropPosition: 'top',
      format: 'jpeg',
      targetKB: 150,
    });
  });
  it('skips invalid values and reports them', () => {
    const r = from({ 'max-width': 'big', fit: 'stretch', quality: '101', 'crop-position': 'middle' });
    expect(r.settings).toEqual({});
    expect(r.errors).toHaveLength(4);
    const conflict = from({ 'min-aspect': '16:9', 'max-aspect': '4:3' });
    expect(conflict.settings).toEqual({});
    expect(conflict.errors[0]).toMatch(/larger than max-aspect/);
  });
});

describe('naming', () => {
  it('replaces extension and adds suffix', () => {
    expect(outputName('photo.jfif', 'webp')).toBe('photo.webp');
    expect(outputName('a.b.png', 'jpg', '-1600w')).toBe('a.b-1600w.jpg');
  });
  it('dedupes case-insensitively, keeping folders', () => {
    const t = new Set<string>();
    expect(uniquePath('x/a.webp', t)).toBe('x/a.webp');
    expect(uniquePath('x/A.webp', t)).toBe('x/A-2.webp');
    expect(uniquePath('x/a.webp', t)).toBe('x/a-3.webp');
    expect(uniquePath('y/a.webp', t)).toBe('y/a.webp');
  });
  it('names pasted images', () => {
    expect(pastedName(new Date(2026, 0, 2, 3, 4, 5), 'image/png')).toBe('pasted-20260102-030405.png');
  });
});

describe('pixels', () => {
  const opaque = new Uint8ClampedArray([1, 2, 3, 255, 4, 5, 6, 255]);
  const alpha = new Uint8ClampedArray([1, 2, 3, 255, 4, 5, 6, 254]);
  it('detects transparency by scanning alpha', () => {
    expect(hasTransparency(opaque)).toBe(false);
    expect(hasTransparency(alpha)).toBe(true);
  });
  it('counts colours with early exit', () => {
    expect(countColorsUpTo(opaque, 256)).toBe(2);
    expect(countColorsUpTo(opaque, 1)).toBe(2);
  });
  it('chooses formats', () => {
    expect(chooseFormat('auto', 'webp', false, false)).toBe('webp');
    expect(chooseFormat('auto', 'jpeg', false, false)).toBe('jpeg');
    expect(chooseFormat('jpeg', 'webp', true, true)).toBe('png');
    expect(chooseFormat('jpeg', 'webp', true, false)).toBe('webp');
    expect(chooseFormat('png', 'webp', false, false)).toBe('png');
  });
});

describe('ssim', () => {
  const w = 32, h = 32;
  const img = new Uint8ClampedArray(w * h * 4).map((_, i) => (i % 4 === 3 ? 255 : (i * 37) % 256));
  it('is 1 for identical images and lower for noisy ones', () => {
    const a = toLuma(img, w, h);
    expect(ssim(a, a)).toBeCloseTo(1, 6);
    const noisy = img.map((v, i) => (i % 4 === 3 ? 255 : Math.min(255, v + ((i * 7919) % 41) - 20)));
    expect(ssim(a, toLuma(noisy, w, h))).toBeLessThan(0.99);
  });
});

describe('search', () => {
  const buf = (n: number) => new ArrayBuffer(n);
  it('smart picks the lowest passing quality', async () => {
    let calls = 0;
    const r = await searchSmart(async (q) => (calls++, buf(q)), async (b) => (b.byteLength >= 72 ? 0.99 : 0.9), 0.98);
    expect(r.quality).toBe(72);
    expect(calls).toBeLessThanOrEqual(6);
  });
  it('smart falls back to hi when nothing passes', async () => {
    const r = await searchSmart(async (q) => buf(q), async () => 0.5, 0.98);
    expect(r.quality).toBe(90);
  });
  it('target picks the highest quality under the limit', async () => {
    const r = await searchTarget(async (q) => buf(q * 1000), 61_500);
    expect(r?.quality).toBe(61);
  });
  it('target returns null when even lo is too big', async () => {
    expect(await searchTarget(async (q) => buf(q * 1000), 10_000)).toBeNull();
  });
});

describe('strip', () => {
  const exif = (orientation: number) => {
    // APP1 Exif, little-endian TIFF, one IFD entry (0x0112).
    const tiff = [0x49, 0x49, 0x2a, 0, 8, 0, 0, 0, 1, 0, 0x12, 0x01, 3, 0, 1, 0, 0, 0, orientation, 0, 0, 0, 0, 0, 0, 0];
    const body = [...'Exif'].map((c) => c.charCodeAt(0)).concat([0, 0], tiff);
    const len = body.length + 2;
    return [0xff, 0xe1, len >> 8, len & 255, ...body];
  };
  const jpeg = (app1: number[]) =>
    new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 4, 1, 2, ...app1, 0xff, 0xfe, 0, 3, 65, 0xff, 0xda, 0, 2, 9, 9, 0xff, 0xd9]);
  it('reads orientation', () => {
    expect(exifOrientation(new Uint8Array(exif(6)))).toBe(6);
  });
  it('strips EXIF and comments from upright JPEGs', () => {
    const out = stripJpeg(jpeg(exif(1)))!;
    expect(Array.from(out)).toEqual([0xff, 0xd8, 0xff, 0xe0, 0, 4, 1, 2, 0xff, 0xda, 0, 2, 9, 9, 0xff, 0xd9]);
  });
  it('refuses rotated JPEGs', () => {
    expect(stripJpeg(jpeg(exif(6)))).toBeNull();
  });
  it('drops PNG text chunks', () => {
    const chunk = (type: string, data: number[]) => [0, 0, 0, data.length, ...[...type].map((c) => c.charCodeAt(0)), ...data, 0, 0, 0, 0];
    const png = new Uint8Array([0x89, 80, 78, 71, 13, 10, 26, 10, ...chunk('IHDR', [1]), ...chunk('tEXt', [65]), ...chunk('IEND', [])]);
    const out = stripPng(png)!;
    expect(out.length).toBe(png.length - 13);
  });
});
