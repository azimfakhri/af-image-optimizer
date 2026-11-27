export interface Candidate {
  quality: number;
  bytes: ArrayBuffer;
}

/**
 * Smart quality: lowest integer quality in [lo, hi] whose SSIM ≥ target.
 * Assumes SSIM rises with quality. Falls back to `hi` if nothing passes.
 */
export async function searchSmart(
  encode: (q: number) => Promise<ArrayBuffer>,
  score: (bytes: ArrayBuffer) => Promise<number>,
  target: number,
  lo = 50,
  hi = 90,
  maxEncodes = 6,
): Promise<Candidate & { ssim: number; encodes: number }> {
  let best: (Candidate & { ssim: number }) | null = null;
  let top: (Candidate & { ssim: number }) | null = null;
  let encodes = 0;
  let a = lo;
  let b = hi;
  while (a <= b && encodes < maxEncodes) {
    const q = Math.round((a + b) / 2);
    const bytes = await encode(q);
    encodes++;
    const s = await score(bytes);
    if (q === hi) top = { quality: q, bytes, ssim: s };
    if (s >= target) {
      best = { quality: q, bytes, ssim: s };
      b = q - 1;
    } else {
      a = q + 1;
    }
  }
  if (best) return { ...best, encodes };
  if (!top) {
    const bytes = await encode(hi);
    encodes++;
    top = { quality: hi, bytes, ssim: await score(bytes) };
  }
  return { ...top, encodes };
}

/**
 * Target size: highest integer quality in [lo, hi] whose output ≤ maxBytes.
 * Returns null if even `lo` is too big (caller should downscale and retry).
 */
export async function searchTarget(
  encode: (q: number) => Promise<ArrayBuffer>,
  maxBytes: number,
  lo = 30,
  hi = 92,
  maxEncodes = 7,
): Promise<(Candidate & { encodes: number }) | null> {
  let best: Candidate | null = null;
  let encodes = 0;
  let a = lo;
  let b = hi;
  while (a <= b && encodes < maxEncodes) {
    const q = Math.round((a + b) / 2);
    const bytes = await encode(q);
    encodes++;
    if (bytes.byteLength <= maxBytes) {
      best = { quality: q, bytes };
      a = q + 1;
    } else {
      b = q - 1;
    }
  }
  if (best) return { ...best, encodes };
  // Binary search may stop before testing `lo` when maxEncodes runs out.
  if (b >= lo) {
    const bytes = await encode(lo);
    encodes++;
    if (bytes.byteLength <= maxBytes) return { quality: lo, bytes, encodes };
  }
  return null;
}
