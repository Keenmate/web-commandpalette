#!/usr/bin/env node
/**
 * Validates `component-variables.manifest.json` against the CSS the component
 * actually ships (core's palette partial compiled through src/css/main.scss and
 * the shadow-root PostCSS adapter — see scripts/shadow-css.mjs).
 *
 * The manifest feeds the IDE-autocomplete outputs (`vscode.css-custom-data.json`,
 * `web-types.json`) and theme-designer, but it's hand-maintained — so this guard
 * turns drift into a build failure.
 *
 * Contract:
 *   - Every `--base-*` READ via `var()` must appear in `baseVariables`, and every
 *     `baseVariables` entry must be read (no dead entries).
 *   - Every `--pa-command-palette-*` READ must appear in `componentVariables`, and
 *     every `componentVariables` entry must be read. (The palette's own knobs are
 *     consumed, not declared: core declares them on a pure-admin page's `:root`;
 *     here their defaults are injected as `var()` fallbacks.)
 *
 * `--strict` also fails on undocumented component vars (default: warning).
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileShadowCss } from './shadow-css.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const strict = process.argv.includes('--strict');

const { css: built } = await compileShadowCss(join(root, 'src/css/main.scss'));
const css = built.replace(/\/\*[\s\S]*?\*\//g, '');

const read = (prefix) => new Set([...css.matchAll(new RegExp(String.raw`var\(\s*--(${prefix}[a-z0-9-]*)`, 'gi'))].map((m) => m[1]));
const usedBase = read('base-');
const usedComponent = read('pa-command-palette-');

const manifest = JSON.parse(readFileSync(join(root, 'component-variables.manifest.json'), 'utf8'));
const manifestBase = new Set(manifest.baseVariables.map((v) => v.name));
const manifestComponent = new Set(manifest.componentVariables.map((v) => v.name));

const minus = (a, b) => [...a].filter((x) => !b.has(x)).sort();
const baseMissing = minus(usedBase, manifestBase);
const baseDead = minus(manifestBase, usedBase);
const compDead = minus(manifestComponent, usedComponent);
const compMissing = minus(usedComponent, manifestComponent);

const section = (title, list) => `${title} (${list.length}):\n` + list.map((n) => `  --${n}`).join('\n');
const errors = [];
const warns = [];
if (baseMissing.length) errors.push(section('--base-* read by the CSS but MISSING from manifest.baseVariables', baseMissing));
if (baseDead.length) errors.push(section('--base-* in manifest.baseVariables but NOT read by the CSS (dead)', baseDead));
if (compDead.length) errors.push(section('--pa-command-palette-* in manifest.componentVariables but NOT read by the CSS (dead)', compDead));
if (compMissing.length) (strict ? errors : warns).push(section('--pa-command-palette-* read by the CSS but MISSING from manifest.componentVariables', compMissing));

if (process.argv.includes('--list')) {
  console.log(JSON.stringify({ base: [...usedBase].sort(), component: [...usedComponent].sort() }, null, 2));
}
if (warns.length) console.warn('\n⚠ variable-manifest warnings:\n\n' + warns.join('\n\n') + '\n');
if (errors.length) {
  console.error('\n✗ variable manifest out of sync with CSS:\n\n' + errors.join('\n\n'));
  console.error('\nEdit component-variables.manifest.json (source of truth for IDE autocomplete + theme-designer), then rebuild.\n');
  process.exit(1);
}
console.log(`✓ variable manifest in sync — ${manifestBase.size} base, ${manifestComponent.size} component vars.`);
