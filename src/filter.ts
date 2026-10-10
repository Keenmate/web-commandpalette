/**
 * Client-side static filtering (IMPLEMENTATION_PLAN §10 "perf contract"): the `/`
 * command list, the `:` context list, and static command steps are filtered here
 * — in memory, no provider call. Lower-cased substring match over every text field.
 */
import type { Command, Context, Option } from './types';

const norm = (v: unknown): string => (v == null ? '' : String(v)).toLowerCase();

/** Substring match of `needle` (already trimmed) against any of `fields`. Empty needle matches all. */
export function matchesAny(fields: readonly unknown[], needle: string): boolean {
  const q = norm(needle).trim();
  if (!q) return true;
  return fields.some((f) => norm(f).includes(q));
}

export function commandFields(c: Command): unknown[] {
  return [c.name, c.shortcut, ...(c.aliases ?? []), c.description];
}

export function contextFields(c: Context): unknown[] {
  return [c.name, c.shortcut, ...(c.aliases ?? []), c.description];
}

export function optionFields(o: Option): unknown[] {
  const value = typeof o.value === 'string' || typeof o.value === 'number' ? o.value : null;
  return [o.label, value, o.description];
}

export function filterCommands(list: readonly Command[], needle: string): Command[] {
  return list.filter((c) => matchesAny(commandFields(c), needle));
}

export function filterContexts(list: readonly Context[], needle: string): Context[] {
  return list.filter((c) => matchesAny(contextFields(c), needle));
}

export function filterOptions(list: readonly Option[], needle: string): Option[] {
  return list.filter((o) => matchesAny(optionFields(o), needle));
}

/**
 * Global-search prepend (mirrors keen's `global_matches`): commands/contexts whose
 * name, shortcut, or an alias contains the query. Description is deliberately NOT
 * searched here so a free-text query doesn't drag in loosely related commands.
 */
export function globalMatches<T extends Command | Context>(list: readonly T[], query: string): T[] {
  const q = norm(query).trim();
  if (!q) return [];
  return list.filter((e) => [e.name, e.shortcut, ...(e.aliases ?? [])].some((f) => norm(f).includes(q)));
}

/** Exact (case-insensitive) shortcut-or-alias lookup. */
export function findByShortcut<T extends Command | Context>(list: readonly T[], token: string): T | undefined {
  const t = token.toLowerCase();
  return list.find((e) => [e.shortcut, ...(e.aliases ?? [])].some((s) => s.toLowerCase() === t));
}
