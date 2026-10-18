import { resolveContentCategoryId, type BridgePost } from "../../shared/telegram-bridge-contract";
import { bridgePostToCardPreview } from "./materials.server";
import { searchCloudLibraryPosts } from "./cloud-library.server";
import type { SearchFilters, SearchMaterialPage } from "./search-materials";
import { resolveSearchQuery, type ResolvedSearchQuery } from "./search-query.server";

const sentenceEndings = new Set(["։", ".", "!", "?", "…"]);

function findSequence(haystack: string[], needle: string[]) {
  if (needle.length === 0 || needle.length > haystack.length) return -1;
  for (let index = 0; index <= haystack.length - needle.length; index += 1) {
    if (needle.every((character, offset) => haystack[index + offset] === character)) return index;
  }
  return -1;
}

export function createSearchExcerpt(value: string, normalizedQuery: string) {
  const compact = value.replace(/\s+/gu, " ").trim();
  if (!compact) return null;
  const characters = Array.from(compact);
  const normalizedCharacters = Array.from(compact.toLocaleLowerCase("hy-AM"));
  const candidates = [normalizedQuery, ...normalizedQuery.split(" ").filter((term) => Array.from(term).length >= 2)]
    .filter(Boolean).sort((left, right) => right.length - left.length);
  let matchStart = -1;
  let matchLength = 0;
  for (const candidate of candidates) {
    const candidateCharacters = Array.from(candidate);
    const index = findSequence(normalizedCharacters, candidateCharacters);
    if (index >= 0) { matchStart = index; matchLength = candidateCharacters.length; break; }
  }
  if (matchStart < 0) return characters.length > 220 ? `${characters.slice(0, 217).join("")}…` : compact;
  let sentenceStart = matchStart;
  while (sentenceStart > 0 && !sentenceEndings.has(characters[sentenceStart - 1])) sentenceStart -= 1;
  let sentenceEnd = matchStart + matchLength;
  while (sentenceEnd < characters.length && !sentenceEndings.has(characters[sentenceEnd])) sentenceEnd += 1;
  if (sentenceEnd < characters.length) sentenceEnd += 1;
  const sentence = characters.slice(sentenceStart, sentenceEnd);
  if (sentence.length <= 280) return sentence.join("").trim();
  const windowStart = Math.max(sentenceStart, matchStart - 90);
  const windowEnd = Math.min(sentenceEnd, matchStart + matchLength + 150);
  return `${windowStart > sentenceStart ? "…" : ""}${characters.slice(windowStart, windowEnd).join("").trim()}${windowEnd < sentenceEnd ? "…" : ""}`;
}

function searchablePreview(post: BridgePost) {
  return [
    post.contentText, post.captionText, post.poll?.question.text,
    ...(post.poll?.options.map((option) => option.text.text) ?? []),
    post.location?.title, post.location?.address,
    ...post.media.flatMap((media) => [media.title, media.performer, media.fileName]),
  ].filter(Boolean).join(" ");
}

function matchesDate(post: BridgePost, filters: SearchFilters) {
  const date = post.dateValue || post.publishedAt?.slice(0, 10) || "";
  return (!filters.dateFrom || date >= filters.dateFrom) && (!filters.dateTo || date <= filters.dateTo);
}

// Topics whose oldest post is an introduction shown above their materials (category.tsx).
const INTRO_TOPICS = new Set(["category_psalms", "category_saints_lives", "category_prayers", "category_bible_questions"]);

/** Ids ("chat:message") of the topics' introduction posts, which search results leave out. */
async function topicIntroKeys(database: D1Database) {
  const { results } = await database.prepare(
    `SELECT chat_id, MIN(message_id) AS message_id FROM library_materials
     WHERE sync_state = 'ready' AND deleted_at IS NULL GROUP BY topic_key`,
  ).all<{ chat_id: string; message_id: number }>();
  return new Set(results.map((row) => `${row.chat_id}:${row.message_id}`));
}

function isTopicIntro(post: BridgePost, introKeys: Set<string>) {
  return introKeys.has(`${post.chatId}:${post.messageId}`) && post.contentType === "text" && post.media.length === 0 &&
    INTRO_TOPICS.has(resolveContentCategoryId(post.categoryId, post.categoryName) ?? "");
}

export async function searchMaterials(
  database: D1Database,
  filters: SearchFilters,
  cursor: string | null,
  _pageSize = 30,
  resolvedQuery?: ResolvedSearchQuery,
  _signal?: AbortSignal,
): Promise<SearchMaterialPage> {
  const resolved = resolvedQuery ?? await resolveSearchQuery(database, filters.query);
  const bridgeQuery = filters.query ? resolved.original : "";
  const page = await searchCloudLibraryPosts(
    database,
    bridgeQuery,
    filters.categoryId,
    cursor,
    20,
  );
  const introKeys = page.posts.length ? await topicIntroKeys(database) : new Set<string>();
  const posts = page.posts.filter((post) => matchesDate(post, filters) && !isTopicIntro(post, introKeys));
  return {
    materials: posts.map((post) => ({
      id: post.id,
      title: post.title,
      telegramUrl: post.telegramUrl,
      categoryName: post.categoryName ?? "",
      categorySlug: post.categorySlug ?? "",
      numberValue: post.numberValue,
      dateValue: post.dateValue,
      publishedAt: post.publishedAt,
      mediaTypes: [...new Set(post.media.map((asset) => asset.kind))],
      excerpt: post.searchMatch?.hit?.snippet ?? createSearchExcerpt(searchablePreview(post), resolved.highlightQuery),
      contentType: post.contentType,
      preview: bridgePostToCardPreview(post),
      matchReasons: ["telegram", ...(post.searchMatch?.reasons ?? [])],
      scoreCategory: post.searchMatch?.scoreCategory,
      matchedMessageId: post.searchMatch?.matchedMessageId,
      searchHit: post.searchMatch?.hit,
    })),
    total: page.total ?? posts.length + (page.nextCursor ? 1 : 0),
    highlightQuery: resolved.highlightQuery,
    nextCursor: page.nextCursor,
  };
}
