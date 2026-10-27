// Service worker: keeps the library usable on a slow or missing connection, and shows reading
// reminders as phone notifications (opening the material when one is tapped).
//
// Caching:
// - built assets, fonts and sounds: cache first (their names never change);
// - page data (<page>.data) seen before: answered from the phone while the library's content
//   version is the same (the page tells it, app/root.tsx), nothing was written since (saving,
//   a reminder, signing in) and it is the same day; otherwise network first. Each request saved
//   counts: the free plan allows 100,000 a day;
// - pages (HTML): network first; the last copy only offline (an old copy may point at scripts a
//   newer deploy has replaced);
// - pictures from /media: cache first, so thumbnails and saints' icons stay available.
// Personal and sign-in requests, writes, and audio/video streams are never cached.
const VERSION = "v6";
const STATIC = `static-${VERSION}`;
const PAGES = `pages-${VERSION}`;
const MEDIA = `media-${VERSION}`;
const STATE = "sw-state";
const NETWORK_TIMEOUT_MS = 4_000;
const LIMITS = { [STATIC]: 160, [PAGES]: 250, [MEDIA]: 400 };

// The content version and the time of the last write, kept across restarts of the worker. A write
// is also noted at once in memory: the page reloads its data right after saving.
let state = null;
let lastWrite = 0;
async function readState() {
  if (state) return state;
  const stored = await caches.open(STATE).then((cache) => cache.match("/__state")).catch(() => undefined);
  state = stored ? await stored.json().catch(() => null) : null;
  state ??= { version: "", writeAt: 0 };
  return state;
}
async function saveState(next) {
  state = next;
  await caches.open(STATE).then((cache) => cache.put("/__state", new Response(JSON.stringify(next), { headers: { "content-type": "application/json" } }))).catch(() => undefined);
}
async function markWrite(at) {
  const current = await readState();
  if (current.writeAt < at) await saveState({ ...current, writeAt: at });
}

self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.type !== "content-version" || typeof data.version !== "string") return;
  event.waitUntil(readState().then((current) => current.version === data.version ? undefined : saveState({ ...current, version: data.version })));
});

/** A copy to keep, marked with the content version and the time it was fetched. */
async function stamped(response, version) {
  const headers = new Headers(response.headers);
  headers.set("x-sw-version", version);
  headers.set("x-sw-at", String(Date.now()));
  return new Response(await response.clone().arrayBuffer(), { status: response.status, statusText: response.statusText, headers });
}

function sameDay(left, right) {
  return new Date(left).toDateString() === new Date(right).toDateString();
}

/** Page data from the phone when nothing can have changed it; otherwise from the site. */
async function pageData(request) {
  const current = await readState();
  const cache = await caches.open(PAGES);
  const cached = await cache.match(request);
  const at = Number(cached?.headers.get("x-sw-at") ?? 0);
  const written = Math.max(current.writeAt, lastWrite);
  if (cached && current.version && cached.headers.get("x-sw-version") === current.version && at > written && sameDay(at, Date.now())) return cached;
  return networkFirst(request, current.version);
}

self.addEventListener("install", (event) => {
  // No precache of HTML: the initial request may carry a signed-in session.
  self.skipWaiting();
});
self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    // The title index (utils/local-search.ts) and this worker's state are kept too.
    for (const key of await caches.keys()) if (![STATIC, PAGES, MEDIA, STATE, "search-index"].includes(key)) await caches.delete(key);
    await self.clients.claim();
  })());
});

async function trim(name) {
  const cache = await caches.open(name);
  const keys = await cache.keys();
  for (const key of keys.slice(0, Math.max(0, keys.length - LIMITS[name]))) await cache.delete(key);
}

async function cacheFirst(request, name) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok && response.status === 200) {
    const cache = await caches.open(name);
    await cache.put(request, response.clone());
    if (LIMITS[name]) void trim(name);
  }
  return response;
}

async function networkFirst(request, version = "") {
  const cache = await caches.open(PAGES);
  const writeAtStart = lastWrite;
  const network = fetch(request).then(async (response) => {
    if (writeAtStart === lastWrite && response.ok && response.headers.get("X-Offline-Public") === "1" && !/private|no-store/i.test(response.headers.get("Cache-Control") || "")) { await cache.put(request, version ? await stamped(response, version) : response.clone()); void trim(PAGES); }
    return response;
  });
  // A page (HTML) is only ever answered from the cache when offline: an old copy may point at
  // scripts a newer deploy has replaced, which would break the page. Data falls back sooner.
  const timeout = request.mode === "navigate" ? new Promise(() => {}) : new Promise((resolve) => setTimeout(resolve, NETWORK_TIMEOUT_MS));
  try {
    const first = await Promise.race([network, timeout]);
    if (first) return first;
    // Slow network: answer from the cache now if we can, otherwise keep waiting.
    return (await cache.match(request)) ?? (await network);
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    if (request.mode === "navigate") {
      return new Response(await offlinePage(cache), { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
    }
    throw new Error("offline");
  }
}

const escapeHtml = (value) => value.replace(/[&<>"]/gu, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char]);

/**
 * The page shown offline for a page not kept on the phone: in the site's colours (light or dark,
 * as the reader chose), with the pages that are kept, and it reloads by itself once back online.
 */
async function offlinePage(cache) {
  const kept = [];
  for (const request of await cache.keys()) {
    const url = new URL(request.url);
    if (url.pathname.endsWith(".data") || url.pathname.startsWith("/api/") || url.search) continue;
    const html = await (await cache.match(request))?.text().catch(() => "") ?? "";
    const title = /<title>([^<]*)<\/title>/u.exec(html)?.[1]?.split(" — ")[0]?.trim();
    if (title) kept.push({ path: url.pathname, title });
  }
  const links = kept.slice(-8).reverse().map(({ path, title }) => `<a href="${escapeHtml(path)}"><span>${title}</span><b>›</b></a>`).join("");
  return `<!doctype html><html lang="hy"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>Կապ չկա — Հոգևոր ժառանգություն</title>
<script>try{var p=localStorage.getItem("library-theme-v1"),h=new Date().getHours();document.documentElement.dataset.theme=p==="dark"||p==="light"?p:p==="sun"?(h>=7&&h<19?"light":"dark"):(matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light")}catch(e){}</script>
<style>
:root{--bg:linear-gradient(170deg,#f3e8cf,#ead9b8 55%,#e6d3ae);--ink:#2b1a10;--muted:#6f5b47;--gold:#9a6a26;--panel:rgb(255 250 238/62%);--line:rgb(176 128 70/26%);color-scheme:light}
:root[data-theme=dark]{--bg:radial-gradient(circle at 10% -8%,rgb(124 74 143/30%),transparent 544px),linear-gradient(155deg,#12091a,#0b0610 58%,#140a19);--ink:#f3e9d8;--muted:#b9a990;--gold:#e2c27e;--panel:rgb(255 255 255/6%);--line:rgb(217 181 111/22%);color-scheme:dark}
*{box-sizing:border-box}html,body{margin:0;min-height:100%}body{min-height:100svh;background:var(--bg);background-attachment:fixed;color:var(--ink);font:15px/1.6 system-ui,-apple-system,"Segoe UI",sans-serif;display:grid;place-items:center;padding:24px 16px}
main{width:100%;max-width:420px;display:grid;justify-items:center;gap:14px;text-align:center}
.mark{display:grid;place-items:center;width:84px;height:84px;border-radius:50%;border:1px solid var(--line);background:var(--panel);color:var(--gold);animation:breathe 2.8s ease-in-out infinite}
@keyframes breathe{50%{transform:scale(1.05);box-shadow:0 0 0 10px rgb(217 181 111/6%)}}
h1{margin:6px 0 0;font:500 26px/1.25 Georgia,"Noto Serif Armenian",serif;letter-spacing:-.3px}
p{margin:0;color:var(--muted);max-width:340px}
button{margin-top:6px;min-height:48px;padding:0 26px;border:0;border-radius:14px;background:linear-gradient(135deg,#e2c27e,#b07d2e);color:#2a1708;font:700 15px system-ui,sans-serif;cursor:pointer;box-shadow:0 8px 20px rgb(150 100 30/25%)}
.kept{width:100%;margin-top:14px;display:grid;gap:8px;text-align:left}
.kept h2{margin:0 4px;font-size:11px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;color:var(--gold)}
.kept a{display:flex;align-items:center;gap:10px;min-height:48px;padding:10px 14px;border:1px solid var(--line);border-radius:14px;background:var(--panel);color:var(--ink);text-decoration:none;font-weight:600;font-size:14px}
.kept a span{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.kept b{color:var(--gold);font-size:20px;font-weight:400}
@media (prefers-reduced-motion:reduce){.mark{animation:none}}
</style></head><body><main>
<span class="mark" aria-hidden="true"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v18M6 9h12"/><path d="M12 3c-1.2 0-1.8.8-1.8 1.6M12 3c1.2 0 1.8.8 1.8 1.6M6 9c0-1.2-.8-1.8-1.6-1.8M6 9c0 1.2-.8 1.8-1.6 1.8M18 9c0-1.2.8-1.8 1.6-1.8M18 9c0 1.2.8 1.8 1.6 1.8M12 21c-1.2 0-1.8-.8-1.8-1.6M12 21c1.2 0 1.8-.8 1.8-1.6"/></svg></span>
<h1>Ինտերնետ կապ չկա</h1>
<p>Այս էջը դեռ չի պահվել սարքում։ Միացեք ինտերնետին, և էջը կբացվի ինքնաբերաբար։</p>
<button type="button" onclick="location.reload()">Փորձել կրկին</button>
${links ? `<nav class="kept" aria-labelledby="kept"><h2 id="kept">Կարդալ առանց ինտերնետի</h2>${links}</nav>` : ""}
</main><script>addEventListener("online",function(){location.reload()})</script></body></html>`;
}

const PRIVATE = /^\/(api\/(reminders|push|poll-vote|reading-log|share-prepare|psalm-timings)|auth\/|telegram\/|admin|saved)/u;

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  // Saving, a reminder, signing in or out: the kept page data may no longer be right.
  // The presence ping (every few minutes) changes nothing on the pages, so it doesn't count.
  if (url.origin === self.location.origin && url.pathname !== "/api/presence" && (request.method !== "GET" || /^\/(auth|telegram)\//u.test(url.pathname))) {
    lastWrite = Date.now();
    event.waitUntil(Promise.all([markWrite(lastWrite), caches.delete(PAGES)]));
  }
  if (request.method !== "GET" || request.headers.has("range")) return;
  // Pictures from the media address (media.apostolic.am, served from R2) are kept like /media ones.
  if (/^media(-staging)?\.apostolic\.am$/u.test(url.hostname)) {
    if (request.destination === "image") event.respondWith(cacheFirst(request, MEDIA));
    return;
  }
  if (url.origin !== self.location.origin || PRIVATE.test(url.pathname) || url.searchParams.has("refresh")) return;
  if (url.pathname.startsWith("/assets/") || url.pathname.startsWith("/sounds/") || /\.(woff2|png|ico|svg)$/u.test(url.pathname)) {
    event.respondWith(cacheFirst(request, STATIC));
  } else if (url.pathname.startsWith("/media/")) {
    // Pictures only; recordings and videos stream with range requests and are left alone.
    if (request.destination === "image" || url.searchParams.has("thumbnail")) event.respondWith(cacheFirst(request, MEDIA));
  } else if (url.pathname.endsWith(".data")) {
    event.respondWith(pageData(request));
  } else if (request.mode === "navigate" || url.pathname.startsWith("/api/")) {
    event.respondWith(networkFirst(request));
  }
});

self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = {}; }
  // If the library is open on screen, let it ring the bell itself.
  // The material comes in the tag ("reminder-<id>"); links use short addresses (/psalm_169).
  const materialId = data.materialId || /^reminder-(.+)$/u.exec(data.tag || "")?.[1] || /\/materials\/([^/?]+)/u.exec(data.url || "")?.[1];
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
    for (const client of windows) client.postMessage({ type: "reminder", materialId, title: data.body, category: data.category });
  }));
  event.waitUntil(self.registration.showNotification(data.title || "🔔 Ժամանակն է կարդալու", {
    body: data.body || "Հոգևոր ժառանգություն",
    icon: "/icon-192.png",
    badge: "/favicon-64.png",
    tag: data.tag || "reminder",
    renotify: true,
    requireInteraction: true,
    vibrate: [120, 80, 120],
    data: { url: data.url || "/" },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/", self.location.origin).href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of windows) {
      if (new URL(client.url).origin === self.location.origin && "focus" in client) {
        await client.focus();
        if ("navigate" in client) await client.navigate(url);
        return;
      }
    }
    await self.clients.openWindow(url);
  })());
});
