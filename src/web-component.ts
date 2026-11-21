/**
 * `<web-command-palette>` — the custom element. Kept thin on purpose
 * (IMPLEMENTATION_PLAN §4): it declares the public inputs/events, owns the shadow
 * root + CSS, wires DOM/keyboard to the framework-free engine (`palette.ts`) and
 * paints its state (`render.ts`). Hosts talk to it only through properties,
 * events (`open`, `close`, `select`, `action`, `ready` + their `on*` twins),
 * callbacks and `el.controller`.
 *
 * Mount ONCE per page — the first connected instance owns the global Ctrl/⌘+K
 * listener and the `g <letter>` sequences.
 */
import {
  createStateStore,
  type LoadStateCallback,
  type SaveStateCallback,
  BlissElement,
  adoptStyles,
  announce,
  animateOut,
  SHEET_CHROME_CSS,
  ICON_CSS,
  renderSlot,
  createControllerFacade,
  createCustomStyles,
  createPresentationContext,
  getEnvironment,
  isMotionOff,
  onTextInput,
  dismissAllOverlays,
  deepActiveElement,
  resolvePresentation,
  startModalSession,
  runBeforeCallbackEager,
  toBool,
  toEnum,
  toFunction,
  toInt,
  toObject,
  toObjectArray,
  toText,
  type AnimateOutHandle,
  type BeforeCallbackResult,
  type CustomStylesCallback,
  type CustomStylesHandle,
  type EnvironmentSnapshot,
  type InputDef,
  type Presentation,
  type ModalSession,
  type RenderIconCallback,
  type RenderLoaderCallback,
  type ResponsiveCallback,
  type ResponsiveMap,
} from '@keenmate/web-components-core';
import { runAction } from '@keenmate/web-components-core/actions';
import type { TranslateCallback } from '@keenmate/web-components-core/locale';
import { CommandPaletteEngine, type Effect, type EffectOutcome, type CommandPaletteEngineHost, type CommandPaletteEngineOptions, type TokenView } from './palette';
import { Renderer, confirmationBodyHtml, createShell, fillConfirmation, type Shell } from './render';
import { bindGlobalKeys, handleInputKeydown, isSequence, type GlobalKeysHost } from './keyboard';
import { UsageStore, stateStorePersistence, type UsagePersistence } from './usage';
import {
  type ActionEventDetail,
  type BeforeActionCallback,
  type BeforeResultSelectCallback,
  type Command,
  type CommandPaletteController,
  type FeedbackContext,
  type Context,
  type Display,
  type CommandPaletteLabels,
  type PaletteKeys,
  type LoadUsageCallback,
  type PaletteContext,
  type PaletteUsageState,
  type PaletteEventDetail,
  type RenderFeedbackCallback,
  type Result,
  type SaveUsageCallback,
  type Scope,
  type SearchCallback,
  type SearchBehavior,
  type SearchMatch,
  type Selection,
  type ResultSelectEventDetail,
  type StepOptionsCallback,
  ENGINE_DEFAULTS,
} from './types';
import styles from './css/main.css?inline';

const isPlainObject = (v: unknown): v is Record<string, string> => typeof v === 'object' && v !== null && !Array.isArray(v);

// ============================================================================
// INPUT TABLE — the whole public configuration surface, one row each
// ============================================================================
const INPUTS: readonly InputDef[] = [
  // ── Data (property-only) ─────────────────────────────────────────────────
  { configKey: 'commands', converter: toObjectArray(), on: 'update', type: 'Command[]',
    description: 'Commands, listed on the home screen and under `/` — core action items: `{ id, trigger, text, aliases?, shortcut?, description?, icon?, steps?, tooltip?, cssClass?, isVisible?, isDisabled?, isDanger?, get*Callback(ctx)?, onClick(detail)? }`. Running one fires the `action` event (`id` = the command id) — immediately without `steps`, after the last answer with them.' },
  { configKey: 'contexts', converter: toObjectArray(), on: 'update', type: 'Context[]',
    description: 'Search contexts, listed on the home screen and under `:`. `{ id, trigger, text, aliases?, description?, icon?, searchCallback? }`. Entering one locks the input to `"<trigger> "` and searches via `searchCallback({ scope: { contextId }, term, signal, entries })`.' },
  { configKey: 'labels', attribute: 'labels', converter: toObject({ validate: isPlainObject }), on: 'update', type: 'Partial<CommandPaletteLabels>',
    description: 'UI strings (core `/locale`), flat `<elementType>.<name>` keys (`placeholders.filter`, `ariaLabels.dialog`, `headers.fullscreen`, …). Partial, per key: these (short or full `web-command-palette.<key>` keys) → the page-wide flat `window.components.locale.labels[\'web-command-palette.<key>\']` → English; an empty string renders nothing. Property (object) or JSON attribute (`labels=\'{"placeholders.idle":"Hledat…"}\'`). Content labels (headings, hints, empty / loading / page text) are HTML templates with escaped `{…}` values; attribute / placeholder / announcement labels are plain text. `{name}` / `{key}` / `{page}` / `{total}` / `{count}` are interpolated (numbers locale-formatted); el.translateCallback, then the page-wide `translateCallback`, translate every label `labels` did not set.' },
  { configKey: 'locale', attribute: 'locale', converter: toText({ isNullable: true }), default: ENGINE_DEFAULTS.locale, on: 'update',
    description: 'BCP-47 locale for the numbers in labels (`{count}` / `{page}` / `{total}` — the results count, the pagination row, the "show all" count), or unset (the page-wide `window.components.locale`, else the browser language). Also the `ctx.locale` of `translateCallback`. A change re-renders the labels in place. UI strings are `labels`.' },

  // ── Callbacks (property-only, read live on every call) ───────────────────
  { configKey: 'searchCallback', converter: toFunction(), on: 'update', type: '(ctx: SearchContext) => Result[] | Promise<Result[]>',
    description: "Context + global search. `ctx` = core's shared `SearchCallbackContext` (`{ term, signal, entries }`, the same shape as every Keenmate component; `entries` is always empty — the palette has no client-side records behind a search) + `scope` (`'global'` or `{ contextId }`) + `controller` / `element`. Called only for NON-EMPTY terms, debounced; a superseded call's `signal` is aborted and its late result ignored. A context's own `searchCallback` wins for that context." },
  { configKey: 'getStepOptionsCallback', converter: toFunction(), on: 'update', type: '(ctx: StepOptionsContext) => Option[] | Promise<Option[]>',
    description: 'Options for a command step; `ctx = { commandId, stepId, term, selections, signal }` + `controller` / `element`. A static step is fetched ONCE on entry (term `""`) and filtered client-side; an `isLiveSearch: true` step is called per debounced keystroke. A step with its own `getOptionsCallback` uses that instead.' },
  { configKey: 'beforeActionCallback', converter: toFunction(), on: 'none', type: '(detail: ActionEventDetail) => unknown',
    description: 'Runs before a command fires `action`, with the same detail. Return `false` (async OK) to cancel: no `onClick`, no event, nothing recorded; a wizard steps back to its last answer and the palette stays open.' },
  { configKey: 'beforeResultSelectCallback', converter: toFunction(), on: 'none', type: '(ctx: ResultSelectEventDetail) => unknown',
    description: 'Runs before a search result fires `result-select` (`ctx = { result, scope }`). Return `false` (async OK) to cancel: no event, nothing recorded, the palette stays open. Other return values continue.' },
  { configKey: 'loadUsageCallback', converter: toFunction(), on: 'update', type: '(ctx: PaletteContext) => UsageEntry[] | Promise<UsageEntry[]>',
    description: 'Per-entry host API for favorites/recents (e.g. per user, from the server): returns the whole list. Set → the palette uses it and `saveUsageCallback` instead of the state store (`storage-key`, `loadStateCallback` / `saveStateCallback`). Called on connect and when this or `storage-key` changes.' },
  { configKey: 'renderFeedbackCallback', converter: toFunction(), on: 'none', type: '(ctx: FeedbackContext) => string | Node | null | false',
    description: 'Render the text of the one-line feedback shown after a command ran (the ✓, "Done" and countdown stay). `ctx = { type, commandId?, commandText?, selections?, sentence, result?, scope?, duration }` + `controller` / `element`; `type` is `action` or `select`. Read by core `renderSlot`: a string = HTML, a Node (element, fragment) = mounted, `null` / `undefined` = the built-in line, `false` = hidden (no feedback this time, the palette closes right away). Search-result selections (`type: "select"`) have no built-in line, so they get feedback only when this returns content.' },
  { configKey: 'renderLoadingCallback', converter: toFunction(), on: 'none', type: '(ctx: LoaderRenderContext) => void | (() => void)',
    description: 'Draw the searching loader yourself (shared loader, core SPEC §12.14). `ctx = { component, context, containerElement, element, label }`; `context` is `search` (a search / step-options request in flight, label = the `messages.searching` text). Fill `containerElement` (already `role="status"` + `aria-label`); optionally return a cleanup. Beats the page-wide `window.components.renderLoadingCallback`; unset = the default `.cp__loader` (`--cp-loader-*` tokens).' },
  { configKey: 'renderIconCallback', converter: toFunction(), on: 'update', type: '(name: string, ctx: IconRenderContext) => string | null | undefined',
    description: "Map an item `icon` name to markup for this palette (core `renderIcon`, SPEC §12.33). `ctx = { component, element, prefix: 'cp', item, kind }` — `item` = the row's own `Command` / `Context` / `Option` / `Result` / usage entry, `kind` = `'command' | 'context' | 'option' | 'result' | 'usage'`. Asked after a built-in name (`search`, `check`, … — those always draw the masked `--base-icon-<name>` glyph and never reach a hook) and before the page-wide `window.components.renderIconCallback`. A string is used as is (`''` = no icon); `null` / `undefined` = not mine (the page-wide hook, then the icon-font `<i class=\"cp__icon …\">` / text rule decide). Changing it re-renders the rows." },
  { configKey: 'translateCallback', converter: toFunction(), on: 'update', type: 'TranslateCallback',
    description: "Translate this palette's labels (core `/locale`, SPEC §12.24): `(ctx) => string | null | undefined`, `ctx = { component, key, template, params, locale }` — `key` is the FULL `web-command-palette.<elementType>.<name>` key, `params` the raw values (numbers unformatted). Asked for every label key this instance's `labels` did not set, before the page-wide `window.components.locale.translateCallback`; a string is the finished label, `null` / `undefined` = not mine (the page-wide hook, then the page dictionary / English template). Changing it re-renders every label." },
  { configKey: 'saveUsageCallback', converter: toFunction(), on: 'none', type: '(ctx: { entry: UsageEntry }) => void | Promise<void>',
    description: 'Upsert one favorite/recent entry (`ctx.entry`, by `entry.key`) — called on every use and every star toggle when `loadUsageCallback` is set.' },
  { configKey: 'loadStateCallback', converter: toFunction(), on: 'update', type: 'LoadStateCallback<PaletteUsageState>',
    description: 'Persisted state source (core SPEC §12.17): `(ctx) => { entries } | null | Promise<…>`, `ctx = { key }` + `controller` / `element`. Set both callbacks; either one alone switches `localStorage` off. `loadUsageCallback` (per entry) wins when set.' },
  { configKey: 'saveStateCallback', converter: toFunction(), on: 'none', type: 'SaveStateCallback<PaletteUsageState>',
    description: 'Persisted state sink (core SPEC §12.17): `ctx = { key, state }` + `controller` / `element`, `state` = the WHOLE `{ entries }` on every use / star toggle. Set both callbacks; either one alone switches `localStorage` off.' },

  // ── Custom CSS (core createCustomStyles, rulebook C-CA-15) ───────────────
  { configKey: 'customStyles', attribute: 'custom-styles', converter: toText({ isNullable: true }), on: 'update', type: 'string | null',
    description: "Extra CSS for this palette's shadow root, after the component CSS and after the page-wide `window.components['web-command-palette'].customStyles`, so it overrides both. `@import`s are also linked once in the document head (fonts work). `getCustomStylesCallback` wins when both are set." },
  { configKey: 'getCustomStylesCallback', converter: toFunction(), on: 'update', type: '(ctx: PaletteContext) => string | null | undefined',
    description: 'Computed custom CSS for this palette (`ctx` = `controller` / `element` + the presentation flags); wins over `custom-styles`. Re-run on every build and when this or `custom-styles` changes.' },

  // ── Attributes ───────────────────────────────────────────────────────────
  { configKey: 'display', attribute: 'display', converter: toEnum(['inline', 'tokens'] as const, { default: ENGINE_DEFAULTS.display }), shouldReflect: true, on: 'update',
    description: 'Wizard display: `inline` keeps the accumulated sentence in the input (`/assign iPad to `, prefix locked); `tokens` shows prior answers as removable badges above an empty input.' },
  { configKey: 'size', attribute: 'size', converter: toEnum(['sm', 'lg', 'xl'] as const, { isNullable: true }), shouldReflect: true, on: 'update',
    description: 'Width/height preset (`sm` | `lg` | `xl`). Unset = default. For arbitrary sizes set `--cp-width` / `--cp-results-max-height`.' },
  { configKey: 'pageSize', attribute: 'page-size', converter: toInt({ min: 1, default: ENGINE_DEFAULTS.pageSize }), on: 'update',
    description: 'Search results per page (←/→ to page). Default 8.' },
  { configKey: 'openKey', attribute: 'open-key', converter: toText({ default: ENGINE_DEFAULTS.openKey, isEmptyAllowed: true }), on: 'none',
    description: "Key that toggles the palette together with Ctrl/⌘. Default `k`. Set `''` to disable the global hotkey." },
  { configKey: 'searchDebounce', attribute: 'search-debounce', converter: toInt({ min: 0, default: ENGINE_DEFAULTS.searchDebounce }), on: 'update',
    description: 'Debounce (ms) before a provider call in global search, context search and `isLiveSearch` steps. Static lists never call a provider.' },
  { configKey: 'searchBehavior', attribute: 'search-behavior', converter: toEnum(['normalized', 'case-insensitive', 'exact'] as const, { default: ENGINE_DEFAULTS.searchBehavior }), on: 'update',
    description: 'How the built-in filter (the `/` and `:` lists, static steps, favorites/recent, the commands/contexts prepended to global search) and the `<mark>` highlight normalize text: `normalized` (default) ignores case and diacritics (`ces` finds `Český`), `case-insensitive` ignores case only, `exact` matches both. Live: re-runs the current search. Not applied to `searchCallback` / `getStepOptionsCallback` (they get the term as typed) or `regex` matching.' },
  { configKey: 'searchMatch', attribute: 'search-match', converter: toEnum(['contains', 'equals', 'starts-with', 'word-starts-with', 'ends-with', 'word-ends-with', 'regex'] as const, { default: ENGINE_DEFAULTS.searchMatch }), on: 'update',
    description: 'Where the built-in filter looks for the term in each text field: `contains` (default), `equals` (the whole value), `starts-with` / `ends-with` (whole value), `word-starts-with` / `word-ends-with` (any word), or `regex` (tested against the raw value; an invalid pattern keeps the last valid result). Live: re-runs the current search.' },
  { configKey: 'isFeedbackShown', attribute: 'show-feedback', converter: toBool('default-true'), on: 'none',
    description: 'After a command ran, collapse the dialog to one line for `feedback-duration` ms showing what ran (✓ `/deploy to Staging branch main` · Done) instead of vanishing. The `action` event fires first; `close` follows when it goes. Any key or click dismisses it. `show-feedback="false"` turns it off.' },
  { configKey: 'feedbackDuration', attribute: 'feedback-duration', converter: toInt({ min: 0, default: ENGINE_DEFAULTS.feedbackDuration }), on: 'none',
    description: 'How long the feedback stays (ms). Default 1500; `0` turns it off.' },
  { configKey: 'usageStorage', attribute: 'usage-storage', converter: toEnum(['local', 'none'] as const, { default: ENGINE_DEFAULTS.usageStorage }), shouldReflect: true, on: 'update',
    description: 'Favorites + recents. `local` (default) keeps them under `storage-key` (core state store: `localStorage` `km-state:web-command-palette:<storage-key>`, or `loadStateCallback` / `saveStateCallback`) — or in the host per entry, via `loadUsageCallback` / `saveUsageCallback`, when those are set; `none` turns stars and the Favorites/Recent sections off.' },
  { configKey: 'storageKey', attribute: 'storage-key', converter: toText({ default: ENGINE_DEFAULTS.storageKey }), on: 'update',
    description: 'Key of the persisted favorites/recents (core SPEC §12.17): `localStorage` `km-state:web-command-palette:<storage-key>`, or `ctx.key` of `loadStateCallback` / `saveStateCallback`. Put the user id in it (`cp:usage:42`) so users sharing a browser never see each other’s. `usage-storage="none"` turns persistence off.' },
  { configKey: 'maxFavoriteCount', attribute: 'max-favorite-count', converter: toInt({ min: 0, default: ENGINE_DEFAULTS.maxFavoriteCount }), on: 'update',
    description: 'How many favorites the home screen shows (one-line rows). The heading shows how many more there are; all of them are behind `favorites-key` / `favorites-hotkey`. `0` hides the section.' },
  { configKey: 'maxRecentCount', attribute: 'max-recent-count', converter: toInt({ min: 0, default: ENGINE_DEFAULTS.maxRecentCount }), on: 'update',
    description: 'How many recently/frequently used items the home screen shows (one-line rows). All of them are behind `recent-key` / `recent-hotkey`. `0` hides the section.' },
  { configKey: 'favoriteKey', attribute: 'favorite-key', converter: toText({ default: ENGINE_DEFAULTS.favoriteKey, isEmptyAllowed: true }), on: 'update',
    description: "Ctrl/⌘ + this key stars/unstars the active row while the palette is open. Default `d`; `''` disables." },
  { configKey: 'favoritesKey', attribute: 'favorites-key', converter: toText({ default: ENGINE_DEFAULTS.favoritesKey, isEmptyAllowed: true }), on: 'update',
    description: "Ctrl/⌘ + this key shows all favorites (again: back home) while the palette is open. Default `f`; `''` disables." },
  { configKey: 'recentKey', attribute: 'recent-key', converter: toText({ default: ENGINE_DEFAULTS.recentKey, isEmptyAllowed: true }), on: 'update',
    description: "Ctrl/⌘ + this key shows all recently used items while the palette is open. Default `r`; `''` disables." },
  { configKey: 'favoritesHotkey', attribute: 'favorites-hotkey', converter: toText({ default: ENGINE_DEFAULTS.favoritesHotkey, isEmptyAllowed: true }), on: 'none',
    description: "`g <letter>` sequence that opens the palette on the favorites list from anywhere (while closed, not typing). Default `g f`; `''` disables. A command with the same `shortcut` wins." },
  { configKey: 'recentHotkey', attribute: 'recent-hotkey', converter: toText({ isNullable: true }), on: 'none',
    description: '`g <letter>` sequence that opens the palette on the recent list. Off by default (e.g. `g h`).' },
  { configKey: 'presentation', attribute: 'presentation', converter: toEnum(['auto', 'floating', 'fullscreen'] as const, { default: ENGINE_DEFAULTS.presentation }), shouldReflect: true, on: 'update',
    description: '`auto` (default) opens a fullscreen sheet on touch phones and the floating dialog elsewhere (a narrow desktop window stays floating); `floating` / `fullscreen` force one.' },

  // ── Reserved bridge hooks (wired by @keenmate/keen-web-commandpalette) ─────
  { configKey: 'searchEvent', attribute: 'data-search-event', converter: toText({ isNullable: true }), on: 'none',
    description: 'Reserved for the Phoenix LiveView bridge: the LiveView event that answers `searchCallback` via `{:reply, %{results: …}}` (pushed with the ctx data `{ scope, term }`). Read by the bridge hook, not by this element.' },
  { configKey: 'stepOptionsEvent', attribute: 'data-step-options-event', converter: toText({ isNullable: true }), on: 'none',
    description: 'Reserved for the Phoenix LiveView bridge: the LiveView event that answers `getStepOptionsCallback` (pushed with the ctx data `{ commandId, stepId, term, selections }`). Read by the bridge hook, not by this element.' },
];

type CommandPaletteEvents = {
  open: PaletteEventDetail;
  close: PaletteEventDetail;
  'result-select': ResultSelectEventDetail;
  action: ActionEventDetail;
  ready: PaletteEventDetail;
};

// Every detail carries `controller` / `element` (non-enumerable) and the
// presentation flags; the camelCase `on<Name>` twin is called with the same
// detail before the DOM event (bubbles, not composed).
const EVENTS = [
  { name: 'open', description: 'The palette opened. Twin: `onOpen(detail)`.' },
  { name: 'close', description: 'The palette closed (also after a command ran / a result was chosen). Twin: `onClose(detail)`.' },
  { name: 'result-select', description: "A search result was chosen. `detail = { result, scope }` (`scope` is `'global'` or `{ contextId }`). Perform the effect (navigate…); the palette closes itself. Veto with `beforeResultSelectCallback`. Twin: `onResultSelect(detail)`." },
  { name: 'action', description: "A command ran — immediately (no `steps`) or after the wizard's last answer. `detail = { action: 'custom', id, item, source: 'palette', selections, sourceEvent, triggerElement, dataset }` — `id` is the command id, `item` the command, each selection `{ stepId, label, value, optionId?, isFreeText }`. The command's `onClick(detail)` runs first; veto with `beforeActionCallback`. The palette closes itself. Twin: `onAction(detail)`." },
  { name: 'ready', description: 'The palette was built for the first time (once per element lifetime; fired by core `BlissElement`) — at first connect, or when the `defer` gate is released (`el.release()` / removing `defer`). The host then also has the `ready` attribute and matches `:state(ready)`; `el.whenReady()` resolves. Twin: `onReady(detail)`.' },
] as const;

/** The public facade's methods — each delegates to the element method of the same name. */
const CONTROLLER_METHODS = [
  'open', 'close', 'toggle', 'reset', 'openWith', 'openFavorites', 'openRecent',
] as const satisfies readonly (keyof CommandPaletteController)[];

/** What the one-line feedback needs, captured when the effect fired. */
type Done =
  | { type: 'action'; command: Command; selections: Selection[]; sentence: string; parts: TokenView[] }
  | { type: 'select'; result: Result; scope: Scope };

/** The event (and row) behind an engine call, for the `action` detail. */
interface Trigger {
  event?: Event;
  element?: HTMLElement;
}

/** The element that owns the document-level keys (one palette per page). */
let keyOwner: CommandPaletteElement | null = null;
const connected = new Set<CommandPaletteElement>();

export class CommandPaletteElement extends BlissElement<CommandPaletteEvents, CommandPaletteController> {
  protected static override inputs = INPUTS;
  protected static override events = EVENTS;

  // The inputs are typed through the `CommandPaletteElement` interface merge below
  // (core docs/usage.md "Typing the properties", rulebook C-CA-16); core installs
  // the accessors at runtime from the input table. The `on*` twins come from the
  // event table.
  // camelCase twins — called with the event DETAIL, before the DOM event.
  declare onOpen: ((detail: PaletteEventDetail) => void) | null;
  declare onClose: ((detail: PaletteEventDetail) => void) | null;
  declare onResultSelect: ((detail: ResultSelectEventDetail) => void) | null;
  declare onAction: ((detail: ActionEventDetail) => void) | null;
  declare onReady: ((detail: PaletteEventDetail) => void) | null;

  #shadow: ShadowRoot;
  #shell: Shell;
  #renderer: Renderer;
  #engine: CommandPaletteEngine;
  #globalKeys: GlobalKeysHost;
  /** Unbinds the document-level keys while this palette owns them (core `bindShortcuts`). */
  #unbindGlobalKeys: (() => void) | null = null;
  #usage: UsageStore | null = null;
  #isOpen = false;
  #isFullscreen = false;
  /** The open dialog's core modal session (SPEC §12.19): trap, inert page, backdrop, Escape, Back, scroll lock. */
  #modal: ModalSession | null = null;
  /** What had focus when the palette opened (focus returns there on close). */
  #openedFrom: Element | null = null;
  /** Set while the one-line feedback is showing. */
  #feedbackTimer: ReturnType<typeof setTimeout> | null = null;
  /** The closing animation in flight (core `animateOut`); the dialog leaves the DOM when it ends. */
  #closing: AnimateOutHandle | null = null;
  /** The event / row behind the engine call in progress (for the `action` detail). */
  #trigger: Trigger | null = null;
  /** Page + instance custom CSS (core `createCustomStyles`), created on the first build. */
  #customStyles: CustomStylesHandle | null = null;

  constructor() {
    super();
    this.#shadow = this.attachShadow({ mode: 'open' });
    // The phone sheet bar is core's sheet chrome (SPEC §12.9); after the palette's own CSS, so
    // dialog.css hides the bar off the fullscreen sheet with a stronger selector.
    adoptStyles(this.#shadow, styles, SHEET_CHROME_CSS, ICON_CSS);  // ICON_CSS: core's `.km-icon` (item icons by name + the palette's own glyphs)
    this.#shell = createShell();
    this.#shadow.appendChild(this.#shell.root);
    this.#renderer = new Renderer(this.#shell, this);
    this.#engine = new CommandPaletteEngine(this.#engineHost(), this.#engineOptions());
    this.#globalKeys = {
      isOpen: () => this.#isOpen,
      toggle: () => this.toggle(),
      openKey: () => this.config.openKey as string ?? ENGINE_DEFAULTS.openKey,
      // Hidden / disabled commands don't claim their sequence.
      commands: () => this.#commands().filter((c) => this.#engine.isCommandEnabled(c)),
      runCommand: (command, e) => {
        this.open();
        this.#withTrigger({ event: e }, () => this.#engine.enterCommand(command));
      },
      sequences: () => this.#sequences(),
    };
    this.#wireDom();
  }

  /** Built-in sequences (`'g f'`): favorites / recent lists (only while favorites are on). */
  #sequences(): ReadonlyMap<string, () => void> {
    const map = new Map<string, () => void>();
    if (!this.#usage) return map;
    const fav = this.config.favoritesHotkey as string | null;
    const recent = this.config.recentHotkey as string | null;
    if (fav && isSequence(fav)) map.set(fav, () => this.openFavorites());
    if (recent && isSequence(recent) && !map.has(recent)) map.set(recent, () => this.openRecent());
    return map;
  }

  /** The Ctrl/⌘ shortcuts inside the palette. */
  #keys(): PaletteKeys {
    const key = (name: string, fallback: string): string => {
      const v = this.config[name];
      return typeof v === 'string' ? v : fallback;
    };
    return { favorite: key('favoriteKey', ENGINE_DEFAULTS.favoriteKey), favorites: key('favoritesKey', ENGINE_DEFAULTS.favoritesKey), recent: key('recentKey', ENGINE_DEFAULTS.recentKey) };
  }

  // ── engine wiring ─────────────────────────────────────────────────────────

  #commands(): readonly Command[] {
    return (this.config.commands as Command[] | undefined) ?? [];
  }

  /** The engine's hooks (not settings — those go through `setOptions`, {@link #engineOptions}). */
  #engineHost(): CommandPaletteEngineHost {
    return {
      context: (fields) => this.withContext(fields),
      element: () => this,
      changed: () => this.#render(),
      effect: (effect) => this.#onEffect(effect),
      error: (message, err) => this.log.DATA.error(message, err),
    };
  }

  /**
   * The engine options from this element's inputs (all of them, or the ones `partial` names). Same names and
   * defaults (`ENGINE_DEFAULTS`); `undefined` = the engine's default. UI strings (core `/locale`, rulebook D-NC-24):
   * the engine owns the one resolver (`#engine.labels`) — instance `labels` → `translateCallback` → the page-wide
   * one → page-wide flat `window.components.locale.labels['web-command-palette.<key>']` → English.
   */
  #engineOptions(partial?: Record<string, unknown>): Partial<CommandPaletteEngineOptions> {
    const c = this.config;
    const all: Partial<CommandPaletteEngineOptions> = {
      commands: this.#commands(),
      contexts: (c.contexts as Context[] | undefined) ?? [],
      searchCallback: (c.searchCallback as SearchCallback | null) ?? null,
      getStepOptionsCallback: (c.getStepOptionsCallback as StepOptionsCallback | null) ?? null,
      display: c.display as Display | undefined,
      pageSize: c.pageSize as number | undefined,
      searchDebounce: c.searchDebounce as number | undefined,
      searchBehavior: c.searchBehavior as SearchBehavior | undefined,
      searchMatch: c.searchMatch as SearchMatch | undefined,
      labels: (c.labels as Partial<CommandPaletteLabels> | undefined) ?? null,
      translateCallback: (c.translateCallback as TranslateCallback | null | undefined) ?? null,
      locale: c.locale as string | null | undefined,
      maxRecentCount: c.maxRecentCount as number | undefined,
      maxFavoriteCount: c.maxFavoriteCount as number | undefined,
      favoriteKey: this.#keys().favorite,
    };
    if (!partial) return all;
    const keys = Object.keys(partial);
    return Object.fromEntries(keys.filter((k) => k in all).map((k) => [k, all[k as keyof CommandPaletteEngineOptions]]));
  }

  /** `withContext` typed for the palette: `controller` / `element` + the presentation flags. */
  #ctx<T extends object>(fields: T): T & PaletteContext {
    return this.withContext(fields) as unknown as T & PaletteContext;
  }

  /** Run an engine call with the event / row that caused it on record (for the `action` detail). */
  #withTrigger(trigger: Trigger, fn: () => void): void {
    const previous = this.#trigger;
    this.#trigger = trigger;
    try {
      fn();
    } finally {
      this.#trigger = previous;
    }
  }

  /**
   * A terminal outcome from the engine. `select` and `action` go through their
   * before-hook; the answer (`false` = vetoed) goes back to the engine, which
   * records usage or restores its state. The palette closes (or shows the
   * feedback) only when the effect went ahead.
   */
  #onEffect(effect: Effect): EffectOutcome {
    switch (effect.type) {
      case 'select':
        return this.#select(effect.result, effect.scope);
      case 'action':
        return this.#runCommand(effect.command, effect.selections);
      case 'close':
        this.close();
        return;
    }
  }

  /** A search result: `beforeResultSelectCallback` → `result-select` → close. Sync hooks keep the flow synchronous. */
  #select(result: Result, scope: Scope): boolean | Promise<boolean> {
    const detail: ResultSelectEventDetail = this.#ctx({ result, scope });
    const proceed = (gate: BeforeCallbackResult): boolean => {
      if (gate.isRejected) {
        this.log.INTERACTION.debug('select vetoed', result);
        return false;
      }
      this.log.INTERACTION.debug('select', result);
      this.emit('result-select', detail);
      this.#afterEffect({ type: 'select', result, scope });
      return true;
    };
    const gate = runBeforeCallbackEager(this.config.beforeResultSelectCallback as BeforeResultSelectCallback | null, detail, 'beforeResultSelectCallback');
    return gate instanceof Promise ? gate.then(proceed) : proceed(gate);
  }

  /** A command ran: core `runAction` — `beforeActionCallback` → `onClick` → `action` → close. */
  #runCommand(command: Command, selections: Selection[]): Promise<boolean> {
    const trigger = this.#trigger;
    const e = this.#engine;
    const isCurrent = e.command === command;
    const done: Done = {
      type: 'action',
      command,
      selections,
      sentence: isCurrent ? e.sentence : command.trigger,
      parts: isCurrent ? e.answerParts : [],
    };
    const detail = this.#ctx({
      action: 'custom' as const,
      id: command.id,
      item: command,
      source: 'palette',
      selections,
      sourceEvent: trigger?.event,
      triggerElement: trigger?.element,
      dataset: {},
    }) as ActionEventDetail;
    return runAction({
      detail,
      beforeActionCallback: this.config.beforeActionCallback as BeforeActionCallback | null,
      emitAction: (d) => {
        this.log.INTERACTION.debug('action', d.id, d.selections);
        this.emit('action', d as ActionEventDetail);
      },
    }).then((ran) => {
      if (ran) this.#afterEffect(done);
      else this.log.INTERACTION.debug('action vetoed', command.id);
      return ran;
    });
  }

  /** The effect went ahead: show the feedback, else close. */
  #afterEffect(done: Done): void {
    if (!this.#isOpen) return;
    if (!this.#showFeedback(done)) this.close();
  }

  #render(): void {
    if (this.#isOpen && !this.#feedbackTimer) this.#renderer.render(this.#engine, this.#engine.labels);
  }

  /**
   * Collapse to the one-line feedback and close after `feedback-duration`.
   * Returns false when there's nothing to confirm (off, `0` ms, a search result
   * without custom content, or the callback said `false`).
   */
  #showFeedback(done: Done): boolean {
    if (this.config.isFeedbackShown === false) return false;
    const duration = (this.config.feedbackDuration as number | undefined) ?? ENGINE_DEFAULTS.feedbackDuration;
    if (duration <= 0) return false;

    const command = done.type === 'action' ? done.command : null;
    const ctx: FeedbackContext = this.#ctx(
      done.type === 'select'
        ? { type: 'select' as const, sentence: done.result.title, result: done.result, scope: done.scope, duration }
        : {
            type: 'action' as const,
            commandId: done.command.id,
            commandText: done.command.text,
            selections: done.selections,
            sentence: done.sentence,
            duration,
          },
    );

    // The hook runs once, up front: `false` (hidden) skips the panel, and a search result has no
    // built-in line, so `null` / `undefined` skips it there too (core renderSlot reads the rest).
    let custom: ReturnType<RenderFeedbackCallback> = null;
    const cb = this.config.renderFeedbackCallback as RenderFeedbackCallback | null;
    if (cb) {
      try {
        custom = cb(ctx);
      } catch (err) {
        this.log.UI.error('renderFeedbackCallback failed', err);
      }
    }
    if (custom === false) return false;
    if (custom == null && done.type === 'select') return false;

    // The dialog collapses to this one line (CSS hides the search row, results and
    // footer under `.cp--confirming`); the line takes focus so any key dismisses it.
    const { confirm, root } = this.#shell;
    // The countdown bar shows the timer — decorative, so it goes when motion is off (SPEC §12.16);
    // the timer itself keeps `feedback-duration`.
    const body = fillConfirmation(confirm, this.#engine.labels.html('headers.done'), duration, !isMotionOff(this));
    // Core's one render-callback contract (SPEC §12.35): string = HTML, Node = mounted, null = built-in.
    renderSlot(body, custom, {
      renderDefault: (el) => {
        el.innerHTML = confirmationBodyHtml({
          trigger: command?.trigger,
          text: command?.text ?? ctx.sentence,
          parts: done.type === 'action' ? done.parts : [],
        });
      },
    });
    // Shrink from the dialog's current height to the feedback's (min-height)
    // height with a transition, rather than snapping. The phone sheet is full-height
    // anyway — the line just centres in it.
    const { container } = this.#shell;
    const from = container.getBoundingClientRect().height;
    confirm.hidden = false;
    root.classList.add('cp--confirming');
    if (!this.#isFullscreen && from > 0) {
      const to = container.getBoundingClientRect().height;
      container.style.height = `${from}px`;
      void container.offsetHeight; // commit the start height before transitioning
      container.style.height = `${to}px`;
    }
    confirm.focus();
    const doneText = this.#engine.labels.text('ariaLabels.done');
    announce(doneText ? `${doneText}: ${ctx.sentence}` : ctx.sentence); // core's page-wide live region (SPEC §12.23)
    this.log.UI.debug('feedback', ctx);
    this.#feedbackTimer = setTimeout(() => this.close(), duration);
    return true;
  }

  /** Stop the feedback timer (the line stays drawn until #hideFeedback). */
  #stopFeedback(): void {
    if (!this.#feedbackTimer) return;
    clearTimeout(this.#feedbackTimer);
    this.#feedbackTimer = null;
  }

  /** Take the one-line feedback down (after the dialog has gone, so it never snaps back mid-close). */
  #hideFeedback(): void {
    if (!this.#shell.root.classList.contains('cp--confirming')) return;
    this.#shell.confirm.hidden = true;
    this.#shell.confirm.replaceChildren();
    this.#shell.container.style.height = '';
    this.#shell.root.classList.remove('cp--confirming');
    this.#renderer.invalidate();
  }

  /**
   * Persisted favorites/recents (core SPEC §12.17, rulebook C-CA-17): `storage-key` +
   * `loadStateCallback` / `saveStateCallback`, default `localStorage['km-state:web-command-palette:<key>']`.
   */
  readonly #stateStore = createStateStore<PaletteUsageState>(this, {
    getKey: () => this.config.storageKey as string,
    getLoadCallback: () => this.config.loadStateCallback as LoadStateCallback<PaletteUsageState> | null,
    getSaveCallback: () => this.config.saveStateCallback as SaveStateCallback<PaletteUsageState> | null,
    toContext: (data) => this.#ctx(data),
  });

  /** (Re)build the favorites/recents store from `usage-storage` / `storage-key` / the usage callbacks, and load it. */
  #applyUsage(): void {
    if (this.config.usageStorage === 'none') {
      this.#usage = null;
      this.#engine.setOptions({ usage: null });
      return;
    }
    const load = this.config.loadUsageCallback as LoadUsageCallback | null;
    const persistence: UsagePersistence = load
      ? {
          load: () => load(this.#ctx({})),
          // Read live, so a callback assigned later is still used.
          save: (entry) => (this.config.saveUsageCallback as SaveUsageCallback | null)?.(this.#ctx({ entry })),
        }
      : stateStorePersistence(this.#stateStore);
    this.#usage = new UsageStore(persistence, () => this.#engine.usageChanged(), (err) => this.log.DATA.error('usage storage failed', err));
    this.#engine.setOptions({ usage: this.#usage });
    this.#usage.load();
  }

  // ── DOM wiring ────────────────────────────────────────────────────────────

  /** The row element of the engine's active row, if rendered. */
  #activeRow(): HTMLElement | undefined {
    const index = this.#engine.activeIndex;
    if (index < 0) return undefined;
    return (this.#shell.results.querySelector(`[data-index="${index}"]`) as HTMLElement | null) ?? undefined;
  }

  #wireDom(): void {
    const { input, results, tokens, closeButton, container } = this.#shell;

    // Committed text only (SPEC §12.30): no half-typed IME syllables, no Firefox duplicate.
    onTextInput(input, (value) => this.#engine.setInput(value));
    input.addEventListener('keydown', (e) => {
      this.#withTrigger({ event: e, element: this.#activeRow() }, () => {
        if (handleInputKeydown(e, this.#engine, input, this.#keys(), this.isRtl)) this.log.INTERACTION.trace('key', e.key);
      });
    });

    // Keep focus in the input while clicking rows/tokens.
    const keepFocus = (e: Event): void => e.preventDefault();
    results.addEventListener('mousedown', keepFocus);
    tokens.addEventListener('mousedown', keepFocus);

    results.addEventListener('click', (e) => {
      const star = (e.target as Element).closest?.('[data-star]') as HTMLElement | null;
      if (star) {
        e.stopPropagation();
        this.#engine.toggleFavorite(Number(star.dataset.star));
        return;
      }
      const more = (e.target as Element).closest?.('[data-view]') as HTMLElement | null;
      if (more) {
        this.#engine.showUsage(more.dataset.view === 'recent' ? 'recent' : 'favorites');
        return;
      }
      const row = (e.target as Element).closest?.('[data-index]') as HTMLElement | null;
      if (row) this.#withTrigger({ event: e, element: row }, () => this.#engine.select(Number(row.dataset.index)));
    });
    tokens.addEventListener('click', (e) => {
      const btn = (e.target as Element).closest?.('[data-token]') as HTMLElement | null;
      if (!btn) return;
      e.stopPropagation();
      this.#engine.removeToken(Number(btn.dataset.token));
      input.focus();
    });
    closeButton.addEventListener('click', () => this.close());

    // Tab / Escape / the backdrop go through the core modal session (#startModal); Tab in the
    // input is "select" (handled above — preventDefault, so the session's trap leaves it alone).
    // The one-line feedback holds focus: any plain key or a click dismisses it.
    // Chords (Ctrl/⌘+K…) and lone modifiers pass through to the global toggle.
    this.#shell.confirm.addEventListener('click', () => this.close());
    container.addEventListener('keydown', (e) => {
      // `e.target !== input`: the Enter that finished the command is still bubbling
      // from the input when the feedback appears — it must not dismiss it.
      if (this.#feedbackTimer && e.target !== input) {
        if (e.ctrlKey || e.metaKey || e.altKey || ['Shift', 'Control', 'Meta', 'Alt'].includes(e.key)) return;
        e.preventDefault();
        this.close();
      }
    });
  }

  // ── core lifecycle hooks ──────────────────────────────────────────────────

  protected override reinit(): void {
    // Engine options first — the chrome labels below resolve through the engine's resolver (`#engine.labels`).
    this.#engine.setOptions(this.#engineOptions());
    this.#applyLabels();
    this.#applySize();
    this.#applyUsage();
    this.#renderer.keys = this.#keys();
    this.#applyCustomStyles();
    this.#renderer.invalidate();
    this.#render();
  }

  protected override update(partial: Record<string, unknown>): void {
    // The engine settings this batch changed, first — `setOptions` applies each (the list, wizard step, paging,
    // search) and the chrome labels below resolve through the engine's resolver.
    const engineOptions = this.#engineOptions(partial);
    if (Object.keys(engineOptions).length) this.#engine.setOptions(engineOptions);
    if ('labels' in partial || 'translateCallback' in partial || 'locale' in partial) {
      this.#applyLabels();
      this.#renderer.invalidate();
    }
    if ('renderIconCallback' in partial) this.#renderer.invalidate(); // item icons are drawn into the rows
    if ('size' in partial) this.#applySize();
    if ('customStyles' in partial || 'getCustomStylesCallback' in partial) this.#customStyles?.refresh();
    if ('presentation' in partial) this.#applyPresentation(getEnvironment());
    if ('searchBehavior' in partial || 'searchMatch' in partial) this.#renderer.invalidate();
    if ('usageStorage' in partial || 'storageKey' in partial || 'loadUsageCallback' in partial || 'loadStateCallback' in partial) this.#applyUsage();
    if ('favoriteKey' in partial || 'favoritesKey' in partial || 'recentKey' in partial) {
      this.#renderer.keys = this.#keys();
      this.#renderer.invalidate();
    }
    this.#render();
  }

  /** The page-wide `window.components.locale` changed (core `/locale`): re-resolve every label and
   *  locale-formatted count in place — the open palette keeps its mode, query and wizard answers. */
  protected override localeChanged(): void {
    this.#applyLabels();
    this.#renderer.invalidate();
    this.#render();
  }

  /** The page-wide `window.components.renderIconCallback` changed (core, rulebook C-CA-40): repaint the item
   *  icons in place — the open palette keeps its mode, query, active row and list scroll. */
  protected override iconsChanged(): void {
    const { results } = this.#shell;
    const top = results.scrollTop;
    this.#renderer.invalidate();
    this.#render();
    results.scrollTop = top;
  }

  protected override connect(): void {
    connected.add(this);
    if (!keyOwner) {
      keyOwner = this;
      this.#unbindGlobalKeys = bindGlobalKeys(this.#globalKeys);
    } else if (keyOwner !== this) {
      this.log.INIT.warn('more than one <web-command-palette> is connected; only the first owns the global hotkeys');
    }
  }

  protected override disconnect(): void {
    this.close();
    this.#finishClosingNow();
    connected.delete(this);
    if (keyOwner === this) {
      this.#unbindGlobalKeys?.();
      this.#unbindGlobalKeys = null;
      keyOwner = null;
      // Hand the global keys to another connected palette, if any.
      const next = connected.values().next().value as CommandPaletteElement | undefined;
      if (next) {
        keyOwner = next;
        next.#unbindGlobalKeys = bindGlobalKeys(next.#globalKeys);
      }
    }
  }

  protected override destroyCallback(): void {
    this.#renderer.destroy();
    this.#customStyles?.destroy();
    this.#customStyles = null;
  }

  /** Custom CSS, the canonical core adoption (docs/usage.md "Style injection", rulebook C-CA-15). */
  #applyCustomStyles(): void {
    if (this.#customStyles) return this.#customStyles.refresh();
    this.#customStyles = createCustomStyles<PaletteContext>(this, this.#shadow, { // writes both layers now
      cssClass: 'cp-custom-styles',
      getContext: () => this.#ctx({}),
      getInstanceStyles: () => ({
        css: this.config.customStyles as string | null,
        callback: this.config.getCustomStylesCallback as CustomStylesCallback<PaletteContext> | null,
      }),
    });
  }

  protected override environmentChanged(env: EnvironmentSnapshot): void {
    this.#applyPresentation(env);
  }

  /** The public facade (`el.controller`): the imperative methods below, never the engine. */
  protected override createController(): CommandPaletteController {
    // The target is the element itself (always there): no empty answers needed. Frozen (SPEC §12.34).
    return createControllerFacade<CommandPaletteController>(() => this, {
      methods: CONTROLLER_METHODS,
      // State = the same-named property on element and controller (no set*() duplicates).
      state: { isOpen: false },
      writable: ['commands', 'contexts'],
    });
  }

  /** Presentation flags on every event detail and callback ctx (the palette is a popup). */
  protected override eventContext(): object | undefined {
    return createPresentationContext(this.#isFullscreen ? 'fullscreen' : 'floating');
  }

  /** The shell's own strings (dialog name, close button, sheet title); the rest re-resolve on render. */
  #applyLabels(): void {
    const { container, closeButton, fullscreenTitle } = this.#shell;
    setOrRemove(container, 'aria-label', this.#engine.labels.text('ariaLabels.dialog'));
    setOrRemove(closeButton, 'aria-label', this.#engine.labels.text('ariaLabels.close'));
    fullscreenTitle.textContent = this.#engine.labels.text('headers.fullscreen');
  }

  #applySize(): void {
    const root = this.#shell.root;
    for (const s of ['sm', 'lg', 'xl']) root.classList.toggle(`cp--${s}`, this.config.size === s);
  }

  /** floating vs. the phone fullscreen sheet — capability-first, via core's device classification. */
  #applyPresentation(env: EnvironmentSnapshot): void {
    const mode = (this.config.presentation as Presentation | null) ?? ENGINE_DEFAULTS.presentation;
    const isFullscreen = resolvePresentation(mode, env) !== 'floating';
    if (isFullscreen === this.#isFullscreen) return;
    this.#isFullscreen = isFullscreen;
    this.#shell.root.classList.toggle('cp--fullscreen', isFullscreen);
    this.log.UI.debug('presentation', isFullscreen ? 'fullscreen' : 'floating');
    // The keyboard inset is per sheet kind: restart the session (the Back entry is re-claimed, focus stays).
    if (this.#isOpen && this.#modal) {
      this.#modal.end({ shouldReturnFocus: false });
      this.#startModal(false);
    }
  }

  /**
   * The core modal session (SPEC §12.19) for the open dialog. Escape and the phone Back gesture
   * step back first (wizard step, context search, full favorites / recent list), then close; the
   * feedback line and a focused close button close at once.
   */
  #startModal(shouldFocusInput: boolean): void {
    const { container, backdrop, input } = this.#shell;
    const canStepBack = (): boolean => !this.#feedbackTimer && this.#engine.canStepBack;
    this.#modal = startModalSession(container, {
      backdrop,
      trigger: this.#openedFrom,
      initialFocus: shouldFocusInput ? input : false,
      shouldObserveKeyboardInset: this.#isFullscreen,
      beforeEscapeCallback: () => {
        if (!canStepBack() || deepActiveElement() !== input) return true;
        this.#engine.back();
        return false;
      },
      onDismiss: (reason) => {
        if (reason === 'back' && canStepBack()) {
          this.#engine.back();
          this.#modal?.rearmBack();
          return;
        }
        this.close();
      },
    });
  }

  // ── public API (also on `el.controller`) ──────────────────────────────────

  /** Whether the palette is open. (Also reflected as the `open` attribute.) */
  get isOpen(): boolean {
    return this.#isOpen;
  }

  /** Open on the home screen. No-op when already open. */
  open(): void {
    // Re-opening while the feedback shows (e.g. `g d` right after a run) starts fresh.
    if (this.#feedbackTimer) this.close();
    // Re-opened while the closing animation runs: stop it, the dialog animates in again.
    this.#finishClosingNow();
    if (this.#isOpen) return;
    this.flush();
    // One overlay at a time: dismiss any open KM popovers (closed palette ignores its own dismiss).
    dismissAllOverlays();
    this.#isOpen = true;
    this.#openedFrom = deepActiveElement();
    this.#engine.reset();
    this.#shell.root.classList.add('cp--active');
    this.toggleAttribute('open', true);
    this.#renderer.invalidate();
    this.#render();
    this.#startModal(true);
    this.log.UI.debug('open');
    this.emit('open');
  }

  /**
   * Close and reset. No-op when already closed. The palette is closed at once — `isOpen`, the
   * `open` attribute, scroll lock, focus return and the `close` event all happen now; only the
   * dialog's exit animation (backdrop fade, dialog slide-up, timed by `--cp-transition-normal`)
   * plays after, then it leaves the DOM. Motion off / reduced motion: it leaves at once.
   */
  close(): void {
    if (!this.#isOpen) return;
    this.#stopFeedback();
    this.#isOpen = false;
    this.#renderer.clearLoader();
    this.#engine.dispose();
    this.#engine.reset();
    this.toggleAttribute('open', false);
    // Blur first: when focus came from <body> (not focusable), it would otherwise stay
    // in the hidden input — and `g <letter>` sequences ignore keys while typing.
    this.#shell.input.blur();
    // Focus goes back to what had it on open; the page leaves `inert`, scroll unlocks, Back is released.
    this.#modal?.end();
    this.#modal = null;
    this.#openedFrom = null;
    // Started before the event, so a `close` listener that re-opens cancels it.
    this.#animateClose();
    this.log.UI.debug('close');
    this.emit('close');
  }

  /** The exit animation (core `animateOut`, SPEC §12.16): both go once the longer animation ends. */
  #animateClose(): void {
    const { container, backdrop } = this.#shell;
    this.#closing = animateOut([container, backdrop], {
      className: (el) => (el === backdrop ? 'cp__backdrop--closing' : 'cp__container--closing'),
      onDone: () => this.#removeDialog(),
    });
  }

  /** Out of the page: hide the dialog, drop the closing classes and the feedback line. */
  #removeDialog(): void {
    this.#closing = null;
    const { root, container, backdrop } = this.#shell;
    root.classList.remove('cp--active');
    container.classList.remove('cp__container--closing');
    backdrop.classList.remove('cp__backdrop--closing');
    this.#hideFeedback();
  }

  /** A closing animation in flight ends now (re-open, disconnect). */
  #finishClosingNow(): void {
    if (!this.#closing) return;
    this.#closing.cancel();
    this.#removeDialog();
  }

  /** Open when closed, close when open. */
  toggle(): void {
    // While the feedback shows, the user is moving on: Ctrl/⌘+K opens a fresh palette.
    if (this.#isOpen && !this.#feedbackTimer) this.close();
    else this.open();
  }

  /** Back to the home screen (stays open). */
  reset(): void {
    this.flush();
    this.#engine.reset();
  }

  /** Open pre-filled with `term` (e.g. `'/deploy'`, `':products laptop'`), run through the normal input pipeline. */
  openWith(term: string): void {
    this.open();
    this.#engine.setInput(term ?? '');
  }

  /** Open on the full favorites list (what `g f` does). No-op list when favorites are off. */
  openFavorites(): void {
    this.open();
    if (this.#engine.usageView !== 'favorites') this.#engine.showUsage('favorites');
  }

  /** Open on the full recently-used list. */
  openRecent(): void {
    this.open();
    if (this.#engine.usageView !== 'recent') this.#engine.showUsage('recent');
  }
}

/** `''` (a deliberately empty label) removes the attribute instead of leaving it blank. */
function setOrRemove(el: Element, name: string, value: string): void {
  if (value) el.setAttribute(name, value);
  else el.removeAttribute(name);
}

/**
 * Every input a `<web-command-palette>` accepts (configKey → value type), exactly the input
 * table's rows — the config type the responsive rules target and the element's typed
 * properties (merged into {@link CommandPaletteElement} below). `undefined` (or removing the
 * attribute) resets an input to its default; `null` is a value only where the type lists it.
 */
export interface CommandPaletteConfig {
  // data
  commands: Command[];
  contexts: Context[];
  labels: Partial<CommandPaletteLabels> | undefined;
  locale: string | null;
  // callbacks
  searchCallback: SearchCallback | null;
  getStepOptionsCallback: StepOptionsCallback | null;
  beforeActionCallback: BeforeActionCallback | null;
  beforeResultSelectCallback: BeforeResultSelectCallback | null;
  loadUsageCallback: LoadUsageCallback | null;
  renderFeedbackCallback: RenderFeedbackCallback | null;
  renderLoadingCallback: RenderLoaderCallback | null;
  renderIconCallback: RenderIconCallback | null;
  translateCallback: TranslateCallback | null;
  saveUsageCallback: SaveUsageCallback | null;
  loadStateCallback: LoadStateCallback<PaletteUsageState> | null;
  saveStateCallback: SaveStateCallback<PaletteUsageState> | null;
  // custom CSS
  customStyles: string | null;
  getCustomStylesCallback: CustomStylesCallback<PaletteContext> | null;
  // attributes
  display: Display;
  size: 'sm' | 'lg' | 'xl' | null;
  pageSize: number;
  openKey: string;
  searchDebounce: number;
  searchBehavior: SearchBehavior;
  searchMatch: SearchMatch;
  isFeedbackShown: boolean;
  feedbackDuration: number;
  usageStorage: 'local' | 'none';
  storageKey: string;
  maxFavoriteCount: number;
  maxRecentCount: number;
  favoriteKey: string;
  favoritesKey: string;
  recentKey: string;
  favoritesHotkey: string;
  recentHotkey: string | null;
  presentation: Presentation;
  // reserved bridge hooks
  searchEvent: string | null;
  stepOptionsEvent: string | null;
}

// Every input as a typed property: el.commands, el.presentation, … (core docs/usage.md
// "Typing the properties", rulebook C-CA-16).
export interface CommandPaletteElement extends CommandPaletteConfig {}

/**
 * Responsive rules map (core SPEC §6.7): `{ device?, breakpoint? }` — device class
 * (`mobile` / `tablet` / `desktop`, by touch capability) and / or window-width bucket →
 * partial config; `device` wins on the same key. Page-wide (`window.components.responsive`), per tag
 * (`window.components['web-command-palette'].responsive`) or per instance (`el.responsive`,
 * JSON attribute `responsive`).
 */
export type CommandPaletteResponsiveMap = ResponsiveMap<CommandPaletteConfig>;

/**
 * Computed responsive rule (core SPEC §6.7): `(ctx) => partial config | undefined` (`null`
 * from the instance callback = ignore every page rule). `ctx.config` is the BASE config.
 */
export type CommandPaletteResponsiveCallback = ResponsiveCallback<CommandPaletteConfig>;
