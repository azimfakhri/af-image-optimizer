import { expect, fixture, test } from './helpers.ts';

test('enhance(): the form only ever sees the optimized file', async ({ page }) => {
  await page.goto('/examples/enhance.html');
  await page.locator('#photos').setInputFiles(fixture('landscape.jpg'));
  await expect(page.locator('#status')).toHaveText('Ready');
  const line = (await page.locator('#log').textContent())!.trim();
  const [, name, bytes, type] = line.match(/^(\S+)\s+(\d+) B\s+(\S+)$/)!;
  expect(name).toBe('landscape.jpg');
  expect(type).toBe('image/jpeg');
  expect(Number(bytes)).toBeLessThanOrEqual(100 * 1024);
  await page.getByRole('button', { name: 'Submit' }).click();
  await expect(page.locator('#log')).toContainText('Submitted 1 file(s).');
});

test('<image-optimizer> web component emits optimized files', async ({ page }) => {
  await page.goto('/examples/web-component.html');
  // Playwright locators pierce the shadow root.
  await page.locator('image-optimizer input[type=file][multiple]').setInputFiles(fixture('landscape.jpg'));
  await page.getByRole('button', { name: 'Use 1 image' }).click();
  await expect(page.locator('#log')).toContainText(/landscape\.jpg \(\d+ B\) → landscape\.jpg \(\d+ B, 1200×630\)/);
});

test('iframe embed posts files to the parent page', async ({ page }) => {
  await page.goto('/examples/iframe.html');
  const frame = page.frameLocator('#opt');
  await frame.locator('input[type=file][multiple]').setInputFiles(fixture('landscape.jpg'));
  await frame.getByRole('button', { name: 'Use 1 image' }).click();
  await expect(page.locator('#log')).toContainText(/landscape\.webp\s+\d+ B/);
});

test('web component settings attributes (min-aspect, max-width, crop-position)', async ({ page }) => {
  await page.goto('/examples/web-component.html');
  await page.locator('image-optimizer').evaluate((el) => {
    el.setAttribute('preset', 'content');
    el.setAttribute('max-width', '1200');
    el.setAttribute('min-aspect', '4:3');
    el.setAttribute('crop-position', 'top');
  });
  await page.locator('image-optimizer input[type=file][multiple]').setInputFiles(fixture('portrait.jpg'));
  await page.getByRole('button', { name: 'Use 1 image' }).click();
  await expect(page.locator('#log')).toContainText(/portrait\.webp \(\d+ B, 1200×900\)/);
});

test('iframe embed URL parameters (min-aspect)', async ({ page }) => {
  await page.goto('/embed.html?preset=content&min-aspect=4:3');
  await page.locator('input[type=file][multiple]').setInputFiles(fixture('portrait.jpg'));
  await expect(page.getByRole('listitem').filter({ hasText: 'portrait.jpg' })).toContainText('1600×2400 → 1600×1200');
});
