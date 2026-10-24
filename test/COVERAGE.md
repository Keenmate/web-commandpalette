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
| `open` / `close` / `toggle` / `isOpen`, one event each | ✗ | | |
| `reset()` returns home while open | ✗ | | |
| `openFavorites()` / `openRecent()` | ✗ | | |
| `commands` / `contexts` reassignment + `setCommands` / `setContexts` while open | ✗ | | |
| `<web-command-palette open>` attribute (CP-4) | ✗ | | |
| `el.controller` facade, ctx `controller` / `element` | ✓ | `interaction-model.spec.ts` | `interaction-model.html` |

## 3. Keyboard

| Feature | Status | Spec | Fixture |
| --- | :-: | --- | --- |
| ↑↓ wrap, PgUp/PgDn, Home/End | ✓ | `keyboard.spec.ts` | `keyboard.html` |
| ←→ client-side paging at the caret edge | ✓ | `keyboard.spec.ts` | `keyboard.html` |
| Esc / Backspace step back | ✓ | `keyboard.spec.ts` | `keyboard.html` |
| Mode-aware footer hints | ✓ | `keyboard.spec.ts` | `keyboard.html` |
| Tab selects like Enter | ✓ | `keyboard.spec.ts` | `keyboard.html` |
| `open-key` remap / `''` disables | ✗ | | |
| `favorite-key` / `favorites-key` / `recent-key` remap | △ | `usage.spec.ts` (`favorites-key=""` only) | `usage.html` |
| `favorites-hotkey` / `recent-hotkey` sequences | △ | `usage.spec.ts` (`g f` only) | `usage.html` |

## 4. Search

| Feature | Status | Spec | Fixture |
| --- | :-: | --- | --- |
| Context search: empty query never calls the provider | ✓ | `search.spec.ts` | `search.html` |
| Context search from the home screen; `select` event | ✓ | `search.spec.ts` | `search.html` |
| Global search: local matches with no `searchCallback` | ✓ | `search.spec.ts` | `search.html` |
| Global search: local first, then provider hits (debounced) | ✓ | `search.spec.ts` | `search.html` |
| List modes filter client-side | ✓ | `search.spec.ts` | `search.html` |
| Race: superseded request aborted, late result dropped | ✗ | | |
| Rejecting provider → usable palette (CP-2) | ✗ | | |
| Loader / `results--loading` while pending | ✗ | | |
| `search-debounce` | ✗ | | |
| Per-context `searchCallback` / per-step `getOptionsCallback` override | △ | `usage.spec.ts` (step-level picker) | `usage.html` |
| Aliases (`/d `, `:p `) | △ | `wizard.spec.ts`, `keyboard.spec.ts` | |

## 5. Wizard (command steps)

| Feature | Status | Spec | Fixture |
| --- | :-: | --- | --- |
| Static / live / free-text steps → `action` selections | ✓ | `wizard.spec.ts` | `wizard.html` |
| Locked inline prefix | ✓ | `wizard.spec.ts` | `wizard.html` |
| `display="tokens"` | ✓ | `wizard.spec.ts` | `wizard.html` |
| `getIsVisibleCallback` skips / keeps a step | ✓ | `wizard.spec.ts` | `wizard-branching.html` |
| Option with its own `steps` forks the wizard | ✓ | `wizard.spec.ts` | `wizard-branching.html` |

## 6. Confirmation

| Feature | Status | Spec | Fixture |
| --- | :-: | --- | --- |
| ✓ Done line, `action` first, `close` after | ✓ | `confirmation.spec.ts` | `confirmation.html` |
| Any key dismisses; Ctrl+K opens fresh | ✓ | `confirmation.spec.ts` | `confirmation.html` |
| `confirmation="false"` | ✓ | `confirmation.spec.ts` | `confirmation.html` |
| `renderConfirmationCallback` custom / `false` | ✓ | `confirmation.spec.ts` | `confirmation.html` |
| `confirmation-duration="0"` | ✗ | | |
| Select confirmation with custom render | ✗ | | |

## 7. Favorites / recents (usage)

| Feature | Status | Spec | Fixture |
| --- | :-: | --- | --- |
| Recent persisted; Enter, Enter replays | ✓ | `usage.spec.ts` | `usage.html` |
| Replay through a live step-level picker | ✓ | `usage.spec.ts` | `usage.html` |
| Ctrl+D / star toggle favorites | ✓ | `usage.spec.ts` | `usage.html` |
| `usage-storage="none"` | ✓ | `usage.spec.ts` | `usage.html` |
| Ctrl+F / Ctrl+R full lists | ✓ | `usage.spec.ts` | `usage.html` |
| `favorites-limit` / `recent-limit` | ✗ | | |
| `usage-key` isolation + live switch | ✗ | | |
| `loadUsageCallback` / `saveUsageCallback` (CP-3) | ✗ | | |

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
| `page-size` (+ live change) | ✗ | | |
| Attribute removal resets to default | ✗ | | |
| `labels` (custom + live reassignment) | ✗ | | |
| Command `group` headings | ✗ | | |
| Multiple instances: hotkey ownership + hand-over | ✗ | | |
| DOM move while open closes cleanly (D1 / CP-1) | ✗ | | |
| Logging silent by default | ✗ | | |

## 10. Presentation / theming / RTL

| Feature | Status | Spec | Fixture |
| --- | :-: | --- | --- |
| Phone: fullscreen sheet + close button | ✓ | `mobile.spec.ts` | `mobile.html` |
| `mobile-presentation="floating"` on a phone | ✓ | `mobile.spec.ts` | `mobile.html` |
| `mobile-presentation="fullscreen"` on desktop | ✗ | | |
| `--cp-*` fallbacks, host theme pierces the shadow DOM | ✓ | `theming.spec.ts` | `theming.html` |
| Per-instance themes (`--base-*`, `::part()`), `--base-rem` | ✓ | `theming.spec.ts` | `theming.html` |
| base-css-variables 2.0 tokens, named icons | ✓ | `theming.spec.ts` | `theming.html` |
| Theme context (page signals, per-instance override) | ✓ | `theme-context.spec.ts` | `theme-context.html` |
| `data-theme="dark"` on the host | ✗ | | |
| RTL layout, paging, confirmation | ✓ | `rtl.spec.ts` | `rtl.html` |

## 11. Example site (smoke only)

| Feature | Status | Spec | Fixture |
| --- | :-: | --- | --- |
| Hub cards + version badge | ✓ | `examples.spec.ts` | `index.html` |
| Every example page loads without errors; palette opens | ✓ | `examples.spec.ts` | `examples-*.html` |
| Example controls persist across reload | ✓ | `examples.spec.ts` | `examples-commands-steps.html` |
