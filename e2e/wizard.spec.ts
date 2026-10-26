import { expect, test, calls, events, load, open, palette } from './fixtures';

test.beforeEach(async ({ page }) => load(page, 'wizard'));

test('static step + isLiveSearch step + isFreeTextAllowed step → action with the right selections', async ({ page }) => {
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
  const stepCalls = (await calls(page)).stepOptions as Array<{ stepId: string; term: string; selections: unknown[] }>;
  const last = stepCalls[stepCalls.length - 1];
  expect(last.stepId).toBe('branch');
  expect(last.term).toBe('ui');
  expect(last.selections).toEqual([{ stepId: 'env', label: 'Staging', value: 'staging', optionId: 'staging', isFreeText: false }]);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(p.input).toHaveValue('/deploy to Staging branch feature/ui note ');

  // isFreeTextAllowed step with no options: Enter submits the typed text.
  await page.keyboard.type('ship it');
  await page.keyboard.press('Enter');
  await expect(p.root).not.toHaveClass(/--active/);
  const done = (await events(page)).find((e) => e.name === 'action');
  expect(done?.detail).toMatchObject({ action: 'custom', id: 'deploy', source: 'palette' });
  expect((done?.detail as { selections: unknown }).selections).toEqual([
      { stepId: 'env', label: 'Staging', value: 'staging', optionId: 'staging', isFreeText: false },
      { stepId: 'branch', label: 'feature/ui', value: 'feature/ui', optionId: 'feature/ui', isFreeText: false },
      { stepId: 'note', label: 'ship it', value: 'ship it', isFreeText: true },
  ]);
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

test('tokens display: a "$" pattern in an answer is kept verbatim in the remove label', async ({ page }) => {
  const p = palette(page);
  await p.host.evaluate((el) => {
    el.setAttribute('display', 'tokens');
    (el as unknown as { commands: unknown[] }).commands = [{
      id: 'price', trigger: '/price', text: 'Price',
      steps: [{ id: 'a', options: [{ id: 'x', text: "R$&D $' $$", value: 'x' }] }, { id: 'b', isFreeTextAllowed: true }],
    }];
  });
  await open(page);
  await page.keyboard.type('/price ');
  await page.keyboard.press('Enter');
  await expect(p.tokens.locator('.pa-badge__remove')).toHaveAttribute('aria-label', "Remove R$&D $' $$");
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

test.describe('branching (wizard-branching.html)', () => {
  test.beforeEach(async ({ page }) => load(page, 'wizard-branching'));

  test('getIsVisibleCallback false skips the step: the command completes after the first answer', async ({ page }) => {
    const p = palette(page);
    await open(page);
    await page.keyboard.type('/report inv');
    await expect(p.titles).toHaveText(['Inventory Status']);
    await page.keyboard.press('Enter');
    await expect(p.root).not.toHaveClass(/--active/);
    const done = (await events(page)).filter((e) => e.name === 'action');
    expect(done).toHaveLength(1);
    expect(done[0].detail).toMatchObject({ id: 'report', selections: [{ stepId: 'report', label: 'Inventory Status' }] });
    expect((done[0].detail as { selections: unknown[] }).selections).toHaveLength(1);
    // The callback saw the answers so far.
    expect(await page.evaluate(() => (window as unknown as { visibleCalls: string[][] }).visibleCalls)).toContainEqual(['report']);
  });

  test('getIsVisibleCallback true keeps the step', async ({ page }) => {
    const p = palette(page);
    await open(page);
    await page.keyboard.type('/report sal');
    await page.keyboard.press('Enter');
    await expect(p.input).toHaveValue('/report Product Sales for ');
    await expect(p.titles).toHaveText(['Last 7 days', 'Last 30 days']);
    await page.keyboard.press('Enter');
    const done = (await events(page)).find((e) => e.name === 'action');
    expect((done?.detail as { selections: Array<{ stepId: string }> }).selections.map((s) => s.stepId)).toEqual(['report', 'range']);
  });

  test('an option with its own steps forks the wizard', async ({ page }) => {
    const p = palette(page);
    await open(page);
    await page.keyboard.type('/assign-admin ');
    await page.keyboard.press('Enter'); // John Doe
    await page.keyboard.type('si');
    await page.keyboard.press('Enter'); // site
    await expect(p.input).toHaveValue('/assign-admin John Doe to site ');
    await expect(p.titles).toHaveText(['Intranet', 'HR Portal']);
    await page.keyboard.type('hr');
    await page.keyboard.press('Enter');
    const done = (await events(page)).find((e) => e.name === 'action');
    expect(done?.detail).toMatchObject({
      id: 'assign-admin',
      selections: [{ stepId: 'user', label: 'John Doe' }, { stepId: 'target', label: 'site' }, { stepId: 'site', label: 'HR Portal' }],
    });
  });

  test('the other branch offers the other step', async ({ page }) => {
    const p = palette(page);
    await open(page);
    await page.keyboard.type('/assign-admin ');
    await page.keyboard.press('Enter');
    await page.keyboard.type('gr');
    await page.keyboard.press('Enter');
    await expect(p.input).toHaveValue('/assign-admin John Doe to group ');
    await expect(p.titles).toHaveText(['Finance', 'Engineering']);
  });
});
