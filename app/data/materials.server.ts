import type { BridgeContentType, BridgePost } from "../../shared/telegram-bridge-contract";
import { resolveContentCategoryId } from "../../shared/telegram-bridge-contract";
import { summarizeDailyReading, type DailyReadingSummary } from "../utils/daily-reading";
import { listCloudLibraryCategories, listCloudLibraryCategoryPosts } from "./cloud-library.server";
import { mediaUrl } from "./media-url.server";

/**
 * How a topic's feed loads: Psalms all at once (their grid sorts by number, at most 151), Saints
 * oldest first (the order they were introduced), everything else newest first, 12 per page.
 */
export function categoryFeedOptions(category: { id: string; name: string }) {
  const kind = resolveContentCategoryId(category.id, category.name);
  return {
    // Psalms, prayers and questions load whole: the grid, the prayer groups and the quiz filter
    // need every post at once.
    limit: kind === "category_psalms" || kind === "category_prayers" || kind === "category_bible_questions" ? 200 : 12,
    // Saints and prayers read in book order (oldest post first).
    order: kind === "category_saints_lives" || kind === "category_prayers" ? "asc" as const : "desc" as const,
  };
}

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
  /** Full-size first photo, for cards that use the picture as a background. */
  imageUrl: string | null;
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
  /** Feast and scripture references when the post is a daily reading. */
  daily: DailyReadingSummary | null;
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
      ? mediaUrl(post, asset, true)
      : null,
    imageUrl: asset?.kind === "photo"
      ? mediaUrl(post, asset)
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
    daily: summarizeDailyReading(post.contentText || post.captionText),
  };
}

export async function listPublicMaterialPageByCategory(
  database: D1Database,
  categoryId: string,
  _defaultSort: "title-asc" | "manual" | "number-asc" | "date-desc",
  cursor: string | null,
  _signal?: AbortSignal,
): Promise<PublicMaterialPage> {
  const category = (await listCloudLibraryCategories(database)).find((item) => item.id === categoryId);
  if (!category) return { materials: [], total: 0, nextCursor: null };
  const { limit, order } = categoryFeedOptions(category);
  const page = await listCloudLibraryCategoryPosts(database, category.slug, cursor, limit, order);
  return {
    materials: page.posts.map(bridgePostToPublic),
    total: page.total ?? page.posts.length + (page.nextCursor ? 1 : 0),
    nextCursor: page.nextCursor,
  };
}

/**
 * A topic's introduction: its very first post, when that is plain text (no media, no poll). It is
 * shown as a header above the topic's cards instead of as one of them.
 */
export type TopicIntroMaterial = PublicMaterial & { introText: string };

export async function getTopicIntro(database: D1Database, categoryId: string): Promise<TopicIntroMaterial | null> {
  const category = (await listCloudLibraryCategories(database)).find((item) => item.id === categoryId);
  if (!category) return null;
  const page = await listCloudLibraryCategoryPosts(database, category.slug, null, 1, "asc");
  const first = page.posts[0];
  // The whole text with its line breaks: an intro is often a short poem or quote laid out by line.
  return first && first.contentType === "text" && first.media.length === 0 ? { ...bridgePostToPublic(first), introText: first.contentText } : null;
}
