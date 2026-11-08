import { expect, load, open, palette, test, type ConsoleMessage, type Page } from './fixtures';

/**
 * Logging defaults (core SPEC §12.1: every bundle defaults to `warn`): a normal
 * session prints only warnings — here the second instance's hotkey-ownership warning,
 * nothing at debug / info. Errors (a failing provider) reach the console too. `enableLogging()` (the published controls on
 * `window.components['web-command-palette'].logging`) turns the debug output on.
 * Fixture: test/logging.html.
 */

function collect(page: Page): string[] {
  const out: string[] = [];
  page.on('console', (m: ConsoleMessage) => out.push(`${m.type()}: ${m.text()}`));
  return out;
}
const mine = (out: string[]) => out.filter((l) => l.includes('COMMANDPALETTE'));

async function session(page: Page, term: string): Promise<void> {
  const p = palette(page);
  await open(page);
  await p.input.fill(term);
  await expect(p.host.locator('.pa-command-palette__item-title, .pa-command-palette__empty').first()).toBeVisible();
  await page.waitForTimeout(300);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await expect(p.root).not.toHaveClass(/--active/);
}

const ownershipWarning = /^warning: .*COMMANDPALETTE:INIT.*#second.*more than one <web-command-palette> is connected/s;

test('a normal session prints warnings only by default (core level `warn`)', async ({ page }) => {
  const out = collect(page);
  await load(page, 'logging');
  await session(page, 'go');
  const lines = mine(out);
  expect(lines).toHaveLength(1);
  expect(lines[0]).toMatch(ownershipWarning);
});

test('a provider failure is logged at error level even by default', async ({ page }) => {
  const out = collect(page);
  await load(page, 'logging');
  await session(page, 'fail');
  const lines = mine(out).filter((l) => !ownershipWarning.test(l));
  expect(lines).toHaveLength(1);
  expect(lines[0]).toMatch(/^error: .*COMMANDPALETTE:DATA.*provider failed/s);
});

test('enableLogging() turns the debug output on', async ({ page }) => {
  const out = collect(page);
  await load(page, 'logging');
  await page.evaluate(() => {
    (window as unknown as { components: Record<string, { logging: { enableLogging(): void } }> }).components['web-command-palette'].logging.enableLogging();
  });
  await session(page, 'go');
  expect(mine(out).some((l) => /COMMANDPALETTE:UI.*open/s.test(l))).toBe(true);
});

test('resetLogging() (re-exported core bundle method) goes back to the default level', async ({ page }) => {
  const out = collect(page);
  await load(page, 'logging');
  await page.evaluate(async () => {
    const mod = await import('/src/index.ts');
    mod.enableLogging();
    mod.resetLogging();
  });
  await session(page, 'go');
  expect(mine(out).some((l) => /COMMANDPALETTE:UI.*open/s.test(l))).toBe(false);
});
