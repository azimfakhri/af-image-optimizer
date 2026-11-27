# Image Optimizer

A free, open-source image compressor that runs entirely in your browser. Drop in photos (JPG/JPEG/JFIF, PNG, WebP, AVIF), whole folders, or paste from the clipboard, and get files that are typically 85–98% smaller with no visible quality loss.

**Your images never leave your device.** There is no upload, no server and no account.

## Features
- **Smart quality:** for each image, finds the lowest quality whose SSIM against the resized original is ≥ 0.98 (or 0.97 / 0.99).
- **Target size:** "under 100 KB" for forms and portals. Quality is searched first, then the image is downscaled if needed.
- **Destination presets:** web hero, content, thumbnail, WhatsApp/Facebook preview (1200×630), Instagram, WordPress, Shopify, email, form upload, custom.
- Batch processing in a Web Worker pool. Folder input keeps its structure in the ZIP.
- EXIF orientation applied, colours converted to sRGB, metadata stripped.
- Transparency detection by scanning pixels: images with few colours become lossless palette PNGs (oxipng), others become WebP with alpha.
- Never bigger: if re-encoding doesn't help, the original is returned with its metadata removed (when its size and format already match).

## Verify the privacy claim
1. Open DevTools → Network and process some images. The only requests are the app's own JS/WASM files; image data stays in `blob:` URLs.
2. Or load the page, switch off your network, and keep using it.

## Develop
```sh
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests (Vitest)
npm run build
./scripts/make-fixtures.sh   # macOS: builds test images in tests/fixtures/
```

Codecs: [jSquash](https://github.com/jamsinclair/jSquash) (MozJPEG, libwebp, oxipng, Lanczos3 resize; Apache-2.0). ZIP: [fflate](https://github.com/101arrowz/fflate) (MIT).

## License
MIT
