import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { createOptimizer, OptimizeError, probe, type Optimizer, type Probe } from './core';
import type { InputFormat } from './lib/detectFormat';
import type { Picked } from './lib/folderInput';
import { DEFAULT_PRESET_ID, getPreset, type OutputFormat, type Settings } from './lib/presets';

export const MAX_FILES = 500;

export interface Result {
  blob: File;
  url: string;
  /** Output path relative to the picked root (folders kept). */
  path: string;
  format: OutputFormat;
  width: number;
  height: number;
  inWidth: number;
  inHeight: number;
  quality?: number;
  ssim?: number;
  fallback: boolean;
  notes: string[];
  ms: number;
}

export type Status = 'detecting' | 'queued' | 'processing' | 'done' | 'error' | 'rejected';

export interface Item {
  id: string;
  file: File;
  relativePath: string;
  status: Status;
  probe?: Probe;
  inputFormat?: InputFormat;
  /** Per-file fixed quality set from the compare view. */
  override?: number;
  error?: string;
  result?: Result;
}

type Action =
  | { type: 'add'; items: Item[] }
  | { type: 'patch'; id: string; patch: Partial<Item> }
  | { type: 'patchAll'; patch: (it: Item) => Partial<Item> | null }
  | { type: 'remove'; id: string }
  | { type: 'clear' };

function revoke(it: Item | undefined, next?: Result) {
  if (it?.result && it.result !== next) URL.revokeObjectURL(it.result.url);
}

function reducer(state: Item[], a: Action): Item[] {
  switch (a.type) {
    case 'add':
      return [...state, ...a.items];
    case 'patch':
      return state.map((it) => {
        if (it.id !== a.id) return it;
        if ('result' in a.patch) revoke(it, a.patch.result);
        return { ...it, ...a.patch };
      });
    case 'patchAll':
      return state.map((it) => {
        const p = a.patch(it);
        return p ? { ...it, ...p } : it;
      });
    case 'remove':
      revoke(state.find((x) => x.id === a.id));
      return state.filter((x) => x.id !== a.id);
    case 'clear':
      for (const it of state) revoke(it);
      return [];
  }
}

const IMAGE_NAME = /\.(jpe?g|jfif|jpe|pjpe?g|pjp|png|webp|avif|heic|heif)$/i;

type Runnable = Pick<Item, 'id' | 'file' | 'relativePath' | 'probe' | 'override'>;

let seq = 0;

/**
 * @param fixed Settings an embedder pins (web component attributes, iframe URL parameters). They're applied on top of
 *   the initial preset and every preset the user picks later.
 */
export function useOptimizer(initialPresetId = DEFAULT_PRESET_ID, fixed?: Partial<Settings>) {
  const [items, dispatch] = useReducer(reducer, []);
  const [presetId, setPresetId] = useState(initialPresetId);
  const [pinned] = useState<Partial<Settings>>(() => fixed ?? {});
  const [settings, setSettingsState] = useState<Settings>(() => ({ ...getPreset(initialPresetId).settings, ...pinned }));
  const [notice, setNotice] = useState<string | null>(null);

  const optimizer = useRef<Optimizer | null>(null);
  const settingsRef = useRef(settings);
  const itemsRef = useRef(items);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);
  /** AbortController of each item's latest run; superseded runs are aborted and their results dropped. */
  const runs = useRef(new Map<string, AbortController>());

  const process = useCallback(async (it: Runnable) => {
    if (!it.probe) return;
    runs.current.get(it.id)?.abort();
    const ctl = new AbortController();
    runs.current.set(it.id, ctl);
    const base = settingsRef.current;
    const s: Settings = it.override === undefined ? base : { ...base, mode: 'fixed', quality: it.override };
    dispatch({ type: 'patch', id: it.id, patch: { status: 'processing', error: undefined } });
    try {
      optimizer.current ??= createOptimizer();
      const r = await optimizer.current.optimize(it.file, s, { signal: ctl.signal, probe: it.probe });
      if (runs.current.get(it.id) !== ctl) return;
      const slash = it.relativePath.lastIndexOf('/');
      const result: Result = {
        blob: r.file,
        url: URL.createObjectURL(r.file),
        path: it.relativePath.slice(0, slash + 1) + r.file.name,
        format: r.format,
        width: r.width,
        height: r.height,
        inWidth: r.inWidth,
        inHeight: r.inHeight,
        quality: r.quality,
        ssim: r.ssim,
        fallback: r.fallback,
        notes: r.notes,
        ms: r.ms,
      };
      dispatch({ type: 'patch', id: it.id, patch: { status: 'done', result } });
    } catch (e) {
      if (runs.current.get(it.id) !== ctl) return;
      const err = e instanceof OptimizeError ? e : new OptimizeError('failed', String(e));
      dispatch({ type: 'patch', id: it.id, patch: { status: 'error', error: err.message } });
    }
  }, []);

  const addFiles = useCallback(
    async (picked: Picked[]) => {
      const room = Math.max(0, MAX_FILES - itemsRef.current.length);
      if (picked.length > room) {
        setNotice(`Only ${MAX_FILES} files per batch; ${picked.length - room} ignored.`);
        picked = picked.slice(0, room);
      }
      let skipped = 0;
      const fresh: Item[] = [];
      for (const p of picked) {
        // Quietly skip non-images found while walking folders (.DS_Store, .txt…).
        if (p.relativePath.includes('/') && !IMAGE_NAME.test(p.file.name) && !p.file.type.startsWith('image/')) {
          skipped++;
          continue;
        }
        fresh.push({ id: `f${++seq}`, file: p.file, relativePath: p.relativePath, status: 'detecting' });
      }
      if (skipped) setNotice(`${skipped} non-image file${skipped > 1 ? 's' : ''} skipped.`);
      dispatch({ type: 'add', items: fresh });
      await Promise.all(
        fresh.map(async (it) => {
          try {
            const info = await probe(it.file);
            dispatch({ type: 'patch', id: it.id, patch: { status: 'queued', probe: info, inputFormat: info.format } });
            await process({ ...it, probe: info });
          } catch (e) {
            dispatch({ type: 'patch', id: it.id, patch: { status: 'rejected', error: e instanceof Error ? e.message : String(e) } });
          }
        }),
      );
    },
    [process],
  );

  // Re-run every processable file when global settings change (debounced). Per-file overrides are cleared.
  const firstRun = useRef(true);
  useEffect(() => {
    settingsRef.current = settings;
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    const t = setTimeout(() => {
      dispatch({ type: 'patchAll', patch: (it) => (it.override !== undefined ? { override: undefined } : null) });
      for (const it of itemsRef.current) if (it.probe && it.status !== 'rejected') process({ ...it, override: undefined });
    }, 350);
    return () => clearTimeout(t);
  }, [settings, process]);

  useEffect(() => () => optimizer.current?.dispose(), []);

  const selectPreset = useCallback((id: string) => {
    setPresetId(id);
    setSettingsState({ ...getPreset(id).settings, ...pinned });
  }, [pinned]);

  /** Editing any field turns the selection into Custom, keeping the edited values. */
  const updateSettings = useCallback((patch: Partial<Settings>) => {
    setPresetId('custom');
    setSettingsState((s) => ({ ...s, ...patch }));
  }, []);

  const setOverride = useCallback(
    (id: string, quality: number | undefined) => {
      const it = itemsRef.current.find((x) => x.id === id);
      if (!it) return;
      dispatch({ type: 'patch', id, patch: { override: quality } });
      process({ ...it, override: quality });
    },
    [process],
  );

  const retry = useCallback(
    (id: string) => {
      const it = itemsRef.current.find((x) => x.id === id);
      if (it?.probe) process(it);
    },
    [process],
  );

  const cancelAll = useCallback(() => {
    for (const it of itemsRef.current) {
      if (it.status === 'queued' || it.status === 'processing') {
        runs.current.get(it.id)?.abort();
        runs.current.delete(it.id);
        dispatch({ type: 'patch', id: it.id, patch: { status: 'error', error: 'Cancelled.' } });
      }
    }
  }, []);

  const remove = useCallback((id: string) => {
    runs.current.get(id)?.abort();
    runs.current.delete(id);
    dispatch({ type: 'remove', id });
  }, []);

  const clear = useCallback(() => {
    for (const c of runs.current.values()) c.abort();
    runs.current.clear();
    dispatch({ type: 'clear' });
    setNotice(null);
  }, []);

  /** Resized, unencoded original for the compare view. Caller closes the bitmap. */
  const reference = useCallback((it: Item) => {
    optimizer.current ??= createOptimizer();
    return optimizer.current.reference(it.file, settingsRef.current, { probe: it.probe });
  }, []);

  return {
    items, presetId, settings, notice, setNotice,
    addFiles, selectPreset, updateSettings, setOverride, retry, cancelAll, remove, clear, reference,
  };
}

export type OptimizerStore = ReturnType<typeof useOptimizer>;
