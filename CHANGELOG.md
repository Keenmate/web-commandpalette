# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

Target: **1.0.0-rc03**. No stable 1.0.0 is published, so the break ships as the next release
candidate — but `^1.0.0-rc02` consumers will pull it: the event,
callback and item API below is breaking.

### Changed — BREAKING (persisted UI state the core way, SPEC §12.17 / rulebook C-CA-17, 2026-11-09)

Needs core `createStateStore()` (`@keenmate/web-components-core` 1.0.0-rc21). No compatibility aliases.

- **`usage-key` / `usageKey` → `storage-key` / `storageKey`** (same default `'web-commandpalette:usage'`).
- **localStorage key `<usage-key>` → `km-state:web-command-palette:<storage-key>`** (core's default
  store, keyed by the tag), and the value is `{ entries: UsageEntry[] }` (was the bare array). Stored
  favorites / recents are not carried over.
- **`localStoragePersistence` is removed** from the exports — nothing needs it; the default path is
  the core state store. `UsagePersistence` / `UsageStore` stay (the seam for a headless store).
- **New `loadStateCallback` / `saveStateCallback`** (core `LoadStateCallback` /
  `SaveStateCallback<PaletteUsageState>`): the page keeps the whole list (`saveStateCallback` gets
  `{ key, state: { entries } }` every time). Set both; either one alone switches localStorage off.
  `loadUsageCallback` / `saveUsageCallback` (one entry per call) stay and win when set;
  `usage-storage="none"` stays the off switch. New exported type `PaletteUsageState`.

### Internal (core 1.0.0-rc21, 2026-11-09)

- The private `deepActiveElement()` copy is gone — imported from core's main index (rc21). Focus
  return on close now accepts any focusable `HTMLElement` / `SVGElement`; behaviour unchanged.
- HTML escaping calls core's `escapeHtml` from the main index directly (was a local wrapper over
  the `/search` re-export). Core's now takes any value (`null` / `undefined` → `''`, others
  stringified), so the wrapper is gone; non-string host data (`badge: 3`) still renders.

### Changed — BREAKING (rulebook alignment, 2026-11-08)

- **Every class in the shadow root is BEM on the block `cp`** (rulebook C-NC-8 / C-CSS-7). Page CSS
  that reaches inside (`custom-styles`, `getCustomStylesCallback`, the page-wide `customStyles`)
  renames its selectors; no aliases. `::part()` names and every `--cp-*` variable are unchanged.

  | Before | After |
  |---|---|
  | `.pa-command-palette`, `.pa-command-palette--active` / `--fullscreen` / `--sm` / `--lg` / `--xl` | `.cp`, `.cp--active` / `--fullscreen` / `--sm` / `--lg` / `--xl` |
  | `.pa-command-palette__<element>[--<modifier>]` (container, input, results, item, item-title, …) | `.cp__<element>[--<modifier>]` |
  | `.pa-command-palette__loader` (the "Searching…" row) / `__loader-slot` | `.cp__loading` / `.cp__loader-slot` (core's spinner inside stays `.cp__loader`) |
  | `.cp-confirming` (the feedback collapse), `.cp-confirm`, `.cp-confirm__<x>` | `.cp--confirming`, `.cp__confirm`, `.cp__confirm-<x>` |
  | `.cp-heading`, `.cp-more`, `.cp-star` / `.cp-star--on`, `.cp-sr-only`, `.cp-item--default` | `.cp__heading`, `.cp__more`, `.cp__star` / `.cp__star--on`, `.cp__sr-only`, `.cp__item--default` |
  | `.pa-icon`, `.pa-icon--<name>`, `.cp-icon--check` / `--star` / `--star-filled` | `.cp__icon`, `.cp__icon--<name>` |
  | `.pa-badge`, `.pa-badge--<variant>`, `.pa-badge__remove` | `.cp__badge`, `.cp__badge--<variant>`, `.cp__badge-remove` |
- **The host is `display: block`** (was `display: contents`, forbidden by rulebook C-TC-7). It holds
  no in-flow content (the dialog is `position: fixed`), so it takes no space; in a flex / grid
  parent it is now an empty item (a `gap` counts it).
- **`--cp-icon-<name>` is declared on the host** (rulebook C-BV-9: `--base-*` is read only in
  `variables.css`). Set it on the element (`web-command-palette { --cp-icon-search: url(…) }`); a value
  inherited from an ancestor no longer reaches it, like every other `--cp-*` knob.

### Changed (rulebook alignment, 2026-11-08)

- **An item icon given by name draws without a theme too**: `--cp-icon-<name>` falls back to the
  contract's own glyph (`@keenmate/base-css-variables`) when no `--base-icon-<name>` is set (it drew
  nothing before); `clear` follows `--cp-icon-close`. `--cp-icon-size` is declared (`1em`).
- README: the canonical `## About` paragraph (rulebook C-RS-15) replaces "Credits".

### Internal (rulebook alignment, 2026-11-08)

- `src/filter.ts` and `src/icons.ts` moved to `src/helpers/` (Side layer, rulebook C-CST-4);
  `PaletteKeys` / `DEFAULT_PALETTE_KEYS` moved to `src/types.ts`. `GlobalKeys.handle()` →
  `handleKeydown()` (C-NC-9). New stub files `controls.css`, `floating.css`, `states.css`
  (C-CSS-1).

### Changed — BREAKING (core 1.0.0-rc20 alignment, 2026-11-08)

- **Default loader class `.cp-loader` → `.cp__loader`** (core rc18 draws the BEM `<prefix>__loader`).
  A page that styles `.cp-loader` renames the selector; the `--cp-loader-*` tokens and the
  `cp-loader-spin` keyframes keep their names. Without the rename the spinner was an empty span on
  core rc18+.
- **The page-wide loader hook is `window.components.renderLoadingCallback`** (core rc18 rename; the
  old `renderLoaderCallback` is no longer read).
- **An invalid `size` keeps the previous value** (core rc18 `toEnum({ isNullable })`, was
  `shouldNullOnInvalid`): `size="huge"` warns, fires `input-rejected` and keeps the size it had
  (before: it fell back to the default size). Removing the attribute still resets it.
- **Warnings reach the console by default** (core rc18: the closest log level wins, default `warn`).
  The second connected palette's "only the first owns the global hotkeys" warning now prints; silence
  it with `window.components['web-command-palette'].logging.setLogLevel('error')`.

### Added (core 1.0.0-rc20 alignment, 2026-11-08)

- **Custom CSS in the shadow root** (core `createCustomStyles()`, rulebook C-CA-15): the instance
  input `customStyles` (attribute `custom-styles`) and `getCustomStylesCallback(ctx)` (wins), after the
  page-wide layer `window.components['web-command-palette'].customStyles` /
  `.getCustomStylesCallback`, which styles every palette on the page (the page layer was advertised by
  core but ignored before). An `@import` is also linked once in the document head, so imported fonts
  work. Docs: theming "Custom CSS (shadow root)"; example card TH02.
- **Typed input properties** (core "Typing the properties", rulebook C-CA-16): `CommandPaletteConfig`
  is an interface listing exactly the input rows and is merged into `CommandPaletteElement`, so
  `el.presentation = 'sideways'` or `el.notAnInput` is a type error. It now also lists
  `searchEvent`, `stepOptionsEvent`, `customStyles` and `getCustomStylesCallback`.
- `resetLogging` exported next to `enableLogging` / `disableLogging` (the core bundle's own method).

### Changed (core 1.0.0-rc20 alignment, 2026-11-08)

- Depends on `@keenmate/web-components-core@^1.0.0-rc20` (peer and dev; was ^1.0.0-rc15).
- The active row scrolls through core `scrollIntoContainer()`: the results list only, never the page
  (was `scrollIntoView()`).
- The ⌘ / Ctrl keycaps follow core's environment detection (`getEnvironment().isApple`, was a
  `navigator.platform` sniff); HTML escaping uses core's `escapeHtml` (`/search`).
- From core rc19 / rc20, no code here: an outside click is decided when the click ends; the scroll
  lock while open also clamps `<html>` `overflow-x`, so a page wider than a phone no longer leaves the
  fullscreen sheet zoomed out; a property set before the script loads is kept.
- e2e runs in Chromium, Firefox and WebKit (plus the Pixel 7 phone project).

### Fixed (2026-11-08)

- **Firefox: one edit was routed twice.** Firefox fires `compositionend` and `input` for the same
  edit, so the term was routed again: the search restarted and the loader was redrawn (a custom
  `renderLoadingCallback` ran twice). A value that already went through is not routed again.
- **Phone sheet and results list** (rulebook C-RO-4 / -8 / -9): the fullscreen sheet keeps its rows
  and search clear of the landscape side nav bar / camera cutout (`env(safe-area-inset-left|right)`),
  a scroll at the end of the results list no longer chains to the page behind
  (`overscroll-behavior: contain`), and the sheet / narrow-window caps use `dvw` / `dvh`.

### Internal (2026-11-08)

- The tag is defined only by `registerComponent()` in the package entry (core rule; the module's own
  guarded `customElements.define` is gone).

### Changed (dependencies, 2026-11-01)

- Depends on the published `@keenmate/web-components-core@^1.0.0-rc15` (was ^1.0.0-rc12; the dev install was the local `file:` link).

### Changed — BREAKING (presentation rename + responsive rules, core rc15, 2026-10-30)

- **`mobile-presentation` / `mobilePresentation` → `presentation`** (values unchanged:
  `auto` | `floating` | `fullscreen`). No alias — write `presentation="fullscreen"`. The core
  type is `Presentation` (was `MobilePresentation`); core's `resolveMobilePresentation()` is gone.
- **Breakpoint defaults follow the base tokens** (core rc15): the `mobile` width bucket ends at
  768px (was 640), `tablet` at 1024px (`--base-breakpoint-mobile` / `--base-breakpoint-tablet`,
  or `configureBreakpoints()`). Device class and the `auto` presentation are unchanged.

### Added — responsive rules (core SPEC §6.7)

- Partial configs per device class (`responsive = { device: { mobile|tablet|desktop: … } }`,
  touch capability first) and / or per window-width bucket (`{ breakpoint: { … } }`, 768 / 1024
  lines; `device` wins on the same key) page-wide (`window.components.responsive` /
  `.responsiveCallback`), per tag (`window.components['web-command-palette'].responsive` /
  `.responsiveCallback`) or per instance (`el.responsive` / JSON attribute `responsive`,
  `el.responsiveCallback`). Page rules < the element's own attributes / properties < the
  instance's rules; overrides never reflect.
- Types `CommandPaletteConfig`, `CommandPaletteResponsiveMap`, `CommandPaletteResponsiveCallback`;
  core `Presentation` / `ResponsiveMap` / `ResponsiveCallback` / `ResponsiveContext` re-exported.

### Changed — shared loader (web-components-core SPEC §12.14, 2026-10-29)

- **The searching loader draws through core `renderLoader()`** (context `search`): the slot
  (`.cp__loader-slot`) carries `role="status"` + `aria-label` = `labels.searching`
  (moved from `.cp__loading`; the visible text is `aria-hidden`). The hand-made
  `.pa-spinner` border spinner and `@keyframes cp-spin` are removed.
- **New tokens** `--cp-loader-icon` / `--cp-loader-rotate` / `--cp-loader-duration` /
  `--cp-loader-size` (chained to `--base-loader-*`) + `--cp-loader-color` (accent); manifest
  updated. Under reduced motion the loader slows (contract 1.5s), never stops.
- **New input `renderLoadingCallback`** (property): draw the loader yourself —
  `ctx = { component, context, containerElement, element, label }`, optional cleanup return
  (run when results land or the palette closes). Beats the page-wide
  `window.components.renderLoadingCallback`.
- **Dev dependency:** requires `@keenmate/base-css-variables` `^2.0.0-rc06` (the `--base-loader-*` tokens).
- **Tests:** `e2e/search-async.spec.ts` — default loader + role/label, `labels.searching`,
  page hook + cleanup on results / close, instance hook beats the page hook.

### Changed — BREAKING (naming unification, web-components-core naming pass)

The cross-component naming pass (one vocabulary for all KeenMate web components). No aliases.

- **`ready` comes from core** (`BlissElement`): it fires once, on the microtask after the first
  build (as before), so a listener added right after the `import` / `createElement` still catches
  it. `el.isReady`, the `ready` attribute / `:state(ready)` and `await el.whenReady()` flip at the
  same moment. Or hold the build with the core **`defer`** attribute (`shouldDefer`) and call **`el.release()`** once
  listeners / config are set. `el.destroy()` (core) tears the element down for good.
- **Confirmation → feedback** (it is post-run feedback, not a confirm prompt):
  `isConfirmationShown` / attribute `confirmation` → `isFeedbackShown` / **`show-feedback`**;
  `confirmationDuration` / `confirmation-duration` → `feedbackDuration` / **`feedback-duration`**;
  `renderConfirmationCallback` → **`renderFeedbackCallback`**; types `ConfirmationContext` /
  `RenderConfirmationCallback` → `FeedbackContext` / `RenderFeedbackCallback`.
- **`setCommands(list)` / `setContexts(list)` removed** (element and controller) — assign the
  `commands` / `contexts` properties. `el.controller` now has the same `commands` / `contexts`
  properties (state is one same-named property on both surfaces).
- **`openWith(query)` → `openWith(term)`** (parameter name; the search text is `term` everywhere).
- **Limits are `max*Count`**: `favoritesLimit` / `favorites-limit` → **`maxFavoriteCount`** /
  **`max-favorite-count`**; `recentLimit` / `recent-limit` → **`maxRecentCount`** / **`max-recent-count`**.
- **A search result is `result`, not `item`** (`item` is reserved for action items — the `action`
  detail's `item` is still the command): `select` detail / `onSelect` / `beforeResultSelectCallback` ctx
  `{ item, scope }` → **`{ result, scope }`**; `FeedbackContext.item` → `result`;
  `UsageEntry.item` → `result` (persisted: a recent / favorite search result stored by an earlier
  rc has no `result` and is skipped — it comes back the next time it is chosen). **Migrate:** clear
  the stored usage, or map `item` → `result` in your `loadUsageCallback`
  (`entries.map((e) => e.item && !e.result ? { ...e, result: e.item } : e)`). The engine's
  `select` effect carries `result` too.
- **Event `select` → `result-select`** (twin `onSelect` → **`onResultSelect`**; detail unchanged
  `{ result, scope }`; still vetoed by `beforeResultSelectCallback`).
- **Type `SelectEventDetail` → `ResultSelectEventDetail`** (the `result-select` detail). The veto hook
  added in this release cycle is named **`beforeResultSelectCallback`** (type `BeforeResultSelectCallback`;
  earlier unreleased builds called it `beforeSelectCallback`).
- **`labels.emptyText` → `labels.noResults`** (default "No results found" — a search / filter
  matched nothing; `noFavorites` / `noRecent` stay). All other UI strings were already `labels` keys.
- **`labels`: `''` is deliberately empty** — the string is not rendered (an `''` hint label hides
  the hint, an `''` aria label removes the attribute); a missing / `undefined` key falls back to the
  English default (an explicit `undefined` used to blank the label). Labels are text (escaped).

### Changed — BREAKING (interaction model, web-components-core rc15)

Events, callbacks and commands follow the shared KeenMate interaction model
(web-components-core `/actions`, SPEC §12.5 / §12.12). No aliases — rename on upgrade.

**Every callback takes ONE `ctx` argument.** Every ctx and every event detail carries
`controller` (the public `CommandPaletteController`, also `el.controller`) and `element` (the
host) — both non-enumerable, like a provider ctx's `signal`, so `JSON.stringify` / a LiveView
`pushEvent` see only the data — plus the presentation flags (`presentation`, `isFullscreen`,
`isModal`; the palette is a popup).

**Events** — no `cp-` prefix; bubbling, **not composed** (was `composed: true`); declared in the
`static events` table; the camelCase `on*` twin is called with the event **detail** (it used to
be a listener receiving the `CustomEvent`), then the DOM event fires with the same object.

| Old | New |
|---|---|
| `cp-open` / `onCpOpen(e)` | `open` / `onOpen(detail)` |
| `cp-close` / `onCpClose(e)` | `close` / `onClose(detail)` |
| `cp-select` / `onCpSelect(e)` — `{ item, scope }` | `select` / `onSelect(detail)` — `{ item, scope }` (search results only) |
| `cp-command` / `onCpCommand(e)` — `{ commandId }` (instant command) | `action` / `onAction(detail)` — `{ action: 'custom', id, item, source: 'palette', selections: [], sourceEvent, triggerElement, dataset }` |
| `cp-complete` / `onCpComplete(e)` — `{ commandId, selections }` (wizard done) | the same `action` event, fired after the last answer, with `selections` |
| `cp-ready` / `onCpReady(e)` | `ready` / `onReady(detail)` |
| `e.detail.commandId` | `e.detail.id` (and `e.detail.item` = the command) |

**Commands are core action items** (`Command extends ActionItem<CommandContext>`). Running one —
Enter / click on a command without `steps`, the last wizard answer, or its `g <letter>` hotkey —
goes through core `runAction`: `beforeActionCallback(detail)` → the command's `onClick(detail)` →
`onAction` → the `action` event. The palette has no built-in actions: `action` is always
`'custom'`, `id` identifies the command. The event is dispatched a microtask later than
`cp-command` / `cp-complete` were (the before-hook may be async). Palette rows are not toggles:
`Command` omits core's toggle state (`isToggled` / `getIsToggledCallback`, renamed from
`isActive` / `getIsActiveCallback` in core).

| Old | New |
|---|---|
| `Command.shortcut` (`'/go'`, the slash token) | `Command.trigger` |
| `Command.name` | `Command.text` |
| `Command.hotkey` (`'g d'` / `'Ctrl+K'`) | `Command.shortcut` (the key chord, as on every core `ActionItem`) |
| `Command.description` | unchanged — it's the row's second line (searched by the `/` filter), not a tooltip |
| — | `Command.tooltip` / `getTooltipCallback`, `cssClass` / `getClassCallback`, `isVisible` / `getIsVisibleCallback` (hidden everywhere: lists, global search, recents, its hotkey), `isDisabled` / `getIsDisabledCallback` (greyed, `aria-disabled`, doesn't run), `isDanger` (danger title color), `getTextCallback`, `getIconCallback`, `onClick(detail)`. Render-time callbacks get `{ selections: [] }` + the context |
| `Context.shortcut` (`':products'`) / `Context.name` | `Context.trigger` / `Context.text` |
| `Context.search(query, signal)` | `Context.searchCallback({ scope, term, signal })` |
| `Option.label` | `Option.text` |
| `Step.freeText` / `Step.search` (booleans) | `Step.isFreeTextAllowed` / `Step.isLiveSearch` |
| `Step.shouldShow(selections)` | `Step.getIsVisibleCallback({ commandId, stepId, selections })` |
| `Step.load(ctx, signal)` | `Step.getOptionsCallback({ commandId, stepId, term, selections, signal })` |
| `Result.title` / `subtitle`, `Selection.label`, `UsageEntry.label` | unchanged — data records persisted verbatim in recents (renaming would blank stored favorites) |

**Callbacks**

| Old | New |
|---|---|
| `searchCallback(scope, query, signal)` | `searchCallback({ scope, term, signal })` |
| `stepOptionsCallback({ commandId, stepId, query, selections }, signal)` | `getStepOptionsCallback({ commandId, stepId, term, selections, signal })` |
| `loadUsageCallback()` | `loadUsageCallback(ctx)` |
| `saveUsageCallback(entry)` | `saveUsageCallback({ entry })` |
| `renderConfirmationCallback({ type: 'complete' \| 'command' \| 'select', commandName, … })` | `renderConfirmationCallback({ type: 'action' \| 'select', commandText, … })` + the context |
| — | `beforeActionCallback(detail)` → `false` cancels a command run (async OK): no `onClick`, no event, nothing recorded; a wizard steps back to its last answer, the palette stays open |
| — | `beforeResultSelectCallback({ item, scope })` → `false` cancels a result selection (async OK; a sync hook keeps the flow synchronous); the palette stays open |

**Controller / engine**

| Old | New |
|---|---|
| element methods only | `el.controller` (`CommandPaletteController`): `isOpen`, `open`, `close`, `toggle`, `reset`, `openWith`, `openFavorites`, `openRecent`, `setCommands`, `setContexts` (the element methods stay) |
| `PaletteMachine` / `MachineHost` (exported) | `PaletteEngine` / `PaletteEngineHost` (exported for standalone use; the element never exposes it). The host gains an optional `context(fields)`; `effect()` may answer `false` / a Promise to veto. `Effect` `{ type: 'command' \| 'complete', commandId }` → `{ type: 'action', command, selections }` |
| `findByShortcut` (internal) | `findByTrigger` |
| types `CompleteEventDetail`, `CommandEventDetail` | `ActionEventDetail`; new `PaletteContext`, `CommandContext`, `StepContext`, `SearchContext`, `PaletteEventDetail`, `BeforeActionCallback`, `BeforeResultSelectCallback`, `CommandPaletteController` |

**LiveView bridge (`@keenmate/keen-web-commandpalette`)** — `data-search-event` /
`data-step-options-event` keep their mechanism (their values are the LiveView event names the
bridge pushes to; nothing is emitted under them). The bridge must listen to `select` / `action`
instead of `cp-select` / `cp-complete` / `cp-command`, install `searchCallback({ scope, term,
signal })` / `getStepOptionsCallback(ctx)` (push `term`, not `query`), and send commands /
contexts / options with the new field names.

### Changed — motion and disabled dimming follow the contract

- **Reduced motion sets the durations to `0s`:** under `prefers-reduced-motion: reduce` the
  `--cp-transition-fast` / `-normal` / `-medium` variables are `0s` on `:host` (was
  `animation: none` / `transition: none` on the dialog parts), so everything timed by them stops,
  hover / focus transitions included (they ran before). The feedback countdown bar is still hidden;
  the search spinner keeps turning (state, not decoration). Motion off without the media query is
  CSS only: `--cp-transition-*: 0s`, or `--base-duration-*: 0s` page-wide. No duration was
  changed: every one already used the contract's speeds (0.1s / 0.15s / 0.25s).
- **`--cp-disabled-opacity`** (new, `var(--base-disabled-opacity, 0.65)`) is the one dimming for
  disabled things; `--cp-item-disabled-opacity` now defaults to it.

### Changed — standalone colors follow the contract

Without `@keenmate/base-css-variables` on the page the fallbacks had drifted from the contract.
Inputs now fall back to the contract defaults and every derived color to the contract formula on
the `--cp-*` input, so the palette looks the same with or without the contract, and a standalone
`--cp-accent-color` brings its tint and on-accent text along.

- **Accent** `#3b82f6` (was sky `#0ea5e9`), the contract's default primary since
  base-css-variables 2.0.0-rc05.
- **Text on fills** (the accent, every badge variant) is black or white by APCA contrast, the
  contract's formula on the fill (was a fixed `#ffffff`). The danger badge is `#dc2626` (was `#ef4444`).
- **Surfaces / borders:** new `--cp-page-bg` (`--base-page-bg`); `--cp-subtle-bg` (keycaps) is
  derived from it, `--cp-border-color` and `--cp-hover-bg` from `--cp-bg` — the contract's OKLCH
  steps (were hand-set slate values and an 8% text mix).
- **Placeholder** falls back to `--cp-text-color-3` (the contract alias).
- **isDanger row title** reads `--base-danger-text-color` (the role as text on a surface;
  `#721c24` / `#f87171`), not the fill color.
- **Disabled row opacity** `0.65` (was `0.4`); **z-index** `7601` standalone (one above the
  contract's popover, was `10500`); check glyph = the contract's (stroke 2).
- `check:contract` (`base-contract-check src`) runs in `npm run build`; `contract-check.json`
  allows `--base-rem` (10px standalone) and `--base-font-family` (inherits the page font).
  `e2e/contract-parity.spec.ts` + `test/contract-parity.html` compare every color token
  standalone vs. with the contract (light / dark, custom accent). devDependency
  `@keenmate/base-css-variables` `^2.0.0-rc05`.

### Added

- New CSS knobs `--cp-item-disabled-opacity` (`--base-disabled-opacity`) and
  `--cp-item-danger-color` (`--base-danger-text-color`); row classes `cp__item--disabled` /
  `cp__item--danger`.
- `e2e/interaction-model.spec.ts` + `test/interaction-model.html`; unit `test/unit/interaction.test.ts`.

### Fixed

- Example pages: the size radios set `size = null` for the default, which the converter rejects
  (a console warning on every load of the playground / theming pages) — they remove the
  attribute instead.
- `page-size` changed while the palette is open now re-pages the current search results right
  away (the first visible row stays on screen); it used to apply only from the next keystroke
  (test/NOTES.md #5).
- `display="tokens"`: an answer containing a `$` replacement pattern (`$&`, `$'`, `$$`) no longer
  garbles its badge's "Remove …" label (test/NOTES.md #6).

## [1.0.0-rc02] - 2026-10-19

### Changed

- **Search placeholder falls back to text step 3** (`--cp-text-color-1` 55% into the surface, was
  40%), matching `@keenmate/base-css-variables` 2.0.0-rc03, which moved
  `--base-input-placeholder-color` to `--base-text-color-3`.

- **The palette owns its CSS.** pure-admin's palette is being replaced by this component, so it
  no longer compiles pure-admin-core's `_command-palette.scss`. The CSS is plain CSS in `src/css/`
  (the web-multiselect layout: `variables` / `component` / `overrides` layers). The
  `@keenmate/pure-admin-core`, `sass` and `postcss` dev dependencies and `scripts/shadow-css.mjs`
  are gone. Unused core rules (shortcut-help dialog, loaders, badge sizes / palette colors) are no
  longer shipped, so the UMD bundle is about 10 kB smaller.
- **Reads `@keenmate/base-css-variables` 2.0.** `--base-primary-*` (was `--base-accent-*`),
  `--base-input-text-color` (was `--base-input-color`), `--base-on-<role>-text-color` (was
  `--base-text-on-<role>` / `--base-text-color-on-accent`). A theme that sets only the 2.0 names
  (pure-admin 3.3 / pure-css 2.0) now recolours the palette; before, the accent stayed sky blue.
- **`--cp-*` knobs are declared on `:host`** (each reads a `--base-*` token with a fallback), like
  `--ms-*`. Set a `--cp-*` on the element (`web-command-palette { --cp-width: 680px }`); a
  `--cp-*` set only on an ancestor no longer reaches the palette. `--base-*` on `:root` or any
  ancestor works as before.
- **The search input is a control:** its outline (and the fullscreen close button's) is
  `--base-input-border` (was the divider), with `--base-input-border-focus` and the shared focus
  halo `--base-input-box-shadow-focus`. The placeholder is `--base-input-placeholder-color`
  (no extra opacity).
- **Rows use the shared item states:** the active row (the keyboard cursor) is the *focused*
  state — no fill, an inset `--base-focused-outline` (was a 10% primary fill), the same cursor as
  a focused web-multiselect option or tree row. Hover is `--base-hover-bg` (was a 5% primary
  tint) and also shows under the outline when the pointer is on the active row. The query
  highlight follows the primary color (was a fixed `#0ea5e9`). `--cp-item-active-bg` still adds
  a fill if you want one.
- **Item icons by name draw the shared glyphs:** `icon: 'search'` (or `settings`, `user`, `bell`,
  `edit`, `delete`, …) renders `--base-icon-<name>`, overridable per name with
  `--cp-icon-<name>`. A name with no glyph renders nothing (was a solid square). The ✕ on a
  command token reads `--base-icon-remove` (new `--cp-icon-remove`).
- **Search input has no vertical padding** (`--cp-input-padding-h` inline only), like
  pure-admin's inputs: the fixed height centres the text, so taller theme fonts no longer clip.
- **Stacking follows `--base-z-*`:** `--cp-z-index` is one step above `--base-z-popover`, so the
  palette covers open dropdowns and popovers while toasts and tooltips stay above it (10500
  without the base layer). `--cp-badge-border-radius` is a new knob.
- **The backdrop is `--base-overlay-bg`**, the plain badge is the secondary role
  (`--base-secondary-color` / `--base-on-secondary-text-color`), keycaps default to
  `--base-font-family`, and spacing, weights, durations and the input height read
  `--base-space-*`, `--base-font-weight-*`, `--base-duration-*` / `--base-ease-*` and
  `--base-input-size-lg-height`.
- **Standalone dark mode:** the fallbacks are `light-dark()` pairs, and `[data-theme]` /
  `data-bs-theme` / `.dark` set `color-scheme` on the host (was a light palette on a dark page
  without a theme). The page signals (`.dark`, `[data-theme]`, `[data-bs-theme]` on `<html>` /
  `<body>`, or a `theme-source` element) come from `@keenmate/web-components-core`'s theme
  context, mirrored as `data-context-theme`, so they work in every engine (was
  `:host-context()`, Chromium only).

- New `--cp-*` knobs (all listed in the manifest): colors (`--cp-accent-color`, `--cp-bg`,
  `--cp-text-color-1…3`, `--cp-border-color`, …), input (`--cp-input-*`), badges
  (`--cp-badge-*`), `--cp-z-index`, `--cp-rem`, plus the type / spacing / motion scale.
- **Moved onto `@keenmate/web-components-devkit`.** The Vite and Playwright configs are the
  devkit presets (`defineComponentConfig` / `definePlaywrightConfig`), configured once in
  `package.json#kmwc`. `Dockerfile`, `nginx.conf`, `Makefile` and `.dockerignore` are generated
  by `kmwc sync` (vitest targets moved to `Makefile.local`). The library output is unchanged:
  `dist/web-commandpalette.js`, `.umd.js` and `index.d.ts`.
- **Vite 7** (from 5) and **Vitest 3** (from 2).
- The devkit comes from npm (`@keenmate/web-components-devkit` `^1.0.0-rc01`), so
  the examples image builds from the registry like every other dependency.
- **Dev port 12400** (examples image 12410), the repo's block in the Keenmate component registry.
  It was 12300, which belongs to web-treeview.
- **Example pages are fragments.** The devkit layout adds the head, header and back link, and
  the kit adds the shared styles, chapter nav, copy-link buttons, a light / dark / auto theme
  switch and the version badge. The hub is `renderExamplesIndex({ pages })`. Saved control
  state survives (same storage keys). The theme gallery cards use `data-gallery-theme`, because
  `data-theme` is the page-wide theme signal.
- **The examples site is a Vite multi-page build** (`npm run build:examples` → `dist-examples/`),
  which the image serves. It replaces the `sed` rewrites of `/src/index.ts` and the version badge.
- **`check:vars` is `kmwc check-vars`** against the built bundle (`consumed` mode), so it now runs
  after `vite build`.
- `custom-elements` added to the package keywords.

### Fixed

- The narrow-window `max-height: 60vh` results cap applies again, and reduced motion also
  stops the open animations.

### Removed

- `examples-shared.css`, `examples-chapter-nav.js`, `examples-copy-link.js`,
  `examples-controls-store.js` and `scripts/check-variable-manifest.mjs` (now in the devkit).
- `vite-plugin-dts` as a direct dependency (the devkit preset brings it).

## [1.0.0-rc01] - 2026-10-12 [PUBLISHED]

The first version of `<web-command-palette>` — one framework-agnostic element replacing the
three drifting palette implementations (pure-admin vanilla, svelte-pure-admin, keen-pure-admin
LiveComponent). Not yet published.

### Added

- **The palette machine.** `/` command list, `:` search contexts, global search, and a home
  screen; client-side filtering for static lists; debounced, `AbortSignal`-cancelled provider
  calls with late results dropped; an empty scoped query never calls the provider; global search
  shows matching commands/contexts instantly, then appends server results; client-side pagination.
- **Multi-step command wizards.** Steps with fixed `options`, options loaded once, or live
  `search: true` lookups; `freeText` answers; conditional `shouldShow` steps; inline or `tokens`
  display. Events: `cp-select`, `cp-complete`, `cp-command`, plus `cp-open` / `cp-close` / `cp-ready`.
- **Branching wizards — `Option.steps`.** An option can carry its own follow-up steps, so one
  command can fork (`/assign-admin John to group Finance` vs `… to site Intranet`). Plain JSON.
- **Per-step and per-context providers — `Step.load`, `Context.search`.** Define a picker once and
  reuse it across commands; the central `stepOptionsCallback` / `searchCallback` stay the
  fallback (and what server-driven hosts use).
- **Result groups — `Result.group`.** Search results render under section headings, clustered in
  first-appearance order.
- **Favorites and recents.** Star rows with <kbd>Ctrl</kbd>/<kbd>⌘</kbd>+<kbd>D</kbd> or the ☆ button;
  a frecency-ranked Recent list remembers instant commands, completed runs with their answers,
  contexts and chosen results. Stored in `localStorage` (`usage-key`, per user) or the host's
  `loadUsageCallback` / `saveUsageCallback`; `usage-storage="none"` turns it off. Entries for
  commands the current user no longer has are hidden.
- **Compact home + full lists.** Favorites / Recent show `favorites-limit` / `recent-limit` one-line
  rows (default 3) with a “+N · Ctrl F” control; <kbd>Ctrl</kbd>/<kbd>⌘</kbd>+<kbd>F</kbd> / <kbd>R</kbd>
  open the full, filterable lists and `g f` opens favorites from anywhere. All keys are configurable
  (`favorite-key`, `favorites-key`, `recent-key`, `favorites-hotkey`, `recent-hotkey`);
  `openFavorites()` / `openRecent()` do the same from code.
- **Replaying a run.** A recent run reopens its wizard with each remembered answer offered first
  (“Last used”): <kbd>Enter</kbd> accepts the rest and runs, <kbd>Tab</kbd> walks step by step,
  typing replaces an answer, <kbd>Shift</kbd>+<kbd>Tab</kbd> steps back.
- **Confirmation.** After a command runs, the dialog shrinks (animated, to a minimum height) to one
  line — ✓ `/deploy to Staging branch main` Done — for `confirmation-duration` ms (default 1500)
  instead of vanishing; the effect event still fires immediately. `confirmation="false"` turns it
  off; `renderConfirmationCallback` customises or skips it, and can opt search results in.
- **Keyboard.** <kbd>Ctrl</kbd>/<kbd>⌘</kbd>+<kbd>K</kbd> (`open-key`), `g <letter>` command hotkeys,
  arrows / PgUp / PgDn / Home / End, ←/→ paging, <kbd>Esc</kbd> / <kbd>⌫</kbd> step back.
- **Right-to-left.** `dir="rtl"` on the element or any ancestor mirrors the layout (logical CSS
  throughout), swaps ←/→ paging, and bidi-isolates mixed text so `/deploy …` keeps its order.
- **Phone sheet.** `mobile-presentation="auto"` gives touch phones a fullscreen sheet that stays
  above the on-screen keyboard.
- **Theming.**
  - The shipped CSS reads only the component's `--cp-*` knobs and the shared `--base-*` variables
    (pure-admin's `--pc-*` / `--pa-*` layer resolves to its `--base-*` fallbacks); the build fails
    on any leak.
  - Font sizes follow `--base-font-size-*`; the font follows `--base-font-family` (the input too);
    keycaps have `--cp-key-font-family`.
  - Replaceable icons: `--cp-icon-check`, `--cp-icon-close`, `--cp-icon-star`,
    `--cp-icon-star-filled` → `--base-icon-*` → inline Lucide SVG.
  - Themable scrollbar: `--cp-scrollbar-width`, `-track-bg`, `-thumb-bg`, `-thumb-bg-hover`,
    `-thumb-border-radius`.
  - `--base-rem` scaling, `size="sm|lg|xl"` presets, shadow parts (`palette`, `backdrop`,
    `container`, `input`, `results`, `footer`).
- **i18n.** Every visible and announced string comes from the `labels` map.
- **IDE metadata.** `custom-elements.json`, `web-types.json` and VS Code custom data generated from
  the element's input/event tables and the CSS variable manifest.

### Internal

- CSS single-sourced from pure-admin-core's `_command-palette.scss`, compiled into the shadow root
  by `scripts/shadow-css.mjs` (var() fallbacks, `--base-rem`, font-scale and namespace rewrites).
- Example site on the Keenmate examples convention: Basic, Commands & Steps, Async Search,
  Favorites/Recents & Pickers, Theming (a theme gallery with size switches) and a Playground with
  every switch; hosted at https://examples.web-commandpalette.keenmate.dev, built as a container
  image with `make image-build`.
- Unit tests (Vitest) for the machine and the usage store; Playwright e2e on desktop and Pixel 7.
- `Makefile` with dev / build / test / publish / publish-rc / image targets.
