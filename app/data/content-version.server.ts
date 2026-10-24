import { cacheEpoch } from "./site-refresh.server";

let memo: { value: string; at: number } | null = null;

/**
 * Changes whenever the library's content does (a sync writes or takes down a post) or an admin
 * presses «Թարմացնել հիմա». Phones keep pages and the title index until it changes, so they ask
 * the server again only for something new. Read from D1 at most every 15 seconds per instance.
 */
export async function contentVersion(database: D1Database) {
  if (memo && Date.now() - memo.at < 15_000) return memo.value;
  const [epoch, row] = await Promise.all([
    cacheEpoch(database),
    database.prepare("SELECT MAX(updated_at) AS updated FROM library_materials").first<{ updated: string | null }>().catch(() => null),
  ]);
  const updated = row?.updated ? Date.parse(row.updated) : 0;
  memo = { value: `${epoch}.${Number.isFinite(updated) ? updated.toString(36) : "0"}`, at: Date.now() };
  return memo.value;
}
