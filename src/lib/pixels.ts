import type { FormatChoice, OutputFormat } from './presets';

/** True if any pixel is not fully opaque. */
export function hasTransparency(data: Uint8ClampedArray): boolean {
  for (let i = 3; i < data.length; i += 4) if (data[i] < 255) return true;
  return false;
}

/** Count distinct RGBA colours, stopping once `limit` is exceeded (returns limit + 1). */
export function countColorsUpTo(data: Uint8ClampedArray, limit: number): number {
  const seen = new Set<number>();
  const view = new Uint32Array(data.buffer, data.byteOffset, data.byteLength >> 2);
  for (let i = 0; i < view.length; i++) {
    seen.add(view[i]);
    if (seen.size > limit) return limit + 1;
  }
  return seen.size;
}

/**
 * Pick the output format.
 * Transparency always wins: few colours → lossless palette PNG (oxipng), otherwise WebP with alpha.
 */
export function chooseFormat(
  choice: FormatChoice,
  opaqueFormat: 'jpeg' | 'webp',
  hasAlpha: boolean,
  fewColors: boolean,
): OutputFormat {
  if (choice === 'png' || choice === 'webp') return choice;
  if (hasAlpha) return fewColors ? 'png' : 'webp';
  return choice === 'jpeg' ? 'jpeg' : opaqueFormat;
}
