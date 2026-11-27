export type InputFormat = 'jpeg' | 'png' | 'webp' | 'avif' | 'heic';

export type DetectResult =
  | { ok: true; format: InputFormat }
  | { ok: false; reason: string };

/** Bytes needed to sniff any supported format (ISO-BMFF ftyp boxes can be long). */
export const SNIFF_BYTES = 4096;

const HEIC_BRANDS = new Set(['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'hevm', 'hevs']);
const AVIF_BRANDS = new Set(['avif', 'avis']);

function ascii(b: Uint8Array, start: number, len: number): string {
  let s = '';
  for (let i = start; i < start + len && i < b.length; i++) s += String.fromCharCode(b[i]);
  return s;
}

function u32be(b: Uint8Array, o: number): number {
  return ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
}

function u32le(b: Uint8Array, o: number): number {
  return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;
}

function isAnimatedWebp(b: Uint8Array): boolean {
  // VP8X chunk directly after the RIFF header carries an animation flag (bit 1).
  if (ascii(b, 12, 4) === 'VP8X' && b.length > 20 && (b[20] & 0x02) !== 0) return true;
  // Fallback: walk chunks looking for ANIM/ANMF.
  let o = 12;
  while (o + 8 <= b.length) {
    const id = ascii(b, o, 4);
    if (id === 'ANIM' || id === 'ANMF') return true;
    const size = u32le(b, o + 4);
    o += 8 + size + (size & 1);
  }
  return false;
}

function detectIsoBmff(b: Uint8Array): DetectResult | null {
  if (b.length < 16 || ascii(b, 4, 4) !== 'ftyp') return null;
  const boxSize = Math.min(u32be(b, 0), b.length);
  const major = ascii(b, 8, 4);
  const brands = [major];
  for (let o = 16; o + 4 <= boxSize; o += 4) brands.push(ascii(b, o, 4));

  // The major brand wins; otherwise fall back to compatible brands (mif1/msf1 are shared by HEIC and AVIF).
  const classify = (brand: string): InputFormat | null =>
    AVIF_BRANDS.has(brand) ? 'avif' : HEIC_BRANDS.has(brand) ? 'heic' : null;
  const fmt = classify(major) ?? brands.map(classify).find((f) => f !== null) ?? null;
  if (fmt === 'avif') return { ok: true, format: 'avif' };
  if (fmt === 'heic') return { ok: true, format: 'heic' };
  return { ok: false, reason: 'Unsupported ISO media file (not HEIC or AVIF).' };
}

/** Detect an image format from its leading bytes. Extension and MIME type are ignored. */
export function detectFormat(bytes: Uint8Array): DetectResult {
  const b = bytes;
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { ok: true, format: 'jpeg' };
  if (b.length >= 8 && b[0] === 0x89 && ascii(b, 1, 3) === 'PNG' && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a)
    return { ok: true, format: 'png' };
  if (b.length >= 12 && ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 4) === 'WEBP') {
    if (isAnimatedWebp(b)) return { ok: false, reason: 'Animated WebP is not supported.' };
    return { ok: true, format: 'webp' };
  }
  const iso = detectIsoBmff(b);
  if (iso) return iso;
  if (ascii(b, 0, 4) === 'GIF8') return { ok: false, reason: 'GIF is not supported.' };
  return { ok: false, reason: 'Not a supported image (JPEG, PNG, WebP, AVIF).' };
}

export async function detectFileFormat(file: Blob): Promise<DetectResult> {
  const head = new Uint8Array(await file.slice(0, SNIFF_BYTES).arrayBuffer());
  return detectFormat(head);
}
