import type { BridgePost } from "../../shared/telegram-bridge-contract";
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
  };
}

export async function listPublicMaterialPageByCategory(
  database: D1Database,
  categoryId: string,
  _defaultSort: "title-asc" | "manual" | "number-asc" | "date-desc",
  cursor: string | null,
): Promise<PublicMaterialPage> {
  const category = (await listBridgeCategories(database)).find((item) => item.id === categoryId);
  if (!category) return { materials: [], total: 0, nextCursor: null };
  const page = await listBridgeCategoryPosts(database, category.slug, cursor);
  return {
    materials: page.posts.map(bridgePostToPublic),
    total: page.total ?? page.posts.length + (page.nextCursor ? 1 : 0),
    nextCursor: page.nextCursor,
  };
}
