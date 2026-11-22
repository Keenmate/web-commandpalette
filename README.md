# @keenmate/web-commandpalette

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

> A framework-agnostic command palette web component — commands with multi-step wizards, scoped and
> global search, favorites and recents, full keyboard control, RTL and a phone sheet.

## What is it

`@keenmate/web-commandpalette` is a custom element (`<web-command-palette>`) that holds the whole
command-palette state machine — routing, wizards, search, keyboard, focus and scroll-lock — and
talks to its host only through **properties, events and async callbacks**. Hosts (plain JS, Svelte,
React, Blazor, Phoenix LiveView) stay thin adapters instead of re-implementing the palette.

Reads the shared `--base-*` variables from the page (pure-admin, or
[`@keenmate/theme-designer`](https://theme-designer.keenmate.dev)), with its own `--cp-*` knobs on
top; the CSS is the component's own (plain CSS in the shadow root).

**Headline features:**

- `/` commands and `:` search contexts, plus global search that shows matching commands instantly.
- Multi-step command wizards — fixed, loaded-once or live-searched steps, free text, branches.
- Async search with debounce and `AbortSignal` cancellation; empty scoped queries never hit the server.
- Favorites and recently used items (incl. completed runs, replayable with <kbd>Tab</kbd> / <kbd>Enter</kbd>),
  stored in `localStorage` or your backend.
- A short feedback line of what ran, instead of the dialog just vanishing.
- Full keyboard control, `g <letter>` hotkeys, RTL, i18n `labels`, a fullscreen sheet on phones.

## What's New in v1.0.0-rc03

Upgrade guide: the [1.0.0-rc03 release notes](release-notes/1.0.0-rc03.md); full list: the [CHANGELOG 1.0.0-rc03 section](CHANGELOG.md).

- **Events and commands — the shared Keenmate interaction model** — The palette now speaks the same event and item vocabulary as every Keenmate component (core `/actions`), so hosts wire it like a toolbar or menu. The `cp-` prefix is gone (`open`, `close`, `result-select`, `ready`), and `cp-command` / `cp-complete` fold into one `action` event per command run (`detail.id`, `detail.selections`); events bubble but are no longer composed, and each `on*` twin receives the detail. Commands are core action items: `name` → `text`, `shortcut` → `trigger`, `hotkey` → `shortcut`, plus `isVisible` / `isDisabled` / `isDanger` / `tooltip` / `onClick` and their `get*Callback` forms. `beforeActionCallback` and `beforeResultSelectCallback` can cancel a run or a selection (async allowed), and `el.controller` is the frozen public facade carried in every ctx and event detail. This is breaking with no aliases — the release notes have the full old → new tables.

- **Callbacks take one `ctx`, and names follow the v1 vocabulary** — `searchCallback({ scope, term, signal })` gets core's shared `SearchCallbackContext`, `stepOptionsCallback(ctx, signal)` is `getStepOptionsCallback(ctx)`, `Step.load` / `Context.search` are `getOptionsCallback` / `searchCallback`, and `saveUsageCallback` gets `{ entry }`. The post-run line is *feedback*: `show-feedback`, `feedback-duration`, `renderFeedbackCallback` (read by core `renderSlot`). Limits are `max-favorite-count` / `max-recent-count`, the storage key is `storage-key`, `mobile-presentation` is `presentation`, and `setCommands()` / `setContexts()` give way to the `commands` / `contexts` properties. Favorites / recents persist through core `createStateStore()` (new `loadStateCallback` / `saveStateCallback`), under a new localStorage key — stored entries are not carried over.

- **Standard search — accents ignored, `search-behavior` / `search-match`** — Client-side filtering of the `/` and `:` lists, static steps and the favorites / recent lists is core's standard search, like web-multiselect: `ces` finds `Český` and `muller` finds `Müller` (rc02 used a lower-cased substring match), and the `<mark>` highlight follows the same rules. `search-behavior` (`normalized` | `case-insensitive` | `exact`) and `search-match` (`contains` … `regex`) tune it with web-multiselect's names and defaults. Provider calls run through core `createAsyncRunner` — same debounce, abort-on-supersede and dropped late answers — and the loader now appears with the provider call rather than on the keystroke, so a synchronous provider never flashes one.

- **Localization through core `/locale` — flat keys, page-wide dictionary, `translateCallback`, `locale`** — Every UI string resolves instance `labels` → the element's `translateCallback` → the page-wide `window.components.locale` (a flat dictionary of `web-command-palette.<elementType>.<name>` keys, or its `translateCallback` for i18next / ICU) → English. Label keys are flat `<elementType>.<name>` (`placeholders.idle`, `messages.noResults`, `ariaLabels.dialog`, …), one key per place a text is shown, so the visible heading and the screen-reader name can differ. `labels` is also a JSON attribute, counts in labels are formatted for the resolved locale (the new `locale` attribute, else the page, else the browser), and changing the page locale re-renders an open palette in place. Labels drawn as content are HTML templates with escaped `{…}` values.

- **Labels read the spot's context — `{ctx.*}`** — Dynamic labels get their values as `{ ctx }` and read them with dotted placeholders: `{name}` → `{ctx.name}`, `{count}` → `{ctx.count}`, `{page}` / `{total}` / `{key}` → `{ctx.page}` / `{ctx.total}` / `{ctx.key}`, with a typed exported `*LabelContext` per text (`ScopeLabelContext`, `PageLabelContext`, …). A `translateCallback` receives it as `params.ctx`, so an app's i18n can pluralize on `ctx.count`; the English defaults avoid a plural noun after a number (`Results: {ctx.count}`). Breaking, no aliases.

- **A core modal — inert page, phone Back, modal stacking** — The palette opens through core `startModalSession`: the page behind is `inert`, focus is trapped and returned, and the phone Back gesture (or the browser Back button) steps back like Esc and then closes, where rc02 left the page with the palette open. `--cp-z-index` is the modal tier (`--base-z-modal`, 7000), so page dropdowns, popovers, toasts and tooltips sit above it; `--cp-z-index: 7601` restores the old order. Announcements (result count, empty state, "Done") go to core's one page-wide live region, keyboard shortcuts bind through core (`Ctrl+D` / `G` `D` keycaps, exact Ctrl/⌘, 1 s sequence window), and closing animates unless `motion="none"` or reduced motion.

- **Icons through core `renderIcon`, plus `renderIconCallback`** — Item icons follow core's one icon order: markup is inserted raw, a core built-in name (`search`, `settings`, `delete`, …) is masked from `--base-icon-<name>`, and any other name goes to the palette's own `renderIconCallback(name, ctx)`, then the page-wide `window.components.renderIconCallback`, then an icon-font `<i class="cp__icon …">`. Assigning the page-wide hook after the palette rendered repaints the icons in place, keeping the query and active row. The package's `renderIcon` export is gone (import core's); the palette's own glyphs (star, token ✕, feedback ✓) keep their `--cp-icon-*` knobs.

- **Own CSS on the `@keenmate/base-css-variables` 2.0 contract** — The palette no longer compiles pure-admin-core's SCSS: its CSS is plain CSS, BEM on the block `cp` (`.pa-command-palette__*` → `.cp__*`), reading the 2.0 `--base-*` names (`--base-primary-*`, `--base-on-<role>-text-color`) with `--cp-*` knobs declared on the host — set them on the element, not an ancestor. Rows use the shared focused / hover states, standalone colors and dark mode follow the contract in every engine (core theme context instead of Chromium-only `:host-context()`), the phone bar is core's sheet chrome (`--cp-sheet-*`), and `custom-styles` / `getCustomStylesCallback` style the shadow root. The UMD bundle is about 10 kB smaller; the browser floor is Chrome / Edge 123+, Firefox 128+, Safari 17.5+.

- **Public `CommandPaletteEngine` for your own UI** — The DOM-free engine behind the element is public: `new CommandPaletteEngine({ changed, effect }, options)` with options named like the element's inputs (`commands`, `pageSize`, `searchDebounce`, `labels`, `locale`, `favoriteKey`, …), `setOptions(partial)` to change them (an unknown key warns and is skipped) and `getOptions()` to read them back. It replaces rc02's `PaletteMachine`, whose host had one function per setting. docs/usage.md "Build your own UI" shows what the engine does, what you draw and the option ↔ input table.

## What's New in v1.0.0-rc01

- **First release — one palette instead of three** — `<web-command-palette>` replaces the three command palettes that had drifted apart in pure-admin vanilla, svelte-pure-admin and the keen-pure-admin LiveComponent. Each one re-implemented routing, search and keyboard handling, and each had its own bugs. The element now owns that whole logic, and hosts talk to it only through properties, `cp-*` events and async callbacks. Hosts (plain JS, Svelte, React, Blazor, Phoenix LiveView) become thin adapters, with no copy of the palette logic in each. `commands` plus a `searchCallback` is a complete setup. Every callback argument and event detail is plain JSON, so it can travel over a LiveView bridge.

- **Commands, contexts and global search — with the async rules built in** — `/` lists commands and `:` lists search contexts, and anything else is a global search. Global search shows matching commands and contexts right away, then appends the server results. Static lists filter on the client. Provider calls are debounced (`search-debounce`) and cancelled with an `AbortSignal` when a newer query replaces them, and late answers are dropped. A context search with an empty query never calls the server. Keyboard navigation never waits for a request, so arrows stay instant while results load.

- **Multi-step wizards that can branch** — A command can ask a series of steps, such as `/deploy` → environment → branch. Each step can use fixed `options`, a list loaded once, a live `search: true` lookup, `freeText`, or a conditional `shouldShow`. An option can carry its own `steps`, so one command can fork: `/assign-admin John to group Finance` and `… to site Intranet` ask different follow-up questions. `Step.load` and `Context.search` let you define a picker once and reuse it across commands. The central `stepOptionsCallback` / `searchCallback` keep working for server-driven hosts.

- **Favorites and recents, replayable in two keystrokes** — Star any row with <kbd>Ctrl</kbd>/<kbd>⌘</kbd>+<kbd>D</kbd>. The Recent list (ranked by frequency and recency) remembers instant commands, finished runs with their answers, contexts and chosen results. Replaying a run offers each remembered answer first: <kbd>Enter</kbd> accepts the rest and runs it, <kbd>Tab</kbd> steps through one answer at a time, and typing replaces an answer. The home screen shows only a few rows (`favorites-limit` / `recent-limit`). <kbd>Ctrl</kbd>+<kbd>F</kbd> / <kbd>R</kbd> or `g f` opens the full lists, and all of these keys are configurable. Usage is stored in `localStorage` per `usage-key`, or in your backend through `loadUsageCallback` / `saveUsageCallback`.

- **A confirmation instead of a vanishing dialog** — When a command runs, the dialog used to disappear at once, which left users unsure anything had happened. It now shrinks, with an animation, to a one-line summary like ✓ `/deploy to Staging branch main` Done for `confirmation-duration` ms (default 1500). The `cp-complete` / `cp-command` event still fires immediately. Turn it off with `confirmation="false"`, or replace or skip it per run with `renderConfirmationCallback`.

- **Theming on the shared `--base-*` variables, plus its own `--cp-*` knobs** — The CSS is pure-admin-core's palette, compiled into the shadow root. It reads only the shared `--base-*` variables and the component's `--cp-*` knobs, and the build fails if a `--pa-*` / `--pc-*` read slips through. Font sizes follow `--base-font-size-*` and the font follows `--base-font-family`. Sizing scales with `--base-rem` and `size="sm|lg|xl"`. Icons (check, close, star) and the results scrollbar can be themed through `--cp-icon-*` and `--cp-scrollbar-*`. Shadow parts expose `palette`, `container`, `input`, `results` and `footer`. The examples site has a theme gallery with seven styles and size switches.

- **RTL, i18n and a phone sheet** — `dir="rtl"` on the element or any ancestor mirrors the layout, which uses logical CSS throughout. It also swaps ←/→ paging and isolates mixed-direction text, so `/deploy …` keeps its order inside Hebrew or Arabic UI. Every visible and announced string comes from the `labels` map. On touch phones, `mobile-presentation="auto"` turns the dialog into a fullscreen sheet that stays above the on-screen keyboard.

Earlier releases: [CHANGELOG](CHANGELOG.md).

## Demos & docs

- 🧪 [Live examples](https://examples.web-commandpalette.keenmate.dev) — the hosted example site
  (basic usage, commands & steps, async search, favorites, theming, playground). Locally:
  `make dev` → http://localhost:12400.
- 📘 [Usage / API reference](./docs/usage.md) — behaviour, properties, attributes, methods, events, data shapes.
- 🎨 [Theming](./docs/theming.md) — `--cp-*` and `--base-*` variables, font sizes, icons, size presets.
- 📚 [Examples / cookbook](./docs/examples.md) — the example pages and common recipes.
- ♿ [Accessibility](./docs/accessibility.md) — keyboard model, ARIA, focus, RTL.

All guides are listed in [docs/README.md](./docs/README.md).

## Install

```bash
npm install @keenmate/web-commandpalette
```

## Quick start

**Minimal — commands, no server:**

```html
<web-command-palette></web-command-palette>

<script type="module">
  import '@keenmate/web-commandpalette';

  const palette = document.querySelector('web-command-palette');
  palette.commands = [
    { id: 'reload', trigger: '/reload', text: 'Reload data', shortcut: 'g r' },
    { id: 'go', trigger: '/go', text: 'Go to page',
      steps: [{ id: 'page', options: [{ text: 'Users', value: '/users' }, { text: 'Orders', value: '/orders' }] }] },
  ];

  // One `action` event per command: at once without steps, after the last answer with them.
  palette.addEventListener('action', (e) => {
    if (e.detail.id === 'reload') reload();
    if (e.detail.id === 'go') location.href = e.detail.selections[0].value;
  });
</script>
```

<kbd>Ctrl</kbd>/<kbd>⌘</kbd>+<kbd>K</kbd> opens it; type `/` for commands.

**With search — contexts, a server callback and results:**

```js
palette.contexts = [{ id: 'products', trigger: ':products', aliases: [':p'], text: 'Products' }];

palette.searchCallback = async ({ scope, term, signal }) => {
  // scope: 'global' | { contextId: 'products' } — called only for non-empty, debounced terms
  const where = scope === 'global' ? 'global' : scope.contextId;
  const res = await fetch(`/api/search?scope=${where}&q=${encodeURIComponent(term)}`, { signal });
  return res.json(); // [{ id, title, subtitle?, icon?, href?, group? }]
};

palette.addEventListener('result-select', (e) => (location.href = e.detail.result.href));
```

The palette closes itself after `result-select` / `action`; the host performs the effect. Every callback
takes one `ctx`, and every ctx and event detail carries `controller` (`el.controller`, the public
facade) and `element`. See [docs/usage.md](./docs/usage.md) for the full API and
[docs/examples.md](./docs/examples.md) for recipes (step pickers, branching wizards, favorites on
the server, custom feedback line).

## Responsive rules

Tune the palette per device class or window width without app-side viewport code — a map of
partial configs, or a callback that computes one. Keys are **configKeys**; set them page-wide,
per tag or per instance (the generic core mechanism,
[core SPEC §6.7](https://github.com/KeenMate/web-components-core/blob/prod/docs/SPEC.md#67-responsive-rules--partial-configs-per-device-class-page--tag--instance)):

```js
// page-wide (every Keenmate component) and per tag — may be set before the script loads
window.components.responsive = { device: { mobile: { presentation: 'fullscreen' } } };
window.components['web-command-palette'].responsiveCallback = (ctx) =>
  ctx.deviceClass === 'desktop' ? undefined : { display: 'tokens', pageSize: 5 };

// per instance (property, or the JSON attribute responsive='{"breakpoint":{"mobile":{…}}}')
palette.responsive = { device: { tablet: { size: 'lg' } }, breakpoint: { mobile: { pageSize: 5 } } };
palette.responsiveCallback = (ctx) => (ctx.env.orientation === 'landscape' ? { pageSize: 4 } : undefined);
```

A map has two axes: **`device`** — the device class by capability (`mobile` / `tablet` = a
touch phone / tablet, a mouse device is `desktop` at any width); **`breakpoint`** — the window
width bucket (`mobile` < 768px ≤ `tablet` < 1024px ≤ `desktop`, so a narrowed desktop window is
`mobile`). Both may be set; `device` wins on the same key. Own widths or combinations (device
class AND width, orientation, …) go in a `responsiveCallback`.

Precedence (later wins, key by key): global map → global callback → per-tag map → per-tag
callback → **the instance's own attributes / properties** → instance map → instance callback.
An attribute written on an element is never overridden by a page rule; `null` from the instance
callback ignores every page rule. Rules re-run when the device class / breakpoint / orientation
changes and never reflect to attributes. Typed as `CommandPaletteResponsiveMap` /
`CommandPaletteResponsiveCallback`.

## Editor IntelliSense

The package ships editor metadata — autocomplete and hover docs for the element's attributes,
events and `--cp-*` CSS variables — generated from the component's source on every build.

- **JetBrains** (WebStorm / IntelliJ) — works automatically via the `web-types` field in `package.json`.
- **VS Code** — point your workspace at the data files once in `.vscode/settings.json`:

  ```json
  {
    "html.customData": ["./node_modules/@keenmate/web-commandpalette/vscode.html-custom-data.json"],
    "css.customData": ["./node_modules/@keenmate/web-commandpalette/vscode.css-custom-data.json"]
  }
  ```

  Reload the window after adding them.

## Browser support

Modern evergreen browsers with native `customElements`, Shadow DOM, CSS `color-mix()`,
`light-dark()` and dynamic viewport units (the `@keenmate/base-css-variables` themes also use
relative color syntax):

- Chrome / Edge 123+
- Firefox 128+
- Safari 17.5+

Dark mode follows the page signal (`.dark`, `[data-theme]`, `[data-bs-theme]` on `<html>` / `<body>`,
or a `theme-source` element), detected by `@keenmate/web-components-core` and mirrored onto the host
as `data-context-theme`, so it works in every engine. To follow the OS, declare
`html { color-scheme: light dark }` on the page.

No polyfills are shipped.

## Development

```bash
make setup        # npm install
make dev          # examples hub on http://localhost:12400
make build        # cem analyze → library build (dist/) → check:vars
make test         # unit (Vitest) + e2e (Playwright: desktop + Pixel 7)
make              # list every target (publish-rc, image-build, kill-port, …)
```

Details — single tests, the CSS pipeline, publishing, the example-site image — are in
[BUILD.md](./BUILD.md).

## Code structure

| Layer | File | Role |
|-------|------|------|
| Element | `src/web-component.ts` | `CommandPaletteElement` — the `static inputs` / `static events` tables (IDE metadata is generated from them), overlay, presentation, feedback line |
| Logic | `src/palette.ts` | `CommandPaletteEngine` — DOM-free modes, wizard, filtering, async search, pagination; public for your own UI ([docs/usage.md → Build your own UI](docs/usage.md#build-your-own-ui)) |
| Logic | `src/usage.ts` | `UsageStore` — favorites + recents, frecency, pluggable persistence |
| Render | `src/render.ts` | builds the shadow DOM once and patches it |
| Service | `src/keyboard.ts` | global hotkeys + input key map |
| Side | `src/types.ts`, `src/logger.ts`, `src/helpers/`, `src/css/` | public types, logging, pure helpers (`filter.ts` filtering), shadow-root CSS |

The palette CSS is plain CSS in `src/css/` (`main.css` imports the layers: variables → component →
overrides), inlined into the shadow root. It reads only `--cp-*` and `--base-*`.

## About

Authored and maintained by [Keenmate s.r.o.](https://keenmate.com/).
The component ships standalone with sensible light/dark defaults;
when mounted inside [Pure Admin](https://pureadmin.io/) — or any
host that publishes the `--base-*` taxonomy via
[`@keenmate/theme-designer`](https://www.npmjs.com/package/@keenmate/theme-designer) — it adopts the host's colors,
typography, and sizing automatically. There is no runtime
dependency on Pure Admin; the integration is opt-in via CSS
variables.

## Built with BlissFramework

Built on `@keenmate/web-components-core` (`BlissElement`) following the
[BlissFramework component guidelines](https://blissframework.dev/) for structure, theming and
accessibility.

## License

MIT © Keenmate s.r.o. — see [LICENSE](./LICENSE).
