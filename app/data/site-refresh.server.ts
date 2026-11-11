type SyncEnv = { GITHUB_SYNC_TOKEN?: string; GITHUB_SYNC_REPO?: string };

/**
 * Starts the Telegram → cloud sync workflow on GitHub. Needs a GitHub token allowed to run
 * Actions on the repository (secret GITHUB_SYNC_TOKEN); without it this does nothing.
 */
export async function dispatchCloudSync(env: SyncEnv) {
  const token = env.GITHUB_SYNC_TOKEN?.trim();
  if (!token) return false;
  const repository = env.GITHUB_SYNC_REPO?.trim() || "T0n0yan/armenian-apostolic-digital-library";
  const response = await fetch(`https://api.github.com/repos/${repository}/actions/workflows/cloud-sync.yml/dispatches`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      accept: "application/vnd.github+json",
      "user-agent": "armenian-apostolic-digital-library",
      "x-github-api-version": "2022-11-28",
    },
    body: JSON.stringify({ ref: "main" }),
  });
  if (!response.ok) console.error("cloud sync dispatch failed", response.status, await response.text());
  return response.ok;
}

type EpochState = { memo?: { value: string; at: number }; pending?: Promise<string>; revision: number };
const epochs = new WeakMap<D1Database, EpochState>();
function epochState(database: D1Database) {
  let state = epochs.get(database);
  if (!state) { state = { revision: 0 }; epochs.set(database, state); }
  return state;
}

/**
 * The site's cache version: part of every edge-cache key, so changing it makes all cached pages
 * fresh at once. Read from D1 at most every 15 seconds per Worker instance.
 */
/** Բովանդակության տարբերակի հասցեն Cloudflare-ի cache-ում։ */
export const CONTENT_VERSION_KEY = "https://edge-cache.internal/__content-version";

export async function cacheEpoch(database: D1Database) {
  const state = epochState(database);
  if (state.memo && Date.now() - state.memo.at < 15_000) return state.memo.value;
  if (state.pending) return state.pending;
  const revision = state.revision;
  const task = database.prepare("SELECT value FROM site_settings WHERE key = 'cache_epoch'").first<{ value: string }>().catch(() => null).then(row => {
    if (revision === state.revision) state.memo = { value: row?.value ?? "0", at: Date.now() };
    return state.memo?.value ?? "0";
  });
  state.pending = task;
  try { return await task; }
  finally { if (state.pending === task) state.pending = undefined; }
}

/** "Թարմացնել կայքը": every cached page is rebuilt on its next visit. */
export async function bumpCacheEpoch(database: D1Database) {
  const value = String(Date.now());
  await database.prepare("INSERT INTO site_settings (key, value) VALUES ('cache_epoch', ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')").bind(value).run();
  const state = epochState(database);
  state.revision += 1;
  state.memo = { value, at: Date.now() };
  // Cloudflare-ի cache-ում պահված տարբերակը (workers/app.ts) նույնպես ջնջում ենք, որ փոփոխությունն անմիջապես երևա։
  await (globalThis.caches as (CacheStorage & { default?: Cache }) | undefined)?.default?.delete(CONTENT_VERSION_KEY).catch(() => false);
  return value;
}
