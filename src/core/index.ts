/**
 * Framework-free API. Used by the app, the npm library, the web component and the input enhancer.
 *
 *   import { optimize } from 'af-image-optimizer';
 *   const r = await optimize(file, { preset: 'og' });
 *   upload(r.file);
 */
import { detectFormat, type InputFormat } from '../lib/detectFormat';
import { PROBE_BYTES, readDimensions, readOrientation } from '../lib/dimensions';
import { formatAspect, parseAspect, type AspectInput, type CropPosition } from '../lib/geometry';
import { outputName } from '../lib/naming';
import { Pool, type PoolOptions } from '../lib/pipeline';
import { getPreset, PRESETS, type OutputFormat, type Preset, type Settings } from '../lib/presets';
import { EXT, MIME } from '../workers/protocol';

export { PRESETS, getPreset, detectFormat, parseAspect, formatAspect };
export type { InputFormat, OutputFormat, Preset, Settings, PoolOptions, AspectInput, CropPosition };

export const MAX_FILE_BYTES = 100 * 1024 * 1024;
/** Hard cap on decoded source size (megapixels). */
export const MAX_SOURCE_MP = 200;

export interface OptimizeOptions extends Omit<Partial<Settings>, 'minAspect' | 'maxAspect'> {
  /** Preset id to start from (default: 'content'). Other fields override it. */
  preset?: string;
  /** Crop images narrower/taller than this width/height ratio: `4 / 3` or `'4:3'`. Wider images are untouched. */
  minAspect?: AspectInput;
  /** Crop images wider than this width/height ratio: `16 / 9` or `'16:9'`. */
  maxAspect?: AspectInput;
}

export interface OptimizeResult {
  /** Optimised file with its new name (e.g. photo.jfif → photo.webp). */
  file: File;
  format: OutputFormat;
  inputFormat: InputFormat;
  originalSize: number;
  width: number;
  height: number;
  inWidth: number;
  inHeight: number;
  quality?: number;
  ssim?: number;
  /** True if the original (metadata stripped) was kept because re-encoding didn't help. */
  fallback: boolean;
  notes: string[];
  ms: number;
}

export type ErrorCode = 'unsupported' | 'too-large' | 'decode' | 'memory' | 'cancelled' | 'failed';

export class OptimizeError extends Error {
  code: ErrorCode;
  constructor(code: ErrorCode, message: string) {
    super(message);
    this.name = 'OptimizeError';
    this.code = code;
  }
}

export interface Probe {
  format: InputFormat;
  /** Stored dimensions from the header, if readable (not rotation-corrected). */
  width?: number;
  height?: number;
  /** EXIF orientation (1–8; JPEG only). 5–8 mean the photo displays rotated 90°. */
  orientation?: number;
  /** Dimensions as displayed, after EXIF rotation. Use these to tell portrait from landscape. */
  displayWidth?: number;
  displayHeight?: number;
}

/** Sniff the format (magic bytes) and header dimensions. Throws OptimizeError('unsupported' | 'too-large'). */
export async function probe(file: Blob): Promise<Probe> {
  if (file.size > MAX_FILE_BYTES) throw new OptimizeError('too-large', 'Larger than 100 MB.');
  const head = new Uint8Array(await file.slice(0, PROBE_BYTES).arrayBuffer());
  const d = detectFormat(head);
  if (!d.ok) throw new OptimizeError('unsupported', d.reason);
  const dims = readDimensions(head, d.format);
  if (dims && (dims.width * dims.height) / 1e6 > MAX_SOURCE_MP)
    throw new OptimizeError('too-large', `Larger than ${MAX_SOURCE_MP} megapixels.`);
  if (!dims) return { format: d.format };
  const orientation = d.format === 'jpeg' ? readOrientation(head) : undefined;
  const swap = orientation !== undefined && orientation >= 5;
  return {
    format: d.format,
    ...dims,
    ...(orientation !== undefined && { orientation }),
    displayWidth: swap ? dims.height : dims.width,
    displayHeight: swap ? dims.width : dims.height,
  };
}

/** Fields where an explicit `undefined` means "off/unbounded" instead of "use the preset's value". */
const CLEARABLE = new Set(['maxWidth', 'maxHeight', 'minAspect', 'maxAspect']);

export function resolveSettings(opts: OptimizeOptions = {}): Settings {
  const { preset, minAspect, maxAspect, ...rest } = opts;
  const overrides: Partial<Settings> = { ...rest };
  if ('minAspect' in opts) overrides.minAspect = minAspect === undefined ? undefined : parseAspect(minAspect);
  if ('maxAspect' in opts) overrides.maxAspect = maxAspect === undefined ? undefined : parseAspect(maxAspect);
  const defined = Object.fromEntries(Object.entries(overrides).filter(([k, v]) => v !== undefined || CLEARABLE.has(k)));
  const s: Settings = { ...getPreset(preset ?? 'content').settings, ...defined };
  if (s.minAspect && s.maxAspect && s.minAspect > s.maxAspect)
    throw new TypeError(`minAspect (${s.minAspect}) is larger than maxAspect (${s.maxAspect}).`);
  return s;
}

export interface CallOptions {
  signal?: AbortSignal;
  /** Output name base; defaults to the File's name. */
  name?: string;
  /** Skip probing when the caller already did it. */
  probe?: Probe;
}

export interface Optimizer {
  optimize(file: Blob, options?: OptimizeOptions, call?: CallOptions): Promise<OptimizeResult>;
  /** The resized, unencoded crop (what the optimised file is compared against). Caller must close() it. */
  reference(file: Blob, options?: OptimizeOptions, call?: CallOptions): Promise<ImageBitmap>;
  optimizeAll(
    files: Blob[],
    options?: OptimizeOptions,
    onEach?: (index: number, result: OptimizeResult | OptimizeError) => void,
    call?: Omit<CallOptions, 'name' | 'probe'>,
  ): Promise<(OptimizeResult | OptimizeError)[]>;
  dispose(): void;
}

let seq = 0;

function toError(msg: string): OptimizeError {
  if (msg === 'cancelled') return new OptimizeError('cancelled', 'Cancelled.');
  if (/out of memory/i.test(msg)) return new OptimizeError('memory', msg);
  if (/decode/i.test(msg)) return new OptimizeError('decode', msg);
  return new OptimizeError('failed', msg);
}

export function createOptimizer(poolOptions: PoolOptions = {}): Optimizer {
  let pool: Pool | null = null;
  const getPool = () => (pool ??= new Pool(poolOptions));

  async function submit(kind: 'encode' | 'reference', file: Blob, options: OptimizeOptions | undefined, call: CallOptions = {}) {
    if (call.signal?.aborted) throw new OptimizeError('cancelled', 'Cancelled.');
    const info = call.probe ?? (await probe(file));
    const settings = resolveSettings(options);
    const id = `j${++seq}`;
    const cost = info.width && info.height ? (info.width * info.height) / 1e6 : Math.max(4, file.size / 250_000);
    const onAbort = () => pool?.cancel(id);
    call.signal?.addEventListener('abort', onAbort, { once: true });
    try {
      const res = await getPool().run({ id, kind, file, inputFormat: info.format, settings }, cost);
      if (!res.ok) throw toError(res.error);
      return { res, info, settings };
    } finally {
      call.signal?.removeEventListener('abort', onAbort);
    }
  }

  const api: Optimizer = {
    async optimize(file, options, call = {}) {
      const { res, info, settings } = await submit('encode', file, options, call);
      if (res.kind !== 'encode') throw new OptimizeError('failed', 'Unexpected worker response.');
      const base = call.name ?? (file instanceof File ? file.name : 'image');
      const out = new File([res.buffer], outputName(base, EXT[res.format], settings.suffix), { type: MIME[res.format] });
      return {
        file: out,
        format: res.format,
        inputFormat: info.format,
        originalSize: file.size,
        width: res.width,
        height: res.height,
        inWidth: res.inWidth,
        inHeight: res.inHeight,
        quality: res.quality,
        ssim: res.ssim,
        fallback: res.fallback,
        notes: res.notes,
        ms: res.ms,
      };
    },
    async reference(file, options, call = {}) {
      const { res } = await submit('reference', file, options, call);
      if (res.kind !== 'reference') throw new OptimizeError('failed', 'Unexpected worker response.');
      return res.bitmap;
    },
    async optimizeAll(files, options, onEach, call = {}) {
      return Promise.all(
        files.map((f, i) =>
          api.optimize(f, options, call).then(
            (r) => (onEach?.(i, r), r),
            (e: unknown) => {
              const err = e instanceof OptimizeError ? e : new OptimizeError('failed', String(e));
              onEach?.(i, err);
              return err;
            },
          ),
        ),
      );
    },
    dispose() {
      pool?.dispose();
      pool = null;
    },
  };
  return api;
}

let shared: Optimizer | null = null;

/** Optimise one image with a shared default optimizer. */
export function optimize(file: Blob, options?: OptimizeOptions, call?: CallOptions): Promise<OptimizeResult> {
  return (shared ??= createOptimizer()).optimize(file, options, call);
}
