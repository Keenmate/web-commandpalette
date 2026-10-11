import { expect, test } from '@playwright/test';
import { load, open, palette } from './fixtures';

const style = (loc: ReturnType<typeof palette>['container'], prop: string) =>
  loc.evaluate((el, p) => getComputedStyle(el).getPropertyValue(p), prop);

test('unthemed: core defaults apply via var() fallbacks at a 10px rem', async ({ page }) => {
  await load(page);
  const p = palette(page);
  await open(page);
  expect(await style(p.container, 'max-width')).toBe('608px'); // 60.8rem × 10px
  expect(await style(p.container, 'background-color')).toBe('rgb(255, 255, 255)');
  expect(await style(p.input, 'font-size')).toBe('16px');
});

test('a host theme on :root pierces the shadow DOM (--base-* + --base-rem)', async ({ page }) => {
  await load(page, 'theme');
  const p = palette(page);
  await open(page);
  expect(await style(p.container, 'max-width')).toBe(`${60.8 * 16}px`);
  // The active row's accent-tinted context pill follows --base-accent-color.
  await p.input.fill('/');
  expect(await style(p.context, 'color')).toBe('rgb(255, 0, 128)');
});

test('component knobs: --cp-width on the host, and size presets', async ({ page }) => {
  await load(page);
  const p = palette(page);
  await p.host.evaluate((el) => (el as HTMLElement).style.setProperty('--cp-width', '500px'));
  await open(page);
  expect(await style(p.container, 'max-width')).toBe('500px');
  await p.host.evaluate((el) => {
    (el as HTMLElement).style.removeProperty('--cp-width');
    el.setAttribute('size', 'sm');
  });
  await expect(p.root).toHaveClass(/pa-command-palette--sm/);
  expect(await style(p.container, 'max-width')).toBe('480px');
});
