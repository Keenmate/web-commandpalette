import { expect, load, open, palette, test, type Page } from './fixtures';

/**
 * Attribute-driven config not covered elsewhere: `page-size` (+ a live change), and
 * removing an attribute resets the input to its default (absent == default).
 * Fixture: test/attributes.html (the fake provider returns 20 hits for "many").
 */

const attr = (page: Page, name: string, value: string | null) =>
  palette(page).host.evaluate((el, [n, v]) => (v === null ? el.removeAttribute(n!) : el.setAttribute(n!, v)), [name, value] as const);

test.beforeEach(async ({ page }) => load(page, 'attributes'));

test('page-size sets the results per page', async ({ page }) => {
  const p = palette(page);
  await attr(page, 'page-size', '5');
  await open(page);
  await p.input.fill('many');
  await expect(p.pagination).toHaveText('Page 1 of 4 · 20 results');
  await expect(p.items).toHaveCount(5);
});

test('page-size changed while open re-pages the current results', async ({ page }) => {
  const p = palette(page);
  await open(page);
  await p.input.fill('many');
  await expect(p.pagination).toHaveText('Page 1 of 3 · 20 results');
  await attr(page, 'page-size', '10');
  await expect(p.pagination).toHaveText('Page 1 of 2 · 20 results');
  await expect(p.items).toHaveCount(10);
});

test('an invalid page-size falls back to the default (8)', async ({ page }) => {
  const p = palette(page);
  await attr(page, 'page-size', '0');
  await open(page);
  await p.input.fill('many');
  await expect(p.pagination).toHaveText('Page 1 of 3 · 20 results');
});

test('removing page-size resets it to the default (8)', async ({ page }) => {
  const p = palette(page);
  await attr(page, 'page-size', '4');
  await open(page);
  await p.input.fill('many');
  await expect(p.pagination).toHaveText('Page 1 of 5 · 20 results');
  await attr(page, 'page-size', null);
  await expect(p.pagination).toHaveText('Page 1 of 3 · 20 results');
  await expect(p.items).toHaveCount(8);
});

test('removing display resets it to inline', async ({ page }) => {
  const p = palette(page);
  await attr(page, 'display', 'tokens');
  await open(page);
  await page.keyboard.type('/deploy ');
  await expect(p.input).toHaveValue('');
  await expect(p.tokens.locator('.pa-badge')).toHaveText(['/deploy']);
  await attr(page, 'display', null);
  await expect(p.input).toHaveValue('/deploy to ');
  await expect(p.tokens.locator('.pa-badge')).toHaveCount(0);
});

test('removing size drops the preset class', async ({ page }) => {
  const p = palette(page);
  await attr(page, 'size', 'xl');
  await expect(p.root).toHaveClass(/pa-command-palette--xl/);
  await attr(page, 'size', null);
  await expect(p.root).not.toHaveClass(/pa-command-palette--(sm|lg|xl)/);
});

test('removing usage-storage="none" brings the stars back', async ({ page }) => {
  const p = palette(page);
  await attr(page, 'usage-storage', 'none');
  await open(page);
  await expect(p.host.locator('.cp-star')).toHaveCount(0);
  await attr(page, 'usage-storage', null);
  await expect(p.host.locator('.cp-star').first()).toBeAttached();
});

test('an invalid size keeps the previous preset and fires input-rejected; removing it resets', async ({ page }) => {
  const p = palette(page);
  await page.evaluate(() => {
    (window as any).rejections = [];
    document.querySelector('web-command-palette')!.addEventListener('input-rejected', (e) => (window as any).rejections.push((e as CustomEvent).detail.configKey));
  });
  await attr(page, 'size', 'lg');
  await expect(p.root).toHaveClass(/pa-command-palette--lg/);
  await attr(page, 'size', 'huge');
  await expect.poll(() => page.evaluate(() => (window as any).rejections)).toEqual(['size']);
  expect(await p.host.evaluate((el) => (el as any).size)).toBe('lg');
  await expect(p.root).toHaveClass(/pa-command-palette--lg/);
  await attr(page, 'size', null);
  expect(await p.host.evaluate((el) => (el as any).size)).toBeNull();
  await expect(p.root).not.toHaveClass(/pa-command-palette--lg/);
});
