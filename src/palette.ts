/**
 * The palette MACHINE — modes, transitions, the wizard, filtering and async search
 * (IMPLEMENTATION_PLAN §10). Framework- and DOM-free: it owns state and exposes a
 * read-only view; the element feeds it input/keys and renders the view. Unit-tested
 * directly (test/unit/palette.test.ts).
 *
 * Behavioural sources of truth: pure-admin `command-palette.js` (routing, wizard,
 * keyboard) and keen `live.ex` (step-back, pagination, global prepend).
 */
import { filterCommands, filterContexts, filterOptions, findByShortcut, globalMatches, matchesAny } from './filter';
import { cloneResult, cloneSelections, usageKey, type UsageStore, type UsageTarget } from './usage';
import type {
  Command,
  Context,
  Display,
  Labels,
  Mode,
  Option,
  Result,
  Scope,
  SearchCallback,
  Selection,
  Step,
  StepOptionsCallback,
  UsageEntry,
} from './types';

/** PgUp/PgDn jump (matches all three legacy implementations). */
export const PAGE_STEP = 8;

/** What the machine needs from its host (the element). Read live on every use. */
export interface MachineHost {
  commands(): readonly Command[];
  contexts(): readonly Context[];
  searchCallback(): SearchCallback | null;
  stepOptionsCallback(): StepOptionsCallback | null;
  display(): Display;
  pageSize(): number;
  debounceMs(): number;
  labels(): Labels;
  /** Favorites/recents store, or null when disabled. */
  usage?(): UsageStore | null;
  /** How many recent entries the home screen shows. */
  recentLimit?(): number;
  /** How many favorites the home screen shows. */
  favoritesLimit?(): number;
  /** The star shortcut's keycap text (for `labels.noFavorites`). */
  starKey?(): string;
  /** State changed — re-render. */
  changed(): void;
  /** A terminal outcome. The host performs it (dispatch + close). */
  effect(effect: Effect): void;
  /** Provider failures (rejected promise / throw). */
  error?(message: string, err: unknown): void;
}

export type Effect =
  | { type: 'select'; item: Result; scope: Scope }
  | { type: 'complete'; commandId: string; selections: Selection[] }
  | { type: 'command'; commandId: string }
  | { type: 'close' };

export type ItemKind = 'command' | 'context' | 'option' | 'result' | 'usage';

export type HomeSection = 'favorites' | 'recent' | 'commands' | 'contexts';

/** The two full remembered-item lists. */
export type UsageView = 'favorites' | 'recent';

/** One rendered row. `ref` is the host's original object. */
export interface ViewItem {
  kind: ItemKind;
  title: string;
  meta?: string;
  icon?: string;
  badge?: string;
  badgeVariant?: string;
  /** Keycaps shown at the row's end. */
  keys?: string[];
  /** Home-screen grouping. */
  section?: HomeSection;
  /** Search-result grouping (`Result.group`). */
  group?: string;
  /** Star state; `undefined` = the row can't be starred. */
  favorite?: boolean;
  /** Usage identity of a starrable row. */
  key?: string;
  /** Search scope of a result row. */
  scope?: Scope;
  /** A remembered answer offered first on a replayed wizard step. */
  isDefault?: boolean;
  /** The remembered answer itself, when its option isn't in the current list. */
  selection?: Selection;
  ref: Command | Context | Option | Result | UsageEntry;
}

/** A tokens-display fragment (above the input). */
export type TokenView =
  | { type: 'command'; label: string }
  | { type: 'prompt'; label: string }
  | { type: 'selection'; label: string; index: number };

export type NavDirection = 'up' | 'down' | 'pageUp' | 'pageDown' | 'home' | 'end';

const fill = (template: string, values: Record<string, string | number>): string =>
  template.replace(/\{(\w+)\}/g, (m, k: string) => (k in values ? String(values[k]) : m));

/** Split a hotkey into keycaps: `"g d"` → `[g, d]`, `"Ctrl+K"` → `[Ctrl, K]`. */
export const hotkeyKeys = (hotkey: string): string[] => hotkey.split(/[+\s]+/).filter(Boolean);

function commandItem(c: Command, section?: 'commands'): ViewItem {
  return {
    kind: 'command',
    title: c.name,
    meta: c.description,
    icon: c.icon,
    keys: section && c.hotkey ? hotkeyKeys(c.hotkey) : [c.shortcut],
    section,
    key: usageKey({ kind: 'command', label: c.name, commandId: c.id }),
    ref: c,
  };
}

function contextItem(c: Context, section?: 'contexts'): ViewItem {
  return {
    kind: 'context', title: c.name, meta: c.description, icon: c.icon, keys: [c.shortcut], section,
    key: usageKey({ kind: 'context', label: c.name, contextId: c.id }),
    ref: c,
  };
}

/** A command/context surfaced in global search: shortcut as a badge (keen/core parity). */
function globalEntryItem(kind: 'command' | 'context', e: Command | Context): ViewItem {
  const key = kind === 'command'
    ? usageKey({ kind, label: e.name, commandId: e.id })
    : usageKey({ kind, label: e.name, contextId: e.id });
  return { kind, title: e.name, meta: e.description, icon: e.icon, badge: e.shortcut, key, ref: e };
}

function optionItem(o: Option): ViewItem {
  return { kind: 'option', title: o.label, meta: o.description, icon: o.icon, ref: o };
}

function resultItem(r: Result, scope: Scope): ViewItem {
  return {
    kind: 'result',
    title: r.title,
    meta: r.subtitle,
    icon: r.icon,
    badge: r.badge,
    badgeVariant: r.badgeVariant,
    group: typeof r.group === 'string' && r.group ? r.group : undefined,
    scope,
    key: usageKey({ kind: 'result', label: r.title, item: r, scope }),
    ref: r,
  };
}

/** Stable cluster by `group`, in first-appearance order (ungrouped rows keep their place). */
function clusterByGroup(items: ViewItem[]): ViewItem[] {
  if (!items.some((i) => i.group)) return items;
  const order: string[] = [];
  const buckets = new Map<string, ViewItem[]>();
  for (const item of items) {
    const g = item.group ?? '';
    let bucket = buckets.get(g);
    if (!bucket) buckets.set(g, (bucket = [])), order.push(g);
    bucket.push(item);
  }
  return order.flatMap((g) => buckets.get(g)!);
}

const matchesSelection = (o: Option, sel: Selection): boolean =>
  sel.optionId != null ? o.id === sel.optionId : o.label === sel.label;

const isThenable = <T>(v: unknown): v is PromiseLike<T> =>
  !!v && (typeof v === 'object' || typeof v === 'function') && typeof (v as PromiseLike<T>).then === 'function';

export class PaletteMachine {
  #host: MachineHost;

  // ── public, read-only view state ──────────────────────────────────────────
  mode: Mode = 'idle';
  /** The input's text, as the machine wants it displayed. */
  input = '';
  /** Characters at the start of `input` the user can't edit (the locked prefix). */
  lockedLength = 0;
  /** Rows on the current page. */
  items: ViewItem[] = [];
  activeIndex = -1;
  /** Bumped whenever `items` is replaced (vs. just the active row moving). */
  listVersion = 0;
  isLoading = false;
  /** Text for the empty state when `items` is empty and nothing is loading. */
  emptyText: string | null = null;
  /** The query to `<mark>` in titles. */
  highlight = '';
  page = 1;
  totalPages = 1;
  totalResults = 0;
  /** Home screen: favorites / recent rows not shown (beyond the limits). */
  homeMore: Record<UsageView, number> = { favorites: 0, recent: 0 };

  // ── wizard / context state ────────────────────────────────────────────────
  command: Command | null = null;
  stepIndex = -1;
  selections: Selection[] = [];
  context: Context | null = null;

  /** The running command's step list with chosen options' branch steps spliced in. */
  #plan: Step[] = [];
  /** Branch steps carried by each selection's option, parallel to `selections`. */
  #branches: (Step[] | undefined)[] = [];
  /** Remembered answers of a replayed run (offered first; Enter accepts the rest). */
  #replay: Selection[] | null = null;

  /** All search hits (every page) in a search mode. */
  #allResults: ViewItem[] = [];
  /** A static step's full option set (null = not loaded yet). */
  #stepOptions: Option[] | null = null;
  #stepQuery = '';
  #timer: ReturnType<typeof setTimeout> | null = null;
  #request: AbortController | null = null;

  constructor(host: MachineHost) {
    this.#host = host;
    this.#home();
  }

  // ── derived view ──────────────────────────────────────────────────────────

  get step(): Step | null {
    return this.#plan[this.stepIndex] ?? null;
  }

  /** The editable part of the input (after the locked prefix). */
  get query(): string {
    return this.input.slice(this.lockedLength);
  }

  get isPaginated(): boolean {
    return (this.mode === 'context-search' || this.mode === 'global-search') && this.totalPages > 1;
  }

  /** Esc/Backspace step back (rather than close) in these modes. */
  get canStepBack(): boolean {
    return this.mode === 'command-step' || this.mode === 'context-search' || this.usageView !== null;
  }

  /** The full favorites/recent list being shown, or null. */
  get usageView(): UsageView | null {
    return this.mode === 'favorites-list' ? 'favorites' : this.mode === 'recent-list' ? 'recent' : null;
  }

  /** Enter would accept the remembered answers still ahead (a replayed run). */
  get canRun(): boolean {
    return this.mode === 'command-step' && !!this.#replay;
  }

  /** The active row's star state; `undefined` when it can't be starred. */
  get activeFavorite(): boolean | undefined {
    return this.items[this.activeIndex]?.favorite;
  }

  /** Text of the context pill, or null when hidden. */
  get contextText(): string | null {
    const labels = this.#host.labels();
    switch (this.mode) {
      case 'command-list': return labels.commands;
      case 'context-list': return labels.searchContexts;
      case 'command-step': return this.command?.name ?? null;
      case 'context-search': return this.context ? fill(labels.searchingIn, { name: this.context.name }) : null;
      case 'favorites-list': return labels.favorites;
      case 'recent-list': return labels.recent;
      default: return null;
    }
  }

  get placeholder(): string {
    const labels = this.#host.labels();
    if (this.mode === 'command-step') return this.step?.placeholder || labels.filterPlaceholder;
    if (this.usageView) return labels.filterPlaceholder;
    return labels.placeholder;
  }

  /** Tokens-display fragments, or null when the tokens row is not in use. */
  get tokens(): TokenView[] | null {
    if (this.mode !== 'command-step' || this.#host.display() !== 'tokens' || !this.command) return null;
    const out: TokenView[] = [{ type: 'command', label: this.command.shortcut }];
    this.selections.forEach((sel, index) => {
      const prompt = this.#stepById(sel.stepId)?.prompt?.trim();
      if (prompt) out.push({ type: 'prompt', label: prompt });
      out.push({ type: 'selection', label: sel.label, index });
    });
    const prompt = this.step?.prompt?.trim();
    if (prompt) out.push({ type: 'prompt', label: prompt });
    return out;
  }

  /**
   * The running/just-finished command's answers as prompt + answer fragments
   * (`to` `Staging` `branch` `main`) — what the confirmation panel shows.
   */
  get answerParts(): TokenView[] {
    const out: TokenView[] = [];
    this.selections.forEach((sel, index) => {
      const prompt = this.#stepById(sel.stepId)?.prompt?.trim();
      if (prompt) out.push({ type: 'prompt', label: prompt });
      out.push({ type: 'selection', label: sel.label, index });
    });
    return out;
  }

  /** `"/deploy to Staging branch main"` — the command and its answers so far. */
  get sentence(): string {
    return this.#sentence();
  }

  get pageText(): string | null {
    if (this.totalPages <= 1) return null;
    return fill(this.#host.labels().pageOf, { page: this.page, total: this.totalPages, count: this.totalResults });
  }

  // ── lifecycle ─────────────────────────────────────────────────────────────

  /** Back to the idle home screen, dropping all wizard/search state. */
  reset(): void {
    this.#cancel();
    this.#clearWizard();
    this.context = null;
    this.input = '';
    this.#home();
    this.#changed();
  }

  /** Stop timers and in-flight requests (on close / disconnect). */
  dispose(): void {
    this.#cancel();
  }

  /** commands/contexts were replaced — refresh views derived from them. */
  refresh(): void {
    if (this.mode === 'idle') { this.#home(); this.#changed(); }
    else if (this.mode === 'command-list' || this.mode === 'context-list') this.setInput(this.input);
  }

  /** Favorites/recents changed — rebuild the home screen, or re-sync the stars on the current list. */
  usageChanged(): void {
    const view = this.usageView;
    if (this.mode === 'idle' || view) {
      const active = this.items[this.activeIndex];
      if (view) this.#showUsageList(view, this.input);
      else this.#home();
      if (active) {
        const same = this.items.findIndex((i) => i.key === active.key && i.section === active.section);
        const sameKey = same >= 0 ? same : this.items.findIndex((i) => i.key === active.key);
        if (sameKey >= 0) this.activeIndex = sameKey;
      }
    } else {
      const store = this.#host.usage?.();
      for (const item of this.#allResults) {
        if (item.favorite !== undefined && item.key) item.favorite = store?.isFavorite(item.key) ?? false;
      }
      this.listVersion++;
    }
    this.#changed();
  }

  /** `display` changed — re-lay the current step's input/tokens, keeping the typed query. */
  displayChanged(): void {
    if (this.mode !== 'command-step') return;
    this.#layStepInput(this.#stepQuery);
    this.#changed();
  }

  // ── input ─────────────────────────────────────────────────────────────────

  /** The input's value changed (user typing, or a programmatic `openWith`). */
  setInput(value: string): void {
    this.input = value;
    if (this.mode === 'command-step' && this.command) {
      if (this.#host.display() === 'inline') {
        const prefix = this.#stepPrefix();
        if (!value.startsWith(prefix)) return this.#leave(value);
        this.#onStepQuery(value.slice(prefix.length));
      } else {
        this.#onStepQuery(value);
      }
      return;
    }
    if (this.mode === 'context-search' && this.context) {
      const prefix = this.context.shortcut + ' ';
      if (!value.startsWith(prefix)) return this.#leave(value);
      this.#onContextQuery(value.slice(prefix.length));
      return;
    }
    const view = this.usageView;
    if (view) {
      this.#showUsageList(view, value);
      this.#changed();
      return;
    }
    this.#route(value);
  }

  /** The locked prefix was broken (e.g. select-all + type): drop the mode and re-route. */
  #leave(value: string): void {
    this.#cancel();
    this.#clearWizard();
    this.context = null;
    this.lockedLength = 0;
    this.#route(value);
  }

  #clearWizard(): void {
    this.command = null;
    this.stepIndex = -1;
    this.selections = [];
    this.#branches = [];
    this.#plan = [];
    this.#replay = null;
    this.#stepOptions = null;
  }

  #route(value: string): void {
    this.#cancel();
    this.lockedLength = 0;
    const v = value.trimStart();
    if (!v) {
      this.#home();
    } else if (v.startsWith('/')) {
      this.#onCommandInput(v);
    } else if (v.startsWith(':')) {
      this.#onContextInput(v);
    } else {
      this.#onGlobalInput(v.trim());
    }
    this.#changed();
  }

  #home(): void {
    this.mode = 'idle';
    this.lockedLength = 0;
    this.highlight = '';
    this.isLoading = false;
    this.emptyText = null;
    const store = this.#host.usage?.() ?? null;
    // Home rows are capped and one-line; the full lists live behind Ctrl/⌘+F / R.
    const capped = (view: UsageView, limit: number): ViewItem[] => {
      const all = this.#usageItems(view, true);
      this.homeMore[view] = Math.max(0, all.length - limit);
      return all.slice(0, limit);
    };
    this.homeMore = { favorites: 0, recent: 0 };
    const star = <T extends ViewItem>(item: T): T => (store && item.key ? { ...item, favorite: store.isFavorite(item.key) } : item);
    this.#setItems([
      ...(store ? capped('favorites', this.#host.favoritesLimit?.() ?? 3) : []),
      ...(store ? capped('recent', this.#host.recentLimit?.() ?? 3) : []),
      ...this.#host.commands().map((c) => star(commandItem(c, 'commands'))),
      ...this.#host.contexts().map((c) => star(contextItem(c, 'contexts'))),
    ]);
  }

  /** Rows for every visible favorite / recent entry. `compact` = one-line home rows (no meta). */
  #usageItems(view: UsageView, compact: boolean): ViewItem[] {
    const store = this.#host.usage?.();
    if (!store) return [];
    const list = view === 'favorites' ? store.favorites() : store.recent(Number.MAX_SAFE_INTEGER);
    return list.map((e) => this.#usageItem(e, view, compact)).filter((i): i is ViewItem => !!i);
  }

  /** A remembered entry as a row — or null when it points at a command/context this user no longer has. */
  #usageItem(e: UsageEntry, section: HomeSection, compact: boolean): ViewItem | null {
    const base = { kind: 'usage' as const, section, favorite: e.isFavorite, key: e.key, ref: e };
    const meta = (text: string | undefined): string | undefined => (compact ? undefined : text);
    switch (e.kind) {
      case 'command': {
        const c = this.#host.commands().find((x) => x.id === e.commandId);
        return c ? { ...base, title: c.name, meta: meta(c.description), icon: c.icon, keys: [c.shortcut] } : null;
      }
      case 'run': {
        const c = this.#host.commands().find((x) => x.id === e.commandId);
        return c ? { ...base, title: e.label, meta: meta(c.name), icon: c.icon } : null;
      }
      case 'context': {
        const c = this.#host.contexts().find((x) => x.id === e.contextId);
        return c ? { ...base, title: c.name, meta: meta(c.description), icon: c.icon, keys: [c.shortcut] } : null;
      }
      case 'result':
        return e.item ? { ...base, title: e.item.title, meta: meta(e.item.subtitle), icon: e.item.icon } : null;
    }
    return null;
  }

  /**
   * Show every favorite / recent item (Ctrl/⌘+F / R, `g f`). Typing filters; Esc or
   * Backspace on an empty input goes home. Asking for the view already shown goes
   * home too, so the shortcut toggles. No-op when favorites are off.
   */
  showUsage(view: UsageView): void {
    if (!this.#host.usage?.()) return;
    if (this.usageView === view) {
      this.reset();
      return;
    }
    this.#cancel();
    this.#clearWizard();
    this.context = null;
    this.lockedLength = 0;
    this.#showUsageList(view, '');
    this.#changed();
  }

  #showUsageList(view: UsageView, query: string): void {
    this.mode = view === 'favorites' ? 'favorites-list' : 'recent-list';
    this.input = query;
    const q = query.trim();
    this.highlight = q;
    this.isLoading = false;
    const all = this.#usageItems(view, false);
    const labels = this.#host.labels();
    this.emptyText = all.length
      ? labels.emptyText
      : view === 'favorites'
        ? fill(labels.noFavorites, { key: this.#host.starKey?.() ?? 'Ctrl D' })
        : labels.noRecent;
    this.#setItems(q ? all.filter((i) => matchesAny([i.title, i.meta], q)) : all);
  }

  // ── favorites ─────────────────────────────────────────────────────────────

  /** Star / unstar row `index` (default: the active row). No-op for rows that can't be starred. */
  toggleFavorite(index = this.activeIndex): void {
    const item = this.items[index];
    const store = this.#host.usage?.();
    if (!item || item.favorite === undefined || !store) return;
    const target = this.#targetOf(item);
    if (!target) return;
    if (this.mode === 'idle') this.activeIndex = index;
    store.toggleFavorite(target); // → usageChanged() via the store's onChange
  }

  #targetOf(item: ViewItem): UsageTarget | null {
    switch (item.kind) {
      case 'usage': return item.ref as UsageEntry;
      case 'command': { const c = item.ref as Command; return { kind: 'command', label: c.name, commandId: c.id }; }
      case 'context': { const c = item.ref as Context; return { kind: 'context', label: c.name, contextId: c.id }; }
      case 'result': {
        const r = item.ref as Result;
        return { kind: 'result', label: r.title, item: cloneResult(r), scope: item.scope ?? 'global' };
      }
      default: return null;
    }
  }

  #record(target: UsageTarget): void {
    this.#host.usage?.()?.record(target);
  }

  // ── commands ──────────────────────────────────────────────────────────────

  #onCommandInput(v: string): void {
    const space = v.indexOf(' ');
    if (space >= 0) {
      const exact = findByShortcut(this.#host.commands(), v.slice(0, space));
      if (exact) return this.#enterCommand(exact, v.slice(space + 1).trimStart());
    }
    const needle = v.slice(1).trim();
    this.mode = 'command-list';
    this.highlight = needle;
    this.isLoading = false;
    this.emptyText = this.#host.labels().emptyText;
    this.#setItems(this.#starred(filterCommands(this.#host.commands(), needle).map((c) => commandItem(c))));
  }

  /** Mark starrable rows with their current star state (only when favorites are on). */
  #starred(items: ViewItem[]): ViewItem[] {
    const store = this.#host.usage?.();
    if (!store) return items;
    for (const item of items) if (item.key) item.favorite = store.isFavorite(item.key);
    return items;
  }

  /**
   * Enter a command: instant commands fire immediately; otherwise start the wizard.
   * `replay` = remembered answers to offer first (a recent run).
   */
  enterCommand(command: Command, initialQuery = '', replay?: Selection[]): void {
    this.#enterCommand(command, initialQuery, replay);
    this.#changed();
  }

  #enterCommand(command: Command, initialQuery: string, replay?: Selection[]): void {
    this.#cancel();
    this.context = null;
    this.#clearWizard();
    this.command = command;
    this.#plan = [...(command.steps ?? [])];
    this.#replay = replay?.length ? cloneSelections(replay) : null;
    if (!command.steps?.length) {
      this.#record({ kind: 'command', label: command.name, commandId: command.id });
      this.#host.effect({ type: 'command', commandId: command.id });
      return;
    }
    const first = this.#nextShownStep(-1);
    if (first < 0) {
      // Every step is hidden by shouldShow — nothing to ask.
      this.#host.effect({ type: 'complete', commandId: command.id, selections: [] });
      return;
    }
    this.mode = 'command-step';
    this.stepIndex = first;
    this.#enterStep(initialQuery);
  }

  #stepById(id: string): Step | undefined {
    return this.#plan.find((s) => s.id === id);
  }

  /** Drop answers from `index` on and rebuild the plan from the branches that remain. */
  #truncate(index: number): void {
    this.selections = this.selections.slice(0, index);
    this.#branches = this.#branches.slice(0, index);
    const plan = [...(this.command?.steps ?? [])];
    this.selections.forEach((sel, i) => {
      const branch = this.#branches[i];
      if (branch?.length) plan.splice(plan.findIndex((s) => s.id === sel.stepId) + 1, 0, ...branch);
    });
    this.#plan = plan;
  }

  /** Index of the next step after `from` whose `shouldShow` passes, or -1. */
  #nextShownStep(from: number): number {
    const steps = this.#plan;
    for (let i = from + 1; i < steps.length; i++) {
      const s = steps[i];
      if (!s.shouldShow || s.shouldShow(this.selections)) return i;
    }
    return -1;
  }

  /** `"/assign iPad Air to "` — everything before the current step's editable text. */
  #stepPrefix(): string {
    if (!this.command) return '';
    return this.#sentence() + (this.step?.prompt ?? ' ');
  }

  /** `"/assign iPad Air to John"` — the command and its answers so far. */
  #sentence(): string {
    let text = this.command?.shortcut ?? '';
    for (const sel of this.selections) text += (this.#stepById(sel.stepId)?.prompt ?? ' ') + sel.label;
    return text;
  }

  #layStepInput(query: string): void {
    if (this.#host.display() === 'inline') {
      const prefix = this.#stepPrefix();
      this.input = prefix + query;
      this.lockedLength = prefix.length;
    } else {
      this.input = query;
      this.lockedLength = 0;
    }
  }

  #defaultFor(step: Step | null): Selection | undefined {
    return step ? this.#replay?.find((s) => s.stepId === step.id) : undefined;
  }

  /** Option rows for the current step; on an empty query a remembered answer goes first. */
  #stepItems(options: Option[]): ViewItem[] {
    const def = this.#defaultFor(this.step);
    if (!def || this.#stepQuery.trim()) return options.map(optionItem);
    const badge = this.#host.labels().lastUsed;
    const at = options.findIndex((o) => matchesSelection(o, def));
    if (at >= 0) {
      const rest = options.filter((_, i) => i !== at);
      return [{ ...optionItem(options[at]), isDefault: true, badge }, ...rest.map(optionItem)];
    }
    const synthetic: Option = { label: def.label, value: def.value };
    if (def.optionId != null) synthetic.id = def.optionId;
    return [{ ...optionItem(synthetic), isDefault: true, badge, selection: def }, ...options.map(optionItem)];
  }

  #enterStep(query: string): void {
    this.#cancel();
    this.#stepOptions = null;
    this.#stepQuery = query;
    this.highlight = query.trim();
    this.#layStepInput(query);
    this.emptyText = null;
    this.#setItems(this.#stepItems([]));
    const step = this.step!;
    if (step.search) {
      this.#fetchStepOptions(query, true);
    } else if (step.options) {
      this.#stepOptions = step.options;
      this.#applyStepFilter();
    } else {
      // Static step: fetch the FULL set once (empty query), then filter client-side.
      this.#fetchStepOptions('', false);
    }
  }

  #onStepQuery(query: string): void {
    this.#stepQuery = query;
    this.highlight = query.trim();
    if (this.step?.search) {
      this.#cancel();
      this.isLoading = true;
      this.#changed();
      this.#timer = setTimeout(() => {
        this.#timer = null;
        this.#fetchStepOptions(query, true);
      }, this.#host.debounceMs());
      return;
    }
    if (this.#stepOptions) this.#applyStepFilter();
    this.#changed();
  }

  #applyStepFilter(): void {
    const opts = filterOptions(this.#stepOptions ?? [], this.#stepQuery);
    this.isLoading = false;
    this.emptyText = this.#host.labels().emptyText;
    this.#setItems(this.#stepItems(opts));
  }

  /** `isLive`: the result IS the list (search step); else it's the full set to filter. */
  #fetchStepOptions(query: string, isLive: boolean): void {
    const step = this.step!;
    const cb = step.load ?? this.#host.stepOptionsCallback();
    const command = this.command!;
    if (!cb) {
      this.#stepOptions = [];
      this.#applyStepFilter();
      return;
    }
    this.#run(
      (signal) => cb({ commandId: command.id, stepId: step.id, query, selections: cloneSelections(this.selections) }, signal),
      (options) => {
        const list = (options ?? []) as Option[];
        if (isLive) {
          this.isLoading = false;
          this.emptyText = this.#host.labels().emptyText;
          this.#setItems(this.#stepItems(list));
        } else {
          this.#stepOptions = list;
          this.#applyStepFilter();
        }
      },
    );
  }

  /** Record an answer and advance (or complete). Returns true when the command completed. */
  #choose(selection: Selection, branch?: Step[]): boolean {
    this.selections = [...this.selections, selection];
    this.#branches = [...this.#branches, branch];
    if (branch?.length) this.#plan.splice(this.stepIndex + 1, 0, ...branch);
    const next = this.#nextShownStep(this.stepIndex);
    if (next < 0) {
      this.#cancel();
      const command = this.command!;
      const selections = cloneSelections(this.selections);
      this.#record({ kind: 'run', label: this.#sentence(), commandId: command.id, selections });
      this.#host.effect({ type: 'complete', commandId: command.id, selections: cloneSelections(selections) });
      return true;
    }
    this.stepIndex = next;
    this.#enterStep('');
    return false;
  }

  /**
   * Replay: accept remembered answers from the current step on, until one is
   * missing or a forking answer's option isn't known yet (its list still loading)
   * — then stop there and let the user continue.
   */
  #fastForward(): void {
    const replay = this.#replay;
    if (!replay) return;
    while (this.mode === 'command-step') {
      const step = this.step;
      const def = this.#defaultFor(step);
      if (!step || !def) return;
      const option = this.#resolveOption(step, def);
      if (option === undefined && this.#mayFork(def, replay)) return;
      if (this.#choose({ ...def }, option?.steps)) return;
    }
  }

  /** The option a remembered answer picked: found, `null` (free text / gone), or `undefined` (list unknown). */
  #resolveOption(step: Step, def: Selection): Option | null | undefined {
    if (def.isFreeText) return null;
    const list = step.options ?? (step === this.step ? this.#stepOptions : null);
    if (!list) return undefined;
    return list.find((o) => matchesSelection(o, def)) ?? null;
  }

  /** Did the remembered run continue with a step that isn't a later sibling (i.e. a branch)? */
  #mayFork(def: Selection, replay: Selection[]): boolean {
    const next = replay[replay.indexOf(def) + 1];
    if (!next) return false;
    return !this.#plan.slice(this.stepIndex + 1).some((s) => s.id === next.stepId);
  }

  /** Tokens display: drop a recorded answer (and everything after it) and re-ask that step. */
  removeToken(index: number): void {
    if (this.mode !== 'command-step' || !this.command || index < 0 || index >= this.selections.length) return;
    const removed = this.selections[index];
    this.#truncate(index);
    this.stepIndex = this.#plan.findIndex((s) => s.id === removed.stepId);
    this.#enterStep('');
    this.#changed();
  }

  // ── contexts ──────────────────────────────────────────────────────────────

  #onContextInput(v: string): void {
    const space = v.indexOf(' ');
    if (space >= 0) {
      const exact = findByShortcut(this.#host.contexts(), v.slice(0, space));
      if (exact) return this.#enterContext(exact, v.slice(space + 1).trimStart());
    }
    const needle = v.slice(1).trim();
    this.mode = 'context-list';
    this.highlight = needle;
    this.isLoading = false;
    this.emptyText = this.#host.labels().emptyText;
    this.#setItems(this.#starred(filterContexts(this.#host.contexts(), needle).map((c) => contextItem(c))));
  }

  /** Enter scoped search: the input becomes `"<shortcut> "` (locked) + `query`. */
  enterContext(context: Context, query = ''): void {
    this.#enterContext(context, query);
    this.#changed();
  }

  #enterContext(context: Context, query: string): void {
    this.#cancel();
    this.#clearWizard();
    this.mode = 'context-search';
    this.context = context;
    const prefix = context.shortcut + ' ';
    this.input = prefix + query;
    this.lockedLength = prefix.length;
    this.#onContextQuery(query, true);
    this.#record({ kind: 'context', label: context.name, contextId: context.id });
  }

  #onContextQuery(query: string, isEntry = false): void {
    this.#cancel();
    const q = query.trim();
    this.highlight = q;
    if (!q) {
      // The rule that started this project: an empty context query NEVER hits the
      // provider — prompt instead of dumping "top N" results.
      this.isLoading = false;
      this.emptyText = fill(this.#host.labels().typeToSearch, { name: this.context!.name });
      this.#setResults([]);
      if (!isEntry) this.#changed();
      return;
    }
    this.#debouncedSearch({ contextId: this.context!.id }, q, [], isEntry);
  }

  // ── global search ─────────────────────────────────────────────────────────

  #onGlobalInput(q: string): void {
    this.mode = 'global-search';
    this.highlight = q;
    // Matching commands/contexts are known locally — show them with zero latency,
    // then append the provider's hits. Works with no searchCallback at all.
    const local = this.#starred([
      ...globalMatches(this.#host.commands(), q).map((c) => globalEntryItem('command', c)),
      ...globalMatches(this.#host.contexts(), q).map((c) => globalEntryItem('context', c)),
    ]);
    if (!this.#host.searchCallback()) {
      this.isLoading = false;
      this.emptyText = this.#host.labels().emptyText;
      this.#setResults(local);
      return;
    }
    this.#debouncedSearch('global', q, local, true);
  }

  // ── search plumbing ───────────────────────────────────────────────────────

  /** The provider for `scope`: the context's own `search`, else `searchCallback`. */
  #searchFor(scope: Scope): ((signal: AbortSignal) => unknown) | null {
    if (scope !== 'global') {
      const own = this.#host.contexts().find((c) => c.id === scope.contextId)?.search;
      if (own) return (signal) => own(this.#searchQuery, signal);
    }
    const cb = this.#host.searchCallback();
    return cb ? (signal) => cb(scope, this.#searchQuery, signal) : null;
  }

  #searchQuery = '';

  /** Show `prefix` + a loading state now; call the provider after the debounce. */
  #debouncedSearch(scope: Scope, q: string, prefix: ViewItem[], silent: boolean): void {
    this.isLoading = true;
    this.emptyText = null;
    this.#setResults(prefix);
    if (!silent) this.#changed();
    this.#timer = setTimeout(() => {
      this.#timer = null;
      this.#searchQuery = q;
      const call = this.#searchFor(scope);
      if (!call) {
        this.isLoading = false;
        this.emptyText = this.#host.labels().emptyText;
        this.#setResults(prefix);
        this.#changed();
        return;
      }
      this.#run(
        (signal) => call(signal) as Result[] | PromiseLike<Result[]>,
        (results) => {
          this.isLoading = false;
          this.emptyText = this.#host.labels().emptyText;
          this.#setResults([...prefix, ...this.#starred(((results ?? []) as Result[]).map((r) => resultItem(r, scope)))]);
        },
      );
    }, this.#host.debounceMs());
  }

  /**
   * Invoke a provider with a fresh AbortSignal, superseding (aborting) any request
   * in flight. A late result from a superseded request is dropped — it must never
   * overwrite live state. Sync returns apply immediately (no loader flash).
   */
  #run<T>(call: (signal: AbortSignal) => T | PromiseLike<T>, apply: (value: T | null) => void): void {
    this.#request?.abort();
    const controller = new AbortController();
    this.#request = controller;
    const done = (value: T | null): void => {
      if (controller.signal.aborted || this.#request !== controller) return;
      this.#request = null;
      apply(value);
      this.#changed();
    };
    const fail = (err: unknown): void => {
      if (controller.signal.aborted) return;
      this.#host.error?.('provider failed', err);
      done(null);
    };
    let out: T | PromiseLike<T>;
    try {
      out = call(controller.signal);
    } catch (err) {
      fail(err);
      return;
    }
    if (isThenable<T>(out)) {
      this.isLoading = true;
      this.#changed();
      out.then(done, fail);
    } else {
      done(out);
    }
  }

  #cancel(): void {
    if (this.#timer) clearTimeout(this.#timer);
    this.#timer = null;
    this.#request?.abort();
    this.#request = null;
    this.isLoading = false;
  }

  // ── list / pagination ─────────────────────────────────────────────────────

  #setItems(items: ViewItem[]): void {
    this.#allResults = items;
    this.page = 1;
    this.totalPages = 1;
    this.totalResults = items.length;
    this.items = items;
    this.activeIndex = items.length ? 0 : -1;
    this.listVersion++;
  }

  #setResults(all: ViewItem[]): void {
    this.#allResults = clusterByGroup(all);
    this.totalResults = all.length;
    this.totalPages = Math.max(1, Math.ceil(all.length / Math.max(1, this.#host.pageSize())));
    this.#showPage(1);
  }

  #showPage(page: number): void {
    const size = Math.max(1, this.#host.pageSize());
    this.page = Math.min(Math.max(1, page), this.totalPages);
    this.items = this.#allResults.slice((this.page - 1) * size, this.page * size);
    this.activeIndex = this.items.length ? 0 : -1;
    this.listVersion++;
  }

  /** ←/→ in a paginated search mode. Returns whether the page changed. Client-side only. */
  turnPage(delta: 1 | -1): boolean {
    if (!this.isPaginated) return false;
    const target = Math.min(Math.max(1, this.page + delta), this.totalPages);
    if (target === this.page) return false;
    this.#showPage(target);
    this.#changed();
    return true;
  }

  /** Move the active row. Pure client-side; never touches a provider. Arrows wrap, the rest clamp. */
  move(dir: NavDirection): void {
    const len = this.items.length;
    if (!len) return;
    const at = this.activeIndex;
    const from = at < 0 ? 0 : at;
    switch (dir) {
      case 'down': this.activeIndex = at >= len - 1 ? 0 : at + 1; break;
      case 'up': this.activeIndex = at <= 0 ? len - 1 : at - 1; break;
      case 'pageDown': this.activeIndex = Math.min(len - 1, from + PAGE_STEP); break;
      case 'pageUp': this.activeIndex = Math.max(0, from - PAGE_STEP); break;
      case 'home': this.activeIndex = 0; break;
      case 'end': this.activeIndex = len - 1; break;
    }
    this.#changed();
  }

  /** Point the active row at `index` (e.g. pointer hover). */
  setActive(index: number): void {
    if (index < 0 || index >= this.items.length || index === this.activeIndex) return;
    this.activeIndex = index;
    this.#changed();
  }

  // ── selection ─────────────────────────────────────────────────────────────

  /** Tab/click: act on row `index` (default: the active row), or submit free text. One step at a time. */
  select(index = this.activeIndex): void {
    this.#select(index);
    this.#changed();
  }

  /**
   * Enter: like `select`, then — in a replayed run — accept the remaining
   * remembered answers and finish (Tab, Tab, … steps through them one by one).
   */
  commit(): void {
    const wasStep = this.mode === 'command-step';
    const done = this.#select(this.activeIndex);
    if (wasStep && !done) this.#fastForward();
    this.#changed();
  }

  /** Returns true when a terminal effect fired. */
  #select(index: number): boolean {
    const item = this.items[index];
    if (!item) {
      const step = this.step;
      const text = this.#stepQuery.trim();
      if (this.mode === 'command-step' && step?.freeText && text) {
        return this.#choose({ stepId: step.id, label: text, value: text, isFreeText: true });
      }
      return false;
    }
    switch (item.kind) {
      case 'command':
        this.#enterCommand(item.ref as Command, '');
        return !(item.ref as Command).steps?.length;
      case 'context':
        this.#enterContext(item.ref as Context, '');
        return false;
      case 'option': {
        if (item.selection) return this.#choose({ ...item.selection });
        const o = item.ref as Option;
        const sel: Selection = { stepId: this.step!.id, label: o.label, value: o.value ?? o.label, isFreeText: false };
        if (o.id != null) sel.optionId = o.id;
        return this.#choose(sel, o.steps);
      }
      case 'result': {
        const r = item.ref as Result;
        const scope: Scope = item.scope ?? (this.mode === 'context-search' && this.context ? { contextId: this.context.id } : 'global');
        this.#cancel();
        this.#record({ kind: 'result', label: r.title, item: cloneResult(r), scope });
        this.#host.effect({ type: 'select', item: r, scope });
        return true;
      }
      case 'usage':
        return this.#selectUsage(item.ref as UsageEntry);
    }
  }

  #selectUsage(e: UsageEntry): boolean {
    switch (e.kind) {
      case 'command':
      case 'run': {
        const c = this.#host.commands().find((x) => x.id === e.commandId);
        if (!c) return false;
        this.#enterCommand(c, '', e.kind === 'run' ? e.selections : undefined);
        return !c.steps?.length;
      }
      case 'context': {
        const c = this.#host.contexts().find((x) => x.id === e.contextId);
        if (c) this.#enterContext(c, '');
        return false;
      }
      case 'result': {
        if (!e.item) return false;
        const scope = e.scope ?? 'global';
        this.#cancel();
        this.#record({ kind: 'result', label: e.item.title, item: e.item, scope });
        this.#host.effect({ type: 'select', item: cloneResult(e.item), scope });
        return true;
      }
    }
    return false;
  }

  /**
   * Esc / Backspace-at-the-prefix: previous step → command list, context search →
   * context list. Anywhere else, ask the host to close. Returns whether it stepped back.
   */
  back(): boolean {
    if (this.mode === 'command-step' && this.command) {
      if (!this.selections.length) {
        this.#toList('/');
      } else {
        const last = this.selections[this.selections.length - 1];
        this.#truncate(this.selections.length - 1);
        this.stepIndex = this.#plan.findIndex((s) => s.id === last.stepId);
        this.#enterStep('');
      }
      this.#changed();
      return true;
    }
    if (this.mode === 'context-search') {
      this.#toList(':');
      this.#changed();
      return true;
    }
    if (this.usageView) {
      this.reset();
      return true;
    }
    this.#host.effect({ type: 'close' });
    return false;
  }

  #toList(prefix: '/' | ':'): void {
    this.#cancel();
    this.#clearWizard();
    this.context = null;
    this.input = prefix;
    this.lockedLength = 0;
    if (prefix === '/') this.#onCommandInput('/');
    else this.#onContextInput(':');
  }

  #changed(): void {
    this.#host.changed();
  }
}
