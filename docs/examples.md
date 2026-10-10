# Examples

Run `npm run dev` and open http://localhost:12300.

| Page | Shows |
|---|---|
| [`index.html`](../index.html) | Playground with the pure-admin demo data, display/size toggles, event log. |
| [`examples-basic.html`](../examples-basic.html) | The three-line setup and the three effect events. |
| [`examples-commands-steps.html`](../examples-commands-steps.html) | Static, `search: true`, `freeText` and `shouldShow` steps; inline vs tokens display. |
| [`examples-async-search.html`](../examples-async-search.html) | Scoped + global search with adjustable latency, debounce, abort log, pagination. |
| [`examples-theming.html`](../examples-theming.html) | Dark / brand / compact themes via `--base-*` and `--pa-command-palette-*`. |

Shared demo data lives in [`examples-data.js`](../examples-data.js).

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
