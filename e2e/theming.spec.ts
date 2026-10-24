import { expect, test } from '@playwright/test';
import { load, open, palette } from './fixtures';

const style = (loc: ReturnType<typeof palette>['container'], prop: string) =>
  loc.evaluate((el, p) => getComputedStyle(el).getPropertyValue(p), prop);

test('unthemed: the --cp-* fallbacks apply at a 10px rem', async ({ page }) => {
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
  // The active row's accent-tinted context pill follows --base-primary-color.
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
    await page.locator(`[data-gallery-theme="${theme}"] [data-theme-open=""]`).click();
    await expect(page.locator(`#theme-${theme} .pa-command-palette`)).toHaveClass(/--active/);
    expect(await bg(`theme-${theme}`)).toBe(expected);
    await page.keyboard.press('Escape');
  }
  await expect(page.locator('[data-gallery-theme="material"] pre')).toContainText('#theme-material::part(input) {');
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

test('base-css-variables 2.0: control outline, focus halo, focused cursor row and hover read the shared tokens', async ({ page }) => {
  await load(page);
  const p = palette(page);
  await p.host.evaluate((el) => {
    const s = (el as HTMLElement).style;
    s.setProperty('--base-input-border-color', 'rgb(1, 2, 3)');
    s.setProperty('--base-border-color', 'rgb(9, 9, 9)');
    s.setProperty('--base-input-box-shadow-focus', 'rgb(4, 5, 6) 0px 0px 0px 3px');
    s.setProperty('--base-focused-outline', '2px solid rgb(7, 8, 9)');
    s.setProperty('--base-outline-width', '2px');
    s.setProperty('--base-hover-bg', 'rgb(10, 11, 12)');
  });
  await open(page);
  // The input is a control: the stronger outline, not the divider (it holds focus
  // while open, so read the resting border from the token it uses).
  expect((await style(p.host, '--cp-input-border')).trim()).toBe('1px solid rgb(1, 2, 3)');
  await expect.poll(() => style(p.input, 'box-shadow')).toBe('rgb(4, 5, 6) 0px 0px 0px 3px');
  // The keyboard cursor row is the FOCUSED item state: no fill, an inset outline.
  const active = p.active.first();
  await expect.poll(() => style(active, 'background-color')).toBe('rgba(0, 0, 0, 0)');
  expect(await style(active, 'outline')).toBe('rgb(7, 8, 9) solid 2px');
  expect(await style(active, 'outline-offset')).toBe('-2px');
  // Hover is the neutral overlay — on another row, and under the outline on the cursor row.
  const other = p.items.nth(1);
  await other.hover();
  await expect.poll(() => style(other, 'background-color')).toBe('rgb(10, 11, 12)');
  await active.hover();
  await expect.poll(() => style(active, 'background-color')).toBe('rgb(10, 11, 12)');
  expect(await style(active, 'outline')).toBe('rgb(7, 8, 9) solid 2px');
});

test('item icons by name draw the shared --base-icon-* glyph; unknown names draw nothing', async ({ page }) => {
  await load(page);
  const p = palette(page);
  await p.host.evaluate((el) => {
    (el as HTMLElement).style.setProperty('--base-icon-search', 'url("data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22/%3E")');
    const span = document.createElement('span');
    span.innerHTML = '<span class="pa-icon pa-icon--search"></span><span class="pa-icon pa-icon--no-such-icon"></span>';
    el.shadowRoot!.appendChild(span);
  });
  const mask = (cls: string) =>
    p.host.evaluate((el, c) => getComputedStyle(el.shadowRoot!.querySelector(`.pa-icon--${c}`)!).maskImage, cls);
  expect(await mask('search')).toContain('data:image/svg+xml');
  expect(await mask('no-such-icon')).toContain('linear-gradient');
});
