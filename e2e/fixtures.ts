import { expect, type Locator, type Page } from '@playwright/test';

/** Load the e2e fixture page (optionally with query flags like `theme`, `nosearch`). */
export async function load(page: Page, query = ''): Promise<void> {
  await page.goto(`/test/fixture.html${query ? `?${query}` : ''}`);
  await page.waitForFunction(() => (window as unknown as { ready?: boolean }).ready === true);
}

/** Shadow-piercing locators into the palette. */
export function palette(page: Page) {
  const host = page.locator('web-command-palette');
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
