import { expect, load, open, palette, test, type Page } from './fixtures';

/**
 * Async search plumbing: superseded requests, failing providers, the loading state
 * and the debounce. Fixture: test/search-async.html — a provider whose latency /
 * failure is set per term (`window.delays`, `window.rejectTerms`, `window.throwTerms`).
 */

type Win = {
  calls: Array<{ term: string; at: number }>;
  signals: AbortSignal[];
  delays: Record<string, number>;
  rejectTerms: string[];
  throwTerms: string[];
};

const terms = (page: Page) => page.evaluate(() => (window as unknown as Win).calls.map((c) => c.term));
const aborted = (page: Page, i: number) => page.evaluate((n) => (window as unknown as Win).signals[n]?.aborted, i);
const knobs = (page: Page, fn: (w: Win) => void) => page.evaluate(`(${fn.toString()})(window)`);

test.beforeEach(async ({ page }) => load(page, 'search-async'));

test('race: slow first, fast second → only the second renders; the first signal is aborted', async ({ page }) => {
  const p = palette(page);
  await knobs(page, (w) => { w.delays.slow = 600; w.delays.fast = 20; });
  await open(page);
  await p.input.fill('slow');
  await expect.poll(() => terms(page)).toEqual(['slow']);
  await p.input.fill('fast');
  await expect(p.titles).toHaveText(['fast hit 0', 'fast hit 1']);
  expect(await terms(page)).toEqual(['slow', 'fast']);
  expect(await aborted(page, 0)).toBe(true);
  expect(await aborted(page, 1)).toBe(false);
  // The slow answer arrives later and must not overwrite the live list.
  await page.waitForTimeout(700);
  await expect(p.titles).toHaveText(['fast hit 0', 'fast hit 1']);
});

test('a request superseded during the debounce never reaches the provider', async ({ page }) => {
  const p = palette(page);
  await p.host.evaluate((el) => el.setAttribute('search-debounce', '300'));
  await open(page);
  await p.input.fill('first');
  await page.waitForTimeout(100);
  await p.input.fill('second');
  await expect(p.titles).toHaveText(['second hit 0', 'second hit 1']);
  expect(await terms(page)).toEqual(['second']);
});

test('closing the palette aborts an in-flight request', async ({ page }) => {
  const p = palette(page);
  await knobs(page, (w) => { w.delays.slow = 600; });
  await open(page);
  await p.input.fill('slow');
  await expect.poll(() => terms(page)).toEqual(['slow']);
  await page.keyboard.press('Escape');
  await expect(p.root).not.toHaveClass(/--active/);
  expect(await aborted(page, 0)).toBe(true);
});

test('a rejecting provider (CP-2): local matches stay, the palette stays usable, no page error', async ({ page }) => {
  const p = palette(page);
  await knobs(page, (w) => { w.rejectTerms.push('go', 'nothing'); });
  await open(page);
  // Global search: the local command match renders; the failed provider adds nothing.
  await p.input.fill('go');
  await expect.poll(() => terms(page)).toEqual(['go']);
  await expect(p.host.locator('.pa-command-palette__loader')).toHaveCount(0);
  await expect(p.titles).toHaveText(['Go to Page']);
  await expect(p.host.locator('.pa-command-palette__results')).not.toHaveClass(/--loading/);
  // No local match: today a failure reads as the ordinary empty text (CP-2, NOTES.md #2).
  await p.input.fill('nothing');
  await expect(p.empty).toHaveText('No results found');
  // Still usable: the next search works.
  await p.input.fill('fine');
  await expect(p.titles).toHaveText(['fine hit 0', 'fine hit 1']);
  await page.keyboard.press('Enter');
  await expect(p.root).not.toHaveClass(/--active/);
});

test('a provider that throws synchronously is handled like a rejection', async ({ page }) => {
  const p = palette(page);
  await knobs(page, (w) => { w.throwTerms.push('boom'); });
  await open(page);
  await p.input.fill(':p boom');
  await expect(p.input).toHaveValue(':products boom');
  await expect.poll(() => terms(page)).toEqual(['boom']);
  await expect(p.empty).toHaveText('No results found');
  await page.keyboard.type('x');
  await expect(p.titles).toHaveText(['boomx hit 0', 'boomx hit 1']);
});

test('loading state: a loader while nothing is shown, a veil over local matches', async ({ page }) => {
  const p = palette(page);
  await knobs(page, (w) => { w.delays.wait = 800; w.delays.go = 800; });
  await open(page);
  const results = p.host.locator('.pa-command-palette__results');
  await p.input.fill('wait');
  await expect(p.host.locator('.pa-command-palette__loader')).toBeVisible();
  await expect(p.host.locator('.pa-command-palette__loader')).toHaveAttribute('role', 'status');
  await expect(p.titles).toHaveText(['wait hit 0', 'wait hit 1']);
  await expect(p.host.locator('.pa-command-palette__loader')).toHaveCount(0);

  await p.input.fill('go');
  await expect(p.titles).toHaveText(['Go to Page']);
  await expect(results).toHaveClass(/pa-command-palette__results--loading/);
  await expect(p.titles).toHaveText(['Go to Page', 'go hit 0', 'go hit 1']);
  await expect(results).not.toHaveClass(/--loading/);
});

test('search-debounce="0" calls per keystroke; "500" once after typing stops', async ({ page }) => {
  const p = palette(page);
  await p.host.evaluate((el) => el.setAttribute('search-debounce', '0'));
  await open(page);
  await page.keyboard.type('abc', { delay: 60 });
  await expect.poll(() => terms(page)).toEqual(['a', 'ab', 'abc']);

  await p.input.fill('');
  await knobs(page, (w) => { w.calls.length = 0; });
  await p.host.evaluate((el) => el.setAttribute('search-debounce', '500'));
  await page.keyboard.type('xyz', { delay: 60 });
  await page.waitForTimeout(250);
  expect(await terms(page)).toEqual([]);
  await expect.poll(() => terms(page), { timeout: 2000 }).toEqual(['xyz']);
  await expect(p.titles).toHaveText(['xyz hit 0', 'xyz hit 1']);
});
