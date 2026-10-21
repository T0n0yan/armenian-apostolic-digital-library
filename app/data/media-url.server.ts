import { env } from "cloudflare:workers";

type MediaEnv = { MEDIA_BASE_URL?: string; MEDIA_DIRECT_FROM?: string };

/**
 * Where pictures and recordings are fetched from. With MEDIA_BASE_URL (media.apostolic.am, the
 * R2 bucket's own address behind Cloudflare's CDN) files go straight from R2 without the Worker
 * or D1; otherwise through the Worker's /media route. MEDIA_DIRECT_FROM delays the switch (an ISO
 * time), e.g. until new DNS has reached every resolver.
 */
function directBase() {
  const { MEDIA_BASE_URL: base, MEDIA_DIRECT_FROM: from } = env as MediaEnv;
  if (!base?.trim()) return null;
  if (from && Date.now() < Date.parse(from)) return null;
  return base.trim().replace(/\/+$/u, "");
}

export function mediaUrl(
  post: { chatId: string; messageId: number },
  asset: { index: number; version?: string | null; objectKey?: string | null; thumbnailObjectKey?: string | null },
  thumbnail = false,
) {
  const version = asset.version ? `v=${asset.version}` : "";
  const key = thumbnail ? asset.thumbnailObjectKey : asset.objectKey;
  const base = directBase();
  if (base && key) return `${base}/${key.split("/").map(encodeURIComponent).join("/")}${version ? `?${version}` : ""}`;
  const query = [thumbnail ? "thumbnail=1" : "", version].filter(Boolean).join("&");
  return `/media/${encodeURIComponent(post.chatId)}/${post.messageId}/${asset.index}${query ? `?${query}` : ""}`;
}
