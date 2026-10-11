import { expect, test } from '@playwright/test';
import { events, load, open, palette } from './fixtures';

test.beforeEach(async ({ page }) => load(page));

/** Home section headings (the label only, not the "+N · Ctrl F" button). */
const headings = (page: import('@playwright/test').Page) =>
  palette(page).host.locator('.pa-command-palette__home-heading > span:first-child').allTextContents();

test('a completed run shows under Recent (persisted) and Enter, Enter replays it', async ({ page }) => {
  const p = palette(page);
  await open(page);
  await page.keyboard.type('/go us');
  await page.keyboard.press('Enter');
  await expect(p.root).not.toHaveClass(/--active/);

  await page.reload();
  await page.waitForFunction(() => (window as unknown as { ready?: boolean }).ready === true);
  await open(page);
  expect(await headings(page)).toEqual(['Recent', 'Commands', 'Search']);
  await expect(p.active.locator('.pa-command-palette__item-title')).toHaveText('/go Users');

  await page.keyboard.press('Enter'); // open the run: remembered answer first
  await expect(p.titles.first()).toHaveText('Users');
  await expect(p.footer).toContainText('Run');
  await page.keyboard.press('Enter'); // run it
  const done = (await events(page)).filter((e) => e.name === 'cp-complete');
  expect(done.at(-1)?.detail).toMatchObject({ commandId: 'go', selections: [{ stepId: 'page', label: 'Users' }] });
});

test('Ctrl+D and the star button toggle favorites', async ({ page }) => {
  const p = palette(page);
  await open(page);
  await expect(p.active.locator('.pa-command-palette__item-title')).toHaveText('Deploy to Environment');
  await page.keyboard.press('Control+d');
  expect(await headings(page)).toEqual(['Favorites', 'Commands', 'Search']);
  await expect(p.host.locator('.cp-star--on')).toHaveCount(2); // the favorite row + the command row

  await p.host.locator('.cp-star--on').first().click();
  expect(await headings(page)).toEqual(['Commands', 'Search']);
  await expect(p.input).toBeFocused();
  await expect(p.root).toHaveClass(/--active/);
});

test('usage-storage="none" hides stars and the remembered sections', async ({ page }) => {
  const p = palette(page);
  await p.host.evaluate((el) => el.setAttribute('usage-storage', 'none'));
  await open(page);
  await page.keyboard.type('/reload');
  await page.keyboard.press('Enter');
  await open(page);
  expect(await headings(page)).toEqual(['Commands', 'Search']);
  await expect(p.host.locator('.cp-star')).toHaveCount(0);
});

test('Ctrl+F / Ctrl+R show the full lists; the same chord or Esc goes home', async ({ page }) => {
  const p = palette(page);
  await open(page);
  await page.keyboard.press('Control+d'); // star "Deploy to Environment"
  await page.keyboard.press('Control+f');
  await expect(p.context).toHaveText('Favorites');
  await expect(p.titles).toHaveText(['Deploy to Environment']);
  await page.keyboard.press('Control+f');
  expect(await headings(page)).toEqual(['Favorites', 'Commands', 'Search']);

  await page.keyboard.press('Control+r');
  await expect(p.context).toHaveText('Recent');
  await expect(p.empty).toHaveText('Nothing used yet');
  await page.keyboard.press('Escape');
  await expect(p.root).toHaveClass(/--active/);
  expect(await headings(page)).toEqual(['Favorites', 'Commands', 'Search']);
});

test('`g f` opens the palette on favorites; the heading button opens the full list', async ({ page }) => {
  const p = palette(page);
  await open(page);
  await page.keyboard.press('Control+d');
  await page.keyboard.press('Escape');
  await expect(p.root).not.toHaveClass(/--active/);

  await page.keyboard.press('g');
  await page.keyboard.press('f');
  await expect(p.root).toHaveClass(/--active/);
  await expect(p.context).toHaveText('Favorites');

  await page.keyboard.press('Escape'); // back home
  await p.host.locator('.cp-more[data-view="favorites"]').click();
  await expect(p.context).toHaveText('Favorites');
});

test('favorites-key="" disables Ctrl+F (no list, no keycap in the heading)', async ({ page }) => {
  const p = palette(page);
  await p.host.evaluate((el) => el.setAttribute('favorites-key', ''));
  await open(page);
  await page.keyboard.press('Control+d');
  await expect(p.host.locator('.cp-more[data-view="favorites"]')).toHaveCount(0);
});

test('font sizes follow --base-font-size-* (A)', async ({ page }) => {
  const p = palette(page);
  await page.evaluate(() => document.documentElement.style.setProperty('--base-font-size-base', '1.2'));
  await open(page);
  expect(await p.input.evaluate((el) => getComputedStyle(el).fontSize)).toBe('12px');
});
