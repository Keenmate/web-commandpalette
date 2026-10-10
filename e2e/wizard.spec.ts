import { expect, test } from '@playwright/test';
import { calls, events, load, open, palette } from './fixtures';

test.beforeEach(async ({ page }) => load(page));

test('static step + search:true step + freeText step → cp-complete with the right selections', async ({ page }) => {
  const p = palette(page);
  await open(page);
  await page.keyboard.type('/d ');
  await expect(p.input).toHaveValue('/deploy to ');
  await expect(p.titles).toHaveText(['Production', 'Staging']);

  // Static step: filtered in the browser (inline options, no provider call).
  await page.keyboard.type('sta');
  await expect(p.titles).toHaveText(['Staging']);
  await page.keyboard.press('Enter');
  await expect(p.input).toHaveValue('/deploy to Staging branch ');

  // search:true step: provider per (debounced) keystroke, with prior selections.
  await page.keyboard.type('ui');
  await expect(p.titles).toHaveText(['main', 'feature/ui']);
  const stepCalls = (await calls(page)).stepOptions as Array<{ stepId: string; query: string; selections: unknown[] }>;
  const last = stepCalls[stepCalls.length - 1];
  expect(last.stepId).toBe('branch');
  expect(last.query).toBe('ui');
  expect(last.selections).toEqual([{ stepId: 'env', label: 'Staging', value: 'staging', optionId: 'staging', isFreeText: false }]);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(p.input).toHaveValue('/deploy to Staging branch feature/ui note ');

  // freeText step with no options: Enter submits the typed text.
  await page.keyboard.type('ship it');
  await page.keyboard.press('Enter');
  await expect(p.root).not.toHaveClass(/--active/);
  const done = (await events(page)).find((e) => e.name === 'cp-complete');
  expect(done?.detail).toEqual({
    commandId: 'deploy',
    selections: [
      { stepId: 'env', label: 'Staging', value: 'staging', optionId: 'staging', isFreeText: false },
      { stepId: 'branch', label: 'feature/ui', value: 'feature/ui', optionId: 'feature/ui', isFreeText: false },
      { stepId: 'note', label: 'ship it', value: 'ship it', isFreeText: true },
    ],
  });
});

test('the inline prefix is locked: selection-delete into it is blocked', async ({ page }) => {
  const p = palette(page);
  await open(page);
  await p.input.fill('/go ');
  await page.keyboard.type('us');
  await p.input.evaluate((el: HTMLInputElement) => el.setSelectionRange(1, 6));
  await page.keyboard.press('Backspace');
  await expect(p.input).toHaveValue('/go us');
});

test('tokens display: answers become removable badges above an empty input', async ({ page }) => {
  const p = palette(page);
  await p.host.evaluate((el) => el.setAttribute('display', 'tokens'));
  await open(page);
  await page.keyboard.type('/deploy ');
  await expect(p.input).toHaveValue('');
  await page.keyboard.press('Enter'); // Production
  await expect(p.tokens.locator('.pa-badge')).toHaveText(['/deploy', 'Production']);
  await expect(p.tokens.locator('.pa-command-palette__token-prompt')).toHaveText(['to', 'branch']);
  await p.tokens.locator('.pa-badge__remove').click();
  await expect(p.tokens.locator('.pa-badge')).toHaveText(['/deploy']);
  await expect(p.titles).toHaveText(['Production', 'Staging']);
  await expect(p.input).toBeFocused();
  // Backspace at 0 steps back to the command list.
  await page.keyboard.press('Backspace');
  await expect(p.input).toHaveValue('/');
});
