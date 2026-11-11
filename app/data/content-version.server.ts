import { cacheEpoch } from "./site-refresh.server";

type VersionState = { memo?: { updated: string; at: number }; pending?: Promise<string> };
const versions = new WeakMap<D1Database, VersionState>();

/** Բովանդակության վերջին փոփոխությունը՝ 15 վրկ հիշողությամբ և միավորված միաժամանակյա ընթերցումներով։ */
async function latestUpdate(database: D1Database) {
  let state = versions.get(database);
  if (!state) { state = {}; versions.set(database, state); }
  if (state.memo && Date.now() - state.memo.at < 15_000) return state.memo.updated;
  if (state.pending) return state.pending;
  const current = state;
  const task = database.prepare("SELECT MAX(updated_at) AS updated FROM library_materials").first<{ updated: string | null }>().catch(() => null).then(row => {
    const updated = row?.updated ? Date.parse(row.updated) : 0;
    current.memo = { updated: Number.isFinite(updated) ? updated.toString(36) : "0", at: Date.now() };
    return current.memo.updated;
  });
  current.pending = task;
  try { return await task; }
  finally { if (current.pending === task) current.pending = undefined; }
}

export async function contentVersion(database: D1Database) {
  const [epoch, updated] = await Promise.all([cacheEpoch(database), latestUpdate(database)]);
  return `${epoch}.${updated}`;
}
