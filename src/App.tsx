import { useMemo, useState } from 'react';
import { DropZone } from './components/DropZone';
import { FileRow } from './components/FileRow';
import { PresetBar } from './components/PresetBar';
import { SettingsPanel } from './components/SettingsPanel';
import { formatBytes, formatChange } from './lib/format';
import { buildZip, download } from './lib/zip';
import { useOptimizer } from './store';

export default function App({ initialPreset }: { initialPreset?: string }) {
  const o = useOptimizer(initialPreset);
  const [zipping, setZipping] = useState(false);

  const done = o.items.filter((i) => i.status === 'done' && i.result);
  const busy = o.items.some((i) => i.status === 'detecting' || i.status === 'queued' || i.status === 'processing');
  const totals = useMemo(() => {
    const before = done.reduce((n, i) => n + i.file.size, 0);
    const after = done.reduce((n, i) => n + i.result!.blob.size, 0);
    return { before, after };
  }, [done]);

  const zipAll = async () => {
    setZipping(true);
    try {
      download(await buildZip(done.map((i) => ({ path: i.result!.path, blob: i.result!.blob }))), 'optimized-images.zip');
    } finally {
      setZipping(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-5 px-4 py-6 sm:py-10">
      <section aria-label="Settings" className="space-y-3">
        <PresetBar value={o.presetId} onChange={o.selectPreset} />
        <SettingsPanel s={o.settings} onChange={o.updateSettings} />
      </section>

      <DropZone onFiles={o.addFiles} compact={o.items.length > 0} />

      {o.notice && (
        <p role="status" className="flex items-center justify-between rounded-lg bg-sunken px-3 py-2 text-sm">
          {o.notice}
          <button type="button" className="btn-ghost" onClick={() => o.setNotice(null)} aria-label="Dismiss">
            ✕
          </button>
        </p>
      )}

      {o.items.length > 0 && (
        <>
          <ul className="space-y-2" aria-label="Files">
            {o.items.map((it) => (
              <FileRow key={it.id} item={it} onRemove={() => o.remove(it.id)} />
            ))}
          </ul>
          <div className="sticky bottom-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-surface/95 p-3 shadow-lg backdrop-blur">
            <p className="text-sm" aria-live="polite">
              {done.length}/{o.items.length} done
              {done.length > 0 && (
                <>
                  {' · '}
                  {formatBytes(totals.before)} → <strong>{formatBytes(totals.after)}</strong> ({formatChange(totals.before, totals.after)})
                </>
              )}
              {busy && ' · working…'}
            </p>
            <div className="flex gap-2">
              <button type="button" className="btn" onClick={o.clear}>
                Clear
              </button>
              <button type="button" className="btn-primary" disabled={!done.length || zipping} onClick={zipAll}>
                {zipping ? 'Zipping…' : 'Download all (ZIP)'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
