import { env } from "cloudflare:workers";

import { resolveContentCategoryId } from "../../shared/telegram-bridge-contract";
import { materialPath } from "../utils/material-path";
import { cardImage } from "../utils/seo";

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
  direct = true,
) {
  const version = asset.version ? `v=${asset.version}` : "";
  const key = thumbnail ? asset.thumbnailObjectKey : asset.objectKey;
  const base = direct ? directBase() : null;
  if (base && key) return `${base}/${key.split("/").map(encodeURIComponent).join("/")}${version ? `?${version}` : ""}`;
  const query = [thumbnail ? "thumbnail=1" : "", version].filter(Boolean).join("&");
  return `/media/${encodeURIComponent(post.chatId)}/${post.messageId}/${asset.index}${query ? `?${query}` : ""}`;
}

/**
 * A second address for the same file when the first is media.apostolic.am: the Worker's /media
 * route, on the site's own address, which the page has just loaded from. A phone whose resolver
 * has not yet learnt the media address (or a network that blocks it) still gets the file.
 */
export function mediaFallbackUrl(
  post: { chatId: string; messageId: number },
  asset: { index: number; version?: string | null; objectKey?: string | null; thumbnailObjectKey?: string | null },
  thumbnail = false,
) {
  const primary = mediaUrl(post, asset, thumbnail);
  const viaWorker = mediaUrl(post, asset, thumbnail, false);
  return primary === viaWorker ? null : viaWorker;
}

/**
 * A gospel teaching video's cover: its drawn preview card (title and the clergy member), the same
 * picture its shared link shows. Telegram's own video covers are often black (a fade-in first frame),
 * and taking a frame from the video on the phone cost a large download, so the card stands in.
 */
export function gospelVideoCover(post: { id: string; categoryId?: string | null; categoryName?: string | null }) {
  if (resolveContentCategoryId(post.categoryId, post.categoryName) !== "category_gospel_teachings") return null;
  return cardImage("", materialPath(post.id, "category_gospel_teachings"));
}
