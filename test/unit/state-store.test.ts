import { beforeEach, describe, expect, it } from 'vitest';
import { createStateStore } from '@keenmate/web-components-core';
import { UsageStore, stateStorePersistence } from '../../src/usage';
import type { PaletteUsageState } from '../../src/types';
import '../../src/index';

/**
 * The default favorites/recents persistence is core's state store (SPEC §12.17):
 * the whole list as `{ entries }` under `km-state:<tag>:<storage-key>`, or the
 * page's `loadStateCallback` / `saveStateCallback`. Browser behaviour (reload,
 * key switch, callbacks on the element): e2e/usage-limits, usage-state, usage-host.
 */

const flush = () => new Promise((r) => setTimeout(r, 0));
const host = () => document.createElement('web-command-palette');

beforeEach(() => localStorage.clear());

describe('stateStorePersistence', () => {
  it('stores the whole list as { entries } under km-state:<tag>:<key>; a new store loads it', async () => {
    const store = createStateStore<PaletteUsageState>(host(), { getKey: () => 'u1' });
    const usage = new UsageStore(stateStorePersistence(store), () => {});
    usage.load();
    await flush();
    usage.record({ kind: 'command', label: 'Reload', commandId: 'reload' });
    usage.toggleFavorite({ kind: 'command', label: 'Go', commandId: 'go' });
    await flush();
    const saved = JSON.parse(localStorage.getItem('km-state:web-command-palette:u1')!);
    expect(saved.entries.map((e: { key: string }) => e.key).sort()).toEqual(['command:go', 'command:reload']);

    const again = new UsageStore(stateStorePersistence(createStateStore<PaletteUsageState>(host(), { getKey: () => 'u1' })), () => {});
    again.load();
    await flush();
    expect(again.isFavorite('command:go')).toBe(true);
    expect(again.get('command:reload')?.count).toBe(1);
  });

  it('with the state callbacks: load gets { key }, save gets { key, state } = the whole list; localStorage untouched', async () => {
    const saves: { key: string; state: PaletteUsageState }[] = [];
    const store = createStateStore<PaletteUsageState>(host(), {
      getKey: () => 'k',
      getLoadCallback: () => ({ key }) => (key === 'k' ? { entries: [{ key: 'command:a', kind: 'command', label: 'A', commandId: 'a', count: 2, lastUsed: 1, isFavorite: false }] } : null),
      getSaveCallback: () => (ctx) => { saves.push(ctx); },
    });
    const usage = new UsageStore(stateStorePersistence(store), () => {});
    usage.load();
    await flush();
    usage.toggleFavorite({ kind: 'command', label: 'B', commandId: 'b' });
    await flush();
    expect(saves.at(-1)!.key).toBe('k');
    expect(saves.at(-1)!.state.entries.map((e) => e.key).sort()).toEqual(['command:a', 'command:b']);
    expect(localStorage.length).toBe(0);
  });
});

describe('<web-command-palette> storage inputs', () => {
  it('storage-key (default web-commandpalette:usage) replaces usage-key; the state callbacks are inputs', () => {
    const el = host() as HTMLElement & Record<string, unknown>;
    expect(el.storageKey).toBe('web-commandpalette:usage');
    el.setAttribute('storage-key', 'cp:usage:42');
    expect(el.storageKey).toBe('cp:usage:42');
    expect('usageKey' in el).toBe(false);
    const inputs = (customElements.get('web-command-palette') as unknown as { inputs: { configKey: string }[] }).inputs.map((d) => d.configKey);
    expect(inputs).toEqual(expect.arrayContaining(['storageKey', 'loadStateCallback', 'saveStateCallback', 'loadUsageCallback', 'saveUsageCallback', 'usageStorage']));
  });
});
