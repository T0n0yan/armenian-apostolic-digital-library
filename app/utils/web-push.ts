/** Browser notifications (Web Push) for reading reminders outside Telegram. */

export type PushSupport = "telegram" | "unsupported" | "install-first" | "denied" | "ready";

function inTelegram() {
  return Boolean((window as Window & { Telegram?: { WebApp?: { initData?: string } } }).Telegram?.WebApp?.initData);
}

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
}

/** Whether this browser can get reminder notifications, and what it needs first. */
export function pushSupport(): PushSupport {
  if (typeof window === "undefined") return "unsupported";
  // Telegram's bot already reminds Mini App readers; its WebView has no notifications.
  if (inTelegram()) return "telegram";
  const ios = /iphone|ipad|ipod/iu.test(navigator.userAgent);
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
    return ios && !isStandalone() ? "install-first" : "unsupported";
  }
  if (Notification.permission === "denied") return "denied";
  return "ready";
}

function keyBytes(base64Url: string) {
  const base64 = base64Url.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(base64Url.length / 4) * 4, "=");
  return Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
}

/**
 * Asks for permission (call from a tap: browsers allow the prompt only then), subscribes this
 * browser and saves it. Resolves true when notifications are on.
 */
export async function enablePushNotifications() {
  if (pushSupport() !== "ready") return false;
  const permission = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
  if (permission !== "granted") return false;
  try {
    const { publicKey } = await fetch("/api/push").then((response) => response.json() as Promise<{ publicKey: string | null }>);
    if (!publicKey) return false;
    const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription()
      ?? await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) });
    const response = await fetch("/api/push", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ subscription: subscription.toJSON() }),
    });
    return response.ok;
  } catch {
    return false;
  }
}
