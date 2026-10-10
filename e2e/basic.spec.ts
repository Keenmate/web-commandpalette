import { expect, test } from '@playwright/test';
import { events, load, open, palette } from './fixtures';

test.beforeEach(async ({ page }) => load(page));

test('Ctrl+K toggles the palette, focuses the input, fires cp-open/cp-close', async ({ page }) => {
  const p = palette(page);
  await expect(p.root).not.toHaveClass(/--active/);
  await open(page);
  await expect(p.input).toBeFocused();
  await expect(p.host).toHaveAttribute('open', '');
  await page.keyboard.press('Control+k');
  await expect(p.root).not.toHaveClass(/--active/);
  await expect(p.host).not.toHaveAttribute('open');
  const names = (await events(page)).map((e) => e.name);
  expect(names).toEqual(['cp-ready', 'cp-open', 'cp-close']);
});

test('home screen lists commands and contexts with keycaps', async ({ page }) => {
  const p = palette(page);
  await open(page);
  await expect(p.titles).toHaveText(['Deploy to Environment', 'Go to Page', 'Reload Data', 'Products', 'Users']);
  await expect(p.host.locator('.pa-command-palette__home-heading')).toHaveText(['Commands', 'Search']);
  await expect(p.items.first().locator('.pa-command-palette__key')).toHaveText(['g', 'd']);
});

test('Esc on the home screen and a backdrop click both close; focus returns to the opener', async ({ page }) => {
  const p = palette(page);
  await page.locator('#outside').focus();
  await open(page);
  await page.keyboard.press('Escape');
  await expect(p.root).not.toHaveClass(/--active/);
  await expect(page.locator('#outside')).toBeFocused();

  await page.locator('#opener').click();
  await expect(p.root).toHaveClass(/--active/);
  await p.backdrop.click({ position: { x: 10, y: 10 } });
  await expect(p.root).not.toHaveClass(/--active/);
});

test('locks body scroll while open', async ({ page }) => {
  await open(page);
  expect(await page.evaluate(() => document.body.style.overflow)).toBe('hidden');
  await page.keyboard.press('Escape');
  expect(await page.evaluate(() => document.body.style.overflow)).toBe('');
});

test('"g d" opens straight into the command; inert while typing in a field', async ({ page }) => {
  const p = palette(page);
  await page.locator('#outside').focus();
  await page.keyboard.press('g');
  await page.keyboard.press('d');
  await expect(p.root).not.toHaveClass(/--active/);
  await expect(page.locator('#outside')).toHaveValue('gd');

  await page.locator('body').click({ position: { x: 600, y: 600 } });
  await page.keyboard.press('g');
  await page.keyboard.press('d');
  await expect(p.root).toHaveClass(/--active/);
  await expect(p.input).toHaveValue('/deploy to ');
  await expect(p.context).toHaveText('Deploy to Environment');
});

test('an instant command fires cp-command and closes', async ({ page }) => {
  const p = palette(page);
  await open(page);
  await p.input.fill('/reload');
  await page.keyboard.press('Enter');
  await expect(p.root).not.toHaveClass(/--active/);
  const ev = (await events(page)).find((e) => e.name === 'cp-command');
  expect(ev?.detail).toEqual({ commandId: 'reload' });
});

test('clicking a row selects it and keeps focus in the input', async ({ page }) => {
  const p = palette(page);
  await open(page);
  await p.items.filter({ hasText: 'Go to Page' }).click();
  await expect(p.input).toHaveValue('/go ');
  await expect(p.input).toBeFocused();
  await p.items.filter({ hasText: 'Users' }).click();
  const ev = (await events(page)).find((e) => e.name === 'cp-complete');
  expect(ev?.detail).toEqual({ commandId: 'go', selections: [{ stepId: 'page', label: 'Users', value: '/users', isFreeText: false }] });
});

test('openWith() runs the query through the input pipeline', async ({ page }) => {
  const p = palette(page);
  await page.evaluate(() => (document.querySelector('web-command-palette') as unknown as { openWith(q: string): void }).openWith(':u '));
  await expect(p.input).toHaveValue(':users ');
  await expect(p.context).toHaveText('Searching in Users');
});

test('a11y wiring: dialog, combobox → listbox, aria-activedescendant follows the active row', async ({ page }) => {
  const p = palette(page);
  await open(page);
  await expect(p.container).toHaveAttribute('role', 'dialog');
  await expect(p.container).toHaveAttribute('aria-modal', 'true');
  await expect(p.input).toHaveAttribute('role', 'combobox');
  await expect(p.input).toHaveAttribute('aria-activedescendant', 'cp-item-0');
  await page.keyboard.press('ArrowDown');
  await expect(p.input).toHaveAttribute('aria-activedescendant', 'cp-item-1');
  await expect(p.items.nth(1)).toHaveAttribute('aria-selected', 'true');
});
