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
  await expect(p.empty).toHaveText('Suche in Products'); // {ctx.name} interpolated
  // An unset key (labels.scopeContexts) keeps the English default.
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
    (el as unknown as { labels: unknown }).labels = { 'headers.commands': 'Příkazy', 'headers.search': 'Hledat', 'ariaLabels.dialog': 'Paleta' };
  });
  await expect.poll(() => headings(page)).toEqual(['Příkazy', 'Hledat']);
  await expect(p.container).toHaveAttribute('aria-label', 'Paleta');
  // Keys dropped from the new object fall back to English.
  await expect(p.input).toHaveAttribute('placeholder', /Type \/ for commands/);
});

test('a labels JSON attribute renders like the property (C-CA labels attribute)', async ({ page }) => {
  const p = palette(page);
  await p.host.evaluate((el) => {
    el.setAttribute('labels', JSON.stringify({ 'headers.commands': 'Příkazy', 'placeholders.idle': 'Hledat…' }));
  });
  await open(page);
  expect(await headings(page)).toEqual(['Příkazy', 'Search']); // headers.search not in the JSON → English
  await expect(p.input).toHaveAttribute('placeholder', 'Hledat…');
});

test('twin fallback: an unset ariaLabels / tooltips key follows a customized same-name sibling (core /locale)', async ({ page }) => {
  const p = palette(page);
  await open(page);
  await p.host.evaluate((el) => {
    (el as unknown as { labels: unknown }).labels = { 'labels.close': 'Zavřít', 'ariaLabels.addFavorite': 'Přidat do oblíbených' };
  });
  // ariaLabels.close ← labels.close (the footer hint's text); the close button is icon-only
  // (hidden outside the fullscreen sheet, so the attribute is asserted, not the computed name).
  await expect(p.host.locator('.cp__close')).toHaveAttribute('aria-label', 'Zavřít');
  // tooltips.addFavorite ← ariaLabels.addFavorite (the star's title; the chord is appended).
  await p.input.fill('/');
  const star = p.host.locator('.cp__star:not(.cp__star--on)').first();
  await expect(star).toHaveAccessibleName('Přidat do oblíbených');
  await expect(star).toHaveAttribute('title', /^Přidat do oblíbených/);
});

test("'' renders nothing; undefined keeps the English default", async ({ page }) => {
  const p = palette(page);
  await open(page);
  await p.host.evaluate((el) => {
    (el as unknown as { labels: unknown }).labels = { 'labels.navigate': '', 'messages.noResults': '', 'ariaLabels.dialog': '', 'ariaLabels.input': '', 'placeholders.idle': undefined };
  });
  await expect(p.input).toHaveAttribute('placeholder', /Type \/ for commands/);
  await expect(p.container).not.toHaveAttribute('aria-label');
  await expect(p.input).not.toHaveAttribute('aria-label'); // not aria-label="" (was the one blank-label exception)
  await p.input.fill('/zzz');
  await expect(p.items).toHaveCount(0);
  await expect(p.empty).toHaveCount(0);
  await expect(p.footer.locator('.cp__hint', { hasText: '↑↓' })).toHaveCount(0);
});

/**
 * Page-wide labels (core /locale): the flat `window.components.locale.labels['web-command-palette.<key>']` sits
 * between the instance `labels` and English; assigning the page object re-renders the open palette
 * in place (core `localeChanged()`), and `{ctx.count}` / `{ctx.page}` / `{ctx.total}` are locale-formatted.
 */
test.describe('page-wide locale', () => {
  test.afterEach(async ({ page }) => {
    await page.evaluate(() => { (window as any).components.locale = null; });
  });

  test('a page-wide label fills the gaps; the instance labels win', async ({ page }) => {
    await page.evaluate(() => {
      (window as any).components.locale = {
        labels: { 'web-command-palette.labels.scopeContexts': 'Kontexte', 'web-command-palette.headers.commands': 'Page commands', 'web-command-palette.labels.navigate': 'Navigieren' },
      };
    });
    const p = palette(page);
    await open(page);
    expect(await headings(page)).toEqual(['Befehle', 'Suche']); // instance `headers.commands` beats the page
    await expect(p.footer.locator('.cp__hint', { hasText: '↑↓' })).toContainText('Navigieren');
    await p.input.fill(':');
    await expect(p.context).toHaveText('Kontexte');
  });

  test("the element's translateCallback beats the page one; null passes on; instance labels beat both", async ({ page }) => {
    await page.evaluate(() => {
      (window as any).components.locale = {
        translateCallback: ({ key }: any) =>
          key === 'web-command-palette.headers.commands' || key === 'web-command-palette.labels.scopeContexts' || key === 'web-command-palette.ariaLabels.input'
            ? `page:${key.split('.').pop()}` : null,
      };
    });
    const p = palette(page);
    await p.host.evaluate((el: any) => {
      el.translateCallback = ({ key }: any) =>
        key === 'web-command-palette.headers.commands' || key === 'web-command-palette.labels.scopeContexts' ? `own:${key.split('.').pop()}` : null;
    });
    await open(page);
    expect(await headings(page)).toEqual(['Befehle', 'Suche']); // instance `headers.commands` beats both callbacks
    await expect(p.input).toHaveAttribute('aria-label', 'page:input'); // own callback → null → the page one
    await p.input.fill(':');
    await expect(p.context).toHaveText('own:scopeContexts'); // own callback beats the page one

    // Changing the element's callback re-renders the labels in place.
    await p.host.evaluate((el: any) => { el.translateCallback = null; });
    await expect(p.context).toHaveText('page:scopeContexts');
  });

  test('assigning window.components.locale re-renders the open palette (localeChanged), state kept', async ({ page }) => {
    const p = palette(page);
    await open(page);
    await p.input.fill(':p ');
    await expect(p.empty).toHaveText('Suche in Products');
    await expect(p.context).toHaveText('Searching in Products');

    await page.evaluate(() => {
      (window as any).components.locale = {
        labels: { 'web-command-palette.labels.scopeSearchingIn': 'Hledám v {ctx.name}', 'web-command-palette.ariaLabels.close': 'Zavřít', 'web-command-palette.headers.fullscreen': 'Hledat' },
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
    await expect(p.pagination).toHaveText(/^Page 1 of 1\s544 · Results: 12\s345$/);
    await expect(page.locator('[data-km-announcer="polite"]')).toHaveText(/^Results: 12\s345$/);

    await page.evaluate(() => { (window as any).components.locale = { locale: 'en-US' }; });
    await expect(p.pagination).toHaveText('Page 1 of 1,544 · Results: 12,345');
  });

  test('a page-wide translateCallback gets the spot context with raw numbers (params.ctx)', async ({ page }) => {
    const p = palette(page);
    await p.host.evaluate((el: any) => {
      el.searchCallback = () => Array.from({ length: 12345 }, (_, i) => ({ id: `r${i}`, title: `Row ${i}` }));
    });
    await page.evaluate(() => {
      (window as any).seen = [];
      (window as any).components.locale = {
        locale: 'cs',
        translateCallback: ({ key, params }: any) => {
          if (key === 'web-command-palette.labels.pageOf') (window as any).seen.push(params);
          return key === 'web-command-palette.labels.pageOf' ? `typeof ${typeof params.ctx.count} ${params.ctx.count}` : undefined;
        },
      };
    });
    await open(page);
    await p.input.fill(':p row');
    await expect(p.pagination).toHaveText('typeof number 12345');
    const seen = await page.evaluate(() => (window as any).seen.at(-1));
    expect(seen).toEqual({ ctx: { page: 1, total: 1544, count: 12345 } });
  });
});

/**
 * The element's own `locale` input (C-CA-38): the numbers in labels follow it; unset = the page-wide
 * `window.components.locale.locale`, else the browser. A change re-renders the open palette in place.
 */
test.describe('locale input', () => {
  test.afterEach(async ({ page }) => {
    await page.evaluate(() => { (window as any).components.locale = null; });
  });

  test('locale="de" formats the counts; unset follows window.components.locale.locale; live', async ({ page }) => {
    const p = palette(page);
    await p.host.evaluate((el: any) => {
      el.searchCallback = () => Array.from({ length: 12345 }, (_, i) => ({ id: `r${i}`, title: `Row ${i}` }));
      el.setAttribute('locale', 'de');
    });
    expect(await p.host.evaluate((el: any) => el.locale)).toBe('de');
    await open(page);
    await p.input.fill(':p row');
    await expect(p.pagination).toHaveText('Page 1 of 1.544 · Results: 12.345');

    // unset → the page-wide locale
    await page.evaluate(() => { (window as any).components.locale = { locale: 'cs' }; });
    await p.host.evaluate(async (el: any) => { el.removeAttribute('locale'); await el.whenSettled(); });
    expect(await p.host.evaluate((el: any) => el.locale)).toBeNull();
    await expect(p.pagination).toHaveText(/^Page 1 of 1\s544 · Results: 12\s345$/);

    // the element's own locale wins over the page one; 'auto' = unset
    await p.host.evaluate(async (el: any) => { el.locale = 'en-US'; await el.whenSettled(); });
    await expect(p.pagination).toHaveText('Page 1 of 1,544 · Results: 12,345');
    await p.host.evaluate(async (el: any) => { el.locale = 'auto'; await el.whenSettled(); });
    await expect(p.pagination).toHaveText(/^Page 1 of 1\s544 · Results: 12\s345$/);
    await expect(p.input).toHaveValue(':products row'); // mode + query kept
  });
});
