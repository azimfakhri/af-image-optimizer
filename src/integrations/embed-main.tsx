import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from '../App';
import '../index.css';
import { settingsFromParams } from '../lib/params';

/**
 * Iframe embed: /embed.html?preset=og&origin=https://your-site.com&theme=dark
 * Optional settings (kept across preset changes): max-width, max-height, fit, format, mode, quality, target-kb,
 * min-aspect, max-aspect, crop-position — e.g. &max-width=1600&min-aspect=4:3
 * "Use N images" posts { type: 'af-image-optimizer:files', files: File[] } to the parent,
 * but only when `origin` is given (postMessage enforces that the parent really has that origin).
 */
const params = new URLSearchParams(location.search);
const origin = params.get('origin');
const theme = params.get('theme');
if (theme === 'light' || theme === 'dark') document.documentElement.dataset.theme = theme;

const { settings, errors } = settingsFromParams((n) => params.get(n));
for (const e of errors) console.warn(`image optimizer embed: ignored ${e}`);

const canPost = window.parent !== window && !!origin && /^https?:\/\/[^/]+$/.test(origin);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App
      initialPreset={params.get('preset') ?? undefined}
      settings={settings}
      embedded
      onUse={
        canPost
          ? (items) =>
              window.parent.postMessage(
                {
                  type: 'af-image-optimizer:files',
                  files: items.map((it) => it.result!.blob),
                  results: items.map((it) => ({
                    name: it.result!.blob.name,
                    path: it.result!.path,
                    originalName: it.file.name,
                    originalSize: it.file.size,
                    size: it.result!.blob.size,
                    width: it.result!.width,
                    height: it.result!.height,
                    format: it.result!.format,
                  })),
                },
                origin!,
              )
          : undefined
      }
    />
  </StrictMode>,
);
