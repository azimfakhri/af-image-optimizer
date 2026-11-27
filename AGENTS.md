# AGENTS.md

Guidance for AI coding agents working in this repo.

## What this is
A client-side image optimizer, published as a static site. All decoding and encoding happens in the browser (WebAssembly in Web Workers). **Image data must never leave the device:** no uploads, no analytics on image data, no CDN-loaded codecs.

## Commands
```sh
npm install
npm run dev                  # Vite dev server
npm test                     # Vitest unit tests (tests/unit)
npx tsc -b                   # type-check
npm run lint                 # oxlint
npm run build                # tsc -b && vite build
./scripts/make-fixtures.sh   # macOS only: builds tests/fixtures/ from system wallpapers (gitignored)
```
Before finishing a change, run `npm test`, `npx tsc -b` and `npm run lint`.

## Layout
```
src/
  App.tsx, main.tsx          UI shell; main.tsx reads data-preset from #root (used by landing pages)
  store.ts                   useOptimizer(): items, settings, presets, re-run on settings change
  components/                DropZone, PresetBar, SettingsPanel, FileRow
  workers/encoder.worker.ts  decode → crop → Lanczos3 → alpha scan → encode (fixed | smart | target) → never-bigger fallback
  workers/protocol.ts        worker message types, MIME/extension maps
  lib/
    detectFormat.ts          magic-byte sniffing (JPEG/PNG/WebP/AVIF/HEIC; rejects animated WebP, GIF)
    presets.ts               preset definitions; Settings type
    geometry.ts              inside/cover crop + size maths, never upscales
    pixels.ts                transparency scan, colour count, chooseFormat
    ssim.ts, search.ts       SSIM on luma; binary searches for smart quality and target size
    strip.ts                 lossless JPEG/PNG metadata strip (used by the fallback)
    pipeline.ts              worker pool with cancellation
    folderInput.ts, naming.ts, zip.ts, format.ts
tests/unit/                  Vitest tests for lib/
scripts/                     fixture generation
```

## Rules and decisions
- **Detect formats by magic bytes**, never by extension or MIME type. Keep `.jfif` and the other JPEG extensions in the `ACCEPT` list.
- **EXIF orientation:** `createImageBitmap(..., { imageOrientation: 'from-image' })`. Re-encoding from pixels strips all metadata.
- **Never upscale.** For fixed-ratio presets with a small source, crop at the largest size the source allows and add a note.
- **Canvas limit:** keep every canvas at or under 16,777,216 px (the iOS Safari cap); larger crops are shrunk by the browser first, then Lanczos3.
- **Transparency** comes from scanning pixels, not from the file having an alpha channel. With alpha: ≤256 colours → oxipng PNG (lossless palette), otherwise WebP with alpha.
- **Never bigger:** return the original (metadata stripped) only when its dimensions and format already match the output. Never strip a JPEG whose EXIF orientation is not 1. In target mode, the size cap is `min(target, original size)`.
- **WebP:** searches use method 4; the final encode uses method 6.
- **Single-threaded WASM only** (no COOP/COEP headers needed). Parallelism comes from the worker pool.
- **Licensing:** the project is MIT. Do not add GPL dependencies; libimagequant was rejected for this reason.
- jSquash packages must stay in `optimizeDeps.exclude` in `vite.config.ts`, because they load `.wasm` via `import.meta.url`.
- Pool job ids are per run (`<itemId>#<n>`); results from runs that have been superseded are dropped in `store.ts`.

## Style
- TypeScript strict-ish (`erasableSyntaxOnly`: no parameter properties or enums). React function components and hooks.
- Tailwind v4 with colour tokens on `:root` in `src/index.css` (light/dark via `prefers-color-scheme`). Use the token classes (`bg-surface`, `text-muted`, `border-line`, …) and the `.btn`, `.chip`, `.input` component classes.
- Keep `lib/` pure and unit-tested; browser-only APIs belong in the worker or components.

## Roadmap
Done: milestones 1–3 (input, worker, presets, smart quality, target size, alpha, fallback, ZIP, folder input).
Next: compare modal and Save to folder (`showDirectoryPicker`), memory budget for the worker pool, a11y/mobile polish, SEO landing pages (Vite multi-page build from `pages.config.ts`), Playwright e2e tests. Phase 2: AVIF output, crop/focal point, srcset/`<picture>` + LQIP export, HEIC input, saved presets, PWA.
