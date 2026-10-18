import { createRequestHandler } from "react-router";

const requestHandler = createRequestHandler(
  () => import("virtual:react-router/server-build"),
  import.meta.env.MODE,
);

type SyncEnv = { GITHUB_SYNC_TOKEN?: string; GITHUB_SYNC_REPO?: string };

/**
 * GitHub skips many of its own scheduled runs (hours apart), so Cloudflare's cron starts the
 * Telegram → cloud sync workflow instead. Needs a GitHub token allowed to run Actions on the
 * repository (secret GITHUB_SYNC_TOKEN); without it this does nothing.
 */
async function dispatchCloudSync(env: SyncEnv) {
  const token = env.GITHUB_SYNC_TOKEN?.trim();
  if (!token) return;
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
}

export default {
  async scheduled(_controller, env, context) {
    context.waitUntil(dispatchCloudSync(env as SyncEnv));
  },
  async fetch(request, _env, context) {
    const url = new URL(request.url);
    // These JSON endpoints carry no per-user data, so signed-in Mini App users share their cache too.
    const sharedJson = url.pathname === "/api/search-page" || url.pathname.startsWith("/api/categories/");
    const cacheable = request.method === "GET"
      && (sharedJson || !request.headers.has("cookie"))
      && !url.searchParams.has("refresh")
      && (url.pathname === "/"
        || url.pathname === "/search"
        || url.pathname.startsWith("/categories/")
        || url.pathname.startsWith("/materials/")
        || url.pathname.startsWith("/api/categories/")
        || url.pathname === "/api/search-page");
    if (!cacheable) return requestHandler(request);
    const cache = (caches as CacheStorage & { default: Cache }).default;
    // Cache by URL only, so a cookie never splits or leaks into the shared entry.
    const cacheKey = new Request(url.toString(), { method: "GET" });
    const cached = await cache.match(cacheKey);
    if (cached) return cached;
    const response = await requestHandler(request);
    if (response.status !== 200 || response.headers.has("set-cookie")) return response;
    const cacheResponse = new Response(response.body, response);
    cacheResponse.headers.set("Cache-Control", "public, max-age=30, s-maxage=60");
    context.waitUntil(cache.put(cacheKey, cacheResponse.clone()));
    return cacheResponse;
  },
} satisfies ExportedHandler<Env>;
