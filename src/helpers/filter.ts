/**
 * Client-side static filtering (IMPLEMENTATION_PLAN §10 "perf contract"): the `/`
 * command list, the `:` context list, static command steps and the favorites/recent
 * lists are filtered here — in memory, no provider call. Matching is core's standard
 * Keenmate search (`@keenmate/web-components-core/search`, SPEC §12.11):
 * `search-behavior` decides normalization (default `normalized` — case- and
 * accent-insensitive, `ces` finds `Český`), `search-match` where the term sits
 * (default `contains`). An item matches when any of its text fields does.
 */
import {
  NO_SEARCH_TERM,
  createRegexCompiler,
  matchesSearchTerm,
  normalizeSearchText,
  prepareSearchTerm,
  type ActiveSearchTerm,
  type RegexCompiler,
  type SearchBehavior,
  type SearchMatch,
} from '@keenmate/web-components-core/search';
import type { Command, Context, Option } from '../types';

/** The palette's `search-behavior` / `search-match` pair. */
export interface SearchRules {
  behavior: SearchBehavior;
  match: SearchMatch;
}

export const DEFAULT_SEARCH_RULES: Readonly<SearchRules> = Object.freeze({ behavior: 'normalized', match: 'contains' });

/** A typed term prepared once for one filtering pass (term + the rules it was prepared under). */
export interface SearchQuery extends SearchRules {
  term: ActiveSearchTerm;
}

/** The "no search" query — every item matches, nothing is highlighted. */
export const NO_SEARCH_QUERY: Readonly<SearchQuery> = Object.freeze({ ...DEFAULT_SEARCH_RULES, term: NO_SEARCH_TERM });

/**
 * Prepare a typed `needle` (trimmed by core; empty → no search) under `rules`. `regex` is the
 * instance's compiler (it keeps the last valid pattern while a `regex` term is mid-typing);
 * omitted → a throwaway one.
 */
export function prepareQuery(needle: string, rules: SearchRules = DEFAULT_SEARCH_RULES, regex: RegexCompiler = createRegexCompiler()): SearchQuery {
  return { behavior: rules.behavior, match: rules.match, term: prepareSearchTerm(needle, { behavior: rules.behavior, match: rules.match, regex }) };
}

const text = (v: unknown): string => (v == null ? '' : String(v));

/** Whether any of `fields` matches `query`. An empty query matches everything. */
export function matchesAny(fields: readonly unknown[], query: SearchQuery): boolean {
  if (query.term.kind === 'none') return true;
  return fields.some((f) => {
    const raw = text(f);
    return raw !== '' && matchesSearchTerm(query.term, query.match, () => normalizeSearchText(raw, query.behavior), raw);
  });
}

export function commandFields(c: Command): unknown[] {
  return [c.text, c.trigger, ...(c.aliases ?? []), c.description];
}

export function contextFields(c: Context): unknown[] {
  return [c.text, c.trigger, ...(c.aliases ?? []), c.description];
}

export function optionFields(o: Option): unknown[] {
  const value = typeof o.value === 'string' || typeof o.value === 'number' ? o.value : null;
  return [o.text, value, o.description];
}

export function filterCommands(list: readonly Command[], query: SearchQuery): Command[] {
  return list.filter((c) => matchesAny(commandFields(c), query));
}

export function filterContexts(list: readonly Context[], query: SearchQuery): Context[] {
  return list.filter((c) => matchesAny(contextFields(c), query));
}

export function filterOptions(list: readonly Option[], query: SearchQuery): Option[] {
  return list.filter((o) => matchesAny(optionFields(o), query));
}

/**
 * Global-search prepend (mirrors keen's `global_matches`): commands/contexts whose
 * text, trigger, or an alias matches the query. Description is deliberately NOT
 * searched here so a free-text query doesn't drag in loosely related commands.
 * An empty query prepends nothing.
 */
export function globalMatches<T extends Command | Context>(list: readonly T[], query: SearchQuery): T[] {
  if (query.term.kind === 'none') return [];
  return list.filter((e) => matchesAny([e.text, e.trigger, ...(e.aliases ?? [])], query));
}

/** Exact (case-insensitive) trigger-or-alias lookup — token routing, not search. */
export function findByTrigger<T extends Command | Context>(list: readonly T[], token: string): T | undefined {
  const t = token.toLowerCase();
  return list.find((e) => [e.trigger, ...(e.aliases ?? [])].some((s) => s.toLowerCase() === t));
}
