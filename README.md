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
top; the CSS is pure-admin-core's palette, compiled into the shadow root.

**Headline features:**

- `/` commands and `:` search contexts, plus global search that shows matching commands instantly.
- Multi-step command wizards — fixed, loaded-once or live-searched steps, free text, branches.
- Async search with debounce and `AbortSignal` cancellation; empty scoped queries never hit the server.
- Favorites and recently used items (incl. completed runs, replayable with <kbd>Tab</kbd> / <kbd>Enter</kbd>),
  stored in `localStorage` or your backend.
- A short confirmation of what ran, instead of the dialog just vanishing.
- Full keyboard control, `g <letter>` hotkeys, RTL, i18n `labels`, a fullscreen sheet on phones.

## What's New in v1.0.0-rc01

- **First release — one palette instead of three** — `<web-command-palette>` replaces the three command palettes that had drifted apart in pure-admin vanilla, svelte-pure-admin and the keen-pure-admin LiveComponent. Each one re-implemented routing, search and keyboard handling, and each had its own bugs. The element now owns that whole logic, and hosts talk to it only through properties, `cp-*` events and async callbacks. Hosts (plain JS, Svelte, React, Blazor, Phoenix LiveView) become thin adapters, with no copy of the palette logic in each. `commands` plus a `searchCallback` is a complete setup. Every callback argument and event detail is plain JSON, so it can travel over a LiveView bridge.

- **Commands, contexts and global search — with the async rules built in** — `/` lists commands and `:` lists search contexts, and anything else is a global search. Global search shows matching commands and contexts right away, then appends the server results. Static lists filter on the client. Provider calls are debounced (`search-debounce`) and cancelled with an `AbortSignal` when a newer query replaces them, and late answers are dropped. A context search with an empty query never calls the server. Keyboard navigation never waits for a request, so arrows stay instant while results load.

- **Multi-step wizards that can branch** — A command can ask a series of steps, such as `/deploy` → environment → branch. Each step can use fixed `options`, a list loaded once, a live `search: true` lookup, `freeText`, or a conditional `shouldShow`. An option can carry its own `steps`, so one command can fork: `/assign-admin John to group Finance` and `… to site Intranet` ask different follow-up questions. `Step.load` and `Context.search` let you define a picker once and reuse it across commands. The central `stepOptionsCallback` / `searchCallback` keep working for server-driven hosts.

- **Favorites and recents, replayable in two keystrokes** — Star any row with <kbd>Ctrl</kbd>/<kbd>⌘</kbd>+<kbd>D</kbd>. The Recent list (ranked by frequency and recency) remembers instant commands, finished runs with their answers, contexts and chosen results. Replaying a run offers each remembered answer first: <kbd>Enter</kbd> accepts the rest and runs it, <kbd>Tab</kbd> steps through one answer at a time, and typing replaces an answer. The home screen shows only a few rows (`favorites-limit` / `recent-limit`). <kbd>Ctrl</kbd>+<kbd>F</kbd> / <kbd>R</kbd> or `g f` opens the full lists, and all of these keys are configurable. Usage is stored in `localStorage` per `usage-key`, or in your backend through `loadUsageCallback` / `saveUsageCallback`.

- **A confirmation instead of a vanishing dialog** — When a command runs, the dialog used to disappear at once, which left users unsure anything had happened. It now shrinks, with an animation, to a one-line summary like ✓ `/deploy to Staging branch main` Done for `confirmation-duration` ms (default 1500). The `cp-complete` / `cp-command` event still fires immediately. Turn it off with `confirmation="false"`, or replace or skip it per run with `renderConfirmationCallback`.

- **Theming on the shared `--base-*` variables, plus its own `--cp-*` knobs** — The CSS is pure-admin-core's palette, compiled into the shadow root. It reads only the shared `--base-*` variables and the component's `--cp-*` knobs, and the build fails if a `--pa-*` / `--pc-*` read slips through. Font sizes follow `--base-font-size-*` and the font follows `--base-font-family`. Sizing scales with `--base-rem` and `size="sm|lg|xl"`. Icons (check, close, star) and the results scrollbar can be themed through `--cp-icon-*` and `--cp-scrollbar-*`. Shadow parts expose `palette`, `container`, `input`, `results` and `footer`. The examples site has a theme gallery with seven styles and size switches.

- **RTL, i18n and a phone sheet** — `dir="rtl"` on the element or any ancestor mirrors the layout, which uses logical CSS throughout. It also swaps ←/→ paging and isolates mixed-direction text, so `/deploy …` keeps its order inside Hebrew or Arabic UI. Every visible and announced string comes from the `labels` map. On touch phones, `mobile-presentation="auto"` turns the dialog into a fullscreen sheet that stays above the on-screen keyboard.

## Demos & docs

- 🧪 [Live examples](https://examples.web-commandpalette.keenmate.dev) — the hosted example site
  (basic usage, commands & steps, async search, favorites, theming, playground). Locally:
  `make dev` → http://localhost:12300.
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
    { id: 'reload', shortcut: '/reload', name: 'Reload data', hotkey: 'g r' },
    { id: 'go', shortcut: '/go', name: 'Go to page',
      steps: [{ id: 'page', options: [{ label: 'Users', value: '/users' }, { label: 'Orders', value: '/orders' }] }] },
  ];

  palette.addEventListener('cp-command', (e) => reload());                                      // instant command
  palette.addEventListener('cp-complete', (e) => (location.href = e.detail.selections[0].value)); // wizard done
</script>
```

<kbd>Ctrl</kbd>/<kbd>⌘</kbd>+<kbd>K</kbd> opens it; type `/` for commands.

**With search — contexts, a server callback and results:**

```js
palette.contexts = [{ id: 'products', shortcut: ':products', aliases: [':p'], name: 'Products' }];

palette.searchCallback = async (scope, query, signal) => {
  // scope: 'global' | { contextId: 'products' } — called only for non-empty, debounced queries
  const where = scope === 'global' ? 'global' : scope.contextId;
  const res = await fetch(`/api/search?scope=${where}&q=${encodeURIComponent(query)}`, { signal });
  return res.json(); // [{ id, title, subtitle?, icon?, href?, group? }]
};

palette.addEventListener('cp-select', (e) => (location.href = e.detail.item.href));
```

The palette closes itself after `cp-select` / `cp-complete` / `cp-command`; the host performs the
effect. See [docs/usage.md](./docs/usage.md) for the full API and
[docs/examples.md](./docs/examples.md) for recipes (step pickers, branching wizards, favorites on
the server, custom confirmation).

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

Modern evergreen browsers with native `customElements`, Shadow DOM, CSS `color-mix()` and
dynamic viewport units:

- Chrome / Edge 111+
- Firefox 113+
- Safari 16.2+

No polyfills are shipped.

## Development

```bash
make setup        # npm install
make dev          # examples hub on http://localhost:12300
make build        # check:vars → cem analyze → library build (dist/)
make test         # unit (Vitest) + e2e (Playwright: desktop + Pixel 7)
make              # list every target (publish-rc, image-build, kill-port, …)
```

Details — single tests, the CSS pipeline, publishing, the example-site image — are in
[BUILD.md](./BUILD.md).

## Code structure

| Layer | File | Role |
|-------|------|------|
| Element | `src/web-component.ts` | `CommandPaletteElement` — the `static inputs` / `static events` tables (IDE metadata is generated from them), overlay, presentation, confirmation |
| Logic | `src/palette.ts` | `PaletteMachine` — DOM-free modes, wizard, filtering, async search, pagination |
| Logic | `src/usage.ts` | `UsageStore` — favorites + recents, frecency, pluggable persistence |
| Render | `src/render.ts` | builds the shadow DOM once and patches it |
| Service | `src/keyboard.ts`, `src/filter.ts`, `src/icons.ts` | global hotkeys + input key map, filtering, icon rendering |
| Side | `src/types.ts`, `src/logger.ts`, `src/css/` | public types, logging, shadow-root CSS |

The palette CSS is pure-admin-core's `_command-palette.scss`, compiled by
`scripts/shadow-css.mjs` into the shadow root and adapted to read only `--cp-*` and `--base-*`
(never forked — a rebuild re-pulls core).

## License

MIT © Keenmate s.r.o. — see [LICENSE](./LICENSE).

## Built with BlissFramework

Built on `@keenmate/web-components-core` (`BlissElement`) following the
[BlissFramework component guidelines](https://blissframework.dev/) for structure, theming and
accessibility.

## Credits

Created by [Keenmate](https://github.com/keenmate) as part of the Pure Admin design system.
