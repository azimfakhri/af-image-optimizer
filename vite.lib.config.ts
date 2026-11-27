import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';

// The npm package: `af-image-optimizer` (core + enhance) and `af-image-optimizer/element`.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  worker: { format: 'es' },
  base: './',
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  build: {
    outDir: 'dist-lib',
    emptyOutDir: true,
    target: 'es2022',
    assetsInlineLimit: 0,
    lib: {
      entry: { index: resolve(import.meta.dirname, 'src/lib-entry.ts'), element: resolve(import.meta.dirname, 'src/element-entry.ts') },
      formats: ['es'],
    },
  },
});
