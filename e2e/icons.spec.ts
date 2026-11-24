import { expect, test, load, open, palette, activeTitle } from './fixtures';

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
  await expect(p.items.filter({ hasText: 'Shared' }).locator('.cp__item-icon u.swapped')).toHaveText('shared-gear');
  await expect(p.items.filter({ hasText: 'Builtin' }).locator('.km-icon.cp__icon--search')).toHaveCount(1);
});

test('item icons: a later page-wide renderIconCallback repaints an open palette, keeping query, active row and scroll (C-CA-40)', async ({ page }) => {
  const p = palette(page);
  await page.evaluate(() => {
    const el = document.getElementById('palette') as HTMLElement & { commands: unknown[]; renderIconCallback: unknown };
    el.renderIconCallback = null;
    (window as unknown as { components: { renderIconCallback: unknown } }).components.renderIconCallback = null;
    el.commands = Array.from({ length: 30 }, (_, i) => ({ id: `cmd${i}`, trigger: `/cmd${i}`, text: `Command ${i}`, icon: 'late-icon' }));
  });
  await open(page);
  await p.input.fill('/cmd');
  await expect(p.items).toHaveCount(30);
  await expect(p.items.locator('[data-test-icon]')).toHaveCount(0);
  for (let i = 0; i < 12; i++) await page.keyboard.press('ArrowDown');
  const before = await activeTitle(page);
  const results = p.host.locator('.cp__results');
  const top = await results.evaluate((el) => el.scrollTop);
  expect(top).toBeGreaterThan(0);

  await page.evaluate(() => {
    (window as unknown as { components: { renderIconCallback: unknown } }).components.renderIconCallback = (name: string) => (name === 'late-icon' ? '<b data-test-icon>x</b>' : null);
  });
  await expect(p.items.locator('[data-test-icon]')).toHaveCount(30);
  await expect(p.root).toHaveClass(/cp--active/);
  await expect(p.input).toHaveValue('/cmd');
  expect(await activeTitle(page)).toBe(before);
  expect(await results.evaluate((el) => el.scrollTop)).toBe(top);
  await page.evaluate(() => { (window as unknown as { components: { renderIconCallback: unknown } }).components.renderIconCallback = null; });
});

/** The palette's own icons by name (C-CA-42): star / starFilled / removeToken / done, through core renderIcon `defaults`. */
test.describe('own icons (icons map)', () => {
  const clearHooks = (page: import('@playwright/test').Page) => page.evaluate(() => {
    (document.getElementById('palette') as HTMLElement & { renderIconCallback: unknown }).renderIconCallback = null;
    (window as unknown as { components: { renderIconCallback: unknown } }).components.renderIconCallback = null;
  });

  test('a hook sees the own names (none is built-in); unclaimed, the masked glyph draws', async ({ page }) => {
    const p = palette(page);
    await open(page);
    // The fixture's page hook answers every name it is asked: it draws the star too.
    expect(await iconCalls(page)).toContain('element:star');
    await expect(p.host.locator('.cp__star .page-icon').first()).toHaveText('star');
    await clearHooks(page);
    await expect(p.host.locator('.cp__star .km-icon.cp__icon--star').first()).toBeAttached();
  });

  test('el.icons replaces an own icon in place (mode, query, active row kept); removing it restores the glyph', async ({ page }) => {
    const p = palette(page);
    await clearHooks(page);
    await open(page);
    await p.input.fill('/');
    await page.keyboard.press('ArrowDown');
    const before = await activeTitle(page);
    await p.host.evaluate((el) => { (el as unknown as { icons: unknown }).icons = { star: '<b class="my-star">*</b>' }; });
    await expect(p.host.locator('.cp__star .my-star').first()).toBeAttached();
    await expect(p.host.locator('.cp__star .cp__icon--star')).toHaveCount(0);
    await expect(p.input).toHaveValue('/');
    expect(await activeTitle(page)).toBe(before);
    await p.host.evaluate((el) => { (el as unknown as { icons: unknown }).icons = undefined; });
    await expect(p.host.locator('.cp__star .cp__icon--star').first()).toBeAttached();
  });

  test('icons JSON attribute + page-wide window.components.icons (tag key first) reach the feedback ✓', async ({ page }) => {
    const p = palette(page);
    await clearHooks(page);
    await page.evaluate(() => {
      (window as unknown as { components: { icons: unknown } }).components.icons = { 'web-command-palette.done': 'fa-solid fa-check', done: 'ignored' };
    });
    await p.host.evaluate((el) => el.setAttribute('icons', JSON.stringify({ starFilled: 'fa-solid fa-star' })));
    await p.host.evaluate((el) => el.setAttribute('feedback-duration', '60000'));
    await open(page);
    await p.input.fill('/builtin');
    await p.input.press('Enter');
    await expect(p.host.locator('.cp__confirm-check i.cp__icon.fa-solid.fa-check')).toHaveCount(1);
    // A later page-wide change repaints the line's ✓ in place.
    await page.evaluate(() => { (window as unknown as { components: { icons: unknown } }).components.icons = null; });
    await expect(p.host.locator('.cp__confirm-check .km-icon.cp__icon--check')).toHaveCount(1);
  });
});
