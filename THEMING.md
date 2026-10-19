# Theming

See **[docs/theming.md](./docs/theming.md)** (shipped with the package).

In short: every `--cp-*` knob is declared on `:host` and reads a shared `--base-*` variable with a
fallback, so set `--base-*` on `:root` (or any ancestor) to theme it, `--cp-*` on the element to
tune it, and `--base-rem` to scale it. The machine-readable list is
[`component-variables.manifest.json`](./component-variables.manifest.json), kept honest by
`npm run check:vars`.
