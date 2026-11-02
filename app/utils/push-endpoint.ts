/**
 * Web Push-ի endpoint-ը պետք է լինի իսկական push-ծառայության հասցե, ոչ թե ցանկացած HTTPS URL
 * (այլապես սերվերը կարող է ստիպված լինել POST անել կամայական հասցեի՝ SSRF-ի դաս)։
 * Թույլատրվում են միայն խոշոր բրաուզերների push-ծառայությունների տիրույթները։
 */
const ALLOWED_HOSTS = [
  // Chrome, Edge, բոլոր Chromium-ները
  "fcm.googleapis.com", "android.googleapis.com", "jmt17.google.com",
  // Firefox
  "updates.push.services.mozilla.com", "updates-autopush.stage.mozilla.dev",
  // Safari / Apple (web push)
  "web.push.apple.com",
  // Microsoft (հին Edge/WNS)
  "wns2-*.notify.windows.com", "*.notify.windows.com",
];

function hostAllowed(host: string) {
  return ALLOWED_HOSTS.some((pattern) => pattern.startsWith("*")
    ? host.endsWith(pattern.slice(1))
    : pattern.includes("*") ? new RegExp(`^${pattern.replace(/[.]/g, "\\.").replace(/\*/g, "[a-z0-9-]+")}$`).test(host)
    : host === pattern);
}

/** Վերադարձնում է նորմալացված endpoint-ը, կամ null՝ եթե այն թույլատրված push-ծառայություն չէ։ */
export function safePushEndpoint(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 1000) return null;
  let url: URL;
  try { url = new URL(value); } catch { return null; }
  if (url.protocol !== "https:") return null;
  if (url.username || url.password) return null;        // userinfo՝ ոչ
  if (url.port && url.port !== "443") return null;       // ստանդարտ port միայն
  if (!hostAllowed(url.hostname.toLowerCase())) return null;
  return url.toString();
}
