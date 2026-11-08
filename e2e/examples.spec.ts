import { expect, test, type Page } from './fixtures';

/**
 * Smoke over the example site only: every page loads without errors and the palette
 * opens on it. Behaviour is asserted on the minimal fixtures under test/ — the
 * former example-page assertions moved to wizard.spec.ts (getIsVisibleCallback,
 * option fork) and usage.spec.ts (live-picker replay from Recent).
 */

const PAGES = ['examples-basic', 'examples-commands-steps', 'examples-async-search', 'examples-favorites', 'examples-theming', 'examples-playground'];

function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  return errors;
}

// The hub, header and chapter nav are rendered by the devkit examples kit (kmwc-* classes).
test('hub renders one card per registered page plus the version badge', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/');
  await expect(page.locator('.kmwc-index__card')).toHaveCount(PAGES.length);
  for (const name of PAGES) await expect(page.locator(`.kmwc-index__card[href="${name}.html"]`)).toHaveCount(1);
  await expect(page.locator('[data-kmwc-version]')).toHaveText(/^v\d/);
  expect(errors).toEqual([]);
});

// Every example page loads cleanly, keeps the shared chrome, and the palette opens on it.
for (const name of PAGES) {
  test(`${name}.html opens without errors`, async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto(`/${name}.html`);
    // Devkit layout: header with a back link, numbered card sections.
    await expect(page.locator('.container > header .back-link')).toHaveAttribute('href', 'index.html');
    const cards = await page.locator('.container > .card > h2').count();
    expect(cards).toBeGreaterThanOrEqual(1);
    // The shared chapter nav only builds itself when there's more than one section to jump between.
    if (cards > 1) await expect(page.locator('.kmwc-chapter-nav')).toBeAttached();
    // The page's main palette (the theming page also has gallery instances).
    const host = page.locator('web-command-palette#palette');
    await page.waitForFunction(() => !!customElements.get('web-command-palette'));
    await host.evaluate((el) => (el as unknown as { open(): void }).open());
    await expect(host.locator('.cp')).toHaveClass(/--active/);
    await expect(host.locator('.cp__item').first()).toBeVisible();
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
