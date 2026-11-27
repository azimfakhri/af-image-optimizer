/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';

const r = (p: string) => resolve(import.meta.dirname, p);

// The public site: app, iframe embed page and integration examples.
export default defineConfig({
  plugins: [react(), tailwindcss()],
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
