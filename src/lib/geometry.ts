export type Fit = 'inside' | 'cover';

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
}

/**
 * Compute crop + output size. Never upscales.
 * - inside: fit within maxW × maxH (either may be undefined = unbounded).
 * - cover: centre-crop to the target aspect, then scale down to at most W × H.
 */
export function computeGeometry(srcW: number, srcH: number, fit: Fit, maxW?: number, maxH?: number): Geometry {
  if (fit === 'cover' && maxW && maxH) {
    const aspect = maxW / maxH;
    let sw = srcW;
    let sh = srcH;
    if (srcW / srcH > aspect) sw = Math.round(srcH * aspect);
    else sh = Math.round(srcW / aspect);
    const sx = Math.floor((srcW - sw) / 2);
    const sy = Math.floor((srcH - sh) / 2);
    const width = Math.min(maxW, sw);
    const height = width === maxW ? maxH : Math.max(1, Math.round(width / aspect));
    return { sx, sy, sw, sh, width, height, belowTarget: sw < maxW };
  }
  const scale = Math.min(1, maxW ? maxW / srcW : 1, maxH ? maxH / srcH : 1);
  return {
    sx: 0,
    sy: 0,
    sw: srcW,
    sh: srcH,
    width: Math.max(1, Math.round(srcW * scale)),
    height: Math.max(1, Math.round(srcH * scale)),
    belowTarget: false,
  };
}
