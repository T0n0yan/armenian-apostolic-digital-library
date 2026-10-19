import { createRequestHandler } from "react-router";

import { sendDueReminders } from "../app/data/reminders.server";
import { pushKeysFrom } from "../app/data/web-push.server";

const requestHandler = createRequestHandler(
  () => import("virtual:react-router/server-build"),
  import.meta.env.MODE,
);

type SyncEnv = { GITHUB_SYNC_TOKEN?: string; GITHUB_SYNC_REPO?: string };
type ReminderEnv = { DB: D1Database; TELEGRAM_BOT_TOKEN?: string; PUBLIC_URL?: string; VAPID_PUBLIC_KEY?: string; VAPID_PRIVATE_JWK?: string; VAPID_SUBJECT?: string };

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

/** Security headers on every response. Telegram Web shows the Mini App in a frame, so only it may frame the site. */
function secure(response: Response) {
  const headers = new Headers(response.headers);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("Permissions-Policy", "camera=(), microphone=(), payment=(), usb=(), geolocation=(self)");
  headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  headers.set("Content-Security-Policy", "frame-ancestors 'self' https://web.telegram.org https://*.telegram.org; object-src 'none'; base-uri 'self'");
  headers.set("Cross-Origin-Opener-Policy", "same-origin-allow-popups");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export default {
  async scheduled(controller, env, context) {
    const reminderEnv = env as unknown as ReminderEnv;
    if (reminderEnv.PUBLIC_URL) {
      context.waitUntil(sendDueReminders(reminderEnv.DB, {
        token: reminderEnv.TELEGRAM_BOT_TOKEN?.trim() || null,
        publicUrl: reminderEnv.PUBLIC_URL.replace(/\/$/u, ""),
        pushKeys: pushKeysFrom(reminderEnv),
      }));
    }
    // The cron fires every minute; the sync only needs to start every half hour.
    if (new Date(controller.scheduledTime).getUTCMinutes() % 30 === 0) context.waitUntil(dispatchCloudSync(env as SyncEnv));
  },
  async fetch(request, env, context) {
    return secure(await handle(request, env, context));
  },
} satisfies ExportedHandler<Env>;

async function handle(request: Request, _env: Env, context: ExecutionContext): Promise<Response> {
  {
    const url = new URL(request.url);
    // These JSON endpoints carry no per-user data, so signed-in Mini App users share their cache too.
    const sharedJson = url.pathname === "/api/search-page" || url.pathname === "/api/search-suggestions" || url.pathname.startsWith("/api/categories/");
    const cacheable = request.method === "GET"
      && (sharedJson || !request.headers.has("cookie"))
      && !url.searchParams.has("refresh")
      && (url.pathname === "/"
        || url.pathname === "/search"
        || url.pathname.startsWith("/categories/")
        || url.pathname.startsWith("/materials/")
        || url.pathname.startsWith("/api/categories/")
        || url.pathname === "/api/search-page"
        || url.pathname === "/api/search-suggestions");
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
  }
}
