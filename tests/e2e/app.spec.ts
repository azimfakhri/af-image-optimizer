import { statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { unzipSync } from 'fflate';
import { addFiles, expect, fixture, isJpeg, isPng, isWebp, near, output, row, selectPreset, test } from './helpers.ts';

const sizeOf = (name: string) => statSync(fixture(name)).size;

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('compresses a photo to a smaller WebP at the preset width', async ({ page }) => {
  await addFiles(page, ['landscape.jpg']);
  const o = await output(page, 'landscape.jpg');
  expect(isWebp(o)).toBe(true);
  expect([o.width, o.height]).toEqual([1600, 1067]);
  expect(o.size).toBeLessThan(sizeOf('landscape.jpg') / 3);
  // Smart quality settles below the q90 ceiling and reaches the SSIM target.
  const [, q, ssim] = (await row(page, 'landscape.jpg').textContent())!.match(/q(\d+) · SSIM (\d\.\d+)/)!;
  expect(Number(q)).toBeLessThan(90);
  expect(Number(ssim)).toBeGreaterThanOrEqual(0.98);
});

test('applies EXIF orientation so the photo comes out upright', async ({ page }) => {
  await addFiles(page, ['rotated-exif.jpg']);
  const o = await output(page, 'rotated-exif.jpg', [
    [0.05, 0.05],
    [0.95, 0.05],
  ]);
  expect(o.width).toBeGreaterThan(o.height);
  expect(near(o.pixels[0], [255, 0, 0])).toBe(true); // red marker top-left
  expect(near(o.pixels[1], [0, 0, 255])).toBe(true); // blue marker top-right
});

test('accepts .jfif and JPEGs with the wrong extension', async ({ page }) => {
  await addFiles(page, ['photo.jfif', 'jpeg-renamed.png']);
  for (const name of ['photo.jfif', 'jpeg-renamed.png']) {
    const o = await output(page, name);
    expect(isWebp(o)).toBe(true);
    expect(o.size).toBeLessThan(sizeOf(name));
  }
});

test('keeps transparency: flat logo becomes a lossless PNG', async ({ page }) => {
  await addFiles(page, ['logo-transparent.png']);
  const o = await output(page, 'logo-transparent.png', [
    [0.01, 0.01],
    [0.5, 0.5],
  ]);
  expect(isPng(o)).toBe(true);
  expect(o.pixels[0][3]).toBe(0); // corner stays transparent
  expect(o.pixels[1][3]).toBe(255);
  expect(o.size).toBeLessThan(sizeOf('logo-transparent.png') / 10);
});

test('treats an RGBA PNG with no transparent pixels as a photo', async ({ page }) => {
  await addFiles(page, ['opaque-rgba.png']);
  const o = await output(page, 'opaque-rgba.png');
  expect(isWebp(o)).toBe(true);
  expect(o.size).toBeLessThan(sizeOf('opaque-rgba.png'));
});

test('never returns a bigger file', async ({ page }) => {
  await addFiles(page, ['already-small.webp']);
  const o = await output(page, 'already-small.webp');
  expect(o.size).toBeLessThanOrEqual(sizeOf('already-small.webp'));
});

test('Form upload preset stays under 100 KB', async ({ page }) => {
  await selectPreset(page, 'Form upload');
  await addFiles(page, ['landscape.jpg', 'rotated-exif.jpg']);
  for (const name of ['landscape.jpg', 'rotated-exif.jpg']) {
    const o = await output(page, name);
    expect(isJpeg(o)).toBe(true);
    expect(o.size).toBeLessThanOrEqual(100 * 1024);
    expect(Math.max(o.width, o.height)).toBeLessThanOrEqual(1200);
  }
});

test('WhatsApp / Facebook preset crops to exactly 1200×630 JPEG', async ({ page }) => {
  await selectPreset(page, 'WhatsApp / Facebook');
  await addFiles(page, ['landscape.jpg']);
  const o = await output(page, 'landscape.jpg');
  expect(isJpeg(o)).toBe(true);
  expect([o.width, o.height]).toEqual([1200, 630]);
});

test('converts HEIC (native where supported, libheif elsewhere)', async ({ page }) => {
  // Safari on macOS/iOS decodes HEIC via the OS; Chrome, Firefox and Linux WebKit builds can't.
  const heic = await readFile(fixture('landscape.heic'));
  const native = await page.evaluate(async (bytes) => {
    try {
      (await createImageBitmap(new Blob([new Uint8Array(bytes)], { type: 'image/heic' }))).close();
      return true;
    } catch {
      return false;
    }
  }, [...heic]);
  const libheif: string[] = [];
  page.on('request', (r) => r.url().includes('libheif') && libheif.push(r.url()));
  await addFiles(page, ['landscape.heic']);
  const o = await output(page, 'landscape.heic', [
    [0.05, 0.05],
    [0.95, 0.05],
  ]);
  expect(isWebp(o)).toBe(true);
  expect([o.width, o.height]).toEqual([1600, 1066]);
  // The decoder is only downloaded when the browser can't decode HEIC itself.
  if (native) expect(libheif).toEqual([]);
  else expect(libheif.length).toBeGreaterThan(0);
  expect(near(o.pixels[0], [255, 0, 0])).toBe(true);
  expect(near(o.pixels[1], [0, 0, 255])).toBe(true);
});

test('HEIC in the Form upload preset becomes a JPEG under 100 KB', async ({ page }) => {
  await selectPreset(page, 'Form upload');
  await addFiles(page, ['landscape.heic']);
  const o = await output(page, 'landscape.heic');
  expect(isJpeg(o)).toBe(true);
  expect(o.size).toBeLessThanOrEqual(100 * 1024);
});

test('shows an error for corrupt files without stopping the batch', async ({ page }) => {
  await addFiles(page, ['corrupt.jpg', 'broken.heic', 'landscape.jpg']);
  await expect(row(page, 'corrupt.jpg').locator('.text-danger')).toBeVisible();
  await expect(row(page, 'broken.heic').locator('.text-danger')).toBeVisible();
  await output(page, 'landscape.jpg');
});

test('downloads every output in a ZIP', async ({ page }) => {
  await addFiles(page, ['landscape.jpg', 'logo-transparent.png']);
  await output(page, 'landscape.jpg');
  await output(page, 'logo-transparent.png');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download all (ZIP)' }).click()]);
  expect(dl.suggestedFilename()).toBe('optimized-images.zip');
  const files = unzipSync(new Uint8Array(await readFile(await dl.path())));
  expect(Object.keys(files).sort()).toEqual(['landscape.webp', 'logo-transparent.png']);
});
