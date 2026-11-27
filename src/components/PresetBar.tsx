import { PRESETS } from '../lib/presets';

export function PresetBar({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  return (
    <div role="radiogroup" aria-label="Preset" className="flex flex-wrap gap-2">
      {PRESETS.map((p) => (
        <button
          key={p.id}
          type="button"
          role="radio"
          aria-checked={value === p.id}
          title={p.hint}
          onClick={() => onChange(p.id)}
          className={`chip ${value === p.id ? 'chip-on' : ''}`}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}
