import { expect, load, open, palette, test } from './fixtures';

/**
 * Desktop (chromium project): `mobile-presentation="fullscreen"` forces the sheet even
 * with a fine pointer; `auto` (the default) stays floating on desktop.
 * Fixture: test/presentation.html. Phone behaviour is in mobile.spec.ts.
 */

test.beforeEach(async ({ page }) => load(page, 'presentation'));

test('mobile-presentation="fullscreen" on desktop: the sheet with its close bar, full width', async ({ page }) => {
  const p = palette(page);
  await open(page);
  await expect(p.root).toHaveClass(/pa-command-palette--fullscreen/);
  await expect(p.host.locator('.pa-command-palette__fullscreen-bar')).toBeVisible();
  const box = await p.container.boundingBox();
  expect(Math.round(box!.width)).toBe(page.viewportSize()!.width);
  await p.host.locator('.pa-command-palette__close').click();
  await expect(p.root).not.toHaveClass(/--active/);
});

test('switching to auto on desktop goes back to the floating dialog (live)', async ({ page }) => {
  const p = palette(page);
  await open(page);
  await p.host.evaluate((el) => el.setAttribute('mobile-presentation', 'auto'));
  await expect(p.root).not.toHaveClass(/--fullscreen/);
  const box = await p.container.boundingBox();
  expect(Math.round(box!.width)).toBeLessThan(page.viewportSize()!.width);
});

test('the presentation flag reaches event details', async ({ page }) => {
  await open(page);
  const detail = await page.evaluate(() => (window as unknown as { events: Array<{ name: string; detail: Record<string, unknown> }> }).events.find((e) => e.name === 'open')?.detail);
  expect(detail).toMatchObject({ presentation: 'fullscreen', isFullscreen: true });
});
