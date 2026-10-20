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

let memo: { value: string; at: number } | null = null;

/**
 * The site's cache version: part of every edge-cache key, so changing it makes all cached pages
 * fresh at once. Read from D1 at most every 15 seconds per Worker instance.
 */
export async function cacheEpoch(database: D1Database) {
  if (memo && Date.now() - memo.at < 15_000) return memo.value;
  const row = await database.prepare("SELECT value FROM site_settings WHERE key = 'cache_epoch'").first<{ value: string }>().catch(() => null);
  memo = { value: row?.value ?? "0", at: Date.now() };
  return memo.value;
}

/** "Թարմացնել կայքը": every cached page is rebuilt on its next visit. */
export async function bumpCacheEpoch(database: D1Database) {
  const value = String(Date.now());
  await database.prepare("INSERT INTO site_settings (key, value) VALUES ('cache_epoch', ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')").bind(value).run();
  memo = { value, at: Date.now() };
  return value;
}
