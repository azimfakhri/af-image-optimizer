import workerUrl from '../workers/encoder.worker.ts?worker&url';
import type { JobRequest, JobResponse } from '../workers/protocol';

interface Slot {
  worker: Worker;
  jobId: string | null;
}

interface Pending {
  job: JobRequest;
  cost: number;
  resolve: (r: JobResponse) => void;
}

interface Running {
  slot: Slot;
  cost: number;
  resolve: (r: JobResponse) => void;
}

export type WorkerFactory = () => Worker;

/**
 * Start the encoder worker from `url` (default: the bundled worker).
 * Browsers refuse cross-origin worker scripts, so when the library is served from a CDN
 * we start a same-origin blob worker that imports the real one (its WASM then resolves against the CDN).
 */
export function startWorker(url: string = workerUrl): Worker {
  const abs = new URL(url, typeof location !== 'undefined' ? location.href : undefined);
  if (typeof location === 'undefined' || abs.origin === location.origin) return new Worker(abs, { type: 'module' });
  const shim = URL.createObjectURL(new Blob([`import ${JSON.stringify(abs.href)};`], { type: 'text/javascript' }));
  const w = new Worker(shim, { type: 'module' });
  setTimeout(() => URL.revokeObjectURL(shim), 30_000);
  return w;
}

export const defaultWorkerFactory: WorkerFactory = () => startWorker();

export function isMobile(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Mac/.test(navigator.userAgent));
}

export function defaultConcurrency(): number {
  const cores = (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) || 2;
  return Math.max(1, Math.min(cores - 1, isMobile() ? 2 : 4));
}

/** Megapixels of decoded source allowed in flight at once. */
export function defaultBudgetMP(): number {
  return isMobile() ? 50 : 150;
}

export interface PoolOptions {
  concurrency?: number;
  budgetMP?: number;
  /** Self-hosted copy of the encoder worker (its .wasm files must sit next to it). */
  workerUrl?: string;
  workerFactory?: WorkerFactory;
}

/**
 * Worker pool with a FIFO queue, per-job cancellation and a megapixel budget:
 * a job starts only if it fits in the remaining budget (or nothing else is running).
 */
export class Pool {
  private slots: Slot[] = [];
  private queue: Pending[] = [];
  private running = new Map<string, Running>();
  private size: number;
  private budget: number;
  private factory: WorkerFactory;

  constructor(opts: PoolOptions = {}) {
    this.size = opts.concurrency ?? defaultConcurrency();
    this.budget = opts.budgetMP ?? defaultBudgetMP();
    const url = opts.workerUrl;
    this.factory = opts.workerFactory ?? (url ? () => startWorker(url) : defaultWorkerFactory);
  }

  /** `cost` is the job's decoded size in megapixels (estimate). */
  run(job: JobRequest, cost = 12): Promise<JobResponse> {
    return new Promise((resolve) => {
      this.queue.push({ job, cost, resolve });
      this.pump();
    });
  }

  /** Drop a queued job or kill the worker running it. Resolves its promise with a cancellation failure. */
  cancel(id: string): void {
    const qi = this.queue.findIndex((p) => p.job.id === id);
    if (qi >= 0) {
      const [p] = this.queue.splice(qi, 1);
      p.resolve({ id, ok: false, error: 'cancelled' });
      return;
    }
    const r = this.running.get(id);
    if (r) {
      this.recycle(r.slot);
      this.running.delete(id);
      r.resolve({ id, ok: false, error: 'cancelled' });
      this.pump();
    }
  }

  cancelAll(): void {
    for (const p of this.queue.splice(0)) p.resolve({ id: p.job.id, ok: false, error: 'cancelled' });
    for (const id of [...this.running.keys()]) this.cancel(id);
  }

  dispose(): void {
    this.cancelAll();
    for (const s of this.slots) s.worker.terminate();
    this.slots = [];
  }

  private recycle(slot: Slot): void {
    slot.worker.terminate();
    slot.worker = this.wire(this.factory(), slot);
    slot.jobId = null;
  }

  private wire(worker: Worker, slot: Slot): Worker {
    worker.onmessage = (e: MessageEvent<JobResponse>) => {
      const r = this.running.get(e.data.id);
      slot.jobId = null;
      if (r) {
        this.running.delete(e.data.id);
        r.resolve(e.data);
      }
      this.pump();
    };
    worker.onerror = (e) => {
      e.preventDefault();
      const id = slot.jobId;
      this.recycle(slot);
      if (id) {
        const r = this.running.get(id);
        this.running.delete(id);
        r?.resolve({ id, ok: false, error: 'The image is too large for this device (out of memory).' });
      }
      this.pump();
    };
    return worker;
  }

  private inFlightCost(): number {
    let n = 0;
    for (const r of this.running.values()) n += r.cost;
    return n;
  }

  private pump(): void {
    while (this.queue.length) {
      const next = this.queue[0];
      if (this.running.size > 0 && this.inFlightCost() + next.cost > this.budget) return;
      let slot = this.slots.find((s) => s.jobId === null);
      if (!slot && this.slots.length < this.size) {
        slot = { worker: null as unknown as Worker, jobId: null };
        slot.worker = this.wire(this.factory(), slot);
        this.slots.push(slot);
      }
      if (!slot) return;
      this.queue.shift();
      slot.jobId = next.job.id;
      this.running.set(next.job.id, { slot, cost: next.cost, resolve: next.resolve });
      slot.worker.postMessage(next.job);
    }
  }
}
