import { expect, test, load, open, palette } from './fixtures';

test.beforeEach(async ({ page }) => load(page, 'icons'));

type IconPage = { iconCalls: string[]; iconContexts: Array<Record<string, unknown>> };
const iconCalls = (page: import('@playwright/test').Page) => page.evaluate(() => (window as unknown as IconPage).iconCalls);

test('item icons: the element renderIconCallback beats the page-wide one; null falls through to it', async ({ page }) => {
  const p = palette(page);
  await open(page);
  const icon = (title: string) => p.items.filter({ hasText: title }).locator('.cp__item-icon');
  await expect(icon('Own').locator('em.own-icon')).toHaveText('own-rocket');
  await expect(icon('Own').locator('.page-icon')).toHaveCount(0);
  await expect(icon('Shared').locator('b.page-icon')).toHaveText('shared-gear');
  const calls = await iconCalls(page);
  expect(calls).toContain('element:own-rocket');
  expect(calls).not.toContain('page:own-rocket');
  expect(calls).toContain('element:shared-gear');
  expect(calls).toContain('page:shared-gear');
  const ctx = await page.evaluate(() => (window as unknown as IconPage).iconContexts.find((c) => c.name === 'own-rocket'));
  expect(ctx).toEqual({ name: 'own-rocket', component: 'web-command-palette', prefix: 'cp', itemId: 'own', isElement: true });
});

test('item icons: a class list nobody claims renders an icon-font <i class="cp__icon …">', async ({ page }) => {
  const p = palette(page);
  await open(page);
  const i = p.items.filter({ hasText: 'Font' }).locator('.cp__item-icon i');
  await expect(i).toHaveCount(1);
  expect(await i.getAttribute('class')).toBe('cp__icon fa-solid fa-folder');
  await expect(i).toHaveAttribute('aria-hidden', 'true');
  expect(await i.evaluate((el) => getComputedStyle(el).flexShrink)).toBe('0');
});

test('item icons: a built-in name is never sent to a hook', async ({ page }) => {
  const p = palette(page);
  await open(page);
  await expect(p.items.filter({ hasText: 'Builtin' }).locator('.km-icon.cp__icon.cp__icon--search')).toHaveCount(1);
  const calls = await iconCalls(page);
  expect(calls.some((c) => c.endsWith(':search'))).toBe(false);
});

test('item icons: assigning renderIconCallback re-renders the rows', async ({ page }) => {
  const p = palette(page);
  await open(page);
  await page.evaluate(() => {
    (document.getElementById('palette') as HTMLElement & { renderIconCallback: unknown }).renderIconCallback = (name: string) => `<u class="swapped">${name}</u>`;
  });
  await expect(p.items.filter({ hasText: 'Shared' }).locator('u.swapped')).toHaveText('shared-gear');
  await expect(p.items.filter({ hasText: 'Builtin' }).locator('.km-icon.cp__icon--search')).toHaveCount(1);
});
