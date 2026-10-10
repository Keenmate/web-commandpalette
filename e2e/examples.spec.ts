import { expect, test } from '@playwright/test';

// Every example page loads cleanly and the palette opens on it.
for (const name of ['index', 'examples-basic', 'examples-commands-steps', 'examples-async-search', 'examples-theming']) {
  test(`${name}.html opens without errors`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(`/${name}.html`);
    const host = page.locator('web-command-palette');
    await expect(host).toBeAttached();
    await page.waitForFunction(() => !!customElements.get('web-command-palette'));
    await host.evaluate((el) => (el as unknown as { open(): void }).open());
    await expect(host.locator('.pa-command-palette')).toHaveClass(/--active/);
    await expect(host.locator('.pa-command-palette__item').first()).toBeVisible();
    expect(errors).toEqual([]);
  });
}

test('examples-commands-steps: shouldShow skips the range step for Inventory', async ({ page }) => {
  await page.goto('/examples-commands-steps.html');
  const host = page.locator('web-command-palette');
  await page.waitForFunction(() => !!customElements.get('web-command-palette'));
  await host.evaluate((el) => (el as unknown as { openWith(q: string): void }).openWith('/report inv'));
  await page.keyboard.press('Enter');
  await expect(page.locator('#log')).toContainText('"commandId": "report"');
  await expect(page.locator('#log')).toContainText('Inventory Status');
});
