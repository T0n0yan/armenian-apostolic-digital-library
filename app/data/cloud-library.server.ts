import {
  createSearchableTelegramDocument,
  matchSearchableTelegramDocument,
  messageIdSearchMatch,
  parseTelegramSearchQuery,
  searchScoreRank,
  type SearchableTelegramDocument,
  type SearchableTelegramFieldKind,
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

type SearchFieldRow = {
  chat_id: string;
  message_id: number;
  topic_id: number;
  media_group_id: string | null;
  constituent_message_ids_json: string;
  published_at: string | null;
  field_kind: SearchableTelegramFieldKind;
  block_id: string | null;
  original_text: string;
  is_primary: number;
};

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

function searchMaterialSelect() {
  return `SELECT materials.chat_id, materials.message_id, materials.material_id,
      materials.topic_key, materials.topic_id, materials.media_group_id,
      materials.constituent_message_ids_json, materials.content_type,
      materials.title, materials.telegram_url, '' AS content_text,
      '' AS caption_text, '{"text":"","entities":[]}' AS formatted_text_json,
      '{"text":"","entities":[]}' AS formatted_caption_json,
      NULL AS rich_content_json, materials.poll_json, materials.location_json,
      materials.unsupported_type, materials.tags_json, materials.number_value,
      materials.date_value, materials.published_at, materials.edited_at,
      topics.title AS topic_name, topics.slug AS topic_slug
    FROM library_materials AS materials
    INNER JOIN library_topics AS topics ON topics.id = materials.topic_key`;
}

async function hydrateRows(database: D1Database, rows: MaterialRow[]) {
  if (rows.length === 0) return [];
  const mediaRows: MediaRow[] = [];
  const batchSize = 40;
  for (let offset = 0; offset < rows.length; offset += batchSize) {
    const batch = rows.slice(offset, offset + batchSize);
    const clauses = batch.map(() => "(chat_id = ? AND message_id = ?)").join(" OR ");
    const bindings = batch.flatMap((row) => [row.chat_id, row.message_id]);
    const media = await database.prepare(
      `SELECT chat_id, message_id, media_index, kind, mime_type, file_name,
         size_bytes, width, height, duration, title, performer, waveform,
         alt_text, thumbnail_r2_key
       FROM library_media WHERE status = 'ready' AND (${clauses})
       ORDER BY chat_id, message_id, media_index`,
    ).bind(...bindings).all<MediaRow>();
    mediaRows.push(...media.results);
  }
  const byMaterial = new Map<string, BridgeMedia[]>();
  for (const item of mediaRows) {
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

async function materialRowsByIdentity(database: D1Database, identities: Array<{ chatId: string; messageId: number }>) {
  const rows: MaterialRow[] = [];
  const batchSize = 40;
  for (let offset = 0; offset < identities.length; offset += batchSize) {
    const batch = identities.slice(offset, offset + batchSize);
    const clauses = batch.map(() => "(materials.chat_id = ? AND materials.message_id = ?)").join(" OR ");
    const bindings = batch.flatMap((identity) => [identity.chatId, identity.messageId]);
    const result = await database.prepare(
      `${searchMaterialSelect()} WHERE materials.sync_state = 'ready' AND materials.deleted_at IS NULL AND (${clauses})`,
    ).bind(...bindings).all<MaterialRow>();
    rows.push(...result.results);
  }
  return rows;
}

function candidateFragments(values: string[]) {
  const fragments = new Set<string>();
  for (const value of values) {
    const characters = Array.from(value.replaceAll("%", "").replaceAll("_", "")).filter((character) => !/\s/u.test(character));
    if (characters.length < 2) continue;
    fragments.add(characters.slice(0, 2).join(""));
    if (characters.length >= 3) fragments.add(characters.slice(0, 3).join(""));
    if (fragments.size >= 24) break;
  }
  return [...fragments];
}

function ftsCandidateExpression(values: string[]) {
  const terms = new Set<string>();
  for (const value of values) {
    for (const token of value.split(/\s+/u).filter(Boolean)) {
      const characters = Array.from(token);
      if (characters.length < 2 || !/^[\p{L}\p{N}]+$/u.test(token)) continue;
      terms.add(`${token}*`);
      if (characters.length >= 4) terms.add(`${characters.slice(0, -1).join("")}*`);
      if (terms.size >= 24) break;
    }
    if (terms.size >= 24) break;
  }
  return [...terms].join(" OR ");
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
  const scope = `search:${parsed.normalized}:${parsed.messageIdIntent?.messageId ?? ""}:${categoryId}`;
  const position = decodeCursor<SearchCursor>(cursor, scope);
  if (position && (!Number.isSafeInteger(position.offset) || position.offset < 0 || position.offset > 50_000)) {
    throw new CloudLibraryCursorError();
  }
  const categoryClause = categoryId ? "AND materials.topic_key = ?" : "";
  const intendedMessageId = parsed.messageIdIntent?.messageId;
  if (intendedMessageId) {
    const bindings: unknown[] = [intendedMessageId, intendedMessageId];
    if (categoryId) bindings.push(categoryId);
    const result = await database.prepare(
      `${materialSelect()}
       WHERE materials.sync_state = 'ready' AND materials.deleted_at IS NULL
         AND topics.is_general = 0 AND topics.status != 'hidden'
         AND (materials.message_id = ? OR EXISTS (
           SELECT 1 FROM json_each(materials.constituent_message_ids_json) WHERE CAST(value AS INTEGER) = ?
         )) ${categoryClause}
       ORDER BY COALESCE(materials.published_at, '') DESC, materials.message_id DESC LIMIT 2`,
    ).bind(...bindings).all<MaterialRow>();
    const posts = await hydrateRows(database, result.results);
    const page = posts.map((post) => ({ ...post, searchMatch: messageIdSearchMatch(intendedMessageId) }));
    return { posts: page, total: page.length, nextCursor: null };
  }

  const candidateValues = [parsed.normalized, ...parsed.tokens, ...parsed.aliases];
  const ftsExpression = ftsCandidateExpression(candidateValues);
  if (!ftsExpression) return { posts: [], total: 0, nextCursor: null };
  const ftsBindings: unknown[] = [ftsExpression];
  if (categoryId) ftsBindings.push(categoryId);
  const ftsFields = await database.prepare(
    `WITH ranked_candidates AS (
       SELECT documents.chat_id,documents.message_id,materials.topic_id,materials.media_group_id,
         materials.constituent_message_ids_json,materials.published_at,documents.field_kind,
         documents.block_id,documents.original_text,documents.is_primary,documents.ordinal,
         ROW_NUMBER() OVER (
           PARTITION BY documents.chat_id,documents.message_id
           ORDER BY documents.is_primary DESC,documents.ordinal
         ) AS candidate_rank
       FROM library_search_fts
       INNER JOIN library_search_documents AS documents
         ON documents.chat_id=library_search_fts.chat_id
         AND documents.message_id=CAST(library_search_fts.message_id AS INTEGER)
         AND documents.field_id=library_search_fts.field_id
       INNER JOIN library_materials AS materials
         ON materials.chat_id=documents.chat_id AND materials.message_id=documents.message_id
       INNER JOIN library_topics AS topics ON topics.id=materials.topic_key
       WHERE materials.sync_state='ready' AND materials.deleted_at IS NULL
         AND topics.is_general=0 AND topics.status!='hidden'
         AND library_search_fts MATCH ? ${categoryClause}
     )
     SELECT chat_id,message_id,topic_id,media_group_id,constituent_message_ids_json,
       published_at,field_kind,block_id,original_text,is_primary
     FROM ranked_candidates WHERE candidate_rank <= 2
     ORDER BY message_id DESC,ordinal
     LIMIT 300`,
  ).bind(...ftsBindings).all<SearchFieldRow>();
  const fragments = candidateFragments(candidateValues);
  let fieldRows = ftsFields.results;
  // FTS already indexes normalized values, transliteration aliases, and bounded
  // prefix terms. The shorter-prefix FTS pass is reserved for sparse candidate
  // sets that still need typo expansion; running both paths for broad terms
  // needlessly spends Worker CPU and can exhaust the request budget under
  // concurrent search. The bounded threshold keeps fuzzy recall for small
  // result sets without scanning again once FTS already found a broad set.
  const armenianFallbackFragments = fragments.filter((fragment) => /\p{Script=Armenian}/u.test(fragment));
  if (armenianFallbackFragments.length > 0 && /\p{Script=Armenian}/u.test(parsed.normalized) && ftsFields.results.length < 10) {
    const fallbackExpression = armenianFallbackFragments
      .filter((fragment) => /^[\p{L}\p{N}]+$/u.test(fragment))
      .map((fragment) => `${fragment}*`)
      .join(" OR ");
    const fallbackBindings: unknown[] = [fallbackExpression];
    if (categoryId) fallbackBindings.push(categoryId);
    const fallback = await database.prepare(
      `WITH ranked_candidates AS (
         SELECT documents.chat_id,documents.message_id,materials.topic_id,materials.media_group_id,
           materials.constituent_message_ids_json,materials.published_at,documents.field_kind,
           documents.block_id,documents.original_text,documents.is_primary,documents.ordinal,
           ROW_NUMBER() OVER (
             PARTITION BY documents.chat_id,documents.message_id
             ORDER BY documents.is_primary DESC,documents.ordinal
           ) AS candidate_rank
         FROM library_search_fts
         INNER JOIN library_search_documents AS documents
           ON documents.chat_id=library_search_fts.chat_id
           AND documents.message_id=CAST(library_search_fts.message_id AS INTEGER)
           AND documents.field_id=library_search_fts.field_id
         INNER JOIN library_materials AS materials
           ON materials.chat_id=documents.chat_id AND materials.message_id=documents.message_id
         INNER JOIN library_topics AS topics ON topics.id=materials.topic_key
         WHERE materials.sync_state='ready' AND materials.deleted_at IS NULL
           AND topics.is_general=0 AND topics.status!='hidden'
           AND library_search_fts MATCH ? ${categoryClause}
       )
       SELECT chat_id,message_id,topic_id,media_group_id,constituent_message_ids_json,
         published_at,field_kind,block_id,original_text,is_primary
       FROM ranked_candidates WHERE candidate_rank <= 2
       ORDER BY message_id DESC,ordinal
       LIMIT 500`,
    ).bind(...fallbackBindings).all<SearchFieldRow>();
    const unique = new Map<string, SearchFieldRow>();
    for (const field of [...fieldRows, ...fallback.results]) {
      unique.set(`${field.chat_id}:${field.message_id}:${field.field_kind}:${field.block_id ?? ""}:${field.original_text}`, field);
    }
    fieldRows = [...unique.values()];
  }
  const documents = new Map<string, SearchableTelegramDocument & { publishedAt: string | null }>();
  for (const field of fieldRows) {
    const key = `${field.chat_id}:${field.message_id}`;
    const document = documents.get(key) ?? {
      chatId: field.chat_id,
      messageId: field.message_id,
      topicId: field.topic_id,
      mediaGroupId: field.media_group_id,
      constituentMessageIds: json<number[]>(field.constituent_message_ids_json, [field.message_id]),
      fields: [],
      publishedAt: field.published_at,
    };
    document.fields.push({
      kind: field.field_kind,
      value: field.original_text,
      primary: Boolean(field.is_primary),
      blockId: field.block_id,
    });
    documents.set(key, document);
  }
  const matches = [...documents.values()].flatMap((document) => {
    const match = matchSearchableTelegramDocument(document, parsed);
    return match ? [{ document, match, rank: match.rank }] : [];
  }).sort((left, right) =>
    right.rank - left.rank ||
    (right.match.strength ?? 0) - (left.match.strength ?? 0) ||
    (right.document.publishedAt ?? "").localeCompare(left.document.publishedAt ?? "") ||
    right.document.messageId - left.document.messageId,
  );
  const offset = position?.offset ?? 0;
  const selected = matches.slice(offset, offset + safeLimit);
  const selectedRows = await materialRowsByIdentity(database, selected.map(({ document }) => ({
    chatId: document.chatId, messageId: document.messageId,
  })));
  const postByIdentity = new Map((await hydrateRows(database, selectedRows)).map((post) => [`${post.chatId}:${post.messageId}`, post]));
  const page = selected.flatMap(({ document, match }) => {
    const post = postByIdentity.get(`${document.chatId}:${document.messageId}`);
    return post ? [{ ...post, searchMatch: match }] : [];
  });
  const nextOffset = offset + selected.length;
  return {
    posts: page,
    total: matches.length,
    nextCursor: nextOffset < matches.length ? encodeCursor({ version: 1, scope, offset: nextOffset }) : null,
  };
}

export function cloudSearchScoreRank(value: Parameters<typeof searchScoreRank>[0]) {
  return searchScoreRank(value);
}
