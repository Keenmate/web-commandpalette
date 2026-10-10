# Usage

Mount **one** `<web-command-palette>` per page. The first connected instance owns the global
<kbd>Ctrl</kbd>/<kbd>⌘</kbd>+<kbd>K</kbd> listener and the `g <letter>` sequences.

```js
import '@keenmate/web-commandpalette';
```

## Properties

Objects and functions are **properties only** — set them from JS (or a framework/LiveView hook).

| Property | Type | Notes |
|---|---|---|
| `commands` | `Command[]` | Home screen + `/`. |
| `contexts` | `Context[]` | Home screen + `:`. |
| `searchCallback` | `(scope, query, signal) => Result[] \| Promise<Result[]>` | Context + global search. `scope` is `'global'` or `{ contextId }`. Called only for **non-empty** queries, debounced. |
| `stepOptionsCallback` | `(ctx, signal) => Option[] \| Promise<Option[]>` | `ctx = { commandId, stepId, query, selections }`. |
| `labels` | `Partial<Labels>` | UI strings; unset keys fall back to English. |
| `display` | `'inline' \| 'tokens'` | Wizard display. Default `inline`. |
| `size` | `'sm' \| 'lg' \| 'xl' \| null` | Width/height preset. |
| `pageSize` | `number` | Search results per page. Default `8`. |
| `openKey` | `string` | Ctrl/⌘ + this key toggles. Default `'k'`; `''` disables. |
| `searchDebounce` | `number` | ms before a provider call. Default `150`. |
| `mobilePresentation` | `'auto' \| 'floating' \| 'fullscreen'` | `auto`: fullscreen sheet on touch phones only. |
| `isOpen` *(read-only)* | `boolean` | |

Callbacks are read **live** on every call, so they can be (re)assigned at any time — e.g. by a
LiveView bridge after `connectedCallback`.

## Attributes

`display`, `size`, `page-size`, `open-key`, `search-debounce`, `mobile-presentation`.
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

## Events

All bubble and are `composed`. Each also has a handler property (`onCpSelect`, …).

| Event | `detail` | When |
|---|---|---|
| `cp-open` / `cp-close` | `{}` | Opened / closed (`cp-close` also follows every selection). |
| `cp-select` | `{ item, scope }` | A search result was chosen. |
| `cp-complete` | `{ commandId, selections }` | A multi-step command finished. |
| `cp-command` | `{ commandId }` | An **instant** command (no `steps`) was chosen. |
| `cp-ready` | `{}` | First render done (fires a microtask after upgrade). |

The palette **closes itself** after `cp-select` / `cp-complete` / `cp-command`; the host performs
the effect (navigate, toast, …). Instant commands fire only `cp-command`; wizards fire only
`cp-complete`.

## Data shapes

All plain JSON (so a server can send them verbatim), except the optional `Step.shouldShow`.

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
}

interface Context { id: string; shortcut: string; name: string; aliases?: string[]; description?: string; icon?: string; }
interface Option  { id?: string; label: string; value?: unknown; description?: string; icon?: string; }
interface Result  { id: string; title: string; subtitle?: string; icon?: string; badge?: string;
                    badgeVariant?: 'primary'|'success'|'warning'|'danger'|'info'|'secondary'; href?: string; [k: string]: unknown; }

interface Selection { stepId: string; label: string; value: unknown; optionId?: string; isFreeText: boolean; }
```

### Step options: static vs live

- **Static** (default): `options` inline, or `stepOptionsCallback` called **once** on step entry
  with `query: ''`. Typing filters that list in the browser — zero latency, zero round-trips.
- **Live** (`search: true`): `stepOptionsCallback` per debounced keystroke. Use it only when the
  candidates can't be enumerated up front.

### Async + aborts

Every provider may return a value or a Promise. When a newer query supersedes an in-flight one,
its `signal` is aborted and its late result is ignored. Rejections/throws are treated as "no
results" (and logged under `COMMANDPALETTE:DATA` when logging is enabled).

## Icons

`icon` is data, rendered by shape:

- starts with `<` → raw SVG/HTML (**the host vouches for this markup**)
- starts with an ASCII letter → icon name → `<span class="pa-icon pa-icon--NAME">`
- anything else → text (emoji)

## Labels

```js
palette.labels = { placeholder: 'Hledat…', typeToSearch: 'Začněte psát pro hledání v {name}' };
```

Keys: `placeholder`, `filterPlaceholder`, `emptyText`, `searching`, `searchingIn` `{name}`,
`typeToSearch` `{name}`, `commands`, `search`, `searchContexts`, `pageOf` `{page} {total} {count}`,
`navigate`, `select`, `back`, `close`, `pages`, `fullscreenTitle`, `dialogLabel`,
`removeToken` `{name}`, `resultsCount` `{count}`.

## Logging

```js
window.components['web-command-palette'].logging.enableLogging();
```
