# Theming

The palette ships its own plain CSS (`src/css/*.css`, the same layout as web-multiselect),
inlined into the shadow root.

## Two namespaces: `--cp-*` and `--base-*`

The component reads **only** its own `--cp-*` knobs and the shared Keenmate `--base-*` variables
(`@keenmate/base-css-variables` 2.0). Every `--cp-*` knob is declared on `:host` and reads a
`--base-*` token, with an inline fallback for a page without one:

```css
:host {
  --cp-accent-color: var(--base-primary-color, #0ea5e9);
  --cp-item-active-bg: var(--base-highlighted-bg, var(--cp-accent-color-light));
}
```

So:

- **a pure-admin page** (or any page loading `base-variables.css`) themes the palette through the
  `--base-*` variables it already defines, on `:root` or any ancestor;
- **a `--cp-*` override** goes on the element itself, or a rule that matches it:
  `web-command-palette { --cp-width: 680px; }` (a `--cp-*` set only on an ancestor is shadowed by
  the `:host` default);
- **an unthemed page** gets the Corporate look, light or dark (the fallbacks are `light-dark()`
  pairs, following the page's `color-scheme`).

(`--_cp-*` names are private plumbing — don't set them.)

## Sizing: `--base-rem`

Every size is `calc(<multiplier> * var(--cp-rem))`, and `--cp-rem` is `var(--base-rem, 10px)`.
pure-admin sizes everything in 10px rems; a plain `rem` inside the shadow root would resolve
against the host page's root (often 16px).

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

## Font family

The palette uses `--base-font-family` if set, else the page's font — the input and buttons
included (form controls don't inherit fonts on their own, so the component tells them to).
Keycaps keep a system UI stack by default; `--cp-key-font-family` changes them.

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
| `--cp-scrollbar-thumb-bg` / `-thumb-bg-hover` / `-track-bg` | Results scrollbar colours (default: `--base-border-color` thumb on a transparent track) |
| `--cp-scrollbar-width` / `-thumb-border-radius` | Results scrollbar size and thumb radius (WebKit; Firefox and Chromium 121+ draw a thin bar) |
| `--cp-confirm-min-height` | Height the dialog shrinks to (animated) while showing the confirmation. Default 16 × `--base-rem` |

`size="sm|lg|xl"` presets set width + results height together (480/288, 768/512, 896/640 px at
the default `--base-rem`).

The full list of `--base-*` variables the palette reads is in
[`component-variables.manifest.json`](../component-variables.manifest.json) (validated against the
built bundle by `npm run check:vars`).

## Example: dark

```css
html.dark {
  --base-main-bg: #1e1e2e;
  --base-input-bg: #181825;
  --base-input-text-color: #cdd6f4;
  --base-text-color-1: #cdd6f4;
  --base-text-color-2: #a6adc8;
  --base-border-color: #313244;
  --base-subtle-bg: #313244;
  --base-primary-color: #cba6f7;
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

## Beyond variables: `::part()`

Variables cover colours, radii, sizes, fonts and icons. For anything else — the dialog's shadow
or border, the input's shape — style the shadow parts directly (list below). The **theme gallery**
on the theming examples page (TH01) combines all three to build seven very different palettes —
dark, neon, corporate, soft, brutalist, terminal, material — without touching the component's CSS.

## Shadow parts

`palette`, `backdrop`, `container`, `input`, `results`, `footer` — for one-off overrides:

```css
web-command-palette::part(container) { border: 1px solid hotpink; }
```
