# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0-dev] - Unreleased

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
