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

/** The site's dove (app/assets/dove-mark.png, 128 px), inline so the offline page needs nothing from the network. */
const DOVE = "data:image/webp;base64,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";

const escapeHtml = (value) => value.replace(/[&<>"]/gu, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char]);

/**
 * The page shown offline for a page not kept on the phone: in the site's colours (light or dark,
 * as the reader chose), with the pages that are kept, and it reloads by itself once back online.
 */
async function offlinePage(cache) {
  // The latest pages first; only as many as the list shows are read.
  const kept = [];
  for (const request of (await cache.keys()).reverse()) {
    if (kept.length >= 8) break;
    const url = new URL(request.url);
    if (url.pathname.endsWith(".data") || url.pathname.startsWith("/api/") || url.search) continue;
    const html = await (await cache.match(request))?.text().catch(() => "") ?? "";
    const title = /<title>([^<]*)<\/title>/u.exec(html)?.[1]?.split(" — ")[0]?.trim();
    if (title) kept.push({ path: url.pathname, title });
  }
  const links = kept.map(({ path, title }) => `<a href="${escapeHtml(path)}"><span>${title}</span><b>›</b></a>`).join("");
  return `<!doctype html><html lang="hy"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>Ինտերնետը բացակայում է — Հոգևոր ժառանգություն</title>
<script>try{var p=localStorage.getItem("library-theme-v1"),h=new Date().getHours();document.documentElement.dataset.theme=p==="dark"||p==="light"?p:p==="sun"?(h>=7&&h<19?"light":"dark"):(matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light")}catch(e){}</script>
<style>
:root{--bg:linear-gradient(170deg,#f3e8cf,#ead9b8 55%,#e6d3ae);--ink:#2b1a10;--muted:#6f5b47;--gold:#9a6a26;--panel:rgb(255 250 238/62%);--line:rgb(176 128 70/26%);color-scheme:light}
:root[data-theme=dark]{--bg:radial-gradient(circle at 10% -8%,rgb(124 74 143/30%),transparent 544px),linear-gradient(155deg,#12091a,#0b0610 58%,#140a19);--ink:#f3e9d8;--muted:#b9a990;--gold:#e2c27e;--panel:rgb(255 255 255/6%);--line:rgb(217 181 111/22%);color-scheme:dark}
*{box-sizing:border-box}html,body{margin:0;min-height:100%}body{min-height:100svh;background:var(--bg);background-attachment:fixed;color:var(--ink);font:15px/1.6 system-ui,-apple-system,"Segoe UI",sans-serif;display:grid;place-items:center;padding:24px 16px}
main{width:100%;max-width:420px;display:grid;justify-items:center;gap:14px;text-align:center}
.mark{width:96px;height:96px;object-fit:contain;filter:drop-shadow(0 8px 18px rgb(150 100 30/28%));animation:float 3.2s ease-in-out infinite}
@keyframes float{50%{transform:translateY(-6px) rotate(-2deg)}}
h1{margin:6px 0 0;font:500 26px/1.25 Georgia,"Noto Serif Armenian",serif;letter-spacing:-.3px}
p{margin:0;color:var(--muted);max-width:340px}
button{margin-top:6px;min-height:48px;padding:0 26px;border:0;border-radius:14px;background:linear-gradient(135deg,#e2c27e,#b07d2e);color:#2a1708;font:700 15px system-ui,sans-serif;cursor:pointer;box-shadow:0 8px 20px rgb(150 100 30/25%)}
.kept{width:100%;margin-top:14px;display:grid;gap:8px;text-align:left}
.kept h2{margin:0 4px;font-size:11px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;color:var(--gold)}
.kept a{display:flex;align-items:center;gap:10px;min-height:48px;padding:10px 14px;border:1px solid var(--line);border-radius:14px;background:var(--panel);color:var(--ink);text-decoration:none;font-weight:600;font-size:14px}
.kept a span{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.kept b{color:var(--gold);font-size:20px;font-weight:400}
@media (prefers-reduced-motion:reduce){.mark{animation:none}}
</style></head><body><main>
<img class="mark" src="${DOVE}" width="96" height="96" alt="" aria-hidden="true">
<h1>Ինտերնետը բացակայում է</h1>
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
