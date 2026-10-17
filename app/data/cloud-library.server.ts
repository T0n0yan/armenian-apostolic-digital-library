import {
  createSearchableTelegramDocument,
  matchSearchableTelegramDocument,
  messageIdSearchMatch,
  parseTelegramSearchQuery,
  searchScoreRank,
} from "../../shared/telegram-search";
import type {
  BridgeCategory,
  BridgeContentType,
  BridgeFormattedText,
  BridgeLocation,
  BridgeMedia,
  BridgePoll,
  BridgePost,
  BridgePostPage,
  BridgeRichContent,
} from "../../shared/telegram-bridge-contract";

type MaterialRow = {
  chat_id: string;
  message_id: number;
  material_id: string;
  topic_key: string;
  topic_id: number;
  media_group_id: string | null;
  constituent_message_ids_json: string;
  content_type: BridgeContentType;
  title: string;
  telegram_url: string;
  content_text: string;
  caption_text: string;
  formatted_text_json: string;
  formatted_caption_json: string;
  rich_content_json: string | null;
  poll_json: string | null;
  location_json: string | null;
  unsupported_type: string | null;
  tags_json: string;
  number_value: number | null;
  date_value: string | null;
  published_at: string | null;
  edited_at: string | null;
  topic_name: string;
  topic_slug: string;
};

type MediaRow = {
  chat_id: string;
  message_id: number;
  media_index: number;
  kind: BridgeMedia["kind"];
  mime_type: string | null;
  file_name: string | null;
  size_bytes: number | null;
  width: number | null;
  height: number | null;
  duration: number | null;
  title: string | null;
  performer: string | null;
  waveform: string | null;
  alt_text: string;
  thumbnail_r2_key: string | null;
};

type FeedCursor = { version: 1; scope: string; publishedAt: string; messageId: number };
type SearchCursor = { version: 1; scope: string; offset: number };

export class CloudLibraryCursorError extends Error {
  constructor() { super("Invalid library cursor."); this.name = "CloudLibraryCursorError"; }
}

function json<T>(value: string | null, fallback: T): T {
  if (value === null) return fallback;
  try { return JSON.parse(value) as T; } catch { return fallback; }
}

function encodeCursor(value: FeedCursor | SearchCursor) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/gu, "-").replace(/\//gu, "_").replace(/=+$/gu, "");
}

function decodeCursor<T extends FeedCursor | SearchCursor>(value: string | null, scope: string): T | null {
  if (!value) return null;
  if (value.length > 2_000) throw new CloudLibraryCursorError();
  try {
    const padded = value.replace(/-/gu, "+").replace(/_/gu, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    const parsed = JSON.parse(new TextDecoder().decode(bytes)) as Partial<T>;
    if (parsed.version !== 1 || parsed.scope !== scope) throw new CloudLibraryCursorError();
    return parsed as T;
  } catch (error) {
    if (error instanceof CloudLibraryCursorError) throw error;
    throw new CloudLibraryCursorError();
  }
}

function materialSelect() {
  return `SELECT materials.chat_id, materials.message_id, materials.material_id,
      materials.topic_key, materials.topic_id, materials.media_group_id,
      materials.constituent_message_ids_json, materials.content_type,
      materials.title, materials.telegram_url, materials.content_text,
      materials.caption_text, materials.formatted_text_json,
      materials.formatted_caption_json, materials.rich_content_json,
      materials.poll_json, materials.location_json, materials.unsupported_type,
      materials.tags_json, materials.number_value, materials.date_value,
      materials.published_at, materials.edited_at,
      topics.title AS topic_name, topics.slug AS topic_slug
    FROM library_materials AS materials
    INNER JOIN library_topics AS topics ON topics.id = materials.topic_key`;
}

async function hydrateRows(database: D1Database, rows: MaterialRow[]) {
  if (rows.length === 0) return [];
  const clauses = rows.map(() => "(chat_id = ? AND message_id = ?)").join(" OR ");
  const bindings = rows.flatMap((row) => [row.chat_id, row.message_id]);
  const media = await database.prepare(
    `SELECT chat_id, message_id, media_index, kind, mime_type, file_name,
       size_bytes, width, height, duration, title, performer, waveform,
       alt_text, thumbnail_r2_key
     FROM library_media WHERE status = 'ready' AND (${clauses})
     ORDER BY chat_id, message_id, media_index`,
  ).bind(...bindings).all<MediaRow>();
  const byMaterial = new Map<string, BridgeMedia[]>();
  for (const item of media.results) {
    const key = `${item.chat_id}:${item.message_id}`;
    const values = byMaterial.get(key) ?? [];
    values.push({
      index: item.media_index,
      kind: item.kind,
      mimeType: item.mime_type,
      fileName: item.file_name,
      sizeBytes: item.size_bytes,
      width: item.width,
      height: item.height,
      duration: item.duration,
      title: item.title,
      performer: item.performer,
      waveform: item.waveform,
      hasThumbnail: Boolean(item.thumbnail_r2_key),
      altText: item.alt_text,
    });
    byMaterial.set(key, values);
  }
  return rows.map((row): BridgePost => ({
    id: row.material_id,
    chatId: row.chat_id,
    messageId: row.message_id,
    constituentMessageIds: json<number[]>(row.constituent_message_ids_json, [row.message_id]),
    topicId: row.topic_id,
    forumTopicId: row.topic_id,
    mediaGroupId: row.media_group_id,
    title: row.title,
    telegramUrl: row.telegram_url,
    categoryId: row.topic_key,
    categoryName: row.topic_name,
    categorySlug: row.topic_slug,
    contentText: row.content_text,
    captionText: row.caption_text,
    formattedText: json<BridgeFormattedText>(row.formatted_text_json, { text: row.content_text, entities: [] }),
    formattedCaption: json<BridgeFormattedText>(row.formatted_caption_json, { text: row.caption_text, entities: [] }),
    richContent: json<BridgeRichContent | null>(row.rich_content_json, null),
    contentType: row.content_type,
    poll: json<BridgePoll | null>(row.poll_json, null),
    location: json<BridgeLocation | null>(row.location_json, null),
    unsupportedType: row.unsupported_type,
    tags: json<string[]>(row.tags_json, []),
    publishedAt: row.published_at,
    editedAt: row.edited_at,
    dateValue: row.date_value,
    numberValue: row.number_value,
    media: byMaterial.get(`${row.chat_id}:${row.message_id}`) ?? [],
    deleted: false,
  }));
}

export async function listCloudLibraryCategories(database: D1Database): Promise<BridgeCategory[]> {
  const rows = await database.prepare(
    `SELECT topics.id, topics.slug, topics.title, topics.default_sort,
       topics.chat_id, topics.topic_id, topics.status, topics.icon_color,
       topics.icon_emoji_id, topics.is_general, topics.telegram_message_count,
       COUNT(materials.message_id) AS material_count
     FROM library_topics AS topics
     LEFT JOIN library_materials AS materials
       ON materials.topic_key = topics.id AND materials.sync_state = 'ready' AND materials.deleted_at IS NULL
     GROUP BY topics.id
     ORDER BY topics.display_order, topics.topic_id`,
  ).all<{
    id: string; slug: string; title: string; default_sort: BridgeCategory["defaultSort"];
    chat_id: string; topic_id: number; status: BridgeCategory["status"];
    icon_color: number | null; icon_emoji_id: string | null; is_general: number;
    telegram_message_count: number | null; material_count: number;
  }>();
  return rows.results.map((row) => ({
    id: row.id,
    slug: row.slug,
    name: row.title,
    defaultSort: row.default_sort,
    materialCount: row.material_count,
    messageCount: row.telegram_message_count,
    chatId: row.chat_id,
    topicId: row.topic_id,
    status: row.status,
    iconColor: row.icon_color,
    iconEmojiId: row.icon_emoji_id,
    isGeneral: Boolean(row.is_general),
  }));
}

export async function listCloudLibraryCategoryPosts(
  database: D1Database,
  slug: string,
  cursor: string | null,
  limit = 12,
): Promise<BridgePostPage> {
  const safeLimit = Math.min(20, Math.max(1, limit));
  const topic = await database.prepare("SELECT id FROM library_topics WHERE slug = ? AND is_general = 0 AND status != 'hidden'")
    .bind(slug).first<{ id: string }>();
  if (!topic) return { posts: [], nextCursor: null, total: 0 };
  const scope = `feed:${topic.id}`;
  const position = decodeCursor<FeedCursor>(cursor, scope);
  const cursorClause = position
    ? "AND (COALESCE(materials.published_at, '') < ? OR (COALESCE(materials.published_at, '') = ? AND materials.message_id < ?))"
    : "";
  const bindings: unknown[] = [topic.id];
  if (position) bindings.push(position.publishedAt, position.publishedAt, position.messageId);
  bindings.push(safeLimit + 1);
  const result = await database.prepare(
    `${materialSelect()}
     WHERE materials.topic_key = ? AND materials.sync_state = 'ready' AND materials.deleted_at IS NULL
     ${cursorClause}
     ORDER BY COALESCE(materials.published_at, '') DESC, materials.message_id DESC
     LIMIT ?`,
  ).bind(...bindings).all<MaterialRow>();
  const hasMore = result.results.length > safeLimit;
  const rows = result.results.slice(0, safeLimit);
  const posts = await hydrateRows(database, rows);
  const last = rows.at(-1);
  const total = await database.prepare(
    "SELECT COUNT(*) AS count FROM library_materials WHERE topic_key = ? AND sync_state = 'ready' AND deleted_at IS NULL",
  ).bind(topic.id).first<{ count: number }>();
  return {
    posts,
    total: total?.count ?? posts.length,
    nextCursor: hasMore && last ? encodeCursor({
      version: 1, scope, publishedAt: last.published_at ?? "", messageId: last.message_id,
    }) : null,
  };
}

export async function getCloudLibraryPost(database: D1Database, chatId: string, messageId: number) {
  const row = await database.prepare(
    `${materialSelect()}
     WHERE materials.chat_id = ? AND materials.message_id = ?
       AND materials.sync_state = 'ready' AND materials.deleted_at IS NULL
       AND topics.is_general = 0 AND topics.status != 'hidden'`,
  ).bind(chatId, messageId).first<MaterialRow>();
  return row ? (await hydrateRows(database, [row]))[0] ?? null : null;
}

export async function searchCloudLibraryPosts(
  database: D1Database,
  query: string,
  categoryId: string,
  cursor: string | null,
  limit = 20,
): Promise<BridgePostPage> {
  const parsed = parseTelegramSearchQuery(query);
  if (!parsed.normalized && !parsed.messageIdIntent) {
    if (!categoryId) return { posts: [], nextCursor: null, total: 0 };
    const topic = await database.prepare("SELECT slug FROM library_topics WHERE id = ? AND is_general = 0 AND status != 'hidden'")
      .bind(categoryId).first<{ slug: string }>();
    return topic ? listCloudLibraryCategoryPosts(database, topic.slug, cursor, 12) : { posts: [], nextCursor: null, total: 0 };
  }
  const safeLimit = Math.min(20, Math.max(1, limit));
  const scope = `search:${parsed.normalized}:${parsed.messageIdIntent ?? ""}:${categoryId}`;
  const position = decodeCursor<SearchCursor>(cursor, scope);
  if (position && (!Number.isSafeInteger(position.offset) || position.offset < 0 || position.offset > 50_000)) {
    throw new CloudLibraryCursorError();
  }
  const bindings: unknown[] = [];
  const categoryClause = categoryId ? "AND materials.topic_key = ?" : "";
  if (categoryId) bindings.push(categoryId);
  const result = await database.prepare(
    `${materialSelect()}
     WHERE materials.sync_state = 'ready' AND materials.deleted_at IS NULL
       AND topics.is_general = 0 AND topics.status != 'hidden' ${categoryClause}
     ORDER BY COALESCE(materials.published_at, '') DESC, materials.message_id DESC
     LIMIT 10000`,
  ).bind(...bindings).all<MaterialRow>();
  const posts = await hydrateRows(database, result.results);
  const matches = posts.flatMap((post) => {
    const intendedMessageId = parsed.messageIdIntent?.messageId;
    const match = intendedMessageId && (
      post.messageId === intendedMessageId || post.constituentMessageIds.includes(intendedMessageId)
    ) ? messageIdSearchMatch(intendedMessageId) : matchSearchableTelegramDocument(
      createSearchableTelegramDocument(post, post.categoryName ?? ""), parsed,
    );
    return match ? [{ post: { ...post, searchMatch: match }, rank: match.rank }] : [];
  }).sort((left, right) =>
    right.rank - left.rank ||
    (right.post.publishedAt ?? "").localeCompare(left.post.publishedAt ?? "") ||
    right.post.messageId - left.post.messageId,
  );
  const offset = position?.offset ?? 0;
  const page = matches.slice(offset, offset + safeLimit).map(({ post }) => post);
  const nextOffset = offset + page.length;
  return {
    posts: page,
    total: matches.length,
    nextCursor: nextOffset < matches.length ? encodeCursor({ version: 1, scope, offset: nextOffset }) : null,
  };
}

export function cloudSearchScoreRank(value: Parameters<typeof searchScoreRank>[0]) {
  return searchScoreRank(value);
}
