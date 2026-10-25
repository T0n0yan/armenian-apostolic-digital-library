export function safeReturnPath(value: string | null) {
  if (!value?.startsWith("/") || /[\\\u0000-\u001f]/u.test(value)) return "/saved";
  try {
    const base = "https://library.invalid";
    const url = new URL(value, base);
    return url.origin === base ? `${url.pathname}${url.search}${url.hash}` : "/saved";
  } catch { return "/saved"; }
}
