import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { detectFileFormat, type InputFormat } from './lib/detectFormat';
import type { Picked } from './lib/folderInput';
import { outputName } from './lib/naming';
import { Pool } from './lib/pipeline';
import { DEFAULT_PRESET_ID, getPreset, type OutputFormat, type Settings } from './lib/presets';
import { EXT, MIME } from './workers/protocol';

export const MAX_FILES = 500;
export const MAX_FILE_BYTES = 100 * 1024 * 1024;

export interface Result {
  blob: Blob;
  url: string;
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
  inputFormat?: InputFormat;
  error?: string;
  result?: Result;
}

type Action =
  | { type: 'add'; items: Item[] }
  | { type: 'patch'; id: string; patch: Partial<Item> }
  | { type: 'remove'; id: string }
  | { type: 'clear' };

function reducer(state: Item[], a: Action): Item[] {
  switch (a.type) {
    case 'add':
      return [...state, ...a.items];
    case 'patch':
      return state.map((it) => {
        if (it.id !== a.id) return it;
        if (a.patch.result !== undefined && it.result && it.result !== a.patch.result) URL.revokeObjectURL(it.result.url);
        return { ...it, ...a.patch };
      });
    case 'remove': {
      const it = state.find((x) => x.id === a.id);
      if (it?.result) URL.revokeObjectURL(it.result.url);
      return state.filter((x) => x.id !== a.id);
    }
    case 'clear':
      for (const it of state) if (it.result) URL.revokeObjectURL(it.result.url);
      return [];
  }
}

function outputPath(relativePath: string, format: OutputFormat, suffix: string): string {
  const slash = relativePath.lastIndexOf('/');
  const dir = relativePath.slice(0, slash + 1);
  return dir + outputName(relativePath.slice(slash + 1), EXT[format], suffix);
}

let seq = 0;

export function useOptimizer(initialPresetId = DEFAULT_PRESET_ID) {
  const [items, dispatch] = useReducer(reducer, []);
  const [presetId, setPresetId] = useState(initialPresetId);
  const [settings, setSettingsState] = useState<Settings>(() => getPreset(initialPresetId).settings);
  const [notice, setNotice] = useState<string | null>(null);

  const pool = useRef<Pool | null>(null);
  const settingsRef = useRef(settings);
  const itemsRef = useRef(items);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  /** Latest pool job id per item; stale results from superseded runs are dropped. */
  const latestRun = useRef(new Map<string, string>());
  const getPool = () => (pool.current ??= new Pool());

  const process = useCallback(async (id: string, file: File, relativePath: string, inputFormat: InputFormat) => {
    const s = settingsRef.current;
    const runId = `${id}#${++seq}`;
    latestRun.current.set(id, runId);
    dispatch({ type: 'patch', id, patch: { status: 'processing', error: undefined } });
    const res = await getPool().run({ id: runId, file, inputFormat, settings: s });
    if (latestRun.current.get(id) !== runId) return;
    if (!res.ok) {
      if (res.error !== 'cancelled') dispatch({ type: 'patch', id, patch: { status: 'error', error: res.error } });
      return;
    }
    const blob = new Blob([res.buffer], { type: MIME[res.format] });
    const result: Result = {
      blob,
      url: URL.createObjectURL(blob),
      path: outputPath(relativePath, res.format, s.suffix),
      format: res.format,
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
    dispatch({ type: 'patch', id, patch: { status: 'done', result } });
  }, []);

  const addFiles = useCallback(
    async (picked: Picked[]) => {
      const room = MAX_FILES - itemsRef.current.length;
      let skipped = 0;
      if (picked.length > room) {
        setNotice(`Only ${MAX_FILES} files per batch; ${picked.length - room} ignored.`);
        picked = picked.slice(0, Math.max(0, room));
      }
      const fresh: Item[] = [];
      for (const p of picked) {
        // Silently skip obvious non-images found while walking folders (e.g. .DS_Store, .txt).
        if (p.relativePath.includes('/') && !/\.(jpe?g|jfif|jpe|pjpe?g|pjp|png|webp|avif|heic|heif)$/i.test(p.file.name) && !p.file.type.startsWith('image/')) {
          skipped++;
          continue;
        }
        const id = `f${++seq}`;
        if (p.file.size > MAX_FILE_BYTES) {
          fresh.push({ id, file: p.file, relativePath: p.relativePath, status: 'rejected', error: 'Larger than 100 MB.' });
        } else {
          fresh.push({ id, file: p.file, relativePath: p.relativePath, status: 'detecting' });
        }
      }
      if (skipped) setNotice(`${skipped} non-image file${skipped > 1 ? 's' : ''} skipped.`);
      dispatch({ type: 'add', items: fresh });
      await Promise.all(
        fresh
          .filter((it) => it.status === 'detecting')
          .map(async (it) => {
            const d = await detectFileFormat(it.file);
            if (!d.ok) return dispatch({ type: 'patch', id: it.id, patch: { status: 'rejected', error: d.reason } });
            if (d.format === 'heic')
              return dispatch({ type: 'patch', id: it.id, patch: { status: 'rejected', inputFormat: 'heic', error: 'HEIC support is coming soon. Export as JPEG for now.' } });
            dispatch({ type: 'patch', id: it.id, patch: { status: 'queued', inputFormat: d.format } });
            return process(it.id, it.file, it.relativePath, d.format);
          }),
      );
    },
    [process],
  );

  // Re-run every processable file when settings change (debounced).
  const firstRun = useRef(true);
  useEffect(() => {
    settingsRef.current = settings;
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    const t = setTimeout(() => {
      getPool().cancelAll();
      for (const it of itemsRef.current) {
        if (it.inputFormat && it.inputFormat !== 'heic' && it.status !== 'rejected') {
          process(it.id, it.file, it.relativePath, it.inputFormat);
        }
      }
    }, 350);
    return () => clearTimeout(t);
  }, [settings, process]);

  useEffect(() => () => pool.current?.cancelAll(), []);

  const selectPreset = useCallback((id: string) => {
    setPresetId(id);
    setSettingsState(getPreset(id).settings);
  }, []);

  /** Editing any field turns the selection into Custom, keeping the edited values. */
  const updateSettings = useCallback((patch: Partial<Settings>) => {
    setPresetId('custom');
    setSettingsState((s) => ({ ...s, ...patch }));
  }, []);

  const remove = useCallback((id: string) => {
    const runId = latestRun.current.get(id);
    if (runId) pool.current?.cancel(runId);
    latestRun.current.delete(id);
    dispatch({ type: 'remove', id });
  }, []);

  const clear = useCallback(() => {
    pool.current?.cancelAll();
    latestRun.current.clear();
    dispatch({ type: 'clear' });
    setNotice(null);
  }, []);

  return { items, presetId, settings, notice, setNotice, addFiles, selectPreset, updateSettings, remove, clear };
}
