import { expect, test, load, palette } from './fixtures';

// Runs in the `mobile` project (Pixel 7: coarse pointer, no hover).

test('touch phone: opens as a fullscreen sheet with a close button', async ({ page }) => {
  await load(page, 'mobile');
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

test('presentation="floating" forces the dialog', async ({ page }) => {
  await load(page, 'mobile');
  const p = palette(page);
  await p.host.evaluate((el) => el.setAttribute('presentation', 'floating'));
  await page.locator('#opener').tap();
  await expect(p.root).not.toHaveClass(/--fullscreen/);
});

test('responsive rules: a per-tag page rule applies on a phone; an instance attribute beats it', async ({ page }) => {
  // Set before the component script loads — registerComponent adopts it (core SPEC §6.7).
  await page.addInitScript(() => {
    (window as unknown as { components: unknown }).components = {
      'web-command-palette': { responsive: { mobile: { presentation: 'floating' } } },
    };
  });
  await load(page, 'mobile');
  const p = palette(page);
  expect(await p.host.evaluate((el: any) => el.presentation)).toBe('floating');
  await expect(p.host).not.toHaveAttribute('presentation', 'floating'); // never reflected
  await page.locator('#opener').tap();
  await expect(p.root).toHaveClass(/pa-command-palette--active/);
  await expect(p.root).not.toHaveClass(/--fullscreen/);
  await p.host.evaluate((el: any) => el.controller.close());

  // An attribute on the element is explicit: it beats the page rule.
  await p.host.evaluate((el) => el.setAttribute('presentation', 'auto'));
  await page.locator('#opener').tap();
  await expect(p.root).toHaveClass(/pa-command-palette--fullscreen/);
});
