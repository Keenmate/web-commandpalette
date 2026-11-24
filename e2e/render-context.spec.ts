import { expect, load, open, palette, test } from './fixtures';

/**
 * Render-callback ctx (web-treeview aea0d30 model): every render / display callback ctx carries `labels`
 * (core createLabelsView), and a change of `labels` / `translateCallback` / `locale` / the page-wide locale re-runs
 * the shown ones IN PLACE — the open palette keeps its mode, query and active row; no provider is called again.
 * Fixture: test/render-context.html (the `reload` command's getTextCallback, renderFeedbackCallback and
 * getCustomStylesCallback all print ctx.labels).
 */

type Calls = { text: number; feedback: number; styles: number; search: unknown[]; stepCtx: { hasLabels: boolean; keys: string[] }[] };
const calls = (page: import('@playwright/test').Page) => page.evaluate(() => (window as unknown as { calls: Calls }).calls);
const setLabels = (page: import('@playwright/test').Page, labels: Record<string, string> | null) =>
  palette(page).host.evaluate((el, l) => { (el as unknown as { labels: unknown }).labels = l; }, labels);
const reloadRow = (page: import('@playwright/test').Page) =>
  palette(page).titles.filter({ hasText: ': reload' });

test.beforeEach(async ({ page }) => load(page, 'render-context'));

test('command get*Callback: ctx.labels; a labels change re-runs it on the home screen, active row kept', async ({ page }) => {
  const p = palette(page);
  await open(page);
  await expect(reloadRow(page)).toHaveText('Commands: reload');
  await p.input.press('ArrowDown');
  const active = await p.active.getAttribute('id');
  await setLabels(page, { 'headers.commands': 'Příkazy' });
  await expect(reloadRow(page)).toHaveText('Příkazy: reload');
  await expect(p.root).toHaveClass(/cp--active/);
  expect(await p.active.getAttribute('id')).toBe(active);
});

test('command list (/) and global search: rows re-run in place, query kept, no new search', async ({ page }) => {
  const p = palette(page);
  await open(page);
  await p.input.fill('/rel');
  await expect(reloadRow(page)).toHaveText('Commands: reload');
  await setLabels(page, { 'headers.commands': 'Befehle' });
  await expect(reloadRow(page)).toHaveText('Befehle: reload');
  await expect(p.input).toHaveValue('/rel');

  await p.input.fill('reload'); // global search: the matching commands are prepended to the results
  await expect(reloadRow(page)).toHaveText('Befehle: reload');
  await expect.poll(async () => (await calls(page)).search.length).toBeGreaterThan(0);
  await expect(p.titles.filter({ hasText: 'Global reload 0' })).toHaveCount(1);
  const searches = (await calls(page)).search.length;
  await setLabels(page, { 'headers.commands': 'Příkazy' });
  await expect(reloadRow(page)).toHaveText('Příkazy: reload');
  await expect(p.titles.filter({ hasText: 'Global reload 0' })).toHaveCount(1); // results kept
  await expect(p.input).toHaveValue('reload');
  expect((await calls(page)).search.length).toBe(searches);
});

test('translateCallback, locale and the page-wide locale re-run the rows too', async ({ page }) => {
  const p = palette(page);
  await open(page);
  await p.host.evaluate((el) => {
    (el as unknown as { translateCallback: unknown }).translateCallback = (ctx: { key: string }) =>
      ctx.key === 'web-command-palette.headers.commands' ? 'Übersetzt' : null;
  });
  await expect(reloadRow(page)).toHaveText('Übersetzt: reload');
  await p.host.evaluate((el) => { (el as unknown as { translateCallback: unknown }).translateCallback = null; });
  await expect(reloadRow(page)).toHaveText('Commands: reload');
  await page.evaluate(() => {
    (window as unknown as { components: { locale: unknown } }).components.locale = { labels: { 'web-command-palette.headers.commands': 'Stránka' } };
  });
  await expect(reloadRow(page)).toHaveText('Stránka: reload');
  await expect(p.root).toHaveClass(/cp--active/);
  await page.evaluate(() => { (window as unknown as { components: { locale: unknown } }).components.locale = null; });
  await expect(reloadRow(page)).toHaveText('Commands: reload');
});

test('renderFeedbackCallback: ctx.labels, re-run in place while the line shows', async ({ page }) => {
  const p = palette(page);
  await open(page);
  await p.input.fill('/reload');
  await p.input.press('Enter');
  const body = p.host.locator('.cp__confirm-body');
  await expect(body).toHaveText('Done → /reload');
  await setLabels(page, { 'headers.done': 'Hotovo' });
  await expect(body).toHaveText('Hotovo → /reload');
  await expect(p.host.locator('.cp__confirm-title')).toHaveText('Hotovo');
  await expect(p.root).toHaveClass(/cp--active/); // still the same feedback line
});

test('getCustomStylesCallback: ctx.labels, re-run on a labels change', async ({ page }) => {
  const style = () => palette(page).host.evaluate((el) => el.shadowRoot!.querySelector('.cp-custom-styles')?.textContent ?? '');
  await expect.poll(style).toContain('/* Commands */');
  await setLabels(page, { 'headers.commands': 'Příkazy' });
  await expect.poll(style).toContain('/* Příkazy */');
});

test('step options ctx carries labels, non-enumerable (the ctx stays plain JSON)', async ({ page }) => {
  const p = palette(page);
  await open(page);
  await p.input.fill('/deploy ');
  await p.input.press('Enter'); // Production
  await expect.poll(async () => (await calls(page)).stepCtx.length).toBeGreaterThan(0);
  const [first] = (await calls(page)).stepCtx;
  expect(first.hasLabels).toBe(true);
  expect(first.keys).not.toContain('labels');
});
