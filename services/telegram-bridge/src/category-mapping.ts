import {
  categoryById,
  telegramReferenceKey,
  telegramTopicKey,
  type BridgeCategoryMappings,
  type BridgePost,
} from "../../../shared/telegram-bridge-contract";
import type { TelegramPost } from "./adapter";

export const EMPTY_MAPPINGS: BridgeCategoryMappings = {
  topics: {},
  hashtags: {},
  posts: {},
};

export function classifyPost(
  post: TelegramPost,
  mappings: BridgeCategoryMappings,
): BridgePost {
  const topicCategory = post.forumTopicId === null
    ? null
    : mappings.topics[telegramTopicKey(post.chatId, post.forumTopicId)];
  const hashtagCategory = post.tags
    .map((tag) => tag.normalize("NFC").replace(/^#/u, "").toLocaleLowerCase("hy-AM"))
    .map((tag) => mappings.hashtags[tag])
    .find(Boolean);
  const postCategory = mappings.posts[telegramReferenceKey(post.chatId, post.messageId)];
  const category = categoryById(topicCategory ?? hashtagCategory ?? postCategory ?? null);
  return {
    ...post,
    categoryId: category?.id ?? null,
    categoryName: category?.name ?? null,
    categorySlug: category?.slug ?? null,
  };
}

export function parseMappingHeader(value: string | null): BridgeCategoryMappings {
  if (!value || value.length > 48_000) return EMPTY_MAPPINGS;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Partial<BridgeCategoryMappings>;
    return {
      topics: validRecord(parsed.topics),
      hashtags: validRecord(parsed.hashtags),
      posts: validRecord(parsed.posts),
    };
  } catch {
    return EMPTY_MAPPINGS;
  }
}

function validRecord(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key, category]) => key.length <= 160 && Boolean(categoryById(String(category))))
      .slice(0, 2_000),
  ) as BridgeCategoryMappings["topics"];
}
