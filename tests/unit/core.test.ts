import { describe, expect, it } from 'vitest';
import { resolveSettings } from '../../src/core';
import { readDimensions } from '../../src/lib/dimensions';
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
});

describe('resolveSettings', () => {
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
