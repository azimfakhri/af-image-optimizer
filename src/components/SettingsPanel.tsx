import type { FormatChoice, QualityMode, Settings } from '../lib/presets';

const SSIM_LEVELS = [
  { v: 0.97, label: 'Smaller' },
  { v: 0.98, label: 'Balanced' },
  { v: 0.99, label: 'Max fidelity' },
];

function num(v: string): number | undefined {
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

export function SettingsPanel({ s, onChange }: { s: Settings; onChange: (p: Partial<Settings>) => void }) {
  return (
    <div className="grid gap-4 rounded-2xl border border-line bg-surface p-4 sm:grid-cols-2 lg:grid-cols-4">
      <fieldset className="space-y-2">
        <legend className="label">Size</legend>
        <div className="flex items-center gap-2">
          <input
            aria-label="Max width"
            className="input w-24"
            inputMode="numeric"
            placeholder="Width"
            value={s.maxWidth ?? ''}
            onChange={(e) => onChange({ maxWidth: num(e.target.value) })}
          />
          <span className="text-muted">×</span>
          <input
            aria-label="Max height"
            className="input w-24"
            inputMode="numeric"
            placeholder="Height"
            value={s.maxHeight ?? ''}
            onChange={(e) => onChange({ maxHeight: num(e.target.value) })}
          />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={s.fit === 'cover'}
            disabled={!s.maxWidth || !s.maxHeight}
            onChange={(e) => onChange({ fit: e.target.checked ? 'cover' : 'inside' })}
          />
          Crop to exact size
        </label>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="label">Format</legend>
        <select className="input w-full" value={s.format} onChange={(e) => onChange({ format: e.target.value as FormatChoice })}>
          <option value="auto">Auto ({s.opaqueFormat === 'jpeg' ? 'JPEG' : 'WebP'}, PNG/WebP if transparent)</option>
          <option value="jpeg">JPEG</option>
          <option value="webp">WebP</option>
          <option value="png">PNG (lossless)</option>
        </select>
        <input
          aria-label="File name suffix"
          className="input w-full"
          placeholder="Name suffix, e.g. -1600w"
          value={s.suffix}
          onChange={(e) => onChange({ suffix: e.target.value.replace(/[\\/:*?"<>|]/g, '') })}
        />
      </fieldset>

      <fieldset className="space-y-2 lg:col-span-2">
        <legend className="label">Quality</legend>
        <div role="radiogroup" aria-label="Quality mode" className="flex flex-wrap gap-2">
          {(
            [
              ['smart', 'Smart (per image)'],
              ['fixed', 'Fixed'],
              ['target', 'Target size'],
            ] as [QualityMode, string][]
          ).map(([m, label]) => (
            <button key={m} type="button" role="radio" aria-checked={s.mode === m} className={`chip ${s.mode === m ? 'chip-on' : ''}`} onClick={() => onChange({ mode: m })}>
              {label}
            </button>
          ))}
        </div>
        {s.mode === 'smart' && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            {SSIM_LEVELS.map((l) => (
              <label key={l.v} className="flex items-center gap-1">
                <input type="radio" name="ssim" checked={s.ssimTarget === l.v} onChange={() => onChange({ ssimTarget: l.v })} />
                {l.label}
              </label>
            ))}
            <span className="text-muted">Picks the lowest quality that still looks identical.</span>
          </div>
        )}
        {s.mode === 'fixed' && (
          <label className="flex items-center gap-3 text-sm">
            <input
              type="range"
              min={40}
              max={100}
              value={s.quality}
              onChange={(e) => onChange({ quality: +e.target.value })}
              className="w-48 accent-[var(--accent)]"
            />
            <span className="tabular-nums">{s.quality}</span>
          </label>
        )}
        {s.mode === 'target' && (
          <label className="flex items-center gap-2 text-sm">
            Under
            <input
              className="input w-24"
              inputMode="numeric"
              value={s.targetKB}
              onChange={(e) => onChange({ targetKB: num(e.target.value) ?? 1 })}
            />
            KB
          </label>
        )}
      </fieldset>
    </div>
  );
}
