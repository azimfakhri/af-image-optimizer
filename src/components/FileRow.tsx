import { memo } from 'react';
import { formatBytes, formatChange } from '../lib/format';
import { download } from '../lib/zip';
import type { Item } from '../store';

interface Props {
  item: Item;
  onRemove: (id: string) => void;
  onCompare: (id: string) => void;
  onRetry: (id: string) => void;
}

export const FileRow = memo(function FileRow({ item, onRemove, onCompare, onRetry }: Props) {
  const r = item.result;
  const busy = item.status === 'detecting' || item.status === 'queued' || item.status === 'processing';
  const done = item.status === 'done' && r;
  const grew = r && r.blob.size > item.file.size;

  return (
    <li className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface p-3 sm:flex-nowrap" aria-busy={busy}>
      <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-sunken">
        {r && <img src={r.url} alt="" className="h-full w-full object-cover" loading="lazy" decoding="async" />}
      </div>
      <div className="min-w-0 flex-1 basis-40">
        <p className="truncate font-medium" title={item.relativePath}>
          {item.relativePath}
          {item.override !== undefined && (
            <span className="ml-2 rounded-full bg-sunken px-2 py-0.5 align-middle text-xs font-normal text-muted">custom q{item.override}</span>
          )}
        </p>
        {busy && (
          <p className="flex items-center gap-2 text-sm text-muted">
            <span className="spinner" aria-hidden /> {item.status === 'processing' ? 'Optimising…' : 'Waiting…'} · {formatBytes(item.file.size)}
          </p>
        )}
        {(item.status === 'error' || item.status === 'rejected') && <p className="text-sm text-danger">{item.error}</p>}
        {done && (
          <>
            <p className="text-sm">
              {formatBytes(item.file.size)} → <strong>{formatBytes(r.blob.size)}</strong>{' '}
              <span className={grew ? 'text-danger' : 'text-good'}>({formatChange(item.file.size, r.blob.size)})</span>
            </p>
            <p className="truncate text-xs text-muted" title={r.notes.join(' ')}>
              {r.inWidth}×{r.inHeight} → {r.width}×{r.height} · {r.format.toUpperCase()}
              {r.quality !== undefined && ` q${r.quality}`}
              {r.ssim !== undefined && ` · SSIM ${r.ssim.toFixed(3)}`}
              {r.notes.length > 0 && ` · ${r.notes.join(' ')}`}
            </p>
          </>
        )}
      </div>
      <div className="ml-auto flex shrink-0 gap-1">
        {done && (
          <>
            <button type="button" className="btn" onClick={() => onCompare(item.id)} aria-label={`Compare ${item.relativePath}`}>
              Compare
            </button>
            <button type="button" className="btn" onClick={() => download(r.blob, r.blob.name)} aria-label={`Download ${r.path}`}>
              Download
            </button>
          </>
        )}
        {item.status === 'error' && (
          <button type="button" className="btn" onClick={() => onRetry(item.id)}>
            Retry
          </button>
        )}
        <button type="button" className="btn-ghost" onClick={() => onRemove(item.id)} aria-label={`Remove ${item.relativePath}`}>
          ✕
        </button>
      </div>
    </li>
  );
});
