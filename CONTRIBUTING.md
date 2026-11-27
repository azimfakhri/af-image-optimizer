# Contributing

Thanks for helping. Bug reports, presets, docs and code are all welcome.

## Setup
```sh
git clone https://github.com/azimfakhri/af-image-optimizer
cd af-image-optimizer
npm install
npm run dev        # app at http://localhost:5173, examples at /examples/*.html
```

Before opening a PR:
```sh
npm run lint && npx tsc -b && npm test && npm run build && npm run build:lib
npx playwright install   # once
npm run test:e2e         # Chromium, Firefox and WebKit
```

The e2e tests generate their own synthetic images. For manual testing on macOS, `./scripts/make-fixtures.sh` builds extra images (big camera JPEG, EXIF-rotated photo, transparent logo, `.jfif`, corrupt file…) in `tests/fixtures/`.

## Where things live
See [AGENTS.md](AGENTS.md) for the layout and the design rules. The short version:
- `src/lib/`: pure logic (format detection, geometry, SSIM, search). Unit-tested; please add tests.
- `src/workers/encoder.worker.ts`: decode → resize → encode pipeline.
- `src/core/`: the public API. Changes here are API changes, so mention them in the PR.
- `src/integrations/`: web component, input enhancer, iframe page.

## Ground rules
- **Images must never leave the device.** No uploads, no analytics on image data, no third-party scripts. The CSP in `vercel.json` enforces this; keep it passing.
- **MIT-compatible dependencies only** (no GPL, so no libimagequant).
- Keep the main bundle small; lazy-load anything heavy (e.g. a HEIC decoder).

## Good first issues
Look for the [`good first issue`](https://github.com/azimfakhri/af-image-optimizer/labels/good%20first%20issue) label.
