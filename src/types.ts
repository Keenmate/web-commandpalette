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
}

/** A command-step option. */
export interface Option {
  id?: string;
  label: string;
  value?: unknown;
  description?: string;
  icon?: IconInput;
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
};

/** Palette modes (IMPLEMENTATION_PLAN §10). */
export type Mode = 'idle' | 'command-list' | 'command-step' | 'context-list' | 'context-search' | 'global-search';

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
