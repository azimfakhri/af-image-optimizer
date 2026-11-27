/// <reference lib="webworker" />
import encodeJpeg from '@jsquash/jpeg/encode';
import encodeWebp from '@jsquash/webp/encode';
import optimisePng from '@jsquash/oxipng/optimise';
import resize from '@jsquash/resize';
import { computeGeometry, formatAspect } from '../lib/geometry';
import { chooseFormat, countColorsUpTo, hasTransparency } from '../lib/pixels';
import type { OutputFormat, Settings } from '../lib/presets';
import { searchSmart, searchTarget } from '../lib/search';
import { ssim, toLuma, type Luma } from '../lib/ssim';
import { stripJpeg, stripPng } from '../lib/strip';
import type { JobRequest, JobResponse, JobSuccess } from './protocol';

declare const self: DedicatedWorkerGlobalScope;

/** iOS Safari caps canvas area at 16,777,216 px; stay under it everywhere. */
const MAX_CANVAS_PX = 16_777_216;
/** SSIM is computed on a copy no larger than this on its long side. */
const SSIM_MAX_SIDE = 1024;

type Encoder = (img: ImageData, q: number, final: boolean) => Promise<ArrayBuffer>;

const encoders: Record<OutputFormat, Encoder> = {
  jpeg: (img, q) =>
    encodeJpeg(img, {
      quality: q,
      progressive: true,
      optimize_coding: true,
      trellis_multipass: true,
      auto_subsample: false,
      chroma_subsample: q >= 90 ? 1 : 2,
    }),
  // Search with method 4 (fast); the final encode uses method 6 (smallest).
  webp: (img, q, final) =>
    encodeWebp(img, { quality: q, method: final ? 6 : 4, use_sharp_yuv: 1, alpha_quality: 100 }),
  png: (img) => optimisePng(img, { level: 2, optimiseAlpha: true }),
};

function canvas2d(w: number, h: number) {
  const c = new OffscreenCanvas(w, h);
  const ctx = c.getContext('2d', { willReadFrequently: true, colorSpace: 'srgb' });
  if (!ctx) throw new Error('Canvas 2D is unavailable');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  return { c, ctx };
}

/** Browser-decode + scale so the long side ≤ SSIM_MAX_SIDE, then to luma. */
async function lumaOf(src: Blob | ImageData, w: number, h: number): Promise<Luma> {
  const s = Math.min(1, SSIM_MAX_SIDE / Math.max(w, h));
  const tw = Math.max(1, Math.round(w * s));
  const th = Math.max(1, Math.round(h * s));
  const bmp = await createImageBitmap(src, { premultiplyAlpha: 'none' });
  const { ctx } = canvas2d(tw, th);
  ctx.drawImage(bmp, 0, 0, tw, th);
  bmp.close();
  const d = ctx.getImageData(0, 0, tw, th);
  return toLuma(d.data, tw, th);
}

async function lanczos(img: ImageData, width: number, height: number): Promise<ImageData> {
  if (img.width === width && img.height === height) return img;
  return resize(img, { width, height, method: 'lanczos3', fitMethod: 'stretch', premultiply: true, linearRGB: true });
}

interface Prepared {
  img: ImageData;
  inWidth: number;
  inHeight: number;
  outW: number;
  outH: number;
  notes: string[];
}

const DECODE: ImageBitmapOptions = { imageOrientation: 'from-image', premultiplyAlpha: 'none', colorSpaceConversion: 'default' };

/** Browser decode; HEIC falls back to libheif (lazy-loaded) where the browser can't decode it (all but Safari). */
async function decode(file: Blob, format: JobRequest['inputFormat']): Promise<ImageBitmap> {
  if (format !== 'heic') return createImageBitmap(file, DECODE);
  try {
    return await createImageBitmap(file, DECODE);
  } catch {
    const { decodeHeic } = await import('./heic');
    return createImageBitmap(await decodeHeic(file), { premultiplyAlpha: 'none' });
  }
}

/** Decode (EXIF-aware), crop and Lanczos3-resize to the target geometry. */
async function prepare(job: JobRequest): Promise<Prepared> {
  const s: Settings = job.settings;
  const notes: string[] = [];
  const bitmap = await decode(job.file, job.inputFormat);
  const inWidth = bitmap.width;
  const inHeight = bitmap.height;
  const geo = computeGeometry(inWidth, inHeight, s.fit, s.maxWidth, s.maxHeight, {
    minAspect: s.minAspect,
    maxAspect: s.maxAspect,
    position: s.cropPosition,
  });
  if (geo.belowTarget) notes.push(`Source is smaller than ${s.maxWidth}×${s.maxHeight}; not upscaled.`);
  if (geo.clampedTo) notes.push(`Cropped to ${formatAspect(geo.clampedTo)}.`);

  // Draw the crop into a canvas, pre-shrinking with the browser only if it exceeds the canvas limit.
  let outW = geo.width;
  let outH = geo.height;
  const pre = Math.min(1, Math.sqrt(MAX_CANVAS_PX / (geo.sw * geo.sh)));
  const drawW = Math.max(1, Math.floor(geo.sw * pre));
  const drawH = Math.max(1, Math.floor(geo.sh * pre));
  if (outW > drawW || outH > drawH) {
    outW = drawW;
    outH = drawH;
    notes.push('Output limited to 16 MP.');
  }
  const { ctx } = canvas2d(drawW, drawH);
  ctx.drawImage(bitmap, geo.sx, geo.sy, geo.sw, geo.sh, 0, 0, drawW, drawH);
  bitmap.close();
  const img = await lanczos(ctx.getImageData(0, 0, drawW, drawH), outW, outH);
  return { img, inWidth, inHeight, outW, outH, notes };
}

async function run(job: JobRequest): Promise<JobSuccess> {
  const t0 = performance.now();
  const s: Settings = job.settings;
  const prep = await prepare(job);
  let { img, outW, outH } = prep;
  const { inWidth, inHeight, notes } = prep;

  const alpha = hasTransparency(img.data);
  const few = alpha && countColorsUpTo(img.data, 256) <= 256;
  const format = chooseFormat(s.format, s.opaqueFormat, alpha, few);
  if (alpha && s.format === 'jpeg') notes.push('Has transparency, so saved as ' + format.toUpperCase() + '.');
  const enc = encoders[format];

  let buffer: ArrayBuffer;
  let quality: number | undefined;
  let score: number | undefined;

  if (format === 'png') {
    buffer = await enc(img, 100, true);
    if (!few) notes.push('PNG is lossless; WebP would be much smaller.');
  } else if (s.mode === 'fixed') {
    quality = s.quality;
    buffer = await enc(img, quality, true);
  } else if (s.mode === 'smart') {
    const ref = await lumaOf(img, img.width, img.height);
    const mime = format === 'jpeg' ? 'image/jpeg' : 'image/webp';
    const r = await searchSmart(
      (q) => enc(img, q, false),
      async (bytes) => ssim(ref, await lumaOf(new Blob([bytes], { type: mime }), img.width, img.height)),
      s.ssimTarget,
    );
    quality = r.quality;
    score = r.ssim;
    buffer = format === 'webp' ? await enc(img, r.quality, true) : r.bytes;
  } else {
    // Never spend more bytes than the original, even if the target allows it. HEIC is the exception:
    // it's converted for compatibility, and JPEG/WebP can't match HEVC's compression.
    const maxBytes = job.inputFormat === 'heic' ? s.targetKB * 1024 : Math.min(s.targetKB * 1024, job.file.size);
    let found: { quality: number; bytes: ArrayBuffer } | null = null;
    for (let round = 0; round < 5; round++) {
      found = await searchTarget((q) => enc(img, q, false), maxBytes);
      if (found) break;
      if (round === 4) break;
      img = await lanczos(img, Math.max(1, Math.round(img.width * 0.85)), Math.max(1, Math.round(img.height * 0.85)));
    }
    if (!found) throw new Error(`Couldn't get under ${s.targetKB} KB even at ${img.width}×${img.height}.`);
    if (img.width !== outW) notes.push(`Downscaled to ${img.width}×${img.height} to fit ${s.targetKB} KB.`);
    outW = img.width;
    outH = img.height;
    quality = found.quality;
    buffer = found.bytes;
    if (format === 'webp') {
      const final = await enc(img, found.quality, true);
      if (final.byteLength <= maxBytes) buffer = final;
    }
  }

  // "Never bigger": return the stripped original only if it already matches the target size and format.
  let fallback = false;
  const sameGeometry = outW === inWidth && outH === inHeight;
  const sameFormat = job.inputFormat === format;
  if (buffer.byteLength >= job.file.size && s.mode !== 'target') {
    if (sameGeometry && sameFormat) {
      const orig = new Uint8Array(await job.file.arrayBuffer());
      const stripped = format === 'jpeg' ? stripJpeg(orig) : format === 'png' ? stripPng(orig) : orig;
      if (stripped && stripped.byteLength <= buffer.byteLength) {
        buffer = stripped.slice().buffer;
        fallback = true;
        quality = undefined;
        score = undefined;
        notes.push('Already optimal; original kept (metadata removed).');
      }
    }
    if (!fallback)
      notes.push(
        job.inputFormat === 'heic'
          ? 'Larger than the HEIC original, which compresses better but most apps and sites can’t open.'
          : 'Output is larger than the original.',
      );
  }

  return {
    id: job.id,
    ok: true,
    kind: 'encode',
    buffer,
    format,
    inWidth,
    inHeight,
    width: outW,
    height: outH,
    quality,
    ssim: score,
    fallback,
    notes,
    ms: Math.round(performance.now() - t0),
  };
}

self.onmessage = async (e: MessageEvent<JobRequest>) => {
  const job = e.data;
  let res: JobResponse;
  try {
    if (job.kind === 'reference') {
      const { img } = await prepare(job);
      const bitmap = await createImageBitmap(img, { premultiplyAlpha: 'none' });
      self.postMessage({ id: job.id, ok: true, kind: 'reference', bitmap } satisfies JobResponse, [bitmap]);
      return;
    }
    const out = await run(job);
    self.postMessage(out, [out.buffer]);
    return;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res = { id: job.id, ok: false, error: /decode|source image|InvalidState/i.test(msg) ? 'Could not decode this image (corrupt or unsupported).' : msg };
  }
  self.postMessage(res);
};
