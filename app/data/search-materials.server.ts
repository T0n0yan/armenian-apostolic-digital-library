import type { BridgePost } from "../../shared/telegram-bridge-contract";
import { bridgePostToCardPreview } from "./materials.server";
import { searchBridgePosts } from "./telegram-bridge.server";
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

function matchesDate(post: BridgePost, filters: SearchFilters) {
  const date = post.dateValue || post.publishedAt?.slice(0, 10) || "";
  return (!filters.dateFrom || date >= filters.dateFrom) && (!filters.dateTo || date <= filters.dateTo);
}

export async function searchMaterials(
  database: D1Database,
  filters: SearchFilters,
  cursor: string | null,
  _pageSize = 30,
  resolvedQuery?: ResolvedSearchQuery,
  signal?: AbortSignal,
): Promise<SearchMaterialPage> {
  const resolved = resolvedQuery ?? await resolveSearchQuery(database, filters.query);
  const page = await searchBridgePosts(
    database,
    resolved.correctedQuery || resolved.original,
    filters.categoryId,
    cursor,
    signal,
  );
  const posts = page.posts.filter((post) => matchesDate(post, filters));
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
      excerpt: createSearchExcerpt(post.contentText || post.captionText, resolved.highlightQuery),
      contentType: post.contentType,
      preview: bridgePostToCardPreview(post),
    })),
    total: page.total ?? posts.length + (page.nextCursor ? 1 : 0),
    highlightQuery: resolved.highlightQuery,
    nextCursor: page.nextCursor,
  };
}
