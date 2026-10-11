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

test('theme gallery (TH01): each card opens its own themed instance; CSS shown matches the source', async ({ page }) => {
  await page.goto('/examples-theming.html');
  await page.waitForFunction(() => !!customElements.get('web-command-palette'));
  const bg = async (id: string) =>
    page.locator(`#${id}`).evaluate((el) => getComputedStyle(el.shadowRoot!.querySelector('.pa-command-palette__container')!).backgroundColor);
  for (const [theme, expected] of [['dark', 'rgb(30, 30, 46)'], ['neon', 'rgb(13, 2, 33)'], ['terminal', 'rgb(12, 12, 12)']] as const) {
    await page.locator(`[data-theme="${theme}"] [data-theme-open=""]`).click();
    await expect(page.locator(`#theme-${theme} .pa-command-palette`)).toHaveClass(/--active/);
    expect(await bg(`theme-${theme}`)).toBe(expected);
    await page.keyboard.press('Escape');
  }
  await expect(page.locator('[data-theme="material"] pre')).toContainText('#theme-material::part(input) {');
  // --base-font-family reaches the input (form controls don't inherit fonts on their own).
  const font = await page.locator('#theme-terminal').evaluate((el) => getComputedStyle(el.shadowRoot!.querySelector('input')!).fontFamily);
  expect(font).toContain('monospace');
});

test('themes & sizes: the size switches apply to every palette, themed ones included', async ({ page }) => {
  await page.goto('/examples-theming.html');
  await page.waitForFunction(() => !!customElements.get('web-command-palette'));
  await page.locator('input[name="th01-size"][value="lg"]').check();
  await page.locator('input[name="th01-rem"][value="12px"]').check();
  await expect(page.locator('#theme-neon')).toHaveAttribute('size', 'lg');
  await expect(page.locator('#palette')).toHaveAttribute('size', 'lg');
  expect(await page.locator('#theme-terminal').evaluate((el) => (el as HTMLElement).style.getPropertyValue('--base-rem'))).toBe('12px');
});
