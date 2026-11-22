# Usage

Mount **one** `<web-command-palette>` per page. The first connected instance owns the global
<kbd>Ctrl</kbd>/<kbd>⌘</kbd>+<kbd>K</kbd> listener and the `g <letter>` sequences.

```js
import '@keenmate/web-commandpalette';
```

## How it behaves

What the user types decides the mode:

| You type | Mode | Data source |
|---|---|---|
| *(nothing)* | home: favorites, recent, commands, contexts | in memory |
| `/dep` | command list | in memory, filtered client-side |
| `/deploy ` | command wizard | step `options`, its own `getOptionsCallback`, or `getStepOptionsCallback` (static: once; `isLiveSearch: true`: per keystroke) |
| `:` | context list | in memory, filtered client-side |
| `:p ` | scoped search, input locked to `":products "` | **nothing until you type** — then the context's `searchCallback`, or `searchCallback({ scope: { contextId }, term })` |
| `mac` | global search | matching commands/contexts first (instantly), then `searchCallback({ scope: 'global', term })` |

### Keyboard

| Keys | Where | Does |
|---|---|---|
| <kbd>Ctrl</kbd>/<kbd>⌘</kbd>+<kbd>K</kbd> | anywhere | open / close (`open-key`) |
| <kbd>g</kbd> then a letter | anywhere, not typing, palette closed | run the command with that sequence `shortcut`; `g f` opens favorites |
| <kbd>↑</kbd><kbd>↓</kbd> <kbd>PgUp</kbd><kbd>PgDn</kbd> <kbd>Home</kbd><kbd>End</kbd> | list | move — pure client-side, never waits on a provider |
| <kbd>←</kbd><kbd>→</kbd> | search, caret at the edge | previous / next page (mirrored in RTL) |
| <kbd>Enter</kbd> | list | select; in a replayed run, also accept the remaining remembered answers |
| <kbd>Tab</kbd> / <kbd>Shift</kbd>+<kbd>Tab</kbd> | wizard | accept this step / step back |
| <kbd>Esc</kbd>, <kbd>⌫</kbd> at the locked prefix | wizard, scoped search, full lists | step back; <kbd>Esc</kbd> elsewhere closes |
| <kbd>Ctrl</kbd>/<kbd>⌘</kbd>+<kbd>D</kbd> / <kbd>F</kbd> / <kbd>R</kbd> | palette open | star the active row / all favorites / all recent |

Every key combo goes through core `/actions` (`bindShortcuts` / `matchesShortcut`): a `shortcut` uses core's
syntax — a chord `'Ctrl+K'` / `'Mod+K'` (⌘ on Apple, Ctrl elsewhere) or a sequence `'g d'` (each next key within
core's 1000 ms window). Ctrl/⌘ above is `Mod`: ⌘ on a Mac, Ctrl elsewhere, other modifiers must be up. Keycaps show core's
platform format (`shortcutKeycaps` / `formatShortcut`): `G` `D`, `Ctrl+D`, Apple `⌘D`.

## Callback contexts

Every callback takes **one** `ctx` object. Every ctx and every event detail also carries:

- `controller` — the public facade (the same object as `el.controller`, see [Controller](#controller)),
- `element` — the `<web-command-palette>` host,
- `presentation` (`'floating'` | `'fullscreen'`), `isFullscreen`, `isModal` — how the palette is shown.

`controller` and `element` (and a provider ctx's `signal`) are **non-enumerable**: destructuring
works (`({ term, signal, controller }) => …`), while `JSON.stringify(ctx)` — and so a LiveView
`pushEvent(…, ctx)` — sees only the data. Spreading (`{ ...ctx }`) drops them.

## Properties

Objects and functions are **properties only** — set them from JS (or a framework/LiveView hook).

| Property | Type | Notes |
|---|---|---|
| `commands` | `Command[]` | Home screen + `/`. Core action items — see [Data shapes](#data-shapes). |
| `contexts` | `Context[]` | Home screen + `:`. |
| `searchCallback` | `(ctx: SearchContext) => Result[] \| Promise<Result[]>` | Context + global search. `ctx` is core's shared `SearchCallbackContext` — `{ term, signal, entries }`, the same shape as every Keenmate component (`entries` is always `[]`: the palette has no client-side records behind a search) — plus `scope` (`'global'` or `{ contextId }`) and `controller` / `element`. Called only for **non-empty** terms (as typed, trimmed), debounced; only the latest call's answer lands (core `createAsyncRunner`). The loader shows only while a Promise is pending — a synchronous array applies with no loader. |
| `getStepOptionsCallback` | `({ commandId, stepId, term, selections, signal }) => Option[] \| Promise<Option[]>` | Fallback for steps without their own `getOptionsCallback`. |
| `beforeActionCallback` | `(detail) => unknown` | Runs before a command fires `action` (same detail). `false` (async OK) cancels: no `onClick`, no event, nothing recorded; a wizard steps back to its last answer and the palette stays open. |
| `beforeResultSelectCallback` | `({ result, scope }) => unknown` | Runs before a search result fires `result-select`. `false` (async OK) cancels; the palette stays open. Other return values continue. |
| `loadUsageCallback` | `(ctx) => UsageEntry[] \| Promise<UsageEntry[]>` | Per-entry host API: load favorites/recents from the host (wins over the state store). |
| `saveUsageCallback` | `({ entry }) => void \| Promise<void>` | Upsert one entry (by `entry.key`) on every use / star toggle (with `loadUsageCallback`). |
| `loadStateCallback` | `LoadStateCallback<PaletteUsageState>` | Core state store (SPEC §12.17): `({ key }) => { entries } \| null` (async OK) — the page keeps the whole list. Set both state callbacks; either one alone switches `localStorage` off. |
| `saveStateCallback` | `SaveStateCallback<PaletteUsageState>` | `({ key, state })`, `state` = the WHOLE `{ entries }` on every use / star toggle. |
| `labels` | `Partial<CommandPaletteLabels>` | UI strings (core `/locale`); unset keys fall back to the page-wide labels, then English. Also a JSON attribute (`labels='{"placeholders.idle":"Hledat…"}'`). See [Labels](#labels). |
| `locale` | `string \| null` | BCP-47 locale for the numbers in labels (`{count}` / `{page}` / `{total}`) and `translateCallback`'s `ctx.locale` (attribute `locale`). Unset (default, or `'auto'`) = the page-wide `window.components.locale.locale`, else the browser language. A change re-renders the labels in place. See [Labels](#labels). |
| `display` | `'inline' \| 'tokens'` | Wizard display. Default `inline`. |
| `size` | `'sm' \| 'lg' \| 'xl' \| null` | Width/height preset. |
| `pageSize` | `number` | Search results per page. Default `8`. |
| `openKey` | `string` | Ctrl/⌘ + this key toggles. Default `'k'`; `''` disables. |
| `searchDebounce` | `number` | ms before a provider call. Default `150`. |
| `searchBehavior` | `'normalized' \| 'case-insensitive' \| 'exact'` | Built-in filter + highlight normalization (core search, same as web-multiselect). Default `normalized`: ignores case and diacritics — `ces` finds `Český`. Not applied to the provider callbacks or `regex`. |
| `searchMatch` | `'contains' \| 'equals' \| 'starts-with' \| 'word-starts-with' \| 'ends-with' \| 'word-ends-with' \| 'regex'` | Where the built-in filter looks for the term in each field. Default `contains`. `regex` tests the raw value (an invalid pattern keeps the last valid result). |
| `presentation` | `'auto' \| 'floating' \| 'fullscreen'` | `auto`: fullscreen sheet on touch phones only. |
| `responsive` / `responsiveCallback` | `CommandPaletteResponsiveMap` / `CommandPaletteResponsiveCallback` | Instance responsive rules (core): `{ device?, breakpoint? }` → partial config per device class / width bucket, or `(ctx) => partial`. Beat page rules and the element's own attributes; never reflected. See [README → Responsive rules](../README.md#responsive-rules). |
| `usageStorage` | `'local' \| 'none'` | Favorites + recents on (default) or off. |
| `storageKey` | `string` | Key of the persisted favorites/recents (attribute `storage-key`): `localStorage` `km-state:web-command-palette:<key>`, or `ctx.key` of the state callbacks. Default `'web-commandpalette:usage'` — put the user id in it. |
| `maxFavoriteCount` / `maxRecentCount` | `number` | Rows each home section shows. Default `3`; `0` hides the section. |
| `favoriteKey` / `favoritesKey` / `recentKey` | `string` | Ctrl/⌘ + key while open: star the active row / show all favorites / show all recent. Defaults `d` / `f` / `r`; `''` disables. |
| `renderFeedbackCallback` | `(ctx) => string \| Node \| null \| false` | Custom feedback content: string = HTML, Node = mounted, `null` = built-in, `false` = hidden (skipped). See [Feedback](#feedback). |
| `renderLoadingCallback` | `(ctx) => void \| (() => void)` | Draw the searching loader yourself — `ctx = { component, context: 'search', containerElement, element, label }`; fill `containerElement` (already `role="status"` + `aria-label` = the `messages.searching` text), optionally return a cleanup. Beats the page-wide `window.components.renderLoadingCallback` (one hook for every Keenmate component); unset = the default `.cp__loader` (`--cp-loader-icon` / `-rotate` / `-duration` / `-size` / `-color`, chained to `--base-loader-*`). |
| `renderIconCallback` | `(name, ctx) => string \| null \| undefined` | This palette's own icon hook — map an item `icon` name to markup. `ctx = { component, element, prefix: 'cp', item, kind }` (`item` = the row's own command / context / option / result / usage entry). Asked after a built-in name, before the page-wide `window.components.renderIconCallback`; `null` / `undefined` = not mine. See [Icons](#icons). |
| `translateCallback` | `(ctx) => string \| null \| undefined` | This palette's own translation hook (core `TranslateCallback`). `ctx = { component, key, template, params, locale }`, `key` = the full `web-command-palette.<elementType>.<name>` key, `params` = the raw values. Asked for every label key this palette's `labels` did not set, before the page-wide `window.components.locale.translateCallback`; `null` / `undefined` = not mine. Changing it re-renders every label. See [Labels](#labels). |
| `customStyles` / `getCustomStylesCallback` | `string \| null` / `(ctx) => string \| null \| undefined` | Extra CSS for this palette's shadow root (attribute `custom-styles`), after the component CSS and after the page-wide `window.components['web-command-palette'].customStyles` / `.getCustomStylesCallback`, so the instance wins. The callback wins over `customStyles`. See [Theming → Custom CSS](theming.md#custom-css-shadow-root). |
| `isFeedbackShown` | `boolean` | Show the one-line feedback after a command ran. Default `true` (attribute `show-feedback`). |
| `feedbackDuration` | `number` | How long it stays (ms). Default `1500`; `0` = off. |
| `favoritesHotkey` / `recentHotkey` | `string` | Key sequence (`'g f'`, palette closed) that opens on that list. Defaults `'g f'` / off. |
| `onOpen` / `onClose` / `onResultSelect` / `onAction` / `onReady` | `(detail) => void` | Event twins — see [Events](#events). |
| `controller` *(read-only)* | `CommandPaletteController` | The public facade. |
| `isOpen` | `boolean` | Whether the palette is open (attribute `open`, reflected). Assigning opens / closes it like `open()` / `close()` (the events fire); reading it returns the live state. |

Callbacks are read **live** on every call, so they can be (re)assigned at any time — e.g. by a
LiveView bridge after `connectedCallback`.

## Attributes

`open`, `display`, `size`, `labels` (JSON), `locale`, `page-size`, `open-key`, `search-debounce`, `search-behavior`, `search-match`, `presentation`,
`usage-storage`, `storage-key`, `max-favorite-count`, `max-recent-count`, `favorite-key`, `favorites-key`,
`recent-key`, `favorites-hotkey`, `recent-hotkey`, `show-feedback`, `feedback-duration`, `custom-styles`.
`open` is **reflected** (`open="true"` while open, removed while closed — style with `[open]`; also when the user opens / closes the palette): `<web-command-palette open>` opens
at the first build, `setAttribute('open', '')` / `removeAttribute('open')` open / close it. `open="false"` = closed.
Core (`BlissElement`): `defer` holds the first build until `el.release()`; `ready` is set once built
(see [Lifecycle](#lifecycle)); `responsive` takes a JSON instance rules map (`responsive='{"breakpoint":{"mobile":{"display":"tokens"}}}'`,
keys are configKeys — see [README → Responsive rules](../README.md#responsive-rules)).

Reserved for the Phoenix LiveView bridge (`@keenmate/keen-web-commandpalette`):
`data-search-event`, `data-step-options-event`. Their values are the LiveView event names the
bridge pushes to. The element itself doesn't act on them; the bridge hook reads them and installs
a `{:reply}`-backed `searchCallback` / `getStepOptionsCallback` (it pushes the ctx data:
`{ scope, term }` / `{ commandId, stepId, term, selections }`).

## Controller

`el.controller` (also `controller` on every ctx and detail) is the palette's public facade:

| Member | |
|---|---|
| `isOpen` | Whether the palette is open. |
| `open()` / `close()` / `toggle()` | Open on the home screen / close and reset / either. `close()` is closed at once (`isOpen`, the `open` attribute, focus return, the `close` event); only the exit animation plays after it (instant when motion is off); `open()` during it cancels it. |
| `openWith(term)` | Open pre-filled, e.g. `'/deploy '`, `':products laptop'`, `'mac'`. |
| `reset()` | Back to the home screen (stays open). |
| `commands` / `contexts` | The same properties as on the element (assignable). |
| `openFavorites()` / `openRecent()` | Open on the full favorites / recent list. |

The same methods exist on the element. The element never exposes its own engine; to draw a palette
of your own on the same logic, see [Build your own UI](#build-your-own-ui).

## Lifecycle

The ready / defer / destroy lifecycle comes from web-components-core's `BlissElement`:

- **`ready`** fires once, on the microtask after the first build — a listener added right after
  the `import` / `createElement` still catches it. `el.isReady`, the `ready` attribute /
  `:state(ready)` and `await el.whenReady()` flip at the same moment.
- **`defer`** (attribute; property `shouldDefer`) holds the first build until `el.release()` (or
  removing the attribute) — set up `commands`, callbacks and listeners first, then build once:

  ```html
  <web-command-palette id="palette" defer></web-command-palette>
  <script type="module">
    palette.commands = commands;
    palette.addEventListener('ready', () => console.log('palette ready'));
    palette.release();
  </script>
  ```
- **`destroy()`** tears the element down for good (stops what disconnect stops; later
  reconnects don't rebuild). The palette holds nothing beyond what `disconnect` releases.

## Events

All bubble and are **not** composed. Each has a camelCase twin property (`el.onAction = (detail) => …`)
that is called with the **same detail object** first, then the DOM event fires. Every detail
carries `controller` / `element` (non-enumerable) and the presentation flags.

| Event | Twin | `detail` | When |
|---|---|---|---|
| `open` / `close` | `onOpen` / `onClose` | context only | Opened / closed (`close` also follows every command and selection). |
| `result-select` | `onResultSelect` | `{ result, scope }` | A search result was chosen. Veto with `beforeResultSelectCallback`. |
| `action` | `onAction` | `{ action: 'custom', id, item, source: 'palette', selections, sourceEvent, triggerElement, dataset }` | A command ran — immediately (no `steps`, `selections: []`) or after the wizard's last answer. `id` is the command id, `item` the command. |
| `ready` | `onReady` | context only | First build done — once per element lifetime, fired by core `BlissElement` (see [Lifecycle](#lifecycle)). |

A command is a core action item (`@keenmate/web-components-core/actions`), so running one follows
the shared order: `beforeActionCallback(detail)` (`false` cancels) → the command's
`onClick(detail)` → `onAction` → the `action` event. `sourceEvent` is the keydown / click that ran
it; `triggerElement` the activated row (absent for a `g <letter>` hotkey). The palette has no
built-in actions, so `action` is always `'custom'`: switch on `detail.id`.

```js
palette.addEventListener('action', (e) => {
  if (e.detail.id === 'deploy') deploy(e.detail.selections);
});
palette.beforeActionCallback = async ({ item }) => item.isDanger ? confirm(`Run ${item.text}?`) : undefined;
```

The palette **closes itself** after `result-select` / `action` (after a brief
[feedback line](#feedback) for commands); the host performs the effect (navigate, toast, …).

## Data shapes

All plain JSON (so a server can send them verbatim), except the optional JS-only functions
(`get*Callback`, `onClick`, `Step.getOptionsCallback`, `Context.searchCallback`).

```ts
// A command is a core ActionItem<CommandContext> (isToggled / getIsToggledCallback aren't used).
interface Command {
  id: string;
  trigger: string;           // "/deploy" — the slash token that runs it
  text: string;
  aliases?: string[];        // ["/d"]
  shortcut?: string;         // "g d" — a sequence runs from anywhere while closed; a chord like "Ctrl+K" is display-only
  description?: string;      // the row's second line
  icon?: string;             // see Icons
  steps?: Step[];            // absent/empty → fires `action` at once
  tooltip?: string;          // row tooltip
  cssClass?: string;         // extra row classes
  isVisible?: boolean;       // false → hidden everywhere (lists, search, recents, its `g` hotkey)
  isDisabled?: boolean;      // listed greyed out, doesn't run
  isDanger?: boolean;        // destructive styling
  getTextCallback?(ctx): string;     getIconCallback?(ctx): string;   getTooltipCallback?(ctx): string;
  getClassCallback?(ctx): string | string[];
  getIsVisibleCallback?(ctx): boolean; getIsDisabledCallback?(ctx): boolean;   // ctx = { selections: [] } + context
  onClick?(detail): void | Promise<void>;                                      // the `action` detail
}

interface Step {
  id: string;
  prompt?: string;           // inline connective text, e.g. " to " (default " ")
  placeholder?: string;
  options?: Option[];        // inline static options (no callback needed)
  isLiveSearch?: boolean;    // true → the options provider per debounced keystroke
  isFreeTextAllowed?: boolean; // Enter with no match submits the typed text
  getIsVisibleCallback?: (ctx: { commandId, stepId, selections }) => boolean;  // JS hosts only
  getOptionsCallback?: (ctx: { commandId, stepId, term, selections, signal }) => Option[] | Promise<Option[]>; // JS hosts only
}

interface Context { id: string; trigger: string; text: string; aliases?: string[]; description?: string; icon?: string;
                    searchCallback?: (ctx: SearchContext) => Result[] | Promise<Result[]>; }   // JS hosts only — { scope, term, signal, entries }
interface Option  { id?: string; text: string; value?: unknown; description?: string; icon?: string;
                    steps?: Step[]; }       // branch: asked right after this option is chosen
interface Result  { id: string; title: string; subtitle?: string; icon?: string; badge?: string;
                    badgeVariant?: 'primary'|'success'|'warning'|'danger'|'info'|'secondary'; href?: string;
                    group?: string; [k: string]: unknown; }   // group → section heading

interface Selection { stepId: string; label: string; value: unknown; optionId?: string; isFreeText: boolean; }
```

`Result` keeps `title` / `subtitle` — it's a search record (not an action item) and is stored
verbatim in recents. `Selection.label` is the chosen option's `text` (or the typed text); it's
persisted in recents too, so it keeps its name.

### Step options: static vs live

- **Static** (default): `options` inline, or `getStepOptionsCallback` called **once** on step entry
  with `term: ''`. Typing filters that list in the browser — zero latency, zero round-trips.
- **Live** (`isLiveSearch: true`): `getStepOptionsCallback` per debounced keystroke. Use it only when the
  candidates can't be enumerated up front.

### Reusable pickers (`step.getOptionsCallback`)

A step may bring its own provider — same contract as `getStepOptionsCallback`, which remains the
fallback for steps without one. Define a picker once and spread it wherever it's needed:

```js
const pickUser = { isLiveSearch: true, placeholder: 'User…', getOptionsCallback: ({ term, signal }) => api.users(term, signal) };
const pickServer = { getOptionsCallback: ({ signal }) => api.servers(signal) };   // static: loaded once, filtered locally

{ id: 'assign-admin', trigger: '/assign-admin', text: 'Assign admin', steps: [
  { id: 'user', ...pickUser },
  { id: 'server', prompt: ' to ', ...pickServer },
] }
```

Likewise a context may bring its own `searchCallback(ctx)`; the element's `searchCallback` then
isn't asked for that context. Server-driven hosts (the LiveView bridge) can't send functions, so
they keep using the two central callbacks.

### Branching

An option may carry its own `steps`. Choosing it inserts them right after the current step,
before the remaining siblings, so one command can fork:

```js
{ id: 'assign-admin', trigger: '/assign-admin', text: 'Assign admin', steps: [
  { id: 'user', placeholder: 'User…', isLiveSearch: true },
  { id: 'target', prompt: ' to ', options: [
    { id: 'group', text: 'group', steps: [{ id: 'group', prompt: ' ', isLiveSearch: true }] },
    { id: 'site',  text: 'site',  steps: [{ id: 'site',  prompt: ' ', isLiveSearch: true }] },
  ] },
] }
```

The input reads `/assign-admin John to group Finance`; `action` gets the selections
`user`, `target` (`group`) and `group`. Stepping back past the forking answer drops its branch.
Branches are plain JSON, so options returned by `getStepOptionsCallback` may carry them too. Step ids
must be unique across the whole command.

### Async + aborts

Every provider may return a value or a Promise. When a newer query supersedes an in-flight one,
its `signal` is aborted and its late result is ignored. Rejections/throws are treated as "no
results" (and logged under `COMMANDPALETTE:DATA` when logging is enabled).

## Result groups

Give results a `group` and they render under section headings, clustered in first-appearance
order (the commands/contexts that global search prepends stay ungrouped, on top):

```js
palette.searchCallback = async ({ term }) => [
  ...(await users(term)).map((u) => ({ id: u.id, title: u.name, group: 'Users' })),
  ...(await sites(term)).map((s) => ({ id: s.id, title: s.name, group: 'Sites' })),
];
```

## Favorites & recents

On by default. The home screen starts with **Favorites** (starred) and **Recent** (ranked by
frequency × recency), then Commands and Search. The two remembered sections stay compact: at most
`max-favorite-count` / `max-recent-count` one-line rows (default 3 each), with a “+N · Ctrl+F” control at
the heading's end.

- **Full lists**: <kbd>Ctrl</kbd>/<kbd>⌘</kbd>+<kbd>F</kbd> shows every favorite,
  <kbd>Ctrl</kbd>/<kbd>⌘</kbd>+<kbd>R</kbd> every recent item (with their descriptions). Typing
  filters; <kbd>Esc</kbd>, <kbd>⌫</kbd> on an empty input or the same chord goes home. Clicking /
  tapping the heading control does the same (phones). While the palette is open these chords
  shadow the browser's find / reload.
- **`g f`** opens the palette straight on favorites from anywhere on the page (`favorites-hotkey`;
  `recent-hotkey` is off by default). A command whose `shortcut` is the same sequence wins.
- `openFavorites()` / `openRecent()` do the same from code.
 Remembered: instant commands,
**completed runs with their answers**, contexts entered and chosen search results. Entries pointing
at a command/context the current `commands`/`contexts` no longer contain are hidden — so per-user
config hides them automatically.

- **Star** the active row with <kbd>Ctrl</kbd>/<kbd>⌘</kbd>+<kbd>D</kbd> (`favorite-key`) or its ☆ button.
  Commands, contexts, search results and remembered entries can be starred; step options can't.
- **Replay a run**: pick it from Recent — the wizard reopens with each remembered answer offered
  first (badged “Last used”). <kbd>Enter</kbd> accepts the remaining answers and runs;
  <kbd>Tab</kbd> accepts one step; typing replaces that step's answer; <kbd>Shift</kbd>+<kbd>Tab</kbd>
  steps back.
- **Storage** (core state store, SPEC §12.17): `localStorage` `km-state:web-command-palette:<storage-key>`
  (`{ entries: UsageEntry[] }`) — set the key per user, e.g. `storage-key="cp:usage:42"`. The page can keep
  the whole list itself with `loadStateCallback` / `saveStateCallback` (set both; either one alone switches
  `localStorage` off):

```js
palette.loadStateCallback = ({ key }) => fetch(`/api/prefs/${key}`).then((r) => (r.ok ? r.json() : null));
palette.saveStateCallback = ({ key, state }) => fetch(`/api/prefs/${key}`, { method: 'PUT', body: JSON.stringify(state) });
```

  Or upsert one entry at a time on the server (per-entry API, wins over the state store):

```js
palette.loadUsageCallback = () => fetch('/api/me/palette-usage').then((r) => r.json());
palette.saveUsageCallback = ({ entry }) => fetch(`/api/me/palette-usage/${encodeURIComponent(entry.key)}`,
  { method: 'PUT', body: JSON.stringify(entry), headers: { 'content-type': 'application/json' } });
```

```ts
interface UsageEntry {
  key: string;                                   // 'command:deploy', 'run:deploy:[…]', 'context:products', 'result:global:p1'
  kind: 'command' | 'run' | 'context' | 'result';
  label: string;                                 // a run's whole sentence: "/deploy to Staging branch main"
  commandId?: string; selections?: Selection[];  // command / run
  contextId?: string;                            // context
  result?: Result; scope?: Scope;                // result
  count: number; lastUsed: number; isFavorite: boolean;
}
```

The element keeps at most 50 non-favorite entries in the stored state; with the per-entry callbacks,
pruning is up to the server. `usage-storage="none"` turns stars and both sections off.

## Feedback

After a wizard completes or an instant command runs, the dialog doesn't just vanish: for
`feedback-duration` ms (default 1500) it collapses to a single line — ✓, what ran, **Done**
and a countdown bar — then closes. A wizard reads as the sentence the user built, answers in bold
(`/deploy to **Staging** branch **main**`); an instant command shows its text.

- The `action` event fires **immediately**; only the close waits.
  `close` fires when the panel goes.
- The countdown bar is left out when motion is off (`motion="none"`, a `data-motion="none"`
  section / page, OS reduced motion); the timer keeps its time.
- Any key or click dismisses it; <kbd>Ctrl</kbd>/<kbd>⌘</kbd>+<kbd>K</kbd> goes straight to a fresh palette.
- `show-feedback="false"` (or `feedback-duration="0"`) turns it off.
- Search-result selections (`result-select`) get no panel by default — they usually navigate away.

```js
palette.renderFeedbackCallback = (ctx) => {
  // ctx = { type: 'action' | 'select', commandId?, commandText?, selections?,
  //         sentence, result?, scope?, duration } + controller / element / presentation
  if (ctx.type === 'select') return `Opening <b>${ctx.sentence}</b>…`;   // opt search results in
  if (ctx.commandId === 'reload') return false;                             // skip for this one
  return null;                                                              // the default panel
};
```

The result is read by core's one render-callback contract (`renderSlot`, core SPEC §12.35); it
replaces the line's text (the ✓, **Done** and the countdown stay):

- a **string** → HTML (escape data you put in it);
- a **Node** (element, fragment) → mounted;
- **`null` / `undefined`** → the built-in line (a search result has none, so no panel);
- **`false`** → hidden: no feedback this time, the palette closes right away.

## Right-to-left

Set `dir="rtl"` on the element or any ancestor (`<html dir="rtl">` is enough); the palette follows
the effective direction, also when it changes at runtime.

- The layout mirrors: icons on the right, keycaps and the ☆ on the left, the feedback line starting
  on the right. The CSS uses logical properties only.
- ←/→ paging swaps: → (toward the inline start) is the previous page, ← the next.
- Mixed text keeps its order: titles, descriptions, keycaps, badges and the feedback line are
  bidi-isolated, so `/deploy to Staging` stays `/deploy to Staging` in an RTL row, and Hebrew or
  Arabic command names (`/דוח עבור`) read right-to-left. Translate the strings with `labels`.

## Icons

`icon` is data, read by core's one icon rule (`renderIcon`, core SPEC §12.33) — first match wins:

1. starts with `<` → inserted raw (`<svg>`, `<img>`, `<i class="fa …">`; **the host vouches for this markup**)
2. a built-in name (`search`, `check`, `settings`, `delete`, … core `BUILT_IN_ICON_NAMES`) →
   `<span class="km-icon cp__icon cp__icon--NAME">`, a glyph masked from the `--base-icon-<name>` token in
   `currentColor` — set by a `:root` theme (`@keenmate/base-css-variables`) or on the element; nothing is drawn
   when the token is unset. Reserved: no hook sees a built-in name
3. the palette's own `renderIconCallback(name, ctx)`, then the page-wide `window.components.renderIconCallback`
   → markup (`''` = no icon; `null` / `undefined` = not mine, the next rule decides)
4. ASCII class names (`fa-solid fa-folder`, `bi-gear`, `gear`) → an icon font,
   `<i class="cp__icon fa-solid fa-folder" aria-hidden="true">` — the font's CSS must reach the shadow root
   (`custom-styles` / the page-wide `customStyles`, see [Theming → Custom CSS](theming.md#custom-css-shadow-root))
5. anything else (an emoji, `1 < 2`) → escaped text

```js
// one palette, no page setup: map your icon set's names to markup
palette.renderIconCallback = (name) =>
  name.startsWith('lucide-') ? `<svg class="lucide"><use href="/lucide.svg#${name.slice(7)}"/></svg>` : null;
```

Changing `window.components.renderIconCallback` later repaints the icons (an open palette keeps its query,
active row and scroll).

## Labels

```js
palette.labels = {
  'placeholders.idle': 'Hledat…',
  'messages.typeToSearch': 'Začněte psát pro hledání v {name}',
  'headers.favorites': 'Oblíbené',
  'headers.recent': 'Nedávné',
};
```

Or as a JSON attribute: `<web-command-palette labels='{"placeholders.idle":"Hledat…"}'>`.

Keys are flat `<elementType>.<name>` (type `CommandPaletteLabels`, defaults in the exported
`DEFAULT_LABELS`). One key per surface: a text shown in two places (a home heading and the context
pill, a footer hint and the star button's name / tooltip) has one key per place.

| Key | Default | Where |
|---|---|---|
| `placeholders.idle` | Type / for commands, : to search, or just start typing… | Input placeholder on the home screen |
| `placeholders.filter` | Type to filter… | Input placeholder in a step (when the step sets none) and the favorites / recent lists |
| `headers.favorites` / `headers.recent` / `headers.commands` / `headers.search` | Favorites / Recent / Commands / Search | Home section headings (also the section group's accessible name) |
| `headers.fullscreen` | Search | Title of the phone fullscreen sheet |
| `headers.done` | Done | Feedback panel heading after a command ran |
| `labels.scopeCommands` / `labels.scopeContexts` | Commands / Search contexts | Context pill under `/` / `:` |
| `labels.scopeSearchingIn` | Searching in {name} | Context pill in a context search |
| `labels.scopeFavorites` / `labels.scopeRecent` | Favorites / Recent | Context pill in the full favorites / recent list |
| `labels.pageOf` | Page {page} of {total} · {count} results | Pagination row |
| `labels.lastUsed` | Last used | Badge on a replayed step's remembered answer |
| `labels.navigate` / `labels.pages` / `labels.next` / `labels.run` / `labels.select` / `labels.back` / `labels.close` | Navigate / Pages / Next / Run / Select / Back / Close | Footer hints |
| `labels.addFavorite` / `labels.removeFavorite` | Add to favorites / Remove from favorites | Footer hint for the star chord |
| `buttons.showAll` | +{count} | Home heading link to the full favorites / recent list |
| `tooltips.addFavorite` / `tooltips.removeFavorite` | Add to favorites / Remove from favorites | Star button tooltip (the chord is appended) |
| `ariaLabels.addFavorite` / `ariaLabels.removeFavorite` | Add to favorites / Remove from favorites | Star button accessible name |
| `ariaLabels.dialog` | Command palette | Dialog accessible name |
| `ariaLabels.input` | Command palette | Search input accessible name |
| `ariaLabels.close` | Close | Close button (fullscreen sheet) |
| `ariaLabels.removeToken` | Remove {name} | A token's remove button |
| `ariaLabels.resultsCount` | {count} results | Live-region announcement of the result count |
| `ariaLabels.done` | Done | Live-region announcement prefix after a command ran (`Done: …`) |
| `messages.noResults` | No results found | A search / filter matched nothing |
| `messages.searching` | Searching… | Loader text — also the loader's accessible name |
| `messages.typeToSearch` | Type to search {name} | Empty query in a context search |
| `messages.noFavorites` | No favorites yet — star a row with {key} | Favorites list with nothing starred |
| `messages.noRecent` | Nothing used yet | Recent list with nothing used yet |

Labels resolve per key through core `/locale` (`createLabels`, tag `web-command-palette`): the instance
`labels` (short `messages.noResults` or full `web-command-palette.messages.noResults` keys) → the
page-wide flat dictionary `window.components.locale.labels['web-command-palette.<key>']` → the English
default. Assigning `window.components.locale` re-renders an open palette in place (mode, query and
wizard answers kept). A `translateCallback({ component, key, template, params, locale })` (ICU / i18next)
translates every label the instance `labels` did not set (`key` is the full key; return `null` /
`undefined` to pass): the palette's own `el.translateCallback` first, then the page-wide
`window.components.locale.translateCallback` — one palette on a page needs no `window.components` setup.

```js
palette.translateCallback = ({ key, params }) => i18next.exists(key) ? i18next.t(key, params) : null;
```

```js
window.components.locale = {
  locale: 'cs',
  labels: {
    'web-command-palette.messages.noResults': 'Nic nenalezeno',
    'web-command-palette.labels.pageOf': 'Strana {page} z {total} · {count} výsledků',
  },
};
```

**Numbers** filled into `{count}`, `{page}` and `{total}` are passed as numbers; core formats them for
the resolved locale (the palette's own `locale`, else the page-wide `locale` / `thousandsSeparator`, else
the browser language) — `12 345` in Czech, `12,345` in English. A `translateCallback` receives the raw
numbers (for plurals) and the resolved locale as `ctx.locale`.

```html
<web-command-palette locale="de"></web-command-palette>  <!-- "Page 1 of 1.544 · 12.345 results" -->
```

**HTML or text.** A label drawn as content — `headers.*`, footer hints, the `messages.*` empty /
loading text, `labels.pageOf`, `buttons.showAll` — is an HTML template: markup in it renders,
the `{name}` / `{key}` values filled into it are escaped (they are data). A label used as an
attribute (`ariaLabels.*`, `tooltips.*`), the input placeholder, the context pill, the `labels.lastUsed` badge or a screen-reader
announcement is plain text. `window.components.security = { shouldEscapeLabels: true }` makes every
label plain text. A key set to `''` is deliberately empty — the string is not rendered (an `''`
footer hint label hides that hint; an `''` aria label removes the attribute). A missing /
`undefined` key falls through to the page-wide label, then English.

## Build your own UI

`CommandPaletteEngine` is the DOM-free logic behind `<web-command-palette>`, exported so you can
put your own markup on it (a different framework, a sidebar instead of a dialog, a test harness).

**What it does:** the modes (home, `/` commands, `:` contexts, global search, favorites / recent),
the multi-step command wizard (static / live / branching steps, replayed answers), client-side
filtering under `search-behavior` / `search-match`, `searchCallback` / step options through one
debounced, aborting "latest request wins" runner, pagination, favorites / recents (with a
`UsageStore`), and the texts it produces (`placeholder`, `contextText`, `emptyText`, `pageText`, the
`lastUsed` badge) through core `/locale`.

**What you draw:** the input (`engine.input`; `engine.lockedLength` leading characters are the locked
prefix), the rows (`engine.items` — `title`, `meta`, `icon`, `keys`, `section` / `group`, `favorite`;
`engine.activeIndex` is the highlighted one), the loader (`engine.isLoading`), the empty state
(`engine.emptyText`), the pill (`engine.contextText`), the tokens row (`engine.tokens`, in
`display: 'tokens'`) and pagination (`engine.pageText`). Icons and the loader are yours — the engine
takes no `renderIconCallback` / `renderLoadingCallback`. Feed it keys and text; it calls your host's
`changed()` after every state change and `effect()` for the outcome (`select` a result, `action` a
finished command, `close`).

**Two arguments:** `new CommandPaletteEngine(host, options)` — `host` holds the hooks the engine calls
back (`changed`, `effect`, optional `context` / `element` / `error`); `options` holds the settings and the
data (`commands`, `contexts`, the callbacks, `pageSize`, `labels`, …). A missing option takes the element's
default. Change settings later with `engine.setOptions(partial)` (merges, applies what the partial names —
an `undefined` key goes back to its default; a key that is not an option is skipped with a warning); read them with `engine.getOptions()` (the merged options,
read-only).

```js
import { CommandPaletteEngine } from '@keenmate/web-commandpalette';

const input = document.querySelector('#my-input');
const list = document.querySelector('#my-list');

const engine = new CommandPaletteEngine({
  changed: () => draw(),
  effect: (effect) => {
    if (effect.type === 'select') location.href = effect.result.href;
    if (effect.type === 'action') runMyCommand(effect.command.id, effect.selections);
    // effect.type === 'close': hide your panel. Return false to veto (nothing is recorded).
  },
}, {
  commands,                          // the same Command[] the element takes
  contexts,
  searchCallback: ({ term, signal }) => fetch(`/search?q=${encodeURIComponent(term)}`, { signal }).then((r) => r.json()),
  labels: { 'placeholders.idle': 'Search or type / for commands' },
  translateCallback: null,           // or your i18n hook; the page-wide one is asked after it
  locale: 'de',                      // numbers in labels; omit / null = the page-wide locale, else the browser
});

// Later: new data or settings — the current list / search / page is re-applied.
engine.setOptions({ commands: [...commands, newCommand], pageSize: 12 });

function draw() {
  input.value = engine.input;
  input.placeholder = engine.placeholder;
  list.replaceChildren(...engine.items.map((item, i) => {
    const li = document.createElement('li');
    li.textContent = item.title;
    li.ariaSelected = String(i === engine.activeIndex);
    li.onclick = () => engine.select(i);
    return li;
  }));
  if (!engine.items.length && engine.emptyText) list.textContent = engine.emptyText;
}

input.addEventListener('input', () => engine.setInput(input.value));
input.addEventListener('keydown', (e) => {
  const keys = { ArrowDown: () => engine.move('down'), ArrowUp: () => engine.move('up'),
    Enter: () => engine.commit(), Tab: () => engine.select(), Escape: () => engine.back() };
  if (keys[e.key]) { e.preventDefault(); keys[e.key](); }
});
draw();
// On teardown: engine.dispose() stops timers and in-flight requests.
```

**Options = the element's inputs, same names and defaults.** The element passes its own values through
(`setOptions` from its `update()`), so a value written for one works in the other:

| Option | Element input | Default / notes |
|---|---|---|
| `commands` / `contexts` | `commands` / `contexts` | `[]` — the data; pass the array again after an in-place edit |
| `searchCallback` / `getStepOptionsCallback` | `searchCallback` / `getStepOptionsCallback` | `null` = none |
| `display` / `pageSize` | `display` / `page-size` | `inline` / 8 |
| `searchDebounce` | `search-debounce` | 150 |
| `searchBehavior` / `searchMatch` | `search-behavior` / `search-match` | `normalized` / `contains` |
| `labels` | `labels` | `null`; short or full keys |
| `translateCallback` | `translateCallback` | `null`; the engine's own hook, before `window.components.locale.translateCallback` |
| `locale` | `locale` | `null` (the page-wide locale, else the browser) — the numbers in `engine.labels` (`pageText`, counts) and `ctx.locale` |
| `usage` | `usage-storage`, `storage-key`, `load*` / `save*` callbacks | `null` = off; a `UsageStore` (`new UsageStore(persistence, () => engine.usageChanged())`) |
| `maxFavoriteCount` / `maxRecentCount` | `max-favorite-count` / `max-recent-count` | 3 |
| `favoriteKey` | `favorite-key` | `d` — Ctrl/⌘ + this key stars a row (`''` = off); the engine draws its keycap (`Ctrl+D` / `⌘D`) into `messages.noFavorites`, your UI binds the key |

| Host hook | Element | Notes |
|---|---|---|
| `context?(fields)` | `withContext` | attach your own fields to every callback ctx |
| `element?()` | the element | your UI's element, read once — a throwing `translateCallback` logs under its logger; omit = `null` |
| `effect(effect)` / `changed()` / `error?()` | `before*Callback`s, events, close | yours to perform |

`engine.usageChanged()` tells the engine the store's entries changed (the store's `onChange`); it is data,
not a setting.

Not engine options (they draw or bind DOM — your UI's job): `renderIconCallback`,
`renderLoadingCallback`, `renderFeedbackCallback`, `customStyles` / `getCustomStylesCallback`,
`size`, `presentation`, `open-key` / `favorites-key` / `recent-key` / the hotkeys, `show-feedback`.

`engine.labels` is the palette's resolver (core `createLabels`) over your `labels` +
`translateCallback`: resolve your own chrome strings through it (`engine.labels.text('ariaLabels.close')`)
to follow the same rules and keys as the element.

## Logging

```js
window.components['web-command-palette'].logging.enableLogging();
```
