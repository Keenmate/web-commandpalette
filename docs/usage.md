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
| <kbd>g</kbd> then a letter | anywhere, not typing | run the command with that `shortcut`; `g f` opens favorites |
| <kbd>↑</kbd><kbd>↓</kbd> <kbd>PgUp</kbd><kbd>PgDn</kbd> <kbd>Home</kbd><kbd>End</kbd> | list | move — pure client-side, never waits on a provider |
| <kbd>←</kbd><kbd>→</kbd> | search, caret at the edge | previous / next page (mirrored in RTL) |
| <kbd>Enter</kbd> | list | select; in a replayed run, also accept the remaining remembered answers |
| <kbd>Tab</kbd> / <kbd>Shift</kbd>+<kbd>Tab</kbd> | wizard | accept this step / step back |
| <kbd>Esc</kbd>, <kbd>⌫</kbd> at the locked prefix | wizard, scoped search, full lists | step back; <kbd>Esc</kbd> elsewhere closes |
| <kbd>Ctrl</kbd>/<kbd>⌘</kbd>+<kbd>D</kbd> / <kbd>F</kbd> / <kbd>R</kbd> | palette open | star the active row / all favorites / all recent |

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
| `searchCallback` | `({ scope, term, signal }) => Result[] \| Promise<Result[]>` | Context + global search. `scope` is `'global'` or `{ contextId }`. Called only for **non-empty** terms, debounced. |
| `getStepOptionsCallback` | `({ commandId, stepId, term, selections, signal }) => Option[] \| Promise<Option[]>` | Fallback for steps without their own `getOptionsCallback`. |
| `beforeActionCallback` | `(detail) => unknown` | Runs before a command fires `action` (same detail). `false` (async OK) cancels: no `onClick`, no event, nothing recorded; a wizard steps back to its last answer and the palette stays open. |
| `beforeResultSelectCallback` | `({ result, scope }) => unknown` | Runs before a search result fires `result-select`. `false` (async OK) cancels; the palette stays open. Other return values continue. |
| `loadUsageCallback` | `(ctx) => UsageEntry[] \| Promise<UsageEntry[]>` | Load favorites/recents from the host instead of `localStorage`. |
| `saveUsageCallback` | `({ entry }) => void \| Promise<void>` | Upsert one entry (by `entry.key`) on every use / star toggle. |
| `labels` | `Partial<Labels>` | UI strings; unset keys fall back to English. |
| `display` | `'inline' \| 'tokens'` | Wizard display. Default `inline`. |
| `size` | `'sm' \| 'lg' \| 'xl' \| null` | Width/height preset. |
| `pageSize` | `number` | Search results per page. Default `8`. |
| `openKey` | `string` | Ctrl/⌘ + this key toggles. Default `'k'`; `''` disables. |
| `searchDebounce` | `number` | ms before a provider call. Default `150`. |
| `presentation` | `'auto' \| 'floating' \| 'fullscreen'` | `auto`: fullscreen sheet on touch phones only. |
| `responsive` / `responsiveCallback` | `CommandPaletteResponsiveMap` / `CommandPaletteResponsiveCallback` | Instance responsive rules (core): `{ device?, breakpoint? }` → partial config per device class / width bucket, or `(ctx) => partial`. Beat page rules and the element's own attributes; never reflected. See [README → Responsive rules](../README.md#responsive-rules). |
| `usageStorage` | `'local' \| 'none'` | Favorites + recents on (default) or off. |
| `usageKey` | `string` | `localStorage` key. Default `'web-commandpalette:usage'` — put the user id in it. |
| `maxFavoriteCount` / `maxRecentCount` | `number` | Rows each home section shows. Default `3`; `0` hides the section. |
| `favoriteKey` / `favoritesKey` / `recentKey` | `string` | Ctrl/⌘ + key while open: star the active row / show all favorites / show all recent. Defaults `d` / `f` / `r`; `''` disables. |
| `renderFeedbackCallback` | `(ctx) => string \| HTMLElement \| null \| false` | Custom feedback content; `false` skips it. See [Feedback](#feedback). |
| `renderLoadingCallback` | `(ctx) => void \| (() => void)` | Draw the searching loader yourself — `ctx = { component, context: 'search', containerElement, element, label }`; fill `containerElement` (already `role="status"` + `aria-label` = `labels.searching`), optionally return a cleanup. Beats the page-wide `window.components.renderLoaderCallback` (one hook for every KeenMate component); unset = the default `.cp-loader` (`--cp-loader-icon` / `-rotate` / `-duration` / `-size` / `-color`, chained to `--base-loader-*`). |
| `isFeedbackShown` | `boolean` | Show the one-line feedback after a command ran. Default `true` (attribute `show-feedback`). |
| `feedbackDuration` | `number` | How long it stays (ms). Default `1500`; `0` = off. |
| `favoritesHotkey` / `recentHotkey` | `string` | `g <letter>` sequence (palette closed) that opens on that list. Defaults `'g f'` / off. |
| `onOpen` / `onClose` / `onResultSelect` / `onAction` / `onReady` | `(detail) => void` | Event twins — see [Events](#events). |
| `controller` *(read-only)* | `CommandPaletteController` | The public facade. |
| `isOpen` *(read-only)* | `boolean` | |

Callbacks are read **live** on every call, so they can be (re)assigned at any time — e.g. by a
LiveView bridge after `connectedCallback`.

## Attributes

`display`, `size`, `page-size`, `open-key`, `search-debounce`, `presentation`,
`usage-storage`, `usage-key`, `max-favorite-count`, `max-recent-count`, `favorite-key`, `favorites-key`,
`recent-key`, `favorites-hotkey`, `recent-hotkey`, `show-feedback`, `feedback-duration`.
`open` is **reflected** (present while open) — use the controller to open/close.
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
| `open()` / `close()` / `toggle()` | Open on the home screen / close and reset / either. |
| `openWith(term)` | Open pre-filled, e.g. `'/deploy '`, `':products laptop'`, `'mac'`. |
| `reset()` | Back to the home screen (stays open). |
| `commands` / `contexts` | The same properties as on the element (assignable). |
| `openFavorites()` / `openRecent()` | Open on the full favorites / recent list. |

The same methods exist on the element. The DOM-free `PaletteEngine` behind it is exported for
standalone use only; the element never exposes it.

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
  shortcut?: string;         // "g d" (runs from anywhere while closed) — a chord like "Ctrl+K" is display-only
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
                    searchCallback?: (ctx: { scope, term, signal }) => Result[] | Promise<Result[]>; }   // JS hosts only
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
`max-favorite-count` / `max-recent-count` one-line rows (default 3 each), with a “+N · Ctrl F” control at
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
- **Storage**: `localStorage` under `usage-key` (one JSON array) — set it per user, e.g.
  `usage-key="cp:usage:42"`. Or keep it on the server:

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

The element keeps at most 50 non-favorite entries in `localStorage`; with callbacks, pruning is up
to the server. `usage-storage="none"` turns stars and both sections off.

## Feedback

After a wizard completes or an instant command runs, the dialog doesn't just vanish: for
`feedback-duration` ms (default 1500) it collapses to a single line — ✓, what ran, **Done**
and a countdown bar — then closes. A wizard reads as the sentence the user built, answers in bold
(`/deploy to **Staging** branch **main**`); an instant command shows its text.

- The `action` event fires **immediately**; only the close waits.
  `close` fires when the panel goes.
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

Return an HTML string or an element to replace the line's text (the ✓, **Done** and the countdown
stay), `null` for the default, or `false` to close right away.

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

`icon` is data, rendered by shape:

- starts with `<` → raw SVG/HTML (**the host vouches for this markup**)
- starts with an ASCII letter → icon name → `<span class="pa-icon pa-icon--NAME">`
- anything else → text (emoji)

## Labels

```js
palette.labels = { placeholder: 'Hledat…', typeToSearch: 'Začněte psát pro hledání v {name}', favorites: 'Oblíbené', recent: 'Nedávné' };
```

Keys: `placeholder`, `filterPlaceholder`, `noResults`, `searching`, `searchingIn` `{name}`,
`typeToSearch` `{name}`, `commands`, `search`, `searchContexts`, `pageOf` `{page} {total} {count}`,
`navigate`, `select`, `back`, `close`, `pages`, `fullscreenTitle`, `dialogLabel`,
`removeToken` `{name}`, `resultsCount` `{count}`.

`noResults` = a search / filter matched nothing (the favorites / recent lists use `noFavorites`
`{key}` / `noRecent` while nothing is starred / used yet).

All labels are **text**: they are escaped on insertion (never parsed as HTML), and so are the
`{name}` / `{count}` … values filled into them. A key set to `''` is deliberately empty — the
string is not rendered (an `''` footer hint label hides that hint; an `''` aria label removes
the attribute). A missing / `undefined` key falls back to the English default.

## Logging

```js
window.components['web-command-palette'].logging.enableLogging();
```
