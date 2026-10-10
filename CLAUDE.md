# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Status

v1 is implemented (milestones M0–M8 of `IMPLEMENTATION_PLAN.md`). The plan remains the design
spec and records the intent behind the behaviour; `docs/usage.md` is the public API reference.

## Commands

A `Makefile` wraps these (run `make` for the list). It also has `make kill-port` (frees
12300–12305), `make publish-dry`, `make publish-rc` (the `rc` dist-tag) and `make publish`
(`latest`). Don't run the publish targets unless the user asks.

- `npm run dev` — Vite dev server on port **12300** (`index.html` hub + `examples-*.html`)
- `npm run build` — `check:vars:strict` → `cem analyze` → Vite library build into `dist/`
- `npm run test:unit` — vitest (happy-dom), specs in `test/unit/`. Single file: `npx vitest run test/unit/palette.test.ts`; by name: `npx vitest run -t "context search"`
- `npm run test:e2e` — Playwright against the dev server (reused if running); specs in `e2e/`, fixture page `test/fixture.html`. Single spec: `npx playwright test e2e/wizard.spec.ts`. `e2e/mobile.spec.ts` runs only in the `mobile` (Pixel 7) project
- `npm run check:vars` — validate `component-variables.manifest.json` against the compiled shadow CSS

## Architecture

`<web-command-palette>` is a framework-agnostic web component. It owns the whole command-palette
state machine and talks to hosts only through properties, events (`cp-*`) and async callbacks
(`searchCallback`, `stepOptionsCallback`). It replaces three drifting implementations (pure-admin
vanilla, svelte-pure-admin, keen-pure-admin LiveComponent). **Top design priority: easy to
configure** — `commands` + `searchCallback` must be a complete setup.

- `src/palette.ts` — `PaletteMachine`, DOM-free. Owns modes (`idle`, `command-list`,
  `command-step`, `context-list`, `context-search`, `global-search`), input routing, the wizard,
  filtering, debounced/abortable provider calls and client-side pagination. Exposes read-only
  view state (`items`, `activeIndex`, `listVersion`, `input`, `lockedLength`, …) and reports
  terminal outcomes through `host.effect()`. Unit-tested directly via `test/unit/helpers.ts`.
- `src/render.ts` — builds the shadow DOM once (`createShell`) and patches it (`Renderer`). Results
  are rebuilt only when `listVersion`/list state changes; moving the active row only toggles a
  class. Markup must match pure-admin-core's `snippets/command-palette.html`.
- `src/keyboard.ts` — the document-level `GlobalKeys` (Ctrl/⌘+K, `g <letter>`) and the input
  keydown map.
- `src/web-component.ts` — thin `BlissElement` subclass: the `static inputs` / `static events`
  tables (CEM metadata is generated from them), the `MachineHost` adapter, overlay/scroll-lock,
  presentation (phone fullscreen sheet), focus. Only the first connected instance owns the global keys.
- `src/filter.ts`, `src/icons.ts`, `src/types.ts` — substring filtering, icon rendering, public types.

### Example pages

These follow the KeenMate examples convention in `../web-editor/EXAMPLES.md`. `index.html` is a
hub that renders cards from a `pages` registry. Each `examples-<feature>.html` uses the shared
skeleton (`.container` → header with `.back-link`, then `.card` sections with numbered `<h2>`s) and
only the classes from `examples-shared.css`, with **no page `<style>`**. Controls sit in
`.controls` and are saved with `persistControls('<page-key>')`. `examples-shared.css`,
`examples-chapter-nav.js`, `examples-copy-link.js` and `examples-controls-store.js` are copied
verbatim from `web-editor`; edit them only to keep them in sync. `e2e/examples.spec.ts` checks
the hub registry and every page.

### CSS pipeline (non-obvious)

`src/css/main.scss` `@use`s pure-admin-core's partials by relative path into `node_modules`
(never copied). `scripts/shadow-css.mjs` compiles it with plain Sass through a Vite plugin
(`shadowCssPlugin`) — Vite's own Sass importer can't be used because it applies package `exports`
to bare `@import`s inside core. The PostCSS step then (1) injects core's theme defaults as
`var()` **fallbacks** rather than declarations, so a host theme on `:root` is never shadowed, and
(2) rewrites `Nrem` → `calc(N * var(--base-rem, 10px))` because pure-admin assumes a 10px root.
`check-variable-manifest.mjs` runs the same pipeline.

## Invariants that are easy to break

See plan §10. These are the bugs that motivated the project.

- Static vs. dynamic: the `/` and `:` lists and non-`search` steps filter client-side. Only global
  search, context search and `search: true` steps call providers, debounced (`searchDebounce`).
- A context search with an empty query must NOT call `searchCallback`; show `labels.typeToSearch`.
  The input keeps a locked `"<shortcut> "` prefix.
- Global search prepends matching commands/contexts (works with no `searchCallback`), then appends
  provider results.
- Keyboard navigation never awaits a provider and must not bump `listVersion`.
- Superseded requests are aborted via `AbortSignal`, and late results are dropped.
- Callback arguments and event details must stay plain JSON, because the LiveView bridge
  serializes them. `searchCallback`/`stepOptionsCallback` are read live. `data-search-event` /
  `data-step-options-event` are reserved for the future `../keen-web-commandpalette` bridge.
- The component closes itself after `cp-select` / `cp-complete` / `cp-command`, and the host
  performs the effect. Instant commands fire only `cp-command`. A `// FUTURE:` note in
  `#onEffect` marks where keep-open/directives would go.
- Icons and strings are data. There is no built-in icon set, and every visible string comes from `labels`.

Out of scope here: the keen bridge, Svelte/React/Razor wrappers, the directive-return channel, and migrating the existing palettes.
