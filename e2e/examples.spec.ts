import { expect, test, type Page } from '@playwright/test';

const PAGES = ['examples-basic', 'examples-commands-steps', 'examples-async-search', 'examples-favorites', 'examples-theming', 'examples-playground'];

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

test('examples-commands-steps: an option with steps forks the wizard', async ({ page }) => {
  await page.goto('/examples-commands-steps.html');
  const host = page.locator('web-command-palette');
  await page.waitForFunction(() => !!customElements.get('web-command-palette'));
  await host.evaluate((el) => (el as unknown as { openWith(q: string): void }).openWith('/assign-admin '));
  const input = host.locator('.pa-command-palette__input');
  await page.keyboard.press('Enter'); // John Doe
  await page.keyboard.type('si');
  await page.keyboard.press('Enter'); // site
  await expect(input).toHaveValue('/assign-admin John Doe to site ');
  await page.keyboard.type('hr');
  await page.keyboard.press('Enter'); // HR Portal
  await expect(page.locator('#cs05-log')).toContainText('"stepId": "site"');
  await expect(page.locator('#cs05-log')).toContainText('HR Portal');
});

test('examples-favorites: shared live picker, then replay from Recent with Enter, Enter', async ({ page }) => {
  await page.goto('/examples-favorites.html');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  const host = page.locator('web-command-palette');
  await page.waitForFunction(() => !!customElements.get('web-command-palette'));
  const input = host.locator('.pa-command-palette__input');
  const titles = host.locator('.pa-command-palette__item-title');

  await page.keyboard.press('Control+k');
  await page.keyboard.type('/add-permission wr');
  await page.keyboard.press('Tab'); // write
  await expect(input).toHaveValue('/add-permission write to ');
  await page.keyboard.type('pet');
  await expect(titles).toHaveText(['Peter Parker']); // pickUser.load (live, debounced)
  await page.keyboard.press('Enter');
  await expect(page.locator('#fr03-log')).toContainText('"label":"Peter Parker"');
  await expect(page.locator('#fr01-log')).toContainText('pickUser');

  await page.keyboard.press('Control+k');
  await expect(host.locator('.pa-command-palette__item--active .pa-command-palette__item-title')).toHaveText('/add-permission write to Peter Parker');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  // The replay completed the same run again: two identical cp-complete lines.
  await expect(page.locator('#fr03-log')).toHaveText(/cp-complete[\s\S]*Peter Parker[\s\S]*cp-complete[\s\S]*Peter Parker/);
});

test('examples-playground: confirmation + favorites switches apply to the palette', async ({ page }) => {
  await page.goto('/examples-playground.html');
  await page.waitForFunction(() => !!customElements.get('web-command-palette'));
  const host = page.locator('web-command-palette');
  await page.locator('input[name="pg01-confirmation"][value="false"]').check();
  await page.locator('input[name="pg01-confirm-ms"][value="3000"]').check();
  await page.locator('input[name="pg01-usage"][value="none"]').check();
  await page.locator('input[name="pg01-keys"][value="off"]').check();
  await expect(host).toHaveAttribute('confirmation', 'false');
  await expect(host).toHaveAttribute('confirmation-duration', '3000');
  await expect(host).toHaveAttribute('usage-storage', 'none');
  await expect(host).toHaveAttribute('favorites-hotkey', '');

  await page.keyboard.press('Control+k');
  await page.keyboard.type('/reload');
  await page.keyboard.press('Enter');
  await expect(host.locator('.pa-command-palette')).not.toHaveClass(/--active/, { timeout: 300 });
});
