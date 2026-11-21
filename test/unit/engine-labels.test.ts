import { afterEach, describe, expect, it, vi } from 'vitest';
import { publishLocaleHooks, type TranslateCallback } from '@keenmate/web-components-core/locale';
import { DEFAULT_LABELS, ENGINE_DEFAULTS } from '../../src/types';
import { harness } from './helpers';

/**
 * The engine without the element: its own `labels` / `translateCallback` host options
 * resolve the engine's texts (placeholder, context pill, empty state) under core's
 * order — instance labels → own translateCallback → page-wide translateCallback → English.
 */
const page = (): Record<string, unknown> => window.components as unknown as Record<string, unknown>;

const upper: TranslateCallback = ({ template }) => template.toUpperCase();
const pageWide: TranslateCallback = ({ key }) => `page:${key}`;

afterEach(() => {
  publishLocaleHooks();
  page().locale = null;
  vi.restoreAllMocks();
});

describe('engine labels (no element)', () => {
  it('defaults to English', () => {
    const { m } = harness();
    expect(m.placeholder).toBe(DEFAULT_LABELS['placeholders.idle']);
  });

  it('labels: an instance label (short or full key) replaces the default', () => {
    const { m, host } = harness({ labels: { 'placeholders.idle': 'Hledat…' } });
    expect(m.placeholder).toBe('Hledat…');
    host.state.labels = { 'web-command-palette.labels.scopeCommands': 'Příkazy' };
    m.setInput('/');
    expect(m.contextText).toBe('Příkazy');
  });

  it("translateCallback: the engine's own hook beats the page-wide one", () => {
    publishLocaleHooks();
    page().locale = { translateCallback: pageWide };
    const { m } = harness({ translateCallback: upper });
    expect(m.placeholder).toBe(DEFAULT_LABELS['placeholders.idle'].toUpperCase());
  });

  it('translateCallback: null / not set → the page-wide one answers', () => {
    publishLocaleHooks();
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

  it('is read live: a changed host option applies on the next read', () => {
    const { m, host } = harness();
    host.state.translateCallback = upper;
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
  const showAll = (m: ReturnType<typeof harness>['m']): string => m.labels.text('buttons.showAll', { count: 1234 });

  it('the default is ENGINE_DEFAULTS.locale (null) — the same value the element row uses', () => {
    expect(ENGINE_DEFAULTS.locale).toBeNull();
  });

  it('locale: "de" formats the numbers in labels', () => {
    const { m } = harness({ locale: 'de' });
    expect(showAll(m)).toContain('1.234');
  });

  it('unset follows window.components.locale.locale; read live', () => {
    page().locale = { locale: 'de' };
    const { m, host } = harness();
    expect(showAll(m)).toContain('1.234');
    host.state.locale = 'en';
    expect(showAll(m)).toContain('1,234');
    host.state.locale = 'auto';
    expect(showAll(m)).toContain('1.234');
  });

  it("translateCallback gets the engine's locale as ctx.locale", () => {
    const own = vi.fn<TranslateCallback>(() => null);
    harness({ locale: 'cs', translateCallback: own }).m.placeholder;
    expect(own).toHaveBeenCalledWith(expect.objectContaining({ locale: 'cs' }));
  });
});
