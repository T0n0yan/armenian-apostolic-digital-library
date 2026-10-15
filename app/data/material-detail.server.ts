import { parseMaterialId } from "../../shared/telegram-bridge-contract";
import { getBridgePost } from "./telegram-bridge.server";

export type MaterialMedia = {
  id: string;
  kind: "photo" | "video" | "audio" | "voice" | "animation" | "document";
  status: "pending" | "ready" | "failed" | "missing";
  mimeType: string | null;
  fileName: string | null;
  sizeBytes: number | null;
  width: number | null;
  height: number | null;
  duration: number | null;
  altText: string;
  url: string | null;
};

export type MaterialDetail = {
  id: string;
  title: string;
  telegramUrl: string;
  categoryId: string;
  categoryName: string;
  categorySlug: string;
  contentText: string;
  captionText: string;
  tags: string[];
  publishedAt: string | null;
  editedAt: string | null;
  dateValue: string | null;
  media: MaterialMedia[];
};

export async function getPublicMaterialDetail(database: D1Database, id: string): Promise<MaterialDetail | null> {
  const reference = parseMaterialId(id);
  if (!reference) return null;
  const post = await getBridgePost(database, reference.chatId, reference.messageId);
  if (!post?.categoryId || !post.categoryName || !post.categorySlug || post.deleted) return null;
  return {
    id: post.id,
    title: post.title,
    telegramUrl: post.telegramUrl,
    categoryId: post.categoryId,
    categoryName: post.categoryName,
    categorySlug: post.categorySlug,
    contentText: post.contentText,
    captionText: post.captionText,
    tags: post.tags,
    publishedAt: post.publishedAt,
    editedAt: post.editedAt,
    dateValue: post.dateValue,
    media: post.media.map((asset) => ({
      id: `${post.id}_${asset.index}`,
      ...asset,
      status: "ready",
      url: `/media/${encodeURIComponent(post.chatId)}/${post.messageId}/${asset.index}`,
    })),
  };
}
