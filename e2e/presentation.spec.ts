import { expect, load, open, palette, test } from './fixtures';

/**
 * Desktop (chromium project): `presentation="fullscreen"` forces the sheet even
 * with a fine pointer; `auto` (the default) stays floating on desktop.
 * Fixture: test/presentation.html. Phone behaviour is in mobile.spec.ts.
 */

test.beforeEach(async ({ page }) => load(page, 'presentation'));

test('presentation="fullscreen" on desktop: the sheet with its close bar, full width', async ({ page }) => {
  const p = palette(page);
  await open(page);
  await expect(p.root).toHaveClass(/cp--fullscreen/);
  await expect(p.host.locator('.cp__fullscreen-bar')).toBeVisible();
  const box = await p.container.boundingBox();
  expect(Math.round(box!.width)).toBe(page.viewportSize()!.width);
  await p.host.locator('.cp__close').click();
  await expect(p.root).not.toHaveClass(/--active/);
});

test('switching to auto on desktop goes back to the floating dialog (live)', async ({ page }) => {
  const p = palette(page);
  await open(page);
  await p.host.evaluate((el) => el.setAttribute('presentation', 'auto'));
  await expect(p.root).not.toHaveClass(/--fullscreen/);
  await expect(p.host.locator('.cp__fullscreen-bar')).toBeHidden();
  const box = await p.container.boundingBox();
  expect(Math.round(box!.width)).toBeLessThan(page.viewportSize()!.width);
});

test("the sheet bar is core's sheet chrome: a 44px ✕ chip named from labels, themed by --cp-sheet-*", async ({ page }) => {
  const p = palette(page);
  await open(page);
  const bar = p.host.locator('.cp__fullscreen-bar');
  await expect(bar).toHaveClass(/km-sheet-header/);
  await expect(bar.locator('.cp__fullscreen-title')).toHaveClass(/km-sheet-title/);
  const close = bar.locator('.cp__close');
  await expect(close).toHaveClass(/km-sheet-close/);
  await expect(close).toHaveAttribute('aria-label', 'Close');
  await expect(close).toHaveText('');
  expect((await close.boundingBox())!.width).toBe(44);
  await p.host.evaluate((el) => (el as HTMLElement).style.setProperty('--cp-sheet-close-size', '50px'));
  await expect.poll(async () => (await close.boundingBox())!.width).toBe(50);
});

test('the presentation flag reaches event details', async ({ page }) => {
  await open(page);
  const detail = await page.evaluate(() => (window as unknown as { events: Array<{ name: string; detail: Record<string, unknown> }> }).events.find((e) => e.name === 'open')?.detail);
  expect(detail).toMatchObject({ presentation: 'fullscreen', isFullscreen: true });
});
