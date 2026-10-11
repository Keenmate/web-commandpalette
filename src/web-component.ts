/**
 * `<web-command-palette>` — the custom element. Kept thin on purpose
 * (IMPLEMENTATION_PLAN §4): it declares the public inputs/events, owns the shadow
 * root + CSS, wires DOM/keyboard to the framework-free machine (`palette.ts`) and
 * paints its state (`render.ts`). Hosts talk to it only through properties,
 * events and async callbacks.
 *
 * Mount ONCE per page — the first connected instance owns the global Ctrl/⌘+K
 * listener and the `g <letter>` sequences.
 */
import {
  BlissElement,
  adoptStyles,
  getEnvironment,
  lockBodyScroll,
  observeKeyboardInset,
  registerOverlay,
  dismissAllOverlays,
  resolvePresentation,
  toBool,
  toEnum,
  toFunction,
  toInt,
  toObjectArray,
  toText,
  toValue,
  type EnvironmentSnapshot,
  type InputDef,
  type MobilePresentation,
  type OverlayHandle,
} from '@keenmate/web-components-core';
import { PaletteMachine, type Effect, type MachineHost } from './palette';
import { Renderer, chordKeycap, confirmationBodyHtml, createShell, fillConfirmation, type Shell } from './render';
import { GlobalKeys, handleInputKeydown, sequenceLetter, type PaletteKeys } from './keyboard';
import { UsageStore, localStoragePersistence, type UsagePersistence } from './usage';
import {
  DEFAULT_LABELS,
  type Command,
  type CommandEventDetail,
  type CompleteEventDetail,
  type Context,
  type Display,
  type Labels,
  type LoadUsageCallback,
  type SaveUsageCallback,
  type ConfirmationContext,
  type RenderConfirmationCallback,
  type SearchCallback,
  type SelectEventDetail,
  type StepOptionsCallback,
} from './types';
import styles from './css/main.scss?inline';

const isPlainObject = (v: unknown): v is Record<string, string> => typeof v === 'object' && v !== null && !Array.isArray(v);

// ============================================================================
// INPUT TABLE — the whole public configuration surface, one row each
// ============================================================================
const INPUTS: readonly InputDef[] = [
  // ── Data (property-only) ─────────────────────────────────────────────────
  { configKey: 'commands', converter: toObjectArray(), on: 'update', type: 'Command[]',
    description: 'Commands, listed on the home screen and under `/`. `{ id, shortcut, name, aliases?, hotkey?, description?, icon?, steps? }`. A command without `steps` is instant and fires `cp-command`; one with steps runs a wizard and fires `cp-complete`.' },
  { configKey: 'contexts', converter: toObjectArray(), on: 'update', type: 'Context[]',
    description: 'Search contexts, listed on the home screen and under `:`. `{ id, shortcut, name, aliases?, description?, icon? }`. Entering one locks the input to `"<shortcut> "` and searches via `searchCallback({ contextId }, query)`.' },
  { configKey: 'labels', converter: toValue({ validate: isPlainObject }), on: 'update', type: 'Partial<Labels>',
    description: 'UI strings (i18n). Partial — unset keys fall back to English. `{name}` / `{page}` / `{total}` / `{count}` placeholders are interpolated.' },

  // ── Callbacks (property-only, read live on every call) ───────────────────
  { configKey: 'searchCallback', converter: toFunction(), on: 'none', type: '(scope: Scope, query: string, signal: AbortSignal) => Result[] | Promise<Result[]>',
    description: "Context + global search. `scope` is `'global'` or `{ contextId }`. Called only for NON-EMPTY queries, debounced; a superseded call's `signal` is aborted and its late result ignored." },
  { configKey: 'stepOptionsCallback', converter: toFunction(), on: 'none', type: '(ctx: StepOptionsContext, signal: AbortSignal) => Option[] | Promise<Option[]>',
    description: 'Options for a command step; `ctx = { commandId, stepId, query, selections }`. A static step is fetched ONCE on entry (query `""`) and filtered client-side; a `search: true` step is called per debounced keystroke. A step with its own `load` uses that instead.' },
  { configKey: 'loadUsageCallback', converter: toFunction(), on: 'update', type: '() => UsageEntry[] | Promise<UsageEntry[]>',
    description: 'Load favorites/recents from the host (e.g. per user, from the server) instead of `localStorage`. Called on connect and when this or `usage-key` changes.' },
  { configKey: 'renderConfirmationCallback', converter: toFunction(), on: 'none', type: '(ctx: ConfirmationContext) => string | HTMLElement | null | false',
    description: 'Render the text of the one-line confirmation shown after a command ran (the ✓, "Done" and countdown stay). `ctx = { type, commandId?, commandName?, selections?, sentence, item?, scope?, duration }`. Return markup / an element to replace the default, `null` for the default, or `false` to skip it this time. Search-result selections (`type: "select"`) get no confirmation unless this returns content.' },
  { configKey: 'saveUsageCallback', converter: toFunction(), on: 'none', type: '(entry: UsageEntry) => void | Promise<void>',
    description: 'Upsert one favorite/recent entry (by `entry.key`) — called on every use and every star toggle when `loadUsageCallback` is set.' },

  // ── Attributes ───────────────────────────────────────────────────────────
  { configKey: 'display', attribute: 'display', converter: toEnum(['inline', 'tokens'] as const, { default: 'inline' }), reflect: true, on: 'update',
    description: 'Wizard display: `inline` keeps the accumulated sentence in the input (`/assign iPad to `, prefix locked); `tokens` shows prior answers as removable badges above an empty input.' },
  { configKey: 'size', attribute: 'size', converter: toEnum(['sm', 'lg', 'xl'] as const, { shouldNullOnInvalid: true }), reflect: true, on: 'update',
    description: 'Width/height preset (`sm` | `lg` | `xl`). Unset = default. For arbitrary sizes set `--cp-width` / `--cp-results-max-height`.' },
  { configKey: 'pageSize', attribute: 'page-size', converter: toInt({ min: 1, default: 8 }), on: 'update',
    description: 'Search results per page (←/→ to page). Default 8.' },
  { configKey: 'openKey', attribute: 'open-key', converter: toText({ default: 'k', isEmptyAllowed: true }), on: 'none',
    description: "Key that toggles the palette together with Ctrl/⌘. Default `k`. Set `''` to disable the global hotkey." },
  { configKey: 'searchDebounce', attribute: 'search-debounce', converter: toInt({ min: 0, default: 150 }), on: 'none',
    description: 'Debounce (ms) before a provider call in global search, context search and `search: true` steps. Static lists never call a provider.' },
  { configKey: 'isConfirmationShown', attribute: 'confirmation', converter: toBool('default-true'), on: 'none',
    description: 'After a wizard completes or an instant command runs, collapse the dialog to one line for `confirmation-duration` ms showing what ran (✓ `/deploy to Staging branch main` · Done) instead of vanishing. The effect event still fires immediately; `cp-close` follows when it goes. Any key or click dismisses it. `confirmation="false"` turns it off.' },
  { configKey: 'confirmationDuration', attribute: 'confirmation-duration', converter: toInt({ min: 0, default: 1500 }), on: 'none',
    description: 'How long the confirmation stays (ms). Default 1500; `0` turns it off.' },
  { configKey: 'usageStorage', attribute: 'usage-storage', converter: toEnum(['local', 'none'] as const, { default: 'local' }), reflect: true, on: 'update',
    description: 'Favorites + recents. `local` (default) keeps them in `localStorage` under `usage-key` — or in the host, via `loadUsageCallback` / `saveUsageCallback`, when those are set; `none` turns stars and the Favorites/Recent sections off.' },
  { configKey: 'usageKey', attribute: 'usage-key', converter: toText({ default: 'web-commandpalette:usage' }), on: 'update',
    description: '`localStorage` key for favorites/recents. Put the user id in it (`cp:usage:42`) so users sharing a browser never see each other’s.' },
  { configKey: 'favoritesLimit', attribute: 'favorites-limit', converter: toInt({ min: 0, default: 3 }), on: 'update',
    description: 'How many favorites the home screen shows (one-line rows). The heading shows how many more there are; all of them are behind `favorites-key` / `favorites-hotkey`. `0` hides the section.' },
  { configKey: 'recentLimit', attribute: 'recent-limit', converter: toInt({ min: 0, default: 3 }), on: 'update',
    description: 'How many recently/frequently used items the home screen shows (one-line rows). All of them are behind `recent-key` / `recent-hotkey`. `0` hides the section.' },
  { configKey: 'favoriteKey', attribute: 'favorite-key', converter: toText({ default: 'd', isEmptyAllowed: true }), on: 'update',
    description: "Ctrl/⌘ + this key stars/unstars the active row while the palette is open. Default `d`; `''` disables." },
  { configKey: 'favoritesKey', attribute: 'favorites-key', converter: toText({ default: 'f', isEmptyAllowed: true }), on: 'update',
    description: "Ctrl/⌘ + this key shows all favorites (again: back home) while the palette is open. Default `f`; `''` disables." },
  { configKey: 'recentKey', attribute: 'recent-key', converter: toText({ default: 'r', isEmptyAllowed: true }), on: 'update',
    description: "Ctrl/⌘ + this key shows all recently used items while the palette is open. Default `r`; `''` disables." },
  { configKey: 'favoritesHotkey', attribute: 'favorites-hotkey', converter: toText({ default: 'g f', isEmptyAllowed: true }), on: 'none',
    description: "`g <letter>` sequence that opens the palette on the favorites list from anywhere (while closed, not typing). Default `g f`; `''` disables. A command with the same `hotkey` wins." },
  { configKey: 'recentHotkey', attribute: 'recent-hotkey', converter: toText({ isNullable: true }), on: 'none',
    description: '`g <letter>` sequence that opens the palette on the recent list. Off by default (e.g. `g h`).' },
  { configKey: 'mobilePresentation', attribute: 'mobile-presentation', converter: toEnum(['auto', 'floating', 'fullscreen'] as const, { default: 'auto' }), reflect: true, on: 'update',
    description: '`auto` (default) opens a fullscreen sheet on touch phones and the floating dialog elsewhere (a narrow desktop window stays floating); `floating` / `fullscreen` force one.' },

  // ── Reserved bridge hooks (wired by @keenmate/keen-web-commandpalette) ─────
  { configKey: 'searchEvent', attribute: 'data-search-event', converter: toText({ isNullable: true }), on: 'none',
    description: 'Reserved for the Phoenix LiveView bridge: the LiveView event that answers `searchCallback` via `{:reply, %{results: …}}`. Read by the bridge hook, not by this element.' },
  { configKey: 'stepOptionsEvent', attribute: 'data-step-options-event', converter: toText({ isNullable: true }), on: 'none',
    description: 'Reserved for the Phoenix LiveView bridge: the LiveView event that answers `stepOptionsCallback`. Read by the bridge hook, not by this element.' },
];

type CommandPaletteEvents = {
  'cp-open': Record<string, never>;
  'cp-close': Record<string, never>;
  'cp-select': SelectEventDetail;
  'cp-complete': CompleteEventDetail;
  'cp-command': CommandEventDetail;
  'cp-ready': Record<string, never>;
};

const EVENTS = [
  { name: 'cp-open', description: 'The palette opened.' },
  { name: 'cp-close', description: 'The palette closed (also after a selection/completion).' },
  { name: 'cp-select', description: "A search result was chosen. `detail = { item, scope }` (`scope` is `'global'` or `{ contextId }`). Perform the effect (navigate…); the palette closes itself." },
  { name: 'cp-complete', description: 'A multi-step command finished. `detail = { commandId, selections }` — each selection `{ stepId, label, value, optionId?, isFreeText }`. The palette closes itself.' },
  { name: 'cp-command', description: 'An instant command (no `steps`) was chosen. `detail = { commandId }`. The palette closes itself.' },
  { name: 'cp-ready', description: 'The element connected and rendered for the first time.' },
] as const;

/** The element that owns the document-level keys (one palette per page). */
let keyOwner: CommandPaletteElement | null = null;
const connected = new Set<CommandPaletteElement>();

export class CommandPaletteElement extends BlissElement<CommandPaletteEvents> {
  protected static override inputs = INPUTS;
  protected static override events = EVENTS;

  // Type-only: core installs the accessors at runtime from the input/event tables.
  declare commands: Command[];
  declare contexts: Context[];
  declare labels: Partial<Labels> | undefined;
  declare searchCallback: SearchCallback | null;
  declare stepOptionsCallback: StepOptionsCallback | null;
  declare loadUsageCallback: LoadUsageCallback | null;
  declare saveUsageCallback: SaveUsageCallback | null;
  declare usageStorage: 'local' | 'none';
  declare usageKey: string;
  declare recentLimit: number;
  declare favoritesLimit: number;
  declare favoriteKey: string;
  declare favoritesKey: string;
  declare recentKey: string;
  declare favoritesHotkey: string;
  declare recentHotkey: string | null;
  declare isConfirmationShown: boolean;
  declare confirmationDuration: number;
  declare renderConfirmationCallback: RenderConfirmationCallback | null;
  declare display: Display;
  declare size: 'sm' | 'lg' | 'xl' | null;
  declare pageSize: number;
  declare openKey: string;
  declare searchDebounce: number;
  declare mobilePresentation: MobilePresentation;
  declare onCpOpen: ((e: CustomEvent<Record<string, never>>) => void) | null;
  declare onCpClose: ((e: CustomEvent<Record<string, never>>) => void) | null;
  declare onCpSelect: ((e: CustomEvent<SelectEventDetail>) => void) | null;
  declare onCpComplete: ((e: CustomEvent<CompleteEventDetail>) => void) | null;
  declare onCpCommand: ((e: CustomEvent<CommandEventDetail>) => void) | null;
  declare onCpReady: ((e: CustomEvent<Record<string, never>>) => void) | null;

  #shadow: ShadowRoot;
  #shell: Shell;
  #renderer: Renderer;
  #machine: PaletteMachine;
  #globalKeys: GlobalKeys;
  #usage: UsageStore | null = null;
  #isOpen = false;
  #isReady = false;
  #isFullscreen = false;
  #labels: Labels = DEFAULT_LABELS;
  #overlay: OverlayHandle | null = null;
  #releaseScroll: (() => void) | null = null;
  #releaseInset: (() => void) | null = null;
  #returnFocus: HTMLElement | null = null;
  /** Set while the one-line confirmation is showing. */
  #confirmTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    super();
    this.#shadow = this.attachShadow({ mode: 'open' });
    adoptStyles(this.#shadow, styles);
    this.#shell = createShell();
    this.#shadow.appendChild(this.#shell.root);
    this.#renderer = new Renderer(this.#shell);
    this.#machine = new PaletteMachine(this.#machineHost());
    this.#globalKeys = new GlobalKeys({
      isOpen: () => this.#isOpen,
      toggle: () => this.toggle(),
      openKey: () => this.config.openKey as string ?? 'k',
      commands: () => this.#commands(),
      runCommand: (command) => {
        this.open();
        this.#machine.enterCommand(command);
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

  // ── machine wiring ────────────────────────────────────────────────────────

  #commands(): readonly Command[] {
    return (this.config.commands as Command[] | undefined) ?? [];
  }

  #machineHost(): MachineHost {
    return {
      commands: () => this.#commands(),
      contexts: () => (this.config.contexts as Context[] | undefined) ?? [],
      searchCallback: () => (this.config.searchCallback as SearchCallback | null) ?? null,
      stepOptionsCallback: () => (this.config.stepOptionsCallback as StepOptionsCallback | null) ?? null,
      display: () => (this.config.display as Display) ?? 'inline',
      pageSize: () => (this.config.pageSize as number) ?? 8,
      debounceMs: () => (this.config.searchDebounce as number) ?? 150,
      labels: () => this.#labels,
      usage: () => this.#usage,
      recentLimit: () => (this.config.recentLimit as number) ?? 3,
      favoritesLimit: () => (this.config.favoritesLimit as number) ?? 3,
      starKey: () => chordKeycap(this.#keys().favorite),
      changed: () => this.#render(),
      effect: (effect) => this.#onEffect(effect),
      error: (message, err) => this.log.DATA.error(message, err),
    };
  }

  #onEffect(effect: Effect): void {
    // FUTURE: make cp-select/cp-complete/cp-command cancelable (preventDefault() →
    // keep the palette open) or add a reply-directive channel (toast/keep-open).
    // v1 policy: the host performs the effect, the component closes itself.
    switch (effect.type) {
      case 'select':
        this.log.INTERACTION.debug('select', effect.item);
        this.emit('cp-select', { item: effect.item, scope: effect.scope });
        break;
      case 'complete':
        this.log.INTERACTION.debug('complete', effect.commandId, effect.selections);
        this.emit('cp-complete', { commandId: effect.commandId, selections: effect.selections });
        break;
      case 'command':
        this.log.INTERACTION.debug('command', effect.commandId);
        this.emit('cp-command', { commandId: effect.commandId });
        break;
      case 'close':
        break;
    }
    // The effect already fired; the confirmation only delays the close.
    if (!this.#showConfirmation(effect)) this.close();
  }

  #render(): void {
    if (this.#isOpen && !this.#confirmTimer) this.#renderer.render(this.#machine, this.#labels);
  }

  /**
   * Collapse to the one-line confirmation and close after `confirmation-duration`.
   * Returns false when there's nothing to confirm (off, `0` ms, a plain close, a search
   * result without custom content, or the callback said `false`).
   */
  #showConfirmation(effect: Effect): boolean {
    if (effect.type === 'close' || this.config.isConfirmationShown === false) return false;
    const duration = (this.config.confirmationDuration as number | undefined) ?? 1500;
    if (duration <= 0) return false;

    const m = this.#machine;
    const command = effect.type === 'select' ? null : this.#commands().find((c) => c.id === effect.commandId) ?? m.command;
    const ctx: ConfirmationContext =
      effect.type === 'select'
        ? { type: 'select', sentence: effect.item.title, item: effect.item, scope: effect.scope, duration }
        : {
            type: effect.type,
            commandId: effect.commandId,
            commandName: command?.name,
            selections: effect.type === 'complete' ? effect.selections : [],
            sentence: m.command?.id === effect.commandId ? m.sentence : command?.shortcut ?? effect.commandId,
            duration,
          };

    let custom: ReturnType<RenderConfirmationCallback> = null;
    const cb = this.config.renderConfirmationCallback as RenderConfirmationCallback | null;
    if (cb) {
      try {
        custom = cb(ctx);
      } catch (err) {
        this.log.UI.error('renderConfirmationCallback failed', err);
      }
    }
    if (custom === false) return false;
    if (custom == null && effect.type === 'select') return false;

    // The dialog collapses to this one line (CSS hides the search row, results and
    // footer under `.cp-confirming`); the line takes focus so any key dismisses it.
    const { confirm, live, root } = this.#shell;
    const body = fillConfirmation(confirm, this.#labels.done, duration);
    if (custom instanceof HTMLElement) body.appendChild(custom);
    else if (typeof custom === 'string') body.innerHTML = custom;
    else {
      body.innerHTML = confirmationBodyHtml({
        shortcut: command?.shortcut,
        name: command?.name ?? ctx.sentence,
        parts: effect.type === 'complete' ? m.answerParts : [],
      });
    }
    // Shrink from the dialog's current height to the confirmation's (min-height)
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
    live.textContent = `${this.#labels.done}: ${ctx.sentence}`;
    this.log.UI.debug('confirmation', ctx);
    this.#confirmTimer = setTimeout(() => this.close(), duration);
    return true;
  }

  #endConfirmation(): void {
    if (!this.#confirmTimer) return;
    clearTimeout(this.#confirmTimer);
    this.#confirmTimer = null;
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
      this.#machine.usageChanged();
      return;
    }
    const load = this.config.loadUsageCallback as LoadUsageCallback | null;
    const persistence: UsagePersistence = load
      ? {
          load: () => load(),
          // Read live, so a callback assigned later is still used.
          save: (entry) => (this.config.saveUsageCallback as SaveUsageCallback | null)?.(entry),
        }
      : localStoragePersistence((this.config.usageKey as string) || 'web-commandpalette:usage');
    this.#usage = new UsageStore(persistence, () => this.#machine.usageChanged(), (err) => this.log.DATA.error('usage storage failed', err));
    this.#usage.load();
  }

  // ── DOM wiring ────────────────────────────────────────────────────────────

  #wireDom(): void {
    const { input, results, tokens, backdrop, closeButton, container } = this.#shell;

    input.addEventListener('input', (e) => {
      if ((e as InputEvent).isComposing) return;
      this.#machine.setInput(input.value);
    });
    input.addEventListener('compositionend', () => this.#machine.setInput(input.value));
    input.addEventListener('keydown', (e) => {
      if (handleInputKeydown(e, this.#machine, input, this.#keys(), this.isRTL)) this.log.INTERACTION.trace('key', e.key);
    });

    // Keep focus in the input while clicking rows/tokens.
    const keepFocus = (e: Event): void => e.preventDefault();
    results.addEventListener('mousedown', keepFocus);
    tokens.addEventListener('mousedown', keepFocus);

    results.addEventListener('click', (e) => {
      const star = (e.target as Element).closest?.('[data-star]') as HTMLElement | null;
      if (star) {
        e.stopPropagation();
        this.#machine.toggleFavorite(Number(star.dataset.star));
        return;
      }
      const more = (e.target as Element).closest?.('[data-view]') as HTMLElement | null;
      if (more) {
        this.#machine.showUsage(more.dataset.view === 'recent' ? 'recent' : 'favorites');
        return;
      }
      const row = (e.target as Element).closest?.('[data-index]') as HTMLElement | null;
      if (row) this.#machine.select(Number(row.dataset.index));
    });
    tokens.addEventListener('click', (e) => {
      const btn = (e.target as Element).closest?.('[data-token]') as HTMLElement | null;
      if (!btn) return;
      e.stopPropagation();
      this.#machine.removeToken(Number(btn.dataset.token));
      input.focus();
    });
    backdrop.addEventListener('click', () => this.close());
    closeButton.addEventListener('click', () => this.close());

    // Focus trap: Tab inside the input selects (handled above); from anywhere else
    // in the dialog (the fullscreen close button) Tab returns to the input.
    // The one-line confirmation holds focus: any plain key or a click dismisses it.
    // Chords (Ctrl/⌘+K…) and lone modifiers pass through to the global toggle.
    this.#shell.confirm.addEventListener('click', () => this.close());
    container.addEventListener('keydown', (e) => {
      // `e.target !== input`: the Enter that finished the command is still bubbling
      // from the input when the confirmation appears — it must not dismiss it.
      if (this.#confirmTimer && e.target !== input) {
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
    this.#machine.refresh();
    this.#renderer.invalidate();
    this.#render();
    if (!this.#isReady && this.isConnected) {
      this.#isReady = true;
      // Deferred a microtask: upgrade happens while the defining module is still
      // evaluating, so a listener added right after `import` would otherwise miss it.
      queueMicrotask(() => this.emit('cp-ready', {}));
    }
  }

  protected override update(partial: Record<string, unknown>): void {
    if ('labels' in partial) {
      this.#applyLabels();
      this.#renderer.invalidate();
    }
    if ('size' in partial) this.#applySize();
    if ('mobilePresentation' in partial) this.#applyPresentation(getEnvironment());
    if ('commands' in partial || 'contexts' in partial) this.#machine.refresh();
    if ('display' in partial) this.#machine.displayChanged();
    if ('pageSize' in partial) this.#machine.refresh();
    if ('usageStorage' in partial || 'usageKey' in partial || 'loadUsageCallback' in partial) this.#applyUsage();
    else if ('recentLimit' in partial || 'favoritesLimit' in partial) this.#machine.refresh();
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
    this.#overlay?.dispose();
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

  #applyLabels(): void {
    const custom = this.config.labels as Partial<Labels> | undefined;
    this.#labels = { ...DEFAULT_LABELS, ...(custom ?? {}) };
    const { container, closeButton, fullscreenTitle } = this.#shell;
    container.setAttribute('aria-label', this.#labels.dialogLabel);
    closeButton.setAttribute('aria-label', this.#labels.close);
    fullscreenTitle.textContent = this.#labels.fullscreenTitle;
  }

  #applySize(): void {
    const root = this.#shell.root;
    for (const s of ['sm', 'lg', 'xl']) root.classList.toggle(`pa-command-palette--${s}`, this.config.size === s);
  }

  /** floating vs. the phone fullscreen sheet — capability-first, via core's device classification. */
  #applyPresentation(env: EnvironmentSnapshot): void {
    const mode = (this.config.mobilePresentation as MobilePresentation | null) ?? 'auto';
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

  // ── public API ────────────────────────────────────────────────────────────

  /** Whether the palette is open. (Also reflected as the `open` attribute.) */
  get isOpen(): boolean {
    return this.#isOpen;
  }

  /** Open on the home screen. No-op when already open. */
  open(): void {
    // Re-opening during a confirmation (e.g. `g d` right after a run) starts fresh.
    if (this.#confirmTimer) this.close();
    if (this.#isOpen) return;
    this.flush();
    // One overlay at a time: dismiss any open KM popovers (closed palette ignores its own dismiss).
    dismissAllOverlays();
    this.#overlay?.activate();
    this.#isOpen = true;
    this.#returnFocus = deepActiveElement();
    this.#machine.reset();
    this.#shell.root.classList.add('pa-command-palette--active');
    this.toggleAttribute('open', true);
    this.#releaseScroll = lockBodyScroll();
    this.#syncKeyboardInset();
    this.#renderer.invalidate();
    this.#render();
    this.#shell.input.focus();
    this.log.UI.debug('open');
    this.emit('cp-open', {});
  }

  /** Close and reset. No-op when already closed. */
  close(): void {
    if (!this.#isOpen) return;
    this.#endConfirmation();
    this.#isOpen = false;
    this.#machine.dispose();
    this.#machine.reset();
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
    this.emit('cp-close', {});
  }

  toggle(): void {
    // During a confirmation the user is moving on: Ctrl/⌘+K opens a fresh palette.
    if (this.#isOpen && !this.#confirmTimer) this.close();
    else this.open();
  }

  /** Back to the home screen (stays open). */
  reset(): void {
    this.flush();
    this.#machine.reset();
  }

  /** Open pre-filled with `query` (e.g. `'/deploy'`, `':products laptop'`), run through the normal input pipeline. */
  openWith(query: string): void {
    this.open();
    this.#machine.setInput(query ?? '');
  }

  /** Same as assigning `commands` (imperative hook for server-driven hosts). */
  setCommands(list: Command[]): void {
    this.commands = list;
  }

  /** Open on the full favorites list (what `g f` does). No-op list when favorites are off. */
  openFavorites(): void {
    this.open();
    if (this.#machine.usageView !== 'favorites') this.#machine.showUsage('favorites');
  }

  /** Open on the full recently-used list. */
  openRecent(): void {
    this.open();
    if (this.#machine.usageView !== 'recent') this.#machine.showUsage('recent');
  }

  /** Same as assigning `contexts`. */
  setContexts(list: Context[]): void {
    this.contexts = list;
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
