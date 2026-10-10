/**
 * Keyboard handling (IMPLEMENTATION_PLAN §10 keyboard map).
 *
 *  - Global (document): Ctrl/⌘+<openKey> toggles; `g <letter>` leading-key
 *    sequences open a command — modifier-free, inert while typing or while the
 *    palette is open, 1200 ms window. (Chosen over Alt+letter, which types glyphs
 *    on macOS: Option+G = ©.)
 *  - Input: ↑↓ wrap, PgUp/PgDn ±8 clamp, Home/End, ←→ page (search modes, caret at
 *    the edge), Enter/Tab select, Esc back-or-close, Backspace at the locked
 *    prefix steps back. Navigation never awaits a provider.
 */
import type { PaletteMachine } from './palette';
import type { Command } from './types';

export const SEQUENCE_LEADER = 'g';
export const SEQUENCE_WINDOW_MS = 1200;

/** The command whose `hotkey` is the sequence `g <letter>`. Chords (`Ctrl+K`) never match. */
export function findSequenceCommand(commands: readonly Command[], letter: string): Command | undefined {
  const key = letter.toLowerCase();
  return commands.find((c) => {
    const parts = (c.hotkey ?? '').trim().toLowerCase().split(/\s+/);
    return parts.length === 2 && parts[0] === SEQUENCE_LEADER && parts[1] === key;
  });
}

/** Is the (shadow-piercing) event origin a text-entry field? */
export function isTypingTarget(e: Event): boolean {
  const t = (e.composedPath?.()[0] ?? e.target) as HTMLElement | null;
  if (!t || !(t instanceof Element)) return false;
  const tag = t.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (t as HTMLElement).isContentEditable;
}

export interface GlobalKeysHost {
  isOpen(): boolean;
  toggle(): void;
  openKey(): string;
  commands(): readonly Command[];
  runCommand(command: Command): void;
}

/**
 * The document-level listener. One palette per page owns it (the element only
 * installs it for the first connected instance).
 */
export class GlobalKeys {
  #host: GlobalKeysHost;
  #armed = false;
  #timer: ReturnType<typeof setTimeout> | null = null;
  #onKeydown = (e: KeyboardEvent): void => this.handle(e);

  constructor(host: GlobalKeysHost) {
    this.#host = host;
  }

  install(): void {
    document.addEventListener('keydown', this.#onKeydown);
  }

  uninstall(): void {
    document.removeEventListener('keydown', this.#onKeydown);
    this.#disarm();
  }

  handle(e: KeyboardEvent): void {
    if (e.defaultPrevented) return;
    const openKey = this.#host.openKey();
    if (openKey && (e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === openKey.toLowerCase()) {
      e.preventDefault();
      this.#disarm();
      this.#host.toggle();
      return;
    }
    // Sequences are modifier-free and inert while typing or with the palette open.
    if (e.ctrlKey || e.metaKey || e.altKey || this.#host.isOpen() || isTypingTarget(e)) {
      this.#disarm();
      return;
    }
    if (!this.#armed) {
      if (e.key.toLowerCase() === SEQUENCE_LEADER && this.#hasSequences()) {
        this.#armed = true;
        this.#timer = setTimeout(() => this.#disarm(), SEQUENCE_WINDOW_MS);
      }
      return;
    }
    this.#disarm();
    const command = findSequenceCommand(this.#host.commands(), e.key);
    if (command) {
      e.preventDefault();
      this.#host.runCommand(command);
    }
  }

  #hasSequences(): boolean {
    return this.#host.commands().some((c) => /^\s*g\s+\S\s*$/i.test(c.hotkey ?? ''));
  }

  #disarm(): void {
    this.#armed = false;
    if (this.#timer) clearTimeout(this.#timer);
    this.#timer = null;
  }
}

/** Keydown inside the palette input. Returns true when handled. */
export function handleInputKeydown(e: KeyboardEvent, m: PaletteMachine, input: HTMLInputElement): boolean {
  if (e.isComposing) return false;
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
    case 'Tab':
      m.select();
      return handled();
    case 'Escape':
      m.back();
      return handled();
    case 'ArrowLeft':
      if (m.isPaginated && start === end && start <= m.lockedLength) {
        m.turnPage(-1);
        return handled();
      }
      // Keep the caret out of the locked prefix.
      if (m.lockedLength && start === end && start <= m.lockedLength) return handled();
      return false;
    case 'ArrowRight':
      if (m.isPaginated && start === end && end === input.value.length) {
        m.turnPage(1);
        return handled();
      }
      return false;
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
