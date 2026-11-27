import type { CropPosition, Fit } from './geometry';

export type OutputFormat = 'jpeg' | 'webp' | 'png';
export type FormatChoice = OutputFormat | 'auto';
export type QualityMode = 'smart' | 'fixed' | 'target';

export interface Settings {
  maxWidth?: number;
  maxHeight?: number;
  fit: Fit;
  /** Crop images narrower/taller than this width/height ratio (e.g. 4/3). Unset = never. */
  minAspect?: number;
  /** Crop images wider than this width/height ratio (e.g. 16/9). Unset = never. */
  maxAspect?: number;
  /** Part of the image kept when cropping (aspect limits and `cover`). Default 'center'. */
  cropPosition?: CropPosition;
  format: FormatChoice;
  /** Format Auto uses for opaque images. */
  opaqueFormat: 'jpeg' | 'webp';
  mode: QualityMode;
  /** Used in fixed mode. */
  quality: number;
  /** Used in smart mode. */
  ssimTarget: number;
  /** Used in target mode. */
  targetKB: number;
  suffix: string;
}

export interface Preset {
  id: string;
  label: string;
  hint: string;
  settings: Settings;
}

const base: Settings = {
  fit: 'inside',
  format: 'auto',
  opaqueFormat: 'webp',
  mode: 'smart',
  quality: 80,
  ssimTarget: 0.98,
  targetKB: 200,
  suffix: '',
};

const p = (id: string, label: string, hint: string, s: Partial<Settings>): Preset => ({
  id,
  label,
  hint,
  settings: { ...base, ...s },
});

export const PRESETS: Preset[] = [
  p('hero', 'Web hero', 'Max 2400 px wide, WebP', { maxWidth: 2400, opaqueFormat: 'webp', quality: 80 }),
  p('content', 'Content image', 'Max 1600 px wide, WebP', { maxWidth: 1600, opaqueFormat: 'webp', quality: 80 }),
  p('thumb', 'Thumbnail', 'Max 600 px wide, WebP', { maxWidth: 600, opaqueFormat: 'webp', quality: 78 }),
  p('og', 'WhatsApp / Facebook', '1200×630 link preview, JPEG', {
    maxWidth: 1200,
    maxHeight: 630,
    fit: 'cover',
    opaqueFormat: 'jpeg',
    quality: 82,
  }),
  p('instagram', 'Instagram post', '1080×1350 portrait, JPEG', {
    maxWidth: 1080,
    maxHeight: 1350,
    fit: 'cover',
    opaqueFormat: 'jpeg',
    quality: 85,
  }),
  p('wordpress', 'WordPress', 'Max 2560 px, JPEG', { maxWidth: 2560, maxHeight: 2560, opaqueFormat: 'jpeg', quality: 82 }),
  p('shopify', 'Shopify product', 'Max 2048×2048, WebP', { maxWidth: 2048, maxHeight: 2048, opaqueFormat: 'webp', quality: 82 }),
  p('email', 'Email newsletter', '1200 px (2× of 600), JPEG', { maxWidth: 1200, opaqueFormat: 'jpeg', quality: 78 }),
  p('form', 'Form upload', 'Under 100 KB, JPEG', { maxWidth: 1200, maxHeight: 1200, opaqueFormat: 'jpeg', mode: 'target', targetKB: 100 }),
  p('custom', 'Custom', 'Your own size, format and quality', { maxWidth: 1600 }),
];

export const DEFAULT_PRESET_ID = 'content';

export function getPreset(id: string): Preset {
  return PRESETS.find((x) => x.id === id) ?? PRESETS.find((x) => x.id === DEFAULT_PRESET_ID)!;
}
