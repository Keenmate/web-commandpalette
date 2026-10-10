# @keenmate/web-commandpalette

A framework-agnostic **command-palette web component** (`<web-command-palette>`) — the whole
palette machine (modes, multi-step command wizards, scoped + global search, keyboard nav,
client-side filtering, mobile sheet, focus/scroll-lock) in one custom element that talks to the
host only through **properties, events, and async callbacks**.

Hosts (pure-admin vanilla, keen/Phoenix, svelte, later react/razor) become thin adapters instead
of re-implementing ~1000 lines of palette logic each.

> **Status: greenfield.** Nothing is implemented yet. The full spec + task list for building it
> lives in **[`IMPLEMENTATION_PLAN.md`](./IMPLEMENTATION_PLAN.md)** — start there.

## The 10-second mental model

```js
const palette = document.querySelector('web-command-palette');
palette.commands = [
  { id: 'go', shortcut: '/go', name: 'Go to Page', hotkey: 'g g',
    steps: [{ id: 'page', placeholder: 'Type a page…' }] },
];
palette.contexts = [{ id: 'products', shortcut: ':products', aliases: [':p'], name: 'Products' }];
palette.searchCallback = async (scope, query, signal) => fetchResults(scope, query);
// Ctrl/⌘+K opens it. The host listens for cp-select / cp-complete and acts.
```

It is architecturally **"`web-multiselect` with more callback surfaces + a mode state machine."**
The hard part — async data from a Phoenix LiveView server — is already solved by
`../keen-web-multiselect`; this component reuses that exact `searchCallback → pushEventTo →
{:reply} → resolve` pattern.

## Design priority

**Easy to configure and use.** A list of commands + a search callback must be a three-line setup.

## Built on

- `@keenmate/web-components-core` — `BlissElement` base, `overlay` (scroll-lock/backdrop),
  `environment` (device/mobile-sheet), reactive inputs.
- CSS is single-sourced from `@keenmate/pure-admin-core`'s `_command-palette.scss` (not forked).

## License

MIT © Keenmate
