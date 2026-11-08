/**
 * Helpers shared by the e2e specs (re-exported from `./fixtures`).
 */
import { expect, type Locator, type Page } from '@playwright/test';

/** Load the spec's fixture page `test/<area>.html` and wait for its `window.ready`. */
export async function load(page: Page, area: string): Promise<void> {
  await page.goto(`/test/${area}.html`);
  await page.waitForFunction(() => (window as unknown as { ready?: boolean }).ready === true);
}

/** The text of the `<pre data-testid="<area>-log">` event log (one `name:detail` line per event). */
export const logLines = async (page: Page, area: string): Promise<string[]> =>
  ((await page.getByTestId(`${area}-log`).textContent()) ?? '').split('\n').filter(Boolean);

/** Shadow-piercing locators into the palette. */
export function palette(page: Page, selector = 'web-command-palette#palette') {
  const host = page.locator(selector);
  return {
    host,
    root: host.locator('.pa-command-palette'),
    input: host.locator('.pa-command-palette__input'),
    context: host.locator('.pa-command-palette__context'),
    tokens: host.locator('.pa-command-palette__tokens'),
    items: host.locator('.pa-command-palette__item'),
    active: host.locator('.pa-command-palette__item--active'),
    titles: host.locator('.pa-command-palette__item-title'),
    empty: host.locator('.pa-command-palette__empty'),
    pagination: host.locator('.pa-command-palette__pagination'),
    footer: host.locator('.pa-command-palette__footer'),
    backdrop: host.locator('.pa-command-palette__backdrop'),
    container: host.locator('.pa-command-palette__container'),
  };
}

export async function open(page: Page): Promise<void> {
  await page.keyboard.press('Control+k');
  await expect(palette(page).root).toHaveClass(/pa-command-palette--active/);
}

export const events = (page: Page) =>
  page.evaluate(() => (window as unknown as { events: Array<{ name: string; detail: unknown }> }).events);

export const calls = (page: Page) =>
  page.evaluate(() => (window as unknown as { calls: { search: unknown[]; stepOptions: unknown[] } }).calls);

export async function activeTitle(page: Page): Promise<string> {
  return (await palette(page).active.locator('.pa-command-palette__item-title').textContent()) ?? '';
}

export async function hints(footer: Locator): Promise<string[]> {
  return footer
    .locator('.pa-command-palette__hint')
    .evaluateAll((els) => els.map((e) => Array.from(e.children, (c) => c.textContent?.trim()).join(' ')));
}

/**
 * The keycap the palette draws for Ctrl/⌘ + `letter`: `⌘E` on Apple platforms, `Ctrl E`
 * elsewhere — core's environment OS detection (the Playwright WebKit project reports a Mac UA).
 */
export async function chordCap(page: Page, letter: string): Promise<string> {
  const isApple = await page.evaluate(() => /macintosh|mac os x|iphone|ipad/i.test(navigator.userAgent));
  return isApple ? `⌘${letter.toUpperCase()}` : `Ctrl ${letter.toUpperCase()}`;
}
