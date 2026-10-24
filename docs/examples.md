# Examples

Browse them at https://examples.web-commandpalette.keenmate.dev, or run `npm run dev` and open
http://localhost:12400. The hub (`index.html`) links every page.

| Page | Shows |
|---|---|
| [`examples-basic.html`](../examples-basic.html) | The three-line setup, opening (Ctrl/⌘+K, `open-key`, `g`-sequences, `controller.openWith`), the `select` / `action` events, i18n `labels`. |
| [`examples-commands-steps.html`](../examples-commands-steps.html) | Static steps (inline or fetched once), `isLiveSearch` live steps, `isFreeTextAllowed`, `getIsVisibleCallback`, inline vs tokens display, the `action` event. |
| [`examples-async-search.html`](../examples-async-search.html) | Scoped context search (no call on an empty query), global search, debounce + abort with a provider-call log, pagination. |
| [`examples-favorites.html`](../examples-favorites.html) | Reusable pickers (`step.getOptionsCallback`), a branching admin command, favorites + recents (localStorage or `load`/`saveUsageCallback`), replaying a run with Tab/Enter, grouped results, a context with its own `searchCallback`. |
| [`examples-theming.html`](../examples-theming.html) | Themes & sizes in one card: a seven-theme gallery (plus the unthemed default) built only from `--base-*` / `--cp-*` variables, icons and `::part()`, with `--base-rem`, size presets and the phone sheet applied to every theme. |
| [`examples-playground.html`](../examples-playground.html) | The full pure-admin demo data with every switch and a live event log. |

Shared demo data lives in [`examples-data.js`](../examples-data.js). The site's shared layout,
styles, chapter nav, copy-link buttons and theme switch come from
`@keenmate/web-components-devkit`; each page is a fragment that holds only its own sections.
Switches persist across reloads through `attachControlsPersistence('<page-key>')`. To add a page,
add one entry to the `pages` registry in `index.html`.

## Recipes

**Open from a button**

```js
button.addEventListener('click', () => palette.controller.open());
searchPill.addEventListener('click', () => palette.controller.openWith(':products '));
```

**Navigate on selection**

```js
palette.addEventListener('select', (e) => { if (e.detail.item.href) location.href = e.detail.item.href; });
```

**Server search with `fetch` (abortable)**

```js
palette.searchCallback = async ({ scope, term, signal }) => {
  const params = new URLSearchParams({ q: term, scope: scope === 'global' ? 'global' : scope.contextId });
  const res = await fetch(`/api/search?${params}`, { signal });
  return res.json();
};
```

**A step whose options come from the server once**

```js
palette.getStepOptionsCallback = async ({ commandId, stepId }) => {
  if (commandId === 'assign' && stepId === 'user') return (await fetch('/api/users')).json();
  return [];
};
```

**Run a command**

```js
// One `action` event per command run; `id` is the command id, `selections` the wizard answers.
palette.addEventListener('action', (e) => {
  if (e.detail.id === 'deploy') deploy(e.detail.selections);
});
// …or per command:
palette.commands = [{ id: 'reload', trigger: '/reload', text: 'Reload', onClick: () => reload() }];
```

**Ask before a destructive command**

```js
palette.commands = [{ id: 'wipe', trigger: '/wipe', text: 'Wipe cache', isDanger: true }];
// `false` (or a Promise of it) cancels: no onClick, no `action` event, the palette stays open.
palette.beforeActionCallback = async ({ item }) => (item.isDanger ? myConfirm(`Run ${item.text}?`) : undefined);
```

**Hide or disable commands per user**

```js
palette.commands = [
  { id: 'admin', trigger: '/admin', text: 'Admin', getIsVisibleCallback: () => user.isAdmin },
  { id: 'publish', trigger: '/publish', text: 'Publish', getIsDisabledCallback: () => !doc.isDirty },
];
```
