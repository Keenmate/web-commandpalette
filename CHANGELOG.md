# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

Target: **1.0.0-rc03**. No stable 1.0.0 is published, so the break ships as the next release
candidate — but `^1.0.0-rc02` consumers will pull it: the event,
callback and item API below is breaking.

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
`cp-command` / `cp-complete` were (the before-hook may be async).

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
| — | `beforeSelectCallback({ item, scope })` → `false` cancels a result selection (async OK; a sync hook keeps the flow synchronous); the palette stays open |

**Controller / engine**

| Old | New |
|---|---|
| element methods only | `el.controller` (`CommandPaletteController`): `isOpen`, `open`, `close`, `toggle`, `reset`, `openWith`, `openFavorites`, `openRecent`, `setCommands`, `setContexts` (the element methods stay) |
| `PaletteMachine` / `MachineHost` (exported) | `PaletteEngine` / `PaletteEngineHost` (exported for standalone use; the element never exposes it). The host gains an optional `context(fields)`; `effect()` may answer `false` / a Promise to veto. `Effect` `{ type: 'command' \| 'complete', commandId }` → `{ type: 'action', command, selections }` |
| `findByShortcut` (internal) | `findByTrigger` |
| types `CompleteEventDetail`, `CommandEventDetail` | `ActionEventDetail`; new `PaletteContext`, `CommandContext`, `StepContext`, `SearchContext`, `PaletteEventDetail`, `BeforeActionCallback`, `BeforeSelectCallback`, `CommandPaletteController` |

**LiveView bridge (`@keenmate/keen-web-commandpalette`)** — `data-search-event` /
`data-step-options-event` keep their mechanism (their values are the LiveView event names the
bridge pushes to; nothing is emitted under them). The bridge must listen to `select` / `action`
instead of `cp-select` / `cp-complete` / `cp-command`, install `searchCallback({ scope, term,
signal })` / `getStepOptionsCallback(ctx)` (push `term`, not `query`), and send commands /
contexts / options with the new field names.

### Added

- New CSS knobs `--cp-item-disabled-opacity` (`--base-disabled-opacity`) and
  `--cp-item-danger-color` (`--base-danger-color`); row classes `cp__item--disabled` /
  `cp__item--danger`.
- `e2e/interaction-model.spec.ts` + `test/interaction-model.html`; unit `test/unit/interaction.test.ts`.

### Fixed

- Example pages: the size radios set `size = null` for the default, which the converter rejects
  (a console warning on every load of the playground / theming pages) — they remove the
  attribute instead.

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
