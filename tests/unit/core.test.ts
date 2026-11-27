import { describe, expect, it } from 'vitest';
import { resolveSettings } from '../../src/core';
import { readDimensions, readOrientation } from '../../src/lib/dimensions';
import { Pool } from '../../src/lib/pipeline';
import type { JobRequest } from '../../src/workers/protocol';

describe('readDimensions', () => {
  it('reads JPEG SOF after APP segments', () => {
    const b = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0, 0xff, 0xc0, 0, 17, 8, 0x0f, 0xa0, 0x17, 0x70, 3, 0, 0]);
    expect(readDimensions(b, 'jpeg')).toEqual({ width: 6000, height: 4000 });
  });
  it('reads PNG IHDR', () => {
    const b = new Uint8Array(24);
    b.set([0, 0, 7, 8], 16);
    b.set([0, 0, 3, 0xf4], 20);
    expect(readDimensions(b, 'png')).toEqual({ width: 1800, height: 1012 });
  });
  it('reads WebP VP8X', () => {
    const b = new Uint8Array(30);
    b.set([...'RIFF'].map((c) => c.charCodeAt(0)), 0);
    b.set([...'WEBPVP8X'].map((c) => c.charCodeAt(0)), 8);
    b.set([0x57, 0x02, 0x00], 24); // 600-1
    b.set([0x50, 0x01, 0x00], 27); // 337-1
    expect(readDimensions(b, 'webp')).toEqual({ width: 600, height: 337 });
  });

  it('reads the largest HEIC ispe (skipping tile/thumbnail extents)', () => {
    const ispe = (w: number, h: number) => {
      const box = new Uint8Array(20);
      const v = new DataView(box.buffer);
      v.setUint32(0, 20);
      box.set([...'ispe'].map((c) => c.charCodeAt(0)), 4);
      v.setUint32(12, w);
      v.setUint32(16, h);
      return box;
    };
    const b = new Uint8Array(100);
    b.set(ispe(512, 512), 10);
    b.set(ispe(4032, 3024), 40);
    b.set(ispe(320, 240), 70);
    expect(readDimensions(b, 'heic')).toEqual({ width: 4032, height: 3024 });
    expect(readDimensions(new Uint8Array(40), 'heic')).toBeNull();
  });
});

describe('readOrientation', () => {
  it('finds the EXIF orientation in a JPEG header', () => {
    const tiff = [0x49, 0x49, 0x2a, 0, 8, 0, 0, 0, 1, 0, 0x12, 0x01, 3, 0, 1, 0, 0, 0, 6, 0, 0, 0, 0, 0, 0, 0];
    const body = [...'Exif'].map((c) => c.charCodeAt(0)).concat([0, 0], tiff);
    const app1 = [0xff, 0xe1, (body.length + 2) >> 8, (body.length + 2) & 0xff, ...body];
    expect(readOrientation(new Uint8Array([0xff, 0xd8, ...app1, 0xff, 0xda]))).toBe(6);
    expect(readOrientation(new Uint8Array([0xff, 0xd8, 0xff, 0xda]))).toBe(1);
    expect(readOrientation(new Uint8Array([0x89, 0x50]))).toBe(1);
  });
});

describe('resolveSettings', () => {
  it('accepts aspect limits as numbers or strings and validates them', () => {
    expect(resolveSettings({ minAspect: '4:3', cropPosition: 'top' })).toMatchObject({ minAspect: 4 / 3, cropPosition: 'top', maxWidth: 1600 });
    expect(resolveSettings({ maxAspect: 16 / 9 }).maxAspect).toBeCloseTo(1.7778);
    expect(() => resolveSettings({ minAspect: '16:9', maxAspect: '4:3' })).toThrow(/larger than maxAspect/);
    expect(() => resolveSettings({ minAspect: 'tall' })).toThrow(TypeError);
    expect('minAspect' in resolveSettings({ minAspect: undefined })).toBe(true);
  });

  it('starts from the preset and applies overrides', () => {
    const s = resolveSettings({ preset: 'og', quality: 70 });
    expect(s).toMatchObject({ maxWidth: 1200, maxHeight: 630, fit: 'cover', quality: 70, opaqueFormat: 'jpeg' });
  });
  it('ignores undefined fields except explicit size limits', () => {
    expect(resolveSettings({ preset: 'og', quality: undefined }).quality).toBe(82);
    expect(resolveSettings({ preset: 'content', maxWidth: undefined }).maxWidth).toBeUndefined();
  });
  it('defaults to the content preset', () => {
    expect(resolveSettings().maxWidth).toBe(1600);
  });
});

/** Fake worker: replies after `release(id)` is called. */
class FakeWorker {
  static all: FakeWorker[] = [];
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: ((e: ErrorEvent) => void) | null = null;
  job: JobRequest | null = null;
  terminated = false;
  constructor() {
    FakeWorker.all.push(this);
  }
  postMessage(job: JobRequest) {
    this.job = job;
  }
  terminate() {
    this.terminated = true;
  }
  finish() {
    const id = this.job!.id;
    this.job = null;
    this.onmessage?.({ data: { id, ok: false, error: 'done' } } as MessageEvent);
  }
}

const job = (id: string) => ({ id, file: new Blob(), inputFormat: 'jpeg', settings: resolveSettings() }) as JobRequest;
const busy = () => FakeWorker.all.filter((w) => w.job && !w.terminated).map((w) => w.job!.id);

describe('Pool', () => {
  it('respects concurrency and the megapixel budget', async () => {
    FakeWorker.all = [];
    const pool = new Pool({ concurrency: 3, budgetMP: 50, workerFactory: () => new FakeWorker() as unknown as Worker });
    const done: string[] = [];
    for (const [id, mp] of [['a', 24], ['b', 24], ['c', 24], ['d', 1]] as const) pool.run(job(id), mp).then(() => done.push(id));
    expect(busy()).toEqual(['a', 'b']); // c would exceed 50 MP; d waits behind it (FIFO)
    FakeWorker.all.find((w) => w.job?.id === 'a')!.finish();
    await Promise.resolve();
    expect(busy().sort()).toEqual(['b', 'c', 'd']);
  });
  it('runs an over-budget job alone', () => {
    FakeWorker.all = [];
    const pool = new Pool({ concurrency: 2, budgetMP: 10, workerFactory: () => new FakeWorker() as unknown as Worker });
    pool.run(job('huge'), 100);
    pool.run(job('small'), 1);
    expect(busy()).toEqual(['huge']);
  });
  it('cancels queued and running jobs', async () => {
    FakeWorker.all = [];
    const pool = new Pool({ concurrency: 1, workerFactory: () => new FakeWorker() as unknown as Worker });
    const a = pool.run(job('a'));
    const b = pool.run(job('b'));
    pool.cancel('b');
    expect(await b).toMatchObject({ ok: false, error: 'cancelled' });
    pool.cancel('a');
    expect(await a).toMatchObject({ ok: false, error: 'cancelled' });
    expect(FakeWorker.all[0].terminated).toBe(true);
  });
});
