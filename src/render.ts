/**
 * Builds and patches the palette DOM inside the shadow root. Markup and classes
 * match pure-admin-core's canonical `snippets/command-palette.html`.
 *
 * The results list is rebuilt only when the engine replaces its items
 * (`listVersion` changed); moving the active row just toggles a class, and core
 * `createActiveDescendant` (ARIA only — the keys stay the palette's) points
 * `aria-activedescendant` at it and scrolls it into view, so keyboard navigation is pure DOM work.
 */
import { announce, escapeHtml, renderIcon, renderLoader } from '@keenmate/web-components-core';
import { createActiveDescendant, type ActiveDescendant } from '@keenmate/web-components-core/a11y';
import { findHighlightRanges, wrapRanges } from '@keenmate/web-components-core/search';
import { NO_SEARCH_QUERY, type SearchQuery } from './helpers/filter';
import { chordKeycap } from './keyboard';
import type { HomeSection, CommandPaletteEngine, TokenView, UsageView, ViewItem } from './palette';
import { DEFAULT_PALETTE_KEYS, type CommandPaletteLabels, type PaletteKeys, type PaletteLabels, type ResultsCountLabelContext, type ShowAllLabelContext, type TokenLabelContext } from './types';

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
      <div class="cp__fullscreen-bar km-sheet-header">
        <span class="cp__fullscreen-title km-sheet-title"></span>
        <button type="button" class="cp__close km-sheet-close"></button>
      </div>
      <div class="cp__search">
        <div class="cp__tokens"></div>
        <div class="cp__input-wrapper">
          <input type="text" class="cp__input" part="input" autocomplete="off" spellcheck="false"
            role="combobox" aria-autocomplete="list" aria-expanded="true">
          <div class="cp__context" aria-live="polite" dir="auto"></div>
        </div>
      </div>
      <div class="cp__results" part="results" id="${RESULTS_ID}" role="listbox"></div>
      <div class="cp__footer" part="footer"></div>
      <div class="cp__confirm" role="status" tabindex="-1" hidden></div>
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
    confirm: q('.cp__confirm'),
  };
}

/**
 * Escape `text`, wrapping the matches of `query` in `<mark>` — core's highlight mapping
 * (SPEC §12.11), under the same `search-behavior` / `search-match` rules as the filter
 * (`ces` marks `Čes` in `Český`). Titles are plain text, so every slice is HTML-escaped.
 */
export function highlight(text: string, query: SearchQuery): string {
  if (query.term.kind === 'none' || !text) return escapeHtml(text);
  const { text: nfc, ranges } = findHighlightRanges(text, query.term, query);
  return wrapRanges(nfc, ranges);
}

function keycaps(keys: string[] | undefined): string {
  if (!keys?.length) return '';
  return `<div class="cp__shortcut">${keys
    .map((k) => `<span class="cp__key"><bdi>${escapeHtml(k)}</bdi></span>`)
    .join(' ')}</div>`;
}


/** What the markup helpers need besides the engine. */
export interface RenderContext {
  /** Core `createLabels`: `.text()` for attributes / `textContent`, `.html()` for markup. */
  labels: PaletteLabels;
  keys: PaletteKeys;
  /** The component host — core `renderIcon` asks its `renderIconCallback` (then the page-wide one). */
  host: HTMLElement | null;
}

function starHtml(item: ViewItem, index: number, ctx: RenderContext): string {
  if (item.favorite === undefined) return '';
  const on = item.favorite;
  const name = ctx.labels.text(on ? 'ariaLabels.removeFavorite' : 'ariaLabels.addFavorite');
  const tip = ctx.labels.text(on ? 'tooltips.removeFavorite' : 'tooltips.addFavorite');
  const cap = chordKeycap(ctx.keys.favorite);
  return (
    `<button type="button" class="cp__star${on ? ' cp__star--on' : ''}" tabindex="-1" data-star="${index}"` +
    ` aria-pressed="${on}"${name ? ` aria-label="${escapeHtml(name)}"` : ''}` +
    `${tip || cap ? ` title="${escapeHtml(tip && cap ? `${tip} (${cap})` : tip || cap)}"` : ''}><span class="km-icon cp__icon cp__icon--star${on ? '-filled' : ''}" aria-hidden="true"></span></button>`
  );
}

function itemHtml(item: ViewItem, index: number, active: boolean, query: SearchQuery, ctx: RenderContext): string {
  const icon = renderIcon(item.icon, { prefix: 'cp', host: ctx.host, context: { item: item.ref, kind: item.kind } }); // the host's own Command / Context / Option / Result / usage entry
  // A remembered answer's badge is `labels['labels.lastUsed']`, re-resolved per render (a locale change mid-wizard).
  const badgeText = item.isDefault ? ctx.labels.text('labels.lastUsed') : item.badge;
  const badge = badgeText
    ? `<span class="cp__badge${item.badgeVariant ? ` cp__badge--${escapeHtml(item.badgeVariant)}` : ''}"><bdi>${escapeHtml(badgeText)}</bdi></span>`
    : '';
  return (
    `<div class="cp__item${active ? ' cp__item--active' : ''}${item.isDefault ? ' cp__item--default' : ''}` +
    `${item.isDisabled ? ' cp__item--disabled' : ''}${item.isDanger ? ' cp__item--danger' : ''}` +
    `${item.cssClass ? ` ${escapeHtml(item.cssClass)}` : ''}"` +
    ` id="${itemId(index)}" data-index="${index}" role="option" aria-selected="${active}"` +
    `${item.isDisabled ? ' aria-disabled="true"' : ''}${item.tooltip ? ` title="${escapeHtml(item.tooltip)}"` : ''}>` +
    (icon ? `<div class="cp__item-icon" aria-hidden="true">${icon}</div>` : '') +
    `<div class="cp__item-content">` +
    `<div class="cp__item-title"><bdi>${highlight(item.title ?? '', query)}</bdi></div>` +
    (item.meta ? `<div class="cp__item-meta"><bdi>${escapeHtml(item.meta)}</bdi></div>` : '') +
    `</div>` +
    badge +
    keycaps(item.keys) +
    starHtml(item, index, ctx) +
    `</div>`
  );
}

/** A section heading: `text` names the group (aria-label), `html` is drawn. */
interface Heading {
  text: string;
  html: string;
}

const groupHeading = (group: string): Heading => ({ text: group, html: escapeHtml(group) });
const labelHeading = (labels: PaletteLabels, key: keyof CommandPaletteLabels & string): Heading => ({
  text: labels.text(key),
  html: labels.html(key),
});

/** A heading + rows. `more` = an optional control at the heading's end (e.g. "+2 · Ctrl+F"). */
function sectionHtml(heading: Heading, rows: string, more = ''): string {
  return (
    `<div class="cp__home-section" role="group"${heading.text ? ` aria-label="${escapeHtml(heading.text)}"` : ''}>` +
    (heading.html || more
      ? `<div class="cp__home-heading cp__heading">${heading.html ? `<span aria-hidden="true">${heading.html}</span>` : ''}${more}</div>`
      : '') +
    `${rows}</div>`
  );
}

/** "+2 · Ctrl+F" on a capped home section: click/tap (or the chord) opens the full list. */
function moreHtml(view: UsageView, hidden: number, heading: string, ctx: RenderContext): string {
  const cap = chordKeycap(view === 'favorites' ? ctx.keys.favorites : ctx.keys.recent);
  const count = hidden > 0 ? ctx.labels.html('buttons.showAll', { ctx: { count: hidden, view } satisfies ShowAllLabelContext }) : '';
  if (!count && !cap) return '';
  return (
    `<button type="button" class="cp__more" tabindex="-1" data-view="${view}" aria-label="${escapeHtml(heading)}${cap ? ` (${escapeHtml(cap)})` : ''}">` +
    (count ? `<span>${count}</span>` : '') +
    (cap ? `<span class="cp__key">${escapeHtml(cap)}</span>` : '') +
    `</button>`
  );
}

function homeHtml(m: CommandPaletteEngine, ctx: RenderContext): string {
  const { labels } = ctx;
  const headings: Record<HomeSection, Heading> = {
    favorites: labelHeading(labels, 'headers.favorites'),
    recent: labelHeading(labels, 'headers.recent'),
    commands: labelHeading(labels, 'headers.commands'),
    contexts: labelHeading(labels, 'headers.search'),
  };
  const section = (key: HomeSection): string => {
    const rows = m.items
      .map((item, index) => (item.section === key ? itemHtml(item, index, index === m.activeIndex, NO_SEARCH_QUERY, ctx) : ''))
      .join('');
    if (!rows) return '';
    const more = key === 'favorites' || key === 'recent' ? moreHtml(key, m.homeMore[key], headings[key].text, ctx) : '';
    return sectionHtml(headings[key], rows, more);
  };
  return `<div class="cp__home">${(['favorites', 'recent', 'commands', 'contexts'] as const).map(section).join('')}</div>`;
}

/** Search rows, with a heading section per run of `group` (the engine clusters them). */
function rowsHtml(m: CommandPaletteEngine, ctx: RenderContext): string {
  let out = '';
  let group: string | undefined;
  let rows = '';
  const flush = (): void => {
    out += group ? sectionHtml(groupHeading(group), rows) : rows;
    rows = '';
  };
  m.items.forEach((item, i) => {
    if (item.group !== group) {
      flush();
      group = item.group;
    }
    rows += itemHtml(item, i, i === m.activeIndex, m.highlightQuery, ctx);
  });
  flush();
  return out;
}

function tokensHtml(tokens: TokenView[] | null, labels: PaletteLabels): string {
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
            `<button type="button" class="cp__badge-remove" data-token="${t.index}" aria-label="${escapeHtml(labels.text('ariaLabels.removeToken', { ctx: { name: t.label, index: t.index } satisfies TokenLabelContext }))}">` +
            `<span class="km-icon cp__icon cp__icon--remove" aria-hidden="true"></span></button></span>`
          );
      }
    })
    .join('');
}

function footerHtml(m: CommandPaletteEngine, ctx: RenderContext): string {
  const { labels } = ctx;
  // A label set to '' hides that hint (L4: '' = deliberately empty).
  const hint = (key: string, label: keyof CommandPaletteLabels & string): string => {
    const html = labels.html(label);
    return !html ? '' : `<div class="cp__hint"><span class="cp__key">${escapeHtml(key)}</span><span>${html}</span></div>`;
  };
  // Mode-aware (IMPLEMENTATION_PLAN §10): ←→ only when paginated, ⌫ only where it
  // steps back, Esc reads Back/Close accordingly. In a wizard Tab = next step, and
  // Enter runs the rest of a replayed run. The star hint follows the active row.
  const isStep = m.mode === 'command-step';
  const fav = m.activeFavorite;
  const starCap = chordKeycap(ctx.keys.favorite);
  return [
    hint('↑↓', 'labels.navigate'),
    m.isPaginated ? hint('←→', 'labels.pages') : '',
    isStep ? hint('Tab', 'labels.next') : '',
    hint('↵', m.canRun ? 'labels.run' : 'labels.select'),
    m.canStepBack ? hint('⌫', 'labels.back') : '',
    hint('Esc', m.canStepBack ? 'labels.back' : 'labels.close'),
    fav !== undefined && starCap ? hint(starCap, fav ? 'labels.removeFavorite' : 'labels.addFavorite') : '',
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
 * `headingHtml` is markup (`labels.html('headers.done')`). `hasProgress: false` leaves the bar out
 * (motion off — the bar is decorative, SPEC §12.16).
 */
export function fillConfirmation(el: HTMLElement, headingHtml: string, duration: number, hasProgress = true): HTMLElement {
  el.innerHTML =
    `<span class="cp__confirm-check km-icon cp__icon cp__icon--check" aria-hidden="true"></span>` +
    `<span class="cp__confirm-body" dir="auto"></span>` +
    `<span class="cp__confirm-title">${headingHtml}</span>` +
    (hasProgress ? `<span class="cp__confirm-progress" style="animation-duration: ${Math.max(0, duration)}ms"></span>` : '');
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
  /**
   * `aria-activedescendant`, `aria-controls` and the in-list scroll (core SPEC §12.25). ARIA only:
   * the palette engine owns the keys and the active index; the render drives `setActive()`.
   */
  #activeDescendant: ActiveDescendant;
  /** The Ctrl/⌘ shortcuts, for keycaps (set by the element; call `invalidate()` after changing). */
  keys: PaletteKeys = DEFAULT_PALETTE_KEYS;

  constructor(shell: Shell, host?: HTMLElement) {
    this.#shell = shell;
    this.#host = host ?? null;
    this.#activeDescendant = createActiveDescendant(shell.input, shell.results, {
      getItems: () => [...shell.results.querySelectorAll<HTMLElement>('[role="option"]')],
      shouldHandleKeys: false,
    });
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
   * the default `.cp__loader`. The slot gets `role="status"` + `aria-label` = the visible
   * `messages.searching` text (aria-hidden next to it, so it is heard once).
   */
  #mountLoader(labels: PaletteLabels): void {
    const slot = this.#shell.results.querySelector<HTMLElement>('[data-cp-loader]');
    if (!slot) return;
    const host = this.#hostEl();
    this.#removeLoader = renderLoader(host, slot, slot.dataset.cpLoader || 'search', {
      prefix: 'cp',
      label: labels.text('messages.searching'), // the visible loader text names the status (one text, one key)
    });
  }

  /** The component host (`renderLoader` / `renderIcon` read its callbacks). */
  #hostEl(): HTMLElement {
    return this.#host ?? ((this.#shell.root.getRootNode() as ShadowRoot).host as HTMLElement | undefined) ?? this.#shell.root;
  }

  /** Force the next render to rebuild everything (labels/data changed). */
  invalidate(): void {
    this.#listVersion = -1;
    this.#listKey = '';
    this.#footer = '';
    this.#tokens = '';
  }

  render(m: CommandPaletteEngine, labels: PaletteLabels): void {
    const s = this.#shell;

    // ── input row ──
    if (s.input.value !== m.input) {
      s.input.value = m.input;
      const end = m.input.length;
      try { s.input.setSelectionRange(end, end); } catch { /* not focusable yet */ }
    }
    s.input.placeholder = m.placeholder;
    s.input.setAttribute('aria-label', labels.text('ariaLabels.input'));
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
      s.results.innerHTML = this.#resultsHtml(m, { labels, keys: this.keys, host: this.#hostEl() });
      this.#mountLoader(labels);
      s.results.classList.toggle('cp__results--loading', m.isLoading && m.items.length > 0);
    } else {
      this.#paintActive(m.activeIndex);
    }
    this.#syncActiveDescendant(m.activeIndex);

    // ── footer + announcements ──
    const footer = footerHtml(m, { labels, keys: this.keys, host: this.#hostEl() });
    if (footer !== this.#footer) {
      this.#footer = footer;
      s.footer.innerHTML = footer;
    }
    // Core's one page-wide live region (SPEC §12.23) — stays readable while the modal makes the page inert.
    // Silent while a provider call is pending (debounce / loader); tracked across '' so the same count after a new search is read again.
    const text = m.mode === 'idle' || m.isLoading || m.isPending ? '' : m.items.length ? labels.text('ariaLabels.resultsCount', { ctx: { count: m.totalResults } satisfies ResultsCountLabelContext }) : m.emptyText ?? '';
    if (text !== this.#announce) {
      this.#announce = text;
      announce(text);
    }
  }

  #resultsHtml(m: CommandPaletteEngine, ctx: RenderContext): string {
    const { labels } = ctx;
    if (m.mode === 'idle') return homeHtml(m, ctx);
    if (m.items.length) {
      const rows = rowsHtml(m, ctx);
      const pageLabel = m.pageLabel;
      const page = pageLabel ? `<div class="cp__pagination">${labels.html(pageLabel.key, pageLabel.params)}</div>` : '';
      return rows + page;
    }
    if (m.isLoading) {
      return (
        // The slot carries role="status" + aria-label (renderLoader), so the text is aria-hidden.
        `<div class="cp__loading">` +
        `<span class="cp__loader-slot" data-cp-loader="search"></span>` +
        `<span aria-hidden="true">${labels.html('messages.searching')}</span></div>`
      );
    }
    const empty = m.emptyLabel ? labels.html(m.emptyLabel.key, m.emptyLabel.params) : '';
    return empty ? `<div class="cp__empty">${empty}</div>` : '';
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

  /**
   * Point core's active descendant at row `index` (by element: the home sections render rows out of
   * index order). Core sets `aria-activedescendant` and scrolls the row into the results list only.
   */
  #syncActiveDescendant(index: number): void {
    const el = index >= 0 ? this.#shell.results.querySelector<HTMLElement>(`#${itemId(index)}`) : null;
    this.#activeDescendant.setActive(el);
  }

  /** Release the active descendant (element `destroy()`). */
  destroy(): void {
    this.#activeDescendant.destroy();
  }
}
