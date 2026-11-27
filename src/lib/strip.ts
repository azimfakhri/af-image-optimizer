/**
 * Lossless metadata stripping used by the "already optimal" fallback.
 * Returns null if the file can't be safely stripped (caller keeps the re-encoded output).
 */

/** JPEG: drop APP1 (EXIF/XMP), APP13 (IPTC) and COM. Refuses if EXIF orientation ≠ 1 (stripping would rotate the image). */
export function stripJpeg(buf: Uint8Array): Uint8Array | null {
  if (buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  const keep: Uint8Array[] = [buf.subarray(0, 2)];
  let o = 2;
  while (o + 4 <= buf.length) {
    if (buf[o] !== 0xff) return null;
    const marker = buf[o + 1];
    if (marker === 0xff) {
      o++;
      continue;
    }
    // SOS: the rest is entropy-coded data + EOI; keep it all.
    if (marker === 0xda) {
      keep.push(buf.subarray(o));
      break;
    }
    const len = (buf[o + 2] << 8) | buf[o + 3];
    const seg = buf.subarray(o, o + 2 + len);
    if (marker === 0xe1) {
      if (exifOrientation(seg) > 1) return null;
    } else if (marker !== 0xed && marker !== 0xfe) {
      keep.push(seg);
    }
    o += 2 + len;
  }
  return concat(keep);
}

/** Read EXIF orientation from an APP1 segment (marker included). 1 if absent. */
export function exifOrientation(seg: Uint8Array): number {
  // FF E1 len(2) "Exif\0\0" TIFF...
  if (seg.length < 18 || String.fromCharCode(...seg.subarray(4, 8)) !== 'Exif') return 1;
  const t = 10;
  const le = seg[t] === 0x49;
  const u16 = (o: number) => (le ? seg[t + o] | (seg[t + o + 1] << 8) : (seg[t + o] << 8) | seg[t + o + 1]);
  const u32 = (o: number) =>
    le
      ? (seg[t + o] | (seg[t + o + 1] << 8) | (seg[t + o + 2] << 16) | (seg[t + o + 3] << 24)) >>> 0
      : ((seg[t + o] << 24) | (seg[t + o + 1] << 16) | (seg[t + o + 2] << 8) | seg[t + o + 3]) >>> 0;
  const ifd = u32(4);
  if (t + ifd + 2 > seg.length) return 1;
  const n = u16(ifd);
  for (let i = 0; i < n; i++) {
    const e = ifd + 2 + i * 12;
    if (t + e + 12 > seg.length) break;
    if (u16(e) === 0x0112) return u16(e + 8);
  }
  return 1;
}

const PNG_DROP = new Set(['tEXt', 'zTXt', 'iTXt', 'eXIf', 'tIME']);

/** PNG: drop text, EXIF and time chunks. */
export function stripPng(buf: Uint8Array): Uint8Array | null {
  if (buf.length < 8 || buf[0] !== 0x89) return null;
  const keep: Uint8Array[] = [buf.subarray(0, 8)];
  let o = 8;
  while (o + 12 <= buf.length) {
    const len = ((buf[o] << 24) | (buf[o + 1] << 16) | (buf[o + 2] << 8) | buf[o + 3]) >>> 0;
    const type = String.fromCharCode(buf[o + 4], buf[o + 5], buf[o + 6], buf[o + 7]);
    const end = o + 12 + len;
    if (end > buf.length) return null;
    if (!PNG_DROP.has(type)) keep.push(buf.subarray(o, end));
    o = end;
    if (type === 'IEND') break;
  }
  return concat(keep);
}

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}
