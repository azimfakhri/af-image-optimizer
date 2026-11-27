import { createOptimizer, OptimizeError, type OptimizeOptions, type OptimizeResult, type Optimizer, type PoolOptions } from '../core';

export interface EnhanceOptions extends OptimizeOptions {
  /** Pool settings (concurrency, memory budget, self-hosted worker URL). */
  pool?: PoolOptions;
  /** Called as each file finishes. */
  onProgress?: (done: number, total: number, result?: OptimizeResult) => void;
  /** Called when a file can't be optimised; the original file is kept. */
  onError?: (file: File, error: OptimizeError) => void;
  /** Called after the input's files have been replaced. */
  onDone?: (results: (OptimizeResult | OptimizeError)[]) => void;
}

export interface Enhanced {
  /** Resolves when the current batch (if any) has finished. */
  ready(): Promise<void>;
  dispose(): void;
}

const IMAGE = /^image\/(jpeg|pjpeg|png|webp|avif)$|\.(jpe?g|jfif|jpe|pjpe?g|pjp|png|webp|avif)$/i;
const ours = new WeakSet<Event>();

/**
 * Optimise images picked in an existing `<input type="file">` before the page sees them.
 * The original `change` event is held back; once done, the input's `files` are replaced and
 * fresh `input` + `change` events are fired. Form submits wait for the batch to finish.
 * Non-image files pass through untouched; failed images keep their original file.
 *
 * Sets `data-optimizing` on the input while working.
 */
export function enhance(input: HTMLInputElement, options: EnhanceOptions = {}): Enhanced {
  const { pool, onProgress, onError, onDone, ...optimizeOptions } = options;
  let optimizer: Optimizer | null = null;
  let current: Promise<void> = Promise.resolve();
  let pending = false;
  let abort: AbortController | null = null;

  async function run(files: File[]) {
    optimizer ??= createOptimizer(pool);
    abort?.abort();
    const ctl = (abort = new AbortController());
    pending = true;
    input.setAttribute('data-optimizing', '');
    let done = 0;
    const images = files.filter((f) => IMAGE.test(f.type) || IMAGE.test(f.name));
    onProgress?.(0, images.length);
    const results: (OptimizeResult | OptimizeError)[] = [];
    const out = await Promise.all(
      files.map(async (f) => {
        if (!images.includes(f)) return f;
        try {
          const r = await optimizer!.optimize(f, optimizeOptions, { signal: ctl.signal });
          results.push(r);
          onProgress?.(++done, images.length, r);
          return r.file;
        } catch (e) {
          const err = e instanceof OptimizeError ? e : new OptimizeError('failed', String(e));
          results.push(err);
          if (err.code !== 'cancelled') onError?.(f, err);
          onProgress?.(++done, images.length);
          return f;
        }
      }),
    );
    if (ctl.signal.aborted) return;
    const dt = new DataTransfer();
    for (const f of out) dt.items.add(f);
    input.files = dt.files;
    pending = false;
    input.removeAttribute('data-optimizing');
    for (const type of ['input', 'change']) {
      const ev = new Event(type, { bubbles: true });
      ours.add(ev);
      input.dispatchEvent(ev);
    }
    onDone?.(results);
  }

  const hasImages = () => Array.from(input.files ?? []).some((f) => IMAGE.test(f.type) || IMAGE.test(f.name));
  // Capture-phase listeners on the target run before the page's own listeners.
  // Hide the native `input` event too, so the page never sees the unoptimised files.
  const onInput = (e: Event) => {
    if (!ours.has(e) && hasImages()) e.stopImmediatePropagation();
  };
  const onChange = (e: Event) => {
    if (ours.has(e) || !hasImages()) return;
    e.stopImmediatePropagation();
    current = run(Array.from(input.files ?? []));
  };
  const onSubmit = (e: SubmitEvent) => {
    if (!pending) return;
    // Hold the submit entirely (the page's handlers must not see the unoptimised files), then replay it.
    e.preventDefault();
    e.stopImmediatePropagation();
    const form = e.target as HTMLFormElement;
    const submitter = e.submitter;
    current.then(() => form.requestSubmit(submitter as HTMLElement | null));
  };

  input.addEventListener('change', onChange, { capture: true });
  input.addEventListener('input', onInput, { capture: true });
  const form = input.form;
  form?.addEventListener('submit', onSubmit, { capture: true });

  return {
    ready: () => current,
    dispose() {
      abort?.abort();
      input.removeEventListener('change', onChange, { capture: true });
      input.removeEventListener('input', onInput, { capture: true });
      form?.removeEventListener('submit', onSubmit, { capture: true });
      optimizer?.dispose();
    },
  };
}
