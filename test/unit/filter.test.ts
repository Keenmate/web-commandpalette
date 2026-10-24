import { describe, expect, it } from 'vitest';
import { filterOptions, findByTrigger, globalMatches, matchesAny } from '../../src/filter';
import { findSequenceCommand } from '../../src/keyboard';
import { highlight } from '../../src/render';
import { renderIcon } from '../../src/icons';
import { COMMANDS, CONTEXTS } from './helpers';

describe('filter', () => {
  it('matchesAny is a case-insensitive substring match; empty needle matches', () => {
    expect(matchesAny(['Production'], 'DUCT')).toBe(true);
    expect(matchesAny(['Production'], 'x')).toBe(false);
    expect(matchesAny(['anything'], '  ')).toBe(true);
  });

  it('filterOptions searches text, primitive value and description', () => {
    const opts = [{ text: 'A', value: 'alpha' }, { text: 'B', description: 'beta thing' }, { text: 'C', value: { x: 1 } }];
    expect(filterOptions(opts, 'alp').map((o) => o.text)).toEqual(['A']);
    expect(filterOptions(opts, 'beta').map((o) => o.text)).toEqual(['B']);
    expect(filterOptions(opts, 'object').map((o) => o.text)).toEqual([]);
  });

  it('globalMatches ignores descriptions and empty queries', () => {
    expect(globalMatches(COMMANDS, '').length).toBe(0);
    expect(globalMatches(COMMANDS, 'session')).toEqual([]);
    expect(globalMatches(CONTEXTS, ':u').map((c) => c.id)).toEqual(['users']);
  });

  it('findByTrigger matches the trigger or an alias exactly, case-insensitively', () => {
    expect(findByTrigger(COMMANDS, '/D')?.id).toBe('deploy');
    expect(findByTrigger(COMMANDS, '/dep')).toBeUndefined();
  });
});

describe('keyboard helpers', () => {
  it('resolves "g <letter>" sequences only (never chords)', () => {
    expect(findSequenceCommand(COMMANDS, 'd')?.id).toBe('deploy');
    expect(findSequenceCommand([{ id: 'k', trigger: '/k', text: 'K', shortcut: 'Ctrl+K' }], 'k')).toBeUndefined();
  });
});

describe('render helpers', () => {
  it('highlight escapes and marks every case-insensitive occurrence', () => {
    expect(highlight('Air<Pods> pods', 'pods')).toBe('Air&lt;<mark>Pods</mark>&gt; <mark>pods</mark>');
    expect(highlight('a&b', '')).toBe('a&amp;b');
  });

  it('renderIcon: svg raw, name → pa-icon span, glyph → escaped text', () => {
    expect(renderIcon('<svg></svg>')).toBe('<svg></svg>');
    expect(renderIcon('fa-gear')).toBe('<span class="pa-icon pa-icon--fa-gear" aria-hidden="true"></span>');
    expect(renderIcon('🚀')).toBe('🚀');
    expect(renderIcon(undefined)).toBe('');
  });
});
