import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { COMMANDS, CONTEXTS, harness, titles } from './helpers';
import type { Command, Option, Result } from '../../src/types';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('idle home', () => {
  it('lists commands then contexts, first row active', () => {
    const { m } = harness();
    expect(m.mode).toBe('idle');
    expect(titles(m)).toEqual(['Go to Page', 'Deploy to Environment', 'Sign out', 'Products', 'Users']);
    expect(m.items[0].section).toBe('commands');
    expect(m.items[3].section).toBe('contexts');
    expect(m.activeIndex).toBe(0);
  });

  it('shows hotkey keycaps for commands and the shortcut for contexts', () => {
    const { m } = harness();
    expect(m.items[0].keys).toEqual(['g', 'g']);
    expect(m.items[2].keys).toEqual(['/signout']);
    expect(m.items[3].keys).toEqual([':products']);
  });

  it('selecting a home command enters it; a home context enters scoped search', () => {
    const { m } = harness();
    m.select(0);
    expect(m.mode).toBe('command-step');
    expect(m.input).toBe('/go ');
    m.reset();
    m.select(3);
    expect(m.mode).toBe('context-search');
    expect(m.input).toBe(':products ');
  });

  it('whitespace-only input stays on the home screen without clearing the input', () => {
    const { m } = harness();
    m.setInput('  ');
    expect(m.mode).toBe('idle');
    expect(m.input).toBe('  ');
  });
});

describe('keyboard navigation (pure state, no provider)', () => {
  it('arrows wrap; page/home/end clamp', () => {
    const { m } = harness();
    m.move('up');
    expect(m.activeIndex).toBe(4);
    m.move('down');
    expect(m.activeIndex).toBe(0);
    m.move('pageDown');
    expect(m.activeIndex).toBe(4);
    m.move('pageUp');
    expect(m.activeIndex).toBe(0);
    m.move('end');
    expect(m.activeIndex).toBe(4);
    m.move('home');
    expect(m.activeIndex).toBe(0);
  });

  it('does not bump listVersion (renderer only repaints the active row)', () => {
    const { m } = harness();
    const v = m.listVersion;
    m.move('down');
    expect(m.listVersion).toBe(v);
  });
});

describe('command list (/)', () => {
  it('"/" lists all commands, client-side', () => {
    const stepOptions = vi.fn();
    const { m } = harness({ stepOptions });
    m.setInput('/');
    expect(m.mode).toBe('command-list');
    expect(titles(m)).toEqual(['Go to Page', 'Deploy to Environment', 'Sign out']);
    expect(stepOptions).not.toHaveBeenCalled();
  });

  it('filters by substring over name/shortcut/aliases/description', () => {
    const { m } = harness();
    m.setInput('/dep');
    expect(titles(m)).toEqual(['Deploy to Environment']);
    m.setInput('/session');
    expect(titles(m)).toEqual(['Sign out']);
    m.setInput('/zzz');
    expect(m.items).toEqual([]);
    expect(m.emptyText).toBe('No results found');
  });

  it('exact shortcut or alias + space enters the command', () => {
    const { m } = harness();
    m.setInput('/g ');
    expect(m.mode).toBe('command-step');
    expect(m.command?.id).toBe('go');
    expect(m.input).toBe('/go ');
    expect(m.lockedLength).toBe(4);
  });

  it('typed query after the shortcut becomes the first step query', () => {
    const { m } = harness();
    m.setInput('/go rep');
    expect(m.input).toBe('/go rep');
    expect(m.query).toBe('rep');
    expect(titles(m)).toEqual(['Reports']);
  });

  it('an instant command fires `command`', () => {
    const { m, effects } = harness();
    m.setInput('/signout');
    m.select();
    expect(effects).toEqual([{ type: 'command', commandId: 'signout' }]);
  });
});

describe('command steps (wizard)', () => {
  it('static step with inline options: client filter, then complete', () => {
    const { m, effects } = harness();
    m.setInput('/go ');
    expect(titles(m)).toEqual(['Home', 'Users', 'Reports']);
    m.setInput('/go us');
    expect(titles(m)).toEqual(['Users']);
    m.select();
    expect(effects).toEqual([
      { type: 'complete', commandId: 'go', selections: [{ stepId: 'page', label: 'Users', value: '/users', optionId: 'users', isFreeText: false }] },
    ]);
  });

  it('static step via stepOptionsCallback: fetched ONCE (empty query), filtered client-side', () => {
    const envs: Option[] = [{ label: 'Production', value: 'prod' }, { label: 'Staging', value: 'stage' }];
    const stepOptions = vi.fn(() => envs);
    const { m } = harness({ stepOptions });
    m.setInput('/deploy ');
    expect(stepOptions).toHaveBeenCalledTimes(1);
    expect(stepOptions.mock.calls[0][0]).toEqual({ commandId: 'deploy', stepId: 'env', query: '', selections: [] });
    expect(m.input).toBe('/deploy to ');
    m.setInput('/deploy to sta');
    m.setInput('/deploy to stag');
    expect(titles(m)).toEqual(['Staging']);
    expect(stepOptions).toHaveBeenCalledTimes(1);
  });

  it('search:true step calls the provider per debounced keystroke, with prior selections', async () => {
    const stepOptions = vi.fn((ctx: { stepId: string; query: string }) =>
      ctx.stepId === 'env' ? [{ label: 'Production', value: 'prod' }] : [{ label: `feat/${ctx.query}`, value: ctx.query }]);
    const { m } = harness({ stepOptions });
    m.setInput('/deploy ');
    m.select(); // Production
    expect(m.input).toBe('/deploy to Production branch ');
    expect(stepOptions).toHaveBeenCalledTimes(2); // env (static) + branch entry
    m.setInput('/deploy to Production branch a');
    m.setInput('/deploy to Production branch ab');
    expect(stepOptions).toHaveBeenCalledTimes(2); // debounced
    await vi.advanceTimersByTimeAsync(150);
    expect(stepOptions).toHaveBeenCalledTimes(3);
    const ctx = stepOptions.mock.calls[2][0] as unknown as { query: string; selections: unknown[] };
    expect(ctx.query).toBe('ab');
    expect(ctx.selections).toEqual([{ stepId: 'env', label: 'Production', value: 'prod', isFreeText: false }]);
    expect(titles(m)).toEqual(['feat/ab']);
  });

  it('freeText: Enter with no match submits the typed text', () => {
    const { m, effects } = harness();
    m.setInput('/go /custom/path');
    expect(m.items).toEqual([]);
    m.select();
    expect(effects[0]).toEqual({
      type: 'complete', commandId: 'go',
      selections: [{ stepId: 'page', label: '/custom/path', value: '/custom/path', isFreeText: true }],
    });
  });

  it('shouldShow skips steps', () => {
    const { m, effects } = harness({
      commands: [{
        id: 'x', shortcut: '/x', name: 'X',
        steps: [
          { id: 'a', options: [{ label: 'skip' }, { label: 'ask' }] },
          { id: 'b', options: [{ label: 'B1' }], shouldShow: (sel) => sel[0]?.label === 'ask' },
        ],
      }],
    });
    m.setInput('/x ');
    m.select(0); // skip → b hidden → complete
    expect(effects[0]).toMatchObject({ type: 'complete', commandId: 'x' });
    expect((effects[0] as { selections: unknown[] }).selections).toHaveLength(1);
  });

  it('back(): previous step, then the command list', () => {
    const stepOptions = vi.fn(() => [{ label: 'Production', value: 'prod' }]);
    const { m } = harness({ stepOptions });
    m.setInput('/deploy ');
    m.select();
    expect(m.step?.id).toBe('branch');
    expect(m.back()).toBe(true);
    expect(m.step?.id).toBe('env');
    expect(m.selections).toEqual([]);
    expect(m.input).toBe('/deploy to ');
    expect(m.back()).toBe(true);
    expect(m.mode).toBe('command-list');
    expect(m.input).toBe('/');
  });

  it('tokens display: input holds only the query; tokens carry the sentence', () => {
    const { m, host } = harness({ display: 'tokens', stepOptions: () => [{ label: 'Production', value: 'prod' }] });
    m.setInput('/deploy ');
    expect(m.input).toBe('');
    expect(m.lockedLength).toBe(0);
    m.select();
    expect(m.tokens).toEqual([
      { type: 'command', label: '/deploy' },
      { type: 'prompt', label: 'to' },
      { type: 'selection', label: 'Production', index: 0 },
      { type: 'prompt', label: 'branch' },
    ]);
    m.removeToken(0);
    expect(m.step?.id).toBe('env');
    expect(m.selections).toEqual([]);
    // switching display re-lays the input
    host.state.display = 'inline';
    m.displayChanged();
    expect(m.input).toBe('/deploy to ');
  });

  describe('branching (option.steps)', () => {
    const ASSIGN: Command = {
      id: 'assign-admin', shortcut: '/assign-admin', name: 'Assign admin',
      steps: [
        { id: 'user', options: [{ id: 'john', label: 'John' }] },
        { id: 'target', prompt: ' to ', options: [
          { id: 'group', label: 'group', steps: [{ id: 'group', options: [{ label: 'Finance' }] }] },
          { id: 'site', label: 'site', steps: [{ id: 'site', options: [{ label: 'Intranet' }] }] },
        ] },
        { id: 'role', prompt: ' as ', options: [{ label: 'owner' }] },
      ],
    };

    it('an option with steps splices them in before the remaining siblings', () => {
      const { m, effects } = harness({ commands: [ASSIGN] });
      m.setInput('/assign-admin ');
      m.select(); // John
      m.setInput('/assign-admin John to si');
      m.select(); // site
      expect(m.step?.id).toBe('site');
      expect(m.input).toBe('/assign-admin John to site ');
      expect(titles(m)).toEqual(['Intranet']);
      m.select();
      expect(m.step?.id).toBe('role');
      m.select();
      expect(effects[0]).toEqual({
        type: 'complete', commandId: 'assign-admin', selections: [
          { stepId: 'user', label: 'John', value: 'John', optionId: 'john', isFreeText: false },
          { stepId: 'target', label: 'site', value: 'site', optionId: 'site', isFreeText: false },
          { stepId: 'site', label: 'Intranet', value: 'Intranet', isFreeText: false },
          { stepId: 'role', label: 'owner', value: 'owner', isFreeText: false },
        ],
      });
    });

    it('stepping back past the branching answer drops its branch', () => {
      const { m } = harness({ commands: [ASSIGN] });
      m.setInput('/assign-admin ');
      m.select(); // John
      m.select(); // group
      expect(m.step?.id).toBe('group');
      m.back(); // re-ask target
      expect(m.step?.id).toBe('target');
      m.setInput('/assign-admin John to si');
      m.select(); // site
      expect(m.step?.id).toBe('site');
      m.select();
      expect(m.step?.id).toBe('role'); // the group branch is gone
    });

    it('removeToken before the branch rebuilds the plan', () => {
      const { m } = harness({ commands: [ASSIGN], display: 'tokens' });
      m.setInput('/assign-admin ');
      m.select(); // John
      m.select(); // group
      m.select(); // Finance
      expect(m.step?.id).toBe('role');
      m.removeToken(1); // drop "group" and everything after
      expect(m.step?.id).toBe('target');
      expect(m.selections.map((s) => s.stepId)).toEqual(['user']);
    });

    it('branch steps can come from stepOptionsCallback (plain JSON)', () => {
      const stepOptions = vi.fn((ctx: { stepId: string }) =>
        ctx.stepId === 'kind' ? [{ label: 'group', steps: [{ id: 'group', search: true }] }] : [{ label: 'Finance' }]);
      const cmd: Command = { id: 'x', shortcut: '/x', name: 'X', steps: [{ id: 'kind' }] };
      const { m } = harness({ commands: [cmd], stepOptions });
      m.setInput('/x ');
      m.select(); // group (from the callback)
      expect(m.step?.id).toBe('group');
    });
  });

  it('breaking the locked prefix leaves the wizard and re-routes', () => {
    const { m } = harness();
    m.setInput('/go ');
    m.setInput('hello');
    expect(m.mode).toBe('global-search');
    expect(m.command).toBeNull();
  });
});

describe('context search (:)', () => {
  it('":" lists contexts client-side; exact alias + space enters with the canonical locked prefix', () => {
    const search = vi.fn();
    const { m } = harness({ search });
    m.setInput(':');
    expect(m.mode).toBe('context-list');
    expect(titles(m)).toEqual(['Products', 'Users']);
    m.setInput(':p ');
    expect(m.mode).toBe('context-search');
    expect(m.input).toBe(':products ');
    expect(m.lockedLength).toBe(':products '.length);
    expect(m.contextText).toBe('Searching in Products');
    expect(search).not.toHaveBeenCalled();
  });

  it('EMPTY query never calls the provider — shows "Type to search"', async () => {
    const search = vi.fn(() => []);
    const { m } = harness({ search });
    m.enterContext(CONTEXTS[0]);
    await vi.advanceTimersByTimeAsync(500);
    expect(search).not.toHaveBeenCalled();
    expect(m.items).toEqual([]);
    expect(m.emptyText).toBe('Type to search Products');
    m.setInput(':products    ');
    await vi.advanceTimersByTimeAsync(500);
    expect(search).not.toHaveBeenCalled();
  });

  it('non-empty query → debounced searchCallback({contextId}, q)', async () => {
    const results: Result[] = [{ id: 'p1', title: 'iPad Air', badge: 'New', badgeVariant: 'info' }];
    const search = vi.fn(() => results);
    const { m, effects } = harness({ search });
    m.setInput(':p ipad');
    expect(m.isLoading).toBe(true);
    await vi.advanceTimersByTimeAsync(150);
    expect(search).toHaveBeenCalledTimes(1);
    expect(search.mock.calls[0].slice(0, 2)).toEqual([{ contextId: 'products' }, 'ipad']);
    expect(titles(m)).toEqual(['iPad Air']);
    expect(m.items[0].badge).toBe('New');
    m.select();
    expect(effects).toEqual([{ type: 'select', item: results[0], scope: { contextId: 'products' } }]);
  });

  it('back() returns to the context list', () => {
    const { m } = harness();
    m.setInput(':u ');
    expect(m.back()).toBe(true);
    expect(m.mode).toBe('context-list');
    expect(m.input).toBe(':');
  });
});

describe('global search', () => {
  it('surfaces matching commands/contexts with NO searchCallback', () => {
    const { m } = harness();
    m.setInput('go');
    expect(m.mode).toBe('global-search');
    expect(titles(m)).toEqual(['Go to Page']);
    expect(m.items[0].badge).toBe('/go');
    m.select();
    expect(m.mode).toBe('command-step');
  });

  it('prepends local matches immediately, appends provider results after the debounce', async () => {
    const search = vi.fn(async () => [{ id: 'u1', title: 'User Goran' }]);
    const { m } = harness({ search });
    m.setInput('go');
    expect(titles(m)).toEqual(['Go to Page']);
    expect(m.isLoading).toBe(true);
    await vi.advanceTimersByTimeAsync(150);
    expect(search.mock.calls[0].slice(0, 2)).toEqual(['global', 'go']);
    expect(titles(m)).toEqual(['Go to Page', 'User Goran']);
    expect(m.isLoading).toBe(false);
    m.select(1);
  });

  it('selecting a provider result emits select with scope "global"', async () => {
    const hit = { id: 'u1', title: 'Alice' };
    const { m, effects } = harness({ search: () => [hit] });
    m.setInput('alice');
    await vi.advanceTimersByTimeAsync(150);
    m.select();
    expect(effects).toEqual([{ type: 'select', item: hit, scope: 'global' }]);
  });

  it('a superseded request is aborted and its late result ignored', async () => {
    const resolvers: Array<(r: Result[]) => void> = [];
    const signals: AbortSignal[] = [];
    const search = vi.fn((_s: unknown, _q: string, signal: AbortSignal) => {
      signals.push(signal);
      return new Promise<Result[]>((res) => resolvers.push(res));
    });
    const { m } = harness({ search, commands: [], contexts: [] });
    m.setInput('a');
    await vi.advanceTimersByTimeAsync(150);
    m.setInput('ab');
    expect(signals[0].aborted).toBe(true);
    await vi.advanceTimersByTimeAsync(150);
    resolvers[1]([{ id: '2', title: 'second' }]);
    await vi.advanceTimersByTimeAsync(0);
    resolvers[0]([{ id: '1', title: 'stale' }]);
    await vi.advanceTimersByTimeAsync(0);
    expect(titles(m)).toEqual(['second']);
  });

  it('paginates client-side; turnPage never calls the provider again', async () => {
    const hits = Array.from({ length: 20 }, (_, i) => ({ id: String(i), title: `Hit ${i}` }));
    const search = vi.fn(() => hits);
    const { m } = harness({ search, commands: [], contexts: [], pageSize: 8 });
    m.setInput('hit');
    await vi.advanceTimersByTimeAsync(150);
    expect(m.totalPages).toBe(3);
    expect(m.isPaginated).toBe(true);
    expect(m.pageText).toBe('Page 1 of 3 · 20 results');
    expect(m.turnPage(1)).toBe(true);
    expect(titles(m)[0]).toBe('Hit 8');
    expect(m.turnPage(1)).toBe(true);
    expect(m.items).toHaveLength(4);
    expect(m.turnPage(1)).toBe(false);
    expect(search).toHaveBeenCalledTimes(1);
  });

  it('a throwing provider degrades to the local matches', async () => {
    const error = vi.fn();
    const h = harness({ search: () => { throw new Error('boom'); } });
    h.host.error = error;
    h.m.setInput('go');
    await vi.advanceTimersByTimeAsync(150);
    expect(titles(h.m)).toEqual(['Go to Page']);
    expect(h.m.isLoading).toBe(false);
    expect(error).toHaveBeenCalled();
  });
});

describe('misc', () => {
  it('Esc outside a back-able mode asks to close', () => {
    const { m, effects } = harness();
    expect(m.back()).toBe(false);
    expect(effects).toEqual([{ type: 'close' }]);
  });

  it('refresh() rebuilds the home screen after commands change', () => {
    const h = harness();
    h.host.state.commands = [COMMANDS[2]];
    h.m.refresh();
    expect(titles(h.m)).toEqual(['Sign out', 'Products', 'Users']);
  });
});
