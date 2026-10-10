import { expect, test } from '@playwright/test';
import { load, palette } from './fixtures';

// Runs in the `mobile` project (Pixel 7: coarse pointer, no hover).

test('touch phone: opens as a fullscreen sheet with a close button', async ({ page }) => {
  await load(page);
  const p = palette(page);
  await page.locator('#opener').tap();
  await expect(p.root).toHaveClass(/pa-command-palette--active/);
  await expect(p.root).toHaveClass(/pa-command-palette--fullscreen/);
  const bar = p.host.locator('.pa-command-palette__fullscreen-bar');
  await expect(bar).toBeVisible();
  await expect(bar.locator('.pa-command-palette__fullscreen-title')).toHaveText('Search');
  const box = await p.container.boundingBox();
  const vp = page.viewportSize()!;
  expect(Math.round(box!.width)).toBe(vp.width);
  await p.host.locator('.pa-command-palette__close').tap();
  await expect(p.root).not.toHaveClass(/--active/);
});

test('mobile-presentation="floating" forces the dialog', async ({ page }) => {
  await load(page);
  const p = palette(page);
  await p.host.evaluate((el) => el.setAttribute('mobile-presentation', 'floating'));
  await page.locator('#opener').tap();
  await expect(p.root).not.toHaveClass(/--fullscreen/);
});
