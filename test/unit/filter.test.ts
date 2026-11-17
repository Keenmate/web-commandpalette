import { describe, expect, it } from 'vitest';
import { filterOptions, findByTrigger, globalMatches, matchesAny, prepareQuery, type SearchRules } from '../../src/helpers/filter';
import { bindGlobalKeys, isSequence, modChord } from '../../src/keyboard';
import { highlight } from '../../src/render';
import { renderIcon } from '../../src/helpers/icons';
import { COMMANDS, CONTEXTS } from './helpers';

describe('filter', () => {
  const q = (needle: string, rules?: SearchRules) => prepareQuery(needle, rules);

  it('matchesAny is core search: case- and accent-insensitive by default; empty needle matches', () => {
    expect(matchesAny(['Production'], q('DUCT'))).toBe(true);
    expect(matchesAny(['Production'], q('x'))).toBe(false);
    expect(matchesAny(['anything'], q('  '))).toBe(true);
    expect(matchesAny(['Český Krumlov'], q('ces'))).toBe(true);
    expect(matchesAny(['Müller'], q('muller'))).toBe(true);
  });

  it('honours search-behavior and search-match', () => {
    expect(matchesAny(['Český'], q('ces', { behavior: 'case-insensitive', match: 'contains' }))).toBe(false);
    expect(matchesAny(['Český'], q('čes', { behavior: 'case-insensitive', match: 'contains' }))).toBe(true);
    expect(matchesAny(['Český'], q('čes', { behavior: 'exact', match: 'contains' }))).toBe(false);
    expect(matchesAny(['Deploy staging'], q('sta', { behavior: 'normalized', match: 'word-starts-with' }))).toBe(true);
    expect(matchesAny(['Deploy staging'], q('ploy', { behavior: 'normalized', match: 'word-starts-with' }))).toBe(false);
    expect(matchesAny(['Deploy staging'], q('^Dep', { behavior: 'normalized', match: 'regex' }))).toBe(true);
  });

  it('filterOptions searches text, primitive value and description', () => {
    const opts = [{ text: 'A', value: 'alpha' }, { text: 'B', description: 'beta thing' }, { text: 'C', value: { x: 1 } }];
    expect(filterOptions(opts, q('alp')).map((o) => o.text)).toEqual(['A']);
    expect(filterOptions(opts, q('beta')).map((o) => o.text)).toEqual(['B']);
    expect(filterOptions(opts, q('object')).map((o) => o.text)).toEqual([]);
  });

  it('globalMatches ignores descriptions and empty queries', () => {
    expect(globalMatches(COMMANDS, q('')).length).toBe(0);
    expect(globalMatches(COMMANDS, q('session'))).toEqual([]);
    expect(globalMatches(CONTEXTS, q(':u')).map((c) => c.id)).toEqual(['users']);
  });

  it('findByTrigger matches the trigger or an alias exactly, case-insensitively', () => {
    expect(findByTrigger(COMMANDS, '/D')?.id).toBe('deploy');
    expect(findByTrigger(COMMANDS, '/dep')).toBeUndefined();
  });
});

describe('keyboard helpers (core /actions shortcuts)', () => {
  it('only sequences run globally (never chords); Mod chords for the palette keys', () => {
    expect(isSequence('g d')).toBe(true);
    expect(isSequence('Ctrl+K')).toBe(false);
    expect(isSequence('')).toBe(false);
    expect(modChord('d')).toBe('Mod+d');
    expect(modChord('')).toBe('');
  });

  it('bindGlobalKeys: a command sequence runs while closed, a chord shortcut does not, Mod+<openKey> toggles', () => {
    const ran: string[] = [];
    let isOpen = false;
    const press = (key: string, init: KeyboardEventInit = {}): void => {
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }));
    };
    const unbind = bindGlobalKeys({
      isOpen: () => isOpen,
      toggle: () => ran.push('toggle'),
      openKey: () => 'k',
      commands: () => [...COMMANDS, { id: 'chord', trigger: '/c', text: 'C', shortcut: 'Ctrl+J' }],
      runCommand: (c) => ran.push(c.id),
      sequences: () => new Map([['g f', () => ran.push('favorites')]]),
    });
    press('g'); press('d');
    press('g'); press('f');
    press('j', { ctrlKey: true });
    press('k', { ctrlKey: true });
    isOpen = true;
    press('g'); press('d');
    unbind();
    press('k', { ctrlKey: true });
    expect(ran).toEqual(['deploy', 'favorites', 'toggle']);
  });
});

describe('render helpers', () => {
  it('highlight escapes and marks every match through core (accent-insensitive by default)', () => {
    expect(highlight('Air<Pods> pods', prepareQuery('pods'))).toBe('Air&lt;<mark>Pods</mark>&gt; <mark>pods</mark>');
    expect(highlight('a&b', prepareQuery(''))).toBe('a&amp;b');
    // 'İ' lower-cases to two characters — the mark must not slide off the match.
    expect(highlight('İzmir, Smyrna', prepareQuery('smyrna'))).toBe('İzmir, <mark>Smyrna</mark>');
    expect(highlight('a.b (c)', prepareQuery('(c)'))).toBe('a.b <mark>(c)</mark>');
    expect(highlight('Český <b>', prepareQuery('ces'))).toBe('<mark>Čes</mark>ký &lt;b&gt;');
  });

  it('renderIcon: svg raw, name → cp__icon span, glyph → escaped text', () => {
    expect(renderIcon('<svg></svg>')).toBe('<svg></svg>');
    expect(renderIcon('fa-gear')).toBe('<span class="cp__icon cp__icon--fa-gear" aria-hidden="true"></span>');
    expect(renderIcon('🚀')).toBe('🚀');
    expect(renderIcon(undefined)).toBe('');
  });
});
