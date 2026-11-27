import type { InputFormat } from '../lib/detectFormat';
import type { OutputFormat, Settings } from '../lib/presets';

export interface JobRequest {
  id: string;
  /** 'encode' (default) optimises; 'reference' returns the resized, unencoded crop as an ImageBitmap for comparison. */
  kind?: 'encode' | 'reference';
  file: Blob;
  inputFormat: InputFormat;
  settings: Settings;
}

export interface JobSuccess {
  id: string;
  ok: true;
  kind: 'encode';
  buffer: ArrayBuffer;
  format: OutputFormat;
  inWidth: number;
  inHeight: number;
  width: number;
  height: number;
  quality?: number;
  ssim?: number;
  /** The original (metadata-stripped) file was returned because re-encoding didn't help. */
  fallback: boolean;
  notes: string[];
  ms: number;
}

export interface ReferenceSuccess {
  id: string;
  ok: true;
  kind: 'reference';
  bitmap: ImageBitmap;
}

export interface JobFailure {
  id: string;
  ok: false;
  error: string;
}

export type JobResponse = JobSuccess | ReferenceSuccess | JobFailure;

export const MIME: Record<OutputFormat, string> = { jpeg: 'image/jpeg', webp: 'image/webp', png: 'image/png' };
export const EXT: Record<OutputFormat, string> = { jpeg: 'jpg', webp: 'webp', png: 'png' };
