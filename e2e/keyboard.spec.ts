import { expect, test, activeTitle, calls, chordCap, hints, load, open, palette } from './fixtures';

test.beforeEach(async ({ page }) => load(page, 'keyboard'));

test('↑↓ wrap, PgUp/PgDn clamp, Home/End jump', async ({ page }) => {
  await open(page);
  await page.keyboard.press('ArrowUp');
  expect(await activeTitle(page)).toBe('Users');
  await page.keyboard.press('ArrowDown');
  expect(await activeTitle(page)).toBe('Deploy to Environment');
  await page.keyboard.press('PageDown');
  expect(await activeTitle(page)).toBe('Users');
  await page.keyboard.press('PageUp');
  expect(await activeTitle(page)).toBe('Deploy to Environment');
  await page.keyboard.press('End');
  expect(await activeTitle(page)).toBe('Users');
  await page.keyboard.press('Home');
  expect(await activeTitle(page)).toBe('Deploy to Environment');
});

test('navigation never calls a provider', async ({ page }) => {
  const p = palette(page);
  await open(page);
  await p.input.fill('many');
  await expect(p.pagination).toBeVisible();
  const before = (await calls(page)).search.length;
  for (let i = 0; i < 10; i++) await page.keyboard.press('ArrowDown');
  await page.keyboard.press('End');
  expect((await calls(page)).search.length).toBe(before);
});

test('←→ page through results (client-side) when the caret is at the edge', async ({ page }) => {
  const p = palette(page);
  await open(page);
  await p.input.fill('many');
  await expect(p.pagination).toHaveText('Page 1 of 3 · 20 results');
  expect(await hints(p.footer)).toContain('←→ Pages');
  await page.keyboard.press('ArrowRight');
  await expect(p.pagination).toHaveText('Page 2 of 3 · 20 results');
  await expect(p.titles.first()).toHaveText('Global many 8');
  await page.keyboard.press('ArrowLeft'); // caret mid-text → normal caret move, no paging
  await expect(p.pagination).toHaveText('Page 2 of 3 · 20 results');
  await page.keyboard.press('ArrowRight'); // caret back to the end
  await page.keyboard.press('ArrowRight');
  await expect(p.pagination).toHaveText('Page 3 of 3 · 20 results');
  await p.input.evaluate((el: HTMLInputElement) => el.setSelectionRange(0, 0));
  await page.keyboard.press('ArrowLeft'); // caret at 0 → previous page
  await expect(p.pagination).toHaveText('Page 2 of 3 · 20 results');
  expect((await calls(page)).search.length).toBe(1);
});

test('Esc steps back in a step / context search, else closes', async ({ page }) => {
  const p = palette(page);
  await open(page);
  await p.input.fill('/deploy ');
  await expect(p.input).toHaveValue('/deploy to ');
  await page.keyboard.press('Enter'); // Production
  await expect(p.input).toHaveValue('/deploy to Production branch ');
  await page.keyboard.press('Escape');
  await expect(p.input).toHaveValue('/deploy to ');
  await page.keyboard.press('Escape');
  await expect(p.input).toHaveValue('/');
  await expect(p.context).toHaveText('Commands');
  await page.keyboard.press('Escape');
  await expect(p.root).not.toHaveClass(/--active/);
});

test('Backspace at the locked prefix steps back; typed text deletes normally', async ({ page }) => {
  const p = palette(page);
  await open(page);
  await p.input.fill(':p ');
  await expect(p.input).toHaveValue(':products ');
  await page.keyboard.type('ab');
  await page.keyboard.press('Backspace');
  await expect(p.input).toHaveValue(':products a');
  await page.keyboard.press('Backspace');
  await expect(p.input).toHaveValue(':products ');
  await page.keyboard.press('Backspace');
  await expect(p.input).toHaveValue(':');
  await expect(p.context).toHaveText('Search contexts');
});

test('footer hints are mode-aware', async ({ page }) => {
  const p = palette(page);
  await open(page);
  // The home row (a command) is starrable → the favorite hint shows.
  expect(await hints(p.footer)).toEqual(['↑↓ Navigate', '↵ Select', 'Esc Close', `${await chordCap(page, 'd')} Add to favorites`]);
  await p.input.fill('/go ');
  // Options can't be starred; in a wizard Tab moves to the next step.
  expect(await hints(p.footer)).toEqual(['↑↓ Navigate', 'Tab Next', '↵ Select', '⌫ Back', 'Esc Back']);
});

test('Tab selects like Enter and keeps focus in the palette', async ({ page }) => {
  const p = palette(page);
  await open(page);
  await page.keyboard.press('Tab');
  await expect(p.input).toHaveValue('/deploy to ');
  await expect(p.input).toBeFocused();
});

test('the active row scrolls the results list only (core scrollIntoContainer, no scrollIntoView)', async ({ page }) => {
  const p = palette(page);
  await page.evaluate(() => {
    (window as any).intoView = 0;
    const orig = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function (...args: any[]) { (window as any).intoView++; return orig.apply(this, args as any); };
  });
  await p.host.evaluate((el) => el.setAttribute('page-size', '20'));
  await open(page);
  await p.input.fill('many');
  await expect(p.items).toHaveCount(20);
  const results = p.host.locator('.cp__results');
  for (let i = 0; i < 19; i++) await page.keyboard.press('ArrowDown');
  await expect(p.active.locator('.cp__item-title')).toHaveText('Global many 19');
  const box = await results.evaluate((r) => {
    const a = r.querySelector('.cp__item--active')!.getBoundingClientRect();
    const c = r.getBoundingClientRect();
    return { scrolled: r.scrollTop, inside: a.bottom <= c.bottom + 1 && a.top >= c.top - 1, overflow: r.scrollHeight > r.clientHeight };
  });
  expect(box.overflow).toBe(true);
  expect(box.scrolled).toBeGreaterThan(0);
  expect(box.inside).toBe(true);
  expect(await page.evaluate(() => (window as any).intoView)).toBe(0);
});
