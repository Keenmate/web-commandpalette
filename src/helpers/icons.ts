/**
 * Item icons are DATA (IMPLEMENTATION_PLAN §12): the host converts its icon system
 * to one of three string shapes when it builds commands/contexts/options/results.
 * No built-in icon set, no scraping of host DOM.
 *
 *  - `<svg …>` (starts with `<`)   → injected raw. The host vouches for this markup.
 *  - `fa-gear`, `x`, `search` (ASCII-letter start) → an icon NAME, rendered as
 *    `<span class="cp__icon cp__icon--NAME">` (a masked glyph in currentColor).
 *  - `🚀` / any other glyph        → rendered as text.
 */
import { escapeHtml } from '@keenmate/web-components-core';

/**
 * Core's `escapeHtml` for any value: `null` / `undefined` → `''`, others stringified. Host
 * data (`badge: 3`, a numeric `meta`) arrives from untyped JS; core's string-only escape
 * would throw on it.
 */
export function escapeValue(value: unknown): string {
  return escapeHtml(String(value ?? ''));
}

/** HTML for an icon value, or `''` when there is none. */
export function renderIcon(icon: string | null | undefined): string {
  if (icon == null) return '';
  const value = String(icon).trim();
  if (!value) return '';
  if (value.startsWith('<')) return value;
  if (/^[A-Za-z]/.test(value)) {
    const name = value.replace(/[^A-Za-z0-9_-]/g, '');
    return `<span class="cp__icon cp__icon--${name}" aria-hidden="true"></span>`;
  }
  return escapeValue(value);
}
