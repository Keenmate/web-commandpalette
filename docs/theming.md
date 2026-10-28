# Theming

The palette ships its own plain CSS (`src/css/*.css`, the same layout as web-multiselect),
inlined into the shadow root.

## Two namespaces: `--cp-*` and `--base-*`

The component reads **only** its own `--cp-*` knobs and the shared Keenmate `--base-*` variables
(`@keenmate/base-css-variables` 2.0). Every `--cp-*` knob is declared on `:host` and reads a
`--base-*` token, with an inline fallback for a page without one:

```css
:host {
  --cp-accent-color: var(--base-primary-color, #3b82f6);
  --cp-item-active-outline: var(--base-focused-outline, 1px solid var(--cp-accent-color));
}
```

So:

- **a pure-admin page** (or any page loading `base-variables.css`) themes the palette through the
  `--base-*` variables it already defines. Set them on `:root`. On an ancestor, only the *input*
  tokens (`--base-primary-color`, `--base-main-bg`, `--base-text-color-1`, …) take effect there;
  the *derived* ones (tints, hover, borders, the focus halo) are calculated where they are declared
  — `:root`, `[data-theme]` or `.base-scope` — so put a re-themed subtree on a
  `class="base-scope"` (or `data-theme`) element to have them recalculate;
- **a `--cp-*` override** goes on the element itself, or a rule that matches it:
  `web-command-palette { --cp-width: 680px; }` (a `--cp-*` set only on an ancestor is shadowed by
  the `:host` default);
- **an unthemed page** gets the contract's default look, light or dark (the fallbacks are
  `light-dark()` pairs, following the page's `color-scheme`). The fallbacks *are* the contract:
  inputs fall back to its defaults (accent `#3b82f6`, `--cp-bg`, `--cp-page-bg`, text), and every
  derived color (tints, hover, borders, keycaps, text on the accent and on the badges) to the
  contract's formula on the `--cp-*` input — so `web-command-palette { --cp-accent-color: … }`
  brings its tint and on-accent text along, and the palette looks the same with or without
  `base-variables.css` (`npm run check:contract` and `e2e/contract-parity.spec.ts` keep it so).

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
contract web-multiselect uses: `calc(var(--base-font-size-sm, 1.4) * var(--cp-rem))`.

| Variable (default) | Used for |
|---|---|
| `--base-font-size-base` (1.6) | The search input and its placeholder, the confirmation line |
| `--base-font-size-sm` (1.4) | Row titles, empty / loading text |
| `--base-font-size-xs` (1.2) | Meta lines, keycaps, footer hints, the context pill, badges, token prompt, pagination |
| `--base-font-size-2xs` (1) | Section headings |
| `--base-font-size-lg` (1.8) | Icon-font glyphs (`<i>`) in the row icon box |

A pure-admin theme already defines these on `:root`, so the palette follows it. For a smaller
input only: `--base-font-size-base: 1.4` (note this also affects anything else on the page that
reads it).

## Font family

The palette uses `--base-font-family` if set, else the page's font — the input and buttons
included (form controls don't inherit fonts on their own, so the component tells them to).
Keycaps use the same font by default; `--cp-key-font-family` changes them.

## Motion

Durations use the contract's speeds only: `--cp-transition-fast` / `-normal` / `-medium` read
`--base-duration-fast` / `-normal` / `-medium` (0.1s / 0.15s / 0.25s); easings `--cp-easing` /
`-easing-out` read `--base-ease-standard` / `--base-ease-out`. There is no attribute for it —
motion is CSS only:

- **One palette:** `web-command-palette { --cp-transition-fast: 0s; --cp-transition-normal: 0s; --cp-transition-medium: 0s; }`
- **The whole page:** `:root { --base-duration-fast: 0s; --base-duration-normal: 0s; --base-duration-medium: 0s; --base-duration-slow: 0s; }`
- **`prefers-reduced-motion: reduce`** sets the `--cp-transition-*` durations to `0s` and hides the
  feedback countdown bar. The "Searching…" spinner keeps turning (1s per turn): it is the only sign
  that a search is running.

## Palette knobs

| Variable | Purpose |
|---|---|
| `--cp-width` | Dialog max width |
| `--cp-offset-top` | Distance from the top of the viewport |
| `--cp-results-max-height` | Results list max height |
| `--cp-backdrop-bg` | Backdrop colour |
| `--cp-backdrop-filter` | Backdrop filter (`none` to disable the blur) |
| `--cp-item-hover-bg` / `-item-active-bg` | Row backgrounds |
| `--cp-disabled-opacity` | Dimming of anything disabled (default `--base-disabled-opacity`, 0.65) |
| `--cp-item-disabled-opacity` / `-item-danger-color` | A disabled command row (`isDisabled`, default `--cp-disabled-opacity`) / a destructive one's title (`isDanger`, default `--base-danger-text-color`) |
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

`--base-*` goes on `:root` / a theme scope; `--cp-*` knobs go on the element:

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
}
html.dark web-command-palette {
  --cp-item-active-bg: rgba(203, 166, 247, 0.15); /* add a fill under the cursor outline */
}
```

## Icons

Every glyph the palette draws is a CSS mask painted in `currentColor`, and each one is a variable
— set it to any `url(...)` (an SVG data URL, a file). Like web-multiselect's `--ms-icon-*`, each
chains to the shared `--base-icon-*` glyph where one exists, then to an inline Lucide SVG:

| Variable | Glyph | Chain |
|---|---|---|
| `--cp-icon-close` | ✕ fullscreen close | → `--base-icon-close` → Lucide `x` |
| `--cp-icon-remove` | ✕ take a command token out | → `--base-icon-remove` → `--cp-icon-close` |
| `--cp-icon-check` | ✓ confirmation | → `--base-icon-check` → Lucide `check` |
| `--cp-icon-star` / `--cp-icon-star-filled` | ☆ / ★ favorite toggle | → Lucide `star` (outline / filled) |
| `--cp-icon-<name>` | an item `icon: '<name>'` | → `--base-icon-<name>` (search, settings, user, bell, edit, delete, add, copy, save, …) |
| `--cp-icon-size` | size of a masked glyph | default `1em` (row icons are 1.8 × `--cp-rem`) |

An item icon given by **name** draws the shared `--base-icon-<name>` glyph; a name outside the
contract draws nothing (icon-font classes can't reach inside the shadow root — pass an inline
`<svg>` or an emoji instead).

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
