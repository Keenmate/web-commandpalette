# E2E Test Coverage Checklist

Tracks which features of `web-commandpalette` have end-to-end test coverage in
`e2e/`. Each row is one user-observable feature. Status legend:

- `✗` — no coverage
- `△` — partial coverage (some paths)
- `✓` — covered

When a row is marked `✓`/`△`, the **Spec** column points at the file under
`e2e/` that exercises it, and **Fixture** at the dedicated HTML page under
`test/` (behaviour specs hit no example pages, only fixtures; shared fixture
pieces live in `test/fixture-common.js`). All specs import `test` from
`e2e/fixtures.ts`, which fails any test whose page threw an uncaught error.
Known bugs are in `test/NOTES.md`.

---

## 1. Open / close / basics

| Feature | Status | Spec | Fixture |
| --- | :-: | --- | --- |
| Ctrl+K toggles, focuses the input, `open` / `close` events, `open` attribute | ✓ | `basic.spec.ts` | `basic.html` |
| Home screen: commands + contexts, keycaps | ✓ | `basic.spec.ts` | `basic.html` |
| Esc / backdrop close; focus returns to the opener | ✓ | `basic.spec.ts` | `basic.html` |
| Body scroll lock while open | ✓ | `basic.spec.ts` | `basic.html` |
| `g <letter>` command shortcuts (inert while typing) | ✓ | `basic.spec.ts` | `basic.html` |
| Instant command → `action` + close | ✓ | `basic.spec.ts` | `basic.html` |
| Row click selects, focus stays in the input | ✓ | `basic.spec.ts` | `basic.html` |
| a11y wiring (dialog, combobox, listbox, activedescendant) | ✓ | `basic.spec.ts` | `basic.html` |

## 2. Public API (`el.*` / `el.controller`)

| Feature | Status | Spec | Fixture |
| --- | :-: | --- | --- |
| `openWith(query)` | ✓ | `basic.spec.ts` | `basic.html` |
| `open` / `close` / `toggle` / `isOpen`, one event each; focus restored | ✓ | `api.spec.ts` | `api.html` |
| `reset()` returns home while open | ✓ | `api.spec.ts` | `api.html` |
| `openFavorites()` / `openRecent()` | ✓ | `api.spec.ts` | `api.html` |
| `commands` / `contexts` reassignment + `setCommands` / `setContexts` while open | ✓ | `api.spec.ts` | `api.html` |
| `open` attribute opens/closes (CP-4, `test.fail`) | ✗ | `api.spec.ts` | `api.html` |
| `el.controller` facade, ctx `controller` / `element` | ✓ | `interaction-model.spec.ts` | `interaction-model.html` |

## 3. Keyboard

| Feature | Status | Spec | Fixture |
| --- | :-: | --- | --- |
| ↑↓ wrap, PgUp/PgDn, Home/End | ✓ | `keyboard.spec.ts` | `keyboard.html` |
| ←→ client-side paging at the caret edge | ✓ | `keyboard.spec.ts` | `keyboard.html` |
| Esc / Backspace step back | ✓ | `keyboard.spec.ts` | `keyboard.html` |
| Mode-aware footer hints | ✓ | `keyboard.spec.ts` | `keyboard.html` |
| Tab selects like Enter | ✓ | `keyboard.spec.ts` | `keyboard.html` |
| `open-key` remap / `''` disables | ✓ | `hotkeys.spec.ts` | `hotkeys.html` |
| `favorite-key` / `favorites-key` / `recent-key` remap | ✓ | `hotkeys.spec.ts`, `usage.spec.ts` | `hotkeys.html`, `usage.html` |
| `favorites-hotkey` / `recent-hotkey` sequences (+ `''`, command shortcut wins) | ✓ | `hotkeys.spec.ts`, `usage.spec.ts` | `hotkeys.html`, `usage.html` |

## 4. Search

| Feature | Status | Spec | Fixture |
| --- | :-: | --- | --- |
| Context search: empty query never calls the provider | ✓ | `search.spec.ts` | `search.html` |
| Context search from the home screen; `select` event | ✓ | `search.spec.ts` | `search.html` |
| Global search: local matches with no `searchCallback` | ✓ | `search.spec.ts` | `search.html` |
| Global search: local first, then provider hits (debounced) | ✓ | `search.spec.ts` | `search.html` |
| List modes filter client-side | ✓ | `search.spec.ts` | `search.html` |
| Race: superseded request aborted, late result dropped; close aborts | ✓ | `search-async.spec.ts` | `search-async.html` |
| Rejecting / throwing provider → usable palette (CP-2: no error UI) | ✓ | `search-async.spec.ts` | `search-async.html` |
| Loader / `results--loading` while pending | ✓ | `search-async.spec.ts` | `search-async.html` |
| `search-debounce` (0 vs 500, superseded during debounce) | ✓ | `search-async.spec.ts` | `search-async.html` |
| Per-context `searchCallback` / per-step `getOptionsCallback` override | ✓ | `providers.spec.ts` | `providers.html` |
| Aliases (`/d `, `:p `; no space → filter only) | ✓ | `search.spec.ts` | `search.html` |

## 5. Wizard (command steps)

| Feature | Status | Spec | Fixture |
| --- | :-: | --- | --- |
| Static / live / free-text steps → `action` selections | ✓ | `wizard.spec.ts` | `wizard.html` |
| Locked inline prefix | ✓ | `wizard.spec.ts` | `wizard.html` |
| `display="tokens"` (+ remove label keeps `$` patterns verbatim, NOTES #6) | ✓ | `wizard.spec.ts` | `wizard.html` |
| `getIsVisibleCallback` skips / keeps a step | ✓ | `wizard.spec.ts` | `wizard-branching.html` |
| Option with its own `steps` forks the wizard | ✓ | `wizard.spec.ts` | `wizard-branching.html` |

## 6. Confirmation

| Feature | Status | Spec | Fixture |
| --- | :-: | --- | --- |
| ✓ Done line, `action` first, `close` after | ✓ | `confirmation.spec.ts` | `confirmation.html` |
| Any key dismisses; Ctrl+K opens fresh | ✓ | `confirmation.spec.ts` | `confirmation.html` |
| `show-feedback="false"` | ✓ | `confirmation.spec.ts` | `confirmation.html` |
| `renderFeedbackCallback` custom / `false` | ✓ | `confirmation.spec.ts` | `confirmation.html` |
| `feedback-duration` (`0` + custom) | ✓ | `confirmation.spec.ts` | `confirmation.html` |
| Select: none by default, custom render when the callback returns content | ✓ | `confirmation.spec.ts` | `confirmation.html` |

## 7. Favorites / recents (usage)

| Feature | Status | Spec | Fixture |
| --- | :-: | --- | --- |
| Recent persisted; Enter, Enter replays | ✓ | `usage.spec.ts` | `usage.html` |
| Replay through a live step-level picker | ✓ | `usage.spec.ts` | `usage.html` |
| Ctrl+D / star toggle favorites | ✓ | `usage.spec.ts` | `usage.html` |
| `usage-storage="none"` | ✓ | `usage.spec.ts` | `usage.html` |
| Ctrl+F / Ctrl+R full lists | ✓ | `usage.spec.ts` | `usage.html` |
| `favorites-limit` / `recent-limit` (`1` → "+N", `0` hides) | ✓ | `usage-limits.spec.ts` | `usage-limits.html` |
| `usage-key` isolation + live switch | ✓ | `usage-limits.spec.ts` | `usage-limits.html` |
| `loadUsageCallback` (async) / `saveUsageCallback({ entry })`; save-without-load (CP-3, current behaviour) | ✓ | `usage-host.spec.ts` | `usage-host.html` |

## 8. Interaction model (core `/actions`)

| Feature | Status | Spec | Fixture |
| --- | :-: | --- | --- |
| Events + `on*` twins, bubbling, not composed | ✓ | `interaction-model.spec.ts` | `interaction-model.html` |
| `beforeActionCallback` / `beforeSelectCallback` veto (sync + async) | ✓ | `interaction-model.spec.ts` | `interaction-model.html` |
| `isVisible` / `isDisabled` / `isDanger` / `tooltip` / `cssClass` | ✓ | `interaction-model.spec.ts` | `interaction-model.html` |

## 9. Attributes / config

| Feature | Status | Spec | Fixture |
| --- | :-: | --- | --- |
| `size` presets | ✓ | `theming.spec.ts` | `theming.html` |
| `page-size` (+ live change while open re-pages, NOTES #5 fixed) | ✓ | `attributes.spec.ts` | `attributes.html` |
| Attribute removal resets to default (`page-size`, `display`, `size`, `usage-storage`) | ✓ | `attributes.spec.ts` | `attributes.html` |
| `labels` (custom, English fallback, live reassignment) | ✓ | `labels.spec.ts` | `labels.html` |
| Result `group` headings (first-appearance order) | ✓ | `groups.spec.ts` | `groups.html` |
| Multiple instances: hotkey ownership + hand-over | ✓ | `multi-instance.spec.ts` | `multi-instance.html` |
| DOM move while open closes cleanly (D1 / CP-1); no rebuild | ✓ | `lifecycle.spec.ts` | `lifecycle.html` |
| Logging: silent by default (warnings too), errors still print, `enableLogging()` | ✓ | `logging.spec.ts` | `logging.html` |

## 10. Presentation / theming / RTL

| Feature | Status | Spec | Fixture |
| --- | :-: | --- | --- |
| Phone: fullscreen sheet + close button | ✓ | `mobile.spec.ts` | `mobile.html` |
| `mobile-presentation="floating"` on a phone | ✓ | `mobile.spec.ts` | `mobile.html` |
| `mobile-presentation="fullscreen"` on desktop (+ live switch, ctx flags) | ✓ | `presentation.spec.ts` | `presentation.html` |
| `--cp-*` fallbacks, host theme pierces the shadow DOM | ✓ | `theming.spec.ts` | `theming.html` |
| Per-instance themes (`--base-*`, `::part()`), `--base-rem` | ✓ | `theming.spec.ts` | `theming.html` |
| base-css-variables 2.0 tokens, named icons | ✓ | `theming.spec.ts` | `theming.html` |
| Theme context (page signals, per-instance override) | ✓ | `theme-context.spec.ts` | `theme-context.html` |
| `data-theme="dark"` on the host | ✓ | `theme-context.spec.ts` | `theme-context.html` |
| RTL layout, paging, confirmation | ✓ | `rtl.spec.ts` | `rtl.html` |

## 11. Example site (smoke only)

| Feature | Status | Spec | Fixture |
| --- | :-: | --- | --- |
| Hub cards + version badge | ✓ | `examples.spec.ts` | `index.html` |
| Every example page loads without errors; palette opens | ✓ | `examples.spec.ts` | `examples-*.html` |
| Example controls persist across reload | ✓ | `examples.spec.ts` | `examples-commands-steps.html` |
