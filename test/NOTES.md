# Test infrastructure notes

Running notes from the e2e work. Each entry is something noticed while building
fixtures + specs that looks like a bug, friction point, or worth-revisiting design
decision in the component itself — not a problem with the tests. IDs `CP-n` come
from the cross-repo plan (`web-components-core/docs/e2e-coverage-plan.md`, WP-CP);
a spec that pins a still-open bug is marked `test.fail(true, 'NOTES.md #N')`.

---

## 1. CP-1 — `disconnect()` calls `close()` — DECIDED: intended

**Where:** `src/web-component.ts` `disconnect()` (first line).

Core's lifecycle is build-once + activate/deactivate: a DOM move is
`disconnect()` → `connect()` with no rebuild. The palette closes on disconnect, so a
move while open closes it. **Decision D1 (user, 2026-10-24):** for the command
palette this is the wanted behaviour — it must close *cleanly*: `close` fires once,
focus returns to where it was, and the global hotkeys keep working after the move.

**Test status:** pinned (passing) by `e2e/lifecycle.spec.ts`.

## 2. CP-2 — a rejecting search provider renders as plain "No results"

**Where:** `src/palette.ts` `#run()` → `fail()` (logs `provider failed` on the DATA
logger, then `done(null)`).

**Symptom:** when `searchCallback` / `getStepOptionsCallback` rejects or throws, the
palette shows the local matches (global search) and then the ordinary empty text
("No results found") — indistinguishable from a successful empty search. There is no
host event and no error label; the only signal is a `console.error`
(`[COMMANDPALETTE:DATA] … provider failed`), which prints even with logging at its
default (pinned by `e2e/logging.spec.ts`).

**What works (pinned by `e2e/search-async.spec.ts`):** no uncaught error, the local
matches still render, the palette stays usable (typing again searches again).

**Suggested fix (needs a design decision):** an `errorText` label (e.g. "Search
failed") rendered in place of the empty text, and/or an `error` event / an
`onSearchError` hook with `{ scope, term, error }`. Not pinned as `test.fail` because
the shape of the API is undecided.

## 3. CP-3 — `saveUsageCallback` is ignored unless `loadUsageCallback` is set

**Where:** `src/web-component.ts` `#applyUsage()` — host persistence is chosen only
when `loadUsageCallback` is set; otherwise the core state store (`storage-key`; `localStorage` or `loadStateCallback` / `saveStateCallback`) is used and
`saveUsageCallback` is never called.

**Symptom:** a host that only wants to *mirror* usage to the server (sets
`saveUsageCallback`, keeps localStorage for reading) silently gets nothing.

**Test status:** `e2e/usage-host.spec.ts` pins the current behaviour (localStorage
used, save callback not called). Open question for the user: warn (`console.warn`
once when `saveUsageCallback` is set without `loadUsageCallback`) or document it.

## 4. CP-4 — `open` is reflected but not an input

**Where:** `src/web-component.ts` — `open()` / `close()` toggle the `open` attribute
on the host, but `open` is not in the `INPUTS` table (not observed).

**Symptom:** `<web-command-palette open>` in markup does nothing (and the attribute
then lies: it says open while the palette is closed); `el.setAttribute('open', '')` /
`removeAttribute('open')` don't open/close it either.

**Test status:** `e2e/api.spec.ts` — `test.fail(true, 'NOTES.md #4')`.

**Suggested fix:** an `isOpen`/`open` input (`toBool`, `on: 'none'`) whose setter
calls `open()` / `close()`, guarded against the reflection loop; or stop reflecting
and document `open` as read-only state.

## 5. `page-size` changed while open doesn't re-page the current results — FIXED

**Where:** `src/web-component.ts` `update()` → `'pageSize' in partial` →
`this.#engine.refresh()`; `PaletteEngine.refresh()` (`src/palette.ts`) only rebuilds
the idle home screen and the `/` / `:` lists — not global search, context search or
a step's options.

**Symptom:** open, search "many" (20 hits, "Page 1 of 3"), set `page-size="10"` —
the list stays at 8 per page / "Page 1 of 3" until the next keystroke. The input is
declared `on: 'update'`, so the change is meant to be live.

**Repro:** `e2e/attributes.spec.ts` "page-size changed while open re-pages the
current results" (was `test.fail(true, 'NOTES.md #5')`).

**Fix (2026-10-26):** `update()` calls the new `PaletteEngine.pageSizeChanged()` (alongside
`displayChanged()`), which re-slices the kept full result list with the new size in the
search modes, keeping the first visible row on screen. The e2e spec is green (marker
removed); unit test in `test/unit/palette.test.ts`.

## 6. A `$` pattern in a token's answer garbles its "Remove …" label — FIXED

**Where:** `src/render.ts` `tokensHtml()` — `labels.removeToken.replace('{name}', t.label)`.

**Symptom:** `String.prototype.replace` with a string replacement expands `$&`, `$'`, `` $` ``
and `$$`, so an answer like `R$&D` (an option text, or typed free text) gave the badge's
remove button `aria-label="Remove R{name}D"`.

**Fix (2026-10-26):** uses the same `{name}` placeholder fill as every other label (a
replacer function). Pinned by `e2e/wizard.spec.ts` "tokens display: a "$" pattern in an
answer is kept verbatim in the remove label".
