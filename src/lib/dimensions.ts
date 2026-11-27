import type { InputFormat } from './detectFormat';
import { exifOrientation } from './strip';

/** Header bytes read to find dimensions (JPEG SOF can sit after a large EXIF thumbnail). */
export const PROBE_BYTES = 512 * 1024;

export interface Dimensions {
  width: number;
  height: number;
}

const SOF = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);

/** Read stored pixel dimensions from the file header (not orientation-corrected). Null if not found. */
export function readDimensions(b: Uint8Array, format: InputFormat): Dimensions | null {
  const be16 = (o: number) => (b[o] << 8) | b[o + 1];
  const le24 = (o: number) => b[o] | (b[o + 1] << 8) | (b[o + 2] << 16);
  const tag = (o: number) => String.fromCharCode(b[o], b[o + 1], b[o + 2], b[o + 3]);
  switch (format) {
    case 'jpeg': {
      let o = 2;
      while (o + 9 < b.length) {
        if (b[o] !== 0xff) return null;
        const m = b[o + 1];
        if (m === 0xff) {
          o++;
          continue;
        }
        if (SOF.has(m)) return { height: be16(o + 5), width: be16(o + 7) };
        if (m === 0xd8 || (m >= 0xd0 && m <= 0xd7)) {
          o += 2;
          continue;
        }
        o += 2 + be16(o + 2);
      }
      return null;
    }
    case 'png':
      if (b.length < 24) return null;
      return {
        width: ((b[16] << 24) | (b[17] << 16) | (b[18] << 8) | b[19]) >>> 0,
        height: ((b[20] << 24) | (b[21] << 16) | (b[22] << 8) | b[23]) >>> 0,
      };
    case 'webp': {
      if (b.length < 30) return null;
      const chunk = tag(12);
      if (chunk === 'VP8X') return { width: 1 + le24(24), height: 1 + le24(27) };
      if (chunk === 'VP8 ') return { width: (b[26] | (b[27] << 8)) & 0x3fff, height: (b[28] | (b[29] << 8)) & 0x3fff };
      if (chunk === 'VP8L')
        return {
          width: 1 + (((b[22] & 0x3f) << 8) | b[21]),
          height: 1 + (((b[24] & 0x0f) << 10) | (b[23] << 2) | ((b[22] & 0xc0) >> 6)),
        };
      return null;
    }
    case 'heic':
    case 'avif': {
      // ISO-BMFF: image spatial extents live in 'ispe' properties (full box: version/flags, width, height).
      // Grid images also list their tiles and thumbnails, so take the largest.
      const be32 = (o: number) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
      let best: Dimensions | null = null;
      for (let o = 4; o + 16 <= b.length; o++) {
        if (b[o] !== 0x69 || tag(o) !== 'ispe' || be32(o - 4) !== 20) continue;
        const width = be32(o + 8);
        const height = be32(o + 12);
        if (!best || width * height > best.width * best.height) best = { width, height };
      }
      return best;
    }
    default:
      return null;
  }
}

/** EXIF orientation (1–8) from a JPEG header; 1 when there's no EXIF orientation tag. */
export function readOrientation(b: Uint8Array): number {
  if (b[0] !== 0xff || b[1] !== 0xd8) return 1;
  let o = 2;
  while (o + 4 <= b.length && b[o] === 0xff) {
    const m = b[o + 1];
    if (m === 0xff) {
      o++;
      continue;
    }
    if (m === 0xda || m === 0xd9) break;
    const len = (b[o + 2] << 8) | b[o + 3];
    if (m === 0xe1) {
      const r = exifOrientation(b.subarray(o, o + 2 + len));
      if (r !== 1) return r;
    }
    o += 2 + len;
  }
  return 1;
}
