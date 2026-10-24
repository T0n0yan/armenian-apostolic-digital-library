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
const VERSION = "v5";
const STATIC = `static-${VERSION}`;
const PAGES = `pages-${VERSION}`;
const MEDIA = `media-${VERSION}`;
const STATE = "sw-state";
const NETWORK_TIMEOUT_MS = 4_000;
const LIMITS = { [PAGES]: 250, [MEDIA]: 400 };

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
  event.waitUntil(caches.open(PAGES).then((cache) => cache.add("/").catch(() => undefined)));
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
  const network = fetch(request).then(async (response) => {
    if (response.ok) { await cache.put(request, version ? await stamped(response, version) : response.clone()); void trim(PAGES); }
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
      return (await cache.match("/")) ?? new Response("<meta charset=utf-8><meta name=viewport content='width=device-width'><p style='font:16px sans-serif;padding:24px'>Ինտերնետ կապ չկա։ Այս էջը դեռ չի պահվել սարքում։</p>", { headers: { "content-type": "text/html; charset=utf-8" } });
    }
    throw new Error("offline");
  }
}

const PRIVATE = /^\/(api\/(reminders|push|poll-vote|reading-log|share-prepare|psalm-timings)|auth\/|telegram\/|admin|saved)/u;

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  // Saving, a reminder, signing in or out: the kept page data may no longer be right.
  if (url.origin === self.location.origin && (request.method !== "GET" || /^\/(auth|telegram)\//u.test(url.pathname))) {
    lastWrite = Date.now();
    event.waitUntil(markWrite(lastWrite));
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
