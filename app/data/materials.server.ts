import type { BridgeContentType, BridgePost } from "../../shared/telegram-bridge-contract";
import { listBridgeCategories, listBridgeCategoryPosts } from "./telegram-bridge.server";

export type PublicMaterial = {
  id: string;
  title: string;
  telegramUrl: string;
  numberValue: number | null;
  dateValue: string | null;
  publishedAt: string | null;
  mediaTypes: string[];
  excerpt: string | null;
  contentType: BridgeContentType;
  preview: MaterialCardPreview;
};

export type MaterialCardPreview = {
  thumbnailUrl: string | null;
  width: number | null;
  height: number | null;
  mediaCount: number;
  duration: number | null;
  mediaTitle: string | null;
  performer: string | null;
  pollQuestion: string | null;
  pollOptionCount: number | null;
  locationTitle: string | null;
  locationSummary: string | null;
  unsupportedType: string | null;
};

export type PublicMaterialPage = {
  materials: PublicMaterial[];
  total: number;
  nextCursor: string | null;
};

export function createMaterialExcerpt(value: string) {
  const normalized = value.replace(/\s+/gu, " ").trim();
  if (!normalized) return null;
  const characters = Array.from(normalized);
  return characters.length > 180 ? `${characters.slice(0, 180).join("")}\u2026` : normalized;
}

export function bridgePostToPublic(post: BridgePost): PublicMaterial {
  return {
    id: post.id,
    title: post.title,
    telegramUrl: post.telegramUrl,
    numberValue: post.numberValue,
    dateValue: post.dateValue,
    publishedAt: post.publishedAt,
    mediaTypes: [...new Set(post.media.map((asset) => asset.kind))],
    excerpt: createMaterialExcerpt(post.contentText || post.captionText),
    contentType: post.contentType,
    preview: bridgePostToCardPreview(post),
  };
}

export function bridgePostToCardPreview(post: BridgePost): MaterialCardPreview {
  const asset = post.media[0] ?? null;
  const canPreview = Boolean(asset && (asset.kind === "photo" || asset.hasThumbnail));
  return {
    thumbnailUrl: asset && canPreview
      ? `/media/${encodeURIComponent(post.chatId)}/${post.messageId}/${asset.index}?thumbnail=1`
      : null,
    width: asset?.width ?? null,
    height: asset?.height ?? null,
    mediaCount: post.media.length,
    duration: asset?.duration ?? null,
    mediaTitle: asset?.title ?? asset?.fileName ?? null,
    performer: asset?.performer ?? null,
    pollQuestion: post.poll?.question.text ?? null,
    pollOptionCount: post.poll?.options.length ?? null,
    locationTitle: post.location?.title ?? post.location?.address ?? null,
    locationSummary: post.location
      ? `${post.location.latitude.toFixed(4)}, ${post.location.longitude.toFixed(4)}`
      : null,
    unsupportedType: post.unsupportedType,
  };
}

export async function listPublicMaterialPageByCategory(
  database: D1Database,
  categoryId: string,
  _defaultSort: "title-asc" | "manual" | "number-asc" | "date-desc",
  cursor: string | null,
  signal?: AbortSignal,
): Promise<PublicMaterialPage> {
  const category = (await listBridgeCategories(database, false, signal)).find((item) => item.id === categoryId);
  if (!category) return { materials: [], total: 0, nextCursor: null };
  const page = await listBridgeCategoryPosts(database, category.slug, cursor, signal);
  return {
    materials: page.posts.map(bridgePostToPublic),
    total: page.total ?? page.posts.length + (page.nextCursor ? 1 : 0),
    nextCursor: page.nextCursor,
  };
}
