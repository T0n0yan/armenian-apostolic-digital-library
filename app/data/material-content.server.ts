export function normalizeContentText(value: string) {
  return value
    .normalize("NFC")
    .replace(/\r\n?/g, "\n")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function normalizeSearchText(value: string) {
  return normalizeContentText(value)
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("hy-AM");
}

export async function createContentFingerprint(value: string) {
  const normalized = normalizeSearchText(value);
  if (!normalized) return null;

  const bytes = new TextEncoder().encode(normalized);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
