# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0-rc03] - 2026-11-22

No stable 1.0.0 is published, so the break ships as the next release candidate — but
`^1.0.0-rc02` consumers will pull it: the event, callback and item API below is breaking.

### Internal — on core `^1.0.0-rc27`; devkit `^1.0.0-rc15`; internal verbs (2026-11-24 – 11-27)

- `@keenmate/base-css-variables` → `^2.2.0`: without pure-admin the palette now renders at its intended size (the
  contract's `--base-rem` is 10px, was 1rem); the `--base-rem` allowance in `contract-check.json` is removed.
- Peer + dev dependency `@keenmate/web-components-core` → `^1.0.0-rc27` (renamed verbs; built-in icons draw without
  base-css-variables). Core rename adopted: `runAction()`'s option `emitAction` → `dispatchAction`. An item icon with
  a built-in name (`icon: 'search'`) now draws core's contract glyph when `--base-icon-<name>` is unset (was
  nothing); a page / element `--base-icon-<name>` still wins. No attribute, property or event changes.
- Private method names follow the rulebook's verbs (D-NC-30 / C-NC-16): `apply*` / `sync*` / `finish*` →
  `reconcile*` / `write*` / `install*` / `filter*` / `complete*`. No public API change.
- `@keenmate/web-components-devkit` → `^1.0.0-rc15`: the example pages' accent comes from the devkit registry
  (`kmwc.theme` removed), `social.png` from `kmwc social-image` (og:image / twitter:image on every example page);
  `kmwc sync` refreshed the Makefile (image-logs / image-push) and the CLAUDE.md devkit block.

### Fixed / Internal — audit leftovers (2026-11-24)

- **Fixed:** `ariaLabels.input: ''` now removes the input's `aria-label` (was `aria-label=""`), like every other
  blanked attribute label.
- The global-key hand-over picks the next owner from core's live-instance registry (`getInstances`) instead of an
  own `connected` Set; a deferred, never-built palette is skipped and claims the keys on its first activation.
- `CommandPaletteEngine.setOptions()`'s unknown-key warning goes through the element's instance logger (new optional
  host hook `log()`, core's "engine logs through the element's loggers" pattern): it carries the `#id` label and
  follows `el.disableLogging()`. A standalone engine still warns on `COMMANDPALETTE:INIT`.

### Internal — `renderFeedbackCallback` runs through core `runSafely` (Q14, 2026-11-24)

- The hand-written try/catch around the synchronous `renderFeedbackCallback` call is core's exported `runSafely`
  (logged under the palette's `UI` logger, a throw = the built-in line, as before). No other copies of
  `runSafely` / `notifyListeners` / `deepActiveElement` / `deepClosest` / `isDeepInside` in the palette (the engine's
  and the usage store's try/catches report to their host's `error` / `onError` channel — not copies).

### Added — the `icons` map; the palette's own icons by name (Q12, rulebook C-CA-42, 2026-11-24)

- New `icons` input (property or JSON attribute `icons`): icon overrides by name, like `labels` for icons; the
  page-wide flat `window.components.icons` (`'web-command-palette.<name>'` before `'<name>'`) applies too (core rc26
  order: markup → maps → built-in → hooks → own defaults → icon font → text). Also applies to item `icon` names.
- The palette's own glyphs render through core `renderIcon` with `CP_ICONS` as `defaults`: `star` / `starFilled`
  (favorite toggle), `removeToken` (a token's ✕), `done` (the feedback ✓). Default look unchanged (masked from the
  same `--cp-icon-*` tokens). None is a core built-in name, so the `renderIconCallback` hooks now see these names
  too — a hook that answers every name now also draws them.
- A change of `icons`, `window.components.icons` or a hook repaints the rows, tokens and an open feedback ✓ in place.
  The ✓ is now a `.cp__confirm-check` slot around the icon (was the icon itself). Exported: types
  `CommandPaletteIconName` / `CommandPaletteIcons`, `CP_ICONS`, `CP_ICON_NAMES`.

### Added — render callbacks get `ctx.labels` and re-run in place when the labels change (2026-11-24)

- Every render / display callback ctx (new exported type `PaletteRenderContext`: a command's `get*Callback`s,
  `Step.getIsVisibleCallback`, `getStepOptionsCallback` / `Step.getOptionsCallback`, `renderFeedbackCallback`,
  `getCustomStylesCallback`) carries `labels` — core `createLabelsView`, `ctx.labels.text(key, params)` /
  `.html()` — non-enumerable, so the ctx stays plain JSON. `CommandContext`, `StepContext` and `FeedbackContext`
  extend it.
- A `labels` / `locale` / `translateCallback` / page-wide locale change re-runs the shown ones in place: the command
  rows' `get*Callback`s (home screen, `/` list, favorites / recent lists, the commands in global search), the
  feedback line while it shows, the custom styles. The open palette keeps its mode, query, wizard answers, active
  row and search results; no provider is called again. New engine method `labelsChanged()`.
- No `ctx.isReadonly` / `ctx.isDisabled`: the palette is not a data-input component (no `disabled` / `readonly`).

### Internal — `open()` / `close()` write `isOpen` through core (Q4, 2026-11-23)

- The user-driven open / close sets `setProperties({ isOpen })` instead of hand-writing
  `setAttribute('open', 'true')` / `removeAttribute('open')`: core reflects `open` in its own format and
  `this.config.isOpen` follows the live state. Same attribute, same events.

### Changed — opening closes page overlays through the core modal session (core rc26, 2026-11-23)

- `open()` no longer calls `dismissAllOverlays()` by hand: core's `startModalSession` now closes the page's
  open popovers / dropdowns itself. It closes the default (ungrouped) overlay group only — an overlay in a
  named group stays open (before: every group was dismissed).

### Internal — on core `^1.0.0-rc26`, its final v1 names (2026-11-23)

- Peer + dev dependency `@keenmate/web-components-core` → `^1.0.0-rc26`.
- Core renames adopted: `onTextInput` → `observeTextInput`, `shortcutKeycaps` → `getShortcutKeycaps`, type
  `RenderLoaderCallback` → `RenderLoadingCallback`; option fields `startModalSession({ shouldFitToVisibleViewport,
  dismissCallback })`, `animateOut({ doneCallback })`, `createAsyncRunner({ loadingChangeCallback, errorCallback })`;
  `createStateStore({ getConfig: () => this.config })` (was `getKey` / `getLoadCallback` / `getSaveCallback`);
  `ComponentContext` from core's main entry (no longer on `/actions`). No attribute, property or event changes.

### Changed — BREAKING — labels read the spot's context, `{ctx.*}` (rulebook D-NC-24, 2026-11-23)

- **BREAKING (no aliases):** every dynamic label passes its values as `{ ctx }` and the templates read
  dotted `{ctx.*}` placeholders: `{name}` → `{ctx.name}` (`labels.scopeSearchingIn`, `messages.typeToSearch`,
  `ariaLabels.removeToken`), `{page}` / `{total}` / `{count}` → `{ctx.page}` / `{ctx.total}` / `{ctx.count}`
  (`labels.pageOf`, `buttons.showAll`, `ariaLabels.resultsCount`), `{key}` → `{ctx.key}` (`messages.noFavorites`).
  A custom label with a bare `{name}` / `{count}` now prints it literally.
- A `translateCallback` gets the values as `params.ctx` (was flat `params.count`, …); `ctx.count` is the number the
  text's noun agrees with (results, hidden rows), so an app's i18n (i18next `count`) picks the plural form — core
  never pluralizes.
- New exported types: `ScopeLabelContext` (`id`, `name`, `trigger`), `PageLabelContext` (`page`, `total`, `count`),
  `ShowAllLabelContext` (`count`, `view`), `TokenLabelContext` (`name`, `index`), `ResultsCountLabelContext` (`count`),
  `NoFavoritesLabelContext` (`key`), `LabelContextParams` (`LabelRef.params`).
- English defaults avoid a plural noun right after a number: `labels.pageOf` "Page {ctx.page} of {ctx.total} ·
  Results: {ctx.count}" (was "… · {count} results"), `ariaLabels.resultsCount` "Results: {ctx.count}" (was
  "{count} results").

### Fixed — the `open` attribute opens / closes the palette (CP-4, 2026-11-22)

- `open` is now an input (`isOpen`, attribute `open`, reflected) instead of a reflect-only attribute:
  `<web-command-palette open>` in markup opens the palette at the first build, `setAttribute('open', '')` /
  `removeAttribute('open')` and `el.isOpen = true / false` open / close it (the `open` / `close` events fire once).
  A user open / close keeps reflecting `open="true"` / no attribute (`[open]` matches while open), with no extra events. Before, the attribute did
  nothing and then lied (present while the palette was closed).
- A DOM move while open still closes cleanly and keeps the global hotkeys.

### Added — icons repaint when the page-wide icon hook changes (core `iconsChanged()`, rulebook C-CA-40, 2026-11-22)

- Assigning `window.components.renderIconCallback` after the palette rendered repaints the item icons in place;
  an open palette keeps its query, active row and list scroll.

### Changed — BREAKING — public engine `CommandPaletteEngine`, settings one way (rulebook C-CA-37 / C-CA-39, 2026-11-20 – 11-21)

- **BREAKING (rename, no alias):** `PaletteEngine` → `CommandPaletteEngine`, `PaletteEngineHost` →
  `CommandPaletteEngineHost`.
- **BREAKING (no alias):** `new PaletteEngine(host)` with one host function per setting (`debounceMs()`,
  `searchRules()`, `labels()` returning a `createLabels` resolver, …) →
  `new CommandPaletteEngine(host, options)`. `host` keeps only the hooks (`changed`, `effect`, `context?`,
  `element?`, `error?`); every setting and the data are plain `options` (same names, defaults from the element's
  inputs): `commands`, `contexts`, `searchCallback`, `getStepOptionsCallback`, `display`, `pageSize`,
  `searchDebounce`, `searchBehavior`, `searchMatch`, `labels`, `translateCallback`, `locale`, `usage`,
  `maxRecentCount`, `maxFavoriteCount`, `favoriteKey`. Before `{ commands: () => list, pageSize: () => 8, … }`;
  after `new CommandPaletteEngine({ changed, effect }, { commands: list, pageSize: 8 })`.
- **Added:** `engine.setOptions(partial)` (merges; re-applies what it names — the list, the wizard step, paging,
  the search; `undefined` = back to the default) and `engine.getOptions()` (the merged options, read-only).
  Exported type `CommandPaletteEngineOptions`.
- **Changed:** `setOptions` warns once per key that is not an option (`COMMANDPALETTE:INIT`,
  `CommandPaletteEngine.setOptions(): "<key>" is not an option — ignored`) and skips it — a typo no longer
  passes silently (the same rule as `EditorEngine.setOptions`).
- **BREAKING (rename, no alias):** engine option `starKey` (the drawn keycap text, default `'Ctrl+D'`) →
  `favoriteKey`, the element's `favorite-key` input with the same meaning and default: the key letter (`'d'`,
  `''` = off). The engine draws the keycap itself (core `formatShortcut('Mod+<key>')`: `Ctrl+D` / Apple `⌘D`)
  for `messages.noFavorites`. Before `{ starKey: 'Ctrl+K' }`; after `{ favoriteKey: 'k' }`. The element passes
  its `favoriteKey` through unchanged.
- **Added:** option `translateCallback` — the engine's own translation hook, asked before
  `window.components.locale.translateCallback` (the element passes its `translateCallback` through); option
  `labels` is the instance `labels` object (`Partial<CommandPaletteLabels>`, as the element's input) — the engine
  builds the resolver itself and exposes it as `engine.labels`.
- **Added:** optional host hook `element()` — the engine's element (read once): a throwing `translateCallback`
  logs under that element's logger; a standalone UI omits it (core `createLabels(null, …)`).
- **BREAKING (removed):** `engine.refresh()`, `displayChanged()`, `pageSizeChanged()`, `searchRulesChanged()` —
  `setOptions` applies those changes. `usageChanged()` stays (the `UsageStore`'s data notification).
- The element passes its inputs through `setOptions` (`searchCallback`, `getStepOptionsCallback`,
  `search-debounce` now react on `update`); no attribute / property / event changes.
- **Docs:** docs/usage.md "Build your own UI" — what the engine does, what you draw, a minimal example and
  the option ↔ element-input table.

### Added — `labels` JSON attribute (2026-11-21)

- **Added:** `labels` is also an attribute (`labels='{"placeholders.idle":"Hledat…"}'`, JSON object; core
  `toObject`) — the same shape as the property, like web-multiselect / -daterangepicker / -treeview / -grid /
  -editor / -dropzone. Malformed JSON warns and keeps the previous value.

### Added — `locale` input (core `/locale`, rulebook C-CA-38, 2026-11-21)

- **Added:** `locale` input (attribute + property): BCP-47 locale for the numbers in labels — `{count}` /
  `{page}` / `{total}` in `labels.pageOf`, `ariaLabels.resultsCount`, `buttons.showAll` — and `translateCallback`'s
  `ctx.locale`. Unset (or `auto`) = the page-wide `window.components.locale.locale`, else the browser. A change
  re-renders the labels in place (mode, query and wizard answers kept).
- **Added:** `CommandPaletteEngine` option `locale` — the same setting, same default (`null`,
  one source with the element's input row); the element passes its `locale` through.
- **Docs:** usage.md (input table, attributes, Labels, "Build your own UI" option table + example);
  `examples-localization.html` LO05 has an element `locale` toggle next to the page locale.

### Internal — core `toBool` reflection + lifecycle guard replace local workarounds (core rc25, 2026-11-22)

- The local `OPEN_STATE` converter is gone: `open` uses core `toBool('default-false')`, which now removes the
  attribute at the default (`open="true"` while open, no attribute while closed). `disconnect()` no longer has to
  order its steps around a nested `connect()` — core serializes re-entrant connect / disconnect callbacks.

### Internal — variables manifest matches the code (rulebook C-BV-3 / C-BV-6, 2026-11-22)

- `component-variables.manifest.json`: the 19 `--cp-sheet-*` knobs are marked `"input": true` (unset by design —
  they forward to core's `--_km-sheet-*` slots, so a `:host` default would cut the page-wide `--km-sheet-*` chain);
  `--base-elevated-bg`, `--base-touch-target-min` and `--base-z-modal-backdrop` are marked
  `"readBy": "@keenmate/web-components-core"` (core's sheet chrome / `Z_INDEX`, not the palette's CSS). No CSS
  changed — every variable renders as before.

### Internal — engine defaults from one source (rulebook C-CA-37, 2026-11-21)

- `ENGINE_DEFAULTS` (`src/types.ts`, not exported) is the one source of every input default: the element's input rows, its engine host and `CommandPaletteEngine`'s fallbacks read it (replaces `DEFAULT_LOCALE`; `DEFAULT_PALETTE_KEYS` / `DEFAULT_SEARCH_RULES` derive from it). No behaviour change.

### Docs — localization example page (rulebook C-EP-5, 2026-11-21)

- `examples-localization.html` — the shared localization page (LO01–LO06): instance `labels`, the page-wide
  dictionary, `translateCallback` (own → page-wide), aria-label / tooltip twins, locale-formatted counts,
  `shouldEscapeLabels`; linked from the index and `docs/examples.md`, smoke in `e2e/examples.spec.ts`.
- The LO01 / LO02 code blocks are reference snippets (`data-kmwc-snippet`; the live code is toggled by the page script),
  so devkit doctor `[pages]` no longer flags them as hand-copied (2026-11-22).
- LO03 shows the real i18next setup (`pageOf_one` / `_few` / `_other`) + the one generic bridge
  (`{ ...params, count: params.ctx?.count }` into `exists()` / `t()`; the page picks the same Slovak forms with
  `Intl.PluralRules`); new LO07 — the result count in Czech plural forms ("1 výsledek / 3 výsledky / 5 výsledků") via
  the palette's own `translateCallback`, a 1 / 3 / 5 switch; e2e asserts both (2026-11-23).

### Added — `translateCallback` on the element (core `/locale`, rulebook C-CA-33, 2026-11-20)

- **Added:** `el.translateCallback(ctx)` — this palette's own translation hook (core `TranslateCallback`, `ctx = {
  component, key, template, params, locale }`). Asked for every label key the instance `labels` did not set, before
  the page-wide `window.components.locale.translateCallback`; `null` / `undefined` = not mine. Instance `labels`
  still win over both. One palette on a page needs no `window.components` setup. Changing it re-renders every label.

### Added — `renderIconCallback` on the element; Changed — core rc25 icon order (core SPEC §12.33, rulebook C-CA-33, 2026-11-20)

- **Added:** `el.renderIconCallback(name, ctx)` — this palette's own icon hook (`ctx = { component, element, prefix:
  'cp', item, kind }`, `item` = the row's own command / context / option / result / usage entry). Asked after a
  built-in name and before the page-wide `window.components.renderIconCallback`; a string is the icon (`''` = none),
  `null` / `undefined` = not mine (the page-wide hook decides next). One palette on a page needs no
  `window.components` setup. Changing it re-renders the rows.
- **BREAKING (core rc25 icon order):** a one-word ASCII `icon` that is NOT a core built-in name (`'gear'`,
  `'chevron-right'`) now renders an icon-font `<i class="cp__icon gear" aria-hidden="true">`, not a glyph masked from
  `--base-icon-<name>`. Built-in names (`search`, `check`, `settings`, `delete`, … core `BUILT_IN_ICON_NAMES`) still
  mask their `--base-icon-*` token and never reach a hook. Before: `icon: 'gear'` + `--base-icon-gear: url(…)`. After:
  pass the markup (`icon: '<svg …>'`), map the name in `renderIconCallback`, or load the icon font's CSS into the
  shadow root (`custom-styles` / page-wide `customStyles`).
- `.cp__icon` (every icon `renderIcon` draws, the icon-font `<i>` included) is `flex: none; line-height: 1`.

### Changed — label keys are flat `<elementType>.<name>` (core rc25 `/locale`, rulebook D-NC-24, 2026-11-19)

- **BREAKING:** every `labels` key is renamed to `<elementType>.<name>` (`buttons`, `tooltips`, `ariaLabels`,
  `placeholders`, `headers`, `labels`, `messages`). English defaults are unchanged. A text shown in two places now
  has one key per place (home heading vs. context pill, footer hint vs. star button name / tooltip, dialog vs. input
  name, feedback heading vs. announcement).
- **BREAKING (one text, one key):** `ariaLabels.searching` is removed — the loader (`role="status"`) is named by its
  visible text, `messages.searching`. Every remaining `ariaLabels.*` names something nothing visible names (the
  dialog, the search input — a placeholder is not a caption —, the icon-only close / remove-token / star buttons) or
  is an announcement. Twins share `<name>` (`labels.close` / `ariaLabels.close`, `labels.*` / `tooltips.*` /
  `ariaLabels.*` `addFavorite` / `removeFavorite`, `headers.done` / `ariaLabels.done`), so core's twin fallback
  applies: an unset `ariaLabels.*` / `tooltips.*` key follows a customized same-name sibling.
- **BREAKING (page-wide):** `window.components.locale.labels` is one flat dictionary of full keys —
  `{ 'web-command-palette.messages.noResults': 'Nic nenalezeno' }`; the nested `{ 'web-command-palette': {…} }`
  shape is gone. The instance `labels` takes short (`messages.noResults`) or full keys.
- **BREAKING:** the page-wide `formatLabelCallback` is core's `translateCallback({ component, key, template, params,
  locale })` (`key` = the full key; `null` / `undefined` = not mine).
- The star button sets no `aria-label` / `title` when its label is `''` (was an empty attribute).

| Old key | New key(s) |
|---|---|
| `placeholder` | `placeholders.idle` |
| `filterPlaceholder` | `placeholders.filter` |
| `noResults` | `messages.noResults` |
| `searching` | `messages.searching` (loader text, also its name) |
| `searchingIn` | `labels.scopeSearchingIn` |
| `typeToSearch` | `messages.typeToSearch` |
| `commands` | `headers.commands` (home heading) + `labels.scopeCommands` (context pill) |
| `search` | `headers.search` |
| `searchContexts` | `labels.scopeContexts` |
| `pageOf` | `labels.pageOf` |
| `navigate` / `select` / `back` / `pages` / `next` / `run` | `labels.navigate` / `labels.select` / `labels.back` / `labels.pages` / `labels.next` / `labels.run` |
| `close` | `labels.close` (footer hint) + `ariaLabels.close` (close button) |
| `fullscreenTitle` | `headers.fullscreen` |
| `dialogLabel` | `ariaLabels.dialog` (dialog) + `ariaLabels.input` (search input) |
| `removeToken` | `ariaLabels.removeToken` |
| `resultsCount` | `ariaLabels.resultsCount` |
| `favorites` / `recent` | `headers.favorites` / `headers.recent` (home headings) + `labels.scopeFavorites` / `labels.scopeRecent` (context pill) |
| `addFavorite` / `removeFavorite` | `labels.*` (footer hint) + `tooltips.*` (star title) + `ariaLabels.*` (star name) |
| `lastUsed` | `labels.lastUsed` |
| `showAll` | `buttons.showAll` |
| `noFavorites` / `noRecent` | `messages.noFavorites` / `messages.noRecent` |
| `done` | `headers.done` (feedback heading) + `ariaLabels.done` (announcement prefix) |

### Changed — provider calls through core `createAsyncRunner` (core SPEC §12.22, 2026-11-17)

- Search (`searchCallback`, a context's own `searchCallback`) and step options (`getStepOptionsCallback`, static
  and `isLiveSearch`) run through core's one "latest request wins" runner instead of the palette's own debounce,
  `AbortController` supersede and stale-answer check: same `search-debounce`, a superseded call's signal aborts and
  its late answer is dropped, a failure still degrades to the local matches.
- **Changed (visible): the loader starts with the provider call, not with the keystroke** — no loader / veil during
  the `search-debounce` wait, and a synchronous provider (an array, not a Promise) never shows one. The result-count
  announcement waits until the answer lands. The engine gains `isPending` (debounce or answer outstanding).

### Changed — screen-reader announcements through core `announce()` (core SPEC §12.23, 2026-11-17)

- The result count (`labels.resultsCount`, the raw number formatted by core `/locale`), the empty-state text
  and "Done: …" after a command go to core's one page-wide live region (`body > [data-km-announcer]`, shared by
  every component and readable while the modal makes the page inert). **BREAKING (DOM):** the palette's own
  `.cp__sr-only` live region is gone. The visible context pill (`.cp__context`, `aria-live="polite"`) stays — it is
  visible status text, not an announcement.

### Changed — `renderFeedbackCallback` through core `renderSlot` (core SPEC §12.35, 2026-11-17)

- The feedback callback's result is read by core's one render-callback contract: a string = HTML, a Node
  (element, fragment — any `Node` now, it was `HTMLElement` only) = mounted, `null` / `undefined` = the built-in
  line, `false` = hidden (no feedback, the palette closes right away). No change in what `null` / `false` do: a
  search-result selection still has no built-in line, so `null` there still means no feedback.

### Changed — item icons through core `renderIcon` (core SPEC §12.33, 2026-11-17)

- **BREAKING (visible): item icons follow core's one icon rule** (`renderIcon(icon, { prefix: 'cp' })` +
  `ICON_CSS` adopted into the shadow root). Markup (a value starting with `<`) is inserted raw as before.
  An ASCII name (`search`, `chevron-right`) is a `<span class="km-icon cp__icon cp__icon--NAME">` masked
  straight from `--base-icon-<name>`: the palette's own inline fallback glyphs and the per-name
  `--cp-icon-<name>` knobs (`--cp-icon-search`, `--cp-icon-add`, … `--cp-icon-clear`) are gone — load a
  `:root` theme (`@keenmate/base-css-variables`) or set `--base-icon-<name>` on the element; an unset token
  draws nothing. The `x` alias of `close` is gone, and a value with other characters (`fa.gear`) is now text
  (it used to be stripped into a name). Anything else (an emoji, `1 < 2`) is escaped text.
- **BREAKING: the `renderIcon` export is gone** — import core's
  (`import { renderIcon } from '@keenmate/web-components-core'`). `src/helpers/icons.ts` is deleted.
- The palette's own glyphs (☆ / ★, the token ✕, the confirmation ✓) draw through the same `.km-icon` and
  keep their `--cp-icon-*` knobs; `--cp-icon-size` still sizes them.

### Changed — shortcuts through core `/actions` (core SPEC §12.12, 2026-11-17)

- **Key handling is core's:** the global keys (Ctrl/⌘+`open-key`, the `g <letter>` sequences of commands and
  `favorites-hotkey` / `recent-hotkey`) bind through core `bindShortcuts`; the in-palette Ctrl/⌘+D / F / R
  (`favorite-key` / `favorites-key` / `recent-key`) match with `matchesShortcut('Mod+<key>')`; `isTypingTarget`
  is core's. The one-owner-per-page guard stays (core binds, the palette decides who owns the page keys).
  The own `GlobalKeys` class, `sequenceLetter`, `findSequenceCommand`, `isTypingTarget` and the
  `SEQUENCE_LEADER` / `SEQUENCE_WINDOW_MS` exports of `keyboard.ts` are gone.
- **BREAKING (visible): keycaps use core's platform format** (`formatShortcut` / `shortcutKeycaps`): the
  Ctrl/⌘ chords read `Ctrl+D` / `Ctrl+F` (was `Ctrl D` / `Ctrl F`; Apple `⌘D` unchanged), a command's
  sequence keycaps read `G` `D` (was `g` `d`), and an explicit `Ctrl+K` shortcut shows `⌃` `K` on a Mac.
- **Sequence window 1200 ms → 1000 ms** (core's default): the second key of `g d` must follow within 1 s.
- **Ctrl/⌘ is exact (`Mod`):** ⌘ on Apple, Ctrl elsewhere; an extra Shift no longer counts
  (Ctrl+Shift+K does not toggle). The first key of a sequence (`g`) now has its default prevented while a
  sequence is possible. Any key sequence works for a command `shortcut` / `favorites-hotkey` /
  `recent-hotkey`, not only `g <letter>`; a chord there stays display-only / ignored.

### Changed — labels through core `/locale`: page-wide labels, locale-formatted counts (core SPEC §12.24, 2026-11-17)

- **Page-wide labels:** every UI string resolves through core `createLabels` — the instance `labels` → the
  page-wide `window.components.locale.labels['web-command-palette']` → English. Assigning
  `window.components.locale` re-renders an open palette in place (core `localeChanged()`; mode, query and
  wizard answers kept). A page-wide `formatLabelCallback` (ICU / i18next) and
  `window.components.security.shouldEscapeLabels` apply. The own `resolveLabels` and `{name}` templating
  are gone.
- **BREAKING (visible): counts are locale-formatted.** The palette passes `{count}`, `{page}` and `{total}`
  (`pageOf`, `resultsCount`, `showAll`) as numbers and core `createLabels` formats them for the resolved
  locale — `12 345` in Czech, `12,345` in English (was `12345` everywhere). A `formatLabelCallback` gets
  the raw numbers (ICU / i18next plurals).
- **BREAKING (labels are HTML where drawn as content):** headings, footer hints, the empty / loading /
  pagination text, `showAll` and the feedback heading `done` are now HTML templates (the `{…}` values stay
  escaped), the core label standard; attribute / placeholder / pill / badge / announcement labels stay
  plain text. A label holding a literal `<` or `&` there must escape it, or set
  `window.components.security = { shouldEscapeLabels: true }`.
- **BREAKING (types):** the `Labels` type is renamed `CommandPaletteLabels` (the core `/locale` `Labels`
  is the resolver API); `CommandPaletteEngineHost.labels()` returns the instance `labels` object (the engine
  builds core's resolver itself, `engine.labels` — see "Public engine" above), not a resolved string map. New exports: `PaletteLabels`, `LabelRef`; `CommandPaletteEngine.emptyText` is now a getter
  over `emptyLabel`, plus `pageLabel`.

### Changed — standard Keenmate search: accent-insensitive filter, `search-behavior` / `search-match`, core `SearchCallbackContext` (core SPEC §12.11, 2026-11-17)

- **Accent-insensitive filtering (visible change):** the client-side filter (the `/` and `:` lists, static
  steps, the favorites / recent lists, the commands / contexts prepended to global search) is now core's
  standard search, like every Keenmate component: it ignores case **and diacritics** by default — `ces`
  finds `Český`, `muller` finds `Müller` (was a lower-cased substring match). The `<mark>` highlight goes
  through core (`findHighlightRanges` + `wrapRanges`, escaped) under the same rules, so `ces` marks `Čes`.
- **New `search-behavior` / `search-match` inputs** (`searchBehavior` / `searchMatch`), the same names,
  values and defaults as web-multiselect: `normalized` | `case-insensitive` | `exact` (default `normalized`)
  and `contains` | `equals` | `starts-with` | `word-starts-with` | `ends-with` | `word-ends-with` | `regex`
  (default `contains`). Live: changing either re-runs the current search. They don't touch the provider
  callbacks, which still get the term as typed (trimmed).
- **BREAKING (`searchCallback` ctx type):** `SearchContext` (of `searchCallback` and `Context.searchCallback`)
  is now core's shared `SearchCallbackContext` — `{ term, signal, entries }`, the same shape web-multiselect
  passes — plus the palette's `scope` and `controller` / `element`. `entries` (non-enumerable, like `signal`)
  is always `[]`: the palette has no client-side records behind a search. Destructuring
  `({ scope, term, signal })` keeps working; code that typed the ctx by hand or spread / compared it should
  move to `SearchContext`. `SearchBehavior` / `SearchMatch` are re-exported from the package.

### Changed — the palette is a core modal: modal tier, modal session, phone Back (core SPEC §12.18 / §12.19, 2026-11-17)

Needs `@keenmate/web-components-core` `^1.0.0-rc25`.

- **BREAKING (stacking):** `--cp-z-index` is now the modal tier, `var(--base-z-modal, 7000)` (was one step
  above popovers, `calc(var(--base-z-popover, 7600) + 1)` = 7601). The palette now sits **below** page
  dropdowns / popovers (7500 / 7600), toasts and tooltips, like every core dialog and sheet; the page behind
  is inert while it's open. To keep the old stacking, set `--cp-z-index: 7601` on the element.
- **The phone Back gesture** (and the browser Back button) now works on the open palette, exactly like Esc:
  it steps back first (wizard step → previous answer / command list, context search → context list, the full
  favorites / recent list → home), then closes. Previously Back left the page with the palette open.
- Focus trap, backdrop click, focus capture / return, page scroll lock and the full-screen sheet's keyboard
  inset go through core `startModalSession` instead of the palette's own wiring; the page behind is `inert`
  while open. Esc keeps "step back, then close" (core `beforeEscapeCallback`); Tab in the input stays "select".
  Tab from a token's remove button now moves to the next tabbable control in the dialog (wrapping at the
  edges) instead of jumping straight to the input. A palette open while another KM page dropdown opens is
  no longer dismissed by it (modals coordinate among themselves only).

### Changed — more plumbing through core helpers (2026-11-17)

Internal, no visible change. Needs `@keenmate/web-components-core` `^1.0.0-rc25`.

- Typed text through core `onTextInput` (committed text only — IME syllables and Firefox's duplicate
  `input` skipped) and the input keydown returns on `isImeEnter(e)` (also Safari's `keyCode` 229 Enter) (core SPEC §12.30).
- `el.controller` through core `createControllerFacade` — same members (`open` / `close` / `toggle` / `reset` /
  `openWith` / `openFavorites` / `openRecent`, read-only `isOpen`, settable `commands` / `contexts`); the object is now frozen (core SPEC §12.34).
- The countdown bar's motion check is core `isMotionOff(this)`; the own `@media (prefers-reduced-motion)` block is gone —
  core `MOTION_CSS` zeroes `--base-duration-*` (and so `--cp-transition-*`) under OS reduced motion (core SPEC §12.16).

### Changed — active row through core `createActiveDescendant` (core SPEC §12.25, rulebook C-CA-25, 2026-11-17)

- Internal, no visible change: `aria-activedescendant`, `aria-controls` and the in-list scroll of the
  active row now come from core `/a11y` `createActiveDescendant` (ARIA only, `shouldHandleKeys: false` —
  the keys, the roles and the `cp__item--active` highlight stay the palette's). Needs
  `@keenmate/web-components-core` `^1.0.0-rc25`. The results list gets `tabindex="-1"` (not a tab stop of its own).

### Changed — motion: closing animation, countdown bar follows the motion level (core SPEC §12.16, 2026-11-15)

Needs core's `animateOut`: needs `@keenmate/web-components-core` `^1.0.0-rc24`.

- **Closing mirrors the opening:** the backdrop fades out and the dialog slides up
  (`cp-fade-out` / `cp-slide-up`, `--cp-transition-normal` + the new `--cp-easing-in` →
  `--base-ease-in`), through core `animateOut`. `close()` still closes at once — `isOpen`, the
  `open` attribute, the scroll lock, focus return and the `close` event all happen at the start;
  only the dialog's removal waits for the animation (inert meanwhile). Instant at `motion="none"`,
  an ancestor `data-motion="none"` and OS reduced motion; `open()` during it cancels it. The phone
  sheet has no open animation, so it closes at once too. Closing from the feedback line keeps the
  line until the dialog is gone.
- **The feedback countdown bar is decorative:** it is left out whenever the resolved speed is `0s`
  — `motion="none"` on the element, a section's / the page's `data-motion="none"`, OS reduced motion
  (it used to be only reduced motion, and there it stood still at full width). The feedback timer
  (`feedback-duration`) keeps its time.
- Docs: the Motion section describes core's `motion` switch (it said there was no attribute); the
  sheet-bar variables carry the shared "sheet" definition.

### Fixed — search highlight with characters whose lower case is longer (2026-11-13)

- `highlight()` matched on `text.toLowerCase()` but cut the original text at those indexes: a title
  with `İ` (lower-cases to two characters) before the match marked the wrong characters
  (`İzmir, S<mark>myrna</mark>`). It now matches in the original text. Ported from the devkit
  spotlight, which mirrors it.

### Changed — the phone sheet bar is core's sheet chrome (SPEC §12.9, rulebook C-RO-17, 2026-11-13)

Needs core's `SHEET_CHROME_CSS`: needs `@keenmate/web-components-core` `^1.0.0-rc24`.

- The fullscreen bar, its title and its ✕ now carry core's `km-sheet-header` / `km-sheet-title` /
  `km-sheet-close` (the `cp__fullscreen-bar` / `cp__fullscreen-title` / `cp__close` classes stay as
  hooks): the same bar as every Keenmate sheet — a round, borderless 44px ✕ chip (the glyph is a
  `--base-icon-close` mask, its tap area reaches into the top corner), core's padding / divider /
  title type. Visual change: the ✕ was a bordered input-height square.
- New `--cp-sheet-*` knobs (header-bg / -border / -min-height / -gap / -padding-block /
  -padding-inline, title-color / -font-size / -font-weight, close-size / -icon-size / -icon /
  -color / -bg / -bg-hover / -border / -border-radius / -focus-color / -edge-nudge), unset by
  default — an unset one falls through to the page-wide `--km-sheet-*`, then core's default.
- **BREAKING (theming):** `--cp-input-border-hover` is removed (it only styled the old ✕ hover);
  `--cp-icon-close` no longer reaches the fullscreen ✕ — use `--cp-sheet-close-icon`.
- The close button's accessible name is still `labels.close`; the desktop dialog has no close
  button, so it is unchanged.

### Internal — core 1.0.0-rc24 (2026-11-15)
- core `^1.0.0-rc24` (was `^1.0.0-rc22`).

### Internal — devkit 1.0.0-rc14 (2026-11-13)
- `@keenmate/web-components-devkit` `^1.0.0-rc14` (was `^1.0.0-rc01`); `kmwc sync` refreshed the Makefile, the
  CLAUDE.md devkit block and added `check:pages`. The example pages' code snippets are highlighted
  `.code-block[data-language="js"]` blocks (the bare `<pre>` snippets in Favorites included); the theme
  gallery's fixed colours are marked `data-kmwc-fixed-colors`; the variables manifest points at the
  published `$schema`. The pages have no API reference tables; their snippets match the current API.

### Internal — core 1.0.0-rc22 (2026-11-13)
- **Requires `@keenmate/web-components-core` `^1.0.0-rc22`** (was `^1.0.0-rc21`).

### Changed — BREAKING (persisted UI state the core way, SPEC §12.17 / rulebook C-CA-17, 2026-11-09)

Needs core `createStateStore()`: requires `@keenmate/web-components-core` `^1.0.0-rc21` (was `^1.0.0-rc20`). No compatibility aliases.

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
| `PaletteMachine` / `MachineHost` (exported) | `CommandPaletteEngine` / `CommandPaletteEngineHost` (exported for standalone use; the element never exposes it). The host gains an optional `context(fields)`; `effect()` may answer `false` / a Promise to veto. `Effect` `{ type: 'command' \| 'complete', commandId }` → `{ type: 'action', command, selections }` |
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

### Changed — the palette owns its CSS on the `@keenmate/base-css-variables` 2.0 contract (2026-10-19 – 10-24)

Listed under 1.0.0-rc02 before; that version was already on npm (2026-10-12) without these changes, so
they ship first in this release.

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
- **Browser floor raised** to Chrome / Edge 123+, Firefox 128+, Safari 17.5+ (was Chrome / Edge 111+,
  Firefox 113+, Safari 16.2+): the CSS now uses `light-dark()`, and the `@keenmate/base-css-variables`
  2.0 themes use relative color syntax (README → Browser support).

### Fixed (2026-10-24)

- The narrow-window `max-height: 60vh` results cap applies again, and reduced motion also
  stops the open animations.

### Internal (2026-10-12 – 11-09)

- The devkit comes from npm (`@keenmate/web-components-devkit` `^1.0.0-rc01`), so
  the examples image builds from the registry like every other dependency.
- devDependency `@keenmate/base-css-variables` `^2.0.1` (was `^2.0.0-rc06`; `--base-dropdown-offset`, read by
  core rc21's anchor default).

## [1.0.0-rc02] - 2026-10-12 [PUBLISHED]

### Changed

- **Moved onto `@keenmate/web-components-devkit`.** The Vite and Playwright configs are the
  devkit presets (`defineComponentConfig` / `definePlaywrightConfig`), configured once in
  `package.json#kmwc`. `Dockerfile`, `nginx.conf`, `Makefile` and `.dockerignore` are generated
  by `kmwc sync` (vitest targets moved to `Makefile.local`). The library output is unchanged:
  `dist/web-commandpalette.js`, `.umd.js` and `index.d.ts`.
- **Vite 7** (from 5) and **Vitest 3** (from 2).
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
  after `vite build`. The `--pa-*` / `--pc-*` leak guard moved into the shadow-CSS plugin and
  fails the build itself.
- `custom-elements` added to the package keywords.

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
