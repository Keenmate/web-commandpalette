import { vi } from 'vitest';
import { PaletteEngine, type Effect, type PaletteEngineHost } from '../../src/palette';
import { UsageStore } from '../../src/usage';
import { DEFAULT_LABELS, type Command, type Context, type Display, type SearchCallback, type Selection, type StepOptionsCallback, type UsageEntry } from '../../src/types';

/** An effect as the tests compare it: `action` reduced to the command id + selections. */
export type TestEffect =
  | Exclude<Effect, { type: 'action' }>
  | { type: 'action'; commandId: string; selections: Selection[] };

export const COMMANDS: Command[] = [
  {
    id: 'go', trigger: '/go', aliases: ['/g'], shortcut: 'g g', text: 'Go to Page', description: 'Navigate to a page', icon: '🧭',
    steps: [{ id: 'page', placeholder: 'Type a page…', isFreeTextAllowed: true, options: [
      { id: 'home', text: 'Home', value: '/' },
      { id: 'users', text: 'Users', value: '/users' },
      { id: 'reports', text: 'Reports', value: '/reports' },
    ] }],
  },
  {
    id: 'deploy', trigger: '/deploy', aliases: ['/d'], shortcut: 'g d', text: 'Deploy to Environment', description: 'Deploy a branch',
    steps: [
      { id: 'env', prompt: ' to ' },
      { id: 'branch', prompt: ' branch ', isFreeTextAllowed: true, isLiveSearch: true },
    ],
  },
  { id: 'signout', trigger: '/signout', text: 'Sign out', description: 'End the session' },
];

export const CONTEXTS: Context[] = [
  { id: 'products', trigger: ':products', aliases: [':p'], text: 'Products', description: 'Search products' },
  { id: 'users', trigger: ':users', aliases: [':u'], text: 'Users', description: 'Search users' },
];

export interface Harness {
  m: PaletteEngine;
  effects: TestEffect[];
  changed: ReturnType<typeof vi.fn>;
  host: PaletteEngineHost & { state: HostState };
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
  const effects: TestEffect[] = [];
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
  let m: PaletteEngine | null = null;
  const store = state.usage
    ? new UsageStore({ load: () => [], save: (entry) => { saved.push(entry); } }, () => m?.usageChanged())
    : null;
  const host = {
    state,
    commands: () => state.commands,
    contexts: () => state.contexts,
    searchCallback: () => state.search,
    getStepOptionsCallback: () => state.stepOptions,
    display: () => state.display,
    pageSize: () => state.pageSize,
    debounceMs: () => state.debounce,
    labels: () => DEFAULT_LABELS,
    usage: () => store,
    recentLimit: () => state.recentLimit,
    changed: () => changed(),
    effect: (e: Effect) => {
      effects.push(e.type === 'action' ? { type: 'action', commandId: e.command.id, selections: e.selections } : e);
    },
  };
  m = new PaletteEngine(host);
  return { m, effects, changed, host, store, saved };
}

/** Flush pending promise callbacks. */
export const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

export const titles = (m: PaletteEngine): string[] => m.items.map((i) => i.title);
