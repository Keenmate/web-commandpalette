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
