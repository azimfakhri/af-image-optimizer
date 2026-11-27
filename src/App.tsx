import { useMemo, useState } from 'react';
import { CompareModal } from './components/CompareModal';
import { DropZone } from './components/DropZone';
import { FileRow } from './components/FileRow';
import { PresetBar } from './components/PresetBar';
import { SettingsPanel } from './components/SettingsPanel';
import { ThemeToggle } from './components/ThemeToggle';
import { canSaveToFolder, saveToFolder } from './lib/folderOutput';
import { formatBytes, formatChange } from './lib/format';
import type { Settings } from './lib/presets';
import { buildZip, download } from './lib/zip';
import { useOptimizer, type Item } from './store';

export interface AppProps {
  initialPreset?: string;
  /** Hide chrome that doesn't belong in an embed (theme toggle). */
  embedded?: boolean;
  /** Called with finished results when the user clicks "Use these images" (embed / web component). */
  onUse?: (items: Item[]) => void;
}

const wideScreen = typeof matchMedia === 'undefined' || matchMedia('(min-width: 640px)').matches;

function summarize(s: Settings): string {
  const size = s.maxWidth && s.maxHeight ? `${s.maxWidth}×${s.maxHeight}${s.fit === 'cover' ? ' crop' : ''}` : s.maxWidth ? `${s.maxWidth} px wide` : s.maxHeight ? `${s.maxHeight} px tall` : 'original size';
  const fmt = s.format === 'auto' ? `Auto (${s.opaqueFormat === 'jpeg' ? 'JPEG' : 'WebP'})` : s.format.toUpperCase();
  const q = s.mode === 'smart' ? 'smart quality' : s.mode === 'fixed' ? `quality ${s.quality}` : `under ${s.targetKB} KB`;
  return `${size} · ${fmt} · ${q}`;
}

export default function App({ initialPreset, embedded, onUse }: AppProps) {
  const o = useOptimizer(initialPreset);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [comparing, setComparing] = useState<string | null>(null);

  const done = useMemo(() => o.items.filter((i) => i.status === 'done' && i.result), [o.items]);
  const working = o.items.some((i) => i.status === 'detecting' || i.status === 'queued' || i.status === 'processing');
  const totals = useMemo(
    () => ({ before: done.reduce((n, i) => n + i.file.size, 0), after: done.reduce((n, i) => n + i.result!.blob.size, 0) }),
    [done],
  );
  const outputs = () => done.map((i) => ({ path: i.result!.path, blob: i.result!.blob }));
  const comparedItem = comparing ? o.items.find((i) => i.id === comparing) : undefined;

  const zipAll = async () => {
    setBusyAction('Zipping…');
    try {
      download(await buildZip(outputs()), 'optimized-images.zip');
    } finally {
      setBusyAction(null);
    }
  };

  const saveAll = async () => {
    setBusyAction('Saving…');
    try {
      const n = await saveToFolder(outputs(), (k) => setBusyAction(`Saving ${k}/${done.length}…`));
      if (n !== null) o.setNotice(`Saved ${n} file${n === 1 ? '' : 's'} to the chosen folder.`);
    } catch (e) {
      o.setNotice(`Couldn't save: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-5 px-4 py-6 sm:py-8">
      <section aria-label="Settings" className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <PresetBar value={o.presetId} onChange={o.selectPreset} />
          {!embedded && <ThemeToggle />}
        </div>
        <details className="group" open={wideScreen}>
          <summary className="cursor-pointer list-none text-sm text-muted select-none [&::-webkit-details-marker]:hidden">
            <span className="inline-block transition-transform group-open:rotate-90">▸</span> Settings:{' '}
            {summarize(o.settings)}
          </summary>
          <div className="mt-2">
            <SettingsPanel s={o.settings} onChange={o.updateSettings} />
          </div>
        </details>
      </section>

      <DropZone onFiles={o.addFiles} compact={o.items.length > 0} />

      {o.notice && (
        <p role="status" className="flex items-center justify-between gap-2 rounded-lg bg-sunken px-3 py-2 text-sm">
          {o.notice}
          <button type="button" className="btn-ghost" onClick={() => o.setNotice(null)} aria-label="Dismiss message">
            ✕
          </button>
        </p>
      )}

      {o.items.length > 0 && (
        <>
          <ul className="space-y-2" aria-label="Files">
            {o.items.map((it) => (
              <FileRow key={it.id} item={it} onRemove={o.remove} onCompare={setComparing} onRetry={o.retry} />
            ))}
          </ul>
          <div className="sticky bottom-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-surface/95 p-3 shadow-lg backdrop-blur">
            <p className="text-sm" role="status" aria-live="polite">
              {done.length}/{o.items.length} done
              {done.length > 0 && (
                <>
                  {' · '}
                  {formatBytes(totals.before)} → <strong>{formatBytes(totals.after)}</strong> ({formatChange(totals.before, totals.after)})
                </>
              )}
              {working && ' · working…'}
              {busyAction && ` · ${busyAction}`}
            </p>
            <div className="flex flex-wrap gap-2">
              {working ? (
                <button type="button" className="btn" onClick={o.cancelAll}>
                  Cancel
                </button>
              ) : (
                <button type="button" className="btn" onClick={o.clear}>
                  Clear
                </button>
              )}
              {onUse ? (
                <button type="button" className="btn-primary" disabled={!done.length || working} onClick={() => onUse(done)}>
                  Use {done.length} image{done.length === 1 ? '' : 's'}
                </button>
              ) : (
                <>
                  {canSaveToFolder() && (
                    <button type="button" className="btn" disabled={!done.length || !!busyAction} onClick={saveAll}>
                      Save to folder…
                    </button>
                  )}
                  <button type="button" className="btn-primary" disabled={!done.length || !!busyAction} onClick={zipAll}>
                    Download all (ZIP)
                  </button>
                </>
              )}
            </div>
          </div>
        </>
      )}

      {comparedItem?.result && (
        <CompareModal
          key={comparedItem.id}
          item={comparedItem}
          defaultQuality={o.settings.quality}
          loadReference={o.reference}
          onQuality={(q) => o.setOverride(comparedItem.id, q)}
          onClose={() => setComparing(null)}
        />
      )}
    </div>
  );
}
