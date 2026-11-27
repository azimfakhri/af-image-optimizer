/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';

const r = (p: string) => resolve(import.meta.dirname, p);

/** `vite preview` sends the same headers (CSP included) as vercel.json, so e2e tests run under production rules. */
function vercelHeaders(): Plugin {
  type Rule = { source: string; headers: { key: string; value: string }[] };
  const rules = (JSON.parse(readFileSync(r('vercel.json'), 'utf8')).headers as Rule[]).map((h) => ({
    re: new RegExp(`^${h.source}$`),
    headers: h.headers,
  }));
  return {
    name: 'vercel-headers',
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = (req.url ?? '/').split('?')[0];
        for (const rule of rules) if (rule.re.test(path)) for (const h of rule.headers) res.setHeader(h.key, h.value);
        next();
      });
    },
  };
}

// The public site: app, iframe embed page and integration examples.
export default defineConfig({
  plugins: [react(), tailwindcss(), vercelHeaders()],
  worker: { format: 'es' },
  // jSquash codecs load their .wasm via `new URL(..., import.meta.url)`; pre-bundling breaks that.
  optimizeDeps: { exclude: ['@jsquash/jpeg', '@jsquash/webp', '@jsquash/oxipng', '@jsquash/resize', '@jsquash/png'] },
  build: {
    rollupOptions: {
      input: {
        main: r('index.html'),
        embed: r('embed.html'),
        'examples/web-component': r('examples/web-component.html'),
        'examples/enhance': r('examples/enhance.html'),
        'examples/iframe': r('examples/iframe.html'),
      },
    },
  },
  test: { include: ['tests/unit/**/*.test.ts'] },
});
