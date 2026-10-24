import { events, expect, load, palette, test } from './fixtures';

/**
 * Two palettes on one page: only the first connected owns the global keys (Ctrl+K and
 * the `g <letter>` sequences); removing it hands them to the second.
 * Fixture: test/multi-instance.html (#first, #second; each has a "g x" command).
 */

test.beforeEach(async ({ page }) => load(page, 'multi-instance'));

test('only the first instance owns Ctrl+K and the g-sequences', async ({ page }) => {
  const first = palette(page, '#first');
  const second = palette(page, '#second');
  await page.keyboard.press('Control+k');
  await expect(first.root).toHaveClass(/--active/);
  await expect(second.root).not.toHaveClass(/--active/);
  await page.keyboard.press('Control+k');
  await expect(first.root).not.toHaveClass(/--active/);

  await page.keyboard.press('g');
  await page.keyboard.press('x');
  await expect.poll(async () => (await events(page)).filter((e) => e.name === 'action').map((e) => e.target)).toEqual(['first']);
});

test('removing the owner hands Ctrl+K to the second instance', async ({ page }) => {
  const second = palette(page, '#second');
  await page.evaluate(() => document.getElementById('first')!.remove());
  await page.keyboard.press('Control+k');
  await expect(second.root).toHaveClass(/--active/);
  await page.keyboard.press('Escape');
  await page.keyboard.press('g');
  await page.keyboard.press('x');
  await expect.poll(async () => (await events(page)).filter((e) => e.name === 'action').map((e) => e.target)).toEqual(['second']);
});

test('a non-owner still works through its API', async ({ page }) => {
  const second = palette(page, '#second');
  await second.host.evaluate((el) => (el as unknown as { open(): void }).open());
  await expect(second.root).toHaveClass(/--active/);
  await expect(second.input).toBeFocused();
});
