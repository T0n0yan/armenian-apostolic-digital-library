const MEDIA_CLIENT_COOKIE = "library_media_client";
const MEDIA_CLIENT_SECONDS = 60 * 60;

function readCookie(request: Request) {
  const cookies = request.headers.get("cookie") ?? "";
  for (const cookie of cookies.split(";")) {
    const [name, ...parts] = cookie.trim().split("=");
    if (name === MEDIA_CLIENT_COOKIE) return parts.join("=");
  }
  return null;
}

export function getMediaClient(request: Request) {
  const existing = readCookie(request);
  if (existing && /^[a-zA-Z0-9_-]{16,64}$/u.test(existing)) return { key: existing, cookie: null };
  const key = crypto.randomUUID().replaceAll("-", "");
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return {
    key,
    cookie: `${MEDIA_CLIENT_COOKIE}=${key}; Path=/; Max-Age=${MEDIA_CLIENT_SECONDS}; HttpOnly; SameSite=Lax${secure}`,
  };
}
