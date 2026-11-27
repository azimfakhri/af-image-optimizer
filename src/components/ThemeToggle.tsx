import { useEffect, useState } from 'react';

type Theme = 'system' | 'light' | 'dark';
const KEY = 'theme';

function load(): Theme {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(load);
  useEffect(() => {
    const el = document.documentElement;
    if (theme === 'system') el.removeAttribute('data-theme');
    else el.setAttribute('data-theme', theme);
    try {
      if (theme === 'system') localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, theme);
    } catch {
      /* storage unavailable */
    }
  }, [theme]);

  return (
    <label className="flex items-center gap-2 text-sm text-muted">
      <span className="sr-only">Theme</span>
      <select className="input py-1" value={theme} onChange={(e) => setTheme(e.target.value as Theme)} aria-label="Theme">
        <option value="system">System theme</option>
        <option value="light">Light</option>
        <option value="dark">Dark</option>
      </select>
    </label>
  );
}
