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
  BlissElement,
  adoptStyles,
  createPresentationContext,
  getEnvironment,
  lockBodyScroll,
  observeKeyboardInset,
  registerOverlay,
  dismissAllOverlays,
  resolvePresentation,
  runBeforeCallbackEager,
  toBool,
  toEnum,
  toFunction,
  toInt,
  toObjectArray,
  toText,
  toValue,
  type BeforeCallbackResult,
  type EnvironmentSnapshot,
  type InputDef,
  type Presentation,
  type OverlayHandle,
  type RenderLoaderCallback,
  type ResponsiveCallback,
  type ResponsiveMap,
} from '@keenmate/web-components-core';
import { runAction } from '@keenmate/web-components-core/actions';
import { PaletteEngine, type Effect, type EffectOutcome, type PaletteEngineHost, type TokenView } from './palette';
import { Renderer, chordKeycap, confirmationBodyHtml, createShell, fillConfirmation, type Shell } from './render';
import { GlobalKeys, handleInputKeydown, sequenceLetter, type PaletteKeys } from './keyboard';
import { UsageStore, localStoragePersistence, type UsagePersistence } from './usage';
import {
  DEFAULT_LABELS,
  resolveLabels,
  type ActionEventDetail,
  type BeforeActionCallback,
  type BeforeResultSelectCallback,
  type Command,
  type CommandPaletteController,
  type FeedbackContext,
  type Context,
  type Display,
  type Labels,
  type LoadUsageCallback,
  type PaletteContext,
  type PaletteEventDetail,
  type RenderFeedbackCallback,
  type Result,
  type SaveUsageCallback,
  type Scope,
  type SearchCallback,
  type Selection,
  type ResultSelectEventDetail,
  type StepOptionsCallback,
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
    description: 'Search contexts, listed on the home screen and under `:`. `{ id, trigger, text, aliases?, description?, icon?, searchCallback? }`. Entering one locks the input to `"<trigger> "` and searches via `searchCallback({ scope: { contextId }, term, signal })`.' },
  { configKey: 'labels', converter: toValue({ validate: isPlainObject }), on: 'update', type: 'Partial<Labels>',
    description: 'UI strings (i18n). Partial — unset (`undefined`) keys fall back to English; an empty string renders nothing. Text, escaped (never HTML). `{name}` / `{page}` / `{total}` / `{count}` placeholders are interpolated.' },

  // ── Callbacks (property-only, read live on every call) ───────────────────
  { configKey: 'searchCallback', converter: toFunction(), on: 'none', type: '(ctx: SearchContext) => Result[] | Promise<Result[]>',
    description: "Context + global search. `ctx = { scope, term, signal }` + `controller` / `element`; `scope` is `'global'` or `{ contextId }`. Called only for NON-EMPTY terms, debounced; a superseded call's `signal` is aborted and its late result ignored. A context's own `searchCallback` wins for that context." },
  { configKey: 'getStepOptionsCallback', converter: toFunction(), on: 'none', type: '(ctx: StepOptionsContext) => Option[] | Promise<Option[]>',
    description: 'Options for a command step; `ctx = { commandId, stepId, term, selections, signal }` + `controller` / `element`. A static step is fetched ONCE on entry (term `""`) and filtered client-side; an `isLiveSearch: true` step is called per debounced keystroke. A step with its own `getOptionsCallback` uses that instead.' },
  { configKey: 'beforeActionCallback', converter: toFunction(), on: 'none', type: '(detail: ActionEventDetail) => unknown',
    description: 'Runs before a command fires `action`, with the same detail. Return `false` (async OK) to cancel: no `onClick`, no event, nothing recorded; a wizard steps back to its last answer and the palette stays open.' },
  { configKey: 'beforeResultSelectCallback', converter: toFunction(), on: 'none', type: '(ctx: ResultSelectEventDetail) => unknown',
    description: 'Runs before a search result fires `result-select` (`ctx = { result, scope }`). Return `false` (async OK) to cancel: no event, nothing recorded, the palette stays open. Other return values continue.' },
  { configKey: 'loadUsageCallback', converter: toFunction(), on: 'update', type: '(ctx: PaletteContext) => UsageEntry[] | Promise<UsageEntry[]>',
    description: 'Load favorites/recents from the host (e.g. per user, from the server) instead of `localStorage`. Called on connect and when this or `usage-key` changes.' },
  { configKey: 'renderFeedbackCallback', converter: toFunction(), on: 'none', type: '(ctx: FeedbackContext) => string | HTMLElement | null | false',
    description: 'Render the text of the one-line feedback shown after a command ran (the ✓, "Done" and countdown stay). `ctx = { type, commandId?, commandText?, selections?, sentence, result?, scope?, duration }` + `controller` / `element`; `type` is `action` or `select`. Return markup / an element to replace the default, `null` for the default, or `false` to skip it this time. Search-result selections (`type: "select"`) get no feedback unless this returns content.' },
  { configKey: 'renderLoadingCallback', converter: toFunction(), on: 'none', type: '(ctx: LoaderRenderContext) => void | (() => void)',
    description: 'Draw the searching loader yourself (shared loader, core SPEC §12.14). `ctx = { component, context, containerElement, element, label }`; `context` is `search` (a search / step-options request in flight, `labels.searching`). Fill `containerElement` (already `role="status"` + `aria-label`); optionally return a cleanup. Beats the page-wide `window.components.renderLoaderCallback`; unset = the default `.cp-loader` (`--cp-loader-*` tokens).' },
  { configKey: 'saveUsageCallback', converter: toFunction(), on: 'none', type: '(ctx: { entry: UsageEntry }) => void | Promise<void>',
    description: 'Upsert one favorite/recent entry (`ctx.entry`, by `entry.key`) — called on every use and every star toggle when `loadUsageCallback` is set.' },

  // ── Attributes ───────────────────────────────────────────────────────────
  { configKey: 'display', attribute: 'display', converter: toEnum(['inline', 'tokens'] as const, { default: 'inline' }), shouldReflect: true, on: 'update',
    description: 'Wizard display: `inline` keeps the accumulated sentence in the input (`/assign iPad to `, prefix locked); `tokens` shows prior answers as removable badges above an empty input.' },
  { configKey: 'size', attribute: 'size', converter: toEnum(['sm', 'lg', 'xl'] as const, { shouldNullOnInvalid: true }), shouldReflect: true, on: 'update',
    description: 'Width/height preset (`sm` | `lg` | `xl`). Unset = default. For arbitrary sizes set `--cp-width` / `--cp-results-max-height`.' },
  { configKey: 'pageSize', attribute: 'page-size', converter: toInt({ min: 1, default: 8 }), on: 'update',
    description: 'Search results per page (←/→ to page). Default 8.' },
  { configKey: 'openKey', attribute: 'open-key', converter: toText({ default: 'k', isEmptyAllowed: true }), on: 'none',
    description: "Key that toggles the palette together with Ctrl/⌘. Default `k`. Set `''` to disable the global hotkey." },
  { configKey: 'searchDebounce', attribute: 'search-debounce', converter: toInt({ min: 0, default: 150 }), on: 'none',
    description: 'Debounce (ms) before a provider call in global search, context search and `isLiveSearch` steps. Static lists never call a provider.' },
  { configKey: 'isFeedbackShown', attribute: 'show-feedback', converter: toBool('default-true'), on: 'none',
    description: 'After a command ran, collapse the dialog to one line for `feedback-duration` ms showing what ran (✓ `/deploy to Staging branch main` · Done) instead of vanishing. The `action` event fires first; `close` follows when it goes. Any key or click dismisses it. `show-feedback="false"` turns it off.' },
  { configKey: 'feedbackDuration', attribute: 'feedback-duration', converter: toInt({ min: 0, default: 1500 }), on: 'none',
    description: 'How long the feedback stays (ms). Default 1500; `0` turns it off.' },
  { configKey: 'usageStorage', attribute: 'usage-storage', converter: toEnum(['local', 'none'] as const, { default: 'local' }), shouldReflect: true, on: 'update',
    description: 'Favorites + recents. `local` (default) keeps them in `localStorage` under `usage-key` — or in the host, via `loadUsageCallback` / `saveUsageCallback`, when those are set; `none` turns stars and the Favorites/Recent sections off.' },
  { configKey: 'usageKey', attribute: 'usage-key', converter: toText({ default: 'web-commandpalette:usage' }), on: 'update',
    description: '`localStorage` key for favorites/recents. Put the user id in it (`cp:usage:42`) so users sharing a browser never see each other’s.' },
  { configKey: 'maxFavoriteCount', attribute: 'max-favorite-count', converter: toInt({ min: 0, default: 3 }), on: 'update',
    description: 'How many favorites the home screen shows (one-line rows). The heading shows how many more there are; all of them are behind `favorites-key` / `favorites-hotkey`. `0` hides the section.' },
  { configKey: 'maxRecentCount', attribute: 'max-recent-count', converter: toInt({ min: 0, default: 3 }), on: 'update',
    description: 'How many recently/frequently used items the home screen shows (one-line rows). All of them are behind `recent-key` / `recent-hotkey`. `0` hides the section.' },
  { configKey: 'favoriteKey', attribute: 'favorite-key', converter: toText({ default: 'd', isEmptyAllowed: true }), on: 'update',
    description: "Ctrl/⌘ + this key stars/unstars the active row while the palette is open. Default `d`; `''` disables." },
  { configKey: 'favoritesKey', attribute: 'favorites-key', converter: toText({ default: 'f', isEmptyAllowed: true }), on: 'update',
    description: "Ctrl/⌘ + this key shows all favorites (again: back home) while the palette is open. Default `f`; `''` disables." },
  { configKey: 'recentKey', attribute: 'recent-key', converter: toText({ default: 'r', isEmptyAllowed: true }), on: 'update',
    description: "Ctrl/⌘ + this key shows all recently used items while the palette is open. Default `r`; `''` disables." },
  { configKey: 'favoritesHotkey', attribute: 'favorites-hotkey', converter: toText({ default: 'g f', isEmptyAllowed: true }), on: 'none',
    description: "`g <letter>` sequence that opens the palette on the favorites list from anywhere (while closed, not typing). Default `g f`; `''` disables. A command with the same `shortcut` wins." },
  { configKey: 'recentHotkey', attribute: 'recent-hotkey', converter: toText({ isNullable: true }), on: 'none',
    description: '`g <letter>` sequence that opens the palette on the recent list. Off by default (e.g. `g h`).' },
  { configKey: 'presentation', attribute: 'presentation', converter: toEnum(['auto', 'floating', 'fullscreen'] as const, { default: 'auto' }), shouldReflect: true, on: 'update',
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

  // Type-only: core installs the accessors at runtime from the input/event tables.
  declare commands: Command[];
  declare contexts: Context[];
  declare labels: Partial<Labels> | undefined;
  declare searchCallback: SearchCallback | null;
  declare getStepOptionsCallback: StepOptionsCallback | null;
  declare beforeActionCallback: BeforeActionCallback | null;
  declare beforeResultSelectCallback: BeforeResultSelectCallback | null;
  declare loadUsageCallback: LoadUsageCallback | null;
  declare saveUsageCallback: SaveUsageCallback | null;
  declare usageStorage: 'local' | 'none';
  declare usageKey: string;
  declare maxRecentCount: number;
  declare maxFavoriteCount: number;
  declare favoriteKey: string;
  declare favoritesKey: string;
  declare recentKey: string;
  declare favoritesHotkey: string;
  declare recentHotkey: string | null;
  declare isFeedbackShown: boolean;
  declare feedbackDuration: number;
  declare renderFeedbackCallback: RenderFeedbackCallback | null;
  declare renderLoadingCallback: RenderLoaderCallback | null;
  declare display: Display;
  declare size: 'sm' | 'lg' | 'xl' | null;
  declare pageSize: number;
  declare openKey: string;
  declare searchDebounce: number;
  declare presentation: 'auto' | 'floating' | 'fullscreen';
  // camelCase twins — called with the event DETAIL, before the DOM event.
  declare onOpen: ((detail: PaletteEventDetail) => void) | null;
  declare onClose: ((detail: PaletteEventDetail) => void) | null;
  declare onResultSelect: ((detail: ResultSelectEventDetail) => void) | null;
  declare onAction: ((detail: ActionEventDetail) => void) | null;
  declare onReady: ((detail: PaletteEventDetail) => void) | null;

  #shadow: ShadowRoot;
  #shell: Shell;
  #renderer: Renderer;
  #engine: PaletteEngine;
  #globalKeys: GlobalKeys;
  #usage: UsageStore | null = null;
  #isOpen = false;
  #isFullscreen = false;
  #labels: Labels = DEFAULT_LABELS;
  #overlay: OverlayHandle | null = null;
  #releaseScroll: (() => void) | null = null;
  #releaseInset: (() => void) | null = null;
  #returnFocus: HTMLElement | null = null;
  /** Set while the one-line feedback is showing. */
  #feedbackTimer: ReturnType<typeof setTimeout> | null = null;
  /** The event / row behind the engine call in progress (for the `action` detail). */
  #trigger: Trigger | null = null;

  constructor() {
    super();
    this.#shadow = this.attachShadow({ mode: 'open' });
    adoptStyles(this.#shadow, styles);
    this.#shell = createShell();
    this.#shadow.appendChild(this.#shell.root);
    this.#renderer = new Renderer(this.#shell, this);
    this.#engine = new PaletteEngine(this.#engineHost());
    this.#globalKeys = new GlobalKeys({
      isOpen: () => this.#isOpen,
      toggle: () => this.toggle(),
      openKey: () => this.config.openKey as string ?? 'k',
      // Hidden / disabled commands don't claim their `g <letter>` sequence.
      commands: () => this.#commands().filter((c) => this.#engine.isCommandEnabled(c)),
      runCommand: (command, e) => {
        this.open();
        this.#withTrigger({ event: e }, () => this.#engine.enterCommand(command));
      },
      sequences: () => this.#sequences(),
    });
    this.#wireDom();
  }

  /** Built-in `g <letter>` sequences: favorites / recent lists (only while favorites are on). */
  #sequences(): ReadonlyMap<string, () => void> {
    const map = new Map<string, () => void>();
    if (!this.#usage) return map;
    const fav = sequenceLetter(this.config.favoritesHotkey as string | null);
    const recent = sequenceLetter(this.config.recentHotkey as string | null);
    if (fav) map.set(fav, () => this.openFavorites());
    if (recent && !map.has(recent)) map.set(recent, () => this.openRecent());
    return map;
  }

  /** The Ctrl/⌘ shortcuts inside the palette. */
  #keys(): PaletteKeys {
    const key = (name: string, fallback: string): string => {
      const v = this.config[name];
      return typeof v === 'string' ? v : fallback;
    };
    return { favorite: key('favoriteKey', 'd'), favorites: key('favoritesKey', 'f'), recent: key('recentKey', 'r') };
  }

  // ── engine wiring ─────────────────────────────────────────────────────────

  #commands(): readonly Command[] {
    return (this.config.commands as Command[] | undefined) ?? [];
  }

  #engineHost(): PaletteEngineHost {
    return {
      commands: () => this.#commands(),
      contexts: () => (this.config.contexts as Context[] | undefined) ?? [],
      searchCallback: () => (this.config.searchCallback as SearchCallback | null) ?? null,
      getStepOptionsCallback: () => (this.config.getStepOptionsCallback as StepOptionsCallback | null) ?? null,
      context: (fields) => this.withContext(fields),
      display: () => (this.config.display as Display) ?? 'inline',
      pageSize: () => (this.config.pageSize as number) ?? 8,
      debounceMs: () => (this.config.searchDebounce as number) ?? 150,
      labels: () => this.#labels,
      usage: () => this.#usage,
      maxRecentCount: () => (this.config.maxRecentCount as number) ?? 3,
      maxFavoriteCount: () => (this.config.maxFavoriteCount as number) ?? 3,
      starKey: () => chordKeycap(this.#keys().favorite),
      changed: () => this.#render(),
      effect: (effect) => this.#onEffect(effect),
      error: (message, err) => this.log.DATA.error(message, err),
    };
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
    if (this.#isOpen && !this.#feedbackTimer) this.#renderer.render(this.#engine, this.#labels);
  }

  /**
   * Collapse to the one-line feedback and close after `feedback-duration`.
   * Returns false when there's nothing to confirm (off, `0` ms, a search result
   * without custom content, or the callback said `false`).
   */
  #showFeedback(done: Done): boolean {
    if (this.config.isFeedbackShown === false) return false;
    const duration = (this.config.feedbackDuration as number | undefined) ?? 1500;
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
    // footer under `.cp-confirming`); the line takes focus so any key dismisses it.
    const { confirm, live, root } = this.#shell;
    const body = fillConfirmation(confirm, this.#labels.done, duration);
    if (custom instanceof HTMLElement) body.appendChild(custom);
    else if (typeof custom === 'string') body.innerHTML = custom;
    else {
      body.innerHTML = confirmationBodyHtml({
        trigger: command?.trigger,
        text: command?.text ?? ctx.sentence,
        parts: done.type === 'action' ? done.parts : [],
      });
    }
    // Shrink from the dialog's current height to the feedback's (min-height)
    // height with a transition, rather than snapping. The phone sheet is full-height
    // anyway — the line just centres in it.
    const { container } = this.#shell;
    const from = container.getBoundingClientRect().height;
    confirm.hidden = false;
    root.classList.add('cp-confirming');
    if (!this.#isFullscreen && from > 0) {
      const to = container.getBoundingClientRect().height;
      container.style.height = `${from}px`;
      void container.offsetHeight; // commit the start height before transitioning
      container.style.height = `${to}px`;
    }
    confirm.focus();
    live.textContent = this.#labels.done ? `${this.#labels.done}: ${ctx.sentence}` : ctx.sentence;
    this.log.UI.debug('feedback', ctx);
    this.#feedbackTimer = setTimeout(() => this.close(), duration);
    return true;
  }

  #endFeedback(): void {
    if (!this.#feedbackTimer) return;
    clearTimeout(this.#feedbackTimer);
    this.#feedbackTimer = null;
    this.#shell.confirm.hidden = true;
    this.#shell.confirm.replaceChildren();
    this.#shell.container.style.height = '';
    this.#shell.root.classList.remove('cp-confirming');
    this.#renderer.invalidate();
  }

  /** (Re)build the favorites/recents store from `usage-storage` / `usage-key` / the usage callbacks, and load it. */
  #applyUsage(): void {
    if (this.config.usageStorage === 'none') {
      this.#usage = null;
      this.#engine.usageChanged();
      return;
    }
    const load = this.config.loadUsageCallback as LoadUsageCallback | null;
    const persistence: UsagePersistence = load
      ? {
          load: () => load(this.#ctx({})),
          // Read live, so a callback assigned later is still used.
          save: (entry) => (this.config.saveUsageCallback as SaveUsageCallback | null)?.(this.#ctx({ entry })),
        }
      : localStoragePersistence((this.config.usageKey as string) || 'web-commandpalette:usage');
    this.#usage = new UsageStore(persistence, () => this.#engine.usageChanged(), (err) => this.log.DATA.error('usage storage failed', err));
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
    const { input, results, tokens, backdrop, closeButton, container } = this.#shell;

    input.addEventListener('input', (e) => {
      if ((e as InputEvent).isComposing) return;
      this.#engine.setInput(input.value);
    });
    input.addEventListener('compositionend', () => this.#engine.setInput(input.value));
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
    backdrop.addEventListener('click', () => this.close());
    closeButton.addEventListener('click', () => this.close());

    // Focus trap: Tab inside the input selects (handled above); from anywhere else
    // in the dialog (the fullscreen close button) Tab returns to the input.
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
        return;
      }
      if (e.key === 'Tab' && e.target !== input) {
        e.preventDefault();
        input.focus();
      } else if (e.key === 'Escape' && e.target !== input) {
        e.preventDefault();
        this.close();
      }
    });
  }

  // ── core lifecycle hooks ──────────────────────────────────────────────────

  protected override reinit(): void {
    this.#applyLabels();
    this.#applySize();
    this.#applyUsage();
    this.#renderer.keys = this.#keys();
    this.#engine.refresh();
    this.#renderer.invalidate();
    this.#render();
  }

  protected override update(partial: Record<string, unknown>): void {
    if ('labels' in partial) {
      this.#applyLabels();
      this.#renderer.invalidate();
    }
    if ('size' in partial) this.#applySize();
    if ('presentation' in partial) this.#applyPresentation(getEnvironment());
    if ('commands' in partial || 'contexts' in partial) this.#engine.refresh();
    if ('display' in partial) this.#engine.displayChanged();
    if ('pageSize' in partial) this.#engine.pageSizeChanged();
    if ('usageStorage' in partial || 'usageKey' in partial || 'loadUsageCallback' in partial) this.#applyUsage();
    else if ('maxRecentCount' in partial || 'maxFavoriteCount' in partial) this.#engine.refresh();
    if ('favoriteKey' in partial || 'favoritesKey' in partial || 'recentKey' in partial) {
      this.#renderer.keys = this.#keys();
      this.#renderer.invalidate();
    }
    this.#render();
  }

  protected override connect(): void {
    connected.add(this);
    if (!keyOwner) {
      keyOwner = this;
      this.#globalKeys.install();
    } else if (keyOwner !== this) {
      this.log.INIT.warn('more than one <web-command-palette> is connected; only the first owns the global hotkeys');
    }
    this.#overlay = registerOverlay(() => this.close());
  }

  protected override disconnect(): void {
    this.close();
    this.#overlay?.destroy();
    this.#overlay = null;
    connected.delete(this);
    if (keyOwner === this) {
      this.#globalKeys.uninstall();
      keyOwner = null;
      // Hand the global keys to another connected palette, if any.
      const next = connected.values().next().value as CommandPaletteElement | undefined;
      if (next) {
        keyOwner = next;
        next.#globalKeys.install();
      }
    }
  }

  protected override environmentChanged(env: EnvironmentSnapshot): void {
    this.#applyPresentation(env);
  }

  /** The public facade (`el.controller`): the imperative methods below, never the engine. */
  protected override createController(): CommandPaletteController {
    const el = this;
    const controller = {
      get isOpen(): boolean {
        return el.isOpen;
      },
      // State = the same-named property on element and controller (no set*() duplicates).
      get commands(): Command[] {
        return el.commands;
      },
      set commands(list: Command[]) {
        el.commands = list;
      },
      get contexts(): Context[] {
        return el.contexts;
      },
      set contexts(list: Context[]) {
        el.contexts = list;
      },
    } as CommandPaletteController;
    for (const name of CONTROLLER_METHODS) {
      Object.defineProperty(controller, name, {
        value: (...args: unknown[]) => (el[name] as (...a: unknown[]) => void)(...args),
        enumerable: true,
      });
    }
    return controller;
  }

  /** Presentation flags on every event detail and callback ctx (the palette is a popup). */
  protected override eventContext(): object | undefined {
    return createPresentationContext(this.#isFullscreen ? 'fullscreen' : 'floating');
  }

  #applyLabels(): void {
    const custom = this.config.labels as Partial<Labels> | undefined;
    this.#labels = resolveLabels(custom);
    const { container, closeButton, fullscreenTitle } = this.#shell;
    setOrRemove(container, 'aria-label', this.#labels.dialogLabel);
    setOrRemove(closeButton, 'aria-label', this.#labels.close);
    fullscreenTitle.textContent = this.#labels.fullscreenTitle;
  }

  #applySize(): void {
    const root = this.#shell.root;
    for (const s of ['sm', 'lg', 'xl']) root.classList.toggle(`pa-command-palette--${s}`, this.config.size === s);
  }

  /** floating vs. the phone fullscreen sheet — capability-first, via core's device classification. */
  #applyPresentation(env: EnvironmentSnapshot): void {
    const mode = (this.config.presentation as Presentation | null) ?? 'auto';
    const isFullscreen = resolvePresentation(mode, env) !== 'floating';
    if (isFullscreen === this.#isFullscreen) return;
    this.#isFullscreen = isFullscreen;
    this.#shell.root.classList.toggle('pa-command-palette--fullscreen', isFullscreen);
    this.log.UI.debug('presentation', isFullscreen ? 'fullscreen' : 'floating');
    if (this.#isOpen) this.#syncKeyboardInset();
  }

  #syncKeyboardInset(): void {
    if (this.#isOpen && this.#isFullscreen) {
      this.#releaseInset ??= observeKeyboardInset(this.#shell.container);
    } else {
      this.#releaseInset?.();
      this.#releaseInset = null;
    }
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
    if (this.#isOpen) return;
    this.flush();
    // One overlay at a time: dismiss any open KM popovers (closed palette ignores its own dismiss).
    dismissAllOverlays();
    this.#overlay?.activate();
    this.#isOpen = true;
    this.#returnFocus = deepActiveElement();
    this.#engine.reset();
    this.#shell.root.classList.add('pa-command-palette--active');
    this.toggleAttribute('open', true);
    this.#releaseScroll = lockBodyScroll();
    this.#syncKeyboardInset();
    this.#renderer.invalidate();
    this.#render();
    this.#shell.input.focus();
    this.log.UI.debug('open');
    this.emit('open');
  }

  /** Close and reset. No-op when already closed. */
  close(): void {
    if (!this.#isOpen) return;
    this.#endFeedback();
    this.#isOpen = false;
    this.#renderer.clearLoader();
    this.#engine.dispose();
    this.#engine.reset();
    this.#shell.root.classList.remove('pa-command-palette--active');
    this.toggleAttribute('open', false);
    this.#overlay?.deactivate();
    this.#releaseScroll?.();
    this.#releaseScroll = null;
    this.#syncKeyboardInset();
    const back = this.#returnFocus;
    this.#returnFocus = null;
    // Blur first: when focus came from <body> (not focusable), it would otherwise stay
    // in the hidden input — and `g <letter>` sequences ignore keys while typing.
    this.#shell.input.blur();
    if (back?.isConnected && typeof back.focus === 'function') back.focus();
    this.log.UI.debug('close');
    this.emit('close');
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

/** The focused element, piercing shadow roots. */
function deepActiveElement(): HTMLElement | null {
  let el = document.activeElement as HTMLElement | null;
  while (el?.shadowRoot?.activeElement) el = el.shadowRoot.activeElement as HTMLElement;
  return el;
}

// Importing this module registers the element. The global-API publish + logger
// wiring happens in index.ts via registerComponent(); both defines are idempotent.
if (typeof customElements !== 'undefined' && !customElements.get('web-command-palette')) {
  customElements.define('web-command-palette', CommandPaletteElement);
}

/** `''` (a deliberately empty label) removes the attribute instead of leaving it blank. */
function setOrRemove(el: Element, name: string, value: string): void {
  if (value) el.setAttribute(name, value);
  else el.removeAttribute(name);
}

/**
 * Every input a `<web-command-palette>` accepts (configKey → value type) — the config
 * type the responsive rules target.
 */
export type CommandPaletteConfig = Pick<CommandPaletteElement,
  | 'commands' | 'contexts' | 'labels' | 'searchCallback' | 'getStepOptionsCallback'
  | 'beforeActionCallback' | 'beforeResultSelectCallback' | 'loadUsageCallback' | 'saveUsageCallback'
  | 'renderFeedbackCallback' | 'renderLoadingCallback' | 'usageStorage' | 'usageKey'
  | 'maxRecentCount' | 'maxFavoriteCount' | 'favoriteKey' | 'favoritesKey' | 'recentKey'
  | 'favoritesHotkey' | 'recentHotkey' | 'isFeedbackShown' | 'feedbackDuration'
  | 'display' | 'size' | 'pageSize' | 'openKey' | 'searchDebounce' | 'presentation'>;

/**
 * Responsive rules map (core SPEC §6.7): device class (`mobile` / `tablet` / `desktop`) →
 * partial config. Page-wide (`window.components.responsive`), per tag
 * (`window.components['web-command-palette'].responsive`) or per instance (`el.responsive`,
 * JSON attribute `responsive`).
 */
export type CommandPaletteResponsiveMap = ResponsiveMap<CommandPaletteConfig>;

/**
 * Computed responsive rule (core SPEC §6.7): `(ctx) => partial config | undefined` (`null`
 * from the instance callback = ignore every page rule). `ctx.config` is the BASE config.
 */
export type CommandPaletteResponsiveCallback = ResponsiveCallback<CommandPaletteConfig>;
