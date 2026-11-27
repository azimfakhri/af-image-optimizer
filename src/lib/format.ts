export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/** Signed percentage change, e.g. -94%. */
export function formatChange(before: number, after: number): string {
  if (before === 0) return '0%';
  const pct = Math.round(((after - before) / before) * 100);
  return `${pct > 0 ? '+' : pct < 0 ? '−' : ''}${Math.abs(pct)}%`;
}
