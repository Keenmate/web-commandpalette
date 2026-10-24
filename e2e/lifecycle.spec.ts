import { events, expect, load, open, palette, test, type Page } from './fixtures';

/**
 * D1 (decided 2026-10-24): a DOM move (disconnect → connect) closes the palette
 * cleanly — `close` fires once, focus returns to where it was before opening, and the
 * global hotkeys still work afterwards. Fixture: test/lifecycle.html (`window.move()`
 * re-parents the palette between two slots).
 */

const move = (page: Page) => page.evaluate(() => (window as unknown as { move(): void }).move());
const names = async (page: Page) => (await events(page)).map((e) => e.name).filter((n) => n !== 'ready');

test.beforeEach(async ({ page }) => load(page, 'lifecycle'));

test('a move while open closes cleanly: close once, focus restored, Ctrl+K still works', async ({ page }) => {
  const p = palette(page);
  await page.locator('#outside').focus();
  await open(page);
  await p.input.fill('/go ');
  await move(page);
  await expect(p.root).not.toHaveClass(/--active/);
  await expect(p.host).not.toHaveAttribute('open');
  expect(await names(page)).toEqual(['open', 'close']);
  await expect(page.locator('#outside')).toBeFocused();
  expect(await page.evaluate(() => document.body.style.overflow)).toBe('');
  expect(await page.evaluate(() => document.getElementById('palette')!.parentElement!.id)).toBe('slot-b');

  // Hotkeys after the move: Ctrl+K opens a fresh home screen.
  await open(page);
  await expect(p.input).toHaveValue('');
  await expect(p.titles.first()).toHaveText('Deploy to Environment');
  await page.keyboard.press('Escape');
  expect(await names(page)).toEqual(['open', 'close', 'open', 'close']);
});

test('g-sequences still work after a move; a move while closed fires nothing', async ({ page }) => {
  const p = palette(page);
  await move(page);
  await move(page);
  expect(await names(page)).toEqual([]);
  await page.keyboard.press('g');
  await page.keyboard.press('d');
  await expect(p.root).toHaveClass(/--active/);
  await expect(p.input).toHaveValue('/deploy to ');
});

test('ready fires only once across moves (no rebuild)', async ({ page }) => {
  await move(page);
  await move(page);
  await page.waitForTimeout(50);
  expect((await events(page)).filter((e) => e.name === 'ready')).toHaveLength(1);
});
