import { expect, test, load, open, palette } from './fixtures';

const style = (loc: ReturnType<typeof palette>['container'], prop: string) =>
  loc.evaluate((el, p) => getComputedStyle(el).getPropertyValue(p), prop);
/** The computed outline as [color, style, width] (the shorthand's order differs per engine). */
const outline = (loc: ReturnType<typeof palette>['container']) =>
  Promise.all(['outline-color', 'outline-style', 'outline-width'].map((prop) => style(loc, prop)));

test('unthemed: the --cp-* fallbacks apply at a 10px rem', async ({ page }) => {
  await load(page, 'theming');
  const p = palette(page);
  await open(page);
  expect(await style(p.container, 'max-width')).toBe('608px'); // 60.8rem × 10px
  expect(await style(p.container, 'background-color')).toBe('rgb(255, 255, 255)');
  expect(await style(p.input, 'font-size')).toBe('16px');
});

test('motion: the contract speeds; 0s under reduced motion or when set to 0s', async ({ page }) => {
  await load(page, 'theming');
  const p = palette(page);
  await open(page);
  const speeds = async () => Promise.all(['fast', 'normal', 'medium'].map((s) => style(p.container, `--cp-transition-${s}`)));
  expect((await speeds()).map((v) => v.trim())).toEqual(['0.1s', '0.15s', '0.25s']);
  expect(await style(p.container, 'animation-duration')).toBe('0.15s');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect((await speeds()).map((v) => v.trim())).toEqual(['0s', '0s', '0s']);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await p.host.evaluate((el) => (el as HTMLElement).style.setProperty('--cp-transition-normal', '0s'));
  expect(await style(p.container, 'animation-duration')).toBe('0s');
  expect((await style(p.container, '--cp-disabled-opacity')).trim()).toBe('0.65');
});

test('a host theme on :root pierces the shadow DOM (--base-* + --base-rem)', async ({ page }) => {
  await load(page, 'theming');
  await page.evaluate(() => { (document.getElementById('host-theme') as HTMLStyleElement).media = 'all'; });
  const p = palette(page);
  await open(page);
  // WebKit serialises the computed length with float noise (972.799988px).
  expect(parseFloat(await style(p.container, 'max-width'))).toBeCloseTo(60.8 * 16, 2);
  // The active row's accent-tinted context pill follows --base-primary-color.
  await p.input.fill('/');
  expect(await style(p.context, 'color')).toBe('rgb(255, 0, 128)');
});

test('component knobs: --cp-width on the host, and size presets', async ({ page }) => {
  await load(page, 'theming');
  const p = palette(page);
  await p.host.evaluate((el) => (el as HTMLElement).style.setProperty('--cp-width', '500px'));
  await open(page);
  expect(await style(p.container, 'max-width')).toBe('500px');
  await p.host.evaluate((el) => {
    (el as HTMLElement).style.removeProperty('--cp-width');
    el.setAttribute('size', 'sm');
  });
  await expect(p.root).toHaveClass(/cp--sm/);
  expect(await style(p.container, 'max-width')).toBe('480px');
});

test('per-instance themes: --base-* / ::part() on one instance leave the others alone', async ({ page }) => {
  await load(page, 'theming');
  const bg = (id: string) =>
    page.locator(`#${id}`).evaluate((el) => getComputedStyle(el.shadowRoot!.querySelector('.cp__container')!).backgroundColor);
  // Gallery instances have no global hotkey (open-key=""); open them through the API.
  for (const [id, expected] of [['theme-dark', 'rgb(30, 30, 46)'], ['theme-terminal', 'rgb(12, 12, 12)'], ['palette', 'rgb(255, 255, 255)']] as const) {
    const p = palette(page, `#${id}`);
    await p.host.evaluate((el) => (el as unknown as { open(): void }).open());
    await expect(p.root).toHaveClass(/--active/);
    expect(await bg(id)).toBe(expected);
    await page.keyboard.press('Escape');
    await expect(p.root).not.toHaveClass(/--active/);
  }
  // ::part(container) / ::part(input) reach into the shadow root.
  expect(await style(palette(page, '#theme-dark').container, 'border-top-color')).toBe('rgb(49, 50, 68)');
  expect(await style(palette(page, '#theme-terminal').input, 'border-bottom-color')).toBe('rgb(51, 255, 102)');
  // --base-font-family reaches the input (form controls don't inherit fonts on their own).
  expect(await style(palette(page, '#theme-terminal').input, 'font-family')).toContain('monospace');
});

test('size presets and --base-rem apply per instance, themed ones included', async ({ page }) => {
  await load(page, 'theming');
  for (const id of ['palette', 'theme-dark', 'theme-terminal']) {
    await page.locator(`#${id}`).evaluate((el) => { el.setAttribute('size', 'lg'); (el as HTMLElement).style.setProperty('--base-rem', '12px'); });
  }
  const sizes: string[] = [];
  for (const id of ['palette', 'theme-dark', 'theme-terminal']) {
    const p = palette(page, `#${id}`);
    await expect(p.root).toHaveClass(/cp--lg/);
    sizes.push(await style(p.container, 'max-width'));
  }
  // Same preset + same rem → the same width everywhere, and larger than the 10px-rem default.
  expect(new Set(sizes).size).toBe(1);
  await page.locator('#palette').evaluate((el) => (el as HTMLElement).style.removeProperty('--base-rem'));
  const at10 = parseFloat(await style(palette(page).container, 'max-width'));
  expect(parseFloat(sizes[0])).toBeCloseTo(at10 * 1.2, 0);
});

test('base-css-variables 2.0: control outline, focus halo, focused cursor row and hover read the shared tokens', async ({ page }) => {
  await load(page, 'theming');
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
  expect(await outline(active)).toEqual(['rgb(7, 8, 9)', 'solid', '2px']);
  expect(await style(active, 'outline-offset')).toBe('-2px');
  // Hover is the neutral overlay — on another row, and under the outline on the cursor row.
  const other = p.items.nth(1);
  await other.hover();
  await expect.poll(() => style(other, 'background-color')).toBe('rgb(10, 11, 12)');
  await active.hover();
  await expect.poll(() => style(active, 'background-color')).toBe('rgb(10, 11, 12)');
  expect(await outline(active)).toEqual(['rgb(7, 8, 9)', 'solid', '2px']);
});

test('item icons by name draw the shared --base-icon-* glyph; unknown names draw nothing', async ({ page }) => {
  await load(page, 'theming');
  const p = palette(page);
  await p.host.evaluate((el) => {
    (el as HTMLElement).style.setProperty('--base-icon-search', 'url("data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22/%3E")');
    const span = document.createElement('span');
    span.innerHTML = '<span class="cp__icon cp__icon--search"></span><span class="cp__icon cp__icon--no-such-icon"></span>';
    el.shadowRoot!.appendChild(span);
  });
  const mask = (cls: string) =>
    p.host.evaluate((el, c) => getComputedStyle(el.shadowRoot!.querySelector(`.cp__icon--${c}`)!).maskImage, cls);
  expect(await mask('search')).toContain('data:image/svg+xml');
  expect(await mask('no-such-icon')).toContain('linear-gradient');
});
