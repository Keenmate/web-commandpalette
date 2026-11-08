/**
 * Custom CSS — core createCustomStyles(), the canonical adoption (rulebook C-CA-15):
 * the page layer `window.components['web-command-palette'].customStyles` /
 * `.getCustomStylesCallback`, then the instance layer `custom-styles` / `customStyles` /
 * `getCustomStylesCallback`, each its own <style> in the shadow root, page first.
 */
import { expect, test, load } from './fixtures';
import type { Page } from '@playwright/test';

/** A custom property read on the container inside the shadow root of `#id`. */
const probe = (page: Page, id: string, name = '--cs-probe') =>
  page.locator(`#${id}`).evaluate((el, n) => {
    const c = el.shadowRoot!.querySelector('.cp__container')!;
    return getComputedStyle(c).getPropertyValue(n).trim();
  }, name);

const slots = (page: Page, id: string) =>
  page.locator(`#${id}`).evaluate((el) =>
    Array.from(el.shadowRoot!.querySelectorAll('style[class^="cp-custom-styles"]'), (s) => ({ cls: s.className, css: s.textContent })));

const setPage = (page: Page, css: string | null) =>
  page.evaluate((v) => { (window as any).components['web-command-palette'].customStyles = v; }, css);

test.beforeEach(async ({ page }) => {
  await load(page, 'custom-styles');
});

test('instance: the custom-styles attribute styles the shadow root; removing it clears', async ({ page }) => {
  const el = page.locator('#palette');
  await el.evaluate((e) => e.setAttribute('custom-styles', '.cp__container { --cs-probe: attr; }'));
  await expect.poll(() => probe(page, 'palette')).toBe('attr');
  expect(await probe(page, 'second')).toBe('');
  expect((await slots(page, 'palette')).map((s) => s.cls)).toContain('cp-custom-styles');
  await el.evaluate((e) => e.removeAttribute('custom-styles'));
  await expect.poll(() => probe(page, 'palette')).toBe('');
  expect(await el.evaluate((e) => (e as any).customStyles)).toBeNull();
});

test('page layer styles every instance; an instance layer overrides it (page <style> first)', async ({ page }) => {
  await setPage(page, '.cp__container { --cs-probe: page; }');
  await expect.poll(() => probe(page, 'palette')).toBe('page');
  await expect.poll(() => probe(page, 'second')).toBe('page');

  await page.locator('#palette').evaluate((e) => { (e as any).customStyles = '.cp__container { --cs-probe: instance; }'; });
  await expect.poll(() => probe(page, 'palette')).toBe('instance');
  expect(await probe(page, 'second')).toBe('page');
  expect((await slots(page, 'palette')).map((s) => s.cls)).toEqual(['cp-custom-styles--page', 'cp-custom-styles']);

  await setPage(page, null);
  await expect.poll(() => probe(page, 'second')).toBe('');
  expect(await probe(page, 'palette')).toBe('instance');
});

test('callbacks: the page callback runs per instance with the palette context; the instance callback wins over customStyles', async ({ page }) => {
  await page.evaluate(() => {
    (window as any).components['web-command-palette'].getCustomStylesCallback = (ctx: any) =>
      `.cp__container { --cs-probe: page-${ctx.element.id}-${typeof ctx.isFullscreen}; }`;
  });
  await expect.poll(() => probe(page, 'palette')).toBe('page-palette-boolean');
  await expect.poll(() => probe(page, 'second')).toBe('page-second-boolean');

  await page.locator('#second').evaluate((e) => {
    (e as any).customStyles = '.cp__container { --cs-probe: string; }';
    (e as any).getCustomStylesCallback = () => '.cp__container { --cs-probe: callback; }';
  });
  await expect.poll(() => probe(page, 'second')).toBe('callback');
  await page.locator('#second').evaluate((e) => { (e as any).getCustomStylesCallback = null; });
  await expect.poll(() => probe(page, 'second')).toBe('string');
});

test('an @import is applied in the shadow root and linked once in the head; destroy() releases it', async ({ page }) => {
  const css = "@import url('/test/custom-styles-import.css');";
  await page.locator('#palette').evaluate((e, v) => { (e as any).customStyles = v; }, css);
  await page.locator('#second').evaluate((e, v) => { (e as any).customStyles = v; }, css);
  await expect.poll(() => probe(page, 'palette', '--cs-imported')).toBe('yes');
  await expect.poll(() => probe(page, 'second', '--cs-imported')).toBe('yes');
  const links = () => page.locator('head link[data-km-custom-styles]').count();
  await expect.poll(links).toBe(1);

  await page.locator('#palette').evaluate((e) => (e as any).destroy());
  expect(await links()).toBe(1); // #second still imports it
  await page.locator('#second').evaluate((e) => (e as any).destroy());
  await expect.poll(links).toBe(0);
});
