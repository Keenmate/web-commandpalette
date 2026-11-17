/**
 * Keyboard handling (IMPLEMENTATION_PLAN §10 keyboard map). Every key combo goes through
 * core `/actions` (`bindShortcuts`, `matchesShortcut`, `parseShortcut` — SPEC §12.12).
 *
 *  - Global (document): Ctrl/⌘+<openKey> (`Mod+<openKey>`) toggles; sequences (`g <letter>`)
 *    open a command — plain keys, inert while typing or while the palette is open, core's
 *    sequence window (1000 ms). (Chosen over Alt+letter, which types glyphs on macOS:
 *    Option+G = ©.)
 *  - Input: ↑↓ wrap, PgUp/PgDn ±8 clamp, Home/End, ←→ page (search modes, caret at
 *    the edge; mirrored in RTL), Tab select (one wizard step), Shift+Tab step back, Enter select —
 *    and in a replayed run, accept the remaining remembered answers — Esc
 *    back-or-close, Backspace at the locked prefix steps back, Ctrl/⌘+D star the
 *    active row. Navigation never awaits a provider.
 */
import { isImeEnter } from '@keenmate/web-components-core';
import { bindShortcuts, matchesShortcut, parseShortcut, type ShortcutBinding } from '@keenmate/web-components-core/actions';
import type { PaletteEngine } from './palette';
import { DEFAULT_PALETTE_KEYS, type Command, type PaletteKeys } from './types';

/** `'Mod+<letter>'` — the palette's Ctrl/⌘ chords (open key, star, favorites, recent); '' when off. */
export const modChord = (key: string | null | undefined): string => (key ? `Mod+${key}` : '');

/** Is `shortcut` a key sequence (`'g d'`)? Only sequences run globally; a chord (`'Ctrl+K'`) is display-only. */
export const isSequence = (shortcut: string | null | undefined): boolean => parseShortcut(shortcut ?? undefined).length > 1;

export interface GlobalKeysHost {
  isOpen(): boolean;
  toggle(): void;
  openKey(): string;
  commands(): readonly Command[];
  /** Run a command bound to a sequence; `e` is the keydown. */
  runCommand(command: Command, e: KeyboardEvent): void;
  /** Built-in sequences (e.g. `'g f'` → favorites): shortcut → action. Commands win on a clash. */
  sequences?(): ReadonlyMap<string, () => void>;
}

/**
 * Bind the document-level keys; returns the unbind. One palette per page owns them (the
 * element binds them only for the first connected instance). The sequences are bound first, so
 * Ctrl/⌘+<openKey> also cancels a started sequence; the open key is its own binding so it works
 * even right after a sequence's first key.
 */
export function bindGlobalKeys(host: GlobalKeysHost): () => void {
  const isClosed = (): boolean => !host.isOpen();
  const sequences = (): ShortcutBinding[] => [
    // Commands first: the first full match wins, so a command beats a built-in on the same keys.
    ...host.commands()
      .filter((c) => isSequence(c.shortcut))
      .map((c): ShortcutBinding => ({ shortcut: c.shortcut, run: (e) => host.runCommand(c, e), isEnabled: isClosed })),
    ...Array.from(host.sequences?.() ?? [], ([shortcut, run]): ShortcutBinding => ({ shortcut, run: () => run(), isEnabled: isClosed })),
  ];
  const unbindSequences = bindShortcuts(document, sequences);
  const unbindOpen = bindShortcuts(document, () => [
    { shortcut: modChord(host.openKey()), run: () => host.toggle() },
  ]);
  return () => {
    unbindSequences();
    unbindOpen();
  };
}

/** Keydown inside the palette input. Returns true when handled. */
export function handleInputKeydown(
  e: KeyboardEvent,
  m: PaletteEngine,
  input: HTMLInputElement,
  keys: PaletteKeys = DEFAULT_PALETTE_KEYS,
  /** Right-to-left: ←/→ paging swaps so "previous" is the arrow toward the inline start. */
  isRTL = false,
): boolean {
  if (isImeEnter(e)) return false;
  // Ctrl/⌘ + key (`Mod+<key>`): palette shortcuts (they shadow the browser's find/reload/bookmark while open).
  const is = (key: string): boolean => matchesShortcut(e, modChord(key));
  if (is(keys.favorite)) { m.toggleFavorite(); e.preventDefault(); return true; }
  if (is(keys.favorites)) { m.showUsage('favorites'); e.preventDefault(); return true; }
  if (is(keys.recent)) { m.showUsage('recent'); e.preventDefault(); return true; }
  const start = input.selectionStart ?? 0;
  const end = input.selectionEnd ?? 0;
  const handled = (): true => {
    e.preventDefault();
    return true;
  };
  switch (e.key) {
    case 'ArrowDown': m.move('down'); return handled();
    case 'ArrowUp': m.move('up'); return handled();
    case 'PageDown': m.move('pageDown'); return handled();
    case 'PageUp': m.move('pageUp'); return handled();
    case 'Home': m.move('home'); return handled();
    case 'End': m.move('end'); return handled();
    case 'Enter':
      m.commit();
      return handled();
    case 'Tab':
      if (e.shiftKey) {
        if (m.canStepBack) m.back();
        return handled();
      }
      m.select();
      return handled();
    case 'Escape':
      m.back();
      return handled();
    case 'ArrowLeft':
    case 'ArrowRight': {
      // "Back" is the arrow pointing at the inline start: ← in LTR, → in RTL.
      const isBack = (e.key === 'ArrowLeft') !== isRTL;
      if (isBack) {
        if (m.isPaginated && start === end && start <= m.lockedLength) {
          m.turnPage(-1);
          return handled();
        }
        // Keep the caret out of the locked prefix.
        if (m.lockedLength && start === end && start <= m.lockedLength) return handled();
        return false;
      }
      if (m.isPaginated && start === end && end === input.value.length) {
        m.turnPage(1);
        return handled();
      }
      return false;
    }
    case 'Backspace':
      if (!m.canStepBack) return false;
      // Caret at the locked prefix (or at 0 in tokens display) with nothing selected → step back.
      if (start === end && start <= m.lockedLength) {
        m.back();
        return handled();
      }
      // A selection reaching into the prefix: protect the prefix.
      if (start < m.lockedLength) return handled();
      return false;
  }
  return false;
}
