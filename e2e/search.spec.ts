import { expect, test } from '@playwright/test';
import { calls, events, load, open, palette } from './fixtures';

test('context search: empty query shows "Type to search X" and never calls the provider', async ({ page }) => {
  await load(page);
  const p = palette(page);
  await open(page);
  await page.keyboard.type(':p ');
  await expect(p.input).toHaveValue(':products ');
  await expect(p.context).toHaveText('Searching in Products');
  await expect(p.empty).toHaveText('Type to search Products');
  await page.keyboard.type('   ');
  await page.waitForTimeout(400);
  expect((await calls(page)).search).toEqual([]);
});

test('context search: entered from the home screen too, then searches non-empty queries only', async ({ page }) => {
  await load(page);
  const p = palette(page);
  await open(page);
  await p.items.filter({ hasText: 'Products' }).click();
  await expect(p.input).toHaveValue(':products ');
  await expect(p.empty).toHaveText('Type to search Products');
  await page.keyboard.type('ipad');
  await expect(p.titles.first()).toHaveText('products ipad 0');
  await expect(p.titles.first().locator('mark')).toHaveText('ipad');
  expect((await calls(page)).search).toEqual([{ scope: { contextId: 'products' }, query: 'ipad' }]);
  await page.keyboard.press('Enter');
  const sel = (await events(page)).find((e) => e.name === 'cp-select');
  expect(sel?.detail).toMatchObject({ item: { id: 'products-0' }, scope: { contextId: 'products' } });
  await expect(p.root).not.toHaveClass(/--active/);
});

test('global search prepends matching commands even with NO searchCallback', async ({ page }) => {
  await load(page, 'nosearch');
  const p = palette(page);
  await open(page);
  await page.keyboard.type('go');
  await expect(p.titles).toHaveText(['Go to Page']);
  await expect(p.items.first().locator('.pa-badge')).toHaveText('/go');
  await page.keyboard.press('Enter');
  await expect(p.input).toHaveValue('/go ');
});

test('global search: local matches first, then provider hits (debounced, one call)', async ({ page }) => {
  await load(page);
  const p = palette(page);
  await open(page);
  await page.keyboard.type('deploy');
  await expect(p.titles).toHaveText(['Deploy to Environment', 'Global deploy 0', 'Global deploy 1', 'Global deploy 2']);
  expect((await calls(page)).search).toEqual([{ scope: 'global', query: 'deploy' }]);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  const sel = (await events(page)).find((e) => e.name === 'cp-select');
  expect(sel?.detail).toMatchObject({ item: { id: 'Global-0' }, scope: 'global' });
});

test('list modes filter client-side', async ({ page }) => {
  await load(page);
  const p = palette(page);
  await open(page);
  await page.keyboard.type('/');
  await expect(p.titles).toHaveText(['Deploy to Environment', 'Go to Page', 'Reload Data']);
  await page.keyboard.type('rel');
  await expect(p.titles).toHaveText(['Reload Data']);
  await p.input.fill(':');
  await expect(p.titles).toHaveText(['Products', 'Users']);
  await page.keyboard.type('us');
  await expect(p.titles).toHaveText(['Users']);
  const c = await calls(page);
  expect(c.search).toEqual([]);
  expect(c.stepOptions).toEqual([]);
});
