import { chordCap, events, expect, load, palette, test, type Page } from './fixtures';

/**
 * Global and in-palette key bindings: `open-key`, `favorite-key` / `favorites-key` /
 * `recent-key` remaps, `favorites-hotkey` / `recent-hotkey` sequences.
 * Fixture: test/hotkeys.html (standard commands; Ctrl+D stars the active row by default).
 */

const attr = (page: Page, name: string, value: string) =>
  palette(page).host.evaluate((el, [n, v]) => el.setAttribute(n, v), [name, value] as const);
const headings = (page: Page) =>
  palette(page).host.locator('.pa-command-palette__home-heading > span:first-child').allTextContents();

test.beforeEach(async ({ page }) => load(page, 'hotkeys'));

test('open-key="p": Ctrl+P toggles, Ctrl+K no longer does', async ({ page }) => {
  const p = palette(page);
  await attr(page, 'open-key', 'p');
  await page.keyboard.press('Control+k');
  await page.waitForTimeout(100);
  await expect(p.root).not.toHaveClass(/--active/);
  await page.keyboard.press('Control+p');
  await expect(p.root).toHaveClass(/--active/);
  await page.keyboard.press('Control+p');
  await expect(p.root).not.toHaveClass(/--active/);
});

test('open-key="" disables the global toggle; the API still opens it', async ({ page }) => {
  const p = palette(page);
  await attr(page, 'open-key', '');
  await page.keyboard.press('Control+k');
  await page.waitForTimeout(100);
  await expect(p.root).not.toHaveClass(/--active/);
  await p.host.evaluate((el) => (el as unknown as { open(): void }).open());
  await expect(p.root).toHaveClass(/--active/);
});

test('favorite-key / favorites-key / recent-key remap the in-palette chords', async ({ page }) => {
  const p = palette(page);
  await attr(page, 'favorite-key', 'e');
  await attr(page, 'favorites-key', 'i');
  await attr(page, 'recent-key', 'm');
  await page.keyboard.press('Control+k');
  await expect(p.root).toHaveClass(/--active/);
  // The old chord does nothing; the footer hint shows the new keycap.
  await page.keyboard.press('Control+d');
  expect(await headings(page)).toEqual(['Commands', 'Search']);
  await expect(p.footer).toContainText(await chordCap(page, 'e'));
  await page.keyboard.press('Control+e');
  await expect.poll(() => headings(page)).toEqual(['Favorites', 'Commands', 'Search']);
  // Favorites list on the new chord (the old Ctrl+F is inert).
  await page.keyboard.press('Control+f');
  await expect(p.context).not.toHaveText('Favorites');
  await page.keyboard.press('Control+i');
  await expect(p.context).toHaveText('Favorites');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Control+m');
  await expect(p.context).toHaveText('Recent');
});

test('recent-hotkey="g h" opens the palette on the recent list (off by default)', async ({ page }) => {
  const p = palette(page);
  await page.keyboard.press('g');
  await page.keyboard.press('h');
  await page.waitForTimeout(100);
  await expect(p.root).not.toHaveClass(/--active/);

  await attr(page, 'recent-hotkey', 'g h');
  await page.keyboard.press('g');
  await page.keyboard.press('h');
  await expect(p.root).toHaveClass(/--active/);
  await expect(p.context).toHaveText('Recent');
});

test('favorites-hotkey="" disables `g f`', async ({ page }) => {
  const p = palette(page);
  await attr(page, 'favorites-hotkey', '');
  await page.keyboard.press('g');
  await page.keyboard.press('f');
  await page.waitForTimeout(100);
  await expect(p.root).not.toHaveClass(/--active/);
});

test('a command `shortcut` wins over a built-in sequence on the same letter', async ({ page }) => {
  const p = palette(page);
  await attr(page, 'recent-hotkey', 'g r'); // "Reload Data" has the shortcut "g r"
  await page.keyboard.press('g');
  await page.keyboard.press('r');
  // Reload is instant: it runs (action) instead of opening the recent list.
  await expect.poll(async () => (await events(page)).some((e) => e.name === 'action')).toBe(true);
  await expect(p.context).not.toHaveText('Recent');
});
