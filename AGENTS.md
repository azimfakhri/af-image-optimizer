# AGENTS.md

Guidance for AI coding agents working in this repo.

## What this is
A client-side image optimizer, published as a static site. All decoding and encoding happens in the browser (WebAssembly in Web Workers). **Image data must never leave the device:** no uploads, no analytics on image data, no CDN-loaded codecs.

## Commands
```sh
npm install
npm run dev                  # Vite dev server
npm test                     # Vitest unit tests (tests/unit)
npm run test:e2e             # Playwright: Chromium, Firefox, WebKit against a production build with the vercel.json headers
npx tsc -b                   # type-check
npm run lint                 # oxlint
npm run build                # tsc -b && vite build → dist/ (site: app, /embed, /examples/*)
npm run build:lib            # npm package → dist-lib/ (vite.lib.config.ts + tsconfig.lib.json)
./scripts/make-fixtures.sh   # macOS only: extra manual-testing fixtures in tests/fixtures/ (gitignored)
```
Before finishing a change, run `npm test`, `npx tsc -b` and `npm run lint`; for UI, worker or integration changes also `npm run test:e2e` (first time: `npx playwright install`).

## Layout
```
src/
  core/index.ts              framework-free public API: optimize, createOptimizer, probe, resolveSettings, OptimizeError
  lib-entry.ts               npm entry "af-image-optimizer" (core + enhance)
  element-entry.ts           npm entry "af-image-optimizer/element" (registers <image-optimizer>)
  integrations/
    enhance.ts               enhance(input): optimise files in an existing <input type=file> before the page sees them
    element.tsx              <image-optimizer> web component (React App in a shadow root, emits `optimized`)
    embed-main.tsx           iframe page (/embed): postMessage results to ?origin=
  App.tsx, main.tsx          UI shell (App props: initialPreset, embedded, onUse)
  store.ts                   useOptimizer(): items, settings, per-file overrides, retry/cancel; built on core
  components/                DropZone, PresetBar, SettingsPanel, FileRow, CompareModal, ThemeToggle
  workers/encoder.worker.ts  decode → crop → Lanczos3 → alpha scan → encode (fixed | smart | target) → never-bigger fallback
  workers/protocol.ts        worker message types, MIME/extension maps
  workers/heic.ts            lazy libheif decoder for browsers without native HEIC (LGPL, separate chunk)
  lib/
    detectFormat.ts          magic-byte sniffing (JPEG/PNG/WebP/AVIF/HEIC; rejects animated WebP, GIF)
    presets.ts               preset definitions; Settings type
    geometry.ts              inside/cover crop + size maths, never upscales
    pixels.ts                transparency scan, colour count, chooseFormat
    ssim.ts, search.ts       SSIM on luma; binary searches for smart quality and target size
    strip.ts                 lossless JPEG/PNG metadata strip (used by the fallback)
    pipeline.ts              worker pool: concurrency + megapixel budget, cancellation, CDN-safe worker start
    dimensions.ts            header dimensions (JPEG/PNG/WebP, HEIC/AVIF ispe) for the memory budget
    folderOutput.ts          Save to folder (showDirectoryPicker, Chromium)
    folderInput.ts, naming.ts, zip.ts, format.ts
tests/unit/                  Vitest tests for lib/ and core
tests/e2e/                   Playwright tests; global-setup.ts generates synthetic fixtures into tests/e2e/.fixtures
examples/                    integration demos (built into the site)
scripts/                     fixture generation
vercel.json                  static deploy + strict CSP (connect-src 'self'); /embed may be framed
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
- **Licensing:** the project is MIT. Do not add GPL dependencies; libimagequant was rejected for this reason. The one LGPL exception is libheif (HEIC): it must stay an unmodified, separate chunk loaded with a dynamic `import()` (`src/workers/heic.ts`), listed in THIRD_PARTY_NOTICES.md with its licence in `licenses/`. Update both when bumping libheif-js.
- **HEIC:** try `createImageBitmap` first (Safari decodes natively), then fall back to libheif. Target mode doesn't cap HEIC output at the original size, because JPEG/WebP can't match HEVC.
- jSquash packages must stay in `optimizeDeps.exclude` in `vite.config.ts`, because they load `.wasm` via `import.meta.url`.
- `store.ts` keeps one AbortController per item; results from superseded runs are dropped.
- The worker URL comes from `?worker&url`; `startWorker()` wraps cross-origin URLs (CDN) in a same-origin blob shim. The library build uses `base: './'` so the URL is `import.meta.url`-relative and the WASM is inlined.
- Keep the CSP in `vercel.json` working: no inline scripts in HTML (use `type="module"`, which Vite bundles), no third-party origins.
- All runtime code is bundled into the package, so dependencies live in devDependencies.
- `sideEffects` in package.json must list `src/element-entry.ts`; otherwise the site build tree-shakes `import '/src/element-entry.ts'` away and the web component example breaks (the e2e suite catches this).
- e2e tests fail on any page error, CSP violation, cross-origin request or non-GET request (`guard` fixture in tests/e2e/helpers.ts).

## Style
- TypeScript strict-ish (`erasableSyntaxOnly`: no parameter properties or enums). React function components and hooks.
- Tailwind v4 with colour tokens on `:root` in `src/index.css` (light/dark via `prefers-color-scheme`). Use the token classes (`bg-surface`, `text-muted`, `border-line`, …) and the `.btn`, `.chip`, `.input` component classes.
- Keep `lib/` pure and unit-tested; browser-only APIs belong in the worker or components.

## Roadmap
Done: milestones 1–5, plus the integrations (npm library, web component, input enhancer, iframe embed) and the Vercel config.
Skipped for now: SEO landing pages. Published to npm (0.1.0). HEIC input done. Phase 2: AVIF output, crop/focal point, srcset/`<picture>` + LQIP export, saved presets, PWA.
