import { formatBytes, formatChange } from '../lib/format';
import { download } from '../lib/zip';
import type { Item } from '../store';

export function FileRow({ item, onRemove }: { item: Item; onRemove: () => void }) {
  const r = item.result;
  const busy = item.status === 'detecting' || item.status === 'queued' || item.status === 'processing';
  const failed = item.status === 'error' || item.status === 'rejected';
  const grew = r && r.blob.size > item.file.size;

  return (
    <li className="flex items-center gap-3 rounded-xl border border-line bg-surface p-3">
      <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-sunken">
        {r && <img src={r.url} alt="" className="h-full w-full object-cover" loading="lazy" decoding="async" />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium" title={item.relativePath}>
          {item.relativePath}
        </p>
        {busy && (
          <p className="flex items-center gap-2 text-sm text-muted">
            <span className="spinner" aria-hidden /> {item.status === 'processing' ? 'Optimising…' : 'Waiting…'} · {formatBytes(item.file.size)}
          </p>
        )}
        {failed && <p className="text-sm text-danger">{item.error}</p>}
        {r && item.status === 'done' && (
          <>
            <p className="text-sm">
              {formatBytes(item.file.size)} → <strong>{formatBytes(r.blob.size)}</strong>{' '}
              <span className={grew ? 'text-danger' : 'text-good'}>({formatChange(item.file.size, r.blob.size)})</span>
            </p>
            <p className="truncate text-xs text-muted">
              {r.inWidth}×{r.inHeight} → {r.width}×{r.height} · {r.format.toUpperCase()}
              {r.quality !== undefined && ` q${r.quality}`}
              {r.ssim !== undefined && ` · SSIM ${r.ssim.toFixed(3)}`}
              {r.notes.length > 0 && ` · ${r.notes.join(' ')}`}
            </p>
          </>
        )}
      </div>
      <div className="flex shrink-0 gap-1">
        {r && item.status === 'done' && (
          <button type="button" className="btn" onClick={() => download(r.blob, r.path.split('/').pop()!)} aria-label={`Download ${r.path}`}>
            Download
          </button>
        )}
        <button type="button" className="btn-ghost" onClick={onRemove} aria-label={`Remove ${item.relativePath}`}>
          ✕
        </button>
      </div>
    </li>
  );
}
