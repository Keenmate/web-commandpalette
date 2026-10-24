import { expect, load, open, palette, test } from './fixtures';

/**
 * Search results with `group` render under headings, clustered in first-appearance
 * order (ungrouped rows keep their bucket's place). Fixture: test/groups.html — the
 * provider returns Docs, People, Docs, (none), People.
 */

test.beforeEach(async ({ page }) => load(page, 'groups'));

test('group headings in first-appearance order, rows clustered under them', async ({ page }) => {
  const p = palette(page);
  await open(page);
  await p.input.fill('q');
  await expect(p.titles).toHaveText(['q doc A', 'q doc C', 'q person B', 'q person E', 'q loose D']);
  const results = p.host.locator('.pa-command-palette__results');
  await expect(results.locator('.pa-command-palette__home-heading > span:first-child')).toHaveText(['Docs', 'People']);
  await expect(results.locator('.pa-command-palette__home-section[aria-label="Docs"] .pa-command-palette__item-title')).toHaveText(['q doc A', 'q doc C']);
  await expect(results.locator('.pa-command-palette__home-section[aria-label="People"] .pa-command-palette__item-title')).toHaveText(['q person B', 'q person E']);
});

test('keyboard order follows the clustered order', async ({ page }) => {
  const p = palette(page);
  await open(page);
  await p.input.fill('q');
  await expect(p.titles).toHaveCount(5);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await expect(p.active.locator('.pa-command-palette__item-title')).toHaveText('q person B');
  await page.keyboard.press('Enter');
  await expect.poll(() => page.evaluate(() => (window as unknown as { events: Array<{ name: string; detail: { item?: { id: string } } }> }).events.find((e) => e.name === 'select')?.detail.item?.id)).toBe('b');
});
