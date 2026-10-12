/**
 * Build-time adapter that lets pure-admin-core's command-palette SCSS run inside
 * a shadow root WITHOUT forking it (IMPLEMENTATION_PLAN §11). Wired into Vite as
 * a Vite plugin; the build fails if a pure-admin variable survives it, and
 * `kmwc check-vars` validates the manifest against the built bundle.
 *
 * Two rewrites, both on the compiled CSS:
 *
 * 1. **Theme defaults as `var()` fallbacks, never declarations.** Core reads
 *    `var(--pc-accent)`, `var(--pa-modal-content-bg)`, … with no fallback; a
 *    pure-admin page defines them at `:root`. Declaring defaults on `:host` would
 *    SHADOW the host theme (a declaration on the element beats the inherited
 *    value), so instead every fallback-less `var(--x)` gets core's own default
 *    injected as its fallback: `var(--x, <default>)`. A themed host still wins
 *    (custom properties pierce shadow DOM); an unthemed host gets core's defaults.
 *    The defaults are compiled from core's own emit mixins — single-sourced.
 *
 * 2. **`rem` → `--base-rem`.** pure-admin sizes everything in 10px rems (it sets
 *    `html { font-size: 10px }`). Inside a shadow root `rem` still resolves
 *    against the HOST page's root, so on a 16px page everything would be 1.6×.
 *    Every `Nrem` becomes `calc(N * var(--base-rem, 10px))` — the same shared
 *    `--base-rem` knob the other Keenmate components use (pure-admin hosts set it
 *    to `1rem` to follow their root font-size). Media-query params are untouched.
 *
 * 3. **Font sizes → `--base-font-size-*`.** Core compiles its type scale to plain
 *    numbers (`$font-size-sm` → `1.4rem`), so a host's `--base-font-size-sm` would
 *    never reach the palette. On `font-size` (and `*-font-size` custom properties),
 *    a rem value that is a step of the shared scale becomes
 *    `calc(var(--base-font-size-sm, 1.4) * var(--base-rem, 10px))` — the same
 *    contract web-multiselect uses. Off-scale values (e.g. `$font-size-md`, 1.5)
 *    stay plain `--base-rem` multiples.
 *
 * Also maps `:root` selectors to `:host` (`:root` never matches inside a shadow tree).
 */
import * as sass from 'sass';
import postcss from 'postcss';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const loadPaths = [join(root, 'node_modules')];
const SASS_OPTIONS = { loadPaths, quietDeps: true, silenceDeprecations: ['import', 'global-builtin'] };

/** The SCSS that emits core's theme defaults (base + pc + component tokens + icon glyphs). */
const DEFAULTS_SCSS = `
@import '@keenmate/pure-admin-core/src/scss/base-css-variables';
:root {
  @include output-base-css-variables;
  @include output-pc-css-variables;
  @include output-pc-component-variables;
}
@import '@keenmate/pure-admin-core/src/scss/core-components/icons';
`;

export const REM_VAR = 'var(--base-rem, 10px)';

/** Compile core's emit mixins and collect every `:root` custom-property default. */
export function compileDefaults() {
  const { css } = sass.compileString(DEFAULTS_SCSS, SASS_OPTIONS);
  const defaults = new Map();
  postcss.parse(css).walkRules((rule) => {
    if (rule.selector.trim() !== ':root') return;
    rule.walkDecls((decl) => {
      if (decl.prop.startsWith('--') && !defaults.has(decl.prop)) defaults.set(decl.prop, decl.value);
    });
  });
  return defaults;
}

/** Index of the paren closing the one opened at `open`, or -1. */
function matchParen(s, open) {
  let depth = 0;
  for (let i = open; i < s.length; i++) {
    if (s[i] === '(') depth++;
    else if (s[i] === ')' && --depth === 0) return i;
  }
  return -1;
}

/** Index of the first top-level comma in `s`, or -1. */
function topLevelComma(s) {
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '(') depth++;
    else if (s[i] === ')') depth--;
    else if (s[i] === ',' && depth === 0) return i;
  }
  return -1;
}

/** Give every fallback-less `var(--x)` the default from `defaults` (recursively, cycle-safe). */
export function injectFallbacks(value, defaults, seen = new Set()) {
  let out = '';
  let i = 0;
  while (i < value.length) {
    const at = value.indexOf('var(', i);
    if (at === -1) break;
    const close = matchParen(value, at + 3);
    if (close === -1) break;
    out += value.slice(i, at);
    const inner = value.slice(at + 4, close);
    const comma = topLevelComma(inner);
    const name = (comma === -1 ? inner : inner.slice(0, comma)).trim();
    let fallback = comma === -1 ? null : inner.slice(comma + 1).trim();
    if (fallback !== null) {
      fallback = injectFallbacks(fallback, defaults, seen);
    } else if (defaults.has(name) && !seen.has(name)) {
      fallback = injectFallbacks(defaults.get(name), defaults, new Set([...seen, name]));
    }
    out += fallback === null ? `var(${name})` : `var(${name}, ${fallback})`;
    i = close + 1;
  }
  return out + value.slice(i);
}

/** pure-css's `$base-font-size-*` scale: rem multiplier → step name. */
export const FONT_SCALE = new Map([
  ['1', '2xs'], ['1.2', 'xs'], ['1.4', 'sm'], ['1.6', 'base'], ['1.8', 'lg'], ['2', 'xl'], ['2.4', '2xl'],
]);

const isFontSizeProp = (prop) => prop === 'font-size' || /^--.*font-size$/.test(prop);

/** On a font-size: `1.4rem` → `calc(var(--base-font-size-sm, 1.4) * var(--base-rem, 10px))` (scale steps only). */
export function fontSizeToVar(value) {
  return value.replace(/(^|[^\w.-])(\d*\.?\d+)rem\b/g, (m, pre, n) => {
    const step = FONT_SCALE.get(String(Number(n)));
    return step ? `${pre}calc(var(--base-font-size-${step}, ${Number(n)}) * ${REM_VAR})` : m;
  });
}

/**
 * The component's own namespace. Core's palette knobs and icon plumbing become
 * `--cp-*`; everything else in pure-admin's layer (`--pc-*`, `--pa-input-*`,
 * `--pa-btn-*`, …) is unwrapped to its fallback — which injectFallbacks has made
 * the `--base-*` chain — so the component reads only `--cp-*` and `--base-*`.
 */
const RENAMES = [
  [/^--pa-command-palette-/, '--cp-'],
  [/^--pa-icon-x$/, '--cp-icon-close'],
  [/^--pa-icon-src$/, '--_cp-icon-src'], // private plumbing: which glyph a .pa-icon draws
  [/^--pa-icon-/, '--cp-icon-'],
];

/** `--pa-command-palette-width` → `--cp-width`; null when the name isn't renamed. */
export function renameVar(name) {
  for (const [re, to] of RENAMES) if (re.test(name)) return name.replace(re, to);
  return null;
}

/** A pure-admin variable outside the component namespace. */
export const isForeignVar = (name) => /^--(pa|pc)-/.test(name) && renameVar(name) === null;

/** Rename `--cp-*` reads and replace foreign `var(--pc-x, fb)` reads with `fb` (recursively). */
export function namespaceVars(value) {
  let out = '';
  let i = 0;
  while (i < value.length) {
    const at = value.indexOf('var(', i);
    if (at === -1) break;
    const close = matchParen(value, at + 3);
    if (close === -1) break;
    out += value.slice(i, at);
    const inner = value.slice(at + 4, close);
    const comma = topLevelComma(inner);
    const name = (comma === -1 ? inner : inner.slice(0, comma)).trim();
    const fallback = comma === -1 ? null : namespaceVars(inner.slice(comma + 1).trim());
    if (isForeignVar(name) && fallback !== null) {
      out += fallback;
    } else {
      const ref = renameVar(name) ?? name;
      out += fallback === null ? `var(${ref})` : `var(${ref}, ${fallback})`;
    }
    i = close + 1;
  }
  return out + value.slice(i);
}

/** `1.6rem` → `calc(1.6 * var(--base-rem, 10px))`. */
export function remToVar(value) {
  return value.replace(/(-?\d*\.?\d+)rem\b/g, (_, n) => `calc(${n} * ${REM_VAR})`);
}

/** The PostCSS plugin. `defaults` comes from {@link compileDefaults}. */
export function shadowCss(defaults = compileDefaults()) {
  const done = new WeakSet();
  return {
    postcssPlugin: 'km-shadow-css',
    Rule(rule) {
      // Core's partial also styles the navbar search pill that OPENS a palette on a
      // pure-admin page; that markup never exists inside this shadow root.
      if (rule.selector.includes('pc-navbar-search')) {
        rule.remove();
        return;
      }
      if (rule.selector.includes(':root')) rule.selector = rule.selector.replace(/:root\b/g, ':host');
    },
    Declaration(decl) {
      if (done.has(decl)) return;
      done.add(decl);
      // A custom-property declaration: our namespace keeps it (renamed); a foreign
      // one (core setting `--pc-*` on a rule) has no reader left after unwrapping.
      if (decl.prop.startsWith('--')) {
        const renamed = renameVar(decl.prop);
        if (renamed) decl.prop = renamed;
        else if (isForeignVar(decl.prop)) {
          decl.remove();
          return;
        }
      }
      let value = namespaceVars(injectFallbacks(decl.value, defaults));
      if (isFontSizeProp(decl.prop)) value = fontSizeToVar(value);
      decl.value = remToVar(value);
    },
  };
}
shadowCss.postcss = true;


/**
 * Compile an SCSS entry with plain Sass (core's partials resolve through the
 * `node_modules` load path) and run the shadow-root adapter over it. Returns the
 * CSS and the files it was built from (for watch mode).
 */
export async function compileShadowCss(file, defaults) {
  const result = sass.compile(file, SASS_OPTIONS);
  const { css } = await postcss([shadowCss(defaults)]).process(result.css, { from: undefined });
  return { css, files: result.loadedUrls.filter((u) => u.protocol === 'file:').map((u) => fileURLToPath(u)) };
}

/** Pure-admin variables (`--pa-*` / `--pc-*`) left in compiled CSS — the adapter should have renamed or unwrapped them all. */
export function findForeignVars(css) {
  const code = css.replace(/\/\*[\s\S]*?\*\//g, '');
  return [...new Set(code.match(/--(?:pa|pc)-[a-z0-9-]+/gi) ?? [])].sort();
}

/**
 * Vite plugin: `import styles from './css/main.scss?inline'` → the adapted CSS
 * string. Bypasses Vite's own Sass importer, which applies package `exports` to
 * the bare `@import`s INSIDE core's SCSS and rejects them.
 */
export function shadowCssPlugin() {
  const PREFIX = '\0km-shadow-css:';
  const SUFFIX = '.js';
  let defaults;
  return {
    name: 'km-shadow-css',
    enforce: 'pre',
    // Re-home `*.scss?inline` to a virtual id so Vite's CSS pipeline never sees it.
    resolveId(source, importer) {
      const [file, query] = source.split('?');
      if (!file.endsWith('.scss') || query !== 'inline' || !importer) return null;
      // `.scss.js`: Vite's CSS plugin matches ids on a trailing `.scss` / `.scss?…`.
      return PREFIX + resolve(dirname(importer.split('?')[0]), file) + SUFFIX;
    },
    async load(id) {
      if (!id.startsWith(PREFIX)) return null;
      const file = id.slice(PREFIX.length, -SUFFIX.length);
      defaults ??= compileDefaults();
      const { css, files } = await compileShadowCss(file, defaults);
      for (const f of files) this.addWatchFile(f);
      // The component's namespace is --cp-* (+ the shared --base-*): no pure-admin variable may leak in.
      const foreign = findForeignVars(css);
      if (foreign.length) this.error(`--pa-* / --pc-* variables in the shipped CSS (must be --cp-* or --base-*): ${foreign.join(', ')}`);
      return `export default ${JSON.stringify(css)};`;
    },
  };
}
