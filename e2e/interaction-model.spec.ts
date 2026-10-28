import { expect, load, palette, test, type Page } from './fixtures';

/**
 * The KeenMate interaction model (web-components-core `/actions`, SPEC §12.5 / §12.12):
 *   - events `open` / `close` / `result-select` / `action` / `ready` (no `cp-` prefix), bubbling,
 *     not composed; the camelCase `on*` twin gets the SAME detail first
 *   - a command is a core action item: one `action` event per run (instant or after the
 *     wizard), in the order beforeActionCallback → onClick → onAction → action event
 *   - beforeActionCallback / beforeSelectCallback → `false` cancels (async OK)
 *   - every ctx / detail carries `controller` (= el.controller) / `element` (non-enumerable)
 *     + the presentation flags; callbacks take ONE ctx
 *   - isVisible / isDisabled / isDanger / tooltip / cssClass / get*Callback on commands
 *
 * Fixture: test/interaction-model.html.
 */

const log = (page: Page) => page.evaluate(() => (window as any).__log as string[]);
const details = (page: Page) => page.evaluate(() => (window as any).__details as any[]);
const ctxs = (page: Page) => page.evaluate(() => (window as any).__ctx as Record<string, any>);
const clear = (page: Page) => page.evaluate(() => { (window as any).__log = []; (window as any).__details = []; });
const setVeto = (page: Page, v: string) => page.evaluate((x) => { (window as any).veto = x; }, v);
const openPalette = (page: Page) => page.evaluate(() => (document.getElementById('palette') as any).controller.open());

test.beforeEach(async ({ page }) => {
  await load(page, 'interaction-model');
  await expect.poll(() => log(page)).toContain('event:ready');
  await clear(page);
});

test('ready fired once with its twin; open / close carry the context; twins get the same detail', async ({ page }) => {
  await load(page, 'interaction-model');
  await expect.poll(() => log(page)).toEqual(['on:ready', 'event:ready']);
  await clear(page);
  await openPalette(page);
  await page.keyboard.press('Escape');
  await expect.poll(() => log(page)).toEqual(['on:open', 'event:open', 'on:close', 'event:close']);
  for (const d of await details(page)) {
    expect(d.sameAsTwin).toBe(true);
    expect(d.bubbles).toBe(true);
    expect(d.composed).toBe(false);
    expect(d.hasController).toBe(true);
    expect(d.elementIsHost).toBe(true);
    expect(d.controllerIsElements).toBe(true);
    expect(d.json).toEqual({ presentation: 'floating', isFullscreen: false, isModal: false });
  }
});

test('el.controller is the public facade (no engine)', async ({ page }) => {
  const facade = await page.evaluate(() => {
    const el = document.getElementById('palette') as any;
    const c = el.controller;
    const before = c.isOpen;
    c.openWith('/assign');
    const value = el.shadowRoot.querySelector('input').value;
    const open = c.isOpen;
    c.close();
    return { keys: Object.keys(c).sort(), before, open, after: c.isOpen, value, hasEngine: 'engine' in el || 'machine' in el };
  });
  expect(facade.keys).toEqual(['close', 'commands', 'contexts', 'isOpen', 'open', 'openFavorites', 'openRecent', 'openWith', 'reset', 'toggle']);
  expect(facade).toMatchObject({ before: false, open: true, after: false, value: '/assign', hasEngine: false });
});

test('an instant command: before → onClick → onAction → action event, then close', async ({ page }) => {
  const p = palette(page);
  await openPalette(page);
  await p.input.fill('/reload');
  await page.keyboard.press('Enter');
  await expect(p.root).not.toHaveClass(/--active/);
  expect(await log(page)).toEqual(['on:open', 'event:open', 'before:reload', 'onClick:reload:palette', 'on:action', 'event:action', 'on:close', 'event:close']);
  const action = (await details(page)).find((d) => d.name === 'action');
  expect(action.json).toMatchObject({
    action: 'custom', id: 'reload', source: 'palette', selections: [], dataset: {},
    item: { id: 'reload', trigger: '/reload', text: 'Reload' },
    presentation: 'floating', isFullscreen: false, isModal: false,
  });
  expect(action.json).toHaveProperty('sourceEvent'); // the keydown
  expect(action.json).toHaveProperty('triggerElement'); // the active row
  expect(action.json).not.toHaveProperty('controller');
  expect(action.json).not.toHaveProperty('element');
  expect(action.hasController && action.elementIsHost && action.sameAsTwin).toBe(true);
  expect((await ctxs(page)).before.elementIsHost).toBe(true);
});

test('a wizard fires ONE action after the last answer, with the selections', async ({ page }) => {
  const p = palette(page);
  await openPalette(page);
  await p.input.fill('/assign ');
  await page.keyboard.press('Enter'); // John
  await expect(p.input).toHaveValue('/assign John as ');
  const steps = (await ctxs(page)).stepOptions;
  expect(steps.json).toEqual({ commandId: 'assign', stepId: 'role', term: '', selections: [{ stepId: 'user', label: 'John', value: 'John', optionId: 'john', isFreeText: false }], presentation: 'floating', isFullscreen: false, isModal: false });
  expect(steps.hasSignal && steps.hasController && steps.elementIsHost).toBe(true);
  expect(await log(page)).toEqual(['on:open', 'event:open']);
  await page.keyboard.press('Enter'); // admin
  await expect(p.root).not.toHaveClass(/--active/);
  const actions = (await details(page)).filter((d) => d.name === 'action');
  expect(actions).toHaveLength(1);
  expect(actions[0].json).toMatchObject({ id: 'assign', selections: [{ stepId: 'user', label: 'John' }, { stepId: 'role', label: 'admin' }] });
});

test('beforeActionCallback → false: no onClick / event; a wizard steps back to its last answer', async ({ page }) => {
  const p = palette(page);
  await setVeto(page, 'action');
  await openPalette(page);
  await p.input.fill('/reload');
  await page.keyboard.press('Enter');
  await expect.poll(() => log(page)).toContain('before:reload');
  await expect(p.root).toHaveClass(/--active/);
  expect(await log(page)).not.toContain('event:action');
  expect(await log(page)).not.toContain('onClick:reload:palette');

  await p.input.fill('/assign ');
  await page.keyboard.press('Enter'); // John
  await page.keyboard.press('Enter'); // admin → vetoed
  await expect(p.input).toHaveValue('/assign John as ');
  await expect(p.root).toHaveClass(/--active/);
  expect((await details(page)).some((d) => d.name === 'action')).toBe(false);
});

test('an async veto (Promise<false>) also cancels', async ({ page }) => {
  const p = palette(page);
  await setVeto(page, 'action-async');
  await openPalette(page);
  await p.input.fill('/reload');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(100);
  await expect(p.root).toHaveClass(/--active/);
  expect(await log(page)).toEqual(['on:open', 'event:open', 'before:reload']);
});

test('select: beforeSelectCallback → false keeps the palette open; otherwise select fires with { result, scope }', async ({ page }) => {
  const p = palette(page);
  await setVeto(page, 'select');
  await openPalette(page);
  await p.input.fill(':people ann');
  await expect(p.titles.first()).toHaveText('Person ann');
  const search = (await ctxs(page)).search;
  expect(search.json).toEqual({ scope: { contextId: 'people' }, term: 'ann', presentation: 'floating', isFullscreen: false, isModal: false });
  expect(search.hasSignal && search.hasController).toBe(true);
  await page.keyboard.press('Enter');
  await expect.poll(() => log(page)).toContain('before-select:p1');
  await expect(p.root).toHaveClass(/--active/);
  expect(await log(page)).not.toContain('event:select');

  await setVeto(page, '');
  await page.keyboard.press('Enter');
  await expect(p.root).not.toHaveClass(/--active/);
  const sel = (await details(page)).find((d) => d.name === 'result-select');
  expect(sel.json).toMatchObject({ result: { id: 'p1', title: 'Person ann' }, scope: { contextId: 'people' } });
  expect(sel.sameAsTwin && sel.hasController && sel.elementIsHost).toBe(true);
});

test('command items: hidden dropped, disabled greyed + inert, danger / tooltip / cssClass rendered', async ({ page }) => {
  const p = palette(page);
  await openPalette(page);
  await expect(p.titles).toHaveText(['Reload', 'Assign', 'Locked', 'Wipe', 'People']);
  const locked = p.items.filter({ hasText: 'Locked' });
  await expect(locked).toHaveClass(/cp__item--disabled/);
  await expect(locked).toHaveAttribute('aria-disabled', 'true');
  const disabledCtx = (await ctxs(page)).disabled;
  expect(disabledCtx.json).toEqual({ selections: [], presentation: 'floating', isFullscreen: false, isModal: false });
  expect(disabledCtx.hasController && disabledCtx.elementIsHost).toBe(true);
  await locked.click({ force: true });
  await expect(p.root).toHaveClass(/--active/);
  expect(await log(page)).not.toContain('before:locked');
  const wipe = p.items.filter({ hasText: 'Wipe' });
  await expect(wipe).toHaveClass(/cp__item--danger/);
  await expect(wipe).toHaveClass(/my-wipe/);
  await expect(wipe).toHaveAttribute('title', 'Deletes everything');
});

test('a click on a row: triggerElement is the row; the g-sequence shortcut runs the command', async ({ page }) => {
  const p = palette(page);
  await openPalette(page);
  await p.items.filter({ hasText: 'Reload' }).click();
  await expect(p.root).not.toHaveClass(/--active/);
  const fromClick = await page.evaluate(() => new Promise<string>((resolve) => {
    const el = document.getElementById('palette') as any;
    el.addEventListener('action', (e: any) => resolve(`${e.detail.sourceEvent?.type}:${e.detail.triggerElement ?? 'none'}`), { once: true });
    el.controller.open();
    (el.shadowRoot.querySelector('[data-index="0"]') as HTMLElement).click();
  }));
  expect(fromClick).toBe('click:[object HTMLDivElement]');

  const fromKeys = page.evaluate(() => new Promise<string>((resolve) => {
    const el = document.getElementById('palette') as any;
    el.addEventListener('action', (e: any) => resolve(`${e.detail.id}:${e.detail.sourceEvent?.type}:${e.detail.triggerElement ?? 'none'}`), { once: true });
  }));
  await expect(p.root).not.toHaveClass(/--active/);
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press('g');
  await page.keyboard.press('r');
  expect(await fromKeys).toBe('reload:keydown:none');
});

test('renderFeedbackCallback gets { type: "action", commandText, sentence } + the context', async ({ page }) => {
  const p = palette(page);
  await page.evaluate(() => document.getElementById('palette')!.setAttribute('show-feedback', 'true'));
  await openPalette(page);
  await p.input.fill('/reload');
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await ctxs(page)).feedback?.json?.type).toBe('action');
  const c = (await ctxs(page)).feedback;
  expect(c.json).toMatchObject({ type: 'action', commandId: 'reload', commandText: 'Reload', selections: [], sentence: '/reload' });
  expect(c.hasController && c.elementIsHost).toBe(true);
});
