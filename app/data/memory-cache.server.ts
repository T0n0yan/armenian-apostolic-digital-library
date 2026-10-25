import { cacheEpoch } from "./site-refresh.server";

/**
 * Public library data kept in the Worker's memory for a short while, shared by everyone the
 * instance serves — signed-in Mini App readers too, whose pages the edge cache can't share.
 * Each entry lives `ttlMs` (the sync adds posts every 30 minutes, so a minute is invisible) and
 * is dropped at once when an admin presses «Թարմացնել հիմա» (the cache version changes).
 * Only public data goes here, never a reader's own.
 */
const MAX_ENTRIES = 400;
const entries = new Map<string, { expiresAt: number; value: unknown }>();

export async function remember<T>(database: D1Database, key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const fullKey = `${await cacheEpoch(database)}:${key}`;
  const now = Date.now();
  const hit = entries.get(fullKey);
  if (hit && hit.expiresAt > now) {
    // Most recently used last, so the oldest is dropped first.
    entries.delete(fullKey);
    entries.set(fullKey, hit);
    return hit.value as T;
  }
  const value = await load();
  entries.set(fullKey, { expiresAt: now + ttlMs, value });
  while (entries.size > MAX_ENTRIES) entries.delete(entries.keys().next().value as string);
  return value;
}
