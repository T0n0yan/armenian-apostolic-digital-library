import { cacheEpoch } from "./site-refresh.server";

/**
 * Public library data kept in the Worker's memory for a short while, shared by everyone the
 * instance serves — signed-in Mini App readers too, whose pages the edge cache can't share.
 * Each entry lives `ttlMs` (the sync adds posts every 30 minutes, so a minute is invisible) and
 * is dropped at once when an admin presses «Թարմացնել հիմա» (the cache version changes).
 * Only public data goes here, never a reader's own.
 */
const MAX_ENTRIES = 400;
type Entry = { expiresAt: number; value: unknown };
const databases = new WeakMap<D1Database, { entries: Map<string, Entry>; pending: Map<string, Promise<unknown>> }>();

export async function remember<T>(database: D1Database, key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  let state = databases.get(database);
  if (!state) { state = { entries: new Map(), pending: new Map() }; databases.set(database, state); }
  const fullKey = `${await cacheEpoch(database)}:${key}`;
  const hit = state.entries.get(fullKey);
  if (hit && hit.expiresAt > Date.now()) {
    state.entries.delete(fullKey);
    state.entries.set(fullKey, hit);
    return hit.value as T;
  }
  const existing = state.pending.get(fullKey);
  if (existing) return existing as Promise<T>;
  const current = state;
  const task = Promise.resolve().then(load).then(value => {
    current.entries.set(fullKey, { expiresAt: Date.now() + ttlMs, value });
    while (current.entries.size > MAX_ENTRIES) current.entries.delete(current.entries.keys().next().value as string);
    return value;
  });
  current.pending.set(fullKey, task);
  try { return await task; }
  finally { if (current.pending.get(fullKey) === task) current.pending.delete(fullKey); }
}
