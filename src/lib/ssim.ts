/** Luma plane (BT.601), alpha composited over white. */
export interface Luma {
  data: Float32Array;
  width: number;
  height: number;
}

export function toLuma(rgba: Uint8ClampedArray, width: number, height: number): Luma {
  const out = new Float32Array(width * height);
  for (let i = 0, j = 0; j < out.length; i += 4, j++) {
    const a = rgba[i + 3] / 255;
    const y = 0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2];
    out[j] = y * a + 255 * (1 - a);
  }
  return { data: out, width, height };
}

const C1 = (0.01 * 255) ** 2;
const C2 = (0.03 * 255) ** 2;

/**
 * Mean SSIM over 8×8 windows with stride 4 (fast variant).
 * Both planes must have identical dimensions.
 */
export function ssim(a: Luma, b: Luma, win = 8, stride = 4): number {
  if (a.width !== b.width || a.height !== b.height) throw new Error('SSIM: size mismatch');
  const { width: w, height: h } = a;
  if (w < win || h < win) return meanSsimWindow(a.data, b.data, w, 0, 0, w, h);
  let total = 0;
  let count = 0;
  for (let y = 0; y + win <= h; y += stride) {
    for (let x = 0; x + win <= w; x += stride) {
      total += meanSsimWindow(a.data, b.data, w, x, y, win, win);
      count++;
    }
  }
  return total / count;
}

function meanSsimWindow(a: Float32Array, b: Float32Array, stride: number, x0: number, y0: number, ww: number, wh: number): number {
  let sa = 0, sb = 0, saa = 0, sbb = 0, sab = 0;
  for (let y = y0; y < y0 + wh; y++) {
    let o = y * stride + x0;
    for (let x = 0; x < ww; x++, o++) {
      const va = a[o];
      const vb = b[o];
      sa += va;
      sb += vb;
      saa += va * va;
      sbb += vb * vb;
      sab += va * vb;
    }
  }
  const n = ww * wh;
  const ma = sa / n;
  const mb = sb / n;
  const va = saa / n - ma * ma;
  const vb = sbb / n - mb * mb;
  const cov = sab / n - ma * mb;
  return ((2 * ma * mb + C1) * (2 * cov + C2)) / ((ma * ma + mb * mb + C1) * (va + vb + C2));
}
