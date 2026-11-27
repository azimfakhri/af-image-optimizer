export type Fit = 'inside' | 'cover';
export type CropPosition = 'center' | 'top' | 'bottom' | 'left' | 'right';

/** Aspect ratio as width/height: a number (`4 / 3`) or a string (`'4:3'`, `'4/3'`). */
export type AspectInput = number | string;

export interface Geometry {
  /** Source crop rectangle (orientation-corrected pixels). */
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  /** Output size. */
  width: number;
  height: number;
  /** True when a fixed-size target could not be met without upscaling. */
  belowTarget: boolean;
  /** Set when minAspect/maxAspect cropped the image: the ratio it was cropped to (width/height). */
  clampedTo?: number;
}

export interface Crop {
  /** Crop images narrower (taller) than this width/height ratio, e.g. 4/3 crops portraits and squares to 4:3. */
  minAspect?: number;
  /** Crop images wider than this width/height ratio, e.g. 16/9 trims panoramas to 16:9. */
  maxAspect?: number;
  /** Which part to keep when cropping (default centre). */
  position?: CropPosition;
}

/** Parses `4/3`, `'4:3'`, `'4/3'` or `'1.333'` into width/height. Throws on anything else. */
export function parseAspect(v: AspectInput): number {
  if (typeof v === 'number') {
    if (Number.isFinite(v) && v > 0) return v;
  } else {
    const m = v.trim().match(/^(\d+(?:\.\d+)?)\s*(?:[:/]\s*(\d+(?:\.\d+)?))?$/);
    if (m) {
      const r = m[2] === undefined ? Number(m[1]) : Number(m[1]) / Number(m[2]);
      if (Number.isFinite(r) && r > 0) return r;
    }
  }
  throw new TypeError(`Invalid aspect ratio: ${JSON.stringify(v)} (use e.g. 4/3 or '4:3').`);
}

/** '4:3' for 4/3, '16:9' for 1.777…; falls back to two decimals. */
export function formatAspect(r: number): string {
  for (let h = 1; h <= 16; h++) {
    const w = Math.round(r * h);
    if (w > 0 && Math.abs(w / h - r) < 0.0005 * r) return `${w}:${h}`;
  }
  return r.toFixed(2);
}

/** Offset of a `size` window inside `total` for the given position on one axis. */
function offset(total: number, size: number, pos: CropPosition, axis: 'x' | 'y'): number {
  const free = total - size;
  if (pos === (axis === 'x' ? 'left' : 'top')) return 0;
  if (pos === (axis === 'x' ? 'right' : 'bottom')) return free;
  return Math.floor(free / 2);
}

/**
 * Compute crop + output size. Never upscales.
 * - inside: optionally crop to [minAspect, maxAspect], then fit within maxW × maxH (either may be undefined = unbounded).
 * - cover: crop to the target aspect, then scale down to at most W × H.
 */
export function computeGeometry(srcW: number, srcH: number, fit: Fit, maxW?: number, maxH?: number, crop: Crop = {}): Geometry {
  const pos = crop.position ?? 'center';
  if (fit === 'cover' && maxW && maxH) {
    const aspect = maxW / maxH;
    let sw = srcW;
    let sh = srcH;
    if (srcW / srcH > aspect) sw = Math.round(srcH * aspect);
    else sh = Math.round(srcW / aspect);
    const sx = offset(srcW, sw, pos, 'x');
    const sy = offset(srcH, sh, pos, 'y');
    const width = Math.min(maxW, sw);
    const height = width === maxW ? maxH : Math.max(1, Math.round(width / aspect));
    return { sx, sy, sw, sh, width, height, belowTarget: sw < maxW };
  }

  let sw = srcW;
  let sh = srcH;
  let clampedTo: number | undefined;
  const a = srcW / srcH;
  if (crop.minAspect && a < crop.minAspect) {
    sh = Math.max(1, Math.round(srcW / crop.minAspect));
    clampedTo = crop.minAspect;
  } else if (crop.maxAspect && a > crop.maxAspect) {
    sw = Math.max(1, Math.round(srcH * crop.maxAspect));
    clampedTo = crop.maxAspect;
  }
  const scale = Math.min(1, maxW ? maxW / sw : 1, maxH ? maxH / sh : 1);
  return {
    sx: offset(srcW, sw, pos, 'x'),
    sy: offset(srcH, sh, pos, 'y'),
    sw,
    sh,
    width: Math.max(1, Math.round(sw * scale)),
    height: Math.max(1, Math.round(sh * scale)),
    belowTarget: false,
    ...(clampedTo !== undefined && { clampedTo }),
  };
}
