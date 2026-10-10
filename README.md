# @keenmate/web-commandpalette

A framework-agnostic **command-palette web component** (`<web-command-palette>`) — the whole
palette machine (modes, multi-step command wizards, scoped + global search, keyboard nav,
client-side filtering, mobile sheet, focus/scroll-lock) in one custom element that talks to the
host only through **properties, events, and async callbacks**.

Hosts (pure-admin vanilla, keen/Phoenix, svelte, later react/razor) become thin adapters instead
of re-implementing ~1000 lines of palette logic each.

## The three-line setup

```html
<web-command-palette></web-command-palette>
<script type="module">
  import '@keenmate/web-commandpalette';

  const palette = document.querySelector('web-command-palette');
  palette.commands = [
    { id: 'go', shortcut: '/go', name: 'Go to Page', hotkey: 'g g',
      steps: [{ id: 'page', placeholder: 'Type a page…', options: [{ label: 'Users', value: '/users' }] }] },
  ];
  palette.contexts = [{ id: 'products', shortcut: ':products', aliases: [':p'], name: 'Products' }];
  palette.searchCallback = async (scope, query, signal) => fetchResults(scope, query, signal);

  // The host performs the effect; the palette closes itself.
  palette.addEventListener('cp-select',   (e) => location.href = e.detail.item.href);
  palette.addEventListener('cp-complete', (e) => run(e.detail.commandId, e.detail.selections));
  palette.addEventListener('cp-command',  (e) => run(e.detail.commandId, []));
</script>
```

<kbd>Ctrl</kbd>/<kbd>⌘</kbd>+<kbd>K</kbd> opens it. Type `/` for commands, `:` for search contexts,
or anything else for global search. `g` then a letter runs a command's `hotkey` sequence.

## How it behaves

| You type | Mode | Data source |
|---|---|---|
| *(nothing)* | home: commands + contexts | in memory |
| `/dep` | command list | in memory, filtered client-side |
| `/deploy ` | command wizard | step `options`, or `stepOptionsCallback` (static: once; `search: true`: per keystroke) |
| `:` | context list | in memory, filtered client-side |
| `:p ` | scoped search, input locked to `":products "` | **nothing until you type** — then `searchCallback({ contextId }, q)` |
| `mac` | global search | matching commands/contexts first (instantly), then `searchCallback('global', q)` |

Navigation (<kbd>↑</kbd><kbd>↓</kbd> <kbd>PgUp</kbd><kbd>PgDn</kbd> <kbd>Home</kbd><kbd>End</kbd>
<kbd>←</kbd><kbd>→</kbd> pages) is pure client-side DOM and never waits on a provider.
<kbd>Esc</kbd> / <kbd>⌫</kbd> at the locked prefix step back; <kbd>Esc</kbd> elsewhere closes.

## Docs

- [Usage — properties, attributes, methods, events, data shapes](./docs/usage.md)
- [Theming — CSS variables, `--base-rem`, size presets](./docs/theming.md)
- [Examples](./docs/examples.md) (run `npm run dev` → http://localhost:12300)
- [Accessibility](./docs/accessibility.md)
- [Building & testing](./BUILD.md)

## Built on

- `@keenmate/web-components-core` — `BlissElement` base, `overlay` (scroll-lock, keyboard inset,
  one-overlay-at-a-time), `environment` (device classification for the phone sheet).
- CSS is single-sourced from `@keenmate/pure-admin-core`'s `_command-palette.scss` — compiled into
  the shadow root, never forked.

## License

MIT © Keenmate
