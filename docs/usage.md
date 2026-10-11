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
| `/deploy ` | command wizard | step `options`, its own `load`, or `stepOptionsCallback` (static: once; `search: true`: per keystroke) |
| `:` | context list | in memory, filtered client-side |
| `:p ` | scoped search, input locked to `":products "` | **nothing until you type** — then the context's `search`, or `searchCallback({ contextId }, q)` |
| `mac` | global search | matching commands/contexts first (instantly), then `searchCallback('global', q)` |

### Keyboard

| Keys | Where | Does |
|---|---|---|
| <kbd>Ctrl</kbd>/<kbd>⌘</kbd>+<kbd>K</kbd> | anywhere | open / close (`open-key`) |
| <kbd>g</kbd> then a letter | anywhere, not typing | run the command with that `hotkey`; `g f` opens favorites |
| <kbd>↑</kbd><kbd>↓</kbd> <kbd>PgUp</kbd><kbd>PgDn</kbd> <kbd>Home</kbd><kbd>End</kbd> | list | move — pure client-side, never waits on a provider |
| <kbd>←</kbd><kbd>→</kbd> | search, caret at the edge | previous / next page (mirrored in RTL) |
| <kbd>Enter</kbd> | list | select; in a replayed run, also accept the remaining remembered answers |
| <kbd>Tab</kbd> / <kbd>Shift</kbd>+<kbd>Tab</kbd> | wizard | accept this step / step back |
| <kbd>Esc</kbd>, <kbd>⌫</kbd> at the locked prefix | wizard, scoped search, full lists | step back; <kbd>Esc</kbd> elsewhere closes |
| <kbd>Ctrl</kbd>/<kbd>⌘</kbd>+<kbd>D</kbd> / <kbd>F</kbd> / <kbd>R</kbd> | palette open | star the active row / all favorites / all recent |

## Properties

Objects and functions are **properties only** — set them from JS (or a framework/LiveView hook).

| Property | Type | Notes |
|---|---|---|
| `commands` | `Command[]` | Home screen + `/`. |
| `contexts` | `Context[]` | Home screen + `:`. |
| `searchCallback` | `(scope, query, signal) => Result[] \| Promise<Result[]>` | Context + global search. `scope` is `'global'` or `{ contextId }`. Called only for **non-empty** queries, debounced. |
| `stepOptionsCallback` | `(ctx, signal) => Option[] \| Promise<Option[]>` | `ctx = { commandId, stepId, query, selections }`. Fallback for steps without their own `load`. |
| `loadUsageCallback` | `() => UsageEntry[] \| Promise<UsageEntry[]>` | Load favorites/recents from the host instead of `localStorage`. |
| `saveUsageCallback` | `(entry) => void \| Promise<void>` | Upsert one entry (by `entry.key`) on every use / star toggle. |
| `labels` | `Partial<Labels>` | UI strings; unset keys fall back to English. |
| `display` | `'inline' \| 'tokens'` | Wizard display. Default `inline`. |
| `size` | `'sm' \| 'lg' \| 'xl' \| null` | Width/height preset. |
| `pageSize` | `number` | Search results per page. Default `8`. |
| `openKey` | `string` | Ctrl/⌘ + this key toggles. Default `'k'`; `''` disables. |
| `searchDebounce` | `number` | ms before a provider call. Default `150`. |
| `mobilePresentation` | `'auto' \| 'floating' \| 'fullscreen'` | `auto`: fullscreen sheet on touch phones only. |
| `usageStorage` | `'local' \| 'none'` | Favorites + recents on (default) or off. |
| `usageKey` | `string` | `localStorage` key. Default `'web-commandpalette:usage'` — put the user id in it. |
| `favoritesLimit` / `recentLimit` | `number` | Rows each home section shows. Default `3`; `0` hides the section. |
| `favoriteKey` / `favoritesKey` / `recentKey` | `string` | Ctrl/⌘ + key while open: star the active row / show all favorites / show all recent. Defaults `d` / `f` / `r`; `''` disables. |
| `renderConfirmationCallback` | `(ctx) => string \| HTMLElement \| null \| false` | Custom confirmation content; `false` skips it. See [Confirmation](#confirmation). |
| `isConfirmationShown` | `boolean` | Show the confirmation panel after a command ran. Default `true` (attribute `confirmation`). |
| `confirmationDuration` | `number` | How long it stays (ms). Default `1500`; `0` = off. |
| `favoritesHotkey` / `recentHotkey` | `string` | `g <letter>` sequence (palette closed) that opens on that list. Defaults `'g f'` / off. |
| `isOpen` *(read-only)* | `boolean` | |

Callbacks are read **live** on every call, so they can be (re)assigned at any time — e.g. by a
LiveView bridge after `connectedCallback`.

## Attributes

`display`, `size`, `page-size`, `open-key`, `search-debounce`, `mobile-presentation`,
`usage-storage`, `usage-key`, `favorites-limit`, `recent-limit`, `favorite-key`, `favorites-key`,
`recent-key`, `favorites-hotkey`, `recent-hotkey`, `confirmation`, `confirmation-duration`.
`open` is **reflected** (present while open) — use the methods to open/close.

Reserved for the Phoenix LiveView bridge (`@keenmate/keen-web-commandpalette`):
`data-search-event`, `data-step-options-event`. The element itself doesn't act on them; the bridge
hook reads them and installs a `{:reply}`-backed `searchCallback` / `stepOptionsCallback`.

## Methods

| Method | |
|---|---|
| `open()` / `close()` / `toggle()` | Open on the home screen / close and reset. |
| `openWith(query)` | Open pre-filled, e.g. `'/deploy '`, `':products laptop'`, `'mac'`. |
| `reset()` | Back to the home screen (stays open). |
| `setCommands(list)` / `setContexts(list)` | Same as assigning the properties. |
| `openFavorites()` / `openRecent()` | Open on the full favorites / recent list. |

## Events

All bubble and are `composed`. Each also has a handler property (`onCpSelect`, …).

| Event | `detail` | When |
|---|---|---|
| `cp-open` / `cp-close` | `{}` | Opened / closed (`cp-close` also follows every selection). |
| `cp-select` | `{ item, scope }` | A search result was chosen. |
| `cp-complete` | `{ commandId, selections }` | A multi-step command finished. |
| `cp-command` | `{ commandId }` | An **instant** command (no `steps`) was chosen. |
| `cp-ready` | `{}` | First render done (fires a microtask after upgrade). |

The palette **closes itself** after `cp-select` / `cp-complete` / `cp-command` (after a brief
[confirmation](#confirmation) for commands); the host performs
the effect (navigate, toast, …). Instant commands fire only `cp-command`; wizards fire only
`cp-complete`.

## Data shapes

All plain JSON (so a server can send them verbatim), except the optional JS-only functions
`Step.shouldShow`, `Step.load` and `Context.search`.

```ts
interface Command {
  id: string;
  shortcut: string;          // "/deploy"
  name: string;
  aliases?: string[];        // ["/d"]
  hotkey?: string;           // "g d" (runs from anywhere while closed) — a chord like "Ctrl+K" is display-only
  description?: string;
  icon?: string;             // see Icons
  steps?: Step[];            // absent/empty → instant command (cp-command)
}

interface Step {
  id: string;
  prompt?: string;           // inline connective text, e.g. " to " (default " ")
  placeholder?: string;
  options?: Option[];        // inline static options (no callback needed)
  search?: boolean;          // true → stepOptionsCallback per debounced keystroke
  freeText?: boolean;        // Enter with no match submits the typed text
  shouldShow?: (selections: Selection[]) => boolean;   // JS hosts only
  load?: (ctx, signal) => Option[] | Promise<Option[]>; // JS hosts only — this step's own provider
}

interface Context { id: string; shortcut: string; name: string; aliases?: string[]; description?: string; icon?: string;
                    search?: (query, signal) => Result[] | Promise<Result[]>; }   // JS hosts only
interface Option  { id?: string; label: string; value?: unknown; description?: string; icon?: string;
                    steps?: Step[]; }       // branch: asked right after this option is chosen
interface Result  { id: string; title: string; subtitle?: string; icon?: string; badge?: string;
                    badgeVariant?: 'primary'|'success'|'warning'|'danger'|'info'|'secondary'; href?: string;
                    group?: string; [k: string]: unknown; }   // group → section heading

interface Selection { stepId: string; label: string; value: unknown; optionId?: string; isFreeText: boolean; }
```

### Step options: static vs live

- **Static** (default): `options` inline, or `stepOptionsCallback` called **once** on step entry
  with `query: ''`. Typing filters that list in the browser — zero latency, zero round-trips.
- **Live** (`search: true`): `stepOptionsCallback` per debounced keystroke. Use it only when the
  candidates can't be enumerated up front.

### Reusable pickers (`step.load`)

A step may bring its own provider — same contract as `stepOptionsCallback`, which remains the
fallback for steps without one. Define a picker once and spread it wherever it's needed:

```js
const pickUser = { search: true, placeholder: 'User…', load: ({ query }, signal) => api.users(query, signal) };
const pickServer = { load: (_, signal) => api.servers(signal) };   // static: loaded once, filtered locally

{ id: 'assign-admin', shortcut: '/assign-admin', name: 'Assign admin', steps: [
  { id: 'user', ...pickUser },
  { id: 'server', prompt: ' to ', ...pickServer },
] }
```

Likewise a context may bring its own `search(query, signal)`; `searchCallback` then isn't asked
for that context. Server-driven hosts (the LiveView bridge) can't send functions, so they keep
using the two central callbacks.

### Branching

An option may carry its own `steps`. Choosing it inserts them right after the current step,
before the remaining siblings, so one command can fork:

```js
{ id: 'assign-admin', shortcut: '/assign-admin', name: 'Assign admin', steps: [
  { id: 'user', placeholder: 'User…', search: true },
  { id: 'target', prompt: ' to ', options: [
    { id: 'group', label: 'group', steps: [{ id: 'group', prompt: ' ', search: true }] },
    { id: 'site',  label: 'site',  steps: [{ id: 'site',  prompt: ' ', search: true }] },
  ] },
] }
```

The input reads `/assign-admin John to group Finance`; `cp-complete` gets the selections
`user`, `target` (`group`) and `group`. Stepping back past the forking answer drops its branch.
Branches are plain JSON, so options returned by `stepOptionsCallback` may carry them too. Step ids
must be unique across the whole command.

### Async + aborts

Every provider may return a value or a Promise. When a newer query supersedes an in-flight one,
its `signal` is aborted and its late result is ignored. Rejections/throws are treated as "no
results" (and logged under `COMMANDPALETTE:DATA` when logging is enabled).

## Result groups

Give results a `group` and they render under section headings, clustered in first-appearance
order (the commands/contexts that global search prepends stay ungrouped, on top):

```js
palette.searchCallback = async (scope, q) => [
  ...(await users(q)).map((u) => ({ id: u.id, title: u.name, group: 'Users' })),
  ...(await sites(q)).map((s) => ({ id: s.id, title: s.name, group: 'Sites' })),
];
```

## Favorites & recents

On by default. The home screen starts with **Favorites** (starred) and **Recent** (ranked by
frequency × recency), then Commands and Search. The two remembered sections stay compact: at most
`favorites-limit` / `recent-limit` one-line rows (default 3 each), with a “+N · Ctrl F” control at
the heading's end.

- **Full lists**: <kbd>Ctrl</kbd>/<kbd>⌘</kbd>+<kbd>F</kbd> shows every favorite,
  <kbd>Ctrl</kbd>/<kbd>⌘</kbd>+<kbd>R</kbd> every recent item (with their descriptions). Typing
  filters; <kbd>Esc</kbd>, <kbd>⌫</kbd> on an empty input or the same chord goes home. Clicking /
  tapping the heading control does the same (phones). While the palette is open these chords
  shadow the browser's find / reload.
- **`g f`** opens the palette straight on favorites from anywhere on the page (`favorites-hotkey`;
  `recent-hotkey` is off by default). A command whose `hotkey` is the same sequence wins.
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
palette.saveUsageCallback = (entry) => fetch(`/api/me/palette-usage/${encodeURIComponent(entry.key)}`,
  { method: 'PUT', body: JSON.stringify(entry), headers: { 'content-type': 'application/json' } });
```

```ts
interface UsageEntry {
  key: string;                                   // 'command:deploy', 'run:deploy:[…]', 'context:products', 'result:global:p1'
  kind: 'command' | 'run' | 'context' | 'result';
  label: string;                                 // a run's whole sentence: "/deploy to Staging branch main"
  commandId?: string; selections?: Selection[];  // command / run
  contextId?: string;                            // context
  item?: Result; scope?: Scope;                  // result
  count: number; lastUsed: number; isFavorite: boolean;
}
```

The element keeps at most 50 non-favorite entries in `localStorage`; with callbacks, pruning is up
to the server. `usage-storage="none"` turns stars and both sections off.

## Confirmation

After a wizard completes or an instant command runs, the dialog doesn't just vanish: for
`confirmation-duration` ms (default 1500) it collapses to a single line — ✓, what ran, **Done**
and a countdown bar — then closes. A wizard reads as the sentence the user built, answers in bold
(`/deploy to **Staging** branch **main**`); an instant command shows its name.

- The effect event (`cp-complete` / `cp-command`) fires **immediately**; only the close waits.
  `cp-close` fires when the panel goes.
- Any key or click dismisses it; <kbd>Ctrl</kbd>/<kbd>⌘</kbd>+<kbd>K</kbd> goes straight to a fresh palette.
- `confirmation="false"` (or `confirmation-duration="0"`) turns it off.
- Search-result selections (`cp-select`) get no panel by default — they usually navigate away.

```js
palette.renderConfirmationCallback = (ctx) => {
  // ctx = { type: 'complete' | 'command' | 'select', commandId?, commandName?, selections?,
  //         sentence, item?, scope?, duration }
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

- The layout mirrors: icons on the right, keycaps and the ☆ on the left, the confirmation starting
  on the right. The CSS uses logical properties only.
- ←/→ paging swaps: → (toward the inline start) is the previous page, ← the next.
- Mixed text keeps its order: titles, descriptions, keycaps, badges and the confirmation are
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

Keys: `placeholder`, `filterPlaceholder`, `emptyText`, `searching`, `searchingIn` `{name}`,
`typeToSearch` `{name}`, `commands`, `search`, `searchContexts`, `pageOf` `{page} {total} {count}`,
`navigate`, `select`, `back`, `close`, `pages`, `fullscreenTitle`, `dialogLabel`,
`removeToken` `{name}`, `resultsCount` `{count}`.

## Logging

```js
window.components['web-command-palette'].logging.enableLogging();
```
