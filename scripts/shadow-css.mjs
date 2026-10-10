/**
 * Build-time adapter that lets pure-admin-core's command-palette SCSS run inside
 * a shadow root WITHOUT forking it (IMPLEMENTATION_PLAN §11). Wired into Vite as
 * a PostCSS plugin and reused by `check-variable-manifest.mjs`.
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
 *    `--base-rem` knob the other KeenMate components use (pure-admin hosts set it
 *    to `1rem` to follow their root font-size). Media-query params are untouched.
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
      if (rule.selector.includes(':root')) rule.selector = rule.selector.replace(/:root\b/g, ':host');
    },
    Declaration(decl) {
      if (done.has(decl)) return;
      done.add(decl);
      decl.value = remToVar(injectFallbacks(decl.value, defaults));
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
      return `export default ${JSON.stringify(css)};`;
    },
  };
}
