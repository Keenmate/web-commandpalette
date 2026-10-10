/**
 * Builds and patches the palette DOM inside the shadow root. Markup and classes
 * match pure-admin-core's canonical `snippets/command-palette.html`.
 *
 * The results list is rebuilt only when the machine replaces its items
 * (`listVersion` changed); moving the active row just toggles a class and scrolls
 * it into view, so keyboard navigation is pure DOM work.
 */
import { escapeHtml, renderIcon } from './icons';
import type { PaletteMachine, TokenView, ViewItem } from './palette';
import type { Labels } from './types';

export interface Shell {
  root: HTMLDivElement;
  backdrop: HTMLDivElement;
  container: HTMLDivElement;
  closeButton: HTMLButtonElement;
  fullscreenTitle: HTMLSpanElement;
  tokens: HTMLDivElement;
  input: HTMLInputElement;
  context: HTMLDivElement;
  results: HTMLDivElement;
  footer: HTMLDivElement;
  live: HTMLDivElement;
}

const RESULTS_ID = 'cp-results';
const itemId = (index: number): string => `cp-item-${index}`;

export function createShell(): Shell {
  const root = document.createElement('div');
  root.className = 'pa-command-palette';
  root.setAttribute('part', 'palette');
  root.innerHTML = `
    <div class="pa-command-palette__backdrop" part="backdrop"></div>
    <div class="pa-command-palette__container" part="container" role="dialog" aria-modal="true">
      <div class="pa-command-palette__fullscreen-bar">
        <span class="pa-command-palette__fullscreen-title"></span>
        <button type="button" class="pa-command-palette__close">
          <span class="pa-icon pa-icon--x" aria-hidden="true"></span>
        </button>
      </div>
      <div class="pa-command-palette__search">
        <div class="pa-command-palette__tokens"></div>
        <div class="pa-command-palette__input-wrapper">
          <input type="text" class="pa-command-palette__input" part="input" autocomplete="off" spellcheck="false"
            role="combobox" aria-autocomplete="list" aria-expanded="true" aria-controls="${RESULTS_ID}">
          <div class="pa-command-palette__context" aria-live="polite"></div>
        </div>
      </div>
      <div class="pa-command-palette__results" part="results" id="${RESULTS_ID}" role="listbox"></div>
      <div class="pa-command-palette__footer" part="footer"></div>
      <div class="cp-sr-only" aria-live="polite" aria-atomic="true"></div>
    </div>`;
  const q = <T extends Element>(sel: string): T => root.querySelector(sel) as T;
  return {
    root,
    backdrop: q('.pa-command-palette__backdrop'),
    container: q('.pa-command-palette__container'),
    closeButton: q('.pa-command-palette__close'),
    fullscreenTitle: q('.pa-command-palette__fullscreen-title'),
    tokens: q('.pa-command-palette__tokens'),
    input: q('.pa-command-palette__input'),
    context: q('.pa-command-palette__context'),
    results: q('.pa-command-palette__results'),
    footer: q('.pa-command-palette__footer'),
    live: q('.cp-sr-only'),
  };
}

/** Escape `text`, wrapping case-insensitive occurrences of `needle` in `<mark>`. */
export function highlight(text: string, needle: string): string {
  const q = needle.trim();
  if (!q) return escapeHtml(text);
  const lower = text.toLowerCase();
  const n = q.toLowerCase();
  let out = '';
  let i = 0;
  for (let at = lower.indexOf(n); at !== -1; at = lower.indexOf(n, i)) {
    out += escapeHtml(text.slice(i, at)) + '<mark>' + escapeHtml(text.slice(at, at + n.length)) + '</mark>';
    i = at + n.length;
  }
  return out + escapeHtml(text.slice(i));
}

function keycaps(keys: string[] | undefined): string {
  if (!keys?.length) return '';
  return `<div class="pa-command-palette__shortcut">${keys
    .map((k) => `<span class="pa-command-palette__key">${escapeHtml(k)}</span>`)
    .join(' ')}</div>`;
}

function itemHtml(item: ViewItem, index: number, active: boolean, needle: string): string {
  const icon = renderIcon(item.icon);
  const badge = item.badge
    ? `<span class="pa-badge${item.badgeVariant ? ` pa-badge--${escapeHtml(item.badgeVariant)}` : ''}">${escapeHtml(item.badge)}</span>`
    : '';
  return (
    `<div class="pa-command-palette__item${active ? ' pa-command-palette__item--active' : ''}"` +
    ` id="${itemId(index)}" data-index="${index}" role="option" aria-selected="${active}">` +
    (icon ? `<div class="pa-command-palette__item-icon" aria-hidden="true">${icon}</div>` : '') +
    `<div class="pa-command-palette__item-content">` +
    `<div class="pa-command-palette__item-title">${highlight(item.title ?? '', needle)}</div>` +
    (item.meta ? `<div class="pa-command-palette__item-meta">${escapeHtml(item.meta)}</div>` : '') +
    `</div>` +
    badge +
    keycaps(item.keys) +
    `</div>`
  );
}

function homeHtml(items: ViewItem[], activeIndex: number, labels: Labels): string {
  const section = (key: 'commands' | 'contexts', heading: string): string => {
    const rows = items
      .map((item, index) => (item.section === key ? itemHtml(item, index, index === activeIndex, '') : ''))
      .join('');
    if (!rows) return '';
    return (
      `<div class="pa-command-palette__home-section" role="group" aria-label="${escapeHtml(heading)}">` +
      `<div class="pa-command-palette__home-heading" aria-hidden="true">${escapeHtml(heading)}</div>${rows}</div>`
    );
  };
  return `<div class="pa-command-palette__home">${section('commands', labels.commands)}${section('contexts', labels.search)}</div>`;
}

function tokensHtml(tokens: TokenView[] | null, labels: Labels): string {
  if (!tokens) return '';
  return tokens
    .map((t) => {
      switch (t.type) {
        case 'command':
          return `<span class="pa-badge pa-badge--primary">${escapeHtml(t.label)}</span>`;
        case 'prompt':
          return `<span class="pa-command-palette__token-prompt">${escapeHtml(t.label)}</span>`;
        case 'selection':
          return (
            `<span class="pa-badge"><span>${escapeHtml(t.label)}</span>` +
            `<button type="button" class="pa-badge__remove" data-token="${t.index}" aria-label="${escapeHtml(labels.removeToken.replace('{name}', t.label))}">` +
            `<span class="pa-icon pa-icon--x" aria-hidden="true"></span></button></span>`
          );
      }
    })
    .join('');
}

function footerHtml(m: PaletteMachine, labels: Labels): string {
  const hint = (key: string, text: string): string =>
    `<div class="pa-command-palette__hint"><span class="pa-command-palette__key">${key}</span><span>${escapeHtml(text)}</span></div>`;
  // Mode-aware (IMPLEMENTATION_PLAN §10): ←→ only when paginated, ⌫ only where it
  // steps back, Esc reads Back/Close accordingly. Tab works as select but isn't advertised.
  return [
    hint('↑↓', labels.navigate),
    m.isPaginated ? hint('←→', labels.pages) : '',
    hint('↵', labels.select),
    m.canStepBack ? hint('⌫', labels.back) : '',
    hint('Esc', m.canStepBack ? labels.back : labels.close),
  ].join('');
}

/** Render state. Remembers what it last painted so unchanged parts aren't touched. */
export class Renderer {
  #shell: Shell;
  #listVersion = -1;
  #listKey = '';
  #footer = '';
  #tokens = '';
  #announce = '';

  constructor(shell: Shell) {
    this.#shell = shell;
  }

  /** Force the next render to rebuild everything (labels/data changed). */
  invalidate(): void {
    this.#listVersion = -1;
    this.#listKey = '';
    this.#footer = '';
    this.#tokens = '';
  }

  render(m: PaletteMachine, labels: Labels): void {
    const s = this.#shell;

    // ── input row ──
    if (s.input.value !== m.input) {
      s.input.value = m.input;
      const end = m.input.length;
      try { s.input.setSelectionRange(end, end); } catch { /* not focusable yet */ }
    }
    s.input.placeholder = m.placeholder;
    s.input.setAttribute('aria-label', labels.dialogLabel);
    const ctx = m.contextText;
    s.context.textContent = ctx ?? '';
    s.context.classList.toggle('pa-command-palette__context--visible', !!ctx);

    const tokens = tokensHtml(m.tokens, labels);
    if (tokens !== this.#tokens) {
      this.#tokens = tokens;
      s.tokens.innerHTML = tokens; // '' keeps the row :empty (hidden)
    }

    // ── results ──
    const listKey = `${m.mode}|${m.isLoading}|${m.emptyText}|${m.pageText}|${m.highlight}`;
    if (m.listVersion !== this.#listVersion || listKey !== this.#listKey) {
      this.#listVersion = m.listVersion;
      this.#listKey = listKey;
      s.results.innerHTML = this.#resultsHtml(m, labels);
      s.results.classList.toggle('pa-command-palette__results--loading', m.isLoading && m.items.length > 0);
    } else {
      this.#paintActive(m.activeIndex);
    }
    this.#syncActiveDescendant(m.activeIndex);
    this.#scrollActive();

    // ── footer + announcements ──
    const footer = footerHtml(m, labels);
    if (footer !== this.#footer) {
      this.#footer = footer;
      s.footer.innerHTML = footer;
    }
    const announce = m.mode === 'idle' || m.isLoading ? '' : m.items.length ? labels.resultsCount.replace('{count}', String(m.totalResults)) : m.emptyText ?? '';
    if (announce !== this.#announce) {
      this.#announce = announce;
      s.live.textContent = announce;
    }
  }

  #resultsHtml(m: PaletteMachine, labels: Labels): string {
    if (m.mode === 'idle') return homeHtml(m.items, m.activeIndex, labels);
    if (m.items.length) {
      const rows = m.items.map((item, i) => itemHtml(item, i, i === m.activeIndex, m.highlight)).join('');
      const page = m.pageText ? `<div class="pa-command-palette__pagination">${escapeHtml(m.pageText)}</div>` : '';
      return rows + page;
    }
    if (m.isLoading) {
      return (
        `<div class="pa-command-palette__loader" role="status">` +
        `<div class="pa-spinner pa-spinner--sm pa-spinner--primary"></div><span>${escapeHtml(labels.searching)}</span></div>`
      );
    }
    return m.emptyText ? `<div class="pa-command-palette__empty">${escapeHtml(m.emptyText)}</div>` : '';
  }

  #paintActive(index: number): void {
    const prev = this.#shell.results.querySelector('.pa-command-palette__item--active');
    const next = index >= 0 ? this.#shell.results.querySelector(`#${itemId(index)}`) : null;
    if (prev === next) return;
    if (prev) {
      prev.classList.remove('pa-command-palette__item--active');
      prev.setAttribute('aria-selected', 'false');
    }
    if (next) {
      next.classList.add('pa-command-palette__item--active');
      next.setAttribute('aria-selected', 'true');
    }
  }

  #syncActiveDescendant(index: number): void {
    const input = this.#shell.input;
    if (index >= 0) input.setAttribute('aria-activedescendant', itemId(index));
    else input.removeAttribute('aria-activedescendant');
  }

  #scrollActive(): void {
    const el = this.#shell.results.querySelector('.pa-command-palette__item--active') as HTMLElement | null;
    el?.scrollIntoView?.({ block: 'nearest' });
  }
}
