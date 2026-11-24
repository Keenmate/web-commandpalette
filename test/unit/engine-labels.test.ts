import { afterEach, describe, expect, it, vi } from 'vitest';
import { getPageLocale, type TranslateCallback } from '@keenmate/web-components-core/locale';
import { DEFAULT_LABELS, ENGINE_DEFAULTS, type Command } from '../../src/types';
import { COMMANDS } from './helpers';
import { harness } from './helpers';

/**
 * The engine without the element: its own `labels` / `translateCallback` options
 * resolve the engine's texts (placeholder, context pill, empty state) under core's
 * order — instance labels → own translateCallback → page-wide translateCallback → English.
 */
const page = (): Record<string, unknown> => window.components as unknown as Record<string, unknown>;

const upper: TranslateCallback = ({ template }) => template.toUpperCase();
const pageWide: TranslateCallback = ({ key }) => `page:${key}`;

afterEach(() => {
  getPageLocale(); // installs the window.components.locale accessor
  page().locale = null;
  vi.restoreAllMocks();
});

describe('engine labels (no element)', () => {
  it('defaults to English', () => {
    const { m } = harness();
    expect(m.placeholder).toBe(DEFAULT_LABELS['placeholders.idle']);
  });

  it('labels: an instance label (short or full key) replaces the default', () => {
    const { m } = harness({ labels: { 'placeholders.idle': 'Hledat…' } });
    expect(m.placeholder).toBe('Hledat…');
    m.setOptions({ labels: { 'web-command-palette.labels.scopeCommands': 'Příkazy' } });
    m.setInput('/');
    expect(m.contextText).toBe('Příkazy');
  });

  it("translateCallback: the engine's own hook beats the page-wide one", () => {
    getPageLocale(); // installs the window.components.locale accessor
    page().locale = { translateCallback: pageWide };
    const { m } = harness({ translateCallback: upper });
    expect(m.placeholder).toBe(DEFAULT_LABELS['placeholders.idle'].toUpperCase());
  });

  it('translateCallback: null / not set → the page-wide one answers', () => {
    getPageLocale(); // installs the window.components.locale accessor
    page().locale = { translateCallback: pageWide };
    const { m } = harness();
    expect(m.placeholder).toBe('page:web-command-palette.placeholders.idle');
  });

  it('labels beat translateCallback (an instance text is never sent to the hook)', () => {
    const own = vi.fn(upper);
    const { m } = harness({ labels: { 'placeholders.idle': 'Mine' }, translateCallback: own });
    expect(m.placeholder).toBe('Mine');
    expect(own).not.toHaveBeenCalledWith(expect.objectContaining({ key: 'web-command-palette.placeholders.idle' }));
  });

  it('{ctx.*}: a dynamic label reads its spot context; translateCallback gets it as params.ctx', () => {
    const seen: unknown[] = [];
    const own: TranslateCallback = ({ key, params }) => {
      if (key === 'web-command-palette.labels.scopeSearchingIn') seen.push(params);
      return null;
    };
    const { m } = harness({ labels: { 'messages.typeToSearch': 'Hledej v {ctx.name} ({ctx.trigger})' }, translateCallback: own });
    m.setInput(':p ');
    expect(m.contextText).toBe('Searching in Products');
    expect(seen.at(-1)).toEqual({ ctx: { id: 'products', name: 'Products', trigger: ':products' } });
    expect(m.emptyText).toBe('Hledej v Products (:products)');
  });

  it('setOptions: a changed option applies on the next read', () => {
    const { m } = harness();
    m.setOptions({ translateCallback: upper });
    expect(m.placeholder).toBe(DEFAULT_LABELS['placeholders.idle'].toUpperCase());
  });

  it('a throwing translateCallback falls back to the next rule — standalone (host: null) and with an element', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const boom: TranslateCallback = () => { throw new Error('boom'); };
    expect(harness({ translateCallback: boom }).m.placeholder).toBe(DEFAULT_LABELS['placeholders.idle']);
    const element = document.createElement('div');
    const { m } = harness({ translateCallback: boom, element });
    expect(m.placeholder).toBe(DEFAULT_LABELS['placeholders.idle']);
  });
});

describe('engine locale (no element, C-CA-38)', () => {
  const showAll = (m: ReturnType<typeof harness>['m']): string => m.labels.text('buttons.showAll', { ctx: { count: 1234, view: 'favorites' } });

  it('the default is ENGINE_DEFAULTS.locale (null) — the same value the element row uses', () => {
    expect(ENGINE_DEFAULTS.locale).toBeNull();
  });

  it('locale: "de" formats the numbers in labels', () => {
    const { m } = harness({ locale: 'de' });
    expect(showAll(m)).toContain('1.234');
  });

  it('unset follows window.components.locale.locale; setOptions applies a new one', () => {
    page().locale = { locale: 'de' };
    const { m } = harness();
    expect(showAll(m)).toContain('1.234');
    m.setOptions({ locale: 'en' });
    expect(showAll(m)).toContain('1,234');
    m.setOptions({ locale: 'auto' });
    expect(showAll(m)).toContain('1.234');
  });

  it("translateCallback gets the engine's locale as ctx.locale", () => {
    const own = vi.fn<TranslateCallback>(() => null);
    harness({ locale: 'cs', translateCallback: own }).m.placeholder;
    expect(own).toHaveBeenCalledWith(expect.objectContaining({ locale: 'cs' }));
  });
});

describe('render ctx: ctx.labels (no element)', () => {
  const labelled = (): Command => ({
    id: 'lab', trigger: '/lab', text: 'Lab',
    getTextCallback: (ctx) => `${ctx.labels.text('headers.commands')}: lab`,
  });

  it('a command get*Callback reads ctx.labels (non-enumerable); a labels change re-runs it in place', () => {
    let keys: string[] = [];
    const cmd: Command = { ...labelled(), getTooltipCallback: (ctx) => { keys = Object.keys(ctx); return ''; } };
    const { m } = harness({ commands: [cmd] });
    m.setInput('/la');
    const title = () => m.items.find((i) => i.kind === 'command')?.title;
    expect(title()).toBe('Commands: lab');
    expect(keys).not.toContain('labels');
    const before = m.listVersion;
    m.setOptions({ labels: { 'headers.commands': 'Příkazy' } });
    expect(title()).toBe('Příkazy: lab');
    expect(m.input).toBe('/la');
    expect(m.listVersion).toBeGreaterThan(before);
  });

  it('labelsChanged() keeps the home screen active row', () => {
    const { m } = harness({ commands: [...COMMANDS, labelled()] });
    m.move('down');
    m.move('down');
    const active = m.items[m.activeIndex]!.key;
    m.setOptions({ translateCallback: ({ key }) => (key.endsWith('headers.commands') ? 'X' : null) });
    expect(m.items.find((i) => i.ref && (i.ref as Command).id === 'lab')?.title).toBe('X: lab');
    expect(m.items[m.activeIndex]!.key).toBe(active);
  });
});
