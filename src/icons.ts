/**
 * Item icons are DATA (IMPLEMENTATION_PLAN §12): the host converts its icon system
 * to one of three string shapes when it builds commands/contexts/options/results.
 * No built-in icon set, no scraping of host DOM.
 *
 *  - `<svg …>` (starts with `<`)   → injected raw. The host vouches for this markup.
 *  - `fa-gear`, `x`, `search` (ASCII-letter start) → an icon NAME, rendered as
 *    `<span class="pa-icon pa-icon--NAME">` (a masked glyph in currentColor).
 *  - `🚀` / any other glyph        → rendered as text.
 */
export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** HTML for an icon value, or `''` when there is none. */
export function renderIcon(icon: string | null | undefined): string {
  if (icon == null) return '';
  const value = String(icon).trim();
  if (!value) return '';
  if (value.startsWith('<')) return value;
  if (/^[A-Za-z]/.test(value)) {
    const name = value.replace(/[^A-Za-z0-9_-]/g, '');
    return `<span class="pa-icon pa-icon--${name}" aria-hidden="true"></span>`;
  }
  return escapeHtml(value);
}
