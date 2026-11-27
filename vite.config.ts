/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  worker: { format: 'es' },
  // jSquash codecs load their .wasm via `new URL(..., import.meta.url)`; pre-bundling breaks that.
  optimizeDeps: { exclude: ['@jsquash/jpeg', '@jsquash/webp', '@jsquash/oxipng', '@jsquash/resize', '@jsquash/png'] },
  test: { include: ['tests/unit/**/*.test.ts'] },
});
