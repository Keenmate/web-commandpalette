/**
 * Builds and patches the palette DOM inside the shadow root. Markup and classes
 * match pure-admin-core's canonical `snippets/command-palette.html`.
 *
 * The results list is rebuilt only when the engine replaces its items
 * (`listVersion` changed); moving the active row just toggles a class and scrolls
 * it into view, so keyboard navigation is pure DOM work.
 */
import { getEnvironment, renderLoader, scrollIntoContainer } from '@keenmate/web-components-core';
import { escapeHtml, renderIcon } from './helpers/icons';
import type { HomeSection, PaletteEngine, TokenView, UsageView, ViewItem } from './palette';
import { DEFAULT_PALETTE_KEYS, type Labels, type PaletteKeys } from './types';

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
  /** The one-line confirmation shown (alone) after a command ran. */
  confirm: HTMLDivElement;
}

const RESULTS_ID = 'cp-results';
const itemId = (index: number): string => `cp-item-${index}`;

export function createShell(): Shell {
  const root = document.createElement('div');
  root.className = 'cp';
  root.setAttribute('part', 'palette');
  root.innerHTML = `
    <div class="cp__backdrop" part="backdrop"></div>
    <div class="cp__container" part="container" role="dialog" aria-modal="true">
      <div class="cp__fullscreen-bar">
        <span class="cp__fullscreen-title"></span>
        <button type="button" class="cp__close">
          <span class="cp__icon cp__icon--x" aria-hidden="true"></span>
        </button>
      </div>
      <div class="cp__search">
        <div class="cp__tokens"></div>
        <div class="cp__input-wrapper">
          <input type="text" class="cp__input" part="input" autocomplete="off" spellcheck="false"
            role="combobox" aria-autocomplete="list" aria-expanded="true" aria-controls="${RESULTS_ID}">
          <div class="cp__context" aria-live="polite" dir="auto"></div>
        </div>
      </div>
      <div class="cp__results" part="results" id="${RESULTS_ID}" role="listbox"></div>
      <div class="cp__footer" part="footer"></div>
      <div class="cp__confirm" role="status" tabindex="-1" hidden></div>
      <div class="cp__sr-only" aria-live="polite" aria-atomic="true"></div>
    </div>`;
  const q = <T extends Element>(sel: string): T => root.querySelector(sel) as T;
  return {
    root,
    backdrop: q('.cp__backdrop'),
    container: q('.cp__container'),
    closeButton: q('.cp__close'),
    fullscreenTitle: q('.cp__fullscreen-title'),
    tokens: q('.cp__tokens'),
    input: q('.cp__input'),
    context: q('.cp__context'),
    results: q('.cp__results'),
    footer: q('.cp__footer'),
    live: q('.cp__sr-only'),
    confirm: q('.cp__confirm'),
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
  return `<div class="cp__shortcut">${keys
    .map((k) => `<span class="cp__key"><bdi>${escapeHtml(k)}</bdi></span>`)
    .join(' ')}</div>`;
}

const fill = (template: string, values: Record<string, string | number>): string =>
  template.replace(/\{(\w+)\}/g, (m, k: string) => (k in values ? String(values[k]) : m));

/** Apple keyboard (⌘) — core's environment detection (`os` is `macos` / `ios`). */
const isMac = (): boolean => getEnvironment().isApple;

/** Keycap text for a Ctrl/⌘ + letter shortcut: `Ctrl D` / `⌘D`; '' when the shortcut is off. */
export const chordKeycap = (letter: string): string =>
  !letter ? '' : isMac() ? `⌘${letter.toUpperCase()}` : `Ctrl ${letter.toUpperCase()}`;

/** What the markup helpers need besides the engine. */
export interface RenderContext {
  labels: Labels;
  keys: PaletteKeys;
}

function starHtml(item: ViewItem, index: number, ctx: RenderContext): string {
  if (item.favorite === undefined) return '';
  const on = item.favorite;
  const text = on ? ctx.labels.removeFavorite : ctx.labels.addFavorite;
  const cap = chordKeycap(ctx.keys.favorite);
  return (
    `<button type="button" class="cp__star${on ? ' cp__star--on' : ''}" tabindex="-1" data-star="${index}"` +
    ` aria-pressed="${on}" aria-label="${escapeHtml(text)}"` +
    ` title="${escapeHtml(cap ? `${text} (${cap})` : text)}"><span class="cp__icon cp__icon--star${on ? '-filled' : ''}" aria-hidden="true"></span></button>`
  );
}

function itemHtml(item: ViewItem, index: number, active: boolean, needle: string, ctx: RenderContext): string {
  const icon = renderIcon(item.icon);
  const badge = item.badge
    ? `<span class="cp__badge${item.badgeVariant ? ` cp__badge--${escapeHtml(item.badgeVariant)}` : ''}"><bdi>${escapeHtml(item.badge)}</bdi></span>`
    : '';
  return (
    `<div class="cp__item${active ? ' cp__item--active' : ''}${item.isDefault ? ' cp__item--default' : ''}` +
    `${item.isDisabled ? ' cp__item--disabled' : ''}${item.isDanger ? ' cp__item--danger' : ''}` +
    `${item.cssClass ? ` ${escapeHtml(item.cssClass)}` : ''}"` +
    ` id="${itemId(index)}" data-index="${index}" role="option" aria-selected="${active}"` +
    `${item.isDisabled ? ' aria-disabled="true"' : ''}${item.tooltip ? ` title="${escapeHtml(item.tooltip)}"` : ''}>` +
    (icon ? `<div class="cp__item-icon" aria-hidden="true">${icon}</div>` : '') +
    `<div class="cp__item-content">` +
    `<div class="cp__item-title"><bdi>${highlight(item.title ?? '', needle)}</bdi></div>` +
    (item.meta ? `<div class="cp__item-meta"><bdi>${escapeHtml(item.meta)}</bdi></div>` : '') +
    `</div>` +
    badge +
    keycaps(item.keys) +
    starHtml(item, index, ctx) +
    `</div>`
  );
}

/** A heading + rows. `more` = an optional control at the heading's end (e.g. "+2 · Ctrl F"). */
function sectionHtml(heading: string, rows: string, more = ''): string {
  return (
    `<div class="cp__home-section" role="group"${heading ? ` aria-label="${escapeHtml(heading)}"` : ''}>` +
    (heading || more
      ? `<div class="cp__home-heading cp__heading">${heading ? `<span aria-hidden="true">${escapeHtml(heading)}</span>` : ''}${more}</div>`
      : '') +
    `${rows}</div>`
  );
}

/** "+2 · Ctrl F" on a capped home section: click/tap (or the chord) opens the full list. */
function moreHtml(view: UsageView, hidden: number, heading: string, ctx: RenderContext): string {
  const cap = chordKeycap(view === 'favorites' ? ctx.keys.favorites : ctx.keys.recent);
  const count = hidden > 0 ? fill(ctx.labels.showAll, { count: hidden }) : '';
  if (!count && !cap) return '';
  return (
    `<button type="button" class="cp__more" tabindex="-1" data-view="${view}" aria-label="${escapeHtml(heading)}${cap ? ` (${escapeHtml(cap)})` : ''}">` +
    (count ? `<span>${escapeHtml(count)}</span>` : '') +
    (cap ? `<span class="cp__key">${escapeHtml(cap)}</span>` : '') +
    `</button>`
  );
}

function homeHtml(m: PaletteEngine, ctx: RenderContext): string {
  const { labels } = ctx;
  const headings: Record<HomeSection, string> = {
    favorites: labels.favorites,
    recent: labels.recent,
    commands: labels.commands,
    contexts: labels.search,
  };
  const section = (key: HomeSection): string => {
    const rows = m.items
      .map((item, index) => (item.section === key ? itemHtml(item, index, index === m.activeIndex, '', ctx) : ''))
      .join('');
    if (!rows) return '';
    const more = key === 'favorites' || key === 'recent' ? moreHtml(key, m.homeMore[key], headings[key], ctx) : '';
    return sectionHtml(headings[key], rows, more);
  };
  return `<div class="cp__home">${(['favorites', 'recent', 'commands', 'contexts'] as const).map(section).join('')}</div>`;
}

/** Search rows, with a heading section per run of `group` (the engine clusters them). */
function rowsHtml(m: PaletteEngine, ctx: RenderContext): string {
  let out = '';
  let group: string | undefined;
  let rows = '';
  const flush = (): void => {
    out += group ? sectionHtml(group, rows) : rows;
    rows = '';
  };
  m.items.forEach((item, i) => {
    if (item.group !== group) {
      flush();
      group = item.group;
    }
    rows += itemHtml(item, i, i === m.activeIndex, m.highlight, ctx);
  });
  flush();
  return out;
}

function tokensHtml(tokens: TokenView[] | null, labels: Labels): string {
  if (!tokens) return '';
  return tokens
    .map((t) => {
      switch (t.type) {
        case 'command':
          return `<span class="cp__badge cp__badge--primary"><bdi>${escapeHtml(t.label)}</bdi></span>`;
        case 'prompt':
          return `<span class="cp__token-prompt">${escapeHtml(t.label)}</span>`;
        case 'selection':
          return (
            `<span class="cp__badge"><bdi>${escapeHtml(t.label)}</bdi>` +
            `<button type="button" class="cp__badge-remove" data-token="${t.index}" aria-label="${escapeHtml(fill(labels.removeToken, { name: t.label }))}">` +
            `<span class="cp__icon cp__icon--remove" aria-hidden="true"></span></button></span>`
          );
      }
    })
    .join('');
}

function footerHtml(m: PaletteEngine, ctx: RenderContext): string {
  const { labels } = ctx;
  // A label set to '' hides that hint (L4: '' = deliberately empty).
  const hint = (key: string, text: string): string =>
    !text ? '' : `<div class="cp__hint"><span class="cp__key">${escapeHtml(key)}</span><span>${escapeHtml(text)}</span></div>`;
  // Mode-aware (IMPLEMENTATION_PLAN §10): ←→ only when paginated, ⌫ only where it
  // steps back, Esc reads Back/Close accordingly. In a wizard Tab = next step, and
  // Enter runs the rest of a replayed run. The star hint follows the active row.
  const isStep = m.mode === 'command-step';
  const fav = m.activeFavorite;
  const starCap = chordKeycap(ctx.keys.favorite);
  return [
    hint('↑↓', labels.navigate),
    m.isPaginated ? hint('←→', labels.pages) : '',
    isStep ? hint('Tab', labels.next) : '',
    hint('↵', m.canRun ? labels.run : labels.select),
    m.canStepBack ? hint('⌫', labels.back) : '',
    hint('Esc', m.canStepBack ? labels.back : labels.close),
    fav !== undefined && starCap ? hint(starCap, fav ? labels.removeFavorite : labels.addFavorite) : '',
  ].join('');
}

/**
 * The default confirmation sentence. A wizard reads as what the user built —
 * `/go Orders`, `/deploy to Staging branch main` — with the answers emphasised;
 * an instant command shows its text.
 */
export function confirmationBodyHtml(o: { trigger?: string; text: string; parts: TokenView[] }): string {
  if (!o.parts.length) return `<strong class="cp__confirm-answer">${escapeHtml(o.text)}</strong>`;
  return [
    o.trigger ? `<span class="cp__confirm-command">${escapeHtml(o.trigger)}</span>` : '',
    ...o.parts.map((t) =>
      t.type === 'selection'
        ? `<strong class="cp__confirm-answer">${escapeHtml(t.label)}</strong>`
        : `<span class="cp__confirm-prompt">${escapeHtml(t.label)}</span>`,
    ),
  ].filter(Boolean).join(' ');
}

/**
 * Fill the one-line confirmation: ✓, a body slot, the heading at the end, and a
 * countdown bar whose animation lasts `duration` ms. Returns the body slot.
 */
export function fillConfirmation(el: HTMLElement, heading: string, duration: number): HTMLElement {
  el.innerHTML =
    `<span class="cp__confirm-check cp__icon cp__icon--check" aria-hidden="true"></span>` +
    `<span class="cp__confirm-body" dir="auto"></span>` +
    `<span class="cp__confirm-title">${escapeHtml(heading)}</span>` +
    `<span class="cp__confirm-progress" style="animation-duration: ${Math.max(0, duration)}ms"></span>`;
  return el.querySelector('.cp__confirm-body') as HTMLElement;
}

/** Render state. Remembers what it last painted so unchanged parts aren't touched. */
export class Renderer {
  #shell: Shell;
  #listVersion = -1;
  #listKey = '';
  #footer = '';
  #tokens = '';
  #announce = '';
  /** The component host — `renderLoader()` reads its `renderLoadingCallback` (SPEC §12.14). */
  #host: HTMLElement | null;
  /** remove() of the loader drawn into the results list, if any. */
  #removeLoader: (() => void) | null = null;
  /** The Ctrl/⌘ shortcuts, for keycaps (set by the element; call `invalidate()` after changing). */
  keys: PaletteKeys = DEFAULT_PALETTE_KEYS;

  constructor(shell: Shell, host?: HTMLElement) {
    this.#shell = shell;
    this.#host = host ?? null;
  }

  /** Remove the results loader (runs a render hook's cleanup). Idempotent. */
  clearLoader(): void {
    const remove = this.#removeLoader;
    this.#removeLoader = null;
    remove?.();
  }

  /**
   * Draw the searching loader into the slot the results HTML left
   * (`[data-cp-loader]`) through core `renderLoader()`: instance
   * `renderLoadingCallback` > page-wide `window.components.renderLoadingCallback` >
   * the default `.cp__loader`. The slot gets `role="status"` + `aria-label`.
   */
  #mountLoader(labels: Labels): void {
    const slot = this.#shell.results.querySelector<HTMLElement>('[data-cp-loader]');
    if (!slot) return;
    const host = this.#host ?? ((this.#shell.root.getRootNode() as ShadowRoot).host as HTMLElement | undefined) ?? this.#shell.root;
    this.#removeLoader = renderLoader(host, slot, slot.dataset.cpLoader || 'search', {
      prefix: 'cp',
      label: labels.searching,
    });
  }

  /** Force the next render to rebuild everything (labels/data changed). */
  invalidate(): void {
    this.#listVersion = -1;
    this.#listKey = '';
    this.#footer = '';
    this.#tokens = '';
  }

  render(m: PaletteEngine, labels: Labels): void {
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
    s.context.classList.toggle('cp__context--visible', !!ctx);

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
      this.clearLoader();
      s.results.innerHTML = this.#resultsHtml(m, { labels, keys: this.keys });
      this.#mountLoader(labels);
      s.results.classList.toggle('cp__results--loading', m.isLoading && m.items.length > 0);
    } else {
      this.#paintActive(m.activeIndex);
    }
    this.#syncActiveDescendant(m.activeIndex);
    this.#scrollActive();

    // ── footer + announcements ──
    const footer = footerHtml(m, { labels, keys: this.keys });
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

  #resultsHtml(m: PaletteEngine, ctx: RenderContext): string {
    const { labels } = ctx;
    if (m.mode === 'idle') return homeHtml(m, ctx);
    if (m.items.length) {
      const rows = rowsHtml(m, ctx);
      const page = m.pageText ? `<div class="cp__pagination">${escapeHtml(m.pageText)}</div>` : '';
      return rows + page;
    }
    if (m.isLoading) {
      return (
        // The slot carries role="status" + aria-label (renderLoader), so the text is aria-hidden.
        `<div class="cp__loading">` +
        `<span class="cp__loader-slot" data-cp-loader="search"></span>` +
        `<span aria-hidden="true">${escapeHtml(labels.searching)}</span></div>`
      );
    }
    return m.emptyText ? `<div class="cp__empty">${escapeHtml(m.emptyText)}</div>` : '';
  }

  #paintActive(index: number): void {
    const prev = this.#shell.results.querySelector('.cp__item--active');
    const next = index >= 0 ? this.#shell.results.querySelector(`#${itemId(index)}`) : null;
    if (prev === next) return;
    if (prev) {
      prev.classList.remove('cp__item--active');
      prev.setAttribute('aria-selected', 'false');
    }
    if (next) {
      next.classList.add('cp__item--active');
      next.setAttribute('aria-selected', 'true');
    }
  }

  #syncActiveDescendant(index: number): void {
    const input = this.#shell.input;
    if (index >= 0) input.setAttribute('aria-activedescendant', itemId(index));
    else input.removeAttribute('aria-activedescendant');
  }

  #scrollActive(): void {
    const el = this.#shell.results.querySelector('.cp__item--active') as HTMLElement | null;
    // Scroll the results list only, never the page (core SPEC §12.15).
    if (el) scrollIntoContainer(el, { container: this.#shell.results });
  }
}
