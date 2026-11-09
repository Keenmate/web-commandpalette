import { expect, load, open, palette, test, type Page } from './fixtures';

/**
 * Host-side favorites/recents persistence: `loadUsageCallback` (async) +
 * `saveUsageCallback({ entry })` (per entry). Fixture: test/usage-host.html —
 * `window.useHost(seed)` installs both callbacks (load resolves `seed` after 50 ms,
 * saves go to `window.saved`). The whole-state callbacks: usage-state.spec.ts.
 */

type Entry = { key: string; kind: string; label: string; count: number; isFavorite: boolean };
type Win = { saved: Entry[]; loads: number; useHost(seed?: unknown[]): void };

const headings = (page: Page) =>
  palette(page).host.locator('.cp__home-heading > span:first-child').allTextContents();
const saved = (page: Page) => page.evaluate(() => (window as unknown as Win).saved);
const useHost = (page: Page, seed: unknown[] = []) => page.evaluate((s) => (window as unknown as Win).useHost(s), seed);

test.beforeEach(async ({ page }) => load(page, 'usage-host'));

test('an async loadUsageCallback feeds the home screen', async ({ page }) => {
  const p = palette(page);
  await useHost(page, [
    { key: 'command:reload', kind: 'command', label: 'Reload Data', commandId: 'reload', count: 0, lastUsed: 1, isFavorite: true },
  ]);
  await open(page);
  await expect.poll(() => headings(page)).toEqual(['Favorites', 'Commands', 'Search']);
  await expect(p.host.locator('.cp__home-section[aria-label="Favorites"] .cp__item-title')).toHaveText(['Reload Data']);
  expect(await page.evaluate(() => (window as unknown as Win).loads)).toBeGreaterThanOrEqual(1);
});

test('starring and running call saveUsageCallback({ entry }); localStorage stays untouched', async ({ page }) => {
  const p = palette(page);
  await useHost(page);
  await open(page);
  await page.keyboard.press('Control+d'); // star "Deploy to Environment"
  await expect.poll(() => saved(page)).toEqual([expect.objectContaining({ key: 'command:deploy', kind: 'command', isFavorite: true })]);

  await p.input.fill('/reload');
  await page.keyboard.press('Enter');
  await expect(p.root).not.toHaveClass(/--active/);
  await expect.poll(async () => (await saved(page)).map((e) => e.key)).toContain('command:reload');
  expect((await saved(page)).find((e) => e.key === 'command:reload')).toMatchObject({ count: 1 });
  expect(await page.evaluate(() => Object.keys(localStorage))).toEqual([]);
});

test('saveUsageCallback without loadUsageCallback is ignored; localStorage is used (CP-3, current behaviour)', async ({ page }) => {
  // Pins today's behaviour — whether this should warn or be documented is open (NOTES.md #3).
  await page.evaluate(() => {
    (window as unknown as Win).saved = [];
    (document.getElementById('palette') as unknown as { saveUsageCallback: unknown }).saveUsageCallback = ({ entry }: { entry: Entry }) =>
      (window as unknown as Win).saved.push(entry);
  });
  await open(page);
  await page.keyboard.press('Control+d');
  await expect.poll(() => headings(page)).toEqual(['Favorites', 'Commands', 'Search']);
  expect(await saved(page)).toEqual([]);
  expect(await page.evaluate(() => localStorage.getItem('km-state:web-command-palette:web-commandpalette:usage'))).toContain('command:deploy');
});

test('usage-storage="none": nothing is stored', async ({ page }) => {
  await palette(page).host.evaluate((el) => el.setAttribute('usage-storage', 'none'));
  await open(page);
  await page.keyboard.type('/reload');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(100);
  expect(await page.evaluate(() => Object.keys(localStorage))).toEqual([]);
});
