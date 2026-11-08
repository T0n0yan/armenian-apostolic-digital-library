import { cacheEpoch } from "./site-refresh.server";

let memo: { epoch: string; updated: string; at: number } | null = null;

/**
 * Changes whenever the library's content does (a sync writes or takes down a post) or an admin
 * presses «Թարմացնել հիմա». Phones keep pages and the title index until it changes, so they ask
 * the server again only for something new; it is also part of the edge-cache key (workers/app.ts).
 * The newest post is read from D1 at most every 15 seconds per instance; the cache version has its
 * own memory, which an admin action in this instance resets at once.
 */
export async function contentVersion(database: D1Database) {
  const fresh = memo && Date.now() - memo.at < 15_000;
  const [epoch, row] = await Promise.all([
    cacheEpoch(database),
    fresh ? null : database.prepare("SELECT MAX(updated_at) AS updated FROM library_materials").first<{ updated: string | null }>().catch(() => null),
  ]);
  if (!fresh || !memo) {
    const updated = row?.updated ? Date.parse(row.updated) : 0;
    memo = { epoch, updated: Number.isFinite(updated) ? updated.toString(36) : "0", at: Date.now() };
  }
  return `${epoch}.${memo.updated}`;
}
