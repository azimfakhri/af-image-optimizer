import { expect, test as base, type Page } from '@playwright/test';
import { resolve } from 'node:path';

export const FIXTURES = resolve(import.meta.dirname, '.fixtures');
export const fixture = (name: string) => resolve(FIXTURES, name);

export interface Output {
  size: number;
  type: string;
  /** First 12 bytes as hex. */
  magic: string;
  width: number;
  height: number;
  /** RGBA at the requested points, in output pixel coordinates (fractions of width/height). */
  pixels: number[][];
}

/**
 * Fails a test on uncaught page errors, CSP violations and any request that could carry image data off the device
 * (anything not same-origin, or anything that isn't a GET).
 */
export const test = base.extend<{ guard: void }>({
  guard: [
    async ({ page, baseURL }, use) => {
      const problems: string[] = [];
      const origin = new URL(baseURL!).origin;
      page.on('pageerror', (e) => problems.push(`page error: ${e.message}`));
      page.on('console', (m) => {
        if (m.type() === 'error' && /content security policy|refused to/i.test(m.text())) problems.push(`CSP: ${m.text()}`);
      });
      page.on('request', (r) => {
        const u = r.url();
        if (u.startsWith('blob:') || u.startsWith('data:')) return;
        if (new URL(u).origin !== origin) problems.push(`external request: ${r.method()} ${u}`);
        else if (r.method() !== 'GET') problems.push(`non-GET request: ${r.method()} ${u}`);
      });
      await use();
      expect(problems).toEqual([]);
    },
    { auto: true },
  ],
});
export { expect };

export async function addFiles(page: Page, names: string[]) {
  await page.locator('input[type=file][multiple]').setInputFiles(names.map(fixture));
}

export async function selectPreset(page: Page, label: string) {
  await page.getByRole('radio', { name: label, exact: true }).click();
}

/** The list row for a file name. */
export const row = (page: Page, name: string) => page.getByRole('listitem').filter({ hasText: name });

/** Waits for a row to finish, then decodes its output in the page. */
export async function output(page: Page, name: string, points: [number, number][] = []): Promise<Output> {
  const r = row(page, name);
  await expect(r.getByRole('button', { name: /^Download / })).toBeVisible();
  const src = await r.locator('img').getAttribute('src');
  return page.evaluate(
    async ({ src, points }) => {
      const blob = await (await fetch(src!)).blob();
      const head = new Uint8Array(await blob.slice(0, 12).arrayBuffer());
      const magic = [...head].map((b) => b.toString(16).padStart(2, '0')).join('');
      const bmp = await createImageBitmap(blob, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
      const c = new OffscreenCanvas(bmp.width, bmp.height);
      const ctx = c.getContext('2d')!;
      ctx.drawImage(bmp, 0, 0);
      const pixels = points.map(([fx, fy]) => [
        ...ctx.getImageData(Math.min(bmp.width - 1, Math.floor(fx * bmp.width)), Math.min(bmp.height - 1, Math.floor(fy * bmp.height)), 1, 1).data,
      ]);
      return { size: blob.size, type: blob.type, magic, width: bmp.width, height: bmp.height, pixels };
    },
    { src, points },
  );
}

export const isJpeg = (o: Output) => o.magic.startsWith('ffd8ff');
export const isPng = (o: Output) => o.magic.startsWith('89504e47');
export const isWebp = (o: Output) => o.magic.startsWith('52494646') && o.magic.slice(16, 24) === '57454250';

/** Rough colour match: each channel within `tol`. */
export function near(px: number[], rgb: [number, number, number], tol = 40): boolean {
  return rgb.every((v, i) => Math.abs(px[i] - v) <= tol);
}
