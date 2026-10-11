import { expect, test } from '@playwright/test';
import { events, load, open, palette } from './fixtures';

test.beforeEach(async ({ page }) => load(page));

const panel = (page: import('@playwright/test').Page) => palette(page).host.locator('.cp-confirm');

test('a finished wizard shows ✓ Done with the answers; cp-complete fires at once, cp-close after the panel', async ({ page }) => {
  const p = palette(page);
  await open(page);
  await page.keyboard.type('/go us');
  await page.keyboard.press('Enter');

  // The dialog collapses to the one line: ✓ /go Users … Done.
  await expect(panel(page)).toBeVisible();
  await expect(panel(page).locator('.cp-confirm__title')).toHaveText('Done');
  await expect(panel(page).locator('.cp-confirm__body')).toHaveText('/go Users');
  await expect(panel(page).locator('.cp-confirm__answer')).toHaveText(['Users']);
  await expect(p.input).toBeHidden();
  await expect(p.footer).toBeHidden();
  await expect(panel(page)).toBeFocused();
  let names = (await events(page)).map((e) => e.name);
  expect(names).toContain('cp-complete');
  expect(names.filter((n) => n === 'cp-close')).toHaveLength(0);

  await expect(p.root).not.toHaveClass(/--active/, { timeout: 3000 });
  names = (await events(page)).map((e) => e.name);
  expect(names.at(-1)).toBe('cp-close');
});

test('any key dismisses it immediately; Ctrl+K during it opens a fresh palette', async ({ page }) => {
  const p = palette(page);
  await open(page);
  await page.keyboard.type('/reload');
  await page.keyboard.press('Enter');
  await expect(panel(page)).toBeVisible();
  await page.keyboard.press('x');
  await expect(p.root).not.toHaveClass(/--active/);

  await open(page);
  await page.keyboard.type('/reload');
  await page.keyboard.press('Enter');
  await expect(panel(page)).toBeVisible();
  await page.keyboard.press('Control+k');
  await expect(p.root).toHaveClass(/--active/);
  await expect(panel(page)).toBeHidden();
  await expect(p.input).toHaveValue('');
});

test('confirmation="false" closes right away', async ({ page }) => {
  const p = palette(page);
  await p.host.evaluate((el) => el.setAttribute('confirmation', 'false'));
  await open(page);
  await page.keyboard.type('/reload');
  await page.keyboard.press('Enter');
  await expect(p.root).not.toHaveClass(/--active/, { timeout: 300 });
});

test('renderConfirmationCallback: custom content, or false to skip', async ({ page }) => {
  const p = palette(page);
  await p.host.evaluate((el) => {
    (el as unknown as { renderConfirmationCallback: unknown }).renderConfirmationCallback = (ctx: { type: string; commandId?: string; sentence: string }) =>
      ctx.commandId === 'reload' ? false : `<b class="custom">Ran ${ctx.sentence}</b>`;
  });
  await open(page);
  await page.keyboard.type('/go ho');
  await page.keyboard.press('Enter');
  await expect(panel(page).locator('.custom')).toHaveText('Ran /go Home');

  await page.keyboard.press('Escape');
  await open(page);
  await page.keyboard.type('/reload');
  await page.keyboard.press('Enter');
  await expect(p.root).not.toHaveClass(/--active/, { timeout: 300 });
});
