// Service worker: keeps the library usable on a slow or missing connection, and shows reading
// reminders as phone notifications (opening the material when one is tapped).
//
// Caching:
// - built assets, fonts and sounds: cache first (their names never change);
// - pages and their data: network first, falling back to the last copy after a few seconds or
//   when offline, so pages already visited open without internet;
// - pictures from /media: cache first, so thumbnails and saints' icons stay available.
// Personal and sign-in requests, writes, and audio/video streams are never cached.
const VERSION = "v3";
const STATIC = `static-${VERSION}`;
const PAGES = `pages-${VERSION}`;
const MEDIA = `media-${VERSION}`;
const NETWORK_TIMEOUT_MS = 4_000;
const LIMITS = { [PAGES]: 250, [MEDIA]: 400 };

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(PAGES).then((cache) => cache.add("/").catch(() => undefined)));
  self.skipWaiting();
});
self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (![STATIC, PAGES, MEDIA].includes(key)) await caches.delete(key);
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

async function networkFirst(request) {
  const cache = await caches.open(PAGES);
  const network = fetch(request).then(async (response) => {
    if (response.ok) { await cache.put(request, response.clone()); void trim(PAGES); }
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
  if (request.method !== "GET" || request.headers.has("range")) return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || PRIVATE.test(url.pathname) || url.searchParams.has("refresh")) return;
  if (url.pathname.startsWith("/assets/") || url.pathname.startsWith("/sounds/") || /\.(woff2|png|ico|svg)$/u.test(url.pathname)) {
    event.respondWith(cacheFirst(request, STATIC));
  } else if (url.pathname.startsWith("/media/")) {
    // Pictures only; recordings and videos stream with range requests and are left alone.
    if (request.destination === "image" || url.searchParams.has("thumbnail")) event.respondWith(cacheFirst(request, MEDIA));
  } else if (request.mode === "navigate" || url.pathname.endsWith(".data") || url.pathname.startsWith("/api/")) {
    event.respondWith(networkFirst(request));
  }
});

self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = {}; }
  // If the library is open on screen, let it ring the bell itself.
  const materialId = /\/materials\/([^/?]+)/u.exec(data.url || "")?.[1];
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
