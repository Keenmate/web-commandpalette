import { events, expect, load, open, palette, test, type Page } from './fixtures';

/**
 * The imperative API (`el.*`, mirrored on `el.controller`): open / close / toggle /
 * reset / openWith / openFavorites / openRecent, `isOpen`, and live reassignment of
 * `commands` / `contexts` (element and controller). Fixture: test/api.html.
 */

type El = HTMLElement & {
  open(): void; close(): void; toggle(): void; reset(): void;
  openFavorites(): void; openRecent(): void;
  commands: unknown[]; contexts: unknown[]; isOpen: boolean;
  controller: { open(): void; close(): void; toggle(): void; isOpen: boolean; commands: unknown[]; contexts: unknown[] };
};

/** Assign `commands` / `contexts` through `el.controller` (the same property as on the element). */
const assignViaController = (page: Page, key: 'commands' | 'contexts', list: unknown[]) =>
  page.evaluate(([k, l]) => {
    (document.getElementById('palette') as unknown as El).controller[k as 'commands' | 'contexts'] = l as unknown[];
  }, [key, list] as const);

const call = (page: Page, method: string, ...args: unknown[]) =>
  page.evaluate(([m, a]) => {
    const el = document.getElementById('palette') as unknown as Record<string, (...x: unknown[]) => unknown>;
    return el[m as string](...(a as unknown[]));
  }, [method, args] as const);
const isOpen = (page: Page) => page.evaluate(() => (document.getElementById('palette') as unknown as El).isOpen);
const names = async (page: Page) => (await events(page)).map((e) => e.name).filter((n) => n !== 'ready');

test.beforeEach(async ({ page }) => {
  await load(page, 'api');
  await expect(palette(page).host).toHaveAttribute('ready', '');
});

test('open() / close() are idempotent; isOpen follows; each fires its event once', async ({ page }) => {
  const p = palette(page);
  expect(await isOpen(page)).toBe(false);
  await call(page, 'open');
  await call(page, 'open');
  await expect(p.root).toHaveClass(/--active/);
  expect(await isOpen(page)).toBe(true);
  await expect(p.input).toBeFocused();
  await call(page, 'close');
  await call(page, 'close');
  await expect(p.root).not.toHaveClass(/--active/);
  expect(await isOpen(page)).toBe(false);
  expect(await names(page)).toEqual(['open', 'close']);
});

test('toggle() alternates; the controller facade drives the same element', async ({ page }) => {
  const p = palette(page);
  await call(page, 'toggle');
  await expect(p.root).toHaveClass(/--active/);
  await call(page, 'toggle');
  await expect(p.root).not.toHaveClass(/--active/);
  await page.evaluate(() => (document.getElementById('palette') as unknown as El).controller.open());
  expect(await page.evaluate(() => (document.getElementById('palette') as unknown as El).controller.isOpen)).toBe(true);
  await page.evaluate(() => (document.getElementById('palette') as unknown as El).controller.toggle());
  expect(await isOpen(page)).toBe(false);
  expect(await names(page)).toEqual(['open', 'close', 'open', 'close']);
});

test('close() restores focus to where it was before open()', async ({ page }) => {
  await page.locator('#outside').focus();
  await call(page, 'open');
  await expect(palette(page).input).toBeFocused();
  await call(page, 'close');
  await expect(page.locator('#outside')).toBeFocused();
});

test('reset() returns to the home screen and stays open', async ({ page }) => {
  const p = palette(page);
  await call(page, 'openWith', '/go ');
  await expect(p.input).toHaveValue('/go ');
  await expect(p.titles).toHaveText(['Home', 'Users']);
  await call(page, 'reset');
  await expect(p.input).toHaveValue('');
  await expect(p.titles).toHaveText(['Deploy to Environment', 'Go to Page', 'Reload Data', 'Products', 'Users']);
  await expect(p.root).toHaveClass(/--active/);
  expect(await names(page)).toEqual(['open']);
});

test('openFavorites() / openRecent() open on the full lists (one open event)', async ({ page }) => {
  const p = palette(page);
  await open(page);
  await page.keyboard.press('Control+d'); // star "Deploy to Environment"
  await page.keyboard.press('Escape');
  await expect(p.root).not.toHaveClass(/--active/);

  await call(page, 'openFavorites');
  await expect(p.context).toHaveText('Favorites');
  await expect(p.titles).toHaveText(['Deploy to Environment']);
  await call(page, 'openRecent'); // while open: switches lists, no second open
  await expect(p.context).toHaveText('Recent');
  await expect(p.empty).toHaveText('Nothing used yet');
  await call(page, 'close');
  expect(await names(page)).toEqual(['open', 'close', 'open', 'close']);
});

test('commands reassigned while open re-render the home screen; so does controller.commands', async ({ page }) => {
  const p = palette(page);
  await open(page);
  await page.evaluate(() => {
    (document.getElementById('palette') as unknown as El).commands = [{ id: 'a', trigger: '/alpha', text: 'Alpha' }];
  });
  await expect(p.titles).toHaveText(['Alpha', 'Products', 'Users']);
  await assignViaController(page, 'commands', [{ id: 'b', trigger: '/beta', text: 'Beta' }, { id: 'c', trigger: '/gamma', text: 'Gamma' }]);
  expect(await page.evaluate(() => (document.getElementById('palette') as unknown as El).controller.commands.length)).toBe(2);
  await expect(p.titles).toHaveText(['Beta', 'Gamma', 'Products', 'Users']);
  // The new set is live for triggers too.
  await p.input.fill('/gam');
  await expect(p.titles).toHaveText(['Gamma']);
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await events(page)).find((e) => e.name === 'action')?.detail).toMatchObject({ id: 'c' });
});

test('contexts reassigned while open re-render; so does controller.contexts', async ({ page }) => {
  const p = palette(page);
  await open(page);
  await page.evaluate(() => {
    (document.getElementById('palette') as unknown as El).contexts = [{ id: 'orders', trigger: ':orders', text: 'Orders' }];
  });
  await expect(p.titles).toHaveText(['Deploy to Environment', 'Go to Page', 'Reload Data', 'Orders']);
  await assignViaController(page, 'contexts', [{ id: 'docs', trigger: ':docs', text: 'Docs' }]);
  await expect(p.titles.last()).toHaveText('Docs');
  await p.input.fill(':');
  await expect(p.titles).toHaveText(['Docs']);
});

test('commands reassigned while a wizard runs keep the current step usable', async ({ page }) => {
  const p = palette(page);
  await call(page, 'openWith', '/go ');
  await expect(p.titles).toHaveText(['Home', 'Users']);
  await assignViaController(page, 'commands', [{ id: 'reload', trigger: '/reload', text: 'Reload Data' }]);
  // No page error, the palette still answers the keyboard.
  await page.keyboard.press('Escape');
  await expect(p.root).toHaveClass(/--active/);
  await p.input.fill('');
  await expect(p.titles.first()).toHaveText('Reload Data');
});

test('the `open` attribute opens / closes the palette (CP-4)', async ({ page }) => {
  test.fail(true, 'NOTES.md #4');
  const p = palette(page);
  await p.host.evaluate((el) => el.setAttribute('open', ''));
  await expect(p.root).toHaveClass(/--active/, { timeout: 1000 });
  await p.host.evaluate((el) => el.removeAttribute('open'));
  await expect(p.root).not.toHaveClass(/--active/, { timeout: 1000 });
});
