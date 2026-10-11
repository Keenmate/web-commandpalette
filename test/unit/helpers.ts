import { vi } from 'vitest';
import { PaletteMachine, type Effect, type MachineHost } from '../../src/palette';
import { UsageStore } from '../../src/usage';
import { DEFAULT_LABELS, type Command, type Context, type Display, type SearchCallback, type StepOptionsCallback, type UsageEntry } from '../../src/types';

export const COMMANDS: Command[] = [
  {
    id: 'go', shortcut: '/go', aliases: ['/g'], hotkey: 'g g', name: 'Go to Page', description: 'Navigate to a page', icon: '🧭',
    steps: [{ id: 'page', placeholder: 'Type a page…', freeText: true, options: [
      { id: 'home', label: 'Home', value: '/' },
      { id: 'users', label: 'Users', value: '/users' },
      { id: 'reports', label: 'Reports', value: '/reports' },
    ] }],
  },
  {
    id: 'deploy', shortcut: '/deploy', aliases: ['/d'], hotkey: 'g d', name: 'Deploy to Environment', description: 'Deploy a branch',
    steps: [
      { id: 'env', prompt: ' to ' },
      { id: 'branch', prompt: ' branch ', freeText: true, search: true },
    ],
  },
  { id: 'signout', shortcut: '/signout', name: 'Sign out', description: 'End the session' },
];

export const CONTEXTS: Context[] = [
  { id: 'products', shortcut: ':products', aliases: [':p'], name: 'Products', description: 'Search products' },
  { id: 'users', shortcut: ':users', aliases: [':u'], name: 'Users', description: 'Search users' },
];

export interface Harness {
  m: PaletteMachine;
  effects: Effect[];
  changed: ReturnType<typeof vi.fn>;
  host: MachineHost & { state: HostState };
  /** The in-memory favorites/recents store (when `usage: true`). */
  store: UsageStore | null;
  /** What the store last persisted. */
  saved: UsageEntry[];
}

interface HostState {
  commands: Command[];
  contexts: Context[];
  search: SearchCallback | null;
  stepOptions: StepOptionsCallback | null;
  display: Display;
  pageSize: number;
  debounce: number;
  /** Turn favorites/recents on (in-memory). */
  usage: boolean;
  recentLimit: number;
}

export function harness(over: Partial<HostState> = {}): Harness {
  const effects: Effect[] = [];
  const changed = vi.fn();
  const state: HostState = {
    commands: COMMANDS,
    contexts: CONTEXTS,
    search: null,
    stepOptions: null,
    display: 'inline',
    pageSize: 8,
    debounce: 150,
    usage: false,
    recentLimit: 5,
    ...over,
  };
  const saved: UsageEntry[] = [];
  let m: PaletteMachine | null = null;
  const store = state.usage
    ? new UsageStore({ load: () => [], save: (entry) => { saved.push(entry); } }, () => m?.usageChanged())
    : null;
  const host = {
    state,
    commands: () => state.commands,
    contexts: () => state.contexts,
    searchCallback: () => state.search,
    stepOptionsCallback: () => state.stepOptions,
    display: () => state.display,
    pageSize: () => state.pageSize,
    debounceMs: () => state.debounce,
    labels: () => DEFAULT_LABELS,
    usage: () => store,
    recentLimit: () => state.recentLimit,
    changed: () => changed(),
    effect: (e: Effect) => effects.push(e),
  };
  m = new PaletteMachine(host);
  return { m, effects, changed, host, store, saved };
}

/** Flush pending promise callbacks. */
export const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

export const titles = (m: PaletteMachine): string[] => m.items.map((i) => i.title);
