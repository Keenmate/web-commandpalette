import { expect, load, open, palette, test, type Page } from './fixtures';

/**
 * Home-screen caps for favorites / recents and `usage-key` isolation.
 * Fixture: test/usage-limits.html (feedback off so runs close at once).
 */

const attr = (page: Page, name: string, value: string) =>
  palette(page).host.evaluate((el, [n, v]) => el.setAttribute(n, v), [name, value] as const);
const headings = (page: Page) =>
  palette(page).host.locator('.cp__home-heading > span:first-child').allTextContents();
const section = (page: Page, label: string) =>
  palette(page).host.locator(`.cp__home-section[aria-label="${label}"]`);

/** Star "Deploy to Environment" (Ctrl+D on the first row) and "Go to Page" (its star button). */
async function starTwo(page: Page): Promise<void> {
  await open(page);
  await page.keyboard.press('Control+d');
  await expect(section(page, 'Favorites')).toBeVisible();
  await section(page, 'Commands').locator('.cp__item', { hasText: 'Go to Page' }).locator('.cp__star').click();
  await expect(section(page, 'Commands').locator('.cp__star--on')).toHaveCount(2);
}

/** Run /reload and /go Home → two recents. */
async function runTwo(page: Page): Promise<void> {
  const p = palette(page);
  for (const q of ['/reload', '/go ho']) {
    await open(page);
    await page.keyboard.type(q);
    await page.keyboard.press('Enter');
    await expect(p.root).not.toHaveClass(/--active/);
  }
}

test.beforeEach(async ({ page }) => load(page, 'usage-limits'));

test('max-favorite-count="1": one row, the heading says "+1"', async ({ page }) => {
  await attr(page, 'max-favorite-count', '1');
  await starTwo(page);
  await expect(section(page, 'Favorites').locator('.cp__item')).toHaveCount(1);
  await expect(section(page, 'Favorites').locator('.cp__more')).toContainText('+1');
});

test('favorites default limit (3) shows both, with no "+N"', async ({ page }) => {
  await starTwo(page);
  await expect(section(page, 'Favorites').locator('.cp__item')).toHaveCount(2);
  await expect(section(page, 'Favorites').locator('.cp__more')).not.toContainText('+');
});

test('max-favorite-count="0" hides the section; Ctrl+F still lists them', async ({ page }) => {
  const p = palette(page);
  await starTwo(page);
  await attr(page, 'max-favorite-count', '0');
  await expect.poll(() => headings(page)).toEqual(['Commands', 'Search']);
  await page.keyboard.press('Control+f');
  await expect(p.context).toHaveText('Favorites');
  await expect(p.titles).toHaveCount(2);
});

test('max-recent-count="1": one row, the heading says "+1"; "0" hides it', async ({ page }) => {
  await attr(page, 'max-recent-count', '1');
  await runTwo(page);
  await open(page);
  await expect(section(page, 'Recent').locator('.cp__item')).toHaveCount(1);
  await expect(section(page, 'Recent').locator('.cp__more')).toContainText('+1');
  await attr(page, 'max-recent-count', '0');
  await expect.poll(() => headings(page)).toEqual(['Commands', 'Search']);
});

test('usage-key isolates the stored usage and switches live', async ({ page }) => {
  await attr(page, 'usage-key', 'cp:usage:u1');
  await open(page);
  await page.keyboard.press('Control+d');
  await expect.poll(() => headings(page)).toEqual(['Favorites', 'Commands', 'Search']);
  expect(await page.evaluate(() => localStorage.getItem('cp:usage:u1'))).toContain('command:deploy');
  expect(await page.evaluate(() => localStorage.getItem('web-commandpalette:usage'))).toBeNull();

  await attr(page, 'usage-key', 'cp:usage:u2');
  await expect.poll(() => headings(page)).toEqual(['Commands', 'Search']);
  await attr(page, 'usage-key', 'cp:usage:u1');
  await expect.poll(() => headings(page)).toEqual(['Favorites', 'Commands', 'Search']);
});
