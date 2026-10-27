import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { harness, titles } from './helpers';
import type { Effect } from '../../src/palette';
import type { Command } from '../../src/types';

/**
 * The interaction model in the engine: commands are core action items
 * (visibility / disabled / text via get*Callback), every callback gets ONE ctx
 * (with the host's component context attached), and a host can veto an effect.
 */

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const WIZARD: Command = {
  id: 'go', trigger: '/go', text: 'Go to Page',
  steps: [{ id: 'page', options: [{ id: 'home', text: 'Home', value: '/' }, { id: 'users', text: 'Users', value: '/users' }] }],
};
const INSTANT: Command = { id: 'reload', trigger: '/reload', text: 'Reload' };

describe('commands are action items', () => {
  it('isVisible / getIsVisibleCallback hide a command everywhere (home, / list, global search, usage)', () => {
    const hidden: Command = { id: 'secret', trigger: '/secret', text: 'Secret', getIsVisibleCallback: () => false };
    const off: Command = { id: 'off', trigger: '/off', text: 'Off', isVisible: false };
    const { m } = harness({ commands: [WIZARD, hidden, off], contexts: [] });
    expect(titles(m)).toEqual(['Go to Page']);
    m.setInput('/');
    expect(titles(m)).toEqual(['Go to Page']);
    m.setInput('secret');
    expect(titles(m)).toEqual([]);
    m.setInput('/secret ');
    expect(m.mode).toBe('command-list');
  });

  it('a disabled command is listed (greyed) but does not run', () => {
    const disabled: Command = { ...INSTANT, isDisabled: true };
    const { m, effects } = harness({ commands: [disabled], contexts: [] });
    expect(m.items[0]).toMatchObject({ title: 'Reload', isDisabled: true });
    m.select(0);
    expect(effects).toEqual([]);
    expect(m.isCommandEnabled(disabled)).toBe(false);
  });

  it('getTextCallback / getIconCallback / getTooltipCallback / getClassCallback / isDanger shape the row', () => {
    const cmd: Command = {
      ...INSTANT,
      getTextCallback: () => 'Reload now',
      getIconCallback: () => '↻',
      tooltip: 'static tip',
      getTooltipCallback: () => 'dynamic tip',
      getClassCallback: () => ['a', 'b'],
      isDanger: true,
    };
    const { m } = harness({ commands: [cmd], contexts: [] });
    expect(m.items[0]).toMatchObject({ title: 'Reload now', icon: '↻', tooltip: 'dynamic tip', cssClass: 'a b', isDanger: true });
  });

  it('item callbacks get the render ctx (selections: []) with the host component context', () => {
    const seen: unknown[] = [];
    const cmd: Command = { ...INSTANT, getIsDisabledCallback: (ctx) => (seen.push(ctx), false) };
    const h = harness({ commands: [cmd], contexts: [] });
    const controller = { isOpen: true };
    h.host.context = <T extends object>(fields: T): T =>
      Object.defineProperty(fields, 'controller', { value: controller, enumerable: false }) as T;
    h.m.reset();
    const ctx = seen.at(-1) as { selections: unknown[]; controller: unknown };
    expect(ctx.selections).toEqual([]);
    expect(ctx.controller).toBe(controller);
    expect(Object.keys(ctx)).toEqual(['selections']);
  });
});

describe('steps + search take one ctx', () => {
  it('Step.getIsVisibleCallback gets { commandId, stepId, selections }', () => {
    const calls: unknown[] = [];
    const cmd: Command = {
      id: 'x', trigger: '/x', text: 'X',
      steps: [
        { id: 'a', options: [{ text: 'A1' }] },
        { id: 'b', options: [{ text: 'B1' }], getIsVisibleCallback: (ctx) => (calls.push(ctx), true) },
      ],
    };
    const { m } = harness({ commands: [cmd], contexts: [] });
    m.setInput('/x ');
    m.select();
    expect(calls).toEqual([{ commandId: 'x', stepId: 'b', selections: [{ stepId: 'a', label: 'A1', value: 'A1', isFreeText: false }] }]);
  });

  it('the search ctx keeps `signal` non-enumerable (plain JSON for a bridge)', async () => {
    const search = vi.fn(() => []);
    const { m } = harness({ search });
    m.setInput('abc');
    await vi.advanceTimersByTimeAsync(150);
    const ctx = (search.mock.calls[0] as unknown[])[0] as { signal: AbortSignal };
    expect(ctx.signal).toBeInstanceOf(AbortSignal);
    expect(JSON.parse(JSON.stringify(ctx))).toEqual({ scope: 'global', term: 'abc' });
  });
});

describe('host veto (effect returns false)', () => {
  const vetoAll = (h: ReturnType<typeof harness>, answer: (e: Effect) => unknown): void => {
    h.host.effect = (e: Effect) => {
      h.effects.push(e.type === 'action' ? { type: 'action', commandId: e.command.id, selections: e.selections } : e);
      return answer(e) as boolean;
    };
  };

  it('a vetoed wizard steps back to its last answer; nothing is recorded', () => {
    const h = harness({ commands: [WIZARD], contexts: [], usage: true });
    vetoAll(h, () => false);
    h.m.setInput('/go ');
    h.m.select(1); // Users → completes → vetoed
    expect(h.effects).toHaveLength(1);
    expect(h.m.mode).toBe('command-step');
    expect(h.m.selections).toEqual([]);
    expect(h.m.step?.id).toBe('page');
    expect(h.saved).toEqual([]);
  });

  it('an async veto steps back once it resolves', async () => {
    const h = harness({ commands: [WIZARD], contexts: [], usage: true });
    vetoAll(h, () => Promise.resolve(false));
    h.m.setInput('/go ');
    h.m.select(0);
    expect(h.m.selections).toHaveLength(1); // pending
    await vi.advanceTimersByTimeAsync(0);
    expect(h.m.selections).toEqual([]);
    expect(h.m.step?.id).toBe('page');
    expect(h.saved).toEqual([]);
  });

  it('an accepted (async) action records the run', async () => {
    const h = harness({ commands: [WIZARD], contexts: [], usage: true });
    vetoAll(h, () => Promise.resolve(true));
    h.m.setInput('/go ');
    h.m.select(0);
    expect(h.saved).toEqual([]);
    await vi.advanceTimersByTimeAsync(0);
    expect(h.saved.map((e) => e.kind)).toEqual(['run']);
  });

  it('a vetoed instant command leaves the palette as it was', () => {
    const h = harness({ commands: [INSTANT, WIZARD], contexts: [], usage: true });
    vetoAll(h, () => false);
    h.m.setInput('/');
    const before = titles(h.m);
    h.m.select(0);
    expect(h.effects).toEqual([{ type: 'action', commandId: 'reload', selections: [] }]);
    expect(h.m.mode).toBe('command-list');
    expect(titles(h.m)).toEqual(before);
    expect(h.saved).toEqual([]);
  });

  it('a vetoed search result records nothing', () => {
    const hit = { id: 'u1', title: 'Alice' };
    const h = harness({ search: () => [hit], usage: true });
    vetoAll(h, () => false);
    h.m.setInput('ali');
    vi.advanceTimersByTime(150);
    h.m.select(h.m.items.findIndex((i) => i.kind === 'result'));
    expect(h.effects).toEqual([{ type: 'select', result: hit, scope: 'global' }]);
    expect(h.saved).toEqual([]);
  });
});
