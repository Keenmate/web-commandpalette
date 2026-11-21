/**
 * The palette MACHINE — modes, transitions, the wizard, filtering and async search
 * (IMPLEMENTATION_PLAN §10). Framework- and DOM-free: it owns state and exposes a
 * read-only view; the element feeds it input/keys and renders the view. Unit-tested
 * directly (test/unit/palette.test.ts).
 *
 * Behavioural sources of truth: pure-admin `command-palette.js` (routing, wizard,
 * keyboard) and keen `live.ex` (step-back, pagination, global prepend).
 */
import { resolveActionItem, shortcutKeycaps, type ResolvedActionItem } from '@keenmate/web-components-core/actions';
import { createAsyncRunner, type AsyncRunner } from '@keenmate/web-components-core';
import { createRegexCompiler } from '@keenmate/web-components-core/search';
import { createLabels, type TranslateCallback } from '@keenmate/web-components-core/locale';
import {
  filterCommands,
  filterContexts,
  filterOptions,
  findByTrigger,
  globalMatches,
  matchesAny,
  prepareQuery,
  type SearchQuery,
  type SearchRules,
} from './helpers/filter';
import { cloneResult, cloneSelections, usageKey, type UsageStore, type UsageTarget } from './usage';
import { DEFAULT_LABELS, ENGINE_DEFAULTS } from './types';
import { chordKeycap } from './keyboard';
import { logging } from './logger';

const initLogger = logging.loggers.INIT;
import type {
  Command,
  CommandContext,
  CommandPaletteLabels,
  Context,
  Display,
  LabelRef,
  Mode,
  Option,
  PaletteLabels,
  Result,
  Scope,
  SearchBehavior,
  SearchCallback,
  SearchContext,
  SearchMatch,
  Selection,
  Step,
  StepContext,
  StepOptionsCallback,
  StepOptionsContext,
  UsageEntry,
} from './types';

/** PgUp/PgDn jump (matches all three legacy implementations). */
export const PAGE_STEP = 8;

/**
 * The engine's SETTINGS — `new CommandPaletteEngine(host, options)`, then `engine.setOptions(partial)` /
 * `engine.getOptions()`. Names (and defaults, `ENGINE_DEFAULTS`) match the element's inputs, so the same values
 * work in both; `<web-command-palette>` passes its inputs through `setOptions` from its `update()`.
 */
export interface CommandPaletteEngineOptions {
  /** `commands` — the same `Command[]` the element takes. Default `[]`. */
  commands: readonly Command[];
  /** `contexts` — the search contexts. Default `[]`. */
  contexts: readonly Context[];
  /** `searchCallback` — context + global search (`null` = none). */
  searchCallback: SearchCallback | null;
  /** `getStepOptionsCallback` — a step's options when the step has no own callback (`null` = none). */
  getStepOptionsCallback: StepOptionsCallback | null;
  /** `display` — `inline` (default) or `tokens`. */
  display: Display;
  /** `page-size` — rows per search page (default 8). */
  pageSize: number;
  /** `search-debounce`: ms before a typed term reaches `searchCallback` / a live step's options (default 150). */
  searchDebounce: number;
  /** `search-behavior` for client-side filtering + highlighting (default `normalized`). */
  searchBehavior: SearchBehavior;
  /** `search-match` for client-side filtering + highlighting (default `contains`). */
  searchMatch: SearchMatch;
  /**
   * The instance `labels` (short keys `labels.pageOf` or full keys `web-command-palette.labels.pageOf`), the
   * same object the element's `labels` input takes. The engine resolves its own texts (`placeholder`,
   * `contextText`, `emptyText`, `pageText`, the `lastUsed` badge) through core `createLabels`: these →
   * `translateCallback` → `window.components.locale.translateCallback` → the page dictionary → English.
   */
  labels: Partial<CommandPaletteLabels> | null;
  /** This palette's own translation hook (core `TranslateCallback`), asked before the page-wide one; `null` = not mine. */
  translateCallback: TranslateCallback | null;
  /**
   * `locale`: BCP-47 locale for the numbers in labels (`{count}` / `{page}` / `{total}`) and `translateCallback`'s
   * `ctx.locale`. Default `null` (the page-wide `window.components.locale`, else the browser).
   */
  locale: string | null;
  /** Favorites/recents store (`new UsageStore(persistence, () => engine.usageChanged())`), or `null` = off (default). */
  usage: UsageStore | null;
  /** `max-recent-count` — recent entries on the home screen (default 3). */
  maxRecentCount: number;
  /** `max-favorite-count` — favorites on the home screen (default 3). */
  maxFavoriteCount: number;
  /**
   * `favorite-key` — Ctrl/⌘ + this key stars the active row (default `d`; `''` = off). The engine draws its keycap
   * (`Ctrl+D` / Apple `⌘D`, core `formatShortcut`) into `messages.noFavorites`; your UI binds the key itself.
   */
  favoriteKey: string;
}

/** The engine defaults — the element's input defaults (`ENGINE_DEFAULTS`, C-CA-37) + the data / hook options. */
const ENGINE_OPTION_DEFAULTS: Readonly<CommandPaletteEngineOptions> = Object.freeze({
  commands: Object.freeze([]) as readonly Command[],
  contexts: Object.freeze([]) as readonly Context[],
  searchCallback: null,
  getStepOptionsCallback: null,
  display: ENGINE_DEFAULTS.display,
  pageSize: ENGINE_DEFAULTS.pageSize,
  searchDebounce: ENGINE_DEFAULTS.searchDebounce,
  searchBehavior: ENGINE_DEFAULTS.searchBehavior,
  searchMatch: ENGINE_DEFAULTS.searchMatch,
  labels: null,
  translateCallback: null,
  locale: ENGINE_DEFAULTS.locale,
  usage: null,
  maxRecentCount: ENGINE_DEFAULTS.maxRecentCount,
  maxFavoriteCount: ENGINE_DEFAULTS.maxFavoriteCount,
  favoriteKey: ENGINE_DEFAULTS.favoriteKey,
});

/**
 * The engine's HOOKS — what it calls back, not settings (those are {@link CommandPaletteEngineOptions}):
 * your UI, or `<web-command-palette>`.
 */
export interface CommandPaletteEngineHost {
  /**
   * Attach the component context (`controller`, `element`, presentation) to a
   * callback ctx, in place. The element supplies it; a standalone host may omit
   * it (callbacks then get the plain fields).
   */
  context?<T extends object>(fields: T): T;
  /**
   * The element this engine renders for, read once at construction — core `createLabels` logs a throwing
   * `translateCallback` under its logger and reads its `lang` context. A standalone UI omits it (`null`).
   */
  element?(): Element | null;
  /** State changed — re-render. */
  changed(): void;
  /**
   * A terminal outcome. The host performs it (before-hook, event, close) and
   * answers whether it went ahead: `false` (or a Promise of it) = vetoed — the
   * engine records nothing and, for a finished wizard, steps back to the last
   * answer so the user can change it; anything else = done (usage is recorded).
   */
  effect(effect: Effect): EffectOutcome;
  /** Provider failures (rejected promise / throw). */
  error?(message: string, err: unknown): void;
}

export type Effect =
  | { type: 'select'; result: Result; scope: Scope }
  /** A command ran: immediately (no steps) or after the wizard's last answer. */
  | { type: 'action'; command: Command; selections: Selection[] }
  | { type: 'close' };

/** Merge `partial` into `target` in place; an `undefined` value resets that key to its default. */
function mergeOptions(
  target: CommandPaletteEngineOptions,
  partial: Partial<CommandPaletteEngineOptions>,
  onUnknown?: (key: string) => void,
): CommandPaletteEngineOptions {
  const out = target as unknown as Record<string, unknown>;
  for (const [key, value] of Object.entries(partial)) {
    if (!(key in ENGINE_OPTION_DEFAULTS)) {
      onUnknown?.(key);
      continue;
    }
    out[key] = value === undefined ? (ENGINE_OPTION_DEFAULTS as unknown as Record<string, unknown>)[key] : value;
  }
  return target;
}

/** The host's answer to {@link CommandPaletteEngineHost.effect}: `false` = vetoed. */
export type EffectOutcome = boolean | void | PromiseLike<boolean | void>;

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
  /** A command row that can't run (`isDisabled` / `getIsDisabledCallback`). */
  isDisabled?: boolean;
  /** A destructive command (`isDanger`). */
  isDanger?: boolean;
  /** Extra row classes (`cssClass` / `getClassCallback`). */
  cssClass?: string;
  /** Row tooltip (`tooltip` / `getTooltipCallback`). */
  tooltip?: string;
  ref: Command | Context | Option | Result | UsageEntry;
}

/** A tokens-display fragment (above the input). */
export type TokenView =
  | { type: 'command'; label: string }
  | { type: 'prompt'; label: string }
  | { type: 'selection'; label: string; index: number };

export type NavDirection = 'up' | 'down' | 'pageUp' | 'pageDown' | 'home' | 'end';


/**
 * A shortcut's keycaps, one per cap — core `shortcutKeycaps` in the platform format: `"g d"` → `[G, D]`,
 * `"Mod+K"` → `[Ctrl, K]` / Apple `[⌘, K]`. Free text that isn't a shortcut shows as one cap.
 */
export const hotkeyKeys = (hotkey: string): string[] => {
  const caps = shortcutKeycaps(hotkey).flat();
  return caps.length ? caps : [hotkey];
};

/** The resolved action-item fields a command row shows. */
function commandState(r: ResolvedActionItem): Pick<ViewItem, 'title' | 'icon' | 'tooltip' | 'cssClass' | 'isDisabled' | 'isDanger'> {
  const out: Pick<ViewItem, 'title' | 'icon' | 'tooltip' | 'cssClass' | 'isDisabled' | 'isDanger'> = { title: r.text, icon: r.icon };
  if (r.tooltip) out.tooltip = r.tooltip;
  if (r.cssClass) out.cssClass = r.cssClass;
  if (r.isDisabled) out.isDisabled = true;
  if (r.isDanger) out.isDanger = true;
  return out;
}

function commandItem(c: Command, r: ResolvedActionItem, section?: 'commands'): ViewItem {
  return {
    kind: 'command',
    ...commandState(r),
    meta: c.description,
    keys: section && c.shortcut ? hotkeyKeys(c.shortcut) : [c.trigger],
    section,
    key: usageKey({ kind: 'command', label: c.text, commandId: c.id }),
    ref: c,
  };
}

function contextItem(c: Context, section?: 'contexts'): ViewItem {
  return {
    kind: 'context', title: c.text, meta: c.description, icon: c.icon, keys: [c.trigger], section,
    key: usageKey({ kind: 'context', label: c.text, contextId: c.id }),
    ref: c,
  };
}

/** A command/context surfaced in global search: trigger as a badge (keen/core parity). */
function globalEntryItem(kind: 'command' | 'context', e: Command | Context, r?: ResolvedActionItem): ViewItem {
  const key = kind === 'command'
    ? usageKey({ kind, label: e.text, commandId: e.id })
    : usageKey({ kind, label: e.text, contextId: e.id });
  const base: ViewItem = { kind, title: e.text, meta: e.description, icon: e.icon, badge: e.trigger, key, ref: e };
  return r ? { ...base, ...commandState(r) } : base;
}

function optionItem(o: Option): ViewItem {
  return { kind: 'option', title: o.text, meta: o.description, icon: o.icon, ref: o };
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
    key: usageKey({ kind: 'result', label: r.title, result: r, scope }),
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
  sel.optionId != null ? o.id === sel.optionId : o.text === sel.label;

/** Attach an `AbortSignal` non-enumerable, so the ctx stays plain JSON for a LiveView bridge. */
function withSignal<T extends object>(fields: T, signal: AbortSignal): T & { readonly signal: AbortSignal } {
  return Object.defineProperty(fields, 'signal', { value: signal, enumerable: false, configurable: true }) as T & { readonly signal: AbortSignal };
}

/**
 * The palette has no client-side record list behind a search (results come FROM the
 * provider), so core's `SearchCallbackContext.entries` is always this empty array.
 */
const NO_ENTRIES: ReadonlyArray<never> = Object.freeze([] as never[]);

/**
 * Core's shared `SearchCallbackContext` (`term`, `signal`, `entries`) + the palette's `scope`.
 * `signal` / `entries` are non-enumerable, so the LiveView bridge pushes only `{ scope, term }`.
 */
function withSearchContext<T extends object>(fields: T, signal: AbortSignal): T {
  return Object.defineProperty(withSignal(fields, signal), 'entries', { value: NO_ENTRIES, enumerable: false, configurable: true });
}

const isThenable = <T>(v: unknown): v is PromiseLike<T> =>
  !!v && (typeof v === 'object' || typeof v === 'function') && typeof (v as PromiseLike<T>).then === 'function';

/**
 * The palette ENGINE — the DOM-free state machine behind `<web-command-palette>`, public
 * for building your own palette UI (docs/usage.md "Build your own UI"): it owns modes,
 * the wizard, filtering, async search, pagination and favorites / recents, and exposes a
 * read-only view (`input`, `items`, `activeIndex`, `placeholder`, …); you draw it and feed
 * it keys / input. The element never exposes its own engine — consumers use `el.controller`.
 */
export class CommandPaletteEngine {
  #host: CommandPaletteEngineHost;

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
  /** The empty-state label when `items` is empty and nothing is loading (resolved when drawn). */
  emptyLabel: LabelRef | null = null;
  /** The query to `<mark>` in titles (as typed, trimmed). */
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
  /**
   * Every provider call (search, live / static step options) goes through core's one "latest request wins"
   * runner (SPEC §12.22): debounce, AbortSignal supersede, late answers dropped, and the loader only while an
   * ASYNC task runs — a synchronous answer applies with no loader flash. `#debounce` is set per run.
   */
  #runner: AsyncRunner;
  #debounce = 0;
  /** The latest run's "failed" handler (the runner reports errors of the latest run only). */
  #onFail: (() => void) | null = null;

  /**
   * The palette's labels resolver (core `createLabels`) over the host's `labels` +
   * `translateCallback` — the engine's own texts go through it; a UI resolves its chrome
   * strings (`ariaLabels.*`, `headers.*`, …) through it too, under the same rules.
   */
  readonly labels: PaletteLabels;

  /** The merged settings (defaults ← constructor options ← every `setOptions`). */
  #options: CommandPaletteEngineOptions;

  /**
   * @param host    the hooks (`changed`, `effect`, optional `context` / `element` / `error`) — not settings.
   * @param options the settings; a missing (or `undefined`) key takes the element's default.
   */
  constructor(host: CommandPaletteEngineHost, options: Partial<CommandPaletteEngineOptions> = {}) {
    this.#host = host;
    this.#options = mergeOptions({ ...ENGINE_OPTION_DEFAULTS }, options);
    // The element when there is one (its logger, its `lang`); standalone `null` — the tag and the own
    // `translateCallback` come as options either way, so the resolution order is the same.
    this.labels = createLabels(host.element?.() ?? null, DEFAULT_LABELS, () => this.#options.labels, {
      tag: 'web-command-palette',
      getTranslateCallback: () => this.#options.translateCallback,
      getLocale: () => this.#options.locale,
    });
    this.#runner = createAsyncRunner({
      debounceMs: () => this.#debounce,
      onLoadingChange: (isLoading) => {
        this.isLoading = isLoading;
        // The loader going off is followed by the result / failure, which re-renders.
        if (isLoading) this.#changed();
      },
      onError: (err) => {
        this.#host.error?.('provider failed', err);
        this.#onFail?.();
      },
    });
    this.#home();
  }

  // ── options ───────────────────────────────────────────────────────────────

  /** The merged settings, read-only (the live object — change them through {@link setOptions}). */
  getOptions(): Readonly<CommandPaletteEngineOptions> {
    return this.#options;
  }

  /**
   * Merge `partial` into the current settings and apply what it names: `commands` / `contexts` / the home
   * limits rebuild the current list, `search-behavior` / `search-match` re-run the current search, `page-size`
   * re-pages, `display` re-lays the wizard step, `usage` re-reads the favorites / recents. A key set to
   * `undefined` goes back to its default. Every named key counts as changed (the same array passed again
   * after an in-place edit refreshes too); callbacks and `search-debounce` apply on their next use. A key that
   * is not an option is ignored with a warning (`COMMANDPALETTE:INIT`).
   */
  setOptions(partial: Partial<CommandPaletteEngineOptions>): void {
    const has = (k: keyof CommandPaletteEngineOptions): boolean => k in partial;
    mergeOptions(this.#options, partial, (key) =>
      initLogger.warn(`CommandPaletteEngine.setOptions(): "${key}" is not an option — ignored`),
    );
    let isApplied = false;
    if (has('commands') || has('contexts') || has('maxRecentCount') || has('maxFavoriteCount') || has('favoriteKey')) {
      this.#refresh();
      isApplied = true;
    }
    if (has('usage')) { this.usageChanged(); isApplied = true; }
    if (has('display')) { this.#displayChanged(); isApplied = true; }
    if (has('pageSize')) { this.#pageSizeChanged(); isApplied = true; }
    if (has('searchBehavior') || has('searchMatch')) { this.#searchRulesChanged(); isApplied = true; }
    // Labels / locale / translateCallback are resolved when drawn — just re-render.
    if (!isApplied && (has('labels') || has('translateCallback') || has('locale'))) this.#changed();
  }

  // ── host helpers ──────────────────────────────────────────────────────────

  /** A callback ctx with the component context attached (when the host supplies it). */
  #ctx<T extends object>(fields: T): T {
    return this.#host.context ? this.#host.context(fields) : fields;
  }

  /** Resolve a command's action-item fields (`get*Callback` wins) against the render-time ctx. */
  #resolve(c: Command): ResolvedActionItem {
    return resolveActionItem(c, this.#ctx<CommandContext>({ selections: [] } as unknown as CommandContext));
  }

  /** The commands to offer: the host's list minus hidden ones (`isVisible` / `getIsVisibleCallback`). */
  #commands(): Command[] {
    return this.#options.commands.filter((c) => this.#resolve(c).isVisible);
  }

  /** Command rows (resolved) for a list of commands. */
  #commandItems(list: readonly Command[], section?: 'commands'): ViewItem[] {
    return list.map((c) => commandItem(c, this.#resolve(c), section));
  }

  /** Whether `command` may run right now (visible and not disabled). */
  isCommandEnabled(command: Command): boolean {
    const r = this.#resolve(command);
    return r.isVisible && !r.isDisabled;
  }

  // ── derived view ──────────────────────────────────────────────────────────

  get step(): Step | null {
    return this.#plan[this.stepIndex] ?? null;
  }

  /** The editable part of the input (after the locked prefix) — the search term. */
  get term(): string {
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
    const labels = this.labels;
    switch (this.mode) {
      case 'command-list': return labels.text('labels.scopeCommands');
      case 'context-list': return labels.text('labels.scopeContexts');
      case 'command-step': return this.command ? this.#resolve(this.command).text : null;
      case 'context-search': return this.context ? labels.text('labels.scopeSearchingIn', { name: this.context.text }) : null;
      case 'favorites-list': return labels.text('labels.scopeFavorites');
      case 'recent-list': return labels.text('labels.scopeRecent');
      default: return null;
    }
  }

  get placeholder(): string {
    const labels = this.labels;
    if (this.mode === 'command-step') return this.step?.placeholder || labels.text('placeholders.filter');
    if (this.usageView) return labels.text('placeholders.filter');
    return labels.text('placeholders.idle');
  }

  /** Tokens-display fragments, or null when the tokens row is not in use. */
  get tokens(): TokenView[] | null {
    if (this.mode !== 'command-step' || this.#options.display !== 'tokens' || !this.command) return null;
    const out: TokenView[] = [{ type: 'command', label: this.command.trigger }];
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

  /** The empty-state text (`emptyLabel` resolved as plain text), or null. */
  get emptyText(): string | null {
    return this.emptyLabel ? this.labels.text(this.emptyLabel.key, this.emptyLabel.params) : null;
  }

  /** The pagination row's label (`labels.pageOf`; raw numbers — core `createLabels` formats them for display), or null on a single page. */
  get pageLabel(): LabelRef | null {
    if (this.totalPages <= 1) return null;
    return {
      key: 'labels.pageOf',
      params: { page: this.page, total: this.totalPages, count: this.totalResults }, // numbers: core formats them
    };
  }

  /** The pagination row as plain text, or null on a single page. */
  get pageText(): string | null {
    const ref = this.pageLabel;
    return ref ? this.labels.text(ref.key, ref.params) : null;
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

  // ── search rules (core /search, SPEC §12.11) ─────────────────────────────

  /** Compiles `search-match="regex"` terms, keeping this palette's last valid pattern. */
  #regex = createRegexCompiler();
  #highlightQuery: { key: string; query: SearchQuery } | null = null;

  /** `search-debounce` (default 150 ms). */
  #searchDebounce(): number {
    return this.#options.searchDebounce;
  }

  #rules(): SearchRules {
    return {
      behavior: this.#options.searchBehavior,
      match: this.#options.searchMatch,
    };
  }

  /** A typed needle prepared under the current `search-behavior` / `search-match`. */
  #query(needle: string): SearchQuery {
    return prepareQuery(needle, this.#rules(), this.#regex);
  }

  /** {@link highlight} prepared for `<mark>`ing titles — same rules as the filter. */
  get highlightQuery(): SearchQuery {
    const { behavior, match } = this.#rules();
    const key = `${behavior}|${match}|${this.highlight}`;
    if (this.#highlightQuery?.key !== key) this.#highlightQuery = { key, query: this.#query(this.highlight) };
    return this.#highlightQuery.query;
  }

  /** `search-behavior` / `search-match` changed — re-run the current search under the new rules. */
  #searchRulesChanged(): void {
    this.#regex.reset();
    this.#highlightQuery = null;
    if (this.mode === 'idle') this.#changed();
    else this.setInput(this.input);
  }

  /** commands / contexts / the home limits changed — refresh views derived from them. */
  #refresh(): void {
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
      const store = this.#options.usage;
      for (const item of this.#allResults) {
        if (item.favorite !== undefined && item.key) item.favorite = store?.isFavorite(item.key) ?? false;
      }
      this.listVersion++;
    }
    this.#changed();
  }

  /**
   * `page-size` changed — re-page the current search results client-side, keeping the
   * first visible row on screen. Other modes don't paginate; a pending provider call
   * pages its results with the new size when it lands.
   */
  #pageSizeChanged(): void {
    if (this.mode !== 'context-search' && this.mode !== 'global-search') return;
    const size = Math.max(1, this.#options.pageSize);
    const first = this.items.length ? this.#allResults.indexOf(this.items[0]!) : 0;
    this.totalPages = Math.max(1, Math.ceil(this.#allResults.length / size));
    this.#showPage(Math.floor(Math.max(0, first) / size) + 1);
    this.#changed();
  }

  /** `display` changed — re-lay the current step's input/tokens, keeping the typed query. */
  #displayChanged(): void {
    if (this.mode !== 'command-step') return;
    this.#layStepInput(this.#stepQuery);
    this.#changed();
  }

  // ── input ─────────────────────────────────────────────────────────────────

  /** The input's value changed (user typing, or a programmatic `openWith`). */
  setInput(value: string): void {
    this.input = value;
    if (this.mode === 'command-step' && this.command) {
      if (this.#options.display === 'inline') {
        const prefix = this.#stepPrefix();
        if (!value.startsWith(prefix)) return this.#leave(value);
        this.#onStepQuery(value.slice(prefix.length));
      } else {
        this.#onStepQuery(value);
      }
      return;
    }
    if (this.mode === 'context-search' && this.context) {
      const prefix = this.context.trigger + ' ';
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
    this.emptyLabel = null;
    const store = this.#options.usage ?? null;
    // Home rows are capped and one-line; the full lists live behind Ctrl/⌘+F / R.
    const capped = (view: UsageView, limit: number): ViewItem[] => {
      const all = this.#usageItems(view, true);
      this.homeMore[view] = Math.max(0, all.length - limit);
      return all.slice(0, limit);
    };
    this.homeMore = { favorites: 0, recent: 0 };
    const star = <T extends ViewItem>(item: T): T => (store && item.key ? { ...item, favorite: store.isFavorite(item.key) } : item);
    this.#setItems([
      ...(store ? capped('favorites', this.#options.maxFavoriteCount) : []),
      ...(store ? capped('recent', this.#options.maxRecentCount) : []),
      ...this.#commandItems(this.#commands(), 'commands').map(star),
      ...this.#options.contexts.map((c) => star(contextItem(c, 'contexts'))),
    ]);
  }

  /** Rows for every visible favorite / recent entry. `compact` = one-line home rows (no meta). */
  #usageItems(view: UsageView, compact: boolean): ViewItem[] {
    const store = this.#options.usage;
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
        const c = this.#commands().find((x) => x.id === e.commandId);
        return c ? { ...base, ...commandState(this.#resolve(c)), meta: meta(c.description), keys: [c.trigger] } : null;
      }
      case 'run': {
        const c = this.#commands().find((x) => x.id === e.commandId);
        if (!c) return null;
        const r = this.#resolve(c);
        return { ...base, ...commandState(r), title: e.label, meta: meta(r.text) };
      }
      case 'context': {
        const c = this.#options.contexts.find((x) => x.id === e.contextId);
        return c ? { ...base, title: c.text, meta: meta(c.description), icon: c.icon, keys: [c.trigger] } : null;
      }
      case 'result':
        return e.result ? { ...base, title: e.result.title, meta: meta(e.result.subtitle), icon: e.result.icon } : null;
    }
    return null;
  }

  /**
   * Show every favorite / recent item (Ctrl/⌘+F / R, `g f`). Typing filters; Esc or
   * Backspace on an empty input goes home. Asking for the view already shown goes
   * home too, so the shortcut toggles. No-op when favorites are off.
   */
  showUsage(view: UsageView): void {
    if (!this.#options.usage) return;
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
    this.emptyLabel = all.length
      ? { key: 'messages.noResults' }
      : view === 'favorites'
        ? { key: 'messages.noFavorites', params: { key: chordKeycap(this.#options.favoriteKey) } }
        : { key: 'messages.noRecent' };
    this.#setItems(q ? all.filter((i) => matchesAny([i.title, i.meta], this.#query(q))) : all);
  }

  // ── favorites ─────────────────────────────────────────────────────────────

  /** Star / unstar row `index` (default: the active row). No-op for rows that can't be starred. */
  toggleFavorite(index = this.activeIndex): void {
    const item = this.items[index];
    const store = this.#options.usage;
    if (!item || item.favorite === undefined || !store) return;
    const target = this.#targetOf(item);
    if (!target) return;
    if (this.mode === 'idle') this.activeIndex = index;
    store.toggleFavorite(target); // → usageChanged() via the store's onChange
  }

  #targetOf(item: ViewItem): UsageTarget | null {
    switch (item.kind) {
      case 'usage': return item.ref as UsageEntry;
      case 'command': { const c = item.ref as Command; return { kind: 'command', label: c.text, commandId: c.id }; }
      case 'context': { const c = item.ref as Context; return { kind: 'context', label: c.text, contextId: c.id }; }
      case 'result': {
        const r = item.ref as Result;
        return { kind: 'result', label: r.title, result: cloneResult(r), scope: item.scope ?? 'global' };
      }
      default: return null;
    }
  }

  #record(target: UsageTarget): void {
    this.#options.usage?.record(target);
  }

  // ── commands ──────────────────────────────────────────────────────────────

  #onCommandInput(v: string): void {
    const space = v.indexOf(' ');
    if (space >= 0) {
      const exact = findByTrigger(this.#commands(), v.slice(0, space));
      // A disabled command falls through to the filtered list.
      if (exact && (this.#enterCommand(exact, v.slice(space + 1).trimStart()) || this.command === exact)) return;
    }
    const needle = v.slice(1).trim();
    this.mode = 'command-list';
    this.highlight = needle;
    this.isLoading = false;
    this.emptyLabel = { key: 'messages.noResults' };
    this.#setItems(this.#starred(this.#commandItems(filterCommands(this.#commands(), this.#query(needle)))));
  }

  /** Mark starrable rows with their current star state (only when favorites are on). */
  #starred(items: ViewItem[]): ViewItem[] {
    const store = this.#options.usage;
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

  /** Returns true when the command ran (a terminal effect fired). A disabled / hidden command does nothing. */
  #enterCommand(command: Command, initialQuery: string, replay?: Selection[]): boolean {
    if (!this.isCommandEnabled(command)) return false;
    if (!command.steps?.length) {
      // Instant: nothing changes until the host accepts (a veto leaves the palette as it was).
      return this.#finish(
        { type: 'action', command, selections: [] },
        { kind: 'command', label: command.text, commandId: command.id },
      );
    }
    this.#cancel();
    this.context = null;
    this.#clearWizard();
    this.command = command;
    this.#plan = [...command.steps];
    this.#replay = replay?.length ? cloneSelections(replay) : null;
    const first = this.#nextShownStep(-1);
    if (first < 0) {
      // Every step is hidden by getIsVisibleCallback — nothing to ask.
      return this.#finish({ type: 'action', command, selections: [] }, null, () => {
        if (this.command === command && this.mode !== 'command-step') this.#clearWizard();
      });
    }
    this.mode = 'command-step';
    this.stepIndex = first;
    this.#enterStep(initialQuery);
    return false;
  }

  /**
   * Report a terminal effect to the host. Records `target` once the host accepts
   * it; runs `onVeto` when it vetoes (`false`, now or later). Returns true — the
   * flow is over either way (a veto has already restored the state).
   */
  #finish(effect: Effect, target: UsageTarget | null, onVeto?: () => void): boolean {
    const accept = (): void => {
      if (target) this.#record(target);
    };
    const veto = (): void => {
      onVeto?.();
      this.#changed();
    };
    let out: EffectOutcome;
    try {
      out = this.#host.effect(effect);
    } catch (err) {
      this.#host.error?.('effect failed', err);
      veto();
      return true;
    }
    if (out === false) veto();
    else if (isThenable<boolean | void>(out)) {
      out.then(
        (ok) => (ok === false ? veto() : accept()),
        (err) => {
          this.#host.error?.('effect failed', err);
          veto();
        },
      );
    } else accept();
    return true;
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

  /** Index of the next step after `from` whose `getIsVisibleCallback` passes, or -1. */
  #nextShownStep(from: number): number {
    const steps = this.#plan;
    for (let i = from + 1; i < steps.length; i++) {
      const s = steps[i];
      if (typeof s.getIsVisibleCallback !== 'function') return i;
      const ctx = this.#ctx({ commandId: this.command?.id ?? '', stepId: s.id, selections: cloneSelections(this.selections) }) as StepContext;
      let isVisible = true;
      try {
        isVisible = s.getIsVisibleCallback(ctx) !== false;
      } catch (err) {
        this.#host.error?.('getIsVisibleCallback failed', err);
      }
      if (isVisible) return i;
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
    let text = this.command?.trigger ?? '';
    for (const sel of this.selections) text += (this.#stepById(sel.stepId)?.prompt ?? ' ') + sel.label;
    return text;
  }

  #layStepInput(query: string): void {
    if (this.#options.display === 'inline') {
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
    const badge = this.labels.text('labels.lastUsed');
    const at = options.findIndex((o) => matchesSelection(o, def));
    if (at >= 0) {
      const rest = options.filter((_, i) => i !== at);
      return [{ ...optionItem(options[at]), isDefault: true, badge }, ...rest.map(optionItem)];
    }
    const synthetic: Option = { text: def.label, value: def.value };
    if (def.optionId != null) synthetic.id = def.optionId;
    return [{ ...optionItem(synthetic), isDefault: true, badge, selection: def }, ...options.map(optionItem)];
  }

  #enterStep(query: string): void {
    this.#cancel();
    this.#stepOptions = null;
    this.#stepQuery = query;
    this.highlight = query.trim();
    this.#layStepInput(query);
    this.emptyLabel = null;
    this.#setItems(this.#stepItems([]));
    const step = this.step!;
    if (step.isLiveSearch) {
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
    if (this.step?.isLiveSearch) {
      this.#fetchStepOptions(query, true, this.#searchDebounce());
      this.#changed();
      return;
    }
    if (this.#stepOptions) this.#applyStepFilter();
    this.#changed();
  }

  #applyStepFilter(): void {
    const opts = filterOptions(this.#stepOptions ?? [], this.#query(this.#stepQuery));
    this.isLoading = false;
    this.emptyLabel = { key: 'messages.noResults' };
    this.#setItems(this.#stepItems(opts));
  }

  /** `isLive`: the result IS the list (search step); else it's the full set to filter. */
  #fetchStepOptions(query: string, isLive: boolean, debounceMs = 0): void {
    const step = this.step!;
    const cb = step.getOptionsCallback ?? this.#options.getStepOptionsCallback;
    const command = this.command!;
    if (!cb) {
      this.#stepOptions = [];
      this.#applyStepFilter();
      return;
    }
    this.#run(
      (signal) =>
        cb(this.#ctx(withSignal({ commandId: command.id, stepId: step.id, term: query, selections: cloneSelections(this.selections) }, signal)) as StepOptionsContext),
      (options) => {
        const list = (options ?? []) as Option[];
        if (isLive) {
          this.isLoading = false;
          this.emptyLabel = { key: 'messages.noResults' };
          this.#setItems(this.#stepItems(list));
        } else {
          this.#stepOptions = list;
          this.#applyStepFilter();
        }
      },
      debounceMs,
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
      const count = selections.length;
      return this.#finish(
        { type: 'action', command, selections: cloneSelections(selections) },
        { kind: 'run', label: this.#sentence(), commandId: command.id, selections },
        // Vetoed: step back to the last answer so the user can change it.
        () => {
          if (this.command !== command || this.mode !== 'command-step' || this.selections.length !== count) return;
          const last = this.selections[count - 1];
          this.#truncate(count - 1);
          this.stepIndex = this.#plan.findIndex((s) => s.id === last.stepId);
          this.#enterStep('');
        },
      );
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
      const exact = findByTrigger(this.#options.contexts, v.slice(0, space));
      if (exact) return this.#enterContext(exact, v.slice(space + 1).trimStart());
    }
    const needle = v.slice(1).trim();
    this.mode = 'context-list';
    this.highlight = needle;
    this.isLoading = false;
    this.emptyLabel = { key: 'messages.noResults' };
    this.#setItems(this.#starred(filterContexts(this.#options.contexts, this.#query(needle)).map((c) => contextItem(c))));
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
    const prefix = context.trigger + ' ';
    this.input = prefix + query;
    this.lockedLength = prefix.length;
    this.#onContextQuery(query, true);
    this.#record({ kind: 'context', label: context.text, contextId: context.id });
  }

  #onContextQuery(query: string, isEntry = false): void {
    this.#cancel();
    const q = query.trim();
    this.highlight = q;
    if (!q) {
      // The rule that started this project: an empty context query NEVER hits the
      // provider — prompt instead of dumping "top N" results.
      this.isLoading = false;
      this.emptyLabel = { key: 'messages.typeToSearch', params: { name: this.context!.text } };
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
    const query = this.#query(q);
    const local = this.#starred([
      ...globalMatches(this.#commands(), query).map((c) => globalEntryItem('command', c, this.#resolve(c))),
      ...globalMatches(this.#options.contexts, query).map((c) => globalEntryItem('context', c)),
    ]);
    if (!this.#options.searchCallback) {
      this.isLoading = false;
      this.emptyLabel = { key: 'messages.noResults' };
      this.#setResults(local);
      return;
    }
    this.#debouncedSearch('global', q, local, true);
  }

  // ── search plumbing ───────────────────────────────────────────────────────

  /** The provider for `scope`: the context's own `search`, else `searchCallback`. */
  #searchFor(scope: Scope, term: string): ((signal: AbortSignal) => unknown) | null {
    const own = scope !== 'global' ? this.#options.contexts.find((c) => c.id === scope.contextId)?.searchCallback : undefined;
    const cb = own ?? this.#options.searchCallback;
    if (!cb) return null;
    return (signal) => cb(this.#ctx(withSearchContext({ scope, term }, signal)) as SearchContext);
  }

  /**
   * Show `prefix` now; call the provider (read when the debounce ends — no provider = just the prefix) after
   * the debounce. The loader shows only while an async answer is on its way.
   */
  #debouncedSearch(scope: Scope, q: string, prefix: ViewItem[], silent: boolean): void {
    this.emptyLabel = null;
    this.#setResults(prefix);
    this.#run(
      (signal) => (this.#searchFor(scope, q)?.(signal) ?? null) as Result[] | null | PromiseLike<Result[] | null>,
      (results) => {
        this.isLoading = false;
        this.emptyLabel = { key: 'messages.noResults' };
        this.#setResults([...prefix, ...this.#starred(((results ?? []) as Result[]).map((r) => resultItem(r, scope)))]);
      },
      this.#searchDebounce(),
    );
    if (!silent) this.#changed();
  }

  /**
   * Run a provider through the runner (after `debounceMs`), superseding any request pending or in flight:
   * only the latest run's answer reaches `apply` (a failure → `apply(null)`, logged through `host.error`).
   */
  #run<T>(call: (signal: AbortSignal) => T | PromiseLike<T>, apply: (value: T | null) => void, debounceMs = 0): void {
    const land = (value: T | null): void => {
      this.#onFail = null;
      apply(value);
      this.#changed();
    };
    this.#onFail = () => land(null);
    this.#debounce = debounceMs;
    this.#runner.run(call, land);
  }

  /** Drop the pending / running provider call (its answer is ignored) and the loader. */
  #cancel(): void {
    this.#runner.cancel();
    this.#onFail = null;
    this.isLoading = false;
  }

  /** A provider call is waiting for its debounce or its answer. */
  get isPending(): boolean {
    return this.#runner.isPending;
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
    this.totalPages = Math.max(1, Math.ceil(all.length / Math.max(1, this.#options.pageSize)));
    this.#showPage(1);
  }

  #showPage(page: number): void {
    const size = Math.max(1, this.#options.pageSize);
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
      if (this.mode === 'command-step' && step?.isFreeTextAllowed && text) {
        return this.#choose({ stepId: step.id, label: text, value: text, isFreeText: true });
      }
      return false;
    }
    switch (item.kind) {
      case 'command':
        return this.#enterCommand(item.ref as Command, '');
      case 'context':
        this.#enterContext(item.ref as Context, '');
        return false;
      case 'option': {
        if (item.selection) return this.#choose({ ...item.selection });
        const o = item.ref as Option;
        const sel: Selection = { stepId: this.step!.id, label: o.text, value: o.value ?? o.text, isFreeText: false };
        if (o.id != null) sel.optionId = o.id;
        return this.#choose(sel, o.steps);
      }
      case 'result': {
        const r = item.ref as Result;
        const scope: Scope = item.scope ?? (this.mode === 'context-search' && this.context ? { contextId: this.context.id } : 'global');
        this.#cancel();
        return this.#finish({ type: 'select', result: r, scope }, { kind: 'result', label: r.title, result: cloneResult(r), scope });
      }
      case 'usage':
        return this.#selectUsage(item.ref as UsageEntry);
    }
  }

  #selectUsage(e: UsageEntry): boolean {
    switch (e.kind) {
      case 'command':
      case 'run': {
        const c = this.#commands().find((x) => x.id === e.commandId);
        if (!c) return false;
        return this.#enterCommand(c, '', e.kind === 'run' ? e.selections : undefined);
      }
      case 'context': {
        const c = this.#options.contexts.find((x) => x.id === e.contextId);
        if (c) this.#enterContext(c, '');
        return false;
      }
      case 'result': {
        if (!e.result) return false;
        const scope = e.scope ?? 'global';
        this.#cancel();
        return this.#finish({ type: 'select', result: cloneResult(e.result), scope }, { kind: 'result', label: e.result.title, result: e.result, scope });
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
