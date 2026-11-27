import type { JobRequest, JobResponse } from '../workers/protocol';

interface Slot {
  worker: Worker;
  jobId: string | null;
}

interface Pending {
  job: JobRequest;
  resolve: (r: JobResponse) => void;
}

function spawn(): Worker {
  return new Worker(new URL('../workers/encoder.worker.ts', import.meta.url), { type: 'module' });
}

export function poolSize(): number {
  const cores = navigator.hardwareConcurrency || 2;
  const mobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Mac/.test(navigator.userAgent));
  return Math.max(1, Math.min(cores - 1, mobile ? 2 : 4));
}

/** Fixed-size worker pool with a FIFO queue and per-job cancellation. */
export class Pool {
  private slots: Slot[] = [];
  private queue: Pending[] = [];
  private running = new Map<string, { slot: Slot; resolve: (r: JobResponse) => void }>();

  private size: number;

  constructor(size = poolSize()) {
    this.size = size;
  }

  run(job: JobRequest): Promise<JobResponse> {
    return new Promise((resolve) => {
      this.queue.push({ job, resolve });
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
      r.slot.worker.terminate();
      r.slot.worker = this.wire(spawn(), r.slot);
      r.slot.jobId = null;
      this.running.delete(id);
      r.resolve({ id, ok: false, error: 'cancelled' });
      this.pump();
    }
  }

  cancelAll(): void {
    for (const p of this.queue.splice(0)) p.resolve({ id: p.job.id, ok: false, error: 'cancelled' });
    for (const id of [...this.running.keys()]) this.cancel(id);
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
      slot.worker.terminate();
      slot.worker = this.wire(spawn(), slot);
      slot.jobId = null;
      if (id) {
        const r = this.running.get(id);
        this.running.delete(id);
        r?.resolve({ id, ok: false, error: 'The image is too large for this device (out of memory).' });
      }
      this.pump();
    };
    return worker;
  }

  private pump(): void {
    while (this.queue.length) {
      let slot = this.slots.find((s) => s.jobId === null);
      if (!slot && this.slots.length < this.size) {
        slot = { worker: null as unknown as Worker, jobId: null };
        slot.worker = this.wire(spawn(), slot);
        this.slots.push(slot);
      }
      if (!slot) return;
      const p = this.queue.shift()!;
      slot.jobId = p.job.id;
      this.running.set(p.job.id, { slot, resolve: p.resolve });
      slot.worker.postMessage(p.job);
    }
  }
}
