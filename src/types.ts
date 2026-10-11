/**
 * Public data shapes for `<web-command-palette>`.
 *
 * Everything a host hands IN (commands, contexts, options, results) and everything
 * the component hands OUT (callback arguments, event details) is plain JSON — no
 * functions, no class instances — so a LiveView bridge can serialize it verbatim
 * (IMPLEMENTATION_PLAN §7). The one exception is the optional `Step.shouldShow`
 * predicate, which a JS host may use; server-driven hosts simply omit it.
 */

/**
 * An item icon. Rendered by shape (see `icons.ts`):
 *  - starts with `<`              → raw SVG/HTML markup, injected as-is (host-trusted)
 *  - starts with an ASCII letter  → an icon NAME → `<span class="pa-icon pa-icon--NAME">`
 *  - anything else                → text (emoji / glyph)
 */
export type IconInput = string;

/** Badge colour variants (pure-admin `pa-badge--*`). */
export type BadgeVariant = 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'secondary';

/** One step of a multi-step command (a "wizard" prompt). */
export interface Step {
  id: string;
  /** Inline connective text shown before this step's input, e.g. `" in "`. Default `" "`. */
  prompt?: string;
  /** Input placeholder while this step is active. */
  placeholder?: string;
  /** Allow submitting the typed text (Enter) when no option matches. */
  freeText?: boolean;
  /**
   * `true` = LIVE search: `stepOptionsCallback` is called per (debounced) keystroke.
   * Falsy (default) = STATIC: the full option list is fetched ONCE on step entry
   * (or taken from `options`) and filtered client-side with zero latency.
   */
  search?: boolean;
  /** Inline static options — the zero-callback way to define a static step. */
  options?: Option[];
  /** Skip this step unless the predicate returns true (JS hosts only). */
  shouldShow?: (selections: Selection[]) => boolean;
  /**
   * This step's own options provider (JS hosts only) — same contract as
   * `stepOptionsCallback`, which stays the fallback for steps without one. Lets a
   * picker be defined once and reused: `{ id: 'user', ...pickUser }`.
   */
  load?: StepOptionsCallback;
}

/** A command, listed under `/` and on the home screen. */
export interface Command {
  id: string;
  /** e.g. `"/go"`. */
  shortcut: string;
  name: string;
  aliases?: string[];
  /** Leading-key sequence (`"g g"`) — fires from anywhere while the palette is closed. A chord (`"Ctrl+K"`) is displayed only. */
  hotkey?: string;
  description?: string;
  icon?: IconInput;
  /** Absent/empty = instant command (fires `cp-command`). */
  steps?: Step[];
}

/** A search context, listed under `:` and on the home screen. */
export interface Context {
  id: string;
  /** e.g. `":products"`. */
  shortcut: string;
  name: string;
  aliases?: string[];
  description?: string;
  icon?: IconInput;
  /**
   * This context's own search (JS hosts only). Called instead of `searchCallback`
   * for queries inside the context — same rules: non-empty queries, debounced, abortable.
   */
  search?: (query: string, signal: AbortSignal) => MaybePromise<Result[] | null | undefined>;
}

/** A command-step option. */
export interface Option {
  id?: string;
  label: string;
  value?: unknown;
  description?: string;
  icon?: IconInput;
  /**
   * Branch: steps asked right after this option is chosen, before the step's
   * remaining siblings. `"/assign-admin John to [group|site] …"` — the `group`
   * and `site` options each carry their own follow-up step. Step ids must be
   * unique across the whole command.
   */
  steps?: Step[];
}

/** A search hit (context or global). Extra keys pass through to the `cp-select` handler. */
export interface Result {
  id: string;
  title: string;
  subtitle?: string;
  icon?: IconInput;
  badge?: string;
  badgeVariant?: BadgeVariant;
  href?: string;
  /** Section heading. Results are clustered by group in first-appearance order. */
  group?: string;
  [key: string]: unknown;
}

/** What a search runs against. */
export type Scope = 'global' | { contextId: string };

/** One recorded wizard answer. */
export interface Selection {
  stepId: string;
  label: string;
  /** The option's `value` (falls back to its label), or the typed text for a free-text answer. */
  value: unknown;
  /** The chosen option's `id`, when it had one. */
  optionId?: string;
  /** True when the answer is typed free text rather than a listed option. */
  isFreeText: boolean;
}

/** Argument of `stepOptionsCallback`. */
export interface StepOptionsContext {
  commandId: string;
  stepId: string;
  query: string;
  selections: Selection[];
}

export type MaybePromise<T> = T | Promise<T>;

/**
 * One remembered thing — a favorite and/or a recently used item. Plain JSON: this
 * is what `localStorage` holds and what `saveUsageCallback` upserts.
 *  - `command` — an instant command, or a wizard to start blank (a starred command)
 *  - `run`     — a completed wizard with its answers; replayed with Tab / Enter
 *  - `context` — a search context
 *  - `result`  — a chosen search hit
 */
export interface UsageEntry {
  /** Stable identity, e.g. `command:deploy`, `run:deploy:[…]`, `context:products`, `result:global:p1`. */
  key: string;
  kind: 'command' | 'run' | 'context' | 'result';
  /** Display text captured when recorded (a run's whole sentence). */
  label: string;
  commandId?: string;
  selections?: Selection[];
  contextId?: string;
  item?: Result;
  scope?: Scope;
  /** Times used. 0 for an item starred but never used. */
  count: number;
  /** Epoch ms of the last use (or of starring). */
  lastUsed: number;
  isFavorite: boolean;
}

/** What `renderConfirmationCallback` gets — plain JSON, like the effect events. */
export interface ConfirmationContext {
  /** Which effect just fired: a finished wizard, an instant command, or a chosen search result. */
  type: 'complete' | 'command' | 'select';
  commandId?: string;
  /** The command's display name. */
  commandName?: string;
  selections?: Selection[];
  /** `"/deploy to Staging branch main"`, the command shortcut, or the result title. */
  sentence: string;
  item?: Result;
  scope?: Scope;
  /** How long the panel stays (ms). */
  duration: number;
}

/**
 * Render the confirmation panel. Return markup or an element to replace the default,
 * `null`/`undefined` for the default, or `false` to skip the confirmation this time.
 */
export type RenderConfirmationCallback = (ctx: ConfirmationContext) => string | HTMLElement | null | undefined | false;

export type LoadUsageCallback = () => MaybePromise<UsageEntry[] | null | undefined>;
/** Upsert one entry (insert or replace by `key`). */
export type SaveUsageCallback = (entry: UsageEntry) => MaybePromise<void>;

export type SearchCallback = (scope: Scope, query: string, signal: AbortSignal) => MaybePromise<Result[] | null | undefined>;
export type StepOptionsCallback = (ctx: StepOptionsContext, signal: AbortSignal) => MaybePromise<Option[] | null | undefined>;

/** Every visible string. `{name}`, `{page}`, `{total}`, `{count}` are placeholders. */
export interface Labels {
  /** Idle input placeholder. */
  placeholder: string;
  /** Step input placeholder when the step defines none. */
  filterPlaceholder: string;
  emptyText: string;
  /** Loader text. */
  searching: string;
  /** Context pill in context search; `{name}`. */
  searchingIn: string;
  /** Empty-query prompt in context search; `{name}`. */
  typeToSearch: string;
  /** Home heading for commands, and the context pill under `/`. */
  commands: string;
  /** Home heading for contexts. */
  search: string;
  /** Context pill under `:`. */
  searchContexts: string;
  /** Pagination row; `{page}`, `{total}`, `{count}`. */
  pageOf: string;
  navigate: string;
  select: string;
  back: string;
  close: string;
  pages: string;
  /** Title of the phone fullscreen sheet. */
  fullscreenTitle: string;
  /** Accessible name of the dialog. */
  dialogLabel: string;
  /** Accessible name of a token's remove button; `{name}`. */
  removeToken: string;
  /** Live-region announcement of the result count; `{count}`. */
  resultsCount: string;
  /** Home heading for starred items. */
  favorites: string;
  /** Home heading for recently / frequently used items. */
  recent: string;
  /** Star button / footer hint, when the active row is not starred. */
  addFavorite: string;
  /** Star button, when the active row is starred. */
  removeFavorite: string;
  /** Footer hint for Tab in a wizard (accept and go to the next step). */
  next: string;
  /** Footer hint for Enter when remembered answers can finish the wizard. */
  run: string;
  /** Badge on a replayed step's remembered answer. */
  lastUsed: string;
  /** Home section-heading link to the full list; `{count}` = rows not shown on the home screen. */
  showAll: string;
  /** Favorites list with nothing starred; `{key}` = the star shortcut. */
  noFavorites: string;
  /** Recent list with nothing used yet. */
  noRecent: string;
  /** Confirmation panel heading after a command ran. */
  done: string;
}

export const DEFAULT_LABELS: Labels = {
  placeholder: 'Type / for commands, : to search, or just start typing…',
  filterPlaceholder: 'Type to filter…',
  emptyText: 'No results found',
  searching: 'Searching…',
  searchingIn: 'Searching in {name}',
  typeToSearch: 'Type to search {name}',
  commands: 'Commands',
  search: 'Search',
  searchContexts: 'Search contexts',
  pageOf: 'Page {page} of {total} · {count} results',
  navigate: 'Navigate',
  select: 'Select',
  back: 'Back',
  close: 'Close',
  pages: 'Pages',
  fullscreenTitle: 'Search',
  dialogLabel: 'Command palette',
  removeToken: 'Remove {name}',
  resultsCount: '{count} results',
  favorites: 'Favorites',
  recent: 'Recent',
  addFavorite: 'Add to favorites',
  removeFavorite: 'Remove from favorites',
  next: 'Next',
  run: 'Run',
  lastUsed: 'Last used',
  showAll: '+{count}',
  noFavorites: 'No favorites yet — star a row with {key}',
  noRecent: 'Nothing used yet',
  done: 'Done',
};

/** Palette modes (IMPLEMENTATION_PLAN §10). */
export type Mode =
  | 'idle'
  | 'command-list'
  | 'command-step'
  | 'context-list'
  | 'context-search'
  | 'global-search'
  /** All favorites, filterable (Ctrl/⌘+F, `g f`). */
  | 'favorites-list'
  /** All recently used items, filterable (Ctrl/⌘+R). */
  | 'recent-list';

export type Display = 'inline' | 'tokens';

// ── event details ─────────────────────────────────────────────────────────────

export interface SelectEventDetail {
  item: Result;
  scope: Scope;
}
export interface CompleteEventDetail {
  commandId: string;
  selections: Selection[];
}
export interface CommandEventDetail {
  commandId: string;
}
