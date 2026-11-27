# Image Optimizer

**Compress images 90%+ in the browser. Nothing is uploaded. Drop it into any app.**

[![Live demo](https://img.shields.io/badge/demo-af--image--optimizer.vercel.app-2f6fed)](https://af-image-optimizer.vercel.app)
[![npm](https://img.shields.io/npm/v/af-image-optimizer?color=cb3837)](https://www.npmjs.com/package/af-image-optimizer)
[![CI](https://github.com/azimfakhri/af-image-optimizer/actions/workflows/ci.yml/badge.svg)](https://github.com/azimfakhri/af-image-optimizer/actions/workflows/ci.yml)
[![Zero dependencies](https://img.shields.io/badge/dependencies-0-brightgreen)](package.json)
[![License: MIT](https://img.shields.io/badge/license-MIT-green)](LICENSE)

<p align="center">
  <a href="https://af-image-optimizer.vercel.app"><img src="docs/demo.gif" alt="Dropping photos into Image Optimizer: a 4.2 MB camera JPEG becomes a 110 KB WebP, then a before/after slider shows no visible difference" width="800"></a>
</p>

**[Try it →](https://af-image-optimizer.vercel.app)** · Examples: [web component](https://af-image-optimizer.vercel.app/examples/web-component) · [input enhancer](https://af-image-optimizer.vercel.app/examples/enhance) · [iframe embed](https://af-image-optimizer.vercel.app/examples/iframe)

Drop in photos (JPG/JPEG/JFIF, PNG, WebP, AVIF), whole folders, or paste from the clipboard. You get files that are typically **85–98% smaller with no visible quality loss**: a 4.2 MB 24-megapixel camera JPEG becomes a 110 KB WebP at SSIM 0.98.

## Why another image compressor?

| | **Image Optimizer** | Upload-based tools (TinyPNG, iLoveIMG…) | Squoosh |
|---|---|---|---|
| Your images stay on your device | ✅ | ❌ uploaded to a server | ✅ |
| Batch + whole folders | ✅ | Batch, with free-tier limits | ❌ one at a time |
| Picks quality per image (SSIM) | ✅ | ❌ | ❌ manual slider |
| "Make it under 100 KB" | ✅ | ❌ | ❌ |
| Presets for WhatsApp, Instagram, Shopify, WordPress… | ✅ | ❌ | ❌ |
| iPhone HEIC photos | ✅ in every browser | Some | ❌ |
| Embed in your own app | ✅ npm, web component, input enhancer, iframe | Paid API | ❌ |
| Price | Free, MIT | Freemium | Free |

## Use it in your app

| Integration | Best for | Effort |
|---|---|---|
| [npm library (headless)](#1-npm-library-headless) | Your own UI or upload flow | `optimize(file)` |
| [Web component](#2-web-component) | A ready-made UI in any framework or plain HTML | `<image-optimizer>` |
| [Upload-input enhancer](#3-upload-input-enhancer) | Shrinking images in an existing form before it submits | One line |
| [Iframe embed](#4-iframe-embed) | No-code sites (WordPress, Webflow, Wix) | Paste a snippet |

---

## How it works

All the work happens on the **user's device**, inside their browser:

1. **Decode** with the browser's built-in decoder. EXIF orientation is applied and colours are converted to sRGB.
2. **Resize** to the preset size with Lanczos3 (WebAssembly). Images are never upscaled; fixed-ratio presets are centre-cropped.
3. **Encode** with MozJPEG, libwebp (method 6) or oxipng, all compiled to WebAssembly and running in a pool of Web Workers so the page stays responsive.
4. **Smart quality:** binary-search the lowest quality whose SSIM against the resized original is ≥ 0.98, typically in 4–6 trial encodes. Or use **target size** ("under 100 KB"), or a fixed quality.
5. **Never bigger:** if re-encoding doesn't help, the original is kept with its metadata removed (when its size and format already match).

The server's only job is to serve static files once: about 1.5 MB of JS and WASM, cached afterwards. Hosting costs stay the same no matter how many images people process, and the page keeps working if the connection drops after it has loaded.

| Resource | Used for |
|---|---|
| User's CPU / memory | All decoding, resizing, encoding (up to 4 workers; fewer and a smaller memory budget on phones) |
| Hosting (e.g. Vercel) | Static HTML/JS/WASM files only. No functions, no storage, no image bandwidth |

## Features
- Destination presets: web hero, content, thumbnail, WhatsApp/Facebook preview (1200×630), Instagram, WordPress, Shopify, email, form upload (≤100 KB), custom.
- Before/after compare slider (fit / 100% / 200%) with live quality adjustment per file.
- Batch processing, folder in/out (the ZIP keeps the folder structure; Chromium can save straight to a folder), paste from clipboard.
- Format detection from file bytes, so `.jfif` and renamed files are handled. Animated WebP and GIF are rejected with a message.
- **HEIC/HEIF (iPhone photos)** in every browser: Safari decodes them natively; Chrome and Firefox load a libheif WebAssembly decoder (about 700 KB gzipped) only when you add a HEIC file.
- Transparency detection by scanning pixels: few colours → lossless palette PNG, otherwise WebP with alpha.

---

## 1. npm library (headless)

```sh
npm install af-image-optimizer
```

**Zero dependencies.** The codecs (MozJPEG, libwebp, oxipng, Lanczos3 resize, libheif) and their WebAssembly are bundled into the package, so nothing else gets installed. No peer dependency on React either: the web component bundles its own copy. The HEIC decoder is a separate file that's only fetched when needed (see [License](#license)).

```ts
import { optimize } from 'af-image-optimizer';

const result = await optimize(file, { preset: 'og' });
result.file;     // File, e.g. "photo.jpg" (1200×630 JPEG)
result.width;    // 1200
result.quality;  // 76 (chosen by smart quality)
result.ssim;     // 0.981
```

**Options:** start from a `preset` and override any field:

```ts
await optimize(file, { preset: 'content' });                     // ≤1600 px WebP, smart quality
await optimize(file, { preset: 'form', targetKB: 200 });         // JPEG under 200 KB
await optimize(file, { maxWidth: 800, format: 'webp', mode: 'fixed', quality: 75 });
await optimize(file, { maxWidth: 1080, maxHeight: 1080, fit: 'cover' });   // square crop
await optimize(file, { maxWidth: 1600, minAspect: '4:3' });     // crop only portraits/squares to 4:3; wide photos untouched
await optimize(file, { maxAspect: '16:9', cropPosition: 'left' }); // trim panoramas, keep the left side
```

| Field | Values |
|---|---|
| `preset` | `hero` `content` `thumb` `og` `instagram` `wordpress` `shopify` `email` `form` `custom` |
| `maxWidth`, `maxHeight` | pixels (never upscales) |
| `fit` | `inside` (default) or `cover` (crop to the exact `maxWidth`×`maxHeight` ratio) |
| `minAspect` | crop images **taller** than this width/height ratio, e.g. `4/3` or `'4:3'`. Unset = never |
| `maxAspect` | crop images **wider** than this ratio, e.g. `'16:9'`. Unset = never |
| `cropPosition` | part kept when cropping: `center` (default) `top` `bottom` `left` `right` |
| `format` | `auto` `jpeg` `webp` `png` |
| `mode` | `smart` (SSIM search), `fixed`, `target` |
| `quality` | 40–100 (fixed mode) |
| `ssimTarget` | e.g. `0.97`, `0.98`, `0.99` (smart mode) |
| `targetKB` | size cap (target mode) |
| `suffix` | appended to the output name, e.g. `-1600w` |

Aspect limits are applied after EXIF rotation, so a phone photo stored sideways is judged by how it displays. The result's `notes` say when a crop happened (`Cropped to 4:3.`).

**Before optimizing:** `probe(file)` reads the header only and returns `format`, `width`/`height` as stored, and `displayWidth`/`displayHeight` after EXIF rotation (plus `orientation` for JPEG), so you can tell portrait from landscape up front.

**Batches, cancellation and errors:**

```ts
import { createOptimizer, OptimizeError } from 'af-image-optimizer';

const optimizer = createOptimizer({ concurrency: 4, budgetMP: 150 });
const ctl = new AbortController();

const results = await optimizer.optimizeAll(files, { preset: 'hero' }, (i, r) => {
  console.log(i, r instanceof OptimizeError ? r.code : r.file.size);
}, { signal: ctl.signal });

// ctl.abort() cancels. Error codes: unsupported | too-large | decode | memory | cancelled | failed
optimizer.dispose();
```

**Bundler notes**
- The encoder worker is loaded with `new URL(..., import.meta.url)`, which Vite and webpack 5 handle out of the box (other bundlers need equivalent asset support). In SSR frameworks, call it only on the client.
- **Vite:** exclude the package from dependency pre-bundling, or the worker URL breaks in dev:
  ```ts
  // vite.config.ts
  export default { optimizeDeps: { exclude: ['af-image-optimizer'] } };
  ```
- The worker can be self-hosted with `createOptimizer({ workerUrl: '/static/encoder.worker.js' })`.
- Browser only (needs Web Workers, `OffscreenCanvas`, WebAssembly): Chrome/Edge/Firefox current, Safari 16.4+.

## 2. Web component

The full UI as `<image-optimizer>`. It works in React, Vue, Svelte, Angular or plain HTML, and its styles are isolated in a shadow DOM.

**With a bundler:**
```ts
import 'af-image-optimizer/element';
```

**Without a build step (CDN):**
```html
<script type="module" src="https://cdn.jsdelivr.net/npm/af-image-optimizer/dist-lib/element.js"></script>
```

```html
<image-optimizer preset="og" theme="light"></image-optimizer>

<script type="module">
  document.querySelector('image-optimizer').addEventListener('optimized', (e) => {
    // Fired when the user clicks "Use N images"
    for (const file of e.detail.files) upload(file);
    // e.detail.results: [{ original, file, path, width, height, format, quality }]
  });
</script>
```

| Attribute | Values |
|---|---|
| `preset` | any preset id (initial selection) |
| `theme` | `light`, `dark`, or omit to follow the OS |
| `max-width`, `max-height`, `fit`, `format`, `mode`, `quality`, `target-kb`, `min-aspect`, `max-aspect`, `crop-position` | same as the library options (kebab-case). Stay fixed when the user switches preset. Invalid values are ignored with a console warning |

```html
<!-- Up to 1600 px wide; portraits and squares cropped to 4:3 keeping the top -->
<image-optimizer preset="content" max-width="1600" min-aspect="4:3" crop-position="top"></image-optimizer>
```

React example:
```tsx
import 'af-image-optimizer/element';
import { useEffect, useRef } from 'react';

export function Optimizer({ onFiles }: { onFiles: (f: File[]) => void }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current!;
    const h = (e: Event) => onFiles((e as CustomEvent).detail.files);
    el.addEventListener('optimized', h);
    return () => el.removeEventListener('optimized', h);
  }, [onFiles]);
  return <image-optimizer ref={ref} preset="content" />;
}
```

## 3. Upload-input enhancer

Keep your existing form. Images picked in the file input are optimized **before** your code or the form submit sees them:

```html
<form action="/apply" method="post" enctype="multipart/form-data">
  <input id="photos" name="photos" type="file" accept="image/*,.jfif" multiple />
  <button>Submit</button>
</form>

<script type="module">
  import { enhance } from 'https://cdn.jsdelivr.net/npm/af-image-optimizer/dist-lib/index.js';

  enhance(document.getElementById('photos'), {
    preset: 'form',
    targetKB: 100,
    onProgress: (done, total) => console.log(`${done}/${total}`),
    onError: (file, err) => console.warn(file.name, err.message), // original file is kept
  });
</script>
```

- The input's `change`/`input` events are held back and re-fired with the optimized files, so React, Vue and plain listeners only ever see the small files.
- A submit during processing waits, then goes ahead automatically.
- The input has a `data-optimizing` attribute while working (e.g. `input[data-optimizing] { opacity: .5 }`).
- Non-image files pass through untouched. `enhance()` returns `{ ready(), dispose() }`.

## 4. Iframe embed

For sites where you can only paste HTML. Use the hosted version, or your own deployment (see [Deploy](#deploy)):

```html
<iframe
  src="https://af-image-optimizer.vercel.app/embed?preset=content&origin=https://your-site.com"
  title="Image optimizer"
  style="width:100%;height:760px;border:0"></iframe>

<script>
  // Optional: receive the files when the user clicks "Use N images"
  addEventListener('message', (e) => {
    if (e.origin !== 'https://af-image-optimizer.vercel.app') return;
    if (e.data?.type === 'af-image-optimizer:files') {
      console.log(e.data.files, e.data.results); // File[] + metadata
    }
  });
</script>
```

| Query param | Meaning |
|---|---|
| `preset` | initial preset |
| `theme` | `light` or `dark` |
| `max-width`, `max-height`, `fit`, `format`, `mode`, `quality`, `target-kb`, `min-aspect`, `max-aspect`, `crop-position` | same as the web component attributes, e.g. `&max-width=1600&min-aspect=4:3` |
| `origin` | your page's origin. Required to receive files; they're only ever posted to this exact origin. Without it, users download from inside the frame. |

Live examples: [web component](https://af-image-optimizer.vercel.app/examples/web-component) · [input enhancer](https://af-image-optimizer.vercel.app/examples/enhance) · [iframe embed](https://af-image-optimizer.vercel.app/examples/iframe).

---

## Deploy

It's a static site, so any static host works. The public instance runs at https://af-image-optimizer.vercel.app.

**Vercel (self-host):** import the GitHub repo at vercel.com/new. Settings are picked up from `vercel.json` (framework Vite, `npm run build`, output `dist`). No environment variables are needed. `vercel.json` also sets:
- A strict Content-Security-Policy with `connect-src 'self'`, so the browser itself blocks any attempt to send data elsewhere.
- `frame-ancestors 'self'` everywhere except `/embed`, which may be framed by any site.
- Long-term caching for hashed `/assets/*`.

Netlify, Cloudflare Pages and GitHub Pages also work: build with `npm run build` and serve `dist/`.

## Verify the privacy claim
1. Open DevTools → Network and process some images. The only requests are the app's own JS/WASM files; image data stays in `blob:` URLs.
2. Or load the page, switch off your network, and keep using it.

## Develop
```sh
npm install
npm run dev                  # app at /, examples at /examples/*.html
npm test                     # unit tests (Vitest)
npm run test:e2e             # end-to-end tests in Chromium, Firefox and WebKit (Playwright)
npm run build                # site → dist/
npm run build:lib            # npm package → dist-lib/
./scripts/make-fixtures.sh   # macOS: extra images for manual testing in tests/fixtures/
```

Codecs: [jSquash](https://github.com/jamsinclair/jSquash) (MozJPEG, libwebp, oxipng, Lanczos3 resize; Apache-2.0) and [libheif-js](https://github.com/catdad-experiments/libheif-js) (HEIC; LGPL-3.0). ZIP: [fflate](https://github.com/101arrowz/fflate) (MIT).

## License
MIT for this project's code.

The HEIC decoder, libheif, is LGPL-3.0. It ships unmodified as its own file (`assets/libheif-bundle-*.js`), loaded only to decode HEIC where the browser can't. You can use the package in closed-source and commercial projects; just keep [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) with it. Details and all bundled licences are in that file.
