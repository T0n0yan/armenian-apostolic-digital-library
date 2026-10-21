import { createRequestHandler } from "react-router";

import { sendDueReminders } from "../app/data/reminders.server";
import { pushKeysFrom } from "../app/data/web-push.server";
import { cacheEpoch, dispatchCloudSync } from "../app/data/site-refresh.server";
import { isLibraryPath } from "../app/utils/material-path";

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
    // A failure outside the app's own error pages (the database or the platform) still gets a
    // calm page in Armenian instead of the platform's English one.
    const response = secure(await handle(request, env, context).catch((error: unknown) => {
      console.error(error);
      return failurePage(request);
    }));
    // Only the real address is indexed; staging and old addresses stay out of search results.
    if (new URL(request.url).hostname !== "apostolic.am") response.headers.set("X-Robots-Tag", "noindex, nofollow");
    return response;
  },
} satisfies ExportedHandler<Env>;

function failurePage(request: Request) {
  const accept = request.headers.get("accept") ?? "";
  if (!accept.includes("text/html")) return new Response("Service unavailable", { status: 503, headers: { "Retry-After": "60" } });
  const html = `<!doctype html><html lang="hy"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Կայքը կարճ ժամանակով անհասանելի է — Հոգևոր ժառանգություն</title>
<style>:root{color-scheme:light dark;--bg:#f4ead6;--ink:#2a1633;--muted:#6b5a52;--gold:#9a6b1f}@media (prefers-color-scheme:dark){:root{--bg:#120a17;--ink:#f4ead6;--muted:#bfb2a5;--gold:#d9b56f}}
body{margin:0;min-height:100svh;display:grid;place-items:center;background:var(--bg);color:var(--ink);font:16px/1.7 system-ui,sans-serif;padding:16px;box-sizing:border-box}
main{max-width:460px;text-align:center}b{display:block;font-size:44px;color:var(--gold);line-height:1}h1{font-size:22px;margin:12px 0 6px}p{color:var(--muted);margin:0 0 18px}
a,button{display:inline-block;min-height:44px;padding:10px 18px;border-radius:12px;border:1px solid var(--gold);color:var(--gold);background:none;font:600 14px system-ui,sans-serif;text-decoration:none;cursor:pointer;margin:4px}</style>
<main><b aria-hidden="true">✠</b><h1>Կայքը կարճ ժամանակով անհասանելի է</h1><p>Խնդրում ենք փորձել մի քանի րոպեից։ Եթե խնդիրը կրկնվում է, գրեք մեզ՝ info@apostolic.am</p>
<button type="button" onclick="location.reload()">Կրկին փորձել</button><a href="/">Գլխավոր էջ</a></main></html>`;
  return new Response(html, { status: 503, headers: { "Content-Type": "text/html; charset=utf-8", "Retry-After": "60", "Cache-Control": "no-store" } });
}

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
        || isLibraryPath(url.pathname)
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
