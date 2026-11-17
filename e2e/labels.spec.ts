import { expect, load, open, palette, test } from './fixtures';

/**
 * `labels` (i18n): a partial set renders, unset keys fall back to English, and a
 * reassignment while open updates the UI. Fixture: test/labels.html (German labels).
 */

const headings = (page: import('@playwright/test').Page) =>
  palette(page).host.locator('.cp__home-heading > span:first-child').allTextContents();

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
  await expect(p.footer.locator('.cp__hint', { hasText: '↑↓' })).toHaveCount(0);
});

/**
 * Page-wide labels (core /locale): `window.components.locale.labels['web-command-palette']` sits
 * between the instance `labels` and English; assigning the page object re-renders the open palette
 * in place (core `localeChanged()`), and `{count}` / `{page}` / `{total}` are locale-formatted.
 */
test.describe('page-wide locale', () => {
  test.afterEach(async ({ page }) => {
    await page.evaluate(() => { (window as any).components.locale = null; });
  });

  test('a page-wide label fills the gaps; the instance labels win', async ({ page }) => {
    await page.evaluate(() => {
      (window as any).components.locale = {
        labels: { 'web-command-palette': { searchContexts: 'Kontexte', commands: 'Page commands', navigate: 'Navigieren' } },
      };
    });
    const p = palette(page);
    await open(page);
    expect(await headings(page)).toEqual(['Befehle', 'Suche']); // instance `commands` beats the page
    await expect(p.footer.locator('.cp__hint', { hasText: '↑↓' })).toContainText('Navigieren');
    await p.input.fill(':');
    await expect(p.context).toHaveText('Kontexte');
  });

  test('assigning window.components.locale re-renders the open palette (localeChanged), state kept', async ({ page }) => {
    const p = palette(page);
    await open(page);
    await p.input.fill(':p ');
    await expect(p.empty).toHaveText('Suche in Products');
    await expect(p.context).toHaveText('Searching in Products');

    await page.evaluate(() => {
      (window as any).components.locale = {
        labels: { 'web-command-palette': { searchingIn: 'Hledám v {name}', close: 'Zavřít', fullscreenTitle: 'Hledat' } },
      };
    });
    await expect(p.context).toHaveText('Hledám v Products');
    await expect(p.empty).toHaveText('Suche in Products'); // the instance key still wins
    await expect(p.input).toHaveValue(':products '); // mode + query kept
    await expect(p.host.locator('.cp__close')).toHaveAttribute('aria-label', 'Zavřít');

    await page.evaluate(() => { (window as any).components.locale = null; });
    await expect(p.context).toHaveText('Searching in Products');
  });

  test('counts in labels are locale-formatted (formatNumber)', async ({ page }) => {
    const p = palette(page);
    await p.host.evaluate((el: any) => {
      el.searchCallback = () => Array.from({ length: 12345 }, (_, i) => ({ id: `r${i}`, title: `Row ${i}` }));
    });
    await page.evaluate(() => { (window as any).components.locale = { locale: 'cs' }; });
    await open(page);
    await p.input.fill(':p row');
    await expect(p.pagination).toHaveText(/^Page 1 of 1\s544 · 12\s345 results$/);
    await expect(page.locator('[data-km-announcer="polite"]')).toHaveText(/^12\s345 results$/);

    await page.evaluate(() => { (window as any).components.locale = { locale: 'en-US' }; });
    await expect(p.pagination).toHaveText('Page 1 of 1,544 · 12,345 results');
  });

  test('a page-wide formatLabelCallback gets the raw numbers', async ({ page }) => {
    const p = palette(page);
    await p.host.evaluate((el: any) => {
      el.searchCallback = () => Array.from({ length: 12345 }, (_, i) => ({ id: `r${i}`, title: `Row ${i}` }));
    });
    await page.evaluate(() => {
      (window as any).seen = [];
      (window as any).components.locale = {
        locale: 'cs',
        formatLabelCallback: ({ key, params }: any) => {
          if (key === 'pageOf') (window as any).seen.push(params);
          return key === 'pageOf' ? `typeof ${typeof params.count} ${params.count}` : undefined;
        },
      };
    });
    await open(page);
    await p.input.fill(':p row');
    await expect(p.pagination).toHaveText('typeof number 12345');
    const seen = await page.evaluate(() => (window as any).seen.at(-1));
    expect(seen).toEqual({ page: 1, total: 1544, count: 12345 });
  });
});
