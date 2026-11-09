import { expect, load, open, palette, test, type Page } from './fixtures';

/**
 * Favorites/recents through core's state-store callbacks (SPEC §12.17):
 * `loadStateCallback({ key })` / `saveStateCallback({ key, state })` — the WHOLE
 * `{ entries }` on every save — replace `localStorage`.
 * Fixture: test/usage-state.html — `storage-key="cp:state:alice"`, both callbacks set
 * before the first build; the page's "server" is `window.sink` (seeded from `window.seed`).
 */

type Entry = { key: string; isFavorite: boolean; count: number };
type Win = {
  sink: { entries: Entry[] } | null;
  loads: { key: string; hasContext: boolean }[];
  saves: { key: string; state: { entries: Entry[] }; hasContext: boolean }[];
};

const win = <R>(page: Page, fn: (w: Win) => R) => page.evaluate(`(${fn.toString()})(window)`) as Promise<R>;
const headings = (page: Page) =>
  palette(page).host.locator('.cp__home-heading > span:first-child').allTextContents();
const commandRow = (page: Page, text: string) =>
  palette(page).host.locator('.cp__home-section[aria-label="Commands"] .cp__item', { hasText: text });

test.beforeEach(async ({ page }) => load(page, 'usage-state'));

test('loadStateCallback gets { key } + context; saveStateCallback gets { key, state } with the WHOLE list; localStorage untouched', async ({ page }) => {
  await open(page);
  await expect.poll(() => win(page, (w) => w.loads.length)).toBeGreaterThan(0);
  expect(await win(page, (w) => w.loads[0])).toEqual({ key: 'cp:state:alice', hasContext: true });

  await commandRow(page, 'Go to Page').locator('.cp__star').click();
  await commandRow(page, 'Reload Data').locator('.cp__star').click();
  await expect.poll(() => win(page, (w) => w.saves.length)).toBe(2);
  const last = await win(page, (w) => w.saves.at(-1)!);
  expect(last.key).toBe('cp:state:alice');
  expect(last.hasContext).toBe(true);
  expect(last.state.entries.map((e) => e.key).sort()).toEqual(['command:go', 'command:reload']); // both, not just the changed one
  expect(await page.evaluate(() => Object.keys(localStorage))).toEqual([]);
});

test('a reload restores the favorites from the page store', async ({ page }) => {
  await open(page);
  await commandRow(page, 'Reload Data').locator('.cp__star').click();
  await expect.poll(() => win(page, (w) => w.saves.length)).toBe(1);
  const sink = await win(page, (w) => w.sink);

  await page.addInitScript((seed) => { (window as unknown as { seed: unknown }).seed = seed; }, sink);
  await page.reload();
  await page.waitForFunction(() => (window as unknown as { ready?: boolean }).ready === true);
  await open(page);
  await expect.poll(() => headings(page)).toEqual(['Favorites', 'Commands', 'Search']);
  await expect(palette(page).host.locator('.cp__home-section[aria-label="Favorites"] .cp__item-title')).toHaveText(['Reload Data']);
});
