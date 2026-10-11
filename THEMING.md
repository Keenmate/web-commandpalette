# Theming

See **[docs/theming.md](./docs/theming.md)** (shipped with the package).

In short: the palette CSS is pure-admin-core's own `_command-palette.scss`; every variable it reads
falls back to core's default, so set `--base-*` or `--cp-*` on `:root` (or any
ancestor) to theme it, and `--base-rem` to scale it. The machine-readable list is
[`component-variables.manifest.json`](./component-variables.manifest.json), kept honest by
`npm run check:vars`.
