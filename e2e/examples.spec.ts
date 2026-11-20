import { expect, test, type Page } from './fixtures';

/**
 * Smoke over the example site only: every page loads without errors and the palette
 * opens on it. Behaviour is asserted on the minimal fixtures under test/ — the
 * former example-page assertions moved to wizard.spec.ts (getIsVisibleCallback,
 * option fork) and usage.spec.ts (live-picker replay from Recent).
 */

const PAGES = ['examples-basic', 'examples-commands-steps', 'examples-async-search', 'examples-favorites', 'examples-theming', 'examples-playground'];
/** Every hub card: the pages above plus the localization page (several palettes, no single #palette). */
const HUB_PAGES = [...PAGES, 'examples-localization'];

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
  await expect(page.locator('.kmwc-index__card')).toHaveCount(HUB_PAGES.length);
  for (const name of HUB_PAGES) await expect(page.locator(`.kmwc-index__card[href="${name}.html"]`)).toHaveCount(1);
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

// The shared localization page: each toggle changes the strings read back from the shadow roots.
test('examples-localization.html: every toggle changes the shown text', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/examples-localization.html');
  await expect(page.locator('.container > header .back-link')).toHaveAttribute('href', 'index.html');
  const out = (n: string) => page.locator(`#lo0${n}-out`);
  await expect(out('1')).toContainText('Pohyb');
  await expect(out('6')).toContainText('markup: Type to search <b>&lt;i&gt;Ann&lt;/i&gt;</b>');

  await page.locator('#lo01-labels').uncheck();
  await expect(out('1')).not.toContainText('Pohyb');
  await page.locator('#lo02-dict').check();
  await expect(out('2')).toContainText('Nic nenalezeno');
  await page.locator('#lo03-page').check();
  await expect(out('3')).toContainText('#lo03b  hints: Pohyb · Instance wins');
  await page.locator('#lo03-own').check();
  await expect(out('3')).toContainText('#lo03a  hints: Pohyb · Auswählen');
  await page.locator('#lo04-caption').check();
  await expect(out('4')).toContainText('star  aria-label: Přidat do oblíbených');
  await expect(out('4')).toContainText('close aria-label: Zavřít');
  await page.locator('input[name="lo05-locale"][value="de-DE"]').check();
  await expect(out('5')).toHaveText('Page 1 of 1.544 · 12.345 results');
  await page.locator('#lo06-escape').check();
  await expect(out('6')).toContainText('text:   Type to search <b><i>Ann</i></b>');
  expect(errors).toEqual([]);
});

test('controls persist across a reload', async ({ page }) => {
  await page.goto('/examples-commands-steps.html');
  await page.locator('input[name="cs04-display"][value="tokens"]').check();
  await page.reload();
  await expect(page.locator('input[name="cs04-display"][value="tokens"]')).toBeChecked();
  await expect(page.locator('web-command-palette')).toHaveAttribute('display', 'tokens');
});
