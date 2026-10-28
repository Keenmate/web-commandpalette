import { expect, load, open, palette, test } from './fixtures';

/**
 * `labels` (i18n): a partial set renders, unset keys fall back to English, and a
 * reassignment while open updates the UI. Fixture: test/labels.html (German labels).
 */

const headings = (page: import('@playwright/test').Page) =>
  palette(page).host.locator('.pa-command-palette__home-heading > span:first-child').allTextContents();

test.beforeEach(async ({ page }) => load(page, 'labels'));

test('custom labels render; unset keys fall back to English', async ({ page }) => {
  const p = palette(page);
  await open(page);
  expect(await headings(page)).toEqual(['Befehle', 'Suche']);
  await expect(p.input).toHaveAttribute('placeholder', 'Befehl eingeben…');
  await expect(p.container).toHaveAttribute('aria-label', 'Befehlspalette');
  await p.input.fill(':p ');
  await expect(p.empty).toHaveText('Suche in Products'); // {name} interpolated
  // An unset key (searchContexts) keeps the English default.
  await p.input.fill(':');
  await expect(p.context).toHaveText('Search contexts');
  await p.input.fill('/zzz'); // a list mode with no match
  await expect(p.empty).toHaveText('Nichts gefunden');
});

test('reassigning labels while open updates the UI', async ({ page }) => {
  const p = palette(page);
  await open(page);
  expect(await headings(page)).toEqual(['Befehle', 'Suche']);
  await p.host.evaluate((el) => {
    (el as unknown as { labels: unknown }).labels = { commands: 'Příkazy', search: 'Hledat', dialogLabel: 'Paleta' };
  });
  await expect.poll(() => headings(page)).toEqual(['Příkazy', 'Hledat']);
  await expect(p.container).toHaveAttribute('aria-label', 'Paleta');
  // Keys dropped from the new object fall back to English.
  await expect(p.input).toHaveAttribute('placeholder', /Type \/ for commands/);
});

test("'' renders nothing; undefined keeps the English default", async ({ page }) => {
  const p = palette(page);
  await open(page);
  await p.host.evaluate((el) => {
    (el as unknown as { labels: unknown }).labels = { navigate: '', noResults: '', dialogLabel: '', placeholder: undefined };
  });
  await expect(p.input).toHaveAttribute('placeholder', /Type \/ for commands/);
  await expect(p.container).not.toHaveAttribute('aria-label');
  await p.input.fill('/zzz');
  await expect(p.items).toHaveCount(0);
  await expect(p.empty).toHaveCount(0);
  await expect(p.footer.locator('.pa-command-palette__hint', { hasText: '↑↓' })).toHaveCount(0);
});
