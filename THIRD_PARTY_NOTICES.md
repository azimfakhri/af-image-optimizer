# Third-party notices

Image Optimizer's own code is MIT (see [LICENSE](LICENSE)). The site and the npm package bundle these components:

| Component | Used for | License |
|---|---|---|
| [jSquash](https://github.com/jamsinclair/jSquash) (`@jsquash/jpeg`, `webp`, `oxipng`, `resize`), wrapping MozJPEG, libwebp, oxipng and a Lanczos3 resizer | Encoding, resizing | Apache-2.0 (wrapped codecs: BSD-style / IJG / MIT) |
| [fflate](https://github.com/101arrowz/fflate) | ZIP | MIT |
| [React](https://react.dev) | UI, web component | MIT |
| [libheif-js](https://github.com/catdad-experiments/libheif-js) 1.23.5: [libheif](https://github.com/strukturag/libheif) + [libde265](https://github.com/strukturag/libde265) compiled to WebAssembly | HEIC/HEIF decoding in browsers without native support | **LGPL-3.0** |

## libheif (LGPL-3.0)

- **Separate file, unmodified.** libheif ships as its own file, `assets/libheif-bundle-*.js` (on the site and in the npm package's `dist-lib/assets/`). It's the upstream `libheif-js/libheif-wasm/libheif-bundle.mjs` as published, and it's loaded with a dynamic `import()` only when a HEIC file needs decoding and the browser can't do it natively (Chrome, Firefox; Safari decodes HEIC itself).
- **Source:** https://github.com/catdad-experiments/libheif-js (build scripts), https://github.com/strukturag/libheif and https://github.com/strukturag/libde265.
- **Replacing it:** you may swap that file for your own build of libheif-js. It must default-export a factory returning an object with `HeifDecoder` (the libheif-js API). Keep the file name, or update the `import()` in `assets/heic-*.js`.
- **License text:** full LGPL-3.0 and GPL-3.0 texts in [licenses/libheif-LICENSE.txt](licenses/libheif-LICENSE.txt).

HEIC images are HEVC (H.265)-compressed. HEVC is covered by patents held by patent pools; software copyright licences don't grant patent rights.
