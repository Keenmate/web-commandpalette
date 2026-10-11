import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { COMMANDS, CONTEXTS, harness, titles } from './helpers';
import { MAX_RECENT_ENTRIES, UsageStore, frecency, usageKey } from '../../src/usage';
import type { Command, Context, Result, UsageEntry } from '../../src/types';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const sections = (m: ReturnType<typeof harness>['m']): string[] => [...new Set(m.items.map((i) => i.section ?? ''))];

describe('per-step load / per-context search', () => {
  it('a step with `load` uses it instead of stepOptionsCallback', () => {
    const load = vi.fn(() => [{ label: 'Alice' }, { label: 'Bob' }]);
    const stepOptions = vi.fn(() => []);
    const cmd: Command = { id: 'x', shortcut: '/x', name: 'X', steps: [{ id: 'user', load }] };
    const { m } = harness({ commands: [cmd], stepOptions });
    m.setInput('/x ');
    expect(titles(m)).toEqual(['Alice', 'Bob']);
    expect(load).toHaveBeenCalledWith({ commandId: 'x', stepId: 'user', query: '', selections: [] }, expect.any(AbortSignal));
    expect(stepOptions).not.toHaveBeenCalled();
  });

  it('a shared picker is reused across commands; steps without `load` fall back to the callback', () => {
    const pickUser = { search: true, load: vi.fn(({ query }: { query: string }) => [{ label: `user ${query}` }]) };
    const stepOptions = vi.fn(() => [{ label: 'write' }]);
    const cmd: Command = { id: 'perm', shortcut: '/perm', name: 'Perm', steps: [{ id: 'perm' }, { id: 'user', prompt: ' to ', ...pickUser }] };
    const { m } = harness({ commands: [cmd], stepOptions });
    m.setInput('/perm ');
    expect(stepOptions).toHaveBeenCalledTimes(1);
    m.select(); // write
    expect(pickUser.load).toHaveBeenCalledTimes(1);
    expect(titles(m)).toEqual(['user ']);
  });

  it('a context with `search` uses it instead of searchCallback (still: no call on an empty query)', async () => {
    const own = vi.fn((q: string) => [{ id: 't1', title: `ticket ${q}` }]);
    const search = vi.fn(() => []);
    const ctx: Context = { id: 'tickets', shortcut: ':tickets', name: 'Tickets', search: own };
    const { m } = harness({ contexts: [ctx], search });
    m.setInput(':tickets ');
    await vi.advanceTimersByTimeAsync(500);
    expect(own).not.toHaveBeenCalled();
    m.setInput(':tickets 42');
    await vi.advanceTimersByTimeAsync(150);
    expect(own).toHaveBeenCalledWith('42', expect.any(AbortSignal));
    expect(search).not.toHaveBeenCalled();
    expect(titles(m)).toEqual(['ticket 42']);
  });
});

describe('result groups', () => {
  it('clusters results by group in first-appearance order; local matches stay first', async () => {
    const results: Result[] = [
      { id: 'p1', title: 'Deploy guide', group: 'Docs' },
      { id: 'u1', title: 'Deploy bot', group: 'Users' },
      { id: 'p2', title: 'Deploy FAQ', group: 'Docs' },
    ];
    const { m } = harness({ search: () => results });
    m.setInput('deploy');
    await vi.advanceTimersByTimeAsync(150);
    expect(titles(m)).toEqual(['Deploy to Environment', 'Deploy guide', 'Deploy FAQ', 'Deploy bot']);
    expect(m.items.map((i) => i.group)).toEqual([undefined, 'Docs', 'Docs', 'Users']);
  });
});

describe('favorites + recents', () => {
  it('home shows Recent after use; instant commands, runs, contexts and results are recorded', async () => {
    const results: Result[] = [{ id: 'p1', title: 'iPad Air' }];
    const { m, store } = harness({ usage: true, search: () => results });
    expect(sections(m)).toEqual(['commands', 'contexts']);

    m.setInput('/signout');
    m.select();
    m.setInput('/go ');
    m.setInput('/go us');
    m.select(); // run: /go Users
    m.enterContext(CONTEXTS[0]);
    m.setInput(':products ipad');
    await vi.advanceTimersByTimeAsync(150);
    m.select(); // result

    const kinds = store!.all().map((e) => e.kind).sort();
    expect(kinds).toEqual(['command', 'context', 'result', 'run']);
    expect(store!.get(usageKey({ kind: 'run', label: '', commandId: 'go', selections: [{ stepId: 'page', label: 'Users', value: '/users', optionId: 'users', isFreeText: false }] }))?.label)
      .toBe('/go Users');

    m.reset();
    expect(sections(m)).toEqual(['recent', 'commands', 'contexts']);
    expect(m.items.filter((i) => i.section === 'recent').map((i) => i.kind)).toEqual(['usage', 'usage', 'usage', 'usage']);
  });

  it('starring: toggleFavorite moves a command into Favorites and keeps the active row on it', () => {
    const { m, store, saved } = harness({ usage: true });
    const deploy = m.items.findIndex((i) => i.title === 'Deploy to Environment');
    m.setActive(deploy);
    expect(m.activeFavorite).toBe(false);
    m.toggleFavorite();
    expect(store!.isFavorite('command:deploy')).toBe(true);
    expect(saved.at(-1)).toMatchObject({ key: 'command:deploy', isFavorite: true, count: 0 });
    expect(sections(m)).toEqual(['favorites', 'commands', 'contexts']);
    expect(m.items[m.activeIndex].title).toBe('Deploy to Environment');
    expect(m.items[m.activeIndex].section).toBe('commands');
    expect(m.activeFavorite).toBe(true);
    m.toggleFavorite();
    expect(sections(m)).toEqual(['commands', 'contexts']);
  });

  it('options are never starrable; search results are', async () => {
    const { m } = harness({ usage: true, search: () => [{ id: 'p1', title: 'iPad' }] });
    m.setInput('/go ');
    expect(m.activeFavorite).toBeUndefined();
    m.setInput('ipad');
    await vi.advanceTimersByTimeAsync(150);
    expect(m.activeFavorite).toBe(false);
    m.toggleFavorite();
    expect(m.activeFavorite).toBe(true);
  });

  it('entries for commands/contexts the user no longer has are hidden', () => {
    const { m, store, host } = harness({ usage: true });
    m.setInput('/signout');
    m.select();
    host.state.commands = COMMANDS.filter((c) => c.id !== 'signout');
    m.reset();
    expect(store!.all()).toHaveLength(1);
    expect(sections(m)).toEqual(['commands', 'contexts']);
  });

  it('recentLimit caps the Recent section; 0 hides it', () => {
    const { m, host } = harness({ usage: true, recentLimit: 1 });
    m.setInput('/signout');
    m.select();
    m.enterContext(CONTEXTS[1]);
    m.reset();
    expect(m.items.filter((i) => i.section === 'recent')).toHaveLength(1);
    host.state.recentLimit = 0;
    m.reset();
    expect(sections(m)).toEqual(['commands', 'contexts']);
  });
});

describe('compact home + full lists (Ctrl/⌘+F / R)', () => {
  /** Use n different /go pages so there are n distinct recent runs. */
  function useGo(m: ReturnType<typeof harness>['m'], pages: string[]): void {
    for (const p of pages) {
      m.setInput(`/go ${p}`);
      m.select();
    }
    m.reset();
  }

  it('home caps Recent/Favorites, rows are one-line, homeMore counts the rest', () => {
    const { m } = harness({ usage: true, recentLimit: 2 });
    useGo(m, ['Home', 'Users', 'Reports']);
    const recent = m.items.filter((i) => i.section === 'recent');
    expect(recent).toHaveLength(2);
    expect(recent.every((i) => i.meta === undefined)).toBe(true);
    expect(m.homeMore.recent).toBe(1);
  });

  it('showUsage lists everything with meta; typing filters; Esc goes home; the same key toggles', () => {
    const { m } = harness({ usage: true, recentLimit: 1 });
    useGo(m, ['Home', 'Users', 'Reports']);
    m.showUsage('recent');
    expect(m.mode).toBe('recent-list');
    expect(m.contextText).toBe('Recent');
    expect(m.items).toHaveLength(3);
    expect(m.items[0].meta).toBe('Go to Page');
    m.setInput('rep');
    expect(titles(m)).toEqual(['/go Reports']);
    expect(m.back()).toBe(true);
    expect(m.mode).toBe('idle');
    m.showUsage('recent');
    m.showUsage('recent');
    expect(m.mode).toBe('idle');
  });

  it('favorites list: empty hint names the star key; unstarring removes the row', () => {
    const { m, host } = harness({ usage: true });
    host.starKey = () => '⌘D';
    m.showUsage('favorites');
    expect(m.items).toEqual([]);
    expect(m.emptyText).toBe('No favorites yet — star a row with ⌘D');
    m.reset();
    m.toggleFavorite(0); // star the first command
    m.showUsage('favorites');
    expect(m.items).toHaveLength(1);
    m.toggleFavorite();
    expect(m.mode).toBe('favorites-list');
    expect(m.items).toEqual([]);
  });

  it('selecting from a full list behaves like from home (a run replays)', () => {
    const { m } = harness({ usage: true });
    useGo(m, ['Users']);
    m.showUsage('recent');
    m.select();
    expect(m.mode).toBe('command-step');
    expect(m.items[0]).toMatchObject({ title: 'Users', isDefault: true });
  });

  it('showUsage is a no-op when favorites are off', () => {
    const { m } = harness();
    m.showUsage('favorites');
    expect(m.mode).toBe('idle');
  });
});

describe('replaying a run (Tab steps, Enter finishes)', () => {
  const PERM: Command = {
    id: 'perm', shortcut: '/perm', name: 'Add permission',
    steps: [
      { id: 'perm', options: [{ id: 'read', label: 'read' }, { id: 'write', label: 'write' }] },
      { id: 'user', prompt: ' to ', options: [{ id: 'peter', label: 'Peter' }, { id: 'jane', label: 'Jane' }] },
    ],
  };

  function recordRun(): ReturnType<typeof harness> {
    const h = harness({ usage: true, commands: [PERM] });
    h.m.setInput('/perm wr');
    h.m.select(); // write
    h.m.setInput('/perm write to pe');
    h.m.select(); // Peter → complete
    h.effects.length = 0;
    h.m.reset();
    return h;
  }

  it('the recent run opens the wizard with the remembered answer first and active', () => {
    const { m } = recordRun();
    const run = m.items.findIndex((i) => i.section === 'recent');
    expect(m.items[run].title).toBe('/perm write to Peter');
    m.select(run);
    expect(m.mode).toBe('command-step');
    expect(titles(m)).toEqual(['write', 'read']);
    expect(m.items[0].isDefault).toBe(true);
    expect(m.canRun).toBe(true);
  });

  it('Enter accepts the remaining remembered answers and completes', () => {
    const { m, effects } = recordRun();
    m.select(m.items.findIndex((i) => i.section === 'recent'));
    m.commit();
    expect(effects).toEqual([{
      type: 'complete', commandId: 'perm', selections: [
        { stepId: 'perm', label: 'write', value: 'write', optionId: 'write', isFreeText: false },
        { stepId: 'user', label: 'Peter', value: 'Peter', optionId: 'peter', isFreeText: false },
      ],
    }]);
  });

  it('Tab accepts one step at a time; typing overrides that step, then Enter finishes', () => {
    const { m, effects } = recordRun();
    m.select(m.items.findIndex((i) => i.section === 'recent'));
    m.select(); // Tab: write
    expect(m.step?.id).toBe('user');
    expect(titles(m)).toEqual(['Peter', 'Jane']);
    m.setInput('/perm write to ja');
    expect(titles(m)).toEqual(['Jane']);
    m.commit();
    expect(effects[0]).toMatchObject({ type: 'complete', selections: [{ label: 'write' }, { label: 'Jane' }] });
  });

  it('Enter without a replay just selects (one step)', () => {
    const { m, effects } = harness({ commands: [PERM] });
    m.setInput('/perm ');
    m.commit();
    expect(m.step?.id).toBe('user');
    expect(effects).toEqual([]);
  });

  it('a remembered answer not in a search step\'s list is offered as its own row', () => {
    const live: Command = { id: 'who', shortcut: '/who', name: 'Who', steps: [{ id: 'user', search: true, freeText: true }] };
    const { m, effects } = harness({ usage: true, commands: [live], stepOptions: () => [] });
    m.setInput('/who ');
    m.setInput('/who someone');
    m.commit(); // free text
    expect(effects).toHaveLength(1);
    m.reset();
    m.select(m.items.findIndex((i) => i.section === 'recent'));
    expect(titles(m)).toEqual(['someone']);
    m.commit();
    expect(effects[1]).toMatchObject({ type: 'complete', selections: [{ stepId: 'user', label: 'someone', isFreeText: true }] });
  });

  it('replays through a branch (inline options)', () => {
    const ASSIGN: Command = {
      id: 'assign-admin', shortcut: '/assign-admin', name: 'Assign admin',
      steps: [
        { id: 'user', options: [{ id: 'john', label: 'John' }] },
        { id: 'target', prompt: ' to ', options: [
          { id: 'group', label: 'group', steps: [{ id: 'group', options: [{ label: 'Finance' }] }] },
          { id: 'site', label: 'site', steps: [{ id: 'site', options: [{ label: 'Intranet' }] }] },
        ] },
      ],
    };
    const { m, effects } = harness({ usage: true, commands: [ASSIGN] });
    m.setInput('/assign-admin ');
    m.select(); // John
    m.setInput('/assign-admin John to si');
    m.select(); // site
    m.select(); // Intranet
    m.reset();
    m.select(m.items.findIndex((i) => i.section === 'recent'));
    m.commit();
    expect(effects[1]).toMatchObject({ type: 'complete', selections: [{ stepId: 'user' }, { stepId: 'target', label: 'site' }, { stepId: 'site', label: 'Intranet' }] });
  });

  it('stops at a forking step whose options are still loading; Enter continues once loaded', async () => {
    let resolve!: (v: unknown) => void;
    const cmd: Command = {
      id: 'f', shortcut: '/f', name: 'F',
      steps: [
        { id: 'a', options: [{ label: 'one' }] },
        { id: 'kind', prompt: ' to ' }, // loaded via callback (async)
      ],
    };
    const kinds = [{ id: 'g', label: 'group', steps: [{ id: 'group', options: [{ label: 'Finance' }] }] }];
    let isAsync = false;
    const stepOptions = vi.fn(() => (isAsync ? new Promise((r) => { resolve = r; }) : kinds));
    const { m, effects } = harness({ usage: true, commands: [cmd], stepOptions });
    m.setInput('/f ');
    m.select(); // one
    m.select(); // group
    m.select(); // Finance → complete
    m.reset();
    isAsync = true;
    m.select(m.items.findIndex((i) => i.section === 'recent'));
    m.commit(); // accepts "one", stops at "kind" (loading — can't know the branch)
    expect(m.step?.id).toBe('kind');
    expect(effects).toHaveLength(1);
    resolve(kinds);
    await vi.advanceTimersByTimeAsync(0);
    expect(titles(m)).toEqual(['group']);
    m.commit();
    expect(effects[1]).toMatchObject({ type: 'complete', selections: [{ stepId: 'a' }, { stepId: 'kind' }, { stepId: 'group', label: 'Finance' }] });
  });
});

describe('UsageStore', () => {
  const entry = (key: string, over: Partial<UsageEntry> = {}): UsageEntry =>
    ({ key, kind: 'command', label: key, commandId: key, count: 1, lastUsed: Date.now(), isFavorite: false, ...over });

  it('frecency: frequent beats rare, recent beats stale', () => {
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;
    expect(frecency(entry('a', { count: 5, lastUsed: now }), now)).toBeGreaterThan(frecency(entry('b', { count: 1, lastUsed: now }), now));
    expect(frecency(entry('a', { count: 2, lastUsed: now }), now)).toBeGreaterThan(frecency(entry('b', { count: 3, lastUsed: now - 30 * day }), now));
  });

  it('prunes non-favorites beyond the cap, never favorites', () => {
    const store = new UsageStore(null, () => {});
    store.toggleFavorite({ kind: 'command', label: 'fav', commandId: 'fav' });
    for (let i = 0; i < MAX_RECENT_ENTRIES + 10; i++) store.record({ kind: 'command', label: `c${i}`, commandId: `c${i}` });
    expect(store.all()).toHaveLength(MAX_RECENT_ENTRIES + 1);
    expect(store.isFavorite('command:fav')).toBe(true);
  });

  it('async load: applies when resolved; a superseded load is dropped; bad rows are ignored', async () => {
    const onChange = vi.fn();
    let n = 0;
    const loads = [
      new Promise<UsageEntry[]>((r) => setTimeout(() => r([entry('old')]), 100)),
      Promise.resolve([entry('new'), { nope: true } as unknown as UsageEntry]),
    ];
    const store = new UsageStore({ load: () => loads[n++], save: () => {} }, onChange);
    store.load();
    store.load();
    await vi.advanceTimersByTimeAsync(200);
    expect(store.all().map((e) => e.key)).toEqual(['new']);
  });

  it('a failing persistence is reported, not thrown', async () => {
    const onError = vi.fn();
    const store = new UsageStore({ load: () => Promise.reject(new Error('x')), save: () => { throw new Error('y'); } }, () => {}, onError);
    store.load();
    await vi.advanceTimersByTimeAsync(0);
    store.record({ kind: 'command', label: 'a', commandId: 'a' });
    expect(onError).toHaveBeenCalledTimes(2);
  });
});
