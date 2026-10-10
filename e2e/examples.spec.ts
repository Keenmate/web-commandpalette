import { expect, test, type Page } from '@playwright/test';

const PAGES = ['examples-basic', 'examples-commands-steps', 'examples-async-search', 'examples-theming', 'examples-playground'];

function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  return errors;
}

test('hub renders one card per registered page plus the version badge', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/');
  await expect(page.locator('.card-link')).toHaveCount(PAGES.length);
  for (const name of PAGES) await expect(page.locator(`.card-link[href="${name}.html"]`)).toHaveCount(1);
  await expect(page.locator('#version-badge')).toHaveText(/^v\d/);
  expect(errors).toEqual([]);
});

// Every example page loads cleanly, keeps the shared chrome, and the palette opens on it.
for (const name of PAGES) {
  test(`${name}.html opens without errors`, async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto(`/${name}.html`);
    // Shared skeleton: white gradient header with a back link, numbered card sections.
    await expect(page.locator('.container > header .back-link')).toHaveAttribute('href', 'index.html');
    expect(await page.locator('.container > .card > h2').count()).toBeGreaterThanOrEqual(2);
    await expect(page.locator('.chapter-nav')).toBeAttached();
    const host = page.locator('web-command-palette');
    await page.waitForFunction(() => !!customElements.get('web-command-palette'));
    await host.evaluate((el) => (el as unknown as { open(): void }).open());
    await expect(host.locator('.pa-command-palette')).toHaveClass(/--active/);
    await expect(host.locator('.pa-command-palette__item').first()).toBeVisible();
    expect(errors).toEqual([]);
  });
}

test('controls persist across a reload', async ({ page }) => {
  await page.goto('/examples-commands-steps.html');
  await page.locator('input[name="cs04-display"][value="tokens"]').check();
  await page.reload();
  await expect(page.locator('input[name="cs04-display"][value="tokens"]')).toBeChecked();
  await expect(page.locator('web-command-palette')).toHaveAttribute('display', 'tokens');
});

test('examples-commands-steps: shouldShow skips the range step for Inventory', async ({ page }) => {
  await page.goto('/examples-commands-steps.html');
  const host = page.locator('web-command-palette');
  await page.waitForFunction(() => !!customElements.get('web-command-palette'));
  await host.evaluate((el) => (el as unknown as { openWith(q: string): void }).openWith('/report inv'));
  await page.keyboard.press('Enter');
  await expect(page.locator('#cs05-log')).toContainText('"commandId": "report"');
  await expect(page.locator('#cs05-log')).toContainText('Inventory Status');
});
