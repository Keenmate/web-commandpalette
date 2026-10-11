/**
 * Favorites + recently/frequently used items. DOM-free: the machine records and
 * reads entries; persistence is pluggable (`UsagePersistence`) — `localStorage`
 * by default, or the host's load/upsert callbacks.
 */
import type { MaybePromise, Result, Scope, Selection, UsageEntry } from './types';

/** Non-favorite entries kept (by rank). Favorites are never pruned. */
export const MAX_RECENT_ENTRIES = 50;
/** Frecency half-life: a use counts half as much after this many days. */
const HALF_LIFE_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface UsagePersistence {
  load(): MaybePromise<UsageEntry[] | null | undefined>;
  /** Upsert one changed entry. */
  save(entry: UsageEntry, all: readonly UsageEntry[]): MaybePromise<void>;
}

/** What a usage entry points at, before it has stats. */
export type UsageTarget = Pick<UsageEntry, 'kind' | 'label'> &
  Partial<Pick<UsageEntry, 'commandId' | 'selections' | 'contextId' | 'item' | 'scope'>>;

const scopeKey = (scope: Scope | undefined): string => (!scope || scope === 'global' ? 'global' : scope.contextId);

/** Stable identity of a target. A run is keyed by its answers, so re-running the same answers bumps one entry. */
export function usageKey(t: UsageTarget): string {
  switch (t.kind) {
    case 'command': return `command:${t.commandId}`;
    case 'context': return `context:${t.contextId}`;
    case 'result': return `result:${scopeKey(t.scope)}:${t.item?.id}`;
    case 'run': return `run:${t.commandId}:${JSON.stringify((t.selections ?? []).map((s) => [s.stepId, s.optionId ?? s.value]))}`;
  }
}

/** Frequency weighted by recency. */
export function frecency(e: UsageEntry, now = Date.now()): number {
  const ageDays = Math.max(0, now - e.lastUsed) / DAY_MS;
  return e.count * Math.pow(0.5, ageDays / HALF_LIFE_DAYS);
}

const isEntry = (v: unknown): v is UsageEntry =>
  !!v && typeof v === 'object' && typeof (v as UsageEntry).key === 'string' && typeof (v as UsageEntry).kind === 'string';

export class UsageStore {
  #entries = new Map<string, UsageEntry>();
  #persistence: UsagePersistence | null;
  #onChange: () => void;
  #onError: (err: unknown) => void;
  #loadToken = 0;

  constructor(persistence: UsagePersistence | null, onChange: () => void, onError: (err: unknown) => void = () => {}) {
    this.#persistence = persistence;
    this.#onChange = onChange;
    this.#onError = onError;
  }

  /** (Re)load from persistence. A superseded load's late result is dropped. */
  load(): void {
    const token = ++this.#loadToken;
    const apply = (list: UsageEntry[] | null | undefined): void => {
      if (token !== this.#loadToken) return;
      this.#entries = new Map((Array.isArray(list) ? list : []).filter(isEntry).map((e) => [e.key, { ...e }]));
      this.#onChange();
    };
    let out: MaybePromise<UsageEntry[] | null | undefined>;
    try {
      out = this.#persistence?.load();
    } catch (err) {
      this.#onError(err);
      return apply([]);
    }
    if (out && typeof (out as Promise<unknown>).then === 'function') {
      (out as Promise<UsageEntry[] | null | undefined>).then(apply, (err) => {
        this.#onError(err);
        apply([]);
      });
    } else {
      apply(out as UsageEntry[] | null | undefined);
    }
  }

  get(key: string): UsageEntry | undefined {
    return this.#entries.get(key);
  }

  isFavorite(key: string): boolean {
    return this.#entries.get(key)?.isFavorite ?? false;
  }

  /** A use: count it and refresh its label/payload. */
  record(target: UsageTarget, now = Date.now()): UsageEntry {
    const key = usageKey(target);
    const prev = this.#entries.get(key);
    const entry: UsageEntry = { ...stripUndefined(target), key, count: (prev?.count ?? 0) + 1, lastUsed: now, isFavorite: prev?.isFavorite ?? false };
    this.#put(entry);
    return entry;
  }

  /** Star / unstar. Returns the new state. */
  toggleFavorite(target: UsageTarget, now = Date.now()): boolean {
    const key = usageKey(target);
    const prev = this.#entries.get(key);
    const entry: UsageEntry = prev
      ? { ...prev, isFavorite: !prev.isFavorite }
      : { ...stripUndefined(target), key, count: 0, lastUsed: now, isFavorite: true };
    this.#put(entry);
    return entry.isFavorite;
  }

  /** Starred entries, most recently starred/used first. */
  favorites(): UsageEntry[] {
    return [...this.#entries.values()].filter((e) => e.isFavorite).sort((a, b) => b.lastUsed - a.lastUsed);
  }

  /** Used, non-favorite entries by frecency. */
  recent(limit: number, now = Date.now()): UsageEntry[] {
    if (limit <= 0) return [];
    return [...this.#entries.values()]
      .filter((e) => !e.isFavorite && e.count > 0)
      .sort((a, b) => frecency(b, now) - frecency(a, now) || b.lastUsed - a.lastUsed)
      .slice(0, limit);
  }

  all(): UsageEntry[] {
    return [...this.#entries.values()];
  }

  #put(entry: UsageEntry): void {
    this.#entries.set(entry.key, entry);
    this.#prune();
    this.#onChange();
    try {
      const out = this.#persistence?.save(entry, this.all());
      if (out && typeof (out as Promise<void>).then === 'function') (out as Promise<void>).catch(this.#onError);
    } catch (err) {
      this.#onError(err);
    }
  }

  #prune(): void {
    const plain = [...this.#entries.values()].filter((e) => !e.isFavorite);
    if (plain.length <= MAX_RECENT_ENTRIES) return;
    const now = Date.now();
    plain.sort((a, b) => frecency(b, now) - frecency(a, now) || b.lastUsed - a.lastUsed);
    for (const e of plain.slice(MAX_RECENT_ENTRIES)) this.#entries.delete(e.key);
  }
}

function stripUndefined(t: UsageTarget): UsageTarget {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(t)) if (v !== undefined) out[k] = v;
  return out as UsageTarget;
}

/** `localStorage` under `key` (the whole list as one JSON array). */
export function localStoragePersistence(key: string): UsagePersistence {
  return {
    load: () => {
      const raw = globalThis.localStorage?.getItem(key);
      return raw ? (JSON.parse(raw) as UsageEntry[]) : [];
    },
    save: (_entry, all) => {
      globalThis.localStorage?.setItem(key, JSON.stringify(all));
    },
  };
}

/** Plain-JSON copies for persistence / events. */
export const cloneSelections = (list: readonly Selection[]): Selection[] => list.map((s) => ({ ...s }));
export const cloneResult = (r: Result): Result => JSON.parse(JSON.stringify(r)) as Result;
