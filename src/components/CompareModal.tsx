import { useEffect, useRef, useState } from 'react';
import { formatBytes, formatChange } from '../lib/format';
import type { Item } from '../store';

type Zoom = 'fit' | 1 | 2;

interface Props {
  item: Item;
  defaultQuality: number;
  loadReference: (it: Item) => Promise<ImageBitmap>;
  onQuality: (q: number | undefined) => void;
  onClose: () => void;
}

/** Split-view comparison of the resized original vs the optimised output, with live re-encode. */
export function CompareModal({ item, defaultQuality, loadReference, onQuality, onClose }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [split, setSplit] = useState(50);
  const [zoom, setZoom] = useState<Zoom>('fit');
  const [refErr, setRefErr] = useState<string | null>(null);
  /** Geometry key of the reference currently drawn on the canvas. */
  const [drawnKey, setDrawnKey] = useState('');
  const r = item.result;
  const [quality, setQuality] = useState(item.override ?? r?.quality ?? defaultQuality);
  const lossy = r?.format !== 'png';

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  // Reference = same crop/resize as the output, before encoding. Reload when output geometry changes.
  const refKey = r ? `${r.width}x${r.height}` : '';
  const refReady = drawnKey === refKey;
  useEffect(() => {
    let bmp: ImageBitmap | null = null;
    let live = true;
    loadReference(item)
      .then((b) => {
        bmp = b;
        if (!live || !canvas.current) return b.close();
        canvas.current.width = b.width;
        canvas.current.height = b.height;
        canvas.current.getContext('2d')!.drawImage(b, 0, 0);
        setDrawnKey(refKey);
      })
      .catch((e) => live && setRefErr(e instanceof Error ? e.message : String(e)));
    return () => {
      live = false;
      bmp?.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id, refKey]);

  // Debounced live re-encode.
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const t = setTimeout(() => onQuality(quality), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quality]);

  const w = r?.width ?? 0;
  const h = r?.height ?? 0;
  const sizeStyle = zoom === 'fit' ? { width: '100%', maxWidth: w, aspectRatio: `${w} / ${h}` } : { width: w * zoom, height: h * zoom };
  const busy = item.status === 'processing';

  return (
    <dialog
      ref={dialog}
      onClose={onClose}
      onClick={(e) => e.target === dialog.current && dialog.current?.close()}
      aria-labelledby="compare-title"
      className="m-auto h-[min(92vh,100%)] w-[min(1200px,100%)] max-w-none rounded-2xl border border-line bg-surface p-0 text-text backdrop:bg-black/60"
    >
      <div className="flex h-full flex-col">
        <header className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3">
          <h2 id="compare-title" className="min-w-0 flex-1 truncate font-semibold">
            {item.relativePath}
          </h2>
          <div role="radiogroup" aria-label="Zoom" className="flex gap-1">
            {(['fit', 1, 2] as Zoom[]).map((z) => (
              <button key={z} type="button" role="radio" aria-checked={zoom === z} className={`chip ${zoom === z ? 'chip-on' : ''}`} onClick={() => setZoom(z)}>
                {z === 'fit' ? 'Fit' : `${z * 100}%`}
              </button>
            ))}
          </div>
          <button type="button" className="btn-ghost" onClick={() => dialog.current?.close()} aria-label="Close comparison">
            ✕
          </button>
        </header>

        <div className="relative flex-1 overflow-auto bg-sunken p-3">
          {refErr && <p className="text-danger">{refErr}</p>}
          <div className="relative mx-auto select-none" style={sizeStyle}>
            {r && <img src={r.url} alt="Optimised" className="absolute inset-0 h-full w-full" draggable={false} />}
            <canvas
              ref={canvas}
              aria-label="Original"
              className={`absolute inset-0 h-full w-full ${refReady ? '' : 'invisible'}`}
              style={{ clipPath: `inset(0 ${100 - split}% 0 0)` }}
            />
            <div className="pointer-events-none absolute inset-y-0 w-0.5 bg-white shadow-[0_0_0_1px_rgba(0,0,0,.4)]" style={{ left: `${split}%` }} />
            <span className="pointer-events-none absolute top-2 left-2 rounded bg-black/60 px-2 py-0.5 text-xs text-white">Original</span>
            <span className="pointer-events-none absolute top-2 right-2 rounded bg-black/60 px-2 py-0.5 text-xs text-white">Optimised</span>
            <input
              type="range"
              min={0}
              max={100}
              value={split}
              onChange={(e) => setSplit(+e.target.value)}
              aria-label="Comparison divider position"
              className="absolute inset-0 h-full w-full cursor-ew-resize opacity-0"
            />
          </div>
        </div>

        <footer className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-line px-4 py-3 text-sm">
          {r && (
            <p aria-live="polite">
              {formatBytes(item.file.size)} → <strong>{formatBytes(r.blob.size)}</strong> ({formatChange(item.file.size, r.blob.size)}) · {r.width}×{r.height} ·{' '}
              {r.format.toUpperCase()}
              {r.ssim !== undefined && ` · SSIM ${r.ssim.toFixed(3)}`}
              {busy && ' · re-encoding…'}
            </p>
          )}
          {lossy ? (
            <label className="flex items-center gap-2">
              Quality
              <input type="range" min={40} max={100} value={quality} onChange={(e) => setQuality(+e.target.value)} className="w-40 accent-[var(--accent)]" />
              <span className="w-8 tabular-nums">{quality}</span>
            </label>
          ) : (
            <span className="text-muted">PNG is lossless; no quality setting.</span>
          )}
          {item.override !== undefined && (
            <button type="button" className="btn" onClick={() => onQuality(undefined)}>
              Reset to preset
            </button>
          )}
        </footer>
      </div>
    </dialog>
  );
}
