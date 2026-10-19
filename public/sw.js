// Service worker: shows reading reminders as phone notifications and opens the material when
// one is tapped. It does no caching, so the site always loads fresh.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = {}; }
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
