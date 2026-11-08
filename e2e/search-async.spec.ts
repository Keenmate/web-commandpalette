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
  await p.host.evaluate((el) => el.setAttribute('search-debounce', '1000'));
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
  await expect(p.host.locator('.cp__loading')).toHaveCount(0);
  await expect(p.titles).toHaveText(['Go to Page']);
  await expect(p.host.locator('.cp__results')).not.toHaveClass(/--loading/);
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
  const results = p.host.locator('.cp__results');
  await p.input.fill('wait');
  await expect(p.host.locator('.cp__loading')).toBeVisible();
  await expect(p.host.locator('.cp__loader-slot')).toHaveAttribute('role', 'status');
  await expect(p.titles).toHaveText(['wait hit 0', 'wait hit 1']);
  await expect(p.host.locator('.cp__loading')).toHaveCount(0);

  await p.input.fill('go');
  await expect(p.titles).toHaveText(['Go to Page']);
  await expect(results).toHaveClass(/cp__results--loading/);
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

// ── Shared loader (core SPEC §12.14): instance renderLoadingCallback >
//    window.components.renderLoadingCallback > the default .cp__loader ──

test('loader: default .cp__loader with role=status + labels.searching, removed when results land', async ({ page }) => {
  const p = palette(page);
  await knobs(page, (w) => { w.delays.wait = 800; });
  await open(page);
  await p.input.fill('wait');
  const slot = p.host.locator('.cp__loader-slot');
  await expect(slot).toHaveAttribute('role', 'status');
  await expect(slot).toHaveAttribute('aria-label', 'Searching…');
  const loader = slot.locator('.cp__loader');
  await expect(loader).toHaveCount(1);
  await expect(loader).toHaveAttribute('aria-hidden', 'true');
  const style = await loader.evaluate((el) => {
    const cs = getComputedStyle(el);
    return { anim: cs.animationName, mask: cs.maskImage || (cs as unknown as { webkitMaskImage: string }).webkitMaskImage };
  });
  expect(style.anim).toBe('cp-loader-spin');
  expect(style.mask).toContain('url(');
  await expect(p.titles).toHaveText(['wait hit 0', 'wait hit 1']);
  await expect(p.host.locator('.cp__loader')).toHaveCount(0);
});

test('loader: aria-label follows labels.searching', async ({ page }) => {
  const p = palette(page);
  await knobs(page, (w) => { w.delays.wait = 800; });
  await p.host.evaluate((el) => { (el as unknown as { labels: object }).labels = { searching: 'Hledám…' }; });
  await open(page);
  await p.input.fill('wait');
  await expect(p.host.locator('.cp__loader-slot')).toHaveAttribute('aria-label', 'Hledám…');
});

test('loader: the page hook replaces the default; its cleanup runs on remove (results / close)', async ({ page }) => {
  const p = palette(page);
  await knobs(page, (w) => { w.delays.wait = 800; w.delays.slow = 5000; });
  await page.evaluate(() => {
    const w = window as unknown as Record<string, any>;
    w.loaderCtx = null;
    w.loaderCleaned = 0;
    w.components.renderLoadingCallback = (ctx: any) => {
      w.loaderCtx = { component: ctx.component, context: ctx.context, label: ctx.label, id: ctx.element.id };
      ctx.containerElement.insertAdjacentHTML('beforeend', '<span class="page-dots"></span>');
      return () => { w.loaderCleaned++; };
    };
  });
  await open(page);
  await p.input.fill('wait');
  await expect(p.host.locator('.cp__loader-slot .page-dots')).toHaveCount(1);
  await expect(p.host.locator('.cp__loader')).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).loaderCtx)).toEqual({
    component: 'web-command-palette', context: 'search', label: 'Searching…', id: 'palette',
  });
  await expect(p.titles).toHaveText(['wait hit 0', 'wait hit 1']);
  await expect(p.host.locator('.page-dots')).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).loaderCleaned)).toBe(1);

  // Closing while the loader shows runs the cleanup too.
  await p.input.fill('slow');
  await expect(p.host.locator('.page-dots')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect.poll(() => page.evaluate(() => (window as any).loaderCleaned)).toBe(2);
});

test('loader: the instance renderLoadingCallback beats the page hook', async ({ page }) => {
  const p = palette(page);
  await knobs(page, (w) => { w.delays.wait = 800; });
  await page.evaluate(() => {
    (window as any).components.renderLoadingCallback = ({ containerElement }: any) => {
      containerElement.insertAdjacentHTML('beforeend', '<span class="page-dots"></span>');
    };
  });
  await p.host.evaluate((el) => {
    (el as any).renderLoadingCallback = ({ containerElement }: any) => {
      containerElement.insertAdjacentHTML('beforeend', '<span class="instance-bar"></span>');
    };
  });
  await open(page);
  await p.input.fill('wait');
  await expect(p.host.locator('.cp__loader-slot .instance-bar')).toHaveCount(1);
  await expect(p.host.locator('.page-dots')).toHaveCount(0);
  await expect(p.host.locator('.cp__loader')).toHaveCount(0);
});
