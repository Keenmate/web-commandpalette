# Theming

The palette's CSS **is** pure-admin-core's `_command-palette.scss`, compiled into the shadow root
(plus core's badge and spinner primitives). It is never copied: a rebuild re-pulls core's partial.

## Two namespaces: `--cp-*` and `--base-*`

The component is independent: it reads **only** its own `--cp-*` knobs and the shared Keenmate
`--base-*` variables. Core's rules read pure-admin's layers (`--pc-*`, `--pa-*`); at build time
(`scripts/shadow-css.mjs`) the palette's own `--pa-command-palette-*` knobs are renamed to `--cp-*`,
and every other pure-admin read is resolved to its `--base-*` fallback:

```css
/* core:      background-color: var(--pa-modal-content-bg);                */
/* compiled:  background-color: var(--base-main-bg, #ffffff);               */
/* core:      background: var(--pa-command-palette-item-active-bg);         */
/* compiled:  background-color: var(--cp-item-active-bg, rgba(14, 165, 233, 0.1)); */
```

Nothing is *declared* inside the component, so:

- **a pure-admin page** themes the palette through the `--base-*` variables it already defines;
- **any page** can theme it through `--base-*`, or the `--cp-*` knobs, on `:root`, any ancestor or
  the element itself;
- **an unthemed page** gets core's light defaults.

(`--_cp-*` names are private plumbing — don't set them.)

## Sizing: `--base-rem`

pure-admin sizes everything in 10px rems. Inside a shadow root `rem` would resolve against the
host page's root (often 16px), so every `Nrem` is compiled to `calc(N * var(--base-rem, 10px))`.

| Host | Set |
|---|---|
| pure-admin (`html { font-size: 10px }`) | `--base-rem: 1rem` to follow the root font size (or leave the 10px default) |
| anything else | nothing — the default is 10px — or scale with e.g. `--base-rem: 8px` |

## Font sizes: `--base-font-size-*`

Every font size sits on the shared type scale — unitless multipliers of `--base-rem`, the same
contract web-multiselect uses. Core compiles its scale to plain numbers, so the build maps each
step back to its variable: `calc(var(--base-font-size-sm, 1.4) * var(--base-rem, 10px))`.

| Variable (default) | Used for |
|---|---|
| `--base-font-size-base` (1.6) | The search input and its placeholder |
| `--base-font-size-sm` (1.4) | Row titles, empty / loading text |
| `--base-font-size-xs` (1.2) | Meta lines, keycaps, footer hints, the context pill |
| `--base-font-size-2xs` (1) | Section headings |
| `--base-font-size-lg` (1.8) | Icon-font glyphs (`<i>`) in the row icon box |

A pure-admin theme already defines these on `:root`, so the palette follows it. For a smaller
input only: `--base-font-size-base: 1.4` (note this also affects anything else on the page that
reads it).

## Palette knobs

| Variable | Purpose |
|---|---|
| `--cp-width` | Dialog max width |
| `--cp-offset-top` | Distance from the top of the viewport |
| `--cp-results-max-height` | Results list max height |
| `--cp-backdrop-bg` | Backdrop colour |
| `--cp-backdrop-filter` | Backdrop filter (`none` to disable the blur) |
| `--cp-item-hover-bg` / `-item-active-bg` | Row backgrounds |
| `--cp-highlight-bg` / `-highlight-text` | `<mark>` query highlight |
| `--cp-key-bg` / `-key-text` / `-key-font-size` / `-key-font-weight` | Keycaps |
| `--cp-confirm-min-height` | Height the dialog shrinks to (animated) while showing the confirmation. Default 16 × `--base-rem` |

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
  --cp-item-active-bg: rgba(203, 166, 247, 0.15);
}
```

## Icons

Every glyph the palette draws is a CSS mask painted in `currentColor`, and each one is a variable
— set it to any `url(...)` (an SVG data URL, a file). Like web-multiselect's `--ms-icon-*`, each
chains to the shared `--base-icon-*` glyph where one exists, then to an inline Lucide SVG:

| Variable | Glyph | Chain |
|---|---|---|
| `--cp-icon-close` | ✕ token remove, fullscreen close | → `--base-icon-close` → Lucide `x` |
| `--cp-icon-check` | ✓ confirmation | → `--base-icon-check` → Lucide `check` |
| `--cp-icon-star` / `--cp-icon-star-filled` | ☆ / ★ favorite toggle | → Lucide `star` (outline / filled) |
| `--cp-icon-size` | size of the masked glyphs | default `1em` |

```css
web-command-palette {
  --cp-icon-star: url('/icons/bookmark.svg');
  --cp-icon-star-filled: url('/icons/bookmark-solid.svg');
}
```

## Shadow parts

`palette`, `backdrop`, `container`, `input`, `results`, `footer` — for one-off overrides:

```css
web-command-palette::part(container) { border: 1px solid hotpink; }
```
