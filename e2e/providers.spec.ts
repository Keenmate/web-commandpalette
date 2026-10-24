import { calls, expect, load, open, palette, test, type Page } from './fixtures';

/**
 * Provider precedence: a context's own `searchCallback` and a step's own
 * `getOptionsCallback` win over the element-level callbacks; everything else still
 * goes to the element's. Fixture: test/providers.html (`window.own` logs the overrides,
 * `window.calls` the element-level providers).
 */

type Own = { search: Array<{ scope: unknown; term: string }>; options: Array<{ commandId: string; stepId: string; term: string }> };
const own = (page: Page) => page.evaluate(() => (window as unknown as { own: Own }).own);

test.beforeEach(async ({ page }) => load(page, 'providers'));

test("a context's own searchCallback overrides the element callback for that context only", async ({ page }) => {
  const p = palette(page);
  await open(page);
  await p.input.fill(':tickets bug');
  await expect(p.titles).toHaveText(['Ticket bug']);
  expect((await own(page)).search).toEqual([{ scope: { contextId: 'tickets' }, term: 'bug' }]);
  expect((await calls(page)).search).toEqual([]);

  // Another context (no own callback) uses the element's.
  await p.input.fill(':products ipad');
  await expect(p.titles.first()).toHaveText('products ipad 0');
  expect((await calls(page)).search).toEqual([{ scope: { contextId: 'products' }, term: 'ipad' }]);
  expect((await own(page)).search).toHaveLength(1);
});

test("a step's own getOptionsCallback overrides getStepOptionsCallback for that step only", async ({ page }) => {
  const p = palette(page);
  await open(page);
  await p.input.fill('/assign ');
  await expect(p.titles).toHaveText(['Own option 1', 'Own option 2']);
  expect((await own(page)).options).toEqual([{ commandId: 'assign', stepId: 'who', term: '' }]);
  expect((await calls(page)).stepOptions).toEqual([]);

  await page.keyboard.press('Enter');
  await expect(p.input).toHaveValue('/assign Own option 1 on ');
  // The next step has no own callback → the element's getStepOptionsCallback.
  await expect(p.titles).toHaveText(['main', 'feature/x']);
  expect(((await calls(page)).stepOptions as Array<{ stepId: string }>).map((c) => c.stepId)).toContain('branch');
});
