import { expect, test } from '@playwright/test';
import { load, open, palette } from './fixtures';

test.beforeEach(async ({ page }) => load(page));

const box = async (l: import('@playwright/test').Locator) => (await l.boundingBox())!;

test('dir="rtl" on the element mirrors the layout (title on the right, keycaps + star on the left)', async ({ page }) => {
  const p = palette(page);
  await p.host.evaluate((el) => el.setAttribute('dir', 'rtl'));
  await open(page);
  const row = p.items.first();
  expect(await row.evaluate((el) => getComputedStyle(el).direction)).toBe('rtl');
  const title = await box(row.locator('.pa-command-palette__item-title'));
  const key = await box(row.locator('.pa-command-palette__key').first());
  const star = await box(row.locator('.cp-star'));
  expect(key.x).toBeLessThan(title.x);
  expect(star.x).toBeLessThan(key.x);
});

test('an RTL ancestor (<html dir="rtl">) is enough', async ({ page }) => {
  const p = palette(page);
  await page.evaluate(() => document.documentElement.setAttribute('dir', 'rtl'));
  await open(page);
  expect(await p.input.evaluate((el) => getComputedStyle(el).direction)).toBe('rtl');
});

test('RTL paging: → (toward the inline start) is "previous", ← is "next"', async ({ page }) => {
  const p = palette(page);
  await p.host.evaluate((el) => el.setAttribute('dir', 'rtl'));
  await open(page);
  await p.input.fill('many');
  await expect(p.pagination).toHaveText('Page 1 of 3 · 20 results');
  await page.keyboard.press('ArrowLeft'); // caret at the end → next page
  await expect(p.pagination).toHaveText('Page 2 of 3 · 20 results');
  await p.input.evaluate((el: HTMLInputElement) => el.setSelectionRange(0, 0));
  await page.keyboard.press('ArrowRight'); // caret at the start → previous page
  await expect(p.pagination).toHaveText('Page 1 of 3 · 20 results');
});

test('the confirmation line starts at the inline start in RTL', async ({ page }) => {
  const p = palette(page);
  await p.host.evaluate((el) => el.setAttribute('dir', 'rtl'));
  await open(page);
  await page.keyboard.type('/reload');
  await page.keyboard.press('Enter');
  const line = p.host.locator('.cp-confirm');
  await expect(line).toBeVisible();
  const lineBox = await box(line);
  const check = await box(line.locator('.cp-confirm__check'));
  expect(check.x).toBeGreaterThan(lineBox.x + lineBox.width / 2); // ✓ sits on the right
});
