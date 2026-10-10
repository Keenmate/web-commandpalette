# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Status: greenfield

Nothing is implemented yet. Only `package.json` (a starter, not final), `README.md`, and
`IMPLEMENTATION_PLAN.md` exist. **`IMPLEMENTATION_PLAN.md` is the spec and task list.** Read it
before starting work, and follow its milestones (M0–M8) in order: one commit and a green build
per milestone. Ship M1–M4 (element shell, lists and keyboard, wizard steps, async search) before
polishing M5–M8.

The `comment__` field in `package.json` says M0 must align the full devDependency and tool set
(vite, typescript, vitest, @playwright/test, @custom-elements-manifest/analyzer, sass, rimraf…)
by copying `../web-multiselect/package.json`. Remove that comment once it's done.

## Commands (defined in package.json; they work once M0 scaffolding exists)

- `npm run dev`: Vite dev server on port **12300** (the `index.html` playground)
- `npm run build`: clean `dist/`, run `cem analyze`, then the Vite library build (ESM, UMD, `style.css`)
- `npm run build:types`: `tsc`
- `npm run test:unit`: vitest (jsdom). Single file: `npx vitest run test/<file>`. By name: `npx vitest run -t "<name>"`
- `npm run test:unit:watch`: vitest watch mode
- `npm run test:e2e`: Playwright. Single spec: `npx playwright test e2e/<file>`
- `npm run check:vars` / `check:vars:strict`: check the themeable CSS vars against `component-variables.manifest.json`

## What this is

`<web-command-palette>` (package `@keenmate/web-commandpalette`) is a framework-agnostic web
component. It owns the whole command-palette state machine, and hosts talk to it only through
**properties, events, and async callbacks**. It replaces three drifting implementations (the
pure-admin vanilla JS, the svelte-pure-admin Svelte version, and the keen-pure-admin Phoenix
LiveComponent). **Top design priority: easy to configure.** Setting `commands` and
`searchCallback` must be all a host needs to do.

Architecturally it is "`web-multiselect` with more callback surfaces and a mode state machine".
Copy the toolchain and conventions from `../web-multiselect` wholesale (input-def arrays on a
`BlissElement` subclass, `?inline` CSS into an open shadow root, `registerComponent`, cem/web-types
metadata, the `check:vars` script).

## Sibling repos you must read (relative to this repo)

- `../web-multiselect/`: the template. Start with `src/web-component.ts` (element) and `src/multiselect.ts` (logic)
- `../web-components-core/`: `BlissElement`, `inputs` converters, `overlay` (scroll-lock/backdrop), `environment` (device class), `logging`. Read its `CLAUDE.md` and `docs/SPEC.md`. Do not re-implement anything it already provides.
- `../pure-admin/packages/core/src/js/command-palette.js`: **the behavioral source of truth** (keyboard, filtering, scrolling, device logic). When in doubt, match it.
- `../pure-admin/packages/core/snippets/command-palette.html`: the canonical DOM/class structure. Rendered markup must match it exactly.
- `../pure-admin/packages/core/src/scss/core-components/_command-palette.scss`: the CSS, which gets **imported, never copied**
- `../keen-web-multiselect/priv/static/keen_web_multiselect_hook.js`: the async `pushEventTo → {:reply}` bridge pattern that callback shapes must stay compatible with
- `../keen-pure-admin/lib/keen_pure_admin/command_palette/source.ex`: the keen data contract to support

## Planned architecture

- `src/web-component.ts`: a thin element. It reads inputs, owns the shadow root and CSS, and delegates
- `src/palette.ts`: the framework-free **mode state machine**, unit-tested without the DOM. Modes: `idle`, `command-list` (`/`), `command-step` (wizard), `context-list` (`:`), `context-search`, `global-search`
- `src/render.ts`, `keyboard.ts`, `filter.ts`, `icons.ts`, `types.ts`: rendering, keys and `g <letter>` sequences, substring filter, icon rendering, public types
- `src/css/main.scss`: `@import`s pure-admin-core's variables and palette partial (from the `@keenmate/pure-admin-core` devDep), adds `:host` neutral defaults

## Invariants that are easy to get wrong

These are the bugs that motivated the project. See plan §10 for the full rules.

- **Static vs. dynamic filtering:** the `/` command list, the `:` context list, and non-`search` steps filter **client-side** with no provider call. Only global search, context search, and `search: true` steps call providers, debounced by about 150ms.
- **Context search with an empty query must NOT call `searchCallback`.** Show `labels.typeToSearch` and an empty list. The input holds a locked `"<shortcut> "` prefix.
- **Global search** first prepends matching commands and contexts (this works even with no `searchCallback`), then appends the provider's results.
- **Keyboard navigation is pure client-side DOM** and never awaits a provider. Keep the active item `scrollIntoView({block:'nearest'})`.
- **Superseded requests are aborted via `AbortSignal`.** A late result must never overwrite current state.
- **Callback arguments (`scope`, step `ctx`) must be plain JSON** so they can be serialized to LiveView payloads. `searchCallback`/`stepOptionsCallback` must be live-assignable after connect. `data-search-event`/`data-step-options-event` are reserved bridge attributes; the wiring itself belongs to the future `../keen-web-commandpalette` repo.
- **The component closes itself** on `cp-select`/`cp-complete`/`cp-command`, and the host performs the effect. Leave a `// FUTURE:` note at those emit sites for a keep-open or directive channel.
- **Icons and strings are data.** There is no built-in icon set and no host-DOM scraping. Every visible string comes from `labels`, with English defaults.
- **Footer hints are mode-aware.** Do not advertise `Tab`.
- Mount the element once per page. It owns the global `Ctrl/⌘+K` listener and the `g <letter>` sequences.

Out of scope: the keen bridge, Svelte/React/Razor wrappers, the directive-return channel, and migrating the existing palettes.
