# `@keenmate/web-commandpalette` — Implementation Plan

> **Audience:** the engineer (a Claude instance) implementing this repo from scratch.
> **Status:** greenfield. Nothing is built yet. This document is the spec + the task list.
> **Author of this plan:** a sibling Claude that just spent a long session fixing the
> *same command-palette bugs three times* across pure-admin, keen-pure-admin, and
> svelte-pure-admin. That pain is the entire reason this component exists — read the
> "Why" section so you share the motivation, then follow the milestones.

---

## 0. TL;DR

Build a **framework-agnostic command-palette web component** (`<web-command-palette>`,
package `@keenmate/web-commandpalette`) that owns the *entire* palette machine — modes,
multi-step command wizards, scoped/global search, keyboard nav, client-side filtering,
the mobile sheet, focus/scroll-lock — and talks to the host **only** through properties,
events, and async callbacks. Hosts (vanilla pure-admin, keen/Phoenix, svelte, later
react/razor) become thin adapters instead of re-implementing ~1000 lines of logic each.

It is architecturally **"`web-multiselect` with more callback surfaces + a mode state
machine."** The hard part (async data from a LiveView server) is **already solved** by
`../keen-web-multiselect` — copy that pattern exactly.

---

## 1. Why this exists (read this — it sets every design priority)

There are currently **three** full implementations of this palette:

- `../pure-admin/packages/core/src/js/command-palette.js` — vanilla JS, ~1220 lines, DOM-driven.
- `../svelte-pure-admin/packages/svelte-pure-admin/src/lib/navigation/CommandPalette.svelte` — Svelte 5.
- `../keen-pure-admin/lib/keen_pure_admin/command_palette/` — Phoenix LiveComponent (`live.ex` state machine + `components/command_palette.ex` markup + `lib/assets/js/hooks/command_palette.js` hook + a `PureAdmin.CommandPalette.Source` behaviour).

They **constantly drift**. A single session produced all of these divergence bugs, each
needing a fix in 2–3 places: navigation latency, static-vs-dynamic filtering, global-search
not surfacing commands, footer-hint mismatches, the `:prefix` not showing, missing
"Type to search X", step-back parity, icon rendering. **The state machine is identical in
intent everywhere; only the DATA and the ACTIONS differ.** That is the textbook signal to
extract a component.

**The #1 product goal (from the project owner): the component must be EASY to configure and
use.** Favor a tiny, obvious API over cleverness. When in doubt, make the common case
(a list of commands + a search callback) a three-line setup.

This is also the first concrete step of an already-planned "generic-UI migration" (palette,
toast, etc. move into reusable web components), and it follows the proven KM pattern used by
`web-multiselect`, `web-daterangepicker`, `web-dropzone`, `web-treeview`.

---

## 2. Study these BEFORE writing code (in order)

1. **`../web-multiselect/`** — the component you are mirroring. Especially:
   - `src/web-component.ts` — `class MultiSelectElement extends BlissElement`, the **input-def
     array** (`{ configKey, converter, on, type, description }`), `attachShadow`,
     `import styles from './css/main.css?inline'`, `customElements.define`.
   - `src/multiselect.ts` — the core logic class (view/controller split from the element).
   - `package.json`, `vite.config.ts`, `custom-elements-manifest.config.mjs`, `THEMING.md`,
     `component-variables.manifest.json` — copy this toolchain wholesale.
2. **`../keen-web-multiselect/priv/static/keen_web_multiselect_hook.js`** — **the async bridge
   you will reproduce for keen later.** Read the `data-search-event` block and the
   `el.searchCallback = (query, signal) => new Promise(resolve => this.pushEventTo(el, ev,
   {id, query}, reply => resolve(reply.results)))` pattern, plus `handleEvent("...:update")`
   and `el.pushToServer(event, payload, onReply)`. This proves the server-driven-async model.
   (You are NOT building the keen bridge in this repo — that's `../keen-web-commandpalette`
   later — but your element API must be *shaped* so that bridge is trivial.)
3. **`../web-components-core/`** — shared base. Use:
   - `BlissElement` (reactive element base), `define`, `registerComponent`, the `inputs`
     converters (`toBool`, `toObjectArray`, `toFunction`, `toText`, `toEnum`…), `dispatch`.
   - `overlay` — body scroll-lock + backdrop (DO NOT re-implement these).
   - `environment` — device/viewport classification + the observe tunnel (for the mobile
     fullscreen sheet decision; narrow desktop ≠ phone).
   - Read `web-components-core/CLAUDE.md` and `docs/SPEC.md`.
4. **The three existing palette implementations** (sources of truth for behavior):
   - Vanilla machine + the exact keyboard/filtering/scroll logic:
     `../pure-admin/packages/core/src/js/command-palette.js`.
   - Keen's data contract (the `Source` behaviour) you must support:
     `../keen-pure-admin/lib/keen_pure_admin/command_palette/source.ex`.
   - Svelte's component for a second reading of the same machine:
     `../svelte-pure-admin/packages/svelte-pure-admin/src/lib/navigation/CommandPalette.svelte`.
5. **The CSS single-source:**
   `../pure-admin/packages/core/src/scss/core-components/_command-palette.scss` (795 lines)
   + its variables in `../pure-admin/packages/core/src/scss/variables/_components.scss`.
   + the canonical markup in `../pure-admin/packages/core/snippets/command-palette.html`.

---

## 3. Tech stack & conventions (mirror `web-multiselect`)

- **Language:** TypeScript, ESM, `"type": "module"`.
- **Build:** Vite library build → `dist/` (`web-commandpalette.js` ESM + `.umd.js` + `style.css`
  + `index.d.ts`). `tsc` for types.
- **Base class:** `BlissElement` from `@keenmate/web-components-core` (peer + dev dep). Declare
  inputs via the same input-def array convention. Register via `registerComponent` so it lands
  on `window.components`.
- **Shadow DOM:** `attachShadow({ mode: 'open' })`. Inject the compiled palette CSS with
  Vite's `?inline` import into a `<style>` / `adoptedStyleSheets`.
- **Tag name:** `web-command-palette`. (Custom-element names need a hyphen; this reads best and
  stays consistent with `web-multiselect`. The CSS block is `.pa-command-palette` — that's a
  class, different namespace, no conflict.)
- **IDE metadata:** `cem analyze` → `custom-elements.json`; generate `web-types.json`,
  `vscode.html-custom-data.json`, `vscode.css-custom-data.json` (copy multiselect's config).
- **Theming manifest:** `component-variables.manifest.json` + `THEMING.md` listing every
  themeable CSS variable, with a `check:vars` script (copy multiselect's
  `scripts/check-variable-manifest.mjs`).
- **Testing:** `vitest` (unit, jsdom) + `@playwright/test` (e2e against `index.html` examples).
- **Dev server:** `vite --port 12300` (multiselect uses 12200; pick an unused port).
- **Logging:** reuse the `logging` helper from web-components-core (namespaced logger).

---

## 4. Directory layout (target)

```
web-commandpalette/
├── IMPLEMENTATION_PLAN.md        ← this file
├── README.md
├── package.json
├── tsconfig.json  vite.config.ts  vitest.config.ts  playwright.config.ts
├── custom-elements-manifest.config.mjs
├── component-variables.manifest.json
├── THEMING.md  BUILD.md
├── index.html                    ← dev playground
├── examples-basic.html
├── examples-commands-steps.html
├── examples-async-search.html
├── examples-theming.html
├── scripts/check-variable-manifest.mjs
├── src/
│   ├── index.ts                  ← public exports (element + types)
│   ├── web-component.ts          ← <web-command-palette> element: inputs, shadow, CSS, wiring
│   ├── palette.ts                ← the MACHINE (modes/state/transitions) — framework-free class
│   ├── keyboard.ts               ← key handling + the "g <letter>" leading-key sequences
│   ├── render.ts                 ← builds the results/home/footer DOM (or lit-html; see §11)
│   ├── filter.ts                 ← client-side static filtering (substring match)
│   ├── types.ts                  ← Command/Context/Step/Option/Result/Labels interfaces
│   ├── icons.ts                  ← render an item icon (SVG string | emoji | data-name)
│   └── css/
│       ├── main.scss             ← @imports core variables + the palette partial (single source)
│       └── (compiled main.css via vite)
├── test/                         ← vitest unit specs
└── e2e/                          ← playwright specs
```

Keep the **element** (`web-component.ts`) thin: it reads inputs, owns the shadow root + CSS,
and delegates to **`palette.ts`** (the machine) + **`render.ts`**. This mirrors multiselect's
`web-component.ts` (element) vs `multiselect.ts` (logic) split and keeps the machine
unit-testable without the DOM.

---

## 5. Element API surface (design for "easy to configure")

### Tag
`<web-command-palette>` — mount **once** per page (it owns the global `Ctrl/⌘+K` listener and
the `g <letter>` sequences).

### Properties (set in JS; the primary configuration surface)

| Property | Type | Notes |
|---|---|---|
| `commands` | `Command[]` | Static list. Shown on the home screen + under `/`. |
| `contexts` | `Context[]` | Static list. Shown on the home screen + under `:`. |
| `searchCallback` | `(scope, query, signal) => Result[] \| Promise<Result[]>` | Scoped + global search. `scope` is `'global'` or `{ contextId }`. Called ONLY for non-empty queries (see §10). |
| `stepOptionsCallback` | `(ctx, signal) => Option[] \| Promise<Option[]>` | Options for a command step, where `ctx = { commandId, stepId, query, selections }`. For a **static** step the full list is fetched once on entry and filtered client-side; a step marked `search: true` calls this per (debounced) keystroke. |
| `labels` | `Partial<Labels>` | All UI strings (see §12). i18n is the host's job. |
| `display` | `'inline' \| 'tokens'` | Step display style. Default `'inline'`. |
| `size` | `'sm' \| 'lg' \| 'xl' \| null` | Width/height preset (CSS). `null` = default. |
| `pageSize` | `number` | Search results per page. Default `8`. |
| `openKey` | `string` | Default `'k'` (with Ctrl/Meta). Set `''` to disable the global hotkey. |

### Attributes (declarative; for markup/HEEx hosts)

Primitive props reflect to attributes: `open` (reflects state), `display`, `size`, `page-size`,
`open-key`. Plus **bridge opt-ins** the keen hook will use (see §9):
`data-search-event`, `data-step-options-event`. Objects/functions (`commands`, `contexts`,
callbacks, `labels`) are **properties only** — hosts set them in JS / via their hook.

### Methods

`open()`, `close()`, `toggle()`, `reset()`. Plus imperative hooks for fully server-driven hosts
(used by the keen bridge): `setCommands(list)`, `setContexts(list)` (same as the setters).
Do **not** add a `setResults()` unless a host needs to push results outside the callback flow —
prefer the callback path.

### Events (dispatched on the element; `bubbles: true, composed: true`)

| Event | `detail` | When |
|---|---|---|
| `cp-open` / `cp-close` | `{}` | Palette opened / closed. |
| `cp-select` | `{ item, scope }` | A search result (context or global) was chosen. Host performs the effect (navigate, etc.). |
| `cp-complete` | `{ commandId, selections }` | A command wizard finished. Host performs the effect. |
| `cp-command` | `{ commandId }` | A command with **no steps** was chosen (instant command). (May fold into `cp-complete` with empty `selections` — your call; document it.) |
| `cp-ready` | `{}` | Element connected + first render done. |

**Default effect policy (per owner decision #2 — keep the component free of app-navigation
semantics):** on `cp-select` / `cp-complete` / `cp-command`, the component **closes itself**,
and the host does the navigation/toast in its event handler. No "directive returned to the
component" round-trip in v1. (A future `preventDefault()`-to-keep-open or a reply-directive
channel can be added later; leave a short `// FUTURE:` note where you emit these so it's easy.)

---

## 6. Data shapes (`src/types.ts`)

```ts
export type IconInput = string; // SVG markup, OR a leading-letter name, OR an emoji glyph. See §13.

export interface Command {
  id: string;
  shortcut: string;              // e.g. "/go"
  name: string;
  aliases?: string[];
  hotkey?: string;               // e.g. "g g" (leading-key sequence) or "Ctrl+K" (chord)
  description?: string;
  icon?: IconInput;
  steps?: Step[];                // absent/empty = instant command (fires cp-command)
}

export interface Step {
  id: string;
  prompt?: string;               // inline connective text, e.g. " in "
  placeholder?: string;
  freeText?: boolean;            // allow submitting typed text when nothing matches
  search?: boolean;              // TRUE = live async (per-keystroke stepOptionsCallback);
                                 // FALSE/absent = static (fetched once, filtered client-side)
}

export interface Context {
  id: string;
  shortcut: string;              // e.g. ":products" (alias ":p")
  name: string;
  aliases?: string[];
  description?: string;
  icon?: IconInput;
}

export interface Option {        // a command-step option
  id?: string;
  label: string;
  value?: unknown;
  description?: string;
  icon?: IconInput;
}

export interface Result {        // a search hit (context or global)
  id: string;
  title: string;
  subtitle?: string;
  icon?: IconInput;
  badge?: string;
  badgeVariant?: 'primary'|'success'|'warning'|'danger'|'info'|'secondary';
  href?: string;                 // host may use it in cp-select
  [k: string]: unknown;          // pass-through for the host's cp-select handler
}

export type Scope = 'global' | { contextId: string };

export interface Labels {
  placeholder: string;           // idle input placeholder
  emptyText: string;             // "No results found"
  searching: string;             // loader text
  searchingIn: string;           // badge; supports {name}
  typeToSearch: string;          // empty-context prompt; supports {name}
  commands: string;              // home heading
  search: string;                // home heading (contexts)
  navigate: string; select: string; back: string; close: string; pages: string;
}
```

---

## 7. The async provider protocol (copy `keen-web-multiselect` exactly)

The component is **async-native**: every data provider returns a value **or a Promise**, and the
component `await`s it and ignores where it came from.

```ts
// global or context search
el.searchCallback = async (scope, query, signal) => {
  // local JS, a fetch, or (in keen) a LiveView round-trip — the element doesn't care
  return results;
};

// command-step options
el.stepOptionsCallback = async ({ commandId, stepId, query, selections }, signal) => {
  return options;
};
```

**AbortSignal:** when a newer query supersedes an in-flight one, abort the old — a late result
must never overwrite live state. Honor `signal.aborted` and `signal.addEventListener('abort', …)`
exactly like `multiselect.ts` does in its `searchCallback` invocation.

**How the keen bridge (future repo) wires these** — your API must make this trivial. The keen
hook will do, for a `data-search-event="cp:search"` element:

```js
el.searchCallback = (scope, query, signal) => new Promise((resolve) => {
  if (signal?.aborted) return resolve([]);
  let aborted = false;
  signal?.addEventListener('abort', () => { aborted = true; resolve([]); }, { once: true });
  this.pushEventTo(el, 'cp:search', { id: el.id, scope, query }, (reply) => {
    if (!aborted) resolve((reply && reply.results) || []);
  });
});
```

The keen server's `handle_event("cp:search", %{scope, query}, socket)` just calls the existing
`Source.search/2` and returns `{:reply, %{results: list}, socket}`. **Keen's `Source` behaviour
survives almost verbatim** — only the reimplemented state machine in `live.ex` disappears. Same
for `stepOptionsCallback` ↔ `data-step-options-event` ↔ `Source.step_options/4`. **Design the
callback argument shapes (`scope`, the step `ctx` object) to serialize cleanly to a LiveView
payload** (plain JSON — no functions, no class instances).

---

## 8. (moved) — see §7.

---

## 9. Bridge opt-ins (shape now, implement in the keen repo later)

Support two `data-*` attributes whose presence makes the element install a `{:reply}`-backed
callback itself (so HEEx stays declarative and the host never writes the Promise glue):

- `data-search-event="<lv-event>"` → installs `searchCallback` via `pushEventTo … reply`.
- `data-step-options-event="<lv-event>"` → installs `stepOptionsCallback` the same way.

In THIS repo, you only need to (a) leave these attributes documented/reserved and (b) make sure
`searchCallback`/`stepOptionsCallback` are plain overridable properties. The actual `pushEventTo`
wiring lives in `../keen-web-commandpalette` (a later repo) — but verify your element lets an
external script assign those properties after `connectedCallback` and re-reads them live.

---

## 10. The state machine (the heart — port from `command-palette.js`)

**Modes:** `idle` (home) · `command-list` (`/`) · `command-step` (wizard) · `context-list` (`:`)
· `context-search` (scoped) · `global-search` (free text).

**Input routing** (on every input event, after the client-filter short-circuit below):
- value starts with `/` → command flow (`handle command input`)
- value starts with `:` → context flow
- value is empty → `idle`
- else → global search

**Filtering split (THIS is the perf contract — it was just built into keen; bake it in here):**
- **Static, client-side (NO provider call):** the command list (`/`), the context list (`:`),
  and a **static** command step (`search` falsy). The full candidate set is already in memory
  (commands/contexts) or fetched once on step entry; filter by **substring match** over
  `name + shortcut + aliases + label + value + description` (lower-cased). Zero latency.
- **Dynamic, via provider (debounced ~150ms):** `global-search`, `context-search`, and a step
  marked `search: true`. Call `searchCallback` / `stepOptionsCallback`.

**Context-search entry (get this right — it's the bug that triggered this whole initiative):**
- On entering a context (from the home screen, from `:p`, or `:p <query>`): set the input to
  `"<shortcut> "` (e.g. `":p "`) as a **locked prefix**, show the `Searching in {name}` badge.
- **Empty query → DO NOT call the provider.** Show `typeToSearch` ("Type to search products")
  and an empty list. Core does exactly this; keen's bug was calling search on the empty query
  and dumping "top products".
- Non-empty query (after the locked prefix) → debounced `searchCallback({contextId}, q)`.

**Global search:** prepend any command/context whose `name/shortcut/aliases` match the query
(mirrors core's `global_matches`), THEN append `searchCallback('global', q)` results. A bare
query like "go" must surface the "Go to Page" command even with no `searchCallback`.

**Command step (wizard):**
- Inline display: input shows the accumulated sentence (`/assign iPad Air to `) with everything
  before the current editable portion **locked**; `display: 'tokens'` shows prior picks as badges
  above the input and clears the input each step.
- Enter/click on an option → record selection → advance to next applicable step (respect a
  `shouldShow(selections)` predicate if present) → last step fires `cp-complete`.
- `freeText` step: Enter with no match submits the typed text as the selection.

**Keyboard map (all three impls agree on this — replicate precisely):**
- `Ctrl/⌘ + K` → toggle.
- `g <letter>` → leading-key command sequences (modifier-free; inert while typing or while the
  palette is open; 1200ms window). Resolve the 2nd key against each command's `hotkey` last
  token. (Chosen over `Alt+<letter>`, which on macOS types glyphs — `Option+G` = `©`.)
- `↑ ↓` → move active item (WRAP). `PgUp/PgDn` → ±`PAGE_STEP` (=8), CLAMP. `Home/End` → ends.
  **Navigation is pure client-side DOM** — never round-trip (keen's old ~230ms/press bug).
- `Enter` / `Tab` → select active (or submit free text).
- `Esc` → **step back** in `command-step`/`context-search` (to prev step / command-list /
  context-list), else **close**.
- `Backspace` → when the editable text is empty (cursor at the locked prefix), **step back**;
  otherwise normal delete.
- `← →` → paginate in search modes (when there is more than one page) and the caret is at the
  input edge.
- Keep the active item **scrolled into view** (`scrollIntoView({ block: 'nearest' })`) on every
  move and when a new list renders (active resets to index 0).

**Footer hints are mode-aware** (don't show a static row): `↑↓ Navigate` always; `←→ Pages` only
in a paginated search mode; `↵ Select` always; `⌫ Back` only in `command-step`/`context-search`;
`Esc` reads *Back* in those modes else *Close*. Don't advertise `Tab` (it works as select; core
doesn't list it).

> There is a complete, battle-tested reference for every one of these behaviors in
> `command-palette.js`. When in doubt, match it. Write unit tests against the machine
> (`palette.ts`) for each transition.

---

## 11. HTML structure & CSS (single-source from core)

### Canonical DOM (render this inside the shadow root)

```html
<div class="pa-command-palette pa-command-palette--active">   <!-- --active while open -->
  <div class="pa-command-palette__backdrop"></div>
  <div class="pa-command-palette__container">
    <div class="pa-command-palette__search">
      <div class="pa-command-palette__tokens"><!-- tokens-mode badges --></div>
      <div class="pa-command-palette__input-wrapper">
        <input class="pa-command-palette__input" autocomplete="off" spellcheck="false">
        <div class="pa-command-palette__context pa-command-palette__context--visible">
          Searching in Products                         <!-- only in step/context-search -->
        </div>
      </div>
    </div>
    <div class="pa-command-palette__results">
      <!-- idle home -->
      <div class="pa-command-palette__home">
        <div class="pa-command-palette__home-section">
          <div class="pa-command-palette__home-heading">Commands</div>
          <div class="pa-command-palette__item pa-command-palette__item--active" data-index="0">
            <div class="pa-command-palette__item-icon"><!-- svg/emoji --></div>
            <div class="pa-command-palette__item-content">
              <div class="pa-command-palette__item-title">Go to Page</div>
              <div class="pa-command-palette__item-meta">Navigate to a page</div>
            </div>
            <div class="pa-command-palette__shortcut">
              <span class="pa-command-palette__key">g</span>
              <span class="pa-command-palette__key">g</span>
            </div>
          </div>
        </div>
        <!-- second home-section for contexts, heading = labels.search -->
      </div>
      <!-- OR results list: .pa-command-palette__item with optional .pa-badge / __shortcut -->
      <!-- OR empty:  <div class="pa-command-palette__empty">Type to search products</div> -->
      <!-- OR loader: <div class="pa-command-palette__loader"><div class="pa-spinner pa-spinner--sm pa-spinner--primary"></div><span>Searching...</span></div> -->
      <!-- pagination: <div class="pa-command-palette__pagination">Page 1 of 3 (24)</div> -->
    </div>
    <div class="pa-command-palette__footer">
      <div class="pa-command-palette__hint"><span class="pa-command-palette__key">↑↓</span><span>Navigate</span></div>
      <!-- …mode-aware hints… -->
    </div>
  </div>
</div>
```

The authoritative class list + structure prose is in
`../pure-admin/packages/core/snippets/command-palette.html`. Match it exactly (wrappers validate
against core; this component becomes the new reference, so it MUST agree with that snippet).

### CSS — genuine single-source from core (do NOT fork)

- Create `src/css/main.scss` that compiles **core's own partial**:
  ```scss
  @import '@keenmate/pure-admin-core/src/scss/variables/index';
  @import '@keenmate/pure-admin-core/src/scss/core-components/command-palette';
  // (pull in only the minimal deps the palette needs: the base reset bits it relies on,
  //  spinner/badge if you want them self-contained, icon sizing. Keep it lean.)
  ```
  Add `@keenmate/pure-admin-core` as a dev dependency so the SCSS resolves. Vite compiles it;
  `?inline` injects it into the shadow root. **When core's palette SCSS changes, a rebuild
  re-pulls it — that's the single-source win.** (If pulling the whole variables/index is too
  heavy, compile a trimmed entry, but keep the palette partial itself imported from core, never
  copy-pasted.)
- **Theming:** the palette's themeable tokens are CSS custom properties (`--pa-command-palette-*`,
  and the shared `--pa-*`/`--base-*` surfaces). Custom properties **pierce shadow DOM**, so a host
  theme that sets them on `:root` reaches the component with no extra work. For **unthemed** usage,
  emit a neutral default set on `:host` inside the shadow root (mirror how
  `../pure-admin/.../main.scss` emits `:root` defaults for the standalone bundle). Document every
  themeable var in `component-variables.manifest.json` + `THEMING.md` and gate it with
  `check:vars` (copy multiselect's script). Expose the size presets
  (`--sm/--lg/--xl` → `--pa-command-palette-width` / `-results-max-height`) via the `size` prop.
- **Mobile sheet:** reuse `web-components-core`'s `overlay` (body scroll-lock, keyboard-inset) and
  `environment` (device class). On a touch phone, add `pa-command-palette--fullscreen` and lock
  scroll; float everywhere else. (Core's `command-palette.js` has the exact device logic —
  capability-first, not width-first.)

---

## 12. Icons & i18n = data (per owner decision #3)

- **Icons** arrive on each command/context/option/result as `icon`. The component renders:
  SVG markup string → injected raw; a leading-ASCII-letter string → treat as a name the host
  mapped (render into a `<span class="pa-icon pa-icon--NAME">` or similar — but prefer SVG);
  a non-ASCII-leading string → emoji text. **No host-DOM scraping** (that caused the `🧩`/404
  saga). **No built-in icon set.** The host converts its icon system → an SVG string when it
  builds the data. Keep `icons.ts` tiny and document the contract.
- **i18n**: every visible string comes from `labels` (see §6 `Labels`). Ship English defaults so
  the component is usable with zero config; the host overrides for its locale. `searchingIn` and
  `typeToSearch` take a `{name}` placeholder — do a trivial `String.replace('{name}', …)`.

---

## 13. Milestones / task list (ordered; each should be a commit + green build)

- **M0 — Scaffold.** Copy the `web-multiselect` toolchain (vite/ts/vitest/playwright/cem configs,
  `package.json` scripts, `check:vars` script, `.gitignore`, `tsconfig`). Empty `index.html`
  playground. `web-components-core` as dep. `npm run build` produces an empty-but-valid bundle.
- **M1 — Element shell + open/close + global hotkey.** `web-component.ts` extends `BlissElement`,
  shadow root, CSS injected (even if minimal), `Ctrl/⌘+K` toggles, backdrop + `overlay`
  scroll-lock, `cp-open`/`cp-close`, focus the input on open. `index.html` can open/close it.
- **M2 — Idle home + static command/context lists + client filter + keyboard nav.** `commands`
  / `contexts` properties; home render; `/` and `:` list modes; substring `filter.ts`; `↑↓
  PgUp/PgDn Home/End` nav with scroll-into-view; `g <letter>` sequences; footer hints
  (mode-aware). Unit-test the machine transitions + filter.
- **M3 — Command steps (wizard).** Inline + tokens display, locked prefix, `stepOptionsCallback`
  (static → fetch-once-then-client-filter; `search:true` → debounced), advance/`shouldShow`,
  `freeText`, `cp-complete`/`cp-command`. Step-back (Esc/Backspace).
- **M4 — Context + global search (async).** `searchCallback` with scope; context entry with the
  `:prefix ` lock + `typeToSearch` empty state (NO empty-query call); global-search command/
  context prepend; AbortSignal supersession; pagination (`pageSize`, `←→`, `__pagination`);
  loader state. This closes the divergence bugs for good.
- **M5 — CSS single-source + theming.** `main.scss` imports core's partial; `:host` neutral
  defaults; `size` presets; `component-variables.manifest.json` + `THEMING.md` + `check:vars`.
  Verify a host theme (`:root { --pa-* }`) reaches the shadow DOM.
- **M6 — A11y + mobile sheet.** Focus trap, `role`/`aria-*` on input+listbox+options,
  `aria-activedescendant`, Esc semantics, the fullscreen sheet via `overlay` + `environment`.
- **M7 — IDE metadata + docs.** `cem analyze` → `custom-elements.json`; `web-types.json`;
  `vscode.*-custom-data.json`; `README.md`; `docs/usage.md`, `docs/theming.md`,
  `docs/examples.md`, `docs/accessibility.md` (match multiselect's `files` list).
- **M8 — Examples + e2e.** `examples-basic/commands-steps/async-search/theming.html`; Playwright
  specs covering open, keyboard nav, a full command wizard, a context search (incl. the empty-
  query prompt), and global-search prepend. Vitest for the machine.

> Ship M1–M4 first and get it usable in the pure-admin vanilla demo (the simplest host) before
> polishing M5–M8. The keen + svelte adapters are **separate repos/PRs** — out of scope here,
> but keep validating that your API shapes make them trivial (re-read §7/§9).

---

## 14. Acceptance criteria (v1 "done")

1. A three-line setup works: set `commands`, set `searchCallback`, done — `Ctrl+K` opens a fully
   functional palette.
2. All keyboard behaviors in §10 pass Playwright. Navigation never awaits a provider.
3. Context-search shows `Type to search X` on empty query and only calls `searchCallback` for
   non-empty queries. Global-search surfaces matching commands with no `searchCallback` set.
4. A multi-step command (static step + a `search:true` step + a `freeText` step) completes and
   fires `cp-complete` with the right `selections`.
5. Theming: setting `--pa-*`/`--base-*` on the host `:root` restyles the shadow-DOM palette;
   `check:vars` is green; unthemed usage looks correct via `:host` defaults.
6. DOM matches `core/snippets/command-palette.html`.
7. The element exposes `searchCallback`/`stepOptionsCallback` as live-assignable properties and
   reads `data-search-event`/`data-step-options-event` as reserved bridge hooks (even if the
   wiring itself is implemented later in the keen repo).

---

## 15. Out of scope for v1 (future repos/PRs)

- `../keen-web-commandpalette` — the Phoenix bridge (hook + HEEx helpers + `push_command`/reply),
  reusing `Source` behaviour. Mirror `../keen-web-multiselect`.
- Svelte wrapper in `svelte-pure-admin` (thin `<CommandPalette>` → element, like its multiselect
  wrapper).
- React/Razor adapters.
- Directive-return channel (server tells the component to toast/keep-open). v1 = host acts, component closes.
- Migrating the three existing palettes to consume this (a later, coordinated effort).

---

## 16. References (exact paths)

- Mirror component:        `../web-multiselect/src/web-component.ts`, `src/multiselect.ts`, `package.json`, `vite.config.ts`, `THEMING.md`
- Async bridge template:   `../keen-web-multiselect/priv/static/keen_web_multiselect_hook.js`
- Shared base:             `../web-components-core/src/index.ts` (`BlissElement`, `overlay`, `environment`, `inputs`), `web-components-core/CLAUDE.md`
- Behavior source of truth: `../pure-admin/packages/core/src/js/command-palette.js`
- Keen data contract:      `../keen-pure-admin/lib/keen_pure_admin/command_palette/source.ex`
- Svelte second reading:   `../svelte-pure-admin/packages/svelte-pure-admin/src/lib/navigation/CommandPalette.svelte`
- CSS single-source:       `../pure-admin/packages/core/src/scss/core-components/_command-palette.scss` (+ `variables/_components.scss`)
- Canonical markup:        `../pure-admin/packages/core/snippets/command-palette.html`

---

*Build the machine once. Fix bugs once. Add a framework = write a 100-line adapter, not 1000.*
