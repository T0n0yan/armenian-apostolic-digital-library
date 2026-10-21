import { createRequestHandler } from "react-router";

import { sendDueReminders } from "../app/data/reminders.server";
import { pushKeysFrom } from "../app/data/web-push.server";
import { cacheEpoch, dispatchCloudSync } from "../app/data/site-refresh.server";
import { isShortMaterialPath } from "../app/utils/material-path";

const requestHandler = createRequestHandler(
  () => import("virtual:react-router/server-build"),
  import.meta.env.MODE,
);

type SyncEnv = { GITHUB_SYNC_TOKEN?: string; GITHUB_SYNC_REPO?: string };
type ReminderEnv = { DB: D1Database; TELEGRAM_BOT_TOKEN?: string; PUBLIC_URL?: string; VAPID_PUBLIC_KEY?: string; VAPID_PRIVATE_JWK?: string; VAPID_SUBJECT?: string };

// GitHub skips many of its own scheduled runs (hours apart), so Cloudflare's cron starts the
// Telegram → cloud sync workflow instead (dispatchCloudSync).

const MEDIA_EDGE_SECONDS = 86_400;
const MEDIA_WARM_MAX_BYTES = 40 * 1024 * 1024;

/**
 * Pictures and recordings from R2, kept in Cloudflare's edge cache: a repeat request (another
 * reader, or the next part of a recording) is answered there without D1 or R2. Versioned URLs
 * (?v=…) change when the file changes, so browsers may keep them for a year. A deleted post's
 * file leaves the edge within a day.
 */
async function serveMedia(request: Request, context: ExecutionContext): Promise<Response> {
  const cache = (caches as CacheStorage & { default: Cache }).default;
  const url = new URL(request.url);
  const key = new Request(url.toString(), { method: "GET" });
  const range = request.headers.get("Range");
  // The edge cache answers a Range request from a whole cached file with the right 206 part.
  const cached = await cache.match(range ? new Request(key, { headers: { Range: range } }) : key);
  if (cached) return withBrowserCache(cached, url);
  const response = await requestHandler(request);
  if (response.status === 200) {
    context.waitUntil(cache.put(key, forEdge(response.clone())));
  } else if (response.status === 206) {
    // A recording played in parts: fetch it whole once in the background, so the following
    // parts and other listeners come from the edge.
    const total = Number(response.headers.get("Content-Range")?.split("/")[1] ?? 0);
    if (total > 0 && total <= MEDIA_WARM_MAX_BYTES) {
      context.waitUntil(requestHandler(new Request(key)).then((whole) => whole.status === 200 ? cache.put(key, forEdge(whole)) : undefined).catch(() => undefined));
    }
  }
  return withBrowserCache(response, url);
}

function forEdge(response: Response) {
  const copy = new Response(response.body, response);
  copy.headers.set("Cache-Control", `public, max-age=${MEDIA_EDGE_SECONDS}`);
  return copy;
}

function withBrowserCache(response: Response, url: URL) {
  if (!url.searchParams.has("v") || (response.status !== 200 && response.status !== 206)) return response;
  const copy = new Response(response.body, response);
  copy.headers.set("Cache-Control", "public, max-age=31536000, immutable");
  return copy;
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

async function handle(request: Request, env: Env, context: ExecutionContext): Promise<Response> {
  // The site lives at its own address (PUBLIC_URL: apostolic.am, staging.apostolic.am). The old
  // workers.dev address and www. move there, keeping the path, so shared links keep working.
  {
    const url = new URL(request.url);
    const home = (env as unknown as { PUBLIC_URL?: string }).PUBLIC_URL;
    if (home) {
      const target = new URL(home);
      // Plain http:// on the site's own address also moves to https://.
      const insecure = url.protocol === "http:" && target.protocol === "https:" && url.hostname === target.hostname;
      // Armenian resolvers kept the domain's first (registrar parking) DNS for up to 12 hours after
      // the move to Cloudflare, so the old address keeps serving the site until that has passed.
      const oldAddressMoves = Date.now() >= Date.parse("2026-10-22T04:00:00Z");
      if (insecure || url.hostname !== target.hostname && (url.hostname.endsWith(".workers.dev") && oldAddressMoves || url.hostname === `www.${target.hostname}`)) {
        url.protocol = target.protocol;
        url.host = target.host;
        return Response.redirect(url.toString(), request.method === "GET" || request.method === "HEAD" ? 301 : 308);
      }
    }
  }
  // Only versioned media (?v=…, which changes with the file) is cached at the edge.
  if (request.method === "GET" && new URL(request.url).pathname.startsWith("/media/") && new URL(request.url).searchParams.has("v")) return serveMedia(request, context);
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
        || isShortMaterialPath(url.pathname)
        || url.pathname.startsWith("/api/categories/")
        || url.pathname === "/api/search-page"
        || url.pathname === "/api/search-suggestions");
    if (!cacheable) return requestHandler(request);
    const cache = (caches as CacheStorage & { default: Cache }).default;
    // Cache by URL only, so a cookie never splits or leaks into the shared entry. The site's cache
    // version is part of the key, so an admin's "refresh now" makes every page fresh at once.
    const keyUrl = new URL(url);
    keyUrl.searchParams.set("__cache", await cacheEpoch((env as unknown as { DB: D1Database }).DB));
    const cacheKey = new Request(keyUrl.toString(), { method: "GET" });
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
