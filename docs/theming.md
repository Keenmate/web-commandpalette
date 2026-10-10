# Theming

The palette's CSS **is** pure-admin-core's `_command-palette.scss`, compiled into the shadow root
(plus core's badge and spinner primitives). It is never copied: a rebuild re-pulls core's partial.

## How variables reach the shadow root

Core's rules read variables such as `var(--pc-accent)` or `var(--pa-modal-content-bg)`. At build
time (`scripts/shadow-css.mjs`) every such read gets **core's own default as its `var()`
fallback**:

```css
background-color: var(--pa-modal-content-bg, var(--base-main-bg, #ffffff));
```

Nothing is *declared* inside the component, so:

- **a pure-admin page** (which defines `--pc-*` / `--pa-*` on `:root`) themes the palette exactly
  like the rest of the page;
- **any page** can theme it through the shared `--base-*` knobs, or the palette's own
  `--pa-command-palette-*` knobs, on `:root` or any ancestor;
- **an unthemed page** gets core's light defaults.

## Sizing: `--base-rem`

pure-admin sizes everything in 10px rems. Inside a shadow root `rem` would resolve against the
host page's root (often 16px), so every `Nrem` is compiled to `calc(N * var(--base-rem, 10px))`.

| Host | Set |
|---|---|
| pure-admin (`html { font-size: 10px }`) | `--base-rem: 1rem` to follow the root font size (or leave the 10px default) |
| anything else | nothing — the default is 10px — or scale with e.g. `--base-rem: 8px` |

## Palette knobs

| Variable | Purpose |
|---|---|
| `--pa-command-palette-width` | Dialog max width |
| `--pa-command-palette-offset-top` | Distance from the top of the viewport |
| `--pa-command-palette-results-max-height` | Results list max height |
| `--pa-command-palette-backdrop-bg` | Backdrop colour |
| `--pa-command-palette-backdrop-filter` | Backdrop filter (`none` to disable the blur) |
| `--pa-command-palette-item-hover-bg` / `-item-active-bg` | Row backgrounds |
| `--pa-command-palette-highlight-bg` / `-highlight-text` | `<mark>` query highlight |
| `--pa-command-palette-key-bg` / `-key-text` / `-key-font-size` / `-key-font-weight` | Keycaps |

`size="sm|lg|xl"` presets set width + results height together (480/288, 768/512, 896/640 px at
the default `--base-rem`).

The full list of `--base-*` variables the palette reads is in
[`component-variables.manifest.json`](../component-variables.manifest.json) (validated against the
compiled CSS by `npm run check:vars`).

## Example: dark

```css
html.dark {
  --base-main-bg: #1e1e2e;
  --base-input-bg: #181825;
  --base-input-color: #cdd6f4;
  --base-text-color-1: #cdd6f4;
  --base-text-color-2: #a6adc8;
  --base-border-color: #313244;
  --base-subtle-bg: #313244;
  --base-accent-color: #cba6f7;
  --pa-command-palette-item-active-bg: rgba(203, 166, 247, 0.15);
}
```

## Shadow parts

`palette`, `backdrop`, `container`, `input`, `results`, `footer` — for one-off overrides:

```css
web-command-palette::part(container) { border: 1px solid hotpink; }
```
