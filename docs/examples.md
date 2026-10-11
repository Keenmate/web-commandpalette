# Examples

Browse them at https://examples.web-commandpalette.keenmate.dev, or run `npm run dev` and open
http://localhost:12300. The hub (`index.html`) links every page.

| Page | Shows |
|---|---|
| [`examples-basic.html`](../examples-basic.html) | The three-line setup, opening (Ctrl/⌘+K, `open-key`, `g`-sequences, `openWith`), the `cp-*` events, i18n `labels`. |
| [`examples-commands-steps.html`](../examples-commands-steps.html) | Static steps (inline or fetched once), `search: true` live steps, `freeText`, `shouldShow`, inline vs tokens display. |
| [`examples-async-search.html`](../examples-async-search.html) | Scoped context search (no call on an empty query), global search, debounce + abort with a provider-call log, pagination. |
| [`examples-favorites.html`](../examples-favorites.html) | Reusable pickers (`step.load`), a branching admin command, favorites + recents (localStorage or `load`/`saveUsageCallback`), replaying a run with Tab/Enter, grouped results, a context with its own `search`. |
| [`examples-theming.html`](../examples-theming.html) | Themes & sizes in one card: a seven-theme gallery (plus the unthemed default) built only from `--base-*` / `--cp-*` variables, icons and `::part()`, with `--base-rem`, size presets and the phone sheet applied to every theme. |
| [`examples-playground.html`](../examples-playground.html) | The full pure-admin demo data with every switch and a live event log. |

Shared demo data lives in [`examples-data.js`](../examples-data.js). The pages follow the Keenmate
examples convention (`../web-editor/EXAMPLES.md`): `examples-shared.css`, `examples-chapter-nav.js`,
`examples-copy-link.js` and `examples-controls-store.js` are copied from `web-editor`. Pages are
built only from the shared classes and use no page CSS. Switches persist across reloads through
`persistControls('<page-key>')`. To add a page, add one entry to the `pages` registry in `index.html`.

## Recipes

**Open from a button**

```js
button.addEventListener('click', () => palette.open());
searchPill.addEventListener('click', () => palette.openWith(':products '));
```

**Navigate on selection**

```js
palette.addEventListener('cp-select', (e) => { if (e.detail.item.href) location.href = e.detail.item.href; });
```

**Server search with `fetch` (abortable)**

```js
palette.searchCallback = async (scope, query, signal) => {
  const params = new URLSearchParams({ q: query, scope: scope === 'global' ? 'global' : scope.contextId });
  const res = await fetch(`/api/search?${params}`, { signal });
  return res.json();
};
```

**A step whose options come from the server once**

```js
palette.stepOptionsCallback = async ({ commandId, stepId }) => {
  if (commandId === 'assign' && stepId === 'user') return (await fetch('/api/users')).json();
  return [];
};
```
