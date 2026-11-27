import { parseAspect, type CropPosition } from './geometry';
import type { Settings } from './presets';

/**
 * Settings for the web component (attributes) and the iframe embed (URL parameters), both kebab-case:
 * `max-width`, `max-height`, `fit`, `format`, `mode`, `quality`, `target-kb`, `min-aspect`, `max-aspect`, `crop-position`.
 * Invalid values are skipped and reported in `errors`.
 */
export const SETTING_PARAMS = [
  'max-width',
  'max-height',
  'fit',
  'format',
  'mode',
  'quality',
  'target-kb',
  'min-aspect',
  'max-aspect',
  'crop-position',
] as const;

const oneOf =
  <T extends string>(...vals: T[]) =>
  (v: string): T => {
    if ((vals as string[]).includes(v)) return v as T;
    throw new Error(`expected ${vals.join(' | ')}`);
  };

const posInt = (min: number, max: number) => (v: string) => {
  const n = Number(v);
  if (Number.isInteger(n) && n >= min && n <= max) return n;
  throw new Error(`expected a whole number ${min}–${max}`);
};

const parsers: Record<(typeof SETTING_PARAMS)[number], [keyof Settings, (v: string) => unknown]> = {
  'max-width': ['maxWidth', posInt(1, 20000)],
  'max-height': ['maxHeight', posInt(1, 20000)],
  fit: ['fit', oneOf('inside', 'cover')],
  format: ['format', oneOf('auto', 'jpeg', 'webp', 'png')],
  mode: ['mode', oneOf('smart', 'fixed', 'target')],
  quality: ['quality', posInt(1, 100)],
  'target-kb': ['targetKB', posInt(1, 100000)],
  'min-aspect': ['minAspect', parseAspect],
  'max-aspect': ['maxAspect', parseAspect],
  'crop-position': ['cropPosition', oneOf<CropPosition>('center', 'top', 'bottom', 'left', 'right')],
};

export function settingsFromParams(get: (name: string) => string | null): { settings: Partial<Settings>; errors: string[] } {
  const settings: Partial<Settings> = {};
  const errors: string[] = [];
  for (const name of SETTING_PARAMS) {
    const raw = get(name);
    if (raw === null || raw.trim() === '') continue;
    const [key, parse] = parsers[name];
    try {
      (settings as Record<string, unknown>)[key] = parse(raw.trim());
    } catch (e) {
      errors.push(`${name}="${raw}": ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  if (settings.minAspect && settings.maxAspect && settings.minAspect > settings.maxAspect) {
    errors.push('min-aspect is larger than max-aspect; both ignored.');
    delete settings.minAspect;
    delete settings.maxAspect;
  }
  return { settings, errors };
}
