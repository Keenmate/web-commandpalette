import { expect, test, events, load, open, palette } from './fixtures';
import type { Page } from '@playwright/test';

/**
 * Motion (core SPEC §12.16): the feedback countdown bar is decorative — gone when the resolved
 * speed is 0s (element `motion`, an ancestor `data-motion`, OS reduced motion); the timer keeps
 * its time. Closing mirrors the opening (backdrop fade, dialog slide-up) through core
 * `animateOut`: state + `close` event at the start, the dialog leaves the DOM at the end.
 */
test.beforeEach(async ({ page }) => load(page, 'motion'));

const bar = (page: Page) => palette(page).host.locator('.cp__confirm-progress');

async function runReload(page: Page): Promise<void> {
  await open(page);
  await page.keyboard.type('/reload');
  await page.keyboard.press('Enter');
  await expect(palette(page).host.locator('.cp__confirm')).toBeVisible();
}

/** close() and what is true right after it, in the same task. */
const closeNow = (page: Page) =>
  palette(page).host.evaluate((el) => {
    const host = el as HTMLElement & { close(): void; isOpen: boolean };
    const root = host.shadowRoot!.querySelector('.cp')!;
    host.close();
    return {
      isOpen: host.isOpen,
      hasOpenAttr: host.hasAttribute('open'),
      isActive: root.classList.contains('cp--active'),
      isClosing: !!host.shadowRoot!.querySelector('.cp__container--closing'),
      isBackdropClosing: !!host.shadowRoot!.querySelector('.cp__backdrop--closing'),
      closeEvents: (window as unknown as { events: Array<{ name: string }> }).events.filter((e) => e.name === 'close').length,
    };
  });

test.describe('feedback countdown bar', () => {
  test('shown by default', async ({ page }) => {
    await runReload(page);
    await expect(bar(page)).toHaveCount(1);
    await expect(bar(page)).toBeVisible();
  });

  test('hidden with motion="none" on the element; the timer keeps its time', async ({ page }) => {
    const p = palette(page);
    await p.host.evaluate((el) => {
      el.setAttribute('motion', 'none');
      el.setAttribute('feedback-duration', '600');
    });
    // Timestamp, in the page, when the feedback line starts and when the dialog closes — load can
    // only stretch that span, so a lower bound checks "the timer keeps its time" without a fixed wait.
    await p.host.evaluate((el) => {
      const root = el.shadowRoot!.querySelector('.cp')!;
      const w = window as unknown as { feedbackAt?: number; closedAt?: number };
      new MutationObserver(() => {
        if (w.feedbackAt === undefined && root.classList.contains('cp--confirming')) w.feedbackAt = performance.now();
        if (w.feedbackAt !== undefined && w.closedAt === undefined && !root.classList.contains('cp--active')) {
          w.closedAt = performance.now();
        }
      }).observe(root, { attributes: true, attributeFilter: ['class'] });
    });
    await runReload(page);
    await expect(bar(page)).toHaveCount(0);
    // Still the full feedback time, then closed.
    await expect(p.root).not.toHaveClass(/--active/, { timeout: 3000 });
    const span = await page.evaluate(() => {
      const w = window as unknown as { feedbackAt: number; closedAt: number };
      return w.closedAt - w.feedbackAt;
    });
    expect(span).toBeGreaterThanOrEqual(550);
  });

  test('hidden with data-motion="none" on an ancestor section', async ({ page }) => {
    await page.evaluate(() => document.getElementById('section')!.setAttribute('data-motion', 'none'));
    await runReload(page);
    await expect(bar(page)).toHaveCount(0);
  });

  test('hidden under OS reduced motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await runReload(page);
    await expect(bar(page)).toHaveCount(0);
  });
});

test.describe('closing animation', () => {
  test('state + close event at the start, the dialog leaves when the animation ends', async ({ page }) => {
    const p = palette(page);
    await open(page);
    const now = await closeNow(page);
    expect(now).toEqual({
      isOpen: false,
      hasOpenAttr: false,
      isActive: true,
      isClosing: true,
      isBackdropClosing: true,
      closeEvents: 1,
    });
    await expect(p.root).not.toHaveClass(/--active/);
    await expect(p.container).not.toHaveClass(/--closing/);
    await expect(p.backdrop).not.toHaveClass(/--closing/);
    expect((await events(page)).filter((e) => e.name === 'close')).toHaveLength(1);
  });

  test('the dialog is inert while it animates out', async ({ page }) => {
    await open(page);
    await closeNow(page);
    const isInert = await palette(page).container.evaluate((el) => (el as HTMLElement).inert);
    expect(isInert).toBe(true);
  });

  test('instant with motion="none" on the element', async ({ page }) => {
    await palette(page).host.evaluate((el) => el.setAttribute('motion', 'none'));
    await open(page);
    const now = await closeNow(page);
    expect(now.isActive).toBe(false);
    expect(now.closeEvents).toBe(1);
  });

  test('instant with data-motion="none" on an ancestor', async ({ page }) => {
    await page.evaluate(() => document.getElementById('section')!.setAttribute('data-motion', 'none'));
    await open(page);
    expect((await closeNow(page)).isActive).toBe(false);
  });

  test('instant under OS reduced motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await open(page);
    expect((await closeNow(page)).isActive).toBe(false);
  });

  test('re-open during the closing animation cancels it: open again, focused, stays open', async ({ page }) => {
    const p = palette(page);
    await open(page);
    const state = await p.host.evaluate((el) => {
      const host = el as HTMLElement & { close(): void; open(): void; isOpen: boolean };
      host.close();
      host.open();
      return {
        isOpen: host.isOpen,
        isClosing: !!host.shadowRoot!.querySelector('.cp__container--closing, .cp__backdrop--closing'),
      };
    });
    expect(state).toEqual({ isOpen: true, isClosing: false });
    await page.waitForTimeout(400); // longer than the closing animation
    await expect(p.root).toHaveClass(/--active/);
    await expect(p.input).toBeFocused();
    expect(await p.container.evaluate((el) => (el as HTMLElement).inert)).toBe(false);
    const names = (await events(page)).map((e) => e.name);
    expect(names.slice(-3)).toEqual(['open', 'close', 'open']);
  });

  test('closing from the feedback line keeps the line until the dialog is gone', async ({ page }) => {
    const p = palette(page);
    await runReload(page);
    await page.keyboard.press('x'); // any key dismisses
    // Mid-animation the feedback is still what fades out (no snap back to the full palette).
    expect(await p.root.evaluate((el) => el.classList.contains('cp--confirming') || !el.classList.contains('cp--active'))).toBe(true);
    await expect(p.root).not.toHaveClass(/--active/);
    await expect(p.root).not.toHaveClass(/--confirming/);
    await expect(p.host.locator('.cp__confirm')).toBeHidden();
  });
});
