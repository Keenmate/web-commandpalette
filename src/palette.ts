/**
 * The palette MACHINE — modes, transitions, the wizard, filtering and async search
 * (IMPLEMENTATION_PLAN §10). Framework- and DOM-free: it owns state and exposes a
 * read-only view; the element feeds it input/keys and renders the view. Unit-tested
 * directly (test/unit/palette.test.ts).
 *
 * Behavioural sources of truth: pure-admin `command-palette.js` (routing, wizard,
 * keyboard) and keen `live.ex` (step-back, pagination, global prepend).
 */
import { filterCommands, filterContexts, filterOptions, findByShortcut, globalMatches } from './filter';
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

export type ItemKind = 'command' | 'context' | 'option' | 'result';

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
  section?: 'commands' | 'contexts';
  ref: Command | Context | Option | Result;
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
    ref: c,
  };
}

function contextItem(c: Context, section?: 'contexts'): ViewItem {
  return { kind: 'context', title: c.name, meta: c.description, icon: c.icon, keys: [c.shortcut], section, ref: c };
}

/** A command/context surfaced in global search: shortcut as a badge (keen/core parity). */
function globalEntryItem(kind: 'command' | 'context', e: Command | Context): ViewItem {
  return { kind, title: e.name, meta: e.description, icon: e.icon, badge: e.shortcut, ref: e };
}

function optionItem(o: Option): ViewItem {
  return { kind: 'option', title: o.label, meta: o.description, icon: o.icon, ref: o };
}

function resultItem(r: Result): ViewItem {
  return {
    kind: 'result',
    title: r.title,
    meta: r.subtitle,
    icon: r.icon,
    badge: r.badge,
    badgeVariant: r.badgeVariant,
    ref: r,
  };
}

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

  // ── wizard / context state ────────────────────────────────────────────────
  command: Command | null = null;
  stepIndex = -1;
  selections: Selection[] = [];
  context: Context | null = null;

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
    return this.command?.steps?.[this.stepIndex] ?? null;
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
    return this.mode === 'command-step' || this.mode === 'context-search';
  }

  /** Text of the context pill, or null when hidden. */
  get contextText(): string | null {
    const labels = this.#host.labels();
    switch (this.mode) {
      case 'command-list': return labels.commands;
      case 'context-list': return labels.searchContexts;
      case 'command-step': return this.command?.name ?? null;
      case 'context-search': return this.context ? fill(labels.searchingIn, { name: this.context.name }) : null;
      default: return null;
    }
  }

  get placeholder(): string {
    const labels = this.#host.labels();
    if (this.mode === 'command-step') return this.step?.placeholder || labels.filterPlaceholder;
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

  get pageText(): string | null {
    if (this.totalPages <= 1) return null;
    return fill(this.#host.labels().pageOf, { page: this.page, total: this.totalPages, count: this.totalResults });
  }

  // ── lifecycle ─────────────────────────────────────────────────────────────

  /** Back to the idle home screen, dropping all wizard/search state. */
  reset(): void {
    this.#cancel();
    this.command = null;
    this.stepIndex = -1;
    this.selections = [];
    this.context = null;
    this.#stepOptions = null;
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
    this.#route(value);
  }

  /** The locked prefix was broken (e.g. select-all + type): drop the mode and re-route. */
  #leave(value: string): void {
    this.#cancel();
    this.command = null;
    this.stepIndex = -1;
    this.selections = [];
    this.context = null;
    this.#stepOptions = null;
    this.lockedLength = 0;
    this.#route(value);
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
    this.#setItems([
      ...this.#host.commands().map((c) => commandItem(c, 'commands')),
      ...this.#host.contexts().map((c) => contextItem(c, 'contexts')),
    ]);
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
    this.#setItems(filterCommands(this.#host.commands(), needle).map((c) => commandItem(c)));
  }

  /** Enter a command: instant commands fire immediately; otherwise start the wizard. */
  enterCommand(command: Command, initialQuery = ''): void {
    this.#enterCommand(command, initialQuery);
    this.#changed();
  }

  #enterCommand(command: Command, initialQuery: string): void {
    this.#cancel();
    this.context = null;
    this.command = command;
    this.selections = [];
    const first = this.#nextShownStep(-1);
    if (!command.steps?.length) {
      this.#host.effect({ type: 'command', commandId: command.id });
      return;
    }
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
    return this.command?.steps?.find((s) => s.id === id);
  }

  /** Index of the next step after `from` whose `shouldShow` passes, or -1. */
  #nextShownStep(from: number): number {
    const steps = this.command?.steps ?? [];
    for (let i = from + 1; i < steps.length; i++) {
      const s = steps[i];
      if (!s.shouldShow || s.shouldShow(this.selections)) return i;
    }
    return -1;
  }

  /** `"/assign iPad Air to "` — everything before the current step's editable text. */
  #stepPrefix(): string {
    if (!this.command) return '';
    let text = this.command.shortcut;
    for (const sel of this.selections) text += (this.#stepById(sel.stepId)?.prompt ?? ' ') + sel.label;
    return text + (this.step?.prompt ?? ' ');
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

  #enterStep(query: string): void {
    this.#cancel();
    this.#stepOptions = null;
    this.#stepQuery = query;
    this.highlight = query.trim();
    this.#layStepInput(query);
    this.emptyText = null;
    this.#setItems([]);
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
    this.#setItems(opts.map(optionItem));
  }

  /** `isLive`: the result IS the list (search step); else it's the full set to filter. */
  #fetchStepOptions(query: string, isLive: boolean): void {
    const cb = this.#host.stepOptionsCallback();
    const command = this.command!;
    const step = this.step!;
    if (!cb) {
      this.#stepOptions = [];
      this.#applyStepFilter();
      return;
    }
    this.#run(
      (signal) => cb({ commandId: command.id, stepId: step.id, query, selections: this.selections.map((s) => ({ ...s })) }, signal),
      (options) => {
        const list = (options ?? []) as Option[];
        if (isLive) {
          this.isLoading = false;
          this.emptyText = this.#host.labels().emptyText;
          this.#setItems(list.map(optionItem));
        } else {
          this.#stepOptions = list;
          this.#applyStepFilter();
        }
      },
    );
  }

  /** Record an answer and advance (or complete). */
  #choose(selection: Selection): void {
    this.selections = [...this.selections, selection];
    const next = this.#nextShownStep(this.stepIndex);
    if (next < 0) {
      this.#cancel();
      this.#host.effect({ type: 'complete', commandId: this.command!.id, selections: this.selections.map((s) => ({ ...s })) });
      return;
    }
    this.stepIndex = next;
    this.#enterStep('');
  }

  /** Tokens display: drop a recorded answer (and everything after it) and re-ask that step. */
  removeToken(index: number): void {
    if (this.mode !== 'command-step' || !this.command || index < 0 || index >= this.selections.length) return;
    const removed = this.selections[index];
    this.selections = this.selections.slice(0, index);
    this.stepIndex = (this.command.steps ?? []).findIndex((s) => s.id === removed.stepId);
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
    this.#setItems(filterContexts(this.#host.contexts(), needle).map((c) => contextItem(c)));
  }

  /** Enter scoped search: the input becomes `"<shortcut> "` (locked) + `query`. */
  enterContext(context: Context, query = ''): void {
    this.#enterContext(context, query);
    this.#changed();
  }

  #enterContext(context: Context, query: string): void {
    this.#cancel();
    this.command = null;
    this.selections = [];
    this.mode = 'context-search';
    this.context = context;
    const prefix = context.shortcut + ' ';
    this.input = prefix + query;
    this.lockedLength = prefix.length;
    this.#onContextQuery(query, true);
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
    const local = [
      ...globalMatches(this.#host.commands(), q).map((c) => globalEntryItem('command', c)),
      ...globalMatches(this.#host.contexts(), q).map((c) => globalEntryItem('context', c)),
    ];
    if (!this.#host.searchCallback()) {
      this.isLoading = false;
      this.emptyText = this.#host.labels().emptyText;
      this.#setResults(local);
      return;
    }
    this.#debouncedSearch('global', q, local, true);
  }

  // ── search plumbing ───────────────────────────────────────────────────────

  /** Show `prefix` + a loading state now; call the provider after the debounce. */
  #debouncedSearch(scope: Scope, q: string, prefix: ViewItem[], silent: boolean): void {
    this.isLoading = true;
    this.emptyText = null;
    this.#setResults(prefix);
    if (!silent) this.#changed();
    this.#timer = setTimeout(() => {
      this.#timer = null;
      const cb = this.#host.searchCallback();
      if (!cb) {
        this.isLoading = false;
        this.emptyText = this.#host.labels().emptyText;
        this.#setResults(prefix);
        this.#changed();
        return;
      }
      this.#run(
        (signal) => cb(scope, q, signal),
        (results) => {
          this.isLoading = false;
          this.emptyText = this.#host.labels().emptyText;
          this.#setResults([...prefix, ...((results ?? []) as Result[]).map(resultItem)]);
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
    this.#allResults = all;
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

  /** Enter/Tab/click: act on row `index` (default: the active row), or submit free text. */
  select(index = this.activeIndex): void {
    const item = this.items[index];
    if (!item) {
      const step = this.step;
      const text = this.#stepQuery.trim();
      if (this.mode === 'command-step' && step?.freeText && text) {
        this.#choose({ stepId: step.id, label: text, value: text, isFreeText: true });
        this.#changed();
      }
      return;
    }
    switch (item.kind) {
      case 'command':
        this.#enterCommand(item.ref as Command, '');
        break;
      case 'context':
        this.#enterContext(item.ref as Context, '');
        break;
      case 'option': {
        const o = item.ref as Option;
        const sel: Selection = { stepId: this.step!.id, label: o.label, value: o.value ?? o.label, isFreeText: false };
        if (o.id != null) sel.optionId = o.id;
        this.#choose(sel);
        break;
      }
      case 'result': {
        const scope: Scope = this.mode === 'context-search' && this.context ? { contextId: this.context.id } : 'global';
        this.#cancel();
        this.#host.effect({ type: 'select', item: item.ref as Result, scope });
        return;
      }
    }
    this.#changed();
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
        this.selections = this.selections.slice(0, -1);
        this.stepIndex = (this.command.steps ?? []).findIndex((s) => s.id === last.stepId);
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
    this.#host.effect({ type: 'close' });
    return false;
  }

  #toList(prefix: '/' | ':'): void {
    this.#cancel();
    this.command = null;
    this.stepIndex = -1;
    this.selections = [];
    this.context = null;
    this.#stepOptions = null;
    this.input = prefix;
    this.lockedLength = 0;
    if (prefix === '/') this.#onCommandInput('/');
    else this.#onContextInput(':');
  }

  #changed(): void {
    this.#host.changed();
  }
}
