import {
  parseMaterialId,
  type BridgeContentType,
  type BridgeFormattedText,
  type BridgeLocation,
  type BridgePoll,
  type BridgeRichContent,
} from "../../shared/telegram-bridge-contract";
import { getCloudLibraryPost } from "./cloud-library.server";

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
  title: string | null;
  performer: string | null;
  waveform: string | null;
  thumbnailUrl: string | null;
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
  formattedText: BridgeFormattedText;
  formattedCaption: BridgeFormattedText;
  richContent: BridgeRichContent | null;
  contentType: BridgeContentType;
  poll: BridgePoll | null;
  location: BridgeLocation | null;
  unsupportedType: string | null;
  tags: string[];
  publishedAt: string | null;
  editedAt: string | null;
  dateValue: string | null;
  media: MaterialMedia[];
};

export async function getPublicMaterialDetail(database: D1Database, id: string, _signal?: AbortSignal): Promise<MaterialDetail | null> {
  const reference = parseMaterialId(id);
  if (!reference) return null;
  const post = await getCloudLibraryPost(database, reference.chatId, reference.messageId);
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
    formattedText: post.formattedText,
    formattedCaption: post.formattedCaption,
    richContent: post.richContent,
    contentType: post.contentType,
    poll: post.poll,
    location: post.location,
    unsupportedType: post.unsupportedType,
    tags: post.tags,
    publishedAt: post.publishedAt,
    editedAt: post.editedAt,
    dateValue: post.dateValue,
    media: post.media.map((asset) => ({
      id: `${post.id}_${asset.index}`,
      ...asset,
      status: "ready",
      url: `/media/${encodeURIComponent(post.chatId)}/${post.messageId}/${asset.index}`,
      thumbnailUrl: asset.hasThumbnail
        ? `/media/${encodeURIComponent(post.chatId)}/${post.messageId}/${asset.index}?thumbnail=1`
        : null,
    })),
  };
}
