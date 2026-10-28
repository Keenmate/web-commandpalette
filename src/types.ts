/**
 * Public data shapes for `<web-command-palette>`.
 *
 * Everything a host hands IN (commands, contexts, options, results) and everything
 * the component hands OUT (callback contexts, event details) is plain JSON data
 * (IMPLEMENTATION_PLAN §7), so a LiveView bridge can serialize it verbatim. The
 * component context every ctx / detail carries — `controller` and `element` (and a
 * search ctx's `signal`) — is attached NON-enumerable: destructuring works,
 * `JSON.stringify` / `Object.keys` see only the data. Functions on items
 * (`onClick`, `get*Callback`, `searchCallback`, `getOptionsCallback`) are JS-only
 * conveniences; server-driven hosts omit them.
 */
import type { ActionEventDetail as CoreActionEventDetail, ActionItem, ComponentContext } from '@keenmate/web-components-core/actions';
import type { PresentationContext } from '@keenmate/web-components-core';

/**
 * An item icon. Rendered by shape (see `icons.ts`):
 *  - starts with `<`              → raw SVG/HTML markup, injected as-is (host-trusted)
 *  - starts with an ASCII letter  → an icon NAME → `<span class="pa-icon pa-icon--NAME">`
 *  - anything else                → text (emoji / glyph)
 */
export type IconInput = string;

/** Badge colour variants (pure-admin `pa-badge--*`). */
export type BadgeVariant = 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'secondary';

export type MaybePromise<T> = T | Promise<T>;

// ── controller + component context ──────────────────────────────────────────

/**
 * The palette's public facade — `el.controller`, and `controller` on every
 * callback ctx and event detail. The imperative API of the element; the internal
 * `PaletteEngine` is never exposed.
 */
export interface CommandPaletteController {
  /** Whether the palette is open. */
  readonly isOpen: boolean;
  /** The commands (same as `el.commands`; assigning re-renders). */
  commands: Command[];
  /** The search contexts (same as `el.contexts`). */
  contexts: Context[];
  /** Open on the home screen. No-op when already open. */
  open(): void;
  /** Close and reset. No-op when already closed. */
  close(): void;
  /** Open when closed, close when open. */
  toggle(): void;
  /** Back to the home screen (stays open). */
  reset(): void;
  /** Open pre-filled with `term` (`'/deploy'`, `':products laptop'`), run through the normal input pipeline. */
  openWith(term: string): void;
  /** Open on the full favorites list (what `g f` does). */
  openFavorites(): void;
  /** Open on the full recently-used list. */
  openRecent(): void;
}

/**
 * What every callback ctx and event detail carries: `controller` + `element`
 * (non-enumerable) and the presentation flags (`presentation`, `isFullscreen`,
 * `isModal`) — the palette is a popup. A standalone `PaletteEngine` without an
 * element host passes plain objects (no controller / element / presentation).
 */
// The element type comes from the tag-name map (declared in index.ts), so this
// side-layer file doesn't import the element module.
export type PaletteContext = ComponentContext<CommandPaletteController, HTMLElementTagNameMap['web-command-palette']> & PresentationContext;

// ── commands (action items) ─────────────────────────────────────────────────

/** The surface context of a command: render-time `get*Callback`s and, at activation, the action detail. */
export interface CommandContext extends PaletteContext {
  /** The wizard answers. Empty at render time and for a command without steps. */
  selections: Selection[];
}

/**
 * A command, listed on the home screen and under `/`. A command is a core
 * `ActionItem` (`@keenmate/web-components-core/actions`): activating it — Enter /
 * click on a command without `steps`, or the last answer of a wizard — runs
 * `beforeActionCallback` → `onClick` → the `action` event (`source: 'palette'`).
 * The palette has no built-in actions, so `action` is always `'custom'` and `id`
 * identifies the command. `isToggled` / `getIsToggledCallback` are not supported
 * (palette rows are not toggles).
 */
export interface Command extends Omit<ActionItem<CommandContext, never>, 'id' | 'text' | 'isToggled' | 'getIsToggledCallback'> {
  id: string;
  /** The slash token that runs it, e.g. `"/go"`. */
  trigger: string;
  /** Display text. */
  text: string;
  /** More slash tokens that match, e.g. `["/g"]`. */
  aliases?: string[];
  /**
   * Key chord shown on the home-screen row. A `g <letter>` sequence (`"g d"`) also
   * runs the command from anywhere while the palette is closed; a chord
   * (`"Ctrl+K"`) is displayed only.
   */
  shortcut?: string;
  /** The row's second line (searched by the `/` filter). */
  description?: string;
  icon?: IconInput;
  /** Absent / empty = the command fires `action` immediately. Otherwise a wizard runs first. */
  steps?: Step[];
}

/**
 * The `action` event detail (also `onAction`, the command's `onClick` and
 * `beforeActionCallback`): `action: 'custom'`, `id` (the command id), `item` (the
 * command), `source: 'palette'`, `selections`, `sourceEvent` (the keydown / click
 * that ran it), `triggerElement` (the activated row, when there was one),
 * `dataset` (`{}`), plus `controller` / `element` / presentation.
 */
export type ActionEventDetail = CoreActionEventDetail<CommandContext, never> & { item: Command };

// ── wizard steps ────────────────────────────────────────────────────────────

/** The ctx of `Step.getIsVisibleCallback`. */
export interface StepContext extends PaletteContext {
  commandId: string;
  stepId: string;
  /** The answers so far. */
  selections: Selection[];
}

/** The ctx of `getStepOptionsCallback` / `Step.getOptionsCallback`. */
export interface StepOptionsContext extends StepContext {
  /** The step's typed text (`''` for a static step's one-time fetch). */
  term: string;
  /** Aborted when the request is superseded or the palette closes. Non-enumerable. */
  readonly signal: AbortSignal;
}

export type StepOptionsCallback = (ctx: StepOptionsContext) => MaybePromise<Option[] | null | undefined>;

/** One step of a multi-step command (a "wizard" prompt). */
export interface Step {
  id: string;
  /** Inline connective text shown before this step's input, e.g. `" in "`. Default `" "`. */
  prompt?: string;
  /** Input placeholder while this step is active. */
  placeholder?: string;
  /** Allow submitting the typed text (Enter) when no option matches. */
  isFreeTextAllowed?: boolean;
  /**
   * `true` = LIVE search: the options provider is called per (debounced) keystroke.
   * Falsy (default) = STATIC: the full option list is fetched ONCE on step entry
   * (or taken from `options`) and filtered client-side with zero latency.
   */
  isLiveSearch?: boolean;
  /** Inline static options — the zero-callback way to define a static step. */
  options?: Option[];
  /** Skip this step unless it returns `true` (JS hosts only). */
  getIsVisibleCallback?: (ctx: StepContext) => boolean;
  /**
   * This step's own options provider (JS hosts only) — same contract as
   * `getStepOptionsCallback`, which stays the fallback for steps without one. Lets a
   * picker be defined once and reused: `{ id: 'user', ...pickUser }`.
   */
  getOptionsCallback?: StepOptionsCallback;
}

/** A command-step option. */
export interface Option {
  id?: string;
  text: string;
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

/** One recorded wizard answer. Persisted in usage entries, so its fields are stable. */
export interface Selection {
  stepId: string;
  /** The chosen option's `text`, or the typed text. */
  label: string;
  /** The option's `value` (falls back to its text), or the typed text for a free-text answer. */
  value: unknown;
  /** The chosen option's `id`, when it had one. */
  optionId?: string;
  /** True when the answer is typed free text rather than a listed option. */
  isFreeText: boolean;
}

// ── search ──────────────────────────────────────────────────────────────────

/** What a search runs against. */
export type Scope = 'global' | { contextId: string };

/** The ctx of `searchCallback` / `Context.searchCallback`. */
export interface SearchContext extends PaletteContext {
  /** `'global'` or `{ contextId }`. */
  scope: Scope;
  /** The (non-empty, trimmed) search term. */
  term: string;
  /** Aborted when the request is superseded or the palette closes. Non-enumerable. */
  readonly signal: AbortSignal;
}

export type SearchCallback = (ctx: SearchContext) => MaybePromise<Result[] | null | undefined>;

/** A search context, listed under `:` and on the home screen. */
export interface Context {
  id: string;
  /** The colon token that enters it, e.g. `":products"`. */
  trigger: string;
  /** Display text. */
  text: string;
  aliases?: string[];
  description?: string;
  icon?: IconInput;
  /**
   * This context's own search (JS hosts only). Called instead of `searchCallback`
   * for queries inside the context — same rules: non-empty terms, debounced, abortable.
   */
  searchCallback?: SearchCallback;
}

/**
 * A search hit (context or global). Extra keys pass through to the `result-select`
 * handler. A data record, not an action item — and persisted verbatim in usage
 * entries — so it keeps its `title` / `subtitle` pair.
 */
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

// ── favorites / recents ─────────────────────────────────────────────────────

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
  result?: Result;
  scope?: Scope;
  /** Times used. 0 for an item starred but never used. */
  count: number;
  /** Epoch ms of the last use (or of starring). */
  lastUsed: number;
  isFavorite: boolean;
}

export type LoadUsageCallback = (ctx: PaletteContext) => MaybePromise<UsageEntry[] | null | undefined>;
/** Upsert `ctx.entry` (insert or replace by `key`). */
export type SaveUsageCallback = (ctx: PaletteContext & { entry: UsageEntry }) => MaybePromise<void>;

// ── feedback ────────────────────────────────────────────────────────────

/** What `renderFeedbackCallback` gets. */
export interface FeedbackContext extends PaletteContext {
  /** Which effect just fired: a command ran (`action`) or a search result was chosen (`select`). */
  type: 'action' | 'select';
  commandId?: string;
  /** The command's display text. */
  commandText?: string;
  /** The wizard answers (`[]` for a command without steps). */
  selections?: Selection[];
  /** `"/deploy to Staging branch main"`, the command trigger, or the result title. */
  sentence: string;
  /** The chosen search result (`type: 'select'`). */
  result?: Result;
  scope?: Scope;
  /** How long the panel stays (ms). */
  duration: number;
}

/**
 * Render the feedback panel. Return markup or an element to replace the default,
 * `null`/`undefined` for the default, or `false` to skip the feedback this time.
 */
export type RenderFeedbackCallback = (ctx: FeedbackContext) => string | HTMLElement | null | undefined | false;

// ── before-hooks ────────────────────────────────────────────────────────────

/**
 * `beforeSelectCallback(ctx)` — a search result is about to be chosen. Return
 * `false` (or a Promise of it) to cancel: no `result-select` event, nothing recorded, the
 * palette stays open. Any other return continues.
 */
export type BeforeSelectCallback = (ctx: SelectEventDetail) => unknown;

/**
 * `beforeActionCallback(detail)` — a command is about to run (the `action` detail).
 * Return `false` (or a Promise of it) to cancel: no `onClick`, no `action` event,
 * nothing recorded; a wizard steps back to its last answer, the palette stays open.
 */
export type BeforeActionCallback = (detail: ActionEventDetail) => unknown;

/**
 * Every visible string. `{name}`, `{page}`, `{total}`, `{count}` are placeholders.
 * All labels are text (escaped on insertion, never parsed as HTML). `''` = deliberately
 * empty (render nothing); a missing / `undefined` key = the English default.
 */
export interface Labels {
  /** Idle input placeholder. */
  placeholder: string;
  /** Step input placeholder when the step defines none. */
  filterPlaceholder: string;
  /** A search / filter matched nothing. */
  noResults: string;
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
  /** Feedback panel heading after a command ran. */
  done: string;
}

export const DEFAULT_LABELS: Labels = {
  placeholder: 'Type / for commands, : to search, or just start typing…',
  filterPlaceholder: 'Type to filter…',
  noResults: 'No results found',
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

/**
 * The one label resolver (the future seam for core `/locale`): defaults, overlaid by the
 * given keys. `''` is kept (deliberately empty); `undefined` / `null` falls back to the default.
 */
export function resolveLabels(custom: Partial<Labels> | null | undefined): Labels {
  const out: Labels = { ...DEFAULT_LABELS };
  if (custom) {
    for (const key of Object.keys(custom) as (keyof Labels)[]) {
      const v = custom[key];
      if (typeof v === 'string') out[key] = v;
    }
  }
  return out;
}

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
// Every detail carries `controller` / `element` (non-enumerable) and the
// presentation flags; the `on<Name>` twin receives the same object.

/** `open` / `close` / `ready`. */
export type PaletteEventDetail = PaletteContext;

/** `result-select` — a search result was chosen. */
export interface SelectEventDetail extends PaletteContext {
  /** The chosen search result. */
  result: Result;
  scope: Scope;
}
